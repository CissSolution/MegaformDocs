// Find a docs-channel record by doc_key and dump its FULL DataJson to a file.
//
//   node tools/browser-qa/docs-record-find.mjs <doc_key> [outFile.json]
//
// Why this exists: updating a docs page means calling Submissions/UpdateData, and that call
// OVERWRITES the whole DataJson rather than patching it — sending a partial object silently
// deletes every field left out. So an update has to start from the complete current record.
// Submissions/List?search= does not filter on doc_key (it matches the summary text), which is
// how a previous session ended up reading the wrong row; this pages through and matches the
// parsed field exactly.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = (process.env.DNN_BASE_URL || 'https://dnndefender.com').replace(/\/$/, '');
const FORM_ID = Number(process.env.MF_DOCS_FORM_ID || 385);
const KEY = process.argv[2];
const OUT = process.argv[3];
if (!KEY) throw new Error('usage: docs-record-find.mjs <doc_key> [outFile.json]');
if (!process.env.DNN_PASSWORD) throw new Error('Set DNN_PASSWORD.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(`${BASE}/?ctl=Login&returnurl=%2f`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#dnn_ctr_Login_Login_DNN_txtUsername').fill(process.env.DNN_USER || 'host');
await page.locator('#dnn_ctr_Login_Login_DNN_txtPassword').fill(process.env.DNN_PASSWORD);
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => {}),
  page.locator('#dnn_ctr_Login_Login_DNN_cmdLogin').click(),
]);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!document.querySelector('input[name="__RequestVerificationToken"]'),
  { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);

const found = await page.evaluate(async ([formId, key]) => {
  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  const headers = { RequestVerificationToken: token, 'X-Requested-With': 'XMLHttpRequest' };
  const all = [];
  // Page size is capped server-side; walk pages rather than asking for everything at once.
  for (let p = 0; p < 20; p++) {
    const r = await fetch(`/DesktopModules/MegaForm/API/Submissions/List?formId=${formId}&pageIndex=${p}&pageSize=50`,
      { headers });
    if (!r.ok) return { error: 'list ' + r.status };
    const b = await r.json();
    const items = b.items || b.Items || [];
    if (!items.length) break;
    all.push(...items);
    if (items.length < 50) break;
  }
  const hits = [];
  for (const it of all) {
    let d = null;
    try { d = JSON.parse(it.DataJson || it.dataJson || '{}'); } catch { continue; }
    if (d && d.doc_key === key) hits.push({ submissionId: it.SubmissionId ?? it.submissionId, data: d });
  }
  return { scanned: all.length, hits };
}, [FORM_ID, KEY]);

if (found.error) { console.log('ERROR ' + found.error); await browser.close(); process.exit(1); }
console.log(`scanned ${found.scanned} records, matched doc_key="${KEY}": ${found.hits.length}`);
for (const h of found.hits) {
  console.log(`  submissionId=${h.submissionId}  sort=${h.data.doc_sort_key}  nav="${h.data.nav_title}"  ` +
              `title="${h.data.title}"  bodyChars=${(h.data.body || '').length}  fields=${Object.keys(h.data).length}`);
}
if (OUT && found.hits.length === 1) {
  fs.writeFileSync(OUT, JSON.stringify(found.hits[0], null, 1));
  console.log('wrote ' + OUT);
} else if (OUT) {
  console.log('NOT written: expected exactly one match.');
}
await browser.close();
