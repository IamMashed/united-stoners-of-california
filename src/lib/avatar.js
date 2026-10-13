const SIZEABLE_HOSTS = ['www.gravatar.com', 'gravatar.com', 'avatars.githubusercontent.com'];

// Returns an avatar URL sized for display. Gravatar and GitHub accept an `s` param;
// other providers (e.g. Google) are returned unchanged and sized by CSS.
export function avatarUrl(url, size) {
  if (!url) {
    return `https://www.gravatar.com/avatar/?d=identicon&s=${size}`;
  }
  try {
    const parsed = new URL(url);
    if (SIZEABLE_HOSTS.includes(parsed.hostname)) {
      parsed.searchParams.set('s', String(size));
    }
    return parsed.toString();
  }
  catch {
    return url;
  }
}
