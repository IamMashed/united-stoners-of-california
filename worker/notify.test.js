// @vitest-environment node
import { vi } from 'vitest';
import { handleNotifyNewPost, handleUnsubscribe, postSummary } from './notify.js';

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

const ENV = {
  SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'sb_secret_test', RESEND_API_KEY: 're_test',
  CONTACT_FROM: 'USoC <no-reply@unitedstoners.club>', SITE_URL: 'https://unitedstoners.club',
};
const TOKEN_A = '11111111-2222-3333-4444-555555555555';
const people = (n) => Array.from({ length: n }, (_, i) => ({
  user_id: `u${i}`, email: `m${i}@example.com`, username: `member${i}`, unsubscribe_token: TOKEN_A,
}));

// Fake Supabase + Resend: one admin token, posts with a notified_at flag, a recipient list.
function fakeBackend({ recipients = people(2), resendStatus = 200, notifiedAt = null } = {}) {
  const post = { id: 7, author_id: 'u-admin', notified_at: notifiedAt,
    body: 'https://youtu.be/AeP0MTL-NH8\n\nThe Emerald Triangle\n\nHumboldt, Mendocino and Trinity.\n\n[photo 1]\n\nMore.' };
  const batches = [];
  const unsubscribed = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET';
    const body = init.body && JSON.parse(init.body);
    const auth = init.headers?.Authorization;
    if (url === `${ENV.SUPABASE_URL}/auth/v1/user`) {
      if (auth === 'Bearer admin') return Response.json({ id: 'u-admin' });
      if (auth === 'Bearer member') return Response.json({ id: 'u-member' });
      return Response.json({}, { status: 401 });
    }
    if (url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/profiles?id=eq.`)) {
      return Response.json([{ is_admin: url.includes('u-admin') }]);
    }
    if (url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/posts?id=eq.7`) && method === 'PATCH') {
      if (url.includes('notified_at=is.null')) {
        if (post.notified_at) return Response.json([]);
        post.notified_at = body.notified_at;
        return Response.json([{ id: post.id, body: post.body, author_id: post.author_id }]);
      }
      post.notified_at = body.notified_at;  // release
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/posts`) && method === 'PATCH') return Response.json([]);
    if (url === `${ENV.SUPABASE_URL}/rest/v1/rpc/new_post_recipients`) {
      expect(body).toEqual({ author: 'u-admin' });
      return Response.json(recipients);
    }
    if (url === `${ENV.SUPABASE_URL}/rest/v1/rpc/unsubscribe_new_posts`) {
      const ok = body.token === TOKEN_A;
      if (ok) unsubscribed.push(body.token);
      return Response.json(ok);
    }
    if (url === 'https://api.resend.com/emails/batch') {
      batches.push(body);
      return resendStatus < 400 ? Response.json({ data: body.map((_, i) => ({ id: `e${i}` })) })
        : new Response('nope', { status: resendStatus });
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { fetchImpl, post, batches, unsubscribed };
}

const notify = (backend, { token = 'admin', postId = 7 } = {}) => handleNotifyNewPost(
  new Request('https://unitedstoners.club/api/notify-new-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ postId }),
  }), ENV, backend.fetchImpl);

describe('POST /api/notify-new-post', () => {
  test('emails every recipient with a link to the post and a one-click unsubscribe', async () => {
    const backend = fakeBackend();
    const response = await notify(backend);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recipients: 2, sent: 2, failed: 0 });
    const [batch] = backend.batches;
    expect(batch.map((e) => e.to)).toEqual([['m0@example.com'], ['m1@example.com']]);
    const email = batch[0];
    expect(email.subject).toBe('New post: The Emerald Triangle');
    expect(email.text).toContain('Read it here: https://unitedstoners.club/post/7');
    expect(email.html).toContain('href="https://unitedstoners.club/post/7"');
    expect(email.headers['List-Unsubscribe']).toBe(`<https://unitedstoners.club/api/unsubscribe?token=${TOKEN_A}>`);
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(backend.post.notified_at).not.toBeNull();
  });

  test('each post is announced only once', async () => {
    const backend = fakeBackend();
    await notify(backend);
    const again = await notify(backend);

    expect(again.status).toBe(409);
    expect(backend.batches).toHaveLength(1);
  });

  test('members and visitors cannot trigger emails', async () => {
    for (const token of ['member', null]) {
      const backend = fakeBackend();
      const response = await notify(backend, { token });
      expect(response.status).toBe(403);
      expect(backend.batches).toHaveLength(0);
      expect(backend.post.notified_at).toBeNull();
    }
  });

  test('large member lists are sent in batches of 100', async () => {
    const backend = fakeBackend({ recipients: people(250) });
    const response = await notify(backend);

    expect(await response.json()).toEqual({ recipients: 250, sent: 250, failed: 0 });
    expect(backend.batches.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  test('if nothing could be sent, the post can be announced again later', async () => {
    const backend = fakeBackend({ resendStatus: 500 });
    const response = await notify(backend);

    expect(response.status).toBe(502);
    expect(backend.post.notified_at).toBeNull();
  });

  test('member names are HTML-escaped in the email', async () => {
    const backend = fakeBackend({ recipients: [{ ...people(1)[0], username: '<b>x</b>' }] });
    await notify(backend);

    expect(backend.batches[0][0].html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(backend.batches[0][0].html).not.toContain('<b>x</b>');
  });
});

describe('unsubscribe links', () => {
  test('a valid link turns off new-post emails and shows a confirmation page', async () => {
    const backend = fakeBackend();
    const response = await handleUnsubscribe(
      new Request(`https://unitedstoners.club/api/unsubscribe?token=${TOKEN_A}`), ENV, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Unsubscribed');
    expect(backend.unsubscribed).toEqual([TOKEN_A]);
  });

  test('a bad token is refused without touching the database', async () => {
    const backend = fakeBackend();
    const response = await handleUnsubscribe(
      new Request('https://unitedstoners.club/api/unsubscribe?token=nope'), ENV, backend.fetchImpl);

    expect(response.status).toBe(400);
    expect(backend.unsubscribed).toHaveLength(0);
  });

  test('mail apps can unsubscribe with a one-click POST', async () => {
    const backend = fakeBackend();
    const response = await handleUnsubscribe(new Request(`https://unitedstoners.club/api/unsubscribe?token=${TOKEN_A}`,
      { method: 'POST', body: 'List-Unsubscribe=One-Click' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(backend.unsubscribed).toEqual([TOKEN_A]);
  });
});

describe('postSummary', () => {
  test('uses the first text line as the title, skipping video links and photo markers', () => {
    expect(postSummary('https://youtu.be/AeP0MTL-NH8\n\n[photo 1]\nRig giveaway 🎉\n\nFree rig for one member.'))
      .toEqual({ title: 'Rig giveaway 🎉', excerpt: 'Free rig for one member.' });
  });

  test('clips long excerpts', () => {
    expect(postSummary(`Title\n${'word '.repeat(100)}`).excerpt).toMatch(/…$/);
  });
});
