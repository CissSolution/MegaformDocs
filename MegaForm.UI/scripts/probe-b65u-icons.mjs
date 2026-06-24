// [B65u] Verify action icons enlarged + color-coded on dashboard.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// Open dashboard (megaform admin route)
await page.goto(SITE + '/megaform/Home', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);

// Click "Form Dashboard" button
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('a, button'));
  const dashBtn = btns.find(b => /form dashboard/i.test((b.textContent || '').trim()));
  if (dashBtn) dashBtn.click();
});
await page.waitForTimeout(8000);
await page.screenshot({ path: 'qa-out/b65u-dashboard.png', fullPage: false });

const icons = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.mf-ic-btn'));
  return {
    count: btns.length,
    samples: btns.slice(0, 8).map(b => {
      const cs = getComputedStyle(b);
      return {
        kind: b.getAttribute('data-mf-ic-kind') || '',
        title: b.getAttribute('title') || '',
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
        bg: cs.backgroundColor,
        color: cs.color,
        border: cs.borderTopColor
      };
    })
  };
});

await browser.close();
console.log(JSON.stringify(icons, null, 2));
