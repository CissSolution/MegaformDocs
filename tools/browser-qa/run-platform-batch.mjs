/**
 * DNN vs OQTANE, template by template.
 *
 * The mock harness compares two URLs, so it does not care that neither of them is a mock: point it
 * at the DNN render as the reference and the Oqtane page as the candidate and it reports the same
 * three things - matched copy, per-element box/typography deltas, and a real pixel diff of the two
 * renders normalised to the same width. That is exactly the compatibility question.
 *
 *   node tools/browser-qa/run-platform-batch.mjs [--only slug]
 *       [--dnn http://megaclean008.ai] [--oq http://localhost:5130]
 */
import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const DNN = arg('dnn', 'http://megaclean008.ai');
const OQ = arg('oq', 'http://localhost:5130');
const ONLY = arg('only', null);
const OUT = arg('out', 'qa-out/platform');

// slug -> DNN form id, Oqtane page path, the design root both sides share
const MAP = [
  ['xmas-sale',        59, 'mf-xmas-sale',        '.xms-page'],
  ['xmas-newsletter',  58, 'mf-xmas-newsletter',  '.xnl-page'],
  ['agency-flyer',     57, 'mf-agency-flyer',     '.agf-page'],
  ['first-book',       61, 'mf-first-book',       '.kfb-page'],
  ['gold-suite',       60, 'mf-gold-suite',       '.gsu-page'],
  ['rose-wellness',    62, 'mf-rose-wellness',    '.rws-grid'],
  ['newsletter-amber', 66, 'mf-newsletter-amber', '.nlt-page'],
  ['job-application',  65, 'mf-job-application',  '.jba-page'],
  ['lagoon-booking',   64, 'mf-lagoon-booking',   '.lgn-page'],
  ['product-order',    63, 'mf-product-order',    '.pdo-page'],
  ['golden-pro',       68, 'mf-golden-pro',       '.gpr-page'],
  ['invoice-navy',     70, 'mf-invoice-navy',     '.inv-page'],
  ['invoice-spinera',  71, 'mf-invoice-spinera',  '.spn-page'],
  ['invoice-codexo',   69, 'mf-invoice-codexo',   '.icx-card'],
  ['corporate-reg',   115, 'mf-corporate-reg',    '.crg-page'],
  ['ielts-report',    116, 'mf-ielts-report',     '.iel-page'],
  ['massage-intake',  117, 'mf-massage-intake',   '.msi-page'],
  ['massage-body',    118, 'mf-massage-body',     '.mbc-page'],
  ['festa-italiana',   72, 'mf-festa-italiana',   '.mfp'],
];

const rows = [];
for (const [slug, form, path, root] of MAP) {
  if (ONLY && slug !== ONLY) continue;
  const dir = join(OUT, slug);
  mkdirSync(dir, { recursive: true });
  const args = [
    'tools/browser-qa/mock-vs-template.mjs',
    '--mock', `${DNN}/mfqa-wide?mfFormId=${form}`,   // reference = DNN
    '--page', `${OQ}/${path}`,                        // candidate = Oqtane
    '--out', dir,
    '--mock-root', root,
    '--our-root', root,
  ];
  process.stdout.write(`\n=== ${slug}: DNN form ${form} vs Oqtane /${path} (${root})\n`);
  const r = spawnSync('node', args, { encoding: 'utf8' });
  process.stdout.write((r.stdout || '').trim().split('\n').slice(-3).join('\n') + '\n');
  const rep = join(dir, 'report.json');
  if (!existsSync(rep)) { rows.push({ slug, form, path, error: 'no report' }); continue; }
  const j = JSON.parse(readFileSync(rep, 'utf8'));
  rows.push({
    slug, form, path,
    matched: j.matched, differing: j.differing, bitmap: j.bitmap.mismatch,
    widthDnn: j.cardWidth.mock, widthOq: j.cardWidth.oursNatural,
    missingCopy: j.structure.missingText.length,
    extraCopy: j.structure.extraText.length,
  });
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify(rows, null, 1));
console.log('\n\nslug                 matched  differ  pixels   missing  extra   DNN/OQ width');
for (const r of rows) {
  console.log(`${r.slug.padEnd(20)} ${String(r.matched ?? '-').padStart(7)} ${String(r.differing ?? '-').padStart(7)}`
    + ` ${String(r.bitmap ?? '-').padStart(7)}% ${String(r.missingCopy ?? '-').padStart(8)} ${String(r.extraCopy ?? '-').padStart(6)}`
    + `   ${r.widthDnn ?? '-'}/${r.widthOq ?? '-'}`);
}
console.log(`\nsummary -> ${join(OUT, 'summary.json')}`);
