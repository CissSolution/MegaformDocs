// Smoke test B48 unification — THEME tab in right rail + Theme Designer panels inline + canvas mode
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

// 1) Open Builder on form 335
await page.goto(`${BASE}/xx?mfFormId=335#mf-builder`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForTimeout(10000);

console.log('\n=== FIX 1: THEME tab exists in right rail (10 tabs) ===');
const fix1 = await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.mf-right-tab[data-tab]'));
  const themeTabLink = document.querySelector('#mf-tab-link-theme, .mf-right-tab[data-tab="theme"]');
  const themeContent = document.querySelector('#mf-tab-theme');
  return {
    rightRailTabCount: tabs.length,
    tabs: tabs.map(t => t.getAttribute('data-tab')),
    themeTabExists: !!themeTabLink,
    themeContentExists: !!themeContent,
    themeBadge: window.__MF_THEME_TAB_ADAPTER_BADGE__ || null,
    themeModeBadge: window.__MF_THEME_MODE_BADGE__ || null
  };
});
console.log(JSON.stringify(fix1, null, 2));
const fix1Pass = fix1.rightRailTabCount >= 10 && fix1.themeTabExists && fix1.themeContentExists;
console.log(fix1Pass ? '[PASS] FIX 1' : '[FAIL] FIX 1');

// 2) Click THEME tab → check panels mount + body class
console.log('\n=== FIX 2: Click THEME → mount panels + canvas theme-mode ===');
const fix2 = await page.evaluate(async () => {
  const themeTab = document.querySelector('#mf-tab-link-theme, .mf-right-tab[data-tab="theme"]');
  if (!themeTab) return { error: 'no theme tab' };
  themeTab.click();
  await new Promise(r => setTimeout(r, 1500));
  const themePane = document.querySelector('#mf-tab-theme');
  const visible = themePane ? getComputedStyle(themePane).display !== 'none' : false;
  const innerHasContent = themePane ? themePane.innerHTML.length > 200 : false;
  const stateThemeMode = document.body.classList.contains('state-theme-mode');
  const hasAnchors = document.querySelectorAll('#mf-tab-theme [data-mf-theme-anchor]').length;
  const subTabs = Array.from(document.querySelectorAll('#mf-tab-theme button, #mf-tab-theme .mf-tlr-tab, #mf-tab-theme [data-tab]'))
    .filter(b => /Colors|Type|Space|Effects/i.test(b.textContent || ''))
    .map(b => (b.textContent || '').trim().slice(0, 12));
  return { themePaneVisible: visible, innerHasContent, stateThemeMode, anchorCount: hasAnchors, subTabs };
});
console.log(JSON.stringify(fix2, null, 2));
const fix2Pass = fix2.themePaneVisible && fix2.innerHasContent && fix2.stateThemeMode;
console.log(fix2Pass ? '[PASS] FIX 2' : '[FAIL] FIX 2');

// 3) Left rail context-switch (palette → theme nav)
console.log('\n=== FIX 3: Left rail context-switch ===');
const fix3 = await page.evaluate(() => {
  const paletteTabs = Array.from(document.querySelectorAll('.mf-palette-tabs .mf-ptab')).map(t => (t.textContent || '').trim());
  const themeNavTabs = Array.from(document.querySelectorAll('.mf-theme-nav-tabs .mf-tlr-tab, [data-tab][data-mf-theme-leftnav]')).map(t => (t.textContent || '').trim());
  return {
    paletteTabsVisible: paletteTabs.filter(x => x).slice(0, 4),
    themeNavTabsVisible: themeNavTabs.filter(x => x).slice(0, 5),
    leftRailBadge: window.__MF_THEME_LEFT_RAIL_BADGE__ || null
  };
});
console.log(JSON.stringify(fix3, null, 2));
const fix3Pass = !!fix3.leftRailBadge || fix3.themeNavTabsVisible.length > 0;
console.log(fix3Pass ? '[PASS] FIX 3' : '[FAIL] FIX 3 (left rail bridge may not have swapped yet)');

// 4) #mf-theme redirect → #mf-builder + auto-activate THEME
console.log('\n=== FIX 4: #mf-theme route redirect ===');
await page.goto(`${BASE}/xx?mfFormId=335#mf-theme`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForTimeout(8000);
const fix4 = await page.evaluate(() => ({
  hash: window.location.hash,
  isBuilder: window.location.hash === '#mf-builder' || window.location.hash.startsWith('#mf-builder'),
  ssFlag: (function(){ try { return sessionStorage.getItem('mf-builder-initial-tab'); } catch(_){ return null; } })(),
  themeTabActive: document.querySelector('.mf-right-tab[data-tab="theme"].active') !== null,
  themeContentVisible: document.querySelector('#mf-tab-theme') ? getComputedStyle(document.querySelector('#mf-tab-theme')).display !== 'none' : false
}));
console.log(JSON.stringify(fix4, null, 2));
const fix4Pass = fix4.isBuilder && (fix4.themeTabActive || fix4.themeContentVisible);
console.log(fix4Pass ? '[PASS] FIX 4' : '[FAIL] FIX 4');

console.log('\n=== SUMMARY ===');
const results = { fix1, fix2, fix3, fix4 };
const passes = [fix1Pass, fix2Pass, fix3Pass, fix4Pass].filter(Boolean).length;
console.log(`PASS ${passes}/4`);
await page.screenshot({ path: join(OUT, 'qa-b48-theme-tab.png'), fullPage: false });

await browser.close();
