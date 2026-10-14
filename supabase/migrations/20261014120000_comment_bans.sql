-- Moderation: the superuser can ban a member from commenting (and unban them).
-- Banned members can still log in, read, and delete their own comments, but cannot
-- write or edit comments or upload images. `banned_at` is only writable through
-- `set_banned()` (no column grant), which only the superuser may call.

alter table public.profiles add column banned_at timestamptz;

create function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.banned_at is not null from public.profiles p where p.id = auth.uid()), false);
$$;

-- Bans (banned = true) or unbans a member and returns the new banned_at.
-- The superuser cannot be banned.
create function public.set_banned(target uuid, banned boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only the superuser can ban members' using errcode = '42501';
  end if;
  update public.profiles
     set banned_at = case when banned then coalesce(banned_at, now()) end
   where id = target and not is_admin
  returning banned_at into result;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke execute on function public.set_banned(uuid, boolean) from public, anon;
grant execute on function public.set_banned(uuid, boolean) to authenticated;

drop policy "Members can comment as themselves" on public.comments;
create policy "Members can comment as themselves unless banned" on public.comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and not (select public.is_banned())
              and public.owns_media_paths(image_paths));

drop policy "Authors can edit their comments" on public.comments;
create policy "Authors can edit their comments unless banned" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and not (select public.is_banned())
              and public.owns_media_paths(image_paths));

drop policy "Members upload media into their own folder" on storage.objects;
create policy "Members upload media into their own folder unless banned" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text)
              and not (select public.is_banned()));
