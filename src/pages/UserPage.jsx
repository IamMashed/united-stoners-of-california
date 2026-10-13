import { useState, useEffect } from 'react';
import Spinner from 'react-bootstrap/Spinner';
import Button from 'react-bootstrap/Button';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Body from '../components/Body';
import Avatar from '../components/Avatar';
import Posts from '../components/Posts';
import Post from '../components/Post';
import TimeAgo from '../components/TimeAgo';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';

// Keyed on the URL param so navigating between profiles starts from a clean state.
export default function UserPage() {
  const { username } = useParams();
  return <UserProfile key={username} username={username} />;
}

function UserProfile({ username }) {
  const [profile, setProfile] = useState();
  const api = useApi();
  const { user } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.getProfileByUsername(username);
      if (active) setProfile(error || !data ? null : data);
    })();
    return () => { active = false; };
  }, [username, api]);

  if (profile === undefined) {
    return <Body><div className="Loading"><Spinner animation="border" variant="success" /></div></Body>;
  }
  if (profile === null) {
    return <Body><p className="Empty">User not found.</p></Body>;
  }

  return (
    <Body>
      <section className="Card Profile">
        <Avatar user={profile} size={96} />
        <h1 className="Profile-name">
          {profile.username}
          {profile.is_admin && <span className="FounderBadge">Founder</span>}
        </h1>
        {profile.about_me && <p className="Profile-about">{profile.about_me}</p>}
        <p className="Profile-meta">
          Joined <TimeAgo isoDate={profile.created_at} /> &middot; Last seen <TimeAgo isoDate={profile.last_seen} />
        </p>
        {user?.id === profile.id &&
          <Button variant="outline-success" className="Profile-edit" onClick={() => navigate('/edit')}>
            Edit profile
          </Button>
        }
      </section>
      {profile.is_admin ?
        <>
          <h2 className="SectionTitle">Posts</h2>
          <Posts authorId={profile.id} />
        </>
      :
        <UserComments userId={profile.id} />
      }
    </Body>
  );
}

function UserComments({ userId }) {
  const [comments, setComments] = useState();
  const api = useApi();

  useEffect(() => {
    let active = true;
    api.listCommentsByUser(userId).then(({ data, error }) => {
      if (active) setComments(error ? null : data);
    });
    return () => { active = false; };
  }, [api, userId]);

  return (
    <>
      <h2 className="SectionTitle">Recent comments</h2>
      {comments === undefined ?
        <div className="Loading"><Spinner animation="border" size="sm" variant="success" /></div>
      : comments === null ?
        <p className="Empty">Could not retrieve comments.</p>
      : comments.length === 0 ?
        <p className="Empty">No comments yet.</p>
      :
        <section className="Card Comments">
          {comments.map((comment) =>
            <Post key={comment.id} item={comment} avatarSize={32} className="Comment"
              footer={<Link to={'/post/' + comment.post_id} className="Item-action">View post &rarr;</Link>} />
          )}
        </section>
      }
    </>
  );
}
