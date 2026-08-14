#!/usr/bin/env node
// ============================================================
// [KbPerTemplate v20260812] Remove GALLERY-SERVED knowledge from the packaged seed.
//
// The owner's rule is "a template's KB travels with the template, it does not ship
// inside the package". build-gallery.mjs does the first half (publishes one KB
// bundle per template and records their slugs in gallery-exclude.json). This does
// the second half: deletes exactly those rows from
// MegaForm.Core/Seed/ai-knowledge-seed.json.
//
// It edits the SOURCE seed on purpose. That single file is how the knowledge reaches
// every platform — DNN copies it into the package (BuildPackage-DNN.ps1), Oqtane and
// Web embed it into their DLLs — so there is no per-package filter to hook; trimming
// anywhere else would leave the DLLs carrying it anyway.
//
// WHAT IT WILL NOT DO
//   - strip a slug the gallery does not actually serve. Knowledge that exists in
//     neither place is knowledge the customer lost, so the live kb/manifest.json is
//     checked first and a slug missing from it aborts the run. `--offline` skips the
//     check (and says so); `--check` only reports.
//   - touch anything outside `entries`. Measured: 0 of the 34 `templates` rows and 0
//     of the 61 `rules` rows reference a form_template entry, so nothing is orphaned.
//   - strip knowledge belonging to a template that ships INSIDE the package. The
//     31 free quick-start starters and the 4 bundled premium designs travel in the
//     package, so their knowledge must too — and it is not in kbSlugs, because
//     build-gallery.mjs only lists what it published.
//
// Usage:
//   node tools/gallery/strip-seed-kb.mjs --check      # report, change nothing
//   node tools/gallery/strip-seed-kb.mjs              # strip (verifies the gallery first)
//   node tools/gallery/strip-seed-kb.mjs --offline    # strip without the live check
// ============================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const has = (f) => args.includes('--' + f);
const argOf = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const SEED = resolve(argOf('seed', join(REPO_ROOT, 'MegaForm.Core', 'Seed', 'ai-knowledge-seed.json')));
const EXCLUDE = resolve(argOf('exclude', join(REPO_ROOT, 'tools', 'gallery', 'gallery-exclude.json')));
const LIVE = (argOf('live', 'https://CissSolution.github.io/megaform-gallery/')).replace(/\/?$/, '/');

// Abort by throwing, not process.exit(): once fetch() has run, exiting mid-flight trips an
// assertion in node's libuv handle teardown and buries the real message under a crash dump.
class Abort extends Error {}
const die = (msg) => { throw new Abort(msg); };

try {
  await main();
} catch (e) {
  if (e instanceof Abort) { console.error('ABORT: ' + e.message); process.exitCode = 1; }
  else throw e;
}

