import { launch, shot, BASE, OUT } from './lib.mjs';
import { join } from 'node:path';

const { browser, page, errs } = await launch();

async function measure(id, label) {
  await page.goto(`${BASE}/api/MegaForm/render/${id}`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const form = document.querySelector('.mf-form');
    const inner = document.querySelector('.mf-form-inner');
    const grid = document.querySelector('.mf-flexgrid');
    const cs = el => el ? getComputedStyle(el) : null;
    const f = cs(form), i = cs(inner), g = cs(grid);
    return {
      formPadding: f?.padding, formBorder: f?.borderTopWidth + ' ' + f?.borderStyle + ' ' + f?.borderTopColor,
      formShadow: (f?.boxShadow || '').slice(0, 40), formRadius: f?.borderTopLeftRadius,
      innerMaxWidth: i?.maxWidth, gridGap: g?.gap || g?.gridGap,
    };
  });
  console.log(`--- ${label} (form ${id}) ---`);
  console.log(JSON.stringify(m, null, 2));
  await shot(page, `task1-${label}.png`);
  return m;
}

const ov = await measure(860, 'standard-overrides');
const df = await measure(861, 'standard-default');

console.log('\n=== EFFECT CHECK (override vs default must differ) ===');
const checks = {
  'max-width 480px': ov.innerMaxWidth === '480px' && df.innerMaxWidth !== '480px',
  'radius 22px': ov.formRadius === '22px' && df.formRadius !== '22px',
  'border 3px ocean': /3px/.test(ov.formBorder) && !/3px/.test(df.formBorder),
  'grid gap 30px': /30px/.test(ov.gridGap || '') && !/30px/.test(df.gridGap || ''),
  'shadow present': (ov.formShadow||'').length > 4 && ov.formShadow !== df.formShadow,
  'padding 48': /48px/.test(ov.formPadding || ''),
};
console.log(JSON.stringify(checks, null, 2));
console.log('ALL PASS:', Object.values(checks).every(Boolean));
console.log('ERRORS:', JSON.stringify(errs.slice(0,5)));
await browser.close();
