#!/usr/bin/env node
// ============================================================
// [KbPerTemplate v20260812] Give every PACKAGE-BUNDLED template its knowledge, inside the package.
//
// The rule is symmetrical: knowledge ships wherever its template ships. strip-seed-kb.mjs handles
// one direction (gallery templates take their knowledge with them). This handles the other — a
// template that ships INSIDE the module must have its KB rows in the bundled seed, or an install
// that never reaches the gallery holds a design the assistant has no contract for and no schema to
// start from.
//
// Measured before this existed: of the 4 premium starters kept in the package, 2 had NO knowledge
// row at all, and 4 of the 31 free quick-start starters had none either.
//
// ADD-ONLY on purpose. Rows already in the seed are left byte-for-byte alone: they came from a
// live authoring database and may carry hand-edits, and regenerating them would churn 27 rows to
// fix 4. Use --force to overwrite as well.
//
// Usage:
//   node tools/gallery/seed-bundled-kb.mjs --check     # report what is missing
//   node tools/gallery/seed-bundled-kb.mjs             # add the missing rows
// ============================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateKb, formTemplateSlug, templateGuideSlug } from './kb-from-template.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes('--' + f);

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const SEED = join(REPO_ROOT, 'MegaForm.Core', 'Seed', 'ai-knowledge-seed.json');
const EXCLUDE = join(REPO_ROOT, 'tools', 'gallery', 'gallery-exclude.json');
const GUIDE_DIR = join(REPO_ROOT, 'MegaForm.DNN', 'Resources', 'TemplateGuides');
const QUICKSTART = join(REPO_ROOT, 'Samples', 'FormTemplates', 'QuickStart');
const PREMIUM = join(REPO_ROOT, 'Samples', 'FormTemplates', 'Premium');
const GALLERY_SRC = join(PREMIUM, 'GALLERY-PUBLISHED');

const die = (m) => { console.error('ABORT: ' + m); process.exit(1); };
if (!existsSync(SEED)) die('seed not found: ' + SEED);
if (!existsSync(EXCLUDE)) die('gallery-exclude.json not found — run build-gallery.mjs first.');

const bundledSlugs = new Set((JSON.parse(readFileSync(EXCLUDE, 'utf8')).bundledSlugs || [])
  .map((s) => String(s).toLowerCase()));

/** Every template document that ships inside the module package. */
function bundledTemplates() {
  const out = [];
  const take = (dir, wanted) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      let doc;
      try { doc = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
      const slug = String(doc.slug || doc.Slug || '').trim();
      if (!slug) continue;
      if (wanted && !wanted.has(slug.toLowerCase())) continue;
      out.push({ slug, doc, file: f });
    }
  };
  take(QUICKSTART, null);                 // all 31 free starters ship
  take(GALLERY_SRC, bundledSlugs);        // the premium starters kept in the package
  take(PREMIUM, bundledSlugs);            // …whichever folder holds them
  return out;
}

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const bySlug = new Map(seed.entries.map((e, i) => [String(e.Slug || '').toLowerCase(), i]));

const templates = bundledTemplates();
const added = [];
const skipped = [];

/** Slugs the gallery actually publishes — used to keep the namespace honest below. */
const galleryPublished = new Set(
  (existsSync(GALLERY_SRC) ? readdirSync(GALLERY_SRC) : [])
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { const d = JSON.parse(readFileSync(join(GALLERY_SRC, f), 'utf8')); return String(d.slug || d.Slug || '').toLowerCase(); }
      catch { return ''; }
    })
    .filter(Boolean));

for (const t of templates) {
  const { entries, warnings } = buildTemplateKb({ doc: t.doc, slug: t.slug, guideDir: GUIDE_DIR });

  // The create-row namespace is "gallery-<slug>" because that is where those rows come from. A
  // template that ships ONLY in the package is not from the gallery, and encoding that lie in a
  // primary key is how the next maintainer gets misled. Those keep the legacy "tpl-<slug>" name
  // their 27 quick-start siblings already use — safe precisely because a package-only starter has
  // no premium shell, so no guide row will ever contend for the slug (asserted, not assumed).
  if (!galleryPublished.has(t.slug.toLowerCase())) {
    const guide = entries.find((e) => e.Kind === 'template_guide');
    if (guide) {
      die('template "' + t.slug + '" ships only in the package yet HAS a design guide — the legacy '
        + 'tpl- namespace would collide with it. Publish it to the gallery, or give the guide its own slug.');
    }
    for (const e of entries) if (e.Kind === 'form_template') e.Slug = templateGuideSlug(t.slug);
  }
  for (const entry of entries) {
    const key = String(entry.Slug).toLowerCase();
    const at = bySlug.get(key);
    if (at !== undefined && !has('force')) { skipped.push(entry.Slug); continue; }
    if (at !== undefined) { seed.entries[at] = entry; added.push(entry.Slug + ' (replaced)'); continue; }
    // A quick-start starter whose knowledge was seeded under the legacy tpl-<slug> name already
    // has a create row; do not add a second one under the gallery- name.
    if (entry.Kind === 'form_template' && bySlug.has('tpl-' + t.slug.toLowerCase()) && !has('force')) {
      skipped.push(entry.Slug + ' (legacy tpl- row exists)');
      continue;
    }
    seed.entries.push(entry);
    bySlug.set(key, seed.entries.length - 1);
    added.push(entry.Slug);
  }
  if (warnings.length && !warnings.every((w) => /no guide file/.test(w))) {
    for (const w of warnings) console.log('  ! ' + t.slug + ': ' + w);
  }
}

console.log('bundled templates : ' + templates.length
  + ' (' + [...bundledSlugs].length + ' premium starters + quick-start)');
console.log('rows already there: ' + skipped.length);
console.log('rows to add       : ' + added.length);
for (const a of added) console.log('    + ' + a);

if (!added.length) { console.log('\nNothing to do — every bundled template already has its knowledge in the package.'); process.exit(0); }
if (has('check')) { console.log('\n--check: nothing written.'); process.exit(0); }

writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n', 'utf8');
console.log('\nwritten : ' + SEED + '  (' + seed.entries.length + ' entries)');
console.log('NEXT: rebuild the packages — Oqtane and Web EMBED this file.');
