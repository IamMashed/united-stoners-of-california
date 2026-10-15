// @vitest-environment node
import { vi } from 'vitest';
import { cleanupOrphanedMedia } from './cleanup.js';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

const ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_SECRET_KEY: 'sb_secret_test' };

function fakeBackend({ orphans = [], deleteStatus = 200 } = {}) {
  const deleted = [];
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url === `${ENV.SUPABASE_URL}/rest/v1/rpc/orphaned_media`) return Response.json(orphans);
    if (url === `${ENV.SUPABASE_URL}/storage/v1/object/media` && init.method === 'DELETE') {
      if (deleteStatus >= 400) return new Response('boom', { status: deleteStatus });
      const { prefixes } = JSON.parse(init.body);
      deleted.push(...prefixes);
      return Response.json(prefixes.map((name) => ({ name })));
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  return { fetchImpl, deleted, calls };
}

test('deletes every orphaned photo through the Storage API', async () => {
  const backend = fakeBackend({ orphans: ['u1/a.png', 'u2/b.jpg'] });
  expect(await cleanupOrphanedMedia(ENV, backend.fetchImpl)).toEqual({ found: 2, deleted: 2 });
  expect(backend.deleted).toEqual(['u1/a.png', 'u2/b.jpg']);
});

test('asks the database to skip photos younger than a day by default', async () => {
  const backend = fakeBackend();
  await cleanupOrphanedMedia(ENV, backend.fetchImpl);
  expect(backend.calls[0].body).toEqual({ min_age: '1 day' });
});

test('does nothing when there are no orphans', async () => {
  const backend = fakeBackend();
  expect(await cleanupOrphanedMedia(ENV, backend.fetchImpl)).toEqual({ found: 0, deleted: 0 });
  expect(backend.calls).toHaveLength(1);
});

test('a failed delete is reported, not thrown', async () => {
  const backend = fakeBackend({ orphans: ['u1/a.png'], deleteStatus: 500 });
  expect(await cleanupOrphanedMedia(ENV, backend.fetchImpl)).toEqual({ found: 1, deleted: 0 });
});

test('without configuration it does nothing', async () => {
  const backend = fakeBackend({ orphans: ['u1/a.png'] });
  expect(await cleanupOrphanedMedia({}, backend.fetchImpl)).toEqual({ found: 0, deleted: 0 });
  expect(backend.calls).toHaveLength(0);
});
