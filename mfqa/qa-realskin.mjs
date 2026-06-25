// Real-skin borrow QA. Home page (PageId 31) HeadContent injects Comic Sans + crimson --bs-primary.
// Run with borrow OFF then ON (DB toggled + host restarted between) to A/B the homepage form 864.
//   node mfqa/qa-realskin.mjs <label>
import { launch, shot, BASE } from './lib.mjs';
const label = process.argv[2] || 'state';
const { browser, page, errs } = await launch();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const data = await page.evaluate(() => {
  const g = (el) => el ? { font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor } : null;
  const wrap = document.querySelector('.mf-form-wrapper');
  return {
    bodyFont: getComputedStyle(document.body).fontFamily,
    rootBsPrimary: getComputedStyle(document.documentElement).getPropertyValue('--bs-primary').trim(),
    wrapperClass: wrap ? wrap.className : '(no wrapper)',
    wrapperMfPrimary: wrap ? getComputedStyle(wrap).getPropertyValue('--mf-primary').trim() : '',
    title: g(document.querySelector('.mfp-form-title, .mf-form-title')),
    label0: g(document.querySelector('.mf-form-wrapper label, .mfp label')),
    button: g(document.querySelector('#mf-btn-submit, .mfp-submit, .mf-form-wrapper button[type=submit], .mf-form-wrapper button')),
  };
});
console.log(`[${label}]`, JSON.stringify(data, null, 0));
await shot(page, `b272-realskin-${label}.png`);
console.log('errs:', JSON.stringify(errs.slice(0, 3)));
await browser.close();
