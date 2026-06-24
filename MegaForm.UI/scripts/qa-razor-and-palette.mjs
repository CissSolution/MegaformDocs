// [B28-fix QA] Verify ProductLineItems gone from palette + Razor Studio opens
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

// Switch to WIDGETS tab
await page.evaluate(() => {
  const tab = document.querySelector('.mf-ptab[data-cat="plugins"]');
  if (tab) tab.click();
});
await page.waitForTimeout(1500);

// PROBE 1 — palette content
const probe1 = await page.evaluate(() => {
  const palette = document.getElementById('mf-plugin-palette');
  const items = Array.from(palette ? palette.querySelectorAll('.mf-palette-item') : [])
    .map(it => ({ type: it.getAttribute('data-type'), label: (it.querySelector('.mf-pi-label')?.textContent || '').trim() }));
  return {
    paletteVisible: !!palette && palette.offsetParent !== null,
    itemCount: items.length,
    items,
    hasProductLineItems: items.some(it => it.type === 'ProductLineItems'),
    hasRazor: items.some(it => it.type === 'Razor'),
    hasImageChoice: items.some(it => it.type === 'ImageChoice'),
    pluginRegistry: Object.keys((window.MegaFormWidgets && window.MegaFormWidgets._registry) || {}).sort(),
  };
});
console.log('=== PROBE 1 (palette WIDGETS tab) ===');
console.log(JSON.stringify(probe1, null, 2));
await page.screenshot({ path: join(OUT, 'qa-palette-after-fix.png'), fullPage: false });

// PROBE 2 — Razor Studio global + open via direct call
const probe2 = await page.evaluate(async () => {
  const out = {
    hasMFRazorStudio: typeof window.MFRazorStudio === 'object' && window.MFRazorStudio !== null,
    hasOpenFn: typeof (window.MFRazorStudio && window.MFRazorStudio.open) === 'function',
    error: null,
    popupAfterOpen: null,
  };
  if (!out.hasOpenFn) return out;
  try {
    window.MFRazorStudio.open({
      fieldKey: 'qa_razor',
      formId: 326,
      currentProps: {},
      initialTemplate: '',
      onPick: function () {},
      onSaveOverride: function () {},
      onApplyProps: function () {}
    });
  } catch (e) {
    out.error = String(e && e.message || e);
  }
  await new Promise(r => setTimeout(r, 1500));
  const pop = document.getElementById('mf-razor-studio-popup');
  out.popupAfterOpen = !!pop;
  if (pop) {
    out.popupSize = { w: pop.offsetWidth, h: pop.offsetHeight };
    out.popupHasTabs = !!pop.querySelector('[role="tablist"], .mf-rs-tabs, .mf-rs-tab');
    out.popupHTMLSnippet = (pop.innerHTML || '').slice(0, 200);
  }
  return out;
});
console.log('=== PROBE 2 (Razor Studio direct open) ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-razor-studio-direct.png'), fullPage: false });

// PROBE 3 — also test clicking the in-canvas "Razor Studio" button via a Razor field
const probe3 = await page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 600));
  // Close any open Razor popup first
  const oldPop = document.getElementById('mf-razor-studio-popup');
  if (oldPop) oldPop.remove();
  const B = window.MegaFormBuilder;
  if (!B || !B.state) return { error: 'no builder' };
  // Add a Razor field
  B.state.schema.fields.push({
    type: 'Razor', key: 'razor_test', label: 'Razor Test', widgetProps: { templateName: 'GreetingCard' }
  });
  B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
  B.callModule('canvas', 'render');
  await new Promise(r => setTimeout(r, 1500));
  // Find the injected "✨ Razor Studio" button on the field card
  const allBtns = Array.from(document.querySelectorAll('button'));
  const studioBtn = allBtns.find(b => (b.textContent || '').includes('Razor Studio'));
  const out = { studioBtnFound: !!studioBtn, studioBtnHTML: studioBtn ? studioBtn.outerHTML.slice(0, 200) : null };
  if (studioBtn) {
    studioBtn.click();
    await new Promise(r => setTimeout(r, 1500));
    out.popupAfterClick = !!document.getElementById('mf-razor-studio-popup');
  }
  return out;
});
console.log('=== PROBE 3 (canvas button click) ===');
console.log(JSON.stringify(probe3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-razor-studio-canvas-click.png'), fullPage: false });

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 15), null, 2));
await browser.close();
