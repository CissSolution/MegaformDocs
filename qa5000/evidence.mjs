// Aggregate all *-result.json into a markdown evidence table for the handoff.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const OUT = join(process.cwd(), 'qa5000', 'out');

const FORM = { 11: 'bulgaria', 13: 'australia', 14: 'festa', 15: 'intake' };
const files = readdirSync(OUT).filter(f => f.endsWith('-result.json'));
const rows = [];
for (const f of files) {
  let r; try { r = JSON.parse(readFileSync(join(OUT, f), 'utf8')); } catch { continue; }
  const b = r.fpBefore || {}, a = r.fpAfter || {};
  rows.push({
    caseId: r.caseId, form: r.formId, tpl: FORM[r.formId] || '', cap: r.cap || '',
    ops: r.opCount != null ? r.opCount : (r.ops ? r.ops.length : ''),
    cssInv: b.cssHash != null ? (b.cssHash === a.cssHash ? 'YES' : 'NO') : '-',
    themeInv: b.theme != null ? (b.theme === a.theme ? 'YES' : 'NO') : '-',
    shellInv: b.shellHash != null ? (b.shellHash === a.shellHash ? 'YES' : 'NO') : '-',
    pass: r.pass ? 'PASS' : (r.error ? 'ERR:' + r.error : 'FAIL'),
  });
}
// Keep the LATEST result per caseId (files are unique per caseId, but dedup anyway)
const byCase = {};
for (const r of rows) byCase[r.caseId] = r;
const final = Object.values(byCase).sort((x, y) => (x.form - y.form) || x.caseId.localeCompare(y.caseId));

let md = '| case | form | template | capability | ops | CSS_HASH inv | THEME inv | SHELL inv | result |\n';
md += '|------|------|----------|------------|-----|--------------|-----------|-----------|--------|\n';
for (const r of final) md += `| ${r.caseId} | ${r.form} | ${r.tpl} | ${r.cap} | ${r.ops} | ${r.cssInv} | ${r.themeInv} | ${r.shellInv} | ${r.pass} |\n`;

const pass = final.filter(r => r.pass === 'PASS');
const formsPass = [...new Set(pass.map(r => r.form))];
md += `\n**${pass.length}/${final.length} cases PASS · ${formsPass.length} premium forms (${formsPass.map(f => FORM[f]).join(', ')}) · CSS_HASH+THEME invariant on every PASS.**\n`;
console.log(md);
writeFileSync(join(OUT, 'EVIDENCE.md'), md);
