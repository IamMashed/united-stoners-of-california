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
