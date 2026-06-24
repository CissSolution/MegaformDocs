/**
 * Export the live DNN MF_AI_Knowledge / MF_AI_KB_Templates / MF_AI_KB_Rules
 * tables (Source='megaform-builtin' only) to a single JSON file that the
 * Oqtane seeder reads on first run when its tables are empty.
 *
 * Run:  node scripts/export-kb-seed.cjs
 * Output: MegaForm.Core/Seed/ai-knowledge-seed.json
 *
 * The Oqtane runtime extracts this file from the embedded resource on
 * first launch and imports it. Customer-edited entries are NOT exported
 * (Source != 'megaform-builtin') so each customer's Oqtane install gets
 * the same canonical baseline as DNN.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OUT = path.resolve(__dirname, '../../MegaForm.Core/Seed/ai-knowledge-seed.json');
const SQL_SERVER = 'WINDOWS-11\\SQLEXPRESS';
const DB = 'DNN10322_MegaF';

function sqlcmdJson(query) {
  // -y 0 / -Y 0 = no truncation (huge body fields). Avoid -W (conflicts).
  // Write the SQL to a temp file so multiline queries survive shell escaping.
  const tmpFile = path.join(require('os').tmpdir(), 'mf-kb-export-' + Date.now() + '.sql');
  const wrapped = `SET NOCOUNT ON;\n${query}\nFOR JSON PATH, INCLUDE_NULL_VALUES, ROOT('rows')`;
  fs.writeFileSync(tmpFile, wrapped, 'utf8');
  try {
    // -w 65535 forces sqlcmd to print very wide lines instead of wrapping at 256
    // chars (which would split JSON strings). -y/Y 0 keeps every char.
    const out = execSync(`sqlcmd -S "${SQL_SERVER}" -d "${DB}" -E -y 0 -Y 0 -w 65535 -i "${tmpFile}"`, { encoding: 'utf8', maxBuffer: 200 * 1024 * 1024 });
    // sqlcmd JSON output is one logical row per output line — concatenate everything
    // that isn't the "(N rows affected)" footer. Note: even with -w 65535, sqlcmd
    // may split on row boundaries — that's fine because we strip newlines/trailing
    // whitespace before reassembling.
    const trimmed = out.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.length > 0 && !/^\(\d+ rows? affected\)/.test(l)).join('');
    if (!trimmed) return [];
    return JSON.parse(trimmed).rows || [];
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

console.log('Exporting Knowledge entries (Source=megaform-builtin)…');
const entries = sqlcmdJson(`
  SELECT Id, Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version
  FROM MF_AI_Knowledge WHERE Source = 'megaform-builtin' ORDER BY Id
`);
console.log('  ' + entries.length + ' entries');

console.log('Exporting Templates (Source=megaform-builtin)…');
const templates = sqlcmdJson(`
  SELECT t.Id, k.Slug AS KnowledgeSlug, t.TemplateKey, t.Kind, t.Title, t.Summary, t.Body, t.Tags, t.Score, t.SortOrder, t.PortalId, t.Source, t.Version
  FROM MF_AI_KB_Templates t JOIN MF_AI_Knowledge k ON k.Id = t.KnowledgeId
  WHERE t.Source = 'megaform-builtin' ORDER BY t.Id
`);
console.log('  ' + templates.length + ' templates');

console.log('Exporting Rules (Source=megaform-builtin)…');
const rules = sqlcmdJson(`
  SELECT r.RuleId, k.Slug AS KnowledgeSlug, r.WidgetType, r.Title, r.Severity, r.Condition, r.RegexPattern, r.RejectionMessage, r.FixHint, r.Source, r.Version, r.Enabled, r.PortalId
  FROM MF_AI_KB_Rules r LEFT JOIN MF_AI_Knowledge k ON k.Id = r.KnowledgeId
  WHERE r.Source = 'megaform-builtin' ORDER BY r.RuleId
`);
console.log('  ' + rules.length + ' rules');

const payload = {
  exportedOnUtc: new Date().toISOString(),
  schemaVersion: 1,
  entries,
  templates,
  rules,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
console.log('Wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB)');
