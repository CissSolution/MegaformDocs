// Build the publish plan for the AUTOMATION branch of the docs channel, from the DocFX sources.
//
//   node tools/browser-qa/build-automation-docs-plan.mjs <outPlan.json>
//   node tools/browser-qa/megaform-records-apply.mjs <outPlan.json>
//
// Branch order on the channel is decided by doc_sort_key compared with StringComparer.Ordinal,
// so this branch sits at 0045 — after integrations (0040), before the SDK (0050).
//
// Cross-links: pages reference each other by FILE name; the channel addresses pages by doc_key.
// Anything not in the map below is rendered as plain text rather than a link to nowhere, and the
// run prints what it dropped.
import fs from 'node:fs';
import path from 'node:path';
import { mdToHtml, headingsOf } from './md-to-docs-html.mjs';

const ART = 'Docs/docfx/articles';
const BRANCH = 'automation';
const BASE = '/MegaFormDocsT';
const TODAY = process.env.MF_PUBLISH_DATE || '2026-08-14';
const FORM_ID = 385;

// [file, doc_key, nav label]
const PAGES = [
  ['automation-custom-db.md',          'auto-custom-db',        'Write to your own database'],
  ['automation-rest-crm.md',           'auto-rest-crm',         'CRM / ERP / REST / SOAP'],
  ['automation-fraud-check.md',        'auto-fraud-check',      'Blacklist and fraud checks'],
  ['automation-field-encryption.md',   'auto-field-encryption', 'Encrypt or normalise a field'],
  ['automation-realtime-pricing.md',   'auto-realtime-pricing', 'Tax, currency and shipping'],
  ['automation-notifications.md',      'auto-notifications',    'Email, SMS and Telegram'],
  ['automation-approval-routing.md',   'auto-approval-routing', 'Approval routing'],
  ['automation-user-provisioning.md',  'auto-user-provisioning','Create users and grant roles'],
  ['automation-documents.md',          'auto-documents',        'PDF, Word and Excel'],
  ['automation-file-routing.md',       'auto-file-routing',     'Route uploaded files'],
  ['automation-queue.md',              'auto-queue',            'Publish to a queue'],
];

// Pages already on the channel, matched to their real doc_key.
const CROSS = {
  'automation-overview.md': BRANCH,
  'integration-webhook.md': 'int-webhook',
  'integration-sql-insert.md': 'int-sql-insert',
  'integration-bpmn-api-task.md': 'int-bpmn-api-task',
  'after-submit-script.md': 'int-csharp-script',
  ...Object.fromEntries(PAGES.map(([file, key]) => [file, key])),
};

function linkMap(href, isImage) {
  // These pages carry no images on purpose: they are reference, and a screenshot of a code editor
  // adds nothing a code block does not already say.
  if (isImage) return null;
  // A leading "/" is already a channel URL (/MegaFormDocsT?doc=…) — pass it through. Without this
  // the six existing cross-links were reported as "dropped" and rendered as plain text, which
  // looks identical to a genuinely missing page in the output.
  if (/^https?:|^mailto:|^#|^\//.test(href)) return href;
  const file = href.split('#')[0].split('/').pop();
  const anchor = href.includes('#') ? '#' + href.split('#')[1] : '';
  const key = CROSS[file];
  return key ? `${BASE}?doc=${key}${anchor}` : null;
}

function record(file, key, nav, sortKey, depth, parentKey, parentPath) {
  const md = fs.readFileSync(path.join(ART, file), 'utf8');
  const firstHeading = (md.match(/^#\s+(.*)$/m) || [, nav])[1].trim();
  const body = mdToHtml(md, linkMap);
  const plain = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  console.log(`${key.padEnd(24)} ${String(body.length).padStart(6)} chars  ` +
              `${String(headingsOf(md).length).padStart(2)} headings`);

  return {
    formId: FORM_ID,
    data: {
      doc_uid: null, doc_space: BRANCH, doc_key: key,
      parent_key: parentKey, doc_path: parentPath ? `${parentPath}/${nav}` : nav,
      sort_order: '', doc_sort_key: sortKey, doc_depth: depth,
      nav_title: nav, title: firstHeading,
      excerpt: plain.slice(0, 220),
      body, headings_json: JSON.stringify(headingsOf(md)),
      content_hash: '', status: 'published', publish_date: TODAY,
      legacy_path: `articles/${file.replace(/\.md$/, '.html')}`,
      seo_title: firstHeading, seo_description: plain.slice(0, 300),
      view_count: 0, rating_sum: 0, rating_count: 0,
    },
  };
}

const ROOT_NAV = 'Automating what happens after a submission';
const creates = [record('automation-overview.md', BRANCH, ROOT_NAV, '0045', 0, '', '')];

PAGES.forEach(([file, key, nav], i) => {
  creates.push(record(file, key, nav, `0045/${String((i + 1) * 20).padStart(4, '0')}`, 1, BRANCH, ROOT_NAV));
});

const dropped = new Set();
[['automation-overview.md'], ...PAGES].forEach(([file]) => {
  const md = fs.readFileSync(path.join(ART, file), 'utf8');
  for (const m of md.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const h = m[1];
    if (/^https?:|^mailto:|^#/.test(h)) continue;
    if (!linkMap(h, m[0].startsWith('!'))) dropped.add(h);
  }
});

fs.writeFileSync(process.argv[2], JSON.stringify({ creates }, null, 1));
console.log(`\n${creates.length} records → ${process.argv[2]}`);
console.log(dropped.size ? 'links dropped (not on the channel):\n  ' + [...dropped].sort().join('\n  ')
                         : 'links dropped: none');
