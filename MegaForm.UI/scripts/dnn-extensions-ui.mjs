// Inspect DNN Extensions UI for deployment
import { chromium } from 'playwright-core';

const BASE   = 'http://dnn10322_megaf.ai';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function dnnLogin(page) {
  await page.goto(`${BASE}/Login?ReturnUrl=/Host/Extensions`, { waitUntil: 'networkidle', timeout: 60000 });
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
  console.log('Logged in. Current URL:', page.url());

  // Go to Extensions
  await page.goto(`${BASE}/Host/Extensions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Find all clickable elements related to install
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, input, button'))
      .filter(el => /install|upload|wizard|extension|module/i.test(el.innerText + ' ' + el.value + ' ' + el.title))
      .map(el => ({
        tag: el.tagName,
        text: (el.innerText || el.value || el.title || '').slice(0, 80),
        href: el.href || '',
        id: el.id || '',
        className: el.className || ''
      }));
  });
  console.log('\nInstall-related buttons/links:', JSON.stringify(buttons, null, 2));

  // Take screenshot
  await page.screenshot({ path: 'monitor/out/blog-inspect/dnn-extensions-ui.png', fullPage: true });
  console.log('\nScreenshot saved to monitor/out/blog-inspect/dnn-extensions-ui.png');

  await browser.close();
})();
