// Turns plain user text into safe render instructions: text and link segments,
// plus embeddable videos from an allow-list of providers. Nothing user-supplied is
// ever rendered as HTML; embeds only ever point at the providers' own player URLs.

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;
export const MAX_EMBEDS = 3;

export function splitLinks(text) {
  const segments = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const href = match[0].replace(TRAILING_PUNCTUATION, '');
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) });
    }
    segments.push({ type: 'link', href });
    last = match.index + href.length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', value: text.slice(last) });
  }
  return segments;
}

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'];
const YOUTUBE_ID = /^[\w-]{11}$/;

function youtube(url) {
  let id;
  if (url.hostname === 'youtu.be') {
    id = url.pathname.slice(1);
  }
  else if (YOUTUBE_HOSTS.includes(url.hostname)) {
    id = url.pathname === '/watch'
      ? url.searchParams.get('v')
      : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  }
  return id && YOUTUBE_ID.test(id)
    ? { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}`, aspect: 'wide' }
    : null;
}

function vimeo(url) {
  if (!['vimeo.com', 'www.vimeo.com'].includes(url.hostname)) return null;
  const id = url.pathname.match(/^\/(\d+)/)?.[1];
  return id ? { provider: 'vimeo', src: `https://player.vimeo.com/video/${id}`, aspect: 'wide' } : null;
}

function tiktok(url) {
  if (!['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname)) return null;
  const id = url.pathname.match(/^\/@[\w.-]+\/video\/(\d+)/)?.[1];
  return id ? { provider: 'tiktok', src: `https://www.tiktok.com/embed/v2/${id}`, aspect: 'tall' } : null;
}

function instagram(url) {
  if (!['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null;
  const match = url.pathname.match(/^\/(p|reel|tv)\/([\w-]+)/);
  return match
    ? { provider: 'instagram', src: `https://www.instagram.com/${match[1]}/${match[2]}/embed`, aspect: 'tall' }
    : null;
}

export function videoEmbed(href) {
  let url;
  try {
    url = new URL(href);
  }
  catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return youtube(url) || vimeo(url) || tiktok(url) || instagram(url);
}

// Unique video embeds for all links in the text, capped at MAX_EMBEDS.
export function videoEmbeds(text) {
  const seen = new Set();
  const embeds = [];
  for (const segment of splitLinks(text)) {
    if (segment.type !== 'link') continue;
    const embed = videoEmbed(segment.href);
    if (embed && !seen.has(embed.src)) {
      seen.add(embed.src);
      embeds.push(embed);
    }
  }
  return embeds.slice(0, MAX_EMBEDS);
}
