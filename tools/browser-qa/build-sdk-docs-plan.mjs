// Dung ke hoach dang bai cho NHANH SDK cua kenh docs, tu chinh cac file DocFX trong repo.
//
//   node tools/browser-qa/build-sdk-docs-plan.mjs <outPlan.json>
//   node tools/browser-qa/megaform-records-apply.mjs <outPlan.json>
//
// Thu tu lay tu `Docs/docfx/articles/toc.yml` muc "Programming" - khong tu bia thu tu.
// Link `.md` giua cac bai duoc doi sang `?doc=<khoa>`; link tro toi bai KHONG co tren kenh thi
// BO the <a> va giu lai chu - dung bai hoc cua nhanh DNN: 69 link `/Docs?doc=` va 6 khoa sai
// khien nguoi doc bam vao 404 hoac mo nham bai dau tien.
import fs from 'node:fs';
import path from 'node:path';
import { mdToHtml, headingsOf } from './md-to-docs-html.mjs';

const ART = 'Docs/docfx/articles';
const BRANCH = 'sdk-programming';
const BASE = '/MegaFormDocsT';

// [file .md, khoa doc, nhan tren cay]
const PAGES = [
  ['overview.md', 'sdk-overview', 'Overview'],
  ['installation.md', 'sdk-installation', 'Installation'],
  ['standalone-host.md', 'sdk-standalone-host', 'Standalone Host'],
  ['quickstart.md', 'sdk-quickstart', 'Quick Start'],
  ['sdk-reference.md', 'sdk-reference', 'SDK Reference'],
  ['reading-data.md', 'sdk-reading-data', 'Reading Data'],
  ['file-download.md', 'sdk-file-download', 'File Download'],
  ['oqtane-consumer.md', 'sdk-oqtane-consumer', 'Consumer — Oqtane'],
  ['dnn-razor-host.md', 'sdk-dnn-razor-host', 'Consumer — DNN Razor Host'],
  ['razor-host-examples.md', 'sdk-razor-host-examples', 'Razor Host Examples'],
  ['form-template-json.md', 'sdk-form-template-json', 'Template JSON Reference'],
  ['api-stability.md', 'sdk-api-stability', 'API Stability'],
];

// Bai cua NHANH DNN da co san tren kenh - tai lieu SDK tro toi chung bang ten file DocFX, va
// neu khong anh xa thi 9 link nay bi bo the <a> mot cach oan uong.
const CROSS = {
  'ai-form-designer.md': 'dnn-ai-form-designer',
  'ai-prompts-form-design.md': 'dnn-ai-prompts',
  'creating-forms.md': 'dnn-creating-forms',
  'dnn-persona-bar.md': 'dnn-persona-bar',
  'erp-end-to-end.md': 'dnn-erp-demo',
  'field-permissions.md': 'dnn-field-permissions',
  'form-builder.md': 'dnn-form-builder',
  'form-templates.md': 'dnn-form-templates',
  'multi-language.md': 'dnn-multi-language',
  'submissions-grid.md': 'dnn-submissions-grid',
  'workflow.md': 'dnn-workflow',
  'workflow-approvals.md': 'dnn-workflow-approvals',
  'workflow-library.md': 'dnn-workflow-library',
};

const byFile = new Map([...PAGES.map(([f, key]) => [f, key]), ...Object.entries(CROSS)]);

function linkMap(href, isImage) {
  if (isImage) return null;                                   // anh chua co tren site
  if (/^https?:|^mailto:|^#/.test(href)) return href;         // link ngoai va neo trong bai: giu
  const file = href.split('#')[0].split('/').pop();
  const anchor = href.includes('#') ? '#' + href.split('#')[1] : '';
  const key = byFile.get(file);
  return key ? `${BASE}?doc=${key}${anchor}` : null;          // null = bo the <a>, giu chu
}

const creates = [];
creates.push({
  formId: 385,
  data: {
    doc_uid: null, doc_space: BRANCH, doc_key: BRANCH, parent_key: '',
    doc_path: 'Programming with the MegaForm SDK',
    sort_order: '', doc_sort_key: '0030', doc_depth: 0,
    nav_title: 'Programming with the MegaForm SDK',
    title: 'Programming with the MegaForm SDK',
    excerpt: 'The SDK surface: install it, read forms and submissions, serve files, and host it on Oqtane, DNN Razor Host or a standalone ASP.NET Core app.',
    body: '', headings_json: '[]', content_hash: '', status: 'published',
    publish_date: '2026-08-12', legacy_path: '',
    seo_title: 'Programming with the MegaForm SDK',
    seo_description: 'MegaForm SDK documentation: installation, quick start, API reference, reading data, file download and the per-platform consumer guides.',
    view_count: 0, rating_sum: 0, rating_count: 0,
  },
});

PAGES.forEach(([file, key, nav], idx) => {
  const md = fs.readFileSync(path.join(ART, file), 'utf8');
  const firstHeading = (md.match(/^#\s+(.*)$/m) || [, nav])[1].trim();
  const body = mdToHtml(md, linkMap);
  const plain = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  creates.push({
    formId: 385,
    data: {
      doc_uid: null, doc_space: BRANCH, doc_key: key, parent_key: BRANCH,
      doc_path: `Programming with the MegaForm SDK/${nav}`,
      sort_order: '', doc_sort_key: `0030/${String((idx + 1) * 20).padStart(4, '0')}`, doc_depth: 1,
      nav_title: nav, title: firstHeading,
      excerpt: plain.slice(0, 220),
      body, headings_json: JSON.stringify(headingsOf(md)),
      content_hash: '', status: 'published', publish_date: '2026-08-12',
      legacy_path: `articles/${file.replace(/\.md$/, '.html')}`,
      seo_title: firstHeading, seo_description: plain.slice(0, 300),
      view_count: 0, rating_sum: 0, rating_count: 0,
    },
  });
  console.log(`${key.padEnd(26)} ${String(body.length).padStart(6)} ky tu  ${headingsOf(md).length} heading`);
});

// Bao cao link bi bo, de biet minh dang mat gi chu khong im lang
const dropped = new Set();
PAGES.forEach(([file]) => {
  const md = fs.readFileSync(path.join(ART, file), 'utf8');
  for (const m of md.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const h = m[1];
    if (/^https?:|^mailto:|^#/.test(h)) continue;
    if (!linkMap(h)) dropped.add(h);
  }
});
console.log('\nlink bi bo the <a> (bai dich khong co tren kenh):');
[...dropped].sort().forEach((d) => console.log('  ' + d));

fs.writeFileSync(process.argv[2], JSON.stringify({ creates }, null, 1));
console.log(`\nda ghi ${process.argv[2]} - ${creates.length} ban ghi`);
