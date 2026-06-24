import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);
await page.goto('http://dnn10322_megaf.ai/xx?formid=335', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const r = await page.evaluate(() => {
  const tas = Array.from(document.querySelectorAll('textarea'));
  return tas.slice(0, 5).map(ta => ({ className: ta.className, resize: getComputedStyle(ta).resize, minH: getComputedStyle(ta).minHeight, h: Math.round(ta.getBoundingClientRect().height) }));
});
console.log(JSON.stringify(r));
await browser.close();
