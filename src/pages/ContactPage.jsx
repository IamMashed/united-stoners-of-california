import { useState } from 'react';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import { Link } from 'react-router-dom';
import Body from '../components/Body';
import { useApi } from '../contexts/ApiProvider';
import { useUser } from '../contexts/UserProvider';
import { MAX_MESSAGE, validateContact } from '../lib/contact';

// "Contact us": email and/or phone plus a message, delivered to the site owner by the
// Worker (worker/contact.js). Logged-in members get their email prefilled.
export default function ContactPage() {
  const api = useApi();
  const { user } = useUser();
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState('');

  const onSubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      email: form.get('email'), phone: form.get('phone'), message, website: form.get('website'),
    };
    const { values, errors: invalid } = validateContact(input);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      return;
    }
    setBusy(true);
    const { error } = await api.sendContactMessage({ ...values, website: input.website });
    setBusy(false);
    if (error) {
      setErrors(error.fields || { form: error.message });
      return;
    }
    setErrors({});
    setSent(true);
  };

  if (sent) {
    return (
      <Body form title="Message sent">
        <p>Thanks for reaching out. We read every message and will get back to you soon.</p>
        <Link to="/" className="btn btn-success">Back to posts</Link>
      </Body>
    );
  }

  return (
    <Body form title="Contact us">
      <p className="FormCard-lead">
        Questions, ideas or feedback? Leave an email or a phone number (or both) so we can reply.
      </p>
      <Form noValidate onSubmit={onSubmit}>
        <Form.Group controlId="contact-email" className="InputField">
          <Form.Label>Email</Form.Label>
          <Form.Control name="email" type="email" autoComplete="email" inputMode="email"
            defaultValue={user?.email || ''} isInvalid={!!errors.email} />
          <Form.Control.Feedback type="invalid">{errors.email}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group controlId="contact-phone" className="InputField">
          <Form.Label>Phone <span className="text-muted">(optional if you gave an email)</span></Form.Label>
          <Form.Control name="phone" type="tel" autoComplete="tel" inputMode="tel"
            isInvalid={!!errors.phone} />
          <Form.Control.Feedback type="invalid">{errors.phone}</Form.Control.Feedback>
        </Form.Group>
        <Form.Group controlId="contact-message" className="InputField">
          <Form.Label>Message</Form.Label>
          <Form.Control as="textarea" rows={6} name="message" value={message}
            onChange={(e) => setMessage(e.target.value)} maxLength={MAX_MESSAGE}
            isInvalid={!!errors.message} />
          <Form.Control.Feedback type="invalid">{errors.message}</Form.Control.Feedback>
          <Form.Text className="Contact-count">{message.length}/{MAX_MESSAGE}</Form.Text>
        </Form.Group>
        {/* Honeypot: hidden from people, filled in by spam bots. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="Contact-trap"
          aria-hidden="true" />
        {errors.form && <p className="Composer-error" role="alert">{errors.form}</p>}
        <Button variant="success" type="submit" disabled={busy} className="Contact-send">
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </Form>
    </Body>
  );
}
