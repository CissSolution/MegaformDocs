import {
  parseWizardStructure,
  reflowWizardFieldTokensBySchemaPages,
  replaceHardcodedControlsWithFieldTokens,
  syncFieldPlaceholders,
} from './custom-html-insert';

const BADGE = 'PremiumNativePageBreak v20260628';

function isObj(value: any): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function setting(settings: any, camel: string, pascal: string): any {
  return settings && settings[camel] != null ? settings[camel] : (settings ? settings[pascal] : undefined);
}

function setSetting(settings: any, camel: string, pascal: string, value: any): void {
  settings[camel] = value;
  settings[pascal] = value;
}

function fieldKey(field: any): string {
  return String(field?.key ?? field?.Key ?? '').trim();
}

function fieldType(field: any): string {
  return String(field?.type ?? field?.Type ?? '').trim();
}

function fieldProps(field: any): any {
  if (!field.properties && field.Properties) field.properties = field.Properties;
  if (!field.properties || typeof field.properties !== 'object') field.properties = {};
  field.Properties = field.properties;
  return field.properties;
}

function normalizeHtml(settings: any, schema: any): string {
  const html = String(setting(settings, 'customHtml', 'CustomHtml') ?? schema?.customHtml ?? schema?.CustomHtml ?? '');
  setSetting(settings, 'customHtml', 'CustomHtml', html);
  return html;
}

function normalizeCss(settings: any, schema: any): string {
  const css = String(setting(settings, 'customCss', 'CustomCss') ?? schema?.customCss ?? schema?.CustomCss ?? '');
  setSetting(settings, 'customCss', 'CustomCss', css);
  return css;
}

function normalizeScripts(settings: any, schema: any): Record<string, any> {
  const scripts = setting(settings, 'customScripts', 'CustomScripts') || schema?.customScripts || schema?.CustomScripts || {};
  const out = isObj(scripts) ? scripts : {};
  setSetting(settings, 'customScripts', 'CustomScripts', out);
  // [dedup 20260630] settings.customScripts is the single source (renderer + resolver read it via
  // JsonProperty/camel-first; resolver promotes schema-root → settings ONLY when settings is absent).
  // Do NOT mirror onto the schema ROOT — it triples the stored blob (root camel + root Pascal +
  // settings) for zero render benefit. See migratePremiumWizardSchemaToNative for the same rule.
  return out;
}

function hasPageBreak(fields: any[]): boolean {
  return (fields || []).some(f => fieldType(f) === 'Section' && !!(f.properties?.pageBreak ?? f.Properties?.PageBreak));
}

function isGeneratedSection(field: any): boolean {
  if (fieldType(field) !== 'Section') return false;
  const props = fieldProps(field);
  const key = fieldKey(field);
  return props.premiumNativeStep === true || props.generatedPremiumStep === true || /^premium_step_\d+$/i.test(key);
}

function uniqueKey(base: string, used: Set<string>): string {
  let clean = String(base || 'premium_step').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'premium_step';
  let key = clean;
  let i = 2;
  while (used.has(key)) key = clean + '_' + (i++);
  used.add(key);
  return key;
}

