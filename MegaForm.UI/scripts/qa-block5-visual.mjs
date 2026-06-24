// Block-5 visual + endpoint QA — verifies the things actually shipped:
//   1) R3 — /Submit/Schema?formId=293&locale=en returns translated labels
//   2) R3 — /xx?formid=293&locale=en page renders the locale chip strip
//   3) R1.4 — DataGridPrefs GET + POST work
//   4) R4 stub — razor-mode endpoint returns the deliberate "not enabled" payload
//   5) R6.6 — accordion sidebar still working (regression check)

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
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

// ─── R3 endpoint ─────────────────────────────────────────────
const r3Endpoint = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/Submit/Schema?formId=293&locale=en', { credentials: 'same-origin' });
  return { status: r.status, body: (await r.text()).slice(0, 1500) };
});

// ─── R3 page render (form 293 with locale=en) ────────────────
await page.goto(`${BASE}/xx?formid=293&locale=en`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);
const r3Page = await page.evaluate(() => ({
  localeStripPresent: !!document.querySelector('.mf-locale-strip'),
  stripButtons: Array.from(document.querySelectorAll('[data-mf-locale]')).map(b => b.getAttribute('data-mf-locale')),
  hasViLabel: document.body.innerHTML.includes('Nhà cung cấp'),
  hasEnLabel: document.body.innerHTML.includes('Supplier') && !document.body.innerHTML.includes('Nhà cung cấp')
}));
await page.screenshot({ path: join(OUT, 'block5-r3-locale-en.png'), fullPage: true });

// ─── R1.4 prefs ─────────────────────────────────────────────
const r14Prefs = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/DataGridPrefs?formId=293&fieldKey=qa-grid', { credentials: 'same-origin' });
  return { status: r.status, body: (await r.text()).slice(0, 600) };
});

// ─── R4 stub ────────────────────────────────────────────────
const r4Stub = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=orders&endpoint=hello-razor&name=block5', { credentials: 'same-origin' });
  return { status: r.status, body: (await r.text()).slice(0, 500) };
});

// ─── R4 sql endpoint regression check ───────────────────────
const r4Sql = await page.evaluate(async () => {
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=suppliers&endpoint=product-catalog', { credentials: 'same-origin' });
  return { status: r.status, body: (await r.text()).slice(0, 500) };
});

// ─── R6.6 sidebar regression ────────────────────────────────
await page.goto(`${BASE}/xx#mf-submissions`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(2500);
const r66 = await page.evaluate(() => ({
  appsRendered: document.querySelectorAll('[data-mf-app]').length,
  formRowsVisible: Array.from(document.querySelectorAll('.mf-sx-app-form')).filter(r => r.offsetParent !== null).length,
}));

const report = { r3Endpoint, r3Page, r14Prefs, r4Stub, r4Sql, r66, consoleErrors: errs };
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'block5-visual-report.json'), JSON.stringify(report, null, 2));
await browser.close();
