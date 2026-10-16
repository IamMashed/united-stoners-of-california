-- Pinned posts: admins can pin posts so they stay at the top of the home page.
-- pinned_at is null for normal posts; the pin button sets/clears it. The existing
-- "Only admins can edit posts" policy restricts who can update it, and set_updated_at
-- only fires on body changes, so pinning does not mark a post as edited.

alter table public.posts add column pinned_at timestamptz;

create index posts_pinned_at_idx on public.posts (pinned_at desc) where pinned_at is not null;

grant update (pinned_at) on public.posts to authenticated;
