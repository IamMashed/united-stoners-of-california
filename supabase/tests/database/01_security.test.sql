-- Run with: supabase test db
-- Verifies the signup trigger, RLS policies and column grants that protect the
-- PostgREST API. Everything runs in a transaction and is rolled back.
begin;
select plan(27);

-------------------------------------------------------------------------------
-- Fixtures (as postgres). The auth trigger creates the profiles.
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

insert into public.posts (author_id, body) values
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob post'),
  ('cccccccc-0000-0000-0000-000000000003', 'carol post');
insert into public.comments (post_id, author_id, body)
  select id, 'bbbbbbbb-0000-0000-0000-000000000002', 'bob comment' from public.posts where body = 'bob post';

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

-------------------------------------------------------------------------------
-- Anonymous visitors
-------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.posts', '42501', null, 'anon cannot read posts');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select is(public.username_available('newbie'), true, 'anon can check a free username');
select is(public.username_available('BOB'), false, 'username check is case-insensitive');
select is(public.username_available('no spaces'), false, 'invalid usernames are unavailable');

reset role;

-------------------------------------------------------------------------------
-- Logged in as alice
-------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok($$insert into public.posts (body) values ('alice post')$$, 'can create a post');
select is(
  (select author_id from public.posts where body = 'alice post'),
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'post author defaults to the current user');

select throws_ok(
  $$insert into public.posts (author_id, body) values ('bbbbbbbb-0000-0000-0000-000000000002', 'spoof')$$,
  '42501', null, 'cannot post as someone else');

select throws_ok($$insert into public.posts (body) values ('   ')$$,
  '23514', null, 'blank posts are rejected');

select is_empty(
  $$update public.posts set body = 'hacked' where body = 'bob post' returning id$$,
  'cannot edit another user''s post');

select is_empty(
  $$delete from public.posts where body = 'bob post' returning id$$,
  'cannot delete another user''s post');

select lives_ok(
  $$insert into public.comments (post_id, body)
    select id, 'nice' from public.posts where body = 'bob post'$$,
  'can comment on another user''s post');

select is_empty(
  $$delete from public.comments where body = 'bob comment' returning id$$,
  'cannot delete another user''s comment');

select lives_ok(
  $$update public.profiles set about_me = 'OG Kush fan' where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'can edit own about_me');

select throws_ok(
  $$update public.profiles set last_seen = now() - interval '1 year'$$,
  '42501', null, 'cannot write last_seen directly');

select is_empty(
  $$update public.profiles set about_me = 'pwned' where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning id$$,
  'cannot edit another user''s profile');

select lives_ok(
  $$insert into public.follows (followed_id) values ('bbbbbbbb-0000-0000-0000-000000000002')$$,
  'can follow someone');

select throws_ok(
  $$insert into public.follows (follower_id, followed_id)
    values ('cccccccc-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002')$$,
  '42501', null, 'cannot create a follow on behalf of someone else');

select throws_ok(
  $$insert into public.follows (followed_id) values ('aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23514', null, 'cannot follow yourself');

select results_eq(
  $$select body from public.feed() order by body$$,
  $$values ('alice post'), ('bob post')$$,
  'feed has own and followed posts but not unfollowed ones');

select results_eq(
  $$select count(*)::int from public.posts p join public.profiles a on a.id = p.author_id
    where p.body in ('alice post', 'bob post', 'carol post')$$,
  $$values (3)$$,
  'members can read all posts with authors (explore)');

reset role;

-------------------------------------------------------------------------------
-- Cascades
-------------------------------------------------------------------------------
delete from public.posts where body = 'bob post';
select is(
  (select count(*)::int from public.comments where body in ('bob comment', 'nice')), 0, 'deleting a post deletes its comments');

select * from finish();
rollback;