async function main() {

if (!existsSync(SEED)) die('seed not found: ' + SEED);
if (!existsSync(EXCLUDE)) die('gallery-exclude.json not found — run build-gallery.mjs first: ' + EXCLUDE);

const exclude = JSON.parse(readFileSync(EXCLUDE, 'utf8'));
const kbSlugs = Array.isArray(exclude.kbSlugs) ? exclude.kbSlugs : [];
if (kbSlugs.length === 0) {
  die('gallery-exclude.json lists no kbSlugs. Either the gallery has not been rebuilt since the KB '
    + 'channel was added, or nothing was published — refusing to strip on an empty list.');
}

const seed = JSON.parse(readFileSync(SEED, 'utf8'));
const entries = Array.isArray(seed.entries) ? seed.entries : [];
const wanted = new Set(kbSlugs.map((s) => String(s).toLowerCase()));

// Only ever remove knowledge ABOUT A TEMPLATE. A slug collision with, say, a widget
// entry must not delete the widget — the kinds are the safety net, not the list.
const REMOVABLE_KINDS = new Set(['form_template', 'template_guide']);

// Templates the gallery now carries knowledge for. The published CREATE row lives at
// "gallery-<slug>" (the guide owns "tpl-<slug>"), so this is the authoritative list of
// which templates no longer need knowledge in the package.
const servedTemplates = new Set(kbSlugs
  .filter((s) => String(s).toLowerCase().startsWith('gallery-'))
  .map((s) => String(s).toLowerCase().slice('gallery-'.length)));

// ── knowledge that must NEVER leave the package ──────────
// A template that ships INSIDE the module has to bring its knowledge with it, or an install with
// no route to the gallery holds a design the AI has no contract for. Two families qualify: the
// free quick-start starters, and the premium starters build-gallery.mjs keeps bundled (those ARE
// published to the gallery as well, which is exactly why this guard exists rather than relying on
// "it isn't in kbSlugs"). Belt and braces: build-gallery.mjs already omits them from kbSlugs.
const bundledSlugs = new Set((exclude.bundledSlugs || []).map((s) => String(s).toLowerCase()));
const quickStartDir = join(REPO_ROOT, 'Samples', 'FormTemplates', 'QuickStart');
if (existsSync(quickStartDir)) {
  for (const f of readdirSync(quickStartDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const doc = JSON.parse(readFileSync(join(quickStartDir, f), 'utf8'));
      const s = String(doc.slug || doc.Slug || '').trim().toLowerCase();
      if (s) bundledSlugs.add(s);
    } catch { /* not a template */ }
  }
}
const isBundledTemplate = (entrySlug) => {
  const s = String(entrySlug || '').toLowerCase();
  const bare = s.replace(/^gallery-/, '').replace(/^tpl-/, '');
  return bundledSlugs.has(bare);
};

const doomed = entries.filter((e) => {
  const slug = String(e.Slug || '').toLowerCase();
  const kind = String(e.Kind || '');
  if (!REMOVABLE_KINDS.has(kind)) return false;
  if (isBundledTemplate(slug)) return false;   // ships in the package → its KB ships too
  // published under the same slug (the guide namespace)
  if (wanted.has(slug)) return true;
  // LEGACY: a form_template row seeded under "tpl-<slug>" before the CREATE rows moved to
  // their own namespace. Leaving it behind would give the AI two entries describing the same
  // template — the stale packaged copy and the fresh downloaded one — and it would keep
  // recommending the design after the template was retired from the gallery.
  if (kind === 'form_template' && slug.startsWith('tpl-') && servedTemplates.has(slug.slice(4))) return true;
  return false;
});
const kept = entries.filter((e) => !doomed.includes(e));

// Slugs the gallery says it serves but the seed never had — informational, not an error:
// the gallery now publishes knowledge for all 68 templates, most of which was never seeded.
const notInSeed = kbSlugs.filter((s) => !entries.some((e) => String(e.Slug || '').toLowerCase() === String(s).toLowerCase()));

const bytesBefore = Buffer.byteLength(JSON.stringify(seed), 'utf8');

console.log('seed        : ' + SEED);
console.log('entries     : ' + entries.length + ' -> ' + kept.length + '  (' + doomed.length + ' removed)');
console.log('gallery kb  : ' + kbSlugs.length + ' slug(s) published, ' + notInSeed.length + ' of them never were in the seed');
if (doomed.length) {
  const byKind = {};
  for (const d of doomed) byKind[d.Kind] = (byKind[d.Kind] || 0) + 1;
  console.log('removing    : ' + Object.entries(byKind).map(([k, n]) => n + ' ' + k).join(', '));
  for (const d of doomed.slice(0, 12)) console.log('    - ' + d.Slug + '  (' + d.Kind + ')');
  if (doomed.length > 12) console.log('    ... and ' + (doomed.length - 12) + ' more');
}

if (doomed.length === 0) {
  console.log('\nNothing to strip — the packaged seed already carries no gallery-served knowledge.');
  process.exit(0);
}

// ── the guard that matters ────────────────────────────────
// Stripping knowledge the gallery is not actually serving takes it away from every
// install with nothing to replace it. Prove the bundles are live before deleting.
if (!has('check') && !has('offline')) {
  const url = LIVE + 'kb/manifest.json?cb=' + doomed.length + '-' + kept.length;
  let live = null;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) die('the gallery does not serve kb/manifest.json yet (HTTP ' + res.status + ' at ' + LIVE + 'kb/manifest.json). '
      + 'Publish the gallery first (tools/gallery/Publish-Gallery.ps1), then strip. '
      + 'Re-run with --offline only if you are certain the knowledge is live.');
    live = await res.json();
  } catch (e) {
    // A deliberate abort (404 above) must not be re-wrapped as a connectivity problem —
    // that would tell the operator to check their network when the real answer is
    // "publish the gallery first".
    if (e instanceof Abort) throw e;
    die('could not reach the gallery to verify the knowledge is published (' + e.message + '). '
      + 'Use --offline to skip this check, but only if you have verified it by hand.');
  }

  const served = new Set((live.templates || []).map((t) => String(t.slug || '').toLowerCase()));
  // Each doomed row names a template through its slug: "gallery-<slug>" or "tpl-<slug>".
  const unserved = [...new Set(doomed
    .map((d) => String(d.Slug || '').toLowerCase().replace(/^gallery-/, '').replace(/^tpl-/, ''))
    .filter((s) => !served.has(s)))];
  if (unserved.length) {
    die('the live gallery serves no knowledge for ' + unserved.length + ' template(s) whose rows would be removed: '
      + unserved.slice(0, 8).join(', ') + (unserved.length > 8 ? ', …' : '')
      + '. Publish those bundles before stripping them out of the package.');
  }
  console.log('verified    : all ' + served.size + ' bundles are live at ' + LIVE + 'kb/manifest.json');
}

if (has('check')) {
  console.log('\n--check: nothing written.');
  process.exit(0);
}

seed.entries = kept;
// 2-space JSON with a trailing newline — same shape export-kb-seed.cjs writes, so the
// diff after a re-export stays readable.
writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n', 'utf8');
const bytesAfter = Buffer.byteLength(JSON.stringify(seed), 'utf8');
console.log('\nwritten     : ' + SEED);
console.log('size        : ' + (bytesBefore / 1024).toFixed(0) + ' KB -> ' + (bytesAfter / 1024).toFixed(0) + ' KB');
console.log('\nNEXT: rebuild the packages — Oqtane and Web EMBED this file, so a stale DLL still ships the old rows.');

}
