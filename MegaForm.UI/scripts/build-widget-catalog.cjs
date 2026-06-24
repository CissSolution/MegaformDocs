/**
 * build-widget-catalog.cjs  (v20260527-05)
 *
 * Build-time generator: scans MegaForm.UI/src/widgets/plugins/*.ts and
 * src/builder/field-plugins/_index.ts to produce
 * src/ai-form-assistant/widget-catalog.gen.ts — a TypeScript module that
 * exports a JSON-serialisable WIDGET_CATALOG describing every MegaForm
 * field/widget the AI assistant should know about.
 *
 * v05 improvements:
 *   • Multi-line meta block parser (label/icon/category may live on separate
 *     lines or concat with BADGE constants).
 *   • Brace-match aware of nested objects in helpHtml & template strings.
 *   • Dedupes duplicate widget registrations (some plugin files register
 *     the same name in multiple places — keep the first non-empty meta).
 *   • Picks up all FieldPlugins.register({...}) entries from _index.ts
 *     (Text/Email/Number/Date/Phone/Select/Radio/Checkbox/File/Url/Rating
 *     /Signature/...) so the AI catalog covers basic fields too.
 *
 * Usage:  node scripts/build-widget-catalog.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'src', 'widgets', 'plugins');
const FIELD_PLUGINS = path.join(ROOT, 'src', 'builder', 'field-plugins', '_index.ts');
const OUT = path.join(ROOT, 'src', 'ai-form-assistant', 'widget-catalog.gen.ts');

function fileText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

/**
 * Brace-match forward from index `start` (must point at '{') with awareness
 * of string literals (single, double, backtick) so braces inside strings
 * don't affect the depth counter. Returns the index AFTER the matching '}',
 * or src.length if unbalanced.
 */
function matchBrace(src, start) {
  if (src[start] !== '{') return start;
  let depth = 0;
  let i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) break;
        i++;
      }
      continue;
    }
    // Block comment
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 1; // skip the '*'; loop ++ skips '/'
      continue;
    }
    // Line comment
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i + 1; }
  }
  return src.length;
}

