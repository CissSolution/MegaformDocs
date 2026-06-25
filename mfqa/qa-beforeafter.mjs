// Side-by-side BEFORE/AFTER zoom of the SAME HtmlText module ▼ ("Intro" toggle).
// BEFORE = b279-editmode-chrome.png (pre-B277-fix: every toggle had the box).
// AFTER  = live capture now (HtmlText toggle = native caret, no box).
import { login, BASE, OUT } from './lib.mjs';
import { chromium } from 'playwright';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true }); // match b279 (DSF1, 1280x900)
const page = await ctx.newPage();
await login(page);
await page.goto(`${BASE}/mfqa-panes?edit=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);

const region = await page.evaluate(() => {
  const MEGA = '.mf-form-wrapper, .mf-oq-admin-dock, .megaform-module';
  const toggles = [...document.querySelectorAll('.app-moduleactions .dropdown-toggle')];
  // pick a MEGAFORM toggle (the one the user circled) — its box was kept by B277, now removed by B278
  const t = toggles.find(x => { const b = x.closest('.app-pane-admin-border'); return b && b.querySelector(MEGA); });
  if (!t) return null;
  const r = t.getBoundingClientRect();
  return { x: Math.round(Math.max(0, r.left - 12)), y: Math.round(Math.max(0, r.top - 12)), w: 360, h: Math.round(r.height + 24) };
});
if (!region) { console.log('no html-text toggle found'); await browser.close(); process.exit(1); }

const afterPath = join(OUT, '_after-crop.png');
await page.screenshot({ path: afterPath, clip: { x: region.x, y: region.y, width: region.w, height: region.h } });
await ctx.close();

const beforeB64 = readFileSync(join(OUT, 'b279-editmode-chrome.png')).toString('base64');
const afterB64 = readFileSync(afterPath).toString('base64');
const Z = 3, W = region.w * Z, H = region.h * Z;
const html = `<!doctype html><html><body style="margin:0;background:#0b0b0b;font-family:sans-serif">
<div style="display:flex;gap:16px;padding:16px;width:max-content">
  <div>
    <div style="color:#ff6b6b;font-weight:700;font-size:15px;margin-bottom:6px">BEFORE — nút MegaForm có hộp + viền</div>
    <div style="width:${W}px;height:${H}px;border:2px solid #ff3b3b;image-rendering:pixelated;
      background-image:url('data:image/png;base64,${beforeB64}');
      background-repeat:no-repeat;background-size:${1280 * Z}px auto;
      background-position:-${region.x * Z}px -${region.y * Z}px"></div>
  </div>
  <div>
    <div style="color:#22c55e;font-weight:700;font-size:15px;margin-bottom:6px">AFTER (B277) — caret native, không hộp</div>
    <div style="width:${W}px;height:${H}px;border:2px solid #22c55e;image-rendering:pixelated;
      background-image:url('data:image/png;base64,${afterB64}');
      background-repeat:no-repeat;background-size:${W}px auto;background-position:0 0"></div>
  </div>
</div></body></html>`;

const comp = await browser.newContext({ viewport: { width: W * 2 + 80, height: H + 90 } });
const cp = await comp.newPage();
await cp.setContent(html, { waitUntil: 'load' });
await cp.waitForTimeout(300);
await cp.screenshot({ path: join(OUT, 'b283-megaform-toggle-beforeafter.png') });
console.log('wrote b283-megaform-toggle-beforeafter.png; region=', JSON.stringify(region));
await browser.close();
