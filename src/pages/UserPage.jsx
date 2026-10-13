import { useState, useEffect } from 'react';
import Stack from 'react-bootstrap/Stack';
import Spinner from 'react-bootstrap/Spinner';
import Button from 'react-bootstrap/Button';
import { useParams, useNavigate } from 'react-router-dom';
import Body from '../components/Body';
import Avatar from '../components/Avatar';
import Posts from '../components/Posts';
import TimeAgo from '../components/TimeAgo';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

// Keyed on the URL param so navigating between profiles starts from a clean state.
export default function UserPage() {
  const { username } = useParams();
  return <UserProfile key={username} username={username} />;
}

function UserProfile({ username }) {
  const [profile, setProfile] = useState();
  // null = own profile, true/false = following state, undefined = loading
  const [isFollower, setIsFollower] = useState();
  const navigate = useNavigate();
  const api = useApi();
  const { user: loggedInUser } = useUser();
  const flash = useFlash();
  const me = loggedInUser.id;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.getProfileByUsername(username);
      if (!active) return;
      if (error || !data) {
        setProfile(null);
        return;
      }
      setProfile(data);
      if (data.id === me) {
        setIsFollower(null);
      }
      else {
        const { data: following } = await api.isFollowing(me, data.id);
        if (active) setIsFollower(following);
      }
    })();
    return () => { active = false; };
  }, [username, api, me]);

  const follow = async () => {
    const { error } = await api.follow(profile.id);
    if (!error) {
      flash(<>You are now following <b>{profile.username}</b>.</>, 'success');
      setIsFollower(true);
    }
  };

  const unfollow = async () => {
    const { error } = await api.unfollow(me, profile.id);
    if (!error) {
      flash(<>You have unfollowed <b>{profile.username}</b>.</>, 'success');
      setIsFollower(false);
    }
  };

  return (
    <Body sidebar>
      {profile === undefined ?
        <Spinner animation="border" />
      : profile === null ?
        <p>User not found.</p>
      :
        <>
          <Stack direction="horizontal" gap={4} className="Profile">
            <Avatar user={profile} size={128} />
            <div>
              <h1>{profile.username}</h1>
              {profile.about_me && <h5 className="AboutMe">{profile.about_me}</h5>}
              <p>
                Member since: <TimeAgo isoDate={profile.created_at} />
                <br />
                Last seen: <TimeAgo isoDate={profile.last_seen} />
              </p>
              {isFollower === null &&
                <Button variant="success" onClick={() => navigate('/edit')}>Edit</Button>
              }
              {isFollower === false &&
                <Button variant="success" onClick={follow}>Follow</Button>
              }
              {isFollower === true &&
                <Button variant="outline-success" onClick={unfollow}>Unfollow</Button>
              }
            </div>
          </Stack>
          <Posts kind="user" authorId={profile.id} />
        </>
      }
    </Body>
  );
}
