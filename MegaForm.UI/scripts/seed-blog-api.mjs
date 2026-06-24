// Seed Blog starter via DNN API with antiforgery token
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const PAGE   = '/xx';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=${encodeURIComponent(PAGE + '#mf-dashboard')}`, { waitUntil: 'networkidle', timeout: 60000 });
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

  console.log('[1] Login...');
  await dnnLogin(page);

  // Navigate to a page where we can get antiforgery token
  console.log('[2] Getting antiforgery token...');
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Extract token from DNN
  const tokenInfo = await page.evaluate(() => {
    const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
    const cookieToken = document.cookie.split(';').find(c => c.trim().startsWith('__RequestVerificationToken='));
    return {
      inputToken: tokenInput ? tokenInput.value : null,
      cookieToken: cookieToken ? cookieToken.trim() : null,
      cookies: document.cookie
    };
  });
  console.log('[3] Token info:', JSON.stringify(tokenInfo, null, 2));

  // Call Launch API via page.evaluate (shares cookies automatically)
  console.log('[4] Calling Starter/Launch API...');
  const launchResult = await page.evaluate(async ({ base, token }) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['RequestVerificationToken'] = token;
      const r = await fetch(`${base}/DesktopModules/MegaForm/API/Starter/Launch`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({
          starterKey: 'blog',
          moduleId: 1477,
          homeUrl: `${base}/xx`,
          currentPageUrl: `${base}/xx`
        })
      });
      const text = await r.text();
      return { status: r.status, text: text.slice(0, 800) };
    } catch (e) {
      return { status: 0, error: e.message };
    }
  }, { base: BASE, token: tokenInfo.inputToken });

  console.log('[5] Launch result:', JSON.stringify(launchResult, null, 2));

  // Also try SetupBlog endpoint
  console.log('[6] Calling SetupBlog API...');
  const setupResult = await page.evaluate(async ({ base, token }) => {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['RequestVerificationToken'] = token;
      const r = await fetch(`${base}/DesktopModules/MegaForm/API/Starter/SetupBlog`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({
          moduleId: 1477,
          homeUrl: `${base}/xx`
        })
      });
      const text = await r.text();
      return { status: r.status, text: text.slice(0, 800) };
    } catch (e) {
      return { status: 0, error: e.message };
    }
  }, { base: BASE, token: tokenInfo.inputToken });

  console.log('[7] SetupBlog result:', JSON.stringify(setupResult, null, 2));

  // Verify by reloading dashboard
  await page.goto(`${BASE}${PAGE}#mf-dashboard`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  const formCount = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    const m = txt.match(/(\d+)\s*forms/i);
    return m ? m[1] : 'unknown';
  });
  console.log('[8] Form count after seed:', formCount);

  await page.screenshot({ path: 'monitor/out/deploy-verify/dashboard-after-seed.png', fullPage: true });
  await browser.close();
})();