function addNativeClass(html: string): string {
  if (/\bmfp-native-generated\b/.test(html)) return html;
  return html.replace(/(<[a-z0-9]+[^>]*\bclass\s*=\s*["'])([^"']*\bmfp\b[^"']*)(["'][^>]*>)/i, (_m, a, cls, b) => {
    return a + String(cls).trim() + ' mfp-native-generated' + b;
  });
}

function removeScriptTokens(html: string): { html: string; keys: string[] } {
  const keys: string[] = [];
  const next = String(html || '').replace(/\{\{script:([a-zA-Z0-9_-]+)\}\}/g, (_m, key) => {
    keys.push(String(key));
    return '';
  });
  return { html: next, keys };
}

function removeScriptEntries(scripts: Record<string, any>, keys: string[]): void {
  keys.forEach(key => {
    delete scripts[key];
    delete scripts[key.charAt(0).toUpperCase() + key.slice(1)];
  });
}

function buildNativeFieldOrder(fields: any[], html: string): any[] {
  const base = (fields || []).filter(f => !isGeneratedSection(f));
  const byKey = new Map<string, any>();
  base.forEach(f => { const key = fieldKey(f); if (key) byKey.set(key, f); });

  const structure = parseWizardStructure(html);
  if (!structure.isWizard || !structure.steps.length) return base;

  const used = new Set<string>();
  byKey.forEach((_v, k) => used.add(k));
  const consumed = new Set<string>();
  const out: any[] = [];

  structure.steps.forEach((step, index) => {
    const sectionKey = uniqueKey('premium_step_' + (index + 1), used);
    out.push({
      key: sectionKey,
      Key: sectionKey,
      type: 'Section',
      Type: 'Section',
      label: step.stepLabel || step.title || step.eyebrow || ('Step ' + (index + 1)),
      Label: step.stepLabel || step.title || step.eyebrow || ('Step ' + (index + 1)),
      required: false,
      Required: false,
      properties: {
        pageBreak: index > 0,
        premiumNativeStep: true,
        generatedPremiumStep: true,
        premiumStepIndex: index + 1,
        legacyDataStep: step.step,
      },
      Properties: {
        pageBreak: index > 0,
        premiumNativeStep: true,
        generatedPremiumStep: true,
        premiumStepIndex: index + 1,
        legacyDataStep: step.step,
      },
    });
    step.fieldKeys.forEach(key => {
      const f = byKey.get(key);
      if (!f || consumed.has(key)) return;
      consumed.add(key);
      out.push(f);
    });
  });

  base.forEach(f => {
    const key = fieldKey(f);
    if (!key || consumed.has(key)) return;
    out.push(f);
  });

  return out;
}

function markNative(settings: any): void {
  setSetting(settings, 'premiumNativePageBreak', 'PremiumNativePageBreak', true);
  setSetting(settings, 'premiumGeneratedShell', 'PremiumGeneratedShell', true);
  setSetting(settings, 'premiumNativeMigrationBadge', 'PremiumNativeMigrationBadge', BADGE);
  setSetting(settings, 'multiPage', 'MultiPage', true);
  if (settings.inheritPageColors === true || settings.InheritPageColors === true) {
    setSetting(settings, 'inheritPageColors', 'InheritPageColors', false);
  }
  if (settings.showProgressBar == null && settings.ShowProgressBar == null) {
    setSetting(settings, 'showProgressBar', 'ShowProgressBar', true);
  }
}

export function isPremiumNativeSchema(schema: any): boolean {
  const settings = schema?.settings || schema?.Settings || {};
  return setting(settings, 'premiumNativePageBreak', 'PremiumNativePageBreak') === true;
}

export function syncPremiumNativeShellToSchema(schema: any): boolean {
  if (!schema) return false;
  const settings = schema.settings || schema.Settings || (schema.settings = {});
  let html = normalizeHtml(settings, schema);
  if (!html || !isPremiumNativeSchema(schema)) return false;
  const before = html;
  const fields = Array.isArray(schema.fields) ? schema.fields : (Array.isArray(schema.Fields) ? schema.Fields : []);
  html = replaceHardcodedControlsWithFieldTokens(html, fields.filter((f: any) => !isGeneratedSection(f)));
  html = syncFieldPlaceholders(html, fields.filter((f: any) => !isGeneratedSection(f)));
  const synced = reflowWizardFieldTokensBySchemaPages(html, fields);
  if (synced !== before) {
    setSetting(settings, 'customHtml', 'CustomHtml', synced);
    return true;
  }
  return false;
}

export function migratePremiumWizardSchemaToNative(schema: any): { migrated: boolean; badge: string } {
  if (!schema || typeof schema !== 'object') return { migrated: false, badge: BADGE };
  const settings = schema.settings || schema.Settings || (schema.settings = {});
  schema.settings = settings;
  schema.Settings = settings;
  // [Premium FlexGrid v20260630/07-01] An already-gridded premium shell is FINAL for its token layout:
  // the {{field:KEY}} tokens live INSIDE .mf-flexgrid-item wrappers, so we must NOT run the reflow/
  // syncFieldPlaceholders steps below (they'd yank tokens OUT of the wrappers → empty cells + orphans).
  // BUT we MUST still markNative() when the schema has page-break Sections: premiumNativePageBreak is a
  // RUNTIME flag re-derived here on every render (it is NOT persisted — the resolver strips it), so
  // skipping markNative left flexgrid-converted premium forms NON-native → the shell engine went inert
  // → generic + premium nav BOTH showed (double buttons) and the shell's Next/Back didn't drive steps.
  // markNative only sets flags — no token surgery — so it is safe on a gridded shell.
  const gridHtml = String(setting(settings, 'customHtml', 'CustomHtml') ?? schema?.customHtml ?? schema?.CustomHtml ?? '');
  if (/data-mf-flexgrid/.test(gridHtml)) {
    const gridFields = Array.isArray(schema.fields) ? schema.fields : (Array.isArray(schema.Fields) ? schema.Fields : []);
    if (hasPageBreak(gridFields)) markNative(settings);
    return { migrated: false, badge: BADGE };
  }
  const fields = Array.isArray(schema.fields) ? schema.fields : (Array.isArray(schema.Fields) ? clone(schema.Fields) : []);
  schema.fields = fields;
  schema.Fields = fields;

  const originalHtml = String(setting(settings, 'customHtml', 'CustomHtml') ?? schema?.customHtml ?? schema?.CustomHtml ?? '');
  let html = normalizeHtml(settings, schema);
  normalizeCss(settings, schema);
  const scripts = normalizeScripts(settings, schema);
  const beforeHardcodedControlUpgrade = html;
  html = replaceHardcodedControlsWithFieldTokens(html, fields.filter((f: any) => !isGeneratedSection(f)));
  const hardcodedControlUpgrade = html !== beforeHardcodedControlUpgrade;

  if (!html || !/\bdata-step\s*=/.test(html)) {
    syncPremiumNativeShellToSchema(schema);
    return { migrated: false, badge: BADGE };
  }

  const structure = parseWizardStructure(html);
  if (!structure.isWizard || !structure.steps.length) {
    syncPremiumNativeShellToSchema(schema);
    return { migrated: false, badge: BADGE };
  }

  const alreadyNative = isPremiumNativeSchema(schema) || hasPageBreak(fields);
  html = syncFieldPlaceholders(html, fields.filter((f: any) => !isGeneratedSection(f)));
  const removed = removeScriptTokens(html);
  html = addNativeClass(removed.html);
  removeScriptEntries(scripts, removed.keys);
  setSetting(settings, 'customScripts', 'CustomScripts', scripts);
  setSetting(settings, 'customHtml', 'CustomHtml', html);

  if (!alreadyNative || hardcodedControlUpgrade) {
    schema.fields = buildNativeFieldOrder(fields, html);
    schema.Fields = schema.fields;
  }
  markNative(settings);
  html = syncFieldPlaceholders(html, (schema.fields || []).filter((f: any) => !isGeneratedSection(f)));
  html = reflowWizardFieldTokensBySchemaPages(html, schema.fields || []);
  setSetting(settings, 'customHtml', 'CustomHtml', html);
  // [dedup 20260630] No schema-ROOT customHtml/CustomHtml mirror (was 3× storage of the shell blob).
  // settings.customHtml is authoritative; theme-designer reads settings first then falls back to it.
  return { migrated: !alreadyNative || removed.keys.length > 0 || html !== originalHtml, badge: BADGE };
}

export const PREMIUM_NATIVE_PAGEBREAK_BADGE = BADGE;
