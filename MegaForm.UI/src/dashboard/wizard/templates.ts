// [2026-06-27 ②] Real template library for the wizard Setup step. Loads
// GET /api/MegaForm/BuilderTemplates/List (the same catalog the builder gallery uses)
// instead of only the hardcoded mini field-sets.
//
// Two kinds of records:
//   • STANDARD (no settings.customHtml) → hydrated into the wizard's editable field list
//     (mapped to the simple WizardField model); emitted via the normal transform path.
//   • PREMIUM  (custom-shell: settings.customHtml present) → keep styling/scripts, while
//     step labels/headings and field membership are editable before Create.
import { getPlatformHostConfig } from '@shared/platform-host';
import { migratePremiumWizardSchemaToNative } from '@shared/premium-native-migration';
import { wizardCtx } from './save';
import { WizardField } from './types';

export interface WizardTemplate {
  id: string; slug: string; title: string; description: string;
  category: string; icon: string; isPremium: boolean; fieldCount: number;
  fields: any[]; settings: any; submitButtonText: string; successMessage: string;
}

let _cache: { status: 'idle' | 'loading' | 'ok' | 'error'; list: WizardTemplate[] } = { status: 'idle', list: [] };
let _promise: Promise<typeof _cache> | null = null;

function pick(o: any, ...k: string[]): any { if (o == null) return undefined; for (const x of k) if (o[x] != null) return o[x]; return undefined; }

function listUrl(): string {
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const base = cfg.apiBase || '/api/MegaForm/';
  let url = base + 'BuilderTemplates/List';
  const ctx = wizardCtx();
  if (platform === 'oqtane') {
    const qs: string[] = [];
    if (ctx.moduleId > 0) qs.push('authmoduleid=' + ctx.moduleId);
    if (ctx.siteId > 0) qs.push('authsiteid=' + ctx.siteId);
    if (qs.length) url += '?' + qs.join('&');
  } else if (platform === 'dnn') {
    url += '?portalId=' + (Number(cfg.portalId != null ? cfg.portalId : 0) || 0);
  }
  return url;
}

function listHeaders(): Record<string, string> {
  // Mirrors save.ts / principals.ts auth (the wizard's POST already authenticates this way).
  const cfg: any = getPlatformHostConfig() || {};
  const platform = String(cfg.platform || '').toLowerCase();
  const h: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  if (platform === 'oqtane') {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) h['Authorization'] = 'Bearer ' + bearer;
    const ctx = wizardCtx();
    if (ctx.moduleId > 0) h['X-OQTANE-MODULEID'] = String(ctx.moduleId);
    if (ctx.siteId > 0) h['X-OQTANE-SITEID'] = String(ctx.siteId);
    if (Number(cfg.aliasId || 0) > 0) h['X-OQTANE-ALIASID'] = String(cfg.aliasId);
  } else if (platform === 'dnn') {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.(cfg.instanceId || cfg.moduleId || 0);
      if (sf) h['RequestVerificationToken'] = sf.getAntiForgeryValue();
    } catch { /* */ }
  }
  return h;
}

// Normalize settings (PascalCase + camelCase), keep the custom-shell blob intact.
function normalizeSettings(raw: any): any {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = JSON.parse(JSON.stringify(s));
  const html = out.customHtml != null ? out.customHtml : out.CustomHtml;
  const css = out.customCss != null ? out.customCss : out.CustomCss;
  out.customHtml = typeof html === 'string' ? html : '';
  out.customCss = typeof css === 'string' ? css : '';
  const content = out.customContent != null ? out.customContent : out.CustomContent;
  out.customContent = (content && typeof content === 'object' && !Array.isArray(content)) ? content : {};
  const scripts = out.customScripts != null ? out.customScripts : out.CustomScripts;
  out.customScripts = (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) ? scripts : {};
  if (Array.isArray(out.theme)) out.theme = out.theme.length ? String(out.theme[0] || '') : '';
  out.multiPage = !!out.multiPage;
  return out;
}

function normalizeRecord(raw: any): WizardTemplate {
  const settings = normalizeSettings(pick(raw, 'settings', 'Settings') || {});
  let fields = pick(raw, 'fields', 'Fields');
  fields = Array.isArray(fields) ? fields : [];
  const schema = { version: '1.0', fields: JSON.parse(JSON.stringify(fields)), settings };
  migratePremiumWizardSchemaToNative(schema);
  fields = schema.fields || fields;
  return {
    id: String(pick(raw, 'id', 'Id') || ''),
    slug: String(pick(raw, 'slug', 'Slug') || ''),
    title: String(pick(raw, 'title', 'Title') || 'Template'),
    description: String(pick(raw, 'description', 'Description') || ''),
    category: String(pick(raw, 'category', 'Category') || 'general'),
    icon: String(pick(raw, 'icon', 'Icon') || ''),
    isPremium: !!settings.customHtml,
    fieldCount: fields.length,
    fields,
    settings,
    submitButtonText: String(pick(raw, 'submitButtonText', 'SubmitButtonText') || 'Submit'),
    successMessage: String(pick(raw, 'successMessage', 'SuccessMessage') || ''),
  };
}

