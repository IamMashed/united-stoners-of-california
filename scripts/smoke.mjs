// End-to-end smoke test of SupabaseApiClient against the dev Supabase project.
// Requires seed data (`npm run db:seed`, kushking = superuser). Run: npm run test:smoke
// Signup is not exercised here: on hosted Supabase it sends real emails.
// Everything the test creates (posts, comments, images) is deleted again.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import SupabaseApiClient from '../src/api/SupabaseApiClient.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.development', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2))
);
// Node's built-in fetch ignores HTTP(S)_PROXY / NO_PROXY; this agent honours them.
const dispatcher = new EnvHttpProxyAgent();
const proxiedFetch = (input, init) => undiciFetch(input, { ...init, dispatcher });
const makeClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { fetch: proxiedFetch },
});

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
}

async function loginAs(email) {
  const client = makeClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { api: new SupabaseApiClient(client), id: data.user.id };
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
// Raw bytes + type instead of a File: storage-js wraps File/Blob bodies in Node's
// global FormData, which the proxy-aware undici fetch cannot serialize. Browsers
// send real File objects and are unaffected.
const pngFile = (name) => Object.assign(new Uint8Array(PNG), { name, type: 'image/png' });

// ---- visitors ----------------------------------------------------------------
const anon = new SupabaseApiClient(makeClient());
const publicPosts = await anon.listPosts();
check(!publicPosts.error && publicPosts.data.posts.length > 0, 'visitors can read posts');
const firstPost = publicPosts.data.posts[0];
check(firstPost.author.is_admin === true, 'posts are written by the superuser');
const publicComments = await anon.listComments(firstPost.id);
check(!publicComments.error, 'visitors can read comments');
const anonComment = await anon.createComment(firstPost.id, { body: 'drive-by', files: [] });
check(anonComment.error, `visitors cannot comment (${anonComment.error?.code})`);

// ---- regular member -------------------------------------------------------------
const member = await loginAs('hashqueen@example.com');
const memberPost = await member.api.createPost({ body: 'sneaky post', files: [] });
check(memberPost.error?.code === '42501', `members cannot create posts (${memberPost.error?.code})`);

const comment = await member.api.createComment(firstPost.id, {
  body: 'Bud shot + video https://youtu.be/dQw4w9WgXcQ', files: [pngFile('bud.png')],
});
check(!comment.error && comment.data.image_paths.length === 1
  && comment.data.image_paths[0].startsWith(`${member.id}/`), `members can comment with a photo ${comment.error?.message ?? ''}`);
const imageUrl = member.api.mediaUrl(comment.data.image_paths[0]);
const imageResponse = await proxiedFetch(imageUrl);
check(imageResponse.status === 200 && imageResponse.headers.get('content-type') === 'image/png',
  `uploaded photo is publicly viewable (${imageResponse.status})`);

const bucket = member.api.supabase.storage.from('media');
const foreignUpload = await bucket.upload(`11111111-1111-1111-1111-111111111111/hack.png`, PNG, { contentType: 'image/png' });
check(foreignUpload.error, 'members cannot upload into someone else\'s folder');
const badType = await bucket.upload(`${member.id}/notes.txt`, Buffer.from('hi'), { contentType: 'text/plain' });
check(badType.error, 'the bucket rejects non-image files');

// ---- superuser ------------------------------------------------------------------
const admin = await loginAs('kushking@example.com');
const post = await admin.api.createPost({ body: 'smoke test post', files: [pngFile('cover.png')] });
check(!post.error && post.data.image_paths.length === 1, `the superuser can post with a photo ${post.error?.message ?? ''}`);

const adminDelete = await admin.api.deleteComment(comment.data);
check(!adminDelete.error, 'the superuser can delete a member\'s comment');
const afterDelete = await anon.listComments(firstPost.id);
check(!afterDelete.data.some((c) => c.id === comment.data.id), 'deleted comment is gone');
// Checked in storage itself: the public URL may stay CDN-cached for up to an hour.
const stillStored = await admin.api.supabase.storage.from('media').exists(comment.data.image_paths[0]);
check(stillStored.data === false, 'deleted comment\'s photo is removed from storage');

const edited = await admin.api.updatePost(post.data, { body: 'smoke test post (edited)', keepPaths: [], files: [] });
check(!edited.error && edited.data.body === 'smoke test post (edited)' && edited.data.updated_at
  && edited.data.image_paths.length === 0, `the superuser can edit a post ${edited.error?.message ?? ''}`);
const droppedCover = await admin.api.supabase.storage.from('media').exists(post.data.image_paths[0]);
check(droppedCover.data === false, 'a photo removed while editing is deleted from storage');
const memberEdit = await member.api.updatePost(edited.data, { body: 'hacked', keepPaths: [], files: [] });
check(memberEdit.error, 'members cannot edit posts');

// ---- banning --------------------------------------------------------------------
const memberBan = await member.api.setBanned(admin.id, true);
check(memberBan.error?.code === '42501', `members cannot ban anyone (${memberBan.error?.code})`);
try {
  const ban = await admin.api.setBanned(member.id, true);
  check(!ban.error && ban.data, `the superuser can ban a member ${ban.error?.message ?? ''}`);
  const bannedComment = await member.api.createComment(firstPost.id, { body: 'still here?', files: [] });
  check(bannedComment.error?.code === '42501', `banned members cannot comment (${bannedComment.error?.code})`);
}
finally {
  const unban = await admin.api.setBanned(member.id, false);
  check(!unban.error && unban.data === null, `the superuser can unban a member ${unban.error?.message ?? ''}`);
}
const backAgain = await member.api.createComment(firstPost.id, { body: 'back again', files: [] });
check(!backAgain.error, 'unbanned members can comment again');
if (!backAgain.error) {
  check(!(await member.api.deleteComment(backAgain.data)).error, 'members can delete their own comments');
}

check(!(await admin.api.deletePost(post.data)).error, 'the superuser can delete posts');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
