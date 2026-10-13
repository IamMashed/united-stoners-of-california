import { useNavigate } from 'react-router-dom';
import Body from '../components/Body';
import PasswordForm from '../components/PasswordForm';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user } = useUser();
  const flash = useFlash();

  const onSubmit = async ({ oldPassword, password }) => {
    // Supabase does not require the old password, so verify it explicitly.
    const { error: authError } = await api.auth.signInWithPassword({
      email: user.email, password: oldPassword,
    });
    if (authError) {
      return { oldPassword: 'Current password is incorrect.' };
    }
    const { error } = await api.auth.updateUser({ password });
    if (error) {
      return { password: error.message };
    }
    flash('Your password has been updated.', 'success');
    navigate('/user/' + user.username);
    return {};
  };

  return (
    <Body form title="Change Your Password">
      <PasswordForm askOldPassword submitLabel="Change Password" onSubmit={onSubmit} />
    </Body>
  );
}
