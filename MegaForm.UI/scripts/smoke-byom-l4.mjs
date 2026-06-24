import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);
// Force scanner refresh first
await page.evaluate(async () => {
  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  await fetch('/DesktopModules/MegaForm/API/UserTemplate/Refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': token } });
});
const list = await page.evaluate(async () => {
  const res = await fetch('/DesktopModules/MegaForm/API/UserTemplate/List', { credentials: 'same-origin' });
  return await res.json();
});
console.log(JSON.stringify({ count: Array.isArray(list) ? list.length : null, names: Array.isArray(list) ? list.map(d => d.name) : null, kinds: Array.isArray(list) ? [...new Set(list.map(d => d.kind))] : null, errors: Array.isArray(list) ? list.filter(d => d.error).map(d => ({ name: d.name, error: d.error })) : null }));
await browser.close();
