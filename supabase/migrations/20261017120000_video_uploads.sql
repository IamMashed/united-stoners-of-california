-- Uploaded videos on posts and comments. One video per post/comment: either an
-- uploaded file (video_path) or a video link in the text, never both. Files live in a
-- separate public bucket `videos` (50 MB cap = the Free plan's per-file limit), in
-- the uploader's folder `<user id>/<uuid>.<ext>`, like photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "Members upload videos into their own folder unless banned" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid()::text)
              and not (select public.is_banned()));
-- Storage only deletes objects the caller can also SELECT (see 20261013220000).
create policy "Owners and admins can see videos they may delete" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin())));
create policy "Owners and admins can delete videos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin())));

alter table public.posts    add column video_path text;
alter table public.comments add column video_path text;

-- Text must not contain a video link when a video is uploaded (mirrors lib/embeds.js hosts).
create function public.has_video_link(body text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select body ~* 'https?://([a-z0-9-]+\.)*(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|tiktok\.com|instagram\.com)/';
$$;

alter table public.posts
  add constraint posts_one_video check (video_path is null or not public.has_video_link(body)),
  drop constraint posts_body_length,
  add constraint posts_body_length check (
    char_length(body) <= 5000
    and (char_length(btrim(body)) > 0 or cardinality(image_paths) > 0 or video_path is not null)
  );

alter table public.comments
  add constraint comments_one_video check (video_path is null or not public.has_video_link(body)),
  drop constraint comments_body_length,
  add constraint comments_body_length check (
    char_length(body) <= 2000
    and (char_length(btrim(body)) > 0 or cardinality(image_paths) > 0 or video_path is not null)
  );

grant insert (video_path), update (video_path) on public.posts, public.comments to authenticated;

-- All attached files of a row (photos + video), for the ownership checks below.
create function public.attached_paths(image_paths text[], video_path text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(image_paths || video_path, null);
$$;

drop policy "Only admins can create posts" on public.posts;
create policy "Only admins can create posts" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_admin())
              and public.owns_media_paths(public.attached_paths(image_paths, video_path)));

drop policy "Only admins can edit posts" on public.posts;
create policy "Only admins can edit posts" on public.posts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin())
              and public.admin_media_paths(public.attached_paths(image_paths, video_path)));

drop policy "Members can comment as themselves unless banned" on public.comments;
create policy "Members can comment as themselves unless banned" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and not (select public.is_banned())
              and public.owns_media_paths(public.attached_paths(image_paths, video_path)));

drop policy "Authors can edit their comments unless banned" on public.comments;
create policy "Authors can edit their comments unless banned" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and not (select public.is_banned())
              and public.owns_media_paths(public.attached_paths(image_paths, video_path)));

-- Orphan cleanup now covers both buckets and returns the bucket with each file.
drop function public.orphaned_media(interval, int);
create function public.orphaned_media(min_age interval default interval '1 day', max_files int default 1000)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where o.bucket_id in ('media', 'videos')
    and o.created_at < now() - min_age
    and not exists (select 1 from public.posts p
                    where o.name = any (p.image_paths) or o.name = p.video_path)
    and not exists (select 1 from public.comments c
                    where o.name = any (c.image_paths) or o.name = c.video_path)
  order by o.created_at
  limit max_files;
$$;

revoke execute on function public.orphaned_media(interval, int) from public, anon, authenticated;
grant execute on function public.orphaned_media(interval, int) to service_role;
