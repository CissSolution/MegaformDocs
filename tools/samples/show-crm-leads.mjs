/**
 * Render the current contents of dbo.CRM_Leads as a small HTML page.
 *
 * The point is evidence. MegaForm's submit-time database insert is fail-soft — a green "thank you"
 * proves nothing about whether the row landed — so the walkthrough and its GIF end by showing the
 * customer's own table, not by showing a success message.
 *
 * Uses sqlcmd rather than a driver so it works on a stock SQL Server box with nothing installed.
 *
 * Run: node tools/samples/show-crm-leads.mjs [--db Oqtane_MegaForm_KB20812] [--server .\SQLEXPRESS]
 * Writes: qa-out/integration-demos/crm-leads.html  (path is printed)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const DB = arg('db', 'Oqtane_MegaForm_KB20812');
const SERVER = arg('server', '.\\SQLEXPRESS');
const TABLE = arg('table', 'CRM_Leads');
const OUT = arg('out', 'E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um/qa-out/integration-demos/crm-leads.html');

const SQLCMD = arg('sqlcmd', 'C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\170\\Tools\\Binn\\sqlcmd.exe');

// --top keeps the evidence shot to the rows this demo just wrote. Older rows are real submissions
// and stay in the table; they simply do not belong in a screenshot that is answering "did THIS
// submission land?" — and sample data from earlier runs carries earlier naming conventions with it.
const TOP = Math.min(50, Math.max(1, parseInt(String(arg('top', '12')), 10) || 12));

const query = `SET NOCOUNT ON;
SELECT TOP ${TOP} LeadId, FullName, Email, Phone, Source, Status, SubmissionId,
       CONVERT(varchar(19), CreatedUtc, 120) AS CreatedUtc
FROM dbo.${TABLE} ORDER BY LeadId DESC;`;

const raw = execFileSync(SQLCMD, ['-S', SERVER, '-d', DB, '-E', '-I', '-W', '-s', '\u0001', '-Q', query],
  { encoding: 'utf8' });

// sqlcmd emits a header row, a dashes row, then the data.
const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
const header = (lines[0] || '').split('\u0001');
const rows = lines.slice(2).filter((l) => !/^\(\d+ rows affected\)/.test(l)).map((l) => l.split('\u0001'));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const html = `<!doctype html><meta charset="utf-8"><title>${esc(TABLE)} — the customer's own table</title>
<style>
 body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;margin:28px;color:#0f172a;background:#f8fafc}
 h1{font-size:18px;margin:0 0 4px} p.sub{margin:0 0 18px;color:#64748b;font-size:12px}
 table{border-collapse:collapse;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.08);border-radius:10px;overflow:hidden}
 th{background:#0f766e;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em;padding:9px 12px;text-align:left}
 td{border-bottom:1px solid #f1f5f9;padding:8px 12px;font-size:12px;font-family:Consolas,monospace;white-space:nowrap}
 tr:first-child td{background:#ecfdf5;font-weight:600}
 .empty{color:#94a3b8;font-style:italic}
</style>
<h1>dbo.${esc(TABLE)} — ${rows.length} row(s)</h1>
<p class="sub">${esc(DB)} on ${esc(SERVER)} · newest first · written by MegaForm's submit-time INSERT</p>
${rows.length
  ? `<table><tr>${header.map((h) => `<th>${esc(h.trim())}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c.trim())}</td>`).join('')}</tr>`).join('') + '</table>'
  : '<p class="empty">No rows yet.</p>'}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(OUT);
console.log(`${rows.length} row(s)`);
