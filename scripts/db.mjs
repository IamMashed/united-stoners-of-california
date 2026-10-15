#!/usr/bin/env node
// Database tooling for the hosted Supabase projects. Talks only to the Supabase
// Management API over HTTPS, so it needs neither Docker nor a direct Postgres
// connection (port 5432/6543 is blocked on some corporate networks).
//
//   node scripts/db.mjs <command> <dev|prod>
//
//   status    show applied / pending migrations
//   migrate   apply pending supabase/migrations/*.sql (recorded in the same
//             supabase_migrations.schema_migrations table the CLI uses)
//   seed      run supabase/seed.sql (dev only)
//   test      run supabase/tests/database/*.test.sql with pgTAP (dev only; always rolled back)
//   auth      push auth settings (site URL, redirects, confirmations, password length,
//             custom SMTP when environments.json has an `smtp` block)
//   env       write .env.<mode> with the project URL and publishable key
//   make-admin <email>   make that account the single superuser (post author)
//   query "<sql>"        run ad-hoc SQL and print the rows as JSON
//   worker-secrets       give the Cloudflare Worker its secrets (contact form): prod ->
//             `wrangler secret bulk`, dev -> .dev.vars. CONTACT_TO / RESEND_API_KEY come from
//             the environment or the Keychain (service usoc-worker, account = variable name).
//
// Auth: SUPABASE_ACCESS_TOKEN, or the token saved by `supabase login` (macOS Keychain).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENVIRONMENTS = JSON.parse(readFileSync(join(ROOT, 'supabase/environments.json'), 'utf8'));
const API = 'https://api.supabase.com/v1';

// ---- auth & HTTP -----------------------------------------------------------

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  let raw;
  try {
    raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'supabase', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  catch {
    throw new Error('No Supabase token. Run `supabase login` or set SUPABASE_ACCESS_TOKEN.');
  }
  const prefix = 'go-keyring-base64:';
  return raw.startsWith(prefix) ? Buffer.from(raw.slice(prefix.length), 'base64').toString('utf8') : raw;
}

const TOKEN = accessToken();

