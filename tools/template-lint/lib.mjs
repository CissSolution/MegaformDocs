// Template lint core — parses MegaForm template JSON, detects structural issues
// and analyzes customCss tokenization. Pure Node, no deps.
// Serving rules mirrored from BuilderTemplateCatalogStore.Normalize (case-SENSITIVE
// Newtonsoft indexing): served customHtml/customCss = top-level camelCase ?? settings.
import fs from 'node:fs';
import path from 'node:path';

export const NAMED_COLORS = new Set([
  'white','black','red','green','blue','yellow','orange','purple','pink','gray','grey',
  'silver','gold','navy','teal','maroon','olive','lime','aqua','fuchsia','crimson',
  'indigo','violet','coral','salmon','khaki','ivory','beige','tan','brown','magenta',
  'cyan','lavender','plum','orchid','snow','linen','seashell','honeydew','azure',
  'aliceblue','ghostwhite','whitesmoke','gainsboro','lightgray','lightgrey','darkgray',
  'darkgrey','dimgray','dimgrey','slategray','slategrey','steelblue','royalblue',
  'midnightblue','forestgreen','seagreen','darkgreen','darkred','firebrick','tomato',
  'orangered','goldenrod','rebeccapurple','transparent0'.slice(0, -1),
]);

// Props whose values can carry colors.
const COLOR_PROPS = /^(color|background|background-color|background-image|border|border-color|border-top|border-right|border-bottom|border-left|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule|column-rule-color|--[a-z0-9-]+)$/i;

