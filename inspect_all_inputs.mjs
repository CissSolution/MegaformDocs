import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
const inputs = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map(i => ({id:i.id, name:i.name, type:i.type, value:i.value?.slice(0,100), outer:i.outerHTML.slice(0,200)})));
console.log(JSON.stringify(inputs, null, 2));
await browser.close();
