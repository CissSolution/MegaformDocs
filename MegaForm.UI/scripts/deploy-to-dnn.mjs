// Auto-deploy MegaForm package to DNN site via browser automation
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE   = 'http://dnn10322_megaf.ai';
const USER   = 'host';
const PASS   = 'dnnhost';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PACKAGE = 'E:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\MegaFormSolution_280_Oqtane_um\\CustomerDelivery\\2026-05-25_DNN_MegaForm_01.06.22_Install.zip';

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

  console.log('[1] Login to DNN...');
  await dnnLogin(page);
  console.log('[1] Logged in. URL:', page.url());

  // Check if already installed
  console.log('[2] Checking Extensions...');
  await page.goto(`${BASE}/Host/Extensions`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const hasMegaForm = await page.evaluate(() => {
    const txt = document.body.innerText || '';
    return txt.includes('MegaForm');
  });
  console.log('[2] MegaForm already installed?', hasMegaForm);

  if (!hasMegaForm) {
    console.log('[3] Installing MegaForm...');
    // DNN Extensions > Install Extension Wizard
    // Look for "Install Extension" button/link
    const installLink = page.locator('a:has-text("Install Extension"), a:has-text("Install Extension Wizard"), input[value*="Install Extension"]').first();
    if (await installLink.count() > 0) {
      await installLink.click();
      await page.waitForTimeout(2000);

      // Upload file
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(PACKAGE);
        await page.waitForTimeout(3000);

        // Next/Install button
        const nextBtn = page.locator('input[id$=cmdNext], input[value="Next"], input[value="Install"], a:has-text("Next"), a:has-text("Install")').first();
        if (await nextBtn.count() > 0) {
          await nextBtn.click();
          await page.waitForTimeout(5000);
          console.log('[3] Install initiated. Screenshot saved.');
        }
      }
    }
  } else {
    console.log('[3] MegaForm already installed. Skipping install.');
  }

  await page.screenshot({ path: 'monitor/out/blog-inspect/dnn-extensions.png', fullPage: true });

  // Navigate to a page to add module (e.g. /Shop/New-Arrivals or create new page)
  console.log('[4] Navigate to Blog page check...');
  await page.goto(`${BASE}/Shop/New-Arrivals`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  const hasMfOnPage = await page.evaluate(() => {
    return !!document.querySelector('[id^="mf-form-"], #mf-dashboard-root, [data-mf-listview="1"]');
  });
  console.log('[4] MegaForm on /Shop/New-Arrivals?', hasMfOnPage);

  await page.screenshot({ path: 'monitor/out/blog-inspect/dnn-shop-page.png', fullPage: true });

  await browser.close();
  console.log('[Done] Deployment inspection complete.');
})();
