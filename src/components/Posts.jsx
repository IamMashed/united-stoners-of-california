import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';
import Composer, { POST_TIP } from './Composer';
import Post, { commentLabel, CommentIcon } from './Post';
import More from './More';

// The list of posts. Only admins see the compose box, Pin and Delete buttons.
export default function Posts({ authorId }) {
  const [posts, setPosts] = useState();
  const [more, setMore] = useState(false);
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();
  const isAdmin = !!user?.is_admin;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.listPosts({ authorId });
      if (!active) return;
      setPosts(error ? null : data.posts);
      setMore(error ? false : data.more);
    })();
    return () => { active = false; };
  }, [api, authorId]);

  const loadNextPage = async () => {
    const { data, error } = await api.listPosts({ authorId, beforeId: posts[posts.length - 1].id });
    if (!error) {
      setPosts([...posts, ...data.posts]);
      setMore(data.more);
    }
  };

  const createPost = async (values) => {
    const { data, error } = await api.createPost(values);
    if (!error) {
      setPosts((current) => [data, ...(current || [])]);
      announce(data.id);
    }
    return { error };
  };

  // Emails members about the new post; the post is already live either way.
  const announce = async (postId) => {
    const { data, error } = await api.notifyNewPost(postId);
    if (error) {
      flash(`Post published, but member emails failed: ${error.message}`, 'warning');
    }
    else {
      flash(data.recipients === 1 ? 'Post published. 1 member was emailed.'
        : `Post published. ${data.sent} of ${data.recipients} members were emailed.`, 'success');
    }
  };

  const deletePost = useCallback(async (post) => {
    if (!window.confirm('Delete this post and all of its comments?')) return;
    const { error } = await api.deletePost(post);
    if (!error) {
      setPosts((current) => current.filter((p) => p.id !== post.id));
      flash('Post deleted.', 'success');
    }
  }, [api, flash]);

  // Pinned posts sort first, newest pin first; the rest keep their order.
  const togglePin = useCallback(async (post) => {
    const pinning = !post.pinned_at;
    const { data, error } = await api.setPostPinned(post, pinning);
    if (!error) {
      setPosts((current) => {
        const updated = current.map((p) => p.id === post.id ? { ...p, pinned_at: data.pinned_at } : p);
        const pinned = updated.filter((p) => p.pinned_at).sort((a, b) => b.pinned_at.localeCompare(a.pinned_at));
        const rest = updated.filter((p) => !p.pinned_at).sort((a, b) => b.id - a.id);
        return [...pinned, ...rest];
      });
      flash(pinning ? 'Post pinned to the top.' : 'Post unpinned.', 'success');
    }
  }, [api, flash]);

  return (
    <>
      {isAdmin && !authorId &&
        <Composer placeholder="Share a strain, a grow tip, a dispensary find…" tip={POST_TIP}
          submitLabel="Post" onSubmit={createPost} />
      }
      {posts === undefined ?
        <div className="Loading"><Spinner animation="border" variant="success" /></div>
      : posts === null ?
        <p className="Empty">Could not retrieve posts.</p>
      : posts.length === 0 ?
        <p className="Empty">There are no posts yet.</p>
      :
        posts.map((post) =>
          <Post key={post.id} item={post} className="Card Post" canPin={isAdmin && !authorId} onPin={togglePin}
            canDelete={isAdmin} onDelete={deletePost}
            readMoreTo={'/post/' + post.id}
            footer={
              <Link to={'/post/' + post.id} className="Item-action">
                <CommentIcon /> <span>{commentLabel(post.comment_count)}</span>
              </Link>
            } />
        )
      }
      <More more={more} loadNextPage={loadNextPage} />
    </>
  );
}
