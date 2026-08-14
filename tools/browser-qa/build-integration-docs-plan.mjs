// Dung ke hoach dang bai cho NHANH INTEGRATIONS cua kenh docs, tu chinh cac file DocFX trong repo.
//
//   node tools/browser-qa/build-integration-docs-plan.mjs <outPlan.json>
//   node tools/browser-qa/megaform-records-apply.mjs <outPlan.json>
//
// Nhanh thu BA cua kenh: 0020 = dnn-guides, 0030 = sdk-programming, 0040 = nhanh nay.
//
// Anh: nhanh SDK phai BO het anh vi `../images/...` khong ton tai tren site. Lan nay hai GIF da
// duoc upload len `/Portals/0/`, nen chung duoc tro thang toi URL that; hai GIF con lai CHUA quay
// tren DNN nen van bi bo (giu lai chu thich) — tha thieu anh con hon ship mot o anh vo.
import fs from 'node:fs';
import path from 'node:path';
import { mdToHtml, headingsOf } from './md-to-docs-html.mjs';

const ART = 'Docs/docfx/articles';
const BRANCH = 'integrations';
const BASE = '/MegaFormDocsT';
const TODAY = '2026-08-13';

// [file .md, khoa doc, nhan tren cay]
const PAGES = [
  ['integration-webhook.md', 'int-webhook', 'CRM/ERP over HTTP'],
  ['integration-sql-insert.md', 'int-sql-insert', 'Write to an existing SQL table'],
  ['integration-bpmn-api-task.md', 'int-bpmn-api-task', 'BPMN API service task'],
];

// Bai cua nhanh DNN da co san tren kenh (khop voi doc_key that, da doi chieu voi form 385).
const CROSS = {
  'workflow.md': 'dnn-workflow',
  'workflow-approvals.md': 'dnn-workflow-approvals',
  'workflow-library.md': 'dnn-workflow-library',
  'erp-end-to-end.md': 'dnn-erp-demo',
  'submissions-grid.md': 'dnn-submissions-grid',
  'form-builder.md': 'dnn-form-builder',
  'storage-options.md': 'dnn-storage-options',
};

// Anh da upload len portal — chi nhung file nay moi duoc render thanh <img>.
const IMAGES = {
  '30-db-pane-groups.gif': 'https://dnndefender.com/Portals/0/30-db-pane-groups.gif',
  '32-sql-insert-lead.gif': 'https://dnndefender.com/Portals/0/32-sql-insert-lead.gif',
};

const byFile = new Map([...PAGES.map(([f, key]) => [f, key]), ...Object.entries(CROSS)]);

function linkMap(href, isImage) {
  if (isImage) {
    const file = href.split('/').pop();
    return IMAGES[file] || null;                              // null = bo anh, giu chu thich
  }
  if (/^https?:|^mailto:|^#/.test(href)) return href;
  const file = href.split('#')[0].split('/').pop();
  const anchor = href.includes('#') ? '#' + href.split('#')[1] : '';
  const key = byFile.get(file);
  return key ? `${BASE}?doc=${key}${anchor}` : null;
}

const creates = [];
creates.push({
  formId: 385,
  data: {
    doc_uid: null, doc_space: BRANCH, doc_key: BRANCH, parent_key: '',
    doc_path: 'Integrating MegaForm with your systems',
    sort_order: '', doc_sort_key: '0040', doc_depth: 0,
    nav_title: 'Integrating MegaForm with your systems',
    title: 'Integrating MegaForm with your systems',
    excerpt: 'Send every submission where it needs to go: to a CRM or ERP over HTTP, into a SQL table you already own, or out through an API service task on the BPMN canvas.',
    body: '', headings_json: '[]', content_hash: '', status: 'published',
    publish_date: TODAY, legacy_path: '',
    seo_title: 'Integrating MegaForm with your CRM, ERP or database',
    seo_description: 'MegaForm integration guides: webhooks with and without authentication, submit-time SQL INSERT into an existing table, and a BPMN API service task.',
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
      doc_path: `Integrating MegaForm with your systems/${nav}`,
      sort_order: '', doc_sort_key: `0040/${String((idx + 1) * 20).padStart(4, '0')}`, doc_depth: 1,
      nav_title: nav, title: firstHeading,
      excerpt: plain.slice(0, 220),
      body, headings_json: JSON.stringify(headingsOf(md)),
      content_hash: '', status: 'published', publish_date: TODAY,
      legacy_path: `articles/${file.replace(/\.md$/, '.html')}`,
      seo_title: firstHeading, seo_description: plain.slice(0, 300),
      view_count: 0, rating_sum: 0, rating_count: 0,
    },
  });
  console.log(`${key.padEnd(20)} ${String(body.length).padStart(6)} ky tu  ${headingsOf(md).length} heading  ${(body.match(/<img /g) || []).length} anh`);
});

const dropped = new Set();
PAGES.forEach(([file]) => {
  const md = fs.readFileSync(path.join(ART, file), 'utf8');
  for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const h = m[1];
    if (/^https?:|^mailto:|^#/.test(h)) continue;
    const isImg = m[0].startsWith('!');
    if (!linkMap(h, isImg)) dropped.add((isImg ? 'anh ' : 'link ') + h);
  }
});
console.log('\nbi bo (khong co tren kenh):');
[...dropped].sort().forEach((d) => console.log('  ' + d));

fs.writeFileSync(process.argv[2], JSON.stringify({ creates }, null, 1));
console.log(`\nda ghi ${process.argv[2]} - ${creates.length} ban ghi`);
