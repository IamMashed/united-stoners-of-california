// Entry point for the Cloudflare Worker that serves the built frontend.
// Only job beyond serving static assets: send www.unitedstoners.club to the bare domain
// so every page has a single canonical URL (and auth redirects match one origin).
const CANONICAL_HOST = 'unitedstoners.club';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
