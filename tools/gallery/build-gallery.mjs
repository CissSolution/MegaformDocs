#!/usr/bin/env node
// ============================================================
// [GalleryRepo v20260724] MegaForm Gallery publisher.
//
// Turns a folder of MegaForm template JSON files into a STATIC gallery
// repository that can be served from GitHub Pages (or any static HTTPS host)
// and consumed by MegaForm.Core.Services.GalleryRepo.GalleryRepositoryService.
//
// Output layout (what the module expects):
//   manifest.json          { repoVersion, generatedUtc, templates:[ ... ] }
//   templates/<slug>.json  one canonical template per entry
//   index.html             human-friendly browse page (Pages landing)
//
// Every manifest entry pins a sha256 of the EXACT bytes written, because the
// module refuses to install a file whose hash does not match (see
// GalleryRepositoryService.DownloadFileAsync).
//
// Usage:
//   node Tools/gallery/build-gallery.mjs --out <dir> [--src <dir>] [--base <publicUrl>]
//
// Adding a NEW template = drop a .json into the source folder and re-run this.
// ============================================================
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, basename, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateKb, toSeedDocument, formTemplateSlug } from './kb-from-template.mjs';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

// fileURLToPath (not .pathname) — the repo path contains spaces, which stay
// %20-escaped in a URL pathname and break every fs call downstream.
const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const SRC = resolve(argOf('src', join(REPO_ROOT, 'Samples', 'FormTemplates', 'Premium', 'GALLERY-PUBLISHED')));
const OUT = resolve(argOf('out', join(REPO_ROOT, 'gallery-dist')));
const PUBLIC_BASE = argOf('base', '');
// Canonical image source (Assets/img is the repo's single source of truth for
// template artwork; the packages copy from here).
const IMG_ROOT = resolve(argOf('img', join(REPO_ROOT, 'Assets', 'img')));

// Templates reference artwork by ABSOLUTE, platform-specific URLs:
//   DNN     /DesktopModules/MegaForm/Assets/img/<rel>
//   Oqtane  /Modules/MegaForm/img/<rel>
// Both spellings appear inside the same template (it ships cross-platform), so we
// normalise either to "<rel>" and resolve it under Assets/img.
const IMG_URL_RE = /\/(?:DesktopModules\/MegaForm\/Assets\/img|Modules\/MegaForm\/img)\/([A-Za-z0-9_\-./]+?\.(?:png|jpe?g|gif|webp|svg))/gi;

function referencedImages(rawJson) {
  const rels = new Set();
  let m;
  IMG_URL_RE.lastIndex = 0;
  while ((m = IMG_URL_RE.exec(rawJson)) !== null) {
    const rel = m[1].replace(/\\/g, '/').replace(/^\/+/, '');
    if (rel && !rel.includes('..')) rels.add(rel);
  }
  return [...rels].sort();
}

// Mirrors GalleryRepositoryService.SlugRegex — a template whose slug fails this
// can never be installed, so reject it at publish time instead of shipping it.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/i;

// [BundledStarters 2026-07-24] The four PREMIUM designs that ship INSIDE the module package
// alongside the free quick-start shelf (tools/gallery/build-quickstart.mjs), so a fresh install
// shows what the paid designs look like. On a trial install these four are the only locked
// cards — that lock is the upsell, not a bug; the 31 quick-start starters stay usable.
//
// All four are chosen for ZERO artwork: their weight is pure JSON, so the package stays light
// and every hero image can live in the gallery repo instead.
// They are still published to the gallery (so they stay updatable and the feed is complete)
// but are omitted from gallery-exclude.json, so packaging keeps them.
const BUNDLED_SLUGS = new Set([
  'v0-contact-map-left-corporate',
  'down-under-australia',
  'tabbed-account-setup',
  'project-intake-onboarding',
]);

const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');

// ── deterministic ZIP writer (STORE, no compression) ──────
// Hand-rolled so the publisher stays dependency-free AND reproducible: a zip built
// by a normal library embeds mtimes, which would change the sha256 on every run and
// force a pointless re-download for every install. PNG/JPEG are already compressed,
// so STORE costs ~nothing. Fixed DOS timestamp = byte-identical output for identical input.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function zipStore(files /* [{name, data}] */) {
  const DOS_TIME = 0, DOS_DATE = 33; // 1980-01-01, fixed
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const data = f.data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, eocd]);
}

