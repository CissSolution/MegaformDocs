// Smoke test the new POST /AiTools/PreviewSql endpoint (B38)
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
await ctx.clearCookies();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login');
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);

// PROBE 1 — valid SELECT
const p1 = await page.evaluate(async () => {
  const sf = window.$?.ServicesFramework?.(0);
  const token = sf?.getAntiForgeryValue?.() || '';
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/PreviewSql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
    body: JSON.stringify({ sql: 'SELECT TOP 3 Id, FullName, Email FROM Customers ORDER BY Id', connectionKey: 'DashboardDatabase', page: 1, pageSize: 5 })
  });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
console.log('=== PROBE 1: valid SELECT ===');
console.log(p1.status, p1.body);

// PROBE 2 — dangerous query rejected
const p2 = await page.evaluate(async () => {
  const sf = window.$?.ServicesFramework?.(0);
  const token = sf?.getAntiForgeryValue?.() || '';
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/PreviewSql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
    body: JSON.stringify({ sql: 'DROP TABLE Customers', connectionKey: 'DashboardDatabase' })
  });
  return { status: r.status, body: (await r.text()).slice(0, 400) };
});
console.log('=== PROBE 2: dangerous SQL (should be rejected) ===');
console.log(p2.status, p2.body);

// PROBE 3 — empty SQL
const p3 = await page.evaluate(async () => {
  const sf = window.$?.ServicesFramework?.(0);
  const token = sf?.getAntiForgeryValue?.() || '';
  const r = await fetch('/DesktopModules/MegaForm/API/AiTools/PreviewSql', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
    body: JSON.stringify({ sql: '', connectionKey: 'DashboardDatabase' })
  });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
});
console.log('=== PROBE 3: empty SQL (should be 400) ===');
console.log(p3.status, p3.body);

await browser.close();
