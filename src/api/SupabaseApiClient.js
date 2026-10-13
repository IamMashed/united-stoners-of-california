// Thin data-access layer over supabase-js (PostgREST + Auth). Replaces the
// MicroblogApiClient from react-microblog. Every method returns `{ data, error }`;
// unexpected failures (network down, 5xx) are also reported through `onError`.

export const PAGE_SIZE = 25;

const AUTHOR = 'author:profiles(id, username, avatar_url)';
const POST_SELECT = `id, body, created_at, updated_at, ${AUTHOR}, comments(count)`;
const COMMENT_SELECT = `id, post_id, body, created_at, updated_at, ${AUTHOR}`;
const PROFILE_SELECT = 'id, username, about_me, avatar_url, created_at, last_seen';

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

  // ---- posts ---------------------------------------------------------------

  // kind: 'feed' | 'explore' | 'user'. Keyset pagination on id (newest first).
  async listPosts({ kind = 'feed', authorId, beforeId } = {}) {
    let query = kind === 'feed'
      ? this.supabase.rpc('feed').select(POST_SELECT)
      : this.supabase.from('posts').select(POST_SELECT);
    if (kind === 'user') {
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

  async createPost(body) {
    const { data, error } = await this.run(
      this.supabase.from('posts').insert({ body: body.trim() }).select(POST_SELECT).single()
    );
    return { data: data && normalizePost(data), error };
  }

  async deletePost(id) {
    return this.run(this.supabase.from('posts').delete().eq('id', id));
  }

  // ---- comments ------------------------------------------------------------

  async listComments(postId) {
    return this.run(
      this.supabase.from('comments').select(COMMENT_SELECT)
        .eq('post_id', postId).order('id', { ascending: true })
    );
  }

  async createComment(postId, body) {
    return this.run(
      this.supabase.from('comments').insert({ post_id: postId, body: body.trim() })
        .select(COMMENT_SELECT).single()
    );
  }

  async deleteComment(id) {
    return this.run(this.supabase.from('comments').delete().eq('id', id));
  }

  // ---- profiles & follows --------------------------------------------------

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

  async isFollowing(followerId, followedId) {
    const { data, error } = await this.run(
      this.supabase.from('follows').select('followed_id')
        .eq('follower_id', followerId).eq('followed_id', followedId).maybeSingle()
    );
    return { data: error ? null : data !== null, error };
  }

  async follow(followedId) {
    return this.run(this.supabase.from('follows').insert({ followed_id: followedId }));
  }

  async unfollow(followerId, followedId) {
    return this.run(
      this.supabase.from('follows').delete()
        .eq('follower_id', followerId).eq('followed_id', followedId)
    );
  }
}