function readTemplates(dir) {
  if (!existsSync(dir)) throw new Error('Source folder not found: ' + dir);
  return readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.json')).sort();
}

const skipped = [];
const entries = [];
// slug -> source file that claimed it. Two templates sharing a slug would write the
// SAME templates/<slug>.json, so the second silently overwrites the first and the
// first manifest entry ends up pinning a sha256 that no longer matches its file.
// First one wins; later collisions are skipped loudly.
const claimedSlugs = new Map();
// Artwork accounting — proves how much weight leaves the shipped package.
const missingImages = [];
const movedImages = new Set();
let assetBytesMoved = 0;
// Artwork owned by a BUNDLED starter — must stay in the package even though the
// template is also published to the gallery.
const bundledImages = new Set();
let bundledImageBytes = 0;
// Redundant source copies whose slug is already published — excluded from the package.
const duplicateFiles = [];
// [KbPerTemplate v20260812] KB channel accounting — one bundle per template, plus the
// guide/facts resources those bundles reference.
const kbFiles = [];          // { path, sha256, sizeBytes } for kb/manifest.json
const kbTemplates = [];      // { slug, path, sha256, sizeBytes }
const kbWarnings = [];
const kbSlugs = [];          // KB entry slugs now SERVED by the gallery (leave the package)
let kbWithGuide = 0;
let kbBytes = 0;
// Guides live beside the module, not in the template folder. DNN is the canonical copy —
// gen-template-facts.cjs writes the same bytes to all three platform folders.
const GUIDE_DIR = resolve(argOf('guides', join(REPO_ROOT, 'MegaForm.DNN', 'Resources', 'TemplateGuides')));

mkdirSync(join(OUT, 'templates'), { recursive: true });
mkdirSync(join(OUT, 'kb', 'templates'), { recursive: true });
mkdirSync(join(OUT, 'kb', 'TemplateGuides'), { recursive: true });
// Clear stale template files so a removed source template disappears from the repo.
for (const stale of existsSync(join(OUT, 'templates')) ? readdirSync(join(OUT, 'templates')) : []) {
  const low = stale.toLowerCase();
  if (low.endsWith('.json') || low.endsWith('.zip')) rmSync(join(OUT, 'templates', stale), { force: true });
}
// Same for the KB channel: a retired template must not leave its knowledge behind, or the
// AI keeps recommending a design nobody can install any more.
for (const sub of ['templates', 'TemplateGuides']) {
  for (const stale of readdirSync(join(OUT, 'kb', sub))) {
    rmSync(join(OUT, 'kb', sub, stale), { force: true });
  }
}

