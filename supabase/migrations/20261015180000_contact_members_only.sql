-- The contact form is members-only: every message belongs to an account. Deleting
-- the account deletes its messages (they were tied to that person anyway).
delete from public.contact_messages where user_id is null;

alter table public.contact_messages
  alter column user_id set not null,
  drop constraint contact_messages_user_id_fkey,
  add constraint contact_messages_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

comment on column public.contact_messages.user_id is 'Sender (verified by the Worker from their access token).';
