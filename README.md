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

- **Anyone** can read posts, comments and profiles. No account needed.
- **Members** (email + password, or GitHub / Google OAuth) can comment. Comments can include
  up to 4 photos (JPEG/PNG/WebP/GIF, 5 MB each), clickable links, and embedded videos from
  YouTube, Vimeo, TikTok and Instagram links. Members can delete their own comments.
- **The superuser** (exactly one account) writes the posts, which support the same media,
  and can delete any comment.

All of this is enforced in the database (RLS + column grants + storage policies), not only in
the UI: a member calling the API directly still cannot create a post.

### Superuser

Sign up normally, then promote the account (at most one superuser; this replaces any previous one):

```bash
npm run db -- make-admin prod you@example.com
```

On dev, the seed makes `kushking@example.com` the superuser.

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

Seed logins on dev (password `password123`): `kushking@example.com` (superuser), `hashqueen@example.com` (member).

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

The frontend is hosted on Cloudflare (Workers static assets, free tier):
**https://united-stoners-of-california.united-stoners-of-california.workers.dev**

```bash
npx wrangler login          # once
npm run db:migrate:prod     # if there are new migrations
npm run deploy              # vite build (prod env) + wrangler deploy
```

`wrangler.jsonc` serves `dist/` with SPA fallback (deep links like `/post/1` load `index.html`);
`public/_headers` sets security and caching headers. If the URL ever changes, update `siteUrl`
for prod in `supabase/environments.json` and run `npm run db -- auth prod`, otherwise
confirmation and password-reset emails link to the wrong place.

## Project layout

```
src/
  api/SupabaseApiClient.js   data access (PostgREST queries, RPCs); replaces MicroblogApiClient
  contexts/                  Flash, Api and User (auth session + profile) providers
  components/ pages/         UI, ported from react-microblog (Composer = text + photo uploads,
                             Content = links, images and video embeds)
  lib/embeds.js              link detection + allow-listed video embeds
supabase/
  environments.json          dev/prod project refs and auth settings
  migrations/                schema, triggers, RPCs, grants, RLS
  seed.sql                   demo users and posts (dev only)
  tests/database/            pgTAP tests
scripts/
  db.mjs                     migrations / seed / tests / auth config via the Management API
  smoke.mjs                  end-to-end API checks against dev
```
