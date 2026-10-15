// POST /api/contact: validates a contact form submission, stores it in
// public.contact_messages and emails it to the site owner via Resend.
//
// Env (see wrangler.jsonc and `npm run db -- worker-secrets <env>`):
//   SUPABASE_URL          project URL (var)
//   SUPABASE_SECRET_KEY   secret key; the table has no client insert grant (secret)
//   CONTACT_TO            where messages are emailed (secret, kept out of the public repo)
//   RESEND_API_KEY        optional until email is set up; messages are still stored (secret)
//   CONTACT_FROM          sender address on a Resend-verified domain (var)
//   CONTACT_LIMITER       rate limit binding, keyed by client IP (optional)
import { validateContact } from '../src/lib/contact.js';

const json = (body, status = 200) => Response.json(body, { status });

export async function handleContact(request, env, fetchImpl = fetch) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  // Only our own pages may post here (blocks other sites from using the form).
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ error: 'Forbidden' }, 403);
  }
  if (env.CONTACT_LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.CONTACT_LIMITER.limit({ key: `contact:${ip}` });
    if (!success) {
      return json({ error: 'Too many messages. Please wait a minute and try again.' }, 429);
    }
  }

  let input;
  try {
    input = await request.json();
  }
  catch {
    return json({ error: 'Invalid request' }, 400);
  }
  // Honeypot: a field hidden from people that bots tend to fill in. Pretend it worked.
  if (input?.website) {
    return json({ ok: true });
  }
  const { values, errors } = validateContact(input);
  if (Object.keys(errors).length) {
    return json({ errors }, 400);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    console.error('contact: SUPABASE_URL / SUPABASE_SECRET_KEY not configured');
    return json({ error: 'The contact form is not available right now.' }, 503);
  }

  const supabase = (path, init = {}) => fetchImpl(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY, 'Content-Type': 'application/json', ...init.headers },
  });

  const sender = await senderProfile(request, supabase);
  const insert = await supabase('/rest/v1/contact_messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...values, user_id: sender?.id ?? null }),
  });
  if (!insert.ok) {
    console.error('contact: insert failed', insert.status, await insert.text());
    return json({ error: 'Could not send your message. Please try again later.' }, 500);
  }
  const [row] = await insert.json();

  // Stored is good enough for the sender; email problems are only logged.
  if (env.RESEND_API_KEY && env.CONTACT_TO) {
    const sent = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(notificationEmail(row, sender, env)),
    });
    if (sent.ok) {
      await supabase(`/rest/v1/contact_messages?id=eq.${row.id}`, {
        method: 'PATCH', body: JSON.stringify({ emailed_at: new Date().toISOString() }),
      });
    }
    else {
      console.error('contact: email failed', sent.status, await sent.text());
    }
  }
  return json({ ok: true });
}

// The logged-in member who sent the message, verified from their access token, or null.
async function senderProfile(request, supabase) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const userResponse = await supabase('/auth/v1/user', { headers: { Authorization: auth } });
  if (!userResponse.ok) return null;
  const user = await userResponse.json();
  const profileResponse = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,username`);
  const [profile] = profileResponse.ok ? await profileResponse.json() : [];
  return profile ? { ...profile, email: user.email } : { id: user.id, username: null, email: user.email };
}

export function notificationEmail(row, sender, env) {
  const from = row.email || row.phone;
  const lines = [
    row.message,
    '',
    '---',
    `Email: ${row.email || '-'}`,
    `Phone: ${row.phone || '-'}`,
    sender ? `Member: ${sender.username || '?'} (${sender.email})` : 'Member: not logged in',
    `Sent: ${row.created_at}`,
    `Message #${row.id}`,
  ];
  return {
    from: env.CONTACT_FROM || 'United Stoners of California <onboarding@resend.dev>',
    to: [env.CONTACT_TO],
    ...(row.email ? { reply_to: row.email } : {}),
    subject: `Contact form: ${from}`,
    text: lines.join('\n'),
  };
}
