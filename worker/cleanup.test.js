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
    const bucket = url.match(/\/storage\/v1\/object\/(\w+)$/)?.[1];
    if (bucket && init.method === 'DELETE') {
      if (deleteStatus >= 400) return new Response('boom', { status: deleteStatus });
      const { prefixes } = JSON.parse(init.body);
      deleted.push(...prefixes.map((p) => `${bucket}:${p}`));
      return Response.json(prefixes.map((name) => ({ name })));
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  return { fetchImpl, deleted, calls };
}

test('deletes orphaned photos and videos from their own buckets', async () => {
  const backend = fakeBackend({ orphans: [
    { bucket: 'media', name: 'u1/a.png' }, { bucket: 'videos', name: 'u1/clip.mp4' }, { bucket: 'media', name: 'u2/b.jpg' },
  ] });
  expect(await cleanupOrphanedMedia(ENV, backend.fetchImpl)).toEqual({ found: 3, deleted: 3 });
  expect(backend.deleted).toEqual(['media:u1/a.png', 'media:u2/b.jpg', 'videos:u1/clip.mp4']);
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
  const backend = fakeBackend({ orphans: [{ bucket: 'media', name: 'u1/a.png' }], deleteStatus: 500 });
  expect(await cleanupOrphanedMedia(ENV, backend.fetchImpl)).toEqual({ found: 1, deleted: 0 });
});

test('without configuration it does nothing', async () => {
  const backend = fakeBackend({ orphans: [{ bucket: 'media', name: 'u1/a.png' }] });
  expect(await cleanupOrphanedMedia({}, backend.fetchImpl)).toEqual({ found: 0, deleted: 0 });
  expect(backend.calls).toHaveLength(0);
});
