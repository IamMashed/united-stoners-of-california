// Entry point for the Cloudflare Worker that serves the built frontend.
// Beyond serving static assets it:
//  - sends www.unitedstoners.club to the bare domain, so every page has a single
//    canonical URL (and auth redirects match one origin);
//  - handles the contact form API (POST /api/contact).
import { handleContact } from './contact.js';

const CANONICAL_HOST = 'unitedstoners.club';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/contact') {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
