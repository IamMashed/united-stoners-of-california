import { useMemo } from 'react';
import Ratio from 'react-bootstrap/Ratio';
import { splitLinks, videoEmbeds } from '../lib/embeds';
import { useApi } from '../contexts/ApiProvider';

// Renders a post/comment body: plain text with clickable links, uploaded images,
// and embedded players for YouTube / Vimeo / TikTok / Instagram links.
export default function Content({ body, imagePaths = [] }) {
  const api = useApi();
  const segments = useMemo(() => splitLinks(body || ''), [body]);
  const embeds = useMemo(() => videoEmbeds(body || ''), [body]);

  return (
    <div className="Content-body">
      {body &&
        <p className="PostBody">
          {segments.map((s, i) => s.type === 'link'
            ? <a key={i} href={s.href} target="_blank" rel="nofollow noopener noreferrer ugc">{s.href}</a>
            : <span key={i}>{s.value}</span>
          )}
        </p>
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
