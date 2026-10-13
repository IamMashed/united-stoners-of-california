import { Link, useNavigate } from 'react-router-dom';
import Spinner from 'react-bootstrap/Spinner';
import Body from '../components/Body';
import PasswordForm from '../components/PasswordForm';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

// Target of the password-reset email. supabase-js exchanges the `?code=` in the
// URL for a session, so by the time `user` resolves the visitor is logged in.
export default function ResetPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();

  const onSubmit = async ({ password }) => {
    const { error } = await api.auth.updateUser({ password });
    if (error) {
      return { password: error.message };
    }
    flash('Your password has been reset.', 'success');
    navigate('/');
    return {};
  };

  return (
    <Body>
      <h1>Reset Your Password</h1>
      {user === undefined ?
        <Spinner animation="border" />
      : user === null ?
        <p>
          This reset link is invalid or has expired.{' '}
          <Link to="/reset-request">Request a new one</Link>.
        </p>
      :
        <PasswordForm submitLabel="Reset Password" onSubmit={onSubmit} />
      }
    </Body>
  );
}
