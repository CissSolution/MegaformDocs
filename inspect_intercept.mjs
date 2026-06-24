import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const orig = window.Oqtane?.Interop?.submitForm;
  if (orig) {
    window.Oqtane.Interop.submitForm = function(path, fields) {
      window.__LAST_LOGIN_FIELDS = { path, fields: JSON.parse(JSON.stringify(fields)) };
      return orig.apply(this, arguments);
    };
  }
});
await page.fill('#username', 'host');
await page.fill('#password', 'abc@ABC1024');
await page.click('button.btn-primary:has-text("Login")');
await page.waitForTimeout(3000);
const data = await page.evaluate(() => window.__LAST_LOGIN_FIELDS || null);
console.log(JSON.stringify(data, null, 2));
await browser.close();
