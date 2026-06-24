// Smoke test STEP 4 — DataRepeater unified designer launcher + shell open
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

// Form 339 — Order Browser (DataRepeater orders + Razor items)
try { await page.goto(`${BASE}/xx?mfFormId=339#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=339#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(10000);

const p1 = await page.evaluate(() => ({
  hasOpenUnifiedDesigner: typeof window.MFUnifiedDesigner?.open === 'function' || typeof window.openUnifiedDesigner === 'function',
}));
console.log('=== PROBE 1: globals ===');
console.log(JSON.stringify(p1, null, 2));

const p2 = await page.evaluate(() => {
  const allButtons = Array.from(document.querySelectorAll('button'));
  const drCards = Array.from(document.querySelectorAll('[data-type="DataRepeater"]'));
  const mfdrBtns = allButtons.filter(b => (b.className || '').includes('mfdr-unified-launcher'));
  const layoutBtns = allButtons.filter(b => (b.className || '').includes('mfdr-card-designer-launcher'));
  return {
    drCardCount: drCards.length,
    mfdrUnifiedBtnCount: mfdrBtns.length,
    layoutBtnCount: layoutBtns.length,
    mfdrBtnSamples: mfdrBtns.slice(0, 3).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), cls: b.className })),
    firstCardHtml: drCards[0] ? drCards[0].outerHTML.slice(0, 400) : null
  };
});
console.log('=== PROBE 2: DataRepeater card buttons ===');
console.log(JSON.stringify(p2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step4-dr-cards.png'), fullPage: false });

const p3 = await page.evaluate(async () => {
  const btns = Array.from(document.querySelectorAll('button'));
  const unifiedBtn = btns.find(b => (b.className || '').includes('mfdr-unified-launcher'));
  if (!unifiedBtn) return { clicked: false, reason: 'no mfdr-unified-launcher button' };
  unifiedBtn.click();
  await new Promise(r => setTimeout(r, 1800));
  const shell = document.querySelector('.mf-unified-designer-backdrop, .mf-unified-designer-shell, [data-mf-unified-designer]');
  const visible = shell ? getComputedStyle(shell).display !== 'none' : false;
  const tabs = shell ? Array.from(shell.querySelectorAll('.mf-unified-designer-tab')).map(t => (t.textContent || '').trim()).slice(0, 10) : [];
  return { clicked: true, shellExists: !!shell, shellVisible: visible, tabLabels: tabs };
});
console.log('=== PROBE 3: shell opens ===');
console.log(JSON.stringify(p3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-step4-shell-open.png'), fullPage: false });

await browser.close();
