// Relaunch Blog starter to bind module
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

  // Get token
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);
  const token = await page.evaluate(() => {
    const inp = document.querySelector('input[name="__RequestVerificationToken"]');
    return inp ? inp.value : null;
  });

  // Call Launch again with moduleId=1477
  console.log('[1] Calling Launch API with moduleId=1477...');
  const result = await page.evaluate(async ({ base, token, pagePath }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['RequestVerificationToken'] = token;
    const r = await fetch(`${base}/DesktopModules/MegaForm/API/Starter/Launch`, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({
        starterKey: 'blog',
        moduleId: 1477,
        homeUrl: `${base}${pagePath}`,
        currentPageUrl: `${base}${pagePath}`
      })
    });
    return { status: r.status, text: await r.text() };
  }, { base: BASE, token, pagePath: PAGE });

  console.log('[2] Result:', JSON.stringify(result, null, 2));

  // Clear DNN cache by navigating to Host > Cache
  console.log('[3] Clearing cache...');
  await page.goto(`${BASE}/Host/HostSettings?tab=AdvancedSettings&subtab=PerformanceSettings`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'monitor/out/deploy-verify/dnn-cache.png', fullPage: true });

  // Verify blog-home after clear
  console.log('[4] Verify blog-home...');
  await page.goto(`${BASE}${PAGE}?vk=blog-home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const diag = await page.evaluate(() => {
    const txt = (document.body.innerText || '').slice(0, 500);
    return {
      hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
      hasListView: !!document.querySelector('[data-mf-listview="1"]'),
      hasDashboard: !!document.querySelector('#mf-dashboard-root'),
      loadingForm: /Loading form/.test(txt),
      notPublished: /not published yet/i.test(txt),
      bodyPreview: txt.slice(0, 200),
    };
  });
  console.log('[5] Diag:', JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'monitor/out/deploy-verify/blog-home-after-relaunch.png', fullPage: true });

  await browser.close();
})();
