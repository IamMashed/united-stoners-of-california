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
- **Admins** (one or more superusers) write and edit the posts, which support the same
  media, can delete any comment, and can ban members from commenting (and unban them) from
  their profile page. Banned members can still read and delete their own comments.

- **Contact us** (footer and account menu, shown to logged-in members only):
  members leave an email and/or phone number and a message. The Cloudflare Worker (`worker/contact.js`) rate-limits it (3/min per IP), stores it in
  `contact_messages` (readable only by the superuser) and emails it to the owner via Resend.
  Until `RESEND_API_KEY` is set, messages are stored but not emailed.

- **New-post emails**: when the superuser publishes a post, every confirmed member who hasn't
  opted out gets an email with a link to it (`worker/notify.js`, Resend batch API). Each post
  is announced once (`posts.notified_at`). Emails carry a one-click unsubscribe link, and
  members can switch them off under Edit profile (`email_preferences`).

All of this is enforced in the database (RLS + column grants + storage policies), not only in
the UI: a member calling the API directly still cannot create a post.

### Superuser

Sign up normally, then promote the account. There can be several admins, all with the same powers:

```bash
npm run db -- make-admin prod you@example.com     # add an admin
npm run db -- remove-admin prod them@example.com  # remove one (never the last)
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

### Setting up a new machine

Everything needed to build, test and deploy is in this repo; only logins and database
passwords live outside it.

```bash
gh auth login                       # GitHub account IamMashed
git clone https://github.com/IamMashed/united-stoners-of-california.git
cd united-stoners-of-california
git config user.name iammashed && git config user.email rustamallakov@gmail.com
npm ci
supabase login                      # Supabase account that owns org mashedOrg
npx wrangler login                  # Cloudflare account rustamallakov@gmail.com
npm run db:status                   # sanity check: both projects reachable, no pending migrations
npm test && npm run test:db && npm run test:smoke
```

- `scripts/db.mjs` reads the Supabase token from the macOS Keychain (where `supabase login`
  puts it). On Linux/Windows, set `SUPABASE_ACCESS_TOKEN` instead (create one under
  Account → Access Tokens in the Supabase dashboard).
- `npm ci` uses whatever registry the machine is configured for (`.npmrc` sets
  `replace-registry-host=always`, so lockfile URLs from a corporate mirror don't matter).
- Behind a corporate proxy, set `HTTPS_PROXY`; the scripts honour it. Without a proxy nothing
  extra is needed.
- Database passwords (only for direct Postgres access) are in the Supabase dashboard
  (Project Settings → Database → reset password) if you don't have them saved.

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

Prod sends all email through [Resend](https://resend.com) (free tier: 3,000/month, 100/day) from
`no-reply@unitedstoners.club`. The domain is verified in Resend (DKIM, SPF and DMARC records live
in Cloudflare DNS).

- **Auth emails** (signup confirmation, password reset): Supabase custom SMTP, configured by
  `npm run db -- auth prod` from the `smtp` block in `supabase/environments.json`.
- **Contact form**: the Worker calls the Resend API.

Both use one Resend API key (sending access, unitedstoners.club only), kept out of the repo in
the Keychain (service `usoc-worker`, account `RESEND_API_KEY`) or the `RESEND_API_KEY` env var.
After rotating it, run `npm run db -- auth prod` and `npm run db -- worker-secrets prod`.

Dev still uses Supabase's built-in sender, which only delivers to members of the Supabase org and
is heavily rate limited. That's fine for testing with your own address.

## OAuth (GitHub / Google)

1. Create an OAuth app with each provider. Callback URL:
   `https://<project-ref>.supabase.co/auth/v1/callback` (one app per environment).
2. In the Supabase dashboard, open Authentication → Sign In / Providers, enable the provider and
   paste the client ID and secret.
3. Set `VITE_OAUTH_PROVIDERS=github,google` in `supabase/environments.json` (`oauthProviders`)
   and regenerate the env file with `npm run db -- env <dev|prod>`.

## Deploying

The frontend is hosted on Cloudflare (Workers static assets, free tier):
**https://unitedstoners.club** (`www.` redirects there; the old
https://united-stoners-of-california.united-stoners-of-california.workers.dev still works)

```bash
npx wrangler login          # once
npm run db:migrate:prod     # if there are new migrations
npm run deploy              # vite build (prod env) + wrangler deploy
```

Worker secrets (Supabase secret key, contact inbox, Resend key) are not in the repo. Set them
with `npm run db -- worker-secrets prod` (and `... dev` to write the gitignored `.dev.vars` for
local dev). The inbox and Resend key are read from `CONTACT_TO` / `RESEND_API_KEY` or the
Keychain (service `usoc-worker`).

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
