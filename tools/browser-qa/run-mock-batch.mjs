#!/usr/bin/env node
/**
 * [MockDiff v2] Run mock-vs-template over the whole converted batch and aggregate.
 *
 * Written because the batch was signed off by looking at screenshots one at a time, which is the
 * thing the project rules forbid. One run here produces the same evidence for every template.
 *
 *   node tools/browser-qa/run-mock-batch.mjs [--only xmas-sale,newsletter] [--out qa-out/batch]
 */

import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const OUT = arg('out', 'qa-out/batch');
const ONLY = (arg('only') || '').split(',').filter(Boolean);
const MOCK_BASE = arg('mock-base', 'http://localhost:3000/forms');
const SITE = arg('site', 'http://megaclean008.ai');

// The inventory. `page` is the full-width scratch page, which exists for every form and needs no
// provisioning; the harness normalises its pane to the mock's card width anyway.
const BATCH = [
  { slug: 'xmas-sale',        form: 59, mock: 'xmas-sale' },
  { slug: 'xmas-newsletter',  form: 58, mock: 'xmas-newsletter' },
  { slug: 'agency-flyer',     form: 57, mock: 'agency-flyer' },
  { slug: 'first-book',       form: 61, mock: 'hotel-concierge' },
  { slug: 'gold-suite',       form: 60, mock: 'hotel-suite' },
  { slug: 'rose-wellness',    form: 62, mock: 'rose-registration' },
  { slug: 'newsletter-amber', form: 66, mock: 'newsletter' },
  { slug: 'job-application',  form: 65, mock: 'job-application' },
  { slug: 'lagoon-booking',   form: 64, mock: 'hotel-booking' },
  { slug: 'product-order',    form: 63, mock: 'product-order' },
  { slug: 'golden-pro',       form: 68, mock: 'golden-pro-registration' },
  { slug: 'invoice-navy',     form: 70, mock: 'invoice-form' },
  { slug: 'invoice-spinera',  form: 71, mock: 'invoice-spinera' },
  { slug: 'invoice-codexo',   form: 69, mock: 'invoice-codexo' },
];

const items = ONLY.length ? BATCH.filter((b) => ONLY.includes(b.slug)) : BATCH;
mkdirSync(OUT, { recursive: true });

const rows = [];
for (const it of items) {
  const dir = join(OUT, it.slug);
  process.stdout.write(`\n=== ${it.slug} (form ${it.form}) vs /forms/${it.mock} ===\n`);
  const r = spawnSync(process.execPath, [
    'tools/browser-qa/mock-vs-template.mjs',
    '--mock', `${MOCK_BASE}/${it.mock}`,
    '--page', `${SITE}/mfqa-wide?mfFormId=${it.form}`,
    '--out', dir,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(dir_safe(dir), 'console.txt'), (r.stdout || '') + (r.stderr || ''));

  const rp = join(dir, 'report.json');
  if (!existsSync(rp)) {
    rows.push({ ...it, status: 'FAILED TO RUN', detail: (r.stderr || '').split('\n').slice(-4).join(' ') });
    continue;
  }
  const rep = JSON.parse(readFileSync(rp, 'utf8'));
  // Which properties are wrong, and how often. This is what turns 40 lines of deltas into a fix
  // list: one systemic cause usually shows up as one property with a high count.
  const byProp = {};
  for (const row of rep.rows) for (const d of row.diffs) {
    const p = d.split(' ')[0];
    byProp[p] = (byProp[p] || 0) + 1;
  }
  rows.push({
    ...it,
    status: rep.differing ? 'DIFFERS' : 'clean',
    matched: rep.matched,
    differing: rep.differing,
    cardMock: rep.cardWidth.mock,
    cardOurs: rep.cardWidth.oursNatural,
    bitmap: rep.bitmap && rep.bitmap.mismatch,
    missingCopy: rep.structure.missingText.length,
    extraCopy: rep.structure.extraText.length,
    roleGaps: rep.structure.roleCounts.map((c) => `${c.role} ${c.mock}/${c.ours}`).join(', '),
    topProps: Object.entries(byProp).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}×${v}`).join(' '),
  });
}

function dir_safe(d) { mkdirSync(d, { recursive: true }); return d; }

writeFileSync(join(OUT, 'summary.json'), JSON.stringify(rows, null, 2));

const md = [
  '| template | form | matched | differing | bitmap % | card mock/ours | missing copy | top properties |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.slug} | ${r.form} | ${r.matched ?? '-'} | ${r.differing ?? r.status} | ${r.bitmap ?? '-'} | ${r.cardMock ?? '-'}/${r.cardOurs ?? '-'} | ${r.missingCopy ?? '-'} | ${r.topProps || ''} |`),
].join('\n');
writeFileSync(join(OUT, 'summary.md'), md + '\n');
console.log('\n' + md);
console.log(`\nsummary -> ${join(OUT, 'summary.md')}`);
