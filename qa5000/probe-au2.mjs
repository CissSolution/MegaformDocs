import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
const p = await ctx.newPage();
await p.goto('http://localhost:5000/api/MegaForm/render/13?p2=' + Date.now(), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
await p.addStyleTag({ content: 'html,body{background:#0b0b0b!important}' });
await p.waitForTimeout(1500);
const info = await p.evaluate(() => {
  const root = document.querySelector('.mfp.mfp-australia');
  const out = { id: root.id, inlineStyle: root.getAttribute('style'), tag: root.tagName };
  out.computedBefore = getComputedStyle(root).backgroundColor;
  // set inline directly (inline beats everything except inline !important elsewhere)
  root.style.setProperty('background', '#00ff00', 'important');
  out.computedAfterInline = getComputedStyle(root).backgroundColor;
  // Which element actually has a visible (non-transparent) bg in the body region?
  const heading = [...document.querySelectorAll('.mfp.mfp-australia *')].find(e => /Tell us about/i.test(e.textContent || '') && e.children.length < 3);
  out.bodyWrapperChain = [];
  let e = heading;
  for (let i = 0; e && i < 7; i++, e = e.parentElement) {
    out.bodyWrapperChain.push({ cls: e.className && e.className.toString().slice(0, 40), bg: getComputedStyle(e).backgroundColor });
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await b.close();
