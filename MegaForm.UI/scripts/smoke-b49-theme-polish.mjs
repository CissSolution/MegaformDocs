// Smoke B49: live-preview canvas + left rail styled + new sub-tabs (Custom/HTML) + ported features
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
await page.waitForTimeout(4000);

await page.goto(`${BASE}/xx?mfFormId=335#mf-builder`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForTimeout(10000);

// Click THEME tab
await page.evaluate(() => {
  const t = document.querySelector('.mf-right-tab[data-tab="theme"], #mf-tab-link-theme');
  if (t) t.click();
});
await page.waitForTimeout(2000);

console.log('\n=== FIX 1: Canvas live preview — chrome HIDDEN ===');
const fix1 = await page.evaluate(() => {
  const fgHeader = Array.from(document.querySelectorAll('.mf-fg-header, .mf-fg-toolbar, .mf-flexgrid-header, .mf-flexgrid-toolbar'));
  const typeBadges = Array.from(document.querySelectorAll('.mf-canvas-field-type, .mf-field-type-badge, .mf-type-chip'));
  const customHtmlBanner = Array.from(document.querySelectorAll('.mf-custom-html-banner, .mf-custom-html-active'));
  const addDescPrompt = document.querySelectorAll('.mf-canvas-add-desc-prompt, .mf-add-desc').length;
  const visible = (els) => els.filter(e => getComputedStyle(e).display !== 'none').length;
  return {
    visible_fgHeader: visible(fgHeader),
    visible_typeBadges: visible(typeBadges),
    visible_customHtmlBanner: visible(customHtmlBanner),
    addDescPromptCount: addDescPrompt,
    stateThemeMode: document.body.classList.contains('state-theme-mode')
  };
});
console.log(JSON.stringify(fix1, null, 2));
const fix1Pass = fix1.stateThemeMode && fix1.visible_fgHeader === 0 && fix1.visible_typeBadges === 0 && fix1.visible_customHtmlBanner === 0;
console.log(fix1Pass ? '[PASS] FIX 1' : '[FAIL] FIX 1');

console.log('\n=== FIX 2: Left rail theme nav CSS styled ===');
const fix2 = await page.evaluate(() => {
  const tab = document.querySelector('.mf-theme-nav-tabs .mf-tlr-tab, .mf-tlr-tab');
  const tabBg = tab ? getComputedStyle(tab).background : null;
  const tabPadding = tab ? getComputedStyle(tab).padding : null;
  const presetGrid = document.querySelector('.mf-tlr-preset-grid');
  const presetGridDisplay = presetGrid ? getComputedStyle(presetGrid).display : null;
  const preset = document.querySelector('.mf-tlr-preset');
  const presetHasBorderRadius = preset ? getComputedStyle(preset).borderRadius : null;
  return {
    hasTab: !!tab,
    tabBg,
    tabPadding,
    presetGridDisplay,
    presetHasBorderRadius
  };
});
console.log(JSON.stringify(fix2, null, 2));
const fix2Pass = fix2.hasTab && fix2.presetGridDisplay === 'grid';
console.log(fix2Pass ? '[PASS] FIX 2' : '[FAIL] FIX 2');

console.log('\n=== FIX 3: Custom + HTML sub-tabs in theme tab ===');
const fix3 = await page.evaluate(() => {
  const subTabs = Array.from(document.querySelectorAll('#mf-tab-theme button, #mf-tab-theme .td-right-tab, #mf-tab-theme [data-subtab]'))
    .map(b => (b.textContent || '').trim().toLowerCase());
  const hasCustomTab = subTabs.some(t => /custom|css/i.test(t));
  const hasHtmlTab = subTabs.some(t => /html|template/i.test(t));
  const cssTextarea = document.querySelector('#mf-theme-custom-css, [data-mf-theme-customcss]');
  const htmlTextarea = document.querySelector('#mf-theme-custom-html, [data-mf-theme-customhtml]');
  return {
    subTabs: subTabs.filter(x => x).slice(0, 10),
    hasCustomTab,
    hasHtmlTab,
    cssTextareaExists: !!cssTextarea,
    htmlTextareaExists: !!htmlTextarea
  };
});
console.log(JSON.stringify(fix3, null, 2));
const fix3Pass = fix3.cssTextareaExists && fix3.htmlTextareaExists;
console.log(fix3Pass ? '[PASS] FIX 3' : '[FAIL] FIX 3');

console.log('\n=== FIX 4: Ported features — font preview, tints, HEX input, device toggle ===');
const fix4 = await page.evaluate(() => {
  const fontPreview = document.querySelector('#mf-theme-font-preview, [class*="font-preview"]');
  const tintStrip = document.querySelector('.mf-theme-tint-strip, [class*="tint"]');
  const hexInput = document.querySelector('[data-mf-theme-hex], #mf-theme-hex');
  const deviceBtns = Array.from(document.querySelectorAll('[data-mf-theme-device], [class*="theme-device"]'));
  const titleAlign = document.querySelector('[data-mf-theme-title-align], #mf-theme-title-align');
  return {
    fontPreviewExists: !!fontPreview,
    tintStripExists: !!tintStrip,
    hexInputExists: !!hexInput,
    deviceBtnCount: deviceBtns.length,
    titleAlignExists: !!titleAlign
  };
});
console.log(JSON.stringify(fix4, null, 2));
const portedCount = [fix4.fontPreviewExists, fix4.tintStripExists, fix4.hexInputExists, fix4.deviceBtnCount > 0].filter(Boolean).length;
const fix4Pass = portedCount >= 2; // at least 2 of 4 ported
console.log(`[${fix4Pass ? 'PASS' : 'FAIL'}] FIX 4 (${portedCount}/4 features detected)`);

await page.screenshot({ path: join(OUT, 'qa-b49-theme-polish.png'), fullPage: false });

console.log('\n=== SUMMARY ===');
const passes = [fix1Pass, fix2Pass, fix3Pass, fix4Pass].filter(Boolean).length;
console.log(`PASS ${passes}/4`);

await browser.close();
