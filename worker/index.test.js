// @vitest-environment node
import { vi } from 'vitest';
import worker from './index.js';

afterEach(() => { vi.restoreAllMocks(); });

test('an API failure becomes a JSON error instead of crashing the Worker', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network unreachable'));
  const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'k', RESEND_API_KEY: 'r', ASSETS: { fetch: vi.fn() } };

  const response = await worker.fetch(new Request('https://unitedstoners.club/api/notify-new-post', {
    method: 'POST', headers: { Authorization: 'Bearer admin', 'Content-Type': 'application/json' }, body: '{"postId":1}',
  }), env);

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'Something went wrong on our side. Please try again later.' });
});

test('www is redirected to the bare domain', async () => {
  const response = await worker.fetch(new Request('https://www.unitedstoners.club/post/3?x=1'), { ASSETS: { fetch: vi.fn() } });
  expect(response.status).toBe(301);
  expect(response.headers.get('Location')).toBe('https://unitedstoners.club/post/3?x=1');
});

test('other paths are served from the static assets', async () => {
  const assets = { fetch: vi.fn(async () => new Response('page')) };
  const response = await worker.fetch(new Request('https://unitedstoners.club/post/3'), { ASSETS: assets });
  expect(await response.text()).toBe('page');
});

test('pages carry security headers, including a CSP on the live site', async () => {
  const assets = { fetch: vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })) };
  const response = await worker.fetch(new Request('https://unitedstoners.club/'), { ASSETS: assets });

  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
  const csp = response.headers.get('Content-Security-Policy');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('https://www.youtube-nocookie.com');
});

test('no CSP on localhost, where Vite injects inline dev scripts', async () => {
  const assets = { fetch: vi.fn(async () => new Response('page')) };
  const response = await worker.fetch(new Request('http://localhost:5173/'), { ASSETS: assets });
  expect(response.headers.get('Content-Security-Policy')).toBeNull();
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
});

test('API calls are rate limited per IP', async () => {
  const seen = [];
  const env = {
    ASSETS: { fetch: vi.fn() },
    API_LIMITER: { limit: vi.fn(async ({ key }) => { seen.push(key); return { success: false }; }) },
  };
  const response = await worker.fetch(new Request('https://unitedstoners.club/api/unsubscribe?token=x', {
    headers: { 'CF-Connecting-IP': '203.0.113.9' },
  }), env);

  expect(response.status).toBe(429);
  expect(seen).toEqual(['api:203.0.113.9']);
});
