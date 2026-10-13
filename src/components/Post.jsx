import { memo } from 'react';
import Stack from 'react-bootstrap/Stack';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import TimeAgo from './TimeAgo';

function commentLabel(count) {
  return count === 1 ? '1 comment' : `${count} comments`;
}

export default memo(function Post({ post, canDelete, onDelete, showCommentLink = true }) {
  return (
    <Stack direction="horizontal" gap={3} className="Post">
      <Avatar user={post.author} size={48} />
      <div className="flex-grow-1">
        <p className="mb-1">
          <Link to={'/user/' + post.author.username}>{post.author.username}</Link>
          &nbsp;&mdash;&nbsp;
          <TimeAgo isoDate={post.created_at} />:
        </p>
        <p className="PostBody">{post.body}</p>
        <p className="PostActions">
          {showCommentLink &&
            <Link to={'/post/' + post.id}>{commentLabel(post.comment_count)}</Link>
          }
          {canDelete &&
            <Button variant="link" size="sm" className="text-danger"
              onClick={() => onDelete(post)}>
              Delete
            </Button>
          }
        </p>
      </div>
    </Stack>
  );
});
