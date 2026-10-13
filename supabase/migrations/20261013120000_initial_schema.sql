-- United Stoners of California: initial schema.
--
-- The React client talks to these tables directly through PostgREST, so Row Level
-- Security policies and column-level grants below are the *only* access control.
-- Anonymous visitors get no table access at all (same as microblog: login required).

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null
              constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,32}$'),
  about_me    text not null default ''
              constraint profiles_about_me_length check (char_length(about_me) <= 280),
  avatar_url  text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
comment on table public.profiles is 'Public user profile, 1:1 with auth.users.';

create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.posts (
  id          bigint generated always as identity primary key,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null
              constraint posts_body_length check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index posts_author_id_id_idx on public.posts (author_id, id desc);

create table public.comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null
              constraint comments_body_length check (char_length(btrim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index comments_post_id_id_idx on public.comments (post_id, id);
create index comments_author_id_idx on public.comments (author_id);

create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_no_self_follow check (follower_id <> followed_id)
);

create index follows_followed_id_idx on public.follows (followed_id);

-------------------------------------------------------------------------------
-- Triggers
-------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger posts_set_updated_at
  before update of body on public.posts
  for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
  before update of body on public.comments
  for each row execute function public.set_updated_at();

-- Turns any string (GitHub login, Google name, email local part) into a valid,
-- unused username. Appends a random numeric suffix on collision.
create function public.generate_username(base text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  cleaned   text := left(regexp_replace(coalesce(base, ''), '[^A-Za-z0-9_]', '', 'g'), 26);
  candidate text;
begin
  if char_length(cleaned) < 3 then
    cleaned := 'stoner';
  end if;
  candidate := cleaned;
  while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate)) loop
    candidate := cleaned || '_' || floor(random() * 100000)::int;
  end loop;
  return candidate;
end;
$$;

-- Creates the public profile whenever Supabase Auth creates a user (email signup or OAuth).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested text  := meta ->> 'username';
  chosen    text;
begin
  if requested ~ '^[A-Za-z0-9_]{3,32}$'
     and not exists (select 1 from public.profiles p where lower(p.username) = lower(requested)) then
    chosen := requested;
  else
    chosen := public.generate_username(coalesce(
      meta ->> 'user_name',            -- GitHub
      meta ->> 'preferred_username',
      meta ->> 'name',                 -- Google
      split_part(new.email, '@', 1)
    ));
  end if;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    chosen,
    coalesce(
      meta ->> 'avatar_url',
      meta ->> 'picture',
      'https://www.gravatar.com/avatar/' || md5(lower(btrim(coalesce(new.email, new.id::text)))) || '?d=identicon'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- RPC functions
-------------------------------------------------------------------------------

-- Posts from the current user and everyone they follow. PostgREST applies
-- select/order/limit/filters on top, e.g. rpc('feed').select('*, author:profiles(*)').
create function public.feed()
returns setof public.posts
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.posts p
  where p.author_id = auth.uid()
     or p.author_id in (select f.followed_id from public.follows f where f.follower_id = auth.uid());
$$;

-- Lets the signup form check a username before the account exists.
create function public.username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select name ~ '^[A-Za-z0-9_]{3,32}$'
     and not exists (select 1 from public.profiles p where lower(p.username) = lower(name));
$$;

create function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen = now() where id = auth.uid();
$$;

-------------------------------------------------------------------------------
-- Privileges (column-level) — clients may only write the columns listed here.
-------------------------------------------------------------------------------

revoke all on public.profiles, public.posts, public.comments, public.follows from anon, authenticated;

grant select on public.profiles, public.posts, public.comments, public.follows to authenticated;

grant update (username, about_me) on public.profiles to authenticated;

grant insert (body), update (body), delete on public.posts to authenticated;

grant insert (post_id, body), update (body), delete on public.comments to authenticated;

grant insert (followed_id), delete on public.follows to authenticated;

revoke execute on function
  public.feed(), public.touch_last_seen(), public.username_available(text),
  public.generate_username(text), public.handle_new_user(), public.set_updated_at()
  from public, anon, authenticated;

grant execute on function public.feed(), public.touch_last_seen() to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.comments enable row level security;
alter table public.follows  enable row level security;

create policy "Members can read profiles" on public.profiles
  for select to authenticated using (true);
create policy "Users can update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Members can read posts" on public.posts
  for select to authenticated using (true);
create policy "Users can create their own posts" on public.posts
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Authors can edit their posts" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Authors can delete their posts" on public.posts
  for delete to authenticated using (author_id = (select auth.uid()));

create policy "Members can read comments" on public.comments
  for select to authenticated using (true);
create policy "Users can create their own comments" on public.comments
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Authors can edit their comments" on public.comments
  for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Authors can delete their comments" on public.comments
  for delete to authenticated using (author_id = (select auth.uid()));

create policy "Members can read follows" on public.follows
  for select to authenticated using (true);
create policy "Users can follow as themselves" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "Users can unfollow as themselves" on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));
