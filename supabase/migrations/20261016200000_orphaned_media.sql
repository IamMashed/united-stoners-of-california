-- Photos no post or comment uses anymore (deleted posts/comments, photos removed while
-- editing, failed uploads). Storage files can't be deleted from SQL on Supabase
-- (storage.protect_delete), so the Worker's daily cron (worker/cleanup.js) lists them
-- here and deletes them through the Storage API. Files younger than `min_age` are
-- skipped so uploads that are still being attached are never touched.
create function public.orphaned_media(min_age interval default interval '1 day', max_files int default 1000)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'media'
    and o.created_at < now() - min_age
    and not exists (select 1 from public.posts p where o.name = any (p.image_paths))
    and not exists (select 1 from public.comments c where o.name = any (c.image_paths))
  order by o.created_at
  limit max_files;
$$;

revoke execute on function public.orphaned_media(interval, int) from public, anon, authenticated;
grant execute on function public.orphaned_media(interval, int) to service_role;
