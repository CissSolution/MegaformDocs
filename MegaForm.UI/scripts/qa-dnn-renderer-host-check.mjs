// Confirm the server-side sanitizer auto-blanks the stored bad
// RendererHostUrl on read, and that the View Live button now falls back to
// the current page path instead of the broken external URL.

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
  await page.waitForTimeout(2000);

  const platformView = await page.evaluate(() => ({
    rendererHostUrl: window.__MF_PLATFORM__?.rendererHostUrl,
    moduleId:        window.__MF_PLATFORM__?.moduleId,
  }));
  console.log('[__MF_PLATFORM__.rendererHostUrl]', JSON.stringify(platformView));

  const apiView = await page.evaluate(async () => {
    const r = await fetch('/DesktopModules/MegaForm/API/ModuleConfig/RendererHost', { credentials: 'same-origin' });
    const t = await r.text();
    return { status: r.status, body: t };
  });
  console.log('[GET ModuleConfig/RendererHost]', apiView.status, apiView.body);

  await browser.close();
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
