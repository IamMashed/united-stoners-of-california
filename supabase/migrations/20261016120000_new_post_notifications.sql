-- "New post" notification emails. The Worker (worker/notify.js) sends them with the
-- secret key; clients can only see and flip their own opt-in flag.

-- Per-member email settings. Kept out of `profiles` because profiles are publicly
-- readable and the unsubscribe token must stay secret.
create table public.email_preferences (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  notify_new_posts   boolean not null default true,
  -- Secret used in one-click unsubscribe links (no login needed).
  unsubscribe_token  uuid not null default gen_random_uuid() unique,
  updated_at         timestamptz not null default now()
);

comment on table public.email_preferences is 'Email opt-ins; unsubscribe_token is never exposed to clients.';

alter table public.email_preferences enable row level security;
revoke all on public.email_preferences from anon, authenticated;
grant select (user_id, notify_new_posts), update (notify_new_posts) on public.email_preferences to authenticated;

create policy "Members can read their own email preferences" on public.email_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Members can change their own email preferences" on public.email_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create trigger email_preferences_set_updated_at
  before update on public.email_preferences
  for each row execute function public.set_updated_at();

-- Every profile gets a row (opted in), including existing members.
create function public.create_email_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.create_email_preferences() from public, anon, authenticated;

create trigger on_profile_created_email_preferences
  after insert on public.profiles
  for each row execute function public.create_email_preferences();

insert into public.email_preferences (user_id) select id from public.profiles on conflict do nothing;

-- Set when the "new post" emails for a post were sent (or claimed for sending), so
-- every post notifies at most once even if the request is retried.
alter table public.posts add column notified_at timestamptz;
-- Posts that already exist are treated as announced: no surprise email blast.
update public.posts set notified_at = created_at;

-- Who gets "new post" emails: confirmed, opted-in members, never the author.
-- Only callable with the secret key (service_role).
create function public.new_post_recipients(author uuid)
returns table (user_id uuid, email text, username text, unsubscribe_token uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.email::text, p.username, ep.unsubscribe_token
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.email_preferences ep on ep.user_id = p.id
  where ep.notify_new_posts
    and u.email is not null
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and p.id <> author
  order by p.created_at;
$$;

revoke execute on function public.new_post_recipients(uuid) from public, anon, authenticated;
grant execute on function public.new_post_recipients(uuid) to service_role;

-- One-click unsubscribe from an email link. Returns true when the token matched.
create function public.unsubscribe_new_posts(token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.email_preferences set notify_new_posts = false
    where unsubscribe_token = token returning 1
  )
  select exists (select 1 from changed);
$$;

revoke execute on function public.unsubscribe_new_posts(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_new_posts(uuid) to service_role;
