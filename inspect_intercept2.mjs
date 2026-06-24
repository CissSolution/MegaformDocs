import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on('console', msg => logs.push(msg.text()));
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const orig = window.Oqtane.Interop.submitForm;
  window.Oqtane.Interop.submitForm = function(path, fields) {
    console.log('INTERCEPT_LOGIN_FIELDS:' + JSON.stringify({path, fields}));
    return orig.apply(this, arguments);
  };
});
await page.fill('#username', 'host');
await page.fill('#password', 'abc@ABC1024');
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {}),
  page.click('button.btn-primary:has-text("Login")')
]);
console.log('URL after:', page.url());
console.log('LOGS:', JSON.stringify(logs.filter(l => l.includes('INTERCEPT_LOGIN_FIELDS')), null, 2));
await browser.close();
