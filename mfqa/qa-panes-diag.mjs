import { chromium } from 'playwright';
const BASE = 'http://localhost:5070';
const browser = await chromium.launch({ headless: true });

// Desktop: long wait, count rendered fields per form (confirm 33% forms render).
let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
let page = await ctx.newPage();
await page.goto(`${BASE}/mfqa-panes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(11000);
const desk = await page.evaluate(() => [...document.querySelectorAll('.mf-form-wrapper')].map(w => {
  const r = w.getBoundingClientRect();
  return { width: Math.round(r.width), fields: w.querySelectorAll('.mf-field-group, .mfp-field, input, select, textarea').length };
}));
console.log('DESKTOP forms (width / field count):', JSON.stringify(desk));
await ctx.close();

// Mobile: find elements wider than the viewport (overflow culprits).
ctx = await browser.newContext({ viewport: { width: 390, height: 850 } });
page = await ctx.newPage();
await page.goto(`${BASE}/mfqa-panes`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);
const over = await page.evaluate(() => {
  const vw = window.innerWidth;
  const culprits = [];
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 4 && r.right > vw + 4) {
      culprits.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), w: Math.round(r.width), right: Math.round(r.right) });
    }
  });
  // keep the widest few unique-ish
  culprits.sort((a, b) => b.w - a.w);
  return { vw, scrollW: document.documentElement.scrollWidth, top: culprits.slice(0, 8) };
});
console.log('MOBILE overflow:', JSON.stringify(over));
await ctx.close();
await browser.close();
