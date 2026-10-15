-- Run with: npm run test:db
-- Verifies the signup trigger, RLS policies and column grants that protect the
-- PostgREST API. Everything runs in a transaction and is rolled back.
begin;
select plan(55);

-------------------------------------------------------------------------------
-- Fixtures (as postgres). The auth trigger creates the profiles.
-- alice = the superuser, bob and carol = regular members.
-------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@test.local', '{"username":"alice"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@test.local',   '{"username":"bob"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'carol@test.local', '{"username":"carol"}'),
  -- Case-insensitive duplicate of alice: must not fail signup.
  ('dddddddd-0000-0000-0000-000000000004', 'alice2@test.local', '{"username":"ALICE"}'),
  -- GitHub OAuth shaped metadata.
  ('eeeeeeee-0000-0000-0000-000000000005', 'gh@test.local',
   '{"user_name":"greenthumb-420","avatar_url":"https://avatars.githubusercontent.com/u/1?v=4"}');

update public.profiles set is_admin = false where is_admin;  -- e.g. the dev seed admin
update public.profiles set is_admin = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.posts (author_id, body) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin post');
insert into public.comments (post_id, author_id, body)
  select id, 'cccccccc-0000-0000-0000-000000000003', 'carol comment' from public.posts where body = 'admin post';

-------------------------------------------------------------------------------
-- Signup trigger
-------------------------------------------------------------------------------
select is(
  (select username from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'alice', 'signup uses the requested username');

select isnt(
  lower((select username from public.profiles where id = 'dddddddd-0000-0000-0000-000000000004')),
  'alice', 'case-insensitive username collision gets a different username instead of failing');

select is(
  (select username from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000005'),
  'greenthumb420', 'OAuth login name is sanitized into a valid username');

select is(
  (select avatar_url from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000005'),
  'https://avatars.githubusercontent.com/u/1?v=4', 'OAuth avatar is kept');

select matches(
  (select avatar_url from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  '^https://www\.gravatar\.com/avatar/[0-9a-f]{32}\?d=identicon$', 'email users get a gravatar');

select is(
  (select is_admin from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  false, 'new users are not admins');

select throws_ok(
  $$update public.profiles set is_admin = true where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  '23505', null, 'there can only be one superuser');

-------------------------------------------------------------------------------
-- Anonymous visitors: read-only
-------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq($$select body from public.posts where body = 'admin post'$$,
  $$values ('admin post')$$, 'anon can read posts');
select results_eq($$select body from public.comments where body = 'carol comment'$$,
  $$values ('carol comment')$$, 'anon can read comments');
select results_eq($$select username from public.profiles where username = 'alice'$$,
  $$values ('alice')$$, 'anon can read profiles');
select throws_ok(
  $$insert into public.comments (post_id, body) select id, 'drive-by' from public.posts limit 1$$,
  '42501', null, 'anon cannot comment');
select is(public.username_available('newbie'), true, 'anon can check a free username');
select is(public.username_available('BOB'), false, 'username check is case-insensitive');
select is(public.username_available('no spaces'), false, 'invalid usernames are unavailable');

reset role;

-------------------------------------------------------------------------------
-- Logged in as bob (regular member)
-------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok($$insert into public.posts (body) values ('bob post')$$,
  '42501', null, 'members cannot create posts');
select is_empty($$update public.posts set body = 'hacked' returning id$$,
  'members cannot edit posts');
select is_empty($$delete from public.posts returning id$$,
  'members cannot delete posts');

select lives_ok(
  $$insert into public.comments (post_id, body) select id, 'bob comment' from public.posts where body = 'admin post'$$,
  'members can comment');
select is(
  (select author_id from public.comments where body = 'bob comment'),
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'comment author defaults to the current user');
select throws_ok(
  $$insert into public.comments (post_id, author_id, body)
    select id, 'cccccccc-0000-0000-0000-000000000003', 'spoof' from public.posts limit 1$$,
  '42501', null, 'cannot comment as someone else');
select throws_ok(
  $$insert into public.comments (post_id, body) select id, '   ' from public.posts where body = 'admin post'$$,
  '23514', null, 'blank comments without images are rejected');
select lives_ok(
  $$insert into public.comments (post_id, body, image_paths)
    select id, '', array['bbbbbbbb-0000-0000-0000-000000000002/bud.jpg']
    from public.posts where body = 'admin post'$$,
  'image-only comments are allowed');
select throws_ok(
  $$insert into public.comments (post_id, body, image_paths)
    select id, 'stolen', array['cccccccc-0000-0000-0000-000000000003/x.jpg']
    from public.posts where body = 'admin post'$$,
  '42501', null, 'cannot attach images from another user''s folder');
select throws_ok(
  $$insert into public.comments (post_id, body, image_paths)
    select id, 'too many', array(select 'bbbbbbbb-0000-0000-0000-000000000002/' || g || '.jpg' from generate_series(1, 5) g)
    from public.posts where body = 'admin post'$$,
  '23514', null, 'at most 4 images per comment');
select is_empty($$delete from public.comments where body = 'carol comment' returning id$$,
  'members cannot delete other people''s comments');
select isnt_empty($$delete from public.comments where body = 'bob comment' returning id$$,
  'members can delete their own comments');

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'bbbbbbbb-0000-0000-0000-000000000002/pic.jpg')$$,
  'members can upload into their own media folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'cccccccc-0000-0000-0000-000000000003/pic.jpg')$$,
  '42501', null, 'members cannot upload into someone else''s folder');

select lives_ok(
  $$update public.profiles set about_me = 'OG Kush fan' where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  'can edit own about_me');
select throws_ok($$update public.profiles set is_admin = true$$,
  '42501', null, 'members cannot make themselves admin');
select throws_ok($$update public.profiles set last_seen = now() - interval '1 year'$$,
  '42501', null, 'cannot write last_seen directly');
select is_empty(
  $$update public.profiles set about_me = 'pwned' where id = 'cccccccc-0000-0000-0000-000000000003' returning id$$,
  'cannot edit another user''s profile');

reset role;

-------------------------------------------------------------------------------
-- Logged in as alice (superuser)
-------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.posts (body, image_paths)
    values ('new admin post', array['aaaaaaaa-0000-0000-0000-000000000001/cover.jpg'])$$,
  'the superuser can create posts with images');
select isnt_empty($$update public.posts set body = 'edited' where body = 'new admin post' returning id$$,
  'the superuser can edit posts');
select isnt_empty($$delete from public.comments where body = 'carol comment' returning id$$,
  'the superuser can delete anyone''s comment');

select is(public.set_banned('bbbbbbbb-0000-0000-0000-000000000002', true) is not null, true,
  'the superuser can ban a member');
select throws_ok($$select public.set_banned('aaaaaaaa-0000-0000-0000-000000000001', true)$$,
  'P0002', null, 'the superuser cannot be banned');

reset role;

-------------------------------------------------------------------------------
-- Banned member (bob)
-------------------------------------------------------------------------------
insert into public.comments (post_id, author_id, body)
  select id, 'bbbbbbbb-0000-0000-0000-000000000002', 'bob old comment' from public.posts where body = 'admin post';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.comments (post_id, body) select id, 'banned comment' from public.posts where body = 'admin post'$$,
  '42501', null, 'banned members cannot comment');
select throws_ok(
  $$update public.comments set body = 'sneaky edit' where body = 'bob old comment'$$,
  '42501', null, 'banned members cannot edit their comments');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'bbbbbbbb-0000-0000-0000-000000000002/ban.jpg')$$,
  '42501', null, 'banned members cannot upload images');
