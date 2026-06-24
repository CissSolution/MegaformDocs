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
await page.waitForTimeout(10000);

const probe = await page.evaluate(() => {
  const fields = Array.from(document.querySelectorAll('.mf-field-group, [data-type]'));
  return {
    fieldCount: fields.length,
    types: fields.map(f => f.getAttribute('data-type')).slice(0, 20),
    apptCount: document.querySelectorAll('.mfw-appt, [class*="appt"]').length,
    mapCount: document.querySelectorAll('.mf-map-widget, [class*="map-widget"], [class*="mfw-map"]').length,
    phoneCount: document.querySelectorAll('.mfp-phone-shell, [class*="phone"]').length,
    msCount: document.querySelectorAll('.mfw-ms, .mf-ms, [class*="multi-select"]').length,
    iframes: document.querySelectorAll('iframe').length,
    formWrapClasses: document.querySelector('.mf-form, .mf-form-wrapper, [class*="mf-form"]')?.className || null
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
