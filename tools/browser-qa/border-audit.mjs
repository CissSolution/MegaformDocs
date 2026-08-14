/**
 * What does the OUTER edge of each converted template actually paint?
 *
 * Removing the mock's page chrome took the page background with it, and several designs never drew
 * a border of their own - the contrast came from that background. On a white pane those cards now
 * have no visible edge at all. This walks the first few levels under .mfp on the live form and
 * reports what each one paints, so the fix is aimed rather than guessed.
 *
 *   node tools/browser-qa/border-audit.mjs                 (all forms in FORMS below)
 *   node tools/browser-qa/border-audit.mjs 71 60           (only these form ids)
 */
import { chromium } from 'playwright';

const SITE = process.env.MF_SITE || 'http://megaclean008.ai';
const FORMS = [
  [59, 'xmas-sale'], [58, 'xmas-newsletter'], [57, 'agency-flyer'], [61, 'first-book'],
  [60, 'gold-suite'], [62, 'rose-wellness'], [66, 'newsletter-amber'], [65, 'job-application'],
  [64, 'lagoon-booking'], [63, 'product-order'], [68, 'golden-pro'], [70, 'invoice-navy'],
  [71, 'invoice-spinera'], [69, 'invoice-codexo'], [115, 'corporate-reg'], [116, 'ielts-report'],
  [117, 'massage-intake'], [118, 'massage-body'],
];

const only = process.argv.slice(2).map(Number).filter(Boolean);
const list = only.length ? FORMS.filter(([id]) => only.includes(id)) : FORMS;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
for (const [id, slug] of list) {
  const page = await ctx.newPage();
  await page.goto(`${SITE}/mfqa-wide?mfFormId=${id}`, { waitUntil: 'networkidle', timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(900);
  const rows = await page.evaluate(() => {
    const mfp = document.querySelector('.mfp');
    if (!mfp) return null;
    const out = [];
    let el = mfp;
    for (let depth = 0; el && depth < 4; depth++) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const bw = ['Top', 'Right', 'Bottom', 'Left']
        .map((s) => parseFloat(cs['border' + s + 'Width']) || 0);
      out.push({
        depth,
        cls: (el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.'),
        w: Math.round(r.width), h: Math.round(r.height),
        bg: cs.backgroundColor,
        border: bw.join('/') + ' ' + cs.borderTopColor,
        radius: parseFloat(cs.borderTopLeftRadius) || 0,
        shadow: cs.boxShadow === 'none' ? 'none' : 'set',
      });
      // follow the tallest element child - that is the design, not a decoration
      const kids = [...el.children].filter((k) => k.getBoundingClientRect().height > 40);
      if (!kids.length) break;
      el = kids.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
    }
    return out;
  });
  console.log(`\n=== ${slug} (form ${id}) ===`);
  if (!rows) { console.log('  no .mfp found'); await page.close(); continue; }
  for (const r of rows) {
    console.log(`  [${r.depth}] ${r.cls.padEnd(34)} ${String(r.w).padStart(4)}x${String(r.h).padStart(4)}`
      + `  bg ${r.bg.padEnd(22)} border ${r.border.padEnd(34)} radius ${r.radius}  shadow ${r.shadow}`);
  }
  await page.close();
}
await browser.close();