/** Mask var(--x, fallback) fallbacks (nested-safe) so fallback literals don't count. */
export function maskVarFallbacks(value) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const idx = value.indexOf('var(', i);
    if (idx === -1) { out += value.slice(i); break; }
    out += value.slice(i, idx);
    // find matching close paren
    let depth = 0, j = idx + 4, comma = -1;
    for (; j < value.length; j++) {
      const ch = value[j];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0 && comma === -1) comma = j;
    }
    const inner = value.slice(idx + 4, j);
    if (comma === -1) {
      out += 'var(' + inner + ')';
    } else {
      // keep the referenced var name, mask fallback (recursively — fallback may itself contain var())
      out += 'var(' + value.slice(idx + 4, comma) + ',§MASKED§)';
    }
    i = j + 1;
  }
  return out;
}

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla|oklch|color-mix)\s*\(/g;

/** Split CSS into declarations, skipping comments and @import/keyframe selectors kept as-is. */
export function* declarations(css) {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
  const re = /([{;}])/g;
  let last = 0, m;
  const chunks = [];
  while ((m = re.exec(noComments)) !== null) {
    chunks.push({ text: noComments.slice(last, m.index), sep: m[1], at: last });
    last = m.index + 1;
  }
  chunks.push({ text: noComments.slice(last), sep: '', at: last });
  for (const c of chunks) {
    const t = c.text;
    const colon = t.indexOf(':');
    if (colon <= 0) continue;
    const prop = t.slice(0, colon).trim();
    const value = t.slice(colon + 1).trim();
    if (!prop || /[{}@]/.test(prop) || /\s/.test(prop.replace(/^--/, '').trim()) && !prop.startsWith('--')) continue;
    // heuristic: selectors with pseudo-classes (a:hover) — prop would contain spaces or dots
    if (/[.#>\[\]~+*]/.test(prop)) continue;
    yield { prop, value, offset: c.at };
  }
}

function namedColorHits(masked) {
  let count = 0;
  const re = /\b([a-z]{3,20})\b/gi;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const w = m[1].toLowerCase();
    if (w === 'transparent' || w === 'currentcolor' || w === 'inherit') continue;
    if (NAMED_COLORS.has(w)) count++;
  }
  return count;
}

/** Analyze one CSS text. Returns metrics used by the report + tokenizer. */
export function analyzeCss(css) {
  const defined = new Set();      // custom props DEFINED (--x:)
  const used = new Set();         // custom props read via var(--x)
  const hardDecls = [];           // declarations with hardcoded color main values
  const hardFonts = [];           // font-family not through var()
  let varReads;
  const varRe = /var\(\s*(--[a-zA-Z0-9-_]+)/g;
  let vm;
  while ((vm = varRe.exec(css)) !== null) used.add(vm[1]);

  for (const d of declarations(css)) {
    if (d.prop.startsWith('--')) defined.add(d.prop);
    const masked = maskVarFallbacks(d.value);
    if (/^font(-family)?$/i.test(d.prop)) {
      const m2 = masked.replace(/§MASKED§/g, '');
      if (!/var\(/.test(masked) && !/^(inherit|initial|unset|revert)\s*!?/i.test(d.value.trim())) {
        hardFonts.push({ prop: d.prop, value: d.value.slice(0, 120) });
      }
      continue;
    }
    if (!COLOR_PROPS.test(d.prop)) continue;
    const hexFn = (masked.match(COLOR_RE) || []).length;
    const named = namedColorHits(masked.replace(/§MASKED§/g, ''));
    const hits = hexFn + named;
    if (hits > 0) hardDecls.push({ prop: d.prop, value: d.value.slice(0, 160), hits, isTokenDef: d.prop.startsWith('--') });
  }

  const prefixes = new Set();
  for (const v of [...defined, ...used]) {
    const m3 = /^--([a-zA-Z0-9]+)-/.exec(v);
    if (m3) prefixes.add(m3[1]);
  }
  // vars read but never defined in this css (rely on runtime/env)
  const undeclaredReads = [...used].filter((u) => !defined.has(u));
  return {
    definedCount: defined.size,
    usedCount: used.size,
    defined, used,
    hardDecls, hardFonts,
    prefixes: [...prefixes].sort(),
    undeclaredReads,
    hardTotal: hardDecls.reduce((a, b) => a + b.hits, 0),
    hardMainValues: hardDecls.filter((x) => !x.isTokenDef).reduce((a, b) => a + b.hits, 0),
    hardTokenDefs: hardDecls.filter((x) => x.isTokenDef).reduce((a, b) => a + b.hits, 0),
  };
}

/** Which copy is actually served (mirrors server Normalize, case-sensitive). */
export function servedValue(raw, key) {
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  if (typeof raw[key] === 'string' && raw[key] !== '') return { value: raw[key], from: 'top:' + key };
  if (typeof settings[key] === 'string' && settings[key] !== '') return { value: settings[key], from: 'settings.' + key };
  return { value: '', from: 'none' };
}

export function inspectTemplate(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const issues = [];

  const dualCase = [];
  for (const k of Object.keys(raw)) {
    const lower = k.charAt(0).toLowerCase() + k.slice(1);
    if (k !== lower && Object.prototype.hasOwnProperty.call(raw, lower)) dualCase.push(k);
  }
  if (dualCase.length) issues.push('dual-case top-level keys: ' + dualCase.join(', '));

  const dupes = [];
  for (const k of ['customHtml', 'customCss', 'customScripts', 'customContent']) {
    if (raw[k] != null && settings[k] != null) {
      const a = JSON.stringify(raw[k]).length, b = JSON.stringify(settings[k]).length;
      dupes.push(`${k}: top ${a}B vs settings ${b}B${a !== b ? ' (DIVERGENT)' : ' (identical size)'}`);
    }
  }
  if (dupes.length) issues.push('duplicated top+settings: ' + dupes.join(' | '));

  // keys the server catalog DROPS at top level (not read by Normalize)
  const droppedTop = ['theme', 'themeSelector', 'customScripts', 'customContent']
    .filter((k) => raw[k] != null && settings[k] == null);
  if (droppedTop.length) issues.push('top-level keys DROPPED by catalog (dormant): ' + droppedTop.join(', '));

  const servedCss = servedValue(raw, 'customCss');
  const servedHtml = servedValue(raw, 'customHtml');
  const css = servedCss.value;
  const cssAnalysis = css ? analyzeCss(css) : null;

  const theme = settings.theme != null ? settings.theme : raw.theme;
  return {
    file: path.basename(file),
    slug: raw.slug || '',
    title: raw.title || '',
    theme: theme || '',
    themeInSettings: settings.theme != null,
    manifestVersion: raw.manifestVersion || null,
    themeCompatibility: settings.themeCompatibility || null,
    servedCssFrom: servedCss.from,
    servedHtmlFrom: servedHtml.from,
    cssBytes: css.length,
    htmlBytes: servedHtml.value.length,
    issues,
    css: cssAnalysis,
    premiumFlags: {
      premiumNativePageBreak: !!settings.premiumNativePageBreak,
      premiumGeneratedShell: !!settings.premiumGeneratedShell,
      inheritPageColors: settings.inheritPageColors,
    },
  };
}
