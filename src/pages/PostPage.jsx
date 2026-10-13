import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import Body from '../components/Body';
import Post, { commentLabel } from '../components/Post';
import Composer from '../components/Composer';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

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
  const location = useLocation();
  const isAdmin = !!user?.is_admin;

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

  const addComment = async (values) => {
    const { data, error } = await api.createComment(postId, values);
    if (!error) {
      setComments((current) => [...(current || []), data]);
      setPost((current) => ({ ...current, comment_count: current.comment_count + 1 }));
    }
    return { error };
  };

  const deleteComment = async (comment) => {
    if (!window.confirm('Delete this comment?')) return;
    const { error } = await api.deleteComment(comment);
    if (!error) {
      setComments((current) => current.filter((c) => c.id !== comment.id));
      setPost((current) => ({ ...current, comment_count: current.comment_count - 1 }));
    }
  };

  const deletePost = async () => {
    if (!window.confirm('Delete this post and all of its comments?')) return;
    const { error } = await api.deletePost(post);
    if (!error) {
      flash('Post deleted.', 'success');
      navigate('/');
    }
  };

  return (
    <Body>
      {post === undefined ?
        <Spinner animation="border" />
      : post === null ?
        <p>Post not found.</p>
      :
        <>
          <Post item={post} canDelete={isAdmin} onDelete={deletePost} />
          <h5 className="mt-3">{commentLabel(post.comment_count)}</h5>
          <div className="Comments">
            {comments === undefined ?
              <Spinner animation="border" size="sm" />
            : comments === null ?
              <p>Could not retrieve comments.</p>
            :
              comments.map((comment) =>
                <Post key={comment.id} item={comment} avatarSize={32} className="Comment"
                  canDelete={!!user && (isAdmin || comment.author.id === user.id)}
                  onDelete={deleteComment} />
              )
            }
          </div>
          {user ?
            <Composer placeholder="Add to the conversation... (links and YouTube/TikTok/Instagram videos welcome)"
              submitLabel="Comment" onSubmit={addComment} autoFocus={false} />
          : user === null &&
            <p className="JoinPrompt">
              <Link to="/login" state={{ next: location.pathname }}>Log in</Link> or{' '}
              <Link to="/register">join</Link> to leave a comment.
            </p>
          }
        </>
      }
    </Body>
  );
}
