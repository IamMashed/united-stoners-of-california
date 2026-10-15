// "New post" notification emails.
//
//   POST /api/notify-new-post { postId }   superuser only (their access token); emails every
//                                          opted-in member once per post via Resend.
//   GET|POST /api/unsubscribe?token=…      one-click unsubscribe link from those emails
//                                          (POST = RFC 8058 one-click from the mail app).
//
// Env: SUPABASE_URL, SUPABASE_SECRET_KEY, RESEND_API_KEY, CONTACT_FROM (sender), SITE_URL.
import { stripPhotoMarkers } from '../src/lib/layout.js';
import { videoEmbed } from '../src/lib/embeds.js';
import { isForeignOrigin } from './security.js';

const json = (body, status = 200) => Response.json(body, { status });
const BATCH = 100;  // Resend batch API limit
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supabaseClient(env, fetchImpl) {
  return (path, init = {}) => fetchImpl(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...init.headers },
  });
}

export async function handleNotifyNewPost(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (isForeignOrigin(request)) return json({ error: 'Forbidden' }, 403);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.RESEND_API_KEY) {
    return json({ error: 'Notifications are not configured.' }, 503);
  }
  const supabase = supabaseClient(env, fetchImpl);

  if (!(await isSuperuser(request, supabase))) return json({ error: 'Only the superuser can notify members.' }, 403);

  const postId = Number((await request.json().catch(() => ({}))).postId);
  if (!Number.isInteger(postId) || postId <= 0) return json({ error: 'postId is required' }, 400);

  // Claim the post atomically: only the first request for a post gets a row back.
  const claim = await supabase(`/rest/v1/posts?id=eq.${postId}&notified_at=is.null&select=id,body,author_id`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ notified_at: new Date().toISOString() }),
  });
  const [post] = claim.ok ? await claim.json() : [];
  if (!post) return json({ error: 'Post not found or members were already notified.' }, 409);

  const recipientsResponse = await supabase('/rest/v1/rpc/new_post_recipients', {
    method: 'POST', body: JSON.stringify({ author: post.author_id }),
  });
  if (!recipientsResponse.ok) {
    await releaseClaim(supabase, postId);
    console.error('notify: recipients failed', recipientsResponse.status, await recipientsResponse.text());
    return json({ error: 'Could not load the member list.' }, 500);
  }
  const recipients = await recipientsResponse.json();

  const summary = postSummary(post.body);
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH).map((r) => newPostEmail(post, summary, r, env));
    const response = await fetchImpl('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (response.ok) sent += batch.length;
    else {
      failed += batch.length;
      console.error('notify: batch failed', response.status, await response.text());
    }
  }
  // Nothing went out: let the superuser try again later.
  if (recipients.length && sent === 0) await releaseClaim(supabase, postId);
  return json({ recipients: recipients.length, sent, failed }, failed && !sent ? 502 : 200);
}

export async function handleUnsubscribe(request, env, fetchImpl = fetch) {
  const token = new URL(request.url).searchParams.get('token') || '';
  let ok = false;
  if (UUID.test(token) && env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) {
    const response = await supabaseClient(env, fetchImpl)('/rest/v1/rpc/unsubscribe_new_posts', {
      method: 'POST', body: JSON.stringify({ token }),
    });
    ok = response.ok && (await response.json()) === true;
  }
  if (request.method === 'POST') return new Response(null, { status: ok ? 200 : 400 });
  const site = env.SITE_URL || new URL(request.url).origin;
  const message = ok
    ? 'You won\'t get emails about new posts anymore. You can turn them back on any time under Edit profile.'
    : 'This unsubscribe link is invalid or has expired. You can change email settings under Edit profile.';
  return new Response(page(ok ? 'Unsubscribed' : 'Link not valid', message, site), {
    status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function isSuperuser(request, supabase) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const userResponse = await supabase('/auth/v1/user', { headers: { Authorization: auth } });
  if (!userResponse.ok) return false;
  const user = await userResponse.json();
  const profileResponse = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=is_admin`);
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  return profile?.is_admin === true;
}

function releaseClaim(supabase, postId) {
  return supabase(`/rest/v1/posts?id=eq.${postId}`, { method: 'PATCH', body: JSON.stringify({ notified_at: null }) });
}

// Title = first line of text, excerpt = the following text, both without photo markers
// or bare video links.
export function postSummary(body) {
  const lines = stripPhotoMarkers(body || '').split('\n')
    .filter((line) => !(/^\S+$/.test(line.trim()) && videoEmbed(line.trim())));
  const text = lines.join('\n').trim();
  const [first = '', ...rest] = text.split('\n');
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  return {
    title: clip(first.trim() || 'New post', 90),
    excerpt: clip(rest.join(' ').replace(/\s+/g, ' ').trim(), 280),
  };
}

export function newPostEmail(post, summary, recipient, env) {
  const site = env.SITE_URL || 'https://unitedstoners.club';
  const link = `${site}/post/${post.id}`;
  const unsubscribe = `${site}/api/unsubscribe?token=${recipient.unsubscribe_token}`;
  const text = [
    `Hey ${recipient.username}, a new post was just published on United Stoners of California:`,
    '',
    summary.title,
    summary.excerpt,
    '',
    `Read it here: ${link}`,
    '',
    '---',
    `Don't want these emails? Unsubscribe: ${unsubscribe}`,
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1d2420">
  <p style="color:#2f6b3a;font-weight:700;margin:0 0 16px">🌿 United Stoners of California</p>
  <p>Hey ${escapeHtml(recipient.username)}, a new post was just published:</p>
  <h2 style="font-size:20px;margin:16px 0 8px">${escapeHtml(summary.title)}</h2>
  ${summary.excerpt ? `<p style="color:#444">${escapeHtml(summary.excerpt)}</p>` : ''}
  <p style="margin:24px 0"><a href="${link}" style="background:#2f6b3a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Read the post</a></p>
  <p style="font-size:12px;color:#888;margin-top:32px">You get this because you're a member of unitedstoners.club.
  <a href="${unsubscribe}" style="color:#888">Unsubscribe</a> from new-post emails.</p>
</div>`;
  return {
    from: env.CONTACT_FROM || 'United Stoners of California <no-reply@unitedstoners.club>',
    to: [recipient.email],
    subject: `New post: ${summary.title}`,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribe}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(title, message, site) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · United Stoners of California</title>
<link rel="icon" href="/favicon.svg"></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f5f1;margin:0;padding:24px">
<div style="max-width:460px;margin:40px auto;background:#fff;border:1px solid #e3e8e1;border-radius:14px;padding:24px">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p>${message}</p>
<p><a href="${site}/" style="color:#2f6b3a;font-weight:600">Back to United Stoners</a></p></div></body></html>`;
}
