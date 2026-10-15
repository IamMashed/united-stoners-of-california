import { useMemo } from 'react';
import Ratio from 'react-bootstrap/Ratio';
import { displayUrl, splitLinks, videoEmbed, videoEmbeds } from '../lib/embeds';
import { Link } from 'react-router-dom';
import { useApi } from '../contexts/ApiProvider';
import { layoutBody, stripPhotoMarkers } from '../lib/layout';

const LONG_CHARS = 500;
const LONG_LINES = 8;

export function isLongText(text) {
  return !!text && (text.length > LONG_CHARS || text.split('\n').length > LONG_LINES);
}

// Renders a post/comment body: embedded players for YouTube / Vimeo / TikTok / Instagram
// links first, then plain text with clickable links and uploaded photos. A line with only
// "[photo N]" places photo N between paragraphs (see lib/layout.js); other photos follow
// the text as a gallery.
//
// With `readMoreTo` (the feed preview) only the top media is shown: the video(s) and a
// photo placed above the first paragraph. Long text is clamped, and a "Read more" link
// appears whenever the full post has more to see (text or photos).
export default function Content({ body, imagePaths = [], readMoreTo }) {
  const api = useApi();
  const embeds = useMemo(() => videoEmbeds(body || ''), [body]);
  // A line that is just a video link is replaced by its player at the top.
  const text = useMemo(() => (body || '').split('\n')
    .filter((line) => !(line.trim() && /^\S+$/.test(line.trim()) && videoEmbed(line.trim())))
    .join('\n'), [body]);
  const layout = useMemo(() => layoutBody(text, imagePaths.length), [text, imagePaths.length]);
  const photo = (index, key) =>
    <figure key={key} className="InlinePhoto">
      <Photo url={api.mediaUrl(imagePaths[index])} number={index + 1} />
    </figure>;

  const videos = embeds.map((embed) => embed.aspect === 'wide' ?
    <Ratio key={embed.src} aspectRatio="16x9" className="VideoEmbed">
      <EmbedFrame embed={embed} />
    </Ratio>
  :
    <div key={embed.src} className="VideoEmbed VideoEmbed-tall">
      <EmbedFrame embed={embed} />
    </div>
  );

  if (readMoreTo) {
    const preview = previewOf(layout, stripPhotoMarkers(text), embeds.length, imagePaths.length);
    return (
      <div className="Content-body">
        {videos}
        {preview.cover !== null && photo(preview.cover, 'cover')}
        {preview.text && <TextBlock text={preview.text} clamped={preview.clamped} />}
        {preview.more && <Link to={readMoreTo} className="ReadMore">Read more</Link>}
      </div>
    );
  }

  return (
    <div className="Content-body">
      {videos}
      {layout.blocks.map((block, i) => block.type === 'text'
        ? <TextBlock key={i} text={block.value} />
        : photo(block.index, i)
      )}
      {layout.unplaced.length > 0 &&
        <div className="ImageGallery">
          {layout.unplaced.map((i) =>
            <Photo key={imagePaths[i]} url={api.mediaUrl(imagePaths[i])} number={i + 1} />
          )}
        </div>
      }
    </div>
  );
}

// What the feed shows for a post: the cover photo (one placed above the first
// paragraph, or the first photo of a post with nothing else to show), the text
// (clamped when long) and whether there is more on the full post.
function previewOf(layout, text, videoCount, imageCount) {
  let cover = layout.blocks[0]?.type === 'image' ? layout.blocks[0].index : null;
  if (cover === null && !text && !videoCount && imageCount) cover = 0;
  const clamped = isLongText(text);
  const hiddenPhotos = imageCount - (cover === null ? 0 : 1);
  return { cover, text, clamped, more: clamped || hiddenPhotos > 0 };
}

function TextBlock({ text, clamped = false }) {
  const segments = useMemo(() => splitLinks(text), [text]);
  return (
    <p className={clamped ? 'PostBody PostBody-clamped' : 'PostBody'}>
      {segments.map((s, i) => s.type === 'link'
        ? <a key={i} href={s.href} target="_blank" rel="nofollow noopener noreferrer ugc" title={s.href}>{displayUrl(s.href)}</a>
        : <span key={i}>{s.value}</span>
      )}
    </p>
  );
}

function Photo({ url, number }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt={`Photo ${number}`} loading="lazy" />
    </a>
  );
}

function EmbedFrame({ embed }) {
  return (
    <iframe
      src={embed.src}
      title={`${embed.provider} video`}
      loading="lazy"
      allow="encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    />
  );
}
