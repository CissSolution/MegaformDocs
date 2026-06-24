// Smoke test STEP 3 — DynamicLabel unified designer launcher button + opens shell
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.clearCookies();
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click();
await page.waitForTimeout(4000);

// Form 266 confirmed to have DynamicLabel via MF_Forms SchemaJson grep
try { await page.goto(`${BASE}/xx?mfFormId=266#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=266#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

// PROBE 1: globals
const p1 = await page.evaluate(() => ({
  hasOpenUnifiedDesigner: typeof window.MFUnifiedDesigner?.open === 'function' || typeof window.openUnifiedDesigner === 'function',
  hasDynLabelMount: typeof window.MFDynLabelDesigner?.mount === 'function' || typeof window.mountDynLabelTemplates === 'function',
  buildBadge: window.__MF_PLUGIN_PRELOAD_BADGE__ || null
}));
console.log('=== PROBE 1: globals ===');
console.log(JSON.stringify(p1, null, 2));

// PROBE 2: find DynamicLabel cards + launcher buttons
const p2 = await page.evaluate(() => {
  const allButtons = Array.from(document.querySelectorAll('button'));
  const unifiedBtns = allButtons.filter(b => /Open Unified Designer|🧬/.test(b.textContent || ''));
  const dynCards = Array.from(document.querySelectorAll('.mf-canvas-field[data-type="DynamicLabel"], [data-type="DynamicLabel"]'));
  const layoutBtns = allButtons.filter(b => /Layout/i.test(b.textContent || ''));
  return {
    dynLabelCardCount: dynCards.length,
    unifiedBtnCount: unifiedBtns.length,
    unifiedBtnSamples: unifiedBtns.slice(0, 5).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), cls: b.className })),
    layoutBtnCount: layoutBtns.length,
    firstCardHtml: dynCards[0] ? dynCards[0].outerHTML.slice(0, 400) : null
  };
});
console.log('=== PROBE 2: DynLabel card buttons ===');
console.log(JSON.stringify(p2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step3-dynlabel-cards.png'), fullPage: false });

// PROBE 3: click the Unified Designer button on a DynLabel card
const p3 = await page.evaluate(async () => {
  const btns = Array.from(document.querySelectorAll('button'));
  const unifiedBtn = btns.find(b => /Open Unified Designer/i.test((b.textContent || '').trim()) && (b.className || '').includes('mfdl-unified-launcher'));
  if (!unifiedBtn) {
    const anyUnified = btns.find(b => /Open Unified Designer/i.test((b.textContent || '').trim()));
    return { clicked: false, reason: 'no mfdl-unified-launcher button', anyUnifiedClass: anyUnified?.className || null };
  }
  unifiedBtn.click();
  await new Promise(r => setTimeout(r, 1800));
  const shell = document.querySelector('.mf-unified-designer-backdrop, .mf-unified-designer-shell, [data-mf-unified-designer]');
  const visible = shell ? getComputedStyle(shell).display !== 'none' : false;
  const tabs = shell ? Array.from(shell.querySelectorAll('.mf-unified-designer-tab')).map(t => (t.textContent || '').trim()).slice(0, 10) : [];
  return {
    clicked: true,
    shellExists: !!shell,
    shellVisible: visible,
    tabLabels: tabs
  };
});
console.log('=== PROBE 3: shell opens ===');
console.log(JSON.stringify(p3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step3-shell-open.png'), fullPage: false });

await browser.close();
