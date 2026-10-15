-- "Contact us" form. Messages are written only by the Cloudflare Worker
-- (worker/contact.js) with the project's secret key, which bypasses RLS; clients
-- get no insert grant, so the form's rate limit cannot be skipped by calling
-- PostgREST directly. The superuser can read and delete them.

create table public.contact_messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  email       text,
  phone       text,
  message     text not null,
  -- Set when the sender was logged in (verified by the Worker from their access token).
  user_id     uuid references public.profiles (id) on delete set null,
  -- Set once the notification email went out; null means "only stored".
  emailed_at  timestamptz,
  constraint contact_messages_reachable check (email is not null or phone is not null),
  constraint contact_messages_email_format check (
    email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  constraint contact_messages_phone_format check (
    phone is null or (char_length(phone) <= 30 and phone ~ '^\+?[0-9 ().-]{7,30}$')),
  constraint contact_messages_message_length check (
    char_length(btrim(message)) between 1 and 5000)
);

comment on table public.contact_messages is 'Contact form submissions; written by the Worker only.';

create index contact_messages_created_at_idx on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

revoke all on public.contact_messages from anon, authenticated;
grant select, delete on public.contact_messages to authenticated;

create policy "The admin can read contact messages" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));
create policy "The admin can delete contact messages" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));
