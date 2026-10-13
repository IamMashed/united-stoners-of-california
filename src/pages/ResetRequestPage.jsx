import { useState, useEffect, useRef } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Body from '../components/Body';
import InputField from '../components/InputField';
import { useUser } from '../contexts/UserProvider';
import { useFlash } from '../contexts/FlashProvider';

export default function ResetRequestPage() {
  const [formErrors, setFormErrors] = useState({});
  const emailField = useRef();
  const { requestPasswordReset } = useUser();
  const flash = useFlash();

  useEffect(() => {
    emailField.current.focus();
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    const email = emailField.current.value.trim();
    if (!email) {
      setFormErrors({ email: 'Email must not be empty.' });
      return;
    }
    const { error } = await requestPasswordReset(email);
    if (error && error.status !== 429) {
      setFormErrors({ email: error.message });
      return;
    }
    if (error) {
      flash('Too many requests. Please wait a minute and try again.', 'warning');
      return;
    }
    emailField.current.value = '';
    setFormErrors({});
    flash('If that address has an account, you will receive an email with a reset link.', 'info');
  };

  return (
    <Body>
      <h1>Reset Your Password</h1>
      <Form onSubmit={onSubmit}>
        <InputField
          name="email" label="Email Address" type="email" autoComplete="email"
          error={formErrors.email} fieldRef={emailField} />
        <Button variant="success" type="submit">Send Reset Link</Button>
      </Form>
    </Body>
  );
}
