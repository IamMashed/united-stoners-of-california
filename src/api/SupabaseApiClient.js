// Thin data-access layer over supabase-js (PostgREST + Auth + Storage). Replaces
// the MicroblogApiClient from react-microblog. Every method returns `{ data, error }`;
// unexpected failures (network down, 5xx) are also reported through `onError`.

import { imageExtension } from '../lib/media.js';
import { videoExtension } from '../lib/video.js';

export const PAGE_SIZE = 25;
export const MEDIA_BUCKET = 'media';
export const VIDEO_BUCKET = 'videos';

const AUTHOR = 'author:profiles(id, username, avatar_url, is_admin)';
const POST_SELECT = `id, body, image_paths, video_path, pinned_at, created_at, updated_at, ${AUTHOR}, comments(count)`;
const COMMENT_SELECT = `id, post_id, body, image_paths, video_path, created_at, updated_at, ${AUTHOR}`;
const PROFILE_SELECT = 'id, username, about_me, avatar_url, is_admin, banned_at, created_at, last_seen';

// Browsers report dropped connections with unhelpful messages ("Load failed" in Safari,
// "Failed to fetch" in Chrome); turn them into something a member can act on.
export function uploadErrorMessage(err) {
  const text = String(err?.message || err || '');
  if (/load failed|failed to fetch|networkerror|network error|tus: failed|xhr/i.test(text)) {
    return 'The upload was interrupted (weak connection?). Please try again, ideally on Wi-Fi.';
  }
  if (/payload too large|413|exceeded the maximum/i.test(text)) {
    return 'That video is too large to upload. Try a shorter clip.';
  }
  // Storage policies refuse uploads past the per-member limits (see the rate limits migration).
  if (/row-level security/i.test(text)) {
    return 'Upload limit reached (30 files an hour, 300 MB in total). Please try again later or delete old uploads.';
  }
  return text || 'The upload failed. Please try again.';
}

function normalizePost(row) {
  const { comments, ...post } = row;
  return { ...post, comment_count: comments?.[0]?.count ?? 0 };
}

// Escapes LIKE wildcards so `ilike` behaves as a case-insensitive equality check.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => '\\' + c);
}

export default class SupabaseApiClient {
  constructor(supabase, onError) {
    this.supabase = supabase;
    this.onError = onError;
  }

  get auth() {
    return this.supabase.auth;
  }

  async run(query) {
    let result;
    try {
      result = await query;
    }
    catch (err) {
      result = { data: null, error: { message: String(err) }, status: 0 };
    }
    if (result.error && (!result.status || result.status >= 500) && this.onError) {
      this.onError(result.error);
    }
    return { data: result.data ?? null, error: result.error ?? null };
  }

  // ---- media ---------------------------------------------------------------

