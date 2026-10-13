// Thin data-access layer over supabase-js (PostgREST + Auth + Storage). Replaces
// the MicroblogApiClient from react-microblog. Every method returns `{ data, error }`;
// unexpected failures (network down, 5xx) are also reported through `onError`.

import { imageExtension } from '../lib/media.js';

export const PAGE_SIZE = 25;
export const MEDIA_BUCKET = 'media';

const AUTHOR = 'author:profiles(id, username, avatar_url, is_admin)';
const POST_SELECT = `id, body, image_paths, created_at, updated_at, ${AUTHOR}, comments(count)`;
const COMMENT_SELECT = `id, post_id, body, image_paths, created_at, updated_at, ${AUTHOR}`;
const PROFILE_SELECT = 'id, username, about_me, avatar_url, is_admin, created_at, last_seen';

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
        return { data: null, error };
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

  // Uploads the files, then inserts the row; removes the uploads if the insert fails.
  async insertWithImages(table, values, files, select) {
    const { data: paths, error: uploadError } = await this.uploadImages(files);
    if (uploadError) {
      return { data: null, error: uploadError };
    }
    const result = await this.run(
      this.supabase.from(table).insert({ ...values, image_paths: paths }).select(select).single()
    );
    if (result.error) {
      await this.removeImages(paths);
    }
    return result;
  }

  // ---- posts ---------------------------------------------------------------

  // Newest first, keyset pagination on id. `authorId` limits to one author.
  async listPosts({ authorId, beforeId } = {}) {
    let query = this.supabase.from('posts').select(POST_SELECT);
    if (authorId) {
      query = query.eq('author_id', authorId);
    }
    if (beforeId) {
      query = query.lt('id', beforeId);
    }
    const { data, error } = await this.run(
      query.order('id', { ascending: false }).limit(PAGE_SIZE + 1)
    );
    if (error) {
      return { data: null, error };
    }
    return {
      data: { posts: data.slice(0, PAGE_SIZE).map(normalizePost), more: data.length > PAGE_SIZE },
      error: null,
    };
  }

  async getPost(id) {
    const { data, error } = await this.run(
      this.supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle()
    );
    return { data: data && normalizePost(data), error };
  }

  async createPost({ body, files }) {
    const { data, error } = await this.insertWithImages(
      'posts', { body: body.trim() }, files, POST_SELECT
    );
    return { data: data && normalizePost(data), error };
  }

  async deletePost(post) {
    const result = await this.run(this.supabase.from('posts').delete().eq('id', post.id));
    if (!result.error) {
      await this.removeImages(post.image_paths || []);
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

  async createComment(postId, { body, files }) {
    return this.insertWithImages(
      'comments', { post_id: postId, body: body.trim() }, files, COMMENT_SELECT
    );
  }

  async deleteComment(comment) {
    const result = await this.run(this.supabase.from('comments').delete().eq('id', comment.id));
    if (!result.error) {
      await this.removeImages(comment.image_paths || []);
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

  async usernameAvailable(name) {
    return this.run(this.supabase.rpc('username_available', { name }));
  }

  async touchLastSeen() {
    return this.run(this.supabase.rpc('touch_last_seen'));
  }
}
