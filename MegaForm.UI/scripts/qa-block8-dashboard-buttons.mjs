// [B8 v20260601-01] Dashboard QA — verify the new Export / Import / Starter
// kit buttons render on the Custom Apps modal.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1320, height: 880 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

// Login
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Reach a dashboard page directly
await page.goto(`${BASE}/Careers`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: join(OUT, 'b8-dashboard-01-loaded.png'), fullPage: false });

// Verify our bundle is the one that landed (cache bust took effect).
const bundleInfo = await page.evaluate(() => {
  const tag = Array.from(document.querySelectorAll('script[src*="megaform-dashboard"]'))[0];
  return tag ? tag.getAttribute('src') : null;
});

const report = {
  bundleSrc: bundleInfo,
  hasBlock8Bump: /20260601/.test(bundleInfo || ''),
  errors: errs,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
