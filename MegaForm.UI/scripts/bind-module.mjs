// Try to bind MegaForm module to Blog form via UI
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

  // Go to page /xx in edit mode
  console.log('[1] Navigate to /xx with DNN edit mode...');
  await page.goto(`${BASE}${PAGE}?ctl=Module&mid=1477`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'monitor/out/deploy-verify/dnn-module-settings.png', fullPage: true });

  // Check for module settings form
  const settings = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    return {
      hasSettings: /settings|configuration|form|view/i.test(txt),
      bodyPreview: txt.slice(0, 300),
      selectInputs: Array.from(document.querySelectorAll('select')).map(s => ({ id: s.id, name: s.name, options: Array.from(s.options).slice(0,5).map(o => o.text) })),
    };
  });
  console.log('[2] Settings page:', JSON.stringify(settings, null, 2));

  // Alternative: try DNN module action menu
  console.log('[3] Try DNN module action menu...');
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  // Look for module action gear icon or settings link
  const actions = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button, span, div'))
      .filter(el => /settings|configure|edit|module|manage/i.test(el.innerText + ' ' + el.title))
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || el.title || '').slice(0, 60),
        className: (el.className || '').slice(0, 60),
      }))
      .slice(0, 20);
  });
  console.log('[4] Action elements:', JSON.stringify(actions, null, 2));

  await page.screenshot({ path: 'monitor/out/deploy-verify/dnn-page-actions.png', fullPage: true });

  await browser.close();
})();
