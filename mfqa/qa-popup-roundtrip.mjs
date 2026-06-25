// B274 round-trip: set Page-integration in the popup -> Save -> reopen -> selects reflect it.
import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);

async function openPopup() {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { const l = document.querySelector('[data-mf-settings-link], a.mf-oq-btn'); if (l) l.click(); });
  await page.waitForTimeout(7000);
}
const readSelects = () => page.evaluate(() => {
  const sels = [...document.querySelectorAll('select')].filter(s => [...s.options].some(o => /Inherit from page|Borrow from page/i.test(o.text)));
  return sels.map(s => s.value);
});

await openPopup();
let before = await readSelects();
console.log('PASS1 selects:', JSON.stringify(before), '(formId bound:', before.length > 0, ')');
if (before.length === 0) { console.log('No inherit selects (module has no bound form in popup) — abort'); await browser.close(); process.exit(0); }

// Set both OFF ("theme"), save.
await page.evaluate(() => {
  [...document.querySelectorAll('select')].filter(s => [...s.options].some(o => /Inherit from page|Borrow from page/i.test(o.text)))
    .forEach(s => { s.value = 'theme'; s.dispatchEvent(new Event('change', { bubbles: true })); });
});
await page.waitForTimeout(600);
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Save module settings/i.test(x.textContent || '')); if (b) b.click(); });
console.log('saved OFF, waiting for reload...');
await page.waitForTimeout(7000);

// Reopen, read reflect.
await openPopup();
const afterOff = await readSelects();
console.log('PASS2 selects after save-OFF:', JSON.stringify(afterOff), '(expect theme,theme)');
await shot(page, 'b274-roundtrip-after-off.png');

console.log('\n=== SUMMARY ===');
console.log('round-trip reflect works (OFF persisted + reloaded):', afterOff.length === 2 && afterOff.every(v => v === 'theme'));
console.log('errs:', JSON.stringify(errs.slice(0, 3)));
await browser.close();
