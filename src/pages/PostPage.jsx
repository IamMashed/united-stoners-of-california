import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import Body from '../components/Body';
import Post, { commentLabel } from '../components/Post';
import Composer, { POST_TIP } from '../components/Composer';
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
  const [editing, setEditing] = useState(false);
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

  const savePost = async (values) => {
    const { data, error } = await api.updatePost(post, values);
    if (!error) {
      setPost((current) => ({ ...data, comment_count: current.comment_count }));
      setEditing(false);
      flash('Post updated.', 'success');
    }
    return { error };
  };

  const togglePin = async () => {
    const pinning = !post.pinned_at;
    const { data, error } = await api.setPostPinned(post, pinning);
    if (!error) {
      setPost((current) => ({ ...current, pinned_at: data.pinned_at }));
      flash(pinning ? 'Post pinned to the top.' : 'Post unpinned.', 'success');
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
        <div className="Loading"><Spinner animation="border" variant="success" /></div>
      : post === null ?
        <p className="Empty">Post not found.</p>
      :
        <>
          <Link to="/" className="BackLink">&larr; All posts</Link>
          {editing ?
            <Composer placeholder="Edit the post…" submitLabel="Save" autoFocus tip={POST_TIP}
              initialBody={post.body} initialPaths={post.image_paths} initialVideo={post.video_path}
              onSubmit={savePost} onCancel={() => setEditing(false)} />
          :
            <Post item={post} className="Card Post Post-full"
              canEdit={isAdmin} onEdit={() => setEditing(true)}
              canPin={isAdmin} onPin={togglePin}
              canDelete={isAdmin} onDelete={deletePost} />
          }
          <section className="Card Comments" aria-label="Comments">
            <h2 className="Comments-title">{commentLabel(post.comment_count)}</h2>
            {comments === undefined ?
              <div className="Loading"><Spinner animation="border" size="sm" variant="success" /></div>
            : comments === null ?
              <p className="Empty">Could not retrieve comments.</p>
            : comments.length === 0 ?
              <p className="Empty">No comments yet. Start the conversation.</p>
            :
              comments.map((comment) =>
                <Post key={comment.id} item={comment} avatarSize={32} className="Comment"
                  canDelete={!!user && (isAdmin || comment.author.id === user.id)}
                  onDelete={deleteComment} />
              )
            }
          </section>
          {user?.banned_at ?
            <p className="Card JoinPrompt">You have been banned from commenting.</p>
          : user ?
            <Composer placeholder="Add a comment…" submitLabel="Comment" onSubmit={addComment} />
          : user === null &&
            <p className="Card JoinPrompt">
              <Link to="/login" state={{ next: location.pathname }}>Log in</Link> or{' '}
              <Link to="/register">join</Link> to leave a comment.
            </p>
          }
        </>
      }
    </Body>
  );
}
