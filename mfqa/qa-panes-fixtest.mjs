// Live A/B test of the container-query CSS fix, hardened against the "ey" template's own
// @media(min-width:1024px) desktop rules (which fire by VIEWPORT and fight the fix in a narrow pane).
// Higher specificity (.mf-form-wrapper prefix) guarantees the container rule wins regardless of source order.
import { chromium } from 'playwright';
const BASE = 'http://localhost:5070';
const browser = await chromium.launch({ headless: true });

const FIX_CSS = `
.mf-form-wrapper{container-type:inline-size;container-name:mfpane;max-width:100%}
.mf-form-wrapper .mfp .ey-shell,.mf-form-wrapper .mfp .ey-panel,.mf-form-wrapper .mfp .ey-card,
.mf-form-wrapper .mfp .ey-stepper,.mf-form-wrapper .mfp .ey-step{min-width:0!important}
@container mfpane (max-width:600px){
  .mf-form-wrapper .mfp-euro-youth .ey-shell{grid-template-columns:1fr!important}
  .mf-form-wrapper .mfp-euro-youth .ey-hero{display:none!important}
  .mf-form-wrapper .mfp-euro-youth .ey-grid-2{grid-template-columns:1fr!important}
  .mf-form-wrapper .mfp-euro-youth .ey-accom{grid-template-columns:1fr!important}
  .mf-form-wrapper .mfp-euro-youth .ey-panel{padding:24px 16px!important}
  .mf-form-wrapper .mfp-euro-youth .ey-card{padding:20px!important}
  .mf-form-wrapper .mfp-euro-youth .ey-step-text{display:none!important}
  .mf-form-wrapper .mfp-euro-youth .ey-actions{flex-wrap:wrap;gap:8px}
}`;

async function measure(page, label) {
  return await page.evaluate((lbl) => {
    const vw = window.innerWidth;
    const ey = document.querySelector('.mfp-euro-youth');
    const wrap = ey?.closest('.mf-form-wrapper');
    const wrapW = wrap ? Math.round(wrap.getBoundingClientRect().width) : null;
    const get = c => { const el = document.querySelector('.' + c); return el ? Math.round(el.getBoundingClientRect().width) : null; };
    const shell = document.querySelector('.ey-shell');
    const shellCols = shell ? getComputedStyle(shell).gridTemplateColumns.slice(0, 40) : null;
    const heroVisible = (() => { const h = document.querySelector('.ey-hero'); return h ? getComputedStyle(h).display !== 'none' : null; })();
    const panelW = get('ey-panel');
    return {
      lbl, vw, scrollW: document.documentElement.scrollWidth, pageOverflow: document.documentElement.scrollWidth > vw + 2,
      wrapW, panelW, panelOverflowsPane: panelW != null && wrapW != null && panelW > wrapW + 2,
      shellCols, heroVisible,
    };
  }, label);
}

for (const [label, w, h] of [['vp1280', 1280, 900], ['vp1100', 1100, 900], ['mobile', 390, 850]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/mfqa-panes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  console.log('BEFORE', JSON.stringify(await measure(page, label)));
  await page.addStyleTag({ content: FIX_CSS });
  await page.waitForTimeout(400);
  console.log('AFTER ', JSON.stringify(await measure(page, label)));
  await ctx.close();
}
await browser.close();
console.log('done');
