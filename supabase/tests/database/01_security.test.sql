-- Run with: npm run test:db
-- Verifies the signup trigger, RLS policies and column grants that protect the
-- PostgREST API. Everything runs in a transaction and is rolled back.
begin;
select plan(87);

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
-- Established members (new accounts get tighter comment limits, tested below).
update public.profiles set created_at = now() - interval '30 days'
  where id in ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003');

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

select lives_ok(
  $$update public.profiles set is_admin = true where id = 'eeeeeeee-0000-0000-0000-000000000005'$$,
  'there can be more than one admin');

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

select lives_ok(
  $$insert into public.comments (post_id, body, video_path)
    select id, '', 'bbbbbbbb-0000-0000-0000-000000000002/clip.mp4' from public.posts where body = 'admin post'$$,
  'members can comment with just an uploaded video');
select throws_ok(
  $$insert into public.comments (post_id, body, video_path)
    select id, 'and https://youtu.be/dQw4w9WgXcQ', 'bbbbbbbb-0000-0000-0000-000000000002/clip2.mp4'
    from public.posts where body = 'admin post'$$,
  '23514', null, 'an uploaded video and a video link cannot be combined');
select throws_ok(
  $$insert into public.comments (post_id, body, video_path)
    select id, 'stolen', 'cccccccc-0000-0000-0000-000000000003/clip.mp4' from public.posts where body = 'admin post'$$,
  '42501', null, 'cannot attach a video from another user''s folder');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('videos', 'bbbbbbbb-0000-0000-0000-000000000002/clip.mp4')$$,
  'members can upload videos into their own folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('videos', 'cccccccc-0000-0000-0000-000000000003/clip.mp4')$$,
  '42501', null, 'members cannot upload videos into someone else''s folder');
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

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}', true);
select isnt_empty($$update public.posts set body = 'edited by the second admin' where body = 'edited' returning id$$,
  'a second admin can edit another admin''s post and keep its photos');
select throws_ok($$update public.posts set image_paths = array['bbbbbbbb-0000-0000-0000-000000000002/x.jpg']
  where body = 'edited by the second admin'$$,
  '42501', null, 'admins cannot attach photos from a member''s folder');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
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
-- New-post email preferences
-------------------------------------------------------------------------------
select is((select count(*)::int from public.email_preferences
           where user_id in ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003')
             and notify_new_posts),
  2, 'new members are opted in to new-post emails');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq($$select count(*)::int from public.email_preferences$$, $$values (1)$$,
  'members only see their own email preferences');
select throws_ok($$select unsubscribe_token from public.email_preferences$$,
  '42501', null, 'members cannot read unsubscribe tokens');
select isnt_empty($$update public.email_preferences set notify_new_posts = false
  where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' returning user_id$$,
  'members can turn new-post emails off');
select is_empty($$update public.email_preferences set notify_new_posts = false
  where user_id = 'cccccccc-0000-0000-0000-000000000003' returning user_id$$,
  'members cannot change someone else''s email preferences');
select throws_ok($$select * from public.new_post_recipients('aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'members cannot list email recipients');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$update public.posts set notified_at = null$$,
  '42501', null, 'not even the superuser can reset notified_at from the browser');
reset role;

update auth.users set email_confirmed_at = now()
  where id in ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003');
select results_eq(
  $$select username from public.new_post_recipients('aaaaaaaa-0000-0000-0000-000000000001')
    where username in ('bob', 'carol', 'alice') order by username$$,
  $$values ('carol'::text)$$,
  'recipients are confirmed, opted-in members other than the author');

-------------------------------------------------------------------------------
-- Orphaned photo cleanup (Worker cron with the secret key only)
-------------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, created_at)
  values ('media', 'bbbbbbbb-0000-0000-0000-000000000002/stray.png', now() - interval '2 days'),
         ('media', 'bbbbbbbb-0000-0000-0000-000000000002/fresh.png', now());
select results_eq(
  $$select name from public.orphaned_media() where name like 'bbbbbbbb-0000-0000-0000-000000000002/%'$$,
  $$values ('bbbbbbbb-0000-0000-0000-000000000002/stray.png'::text)$$,
  'old unused photos are listed for cleanup, fresh uploads are not');