for (const file of readTemplates(SRC)) {
  const raw = readFileSync(join(SRC, file), 'utf8');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    skipped.push({ file, reason: 'invalid JSON: ' + e.message });
    continue;
  }

  const slug = String(doc.slug || doc.Slug || '').trim();
  const fields = doc.fields || doc.Fields;
  if (!SLUG_RE.test(slug)) { skipped.push({ file, reason: 'missing/invalid slug' }); continue; }
  if (!Array.isArray(fields)) { skipped.push({ file, reason: 'no fields array' }); continue; }
  const slugKey = slug.toLowerCase();
  if (claimedSlugs.has(slugKey)) {
    skipped.push({ file, reason: `duplicate slug "${slug}" — already claimed by ${claimedSlugs.get(slugKey)}` });
    // The slug IS served by the gallery (via the winning file), so this redundant copy
    // must not keep shipping in the package either — otherwise a template we "moved to
    // the gallery" quietly stays bundled under a second filename.
    duplicateFiles.push(file);
    continue;
  }
  // A template whose artwork is not in the repo would publish a design with a dead hero:
  // the card thumbnail and the preview both show a large empty panel, and installing it
  // gives the customer a broken form. Refuse to publish it at all — the fix is to add the
  // missing image under Assets/img, not to ship the template.
  const wanted = referencedImages(raw);
  const absent = wanted.filter((rel) => !existsSync(join(IMG_ROOT, rel.replace(/\//g, sep))));
  if (absent.length) {
    skipped.push({ file, reason: `missing artwork (${absent.join(', ')}) — add it under Assets/img or drop the template` });
    continue;
  }

  claimedSlugs.set(slugKey, file);

  // Re-serialize canonically (stable 2-space JSON) so the sha256 is reproducible
  // and independent of the source file's whitespace.
  const canonical = JSON.stringify(doc, null, 2) + '\n';
  const bytes = Buffer.from(canonical, 'utf8');
  const rel = 'templates/' + slug + '.json';
  writeFileSync(join(OUT, 'templates', slug + '.json'), bytes);

  // ── per-template artwork bundle ─────────────────────────
  // Every image the template references is pulled out of the package and shipped
  // here instead; the host downloads + extracts it on install so the absolute
  // /…/img/<rel> URLs inside the template keep resolving.
  const wantedImages = wanted; // already resolved + proven present above
  const bundleFiles = [];
  for (const rel of wantedImages) {
    const abs = join(IMG_ROOT, rel.replace(/\//g, sep));
    if (!existsSync(abs)) { missingImages.push({ file, rel }); continue; }
    bundleFiles.push({ name: 'img/' + rel, data: readFileSync(abs) });
  }
  let assetsRel = null, assetsSha = null, assetsSize = 0;
  if (bundleFiles.length) {
    const zipBuf = zipStore(bundleFiles);
    assetsRel = 'templates/' + slug + '-assets.zip';
    writeFileSync(join(OUT, 'templates', slug + '-assets.zip'), zipBuf);
    assetsSha = sha256Hex(zipBuf);
    assetsSize = zipBuf.length;
    const bytes = bundleFiles.reduce((n, f) => n + f.data.length, 0);
    assetBytesMoved += bytes;
    for (const f of bundleFiles) movedImages.add(f.name.slice(4)); // strip "img/"
    if (BUNDLED_SLUGS.has(slug)) {
      for (const f of bundleFiles) bundledImages.add(f.name.slice(4));
      bundledImageBytes += bytes;
    }
  }

  // ── per-template AI knowledge ───────────────────────────
  // [KbPerTemplate v20260812] The owner's rule: a template's KB travels WITH the
  // template instead of shipping inside the module package. Derived from this very
  // document (kb-from-template.mjs), so publishing a template publishes its knowledge
  // in the same push — they can never drift apart, and a template can no longer reach
  // a customer with no knowledge attached.
  const kb = buildTemplateKb({ doc, slug, guideDir: GUIDE_DIR });
  for (const w of kb.warnings) kbWarnings.push({ slug, warning: w });

  // Guide markdown + facts map are separate files: the bundle stays small and readable,
  // each resource carries its own sha256, and the trust chain is unbroken (manifest pins
  // the bundle, the bundle pins its resources).
  const kbResources = [];
  for (const r of kb.resources) {
    const rel = 'kb/TemplateGuides/' + r.name;
    writeFileSync(join(OUT, 'kb', 'TemplateGuides', r.name), r.data);
    const entry = { path: rel, sha256: sha256Hex(r.data), sizeBytes: r.data.length };
    kbResources.push(entry);
    kbFiles.push(entry);
    kbBytes += r.data.length;
  }

  const kbDoc = {
    kbVersion: 1,
    slug,
    // Seed-shaped: AiKnowledgeSeedMerger.Merge consumes this sub-document verbatim,
    // so the install path needs no parser of its own.
    seed: toSeedDocument(kb.entries),
    resources: kbResources,
  };
  const kbBuf = Buffer.from(JSON.stringify(kbDoc, null, 2) + '\n', 'utf8');
  const kbRel = 'kb/templates/' + slug + '.json';
  writeFileSync(join(OUT, 'kb', 'templates', slug + '.json'), kbBuf);
  const kbSha = sha256Hex(kbBuf);
  kbTemplates.push({ slug, path: kbRel, sha256: kbSha, sizeBytes: kbBuf.length });
  kbBytes += kbBuf.length;
  // kbSlugs is the "safe to delete from the package" list, NOT "what was published". The four
  // BUNDLED starters are published here too (so they stay updatable and the feed is complete) but
  // their TEMPLATE ships inside the package — strip their knowledge and an offline install would
  // hold a template whose KB exists only on a gallery it cannot reach. Knowledge ships wherever
  // its template ships.
  if (!BUNDLED_SLUGS.has(slug)) for (const e of kb.entries) kbSlugs.push(e.Slug);
  if (kb.entries.some((e) => e.Kind === 'template_guide')) kbWithGuide++;

  const cats = Array.isArray(doc.categories) ? doc.categories.filter(Boolean).map(String) : [];
  entries.push({
    slug,
    title: String(doc.title || slug),
    description: String(doc.description || ''),
    category: String(doc.category || cats[0] || 'General'),
    categories: cats,
    icon: String(doc.icon || ''),
    version: String(doc.version || '1.0.0'),
    updatedUtc: new Date(0).toISOString(), // stamped below from a fixed build time
    file: rel,
    assets: assetsRel,
    assetsSha256: assetsSha,
    assetsSizeBytes: assetsSize,
    assetFiles: bundleFiles.map((f) => f.name),
    sha256: sha256Hex(bytes),
    sizeBytes: bytes.length,
    // [KbPerTemplate v20260812] Pointer to this template's knowledge bundle, pinned by
    // hash exactly like the template and the artwork. Same version, same push: editing a
    // guide changes this sha256, so an install that already has the old KB re-downloads it.
    kb: kbRel,
    kbSha256: kbSha,
    kbSizeBytes: kbBuf.length,
    // [QuickStart 2026-07-24] Was hard-coded true. This source folder IS the premium set, so
    // true remains the default, but a template that states its own flag is believed — otherwise
    // dropping a free starter in here would silently publish it as premium (and lock it on
    // trial installs, which is exactly the bug this flag exists to prevent).
    premium: doc.premium !== undefined ? !!doc.premium : (doc.isPremium !== undefined ? !!doc.isPremium : true),
    minModuleVersion: String(doc.minModuleVersion || ''),
    fieldCount: fields.length,
    sourceFile: basename(file),
  });
}

entries.sort((a, b) => a.title.localeCompare(b.title));

const generatedUtc = new Date().toISOString();
for (const e of entries) e.updatedUtc = generatedUtc;

const manifest = { repoVersion: 1, generatedUtc, templates: entries };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

// ── KB channel manifest ───────────────────────────────────
// [KbPerTemplate v20260812] kb/manifest.json was a 404 on every install ever shipped:
// GalleryRepositoryService has had a `kb` channel since v20260723 and nothing ever
// published into it. This is the file that makes the channel real. It stays a CHANNEL
// index (what knowledge exists, pinned by hash) — the install path resolves a single
// template's bundle straight from manifest.json's kb/kbSha256 pointer and never needs
// to read this, so a stale copy cannot break an install.
kbTemplates.sort((a, b) => a.slug.localeCompare(b.slug));
kbFiles.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(OUT, 'kb', 'manifest.json'), JSON.stringify({
  repoVersion: 1,
  generatedUtc,
  // No shared seed file: template knowledge is per-template by design. The module's
  // core KB (widgets, patterns, rules) still ships in the package — only knowledge
  // ABOUT A GALLERY TEMPLATE moved out here.
  seed: null,
  templates: kbTemplates,
  files: kbFiles,
}, null, 2) + '\n', 'utf8');

// ── human-friendly landing page ────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cards = entries.map((e) => `      <article class="card">
        <h3>${esc(e.title)}</h3>
        <p class="cat">${esc(e.category)}${e.fieldCount ? ` · ${e.fieldCount} fields` : ''}</p>
        <p class="desc">${esc(e.description).slice(0, 220)}</p>
        <p class="meta"><code>${esc(e.slug)}</code> · v${esc(e.version)} · ${(e.sizeBytes / 1024).toFixed(1)} KB</p>
        <a href="${esc(e.file)}">Download JSON</a>
      </article>`).join('\n');

writeFileSync(join(OUT, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MegaForm Template Gallery</title>
<style>
:root{color-scheme:light dark}
body{font:15px/1.55 system-ui,Segoe UI,sans-serif;margin:0;padding:32px 20px;max-width:1100px;margin-inline:auto}
h1{font-size:26px;margin:0 0 6px} .sub{color:#64748b;margin:0 0 26px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px}
@media(prefers-color-scheme:dark){.card{border-color:#334155}}
.card h3{margin:0 0 4px;font-size:16px}
.cat{margin:0 0 8px;font-size:12px;font-weight:600;color:#7c3aed}
.desc{margin:0 0 10px;font-size:13px;color:#475569}
@media(prefers-color-scheme:dark){.desc{color:#94a3b8}}
.meta{margin:0 0 10px;font-size:11px;color:#94a3b8}
code{background:rgba(127,127,127,.15);padding:1px 5px;border-radius:4px}
a{color:#2563eb;font-size:13px;font-weight:600;text-decoration:none}
.box{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:0 0 26px;font-size:13px}
@media(prefers-color-scheme:dark){.box{border-color:#334155}}
</style></head><body>
<h1>MegaForm Template Gallery</h1>
<p class="sub">${entries.length} templates · generated ${esc(generatedUtc)}</p>
<div class="box">
  <strong>Machine-readable feed:</strong> <a href="manifest.json">manifest.json</a><br>
  MegaForm downloads templates from this repository directly in the builder
  (<em>Template Gallery → Browse online</em>) on licensed installs. Each entry is
  pinned by sha256.<br>
  <strong>To add a template:</strong> drop the JSON into the source folder and re-run
  <code>node Tools/gallery/build-gallery.mjs</code>, then push.
</div>
<div class="grid">
${cards}
</div>
</body></html>
`, 'utf8');

// ── package-exclusion manifest ────────────────────────────
// The packaging scripts read this to leave gallery-hosted content OUT of the shipped
// module. Emitting it here (rather than hard-coding lists in each build script) means
// the package can never drift from what the gallery actually serves: add a template,
// re-run this, and both the gallery AND the package exclusions update together.
const excludePath = resolve(join(REPO_ROOT, 'tools', 'gallery', 'gallery-exclude.json'));
writeFileSync(excludePath, JSON.stringify({
  _comment: 'GENERATED by tools/gallery/build-gallery.mjs - do not edit by hand. '
    + 'Content listed here is served from the gallery repo and must NOT ship inside the module package.',
  generatedUtc,
  galleryUrl: PUBLIC_BASE || null,
  // Starters that intentionally REMAIN in the package (never excluded).
  bundledSlugs: [...BUNDLED_SLUGS].sort(),
  // The same starters as SOURCE FILE NAMES. Packaging must copy exactly these — an
  // "everything not in templateFiles" rule silently also ships anything the publisher
  // skipped (e.g. a template whose artwork is missing), which put 8 premium starters in
  // the DNN package while Oqtane shipped 4.
  bundledFiles: entries.filter((e) => BUNDLED_SLUGS.has(e.slug)).map((e) => e.sourceFile).sort(),
  // Source template file names (as they appear in the source folder) now hosted remotely.
  templateFiles: entries.filter((e) => !BUNDLED_SLUGS.has(e.slug)).map((e) => e.sourceFile)
    .concat(duplicateFiles)
    .sort(),
  // Image paths relative to Assets/img (e.g. "euro-youth/euro-youth-hero.png"). Artwork
  // belonging to a bundled starter must keep shipping, or that starter renders broken.
  images: [...movedImages]
    .filter((p) => !bundledImages.has(p))
    .map((p) => p.replace(/^img\//, ''))
    .sort(),
  imageBytes: assetBytesMoved - bundledImageBytes,
  // [KbPerTemplate v20260812] KB entry slugs the GALLERY now serves. strip-seed-kb.mjs
  // removes exactly these rows from the seed copied into the package, so a template's
  // knowledge arrives with the template instead of being frozen into every build. Slugs
  // absent from this list (the module's own widget/pattern/rule knowledge, and the
  // bundled quick-start starters) keep shipping — an offline install must still have an
  // AI that works.
  kbSlugs: kbSlugs.slice().sort(),
  kbGuideFiles: kbFiles.map((f) => f.path.replace(/^kb\/TemplateGuides\//, '')).sort(),
}, null, 2) + '\n', 'utf8');

// ── keep the Oqtane .nuspec in sync ───────────────────────
// The DNN build script reads gallery-exclude.json directly. NuGet cannot: the exclusion has
// to be a literal glob list on the wwwroot <file> entry. Rewriting it from the same data
// here is what stops the two platforms from drifting — publish a template and BOTH packages
// stop shipping its artwork. license.lic stays excluded (Oqtane is Marketplace-licensed).
const galleryImages = [...movedImages].filter((p) => !bundledImages.has(p)).map((p) => p.replace(/^img\//, '')).sort();
const nuspecPath = resolve(join(REPO_ROOT, 'MegaForm.Oqtane.Package', 'MegaForm.Oqtane.nuspec'));
let nuspecUpdated = false;
if (existsSync(nuspecPath)) {
  // [FontSlim 2026-07-25] Also exclude the unreferenced self-hosted Google-Fonts pack
  // (Assets/fonts/gf, ~12.9 MB). The shipped CSS pulls Inter/Geist from the Google Fonts CDN,
  // so gf never loads — it was pure dead weight in the package. Kept alongside license.lic as a
  // fixed exclusion so it survives every regeneration.
  //
  // [SlimSurvives 2026-08-02] EVERYTHING that must stay excluded belongs in this array. The
  // write below REPLACES the whole exclude attribute, so a rule hand-added to the nuspec is
  // deleted by the next gallery publish. That is what happened to the 2026-07-29 slimming: the
  // package quietly went back to 50 MB and nobody noticed, because the size is only visible
  // when you build one. Measured on the payload this list is applied to:
  //   img\mock          24 files, 36 MB — no bundled template references any image at all
  //   *.map             32 files,  8 MB — sourcemaps, not wanted in a store package
  //   js\i18n, js\bundles\i18n, js\plugins\i18n — three byte-identical copies of the 39-locale
  //     folder, 3.8 MB each. Oqtane serves locales from js\builder\i18n ONLY (the i18n/list and
  //     i18n/Get endpoints read WebRootPath\Modules\MegaForm\js\builder\i18n), and the shipped
  //     bundles only ever build API-shaped URLs (/api/MegaForm/i18n), never a relative folder.
  //     js\builder\i18n therefore stays; the other three are copy-loop residue.
  const patterns = [
    '**\\license.lic',
    '**\\fonts\\gf\\**',
    '**\\img\\mock\\**',
    '**\\*.map',
    '**\\*.pdb',
    '**\\js\\i18n\\**',
    '**\\js\\bundles\\i18n\\**',
    '**\\js\\plugins\\i18n\\**',
    ...galleryImages.map((rel) => '**\\img\\' + rel.replace(/\//g, '\\')),
  ];
  const nuspec = readFileSync(nuspecPath, 'utf8');
  const lineRe = /(<file src="\.\.\\MegaForm\.Oqtane\.Server\\wwwroot\\Modules\\MegaForm\\\*\*\\\*\.\*"[^>]*?exclude=")([^"]*)(")/;
  const m = nuspec.match(lineRe);
  if (!m) {
    console.error('  ! nuspec wwwroot <file> entry not found — Oqtane package exclusions NOT updated');
  } else if (m[2] !== patterns.join(';')) {
    writeFileSync(nuspecPath, nuspec.replace(lineRe, (_a, pre, _old, post) => pre + patterns.join(';') + post), 'utf8');
    nuspecUpdated = true;
  }
}

// ── self-verification ─────────────────────────────────────
// The module REFUSES any file whose sha256 differs from the manifest, so a repo
// that fails this check is dead on arrival. Verify before anyone publishes it.
let verified = 0;
const broken = [];
for (const e of entries) {
  const p = join(OUT, e.file);
  if (!existsSync(p)) { broken.push(`${e.slug}: file missing (${e.file})`); continue; }
  const b = readFileSync(p);
  if (sha256Hex(b) !== e.sha256) { broken.push(`${e.slug}: sha256 mismatch`); continue; }
  if (b.length !== e.sizeBytes) { broken.push(`${e.slug}: sizeBytes mismatch`); continue; }
  // An assets zip without a matching hash can never be installed (DownloadFileAsync
  // rejects unverifiable content), so treat it as a hard build failure.
  if (e.assets) {
    const ap = join(OUT, e.assets);
    if (!existsSync(ap)) { broken.push(`${e.slug}: assets zip missing (${e.assets})`); continue; }
    const ab = readFileSync(ap);
    if (sha256Hex(ab) !== e.assetsSha256) { broken.push(`${e.slug}: assets sha256 mismatch`); continue; }
    if (ab.length !== e.assetsSizeBytes) { broken.push(`${e.slug}: assets sizeBytes mismatch`); continue; }
  }
  // [KbPerTemplate v20260812] The KB bundle is downloaded with the same
  // DownloadFileAsync that refuses an unverifiable file, so an unhashed or mismatched
  // bundle is a template whose knowledge can never install — a hard build failure, not
  // a warning. Its resources are verified too: they are pinned inside the bundle, and a
  // guide that fails its hash leaves the AI editing a premium shell with no contract.
  if (e.kb) {
    const kp = join(OUT, e.kb);
    if (!existsSync(kp)) { broken.push(`${e.slug}: kb bundle missing (${e.kb})`); continue; }
    const kbuf = readFileSync(kp);
    if (sha256Hex(kbuf) !== e.kbSha256) { broken.push(`${e.slug}: kb sha256 mismatch`); continue; }
    if (kbuf.length !== e.kbSizeBytes) { broken.push(`${e.slug}: kb sizeBytes mismatch`); continue; }
    let kdoc;
    try { kdoc = JSON.parse(kbuf.toString('utf8')); }
    catch { broken.push(`${e.slug}: kb bundle is not valid JSON`); continue; }
    if (!kdoc.seed || !Array.isArray(kdoc.seed.entries) || kdoc.seed.entries.length === 0) {
      broken.push(`${e.slug}: kb bundle carries no entries`); continue;
    }
    let resBroken = null;
    for (const r of kdoc.resources || []) {
      const rp = join(OUT, r.path);
      if (!existsSync(rp)) { resBroken = `kb resource missing (${r.path})`; break; }
      const rb = readFileSync(rp);
      if (sha256Hex(rb) !== r.sha256) { resBroken = `kb resource sha256 mismatch (${r.path})`; break; }
      if (rb.length !== r.sizeBytes) { resBroken = `kb resource sizeBytes mismatch (${r.path})`; break; }
    }
    if (resBroken) { broken.push(`${e.slug}: ${resBroken}`); continue; }
  } else {
    broken.push(`${e.slug}: no kb bundle — every published template must carry its knowledge`);
    continue;
  }
  verified++;
}

// ── report ────────────────────────────────────────────────
console.log('Gallery built -> ' + OUT);
console.log('  templates : ' + entries.length);
console.log('  verified  : ' + verified + '/' + entries.length + ' (sha256 + size)');
console.log('  skipped   : ' + skipped.length);
for (const s of skipped) console.log('    - ' + s.file + ' (' + s.reason + ')');
console.log('  artwork   : ' + movedImages.size + ' images bundled ('
  + (assetBytesMoved / 1024 / 1024).toFixed(2) + ' MB moved OUT of the package)');
if (missingImages.length) {
  console.log('  MISSING artwork (' + missingImages.length + ') — template will render with a broken image:');
  for (const m of missingImages.slice(0, 15)) console.log('    ! ' + m.rel + '  (referenced by ' + m.file + ')');
  if (missingImages.length > 15) console.log('    ... and ' + (missingImages.length - 15) + ' more');
}
console.log('  knowledge : ' + kbTemplates.length + ' bundle(s), ' + kbWithGuide + ' with a refine guide, '
  + kbFiles.length + ' resource file(s), ' + (kbBytes / 1024).toFixed(0) + ' KB total');
// Never let a coverage gap read as success: a template with no guide still installs, but
// the AI edits its premium shell without a design contract — say which ones, every run.
const noGuide = [...new Set(kbWarnings.filter((w) => /no guide file/.test(w.warning)).map((w) => w.slug))]
  .map((slug) => ({ slug }));
const deadPointer = kbWarnings.filter((w) => /pointer is dead|does not match/.test(w.warning));
if (noGuide.length) {
  console.log('    ! ' + noGuide.length + ' template(s) ship CREATE knowledge only (no <slug>.guide.md):');
  for (const w of noGuide.slice(0, 8)) console.log('      - ' + w.slug);
  if (noGuide.length > 8) console.log('      ... and ' + (noGuide.length - 8) + ' more');
}
if (deadPointer.length) {
  console.log('    ! ' + deadPointer.length + ' template(s) declare templateGuideSlug with nothing behind it:');
  for (const w of deadPointer) console.log('      - ' + w.slug + ': ' + w.warning);
}
console.log('  manifest  : manifest.json + kb/manifest.json (repoVersion 1)');
console.log('  bundled   : ' + entries.filter((e) => BUNDLED_SLUGS.has(e.slug)).length + '/' + BUNDLED_SLUGS.size
  + ' premium starter(s) kept in the package'
  + (entries.filter((e) => BUNDLED_SLUGS.has(e.slug)).length === BUNDLED_SLUGS.size ? '' : '  ⚠ a BUNDLED_SLUGS entry matched no template'));
console.log('  nuspec    : ' + (nuspecUpdated ? 'UPDATED Oqtane exclusions (' + galleryImages.length + ' image pattern(s))' : 'already in sync'));
if (PUBLIC_BASE) console.log('  public    : ' + PUBLIC_BASE.replace(/\/?$/, '/') + 'manifest.json');

if (broken.length) {
  console.error('\nFAILED — the generated repo is not installable:');
  for (const b of broken) console.error('  ! ' + b);
  process.exit(1);
}
