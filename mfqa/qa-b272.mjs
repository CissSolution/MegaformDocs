// B272 QA — gate removed: Page integration must be ENABLED on the AI .mfp form 864.
import { launch, login, shot, BASE } from './lib.mjs';
const { browser, page, errs } = await launch();
await login(page);

async function openDesignGlobal(formId) {
  await page.goto(`${BASE}/?mfpanel=builder&formId=${formId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById('mf-mode-design'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.getElementById('mf-mode-design')?.click());
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.querySelector('[data-mf-theme-subtab="global"]')?.click());
  await page.waitForTimeout(1500);
}

await openDesignGlobal(864);
const info = await page.evaluate(() => {
  const sels = [...document.querySelectorAll('select[data-mf-theme-inherit]')];
  const head = [...document.querySelectorAll('.mf-tr-section-head span')].map(s => s.textContent.trim());
  return {
    sectionPresent: head.includes('Page integration'),
    selectCount: sels.length,
    disabled: sels.map(s => s.disabled),
    lockNote: !!document.querySelector('.mf-tr-section .fa-lock'),
    // confirm dead knobs gone
    headings: head,
    hasHeadingWeight: !!document.querySelector('select[data-mf-theme-select="--mf-heading-weight"]'),
    hasLetterSpacing: !!document.querySelector('[data-mf-theme-var="--mf-letter-spacing"]'),
    hasTransitionsToggle: !!document.querySelector('[data-mf-theme-toggle="--mf-transitions-on"]'),
    hasEasing: !!document.querySelector('select[data-mf-theme-select="--mf-transition-easing"]'),
  };
});
console.log('[864 AI .mfp form] Page-integration =', JSON.stringify(info, null, 0));
await shot(page, 'b272-builder-864-ai-enabled.png');

console.log('\n=== SUMMARY ===');
console.log('864 section present + ENABLED + no lock:', info.sectionPresent && info.selectCount === 2 && info.disabled.every(d => !d) && !info.lockNote);
console.log('dead knobs removed (all false):', !info.hasHeadingWeight && !info.hasLetterSpacing && !info.hasTransitionsToggle && !info.hasEasing);
console.log('console errors:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
