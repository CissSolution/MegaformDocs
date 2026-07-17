// CLI: node tools/template-lint/lint.mjs <folder> [--json out.json] [--md out.md]
// Reports shape/duplicate/tokenization status for every template JSON in <folder>.
import fs from 'node:fs';
import path from 'node:path';
import { inspectTemplate } from './lib.mjs';

const args = process.argv.slice(2);
const folder = args[0];
if (!folder) { console.error('usage: node lint.mjs <folder> [--json f] [--md f]'); process.exit(1); }
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const files = fs.readdirSync(folder).filter((f) => f.endsWith('.json')).sort();
const results = [];
for (const f of files) {
  try { results.push(inspectTemplate(path.join(folder, f))); }
  catch (e) { results.push({ file: f, error: String(e.message || e) }); }
}

const lines = [];
lines.push(`# Template lint report — ${folder}`);
lines.push(`Generated: ${new Date().toISOString()} · Files: ${results.length}`);
lines.push('');
lines.push('| File | theme (settings?) | CSS src | CSS KB | hard main | hard tokendef | fonts | prefixes | manifest | issues |');
lines.push('|---|---|---|---:|---:|---:|---:|---|---|---|');
for (const r of results) {
  if (r.error) { lines.push(`| ${r.file} | PARSE ERROR: ${r.error} | | | | | | | | |`); continue; }
  const c = r.css || {};
  lines.push(`| ${r.file} | ${r.theme || '—'}${r.themeInSettings ? '' : ' (top only→DROPPED)'} | ${r.servedCssFrom} | ${(r.cssBytes / 1024).toFixed(1)} | ${c.hardMainValues ?? '—'} | ${c.hardTokenDefs ?? '—'} | ${(c.hardFonts || []).length} | ${(c.prefixes || []).join(' ')} | ${r.manifestVersion ? 'v' + r.manifestVersion + '/' + (r.themeCompatibility?.policy || '?') : '—'} | ${r.issues.join('; ') || 'clean'} |`);
}
lines.push('');
lines.push('## Details (hardcoded main-value declarations, top 15 per file)');
for (const r of results) {
  if (r.error || !r.css) continue;
  const main = r.css.hardDecls.filter((d) => !d.isTokenDef);
  if (!main.length && !r.css.hardFonts.length) continue;
  lines.push(`\n### ${r.file}`);
  for (const d of main.slice(0, 15)) lines.push(`- \`${d.prop}: ${d.value}\` (${d.hits})`);
  if (main.length > 15) lines.push(`- …and ${main.length - 15} more`);
  for (const fdecl of r.css.hardFonts.slice(0, 8)) lines.push(`- FONT \`${fdecl.prop}: ${fdecl.value}\``);
}

const md = lines.join('\n');
const mdOut = flag('--md');
const jsonOut = flag('--json');
if (mdOut) { fs.mkdirSync(path.dirname(mdOut), { recursive: true }); fs.writeFileSync(mdOut, md); }
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1)); }
if (!mdOut && !jsonOut) console.log(md);
else console.log(`Wrote ${mdOut || ''} ${jsonOut || ''} — ${results.length} files, ${results.filter((r) => r.error).length} parse errors`);
