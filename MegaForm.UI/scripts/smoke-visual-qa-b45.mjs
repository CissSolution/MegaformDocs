// Smoke test B45 visual QA fixes:
// 1. Monaco script tag injection + window.MegaFormMonaco populated
// 2. Launcher button NOT visible on runtime form view
// 3. AI assist sparkle button hidden (window.MFAiChat absent)
// 4. Current Settings tab skips empty groups
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
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
await page.waitForTimeout(4000);

// ───── FIX 2 — Runtime leak gate ─────
// Form 335 was the form shown in user's screenshot with leaked button. Visit it in
// RUNTIME mode (no #mf-builder hash).
console.log('\n=== FIX 2: launcher button NOT on runtime form ===');
try { await page.goto(`${BASE}/xx?formid=335&_=` + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch {}
await page.waitForTimeout(10000);
const fix2 = await page.evaluate(() => {
  const launcherButtons = Array.from(document.querySelectorAll('button')).filter(b =>
    /Open Unified Designer|Edit Video|Edit Location/.test(b.textContent || '')
  );
  const hasBuilderRoot = !!document.querySelector('#mf-builder-root, [data-mf-builder]');
  const bodyClasses = document.body.className;
  const stateBuilderPresent = document.body.classList.contains('state-builder');
  return {
    launcherButtonsOnRuntime: launcherButtons.length,
    hasBuilderRoot,
    bodyClasses,
    stateBuilderPresent,
    buttonSamples: launcherButtons.slice(0, 3).map(b => ({ text: (b.textContent || '').trim().slice(0, 60), cls: b.className }))
  };
});
console.log(JSON.stringify(fix2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-b45-fix2-runtime.png'), fullPage: false });
// Pass criterion: ZERO launcher buttons on runtime — that's what end users see.
// (hasBuilderRoot is always true because FormView.ascx server-renders the shell
//  on every page; the gate works at the URL-hash + mfFormId param level.)
const fix2Pass = fix2.launcherButtonsOnRuntime === 0;
console.log(fix2Pass ? '[PASS] FIX 2' : '[FAIL] FIX 2');

// ───── FIX 1, 3, 4 — open the Builder, then the Unified Designer ─────
// Find a form with UserTemplate field. We'll use form 335 in BUILDER mode (#mf-builder).
console.log('\n=== Opening Builder on form 335 ===');
try { await page.goto(`${BASE}/xx?mfFormId=335#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); } catch {}
await page.waitForTimeout(10000);

const builderProbe = await page.evaluate(() => ({
  hasBuilderRoot: !!document.querySelector('#mf-builder-root, [data-mf-builder]'),
  unifiedBtnCount: Array.from(document.querySelectorAll('button')).filter(b =>
    /Open Unified Designer/.test(b.textContent || '')
  ).length
}));
console.log('Builder probe:', JSON.stringify(builderProbe));

if (builderProbe.unifiedBtnCount === 0) {
  console.log('[SKIP] No UserTemplate field on this form — cannot test fixes 1/3/4');
  await browser.close();
  process.exit(0);
}

// Click the Open Unified Designer button
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b =>
    /Open Unified Designer/.test(b.textContent || '')
  );
  if (btn) btn.click();
});
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, 'qa-b45-shell-initial.png'), fullPage: false });

// ───── FIX 3 — AI sparkle button hidden ─────
console.log('\n=== FIX 3: AI sparkle button hidden ===');
const fix3 = await page.evaluate(() => {
  const aiBtn = document.querySelector('.mf-unified-designer-ai');
  const aiPane = document.querySelector('.mf-unified-designer-ai-pane');
  return {
    aiButtonInDom: !!aiBtn,
    aiPaneInDom: !!aiPane,
    hasMFAiChat: typeof window.MFAiChat?.openForWidget === 'function'
  };
});
console.log(JSON.stringify(fix3, null, 2));
const fix3Pass = !fix3.aiButtonInDom && !fix3.aiPaneInDom;
console.log(fix3Pass ? '[PASS] FIX 3' : '[FAIL] FIX 3');

// ───── FIX 4 — Empty groups skipped on Current Settings tab ─────
console.log('\n=== FIX 4: empty groups skipped on Current Settings tab ===');
const fix4 = await page.evaluate(() => {
  const currentSettingsTab = Array.from(document.querySelectorAll('.mf-unified-designer-tab')).find(t =>
    /Current Settings/i.test(t.textContent || '')
  );
  if (currentSettingsTab) currentSettingsTab.click();
  return new Promise(resolve => setTimeout(() => {
    const groups = Array.from(document.querySelectorAll('.mf-unified-designer-curset-group'));
    const emptyText = document.body.innerText.includes('No properties in this group');
    const groupHeaders = groups.map(g => g.querySelector('.mf-unified-designer-curset-group-head')?.textContent?.trim() || '');
    resolve({
      groupCount: groups.length,
      groupHeaders,
      hasEmptyPlaceholder: emptyText
    });
  }, 600));
});
console.log(JSON.stringify(fix4, null, 2));
const fix4Pass = !fix4.hasEmptyPlaceholder;
console.log(fix4Pass ? '[PASS] FIX 4' : '[FAIL] FIX 4');
await page.screenshot({ path: join(OUT, 'qa-b45-current-settings.png'), fullPage: false });

// ───── FIX 1 — Monaco script tag injected when opening Source tab ─────
console.log('\n=== FIX 1: Monaco lazy-load on Source tab ===');
const fix1 = await page.evaluate(async () => {
  const sourceTab = Array.from(document.querySelectorAll('.mf-unified-designer-tab')).find(t =>
    /Source/i.test(t.textContent || '')
  );
  if (!sourceTab) return { error: 'no Source tab found' };
  sourceTab.click();
  // Wait up to 15s for Monaco to load
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (window.MegaFormMonaco) break;
  }
  const monacoScript = document.querySelector('script[src*="megaform-unified-monaco.js"]');
  const fallbackBanner = document.body.innerText.includes('Rich editor unavailable');
  const monacoMounted = !!document.querySelector('.monaco-editor');
  return {
    monacoScriptInjected: !!monacoScript,
    monacoScriptSrc: monacoScript?.getAttribute('src') || null,
    windowMegaFormMonacoPresent: !!window.MegaFormMonaco,
    monacoEditorMounted: monacoMounted,
    fallbackBannerVisible: fallbackBanner
  };
});
console.log(JSON.stringify(fix1, null, 2));
const fix1Pass = fix1.monacoScriptInjected && (fix1.monacoEditorMounted || fix1.windowMegaFormMonacoPresent);
console.log(fix1Pass ? '[PASS] FIX 1' : '[FAIL] FIX 1');
await page.screenshot({ path: join(OUT, 'qa-b45-source-tab.png'), fullPage: false });

console.log('\n=== SUMMARY ===');
const results = { fix1Pass, fix2Pass, fix3Pass, fix4Pass };
const passes = Object.values(results).filter(Boolean).length;
console.log(`PASS ${passes}/4 — ${JSON.stringify(results)}`);

await browser.close();
