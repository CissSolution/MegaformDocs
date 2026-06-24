import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE   = 'http://localhost:5050';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'qa-out/login-page.png', fullPage: true });

  // Dump every input on the page
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input,button')).map(el => ({
      tag: el.tagName,
      type: el.getAttribute('type'),
      name: el.getAttribute('name'),
      id: el.id,
      placeholder: el.getAttribute('placeholder'),
      text: (el.textContent || '').trim().slice(0, 60),
      classes: el.className.slice(0, 100),
      visible: el.offsetParent !== null,
    }));
  });
  writeFileSync('qa-out/login-inputs.json', JSON.stringify(inputs, null, 2));
  console.log('inputs/buttons:', inputs.length);
  console.log(inputs.filter(i => i.visible && (i.tag === 'INPUT' || (i.tag === 'BUTTON' && i.text))).slice(0, 12));
  await browser.close();
})();
