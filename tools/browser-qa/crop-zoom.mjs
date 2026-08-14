/**
 * Crop the SAME rectangle out of mock.png and template.png and blow it up side by side.
 *
 * report.json only measures elements it can key by text, so anything drawn - a corner accent, a
 * gradient, a divider - is invisible to it and only shows up as a bitmap percentage. This is how
 * you look at that percentage.
 *
 *   node tools/browser-qa/crop-zoom.mjs qa-out/iter/corporate-reg 0,0,220,140 --scale 3
 *   node tools/browser-qa/crop-zoom.mjs qa-out/iter/corporate-reg 0,760,300,190 --out corner.png
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const [dir, rect] = process.argv.slice(2);
if (!dir || !rect) { console.error('usage: crop-zoom.mjs <iterDir> x,y,w,h [--scale N] [--out name.png]'); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SCALE = Number(arg('--scale', 3));
const OUT = join(dir, arg('--out', 'zoom.png'));
const [x, y, w, h] = rect.split(',').map(Number);

const b64 = (f) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto('about:blank');
const png = await page.evaluate(async ({ a, c, x, y, w, h, s }) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
  const [ia, ic] = await Promise.all([load(a), load(c)]);
  const gap = 16, lab = 22;
  const cv = document.createElement('canvas');
  cv.width = w * s * 2 + gap; cv.height = h * s + lab;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#111'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff'; g.font = '13px monospace';
  g.fillText('MOCK', 4, 15); g.fillText('TEMPLATE', w * s + gap + 4, 15);
  g.drawImage(ia, x, y, w, h, 0, lab, w * s, h * s);
  g.drawImage(ic, x, y, w, h, w * s + gap, lab, w * s, h * s);
  return cv.toDataURL('image/png').split(',')[1];
}, { a: b64('mock.png'), c: b64('template.png'), x, y, w, h, s: SCALE });
writeFileSync(OUT, Buffer.from(png, 'base64'));
await browser.close();
console.log(`${OUT}  (${w}x${h} at ${SCALE}x)`);
