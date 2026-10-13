# United Stoners of California 🌿

A community forum for California adults (21+) to swap experiences and info about craft cannabis:
strains, growers, dispensaries, grow and extraction tips.

- **Frontend:** React 19 + React-Bootstrap + React Router, built with Vite. Based on
  Miguel Grinberg's [react-microblog](https://github.com/miguelgrinberg/react-microblog)
  from his [React Mega-Tutorial](https://blog.miguelgrinberg.com/post/introducing-the-react-mega-tutorial).
- **Backend:** [Supabase](https://supabase.com). No custom server: the browser talks to Postgres
  through PostgREST (`supabase-js`), and Supabase Auth handles accounts. Access control lives in
  the database as Row Level Security policies + column grants
  (`supabase/migrations/`).

## Features

- Sign up / log in with email + password (email confirmation, password reset) or GitHub / Google OAuth
- Feed (your posts + people you follow), Explore (everyone), user profiles, follow / unfollow
- Posts with comments; authors can delete their own posts and comments
- Edit profile (username, about me, email) and change password

## Local development

Prerequisites: Node 20+, Docker (Rancher Desktop or Docker Desktop), Supabase CLI
(`brew install supabase/tap/supabase`).

```bash
npm install
npm run db:start            # supabase start (see "Corporate proxy" below)
cp .env.example .env.local  # fill in from `supabase status` (Project URL + Publishable key)
npm run db:reset            # apply migrations + seed data
npm run dev                 # http://localhost:5173
```

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (confirmation / reset emails) | http://127.0.0.1:54324 |

Seed logins (password `password123`): `kushking@example.com`, `hashqueen@example.com`.

### Tests

```bash
npm test             # Vitest + Testing Library (UI behaviour, fake API)
npm run test:db      # pgTAP: signup trigger, RLS policies, column grants
npm run test:smoke   # end-to-end against the local stack (needs db:reset first)
npm run lint
```

### OAuth (GitHub / Google)

1. Create an OAuth app with each provider. Callback URL: `http://127.0.0.1:54321/auth/v1/callback`
2. `cp supabase/.env.example supabase/.env` and fill in the client IDs and secrets.
3. Set `enabled = true` under `[auth.external.github]` / `[auth.external.google]` in `supabase/config.toml`.
4. Set `VITE_OAUTH_PROVIDERS=github,google` in `.env.local`, then `supabase stop && npm run db:start`.

### Corporate proxy

If Docker injects an HTTP proxy into containers (`proxies` in `~/.docker/config.json`), the
auth, storage and vector health checks (busybox `wget`, which ignores `no_proxy`) fail even
though the services work. `npm run db:start` passes `--ignore-health-check` for that reason.

## Project layout

```
src/
  api/SupabaseApiClient.js   data access (PostgREST queries, RPCs); replaces MicroblogApiClient
  contexts/                  Flash, Api and User (auth session + profile) providers
  components/ pages/         UI, ported from react-microblog; PostPage adds comments
supabase/
  migrations/                schema, triggers, RPCs, grants, RLS
  seed.sql                   demo users and posts
  tests/database/            pgTAP tests
scripts/smoke.mjs            end-to-end API checks
```

## Deploying

Create a hosted Supabase project, run `supabase link` and `supabase db push`, then configure
Auth URLs and OAuth providers in the dashboard. Build the frontend with `npm run build` and
serve `dist/` from any static host, with an SPA fallback to `index.html`.
