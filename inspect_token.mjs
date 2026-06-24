import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const tokens = Array.from(document.querySelectorAll('input[name="__RequestVerificationToken"], input[name="__RequestVerificationToken"]'));
  return tokens.map(t => ({ outer: t.outerHTML.slice(0,300), formAction: t.closest('form')?.getAttribute('action') }));
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