// Uses curl so the corporate HTTPS proxy (HTTPS_PROXY) is honoured; Node's fetch ignores it.
// The token is passed through a curl config on stdin so it never appears in `ps`.
function request(method, path, body) {
  const config = [
    `url = "${API}${path}"`,
    `request = "${method}"`,
    `header = "Authorization: Bearer ${TOKEN}"`,
    'header = "Content-Type: application/json"',
    'silent', 'show-error',
    'write-out = "\\n%{http_code}"',
  ];
  if (body !== undefined) {
    config.push(`data-binary = ${JSON.stringify(JSON.stringify(body))}`);
  }
  const out = execFileSync('curl', ['--config', '-'], {
    input: config.join('\n'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const split = out.lastIndexOf('\n');
  const status = Number(out.slice(split + 1));
  const text = out.slice(0, split);
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (status >= 400) {
    const message = typeof data === 'object' && data ? (data.message || JSON.stringify(data)) : text;
    const error = new Error(`${method} ${path} -> ${status}: ${message}`);
    error.status = status;
    error.body = data;
    throw error;
  }
  return data;
}

// Worker secret from the environment, else the Keychain (service usoc-worker).
function workerSecret(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    return execFileSync('security', ['find-generic-password', '-s', 'usoc-worker', '-a', name, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  catch {
    return null;
  }
}

// Custom SMTP (Resend) for auth emails when the environment has an `smtp` block.
// The password is the Resend API key (RESEND_API_KEY env var or Keychain).
function smtpSettings(env) {
  if (!env.smtp) return {};
  const pass = workerSecret('RESEND_API_KEY');
  if (!pass) throw new Error(`${env.name} uses custom SMTP; set RESEND_API_KEY (or Keychain usoc-worker/RESEND_API_KEY)`);
  return {
    smtp_host: env.smtp.host,
    smtp_port: String(env.smtp.port),
    smtp_user: env.smtp.user,
    smtp_pass: pass,
    smtp_admin_email: env.smtp.senderEmail,
    smtp_sender_name: env.smtp.senderName,
    rate_limit_email_sent: env.smtp.emailsPerHour,
  };
}

const sql = (ref, query) => request('POST', `/projects/${ref}/database/query`, { query });

// ---- helpers ---------------------------------------------------------------

function target(envName) {
  const env = ENVIRONMENTS[envName];
  if (!env) {
    throw new Error(`Unknown environment "${envName}". Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  }
  return { name: envName, ...env };
}

function requireDev(env, command) {
  if (!env.allowDestructive) {
    throw new Error(`"${command}" is only allowed on environments with allowDestructive (not ${env.name}).`);
  }
}

const quote = (s) => `'${s.replaceAll("'", "''")}'`;

function migrationFiles() {
  const dir = join(ROOT, 'supabase/migrations');
  return readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort().map((file) => {
    const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
    return { file, version, name, body: readFileSync(join(dir, file), 'utf8') };
  });
}

function appliedVersions(ref) {
  const rows = sql(ref, `
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );
    select version from supabase_migrations.schema_migrations order by version;`);
  return new Set(rows.map((r) => r.version));
}

// ---- commands --------------------------------------------------------------

const commands = {
  status(env) {
    const applied = appliedVersions(env.ref);
    for (const m of migrationFiles()) {
      console.log(`${applied.has(m.version) ? 'applied' : 'PENDING'}  ${m.file}`);
    }
  },

  migrate(env) {
    const applied = appliedVersions(env.ref);
    const pending = migrationFiles().filter((m) => !applied.has(m.version));
    if (pending.length === 0) {
      console.log(`${env.name}: up to date`);
      return;
    }
    for (const m of pending) {
      // One request = one implicit transaction: the migration and its history row
      // commit together or not at all.
      sql(env.ref, `${m.body}
;
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${quote(m.version)}, ${quote(m.name)}, array[${quote(m.body)}]);`);
      console.log(`${env.name}: applied ${m.file}`);
    }
  },

  seed(env) {
    requireDev(env, 'seed');
    const [{ seeded }] = sql(env.ref, `select exists (select 1 from public.profiles) as seeded`);
    if (seeded) {
      console.log(`${env.name}: already has data, skipping seed`);
      return;
    }
    sql(env.ref, readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'));
    console.log(`${env.name}: seeded`);
  },

  test(env) {
    requireDev(env, 'test');
    sql(env.ref, 'create extension if not exists pgtap with schema extensions');
    const dir = join(ROOT, 'supabase/tests/database');
    let failed = 0;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.sql')).sort()) {
      const source = readFileSync(join(dir, file), 'utf8');
      // The API returns only the last statement's rows, so every top-level pgTAP
      // `select` is rewritten to store its TAP line in a temp table, and the lines
      // are smuggled out in an exception. The exception also guarantees the whole
      // run (fixtures included) is rolled back.
      const body = source
        .replace(/^\s*begin\s*;/im, '')
        .replace(/^\s*rollback\s*;\s*$/im, '')
        .replace(/^select (?!set_config\()/gim, 'insert into pg_temp.usoc_tap (line) select ');
      let lines;
      try {
        sql(env.ref, `set search_path = public, extensions;
create temp table usoc_tap (id bigint generated always as identity, line text);
grant all on pg_temp.usoc_tap to public;
${body}
reset role;
do $$ begin
  raise exception 'USOC_TAP%', (select json_agg(line order by id) from pg_temp.usoc_tap);
end $$;`);
        throw new Error('test run did not abort; refusing to trust it');
      }
      catch (err) {
        const match = String(err.message).match(/USOC_TAP(\[.*\])/s);
        if (!match) throw err;
        lines = JSON.parse(match[1]);
      }
      console.log(`# ${file}`);
      for (const line of lines.flatMap((l) => l.split('\n'))) {
        if (/^not ok/.test(line) || /^# Looks like/.test(line)) failed++;
        console.log(line);
      }
    }
    console.log(failed ? `\n${failed} failure(s)` : '\nAll database tests passed');
    if (failed) process.exitCode = 1;
  },

  auth(env) {
    const redirects = [env.siteUrl, `${env.siteUrl}/**`, ...(env.extraRedirectUrls || [])];
    request('PATCH', `/projects/${env.ref}/config/auth`, {
      site_url: env.siteUrl,
      uri_allow_list: redirects.join(','),
      mailer_autoconfirm: false,
      password_min_length: 8,
      external_email_enabled: true,
      disable_signup: false,
      ...smtpSettings(env),
    });
    console.log(`${env.name}: auth config updated (site_url=${env.siteUrl}`
      + (env.smtp ? `, emails via ${env.smtp.host} as ${env.smtp.senderEmail})` : ', built-in email sender)'));
  },

  // Makes the account with this email the one and only superuser (post author).
  'make-admin'(env) {
    const email = process.argv[4];
    if (!email) throw new Error('Usage: node scripts/db.mjs make-admin <env> <email>');
    // Single request = single transaction; clear the old admin first so the
    // one-admin unique index is never violated mid-way.
    const rows = sql(env.ref, `
      do $$
      declare target uuid;
      begin
        select id into target from auth.users where lower(email) = lower(${quote(email)});
        if target is null then
          raise exception 'No account with email %', ${quote(email)};
        end if;
        update public.profiles set is_admin = false where is_admin and id <> target;
        update public.profiles set is_admin = true where id = target;
      end $$;
      select username from public.profiles where is_admin;`);
    console.log(`${env.name}: ${rows[0].username} is now the superuser`);
  },

  // Ad-hoc SQL: node scripts/db.mjs query dev "select ..."
  query(env) {
    const text = process.argv[4];
    if (!text) throw new Error('Usage: node scripts/db.mjs query <env> "<sql>"');
    console.log(JSON.stringify(sql(env.ref, text), null, 2));
  },

  'worker-secrets'(env) {
    const keys = request('GET', `/projects/${env.ref}/api-keys?reveal=true`);
    const secretKey = keys.find((k) => k.type === 'secret')?.api_key;
    if (!secretKey) throw new Error('No secret API key found (create one under Project Settings -> API Keys)');
    const contactTo = workerSecret('CONTACT_TO');
    if (!contactTo) throw new Error('Set CONTACT_TO (or Keychain usoc-worker/CONTACT_TO) to the inbox for contact messages');
    const resendKey = workerSecret('RESEND_API_KEY');
    const secrets = { SUPABASE_SECRET_KEY: secretKey, CONTACT_TO: contactTo };
    if (resendKey) secrets.RESEND_API_KEY = resendKey;

    if (env.name === 'prod') {
      execFileSync('npx', ['wrangler', 'secret', 'bulk'],
        { cwd: ROOT, input: JSON.stringify(secrets), stdio: ['pipe', 'inherit', 'inherit'] });
    }
    else {
      // Local `npm run dev` (Cloudflare Vite plugin) reads .dev.vars; it overrides the
      // prod SUPABASE_URL var from wrangler.jsonc.
      const vars = { SUPABASE_URL: `https://${env.ref}.supabase.co`, ...secrets };
      writeFileSync(join(ROOT, '.dev.vars'),
        `# ${env.name} Worker secrets: generated by \`npm run db -- worker-secrets ${env.name}\`. Never commit.\n`
        + Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    }
    console.log(`${env.name}: worker secrets set (${Object.keys(secrets).join(', ')})`
      + (resendKey ? '' : '; no RESEND_API_KEY yet, so messages are stored but not emailed'));
  },

  env(env) {
    const keys = request('GET', `/projects/${env.ref}/api-keys`);
    const key = keys.find((k) => k.type === 'publishable')?.api_key
      || keys.find((k) => k.name === 'anon')?.api_key;
    if (!key) throw new Error('No publishable/anon key found');
    const file = join(ROOT, `.env.${env.viteMode}`);
    writeFileSync(file, [
      `# ${env.name}: generated by \`node scripts/db.mjs env ${env.name}\`. Public values (shipped to browsers).`,
      `VITE_SUPABASE_URL=https://${env.ref}.supabase.co`,
      `VITE_SUPABASE_ANON_KEY=${key}`,
      `VITE_OAUTH_PROVIDERS=${env.oauthProviders || ''}`,
      '',
    ].join('\n'));
    console.log(`${env.name}: wrote ${file}`);
  },
};

const [command, envName] = process.argv.slice(2);
if (!commands[command] || !envName) {
  console.error('Usage: node scripts/db.mjs <status|migrate|seed|test|auth|env|make-admin|query|worker-secrets> <dev|prod> [arg]');
  process.exit(2);
}
try {
  commands[command](target(envName));
}
catch (err) {
  console.error(err.message);
  process.exit(1);
}
