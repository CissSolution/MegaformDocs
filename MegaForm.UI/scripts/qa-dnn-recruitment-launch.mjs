// Visual QA for multi-form Recruitment starter:
//  1. login DNN admin
//  2. GET /api/MegaForm/Starter/Status to see install state before
//  3. POST /api/MegaForm/Starter/Launch starterKey=recruitment
//  4. GET /api/MegaForm/Starter/Status again to verify all 3 forms detected

import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = 'http://dnn10322_megatest.ai';
const PAGE = '/Shop/New-Arrivals';
const USER = 'host';
const PASS = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function login(page) {
  await page.goto(BASE + '/Login?ReturnUrl=' + encodeURIComponent(PAGE), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(()=>{}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,400)); });

  await login(page);
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // === STATUS BEFORE ===
  const before = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const r = await fetch('/DesktopModules/MegaForm/API/Starter/Status', { credentials: 'same-origin', headers: h });
    return { status: r.status, body: await r.text() };
  });
  console.log('[status BEFORE]', before.status, before.body.slice(0, 800));

  // === LAUNCH RECRUITMENT ===
  const launch = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const h = { 'Content-Type': 'application/json' };
    if (sf) { h.RequestVerificationToken = sf.getAntiForgeryValue(); h.ModuleId = String(sf.getModuleId()); h.TabId = String(sf.getTabId()); }
    const moduleId = Number(window.__MF_PLATFORM__?.moduleId || 0);
    const payload = { starterKey: 'recruitment', moduleId, homeUrl: location.origin + location.pathname, currentUrl: location.href, currentPageUrl: location.origin + location.pathname };
    const t0 = Date.now();
    const r = await fetch('/DesktopModules/MegaForm/API/Starter/Launch', { method: 'POST', credentials: 'same-origin', headers: h, body: JSON.stringify(payload) });
    const text = await r.text();
    return { ms: Date.now() - t0, status: r.status, body: text.slice(0, 1200) };
  });
  console.log('[launch RECRUITMENT]', launch.status, 'took', launch.ms, 'ms');
  console.log(launch.body);

  // === STATUS AFTER ===
  await page.waitForTimeout(2000);
  const after = await page.evaluate(async () => {
    const sf = window.jQuery?.ServicesFramework?.(window.__MF_PLATFORM__?.moduleId || 0);
    const h = sf ? { RequestVerificationToken: sf.getAntiForgeryValue(), ModuleId: String(sf.getModuleId()), TabId: String(sf.getTabId()) } : {};
    const r = await fetch('/DesktopModules/MegaForm/API/Starter/Status', { credentials: 'same-origin', headers: h });
    return { status: r.status, body: await r.text() };
  });
  console.log('[status AFTER]');
  console.log(after.body);

  writeFileSync('qa-out/dnn-recruitment-launch.json', JSON.stringify({ before, launch, after, errs }, null, 2), 'utf8');

  await browser.close();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
