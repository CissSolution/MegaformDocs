// [FlexGrid P2 QA] Visual QA — verify:
//  1) Palette has "Flex Grid (12-col)" item in LAYOUT category
//  2) Builder canvas can render form 326's FlexGrid (existing)
//  3) Click "+ Add" in header → modal opens
//  4) After add, item appears in canvas grid

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Login (Builder + Draft forms require admin)
await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded', { timeout: 30000 }),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);

// Open Builder for form 326
try {
  await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 });
} catch {
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/xx?mfFormId=326#mf-builder`, { waitUntil: 'commit', timeout: 60000 });
}
await page.waitForTimeout(6000);

// 1) Palette item exists in LAYOUT category
const palette = await page.evaluate(() => {
  // Click LAYOUT tab if not active
  const layoutTab = document.querySelector('[data-cat="layout"]');
  if (layoutTab) layoutTab.click();
  const items = Array.from(document.querySelectorAll('.mf-palette-item')).map(el => ({
    type: el.getAttribute('data-type') || null,
    label: (el.querySelector('.mf-pi-label')?.textContent || '').trim(),
  }));
  return {
    layoutTabPresent: !!layoutTab,
    paletteItems: items.filter(i => i.type),
    flexGridItem: items.find(i => i.type === 'FlexGrid') || null,
  };
});
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p2-01-palette.png'), fullPage: false });

// 2) Canvas should already render the FlexGrid from form 326 schema
const canvas = await page.evaluate(() => {
  const grids = document.querySelectorAll('.mf-canvas-flexgrid');
  const flexItems = document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item');
  return {
    canvasFlexGridCount: grids.length,
    itemCount: flexItems.length,
    hasHeader: !!document.querySelector('.mf-flexgrid-canvas-head'),
    hasAddBtn: !!document.querySelector('.mf-flexgrid-add-btn'),
    itemLabels: Array.from(flexItems).map(el => (el.querySelector('.mf-flexgrid-item-label span')?.textContent || '').trim()).slice(0, 8),
  };
});
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p2-02-canvas.png'), fullPage: false });

// 3) Click "+ Add" → modal opens
const addModal = await page.evaluate(async () => {
  const btn = document.querySelector('.mf-flexgrid-add-btn');
  if (!btn) return { clicked: false };
  btn.click();
  await new Promise(r => setTimeout(r, 600));
  const overlay = document.querySelector('.mf-modal-overlay');
  if (!overlay) return { clicked: true, modalMounted: false };
  return {
    clicked: true,
    modalMounted: true,
    hasTypeSelect: !!overlay.querySelector('#mf-fg-add-type'),
    hasKeyInput:   !!overlay.querySelector('#mf-fg-add-key'),
    hasLabelInput: !!overlay.querySelector('#mf-fg-add-label'),
    hasAddOk:      !!overlay.querySelector('#mf-fg-add-ok'),
  };
});
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p2-03-addmodal.png'), fullPage: false });

// 4) Fill modal + add field
const added = await page.evaluate(async () => {
  const ov = document.querySelector('.mf-modal-overlay');
  if (!ov) return { added: false };
  (ov.querySelector('#mf-fg-add-type')  ).value = 'Text';
  (ov.querySelector('#mf-fg-add-key')   ).value = 'qa_added_field';
  (ov.querySelector('#mf-fg-add-label') ).value = 'QA Added Field';
  ov.querySelector('#mf-fg-add-ok').click();
  await new Promise(r => setTimeout(r, 800));
  const items = Array.from(document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item'));
  return {
    added: true,
    itemCount: items.length,
    lastLabel: (items[items.length-1]?.querySelector('.mf-flexgrid-item-label span')?.textContent || '').trim(),
  };
});
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p2-04-afteradd.png'), fullPage: false });

const report = { palette, canvas, addModal, added };
console.log(JSON.stringify(report, null, 2));
await browser.close();
