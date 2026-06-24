import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
await ctx.clearCookies();
const page = await ctx.newPage();
await page.goto('http://dnn10322_megaf.ai/Login');
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded'),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()
]);

for (const formId of [337, 339]) {
  const r = await page.evaluate(async ({ formId }) => {
    try {
      const sf = window.$?.ServicesFramework?.(0);
      const token = sf?.getAntiForgeryValue?.() || '';
      const resp = await fetch(`/DesktopModules/MegaForm/API/RazorWidget/Render`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { RequestVerificationToken: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId, fieldKey: 'order_items_table', parameters: { order_id: '177' } })
      });
      const body = await resp.text();
      return { status: resp.status, body: body.slice(0, 800) };
    } catch (e) {
      return { error: String(e.message) };
    }
  }, { formId });
  console.log(`\n=== Form ${formId}: status=${r.status} ===`);
  console.log(r.body?.slice(0, 600) || r.error);
}
await browser.close();
