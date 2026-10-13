import { memo } from 'react';
import Stack from 'react-bootstrap/Stack';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import TimeAgo from './TimeAgo';
import Content from './Content';

export function commentLabel(count) {
  return count === 1 ? '1 comment' : `${count} comments`;
}

// Used for both posts and comments (`item.author`, `item.body`, `item.image_paths`).
export default memo(function Post({ item, avatarSize = 48, className = 'Post', canDelete, onDelete, footer }) {
  return (
    <Stack direction="horizontal" gap={3} className={className}>
      <Avatar user={item.author} size={avatarSize} />
      <div className="flex-grow-1 min-w-0">
        <p className="mb-1">
          <Link to={'/user/' + item.author.username}>{item.author.username}</Link>
          &nbsp;&mdash;&nbsp;
          <TimeAgo isoDate={item.created_at} />:
        </p>
        <Content body={item.body} imagePaths={item.image_paths} />
        <p className="PostActions">
          {footer}
          {canDelete &&
            <Button variant="link" size="sm" className="text-danger" onClick={() => onDelete(item)}>
              Delete
            </Button>
          }
        </p>
      </div>
    </Stack>
  );
});
