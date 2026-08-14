/**
 * Re-measure every converted template CARD-to-CARD.
 *
 * After the owner had the mock's page chrome removed (no back link, no page background, no centring
 * measure), anchoring the mock on its page wrapper and ours on a full-bleed design compares two
 * different things. This runs each pair on the block that still exists on both sides - the form
 * body - and caps ours to the mock's own width so the comparison is like for like.
 *
 * The hero bands and page frames that now differ BY DESIGN are outside these roots on purpose;
 * they are checked with tools/browser-qa/border-audit.mjs and the review-page screenshots.
 *
 *   node tools/browser-qa/run-card-batch.mjs [--only slug] [--site http://megaclean008.ai]
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SITE = arg('site', 'http://megaclean008.ai');
const MOCKS = arg('mocks', 'http://localhost:3000/forms');
const ONLY = arg('only', null);
const OUT = arg('out', 'qa-out/iter');

// slug -> form id, mock slug, and the block that exists on BOTH sides
const MAP = [
  ['xmas-sale',       59, 'xmas-sale',               '.max-w-xl',          '.xms-shell'],
  ['xmas-newsletter', 58, 'xmas-newsletter',         '.rounded-b-xl',      '.xnl-card'],
  // agency-flyer / lagoon: '.max-w-5xl' and '.max-w-4xl' each match an EARLIER element than
  // the page wrapper on those two mocks (the hero carries the same measure), which anchored the
  // comparison on the wrong block - 0 matched. null lets the collector pick the innermost
  // width-constrained ancestor, which is what the original runs used.
  ['agency-flyer',    57, 'agency-flyer',            null,                 '.agf-main'],
  ['first-book',      61, 'hotel-concierge',         '.rounded-3xl',       '.kfb-card'],
  ['gold-suite',      60, 'hotel-suite',             '.max-w-4xl',         '.gsu-main'],
  ['rose-wellness',   62, 'rose-registration',       '.max-w-6xl',         '.rws-grid'],
  ['newsletter-amber',66, 'newsletter',              '.rounded-xl',        '.nlt-card'],
  ['job-application', 65, 'job-application',         '.max-w-4xl',         '.jba-shell'],
  // stripPad: the kit zeroes our -shell padding (full-width rule), so the mock wrapper's own
  // 32px inset has to come off too or every row reads as a 32px x-offset.
  ['lagoon-booking',  64, 'hotel-booking',           null,                 '.lgn-shell'],
  ['product-order',   63, 'product-order',           '.max-w-6xl',         '.pdo-shell'],
  ['golden-pro',      68, 'golden-pro-registration', '.max-w-5xl',         '.gpr-shell'],
  ['invoice-navy',    70, 'invoice-form',            '.rounded-2xl',       '.inv-card'],
  ['invoice-spinera', 71, 'invoice-spinera',         '.rounded-2xl',       '.spn-card'],
  ['corporate-reg',  115, 'corporate-registration',  '.rounded-2xl',       '.crg-card'],
  ['ielts-report',   116, 'ielts-report',            '.rounded-lg',        '.iel-card'],
  ['massage-intake', 117, 'massage-intake',          '.rounded-2xl',       '.msi-card'],
  ['massage-body',   118, 'massage-bodychart',       '.rounded-2xl',       '.mbc-card'],
  ['invoice-codexo',  69, 'invoice-codexo',          '.rounded-2xl',       '.icx-card'],
  ['festa-italiana',  72, 'festa-italiana',          '.rounded-3xl',       '.fes-card'],
];

const rows = [];
for (const [slug, form, mock, mockRoot, ourRoot, stripPad] of MAP) {
  if (ONLY && slug !== ONLY) continue;
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  const args = [
    'tools/browser-qa/mock-vs-template.mjs',
    '--mock', `${MOCKS}/${mock}`,
    '--page', `${SITE}/mfqa-wide?mfFormId=${form}`,
    '--out', dir,
    ...(mockRoot ? ['--mock-root', mockRoot] : []),
    '--our-root', ourRoot,
    // the back link was deleted from every template; hiding it on the mock keeps the copy census honest
    '--mock-drop', 'a[href="/forms"]',
    ...(stripPad ? ['--mock-strip-padding'] : []),
  ];
  process.stdout.write(`\n=== ${slug} (form ${form}) — mock ${mockRoot} vs ours ${ourRoot}\n`);
  const r = spawnSync('node', args, { encoding: 'utf8' });
  const tail = (r.stdout || '').trim().split('\n').slice(-3).join('\n');
  process.stdout.write(tail + '\n');
  const rep = join(dir, 'report.json');
  if (!existsSync(rep)) { rows.push({ slug, form, mock, error: 'no report' }); continue; }
  const j = JSON.parse(readFileSync(rep, 'utf8'));
  rows.push({
    slug, form, mock,
    matched: j.matched, differing: j.differing, bitmap: j.bitmap.mismatch,
    cardMock: j.cardWidth.mock, cardOurs: j.cardWidth.oursNatural,
    missingCopy: j.structure.missingText.length,
  });
}

// MERGE, never replace: a --only run used to overwrite the whole summary, and the review-page
// panels read their measured numbers straight out of this file - one targeted re-measure wiped
// the other sixteen.
const sumPath = join(OUT, 'summary-all.json');
let merged = rows;
if (existsSync(sumPath)) {
  const prev = JSON.parse(readFileSync(sumPath, 'utf8'));
  const bySlug = new Map(prev.map((r) => [r.slug, r]));
  rows.forEach((r) => bySlug.set(r.slug, r));
  merged = [...bySlug.values()];
}
writeFileSync(sumPath, JSON.stringify(merged, null, 1));
console.log('\n\nslug                 matched  differ  pixels   copy-missing');
for (const r of rows) {
  console.log(`${r.slug.padEnd(20)} ${String(r.matched ?? '-').padStart(7)} ${String(r.differing ?? '-').padStart(7)}`
    + ` ${String(r.bitmap ?? '-').padStart(7)}% ${String(r.missingCopy ?? '-').padStart(9)}`);
}
console.log(`\nsummary -> ${join(OUT, 'summary-all.json')}`);
