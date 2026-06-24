// R1.2 + R1.3 QA — multi-column sort, keyboard model, Excel paste.
// Mounts the runtime DataGrid widget on form 296, populates rows, then:
//   1) Shift-click 2 headers, verify ▲/▼ priority markers
//   2) Confirm rows reorder per the comparator
//   3) Ctrl+Insert creates a new row
//   4) Ctrl+Delete removes a row
//   5) Enter on a cell moves focus to the same column in next row
//   6) Paste a tab-separated multi-row block into a cell → multi-row fan-out

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(`${BASE}/xx?formid=296`, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(800);

const badge = await page.evaluate(() => (window).__MF_DATAGRID_BADGE__);
console.log('datagrid badge:', badge);

// Add 4 rows via the Add row button + seed them
async function addRow() {
  await page.locator('[data-mfw-add]').first().click();
  await page.waitForTimeout(120);
}
for (let i = 0; i < 4; i++) await addRow();

// Seed
await page.evaluate(() => {
  const inputs = document.querySelectorAll('.mfw-dgrid-grid .mfw-dgrid-input');
  const data = [
    ['banana', '5', '12'],
    ['apple',  '2', '30'],
    ['cherry', '8', '4'],
    ['durian', '1', '99'],
  ];
  // Each row has product, qty, price, line_total — find by position
  const rows = document.querySelectorAll('[data-mfw-row]');
  rows.forEach((tr, i) => {
    if (i >= data.length) return;
    const cells = tr.querySelectorAll('input.mfw-dgrid-input, select.mfw-dgrid-input');
    if (cells[0]) { cells[0].value = data[i][0]; cells[0].dispatchEvent(new Event('input', { bubbles: true })); }
    if (cells[1]) { cells[1].value = data[i][1]; cells[1].dispatchEvent(new Event('input', { bubbles: true })); }
    if (cells[2]) { cells[2].value = data[i][2]; cells[2].dispatchEvent(new Event('input', { bubbles: true })); }
  });
});
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'r1-01-seeded.png'), fullPage: false, clip: { x: 200, y: 60, width: 1000, height: 700 } });

// 1) Shift-click 2 headers (e.g. qty asc, price desc)
const headers = await page.locator('[data-mfw-sort-col]').count();
console.log('headers:', headers);
const qtyHdr   = page.locator('[data-mfw-sort-col="quantity"]').first();
const priceHdr = page.locator('[data-mfw-sort-col="unit_price"]').first();
const qtyOk = await qtyHdr.count() > 0;
const priceOk = await priceHdr.count() > 0;
if (qtyOk) await qtyHdr.click();                                    // 1st sort: quantity asc
if (priceOk) await priceHdr.click({ modifiers: ['Shift'] });        // 2nd sort: unit_price asc
if (priceOk) await priceHdr.click({ modifiers: ['Shift'] });        // cycle: unit_price desc

await page.waitForTimeout(300);
await page.screenshot({ path: join(OUT, 'r1-02-multisort.png'), fullPage: false, clip: { x: 200, y: 60, width: 1000, height: 700 } });

const sortIndicator = await page.evaluate(() => {
  const markers = document.querySelectorAll('.mfw-dgrid-sort-mark');
  return Array.from(markers).map(m => ({
    text: m.textContent,
    col: m.parentElement?.getAttribute('data-mfw-sort-col')
  }));
});

// 2) Ctrl+Insert on first row's cell → new row appears
const beforeCount = await page.locator('[data-mfw-row]').count();
await page.locator('[data-mfw-row="0"] .mfw-dgrid-input').first().focus();
await page.keyboard.press('Control+Insert');
await page.waitForTimeout(300);
const afterInsCount = await page.locator('[data-mfw-row]').count();

// 3) Ctrl+Delete on the last row → row removed
await page.locator('[data-mfw-row]').last().locator('.mfw-dgrid-input').first().focus();
await page.keyboard.press('Control+Delete');
await page.waitForTimeout(300);
const afterDelCount = await page.locator('[data-mfw-row]').count();

// 4) Enter from cell → next row, same column
await page.locator('[data-mfw-row="0"] [data-mfw-cell="quantity"]').first().focus();
const beforeFocus = await page.evaluate(() => document.activeElement?.closest('[data-mfw-row]')?.getAttribute('data-mfw-row'));
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
const afterFocus = await page.evaluate(() => document.activeElement?.closest('[data-mfw-row]')?.getAttribute('data-mfw-row'));

// 5) Paste TSV: 2 rows × 3 cells starting at row 0, col 0
const pasteTarget = page.locator('[data-mfw-row="0"] [data-mfw-cell="product_id"], [data-mfw-row="0"] .mfw-dgrid-input').first();
await pasteTarget.focus();
await page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return;
  const data = "kiwi\t10\t5\nlemon\t20\t6";
  const dt = new DataTransfer();
  dt.setData('text/plain', data);
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
});
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'r1-03-after-paste.png'), fullPage: false, clip: { x: 200, y: 60, width: 1000, height: 700 } });

const afterPasteRows = await page.evaluate(() => {
  const trs = document.querySelectorAll('[data-mfw-row]');
  return Array.from(trs).slice(0, 4).map(tr => {
    const cells = tr.querySelectorAll('input.mfw-dgrid-input, select.mfw-dgrid-input');
    return Array.from(cells).slice(0, 3).map(c => c.value);
  });
});

const report = {
  badge,
  headers,
  sortIndicator,
  rowCounts: { before: beforeCount, afterInsert: afterInsCount, afterDelete: afterDelCount },
  enterMove: { from: beforeFocus, to: afterFocus, moved: afterFocus !== beforeFocus },
  afterPasteRows,
  consoleErrors: errs
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(join(OUT, 'r1-keyboard-sort-report.json'), JSON.stringify(report, null, 2));
await browser.close();
