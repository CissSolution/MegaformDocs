// Find actual MegaForm moduleId on page /xx
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=${encodeURIComponent(PAGE)}`, { waitUntil: 'networkidle', timeout: 60000 });
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

  // Check page source for module IDs
  console.log('[1] Checking page source for module IDs...');
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const moduleIds = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    // DNN 9 module containers often have data-moduleid or dnn_MODULE_ModuleId
    const matches = [];
    const regex = /(?:data-moduleid|dnn_MODULE_|ModuleId=|moduleid=|mid=)[\"']?(\d+)/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
      matches.push(m[1]);
    }
    // Also look for __MF_PLATFORM__
    const mf = window.__MF_PLATFORM__ || {};
    return { matches: [...new Set(matches)], mfPlatform: mf };
  });
  console.log('[2] Module IDs found:', JSON.stringify(moduleIds, null, 2));

  // Try DNN Pages API
  console.log('[3] Trying to get page modules via API...');
  const pagesApi = await page.evaluate(async (base) => {
    try {
      const r = await fetch(`${base}/API/PersonaBar/Pages/GetPageList?searchKey=xx`, { credentials: 'same-origin' });
      return { status: r.status, text: await r.text() };
    } catch (e) {
      return { error: e.message };
    }
  }, BASE);
  console.log('Pages API:', JSON.stringify(pagesApi, null, 2));

  await browser.close();
})();
