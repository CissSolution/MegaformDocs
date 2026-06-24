import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:5070/login', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
// Look for any element whose value or content contains RequestVerificationToken
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const matches = [];
  for (const el of all) {
    for (const attr of el.attributes || []) {
      if (attr.value && attr.value.includes('RequestVerificationToken')) {
        matches.push({ tag: el.tagName, attr: attr.name, value: attr.value.slice(0,200) });
      }
      if (attr.value && /CfDJ8[\w-]{50,}/.test(attr.value)) {
        matches.push({ tag: el.tagName, attr: attr.name, token: attr.value.match(/CfDJ8[\w-]{50,}/)?.[0] });
      }
    }
  }
  // also window keys
  const winKeys = Object.keys(window).filter(k => /token|xsrf|antiforg|verification/i.test(k));
  return { matches: matches.slice(0,20), winKeys };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
