import { launch, login, shot, BASE, OUT } from './lib.mjs';
import { join } from 'node:path';

const { browser, page, errs } = await launch();
await login(page);

async function openDesign(formId) {
  await page.goto(`${BASE}/?mfpanel=builder&formId=${formId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.getElementById('mf-mode-design'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.getElementById('mf-mode-design')?.click());
  await page.waitForTimeout(4000);
}

function previewFrame() {
  return page.frames().find(f => /MegaForm\/render|srcdoc/i.test(f.url()) || f.name().includes('preview')) ||
         page.frames().find(f => f !== page.mainFrame());
}

async function qa(formId, label) {
  await openDesign(formId);
  // 1) tab list
  const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-mf-theme-subtab]')].map(b => b.getAttribute('data-mf-theme-subtab')));
  console.log(`\n[${label} ${formId}] theme subtabs =`, JSON.stringify(tabs));
  await shot(page, `task1qa-${label}-design.png`);

  // 2) apply dramatic Global+Layout overrides through the adapter (the controls drive these exact vars)
  await page.evaluate(() => {
    const a = window.MFThemeTabAdapter;
    if (!a) return;
    a.setVar('--mf-form-max-width', '460px');
    a.setVar('--mf-form-radius', '24px');
    a.setVar('--mf-form-border', '4px solid #e11d48');
    a.setVar('--mf-form-shadow', '0 22px 55px rgba(225,29,72,.45)');
    a.setVar('--mf-form-padding', '46px 44px');
    a.flushPreview && a.flushPreview();
  });
  await page.waitForTimeout(2500);
  await shot(page, `task1qa-${label}-applied.png`);

  // 3) read the preview iframe card computed styles to prove the canvas reflects it
  const fr = previewFrame();
  let card = null;
  if (fr) {
    card = await fr.evaluate(() => {
      const e = document.querySelector('.mf-form-inner') || document.querySelector('.mfp[class*=mfp-]') || document.querySelector('.mf-form');
      if (!e) return null; const g = getComputedStyle(e);
      return { mw: g.maxWidth, radius: g.borderTopLeftRadius, border: g.borderTopWidth + ' ' + g.borderTopColor, shadow: g.boxShadow.slice(0, 20) };
    }).catch(() => null);
  }
  console.log(`[${label} ${formId}] preview card after overrides =`, JSON.stringify(card));
  return { tabs, card };
}

const std = await qa(861, 'standard');
const prem = await qa(849, 'premium');

console.log('\n=== TAB CHECK ===');
const tabsOk = JSON.stringify(std.tabs) === JSON.stringify(['global', 'layout', 'inspector']);
console.log('only Global/Layout/Inspector:', tabsOk, JSON.stringify(std.tabs));
console.log('console errors:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
