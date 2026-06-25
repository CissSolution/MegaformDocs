// Regression check: does container-type + the @container fix harm a FULL-WIDTH render of the ey form?
// Loads /api/MegaForm/render/848 at desktop; the @container(max-width:600) must NOT fire (wrapper is wide),
// so the showcase hero/2-col layout must stay intact. Also reports hydration state.
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

async function measure(page) {
  return await page.evaluate(() => {
    const vw = window.innerWidth;
    const ey = document.querySelector('.mfp-euro-youth');
    const wrap = ey?.closest('.mf-form-wrapper');
    const fc = document.querySelector('[id^="mf-fields-container-"]');
    const shell = document.querySelector('.ey-shell');
    const hero = document.querySelector('.ey-hero');
    const grid2 = document.querySelector('.ey-grid-2');
    return {
      vw, scrollW: document.documentElement.scrollWidth, pageOverflow: document.documentElement.scrollWidth > vw + 2,
      wrapW: wrap ? Math.round(wrap.getBoundingClientRect().width) : null,
      shellCols: shell ? getComputedStyle(shell).gridTemplateColumns.slice(0, 50) : null,
      heroVisible: hero ? getComputedStyle(hero).display !== 'none' : null,
      grid2Cols: grid2 ? getComputedStyle(grid2).gridTemplateColumns.slice(0, 50) : null,
      hydrated: fc ? fc.getAttribute('data-mf-hydrated') : null,
      ssr: fc ? fc.getAttribute('data-mf-ssr') : null,
    };
  });
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const resp = await page.goto(`${BASE}/api/MegaForm/render/848`, { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('HTTP', resp.status());
await page.waitForTimeout(9000);
console.log('FULLWIDTH BEFORE', JSON.stringify(await measure(page)));
await page.addStyleTag({ content: FIX_CSS });
await page.waitForTimeout(400);
console.log('FULLWIDTH AFTER ', JSON.stringify(await measure(page)));
await page.screenshot({ path: 'mfqa/out/b278-ey-fullwidth-after.png', fullPage: true });
await ctx.close();
await browser.close();
console.log('done');
