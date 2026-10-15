-- Rate limits for member writes. The browser talks to PostgREST and Storage directly,
-- so limits live in the database where they can't be bypassed. Admins are exempt.
--
--   comments          5/minute, 30/hour, 100/day (accounts younger than a day:
--                     3/minute, 10/hour, 20/day); the same text twice within
--                     10 minutes is refused. Deleting comments does not reset the count.
--   uploads           30 files/hour and 300 MB stored per member (photos + videos).
--   contact messages  5 per member per day (also limited per IP in the Worker).
--
-- Limit errors use SQLSTATE PT429, which PostgREST answers with HTTP 429.

-- Write log used for counting. Not readable or writable by clients.
create table public.rate_limit_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  action      text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_events_lookup_idx on public.rate_limit_events (user_id, action, created_at desc);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- Records one `action` by `uid` or raises PT429 when any (max, window) pair in `limits`
-- is already used up. `limits` is e.g. '{"1 minute": 5, "1 hour": 30}'.
create function public.take_rate_limit(uid uuid, action text, limits jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  win text;
  max_count int;
  used int;
begin
  -- One member's concurrent requests queue up instead of racing past the count.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || action, 0));
  for win, max_count in select key, value::int from jsonb_each_text(limits) loop
    select count(*) into used from public.rate_limit_events e
     where e.user_id = uid and e.action = take_rate_limit.action
       and e.created_at > now() - win::interval;
    if used >= max_count then
      raise exception 'Slow down: you can only do this % times per %. Please try again later.', max_count, win
        using errcode = 'PT429';
    end if;
  end loop;
  insert into public.rate_limit_events (user_id, action) values (uid, action);
  -- Keep the log small: nothing older than a day is ever counted.
  delete from public.rate_limit_events e where e.user_id = uid and e.action = take_rate_limit.action
     and e.created_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.take_rate_limit(uuid, text, jsonb) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Comments
-------------------------------------------------------------------------------

create function public.limit_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author public.profiles;
begin
  select * into author from public.profiles where id = new.author_id;
  if author.is_admin then
    return new;
  end if;
  if char_length(btrim(new.body)) > 0 and exists (
    select 1 from public.comments c
     where c.author_id = new.author_id
       and lower(btrim(c.body)) = lower(btrim(new.body))
       and c.created_at > now() - interval '10 minutes'
  ) then
    raise exception 'You just posted that. Please don''t repeat the same comment.' using errcode = 'PT429';
  end if;
  perform public.take_rate_limit(new.author_id, 'comment',
    case when author.created_at > now() - interval '1 day'
      then '{"1 minute": 3, "1 hour": 10, "1 day": 20}'::jsonb
      else '{"1 minute": 5, "1 hour": 30, "1 day": 100}'::jsonb
    end);
  return new;
end;
$$;

revoke execute on function public.limit_comments() from public, anon, authenticated;

create index comments_author_id_created_at_idx on public.comments (author_id, created_at desc);

create trigger comments_rate_limit
  before insert on public.comments
  for each row execute function public.limit_comments();

-------------------------------------------------------------------------------
-- Uploads (checked in the storage insert policies)
-------------------------------------------------------------------------------

create function public.upload_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or (
    select count(*) filter (where o.created_at > now() - interval '1 hour') < 30
       and coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 300 * 1024 * 1024
    from storage.objects o
    where o.bucket_id in ('media', 'videos') and o.name like auth.uid()::text || '/%'
  );
$$;

revoke execute on function public.upload_allowed() from public, anon;
grant execute on function public.upload_allowed() to authenticated;

drop policy "Members upload media into their own folder unless banned" on storage.objects;
create policy "Members upload media into their own folder unless banned" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid()::text)
              and not (select public.is_banned()) and (select public.upload_allowed()));

drop policy "Members upload videos into their own folder unless banned" on storage.objects;
create policy "Members upload videos into their own folder unless banned" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid()::text)
              and not (select public.is_banned()) and (select public.upload_allowed()));

-------------------------------------------------------------------------------
-- Contact messages (inserted by the Worker with the secret key)
-------------------------------------------------------------------------------

create function public.limit_contact_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.take_rate_limit(new.user_id, 'contact', '{"1 day": 5}'::jsonb);
  return new;
end;
$$;

revoke execute on function public.limit_contact_messages() from public, anon, authenticated;

create trigger contact_messages_rate_limit
  before insert on public.contact_messages
  for each row execute function public.limit_contact_messages();
