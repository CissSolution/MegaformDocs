// [B65k] Diagnose why Design Studio launcher cards don't open popup on subportal URL.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const TARGET = SITE + '/megaform/Home/mfFormId/1269?mfFormId=1269#mf-builder';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 250)); });

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(16000);

// Check pre-click state
const pre = await page.evaluate(() => {
  const panel = document.getElementById('mf-panel-right');
  const launcher = document.getElementById('mf-design-launcher');
  const cards = document.querySelectorAll('[data-mf-design-open]');
  return {
    hasPanel: !!panel,
    panelHasPatchFlag: panel ? panel.dataset.mfTabPatchApplied : null,
    hasLauncher: !!launcher,
    cardCount: cards.length,
    cardsVisible: Array.from(cards).map(c => {
      const r = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        which: c.getAttribute('data-mf-design-open'),
        visible: cs.display !== 'none' && r.width > 0,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width)
      };
    })
  };
});

// Click via mouse on the Form Settings card (real mouse simulation)
const settingsCardRect = await page.evaluate(() => {
  const c = document.querySelector('[data-mf-design-open="settings"]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };
});

let popupAfterRealClick = { tried: false };
if (settingsCardRect) {
  await page.mouse.click(settingsCardRect.x, settingsCardRect.y);
  await page.waitForTimeout(2500);
  popupAfterRealClick = await page.evaluate(() => {
    const b = document.querySelector('.mf-design-modal-backdrop');
    return {
      tried: true,
      backdropExists: !!b,
      modalTitle: b ? (b.querySelector('.mf-design-modal-title') || {}).textContent || '' : '',
      bodyChildren: b ? (b.querySelector('.mf-design-modal-body') || {}).children?.length || 0 : 0
    };
  });
}

await page.screenshot({ path: 'qa-out/b65k-01-after-click.png', fullPage: false });

// Try JS dispatch
await page.evaluate(() => {
  const c = document.querySelector('[data-mf-design-open="field"]');
  if (c) c.click();
});
await page.waitForTimeout(2500);
const popupAfterJsClick = await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  return {
    backdropExists: !!b,
    modalTitle: b ? (b.querySelector('.mf-design-modal-title') || {}).textContent || '' : ''
  };
});

await page.screenshot({ path: 'qa-out/b65k-02-after-js-click.png', fullPage: false });

await browser.close();
console.log(JSON.stringify({ pre, settingsCardRect, popupAfterRealClick, popupAfterJsClick, errsSample: errs.slice(0, 6) }, null, 2));
