// [FlexGrid P3 QA] Visual QA — resize an item via simulated mouse drag on
// the SE corner handle. Verify cell.width grows by snap-to-col amount.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

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

// Snapshot BEFORE
const before = await page.evaluate(() => {
  const cell = document.querySelector('.mf-flexgrid-item[data-item-index="0"]');  // First Name
  if (!cell) return { found: false };
  const cs = getComputedStyle(cell);
  const builderEl = document.querySelector('.mf-builder, #mf-builder-root, [data-mf-builder]');
  return {
    found: true,
    w: parseInt(cell.style.getPropertyValue('--lg-w'), 10),
    h: parseInt(cell.style.getPropertyValue('--lg-h'), 10),
    rect: cell.getBoundingClientRect().toJSON(),
    hasHandleSE: !!cell.querySelector('.mf-fg-handle-se'),
    hasHandleE:  !!cell.querySelector('.mf-fg-handle-e'),
    hasHandleS:  !!cell.querySelector('.mf-fg-handle-s'),
    computed: {
      alignSelf: cs.alignSelf,
      minHeight: cs.minHeight,
      display: cs.display,
      height: cs.height,
    },
    hasBuilderShell: !!builderEl,
    builderShellClass: builderEl ? builderEl.className : null,
    seHandleRect: cell.querySelector('.mf-fg-handle-se')?.getBoundingClientRect().toJSON() || null,
  };
});
console.log('=== BEFORE ===');
console.log(JSON.stringify(before, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p3-01-before.png'), fullPage: false });

// Hover the cell to expose handle
await page.hover('.mf-flexgrid-item[data-item-index="0"]');
await page.waitForTimeout(300);

// Drag the SE corner handle to the RIGHT to extend width by ~3 cols (≈ +180px on 1440 viewport).
// First Name was lg.w=6 → after drag should snap toward 12.
const handle = await page.evaluate(() => {
  const h = document.querySelector('.mf-flexgrid-item[data-item-index="0"] .mf-fg-handle-se');
  if (!h) return null;
  const r = h.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (handle) {
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 240, handle.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(800);
}

const after = await page.evaluate(() => {
  const cell = document.querySelector('.mf-flexgrid-item[data-item-index="0"]');
  if (!cell) return { found: false };
  return {
    found: true,
    w: parseInt(cell.style.getPropertyValue('--lg-w'), 10),
    h: parseInt(cell.style.getPropertyValue('--lg-h'), 10),
    rect: cell.getBoundingClientRect().toJSON(),
  };
});
console.log('=== AFTER (drag SE +240px right) ===');
console.log(JSON.stringify(after, null, 2));
await page.screenshot({ path: join(OUT, 'qa-flexgrid-p3-02-after.png'), fullPage: false });

const dCols = (after.w || 0) - (before.w || 0);
console.log(`\n=== SUMMARY === col delta = ${dCols} (expected +3 or +4 for 240px drag)`);
await browser.close();
