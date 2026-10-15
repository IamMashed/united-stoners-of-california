// Daily cron (wrangler.jsonc "triggers"): deletes photos in the `media` bucket that no
// post or comment references anymore, e.g. comment photos of a deleted post. The list
// comes from public.orphaned_media(), which skips files younger than a day.
//
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY.
export async function cleanupOrphanedMedia(env, fetchImpl = fetch, { minAge = '1 day' } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error('cleanup: SUPABASE_URL / SUPABASE_SECRET_KEY not configured');
    return { found: 0, deleted: 0 };
  }
  const headers = { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' };
  const list = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/orphaned_media`, {
    method: 'POST', headers, body: JSON.stringify({ min_age: minAge }),
  });
  if (!list.ok) {
    console.error('cleanup: listing failed', list.status, await list.text());
    return { found: 0, deleted: 0 };
  }
  const names = await list.json();
  if (names.length === 0) return { found: 0, deleted: 0 };

  const removed = await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/media`, {
    method: 'DELETE', headers: { ...headers, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
    body: JSON.stringify({ prefixes: names }),
  });
  if (!removed.ok) {
    console.error('cleanup: delete failed', removed.status, await removed.text());
    return { found: names.length, deleted: 0 };
  }
  const deleted = (await removed.json()).length;
  console.log(`cleanup: deleted ${deleted} of ${names.length} orphaned photo(s)`);
  return { found: names.length, deleted };
}
