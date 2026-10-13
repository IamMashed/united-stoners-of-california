import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Body from '../components/Body';
import InputField from '../components/InputField';
import OAuthButtons from '../components/OAuthButtons';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

export const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;
const MIN_PASSWORD = 8;

export default function RegistrationPage() {
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const usernameField = useRef();
  const emailField = useRef();
  const passwordField = useRef();
  const password2Field = useRef();
  const navigate = useNavigate();
  const api = useApi();
  const { register } = useUser();
  const flash = useFlash();

  useEffect(() => {
    usernameField.current.focus();
  }, []);

  const validate = async ({ username, email, password, password2 }) => {
    const errors = {};
    if (!USERNAME_RE.test(username)) {
      errors.username = 'Usernames are 3-32 letters, numbers or underscores.';
    }
    else {
      const { data: available, error } = await api.usernameAvailable(username);
      if (!error && !available) {
        errors.username = 'That username is already taken.';
      }
    }
    if (!email) {
      errors.email = 'Email must not be empty.';
    }
    if (password.length < MIN_PASSWORD) {
      errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    }
    else if (password !== password2) {
      errors.password2 = "Passwords don't match.";
    }
    return errors;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const values = {
      username: usernameField.current.value.trim(),
      email: emailField.current.value.trim(),
      password: passwordField.current.value,
      password2: password2Field.current.value,
    };
    setBusy(true);
    try {
      const errors = await validate(values);
      setFormErrors(errors);
      if (Object.keys(errors).length > 0) {
        return;
      }
      const { data, error } = await register(values);
      if (error) {
        if (error.code === 'weak_password') {
          setFormErrors({ password: error.message });
        }
        else if (error.code === 'email_address_invalid' || error.code === 'user_already_exists') {
          setFormErrors({ email: error.message });
        }
        else {
          flash(`Registration failed: ${error.message}`, 'danger');
        }
        return;
      }
      if (data.session) {
        flash('Welcome to United Stoners of California!', 'success');
        navigate('/');
      }
      else {
        flash('Almost there! Check your email to confirm your account, then log in.', 'success');
        navigate('/login');
      }
    }
    finally {
      setBusy(false);
    }
  };

  return (
    <Body>
      <h1>Register</h1>
      <Form onSubmit={onSubmit}>
        <InputField
          name="username" label="Username" autoComplete="username"
          error={formErrors.username} fieldRef={usernameField} />
        <InputField
          name="email" label="Email address" type="email" autoComplete="email"
          error={formErrors.email} fieldRef={emailField} />
        <InputField
          name="password" label="Password" type="password" autoComplete="new-password"
          error={formErrors.password} fieldRef={passwordField} />
        <InputField
          name="password2" label="Password again" type="password" autoComplete="new-password"
          error={formErrors.password2} fieldRef={password2Field} />
        <Button variant="success" type="submit" disabled={busy}>Register</Button>
      </Form>
      <OAuthButtons />
    </Body>
  );
}
