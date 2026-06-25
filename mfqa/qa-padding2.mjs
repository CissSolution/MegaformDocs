import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5070/mfqa-panes', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000);
const data = await page.evaluate(() => {
  const out = {};
  // (a) template .mfp padding for premium forms
  out.mfp = [...document.querySelectorAll('.mfp')].slice(0, 4).map(m => {
    const cs = getComputedStyle(m);
    return { cls: (m.className||'').toString().slice(0,40), padL: cs.paddingLeft, padR: cs.paddingRight, maxW: cs.maxWidth, w: Math.round(m.getBoundingClientRect().width) };
  });
  // (b) walk up from a wrapper to find which ancestor introduces the 36px each-side gap
  const wr = document.querySelector('.mf-form-wrapper');
  const chain = [];
  let el = wr;
  for (let i = 0; i < 8 && el; i++) {
    const cs = getComputedStyle(el);
    chain.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,45), padL: cs.paddingLeft, padR: cs.paddingRight, marL: cs.marginLeft, marR: cs.marginRight, w: Math.round(el.getBoundingClientRect().width) });
    el = el.parentElement;
  }
  out.chain = chain;
  return out;
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
