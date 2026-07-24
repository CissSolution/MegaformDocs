#!/usr/bin/env node
// ============================================================
// [QuickStart 2026-07-24] Build the BUNDLED quick-start template set.
//
// These are the plain, free, non-premium starters that ship INSIDE the module
// package on every platform, so a fresh install opens the Template Gallery with
// a full shelf of usable forms instead of four locked premium cards.
//
// Source of truth is the authored set under
//   MEGAFORM TEMPLATES\DefaultTemplates - Deployed\<category-folder>\*.json
// which lives OUTSIDE the repo; this script imports it into
//   Samples/FormTemplates/QuickStart/
// applying the three fixes the raw authored files need:
//
//   1. premium:false — the client used to infer "premium" from the mere presence
//      of settings.customHtml, and every one of these carries a ~800-char layout
//      wrapper, so all of them were flagged premium and LOCKED on a trial install.
//      An explicit flag ends the guessing (see templates.ts normalizeRecord).
//   2. unique slugs — the floating-label variants were copied from the standard
//      ones and kept their slug, so four pairs collided. A collision means the
//      second file silently overwrites the first in the catalog (and the gallery
//      publisher rejects it outright).
//   3. clean categories — "standard-contact" renders as the chip "Standard-contact".
//
// Usage:  node tools/gallery/build-quickstart.mjs [--src <dir>] [--check]
//   --check verifies the committed set matches the source without writing.
// ============================================================
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const CHECK = args.includes('--check');

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const SRC_ROOT = resolve(argOf('src',
  join(REPO_ROOT, '..', 'MEGAFORM TEMPLATES', 'DefaultTemplates - Deployed')));
const OUT = resolve(argOf('out', join(REPO_ROOT, 'Samples', 'FormTemplates', 'QuickStart')));

// The six authored folders that make up the bundled shelf.
const FOLDERS = [
  'application-forms', 'booking-forms', 'contact-forms',
  'education-forms', 'floating-label-forms', 'nonprofit-forms',
];

// "standard-contact" is a folder name, not a gallery chip.
const CATEGORY_MAP = {
  'standard-application': 'application',
  'standard-booking': 'booking',
  'standard-contact': 'contact',
  'standard-education': 'education',
  'standard-nonprofit': 'nonprofit',
  'floating-label': 'floating-label',
};

// Floating-label re-skins of a standard form: same slug + same title as the original.
// Both must stay (they demo two different input styles), so the variant gets suffixed.
const FL_RESLUG = new Set([
  'job-application-rules-fl.json',
  'scholarship-application-fl.json',
  'vendor-application-fl.json',
  'volunteer-application-fl.json',
]);

// Authored for one real customer (Vietnamese copy + real dealership/showroom names).
// Fine as a customer asset, wrong as an international product default.
const EXCLUDE = new Set(['dang-ky-lai-thu.json']);

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/i;

if (!existsSync(SRC_ROOT)) {
  console.error('Source folder not found: ' + SRC_ROOT);
  process.exit(1);
}

const written = [];
const problems = [];
const slugs = new Map();

if (!CHECK) {
  mkdirSync(OUT, { recursive: true });
  for (const stale of readdirSync(OUT).filter((f) => f.toLowerCase().endsWith('.json'))) {
    rmSync(join(OUT, stale), { force: true });
  }
}

for (const folder of FOLDERS) {
  const dir = join(SRC_ROOT, folder);
  if (!existsSync(dir)) { problems.push(`folder missing: ${folder}`); continue; }
  for (const file of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).sort()) {
    if (EXCLUDE.has(file)) { console.log('  skip (excluded) ' + folder + '/' + file); continue; }
    const raw = readFileSync(join(dir, file), 'utf8');
    let doc;
    try { doc = JSON.parse(raw); } catch (e) { problems.push(`${folder}/${file}: invalid JSON — ${e.message}`); continue; }

    const fields = doc.fields || doc.Fields;
    if (!Array.isArray(fields) || !fields.length) { problems.push(`${folder}/${file}: no fields`); continue; }

    let slug = String(doc.slug || doc.Slug || '').trim();
    if (FL_RESLUG.has(file) && !slug.endsWith('-fl')) slug += '-fl';
    if (!SLUG_RE.test(slug)) { problems.push(`${folder}/${file}: bad slug "${slug}"`); continue; }
    if (slugs.has(slug.toLowerCase())) {
      problems.push(`${folder}/${file}: duplicate slug "${slug}" (already used by ${slugs.get(slug.toLowerCase())})`);
      continue;
    }
    slugs.set(slug.toLowerCase(), folder + '/' + file);

    doc.slug = slug;
    // Disambiguate the floating-label twins in the gallery grid.
    if (FL_RESLUG.has(file)) {
      const t = String(doc.title || '').trim();
      if (t && !/floating label/i.test(t)) doc.title = t + ' (Floating Label)';
    }
    const cat = String(doc.category || doc.Category || '').trim().toLowerCase();
    doc.category = CATEGORY_MAP[cat] || (cat || 'general');
    // The flag this whole file exists for.
    doc.premium = false;

    const canonical = JSON.stringify(doc, null, 2) + '\n';
    if (!CHECK) writeFileSync(join(OUT, file), canonical, 'utf8');
    written.push({ file, slug, title: doc.title, category: doc.category, fields: fields.length, bytes: Buffer.byteLength(canonical) });
  }
}

written.sort((a, b) => a.slug.localeCompare(b.slug));
console.log((CHECK ? 'QuickStart CHECK' : 'QuickStart built -> ' + OUT));
for (const w of written) console.log(`  ${w.slug.padEnd(30)} ${String(w.fields).padStart(3)}f  ${w.category.padEnd(15)} ${w.title}`);
console.log('  templates : ' + written.length);
console.log('  size      : ' + (written.reduce((n, w) => n + w.bytes, 0) / 1024).toFixed(1) + ' KB');
console.log('  categories: ' + [...new Set(written.map((w) => w.category))].sort().join(', '));

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  ! ' + p);
  process.exit(1);
}
