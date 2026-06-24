// [Task 2 QA] Theme picker investigation — open Builder SETTINGS tab,
// find theme cards, click one, verify settings.theme updated.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrs = [];
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

try { await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
catch { await page.waitForTimeout(2000); await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 }); }
await page.waitForTimeout(6000);

// Click the SETTINGS tab on right sidebar
const settingsTabClicked = await page.evaluate(() => {
  const tab = document.querySelector('#mf-tab-link-settings, a.mf-right-tab[data-tab="settings"]');
  if (!tab) return false;
  tab.click();
  return true;
});
await page.waitForTimeout(1000);
console.log('SETTINGS tab clicked:', settingsTabClicked);

// Inspect the theme picker UI
const probe1 = await page.evaluate(() => {
  const themeTab = document.querySelector('#mf-tab-settings, #mf-tab-content-settings');
  const cards = Array.from(document.querySelectorAll('.mf-theme-card'));
  return {
    hasThemeTabPane: !!themeTab,
    themeTabVisible: themeTab ? getComputedStyle(themeTab).display !== 'none' : false,
    themeCardCount: cards.length,
    firstCardThemes: cards.slice(0, 6).map(c => ({
      id: c.getAttribute('data-theme'),
      isActive: c.classList.contains('active'),
      label: c.querySelector('.mf-theme-name')?.textContent?.trim() || '',
    })),
    initialThemeInSchema: window.MegaFormBuilder?.state?.schema?.settings?.theme || null,
  };
});
console.log('=== PROBE 1 (before click) ===');
console.log(JSON.stringify(probe1, null, 2));
await page.screenshot({ path: join(OUT, 'qa-theme-01-cards.png'), fullPage: false });

// Try clicking a non-default theme (the second card if available)
const clickResult = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.mf-theme-card'));
  // Find first non-default card
  const target = cards.find(c => (c.getAttribute('data-theme') || '') !== 'default') || cards[1];
  if (!target) return { clicked: false };
  const themeId = target.getAttribute('data-theme');
  target.click();
  return { clicked: true, themeId };
});
console.log('=== CLICK ===');
console.log(JSON.stringify(clickResult, null, 2));
await page.waitForTimeout(800);

const probe2 = await page.evaluate(() => {
  const active = document.querySelector('.mf-theme-card.active');
  return {
    activeCardTheme: active?.getAttribute('data-theme') || null,
    settingsTheme: window.MegaFormBuilder?.state?.schema?.settings?.theme || null,
    canvasHasThemePreview: !!document.querySelector('.mf-canvas-dropzone.mf-theme-preview'),
    canvasDataTheme: document.querySelector('.mf-canvas-dropzone')?.getAttribute('data-theme') || null,
    toastShown: !!document.querySelector('.mf-toast'),
  };
});
console.log('=== PROBE 2 (after click) ===');
console.log(JSON.stringify(probe2, null, 2));
await page.screenshot({ path: join(OUT, 'qa-theme-02-clicked.png'), fullPage: false });

console.log('=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrs.slice(0, 5), null, 2));
await browser.close();
