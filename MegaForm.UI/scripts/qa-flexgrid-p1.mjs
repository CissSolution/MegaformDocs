// [FlexGrid P1 QA] Visual QA — render form 326 at lg / md / sm viewports
// to confirm CSS Grid placement honours per-breakpoint x/y/w/h.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function probeAt(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/xx?formid=326`, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 60000 });
  await page.waitForTimeout(2500);

  const probe = await page.evaluate(() => {
    const grid = document.querySelector('.mf-flexgrid');
    if (!grid) return { found: false };
    const gs = getComputedStyle(grid);
    const items = Array.from(grid.querySelectorAll('.mf-flexgrid-item')).map(el => {
      const cs = getComputedStyle(el);
      const id = el.getAttribute('data-mf-grid-id');
      const label = el.querySelector('.mf-field-label, label')?.textContent?.trim() || null;
      const r = el.getBoundingClientRect();
      return {
        id, label,
        gridColumnStart: cs.gridColumnStart,
        gridColumnEnd:   cs.gridColumnEnd,
        gridRowStart:    cs.gridRowStart,
        gridRowEnd:      cs.gridRowEnd,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
    return {
      found: true,
      gridCols: gs.gridTemplateColumns.split(' ').length,
      gridGap: gs.gap,
      itemCount: items.length,
      items,
    };
  });
  console.log(`\n=== ${label} (viewport ${w}×${h}) ===`);
  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({ path: join(OUT, `qa-flexgrid-p1-${label}.png`), fullPage: false });
  await ctx.close();
  return probe;
}

await probeAt('lg', 1280, 900);
await probeAt('md', 900, 900);
await probeAt('sm', 480, 900);

await browser.close();
