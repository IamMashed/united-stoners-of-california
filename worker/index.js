// Entry point for the Cloudflare Worker that serves the built frontend.
// Beyond serving static assets it:
//  - sends www.unitedstoners.club to the bare domain, so every page has a single
//    canonical URL (and auth redirects match one origin);
//  - handles the contact form API (POST /api/contact);
//  - sends "new post" emails and handles unsubscribe links (worker/notify.js);
//  - once a day, deletes photos nothing uses anymore (worker/cleanup.js).
import { handleContact } from './contact.js';
import { handleNotifyNewPost, handleUnsubscribe } from './notify.js';
import { cleanupOrphanedMedia } from './cleanup.js';

const CANONICAL_HOST = 'unitedstoners.club';

const API_ROUTES = {
  '/api/contact': handleContact,
  '/api/notify-new-post': handleNotifyNewPost,
  '/api/unsubscribe': handleUnsubscribe,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    const api = API_ROUTES[url.pathname];
    if (api) {
      // An unexpected failure (e.g. Supabase unreachable) becomes a JSON error the
      // page can show, instead of an unhandled exception.
      try {
        return await api(request, env);
      }
      catch (err) {
        console.error(`${url.pathname} failed`, err);
        return Response.json({ error: 'Something went wrong on our side. Please try again later.' }, { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  },

  // Cron trigger (see "triggers" in wrangler.jsonc).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanupOrphanedMedia(env));
  },
};
