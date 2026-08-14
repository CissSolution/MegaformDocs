/**
 * Screenshot every /mf-templates review page, so a layout change can be inspected instead of
 * assumed. Writes qa-out/review/<name>.png plus an index.html contact sheet.
 *
 *   node tools/browser-qa/shoot-review-pages.mjs [--site http://megaclean008.ai] [--only slug]
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('--site', 'http://megaclean008.ai').replace(/\/$/, '');
const ONLY = arg('--only', null);
const OUT = join(process.cwd(), 'qa-out', 'review');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  'mf-xmas-sale', 'mf-xmas-newsletter', 'mf-agency-flyer', 'mf-first-book', 'mf-gold-suite',
  'mf-rose-wellness', 'mf-newsletter-amber', 'mf-job-application', 'mf-lagoon-booking',
  'mf-product-order', 'mf-golden-pro', 'mf-invoice-navy', 'mf-invoice-spinera',
  'mf-invoice-codexo', 'mf-corporate-reg', 'mf-ielts-report', 'mf-massage-intake',
  'mf-massage-body', 'mf-festa-italiana',
].filter((p) => !ONLY || p.includes(ONLY));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const rows = [];
for (const name of PAGES) {
  const page = await ctx.newPage();
  const url = `${SITE}/mf-templates/${name}`;
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => null);
  await page.waitForTimeout(1200);
  const status = res ? res.status() : 0;
  // What the owner is checking for: no page-chrome band around the design, no back link, and the
  // design filling the pane.
  const probe = await page.evaluate(() => {
    const mfp = document.querySelector('.mfp');
    const wrap = document.querySelector('.mf-form-wrapper');
    const back = /All forms|Back to Forms|Back to form gallery|Back to all forms/i.test(
      (mfp && mfp.innerText) || '');
    const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : 0);
    const inner = mfp && mfp.firstElementChild;
    return { mfp: w(mfp), wrap: w(wrap), inner: w(inner), back };
  }).catch(() => ({}));
  const png = join(OUT, name + '.png');
  await page.screenshot({ path: png, fullPage: true }).catch(() => {});
  rows.push({ name, url, status, ...probe });
  console.log(`${status} ${name.padEnd(22)} pane ${probe.wrap || '?'}  design ${probe.inner || '?'}`
    + (probe.back ? '  <-- BACK LINK STILL THERE' : ''));
  await page.close();
}
await browser.close();

writeFileSync(join(OUT, 'index.html'),
  `<meta charset="utf-8"><title>review pages</title>`
  + `<body style="margin:0;background:#0b0f14;color:#e2e8f0;font:14px system-ui">`
  + rows.map((r) => `<div style="padding:16px 20px">`
    + `<div style="font-weight:700">${r.name} <span style="color:#94a3b8">— ${r.status}, pane `
    + `${r.wrap}px, design ${r.inner}px${r.back ? ', BACK LINK' : ''}</span></div>`
    + `<a href="${r.url}" style="color:#38bdf8;font-size:12px">${r.url}</a><br>`
    + `<img src="${r.name}.png" style="max-width:100%;margin-top:8px;border:1px solid #1e293b">`
    + `</div>`).join('')
  + `</body>`);
console.log(`\nsheet -> ${join(OUT, 'index.html')}`);
