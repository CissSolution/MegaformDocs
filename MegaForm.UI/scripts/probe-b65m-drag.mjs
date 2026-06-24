// [B65m] Diagnose drag-ghost artifacts when dragging palette tile to canvas.
// Capture all sortable-* state classes + the drop-zone styling.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
mkdirSync('qa-out', { recursive: true });

const SITE = 'http://DNN10322_MegaTest.AI';
const TARGET = SITE + '/megaform/Home/mfFormId/1270?mfFormId=1270#mf-builder';

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(SITE + '/Login', { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(4000);
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click({ force: true });
await page.waitForTimeout(7000);

await page.goto(TARGET, { waitUntil: 'commit', timeout: 120000 });
await page.waitForTimeout(15000);

// Get Long Text tile coords + a drop-zone in canvas
const coords = await page.evaluate(() => {
  const tiles = Array.from(document.querySelectorAll('.mf-palette-item'));
  const longText = tiles.find(t => /long text/i.test(t.textContent || ''));
  const dropZones = Array.from(document.querySelectorAll('.mf-row-column, .mf-canvas-cell, [class*="drop"]'));
  const firstDrop = dropZones[0];
  return {
    src: longText ? {
      x: Math.round(longText.getBoundingClientRect().x + 10),
      y: Math.round(longText.getBoundingClientRect().y + 10),
      cls: longText.className.slice(0, 80)
    } : null,
    dst: firstDrop ? {
      x: Math.round(firstDrop.getBoundingClientRect().x + 60),
      y: Math.round(firstDrop.getBoundingClientRect().y + 30),
      cls: firstDrop.className.slice(0, 80)
    } : null
  };
});

// Begin a real drag via mouse — pause MID-DRAG to capture state
const dragState = await page.evaluate(() => ({ before: Array.from(document.querySelectorAll('[class*="sortable-"]')).map(e => ({ tag: e.tagName, cls: e.className.slice(0, 100) })) }));

if (coords.src && coords.dst) {
  await page.mouse.move(coords.src.x, coords.src.y);
  await page.mouse.down();
  // Move slowly so SortableJS triggers drag start + creates ghost/fallback
  for (let step = 1; step <= 8; step++) {
    const x = coords.src.x + ((coords.dst.x - coords.src.x) * step / 8);
    const y = coords.src.y + ((coords.dst.y - coords.src.y) * step / 8);
    await page.mouse.move(Math.round(x), Math.round(y), { steps: 5 });
    await page.waitForTimeout(80);
  }
  // FREEZE — capture mid-drag state
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'qa-out/b65m-01-mid-drag.png', fullPage: false });

  const midDrag = await page.evaluate(() => {
    const sortables = Array.from(document.querySelectorAll('[class*="sortable-"]'));
    return sortables.map(e => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        tag: e.tagName,
        cls: e.className.slice(0, 100),
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor,
        visibility: cs.visibility,
        display: cs.display,
        opacity: cs.opacity
      };
    });
  });

  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'qa-out/b65m-02-after-drop.png', fullPage: false });

  console.log(JSON.stringify({ coords, dragStateBefore: dragState.before, midDrag }, null, 2));
} else {
  console.log('NO SRC OR DST: ' + JSON.stringify(coords));
}

await browser.close();
