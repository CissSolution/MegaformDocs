// B271 QA — Page-theme inheritance ("Page integration") visual + mechanism check.
// Run AFTER the new megaform-builder.js is deployed to live and form 861 has the
// inherit flags set (PowerShell sets/restores them around this script).
//
//   node mfqa/qa-page-integration.mjs
//
// 1) Builder discoverability: standard form 861 shows Page-integration ENABLED (and
//    reflects the saved flags); premium form 859 shows it DISABLED + lock note.
// 2) Mechanism proof: open the headless render of 861, inject a SIMULATED host skin
//    (html{font-family:Comic Sans} + :root{--bs-primary:#ff00aa}) and confirm the form
//    text inherits the font and the submit button borrows the primary colour.
import { launch, login, shot, BASE, OUT } from './lib.mjs';

const { browser, page, errs } = await launch();
await login(page);

async function openDesignGlobal(formId) {
  await page.goto(`${BASE}/?mfpanel=builder&formId=${formId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById('mf-mode-design'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.getElementById('mf-mode-design')?.click());
  await page.waitForTimeout(3500);
  // ensure Global subtab active
  await page.evaluate(() => document.querySelector('[data-mf-theme-subtab="global"]')?.click());
  await page.waitForTimeout(1500);
}

async function inspectPageIntegration(formId, label) {
  await openDesignGlobal(formId);
  const info = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select[data-mf-theme-inherit]')];
    const head = [...document.querySelectorAll('.mf-tr-section-head span')].map(s => s.textContent.trim());
    const lock = !!document.querySelector('.mf-tr-section .fa-lock');
    return {
      sectionPresent: head.includes('Page integration'),
      selectCount: sels.length,
      kinds: sels.map(s => s.getAttribute('data-mf-theme-inherit')),
      disabled: sels.map(s => s.disabled),
      values: sels.map(s => s.value),
      lockNote: lock,
    };
  });
  console.log(`\n[builder ${label} ${formId}] Page-integration =`, JSON.stringify(info));
  await shot(page, `b271-builder-${label}-${formId}.png`);
  return info;
}

// ---- 1) Builder discoverability ----
const std = await inspectPageIntegration(861, 'standard');
const prem = await inspectPageIntegration(859, 'premium');

// ---- 2) Mechanism proof on the headless render of 861 (flags set by caller) ----
await page.goto(`${BASE}/api/MegaForm/render/861`, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(2500);
const before = await page.evaluate(() => {
  const w = document.querySelector('.mf-form-wrapper');
  return { hasClass: !!w && w.className.includes('mf-inherit-type'), wrapperClass: w ? w.className : '(none)' };
});
// Inject a SIMULATED host skin
await page.addStyleTag({ content: `html, body { font-family: "Comic Sans MS", cursive !important; } :root { --bs-primary: #ff00aa; }` });
await page.waitForTimeout(800);
const after = await page.evaluate(() => {
  const pick = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
  const labelEl = document.querySelector('.mf-form-wrapper label') || document.querySelector('.mf-form-wrapper');
  const btn = document.querySelector('#mf-btn-submit, .mf-submit, button[type=submit], .mf-form-wrapper button');
  const lg = labelEl ? getComputedStyle(labelEl) : null;
  const bg = btn ? getComputedStyle(btn) : null;
  return {
    labelFont: lg ? lg.fontFamily : '(none)',
    btnBg: bg ? bg.backgroundColor : '(none)',
    btnText: btn ? (btn.textContent || '').trim().slice(0, 24) : '(none)',
  };
});
console.log('\n[render 861] before inject =', JSON.stringify(before));
console.log('[render 861] after simulated-skin inject =', JSON.stringify(after));
const fontInherited = /comic sans/i.test(after.labelFont);
const colorBorrowed = /255,\s*0,\s*170/.test(after.btnBg);  // rgb(255,0,170) = #ff00aa
console.log(`MECHANISM: font inherited = ${fontInherited} ; primary borrowed = ${colorBorrowed}`);
await shot(page, 'b271-render-861-simulated-skin.png');

console.log('\n=== SUMMARY ===');
console.log('standard 861 enabled+present:', std.sectionPresent && std.selectCount === 2 && std.disabled.every(d => !d));
console.log('premium 859 present+disabled+lock:', prem.sectionPresent && prem.selectCount === 2 && prem.disabled.every(d => d) && prem.lockNote);
console.log('render mechanism (font+color):', fontInherited && colorBorrowed);
console.log('console errors:', JSON.stringify(errs.slice(0, 6)));
await browser.close();
