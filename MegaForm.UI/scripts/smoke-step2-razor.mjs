// Smoke test STEP 2 — Razor unified designer launcher button + opens shell
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

// Open builder on a form with Razor widget (form 334 had it from earlier QA)
try { await page.goto(`${BASE}/xx?mfFormId=339#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=339#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

// PROBE 1: shell globals exist
const p1 = await page.evaluate(() => ({
  hasOpenUnifiedDesigner: typeof window.MFUnifiedDesigner?.open === 'function' || typeof window.openUnifiedDesigner === 'function',
  hasMfRazorStudio: typeof window.MFRazorStudio?.open === 'function',
  buildBadge: window.__MF_PLUGIN_PRELOAD_BADGE__ || null
}));
console.log('=== PROBE 1: globals ===');
console.log(JSON.stringify(p1, null, 2));

// PROBE 2: find ALL buttons matching expected labels anywhere in document
const p2 = await page.evaluate(() => {
  const allButtons = Array.from(document.querySelectorAll('button'));
  const razorBtns = allButtons.filter(b => /Razor/.test(b.textContent || ''));
  const unifiedBtns = allButtons.filter(b => /Unified Designer|🧬/.test(b.textContent || ''));
  const razorCards = Array.from(document.querySelectorAll('.mf-canvas-field[data-type="Razor"], [data-type="Razor"]'));
  return {
    razorCardCount: razorCards.length,
    razorBtnSamples: razorBtns.slice(0, 3).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), parent: b.parentElement?.tagName + '.' + (b.parentElement?.className || '').split(' ')[0] })),
    unifiedBtnCount: unifiedBtns.length,
    unifiedBtnSamples: unifiedBtns.slice(0, 3).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), cls: b.className })),
    firstRazorCardHtml: razorCards[0] ? razorCards[0].outerHTML.slice(0, 400) : null
  };
});
console.log('=== PROBE 2: Razor card buttons ===');
console.log(JSON.stringify(p2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step2-razor-cards.png'), fullPage: false });

// PROBE 3: click the new Unified Designer button and verify shell opens
const p3 = await page.evaluate(async () => {
  const btns = Array.from(document.querySelectorAll('button'));
  const unifiedBtn = btns.find(b => /Open Unified Designer/i.test((b.textContent || '').trim()));
  if (!unifiedBtn) return { clicked: false, reason: 'no Unified Designer button' };
  unifiedBtn.click();
  await new Promise(r => setTimeout(r, 1500));
  const shell = document.querySelector('.mf-unified-designer-backdrop, .mf-unified-designer-shell, [data-mf-unified-designer]');
  const visible = shell ? getComputedStyle(shell).display !== 'none' : false;
  const tabs = shell ? Array.from(shell.querySelectorAll('.mf-unified-designer-tab')).map(t => (t.textContent || '').trim()).slice(0, 8) : [];
  return {
    clicked: true,
    shellExists: !!shell,
    shellVisible: visible,
    tabLabels: tabs
  };
});
console.log('=== PROBE 3: unified shell opens ===');
console.log(JSON.stringify(p3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step2-shell-open.png'), fullPage: false });

await browser.close();
