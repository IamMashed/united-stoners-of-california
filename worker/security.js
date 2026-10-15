// HTTP security helpers shared by the Worker routes.

// Content Security Policy for the app: our own scripts only, data from Supabase, video
// players from the embed allow-list in src/lib/embeds.js. User text is never rendered
// as HTML, so this is defence in depth against XSS and clickjacking.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com https://www.instagram.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// Adds the security headers to a response. The CSP is skipped on localhost, where
// Vite's dev server injects inline scripts for hot reload.
export function withSecurityHeaders(response, url) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(HEADERS)) secured.headers.set(name, value);
  if (!LOCAL_HOSTS.has(url.hostname)) secured.headers.set('Content-Security-Policy', CSP);
  return secured;
}

// True when the request comes from a page on another site (or an unparsable Origin,
// e.g. "null" from sandboxed frames). Requests without Origin (curl, mail apps) pass.
export function isForeignOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  }
  catch {
    return true;
  }
}
