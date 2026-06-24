// [B65q] Find Appointment widget glyph i18n leak — capture DOM of slots area.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
// User screenshot showed form 1271 or similar. Let's try the latest forms.
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

// Open form 1270 which we know has Appointment widget
await page.goto(SITE + '/xx?formid=1270', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(10000);

// Find appointment widget, click date to open popover
const apptOpen = await page.evaluate(() => {
  const trigger = document.querySelector('.mfw-appt-trigger, .mfw-appt-shell input, .mfw-appt-datebar');
  if (!trigger) return { ok: false };
  trigger.click();
  return { ok: true };
});
await page.waitForTimeout(2000);
await page.screenshot({ path: 'qa-out/b65q-appt-open.png', fullPage: false });

// Search for the glyph leak text in DOM
const leak = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('*'));
  const hits = [];
  all.forEach(el => {
    const t = (el.textContent || '').trim();
    // Find elements whose direct text content (not descendant) contains glyph key
    if (/widget[._]+app(in?tt?ment|ointment).*glyph/i.test(t) && el.children.length === 0) {
      hits.push({ tag: el.tagName, cls: el.className.toString().slice(0, 80), text: t.slice(0, 200), parent: el.parentElement ? el.parentElement.className.slice(0, 60) : '' });
    }
  });
  // Also scan placeholder attributes and aria-label
  const inputs = Array.from(document.querySelectorAll('input, button, [aria-label], [placeholder], [title]'));
  const attrHits = [];
  inputs.forEach(el => {
    ['placeholder', 'aria-label', 'title'].forEach(attr => {
      const v = el.getAttribute(attr) || '';
      if (/widget[._]+app(in?tt?ment|ointment).*glyph/i.test(v)) {
        attrHits.push({ tag: el.tagName, attr, value: v.slice(0, 120), cls: el.className.toString().slice(0, 60) });
      }
    });
  });
  return { textHits: hits.slice(0, 8), attrHits: attrHits.slice(0, 12), totalElements: all.length };
});

writeFileSync('qa-out/b65q-leak.json', JSON.stringify(leak, null, 2));
await browser.close();
console.log(JSON.stringify(leak, null, 2));
