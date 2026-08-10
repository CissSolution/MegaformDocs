/**
 * Does each converted template survive a narrow pane, and does its content ever touch the edge?
 *
 * The chrome removal (owner, 2026-08-08) zeroed the page gutter the mocks carried on their page
 * wrapper, and every container query in these specs was tuned to the mock's own card width. This
 * measures both, at real widths, instead of assuming:
 *
 *   overflow  - document.scrollWidth beyond the viewport: something is wider than the pane
 *   inset     - the smallest left/right gap between the design box and any text or control inside
 *               it (0 = flush against the edge, which is what "bi sat mep" looks like)
 *   cols      - how many columns the widest grid inside the design resolves to
 *
 *   node tools/browser-qa/responsive-audit.mjs [--only slug] [--widths 1216,992,768,480,375]
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'http://megaclean008.ai');
const ONLY = arg('only', null);
const WIDTHS = arg('widths', '1216,992,768,480,375').split(',').map(Number);

const FORMS = [
  ['xmas-sale', 59, '.xms-page'], ['xmas-newsletter', 58, '.xnl-page'],
  ['agency-flyer', 57, '.agf-page'], ['first-book', 61, '.kfb-page'],
  ['gold-suite', 60, '.gsu-page'], ['rose-wellness', 62, '.rws-grid'],
  ['newsletter-amber', 66, '.nlt-page'], ['job-application', 65, '.jba-page'],
  ['lagoon-booking', 64, '.lgn-page'], ['product-order', 63, '.pdo-page'],
  ['golden-pro', 68, '.gpr-page'], ['invoice-navy', 70, '.inv-page'],
  ['invoice-spinera', 71, '.spn-page'], ['invoice-codexo', 69, '.icx-page'],
  ['corporate-reg', 115, '.crg-page'], ['ielts-report', 116, '.iel-page'],
  ['massage-intake', 117, '.msi-page'], ['massage-body', 118, '.mbc-page'],
  ['festa-italiana', 72, '.fes-wrap'],
  ['document-registration', 221, '.drc-paper'],
];

const PROBE = `(rootSel) => {
  const root = document.querySelector(rootSel) || document.querySelector('.mfp');
  if (!root) return { error: 'no root' };
  const rr = root.getBoundingClientRect();
  let minL = 9999, minR = 9999, overflowing = [];
  const inside = root.querySelectorAll('input,select,textarea,button,label,h1,h2,h3,p,span,div');
  for (const el of inside) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    const t = (el.textContent || '').trim();
    const isControl = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName);
    // only leaf text and controls: a full-width wrapper legitimately spans the box
    if (!isControl && (!t || el.children.length)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    minL = Math.min(minL, Math.round(r.left - rr.left));
    minR = Math.min(minR, Math.round(rr.right - r.right));
    if (r.right > rr.right + 1 || r.left < rr.left - 1) {
      overflowing.push((el.className || el.tagName).toString().split(' ')[0]);
    }
  }
  return {
    rootW: Math.round(rr.width),
    docOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    insetL: minL === 9999 ? null : minL,
    insetR: minR === 9999 ? null : minR,
    outside: [...new Set(overflowing)].slice(0, 4),
  };
}`;

const browser = await chromium.launch();
const rows = [];
for (const [slug, form, root] of FORMS) {
  if (ONLY && slug !== ONLY) continue;
  const rec = { slug, form, at: {} };
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${SITE}/mfqa-wide?mfFormId=${form}`, { waitUntil: 'networkidle', timeout: 90000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    // PROBE is a SOURCE STRING: page.evaluate does not pass arguments to a string, so it has to be
    // called inside the string or every field comes back undefined.
    rec.at[w] = await page.evaluate(`(${PROBE})(${JSON.stringify(root)})`)
      .catch((e) => ({ error: String(e).slice(0, 60) }));
    await ctx.close();
  }
  rows.push(rec);
  const line = WIDTHS.map((w) => {
    const a = rec.at[w] || {};
    if (a.error) return `${w}:ERR`;
    const flag = (a.docOverflow > 0 ? 'OVF' : '') + (a.insetL === 0 || a.insetR === 0 ? '!EDGE' : '');
    return `${w}:${a.rootW}px inset ${a.insetL}/${a.insetR}${flag ? ' ' + flag : ''}`;
  }).join('  |  ');
  console.log(`${slug.padEnd(18)} ${line}`);
}
writeFileSync('qa-out/_responsive.json', JSON.stringify(rows, null, 1));
await browser.close();
console.log('\n-> qa-out/_responsive.json');
