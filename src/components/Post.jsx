import { memo } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import TimeAgo from './TimeAgo';
import Content from './Content';

export function commentLabel(count) {
  return count === 1 ? '1 comment' : `${count} comments`;
}

// Used for both posts (className "Post", rendered as a card) and comments.
// Layout is mobile-first: a compact author row, then full-width content.
export default memo(function Post({
  item, avatarSize = 40, className = 'Post', canEdit, onEdit, canDelete, onDelete, footer, readMoreTo,
}) {
  return (
    <article className={className}>
      <header className="Item-head">
        <Avatar user={item.author} size={avatarSize} />
        <div className="Item-meta">
          <div className="Item-byline">
            <Link to={'/user/' + item.author.username} className="Item-author">
              {item.author.username}
            </Link>
          </div>
          <span className="Item-time">
            <TimeAgo isoDate={item.created_at} />
            {item.updated_at && <span title={`Edited ${new Date(item.updated_at).toLocaleString()}`}> &middot; edited</span>}
          </span>
        </div>
        {canEdit &&
          <button type="button" className="IconButton" aria-label="Edit"
            title="Edit" onClick={() => onEdit(item)}>
            <PencilIcon />
          </button>
        }
        {canDelete &&
          <button type="button" className="IconButton IconButton-danger" aria-label="Delete"
            title="Delete" onClick={() => onDelete(item)}>
            <TrashIcon />
          </button>
        }
      </header>
      <Content body={item.body} imagePaths={item.image_paths} videoPath={item.video_path} readMoreTo={readMoreTo} />
      {footer && <footer className="Item-foot">{footer}</footer>}
    </article>
  );
});

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
