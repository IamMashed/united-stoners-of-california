// Contact form validation, shared by the page (src/pages/ContactPage.jsx) and the
// Worker that stores and emails the message (worker/contact.js). Mirrors the
// constraints on public.contact_messages.

export const MAX_MESSAGE = 5000;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ().-]{7,30}$/;

// Returns { values, errors }: trimmed values (empty fields become null) and a map of
// field name -> message. `errors` is empty when the input is valid.
export function validateContact({ email, phone, message } = {}) {
  const values = {
    email: clean(email),
    phone: clean(phone),
    message: typeof message === 'string' ? message.trim() : '',
  };
  const errors = {};

  if (!values.email && !values.phone) {
    errors.email = 'Enter an email address or a phone number so we can reply.';
  }
  if (values.email && (values.email.length > 254 || !EMAIL.test(values.email))) {
    errors.email = 'That does not look like an email address.';
  }
  if (values.phone && (!PHONE.test(values.phone) || values.phone.replace(/\D/g, '').length < 7)) {
    errors.phone = 'That does not look like a phone number.';
  }
  if (!values.message) {
    errors.message = 'Write a message.';
  }
  else if (values.message.length > MAX_MESSAGE) {
    errors.message = `Keep it under ${MAX_MESSAGE} characters.`;
  }
  return { values, errors };
}

function clean(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}
