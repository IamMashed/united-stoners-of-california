import { useState, useEffect, useRef } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { useNavigate } from 'react-router-dom';
import Body from '../components/Body';
import InputField from '../components/InputField';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';
import { fieldErrorsFromDb } from '../lib/dbErrors';
import { USERNAME_RE } from './RegistrationPage';

export default function EditUserPage() {
  const [formErrors, setFormErrors] = useState({});
  const usernameField = useRef();
  const emailField = useRef();
  const aboutMeField = useRef();
  const api = useApi();
  const { user, setUser } = useUser();
  const flash = useFlash();
  const navigate = useNavigate();

  useEffect(() => {
    usernameField.current.value = user.username;
    emailField.current.value = user.email || '';
    aboutMeField.current.value = user.about_me;
    usernameField.current.focus();
  }, [user]);

  const onSubmit = async (event) => {
    event.preventDefault();
    const username = usernameField.current.value.trim();
    const email = emailField.current.value.trim();
    const about_me = aboutMeField.current.value.trim();

    if (!USERNAME_RE.test(username)) {
      setFormErrors({ username: 'Usernames are 3-32 letters, numbers or underscores.' });
      return;
    }

    const { data, error } = await api.updateProfile(user.id, { username, about_me });
    if (error) {
      setFormErrors(fieldErrorsFromDb(error) || {});
      return;
    }

    if (email && email !== user.email) {
      const { error: emailError } = await api.auth.updateUser({ email });
      if (emailError) {
        setUser(data);
        setFormErrors({ email: emailError.message });
        return;
      }
      flash('Profile saved. Confirm your new email address via the links we sent.', 'info');
    }
    else {
      flash('Your profile has been updated.', 'success');
    }
    setFormErrors({});
    setUser(data);
    navigate('/user/' + data.username);
  };

  return (
    <Body>
      <h1>Edit Profile</h1>
      <Form onSubmit={onSubmit}>
        <InputField
          name="username" label="Username" autoComplete="username"
          error={formErrors.username} fieldRef={usernameField} />
        <InputField
          name="email" label="Email" type="email" autoComplete="email"
          error={formErrors.email} fieldRef={emailField} />
        <InputField
          name="aboutMe" label="About Me" as="textarea" rows={3}
          placeholder="Favorite strains, growers, how you consume..."
          error={formErrors.about_me} fieldRef={aboutMeField} />
        <Button variant="success" type="submit">Save</Button>
      </Form>
    </Body>
  );
}
