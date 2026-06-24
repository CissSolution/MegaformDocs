import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);

await page.goto('http://dnn10322_megaf.ai/xx?formid=335&_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });

for (const t of [1000, 2000, 2000, 3000]) {
  await page.waitForTimeout(t);
  const p = await page.evaluate(() => ({
    bodyClasses: document.body.className,
    mfutButtons: Array.from(document.querySelectorAll('.mfut-unified-launcher')).length,
    cardCount: Array.from(document.querySelectorAll('[data-type="UserTemplate"]')).length,
    firstCardHtml: document.querySelector('[data-type="UserTemplate"]')?.outerHTML?.slice(0, 250) || null
  }));
  console.log(JSON.stringify(p));
}

await browser.close();
