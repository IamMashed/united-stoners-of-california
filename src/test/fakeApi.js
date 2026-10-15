import { vi } from 'vitest';

// KUSH is the superuser (writes posts); HASH is a regular member.
export const KUSH = {
  id: 'u-kush', username: 'kushking', about_me: 'Living soil or bust.', is_admin: true, banned_at: null,
  avatar_url: null, created_at: '2026-01-01T00:00:00Z', last_seen: '2026-10-13T00:00:00Z',
};
export const HASH = {
  id: 'u-hash', username: 'hashqueen', about_me: '', avatar_url: null, is_admin: false, banned_at: null,
  created_at: '2026-01-01T00:00:00Z', last_seen: '2026-10-13T00:00:00Z',
};

function authorOf(profile) {
  return { id: profile.id, username: profile.username, avatar_url: null, is_admin: profile.is_admin };
}

export function makePost(id, author, body, commentCount = 0, imagePaths = []) {
  return {
    id, body, image_paths: imagePaths, video_path: null, created_at: '2026-10-13T00:00:00Z', updated_at: null,
    author: authorOf(author), comment_count: commentCount,
  };
}

export function makeComment(id, postId, author, body, imagePaths = []) {
  return {
    id, post_id: postId, body, image_paths: imagePaths, video_path: null, created_at: '2026-10-13T00:00:00Z',
    updated_at: null, author: authorOf(author),
  };
}

function sessionFor(profile) {
  return profile && {
    user: { id: profile.id, email: `${profile.username}@example.com`, app_metadata: { providers: ['email'] } },
  };
}

// In-memory stand-in for SupabaseApiClient. `loggedInAs` is a profile or null.
export function makeFakeApi({
  loggedInAs = null, posts = [], comments = [], profiles = [KUSH, HASH],
} = {}) {
  let session = sessionFor(loggedInAs);
  const listeners = new Set();
  const emit = (event) => listeners.forEach((cb) => cb(event, session));

  const auth = {
    getSession: vi.fn(async () => ({ data: { session } })),
    onAuthStateChange: vi.fn((cb) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    signInWithPassword: vi.fn(async ({ email, password }) => {
      const profile = profiles.find((p) => `${p.username}@example.com` === email);
      if (!profile || password !== 'password123') {
        return { error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } };
      }
      session = sessionFor(profile);
      emit('SIGNED_IN');
      return { data: { session }, error: null };
    }),
    signOut: vi.fn(async () => {
      session = null;
      emit('SIGNED_OUT');
      return { error: null };
    }),
    signUp: vi.fn(async () => ({ data: { session: null, user: {} }, error: null })),
  };

  return {
    auth,
    getProfileById: vi.fn(async (id) => ({ data: profiles.find((p) => p.id === id) ?? null, error: null })),
    getProfileByUsername: vi.fn(async (name) => ({
      data: profiles.find((p) => p.username.toLowerCase() === name.toLowerCase()) ?? null, error: null,
    })),
    touchLastSeen: vi.fn(async () => ({ data: null, error: null })),
    updateProfile: vi.fn(async (id, values) => ({
      data: { ...profiles.find((p) => p.id === id), ...values }, error: null,
    })),
    usernameAvailable: vi.fn(async (name) => ({
      data: !profiles.some((p) => p.username.toLowerCase() === name.toLowerCase()), error: null,
    })),
    listPosts: vi.fn(async () => ({ data: { posts, more: false }, error: null })),
    getPost: vi.fn(async (id) => ({ data: posts.find((p) => p.id === id) ?? null, error: null })),
    createPost: vi.fn(async ({ body, files, video }) => ({
      data: { ...makePost(999, loggedInAs, body, 0, files.map((f) => `${loggedInAs.id}/${f.name}`)),
        video_path: video ? `${loggedInAs.id}/${video.name}` : null },
      error: null,
    })),
    updatePost: vi.fn(async (post, { body, keepPaths, files }) => ({
      data: {
        ...post, body, updated_at: '2026-10-14T00:00:00Z',
        image_paths: [...keepPaths, ...files.map((f) => `${loggedInAs.id}/${f.name}`)],
      },
      error: null,
    })),
    deletePost: vi.fn(async () => ({ data: null, error: null })),
    listComments: vi.fn(async (postId) => ({ data: comments.filter((c) => c.post_id === postId), error: null })),
    listCommentsByUser: vi.fn(async (userId) => ({
      data: comments.filter((c) => c.author.id === userId), error: null,
    })),
    createComment: vi.fn(async (postId, { body, files, video }) => ({
      data: { ...makeComment(888, postId, loggedInAs, body, files.map((f) => `${loggedInAs.id}/${f.name}`)),
        video_path: video ? `${loggedInAs.id}/${video.name}` : null },
      error: null,
    })),
    deleteComment: vi.fn(async () => ({ data: null, error: null })),
    setBanned: vi.fn(async (userId, banned) => ({ data: banned ? '2026-10-14T00:00:00Z' : null, error: null })),
    sendContactMessage: vi.fn(async () => ({ data: { ok: true }, error: null })),
    notifyNewPost: vi.fn(async () => ({ data: { recipients: 2, sent: 2, failed: 0 }, error: null })),
    getEmailPreferences: vi.fn(async () => ({ data: { notify_new_posts: true }, error: null })),
    setNotifyNewPosts: vi.fn(async (userId, enabled) => ({ data: { notify_new_posts: enabled }, error: null })),
    mediaUrl: (path) => `https://media.test/${path}`,
    videoUrl: (path) => `https://videos.test/${path}`,
  };
}
