/**
 * Ingest the 181 production form templates from
 *   E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\
 *     DefaultTemplates - Deployed\<category>\*.json
 * into MF_AI_Knowledge as Kind='form_template' so the AI can find them via
 *   list_knowledge(kind='form_template', search='booking')
 * and apply them via replace_form_schema in one shot.
 *
 * Each entry has:
 *   Slug    = template.slug (prefixed with 'tpl-' to avoid clashing with widget-* slugs)
 *   Kind    = 'form_template'
 *   Title   = template.title
 *   Summary = "<description> [Category: X · N fields · multi-page: Y · uses: Row, Section, ...]"
 *   Tags    = CSV: category, derived-industry, multipage:bool, fieldCount:N, types
 *   Body    = slim JSON: settings + fields[] (htmlContent / long options truncated)
 *   Examples = canonical one-line "how to apply" hint
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'E:\\DNNDEFENDER AND AI DESIGNES\\AI DESIGNES\\MEGAFORM TEMPLATES\\DefaultTemplates - Deployed';
const OUT  = path.resolve(__dirname, '../../MegaForm.DNN/SqlScripts/01.06.28e-form-templates.sql');

// ─────────────────────────────────────────────────────────────────────────
//  Walk
// ─────────────────────────────────────────────────────────────────────────
function walk(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, results);
    else if (e.isFile() && e.name.endsWith('.json')) results.push(full);
  }
  return results;
}

const files = walk(ROOT);
console.log('Found', files.length, 'JSON files');

// ─────────────────────────────────────────────────────────────────────────
//  Slim a template — keep schema structure, truncate verbose strings
// ─────────────────────────────────────────────────────────────────────────
function slimField(f) {
  if (!f || typeof f !== 'object') return f;
  const out = { ...f };

  // Truncate long htmlContent / customHtml
  if (typeof out.htmlContent === 'string' && out.htmlContent.length > 200) {
    out.htmlContent = out.htmlContent.slice(0, 180) + '… [truncated ' + out.htmlContent.length + 'ch]';
  }

  // Truncate long options arrays (>12) keep first 6 + last 2
  if (Array.isArray(out.options) && out.options.length > 12) {
    out.options = [...out.options.slice(0, 6), { value:'__ellipsis__', label:'… ' + (out.options.length - 8) + ' more …' }, ...out.options.slice(-2)];
  }

  // Recurse into Row.columns[].fields[]
  if (Array.isArray(out.columns)) {
    out.columns = out.columns.map(col => ({
      ...col,
      fields: Array.isArray(col.fields) ? col.fields.map(slimField) : col.fields,
    }));
  }

  // Drop very heavy widgetProps inner template strings
  if (out.widgetProps && typeof out.widgetProps === 'object') {
    const wp = { ...out.widgetProps };
    for (const k of ['masterTemplate','detailTemplate','wrapperTemplate','rowTemplate','headerTemplate','footerTemplate','pagerTemplate','htmlContent','emptyHtml','customCSS','customHTML']) {
      if (typeof wp[k] === 'string' && wp[k].length > 200) wp[k] = wp[k].slice(0, 180) + '… [truncated]';
    }
    out.widgetProps = wp;
  }

  return out;
}

function slimTemplate(t) {
  return {
    title: t.title,
    description: t.description,
    category: t.category,
    icon: t.icon,
    submitButtonText: t.submitButtonText,
    successMessage: t.successMessage,
    settings: t.settings ? {
      theme: t.settings.theme,
      multiPage: t.settings.multiPage,
      customContent: t.settings.customContent,
    } : undefined,
    fields: Array.isArray(t.fields) ? t.fields.map(slimField) : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────
//  Extract metadata: field types, depth, multi-page
// ─────────────────────────────────────────────────────────────────────────
function collectMeta(fields, acc = { types: new Set(), totalFields: 0, hasRow: false, hasSection: false, hasMultiPage: false, hasSql: false, hasPayment: false }) {
  if (!Array.isArray(fields)) return acc;
  for (const f of fields) {
    if (!f || !f.type) continue;
    acc.types.add(f.type);
    acc.totalFields++;
    if (f.type === 'Row') {
      acc.hasRow = true;
      if (Array.isArray(f.columns)) for (const c of f.columns) collectMeta(c.fields, acc);
    }
    if (f.type === 'Section') {
      acc.hasSection = true;
      if (f.properties && f.properties.pageBreak) acc.hasMultiPage = true;
    }
    if (f.widgetProps && f.widgetProps.masterQuery) acc.hasSql = true;
    if (f.type === 'Payment') acc.hasPayment = true;
  }
  return acc;
}

function deriveIndustry(category, dir) {
  if (!category) {
    const d = path.basename(dir).replace('-forms', '');
    return d || 'general';
  }
  return category.replace('standard-', '').replace(/-/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────
//  Build SQL
// ─────────────────────────────────────────────────────────────────────────
const sqlEsc = s => (s == null ? 'NULL' : `N'${String(s).replace(/'/g, "''")}'`);

const lines = [
  `-- AUTO-GENERATED ${new Date().toISOString()}`,
  `-- Ingestion of 181 production form templates into MF_AI_Knowledge`,
  `-- as Kind='form_template'. AI uses list_knowledge(kind='form_template', search='X')`,
  `-- to find them then replace_form_schema op to apply.`,
  ``,
];

let okCount = 0;
let skipCount = 0;
const used = new Set();  // dedupe slug collisions across folders

for (const fp of files) {
  let raw, t;
  try { raw = fs.readFileSync(fp, 'utf8'); t = JSON.parse(raw); }
  catch (e) { console.warn('SKIP (parse):', fp, e.message); skipCount++; continue; }

  if (!t.slug || !t.title || !Array.isArray(t.fields)) {
    skipCount++;
    continue;
  }

  // Prefix slug to namespace into KB ('tpl-' so it doesn't collide with widget-*).
  let slug = 'tpl-' + String(t.slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 150);
  let suffix = 0;
  while (used.has(slug)) { suffix++; slug = slug.replace(/(-\d+)?$/, '-' + suffix); }
  used.add(slug);

  const meta = collectMeta(t.fields);
  const industry = deriveIndustry(t.category, path.dirname(fp));
  const summaryDesc = String(t.description || '').slice(0, 250);
  const typeSamples = [...meta.types].slice(0, 6).join(', ') || '(none)';
  const summary = `${summaryDesc} [Category: ${t.category || industry} · ${meta.totalFields} fields${meta.hasMultiPage ? ' · multi-page' : ''}${meta.hasSql ? ' · SQL-driven' : ''}${meta.hasPayment ? ' · paid' : ''} · uses: ${typeSamples}]`.slice(0, 480);
  const tags = [
    'form_template',
    t.category || '',
    industry,
    'fields:' + meta.totalFields,
    meta.hasRow ? 'has-row' : '',
    meta.hasMultiPage ? 'multi-page' : '',
    meta.hasSql ? 'sql-driven' : '',
    meta.hasPayment ? 'payment' : '',
    ...[...meta.types].slice(0, 5).map(t => 'type-' + t.toLowerCase()),
  ].filter(Boolean).join(',').slice(0, 480);

  const slim = slimTemplate(t);
  const bodyJson = JSON.stringify(slim);
  if (bodyJson.length > 60000) {
    console.warn('TRUNCATING: ' + slug + ' body=' + bodyJson.length);
  }

  const examples = JSON.stringify([
    { op: 'replace_form_schema', schema: { version: '1.0', fields: slim.fields, settings: slim.settings || {} } },
  ]).slice(0, 30000);  // cap

  lines.push(
    `-- ${slug}`,
    `MERGE dbo.MF_AI_Knowledge AS t`,
    `USING (SELECT ${sqlEsc(slug)} AS Slug, CAST(NULL AS INT) AS PortalId) AS s`,
    `  ON (t.Slug = s.Slug AND t.PortalId IS NULL)`,
    `WHEN MATCHED AND t.Source = 'megaform-builtin' THEN UPDATE SET`,
    `  Kind = N'form_template', Title = ${sqlEsc(t.title)},`,
    `  Summary = ${sqlEsc(summary)}, Body = ${sqlEsc(bodyJson)},`,
    `  Tags = ${sqlEsc(tags)}, Examples = ${sqlEsc(examples)},`,
    `  Version = t.Version + 1, UpdatedOnDate = SYSUTCDATETIME()`,
    `WHEN NOT MATCHED THEN INSERT`,
    `  (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version, CreatedOnDate)`,
    `  VALUES (${sqlEsc(slug)}, N'form_template', ${sqlEsc(t.title)},`,
    `          ${sqlEsc(summary)}, ${sqlEsc(bodyJson)}, ${sqlEsc(tags)}, ${sqlEsc(examples)},`,
    `          NULL, N'megaform-builtin', 1, SYSUTCDATETIME());`,
    `GO`,
    ``,
  );
  okCount++;
}

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('Wrote ' + OUT);
console.log('  OK:   ' + okCount);
console.log('  Skip: ' + skipCount);
console.log('  Size: ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
