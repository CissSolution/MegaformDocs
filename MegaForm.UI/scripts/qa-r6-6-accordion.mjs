// R6.6 QA — App accordion sidebar. Logs in as host, opens the Submissions
// inbox, screenshots the new "By app & form" accordion, expands one app,
// and verifies form rows appear underneath.

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Host login
await page.goto(`${BASE}/Login?returnurl=/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
try {
  await page.waitForSelector('input[name*="Username"], input[id*="Username"]', { timeout: 6000 });
  await page.locator('input[name*="Username"], input[id*="Username"]').first().fill('host');
  await page.locator('input[name*="Password"], input[id*="Password"]').first().fill('dnnhost');
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }),
    page.locator('input[type="submit"][value*="Login"], a[id*="cmdLogin"], button[id*="cmdLogin"]').first().click(),
  ]);
} catch (e) { console.warn('login form differed:', e?.message); }

await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

// Snapshot before expanding anything
await page.screenshot({ path: join(OUT, 'r6-6-01-accordion-default.png'), fullPage: false });

const inspect = await page.evaluate(() => {
  const apps = Array.from(document.querySelectorAll('[data-mf-app]'));
  return {
    appCount: apps.length,
    appSlugs: apps.map(a => a.getAttribute('data-mf-app-slug')),
    openCount: apps.filter(a => a.classList.contains('is-open')).length,
    formRows: document.querySelectorAll('.mf-sx-app-form').length,
    formRowsVisible: Array.from(document.querySelectorAll('.mf-sx-app-form')).filter(r => r.offsetParent !== null).length,
    appsTitleText: Array.from(document.querySelectorAll('.mf-sx-app-title')).map(t => t.textContent),
    rawJsonInDom: document.body.innerHTML.includes('"forms":['),
  };
});

// Click the chevron of the first collapsed app
const collapsedApps = await page.locator('[data-mf-app]:not(.is-open) [data-mf-app-toggle]').count();
if (collapsedApps > 0) {
  await page.locator('[data-mf-app]:not(.is-open) [data-mf-app-toggle]').first().click();
  await page.waitForTimeout(400);
}

await page.screenshot({ path: join(OUT, 'r6-6-02-accordion-expanded.png'), fullPage: false });

const inspectAfter = await page.evaluate(() => ({
  openCount: document.querySelectorAll('[data-mf-app].is-open').length,
  formRowsVisible: Array.from(document.querySelectorAll('.mf-sx-app-form')).filter(r => r.offsetParent !== null).length,
}));

const report = { inspect, inspectAfter, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r6-6-accordion-report.json'), JSON.stringify(report, null, 2));
await browser.close();
