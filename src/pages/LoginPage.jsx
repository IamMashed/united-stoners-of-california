import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Body from '../components/Body';
import InputField from '../components/InputField';
import OAuthButtons from '../components/OAuthButtons';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

export default function LoginPage() {
  const [formErrors, setFormErrors] = useState({});
  const emailField = useRef();
  const passwordField = useRef();
  const { login } = useUser();
  const flash = useFlash();

  useEffect(() => {
    emailField.current.focus();
  }, []);

  const onSubmit = async (ev) => {
    ev.preventDefault();
    const email = emailField.current.value.trim();
    const password = passwordField.current.value;

    const errors = {};
    if (!email) {
      errors.email = 'Email must not be empty.';
    }
    if (!password) {
      errors.password = 'Password must not be empty.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const result = await login(email, password);
    if (result === 'fail') {
      flash('Invalid email or password.', 'danger');
    }
    else if (result === 'unconfirmed') {
      flash('Please confirm your email address first. Check your inbox.', 'warning');
    }
    else if (result === 'error') {
      flash('Login failed. Please try again later.', 'danger');
    }
    // On success PublicRoute redirects to the originally requested page.
  };

  return (
    <Body form title="Login">
      <Form onSubmit={onSubmit}>
        <InputField
          name="email" label="Email address" type="email" autoComplete="email"
          error={formErrors.email} fieldRef={emailField} />
        <InputField
          name="password" label="Password" type="password" autoComplete="current-password"
          error={formErrors.password} fieldRef={passwordField} />
        <Button variant="success" type="submit">Login</Button>
      </Form>
      <OAuthButtons />
      <div className="FormCard-links">
        <Link to="/reset-request">Forgot your password?</Link>
        <span>New here? <Link to="/register">Create an account</Link></span>
      </div>
    </Body>
  );
}
