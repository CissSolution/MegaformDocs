// Responsive QA of the MF Pane QA page (/mfqa-panes): MegaForm in 50%/33% Oqtane panes.
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const BASE = 'http://localhost:5070';
const browser = await chromium.launch({ headless: true });

async function capture(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/mfqa-panes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const wrappers = [...document.querySelectorAll('.mf-form-wrapper')];
    const panes = [...document.querySelectorAll('[class*="pane"], .col, [class*="col-"]')];
    // measure each form wrapper's width + whether it overflows its parent pane
    const forms = wrappers.slice(0, 8).map(w => {
      const r = w.getBoundingClientRect();
      const parent = w.parentElement ? w.parentElement.getBoundingClientRect() : r;
      return { w: Math.round(r.width), overflowsParent: r.width > parent.width + 2 };
    });
    return {
      docScrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      formCount: wrappers.length,
      forms,
    };
  });
  console.log(`[${label} ${w}x${h}]`, JSON.stringify(info));
  await page.screenshot({ path: join(OUT, `b276-panes-${label}.png`), fullPage: true });
  await ctx.close();
}

await capture('desktop', 1440, 900);
await capture('tablet', 820, 1100);
await capture('mobile', 390, 850);
await browser.close();
console.log('done');
