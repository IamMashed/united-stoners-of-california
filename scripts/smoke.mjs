// End-to-end smoke test of SupabaseApiClient against the dev Supabase project.
// Requires seed data (`npm run db:seed`). Run: npm run test:smoke
// Signup is not exercised here: on hosted Supabase it sends real emails.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import SupabaseApiClient from '../src/api/SupabaseApiClient.js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.development', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => l.split(/=(.*)/s).slice(0, 2))
);
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
// Node's built-in fetch ignores HTTP(S)_PROXY / NO_PROXY; this agent honours them.
const dispatcher = new EnvHttpProxyAgent();
const proxiedFetch = (input, init) => undiciFetch(input, { ...init, dispatcher });
const makeClient = () => createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: proxiedFetch },
});

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${message}`);
  if (!condition) failures++;
}

const anon = new SupabaseApiClient(makeClient());
const anonPosts = await anon.listPosts({ kind: 'explore' });
check(anonPosts.error, `anonymous visitors cannot read posts (${anonPosts.error?.code})`);
check((await anon.usernameAvailable('kushking')).data === false, 'username_available is false for a taken name');

const sb = makeClient();
const api = new SupabaseApiClient(sb);
const { data: login, error: loginError } = await sb.auth.signInWithPassword({
  email: 'kushking@example.com', password: 'password123',
});
check(!loginError, `seed user can log in ${loginError?.message ?? ''}`);
const me = login.user.id;

const created = await api.createPost('  smoke test post  ');
check(!created.error && created.data.body === 'smoke test post'
  && created.data.author.username === 'kushking', `create post ${created.error?.message ?? ''}`);

const feed = await api.listPosts({ kind: 'feed' });
check(!feed.error && feed.data.posts[0].id === created.data.id, 'feed shows newest own post first');
const psa = feed.data?.posts.find((p) => p.body.startsWith('PSA'));
check(psa?.comment_count === 2 && psa.author.username === 'hashqueen',
  'feed includes followed user posts with author + comment count');

const comment = await api.createComment(created.data.id, 'smoke comment');
check(!comment.error && comment.data.author.username === 'kushking', `create comment ${comment.error?.message ?? ''}`);
check((await api.getPost(created.data.id)).data?.comment_count === 1, 'post comment_count updates');

const queen = await api.getProfileByUsername('HASHQUEEN');
check(queen.data?.username === 'hashqueen', 'profile lookup is case-insensitive');
check((await api.isFollowing(me, queen.data.id)).data === true, 'isFollowing reflects seed follow');

const dupe = await api.updateProfile(me, { username: 'HashQueen', about_me: '' });
check(dupe.error?.message?.includes('profiles_username_lower_key'), 'duplicate username is rejected');

check(!(await api.deletePost(created.data.id)).error, 'author can delete own post');
check((await api.getPost(created.data.id)).data === null, 'deleted post is gone');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
