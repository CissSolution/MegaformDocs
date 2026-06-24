// Monkey-patch document.body.classList to trace when state-builder is added/removed
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(4000);

// Install monkey-patch on every new doc BEFORE any page script runs
await page.addInitScript(() => {
  // Use a property descriptor override on body
  const observer = new MutationObserver(records => {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'class') {
        console.log('BODY-CLASS-CHANGE: "' + document.body.className + '"');
      }
    }
  });
  // Wait for body via promise polling
  const tryStart = () => {
    if (document.body) {
      console.log('PATCH-INIT: body.className="' + document.body.className + '"');
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } else {
      setTimeout(tryStart, 10);
    }
  };
  tryStart();
});

await page.goto('http://dnn10322_megaf.ai/xx?formid=335&_=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);

console.log('=== console (relevant) ===');
logs.filter(l => /BODY-CLASS|PATCH-INIT|state-builder/.test(l)).forEach(l => console.log(l));
const final = await page.evaluate(() => ({
  bodyClasses: document.body.className,
  mfutButtons: document.querySelectorAll('.mfut-unified-launcher').length
}));
console.log('=== FINAL ===');
console.log(JSON.stringify(final, null, 2));

await browser.close();
