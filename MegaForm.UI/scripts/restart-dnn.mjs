// Try to restart DNN application to refresh module settings
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('input[id$=txtUsername]', { timeout: 30000 });
  await page.fill('input[id$=txtUsername]', USER);
  await page.fill('input[id$=txtPassword]', PASS);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
    page.locator('input[id$=cmdLogin],a[id$=cmdLogin],button:has-text("Login")').first().click(),
  ]);
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  await dnnLogin(page);

  // Try various DNN cache/restart endpoints
  const endpoints = [
    '/API/PersonaBar/Server/RestartApplication',
    '/API/PersonaBar/Server/ClearCache',
    '/API/PersonaBar/AdminLogs/ClearLog',
  ];

  for (const ep of endpoints) {
    console.log(`[→] Trying ${ep}...`);
    const result = await page.evaluate(async (url) => {
      try {
        const r = await fetch(url, { method: 'POST', credentials: 'same-origin' });
        return { status: r.status, text: await r.text() };
      } catch (e) {
        return { error: e.message };
      }
    }, `${BASE}${ep}`);
    console.log(`    Result:`, JSON.stringify(result, null, 2));
  }

  // Verify formId after restart attempt
  await page.goto(`${BASE}/xx`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  const mf = await page.evaluate(() => {
    const p = window.__MF_PLATFORM__ || {};
    return { moduleId: p.moduleId, formId: p.formId };
  });
  console.log('[Verify] __MF_PLATFORM__:', JSON.stringify(mf));

  await browser.close();
})();
