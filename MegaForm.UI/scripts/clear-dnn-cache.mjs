// Clear DNN cache and verify Blog render
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

  // Navigate to DNN Server > Clear Cache (Persona Bar path)
  console.log('[1] Navigate to DNN Cache Management...');
  await page.goto(`${BASE}/Host/Server`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'monitor/out/deploy-verify/dnn-server.png', fullPage: true });

  // Look for Clear Cache button
  const cacheBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, input'))
      .filter(el => /clear.*cache|cache.*clear|clear.*server|restart/i.test(el.innerText + ' ' + el.value + ' ' + el.title));
    return btns.map(b => ({ tag: b.tagName, text: (b.innerText || b.value || b.title || '').slice(0, 60) }));
  });
  console.log('[2] Cache buttons found:', JSON.stringify(cacheBtn, null, 2));

  // If no button found, try alternative: Persona Bar > Settings > Server > Clear Cache
  // Or just navigate to the known DNN clear-cache endpoint
  console.log('[3] Trying direct clear cache navigation...');
  await page.goto(`${BASE}/Host/HostSettings?tab=AdvancedSettings`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'monitor/out/deploy-verify/dnn-advanced.png', fullPage: true });

  // Try clicking any clear cache link
  const clearLink = page.locator('a:has-text("Clear Cache"), button:has-text("Clear Cache"), input[value*="Clear Cache"]').first();
  if (await clearLink.count() > 0) {
    await clearLink.click();
    await page.waitForTimeout(3000);
    console.log('[4] Clear cache clicked');
  } else {
    console.log('[4] No Clear Cache button found');
  }

  // Alternative: try to restart app by touching web.config via an API if exposed
  // DNN sometimes exposes /API/PersonaBar/Server/ClearWebCache
  console.log('[5] Trying PersonaBar API to clear cache...');
  const pbResult = await page.evaluate(async (base) => {
    try {
      const r = await fetch(`${base}/API/PersonaBar/Server/ClearWebCache`, { method: 'POST', credentials: 'same-origin' });
      return { status: r.status, text: await r.text() };
    } catch (e) {
      return { error: e.message };
    }
  }, BASE);
  console.log('PersonaBar API result:', JSON.stringify(pbResult, null, 2));

  // Verify blog-home after cache clear attempt
  console.log('[6] Verify blog-home...');
  await page.goto(`${BASE}${PAGE}?vk=blog-home`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const diag = await page.evaluate(() => {
    const txt = (document.body.innerText || '').slice(0, 500);
    return {
      hasFormMount: !!document.querySelector('[id^="mf-form-"]'),
      hasListView: !!document.querySelector('[data-mf-listview="1"]'),
      hasDashboard: !!document.querySelector('#mf-dashboard-root'),
      loadingForm: /Loading form/.test(txt),
      bodyPreview: txt.slice(0, 200),
    };
  });
  console.log('[7] Diag:', JSON.stringify(diag, null, 2));
  await page.screenshot({ path: 'monitor/out/deploy-verify/blog-home-after-cache.png', fullPage: true });

  await browser.close();
})();
