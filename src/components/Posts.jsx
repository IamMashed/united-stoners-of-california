import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';
import Composer from './Composer';
import Post, { commentLabel } from './Post';
import More from './More';

// The list of posts. Only the superuser sees the compose box and Delete buttons.
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
    }
    return { error };
  };

  const deletePost = useCallback(async (post) => {
    if (!window.confirm('Delete this post and all of its comments?')) return;
    const { error } = await api.deletePost(post);
    if (!error) {
      setPosts((current) => current.filter((p) => p.id !== post.id));
      flash('Post deleted.', 'success');
    }
  }, [api, flash]);

  return (
    <>
      {isAdmin && !authorId &&
        <Composer placeholder="Share a strain, a grow tip, a dispensary find..."
          submitLabel="Post" onSubmit={createPost} />
      }
      {posts === undefined ?
        <Spinner animation="border" />
      : posts === null ?
        <p>Could not retrieve posts.</p>
      : posts.length === 0 ?
        <p>There are no posts yet.</p>
      :
        posts.map((post) =>
          <Post key={post.id} item={post} canDelete={isAdmin} onDelete={deletePost}
            footer={<Link to={'/post/' + post.id}>{commentLabel(post.comment_count)}</Link>} />
        )
      }
      <More more={more} loadNextPage={loadNextPage} />
    </>
  );
}
