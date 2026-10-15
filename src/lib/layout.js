// Inline photo placement for post/comment bodies. A line containing only
// "[photo N]" (1-based, case-insensitive) shows attached photo N at that spot.
// Photos that are not placed (or markers pointing at missing photos) fall back
// to the gallery after the text, so bodies without markers render as before.

const MARKER = /^\s*\[photo\s+(\d+)\]\s*$/i;

// Returns { blocks, unplaced }: blocks are { type: 'text', value } or
// { type: 'image', index } (0-based) in reading order; unplaced lists the photo
// indexes that still belong in the gallery.
export function layoutBody(body, imageCount) {
  const blocks = [];
  const placed = new Set();
  let text = [];
  const flush = () => {
    const value = text.join('\n').replace(/^\n+|\n+$/g, '');
    if (value.trim()) blocks.push({ type: 'text', value });
    text = [];
  };
  for (const line of (body || '').split('\n')) {
    const match = line.match(MARKER);
    const index = match ? Number(match[1]) - 1 : -1;
    if (match && index >= 0 && index < imageCount && !placed.has(index)) {
      flush();
      blocks.push({ type: 'image', index });
      placed.add(index);
    }
    else if (!match) {
      text.push(line);
    }
    // Markers for missing or already-placed photos are dropped silently.
  }
  flush();
  const unplaced = [...Array(imageCount).keys()].filter((i) => !placed.has(i));
  return { blocks, unplaced };
}

// The body without any photo markers (used for the clamped preview on the feed).
export function stripPhotoMarkers(body) {
  return (body || '').split('\n').filter((line) => !MARKER.test(line)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}
