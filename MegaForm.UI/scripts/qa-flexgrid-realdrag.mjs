// REAL mouse drag QA — uses Playwright's page.mouse.{down,move,up} which
// fire the events Sortable.js actually listens to (mousedown, mousemove,
// mouseup), NOT HTML5 DragEvents. The previous P5 QA used synthetic
// DragEvent which Sortable ignores → false-positive PASS.
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

// 0) Verify grips visible + grid Sortable initialized
const setup = await page.evaluate(() => {
  const gripCount = document.querySelectorAll('.mf-flexgrid-item-grip').length;
  const fgEl = document.querySelector('.mf-canvas-flexgrid .mf-flexgrid');
  return {
    gripCount,
    fgEl_className: fgEl?.className || null,
    fgEl_gridIndexAttr: fgEl?.getAttribute('data-grid-index') || null,
    sortableGlobal: typeof window.Sortable,
    // Sortable.get(el) returns the Sortable instance bound to el, or undefined
    gridHasSortableInstance: !!(window.Sortable && fgEl && window.Sortable.get(fgEl)),
    itemCountBefore: document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item').length,
  };
});
console.log('=== SETUP ===');
console.log(JSON.stringify(setup, null, 2));

// 1) Find palette "Number" item (from BASIC tab — Number is a simple safe widget)
//    + the FlexGrid grid bounding box
const coords = await page.evaluate(() => {
  const basicTab = document.querySelector('[data-cat="basic"]');
  if (basicTab) basicTab.click();
  // Diagnostic: dump all palette items
  const pals = Array.from(document.querySelectorAll('.mf-palette-item'));
  const palDump = pals.slice(0, 12).map(p => ({
    type: p.getAttribute('data-type'),
    label: (p.querySelector('.mf-pi-label')?.textContent || '').trim(),
    rect: p.getBoundingClientRect().toJSON(),
  }));
  const palItem = document.querySelector('.mf-palette-item[data-type="Number"]');
  const gridEl  = document.querySelector('.mf-canvas-flexgrid .mf-flexgrid');
  if (!palItem || !gridEl) return { error: 'missing', palItem: !!palItem, gridEl: !!gridEl, palDump };
  const p = palItem.getBoundingClientRect();
  const g = gridEl.getBoundingClientRect();
  return {
    palette: { x: p.left + p.width/2, y: p.top + p.height/2 },
    drop:    { x: g.right - g.width * 0.3, y: g.top + 40 },
    palDumpLen: palDump.length,
    palDump,
    gridRect: { x: g.x, y: g.y, w: g.width, h: g.height },
  };
});
if (!coords) { console.log('SETUP FAILED — palette or grid not found'); await browser.close(); process.exit(1); }
console.log('=== COORDS ===');
console.log(JSON.stringify(coords, null, 2));

// 2) Try Playwright locator.dragTo() — higher-level helper that handles
//    Sortable's fallback drag mode correctly.
const palLoc  = page.locator('.mf-palette-item[data-type="Number"]').first();
const gridLoc = page.locator('.mf-canvas-flexgrid .mf-flexgrid').first();
try {
  await palLoc.dragTo(gridLoc, {
    targetPosition: { x: 350, y: 80 },   // inside grid, near top-right area
    timeout: 5000,
  });
} catch (e) {
  console.log('dragTo failed: ' + e.message);
}
await page.waitForTimeout(1500);

// 3) Verify the new field landed INSIDE the FlexGrid (not as a top-level field)
const after = await page.evaluate(() => {
  const flexCells = Array.from(document.querySelectorAll('.mf-canvas-flexgrid .mf-flexgrid-item'));
  const topLevelFields = document.querySelectorAll('#mf-fields-container > .mf-canvas-field, .mf-canvas .mf-canvas-field').length;
  return {
    flexItemCount: flexCells.length,
    lastFlexItemLabel: (flexCells[flexCells.length-1]?.querySelector('.mf-flexgrid-item-label span')?.textContent || '').trim(),
    lastFlexItemType:  (flexCells[flexCells.length-1]?.querySelector('.mf-flexgrid-item-type')?.textContent || '').trim(),
    standaloneCanvasFieldCount: topLevelFields,
    onAddDiagnostic: window.__mfFlexGridLastOnAdd || null,
  };
});
console.log('=== AFTER REAL DRAG ===');
console.log(JSON.stringify(after, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-realdrag.png'), fullPage: false });
await browser.close();
