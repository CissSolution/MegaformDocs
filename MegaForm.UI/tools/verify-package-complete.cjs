#!/usr/bin/env node
/**
 * verify-package-complete.cjs — pack-time GUARD against shipping an incomplete
 * MegaForm.Oqtane NuGet. The package ships `MegaForm.Oqtane.Server/wwwroot/Modules/
 * MegaForm/**` via ONE directory wildcard, so completeness = that wwwroot tree being
 * complete BEFORE `nuget pack`. This asserts each resource DIRECTORY is fully populated
 * and exits non-zero on any gap so pack.cmd aborts (root cause of the 2026-06-26 i18n
 * drift: plugins/i18n stale + js/i18n absent because the sync step was never run).
 *
 * Checks, BY DIRECTORY:
 *   i18n   — js/{i18n,builder/i18n,bundles/i18n,plugins/i18n} : every dir has the full
 *            canonical locale set and en-US key count == canonical public/i18n.
 *   KB     — Resources/TemplateGuides (.md) count == canonical (MegaForm.DNN source),
 *            Resources/PromptRecipes present.
 * (SQL = EF migrations + embedded ai-knowledge-seed.json ship INSIDE the DLLs, verified
 *  by the C# build, not here.)
 *
 * Usage: node MegaForm.UI/tools/verify-package-complete.cjs   (exit 1 on failure)
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const CANON_I18N = path.join(REPO, 'MegaForm.UI', 'public', 'i18n');
const OQ_WWW = path.join(REPO, 'MegaForm.Oqtane.Server', 'wwwroot', 'Modules', 'MegaForm');
const CANON_KB = path.join(REPO, 'MegaForm.DNN', 'Resources', 'TemplateGuides');

let failed = 0;
const fail = (m) => { console.log('  ✗ ' + m); failed++; };
const ok = (m) => console.log('  ✓ ' + m);

function jsonKeys(p) { try { return Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).length; } catch { return -1; } }
function locales(d) {
  try { return fs.readdirSync(d).filter((f) => f.endsWith('.json') && f !== 'index.json').sort(); }
  catch { return null; }
}

console.log('[verify] MegaForm.Oqtane package completeness\n');

// ---- canonical reference ----
const canonLocales = locales(CANON_I18N) || [];
const canonEn = jsonKeys(path.join(CANON_I18N, 'en-US.json'));
console.log(`canonical i18n: ${canonLocales.length} locales, en-US=${canonEn} keys`);
if (canonEn <= 0) { console.error('FATAL: cannot read canonical en-US.json'); process.exit(2); }

// ---- i18n dirs (the four the package wildcard ships) ----
console.log('\n-- i18n locale packs --');
for (const sub of ['js/i18n', 'js/builder/i18n', 'js/bundles/i18n', 'js/plugins/i18n']) {
  const d = path.join(OQ_WWW, sub.replace(/\//g, path.sep));
  const locs = locales(d);
  if (!locs) { fail(`${sub}: DIRECTORY MISSING`); continue; }
  const en = jsonKeys(path.join(d, 'en-US.json'));
  const missingLoc = canonLocales.filter((l) => !locs.includes(l));
  if (en !== canonEn) fail(`${sub}: en-US=${en} keys (expected ${canonEn}) — STALE`);
  else if (missingLoc.length) fail(`${sub}: missing locales ${missingLoc.join(',')}`);
  else ok(`${sub}: ${locs.length} locales, en-US=${en}`);
}

// ---- KB Resources ----
console.log('\n-- KB resources --');
const guideCount = (() => { try { return fs.readdirSync(CANON_KB).filter((f) => f.endsWith('.md')).length; } catch { return -1; } })();
const oqGuides = (() => { try { return fs.readdirSync(path.join(OQ_WWW, 'Resources', 'TemplateGuides')).filter((f) => f.endsWith('.md')).length; } catch { return -1; } })();
if (oqGuides < 0) fail('Resources/TemplateGuides: DIRECTORY MISSING');
else if (guideCount > 0 && oqGuides < guideCount) fail(`Resources/TemplateGuides: ${oqGuides} .md (canonical DNN has ${guideCount})`);
else ok(`Resources/TemplateGuides: ${oqGuides} .md`);

const recipes = (() => { try { return fs.readdirSync(path.join(OQ_WWW, 'Resources', 'PromptRecipes')).length; } catch { return -1; } })();
if (recipes <= 0) fail('Resources/PromptRecipes: MISSING or empty');
else ok(`Resources/PromptRecipes: ${recipes} files`);

// ---- Premium per-template KB: <slug>.facts.json + <slug>.guide.md in ALL 3 platform
//      dirs + a seed row. Prevents the "facts/guide synced to only some platforms"
//      drift (the i18n 2/4-dir bug class). Source of truth = Samples/FormTemplates/Premium.
console.log('\n-- premium per-template KB (facts + guide, all 3 platforms + seed) --');
const PREM_SRC = path.join(REPO, 'Samples', 'FormTemplates', 'Premium');
const GUIDE_DIRS = [
  { name: 'Oqtane', dir: path.join(OQ_WWW, 'Resources', 'TemplateGuides') },
  { name: 'DNN', dir: path.join(REPO, 'MegaForm.DNN', 'Resources', 'TemplateGuides') },
  { name: 'Web', dir: path.join(REPO, 'MegaForm.Web', 'wwwroot', 'Modules', 'MegaForm', 'Resources', 'TemplateGuides') },
];
const SEED_SQL = (() => { try { return fs.readFileSync(path.join(REPO, 'MegaForm.Core', 'Seed', 'ai-knowledge-template-guides.sql'), 'utf8'); } catch { return ''; } })();
const premSlugs = (() => {
  try {
    return fs.readdirSync(PREM_SRC).filter(f => f.endsWith('.json')).map(f => {
      try { const t = JSON.parse(fs.readFileSync(path.join(PREM_SRC, f), 'utf8')); return (t.customHtml || (t.settings && t.settings.customHtml)) ? (t.slug || f.replace(/\.json$/, '')) : null; }
      catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
})();
if (!premSlugs.length) { console.log('  (no premium template sources found — skipping)'); }
for (const slug of premSlugs) {
  let gaps = [];
  for (const { name, dir } of GUIDE_DIRS) {
    if (!fs.existsSync(path.join(dir, slug + '.facts.json'))) gaps.push(`${name}:facts`);
    if (!fs.existsSync(path.join(dir, slug + '.guide.md'))) gaps.push(`${name}:guide`);
  }
  if (!new RegExp('tpl-' + slug.replace(/[-]/g, '\\-') + "'?\\b", 'i').test(SEED_SQL) && SEED_SQL.indexOf(slug) < 0) gaps.push('seed-row');
  if (gaps.length) fail(`premium ${slug}: missing ${gaps.join(', ')}`);
  else ok(`premium ${slug}: facts+guide in 3 dirs + seed row`);
}

console.log('');
if (failed) { console.log(`[verify] FAIL — ${failed} gap(s). Run: node MegaForm.UI/tools/i18n-sync-platforms.cjs  (and re-sync KB) before packing.`); process.exit(1); }
console.log('[verify] PASS — package wwwroot is complete.');
