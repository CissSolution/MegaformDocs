// [FlexGrid P5 QA] Simulate dragging a palette item into the FlexGrid.
// HTML5 native drag-drop with synthetic events.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

const before = await page.evaluate(() => {
  const items = document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item');
  return { itemCount: items.length };
});
console.log('=== BEFORE drop ===');
console.log(JSON.stringify(before, null, 2));

// Simulate drag of an "Email" palette item to a position inside the grid.
// Native dragstart on palette → dragover then drop on grid.
const dropResult = await page.evaluate(async () => {
  const palette = document.querySelector('.mf-palette-item[data-type="Email"]');
  const grid = document.querySelector('.mf-canvas-flexgrid .mf-flexgrid');
  if (!palette || !grid) return { found: false };

  // Hint Sortable's static state
  const SortableGlobal = window.Sortable;
  if (SortableGlobal) {
    SortableGlobal.active = SortableGlobal.active || {};
    SortableGlobal.dragged = palette;
  }

  // Position drop ~middle of grid
  const r = grid.getBoundingClientRect();
  const cx = r.left + r.width * 0.5;
  const cy = r.top + r.height * 0.5;

  // Fire native dragover then drop on the grid
  const dragOverEv = new DragEvent('dragover', {
    bubbles: true, cancelable: true,
    clientX: cx, clientY: cy,
    dataTransfer: new DataTransfer(),
  });
  grid.dispatchEvent(dragOverEv);

  const dropEv = new DragEvent('drop', {
    bubbles: true, cancelable: true,
    clientX: cx, clientY: cy,
    dataTransfer: new DataTransfer(),
  });
  grid.dispatchEvent(dropEv);

  await new Promise(r => setTimeout(r, 700));

  const items = document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item');
  return {
    found: true,
    itemCountAfter: items.length,
    lastLabel: (items[items.length-1]?.querySelector('.mf-flexgrid-item-label span')?.textContent || '').trim(),
    lastType:  (items[items.length-1]?.querySelector('.mf-flexgrid-item-type')?.textContent || '').trim(),
  };
});

console.log('=== AFTER drop ===');
console.log(JSON.stringify(dropResult, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p5-drop.png'), fullPage: false });

await browser.close();
