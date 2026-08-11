// Do be rong/vi tri that cua cot bai viet va cot ben, co the kem mot file CSS ung vien.
import fs from 'node:fs';
import { chromium } from 'playwright';
const [, , url, cssFile, widthArg] = process.argv;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: parseInt(widthArg, 10) || 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
// Cuoi body, khong phai head: DNN nhet <link> CSS cua module vao trong form, nen rule tiem o head
// thua khi do dac bang nhau.
if (cssFile) {
  await page.evaluate((css) => {
    const tag = document.createElement('style');
    tag.textContent = css;
    document.body.appendChild(tag);
  }, fs.readFileSync(cssFile, 'utf8'));
}
await page.waitForTimeout(800);
const out = await page.evaluate(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position, cols: cs.gridTemplateColumns, max: cs.maxWidth };
  };
  return {
    layout: box('.mfb-article-layout'),
    prose: box('.mfb-prose'),
    aside: box('.mfb-article-layout > aside'),
    nav: box('.desktop-menu') || box('nav'),
    docHeight: document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
