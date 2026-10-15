-- Allow more than one admin (superuser). All admins have the same powers: write,
-- edit and delete any post, delete any comment, ban members. Admins cannot be banned.
drop index public.profiles_single_admin_key;

-- True when every path is inside some admin's storage folder, so one admin can edit
-- another admin's post without dropping its photos.
create function public.admin_media_paths(paths text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(
    p !~ '\.\.'
    and exists (select 1 from public.profiles a where a.is_admin and p like a.id::text || '/%')
  ), true)
  from unnest(paths) as p;
$$;

drop policy "Only the admin can create posts" on public.posts;
create policy "Only admins can create posts" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_admin())
              and public.owns_media_paths(image_paths));

drop policy "Only the admin can edit posts" on public.posts;
create policy "Only admins can edit posts" on public.posts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and public.admin_media_paths(image_paths));
