import { validateContact } from './contact';
import { avatarUrl } from './avatar';
import { fieldErrorsFromDb } from './dbErrors';

describe('avatarUrl', () => {
  test('sizes gravatar and GitHub avatars', () => {
    expect(avatarUrl('https://www.gravatar.com/avatar/abc?d=identicon', 48))
      .toBe('https://www.gravatar.com/avatar/abc?d=identicon&s=48');
    expect(avatarUrl('https://avatars.githubusercontent.com/u/1?v=4', 32))
      .toBe('https://avatars.githubusercontent.com/u/1?v=4&s=32');
  });

  test('leaves other providers untouched', () => {
    const google = 'https://lh3.googleusercontent.com/a/xyz=s96-c';
    expect(avatarUrl(google, 48)).toBe(google);
  });

  test('falls back to an identicon when missing', () => {
    expect(avatarUrl(null, 64)).toBe('https://www.gravatar.com/avatar/?d=identicon&s=64');
  });
});

describe('fieldErrorsFromDb', () => {
  test('maps a duplicate username to the username field', () => {
    const error = { message: 'duplicate key value violates unique constraint "profiles_username_lower_key"' };
    expect(fieldErrorsFromDb(error)).toEqual({ username: 'That username is already taken.' });
  });

  test('maps an over-long comment to the body field', () => {
    const error = { message: 'new row for relation "comments" violates check constraint "comments_body_length"' };
    expect(fieldErrorsFromDb(error)).toEqual({ body: 'Comments need text or a photo, and at most 2000 characters.' });
  });

  test('returns null for errors it does not recognise', () => {
    expect(fieldErrorsFromDb({ message: 'permission denied for table posts' })).toBeNull();
  });
});

describe('validateContact', () => {
  test('trims input and turns blank fields into null', () => {
    expect(validateContact({ email: ' a@b.co ', phone: '  ', message: ' hi ' })).toEqual({
      values: { email: 'a@b.co', phone: null, message: 'hi' }, errors: {},
    });
  });

  test('needs an email or a phone, and a message', () => {
    const { errors } = validateContact({ email: '', phone: '', message: '' });
    expect(errors.email).toMatch(/email address or a phone number/);
    expect(errors.message).toBe('Write a message.');
  });

  test('rejects malformed email and phone numbers', () => {
    expect(validateContact({ email: 'not-an-email', message: 'x' }).errors.email).toMatch(/does not look like an email/);
    expect(validateContact({ phone: '12-34', message: 'x' }).errors.phone).toMatch(/phone number/);
    expect(validateContact({ phone: 'call me maybe', message: 'x' }).errors.phone).toMatch(/phone number/);
  });

  test('accepts common phone formats', () => {
    for (const phone of ['+1 (415) 555-0100', '415.555.0100', '4155550100']) {
      expect(validateContact({ phone, message: 'x' }).errors).toEqual({});
    }
  });

  test('caps the message length', () => {
    expect(validateContact({ email: 'a@b.co', message: 'x'.repeat(5001) }).errors.message).toMatch(/5000/);
  });
});
