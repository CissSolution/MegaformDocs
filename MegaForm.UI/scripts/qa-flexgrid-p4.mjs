// [FlexGrid P4 QA] Verify breakpoint tabs work:
//  1) 3 tabs (lg/md/sm) visible in header
//  2) Click "md" → active state moves
//  3) Resize while md active → modifies item.placement.md
//  4) Click "lg" → cell shows lg.w (original), not md.w
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

// 1) Tabs present + which is active
const tabs = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.mf-fg-bp-btn'));
  return {
    count: btns.length,
    active: btns.filter(b => b.classList.contains('is-active')).map(b => b.getAttribute('data-bp')),
    all: btns.map(b => ({ bp: b.getAttribute('data-bp'), active: b.classList.contains('is-active') })),
  };
});
console.log('=== STEP 1 — TABS ===');
console.log(JSON.stringify(tabs, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p4-01-tabs-lg.png'), fullPage: false });

// 2) Click "md" tab
await page.click('.mf-fg-bp-btn[data-bp="md"]');
await page.waitForTimeout(500);
const afterMd = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.mf-fg-bp-btn'));
  return btns.map(b => ({ bp: b.getAttribute('data-bp'), active: b.classList.contains('is-active') }));
});
console.log('=== STEP 2 — Active tab after click md ===');
console.log(JSON.stringify(afterMd, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p4-02-md-active.png'), fullPage: false });

// 3) Click sm tab → cells should ALL stack full width (because schema sm.w=12 for all items)
await page.click('.mf-fg-bp-btn[data-bp="sm"]');
await page.waitForTimeout(500);
const smView = await page.evaluate(() => {
  const cells = Array.from(document.querySelectorAll('.mf-flexgrid-item'));
  return {
    count: cells.length,
    allFullWidth: cells.every(c => parseInt(c.style.getPropertyValue('--lg-w'), 10) === 12),
    firstCellW: parseInt(cells[0]?.style.getPropertyValue('--lg-w') || '0', 10),
  };
});
console.log('=== STEP 3 — sm tab: cells display sm placement (all w=12) ===');
console.log(JSON.stringify(smView, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p4-03-sm-stacked.png'), fullPage: false });

// 4) Switch back to lg → first cell should be w=6 (or 11 if previous P3 drag persisted)
await page.click('.mf-fg-bp-btn[data-bp="lg"]');
await page.waitForTimeout(500);
const lgView = await page.evaluate(() => {
  const firstCell = document.querySelector('.mf-flexgrid-item[data-item-index="0"]');
  return {
    firstCellW: parseInt(firstCell?.style.getPropertyValue('--lg-w') || '0', 10),
  };
});
console.log('=== STEP 4 — lg tab: first cell w (was 6 in schema, may be 11 if P3 drag persisted) ===');
console.log(JSON.stringify(lgView, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p4-04-lg-back.png'), fullPage: false });

await browser.close();
