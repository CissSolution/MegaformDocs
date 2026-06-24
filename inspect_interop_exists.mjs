import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  return {
    hasOqtane: !!window.Oqtane,
    hasInterop: !!(window.Oqtane && window.Oqtane.Interop),
    submitFormType: typeof (window.Oqtane && window.Oqtane.Interop && window.Oqtane.Interop.submitForm),
    keys: window.Oqtane && window.Oqtane.Interop ? Object.keys(window.Oqtane.Interop).slice(0,20) : null
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
