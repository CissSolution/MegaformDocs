// [2026-06-28] Date field must use the NEW mf-cal calendar picker (SSR parity with the client,
// not a native <input type=date>), and for date-only it must COMMIT + CLOSE on a day click with
// NO Apply button. Visual QA on :5000.
import { launch, login, BASE, OUT, shot } from './lib.mjs';
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(`  ${c ? '✅' : '❌'} ${n}${x ? '  — ' + x : ''}`); };

const { browser, page, errs } = await launch(false);
try {
  if (!await login(page)) { console.log('LOGIN FAILED'); process.exit(2); }
  await page.goto(`${BASE}/?mfpanel=dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Create a form with a Date field.
  await page.evaluate(() => { try { window.MegaFormWizard?.open(); } catch {} });
  await page.waitForSelector('#mf-wizard-root', { timeout: 8000 }).catch(() => {});
  await page.fill('#mf-wizard-root .mfw-in', 'Date Picker QA');
  const blank = page.locator('#mf-wizard-root .mfw-pick', { hasText: 'Blank Form' }).first();
  if (await blank.count()) await blank.click();
  await page.waitForTimeout(300);
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click();
  await page.waitForTimeout(600);
  const date = page.locator('#mf-wizard-root .mfw-pick', { hasText: /^Date$/ }).first();
  if (await date.count()) { await date.click(); await page.waitForTimeout(220); }
  const cont = async () => { await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.primary:not(.cta)').click(); await page.waitForTimeout(500); };
  await cont(); await cont(); await cont();
  await page.locator('#mf-wizard-root .mfw-foot .mfw-btn.cta').first().click();
  let booted = false;
  for (let i = 0; i < 45; i++) { booted = await page.evaluate(() => !!(window.MegaFormBuilder?.state?.schema?.fields?.length)).catch(() => false); if (booted) break; await page.waitForTimeout(1000); }
  const formId = (page.url().match(/formId=(\d+)/) || [])[1];
  ok('form created', booted && !!formId, 'formId ' + formId);

  // (A) SSR uses the new mf-cal shell, NOT native <input type=date>.
  const ssr = await page.evaluate(async (id) => { const r = await fetch('/api/MegaForm/render/' + id, { credentials: 'same-origin' }); return await r.text(); }, formId);
  ok('SSR uses NEW mf-cal picker (data-mf-cal)', /data-mf-cal="1"/.test(ssr) && /mf-cal-trigger/.test(ssr));
  ok('SSR has NO old native <input type="date">', !/type="date"/.test(ssr));

  // Load the form, open the picker, verify NO Apply + click-day closes.
  await page.goto(`${BASE}/api/MegaForm/render/${formId}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  ok('mf-cal present on page', await page.$('.mf-cal[data-mf-cal="1"]') !== null);
  await page.locator('.mf-cal .mf-cal-trigger').first().click();
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() => {
    const root = document.querySelector('.mf-cal[data-mf-cal="1"]');
    return { isOpen: !!root && root.classList.contains('is-open'), hasApply: !!document.querySelector('.mf-cal-apply, [data-action="apply"]'), days: document.querySelectorAll('.mf-cal-day[data-day]').length };
  });
  console.log('  picker opened:', JSON.stringify(opened));
  ok('picker panel opens', opened.isOpen && opened.days > 0);
  ok('NO Apply button (date-only)', opened.hasApply === false);
  await shot(page, 'qa-dp-1-open.png');

  // Click a day → should commit + close immediately.
  await page.locator('.mf-cal-day[data-day]:not(.is-empty)').filter({ hasText: /^15$/ }).first().click();
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const root = document.querySelector('.mf-cal[data-mf-cal="1"]');
    const hidden = root?.querySelector('.mf-cal-hidden');
    const valTxt = root?.querySelector('.mf-cal-value')?.textContent || '';
    return { closed: !!root && !root.classList.contains('is-open'), value: hidden?.value || '', valTxt };
  });
  console.log('  after day click:', JSON.stringify(after));
  ok('clicking a day CLOSES the picker (no Apply needed)', after.closed);
  ok('clicking a day commits the value', after.value.length > 0, after.value);
  ok('trigger shows the picked date', /\d/.test(after.valTxt) && after.valTxt !== 'Select date...');
  await shot(page, 'qa-dp-2-after.png');

  const fatal = errs.filter(e => /Cannot read|is not a function|TypeError/.test(e));
  ok('no fatal console errors', fatal.length === 0, fatal.slice(0, 2).join(' | '));

  console.log(`\n===== RESULT: ${fail ? '❌ ' + fail + ' FAILED' : '✅ ALL PASS'} =====`);
} catch (e) { console.error('FATAL', e); fail++; await shot(page, 'qa-dp-error.png').catch(() => {}); } finally { await browser.close(); process.exit(fail ? 1 : 0); }
