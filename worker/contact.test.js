// @vitest-environment node
import { vi } from 'vitest';
import { handleContact } from './contact.js';

// The handler logs delivery problems; keep test output clean.
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

const ENV = {
  SUPABASE_URL: 'https://db.test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  CONTACT_TO: 'owner@example.com',
  RESEND_API_KEY: 're_test',
  CONTACT_FROM: 'USoC <no-reply@unitedstoners.club>',
};

// Fake Supabase + Resend. Records every request; `users` maps access tokens to auth users.
const MEMBER = { 'Bearer good-token': { id: 'u-hash', email: 'hash@example.com' } };

function fakeBackend({ users = MEMBER, insertStatus = 201, emailStatus = 200 } = {}) {
  const calls = [];
  const rows = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url, method: init.method || 'GET', headers: init.headers || {}, body: init.body && JSON.parse(init.body) };
    calls.push(call);
    if (url === `${ENV.SUPABASE_URL}/auth/v1/user`) {
      const user = users[call.headers.Authorization];
      return user ? Response.json(user) : Response.json({ msg: 'bad jwt' }, { status: 401 });
    }
    if (url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/profiles`)) {
      return Response.json([{ id: 'u-hash', username: 'hashqueen' }]);
    }
    if (url === `${ENV.SUPABASE_URL}/rest/v1/contact_messages` && call.method === 'POST') {
      if (insertStatus >= 400) return new Response('boom', { status: insertStatus });
      const row = { id: rows.length + 1, created_at: '2026-10-15T00:00:00Z', emailed_at: null, ...call.body };
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    if (url.startsWith(`${ENV.SUPABASE_URL}/rest/v1/contact_messages?id=eq.`) && call.method === 'PATCH') {
      const id = Number(url.split('eq.')[1]);
      Object.assign(rows.find((r) => r.id === id), call.body);
      return new Response(null, { status: 204 });
    }
    if (url === 'https://api.resend.com/emails') {
      return emailStatus < 400 ? Response.json({ id: 'email-1' }) : new Response('nope', { status: emailStatus });
    }
    throw new Error(`unexpected request ${call.method} ${url}`);
  };
  return { fetchImpl, calls, rows, emails: () => calls.filter((c) => c.url === 'https://api.resend.com/emails') };
}

function post(body, headers = {}) {
  return new Request('https://unitedstoners.club/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Origin: 'https://unitedstoners.club',
      Authorization: 'Bearer good-token', ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/contact', () => {
  test('stores the message, emails the owner with reply-to, and marks it emailed', async () => {
    const backend = fakeBackend();
    const response = await handleContact(
      post({ email: ' fan@example.com ', phone: '', message: 'Love the rosin guide!' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(backend.rows).toEqual([expect.objectContaining({
      email: 'fan@example.com', phone: null, message: 'Love the rosin guide!', user_id: 'u-hash',
    })]);
    const [email] = backend.emails();
    expect(email.body).toMatchObject({
      from: ENV.CONTACT_FROM, to: ['owner@example.com'], reply_to: 'fan@example.com',
      subject: 'Contact form: fan@example.com',
    });
    expect(email.body.text).toContain('Love the rosin guide!');
    expect(email.body.text).toContain('Member: hashqueen (hash@example.com)');
    expect(backend.rows[0].emailed_at).not.toBeNull();
    // The secret key goes to Supabase only, never to Resend.
    expect(email.headers.apikey).toBeUndefined();
  });

  test('a phone-only message has no reply-to and names the phone in the subject', async () => {
    const backend = fakeBackend();
    await handleContact(post({ phone: '+1 (415) 555-0100', message: 'Call me' }), ENV, backend.fetchImpl);

    const [email] = backend.emails();
    expect(email.body.reply_to).toBeUndefined();
    expect(email.body.subject).toBe('Contact form: +1 (415) 555-0100');
  });

  test('visitors who are not logged in are turned away and nothing is stored or sent', async () => {
    const backend = fakeBackend();
    const response = await handleContact(
      post({ email: 'x@example.com', message: 'hi' }, { Authorization: '' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Log in to contact us.' });
    expect(backend.rows).toHaveLength(0);
    expect(backend.emails()).toHaveLength(0);
  });

  test('a forged or expired token is rejected rather than trusted', async () => {
    const backend = fakeBackend();
    const response = await handleContact(
      post({ email: 'x@example.com', message: 'hi' }, { Authorization: 'Bearer forged' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(401);
    expect(backend.rows).toHaveLength(0);
  });

  test('rejects a message with no way to reply, without storing anything', async () => {
    const backend = fakeBackend();
    const response = await handleContact(post({ message: 'anonymous rant' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(400);
    expect((await response.json()).errors.email).toMatch(/email address or a phone number/);
    expect(backend.calls).toHaveLength(0);
  });

  test('the honeypot field makes bots think it worked while nothing is stored or sent', async () => {
    const backend = fakeBackend();
    const response = await handleContact(
      post({ email: 'bot@spam.test', message: 'cheap pills', website: 'http://spam.test' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(backend.calls).toHaveLength(0);
  });

  test('posts from other sites are refused', async () => {
    const backend = fakeBackend();
    const response = await handleContact(
      post({ email: 'a@b.co', message: 'hi' }, { Origin: 'https://evil.example' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(403);
    expect(backend.calls).toHaveLength(0);
  });

  test('is rate limited per IP', async () => {
    const backend = fakeBackend();
    const seen = [];
    const limiter = { limit: async ({ key }) => ({ success: seen.push(key) <= 1 }) };
    const env = { ...ENV, CONTACT_LIMITER: limiter };
    const send = () => handleContact(
      post({ email: 'a@b.co', message: 'hi' }, { 'CF-Connecting-IP': '203.0.113.9' }), env, backend.fetchImpl);

    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(429);
    expect(seen).toEqual(['contact:203.0.113.9', 'contact:203.0.113.9']);
    expect(backend.rows).toHaveLength(1);
  });

  test('without a Resend key the message is still stored and the sender sees success', async () => {
    const backend = fakeBackend();
    const { RESEND_API_KEY: _omit, ...env } = ENV;
    const response = await handleContact(post({ email: 'a@b.co', message: 'hi' }), env, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(backend.rows).toHaveLength(1);
    expect(backend.rows[0].emailed_at).toBeNull();
    expect(backend.emails()).toHaveLength(0);
  });

  test('a failed email leaves the message stored but not marked as emailed', async () => {
    const backend = fakeBackend({ emailStatus: 500 });
    const response = await handleContact(post({ email: 'a@b.co', message: 'hi' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(200);
    expect(backend.rows[0].emailed_at).toBeNull();
  });

  test('a database failure is reported to the sender and nothing is emailed', async () => {
    const backend = fakeBackend({ insertStatus: 500 });
    const response = await handleContact(post({ email: 'a@b.co', message: 'hi' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(500);
    expect(backend.emails()).toHaveLength(0);
  });

  test('members over the daily message limit are told to come back tomorrow', async () => {
    const backend = fakeBackend({ insertStatus: 429 });
    const response = await handleContact(post({ email: 'a@b.co', message: 'hi' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/tomorrow/);
    expect(backend.emails()).toHaveLength(0);
  });

  test('a malformed Origin header is refused', async () => {
    const backend = fakeBackend();
    const response = await handleContact(post({ email: 'a@b.co', message: 'hi' }, { Origin: 'null' }), ENV, backend.fetchImpl);

    expect(response.status).toBe(403);
    expect(backend.rows).toHaveLength(0);
  });

  test('only POST is allowed', async () => {
    const response = await handleContact(new Request('https://unitedstoners.club/api/contact'), ENV, fakeBackend().fetchImpl);
    expect(response.status).toBe(405);
  });
});
