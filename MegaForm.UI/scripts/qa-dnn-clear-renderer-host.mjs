// One-shot admin operation: clear the stored MegaForm RendererHost portal
// setting via the canonical authenticated API endpoint. User confirmed
// "Clear (an toàn nhất)" in the dashboard; this is the same call the
// ModuleConfig SaveRendererHost UI makes, just with empty fields.

import { chromium } from 'playwright-core';

const BASE = 'http://dnn10322_megatest.ai';
const PAGE = '/Shop/New-Arrivals';
const USER = 'host';
const PASS = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
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

  await dnnLogin(page);
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // Inspect current RendererHost setting
  const before = await page.evaluate(async () => {
    const r = await fetch('/DesktopModules/MegaForm/API/ModuleConfig/RendererHost', { credentials: 'same-origin' });
    return { status: r.status, body: await r.text() };
  });
  console.log('[before]', before.status, before.body);

  // Save empty values via the authenticated antiforgery'd endpoint
  const after = await page.evaluate(async () => {
    const sf = window.jQuery && window.jQuery.ServicesFramework
      ? window.jQuery.ServicesFramework(window.__MF_PLATFORM__?.moduleId || 0)
      : null;
    const headers = { 'Content-Type': 'application/json' };
    if (sf) {
      headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
      headers['ModuleId'] = String(sf.getModuleId());
      headers['TabId'] = String(sf.getTabId());
    }
    const r = await fetch('/DesktopModules/MegaForm/API/ModuleConfig/RendererHost', {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ url: '', tabId: 0, moduleId: 0 })
    });
    return { status: r.status, body: await r.text() };
  });
  console.log('[after-save]', after.status, after.body);

  // Confirm via GET
  const verify = await page.evaluate(async () => {
    const r = await fetch('/DesktopModules/MegaForm/API/ModuleConfig/RendererHost', { credentials: 'same-origin' });
    return { status: r.status, body: await r.text() };
  });
  console.log('[verify]', verify.status, verify.body);

  await browser.close();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
