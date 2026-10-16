# United Stoners of California 🌿

A cannabis education community for California adults (21+). Admins write posts, members
comment (photos, videos, links), anyone can read. Live at https://unitedstoners.club.

**Stack:** React + Vite (frontend), Supabase (Postgres, Auth, Storage), Cloudflare Workers
(hosting + a small API in `worker/`), Resend (email). Access control lives in the database
(RLS policies in `supabase/migrations/`).

## Setup

Requires Node 20+ and the Supabase CLI.

```bash
npm ci
supabase login
npx wrangler login
npm run db -- worker-secrets dev   # writes the gitignored .dev.vars
npm run dev                        # http://localhost:5173, backed by the dev project
```

Projects are listed in `supabase/environments.json`. Secrets are never committed; they are
read from env vars or the macOS Keychain.

## Common commands

```bash
npm test                     # unit/UI tests
npm run test:db              # database (RLS) tests on dev
npm run db:status            # migration status on dev and prod
npm run db:migrate:dev       # apply new migrations to dev
npm run db:migrate:prod      # then to prod
npm run deploy               # build + deploy to Cloudflare
npm run db -- make-admin <env> <email>
```

New migration: add `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, migrate dev, run
`npm run test:db`, then migrate prod.

## Layout

```
src/        React app (api/, components/, pages/, lib/)
worker/     Cloudflare Worker: contact form, new-post emails, cleanup cron, security headers
supabase/   migrations, tests, seed, environments.json
scripts/    db.mjs (migrations, tests, auth config, secrets)
```
