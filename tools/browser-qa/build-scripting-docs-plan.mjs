// Build the publish plan for the rewritten SCRIPTING pages, from the DocFX sources.
//
//   node tools/browser-qa/build-scripting-docs-plan.mjs <metaDump.json> <outPlan.json>
//   node tools/browser-qa/megaform-records-apply.mjs   <outPlan.json>
//
// This replaces the automation branch written before the capability rail was removed. Five of the
// twelve pages there are rewritten and go back to published; six describe things that still cannot
// be configured on a site and STAY draft rather than being published with an apology; one page is
// new (safety), and one lands in the DNN guides branch (reCAPTCHA).
//
// The meta dump exists because UpdateData overwrites the WHOLE DataJson: view_count, rating_sum,
// rating_count and doc_uid live in the same record as the article, and a plan that omits them
// silently resets a page's read counter to zero. Pass the dump; do not hand-write these.
import fs from 'node:fs';
import path from 'node:path';
import { mdToHtml, headingsOf } from './md-to-docs-html.mjs';

const ART = 'Docs/docfx/articles';
const BASE = '/MegaFormDocsT';
const TODAY = process.env.MF_PUBLISH_DATE || '2026-08-14';
const FORM_ID = 385;

const [, , metaFile, outFile] = process.argv;
if (!metaFile || !outFile) {
  console.error('usage: build-scripting-docs-plan.mjs <metaDump.json> <outPlan.json>');
  process.exit(1);
}

// The SQL tool wraps rows as { Data: [ [ {...} ] ] }.
// PowerShell's Out-File -Encoding utf8 writes a BOM, which JSON.parse rejects with an error that
// points at an invisible character. Strip it rather than depending on how the dump was produced.
const raw = JSON.parse(fs.readFileSync(metaFile, 'utf8').replace(/^﻿/, ''));
const rows = (raw.Data && raw.Data[0]) || [];
const byKey = Object.fromEntries(rows.map((r) => [r.doc_key, r]));

// file, doc_key, nav label, sort key, depth, parent key, parent path, space
// [2026-08-14] Renamed from "Automating what happens after a submission". That title described what
// the whole product does after a submission — the webhook node, the database node and workflow all
// automate after a submission — so it claimed territory this branch does not own, and a reader
// looking for "email someone on submit" landed here instead of on workflow. It also never said the
// section is about writing code. The new name matches its siblings (Using / Integrating /
// Programming / Writing) and "your own" signals that this is the escape hatch, not the default path.
const PARENT_NAV = 'Writing your own C#';
const PAGES = [
  ['automation-overview.md',          'automation',             PARENT_NAV,                    '0045',      0, null,         null,        'automation'],
  ['automation-custom-db.md',         'auto-custom-db',         'Write to your own database',  '0045/0020', 1, 'automation', PARENT_NAV,  'automation'],
  ['automation-rest-crm.md',          'auto-rest-crm',          'CRM / ERP / REST / SOAP',     '0045/0040', 1, 'automation', PARENT_NAV,  'automation'],
  ['automation-notifications.md',     'auto-notifications',     'Email and messaging',         '0045/0120', 1, 'automation', PARENT_NAV,  'automation'],
  ['automation-user-provisioning.md', 'auto-user-provisioning', 'Create users and grant roles','0045/0160', 1, 'automation', PARENT_NAV,  'automation'],
  ['scripting-safety.md',             'auto-safety',            'Safety and responsibility',   '0045/0240', 1, 'automation', PARENT_NAV,  'automation'],
  // Not scripting. It belongs with the rest of the DNN form-building guides.
  ['recaptcha-setup.md',              'dnn-recaptcha',          'Spam protection & reCAPTCHA', '0020/0460', 1, 'dnn-guides', 'Using MegaForm on DNN', 'dnn'],
];

