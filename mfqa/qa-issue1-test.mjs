// Reproduce the PANE scenario on an isolated form: WIDE viewport (1280, so viewport @media(<=640)
// does NOT fire) + a NARROW container (wrapper constrained to ~300px, so @container fires).
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const browser = await chromium.launch({ headless: true });

const CONSTRAIN = `.mf-form-wrapper{max-width:300px !important; margin-right:auto !important;}`;
const FIX = `
@container mfpane (max-width:600px){
  .mf-form-wrapper .mf-row{ grid-template-columns:1fr !important; }
  .mf-form-wrapper .mf-option-group.mf-cols-2,
  .mf-form-wrapper .mf-option-group.mf-cols-3,
  .mf-form-wrapper .mf-option-group.mf-cols-4{ grid-template-columns:1fr !important; }
  .mf-form-wrapper.mf-custom-shell-mode{ --mf-form-edge-pad:8px; }
  .mf-form-wrapper .mf-form-inner{ padding-left:16px !important; padding-right:16px !important; }
}`;

function measure() {
  const wr = document.querySelector('.mf-form-wrapper');
  const rows = [...document.querySelectorAll('.mf-row')].slice(0, 4).map(r => getComputedStyle(r).gridTemplateColumns.slice(0, 50));
  const inner = wr?.querySelector('.mf-form-inner');
  const fields = [...document.querySelectorAll('.mf-field-group input,.mf-field-group select,.mf-field-group textarea')].slice(0, 6).map(f => Math.round(f.getBoundingClientRect().width));
  return {
    wrapW: wr ? Math.round(wr.getBoundingClientRect().width) : null,
    wrapPad: wr ? getComputedStyle(wr).paddingLeft : null,
    innerPad: inner ? getComputedStyle(inner).paddingLeft : null,
    mfRowCols: rows, fieldWidths: fields,
  };
}

for (const id of [859, 865]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const r = await page.goto(`http://localhost:5070/api/MegaForm/render/${id}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  await page.addStyleTag({ content: CONSTRAIN });          // simulate a ~300px pane on a wide screen
  await page.waitForTimeout(300);
  console.log(`\n=== form ${id} (http ${r.status()}) — constrained to 300px ===`);
  console.log('BUG  ', JSON.stringify(await page.evaluate(measure)));
  await page.addStyleTag({ content: FIX });
  await page.waitForTimeout(300);
  console.log('FIXED', JSON.stringify(await page.evaluate(measure)));
  await ctx.close();
}
await browser.close();
