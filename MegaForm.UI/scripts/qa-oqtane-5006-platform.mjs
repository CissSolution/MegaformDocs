// QA — Oqtane Fresh Test (5006): inspect __MF_PLATFORM__ + reproduce 404s
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://localhost:5006';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const reqs = [];
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('response', r => {
  const url = r.url();
  if (r.status() >= 400 && (url.includes('MegaForm') || url.includes('AiAssistant') || url.includes('Subform'))) {
    reqs.push(r.status() + ' ' + url);
  }
});

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

// Print available pages or navigate to login
const home = await page.evaluate(() => ({
  title: document.title,
  href: location.href,
  hasMfRoot: !!document.getElementById('mf-builder-root'),
  hasMfDashboard: !!document.getElementById('mf-dashboard-root'),
}));
console.log('=== Home ===');
console.log(JSON.stringify(home, null, 2));

await page.screenshot({ path: join(OUT, 'qa-5006-home.png'), fullPage: false });

// Try to login as host
console.log('=== Attempt login as host ===');
const loginNav = await page.evaluate(() => {
  const link = document.querySelector('a[href*="login" i], a[href*="Login" i]');
  if (link) { link.click(); return { kind: 'click-link', href: link.getAttribute('href') }; }
  return { kind: 'no-link' };
});
console.log(JSON.stringify(loginNav, null, 2));
await page.waitForTimeout(3000);
// Try direct nav if no link
if (loginNav.kind === 'no-link') {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
}

// Try filling Oqtane login
try {
  const filled = await page.evaluate(() => {
    const u = document.querySelector('input[type="text"][autocomplete="username"], input[id*="Username" i], input[name*="Username" i], input[placeholder*="Username" i]');
    const p = document.querySelector('input[type="password"]');
    if (u && p) { (u).value = 'host'; (p).value = 'host'; return true; }
    return false;
  });
  console.log('Login fields found:', filled);
  if (filled) {
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"], button.btn-primary, button:not([type])');
      if (btn) btn.click();
    });
    await page.waitForTimeout(5000);
  }
} catch (e) { console.log('Login try failed:', String(e).slice(0, 100)); }

await page.screenshot({ path: join(OUT, 'qa-5006-after-login.png'), fullPage: false });

// Inspect __MF_PLATFORM__
const platform = await page.evaluate(() => {
  const pf = window.__MF_PLATFORM__ || null;
  return {
    platformObject: pf ? Object.keys(pf) : null,
    platformField: pf?.platform,
    apiBase: pf?.apiBase,
    aiObject: pf?.ai,
    authTokenLen: pf?.authToken ? String(pf.authToken).length : 0,
    title: document.title,
    href: location.href,
    hasBuilderRoot: !!document.getElementById('mf-builder-root'),
    hasDashboardRoot: !!document.getElementById('mf-dashboard-root'),
    aiFloatBtn: !!document.querySelector('.mf-ai-chat-btn, .mf-ai-fab, [class*="ai-form-assistant"]'),
  };
});
console.log('=== __MF_PLATFORM__ ===');
console.log(JSON.stringify(platform, null, 2));

console.log('=== 4xx responses involving MegaForm/AiAssistant/Subform ===');
reqs.slice(0, 15).forEach(r => console.log('  ' + r));

console.log('=== Console errors (first 5) ===');
errs.slice(0, 5).forEach(e => console.log('  ' + e));

await browser.close();
