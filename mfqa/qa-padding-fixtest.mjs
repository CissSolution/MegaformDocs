import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const browser = await chromium.launch({ headless: true });

const FIX = `
@container mfpane (max-width:600px){
  .mf-form-wrapper.mf-custom-shell-mode{ --mf-form-edge-pad:8px; }
  .mf-form-wrapper .mf-form-inner{ padding-left:16px !important; padding-right:16px !important; }
}
@container mfpane (max-width:380px){
  .mf-form-wrapper.mf-custom-shell-mode{ --mf-form-edge-pad:6px; }
  .mf-form-wrapper .mf-form-inner{ padding-left:12px !important; padding-right:12px !important; }
}`;

function measureJs() {
  return [...document.querySelectorAll('.mf-form-wrapper')].map(wr => {
    const inner = wr.querySelector('.mf-form-inner');
    const field = wr.querySelector('.mf-form-inner input,.mf-form-inner select,.mf-form-inner textarea, .mfp input,.mfp select');
    const wcs = getComputedStyle(wr);
    const ics = inner ? getComputedStyle(inner) : null;
    const fieldW = field ? Math.round(field.getBoundingClientRect().width) : null;
    return {
      id: wr.getAttribute('data-form-id'), wrapW: Math.round(wr.getBoundingClientRect().width),
      wrapPad: wcs.paddingLeft, innerPad: ics ? ics.paddingLeft : null, fieldW,
    };
  });
}

for (const [label, w, h] of [['desktop', 1280, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5070/mfqa-panes', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  console.log('BEFORE', JSON.stringify(await page.evaluate(measureJs)));
  await page.addStyleTag({ content: FIX });
  await page.waitForTimeout(400);
  console.log('AFTER ', JSON.stringify(await page.evaluate(measureJs)));
  await page.screenshot({ path: join(OUT, `b286-padding-fixed-${label}.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