  mediaUrl(path) {
    return this.supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Uploads into `<user id>/<uuid>.<ext>` (the only folder RLS lets the user write).
  async uploadImages(files) {
    if (!files?.length) {
      return { data: [], error: null };
    }
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'You need to be logged in to upload images.' } };
    }
    const bucket = this.supabase.storage.from(MEDIA_BUCKET);
    const paths = [];
    for (const file of files) {
      const path = `${session.user.id}/${crypto.randomUUID()}.${imageExtension(file.type)}`;
      const { error } = await bucket.upload(path, file, {
        contentType: file.type, cacheControl: '3600', upsert: false,
      });
      if (error) {
        await this.removeImages(paths);
        return { data: null, error: { ...error, message: uploadErrorMessage(error) } };
      }
      paths.push(path);
    }
    return { data: paths, error: null };
  }

  async removeImages(paths) {
    if (paths.length) {
      await this.supabase.storage.from(MEDIA_BUCKET).remove(paths);
    }
  }

  videoUrl(path) {
    return this.supabase.storage.from(VIDEO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // Uploads one (already prepared, see lib/video.js) video into `<user id>/<uuid>.<ext>`.
  // Resolves to the storage path, or null when there is no file. In the browser this
  // uses Supabase's resumable (TUS) endpoint: 6 MB chunks that are retried on their own,
  // so a flaky phone connection doesn't kill a 30 MB upload. `onProgress(0..1)`.
  async uploadVideo(file, onProgress = () => {}) {
    if (!file) {
      return { data: null, error: null };
    }
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) {
      return { data: null, error: { message: 'You need to be logged in to upload videos.' } };
    }
    const path = `${session.user.id}/${crypto.randomUUID()}.${videoExtension(file.type)}`;
    if (typeof window === 'undefined') {
      // Node scripts (smoke tests): a plain upload is fine.
      const { error } = await this.supabase.storage.from(VIDEO_BUCKET).upload(path, file, {
        contentType: file.type, cacheControl: '3600', upsert: false,
      });
      return error ? { data: null, error } : { data: path, error: null };
    }
    try {
      await this.resumableUpload(file, path, session.access_token, onProgress);
      return { data: path, error: null };
    }
    catch (err) {
      return { data: null, error: { message: uploadErrorMessage(err) } };
    }
  }

  async resumableUpload(file, path, accessToken, onProgress) {
    const { Upload } = await import('tus-js-client');
    return new Promise((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: new URL('upload/resumable', this.supabase.storageUrl.href.replace(/\/?$/, '/')).href,
        retryDelays: [0, 2000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${accessToken}`, apikey: this.supabase.supabaseKey, 'x-upsert': 'false' },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: VIDEO_BUCKET, objectName: path, contentType: file.type, cacheControl: '3600' },
        chunkSize: 6 * 1024 * 1024,   // required by Supabase
        onProgress: (sent, total) => onProgress(total ? sent / total : 0),
        onError: reject,
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  }

  async removeVideo(path) {
    if (path) {
      await this.supabase.storage.from(VIDEO_BUCKET).remove([path]);
    }
  }

  // Uploads the photos and video, then inserts the row; removes the uploads if
  // anything fails.
  async insertWithMedia(table, values, files, video, select, onVideoProgress) {
    const { data: videoPath, error: videoError } = await this.uploadVideo(video, onVideoProgress);
    if (videoError) {
      return { data: null, error: videoError };
    }
    const { data: paths, error: uploadError } = await this.uploadImages(files);
    if (uploadError) {
      await this.removeVideo(videoPath);
      return { data: null, error: uploadError };
    }
    const result = await this.run(
      this.supabase.from(table).insert({ ...values, image_paths: paths, video_path: videoPath })
        .select(select).single()
    );
    if (result.error) {
      await this.removeImages(paths);
      await this.removeVideo(videoPath);
    }
    return result;
  }

  // ---- posts ---------------------------------------------------------------

  // Newest first, keyset pagination on id. `authorId` limits to one author.
  // Pinned posts (newest pin first) come before everything else on the first page of the
  // main list. They are not repeated on later pages, which page through unpinned posts by id.
  async listPosts({ authorId, beforeId } = {}) {
    const base = () => {
      let query = this.supabase.from('posts').select(POST_SELECT);
      if (authorId) {
        query = query.eq('author_id', authorId);
      }
      return query;
    };
    const showPinned = !authorId && !beforeId;
    let unpinned = base().order('id', { ascending: false }).limit(PAGE_SIZE + 1);
    if (!authorId) {
      unpinned = unpinned.is('pinned_at', null);
    }
    if (beforeId) {
      unpinned = unpinned.lt('id', beforeId);
    }
    const [pinned, rest] = await Promise.all([
      showPinned ? this.run(base().not('pinned_at', 'is', null).order('pinned_at', { ascending: false }))
        : { data: [], error: null },
      this.run(unpinned),
    ]);
    const error = pinned.error || rest.error;
    if (error) {
      return { data: null, error };
    }
    return {
      data: {
        posts: [...pinned.data, ...rest.data.slice(0, PAGE_SIZE)].map(normalizePost),
        more: rest.data.length > PAGE_SIZE,
      },
      error: null,
    };
  }

  async getPost(id) {
    const { data, error } = await this.run(
      this.supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle()
    );
    return { data: data && normalizePost(data), error };
  }

  async createPost({ body, files, video = null, onVideoProgress }) {
    const { data, error } = await this.insertWithMedia(
      'posts', { body: body.trim() }, files, video, POST_SELECT, onVideoProgress
    );
    return { data: data && normalizePost(data), error };
  }

  // Admins only. `keepPaths` are the existing images to keep (in order); `files` are
  // new uploads appended after them. Video: `keepVideo` keeps the current one, `video`
  // replaces it with a new upload, neither removes it. Dropped files are removed from
  // storage once the update succeeds; new uploads are removed again if it fails.
  async updatePost(post, { body, keepPaths, files, keepVideo = !!post.video_path, video = null, onVideoProgress }) {
    const { data: newVideo, error: videoError } = await this.uploadVideo(video, onVideoProgress);
    if (videoError) {
      return { data: null, error: videoError };
    }
    const { data: added, error: uploadError } = await this.uploadImages(files);
    if (uploadError) {
      await this.removeVideo(newVideo);
      return { data: null, error: uploadError };
    }
    const videoPath = newVideo || (keepVideo ? post.video_path : null);
    const result = await this.run(
      this.supabase.from('posts')
        .update({ body: body.trim(), image_paths: [...keepPaths, ...added], video_path: videoPath })
        .eq('id', post.id).select(POST_SELECT).single()
    );
    if (result.error) {
      await this.removeImages(added);
      await this.removeVideo(newVideo);
      return result;
    }
    await this.removeImages((post.image_paths || []).filter((p) => !keepPaths.includes(p)));
    if (post.video_path && post.video_path !== videoPath) {
      await this.removeVideo(post.video_path);
    }
    return { data: normalizePost(result.data), error: null };
  }

  // Admins only.
  async setPostPinned(post, pinned) {
    const { data, error } = await this.run(
      this.supabase.from('posts')
        .update({ pinned_at: pinned ? new Date().toISOString() : null })
        .eq('id', post.id).select(POST_SELECT).single()
    );
    return { data: data && normalizePost(data), error };
  }

  async deletePost(post) {
    const result = await this.run(this.supabase.from('posts').delete().eq('id', post.id));
    if (!result.error) {
      await this.removeImages(post.image_paths || []);
      await this.removeVideo(post.video_path);
    }
    return result;
  }

  // ---- comments ------------------------------------------------------------

  async listComments(postId) {
    return this.run(
      this.supabase.from('comments').select(COMMENT_SELECT)
        .eq('post_id', postId).order('id', { ascending: true })
    );
  }

  async listCommentsByUser(userId) {
    return this.run(
      this.supabase.from('comments').select(COMMENT_SELECT)
        .eq('author_id', userId).order('id', { ascending: false }).limit(PAGE_SIZE)
    );
  }

  async createComment(postId, { body, files, video = null, onVideoProgress }) {
    return this.insertWithMedia(
      'comments', { post_id: postId, body: body.trim() }, files, video, COMMENT_SELECT, onVideoProgress
    );
  }

  async deleteComment(comment) {
    const result = await this.run(this.supabase.from('comments').delete().eq('id', comment.id));
    if (!result.error) {
      await this.removeImages(comment.image_paths || []);
      await this.removeVideo(comment.video_path);
    }
    return result;
  }

  // ---- profiles ------------------------------------------------------------

  async getProfileById(id) {
    return this.run(this.supabase.from('profiles').select(PROFILE_SELECT).eq('id', id).maybeSingle());
  }

  async getProfileByUsername(username) {
    return this.run(
      this.supabase.from('profiles').select(PROFILE_SELECT)
        .ilike('username', escapeLike(username)).maybeSingle()
    );
  }

  async updateProfile(id, { username, about_me }) {
    return this.run(
      this.supabase.from('profiles').update({ username, about_me })
        .eq('id', id).select(PROFILE_SELECT).single()
    );
  }

  // Superuser only: bans (true) or unbans (false) a member from commenting.
  // Resolves to the member's new `banned_at` (null when unbanned).
  async setBanned(userId, banned) {
    return this.run(this.supabase.rpc('set_banned', { target: userId, banned }));
  }

  async usernameAvailable(name) {
    return this.run(this.supabase.rpc('username_available', { name }));
  }

  // ---- notifications ------------------------------------------------------

  // Superuser only: asks the Worker (worker/notify.js) to email members about a new
  // post. Each post is announced at most once. Resolves to { recipients, sent, failed }.
  async notifyNewPost(postId) {
    return this.postToWorker('/api/notify-new-post', { postId });
  }

  async getEmailPreferences(userId) {
    return this.run(
      this.supabase.from('email_preferences').select('notify_new_posts').eq('user_id', userId).maybeSingle()
    );
  }

  async setNotifyNewPosts(userId, enabled) {
    return this.run(
      this.supabase.from('email_preferences').update({ notify_new_posts: enabled })
        .eq('user_id', userId).select('notify_new_posts').single()
    );
  }

  // ---- contact form -------------------------------------------------------

  // Posts to the Worker (worker/contact.js), which stores and emails the message.
  // Sends the access token when logged in so the message is tagged with the member.
  async sendContactMessage({ email, phone, message, website }) {
    return this.postToWorker('/api/contact', { email, phone, message, website });
  }

  // POSTs JSON to one of our Worker endpoints, with the access token when logged in.
  async postToWorker(path, payload) {
    const { data: { session } } = await this.supabase.auth.getSession();
    let response;
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    }
    catch (err) {
      return { data: null, error: { message: 'Could not reach the server. Check your connection.', cause: err } };
    }
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      return { data: body, error: null };
    }
    return {
      data: null,
      error: { status: response.status, message: body.error || 'Request failed.', fields: body.errors },
    };
  }

  async touchLastSeen() {
    return this.run(this.supabase.rpc('touch_last_seen'));
  }
}
