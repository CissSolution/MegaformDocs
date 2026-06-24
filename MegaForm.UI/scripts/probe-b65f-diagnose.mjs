// [B65f] Diagnose:
// 1. JS errors when builder loads + when clicking each Design card
// 2. Why popup doesn't open
// 3. Left palette bg color + tile icon size in BASIC/LAYOUT/WIDGETS modes
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push({ kind: 'pageerror', msg: e.message, stack: (e.stack || '').slice(0, 400) }));
page.on('console', m => {
  if (m.type() === 'error') errs.push({ kind: 'console', msg: m.text().slice(0, 400) });
});

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(SITE + '/xx?mfFormId=249#mf-builder', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// 1. Left palette bg + tile dimensions
const panel = await page.evaluate(() => {
  const tabs = ['basic', 'layout', 'widgets'];
  const results = {};
  for (const t of tabs) {
    const tabBtn = document.querySelector('.mf-ptab[data-tab="' + t + '"]');
    if (tabBtn) tabBtn.click();
  }
  // Reset to basic
  const basic = document.querySelector('.mf-ptab[data-tab="basic"]');
  if (basic) basic.click();
  const panelLeft = document.querySelector('#mf-panel-left');
  const panelBody = document.querySelector('.mf-panel-body');
  const tiles = Array.from(document.querySelectorAll('.mf-palette-item')).slice(0, 3);
  return {
    panelLeftBg: panelLeft ? getComputedStyle(panelLeft).backgroundColor : null,
    panelBodyBg: panelBody ? getComputedStyle(panelBody).backgroundColor : null,
    bodyClasses: document.body.className,
    tiles: tiles.map(t => {
      const r = t.getBoundingClientRect();
      const icon = t.querySelector('i, svg, img');
      const ir = icon ? icon.getBoundingClientRect() : null;
      const iconCs = icon ? getComputedStyle(icon) : null;
      return {
        tileW: Math.round(r.width),
        tileH: Math.round(r.height),
        bg: getComputedStyle(t).backgroundColor,
        iconW: ir ? Math.round(ir.width) : 0,
        iconH: ir ? Math.round(ir.height) : 0,
        iconFontSize: iconCs ? iconCs.fontSize : null
      };
    })
  };
});

await page.screenshot({ path: 'qa-out/b65f-01-builder-loaded.png', fullPage: false });

// 2. Click FIELD/Design tab + try opening each card
const fieldTabClick = await page.evaluate(() => {
  const tab = document.querySelector('#mf-tab-link-field');
  if (!tab) return { ok: false, reason: 'no field tab' };
  tab.click();
  return { ok: true };
});
await page.waitForTimeout(1500);

const beforeCardClick = errs.length;

// Click Field Properties card
const fieldClick = await page.evaluate(() => {
  const c = document.querySelector('[data-mf-design-open="field"]');
  if (!c) return { ok: false, reason: 'no field launcher card' };
  c.click();
  return { ok: true };
});
await page.waitForTimeout(2500);

const popupAfterFieldClick = await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  if (!b) return { exists: false };
  const m = b.querySelector('.mf-design-modal');
  return {
    exists: true,
    backdropDisplay: getComputedStyle(b).display,
    modalRect: m ? Object.fromEntries(Object.entries(m.getBoundingClientRect()).filter(([k]) => ['x','y','width','height'].includes(k)).map(([k,v]) => [k, Math.round(v)])) : null,
    bodyChildren: m && m.querySelector('.mf-design-modal-body') ? m.querySelector('.mf-design-modal-body').children.length : 0,
    title: (m && m.querySelector('.mf-design-modal-title') || {}).textContent || ''
  };
});

await page.screenshot({ path: 'qa-out/b65f-02-after-field-click.png', fullPage: false });

// Close popup if open
await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  if (b) {
    const close = b.querySelector('.mf-design-modal-close');
    if (close) close.click();
  }
});
await page.waitForTimeout(1500);

// Click Settings card
const settingsClick = await page.evaluate(() => {
  const c = document.querySelector('[data-mf-design-open="settings"]');
  if (!c) return { ok: false, reason: 'no settings launcher card' };
  c.click();
  return { ok: true };
});
await page.waitForTimeout(2500);

const popupAfterSettingsClick = await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  return {
    exists: !!b,
    title: b ? (b.querySelector('.mf-design-modal-title') || {}).textContent || '' : ''
  };
});

await page.screenshot({ path: 'qa-out/b65f-03-after-settings-click.png', fullPage: false });

// Close + Click HTML
await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  if (b) {
    const close = b.querySelector('.mf-design-modal-close');
    if (close) close.click();
  }
});
await page.waitForTimeout(1500);

const htmlClick = await page.evaluate(() => {
  const c = document.querySelector('[data-mf-design-open="html"]');
  if (!c) return { ok: false, reason: 'no html launcher card' };
  c.click();
  return { ok: true };
});
await page.waitForTimeout(2500);

const popupAfterHtmlClick = await page.evaluate(() => {
  const b = document.querySelector('.mf-design-modal-backdrop');
  return {
    exists: !!b,
    title: b ? (b.querySelector('.mf-design-modal-title') || {}).textContent || '' : ''
  };
});

await page.screenshot({ path: 'qa-out/b65f-04-after-html-click.png', fullPage: false });

await browser.close();

const result = {
  panel,
  fieldTabClick, fieldClick, popupAfterFieldClick,
  settingsClick, popupAfterSettingsClick,
  htmlClick, popupAfterHtmlClick,
  totalErrors: errs.length,
  errorsBeforeCardClick: beforeCardClick,
  errorsAfterCardClick: errs.length - beforeCardClick,
  errors: errs.slice(0, 15)
};
console.log(JSON.stringify(result, null, 2));