export function loadTemplates(onReady?: () => void): Promise<typeof _cache> {
  if (_cache.status === 'ok' || _cache.status === 'error') { if (onReady) onReady(); return Promise.resolve(_cache); }
  if (_promise) { if (onReady) _promise.then(onReady, onReady); return _promise; }
  _cache = { status: 'loading', list: [] };
  _promise = fetch(listUrl(), { method: 'GET', credentials: 'same-origin', headers: listHeaders() })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => { const arr = Array.isArray(j) ? j : []; _cache = { status: 'ok', list: arr.map(normalizeRecord).filter((t) => !!t.id) }; return _cache; })
    .catch(() => { _cache = { status: 'error', list: [] }; return _cache; });
  if (onReady) _promise.then(onReady, onReady);
  return _promise;
}

export function templatesState() { return _cache; }
export function findTemplate(id: string): WizardTemplate | null { return _cache.list.find((t) => t.id === id) || null; }
export function resetTemplates() { _cache = { status: 'idle', list: [] }; _promise = null; }

// [ImportJson 2026-07-01] Build a WizardTemplate from an uploaded MegaForm export .json.
// Accepts the BuilderTemplates record shape, a { schemaJson, settingsJson } form export,
// or a raw { fields, settings } schema. Returns null when no usable fields are present.
//
// ⭐The DEPLOYED default templates put customHtml/customCss/customContent/customScripts
// (+ theme/multiPage) at the TOP LEVEL, not inside `settings`. Without merging them the
// premium shell was dropped → the form imported as a plain standard form (design lost).
function mergeTopLevelSettings(raw: any): any {
  const s = (raw && raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings)) ? JSON.parse(JSON.stringify(raw.settings)) : {};
  for (const k of ['customHtml', 'customCss', 'customContent', 'customScripts', 'theme', 'multiPage', 'themeSelector', 'submitButtonText', 'successMessage']) {
    const cap = k.charAt(0).toUpperCase() + k.slice(1);
    const topV = raw[k] !== undefined ? raw[k] : raw[cap];
    const cur = s[k] !== undefined ? s[k] : s[cap];
    const curEmpty = cur === undefined || cur === null || cur === '';
    if (topV !== undefined && topV !== null && topV !== '' && curEmpty) s[k] = topV;
  }
  return s;
}
export function wizardTemplateFromJson(raw: any): WizardTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  let rec: any = { ...raw, settings: mergeTopLevelSettings(raw) };
  const sj = raw.schemaJson != null ? raw.schemaJson : raw.SchemaJson;
  const stj = raw.settingsJson != null ? raw.settingsJson : raw.SettingsJson;
  if (typeof sj === 'string') {
    try {
      const schema = JSON.parse(sj || '{}');
      const settings = typeof stj === 'string' ? JSON.parse(stj || '{}') : (schema.settings || schema.Settings || {});
      rec = { title: pick(raw, 'name', 'Name', 'title', 'Title') || pick(schema, 'title', 'Title'), fields: schema.fields || schema.Fields || [], settings, category: pick(raw, 'category', 'Category'), submitButtonText: pick(raw, 'submitButtonText', 'SubmitButtonText'), successMessage: pick(raw, 'successMessage', 'SuccessMessage') };
    } catch { return null; }
  } else if ((raw.version || raw.Version) && (raw.fields || raw.Fields) && !(raw.id || raw.Id)) {
    // raw schema blob { version, fields, settings, customHtml@top, … }
    rec = { title: pick(raw, 'title', 'Title', 'name', 'Name'), fields: raw.fields || raw.Fields || [], settings: mergeTopLevelSettings(raw), category: pick(raw, 'category', 'Category'), icon: pick(raw, 'icon', 'Icon'), submitButtonText: pick(raw, 'submitButtonText', 'SubmitButtonText'), successMessage: pick(raw, 'successMessage', 'SuccessMessage') };
  }
  const t = normalizeRecord(rec);
  if (!t.fields || !t.fields.length) return null;
  if (!t.id) t.id = 'import-' + Date.now();
  if (!t.title) t.title = 'Imported form';
  return t;
}

// ── Standard-template hydration → editable wizard fields ──────────────────────
const MEGA_TO_WIZARD: Record<string, string> = {
  Text: 'text', Textarea: 'textarea', Email: 'email', Phone: 'phone', Number: 'number',
  Select: 'dropdown', MultiSelect: 'dropdown', Radio: 'dropdown', Checkbox: 'checkbox',
  Date: 'date', Rating: 'rating', Row: 'fullname',
};

let _hid = 5000;
const hid = () => 'tpl-' + (++_hid);

/** Map a standard template's MegaForm fields to the simple editable WizardField list.
 *  Layout/Section fields are skipped (the wizard's Fields step manages steps separately). */
export function hydrateStandardFields(t: WizardTemplate): WizardField[] {
  const out: WizardField[] = [];
  for (const f of (t.fields || [])) {
    const type = String(f && f.type || '');
    if (!type || type === 'Section' || type === 'Html' || type === 'Hidden' || type === 'FlexGrid') continue;
    out.push({ id: hid(), type: MEGA_TO_WIZARD[type] || 'text', label: String(f.label || type), required: !!f.required });
  }
  return out;
}
