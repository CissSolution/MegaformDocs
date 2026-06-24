// Reproduce: form 331, click Open Token Designer + Razor Studio
// Capture all console errors + page errors + network failures
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

const errs = [];
const pageErrs = [];
const failedReqs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => pageErrs.push({ msg: e.message, stack: e.stack?.slice(0, 400) }));
page.on('requestfailed', r => failedReqs.push({ url: r.url(), failure: r.failure()?.errorText }));

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 60000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Use exact form from screenshot
try { await page.goto(`${BASE}/xx?mfFormId=331#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=331#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(12000);

// Switch to HTML tab
const onHtmlTab = await page.evaluate(() => {
  const tab = document.querySelector('#mf-tab-link-html, a.mf-right-tab[data-tab="html"]');
  if (tab) { tab.click(); return true; }
  return false;
});
await page.waitForTimeout(1500);
console.log('HTML tab clicked:', onHtmlTab);

// PROBE 1: state of all relevant globals + button existence
const probe1 = await page.evaluate(() => {
  const td = window.MFTokenDesigner;
  const sd = window.MFSliderDesigner;
  const icd = window.MFImageChoiceDesigner;
  const rs = window.MFRazorStudio;
  const tokBtn = document.getElementById('mf-open-token-designer');
  const razorBtns = Array.from(document.querySelectorAll('button')).filter(b => (b.textContent || '').includes('Razor Studio'));
  return {
    hasMegaFormBuilder: !!window.MegaFormBuilder,
    hasMFTokenDesigner: !!td, hasTokenOpen: typeof td?.open === 'function',
    hasMFSliderDesigner: !!sd,
    hasMFImageChoiceDesigner: !!icd,
    hasMFRazorStudio: !!rs, hasRazorOpen: typeof rs?.open === 'function',
    tokenBtnFound: !!tokBtn,
    tokenBtnBound: !!(tokBtn && tokBtn._mfBound),
    tokenBtnVisible: tokBtn ? tokBtn.offsetParent !== null : null,
    razorBtnCount: razorBtns.length,
    bundleBadge: window.__MF_PLUGIN_PRELOAD_BADGE__ || null
  };
});
console.log('=== PROBE 1 ===');
console.log(JSON.stringify(probe1, null, 2));

// PROBE 2: click Token Designer button + capture what happens
const probe2 = await page.evaluate(async () => {
  const tokBtn = document.getElementById('mf-open-token-designer');
  if (!tokBtn) return { error: 'no token btn' };
  let clickError = null;
  try {
    tokBtn.click();
  } catch (e) { clickError = String(e?.message || e); }
  await new Promise(r => setTimeout(r, 600));
  const modal = document.getElementById('mf-token-designer-modal');
  return {
    clickError,
    modalCreated: !!modal,
    modalVisible: modal ? modal.offsetParent !== null : null,
    modalZIndex: modal ? getComputedStyle(modal).zIndex : null,
    modalDisplay: modal ? getComputedStyle(modal).display : null,
  };
});
console.log('=== PROBE 2 (Token Designer click) ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-331-token-click.png'), fullPage: false });

// PROBE 3: click Razor Studio button on canvas
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const probe3 = await page.evaluate(async () => {
  const razorBtns = Array.from(document.querySelectorAll('button')).filter(b => (b.textContent || '').includes('Razor Studio'));
  if (!razorBtns.length) return { error: 'no razor btn' };
  const btn = razorBtns[0];
  let clickError = null;
  try { btn.click(); } catch (e) { clickError = String(e?.message || e); }
  await new Promise(r => setTimeout(r, 800));
  const popup = document.getElementById('mf-razor-studio-popup');
  return {
    clickError,
    popupCreated: !!popup,
    popupVisible: popup ? popup.offsetParent !== null : null,
    popupZIndex: popup ? getComputedStyle(popup).zIndex : null
  };
});
console.log('=== PROBE 3 (Razor Studio click) ===');
console.log(JSON.stringify(probe3, null, 2));
await page.screenshot({ path: join(OUT, 'qa-331-razor-click.png'), fullPage: false });

console.log('\n=== PAGE ERRORS ===');
console.log(JSON.stringify(pageErrs, null, 2));
console.log('\n=== CONSOLE ERRORS ===');
console.log(JSON.stringify(errs.slice(0, 15), null, 2));
console.log('\n=== FAILED REQUESTS ===');
console.log(JSON.stringify(failedReqs.slice(0, 10), null, 2));
await browser.close();
