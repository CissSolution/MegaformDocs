import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);
await page.evaluate(() => { const l = document.querySelector('[data-mf-settings-link], a.mf-oq-btn'); if (l) l.click(); });
await page.waitForTimeout(7000);
// Ensure the Theme & Layout accordion is EXPANDED (click only an "Expand" toggle, not the header).
await page.evaluate(() => {
  const exp = [...document.querySelectorAll('a, button, span, div')].find(e => (e.textContent || '').trim() === 'Expand');
  if (exp) { try { exp.click(); } catch {} }
});
await page.waitForTimeout(1200);
const info = await page.evaluate(() => ({
  maxwRadios: document.querySelectorAll('input[type=radio][name="maxw"]').length,
  typeRadios: [...document.querySelectorAll('input[type=radio][name="inhtype"]')].map(r => ({ v: r.value, on: r.checked })),
  colRadios: [...document.querySelectorAll('input[type=radio][name="inhcol"]')].map(r => ({ v: r.value, on: r.checked })),
  hasPageIntegration: /Page integration/i.test(document.body.innerText || ''),
}));
console.log('RADIO CHECK:', JSON.stringify(info));
// scroll the Page integration into view for the screenshot
await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find(e => /Page integration/i.test(e.textContent || '') && e.children.length < 3); if (el) el.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(600);
await shot(page, 'b275-settings-radio.png');
console.log('SUMMARY radios present:', info.maxwRadios === 5 && info.typeRadios.length === 2 && info.colRadios.length === 2);
await browser.close();
