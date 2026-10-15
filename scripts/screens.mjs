// Visual check: renders every page at phone and desktop sizes with the local Chrome
// and saves screenshots to ./screens. Also fails if any page scrolls horizontally
// (the most common mobile layout bug). Uses the dev Supabase project + seed users.
//
//   npm run screens               all pages, all viewports
//   npm run screens -- home post  only pages whose name contains "home" or "post"
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667, mobile: true },
  { name: 'iphone-15', width: 393, height: 852, mobile: true },
  { name: 'android-small', width: 360, height: 780, mobile: true },
  { name: 'desktop', width: 1280, height: 900, mobile: false },
];

// [name, path, login email or null, optional async action before the screenshot]
const PAGES = [
  ['home-visitor', '/', null],
  ['post-visitor', '/post/2', null],
  ['login', '/login', null],
  ['register', '/register', null],
  ['home-admin', '/', 'kushking@example.com'],
  ['post-member', '/post/2', 'hashqueen@example.com'],
  ['menu-member', '/', 'hashqueen@example.com', async (page) => {
    await page.getByRole('button', { name: 'hashqueen' }).click();
  }],
  ['profile-member', '/user/hashqueen', 'hashqueen@example.com'],
  ['profile-admin', '/user/kushking', null],
  ['edit-profile', '/edit', 'hashqueen@example.com'],
  ['post-edit-admin', '/post/2', 'kushking@example.com', async (page) => {
    await page.getByRole('button', { name: 'Edit' }).first().click();
  }],
  ['profile-member-as-admin', '/user/hashqueen', 'kushking@example.com'],
  ['contact-visitor', '/contact', null],
  ['contact-errors', '/contact', null, async (page) => {
    await page.getByRole('button', { name: 'Send' }).click();
  }],
];

const filters = process.argv.slice(2);
const pages = PAGES.filter(([name]) => !filters.length || filters.some((f) => name.includes(f)));

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5199';
const browser = await chromium.launch({ channel: 'chrome' });
mkdirSync('screens', { recursive: true });

let problems = 0;
for (const vp of VIEWPORTS) {
  const sessions = {};
  for (const [name, path, email, action] of pages) {
    if (!sessions[email ?? 'anon']) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.mobile ? 3 : 1,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      });
      if (email) {
        const login = await context.newPage();
        await login.goto(`${base}/login`);
        await login.getByLabel('Email address').fill(email);
        await login.getByLabel('Password').fill('password123');
        await login.getByRole('button', { name: 'Login' }).click();
        await login.waitForURL(`${base}/`);
        await login.close();
      }
      sessions[email ?? 'anon'] = context;
    }
    const page = await sessions[email ?? 'anon'].newPage();
    await page.goto(base + path);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !document.querySelector('.spinner-border'), null, { timeout: 10000 })
      .catch(() => {});
    if (action) await action(page);
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      const offenders = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > width + 1)
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      return { scroll: document.documentElement.scrollWidth > width, offenders };
    });
    if (overflow.scroll) {
      problems++;
      console.log(`OVERFLOW ${vp.name}/${name}: ${overflow.offenders.join(', ')}`);
    }
    await page.screenshot({ path: `screens/${vp.name}--${name}.png`, fullPage: true });
    await page.close();
  }
  await Promise.all(Object.values(sessions).map((c) => c.close()));
}

await browser.close();
await server.close();
console.log(problems ? `${problems} page(s) overflow horizontally` : `Saved ${pages.length * VIEWPORTS.length} screenshots to ./screens, no horizontal overflow`);
process.exit(problems ? 1 : 0);
