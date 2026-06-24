// [B59-SettingsEvoq] Real-browser visual QA for Settings tab redesign.
// Verifies: GENERAL section uses 2-col checkbox grid + After Submit V1 has 3 Evoq sub-cards.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'fs';

mkdirSync('qa-out', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

await page.goto('http://dnn10322_megaf.ai/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto('http://dnn10322_megaf.ai/xx?mfFormId=333#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(14000);

// Click SETTINGS tab (right rail)
const tabClickResult = await page.evaluate(() => {
  const selectors = [
    '#mf-tab-link-settings',
    '.mf-right-tab[data-tab="settings"]',
    '[data-mf-tab="settings"]',
    'button:has-text("SETTINGS")'
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) { el.click(); return { clicked: sel }; }
    } catch (_) {}
  }
  // Fallback: scan all right-rail tab buttons for SETTINGS label
  const tabs = Array.from(document.querySelectorAll('.mf-right-tab, [class*="right-tab"], [class*="tab-link"]'));
  for (const t of tabs) {
    const txt = (t.textContent || '').trim().toUpperCase();
    if (txt === 'SETTINGS' || txt.includes('SETTING')) { t.click(); return { clicked: 'text-match: ' + (t.id || t.className) }; }
  }
  return { clicked: null };
});
await page.waitForTimeout(2500);

// Probe the Settings tab content
const probe = await page.evaluate(() => {
  const settingsTab = document.querySelector('#mf-tab-settings');
  const settingsVisible = settingsTab ? getComputedStyle(settingsTab).display !== 'none' : false;
  const generalGrid = document.querySelector('#mf-tab-settings .mf-prop-group:first-of-type .mf-checkbox-grid');
  const generalCheckboxCount = generalGrid ? generalGrid.querySelectorAll('input[type="checkbox"]').length : 0;
  const generalGridCols = generalGrid ? getComputedStyle(generalGrid).gridTemplateColumns : null;
  const evoqGroup = document.querySelector('#mf-tab-settings .mf-evoq-group');
  const evoqCards = evoqGroup ? Array.from(evoqGroup.querySelectorAll('.mf-evoq-card')) : [];
  const evoqCardTitles = evoqCards.map(c => {
    const t = c.querySelector('.mf-evoq-card-title');
    return t ? t.textContent.trim() : '(no title)';
  });
  const tokenList = document.querySelector('#mf-post-submit-token-list');
  const tokenInsideCard = !!(tokenList && tokenList.closest('.mf-evoq-card'));
  const requiredFieldIds = [
    'mf-setting-success-title', 'mf-setting-success-msg', 'mf-post-submit-token-list',
    'mf-setting-show-submission-id', 'mf-setting-submission-id-label',
    'mf-setting-show-answer-summary', 'mf-setting-answer-summary-title',
    'mf-setting-hide-empty-answers', 'mf-setting-fill-again', 'mf-setting-fill-again-label',
    'mf-setting-redirect', 'mf-setting-redirect-delay', 'mf-setting-redirect-notice',
    'mf-setting-post-submit-mode',
    'mf-setting-require-auth', 'mf-setting-save-resume', 'mf-setting-multi-page',
    'mf-setting-display-only', 'mf-setting-hide-header'
  ];
  const missingFieldIds = requiredFieldIds.filter(id => !document.getElementById(id));
  // Sample bounding boxes to verify 2-col layout
  const checkboxRects = [];
  if (generalGrid) {
    generalGrid.querySelectorAll('.form-check').forEach(c => {
      const r = c.getBoundingClientRect();
      checkboxRects.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) });
    });
  }
  return {
    settingsVisible,
    generalCheckboxCount,
    generalGridCols,
    evoqCardCount: evoqCards.length,
    evoqCardTitles,
    tokenInsideCard,
    missingFieldIds,
    checkboxRects
  };
});

await page.screenshot({ path: 'qa-out/b59-settings-tab.png', fullPage: false });

// Scroll to After Submit section + screenshot
await page.evaluate(() => {
  const grp = document.querySelector('#mf-tab-settings .mf-evoq-group');
  if (grp) grp.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-out/b59-aftersubmit-cards.png', fullPage: false });

await browser.close();

const result = { tabClickResult, probe, consoleErrors };
writeFileSync('qa-out/b59-probe.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
