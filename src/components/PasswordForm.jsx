import { useState, useEffect, useRef } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import InputField from './InputField';

const MIN_PASSWORD = 8;

// Shared by the change-password and reset-password pages.
// `onSubmit({ oldPassword, password })` returns a field-errors object (empty on success).
export default function PasswordForm({ askOldPassword, submitLabel, onSubmit }) {
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const oldPasswordField = useRef();
  const passwordField = useRef();
  const password2Field = useRef();

  useEffect(() => {
    (askOldPassword ? oldPasswordField : passwordField).current.focus();
  }, [askOldPassword]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const password = passwordField.current.value;
    if (password.length < MIN_PASSWORD) {
      setFormErrors({ password: `Use at least ${MIN_PASSWORD} characters.` });
      return;
    }
    if (password !== password2Field.current.value) {
      setFormErrors({ password2: "New passwords don't match." });
      return;
    }
    setBusy(true);
    const errors = await onSubmit({
      oldPassword: askOldPassword ? oldPasswordField.current.value : undefined,
      password,
    });
    setBusy(false);
    setFormErrors(errors || {});
  };

  return (
    <Form onSubmit={handleSubmit}>
      {askOldPassword &&
        <InputField
          name="oldPassword" label="Current Password" type="password"
          autoComplete="current-password"
          error={formErrors.oldPassword} fieldRef={oldPasswordField} />
      }
      <InputField
        name="password" label="New Password" type="password" autoComplete="new-password"
        error={formErrors.password} fieldRef={passwordField} />
      <InputField
        name="password2" label="New Password Again" type="password" autoComplete="new-password"
        error={formErrors.password2} fieldRef={password2Field} />
      <Button variant="success" type="submit" disabled={busy}>{submitLabel}</Button>
    </Form>
  );
}
