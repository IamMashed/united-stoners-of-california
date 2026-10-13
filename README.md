# United Stoners of California 🌿

A community forum for California adults (21+) to swap experiences and info about craft cannabis:
strains, growers, dispensaries, grow and extraction tips.

- **Frontend:** React 19 + React-Bootstrap + React Router, built with Vite. Based on
  Miguel Grinberg's [react-microblog](https://github.com/miguelgrinberg/react-microblog)
  from his [React Mega-Tutorial](https://blog.miguelgrinberg.com/post/introducing-the-react-mega-tutorial).
- **Backend:** [Supabase](https://supabase.com) in the cloud. No custom server: the browser
  talks to Postgres through PostgREST (`supabase-js`), and Supabase Auth handles accounts.
  Access control lives in the database as Row Level Security policies + column grants
  (`supabase/migrations/`).

## Features

- Sign up / log in with email + password (email confirmation, password reset) or GitHub / Google OAuth
- Feed (your posts + people you follow), Explore (everyone), user profiles, follow / unfollow
- Posts with comments; authors can delete their own posts and comments
- Edit profile (username, about me, email) and change password

## Environments

Two hosted Supabase projects (org `mashedOrg`, region `us-west-1`), listed in
`supabase/environments.json`:

| Env | Project | Used by | Data |
|---|---|---|---|
| dev | `usoc-dev` (`ixfalfnskarultfdqsut`) | `npm run dev` → `.env.development` | seed data, tests run here |
| prod | `usoc-prod` (`psarkbkrhukowqdivkto`) | `npm run build` → `.env.production` | real users only, never seeded |

The `.env.development` / `.env.production` files are committed on purpose: the project URL and
publishable key are public (they ship in the browser bundle). Database passwords are in the
macOS Keychain (service `usoc-supabase-db`), never in the repo.

## Local development

Prerequisites: Node 20+ and the Supabase CLI, logged in (`brew install supabase/tap/supabase && supabase login`).
No Docker needed.

```bash
npm install
npm run dev        # http://localhost:5173, backed by usoc-dev
```

Seed logins on dev (password `password123`): `kushking@example.com`, `hashqueen@example.com`.

## Database workflow

Schema changes are SQL migrations in `supabase/migrations/`, applied with `scripts/db.mjs`. It
uses the Supabase Management API over HTTPS, so it works without Docker and on networks that
block Postgres ports. History is recorded in `supabase_migrations.schema_migrations`, the same
table the Supabase CLI uses, so `supabase db push` keeps working wherever port 5432 is reachable.

```bash
npm run db:status                         # applied / pending migrations on dev and prod
npm run db:migrate:dev                    # apply pending migrations to dev
npm run test:db                           # pgTAP tests on dev (always rolled back)
npm run db:migrate:prod                   # then promote to prod
npm run db:seed                           # seed dev (skipped if it already has data)
npm run db -- query dev "select count(*) from posts"
npm run db -- auth dev                    # push auth settings (site URL, redirects, ...)
npm run db -- env prod                    # regenerate .env.production
```

To add a migration, create `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql` (or
`supabase migration new <name>`), then run `npm run db:migrate:dev` and `npm run test:db`.

## Tests

```bash
npm test             # Vitest + Testing Library (UI behaviour, fake API)
npm run test:db      # pgTAP on dev: signup trigger, RLS policies, column grants
npm run test:smoke   # end-to-end API checks against dev
npm run lint
```

## Email

Supabase's built-in email sender only delivers to members of the Supabase org and is
heavily rate limited. That's fine for dev with your own address. **Before launch, configure
custom SMTP for prod** (Resend, SendGrid, Postmark, ...) under Authentication → Emails → SMTP
in the dashboard.

## OAuth (GitHub / Google)

1. Create an OAuth app with each provider. Callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback` (one app per environment).
2. In the Supabase dashboard, open Authentication → Sign In / Providers, enable the provider and
   paste the client ID and secret.
3. Set `VITE_OAUTH_PROVIDERS=github,google` in `supabase/environments.json` (`oauthProviders`)
   and regenerate the env file with `npm run db -- env <dev|prod>`.

## Deploying

1. `npm run db:migrate:prod`
2. Set the real domain as `siteUrl` for prod in `supabase/environments.json`, then `npm run db -- auth prod`.
3. `npm run build` and serve `dist/` from any static host, with an SPA fallback to `index.html`.

## Project layout

```
src/
  api/SupabaseApiClient.js   data access (PostgREST queries, RPCs); replaces MicroblogApiClient
  contexts/                  Flash, Api and User (auth session + profile) providers
  components/ pages/         UI, ported from react-microblog; PostPage adds comments
supabase/
  environments.json          dev/prod project refs and auth settings
  migrations/                schema, triggers, RPCs, grants, RLS
  seed.sql                   demo users and posts (dev only)
  tests/database/            pgTAP tests
scripts/
  db.mjs                     migrations / seed / tests / auth config via the Management API
  smoke.mjs                  end-to-end API checks against dev
```
