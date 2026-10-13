import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import Stack from 'react-bootstrap/Stack';
import Button from 'react-bootstrap/Button';
import Body from '../components/Body';
import Post from '../components/Post';
import Avatar from '../components/Avatar';
import TimeAgo from '../components/TimeAgo';
import Write from '../components/Write';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

function Comment({ comment, canDelete, onDelete }) {
  return (
    <Stack direction="horizontal" gap={3} className="Comment">
      <Avatar user={comment.author} size={32} />
      <div className="flex-grow-1">
        <p className="mb-1">
          <Link to={'/user/' + comment.author.username}>{comment.author.username}</Link>
          &nbsp;&mdash;&nbsp;
          <TimeAgo isoDate={comment.created_at} />:
        </p>
        <p className="PostBody">{comment.body}</p>
        {canDelete &&
          <Button variant="link" size="sm" className="text-danger p-0 mb-2"
            onClick={() => onDelete(comment)}>
            Delete
          </Button>
        }
      </div>
    </Stack>
  );
}

// Keyed on the URL param so navigating between posts starts from a clean state.
export default function PostPage() {
  const { id } = useParams();
  return <PostThread key={id} postId={Number(id)} />;
}

function PostThread({ postId }) {
  const [post, setPost] = useState(Number.isInteger(postId) ? undefined : null);
  const [comments, setComments] = useState();
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();
  const navigate = useNavigate();

  useEffect(() => {
    if (!Number.isInteger(postId)) {
      return;
    }
    let active = true;
    (async () => {
      const [postResult, commentsResult] = await Promise.all([
        api.getPost(postId), api.listComments(postId),
      ]);
      if (!active) return;
      setPost(postResult.error ? null : postResult.data);
      setComments(commentsResult.error ? null : commentsResult.data);
    })();
    return () => { active = false; };
  }, [api, postId]);

  const addComment = async (text) => {
    const { data, error } = await api.createComment(postId, text);
    if (!error) {
      setComments((current) => [...(current || []), data]);
      setPost((current) => ({ ...current, comment_count: current.comment_count + 1 }));
    }
    return { error };
  };

  const deleteComment = async (comment) => {
    if (!window.confirm('Delete this comment?')) return;
    const { error } = await api.deleteComment(comment.id);
    if (!error) {
      setComments((current) => current.filter((c) => c.id !== comment.id));
      setPost((current) => ({ ...current, comment_count: current.comment_count - 1 }));
    }
  };

  const deletePost = async () => {
    if (!window.confirm('Delete this post and all of its comments?')) return;
    const { error } = await api.deletePost(postId);
    if (!error) {
      flash('Post deleted.', 'success');
      navigate('/');
    }
  };

  return (
    <Body sidebar>
      {post === undefined ?
        <Spinner animation="border" />
      : post === null ?
        <p>Post not found.</p>
      :
        <>
          <Post post={post} showCommentLink={false}
            canDelete={post.author.id === user.id} onDelete={deletePost} />
          <h5 className="mt-3">
            {post.comment_count === 1 ? '1 comment' : `${post.comment_count} comments`}
          </h5>
          <div className="Comments">
            {comments === undefined ?
              <Spinner animation="border" size="sm" />
            : comments === null ?
              <p>Could not retrieve comments.</p>
            :
              comments.map((comment) =>
                <Comment key={comment.id} comment={comment}
                  canDelete={comment.author.id === user.id} onDelete={deleteComment} />
              )
            }
          </div>
          <Write placeholder="Add to the conversation..." submitLabel="Comment"
            onSubmit={addComment} autoFocus={false} />
        </>
      }
    </Body>
  );
}
