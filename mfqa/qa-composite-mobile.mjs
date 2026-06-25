// Issue 2 QA: render the all-composite form at mobile + a narrow PANE-like container, measure
// each composite row/cell for overflow + too-narrow cells.
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const browser = await chromium.launch({ headless: true });
const id = Number(process.argv[2] || 862);

function measure() {
  const rows = [...document.querySelectorAll('.mf-composite-row')].map(r => {
    const rr = r.getBoundingClientRect();
    const cells = [...r.querySelectorAll('.mf-composite-cell')].map(c => Math.round(c.getBoundingClientRect().width));
    return { wrap: r.closest('.mf-field-group')?.querySelector('.mf-field-label,label')?.textContent?.trim().slice(0,24) || '?',
      rowW: Math.round(rr.width), flexWrap: getComputedStyle(r).flexWrap, cells };
  });
  const vw = window.innerWidth;
  const over = [];
  document.querySelectorAll('.mf-composite-row, .mf-composite-row *, .mf-ccp-dropdown').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 3) over.push({ cls: (el.className||'').toString().slice(0,34), w: Math.round(r.width), right: Math.round(r.right) });
  });
  return { vw, scrollW: document.documentElement.scrollWidth, pageOverflow: document.documentElement.scrollWidth > vw + 2,
    compositeRows: rows.length, rows, overflowCount: over.length, overflow: over.slice(0, 8) };
}

for (const [label, w] of [['mobile', 390], ['mobile-narrow', 340]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.goto(`http://localhost:5070/api/MegaForm/render/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  console.log(`\n=== form ${id} @ ${label} ${w}px (http ${r.status()}) ===`);
  console.log(JSON.stringify(await page.evaluate(measure), null, 1));
  await page.screenshot({ path: join(OUT, `b289-composite-${id}-${label}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
