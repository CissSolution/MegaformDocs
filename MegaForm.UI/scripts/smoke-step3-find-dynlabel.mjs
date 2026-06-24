// Find any form with a DynamicLabel field on the canvas
import { chromium } from 'playwright-core';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);

const formsToCheck = [259, 251, 339, 334, 293, 301, 302, 303];
for (const fid of formsToCheck) {
  try { await page.goto(`${BASE}/xx?mfFormId=${fid}#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
  catch {}
  await page.waitForTimeout(7000);
  const probe = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mf-canvas-field'));
    const types = cards.map(c => c.getAttribute('data-type'));
    const dyn = types.filter(t => t === 'DynamicLabel').length;
    return { count: cards.length, types: types.slice(0, 20), dyn };
  });
  console.log(`form=${fid} cards=${probe.count} types=${JSON.stringify(probe.types)} dyn=${probe.dyn}`);
}
await browser.close();
