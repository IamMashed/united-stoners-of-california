import { vi } from 'vitest';

export const KUSH = {
  id: 'u-kush', username: 'kushking', about_me: 'Living soil or bust.',
  avatar_url: null, created_at: '2026-01-01T00:00:00Z', last_seen: '2026-10-13T00:00:00Z',
};
export const HASH = {
  id: 'u-hash', username: 'hashqueen', about_me: '', avatar_url: null,
  created_at: '2026-01-01T00:00:00Z', last_seen: '2026-10-13T00:00:00Z',
};

export function makePost(id, author, body, commentCount = 0) {
  return {
    id, body, created_at: '2026-10-13T00:00:00Z', updated_at: null,
    author: { id: author.id, username: author.username, avatar_url: null },
    comment_count: commentCount,
  };
}

function sessionFor(profile) {
  return profile && {
    user: { id: profile.id, email: `${profile.username}@example.com`, app_metadata: { providers: ['email'] } },
  };
}

// In-memory stand-in for SupabaseApiClient. `loggedInAs` is a profile or null.
export function makeFakeApi({ loggedInAs = null, posts = [], profiles = [KUSH, HASH] } = {}) {
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
    usernameAvailable: vi.fn(async (name) => ({
      data: !profiles.some((p) => p.username.toLowerCase() === name.toLowerCase()), error: null,
    })),
    listPosts: vi.fn(async () => ({ data: { posts, more: false }, error: null })),
    createPost: vi.fn(async (body) => ({ data: makePost(999, loggedInAs, body), error: null })),
    deletePost: vi.fn(async () => ({ data: null, error: null })),
    isFollowing: vi.fn(async () => ({ data: false, error: null })),
    follow: vi.fn(async () => ({ data: null, error: null })),
    unfollow: vi.fn(async () => ({ data: null, error: null })),
  };
}