select isnt_empty($$delete from public.comments where body = 'bob old comment' returning id$$,
  'banned members can still delete their own comments');
select throws_ok($$select public.set_banned('bbbbbbbb-0000-0000-0000-000000000002', false)$$,
  '42501', null, 'members cannot unban themselves');
select throws_ok($$update public.profiles set banned_at = null where id = 'bbbbbbbb-0000-0000-0000-000000000002'$$,
  '42501', null, 'members cannot clear banned_at directly');

reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.set_banned('cccccccc-0000-0000-0000-000000000003', true)$$,
  '42501', null, 'visitors cannot ban anyone');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is(public.set_banned('bbbbbbbb-0000-0000-0000-000000000002', false), null,
  'the superuser can unban a member');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.comments (post_id, body) select id, 'back again' from public.posts where body = 'admin post'$$,
  'unbanned members can comment again');

reset role;

-------------------------------------------------------------------------------
-- Contact messages: written only by the Worker (secret key), read by the admin
-------------------------------------------------------------------------------
insert into public.contact_messages (user_id, email, message) values ('bbbbbbbb-0000-0000-0000-000000000002', 'fan@test.local', 'hello there');

select throws_ok($$insert into public.contact_messages (user_id, message) values ('bbbbbbbb-0000-0000-0000-000000000002', 'no way to reply')$$,
  '23514', null, 'contact messages need an email or a phone');
select throws_ok($$insert into public.contact_messages (user_id, phone, message) values ('bbbbbbbb-0000-0000-0000-000000000002', 'call me', 'x')$$,
  '23514', null, 'contact phone numbers are format-checked');
select throws_ok($$insert into public.contact_messages (email, message) values ('a@b.co', 'anonymous')$$,
  '23502', null, 'every contact message belongs to a member');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$insert into public.contact_messages (email, message) values ('a@b.co', 'spam')$$,
  '42501', null, 'visitors cannot write contact messages directly (must go through the rate-limited Worker)');
select throws_ok($$select * from public.contact_messages$$,
  '42501', null, 'visitors cannot read contact messages');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$insert into public.contact_messages (email, message) values ('a@b.co', 'spam')$$,
  '42501', null, 'members cannot write contact messages directly');
select is_empty($$select * from public.contact_messages$$, 'members cannot read contact messages');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$select message from public.contact_messages where email = 'fan@test.local'$$,
  $$values ('hello there')$$, 'the superuser can read contact messages');
reset role;

-------------------------------------------------------------------------------
-- Cascades
-------------------------------------------------------------------------------
delete from public.posts where body = 'admin post';
select is(
  (select count(*)::int from public.comments where author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0,
  'deleting a post deletes its comments');

select * from finish();
rollback;
