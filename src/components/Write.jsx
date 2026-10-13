import { useState, useEffect, useRef } from 'react';
import Stack from 'react-bootstrap/Stack';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Avatar from './Avatar';
import InputField from './InputField';
import { useUser } from '../contexts/UserProvider';
import { fieldErrorsFromDb } from '../lib/dbErrors';

// Generic compose box used for both posts and comments. `onSubmit(text)` must
// return `{ error }`; the box clears itself on success.
export default function Write({ placeholder, submitLabel, onSubmit, autoFocus = true }) {
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const textField = useRef();
  const { user } = useUser();

  useEffect(() => {
    if (autoFocus) textField.current.focus();
  }, [autoFocus]);

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    const text = textField.current.value.trim();
    if (!text) {
      setFormErrors({ body: 'Write something first.' });
      return;
    }
    setBusy(true);
    const { error } = await onSubmit(text);
    setBusy(false);
    if (error) {
      setFormErrors(fieldErrorsFromDb(error) || {});
    }
    else {
      setFormErrors({});
      textField.current.value = '';
    }
  };

  return (
    <Stack direction="horizontal" gap={3} className="Write">
      <Avatar user={user} size={64} />
      <Form onSubmit={handleSubmit}>
        <InputField
          name="body" as="textarea" rows={3} placeholder={placeholder}
          error={formErrors.body} fieldRef={textField} />
        <Button variant="success" type="submit" disabled={busy}>{submitLabel}</Button>
      </Form>
    </Stack>
  );
}
