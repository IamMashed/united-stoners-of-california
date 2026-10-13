import { useState, useEffect, useCallback } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';
import Write from './Write';
import Post from './Post';
import More from './More';

// kind: 'feed' | 'explore' | 'user' (requires authorId)
export default function Posts({ kind = 'feed', authorId, write }) {
  const [posts, setPosts] = useState();
  const [more, setMore] = useState(false);
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.listPosts({ kind, authorId });
      if (!active) return;
      setPosts(error ? null : data.posts);
      setMore(error ? false : data.more);
    })();
    return () => { active = false; };
  }, [api, kind, authorId]);

  const loadNextPage = async () => {
    const { data, error } = await api.listPosts({
      kind, authorId, beforeId: posts[posts.length - 1].id,
    });
    if (!error) {
      setPosts([...posts, ...data.posts]);
      setMore(data.more);
    }
  };

  const createPost = async (text) => {
    const { data, error } = await api.createPost(text);
    if (!error) {
      setPosts((current) => [data, ...(current || [])]);
    }
    return { error };
  };

  const deletePost = useCallback(async (post) => {
    if (!window.confirm('Delete this post and all of its comments?')) return;
    const { error } = await api.deletePost(post.id);
    if (!error) {
      setPosts((current) => current.filter((p) => p.id !== post.id));
      flash('Post deleted.', 'success');
    }
  }, [api, flash]);

  return (
    <>
      {write &&
        <Write placeholder="Share a strain, a grow tip, a dispensary find..."
          submitLabel="Post" onSubmit={createPost} />
      }
      {posts === undefined ?
        <Spinner animation="border" />
      :
        <>
          {posts === null ?
            <p>Could not retrieve posts.</p>
          :
            <>
              {posts.length === 0 ?
                <p>There are no posts yet.</p>
              :
                posts.map(post =>
                  <Post key={post.id} post={post}
                    canDelete={user && post.author.id === user.id}
                    onDelete={deletePost} />
                )
              }
            </>
          }
        </>
      }
      <More more={more} loadNextPage={loadNextPage} />
    </>
  );
}
