import { launch, shot, BASE } from './lib.mjs';
const { browser, page } = await launch();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const r = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.mf-form-wrapper button, .mfp button, .mfp-submit, [class*="submit"]')];
  const info = btns.map(b => ({ cls: b.className, text: (b.textContent || '').trim().slice(0, 18), bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color }));
  const submit = btns.find(b => /submit|send|gửi/i.test(b.textContent || '') || /submit/i.test(b.className));
  if (submit) submit.scrollIntoView({ block: 'center' });
  const wrap = document.querySelector('.mf-form-wrapper');
  return { count: btns.length, info, mfpPrimary: wrap ? getComputedStyle(wrap).getPropertyValue('--mfp-primary').trim() : '', mfBtnBg: wrap ? getComputedStyle(wrap).getPropertyValue('--mf-btn-bg').trim() : '' };
});
console.log(JSON.stringify(r, null, 0));
await page.waitForTimeout(800);
await shot(page, 'b272-realskin-ON-submit.png');
await browser.close();
