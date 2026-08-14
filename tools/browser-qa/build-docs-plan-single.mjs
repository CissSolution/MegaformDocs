// Build a publish plan for ONE article of the docs channel, from its DocFX source.
//
//   node tools/browser-qa/build-docs-plan-single.mjs <config.json> <outPlan.json>
//   node tools/browser-qa/megaform-records-apply.mjs <outPlan.json>
//
// config.json:
//   { "file": "after-submit-script.md", "docKey": "int-csharp-script",
//     "navTitle": "Run your own C# after a submission",
//     "parentKey": "integrations", "parentPath": "Integrating MegaForm with your systems",
//     "sortKey": "0040/0080", "depth": 1,
//     "images": { "40-script-panel.png": "https://dnndefender.com/Portals/0/40-script-panel.png" },
//     "crossLinks": { "integration-webhook.md": "int-webhook" },
//     "submissionId": 123   // present = update in place instead of creating a second record
//   }
//
// Why a config file rather than more flags: the image map has to be exact. An image that is NOT in
// the map is dropped and only its caption survives — deliberately, because a broken <img> box on a
// customer-facing page is worse than a missing picture. Keeping the map in the plan config makes
// what got dropped visible in the run output instead of discovering it on the live page.
import fs from 'node:fs';
import path from 'node:path';
import { mdToHtml, headingsOf } from './md-to-docs-html.mjs';

const ART = 'Docs/docfx/articles';
const BASE = '/MegaFormDocsT';
const FORM_ID = 385;

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outPath = process.argv[3];
if (!outPath) throw new Error('usage: build-docs-plan-single.mjs <config.json> <outPlan.json>');

const today = cfg.publishDate || new Date().toISOString().slice(0, 10);
const images = cfg.images || {};
const cross = cfg.crossLinks || {};
cross[cfg.file] = cfg.docKey;

function linkMap(href, isImage) {
  if (isImage) return images[href.split('/').pop()] || null;   // null = drop the <img>, keep caption
  if (/^https?:|^mailto:|^#/.test(href)) return href;
  const file = href.split('#')[0].split('/').pop();
  const anchor = href.includes('#') ? '#' + href.split('#')[1] : '';
  const key = cross[file];
  return key ? `${BASE}?doc=${key}${anchor}` : null;
}

const md = fs.readFileSync(path.join(ART, cfg.file), 'utf8');
const firstHeading = (md.match(/^#\s+(.*)$/m) || [, cfg.navTitle])[1].trim();
const body = mdToHtml(md, linkMap);
const plain = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const data = {
  doc_uid: null,
  doc_space: cfg.parentKey || cfg.docKey,
  doc_key: cfg.docKey,
  parent_key: cfg.parentKey || '',
  doc_path: cfg.parentPath ? `${cfg.parentPath}/${cfg.navTitle}` : cfg.navTitle,
  sort_order: '',
  doc_sort_key: cfg.sortKey,
  doc_depth: cfg.depth == null ? 1 : cfg.depth,
  nav_title: cfg.navTitle,
  title: firstHeading,
  excerpt: (cfg.excerpt || plain).slice(0, 220),
  body,
  headings_json: JSON.stringify(headingsOf(md)),
  content_hash: '',
  status: 'published',
  publish_date: today,
  legacy_path: `articles/${cfg.file.replace(/\.md$/, '.html')}`,
  seo_title: cfg.seoTitle || firstHeading,
  seo_description: (cfg.seoDescription || plain).slice(0, 300),
  view_count: 0, rating_sum: 0, rating_count: 0,
};

// An UPDATE must start from the record as it exists, because Submissions/UpdateData overwrites the
// whole DataJson. Rebuilding every field from the config would quietly reset the counters the
// channel accumulates — view_count and the ratings — on every republish.
let finalData = data;
if (cfg.submissionId) {
  const basePath = process.argv[4] || cfg.baseRecord;
  if (!basePath) throw new Error('updating needs the stored record: pass it as the 4th argument (docs-record-find.mjs output)');
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const stored = base.data || base;
  if (String(base.submissionId ?? cfg.submissionId) !== String(cfg.submissionId))
    throw new Error(`stored record is submission ${base.submissionId}, config says ${cfg.submissionId}`);
  finalData = { ...stored };
  for (const k of ['doc_path', 'nav_title', 'title', 'excerpt', 'body', 'headings_json',
                   'seo_title', 'seo_description', 'publish_date', 'legacy_path'])
    finalData[k] = data[k];
  const before = Object.keys(stored).length, after = Object.keys(finalData).length;
  if (before !== after) throw new Error(`field count changed ${before} -> ${after}`);
  console.log(`preserved counters: view_count=${finalData.view_count}, ratings=${finalData.rating_count}`);
}

const plan = cfg.submissionId
  ? { updates: [{ submissionId: cfg.submissionId, data: finalData }] }
  : { creates: [{ formId: FORM_ID, data }] };

// Report what the article asked for and did not get, rather than shipping a page with holes.
const dropped = new Set();
for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const h = m[1];
  if (/^https?:|^mailto:|^#/.test(h)) continue;
  if (!linkMap(h, m[0].startsWith('!'))) dropped.add((m[0].startsWith('!') ? 'image ' : 'link ') + h);
}

fs.writeFileSync(outPath, JSON.stringify(plan, null, 1));
console.log(`${cfg.docKey}: ${body.length} chars, ${headingsOf(md).length} headings, ` +
            `${(body.match(/<img /g) || []).length} images, ${cfg.submissionId ? 'UPDATE' : 'CREATE'}`);
if (dropped.size) { console.log('dropped:'); [...dropped].sort().forEach((d) => console.log('  ' + d)); }
else console.log('dropped: none');
console.log(`wrote ${outPath}`);
