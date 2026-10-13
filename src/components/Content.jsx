import { useMemo } from 'react';
import Ratio from 'react-bootstrap/Ratio';
import { displayUrl, splitLinks, videoEmbeds } from '../lib/embeds';
import { Link } from 'react-router-dom';
import { useApi } from '../contexts/ApiProvider';

const LONG_CHARS = 500;
const LONG_LINES = 8;

export function isLongText(text) {
  return !!text && (text.length > LONG_CHARS || text.split('\n').length > LONG_LINES);
}

// Renders a post/comment body: plain text with clickable links, uploaded images,
// and embedded players for YouTube / Vimeo / TikTok / Instagram links.
// With `readMoreTo`, long text is clamped to a few lines with a "Read more" link.
export default function Content({ body, imagePaths = [], readMoreTo }) {
  const api = useApi();
  const segments = useMemo(() => splitLinks(body || ''), [body]);
  const embeds = useMemo(() => videoEmbeds(body || ''), [body]);
  const clamped = !!readMoreTo && isLongText(body);

  return (
    <div className="Content-body">
      {body &&
        <p className={clamped ? 'PostBody PostBody-clamped' : 'PostBody'}>
          {segments.map((s, i) => s.type === 'link'
            ? <a key={i} href={s.href} target="_blank" rel="nofollow noopener noreferrer ugc" title={s.href}>{displayUrl(s.href)}</a>
            : <span key={i}>{s.value}</span>
          )}
        </p>
      }
      {clamped &&
        <Link to={readMoreTo} className="ReadMore">Read more</Link>
      }
      {imagePaths.length > 0 &&
        <div className="ImageGallery">
          {imagePaths.map((path, i) => {
            const url = api.mediaUrl(path);
            return (
              <a key={path} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Photo ${i + 1}`} loading="lazy" />
              </a>
            );
          })}
        </div>
      }
      {embeds.map((embed) => embed.aspect === 'wide' ?
        <Ratio key={embed.src} aspectRatio="16x9" className="VideoEmbed">
          <EmbedFrame embed={embed} />
        </Ratio>
      :
        <div key={embed.src} className="VideoEmbed VideoEmbed-tall">
          <EmbedFrame embed={embed} />
        </div>
      )}
    </div>
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
