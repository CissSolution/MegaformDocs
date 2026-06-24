// Trace the DOM hierarchy of form 333 to find which element constrains width
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://dnn10322_megaf.ai';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join(process.cwd(), 'qa-out');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/Login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill('host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill('dnnhost');
await Promise.all([
  page.waitForLoadState('domcontentloaded'),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click()
]);

await page.goto(`${BASE}/xx?formid=333`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);

// Walk from the visible form card upward — find every ancestor's width + max-width
const trace = await page.evaluate(() => {
  // Find the WEDDING CARD specifically (innermost element) — try `.mfp.fr-inv` or any narrow element
  const innermost = document.querySelector('.mfp.fr-inv, .mfp[class*="fr-inv"], .fr-inv, .mfp, .mf-form');
  if (!innermost) return { error: 'no form found' };
  // Walk up
  const chain = [];
  let cur = innermost;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const cs = getComputedStyle(cur);
    chain.push({
      tag: cur.tagName,
      cls: cur.className.split(' ').slice(0, 4).join('.'),
      id: cur.id || '',
      width: Math.round(cur.getBoundingClientRect().width),
      maxWidth: cs.maxWidth,
      computedDisplay: cs.display,
      padding: cs.paddingLeft + ' / ' + cs.paddingRight,
      margin: cs.marginLeft + ' / ' + cs.marginRight,
      cssVarFormMax: cur.style.getPropertyValue('--mf-form-max-width') || '(unset)'
    });
    cur = cur.parentElement;
  }
  return { chain, bodyWidth: document.body.getBoundingClientRect().width };
});

console.log('=== DOM trace from form card to body ===');
console.log(`Body width: ${trace.bodyWidth}px`);
trace.chain.forEach((el, i) => {
  console.log(`[${i}] <${el.tag}${el.id?'#'+el.id:''} class="${el.cls}"> width=${el.width}px maxWidth=${el.maxWidth} pad=${el.padding} mar=${el.margin} cssVar=${el.cssVarFormMax}`);
});

// PROBE 2: Try injecting different overrides and measure what works
const trials = await page.evaluate(() => {
  const targets = [
    { sel: '.mf-form-wrapper', maxw: '100%' },
    { sel: '.mfp', maxw: '100%' },
    { sel: '.mf-form-wrapper > .mf-form-inner', maxw: '100%' },
    { sel: '.mf-form-wrapper, .mf-form-wrapper > *', maxw: '100%' }
  ];
  const results = [];
  // Test each, then revert
  for (const t of targets) {
    const style = document.createElement('style');
    style.textContent = `${t.sel} { max-width: ${t.maxw} !important; width: ${t.maxw} !important; }`;
    document.head.appendChild(style);
    const card = document.querySelector('.mf-form-wrapper > .mf-form-inner, .mfp');
    const w = card ? card.getBoundingClientRect().width : 0;
    results.push({ sel: t.sel, gotWidth: Math.round(w) });
    style.remove();
  }
  return results;
});
console.log('\n=== Trial overrides ===');
trials.forEach(t => console.log(`  ${t.sel} → ${t.gotWidth}px`));

await page.screenshot({ path: join(OUT, 'qa-form333-current.png'), fullPage: false });
writeFileSync(join(OUT, 'qa-form333-trace.json'), JSON.stringify(trace, null, 2));
await browser.close();
