-- Product change: one superuser writes posts, members comment, anyone can read.
-- Posts and comments can carry up to 4 uploaded images (Supabase Storage bucket
-- `media`); videos are embedded client-side from YouTube/Vimeo/TikTok/Instagram links.

-------------------------------------------------------------------------------
-- Superuser
-------------------------------------------------------------------------------

alter table public.profiles add column is_admin boolean not null default false;

-- At most one superuser. Only settable with SQL (column is not granted to clients);
-- see `node scripts/db.mjs make-admin <env> <email>`.
create unique index profiles_single_admin_key on public.profiles (is_admin) where is_admin;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-------------------------------------------------------------------------------
-- Follows / feed are meaningless with a single author
-------------------------------------------------------------------------------

drop function public.feed();
drop table public.follows;

-------------------------------------------------------------------------------
-- Media attachments (storage object paths, `<user id>/<uuid>.<ext>`)
-------------------------------------------------------------------------------

alter table public.posts    add column image_paths text[] not null default '{}';
alter table public.comments add column image_paths text[] not null default '{}';

alter table public.posts
  add constraint posts_image_count check (cardinality(image_paths) <= 4),
  drop constraint posts_body_length,
  add constraint posts_body_length check (
    char_length(body) <= 5000
    and (char_length(btrim(body)) > 0 or cardinality(image_paths) > 0)
  );

alter table public.comments
  add constraint comments_image_count check (cardinality(image_paths) <= 4),
  drop constraint comments_body_length,
  add constraint comments_body_length check (
    char_length(body) <= 2000
    and (char_length(btrim(body)) > 0 or cardinality(image_paths) > 0)
  );

-- True when every path is inside the current user's storage folder.
create function public.owns_media_paths(paths text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(bool_and(p like auth.uid()::text || '/%' and p !~ '\.\.'), true)
  from unnest(paths) as p;
$$;

grant insert (image_paths), update (image_paths) on public.posts, public.comments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Members upload media into their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text));

create policy "Owners and the admin can delete media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media'
         and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin())));

-------------------------------------------------------------------------------
-- Public read
-------------------------------------------------------------------------------

grant select on public.profiles, public.posts, public.comments to anon;

drop policy "Members can read profiles" on public.profiles;
drop policy "Members can read posts" on public.posts;
drop policy "Members can read comments" on public.comments;

create policy "Anyone can read profiles" on public.profiles
  for select to anon, authenticated using (true);
create policy "Anyone can read posts" on public.posts
  for select to anon, authenticated using (true);
create policy "Anyone can read comments" on public.comments
  for select to anon, authenticated using (true);

-------------------------------------------------------------------------------
-- Write policies
-------------------------------------------------------------------------------

drop policy "Users can create their own posts" on public.posts;
drop policy "Authors can edit their posts" on public.posts;
drop policy "Authors can delete their posts" on public.posts;

create policy "Only the admin can create posts" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_admin())
              and public.owns_media_paths(image_paths));
create policy "Only the admin can edit posts" on public.posts
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and public.owns_media_paths(image_paths));
create policy "Only the admin can delete posts" on public.posts
  for delete to authenticated using ((select public.is_admin()));

drop policy "Users can create their own comments" on public.comments;
drop policy "Authors can edit their comments" on public.comments;
drop policy "Authors can delete their comments" on public.comments;

create policy "Members can comment as themselves" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and public.owns_media_paths(image_paths));
create policy "Authors can edit their comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and public.owns_media_paths(image_paths));
create policy "Authors and the admin can delete comments" on public.comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