function findMetaBlock(body) {
  // Locate the first `meta:` key at the top level of the body object.
  const re = /(^|[\s,{;])meta\s*:\s*\{/gm;
  let m;
  while ((m = re.exec(body))) {
    const braceIdx = m.index + m[0].length - 1;
    const end = matchBrace(body, braceIdx);
    return body.substring(braceIdx + 1, end - 1);
  }
  return '';
}

function extractMetaField(metaBody, key) {
  if (!metaBody) return '';
  const re = new RegExp(key + "\\s*:\\s*['\"]([^'\"]+)['\"]");
  const m = metaBody.match(re);
  if (m) return m[1];
  // Try concatenation form:  label: 'Phone Number Pro • ' + BADGE
  const re2 = new RegExp(key + "\\s*:\\s*['\"]([^'\"]+)['\"]\\s*\\+");
  const m2 = metaBody.match(re2);
  if (m2) return m2[1].replace(/[•·-]\s*$/, '').trim();
  return '';
}

function extractRegisterCalls(src) {
  // Look for MegaFormWidgets.register('Name', { ... }) OR W.register('Name', { ... }).
  const out = [];
  const re = /(?:MegaFormWidgets|W)\.register\s*\(\s*['"]([A-Za-z0-9_-]+)['"]\s*,\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const braceIdx = m.index + m[0].length - 1;
    const end = matchBrace(src, braceIdx);
    const body = src.substring(braceIdx + 1, end - 1);
    out.push({ name, body });
  }
  return out;
}

function extractPropertyKeys(body) {
  // Find `properties: [` and brace/bracket-match to its closing `]`.
  const re = /properties\s*:\s*\[/g;
  const m = re.exec(body);
  if (!m) return [];
  // Bracket-match
  let depth = 0;
  let i = m.index + m[0].length - 1;
  let inside = '';
  for (; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < body.length) {
        if (body[i] === '\\') { i += 2; continue; }
        if (body[i] === quote) break;
        i++;
      }
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { inside = body.substring(m.index + m[0].length, i); break; } }
  }
  if (!inside) return [];
  const out = [];
  const itemRe = /\{\s*key\s*:\s*['"]([^'"]+)['"]([\s\S]*?)\}/g;
  let im;
  while ((im = itemRe.exec(inside))) {
    const key = im[1];
    if (key.indexOf('__') === 0) continue;
    const rest = im[2];
    const typeM = rest.match(/type\s*:\s*['"]([^'"]+)['"]/);
    const hasDefault = /default\s*:/.test(rest);
    out.push({ key, type: typeM ? typeM[1] : 'text', hasDefault });
  }
  return out;
}

function extractFieldPlugins(idxSrc) {
  // Match each FieldPlugins.register({ ... });  block.
  const out = [];
  const re = /FieldPlugins\.register\s*\(\s*\{/g;
  let m;
  while ((m = re.exec(idxSrc))) {
    const braceIdx = m.index + m[0].length - 1;
    const end = matchBrace(idxSrc, braceIdx);
    const body = idxSrc.substring(braceIdx + 1, end - 1);
    const type = (body.match(/type\s*:\s*['"]([^'"]+)['"]/) || [, ''])[1];
    if (!type) continue;
    const label = (body.match(/label\s*:\s*['"]([^'"]+)['"]/) || [, ''])[1];
    const icon = (body.match(/icon\s*:\s*['"]([^'"]+)['"]/) || [, ''])[1];
    const category = (body.match(/category\s*:\s*['"]([^'"]+)['"]/) || [, ''])[1] || 'basic';
    const hasOptions = /hasOptions\s*:\s*true/.test(body);
    out.push({ type, label, icon, category, hasOptions });
  }
  return out;
}

function buildCatalog() {
  const entries = [];
  const seen = new Map(); // type → entry index

  // 1. Field plugins (basic + advanced field types)
  const idxSrc = fileText(FIELD_PLUGINS);
  const fields = extractFieldPlugins(idxSrc);
  fields.forEach((ft) => {
    if (seen.has(ft.type)) return;
    const entry = {
      type: ft.type,
      label: ft.label || ft.type,
      icon: ft.icon || '',
      category: ft.category || 'basic',
      kind: 'field',
      properties: [],
      notes: ft.hasOptions ? 'Supports options[] (label/value) for static or SQL-source dropdowns.' : '',
    };
    seen.set(ft.type, entries.length);
    entries.push(entry);
  });

  // 2. Widget plugins (advanced widgets with widgetProps)
  const pluginFiles = fs.readdirSync(PLUGIN_DIR).filter((f) => f.endsWith('.ts'));
  pluginFiles.forEach((f) => {
    const src = fileText(path.join(PLUGIN_DIR, f));
    const widgets = extractRegisterCalls(src);
    widgets.forEach((w) => {
      const metaBody = findMetaBlock(w.body);
      const label = extractMetaField(metaBody, 'label') || w.name;
      const icon = extractMetaField(metaBody, 'icon');
      const category = extractMetaField(metaBody, 'category') || 'advanced';
      const props = extractPropertyKeys(w.body);

      if (seen.has(w.name)) {
        // Merge: keep first registration but enrich properties / label if missing.
        const idx = seen.get(w.name);
        if (!entries[idx].properties.length && props.length) entries[idx].properties = props;
        if (entries[idx].kind === 'field') {
          entries[idx].kind = 'widget';
          entries[idx].sourceFile = 'src/widgets/plugins/' + f;
        }
        if (!entries[idx].label) entries[idx].label = label;
        return;
      }
      seen.set(w.name, entries.length);
      entries.push({
        type: w.name,
        label,
        icon,
        category,
        kind: 'widget',
        properties: props,
        sourceFile: 'src/widgets/plugins/' + f,
      });
    });
  });

  return entries;
}

function emit(catalog) {
  const banner =
    '/**\n' +
    ' * widget-catalog.gen.ts — AUTO-GENERATED by scripts/build-widget-catalog.cjs (v20260527-05).\n' +
    ' * Do not edit by hand. Regenerate via:\n' +
    ' *   node scripts/build-widget-catalog.cjs\n' +
    ' * Total entries: ' + catalog.length + '\n' +
    ' */\n\n' +
    'export interface CatalogEntryProp { key: string; type: string; hasDefault: boolean; }\n' +
    "export interface CatalogEntry { type: string; label: string; icon: string; category: string; kind: 'field' | 'widget'; properties: CatalogEntryProp[]; notes?: string; sourceFile?: string; }\n\n" +
    'export const WIDGET_CATALOG: CatalogEntry[] = ';
  const body = JSON.stringify(catalog, null, 2);
  const footer =
    ';\n\n' +
    'export function summarizeCatalogForSystemPrompt(): string {\n' +
    '  return WIDGET_CATALOG.map((e) => {\n' +
    "    const propList = e.properties && e.properties.length\n" +
    "      ? '\\n  Properties: ' + e.properties.map((p) => p.key + '(' + p.type + ')').join(', ')\n" +
    "      : '';\n" +
    "    const noteSuffix = e.notes ? '\\n  Note: ' + e.notes : '';\n" +
    "    return '- ' + e.type + ' (' + e.kind + ', ' + e.category + '): ' + e.label + propList + noteSuffix;\n" +
    "  }).join('\\n');\n" +
    '}\n';
  fs.writeFileSync(OUT, banner + body + footer, 'utf8');
}

function main() {
  const catalog = buildCatalog();
  emit(catalog);
  // eslint-disable-next-line no-console
  console.log('[widget-catalog] wrote ' + catalog.length + ' entries -> ' + path.relative(ROOT, OUT));
}

main();