select is_empty(
  $$select * from public.orphaned_media(interval '0 seconds') o
    where o.name in (select unnest(image_paths) from public.posts union all select unnest(image_paths) from public.comments
                     union all select video_path from public.posts union all select video_path from public.comments)$$,
  'photos used by a post or comment are never listed');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select * from public.orphaned_media()$$,
  '42501', null, 'not even admins can list orphaned photos from the browser');
reset role;

-------------------------------------------------------------------------------
-- Rate limits (frank = a day-old account, grace = an established member)
-------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('ffffffff-0000-0000-0000-000000000006', 'frank@test.local', '{"username":"frank"}'),
  ('99999999-0000-0000-0000-000000000009', 'grace@test.local', '{"username":"grace"}');
update public.profiles set created_at = now() - interval '30 days' where id = '99999999-0000-0000-0000-000000000009';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-0000-0000-000000000006","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.comments (post_id, body) select id, 'frank ' || n from public.posts, generate_series(1, 3) n
    where body = 'admin post'$$,
  'new members can post a few comments in a row');
select throws_ok(
  $$insert into public.comments (post_id, body) select id, 'frank 4' from public.posts where body = 'admin post'$$,
  'PT429', null, 'new members are limited to 3 comments a minute');
delete from public.comments where author_id = 'ffffffff-0000-0000-0000-000000000006';
select throws_ok(
  $$insert into public.comments (post_id, body) select id, 'frank 5' from public.posts where body = 'admin post'$$,
  'PT429', null, 'deleting comments does not reset the limit');
select throws_ok($$select public.take_rate_limit('ffffffff-0000-0000-0000-000000000006', 'comment', '{}')$$,
  '42501', null, 'members cannot write to the rate limit log');
select throws_ok($$select * from public.rate_limit_events$$,
  '42501', null, 'members cannot read the rate limit log');

select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000009","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.comments (post_id, body) select id, 'grace ' || n from public.posts, generate_series(1, 5) n
    where body = 'admin post'$$,
  'established members can post 5 comments a minute');
select throws_ok(
  $$insert into public.comments (post_id, body) select id, 'grace 6' from public.posts where body = 'admin post'$$,
  'PT429', null, 'established members are limited to 5 comments a minute');
reset role;
delete from public.rate_limit_events where user_id = '99999999-0000-0000-0000-000000000009';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.comments (post_id, body) select id, '  GRACE 1 ' from public.posts where body = 'admin post'$$,
  'PT429', null, 'the same comment twice within 10 minutes is refused');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.comments (post_id, body) select id, 'admin ' || n from public.posts, generate_series(1, 12) n
    where body = 'admin post'$$,
  'admins are not rate limited');
reset role;

insert into storage.objects (bucket_id, name, created_at)
  select 'media', 'ffffffff-0000-0000-0000-000000000006/' || n || '.jpg', now() from generate_series(1, 30) n;
insert into storage.objects (bucket_id, name, created_at, metadata)
  values ('videos', '99999999-0000-0000-0000-000000000009/big.mp4', now() - interval '2 days', '{"size": 314572800}');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'ffffffff-0000-0000-0000-000000000006/31.jpg')$$,
  '42501', null, 'members can upload at most 30 files an hour');
select set_config('request.jwt.claims',
  '{"sub":"99999999-0000-0000-0000-000000000009","role":"authenticated"}', true);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', '99999999-0000-0000-0000-000000000009/one.jpg')$$,
  '42501', null, 'members can store at most 300 MB');
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('media', 'cccccccc-0000-0000-0000-000000000003/ok.jpg')$$,
  'members under the limits can upload');
reset role;

select lives_ok(
  $$insert into public.contact_messages (user_id, message, email)
    select 'cccccccc-0000-0000-0000-000000000003', 'msg ' || n, 'c@test.local' from generate_series(1, 5) n$$,
  'members can send 5 contact messages a day');
select throws_ok(
  $$insert into public.contact_messages (user_id, message, email)
    values ('cccccccc-0000-0000-0000-000000000003', 'msg 6', 'c@test.local')$$,
  'PT429', null, 'members are limited to 5 contact messages a day');

-------------------------------------------------------------------------------
-- Cascades
-------------------------------------------------------------------------------
delete from public.posts where body = 'admin post';
select is(
  (select count(*)::int from public.comments where author_id = 'bbbbbbbb-0000-0000-0000-000000000002'), 0,
  'deleting a post deletes its comments');

select * from finish();
rollback;
