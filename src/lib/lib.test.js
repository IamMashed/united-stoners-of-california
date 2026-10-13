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
    expect(fieldErrorsFromDb(error)).toEqual({ body: 'Comments must be between 1 and 1000 characters.' });
  });

  test('returns null for errors it does not recognise', () => {
    expect(fieldErrorsFromDb({ message: 'permission denied for table posts' })).toBeNull();
  });
});
