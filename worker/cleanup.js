// Daily cron (wrangler.jsonc "triggers"): deletes photos and videos that no post or
// comment references anymore, e.g. comment photos of a deleted post. The list comes
// from public.orphaned_media(), which skips files younger than a day.
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
  const rows = await list.json();   // [{ bucket, name }]
  const byBucket = new Map();
  for (const { bucket, name } of rows) {
    byBucket.set(bucket, [...(byBucket.get(bucket) || []), name]);
  }

  let deleted = 0;
  for (const [bucket, names] of byBucket) {
    const removed = await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE', headers: { ...headers, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` },
      body: JSON.stringify({ prefixes: names }),
    });
    if (removed.ok) deleted += (await removed.json()).length;
    else console.error(`cleanup: delete from ${bucket} failed`, removed.status, await removed.text());
  }
  if (rows.length) console.log(`cleanup: deleted ${deleted} of ${rows.length} orphaned file(s)`);
  return { found: rows.length, deleted };
}