// Pages the rewritten set links to, by their real doc_key on the channel.
const CROSS = {
  'automation-overview.md': 'automation',
  'automation-custom-db.md': 'auto-custom-db',
  'automation-rest-crm.md': 'auto-rest-crm',
  'automation-notifications.md': 'auto-notifications',
  'automation-user-provisioning.md': 'auto-user-provisioning',
  'scripting-safety.md': 'auto-safety',
  'recaptcha-setup.md': 'dnn-recaptcha',
  'integration-webhook.md': 'int-webhook',
  'integration-sql-insert.md': 'int-sql-insert',
  'integration-bpmn-api-task.md': 'int-bpmn-api-task',
  'after-submit-script.md': 'int-csharp-script',
  // Pages already published in the other branches. Without these the rewritten set links to them as
  // plain text, which on the channel is indistinguishable from a link to a page that does not exist.
  'sdk-reference.md': 'sdk-reference',
  'reading-data.md': 'sdk-reading-data',
  'after-submission.md': 'dnn-after-submission',
  'submissions-grid.md': 'dnn-submissions-grid',
  'form-builder.md': 'dnn-form-builder',
  'creating-forms.md': 'dnn-creating-forms',
  'email-notifications.md': 'dnn-email-notifications',
  'workflow.md': 'dnn-workflow',
  'workflow-approvals.md': 'dnn-workflow-approvals',
  'field-permissions.md': 'dnn-field-permissions',
  'settings-theme.md': 'dnn-settings-theme',
};

// Pages still describing something a site cannot switch on. Left as drafts on purpose; the overview
// says why, which is better than a published page that opens with a disclaimer.
const STAY_HIDDEN = ['auto-fraud-check', 'auto-field-encryption', 'auto-realtime-pricing',
                     'auto-approval-routing', 'auto-documents', 'auto-file-routing', 'auto-queue'];

const dropped = [];
function linkMap(href, isImage) {
  // Images are allowed when they already point at a served path. The earlier automation pages set
  // this to always drop, on the reasoning that a reference page needs no screenshots — true of a
  // code page, false of one describing what a visitor sees on screen. A relative image name would
  // still be dropped: it has to be uploaded and addressed as /Portals/... to survive on the channel.
  if (isImage) return /^https?:|^\/Portals\//.test(href) ? href : null;
  if (/^https?:|^mailto:|^#|^\//.test(href)) return href;
  const file = href.split('#')[0].split('/').pop();
  const anchor = href.includes('#') ? '#' + href.split('#')[1] : '';
  const key = CROSS[file];
  if (!key) { dropped.push(href); return null; }
  return `${BASE}?doc=${key}${anchor}`;
}

const creates = [];
const updates = [];

for (const [file, key, nav, sortKey, depth, parentKey, parentPath, space] of PAGES) {
  const full = path.join(ART, file);
  if (!fs.existsSync(full)) { console.error(`MISSING ${file}`); process.exit(1); }

  const md = fs.readFileSync(full, 'utf8');
  const firstHeading = (md.match(/^#\s+(.*)$/m) || [, nav])[1].trim();
  const body = mdToHtml(md, linkMap);
  const plain = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const prev = byKey[key];

  const data = {
    // carried forward, never invented: resetting these is how a page loses its read count
    doc_uid: prev ? prev.doc_uid : null,
    view_count: prev ? Number(prev.view_count || 0) : 0,
    rating_sum: prev ? Number(prev.rating_sum || 0) : 0,
    rating_count: prev ? Number(prev.rating_count || 0) : 0,

    doc_space: space,
    doc_key: key,
    parent_key: parentKey,
    doc_path: parentPath ? `${parentPath}/${nav}` : nav,
    sort_order: '',
    doc_sort_key: sortKey,
    doc_depth: depth,
    nav_title: nav,
    title: firstHeading,
    excerpt: plain.slice(0, 220),
    body,
    headings_json: JSON.stringify(headingsOf(md)),
    content_hash: '',
    status: 'published',
    publish_date: prev && prev.publish_date ? prev.publish_date : TODAY,
    legacy_path: `articles/${file.replace(/\.md$/, '.html')}`,
    seo_title: firstHeading,
    seo_description: plain.slice(0, 160),
  };

  const where = prev ? `update #${prev.SubmissionId}` : 'create';
  console.log(`${key.padEnd(24)} ${String(body.length).padStart(6)} chars  ${String(headingsOf(md).length).padStart(2)} headings  ${where}`);

  if (prev) updates.push({ submissionId: Number(prev.SubmissionId), data });
  else creates.push({ formId: FORM_ID, data });
}

console.log(`\nstaying hidden: ${STAY_HIDDEN.join(', ')}`);
if (dropped.length) console.log(`dropped links (rendered as plain text): ${[...new Set(dropped)].join(', ')}`);

fs.writeFileSync(outFile, JSON.stringify({ creates, updates }, null, 2), 'utf8');
console.log(`\n${creates.length} create(s), ${updates.length} update(s) -> ${outFile}`);
