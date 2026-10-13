import { useState, useEffect } from 'react';
import Stack from 'react-bootstrap/Stack';
import Spinner from 'react-bootstrap/Spinner';
import Button from 'react-bootstrap/Button';
import Badge from 'react-bootstrap/Badge';
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

  return (
    <Body>
      {profile === undefined ?
        <Spinner animation="border" />
      : profile === null ?
        <p>User not found.</p>
      :
        <>
          <Stack direction="horizontal" gap={4} className="Profile">
            <Avatar user={profile} size={128} />
            <div>
              <h1>
                {profile.username}{' '}
                {profile.is_admin && <Badge bg="success" className="align-middle fs-6">Founder</Badge>}
              </h1>
              {profile.about_me && <h5 className="AboutMe">{profile.about_me}</h5>}
              <p>
                Member since: <TimeAgo isoDate={profile.created_at} />
                <br />
                Last seen: <TimeAgo isoDate={profile.last_seen} />
              </p>
              {user?.id === profile.id &&
                <Button variant="success" onClick={() => navigate('/edit')}>Edit</Button>
              }
            </div>
          </Stack>
          {profile.is_admin ?
            <>
              <h4 className="mt-4">Posts</h4>
              <Posts authorId={profile.id} />
            </>
          :
            <UserComments userId={profile.id} />
          }
        </>
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
      <h4 className="mt-4">Recent comments</h4>
      {comments === undefined ?
        <Spinner animation="border" size="sm" />
      : comments === null ?
        <p>Could not retrieve comments.</p>
      : comments.length === 0 ?
        <p>No comments yet.</p>
      :
        comments.map((comment) =>
          <Post key={comment.id} item={comment} avatarSize={32} className="Comment"
            footer={<Link to={'/post/' + comment.post_id}>View post</Link>} />
        )
      }
    </>
  );
}
