// Maps Postgres constraint violations (surfaced by PostgREST) to form field errors.
// Constraint names come from supabase/migrations/*_initial_schema.sql.
const CONSTRAINT_ERRORS = {
  profiles_username_lower_key: ['username', 'That username is already taken.'],
  profiles_username_format: ['username', 'Usernames are 3-32 letters, numbers or underscores.'],
  profiles_about_me_length: ['about_me', 'Keep it under 280 characters.'],
  posts_body_length: ['body', 'Posts must be between 1 and 2000 characters.'],
  comments_body_length: ['body', 'Comments must be between 1 and 1000 characters.'],
};

export function fieldErrorsFromDb(error) {
  if (!error) {
    return {};
  }
  const text = `${error.message || ''} ${error.details || ''}`;
  for (const [constraint, [field, message]] of Object.entries(CONSTRAINT_ERRORS)) {
    if (text.includes(constraint)) {
      return { [field]: message };
    }
  }
  return null;
}
