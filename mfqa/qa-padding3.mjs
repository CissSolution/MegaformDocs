import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'mfqa', 'out');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5070/mfqa-panes', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);

const res = await page.evaluate(() => {
  const wr = [...document.querySelectorAll('.mf-form-wrapper')].find(w => w.getAttribute('data-form-id') === '865');
  if (!wr) return { err: 'no 865' };
  const firstField = wr.querySelector('input,select,textarea');
  // walk DOWN from wrapper to the first field, listing every element + its horizontal padding/margin
  const path = [];
  let el = firstField;
  const stack = [];
  while (el && el !== wr.parentElement) { stack.unshift(el); el = el.parentElement; }
  const wrLeft = wr.getBoundingClientRect().left;
  for (const e of stack) {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    path.push({
      tag: e.tagName.toLowerCase(), cls: (e.className||'').toString().slice(0,38),
      padL: cs.paddingLeft, padR: cs.paddingRight, marL: cs.marginLeft, marR: cs.marginRight,
      w: Math.round(r.width), leftFromWrap: Math.round(r.left - wrLeft),
    });
  }
  const r = wr.getBoundingClientRect();
  return { wrapRect: { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, path };
});
console.log(JSON.stringify(res, null, 1));
if (res.wrapRect) {
  await page.screenshot({ path: join(OUT, 'b285-form865-zoom.png'), clip: { x: Math.max(0,res.wrapRect.left-8), y: Math.max(0,res.wrapRect.top-8), width: res.wrapRect.w+16, height: Math.min(420, res.wrapRect.h+16) } });
}
await browser.close();
