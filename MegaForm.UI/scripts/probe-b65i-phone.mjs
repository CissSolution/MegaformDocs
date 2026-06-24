// [B65i] Verify:
// 1. Basic Phone tile NOT in BASIC palette
// 2. PhonePro tile labelled just "Phone" in WIDGETS palette
// 3. Save still returns 200 (no regression from B65h)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const saveResponses = [];
page.on('response', r => { if (r.url().includes('/Form/Save')) saveResponses.push({ status: r.status() }); });

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/xx?mfFormId=1264#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

const palette = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.mf-palette-item'));
  return {
    totalTiles: tiles.length,
    phoneTiles: tiles
      .filter(t => /phone/i.test(t.textContent || ''))
      .map(t => ({
        text: (t.textContent || '').trim().slice(0, 30),
        dataType: t.getAttribute('data-type') || t.getAttribute('data-widget') || '',
        category: t.closest('[data-category]') ? t.closest('[data-category]').getAttribute('data-category') : '',
        parentTab: (() => {
          let p = t.parentElement;
          while (p && !p.classList.contains('mf-palette-cat')) p = p.parentElement;
          return p ? p.getAttribute('data-mf-palette-cat') || p.id : '';
        })()
      }))
  };
});

await page.screenshot({ path: 'qa-out/b65i-01-basic.png', fullPage: false });

// Switch to WIDGETS tab
await page.evaluate(() => {
  const widgetsTab = document.querySelector('.mf-ptab[data-tab="widgets"]');
  if (widgetsTab) widgetsTab.click();
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-out/b65i-02-widgets.png', fullPage: false });

const widgetsTabPhones = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.mf-palette-item'));
  const visible = tiles.filter(t => getComputedStyle(t).display !== 'none');
  return {
    visibleCount: visible.length,
    phoneInWidgets: visible
      .filter(t => /phone/i.test(t.textContent || ''))
      .map(t => ({
        text: (t.textContent || '').trim().slice(0, 30),
        dataType: t.getAttribute('data-type') || t.getAttribute('data-widget') || ''
      }))
  };
});

// Save click to verify no regression
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button, a'));
  const saveBtn = buttons.find(b => /^save$/i.test((b.textContent || '').trim()));
  if (saveBtn) saveBtn.click();
});
await page.waitForTimeout(4000);

await browser.close();
console.log(JSON.stringify({ palette, widgetsTabPhones, saveResponses }, null, 2));
