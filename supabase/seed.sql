-- Dev seed data. Run with `npm run db:seed` (refused on prod).
-- Demo logins (password: scripts/seedPassword.mjs, never committed):
--   kushking@example.com   / kushking   (the superuser: writes posts)
--   hashqueen@example.com  / hashqueen  (regular member: comments)

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'kushking@example.com',  'kushking'),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'hashqueen@example.com', 'hashqueen')
    ) as t(id, email, username)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('__SEED_PASSWORD__', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', u.username), now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end;
$$;

update public.profiles set about_me = 'Humboldt grown, Oakland based. Living soil or bust.', is_admin = true
  where username = 'kushking';
update public.profiles set about_me = 'Solventless hash maker. Ice water, low temp, patience.'
  where username = 'hashqueen';

insert into public.posts (author_id, body, created_at) values
  ('11111111-1111-1111-1111-111111111111',
   'Just picked up some sun-grown Mendo Purps from a small Emerald Triangle farm. Terps are unreal: grape, earth, a little pine.',
   now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111',
   'PSA: if your rosin is coming out dark, drop your press temp. 180F on fresh frozen has been the sweet spot for me.',
   now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111',
   'Anyone been to the Emerald Cup this year? Looking for craft growers to check out in SoCal.',
   now() - interval '3 hours');

insert into public.comments (post_id, author_id, body) values
  ((select id from public.posts where body like 'PSA:%'),
   '22222222-2222-2222-2222-222222222222', 'Good call. What micron bags are you using?'),
  ((select id from public.posts where body like 'PSA:%'),
   '11111111-1111-1111-1111-111111111111', '25u for full melt, 90u for everything else.');
