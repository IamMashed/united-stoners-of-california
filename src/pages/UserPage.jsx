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
import { useFlash } from '../contexts/FlashProvider';

// Keyed on the URL param so navigating between profiles starts from a clean state.
export default function UserPage() {
  const { username } = useParams();
  return <UserProfile key={username} username={username} />;
}

function UserProfile({ username }) {
  const [profile, setProfile] = useState();
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();
  const navigate = useNavigate();
  const [banBusy, setBanBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.getProfileByUsername(username);
      if (active) setProfile(error || !data ? null : data);
    })();
    return () => { active = false; };
  }, [username, api]);

  const toggleBan = async () => {
    const banning = !profile.banned_at;
    const question = banning
      ? `Ban ${profile.username} from commenting? Their existing comments stay up.`
      : `Let ${profile.username} comment again?`;
    if (!window.confirm(question)) return;
    setBanBusy(true);
    const { data, error } = await api.setBanned(profile.id, banning);
    setBanBusy(false);
    if (error) {
      flash(`Could not update ${profile.username}: ${error.message}`, 'danger');
      return;
    }
    setProfile((current) => ({ ...current, banned_at: data }));
    flash(banning ? `${profile.username} can no longer comment.` : `${profile.username} can comment again.`, 'success');
  };

  const isAdmin = !!user?.is_admin;
  const showBanned = !!profile?.banned_at && (isAdmin || user?.id === profile.id);

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
          {showBanned && <span className="BannedBadge">Banned</span>}
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
        {isAdmin && !profile.is_admin &&
          <Button variant={profile.banned_at ? 'outline-success' : 'outline-danger'} className="Profile-edit"
            disabled={banBusy} onClick={toggleBan}>
            {profile.banned_at ? 'Unban' : 'Ban from commenting'}
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
  const { user } = useUser();

  const deleteComment = async (comment) => {
    if (!window.confirm('Delete this comment?')) return;
    const { error } = await api.deleteComment(comment);
    if (!error) {
      setComments((current) => current.filter((c) => c.id !== comment.id));
    }
  };

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
              canDelete={!!user && (user.is_admin || comment.author.id === user.id)}
              onDelete={deleteComment}
              footer={<Link to={'/post/' + comment.post_id} className="Item-action">View post &rarr;</Link>} />
          )}
        </section>
      }
    </>
  );
}
