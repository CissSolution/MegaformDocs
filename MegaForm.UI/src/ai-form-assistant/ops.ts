/**
 * MegaForm AI Form Assistant — operations dispatcher.
 *
 * AI returns a JSON array of ops. dispatchOps() walks the array, applies each
 * op to the builder state (window.MegaFormBuilder + B.state.form.schema.fields),
 * then triggers canvas re-render. Ops are MegaForm-specific (no HtmlText
 * replacement like the source ACME Block Builder uses).
 *
 * Supported ops (v1):
 *   - add_field(type, key, label, props?, widgetProps?)
 *   - set_field_property(key, propPath, value)        // dot path e.g. "validation.minLength"
 *   - set_field_sql(key, masterQuery, mode?, templates?, queryDependsOn?)
 *   - apply_dynlabel_preset(fieldKey, presetIndex|presetLabel)
 *   - remove_field(key)
 *   - reorder_fields(orderedKeys)
 *   - set_form_meta({title?, description?, submitButtonText?, successMessage?})
 *   - apply_template(slug)     // pulls from BuilderTemplates/List
 *   - save_form()              // triggers the existing Save button programmatically
 *   - chat_message(text)       // assistant explains what it did
 */

import { logFeedback, pickRuleId } from './feedback-log';

// [v20260601-B27] Platform-aware Subform endpoint resolver.
// DNN:    /DesktopModules/MegaForm/API/Subform/<path>
// Oqtane: /api/MegaFormPopup/Subform/<path>  (NOT /api/MegaForm/Subform — that 404s)
function subformUrl(path: string, qs?: Record<string, string | number>): string {
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  const isOqtane = String(pf.platform || '').toLowerCase() === 'oqtane';
  const base = isOqtane
    ? '/api/MegaFormPopup/Subform/'
    : (String(w.__MF_API_BASE__ || pf.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/') + 'Subform/');
  const portalId = isOqtane ? 0 : (pf.portalId || 0);
  const params: Record<string, string> = {};
  if (qs) for (const k of Object.keys(qs)) params[k] = String(qs[k]);
  if (portalId && !('portalId' in params)) params.portalId = String(portalId);
  const search = Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return base + path + (search ? '?' + search : '');
}

export interface Op {
  op: string;
  [k: string]: any;
}

export interface OpResult {
  op: string;
  ok: boolean;
  message?: string;
  detail?: any;
}

const OPS_BADGE = 'MfAiOps v20260622-01';

// ─────────────────────────────────────────────────────────────────────────
// Template-guide enforcement (client-side hard guard).
// chat.ts fetches the guide and stores the parsed frontmatter on
// window.__mfai_session.templateGuide so this synchronous dispatcher can
// enforce immutable/mutable rules without a network round-trip.
// ─────────────────────────────────────────────────────────────────────────
function getActiveTemplateGuide(): any {
  try {
    const w = window as any;
    const session = w.__mfai_session;
    if (!session || !session.templateGuide) return null;
    const B = w.MegaFormBuilder;
    const settings = B?.state?.schema?.settings || B?.state?.schema?.Settings || {};
    const currentSlug = String(settings.templateGuideSlug || settings.TemplateGuideSlug || '').trim();
    if (currentSlug && session.templateGuideSlug !== currentSlug) return null;
    return session.templateGuide;
  } catch { return null; }
}

function guideLockedKeys(guide: any): string[] {
  if (!guide || typeof guide !== 'object') return [];
  const locked = new Set<string>();
  const map = guide.fieldLayoutMap;
  if (map) {
    if (Array.isArray(map.lockedKeys)) map.lockedKeys.forEach((k: string) => locked.add(String(k)));
    if (Array.isArray(map.requiredKeys)) map.requiredKeys.forEach((k: string) => locked.add(String(k)));
  }
  const contract = guide.designContract;
  if (contract && Array.isArray(contract.panels)) {
    contract.panels.forEach((p: any) => {
      if (Array.isArray(p.fields)) p.fields.forEach((k: string) => locked.add(String(k)));
    });
  }
  return Array.from(locked);
}

function guideForbiddenTypes(guide: any): string[] {
  if (!guide || typeof guide !== 'object') return [];
  const policy = guide.compositeWidgetPolicy || {};
  return Array.isArray(policy.forbiddenFieldTypes)
    ? policy.forbiddenFieldTypes.map((t: string) => String(t).toLowerCase())
    : [];
}

function guideImmutableDesign(guide: any): { customHtml: boolean; customCss: boolean; theme: boolean; scripts: boolean } {
  const out = { customHtml: false, customCss: false, theme: false, scripts: false };
  if (!guide || !Array.isArray(guide.immutableRules)) return out;
  const text = guide.immutableRules.join(' ').toLowerCase();
  if (text.indexOf('customhtml') >= 0 || text.indexOf('custom html') >= 0) out.customHtml = true;
  if (text.indexOf('customcss') >= 0 || text.indexOf('custom css') >= 0) out.customCss = true;
  if (text.indexOf('theme') >= 0) out.theme = true;
  if (text.indexOf('customscripts') >= 0 || text.indexOf('custom scripts') >= 0) out.scripts = true;
  return out;
}

function guideDefaultAppendPanel(guide: any): string | null {
  if (!guide || typeof guide !== 'object') return null;
  const map = guide.fieldLayoutMap;
  return map && typeof map.defaultAppendPanel === 'string' ? map.defaultAppendPanel : null;
}

/**
 * [v20260530-13] Allowlist of image hosts the renderer trusts. The AI
 * hallucinates URLs constantly — this allowlist is the dispatcher's
 * defense against rendering a broken <img> in user-facing Html fields.
 * Updated in lockstep with KB rule IMG-001 and the get_safe_image_url tool.
 */
const ALLOWED_IMAGE_HOSTS = [
  'picsum.photos',          // Lorem Picsum — reliable, seed-based, no API key
  'placehold.co',           // Placeholder service — never 404s
  'placeholder.com',        // Legacy placeholder service
  'via.placeholder.com',
  'cdn.jsdelivr.net',       // jsDelivr — used for static SVG icons
  // images.unsplash.com is INTENTIONALLY excluded — AI cannot hallucinate
  // a valid photo-<32hex> id, and accepting the host means accepting any
  // hallucinated URL on it. If an admin needs a specific Unsplash photo
  // they can paste it directly via the Builder UI (which bypasses this
  // dispatcher reject). The AI should always use picsum.photos instead.
];

function isAllowedImageUrl(u: string): boolean {
  if (!u) return false;
  const s = String(u).trim();
  if (s.startsWith('data:image/')) return true;       // inline data URI
  if (s.startsWith('/') || s.startsWith('./') || s.startsWith('../')) return true; // relative / same-origin
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const host = url.host.toLowerCase();
      // Source.unsplash.com was deprecated and is NOT trusted even though
      // it shares the unsplash.com base domain — AI loves to emit this.
      if (host === 'source.unsplash.com') return false;
      return ALLOWED_IMAGE_HOSTS.some(h => host === h || host.endsWith('.' + h));
    } catch { return false; }
  }
  return false;
}

function uniqKey(base: string, existing: string[]): string {
  const slug = String(base || 'field').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  if (existing.indexOf(slug) < 0) return slug;
  for (let i = 2; i < 999; i++) {
    const candidate = slug + '_' + i;
    if (existing.indexOf(candidate) < 0) return candidate;
  }
  return slug + '_' + Date.now();
}

function getBuilder(): any {
  return (window as any).MegaFormBuilder || (window as any).MFB || null;
}

/**
 * [v20260528-14] Canonical schema accessor. The real builder state is
 *   window.MegaFormBuilder.state.schema = { version, fields[], settings }
 * NOT `state.form.schema` (that was a stale path inherited from the ACME
 * Block Builder port — the early v1 ops were no-ops because they wrote to
 * the wrong tree). We still accept `state.form.schema` as a fallback for
 * any future host that wraps the form metadata one level deeper.
 */
function getSchema(): any {
  const B = getBuilder();
  if (!B) return null;
  let schema: any = null;
  if (B.state) {
    if (B.state.schema) schema = B.state.schema;
    else if (B.state.form && B.state.form.schema) schema = B.state.form.schema;
  }
  if (!schema) {
    if (!B.state) B.state = {};
    if (!B.state.schema) B.state.schema = { version: '1.0', fields: [], settings: {} };
    schema = B.state.schema;
  }
  if (!Array.isArray(schema.fields)) schema.fields = [];
  return schema;
}

/** Used by AI assistant to inject a snapshot of the current builder state into
 *  the system prompt. Returns a JSON-safe object the AI can reason about. */
export function readCurrentFormSnapshot(): { title: string; description: string; fields: any[]; settings: any } | null {
  const B = getBuilder();
  if (!B || !B.state) return null;
  const schema = getSchema();
  const cfg: any = B.state.config || {};
  const titleEl = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-title') as HTMLInputElement | null : null;
  const descEl  = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-description') as HTMLInputElement | null : null;
  return {
    title: String((titleEl ? titleEl.value : '') || cfg.formTitle || cfg.title || ''),
    description: String((descEl ? descEl.value : '') || cfg.formDescription || cfg.description || ''),
    fields: Array.isArray(schema.fields) ? schema.fields : [],
    settings: schema.settings || {},
  };
}

function reRenderCanvas(): void {
  const B = getBuilder();
  if (!B) return;
  try {
    if (typeof B.callModule === 'function') B.callModule('canvas', 'render');
    else if (B.canvas && typeof B.canvas.render === 'function') B.canvas.render();
  } catch (_e) { /* ignore */ }
  try { if (B.state) B.state.isDirty = true; } catch (_e) { /* ignore */ }
}

function setCanvasTitle(title: string, desc?: string): void {
  try {
    const t = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-title') as HTMLInputElement | null : null;
    if (t && typeof title === 'string') { t.value = title; t.dispatchEvent(new Event('input', { bubbles: true })); }
    if (desc !== undefined) {
      const d = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-description') as HTMLInputElement | null : null;
      if (d) { d.value = String(desc || ''); d.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  } catch (_e) { /* ignore */ }
}

function findField(key: string): any {
  const schema = getSchema();
  if (!schema) return null;
  return schema.fields.find((f: any) => f && String(f.key) === String(key)) || null;
}

/**
 * [v20260530-02] Normalise SQL-driven Select/Radio/Checkbox option props.
 *
 * IMPORTANT — schema location: both the runtime (FieldOptionsService.cs
 * `FindFieldProperties` returns `obj["properties"]`) and the Properties UI
 * (`properties.ts:1575` reads `field.properties.optionsSource`) expect SQL
 * config to live UNDER `field.properties.*`, NOT at field top level.
 *
 * v20260530-01 put them at top level — which the runtime ignored, so the
 * dropdowns stayed static. This version moves everything under
 * `field.properties` and also harvests from the common wrong shapes that
 * LLMs emit (top-level field.optionsSql / widgetProps.dataSource.query /
 * widgetProps.query).
 */
function normalizeOptionFields(field: any): void {
  if (!field) return;
  field.properties = field.properties || {};
  const p = field.properties;
  const wp = field.widgetProps || {};
  const ds = (wp.dataSource && typeof wp.dataSource === 'object') ? wp.dataSource : null;

  // (1) widgetProps.dataSource.* — legacy / wrong shape from older docs.
  if (ds) {
    if (!p.optionsSql && (ds.query || ds.sql)) p.optionsSql = String(ds.query || ds.sql);
    if (!p.optionsConnectionKey && ds.connectionKey) p.optionsConnectionKey = String(ds.connectionKey);
    if (!p.optionsType && ds.type) p.optionsType = String(ds.type);
    if (!p.optionsDatabaseType && ds.databaseType) p.optionsDatabaseType = String(ds.databaseType);
    if (!Array.isArray(p.optionsDependsOn) || !p.optionsDependsOn.length) {
      const dep = ds.queryDependsOn || ds.dependsOn;
      if (Array.isArray(dep)) p.optionsDependsOn = dep.slice();
    }
  }
  // (2) widgetProps.* shorthand (e.g. wp.query, wp.queryDependsOn).
  if (!p.optionsSql && wp.query) p.optionsSql = String(wp.query);
  if (!p.optionsSql && wp.optionsSql) p.optionsSql = String(wp.optionsSql);
  if (!p.optionsConnectionKey && wp.connectionKey) p.optionsConnectionKey = String(wp.connectionKey);
  if ((!Array.isArray(p.optionsDependsOn) || !p.optionsDependsOn.length) && Array.isArray(wp.queryDependsOn)) {
    p.optionsDependsOn = wp.queryDependsOn.slice();
  }
  // (3) Field top-level (where v20260530-01 erroneously put them).
  ['optionsSource','optionsType','optionsConnectionKey','optionsDatabaseType','optionsSql'].forEach((k) => {
    if (!p[k] && field[k]) p[k] = field[k];
    delete field[k];
  });
  if ((!Array.isArray(p.optionsDependsOn) || !p.optionsDependsOn.length) && Array.isArray(field.optionsDependsOn)) {
    p.optionsDependsOn = field.optionsDependsOn.slice();
  }
  delete field.optionsDependsOn;
  delete field.optionsReloadOnChange;
  if ((!Array.isArray(p.optionsDependsOn) || !p.optionsDependsOn.length) && Array.isArray(field.dependsOn)) {
    p.optionsDependsOn = field.dependsOn.slice();
  }

  // Auto-infer source=sql if we have SQL but no explicit source flag.
  if (p.optionsSql && !p.optionsSource) p.optionsSource = 'sql';
  if (p.optionsSource === 'sql' && !p.optionsType) p.optionsType = 'sql';
  if (p.optionsSource === 'sql' && !p.optionsConnectionKey) p.optionsConnectionKey = 'DashboardDatabase';
  if (p.optionsSource === 'sql' && p.optionsReloadOnChange === undefined) p.optionsReloadOnChange = true;
}

/**
 * [v20260530-09] DynamicLabel auto-config. The widget plugin reads
 * widgetProps.{useSql, resultMode, dataSource, connectionKey, masterQuery,
 * wrapperTemplate, rowTemplate, emptyHtml, queryDependsOn, htmlContent}.
 * The two props AI most often forgets are `useSql:true` (without which
 * masterQuery is ignored — widget renders htmlContent only, which is
 * usually empty) and `resultMode:"multi"` (without which wrapperTemplate
 * is ignored — only htmlContent renders).
 *
 * Auto-fill safe defaults whenever AI sets SQL + templates:
 *   - useSql defaults to true if masterQuery is non-empty
 *   - resultMode defaults to "multi" if wrapperTemplate exists, else "simple"
 *   - dataSource defaults to "sql" when useSql=true
 *   - connectionKey defaults to "DashboardDatabase"
 *   - When SQL config exists at field root or under widgetProps.dataSource,
 *     hoist into widgetProps.* (mirror the legacy widgetProps.dataSource fix).
 */
function normalizeDynamicLabelProps(field: any): void {
  if (!field) return;
  if (String(field.type || '').toLowerCase() !== 'dynamiclabel') return;
  field.widgetProps = field.widgetProps || {};
  const wp = field.widgetProps;

  // Pull from widgetProps.dataSource.* (some models emit it nested)
  if (wp.dataSource && typeof wp.dataSource === 'object') {
    const ds = wp.dataSource;
    if (!wp.masterQuery && (ds.query || ds.sql || ds.masterQuery)) wp.masterQuery = String(ds.query || ds.sql || ds.masterQuery);
    if (!wp.connectionKey && ds.connectionKey) wp.connectionKey = String(ds.connectionKey);
    if (!wp.queryDependsOn && (ds.queryDependsOn || ds.dependsOn)) wp.queryDependsOn = ds.queryDependsOn || ds.dependsOn;
    // overwrite the object with the literal 'sql' string after extracting
    wp.dataSource = 'sql';
  }
  // Hoist top-level
  if (!wp.masterQuery && field.masterQuery) { wp.masterQuery = field.masterQuery; delete field.masterQuery; }
  if (!wp.connectionKey && field.connectionKey) { wp.connectionKey = field.connectionKey; delete field.connectionKey; }
  if (!wp.queryDependsOn && field.queryDependsOn) { wp.queryDependsOn = field.queryDependsOn; delete field.queryDependsOn; }
  if (!wp.wrapperTemplate && field.wrapperTemplate) { wp.wrapperTemplate = field.wrapperTemplate; delete field.wrapperTemplate; }
  if (!wp.rowTemplate && field.rowTemplate) { wp.rowTemplate = field.rowTemplate; delete field.rowTemplate; }
  if (!wp.htmlContent && field.htmlContent) { wp.htmlContent = field.htmlContent; delete field.htmlContent; }
  // Drop spurious option props (DynamicLabel doesn't have options).
  if (field.properties) {
    delete field.properties.optionsSource;
    delete field.properties.optionsConnectionKey;
    delete field.properties.optionsSql;
    delete field.properties.optionsDependsOn;
    delete field.properties.optionsType;
    delete field.properties.optionsReloadOnChange;
  }

  const hasSql = !!String(wp.masterQuery || '').trim();
  const hasWrapper = !!String(wp.wrapperTemplate || '').trim();
  const hasRow = !!String(wp.rowTemplate || '').trim();

  if (hasSql) {
    if (wp.useSql === undefined) wp.useSql = true;
    if (!wp.dataSource || wp.dataSource === '') wp.dataSource = 'sql';
    if (!wp.connectionKey) wp.connectionKey = 'DashboardDatabase';
    // Pick resultMode based on the templates AI provided.
    if (!wp.resultMode) {
      wp.resultMode = (hasWrapper || hasRow) ? 'multi' : 'simple';
    }
    // For multi mode, ensure both templates exist; fall back to a sane default.
    if (wp.resultMode === 'multi') {
      if (!wp.wrapperTemplate) wp.wrapperTemplate = '<div class="mf-dl-grid">{{rows}}</div>';
      if (!wp.rowTemplate) wp.rowTemplate = '<div class="mf-dl-row">{{rows}}</div>';
    }
  }
  // Normalise queryDependsOn to string CSV (the plugin parses both array & csv).
  if (Array.isArray(wp.queryDependsOn)) wp.queryDependsOn = wp.queryDependsOn.join(',');
}

/**
 * [v20260530-09] DataRepeater auto-config. Mirrors the same hoisting/normalisation
 * as DynamicLabel — common props end up under widgetProps.* where the plugin
 * actually reads them.
 */
function normalizeDataRepeaterProps(field: any): void {
  if (!field) return;
  const ty = String(field.type || '').toLowerCase();
  if (ty !== 'datarepeater' && ty !== 'gridrepeater' && ty !== 'datagrid') return;
  field.widgetProps = field.widgetProps || {};
  const wp = field.widgetProps;
  // Pull from widgetProps.dataSource.*
  if (wp.dataSource && typeof wp.dataSource === 'object') {
    const ds = wp.dataSource;
    if (!wp.masterQuery && (ds.query || ds.sql || ds.masterQuery)) wp.masterQuery = String(ds.query || ds.sql || ds.masterQuery);
    if (!wp.connectionKey && ds.connectionKey) wp.connectionKey = String(ds.connectionKey);
    if (!wp.queryDependsOn && (ds.queryDependsOn || ds.dependsOn)) wp.queryDependsOn = ds.queryDependsOn || ds.dependsOn;
    wp.dataSource = 'sql';
  }
  // Hoist top-level
  if (!wp.masterQuery && field.masterQuery) { wp.masterQuery = field.masterQuery; delete field.masterQuery; }
  if (!wp.connectionKey && field.connectionKey) { wp.connectionKey = field.connectionKey; delete field.connectionKey; }
  if (!wp.queryDependsOn && field.queryDependsOn) { wp.queryDependsOn = field.queryDependsOn; delete field.queryDependsOn; }
  // DataRepeater also uses the option-style names sometimes — clean those off the field root.
  if (field.properties) {
    delete field.properties.optionsSource;
    delete field.properties.optionsConnectionKey;
    delete field.properties.optionsSql;
    delete field.properties.optionsDependsOn;
    delete field.properties.optionsType;
    delete field.properties.optionsReloadOnChange;
  }
  if (!wp.connectionKey && wp.masterQuery) wp.connectionKey = 'DashboardDatabase';

  // [v20260530-11] DataGrid SQL display mode — when masterQuery is set, flip
  // useSql:true so the widget routes to the read-only SQL renderer instead of
  // the invoice-style edit grid (megaform-widget-datagrid-sql.ts).
  if (ty === 'datagrid' && wp.masterQuery) {
    if (wp.useSql === undefined) wp.useSql = true;
    if (!wp.dataSource || typeof wp.dataSource !== 'string') wp.dataSource = 'sql';
    if (!wp.pageSize) wp.pageSize = 100;
    // CSV form is canonical for DataGrid (matches DynamicLabel + parser).
    if (Array.isArray(wp.queryDependsOn)) wp.queryDependsOn = wp.queryDependsOn.join(',');
  }
}

function setByPath(target: any, path: string, value: any): void {
  if (!target || !path) return;
  const parts = path.split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

// ─────────────────────────────────────────────────────────────────────────
// Individual op handlers
// ─────────────────────────────────────────────────────────────────────────

// [QA-20260615b] Defense-in-depth for §5.3: 'Listbox' is NOT a native MegaForm
// widget type. The system prompt asks the model to map it to Select/MultiSelect,
// but if the model ignores that, normalise here so a hallucinated type can never
// reach the renderer (which would render an unknown type as a bare text input).
function normalizeFieldType(t: string): string {
  const norm = String(t || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (norm === 'listbox' || norm === 'list') return 'Select';
  if (norm === 'multilist' || norm === 'multilistbox' || norm === 'multiselectlist') return 'MultiSelect';
  if (norm === 'dropdown' || norm === 'combobox' || norm === 'combo') return 'Select';
  return String(t || 'Text');
}

// [B172] Composite fields are authored as ONE field with type:"Composite" +
// widgetProps.preset. The widget catalog + both system prompts expose friendly
// aliases (CompositePhone, CompositeAddress, …). If the model emits the alias as
// a raw field TYPE it reaches the renderer as an unknown type → bare text input
// (the exact gap audited 2026-06-15: listbox/dropdown were normalised but the
// composite aliases were never added to the same path). Map alias → canonical
// {type:"Composite", widgetProps.preset} across EVERY field-building op
// (add_field, replace_form_schema, create_form → app_batch).
const COMPOSITE_ALIAS_PRESET: Record<string, string> = {
  compositephone: 'phone',
  compositename: 'name',
  compositenameplus: 'name_plus',
  compositeaddress: 'address',
  compositessn: 'ssn',
  compositedob: 'dob',
  compositetime: 'time',
  compositeemailconfirm: 'email_confirm',
  compositepasswordconfirm: 'password_confirm',
};
function resolveCompositeAlias(t: string): string | null {
  const norm = String(t || '').toLowerCase().replace(/[\s_-]+/g, '');
  return COMPOSITE_ALIAS_PRESET[norm] || null;
}
// Rewrite a friendly composite alias field-type to the canonical Composite shape.
// Mutates + returns the field. No-op for non-composite types so it is safe to map
// over an entire fields[] array.
function normalizeCompositeField(field: any): any {
  if (!field || typeof field !== 'object') return field;
  const preset = resolveCompositeAlias(field.type);
  if (preset) {
    field.type = 'Composite';
    field.widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
    if (!field.widgetProps.preset) field.widgetProps.preset = preset;
  }
  return field;
}
function opAddField(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No active form schema' };
  const aliasPreset = resolveCompositeAlias(String(op.type || ''));
  const type = aliasPreset ? 'Composite' : normalizeFieldType(String(op.type || 'Text'));
  const label = String(op.label || type);
  const proposedKey = String(op.key || label);
  const existingKeys = schema.fields.map((f: any) => String(f.key || ''));
  const key = existingKeys.indexOf(proposedKey) >= 0 ? uniqKey(proposedKey, existingKeys) : (proposedKey || uniqKey('field', existingKeys));

  // [v20260530-02] SQL-driven Select/Radio/Checkbox props MUST live under
  // field.properties.* — that's where FieldOptionsService.FindFieldProperties
  // reads from + where the Properties UI looks. We accept the LLM emitting
  // them at top level or under widgetProps.dataSource (common mistakes) and
  // normalise into field.properties below.
  const field: any = {
    key,
    type,
    label,
    required: !!op.required,
    placeholder: op.placeholder || '',
    helpText: op.helpText || '',
    defaultValue: op.defaultValue !== undefined ? op.defaultValue : '',
    cssClass: op.cssClass || '',
    width: op.width || '100%',
    readOnly: !!op.readOnly,
    prefillParam: op.prefillParam || '',
    validation: op.validation || {},
    options: Array.isArray(op.options) ? op.options : [],
    showIf: op.showIf || null,
    htmlContent: op.htmlContent || '',
    fileSettings: op.fileSettings || null,
    properties: op.properties ? { ...op.properties } : {},
    widgetProps: op.widgetProps || {},
    // Top-level shadow copies — normalizeOptionFields hoists them into
    // field.properties and then deletes them.
    optionsSource:        op.optionsSource        || '',
    optionsType:          op.optionsType          || '',
    optionsConnectionKey: op.optionsConnectionKey || '',
    optionsDatabaseType:  op.optionsDatabaseType  || '',
    optionsSql:           op.optionsSql           || '',
    optionsDependsOn:     Array.isArray(op.optionsDependsOn) ? op.optionsDependsOn : [],
    optionsReloadOnChange: op.optionsReloadOnChange,
  };
  // [B172] Composite alias → ensure widgetProps.preset is set so the renderer can
  // resolve the sub-input layout (phone/name/address/ssn/dob/time/…).
  if (aliasPreset) {
    field.widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
    if (!field.widgetProps.preset) field.widgetProps.preset = aliasPreset;
  }
  normalizeOptionFields(field);
  normalizeDynamicLabelProps(field);
  normalizeDataRepeaterProps(field);

  // [v20260530-10] HARD BLOCK: don't add a DynamicLabel with placeholder
  // text and no SQL — the user sees meaningless "Hello World" / "Dynamic
  // label" copy. AI must supply a real template or a SQL source.
  if (String(type).toLowerCase() === 'dynamiclabel') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    const html = String(wp.htmlContent || field.htmlContent || '').trim();
    const isPlaceholder = !html || /^(<p>)?\s*(hello\s+world|dynamic\s+label|placeholder|sample\s+text|\.\.\.+)?\s*(<\/p>)?$/i.test(html);
    if (!hasSql && isPlaceholder) {
      return {
        op: op.op, ok: false,
        message: '[DL-001] Refused to add "' + key + '" (DynamicLabel): no SQL (widgetProps.masterQuery) AND no real htmlContent — would render placeholder "Hello World"/"Dynamic label" text only. Either: (1) wire SQL → set widgetProps.{useSql:true, dataSource:"sql", resultMode:"multi", connectionKey:"DashboardDatabase", masterQuery, wrapperTemplate, rowTemplate}; or (2) supply a real widgetProps.htmlContent with {{field:KEY}} or {{submission:KEY}} tokens.',
      };
    }
  }

  // [v20260530-16] HARD BLOCK: PRESERVE-001 — form has non-empty customHtml,
  // meaning the runtime renders THAT HTML instead of auto-laying out the
  // schema fields. A new field added without extending customHtml will be
  // INVISIBLE at runtime — silently broken from the user's perspective.
  // Require AI to either (a) inject {{field:key}} placeholders into the
  // existing customHtml, or (b) pass forceAddDespiteCustomHtml:true after
  // confirming with the user.
  {
    const ex = (schema.settings || (schema as any).Settings || {}) as any;
    const customHtml = (ex.customHtml || ex.CustomHtml || '').toString().trim();
    if (customHtml && !op.forceAddDespiteCustomHtml) {
      const placeholderRegex = new RegExp('\\{\\{\\s*field\\s*:\\s*' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'i');
      if (!placeholderRegex.test(customHtml)) {
        return {
          op: op.op, ok: false,
          message: '[PRESERVE-001] Refused to add "' + key + '" (' + type + '): the form has a non-empty settings.customHtml (' + customHtml.length + ' chars) and the new field key is NOT referenced as {{field:' + key + '}} anywhere in it. Adding the field anyway would make it INVISIBLE at runtime (custom HTML mode bypasses auto-layout). Pick ONE: (1) update settings.customHtml first to include the new placeholder (use set_form_meta or replace_form_schema); (2) re-emit with forceAddDespiteCustomHtml:true after ASKING the user via chat_message whether they accept that the field will not render until customHtml is updated.',
        };
      }
    }
  }

  // [v20260530-16] HARD BLOCK: PRESERVE-003 — Html field with inline <style>
  // that defines global classes will fight the premium theme's CSS.
  // Inline element-scoped styles via style="…" attribute are fine; full
  // <style> blocks belong in settings.customCss so theme overrides survive.
  if (String(type).toLowerCase() === 'html') {
    const html = String(field.htmlContent || '');
    const styleBlocks = html.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
    if (styleBlocks.length > 0) {
      // Allow <style scoped> or trivial <=300ch single-purpose rules. Reject
      // anything that defines global class names.
      const allowed = styleBlocks.every(block => {
        const inner = block.replace(/<style\b[^>]*>|<\/style>/gi, '');
        const hasGlobalClass = /(^|\}|\s)\.[a-z][\w-]+(\s|,|\{)/i.test(inner);
        return inner.length <= 200 && !hasGlobalClass;
      });
      if (!allowed) {
        return {
          op: op.op, ok: false,
          message: '[PRESERVE-003] Refused to add "' + key + '" (Html): htmlContent contains a <style> block that defines global CSS classes — this fights the premium theme. Pick ONE: (1) move CSS to settings.customCss via set_form_meta or replace_form_schema; (2) use INLINE style="..." attributes scoped to specific elements; (3) reuse existing theme classes (mf-grid, mf-card, mf-section, mfp-* for premium themes, acme-* if loaded). Do NOT invent new global class names.',
        };
      }
    }
  }

  // [v20260530-15] HARD BLOCK: Retired widgets. The Subform widget was
  // removed entirely (0 live forms used it). GridRepeater is deprecated
  // but kept in runtime so the 2 live forms still render — AI must NOT
  // suggest either for new forms. DataGrid (input mode + SQL display mode)
  // covers both use cases.
  const lower = String(type).toLowerCase();
  // [GUIDE-003] Template-guide forbidden field types.
  const guide = getActiveTemplateGuide();
  const forbiddenTypes = guideForbiddenTypes(guide);
  if (forbiddenTypes.length > 0 && forbiddenTypes.indexOf(lower) >= 0) {
    return {
      op: op.op, ok: false,
      message: '[GUIDE-003] Refused to add "' + key + '" (' + type + '): the template guide forbids field type "' + type + '" for this Premium form. Allowed alternatives depend on the template; check the guide\'s compositeWidgetPolicy.forbiddenFieldTypes.',
    };
  }

  if (lower === 'subform') {
    return {
      op: op.op, ok: false,
      message: '[RETIRED-001] Refused to add "' + key + '" (Subform): the Subform widget was retired on 2026-05-29. Use DataGrid instead — widgetProps.columns:[{key,label,type,required?},…] gives the same row-collector UI with inline + modal edit modes. See widget-datagrid bundle.',
    };
  }
  if (lower === 'gridrepeater') {
    return {
      op: op.op, ok: false,
      message: '[GR-DEPRECATED] Refused to add "' + key + '" (GridRepeater): widget is deprecated. Use DataGrid instead — for invoice/line-items input: widgetProps.columns; for SQL display: widgetProps.{useSql:true, masterQuery, queryDependsOn}. The 2 existing live forms using GridRepeater still render (runtime is retained) but new forms must use DataGrid.',
    };
  }

  // [v20260530-13] HARD BLOCK: Html with an <img src="…"> URL from a
  // disallowed host. The AI used to hallucinate URLs (e.g.
  // source.unsplash.com/random/...) that 404'd at runtime and rendered
  // as a broken-image icon. Allowlist: picsum.photos, placehold.co,
  // data: URIs, images.unsplash.com (deep-link only — NOT source.unsplash.com),
  // and any same-origin / relative path. Anything else → reject with the
  // get_safe_image_url tool as the fix.
  if (String(type).toLowerCase() === 'html') {
    const html = String(field.htmlContent || '');
    const imgSrcs = (html.match(/<img\b[^>]*?\bsrc\s*=\s*['"]([^'"]+)['"]/gi) || [])
      .map(m => /src\s*=\s*['"]([^'"]+)['"]/.exec(m)?.[1] || '')
      .filter(Boolean);
    if (imgSrcs.length > 0) {
      const bad = imgSrcs.find(u => !isAllowedImageUrl(u));
      if (bad) {
        return {
          op: op.op, ok: false,
          message: '[IMG-001] Refused to add "' + key + '" (Html): contains <img src="' + bad.slice(0, 100) + '..."> from a host the renderer cannot verify. Image will likely render as a broken icon. FIX: Use one of these methods instead — (1) call the `get_safe_image_url` tool to get a guaranteed-working URL, then emit it; (2) call `set_field_image_unsplash` op (target:"htmlContent") which writes the <img> tag for you using picsum.photos; or (3) use one of these allowed hosts in the URL: picsum.photos/seed/<keyword>/W/H, placehold.co/WxH/<bg>/<fg>?text=Label, data: URI, or a same-origin / relative path.',
        };
      }
    }
  }

  // [v20260530-11] HARD BLOCK: DataGrid without SQL config AND without
  // a custom columns schema falls back to the invoice-style defaults
  // (ITEM/QTY/PRICE/TOTAL) which never match the user's intent. Force AI
  // to either wire SQL display mode or supply a real columns schema.
  if (String(type).toLowerCase() === 'datagrid') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    const customCols = Array.isArray(wp.columns) ? wp.columns : [];
    const hasCustomColumns = customCols.length > 0;
    if (!hasSql && !hasCustomColumns) {
      return {
        op: op.op, ok: false,
        message: '[DG-001] Refused to add "' + key + '" (DataGrid): no widgetProps.masterQuery AND no widgetProps.columns — would render the default invoice template (ITEM/QTY/PRICE/TOTAL) which never matches the user\'s intent. Pick ONE: (1) DISPLAY mode for parent-cascade data → set widgetProps.{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery, queryDependsOn:"parent_key"}; or (2) INPUT mode for line-items entry → set widgetProps.columns=[{key,label,type,required?,decimals?,computeFormula?}...]. For most "show/display/list data related to X" requests, DynamicLabel with cascade SQL is the better default — use DataGrid SQL only when the user explicitly wants tabular rows.',
      };
    }
  }

  // [v20260530-11] HARD BLOCK: DataRepeater without SQL config is broken —
  // the widget needs widgetProps.masterQuery to render anything. Bare emits
  // produce a "Loading…" spinner that never resolves.
  if (String(type).toLowerCase() === 'datarepeater' || String(type).toLowerCase() === 'gridrepeater') {
    const wp = field.widgetProps || {};
    const hasSql = !!String(wp.masterQuery || '').trim();
    if (!hasSql) {
      return {
        op: op.op, ok: false,
        message: '[DR-001] Refused to add "' + key + '" (' + type + '): no widgetProps.masterQuery. Set widgetProps.{useSql:true, dataSource:"sql", connectionKey:"DashboardDatabase", masterQuery:"SELECT ... WHERE ParentId = :parent_key", queryDependsOn:"parent_key", masterTemplate, detailTemplate}. If you only need to display fields against a parent without tabular rows, DynamicLabel is the simpler choice.',
      };
    }
  }

  // [v20260530-08] HARD BLOCK: don't add a field whose cascade parent is
  // missing OR is a display-only widget (DataRepeater). Soft warnings from
  // v20260530-05 left the canvas half-broken. Now we refuse with ok:false
  // so AI sees actionable failure on next turn.
  const blockingDeps: string[] = [];
  if (Array.isArray(field.properties?.optionsDependsOn)) blockingDeps.push(...field.properties.optionsDependsOn);
  if (Array.isArray(field.widgetProps?.queryDependsOn)) blockingDeps.push(...field.widgetProps.queryDependsOn);
  else if (typeof field.widgetProps?.queryDependsOn === 'string') {
    blockingDeps.push(...String(field.widgetProps.queryDependsOn).split(/[ ,]+/).filter(Boolean));
  }
  for (const parentKey of blockingDeps) {
    const parent = schema.fields.find((f: any) => String(f.key) === parentKey);
    if (!parent) {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '" (' + type + '): depends on "' + parentKey + '" which does not exist. Add a Select (with optionsSql or static options) for "' + parentKey + '" FIRST, then re-emit add_field for "' + key + '". DataRepeater is display-only — the cascade parent MUST be a Select / Text / Number, never another DataRepeater.',
      };
    }
    const parentType = String(parent.type).toLowerCase();
    if (parentType === 'datarepeater' || parentType === 'gridrepeater') {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '": parent "' + parentKey + '" is a ' + parent.type + ' (display-only). User cannot pick a value from it to drive the cascade. Replace "' + parentKey + '" with a Select (use its existing SQL as properties.optionsSql) so user can pick a row before "' + key + '" fetches.',
      };
    }
    const inputTypes = ['select','dropdown','text','number','hidden','date','radio','checkbox'];
    if (!inputTypes.includes(parentType)) {
      return {
        op: op.op, ok: false,
        message: 'Refused to add "' + key + '": parent "' + parentKey + '" has type "' + parent.type + '" which does not produce a pickable value. Use Select / Text / Number / Date as the cascade parent.',
      };
    }
    if (parentType === 'select' || parentType === 'dropdown' || parentType === 'radio' || parentType === 'checkbox') {
      const parentHasStatic = Array.isArray(parent.options) && parent.options.length > 0;
      const parentHasSql = parent.properties && parent.properties.optionsSql;
      if (!parentHasStatic && !parentHasSql) {
        return {
          op: op.op, ok: false,
          message: 'Refused to add "' + key + '": parent "' + parentKey + '" is an empty ' + parent.type + ' with no options source. Set properties.optionsSql on "' + parentKey + '" (via set_field_property) OR re-create it with options, then re-emit "' + key + '".',
        };
      }
    }
  }

  const insertAt = typeof op.insertAt === 'number' && op.insertAt >= 0 && op.insertAt <= schema.fields.length
    ? op.insertAt
    : schema.fields.length;
  schema.fields.splice(insertAt, 0, field);
  reRenderCanvas();

  // [v20260530-03] Warn when an option-bearing widget lands with NO source
  // of options. Silently empty dropdowns are the most common "AI looks like
  // it worked but the form is broken" failure mode.
  const t = String(type).toLowerCase();
  const warnings: string[] = [];
  if (t === 'select' || t === 'dropdown' || t === 'radio' || t === 'checkbox') {
    const hasStatic = Array.isArray(field.options) && field.options.length > 0;
    const hasSql = field.properties && (field.properties.optionsSql || field.properties.optionsSource === 'form-lookup');
    if (!hasStatic && !hasSql) {
      warnings.push('no options yet — give ' + key + ' static options or properties.optionsSql against a table');
    }
  }
  // [v20260530-08] Cascade-parent validation is now a HARD BLOCK above (no
  // field ever lands with a broken cascade). Only "no options yet" warning
  // for terminal Select/Radio/Checkbox remains here.
  if (warnings.length) {
    return {
      op: op.op, ok: true,
      message: 'Added field ' + key + ' (' + type + ') — ⚠ ' + warnings.join('; '),
      detail: { key, type, warnings },
    };
  }

  return { op: op.op, ok: true, message: 'Added field ' + key + ' (' + type + ')', detail: { key, type } };
}

function opRemoveField(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No active form schema' };
  const key = String(op.key || '');
  // [GUIDE-004] Template-guide locked/required keys cannot be removed.
  const guide = getActiveTemplateGuide();
  const locked = guideLockedKeys(guide);
  if (locked.indexOf(key) >= 0) {
    return {
      op: op.op, ok: false,
      message: '[GUIDE-004] Refused to remove "' + key + '": this key is part of the template design contract (locked/required). You may only change its label/options/required flag via set_field_property.',
    };
  }
  const idx = schema.fields.findIndex((f: any) => String(f.key) === key);
  if (idx < 0) return { op: op.op, ok: false, message: 'Field not found: ' + key };
  schema.fields.splice(idx, 1);
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Removed field ' + key };
}

function opSetFieldProperty(op: Op): OpResult {
  // [GUIDE-005] Renaming or retyping locked keys is forbidden.
  const guide = getActiveTemplateGuide();
  const locked = guideLockedKeys(guide);
  if (locked.indexOf(String(op.key || '')) >= 0) {
    const path = String(op.path || '');
    if (path === 'key' || path === 'type' || path === 'fieldType') {
      return {
        op: op.op, ok: false,
        message: '[GUIDE-005] Refused to ' + path + ' the locked field "' + op.key + '". Locked keys are structural in this Premium template; only label, placeholder, required, options, and properties may be edited.',
      };
    }
  }
  const field = findField(op.key);
  if (!field) {
    // [v20260530-06] More actionable error than the bare "Field not found:".
    // This is THE most common AI mistake — emitting set_field_property
    // against a key that doesn't exist (hallucinated from history). The
    // user sees this error in the op result list; the AI sees it in the
    // next turn when we forward the chat history.
    return {
      op: op.op, ok: false,
      message: 'Field "' + op.key + '" does not exist on this form. To create it use add_field. To edit an existing field, first list_forms / get_form to confirm its real key.',
    };
  }
  const propPath = String(op.path || op.propPath || '');
  if (!propPath) return { op: op.op, ok: false, message: 'No property path' };

  // [v20260530-17] STYLE-001 — Row renders through columns[].fields[] and
  // never reads widgetProps.*. set_field_property with widgetProps.style /
  // widgetProps.* on a Row is a guaranteed no-op. Reject so AI uses
  // settings.customCss + field.cssClass instead (KB form_pattern-form-styling).
  if (String(field.type) === 'Row' && /^widgetProps\b/i.test(propPath)) {
    return {
      op: op.op, ok: false,
      message: '[STYLE-001] Refused to set ' + op.key + '.' + propPath + ': Row renders through its columns[].fields[] and does NOT read widgetProps.*. This op would be a no-op at runtime. For row background/padding/border: (1) add the CSS class via settings.customCss using a single set_form_meta op, e.g. customCss:".mf-form .mf-field-group--row.row-highlight { background:#eef2ff;padding:16px;border-radius:10px }"; (2) set_field_property key:"' + op.key + '" path:"cssClass" value:"row-highlight". Per-row inline styling spreads CSS work across many ops and fights the active theme.',
    };
  }

  // [v20260530-17] STYLE-003 — AI sometimes emits widgetProps.style on
  // field types that do not render via widgetProps (basic inputs +
  // Section + Hidden). Reject those too — they are no-ops.
  const noWidgetStyle = ['Text','Email','Number','Phone','Date','Time','Datetime','Select','Radio','Checkbox','File','Hidden','Section'];
  if (noWidgetStyle.indexOf(String(field.type)) >= 0 && /^widgetProps\.style\b/i.test(propPath)) {
    return {
      op: op.op, ok: false,
      message: '[STYLE-003] Refused to set ' + op.key + '.' + propPath + ': ' + field.type + ' fields do NOT read widgetProps.style at runtime. Use ONE of: (a) settings.customCss with .mf-field-group[data-key="' + op.key + '"] { … } for per-field styling; (b) field.cssClass + a class in settings.customCss; (c) for Radio/Checkbox multi-column layout use field.optionColumns (integer 1..4) — that is the BUILT-IN renderer prop (auto-applies class .mf-cols-N).',
    };
  }

  setByPath(field, propPath, op.value);
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Set ' + op.key + '.' + propPath };
}

function opSetFieldSql(op: Op): OpResult {
  const field = findField(op.key);
  if (!field) return { op: op.op, ok: false, message: 'Field not found: ' + op.key };
  if (!field.widgetProps) field.widgetProps = {};
  const wp = field.widgetProps;
  wp.useSql = true;
  wp.dataSource = 'sql';
  if (!wp.connectionKey) wp.connectionKey = 'DashboardDatabase';
  if (op.masterQuery !== undefined) wp.masterQuery = String(op.masterQuery);
  if (op.mode) wp.resultMode = String(op.mode);
  if (op.queryDependsOn !== undefined) wp.queryDependsOn = String(op.queryDependsOn);
  if (op.templates && typeof op.templates === 'object') {
    if (op.templates.header !== undefined) wp.headerTemplate = String(op.templates.header);
    if (op.templates.detail !== undefined) wp.detailTemplate = String(op.templates.detail);
    if (op.templates.footer !== undefined) wp.footerTemplate = String(op.templates.footer);
    if (op.templates.pager !== undefined) wp.pagerTemplate = String(op.templates.pager);
    if (op.templates.simple !== undefined) wp.sqlTemplate = String(op.templates.simple);
  }
  if (typeof op.pageSize === 'number') wp.pageSize = op.pageSize;
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Applied SQL to ' + op.key };
}

function opApplyDynLabelPreset(op: Op): OpResult {
  const field = findField(op.key || op.fieldKey);
  if (!field) return { op: op.op, ok: false, message: 'Field not found' };
  // Look up the registered DynamicLabel widget plugin and pull samples from it
  const W = (window as any).MegaFormWidgets;
  if (!W || typeof W.getPlugin !== 'function') {
    return { op: op.op, ok: false, message: 'MegaFormWidgets registry not available' };
  }
  const plugin = W.getPlugin('DynamicLabel');
  if (!plugin || !plugin.properties) return { op: op.op, ok: false, message: 'DynamicLabel plugin not registered' };
  const helpProp = plugin.properties.find((p: any) => p && p.type === 'help' && Array.isArray(p.samples));
  const samples = (helpProp && helpProp.samples) || [];
  let preset: any = null;
  if (typeof op.presetIndex === 'number') preset = samples[op.presetIndex];
  else if (op.presetLabel) {
    const target = String(op.presetLabel).toLowerCase();
    preset = samples.find((s: any) => String(s.label || '').toLowerCase().indexOf(target) >= 0);
  }
  if (!preset || !preset.apply) return { op: op.op, ok: false, message: 'Preset not found' };
  field.widgetProps = field.widgetProps || {};
  Object.keys(preset.apply).forEach((k) => { field.widgetProps[k] = preset.apply[k]; });
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Applied preset to ' + field.key };
}

function opSetFormMeta(op: Op): OpResult {
  // Canvas title/description live on hidden inputs that the toolbar reads at
  // Save time; setting the schema's settings.title would be silently ignored.
  // setCanvasTitle() updates the DOM inputs (and fires `input` so the dirty
  // tracker notices).
  if (op.title !== undefined || op.description !== undefined) {
    setCanvasTitle(op.title !== undefined ? String(op.title) : (readCurrentFormSnapshot()?.title || ''),
                   op.description !== undefined ? String(op.description) : undefined);
  }
  const schema = getSchema();
  const applied: string[] = [];
  if (schema) {
    if (!schema.settings || typeof schema.settings !== 'object') schema.settings = {};
    const settings = schema.settings;
    if (op.submitButtonText !== undefined) { settings.submitButtonText = String(op.submitButtonText); applied.push('submitButtonText'); }
    if (op.successMessage   !== undefined) { settings.successMessage   = String(op.successMessage);   applied.push('successMessage'); }

    // [v20260530-18] customCss / customCssAppend / customHtml / customScripts /
    // theme / themeCssOverrides — these were silently dropped before because
    // opSetFormMeta only handled title/description. AI could not change the
    // form's CSS at all. customCssAppend is the preferred mode for premium
    // forms because AI does not need to re-send the existing CSS (which can
    // be 5-10KB and would consume context budget).
    // [GUIDE-001] Template-guide hard guard for design fields.
    const guide = getActiveTemplateGuide();
    const immutable = guideImmutableDesign(guide);
    if (immutable.customHtml && typeof op.customHtml === 'string') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to replace customHtml: the template guide lists customHtml as immutable. Use customHtmlAppend for small additions, or ask the user to edit the HTML manually.' };
    }
    if (immutable.customCss && (typeof op.customCss === 'string' || typeof op.customCssAppend === 'string')) {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to mutate customCss: the template guide lists customCss as immutable. Styling tweaks must go through themeCssOverrides or the Settings panel.' };
    }
    if (immutable.theme && typeof op.theme === 'string') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to change theme: the template guide lists theme as immutable.' };
    }
    if (immutable.scripts && op.customScripts && typeof op.customScripts === 'object') {
      return { op: op.op, ok: false, message: '[GUIDE-001] set_form_meta refused to mutate customScripts: the template guide lists customScripts as immutable.' };
    }

    if (typeof op.customCss === 'string') {
      // [v20260530-19 CONVERT-001] Blanking customCss is the #1 way AI
      // destroys a beautifully designed form when the user asks to "convert
      // to a different form". Reject empty-string replacement unless the
      // user explicitly authorised a wipe via replaceCustomCss:true.
      const existingCss = String(settings.customCss || '');
      if (existingCss.length > 0 && op.customCss.length === 0) {
        // [v20260530-26 CONVERT-001 BLANK WIPE] Blank wipe is rejected even
        // when replaceCustomCss:true was passed. Wipes are almost never
        // intentional — AI almost always wants customCssAppend to add new
        // rules. To truly clear, the user must clear it in the Settings
        // panel manually.
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK existing customCss (' + existingCss.length + ' chars). Blank wipes are blocked even with replaceCustomCss:true — they almost always destroy work the user wanted preserved. Either: (1) drop the customCss field from your set_form_meta op entirely — that keeps the existing CSS; (2) use customCssAppend:"<scoped>{…}" to ADD new rules; (3) if the user TRULY wants to clear all CSS they can do it from the Settings panel directly.' };
      }
      if (existingCss.length > 0 && op.customCss.length > 0 && !op.replaceCustomCss) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to REPLACE existing customCss (' + existingCss.length + ' chars) with a different ' + op.customCss.length + '-char block. Replacement wipes scoped CSS variables, fonts, layout overrides — usually unintentional. Pick ONE: (1) use customCssAppend:"…" to ADD new rules on top; (2) pass replaceCustomCss:true ONLY after explicit user confirmation that the existing design should be discarded.' };
      }
      settings.customCss = op.customCss;
      applied.push('customCss(replace)');
    }
    if (typeof op.customCssAppend === 'string' && op.customCssAppend.length > 0) {
      const existing = String(settings.customCss || '');
      // Two newlines + a marker comment so admins reading the source see
      // what was appended by AI vs hand-written.
      const sep = existing && !/\n$/.test(existing) ? '\n\n' : '\n';
      settings.customCss = existing + sep + '/* [mfai append v20260530-18] */\n' + op.customCssAppend;
      applied.push('customCss(append +' + op.customCssAppend.length + 'ch)');
    }
    if (typeof op.customHtml === 'string') {
      // [v20260530-26 CONVERT-001 BLANK WIPE] Blanking customHtml on a
      // customised form destroys premium markup the user paid for. Reject
      // even when replaceCustomHtml:true is passed — true wipes belong in
      // the Settings panel, not in an AI op.
      const existingHtml = String(settings.customHtml || '');
      if (existingHtml.length > 0 && op.customHtml.length === 0) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK existing customHtml (' + existingHtml.length + ' chars). Blank wipes are blocked even with replaceCustomHtml:true. To extend customHtml use customHtmlAppend:"…"; to replace meaningfully send the full new HTML (non-empty) with replaceCustomHtml:true; to TRULY clear, the user can do it from the Settings panel.' };
      }
      // [PRESERVE-002 echo] customHtml replacement is destructive. Require
      // explicit confirmation flag.
      if (existingHtml.length > 0 && !op.replaceCustomHtml) {
        return { op: op.op, ok: false,
          message: '[PRESERVE-002] set_form_meta refused to replace existing customHtml (' + existingHtml.length + ' chars). Pass replaceCustomHtml:true after confirming with the user, OR use customHtmlAppend to add new markup at the end.' };
      }
      settings.customHtml = op.customHtml;
      applied.push('customHtml(replace)');
    }
    if (typeof op.customHtmlAppend === 'string' && op.customHtmlAppend.length > 0) {
      settings.customHtml = String(settings.customHtml || '') + op.customHtmlAppend;
      applied.push('customHtml(append +' + op.customHtmlAppend.length + 'ch)');
    }
    if (op.customScripts && typeof op.customScripts === 'object') {
      settings.customScripts = settings.customScripts || {};
      Object.keys(op.customScripts).forEach(k => { settings.customScripts[k] = String(op.customScripts[k]); });
      applied.push('customScripts(' + Object.keys(op.customScripts).length + ')');
    }
    if (typeof op.theme === 'string') {
      // [v20260530-19 CONVERT-001] Blanking the theme name detaches the
      // form from its scoped CSS namespace and breaks customHtml selectors.
      const existingTheme = String(settings.theme || '');
      if (existingTheme.length > 0 && op.theme.length === 0 && !op.replaceTheme) {
        return { op: op.op, ok: false,
          message: '[CONVERT-001] set_form_meta refused to BLANK theme (was "' + existingTheme + '"). Themes scope the customHtml/customCss class namespace — clearing them breaks the design. If the user explicitly wants to remove the theme, pass replaceTheme:true after chat_message confirmation.' };
      }
      // [v20260530-27 THEME-001] Allowlist — only 12 themes + 'custom' have
      // CSS shipped on disk. AI hallucinating a name like "pure-grid-premium"
      // sets the form to an undefined class, the host theme bleeds through,
      // and inputs render with no border / collapsed height. Reject the
      // unknown name immediately so the AI re-emits with a real one or
      // omits the field.
      const VALID_THEMES = ['', 'default', 'minimal', 'modern-blue', 'warm-sunset', 'dark-elegance', 'nature-green', 'flat-material', 'classic-formal', 'playful', 'healthcare', 'executive', 'tech-startup', 'custom'];
      if (op.theme && VALID_THEMES.indexOf(op.theme) < 0) {
        return { op: op.op, ok: false,
          message: '[THEME-001] set_form_meta refused unknown theme "' + op.theme + '". Valid themes: ' + VALID_THEMES.filter(Boolean).join(', ') + '. The 12 themed CSS classes (.mf-theme-<name>) ship in megaform-themes.css; setting an unknown name leaves the form unscoped and the host site theme (DNN/Oqtane/Bootstrap) bleeds through, collapsing inputs. Use one of the 12 themes, OR set theme:"custom" + provide a full customHtml/customCss block.' };
      }
      settings.theme = op.theme;
      applied.push('theme');
    }
    if (op.themeCssOverrides && typeof op.themeCssOverrides === 'object') {
      settings.themeCssOverrides = settings.themeCssOverrides || {};
      Object.assign(settings.themeCssOverrides, op.themeCssOverrides);
      applied.push('themeCssOverrides');
    }

    // [v20260530-28 RULES-001] Conditional-logic rules. The rule-builder-ui
    // loads from settings.rules > rulesJson > top-level rules (priority order).
    // The renderer reads from settings.rules. Production templates put rules
    // at TOP-LEVEL. Write to ALL THREE locations so every loader path sees
    // them. Each Rule Definition needs { id, name, enabled, priority, when,
    // then, else } — verify shape before commit.
    if (Array.isArray(op.rules)) {
      const validated = validateRuleArray(op.rules);
      if (!validated.ok) {
        return { op: op.op, ok: false, message: '[RULES-001] Rules array failed validation: ' + validated.error + '. See form_pattern-rules-overview for the canonical shape.' };
      }
      settings.rules = validated.rules;
      (schema as any).rules = validated.rules.slice();
      try { (schema as any).rulesJson = JSON.stringify(validated.rules); } catch {}
      applied.push('rules(' + validated.rules.length + ')');
    }
    if (Array.isArray(op.rulesAppend) && op.rulesAppend.length > 0) {
      const validated = validateRuleArray(op.rulesAppend);
      if (!validated.ok) {
        return { op: op.op, ok: false, message: '[RULES-001] rulesAppend failed validation: ' + validated.error };
      }
      const existing = Array.isArray(settings.rules) ? settings.rules : [];
      settings.rules = existing.concat(validated.rules);
      (schema as any).rules = settings.rules.slice();
      try { (schema as any).rulesJson = JSON.stringify(settings.rules); } catch {}
      applied.push('rulesAppend(+' + validated.rules.length + ')');
    }
  }
  reRenderCanvas();
  // Repaint the Rules tab if it's mounted (so newly-added rules show up
  // immediately without a save+reload cycle).
  try {
    const B = getBuilder();
    if (B && B.rulesUi && typeof B.rulesUi.loadRules === 'function') B.rulesUi.loadRules();
    else if (B && B.rules && typeof B.rules.loadRules === 'function') B.rules.loadRules();
  } catch { /* tab not open, fine */ }
  return { op: op.op, ok: true, message: 'Form metadata updated' + (applied.length ? ' (' + applied.join(', ') + ')' : '') };
}

// [v20260530-28] Verify a rule array matches the engine's required shape so
// silent half-broken rules don't ship. Returns {ok, rules, error}.
function validateRuleArray(arr: any[]): { ok: boolean; rules: any[]; error?: string } {
  if (!Array.isArray(arr)) return { ok: false, rules: [], error: 'not an array' };
  const out: any[] = [];
  const VALID_OPS = new Set(['eq','neq','gt','gte','lt','lte','contains','startsWith','endsWith','in','notIn','isEmpty','isNotEmpty','isTrue','isFalse']);
  const VALID_ACTIONS = new Set(['show','hide','require','optional','enable','disable','setValue','clear']);
  const VALID_TARGET_TYPES = new Set(['field','section','step']);
  function validateNode(node: any, path: string): string | null {
    if (!node || typeof node !== 'object') return path + ': not an object';
    if (node.type === 'group') {
      if (node.logic !== 'all' && node.logic !== 'any') return path + ': group.logic must be "all" or "any"';
      if (!Array.isArray(node.children) || node.children.length === 0) return path + ': group.children must be non-empty array';
      for (let i = 0; i < node.children.length; i++) {
        const e = validateNode(node.children[i], path + '.children[' + i + ']');
        if (e) return e;
      }
      return null;
    }
    if (node.type === 'rule') {
      if (!node.field || typeof node.field !== 'string') return path + ': rule.field is required';
      if (!node.operator || !VALID_OPS.has(node.operator)) return path + ': rule.operator must be one of ' + Array.from(VALID_OPS).join(',');
      return null;
    }
    return path + ': type must be "group" or "rule"';
  }
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i];
    if (!r || typeof r !== 'object') return { ok: false, rules: [], error: 'rule[' + i + '] not an object' };
    if (!r.when) return { ok: false, rules: [], error: 'rule[' + i + '].when is required' };
    const whenErr = validateNode(r.when, 'rule[' + i + '].when');
    if (whenErr) return { ok: false, rules: [], error: whenErr };
    if (!Array.isArray(r.then) && !Array.isArray(r.else)) return { ok: false, rules: [], error: 'rule[' + i + '] needs at least one of then[] or else[]' };
    const sides: Array<'then' | 'else'> = ['then', 'else'];
    for (const side of sides) {
      const acts = r[side] || [];
      if (!Array.isArray(acts)) return { ok: false, rules: [], error: 'rule[' + i + '].' + side + ' must be an array' };
      for (let j = 0; j < acts.length; j++) {
        const a = acts[j];
        if (!a || !VALID_ACTIONS.has(a.action)) return { ok: false, rules: [], error: 'rule[' + i + '].' + side + '[' + j + '].action must be one of ' + Array.from(VALID_ACTIONS).join(',') };
        if (!VALID_TARGET_TYPES.has(a.targetType || 'field')) return { ok: false, rules: [], error: 'rule[' + i + '].' + side + '[' + j + '].targetType must be field|section|step' };
        if (!a.target || typeof a.target !== 'string') return { ok: false, rules: [], error: 'rule[' + i + '].' + side + '[' + j + '].target (key) is required' };
        if (a.action === 'setValue' && a.value === undefined) return { ok: false, rules: [], error: 'rule[' + i + '].' + side + '[' + j + '] action=setValue needs value' };
      }
    }
    // Pad missing IDs / metadata so the rule-builder-ui can render them.
    const padded = {
      id:       String(r.id || 'definition_' + Math.random().toString(36).slice(2, 9)),
      name:     String(r.name || 'Rule ' + (i + 1)),
      enabled:  r.enabled !== false,
      priority: typeof r.priority === 'number' ? r.priority : (i + 1),
      when:     r.when,
      then:     Array.isArray(r.then) ? r.then : [],
      else:     Array.isArray(r.else) ? r.else : [],
    };
    out.push(padded);
  }
  return { ok: true, rules: out };
}

function opReorderFields(op: Op): OpResult {
  const schema = getSchema();
  if (!schema) return { op: op.op, ok: false, message: 'No schema' };
  const keys = Array.isArray(op.keys) ? op.keys : [];
  const map: Record<string, any> = {};
  schema.fields.forEach((f: any) => { map[String(f.key)] = f; });
  const next: any[] = [];
  keys.forEach((k: string) => { if (map[k]) { next.push(map[k]); delete map[k]; } });
  Object.keys(map).forEach((k) => next.push(map[k]));
  schema.fields = next;
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Fields reordered (' + keys.length + ')' };
}

function opSaveForm(op: Op): OpResult {
  const B = getBuilder();
  if (!B) return { op: op.op, ok: false, message: 'Builder not available' };
  try {
    // [SaveHandlerFix v20260601-B13] toolbar.ts registers the module with
    // `saveForm: saveForm` (the actual function name), not `save`. Earlier
    // code probed B.toolbar.save → undefined → "No Save handler found".
    // Default status to "Draft" so AI ops match the user's manual click.
    if (B.toolbar && typeof B.toolbar.saveForm === 'function') {
      B.toolbar.saveForm(op.status || 'Draft');
      return { op: op.op, ok: true, message: 'Save triggered (' + (op.status || 'Draft') + ')' };
    }
    if (B.toolbar && typeof B.toolbar.save === 'function') {
      B.toolbar.save();
      return { op: op.op, ok: true, message: 'Save triggered' };
    }
    const btn = document.querySelector('#mf-btn-save-draft, [data-mf-action="save"], #mf-builder-save, .mf-builder-save') as HTMLElement | null;
    if (btn) { btn.click(); return { op: op.op, ok: true, message: 'Save button clicked' }; }
    return { op: op.op, ok: false, message: 'No Save handler found (looked for toolbar.saveForm / toolbar.save / save button)' };
  } catch (e) {
    return { op: op.op, ok: false, message: 'Save failed: ' + (e as Error).message };
  }
}

function opChatMessage(op: Op): OpResult {
  // No-op for state; the chat UI prints op.text. Returning ok lets the
  // dispatcher echo a message into the chat log.
  return { op: op.op, ok: true, message: String(op.text || op.message || ''), detail: { text: op.text || op.message || '' } };
}

/**
 * [v20260528-14] Replace the entire form schema. Used when the AI wants to
 * make a large structural change (e.g. "rebuild this as a 3-step wizard")
 * rather than emit dozens of per-field ops. The builder canvas is re-rendered
 * after replacement so the new fields show up immediately.
 *
 *   { op: 'replace_form_schema', schema: { version: '1.0', fields: [...], settings: {...} } }
 */
function opReplaceFormSchema(op: Op): OpResult {
  const B = getBuilder();
  if (!B || !B.state) return { op: op.op, ok: false, message: 'Builder not available' };
  const next = op.schema || op.value;
  if (!next || !Array.isArray(next.fields)) {
    return { op: op.op, ok: false, message: 'replace_form_schema requires { schema: { fields: [...] } }' };
  }
  // [B172] Normalise any composite alias field-types to the canonical Composite shape.
  next.fields.forEach(normalizeCompositeField);

  // [v20260530-16] PRESERVE-002 — refuse to wipe a customised premium form.
  // When the existing form has non-empty customHtml / customCss / customScripts
  // (or a non-default `theme`), blindly replacing the schema discards work the
  // user paid for. Require an explicit `preserveCustomizations:false` flag
  // OR a `mergeWithCustomHtml:true` flag to confirm intent.
  const existing = B.state.schema || {};
  const ex = (existing.settings || existing.Settings || {}) as any;
  const has = (v: any) => v != null && (typeof v === 'string' ? v.trim().length > 0 : Object.keys(v).length > 0);
  const customised = {
    customHtml:    has(ex.customHtml || ex.CustomHtml),
    customCss:     has(ex.customCss || ex.CustomCss),
    customScripts: has(ex.customScripts || ex.CustomScripts),
    theme:         has(ex.theme || ex.Theme),
    themeCssOverrides: has(ex.themeCssOverrides || ex.ThemeCssOverrides),
  };
  const customisedKeys = Object.keys(customised).filter(k => (customised as any)[k]);

  // [GUIDE-002] If the template guide declares design fields immutable,
  // block any replace_form_schema that does not preserve them.
  const guide = getActiveTemplateGuide();
  if (guide && customisedKeys.length > 0 && !op.preserveCustomizations && !op.mergeWithCustomHtml) {
    const immutable = guideImmutableDesign(guide);
    const immutableKeys = Object.keys(immutable).filter(k => (immutable as any)[k] && customisedKeys.includes(k === 'scripts' ? 'customScripts' : 'custom' + k.charAt(0).toUpperCase() + k.slice(1)));
    if (immutableKeys.length > 0) {
      return {
        op: op.op, ok: false,
        message: '[GUIDE-002] Refused to replace_form_schema: the template guide marks ' + immutableKeys.join(', ') + ' as immutable. Re-emit with preserveCustomizations:true to keep the existing design while changing fields/logic.',
      };
    }
  }

  // [v20260530-20 CONVERT-001 fix] Shared auto-merge — runs WHENEVER the
  // existing form has customisations, regardless of whether AI passed the
  // preserveCustomizations flag. The earlier code only merged inside the
  // reject branch, so when AI passed preserveCustomizations:true with
  // settings.customCss='' the wipe went through. The merge now ALWAYS
  // back-fills any empty/null design field from the existing settings.
  const nextSettings = (next.settings && typeof next.settings === 'object') ? next.settings : {};
  customisedKeys.forEach(k => {
    const sourceKey = k === 'customHtml' ? (ex.customHtml || ex.CustomHtml)
                    : k === 'customCss'  ? (ex.customCss  || ex.CustomCss)
                    : k === 'customScripts' ? (ex.customScripts || ex.CustomScripts)
                    : k === 'theme'      ? (ex.theme      || ex.Theme)
                    :                       (ex.themeCssOverrides || ex.ThemeCssOverrides);
    const v = (nextSettings as any)[k];
    const empty = v == null || (typeof v === 'string' && v.length === 0)
                || (typeof v === 'object' && Object.keys(v).length === 0);
    if (empty) (nextSettings as any)[k] = sourceKey;
  });
  next.settings = nextSettings;

  // [v20260611-PRESERVE-SYNC] When customHtml is preserved (auto-merge or
  // preserveCustomizations:true), ensure EVERY field key in the new schema has
  // a {{field:key}} placeholder inside customHtml. Fields without a placeholder
  // are INVISIBLE in custom-shell mode because the renderer bypasses auto-layout.
  // We silently append minimal placeholders for missing keys so the user sees
  // all fields without losing their premium design.
  const customHtmlAfterMerge = String(nextSettings.customHtml || nextSettings.CustomHtml || '');
  if (customHtmlAfterMerge.length > 0 && Array.isArray(next.fields)) {
    const placeholderRegex = /\{\{\s*field\s*:\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
    const referencedKeys = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = placeholderRegex.exec(customHtmlAfterMerge)) !== null) referencedKeys.add(m[1]);
    const missingFields = next.fields.filter((f: any) => f && f.key && !referencedKeys.has(f.key));
    if (missingFields.length > 0) {
      const appendBlocks = missingFields.map((f: any) => {
        const key = f.key;
        return `\n<!-- [mfai auto-sync field:${key}] -->\n<div class="mf-field-group" data-key="${key}">{{field:${key}}}</div>`;
      }).join('');
      nextSettings.customHtml = customHtmlAfterMerge + appendBlocks;
      (op as any).__autoSyncFields = missingFields.map((f: any) => f.key);
    }
  }

  if (customisedKeys.length > 0 && !op.preserveCustomizations && !op.mergeWithCustomHtml) {
    return {
      op: op.op, ok: false,
      message: '[PRESERVE-002] Refused to replace_form_schema: the existing form has customisations (' + customisedKeys.join(', ') + ') that would be wiped. Pick ONE: (1) re-emit with `preserveCustomizations:true` to AUTO-MERGE existing customHtml / customCss / customScripts / theme into your new settings; (2) re-emit with `mergeWithCustomHtml:true` to extend the existing customHtml with placeholders for your new fields ({{field:newkey}}); (3) ASK the user via chat_message before destroying their premium customisation. Hand-rolled schemas usually want option (1).',
    };
  }

  // [v20260530-28 RULES-001] Lift top-level next.rules INTO settings.rules
  // so the rule-builder-ui and renderer both find it. Production templates
  // put rules at the schema top level, but the AI dispatcher canonical
  // location is settings.rules. Mirror both — and stamp rulesJson — so every
  // load path works.
  const finalSettings = next.settings && typeof next.settings === 'object' ? next.settings : {};
  const topLevelRules = Array.isArray((next as any).rules) ? (next as any).rules : null;
  if (topLevelRules && !Array.isArray(finalSettings.rules)) {
    finalSettings.rules = topLevelRules;
  }
  // Validate whatever rules are about to be committed.
  const finalRulesArr = Array.isArray(finalSettings.rules) ? finalSettings.rules : [];
  if (finalRulesArr.length > 0) {
    const v = validateRuleArray(finalRulesArr);
    if (!v.ok) {
      return { op: op.op, ok: false, message: '[RULES-001] schema.rules failed validation: ' + v.error + '. See form_pattern-rules-overview.' };
    }
    finalSettings.rules = v.rules;
  }
  B.state.schema = {
    version: String(next.version || '1.0'),
    fields:  next.fields,
    settings: finalSettings,
  };
  if (Array.isArray(finalSettings.rules)) {
    (B.state.schema as any).rules = finalSettings.rules.slice();
    try { (B.state.schema as any).rulesJson = JSON.stringify(finalSettings.rules); } catch {}
  }
  reRenderCanvas();
  try {
    if (B.rulesUi && typeof B.rulesUi.loadRules === 'function') B.rulesUi.loadRules();
    else if (B.rules && typeof B.rules.loadRules === 'function') B.rules.loadRules();
  } catch {}
  const mergedHint = customisedKeys.length > 0 ? ' (preserved ' + customisedKeys.join(', ') + ')' : '';
  const rulesHint  = finalRulesArr.length > 0 ? ' [' + finalRulesArr.length + ' rules]' : '';
  const syncHint   = (op as any).__autoSyncFields?.length > 0
    ? ' [auto-sync placeholders: ' + (op as any).__autoSyncFields.join(', ') + ']'
    : '';
  return { op: op.op, ok: true, message: 'Schema replaced (' + next.fields.length + ' fields)' + mergedHint + rulesHint + syncHint };
}

/**
 * [v20260528-14] Attach a real Unsplash image URL to a field. Uses
 * source.unsplash.com which serves a working JPEG with no API key and is
 * always cacheable + visible. The AI passes a search query ("ocean", "team
 * meeting", etc.); we build the URL deterministically so the AI can't
 * hallucinate a 404.
 *
 *   { op:'set_field_image_unsplash', key:'hero', query:'mountain sunrise',
 *     width:1200, height:600, target:'defaultValue'|'widgetProps.imageUrl' }
 */
function opSetFieldImageUnsplash(op: Op): OpResult {
  const field = findField(op.key);
  if (!field) return { op: op.op, ok: false, message: 'Field not found: ' + op.key };
  const q = String(op.query || op.search || '').trim();
  if (!q) return { op: op.op, ok: false, message: 'set_field_image_unsplash needs a query' };
  const w = Number(op.width)  > 0 ? Math.min(2400, Number(op.width))  : 800;
  const h = Number(op.height) > 0 ? Math.min(2400, Number(op.height)) : 600;
  // [v20260530-13] source.unsplash.com/random was deprecated in 2024 and
  // now returns intermittent 404 / redirect chains that frequently render
  // as a broken-image icon in the form. Picsum.photos with a seed derived
  // from the user's keywords is a stable, no-API-key alternative that
  // always returns a real cacheable JPEG. The seed makes the image
  // deterministic per query so the same prompt always renders the same
  // photo (useful for preview testing). See KB rule IMG-001.
  const seed = encodeURIComponent(q.replace(/\s+/g, '-').slice(0, 60));
  const url = 'https://picsum.photos/seed/' + seed + '/' + w + '/' + h;
  const target = String(op.target || '').trim() || 'defaultValue';
  if (target.indexOf('widgetProps') === 0) {
    field.widgetProps = field.widgetProps || {};
    const k = target.replace(/^widgetProps\.?/, '') || 'imageUrl';
    field.widgetProps[k] = url;
  } else if (target === 'htmlContent') {
    const alt = String(op.alt || q).replace(/"/g, '&quot;');
    field.htmlContent = '<img src="' + url + '" alt="' + alt + '" style="max-width:100%;height:auto;border-radius:12px;display:block;">';
  } else {
    field.defaultValue = url;
  }
  reRenderCanvas();
  return { op: op.op, ok: true, message: 'Set Unsplash image on ' + field.key + ' (' + q + ')', detail: { url, query: q } };
}

/**
 * [v20260528-16] Add a Subform/DataGrid widget from a SQL table on the
 * DashboardDatabase. Looks up columns via /Subform/Columns, infers UI types,
 * skips identity PKs. Use case prompt: "Tạo invoice form với bảng phụ
 * OrderItems gồm qty x price, tự tính total và bubble lên field total_amount".
 *
 *   { op:'add_subform_from_table', tableName:'OrderItems',
 *     parentKeyColumn?:'Invoice_ID', totalField?:'total_amount',
 *     totalFormula?:'Sum("qty * price")', label?:'Order Items' }
 */
function opAddSubformFromTable(op: Op): OpResult {
  const B = getBuilder();
  if (!B || !B.createFieldFromTemplate) return { op: op.op, ok: false, message: 'Builder not ready' };
  const tableName = String(op.tableName || op.table || '').trim();
  if (!tableName) return { op: op.op, ok: false, message: 'add_subform_from_table needs tableName' };

  // Synchronously bail with hint — actual fetch is async. We resolve via a
  // tracked Promise on window so the chat UI can wait for completion. For
  // the dispatcher's synchronous contract we kick off the fetch + return a
  // pending message; the field appears once the fetch resolves.
  const url = subformUrl('Columns', { tableName });
  const tok = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';

  fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: tok } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then((j: any) => {
      const cols = (j.columns || []).filter((c: any) => !c.isIdentity);
      const editMode = cols.length > 5 ? 'modal' : 'inline';
      const widgetProps: any = {
        tableName,
        parentKeyColumn: String(op.parentKeyColumn || ''),
        editMode,
        allowAdd: true, allowDelete: true, stickyHeader: true,
        rowHeight: 'normal',
        emptyMessage: 'No ' + tableName + ' rows yet.',
        totalField: String(op.totalField || ''),
        totalFormula: String(op.totalFormula || ''),
        minRows: 0, maxRows: 0,
        columns: cols.map((c: any) => ({
          key: c.name,
          label: humanize(c.name),
          type: c.uiType || 'text',
          required: !c.nullable,
          width: c.uiType === 'number' || c.uiType === 'currency' ? '120px' : (c.uiType === 'date' ? '140px' : '1fr'),
          decimals: c.uiType === 'currency' ? 2 : (c.uiType === 'number' ? 0 : undefined),
        })),
      };
      const newField = B.createFieldFromTemplate({
        type: 'DataGrid',
        label: String(op.label || humanize(tableName) + ' (subform)'),
        widgetProps,
        width: '100%',
      });
      B.state.schema.fields.push(newField);
      B.state.isDirty = true;
      B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
      try { B.syncSchemaToHtmlImmediate && B.syncSchemaToHtmlImmediate({}); } catch {}
      try { B.callModule && B.callModule('canvas', 'render', []); } catch {}
      try { B.callModule && B.callModule('properties', 'showProps', [newField]); } catch {}
    })
    .catch(err => { console.error('[ai add_subform_from_table]', err); });

  return { op: op.op, ok: true, message: 'Fetching ' + tableName + ' columns + creating DataGrid…' };
}

/**
 * [v20260528-16] Add a single field bound to a SQL column.
 *   { op:'add_field_from_column', tableName:'Customers', columnName:'email',
 *     key?:'customer_email' }
 * Field type inferred from the column data type (text/number/date/checkbox).
 */
function opAddFieldFromColumn(op: Op): OpResult {
  const B = getBuilder();
  if (!B || !B.createFieldFromTemplate) return { op: op.op, ok: false, message: 'Builder not ready' };
  const tableName = String(op.tableName || op.table || '').trim();
  const columnName = String(op.columnName || op.column || '').trim();
  if (!tableName || !columnName) return { op: op.op, ok: false, message: 'Need tableName + columnName' };

  const url = subformUrl('Columns', { tableName });
  const tok = (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';

  fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: tok } })
    .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
    .then((j: any) => {
      const col = (j.columns || []).find((c: any) => String(c.name).toLowerCase() === columnName.toLowerCase());
      if (!col) throw new Error('Column not found: ' + columnName);
      const uiToType: Record<string, string> = { text: 'Text', number: 'Number', currency: 'Number', date: 'Date', checkbox: 'Checkbox' };
      const newField = B.createFieldFromTemplate({
        type:  uiToType[col.uiType] || 'Text',
        label: humanize(col.name),
        name:  String(op.key || col.name),
        required: !col.nullable,
        placeholder: 'From ' + tableName + '.' + col.name,
      });
      B.state.schema.fields.push(newField);
      B.state.isDirty = true;
      B.state.selectedFieldIndex = B.state.schema.fields.length - 1;
      try { B.syncSchemaToHtmlImmediate && B.syncSchemaToHtmlImmediate({}); } catch {}
      try { B.callModule && B.callModule('canvas', 'render', []); } catch {}
      try { B.callModule && B.callModule('properties', 'showProps', [newField]); } catch {}
    })
    .catch(err => console.error('[ai add_field_from_column]', err));

  return { op: op.op, ok: true, message: 'Fetching column ' + columnName + '…' };
}

// ─────────────────────────────────────────────────────────────────────
//  [v20260531-AppBatch] Multi-form + DB-table creation in ONE AI turn,
//  no chat exit, no per-form navigate. Ops:
//
//    execute_sql  { sql, connectionKey? }       → POST /AiTools/ExecuteDdl
//    create_form  { title, fields, settings?,   → POST /MegaFormApi/Save
//                   bindToTable? }                 (no navigation; returns
//                                                  formId + URL)
//    app_batch    { tables:[…], forms:[…] }     → orchestrates execute_sql
//                                                  per table + create_form
//                                                  per form, auto-wires
//                                                  DatabaseInsert when
//                                                  bindToTable is set.
//
//  Wrapper around the existing /MegaFormApi/Save endpoint. The Builder
//  state is NOT mutated — these ops create independent forms that show
//  up in the Dashboard alongside the current one.
// ─────────────────────────────────────────────────────────────────────

function getApiBaseLocal(): string {
  const w = window as any;
  const platform = w.__MF_PLATFORM__ || {};
  if (typeof platform.apiBase === 'string' && platform.apiBase) return platform.apiBase.replace(/\/+$/, '/');
  // [B51] Platform-aware fallback
  const platformName = String(platform.platform || '').toLowerCase();
  if (platformName === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}
// [P1-3] AiTools live at /api/AiTools on Oqtane (NOT /api/MegaForm/AiTools) —
// same split as tools.ts aiBase(). The MegaForm CRUD base (getApiBaseLocal)
// would 404 for ExecuteDdl. Mirror that resolution here.
function getAiBaseLocal(): string {
  const w = window as any;
  const platform = w.__MF_PLATFORM__ || {};
  if (typeof platform.aiApiBase === 'string' && platform.aiApiBase) return String(platform.aiApiBase).replace(/\/+$/, '/');
  const platformName = String(platform.platform || '').toLowerCase();
  if (platformName === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/';
  }
  return '/DesktopModules/MegaForm/API/';
}
// [QA-20260615] Robust Oqtane detection. Mirrors ai-form-creator.ts
// isOqtaneRuntime(): Blazor script is the strongest signal; Dashboard URL
// pattern is a fallback when __MF_PLATFORM__ is missing.
function isOqtaneLocal(): boolean {
  try {
    const w = window as any;
    if (String((w.__MF_PLATFORM__ || {}).platform || '').toLowerCase() === 'oqtane') return true;
    if (w.Oqtane || w.__OQTANE__) return true;
    if (document.querySelector('script[src*="_framework/blazor"]')) return true;
    if (document.querySelector('[data-mf-platform="oqtane"]')) return true;
    if (/\/[^\/]*\/\d+\/Dashboard\b/i.test(location.pathname)) return true;
  } catch { /* ignore */ }
  return false;
}
function getLocalPlatform(): { platform: string; moduleId?: number; siteId?: number; portalId?: number } {
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  let platform = String(pf.platform || '').toLowerCase();
  if (!platform && isOqtaneLocal()) platform = 'oqtane';
  return { platform: platform || 'dnn', moduleId: pf.moduleId, siteId: pf.siteId, portalId: pf.portalId };
}
function antiForgeryToken(): string {
  return (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
}
// [QA-20260615] Build save headers matching the dashboard AI creator so
// Oqtane X-OQTANE-* / DNN RequestVerificationToken are both sent.
function buildSaveHeadersLocal(): Record<string, string> {
  const cfg = getLocalPlatform();
  const platform = cfg.platform;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (platform === 'dnn' && !isOqtaneLocal()) {
    try {
      const sf = (window as any).jQuery?.ServicesFramework?.(cfg.moduleId || 0);
      if (sf) headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
    } catch {}
    if (!headers['RequestVerificationToken']) headers['RequestVerificationToken'] = antiForgeryToken();
  } else if (platform === 'oqtane' || isOqtaneLocal()) {
    const bearer = (window as any).__MF_TOKEN;
    if (bearer) headers['Authorization'] = 'Bearer ' + bearer;
    if (cfg.moduleId) headers['X-OQTANE-MODULEID'] = String(cfg.moduleId);
    if (cfg.siteId)   headers['X-OQTANE-SITEID']   = String(cfg.siteId);
  }
  return headers;
}
function appendPlatformQueryLocal(url: string): string {
  const cfg = getLocalPlatform();
  if (cfg.platform === 'dnn' && !isOqtaneLocal()) {
    if (/[?&]portalId=/i.test(url)) return url;
    const pid = cfg.portalId ?? 0;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }
  if (cfg.platform === 'oqtane' || isOqtaneLocal()) {
    const qs: string[] = [];
    if (cfg.moduleId) qs.push('authmoduleid=' + cfg.moduleId);
    if (cfg.siteId)   qs.push('authsiteid='   + cfg.siteId);
    if (qs.length) return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
  }
  return url;
}
// [QA-20260615] Platform-aware save endpoint. Oqtane controller exposes
// POST /api/MegaForm/Form; DNN controller exposes POST Form/Save.
function saveFormEndpoint(): string {
  const cfg = getLocalPlatform();
  const base = getApiBaseLocal();
  // Defense-in-depth: if any Oqtane signal is present, always use Form (not Form/Save).
  const path = (cfg.platform === 'oqtane' || isOqtaneLocal()) ? 'Form' : 'Form/Save';
  return appendPlatformQueryLocal(base + path);
}
function appendErrorToChatLog(message: string): void {
  try {
    const log = document.getElementById('mf-ai-log') as HTMLElement | null;
    if (!log) return;
    const div = document.createElement('div');
    div.style.cssText = 'align-self:stretch;padding:10px 12px;margin:6px 0;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:13px;';
    div.textContent = '⚠ ' + message;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  } catch { /* ignore DOM errors */ }
}
function postJsonSync<T = any>(url: string, body: any, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...buildSaveHeadersLocal(), ...(extraHeaders || {}) };
  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(body || {}),
  }).then(r => r.text().then(text => {
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!r.ok) return Promise.reject({ status: r.status, statusText: r.statusText, payload, url });
    return payload as T;
  }));
}

// Snapshot of the most recent app-batch summary so the chat layer can
// surface it (link list of created forms, table list, errors).
(window as any).__mfai_lastAppBatch = null;

function opExecuteSql(op: Op): OpResult {
  const sql = String(op.sql || '').trim();
  if (!sql) return { op: op.op, ok: false, message: 'execute_sql needs `sql`' };
  const url = getAiBaseLocal() + 'AiTools/ExecuteDdl';
  const body: any = { sql, connectionKey: op.connectionKey || 'DashboardDatabase' };
  if ((op as any).dryRun) body.dryRun = true;
  // Run async but return ok-pending — the app_batch orchestrator awaits
  // the same promise to chain calls. We expose a per-op tracker on a
  // tracked map so app_batch can join.
  const promise = postJsonSync(url, body);
  (op as any).__pendingPromise = promise;
  // Fire-and-forget logging when called standalone
  promise.then(
    (j: any) => { console.log('[ai execute_sql]', j); },
    (e: any) => { console.warn('[ai execute_sql]', e); }
  );
  return { op: op.op, ok: true, message: 'execute_sql dispatched: ' + sql.split(/\s+/).slice(0, 4).join(' ') + '…' };
}

// [B86] set_record_visibility — turn the current form into an end-user portal
// with row-level security (each signed-in user sees ONLY their own records).
// Compiles to the server Portal/SetPrivate canonical rule.
function getCurrentFormIdForOps(): number {
  const el = document.querySelector('#mf-builder-root, [data-mf-builder]') as HTMLElement | null;
  const fromAttr = el ? parseInt(el.getAttribute('data-form-id') || '0', 10) : 0;
  if (fromAttr > 0) return fromAttr;
  const B = getBuilder();
  const cand = B && B.state && (B.state.formId || (B.state.config && B.state.config.formId) || (B.state.schema && B.state.schema.formId));
  const n = parseInt(String(cand || '0'), 10);
  return n > 0 ? n : 0;
}
function opSetRecordVisibility(op: Op): OpResult {
  const mode = String((op as any).mode || 'private-own').toLowerCase();
  const formId = getCurrentFormIdForOps();
  if (!formId) return { op: op.op, ok: false, message: 'set_record_visibility: no current form is open to apply visibility to.' };
  const enabled = /^(private|private-own|portal|own)$/.test(mode);
  let url = getApiBaseLocal() + 'Portal/SetPrivate';
  const w = window as any; const pf = w.__MF_PLATFORM__ || {};
  const isOq = String(pf.platform || '').toLowerCase() === 'oqtane' || !!w.Oqtane || !!w.__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
  if (isOq) { const mid = Number(pf.moduleId || 0) || 0; url += (url.indexOf('?') >= 0 ? '&' : '?') + 'entityid=' + mid + '&entityname=Module'; }
  const promise = postJsonSync(url, { formId, enabled });
  promise.then((j: any) => console.log('[ai set_record_visibility]', j), (e: any) => console.warn('[ai set_record_visibility]', e));
  return {
    op: op.op,
    ok: true,
    message: enabled
      ? 'Portal mode ON for form ' + formId + ' — each signed-in user now sees only their own records (admins see all). End-user page: /Modules/MegaForm/portal.html?formId=' + formId
      : 'Portal mode OFF for form ' + formId + ' — records are public again.',
  };
}

interface CreateFormSpec {
  title: string;
  description?: string;
  fields: any[];
  settings?: any;
  bindToTable?: { tableName: string; schemaName?: string; mapping?: Record<string, string> };
}

function buildInsertSqlFor(spec: CreateFormSpec, parsedTables?: ParsedTable[]): { insertSql: string; mapping: Record<string, string> } {
  const tbl    = spec.bindToTable!;
  const schema = tbl.schemaName || 'dbo';
  const table  = tbl.tableName;
  const skipTypes = new Set(['Row', 'Section', 'Heading', 'Divider', 'HtmlBlock', 'Image',
                              'DynamicLabel', 'DataRepeater', 'DataGrid', 'GridRepeater',
                              'Razor', 'FileUpload', 'File', 'Signature']);
  function walk(fields: any[], acc: { key: string; type: string }[]) {
    fields.forEach((f: any) => {
      if (f.type === 'Row' && Array.isArray(f.columns)) {
        f.columns.forEach((c: any) => walk(c.fields || [], acc));
        return;
      }
      if (!f.key || skipTypes.has(f.type)) return;
      acc.push({ key: f.key, type: f.type });
    });
  }
  const flat: { key: string; type: string }[] = [];
  walk(spec.fields || [], flat);

  // [v20260531-FixInsertColMap] Map field key (snake_case) to the REAL
  // column name from the parsed DDL. AI tends to assume column ==
  // field.key which gives INSERT INTO [Customers]([full_name],…) when
  // the table actually has [FullName]. Normalize by stripping
  // underscores + comparing case-insensitive.
  const realCols = (parsedTables || []).find(t =>
    t.name.toLowerCase() === table.toLowerCase() &&
    (t.schemaName || 'dbo').toLowerCase() === schema.toLowerCase()
  )?.columns || [];
  function resolveCol(fieldKey: string): string {
    var norm = fieldKey.toLowerCase().replace(/[_-]/g, '');
    var hit = realCols.find(c => c.name.toLowerCase().replace(/[_-]/g, '') === norm);
    return hit ? hit.name : fieldKey;
  }

  const userMap = (tbl.mapping || {}) as Record<string, string>;
  const cols     = flat.map(f => userMap[f.key] || resolveCol(f.key));
  const params   = flat.map(f => ':' + f.key);
  const insertSql = `INSERT INTO [${schema}].[${table}] (${cols.map(c => '[' + c + ']').join(', ')}) VALUES (${params.join(', ')})`;
  const mapping: Record<string, string> = {};
  flat.forEach(f => { mapping[':' + f.key] = f.key; });
  return { insertSql, mapping };
}

function opCreateForm(op: Op): OpResult {
  const spec = (op as any) as CreateFormSpec & { op: string; __parsedTables?: ParsedTable[] };
  if (!spec.title || !Array.isArray(spec.fields)) {
    return { op: op.op, ok: false, message: 'create_form needs `title` + `fields`' };
  }
  // [B172] Normalise composite alias field-types (also covers app_batch, which
  // dispatches one create_form per form).
  spec.fields.forEach(normalizeCompositeField);
  // Build a minimal FormInfo payload accepted by /Form/Save
  const schemaObj = { version: '1.0', fields: spec.fields, settings: spec.settings || {} };
  const settingsObj: any = (spec.settings && JSON.parse(JSON.stringify(spec.settings))) || {};

  // Auto-wire DatabaseInsert when bindToTable provided.
  if (spec.bindToTable && spec.bindToTable.tableName) {
    const { insertSql, mapping } = buildInsertSqlFor(spec, spec.__parsedTables);
    settingsObj.databaseInsert = {
      enabled: true,
      connectionKey: 'DashboardDatabase',
      databaseType: '',
      insertSql,
      parameterMapping: mapping,
    };
    schemaObj.settings = settingsObj;
  }

  const formInfo = {
    FormId: 0,
    Title: spec.title,
    Description: spec.description || '',
    Status: 'Draft',
    SchemaJson:    JSON.stringify(schemaObj),
    SettingsJson:  JSON.stringify(settingsObj),
    PreserveModuleBindingOnSave: true,   // server treats FormId=0 → INSERT
  };

  // [QA-20260615] Use platform-aware save endpoint + headers.
  // Oqtane: POST /api/MegaForm/Form, DNN: POST .../Form/Save.
  const primaryUrl = saveFormEndpoint();
  const fallbackUrl = getLocalPlatform().platform === 'oqtane'
    ? null
    : appendPlatformQueryLocal(getApiBaseLocal() + 'Form');

  function trySave(url: string): Promise<{ formId: number; message: string }> {
    return postJsonSync<{ formId: number; message: string }>(url, formInfo);
  }

  const promise = trySave(primaryUrl).catch((e: any) => {
    const status = e?.status || 0;
    // [QA-20260615] Fallback: if DNN returns 404/405/400 on Form/Save, try Form.
    if (fallbackUrl && (status === 404 || status === 405 || status === 400)) {
      console.warn('[ai create_form] primary save failed, retrying fallback', e);
      return trySave(fallbackUrl);
    }
    throw e;
  });

  (op as any).__pendingPromise = promise;
  promise.then(
    (j) => { console.log('[ai create_form]', spec.title, '→ formId', j.formId); },
    (e) => {
      const status = e?.status || '?';
      const detail = e?.payload?.Message || e?.payload?.message || e?.payload?.error || e?.statusText || String(e);
      console.warn('[ai create_form failed]', spec.title, status, detail);
      appendErrorToChatLog('create_form failed for "' + spec.title + '": HTTP ' + status + ' — ' + detail);
    }
  );
  return { op: op.op, ok: true, message: 'create_form dispatched: ' + spec.title };
}

interface AppBatchSpec {
  tables?: { ddl: string }[];           // each entry has a full CREATE TABLE
  forms?: (CreateFormSpec & { tableName?: string; schemaName?: string })[];
}

// ─────────────────────────────────────────────────────────────────────
//  [P2-#1] FK DDL parser — extract `[ChildId] … FOREIGN KEY REFERENCES
//  [schema].[Parent]([Id])` clauses from the AI's CREATE TABLE strings
//  so we can transform matching form fields into SQL-options dropdowns.
//  Also picks up the table name + the column list so we can guess a
//  sensible label column (Name / FullName / Title / Label / first-NVARCHAR).
// ─────────────────────────────────────────────────────────────────────

interface ParsedTable {
  name: string;
  schemaName: string;
  columns: { name: string; sqlType: string; nullable: boolean }[];
  pk: string;
  fks: { column: string; referencesTable: string; referencesSchema: string; referencesColumn: string }[];
}

function parseDdl(ddl: string): ParsedTable | null {
  const m = ddl.match(/CREATE\s+TABLE\s+\[?([\w]+)\]?\.\[?([\w]+)\]?\s*\(([\s\S]+?)\)\s*;?\s*$/i)
        || ddl.match(/CREATE\s+TABLE\s+\[?([\w]+)\]?\s*\(([\s\S]+?)\)\s*;?\s*$/i);
  if (!m) return null;
  let schemaName: string, name: string, body: string;
  if (m.length === 4) { schemaName = m[1]; name = m[2]; body = m[3]; }
  else { schemaName = 'dbo'; name = m[1]; body = m[2]; }
  const t: ParsedTable = { name, schemaName, columns: [], pk: 'Id', fks: [] };

  // Split top-level body on commas (ignore commas inside parens for DEFAULT(…))
  const parts: string[] = [];
  let depth = 0, buf = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(buf); buf = ''; }
    else buf += ch;
  }
  if (buf.trim()) parts.push(buf);

  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    // PRIMARY KEY inline
    const pkInline = line.match(/^\[?(\w+)\]?\s+.*\bPRIMARY\s+KEY\b/i);
    if (pkInline) {
      t.pk = pkInline[1];
      t.columns.push({ name: pkInline[1], sqlType: extractSqlType(line), nullable: false });
      continue;
    }
    // table-level CONSTRAINT FK
    const cFk = line.match(/CONSTRAINT\s+\[?\w+\]?\s+FOREIGN\s+KEY\s*\(\s*\[?(\w+)\]?\s*\)\s+REFERENCES\s+\[?([\w]+)\]?(?:\.\[?([\w]+)\]?)?\s*\(\s*\[?(\w+)\]?\s*\)/i);
    if (cFk) {
      const col = cFk[1];
      const ref = cFk[3] ? { schema: cFk[2], table: cFk[3] } : { schema: 'dbo', table: cFk[2] };
      const refCol = cFk[4];
      t.fks.push({ column: col, referencesTable: ref.table, referencesSchema: ref.schema, referencesColumn: refCol });
      continue;
    }
    // inline column FOREIGN KEY
    const cInline = line.match(/^\[?(\w+)\]?\s+[\w()\s,]+?\bFOREIGN\s+KEY\s+REFERENCES\s+\[?([\w]+)\]?(?:\.\[?([\w]+)\]?)?\s*\(\s*\[?(\w+)\]?\s*\)/i);
    if (cInline) {
      const col = cInline[1];
      const ref = cInline[3] ? { schema: cInline[2], table: cInline[3] } : { schema: 'dbo', table: cInline[2] };
      t.fks.push({ column: col, referencesTable: ref.table, referencesSchema: ref.schema, referencesColumn: cInline[4] });
      t.columns.push({ name: col, sqlType: extractSqlType(line), nullable: /\bNULL\b/i.test(line) && !/\bNOT\s+NULL\b/i.test(line) });
      continue;
    }
    // Plain column
    const colMatch = line.match(/^\[?(\w+)\]?\s+/);
    if (colMatch) {
      const isNull = !/\bNOT\s+NULL\b/i.test(line);
      t.columns.push({ name: colMatch[1], sqlType: extractSqlType(line), nullable: isNull });
    }
  }
  return t;
}
function extractSqlType(line: string): string {
  const m = line.match(/^\[?\w+\]?\s+(\w+(?:\s*\([^)]+\))?)/);
  return m ? m[1] : 'NVARCHAR(120)';
}
function guessLabelColumn(t: ParsedTable): string {
  const candidates = ['Name', 'FullName', 'Title', 'Label', 'DisplayName', 'Description'];
  for (const c of candidates) {
    const hit = t.columns.find(x => x.name.toLowerCase() === c.toLowerCase());
    if (hit) return hit.name;
  }
  // First NVARCHAR / VARCHAR column that is NOT the PK
  const firstStr = t.columns.find(c =>
    c.name.toLowerCase() !== t.pk.toLowerCase() &&
    /^N?VARCHAR/i.test(c.sqlType));
  return firstStr ? firstStr.name : (t.columns[1]?.name || t.pk);
}

/**
 * Walk all form fields and, for each Select / Radio whose field.key matches
 * a parsed FK column (case-insensitive, snake/Pascal forgiving), upgrade it
 * to `properties.optionsSource:"sql"` querying the parent table for
 * (value=Id, label=GuessedLabelColumn). NEVER overwrite an explicit
 * AI-supplied SQL config — only fill gaps.
 */
function autoWireFkDropdowns(fields: any[], tablesByCol: Record<string, { parent: ParsedTable; pkCol: string }>): number {
  let count = 0;
  function walk(arr: any[]) {
    arr.forEach(f => {
      if (f.type === 'Row' && Array.isArray(f.columns)) { f.columns.forEach((c: any) => walk(c.fields || [])); return; }
      if (!f.key) return;
      const norm = String(f.key).toLowerCase().replace(/[_-]/g, '');
      const hit = tablesByCol[norm];
      if (!hit) return;
      const parent = hit.parent;
      const labelCol = guessLabelColumn(parent);
      f.type = (f.type === 'Radio' || f.type === 'Checkbox') ? f.type : 'Select';
      f.properties = f.properties || {};
      const canonicalSql = 'SELECT [' + hit.pkCol + '] AS value, [' + labelCol + '] AS label FROM [' + parent.schemaName + '].[' + parent.name + '] ORDER BY [' + labelCol + ']';
      // [v20260531-FixSqlHallucination] ALWAYS overwrite optionsSql when
      // we have a DDL-derived canonical version. AI keeps emitting bogus
      // shapes like `SELECT [INT] AS value, [field_key] AS label FROM …`
      // because it confuses the column type (INT) with column name and
      // the snake_case field key with the PascalCase column. The DDL
      // parser knows the real PK + label columns, so its SQL wins.
      const existing = String(f.properties.optionsSql || '');
      const looksBogus = !existing
        || /\bAS\s+value\b/i.test(existing) === false
        || /\[INT\]|\[int\]|\bINT\s+AS\s+value\b/i.test(existing)              // [INT] hallucination
        || /SELECT\s+\[[a-z_]+\]\s+AS\s+value/.test(existing);                  // snake_case in SELECT (PK is always PascalCase Id)
      if (!f.properties.optionsSource || looksBogus) {
        f.properties.optionsSource        = 'sql';
        f.properties.optionsType          = 'sql';
        f.properties.optionsConnectionKey = 'DashboardDatabase';
        f.properties.optionsSql           = canonicalSql;
        f.options = [];
        count++;
      }
    });
  }
  walk(fields);
  return count;
}

function opAppBatch(op: Op): OpResult {
  const spec = (op as any) as AppBatchSpec;
  if ((!spec.tables || !spec.tables.length) && (!spec.forms || !spec.forms.length)) {
    return { op: op.op, ok: false, message: 'app_batch needs `tables` and/or `forms`' };
  }

  // [P2-#1] Parse every DDL to build a column → parent-table lookup so we
  // can auto-wire cascading SELECTs in the forms that reference these keys.
  const parsedTables: ParsedTable[] = [];
  const tablesByCol: Record<string, { parent: ParsedTable; pkCol: string }> = {};
  (spec.tables || []).forEach(t => {
    const pt = parseDdl(t.ddl);
    if (pt) {
      parsedTables.push(pt);
      // Map every column-name variant (snake / Pascal / lowercase) that
      // matches a child FK to its parent table.
      const colNorm = pt.name.toLowerCase().replace(/[_-]/g, '');
      tablesByCol[colNorm + 'id'] = { parent: pt, pkCol: pt.pk };
      tablesByCol[(colNorm.replace(/s$/, '')) + 'id'] = { parent: pt, pkCol: pt.pk };
    }
  });

  const summary: any = {
    tables: [], forms: [], startedAt: new Date().toISOString(),
    fkWiredFields: 0, parsedTables: parsedTables.length,
  };
  (window as any).__mfai_lastAppBatch = summary;

  const tablePromises = (spec.tables || []).map(t => {
    const sub: Op = { op: 'execute_sql', sql: t.ddl } as any;
    opExecuteSql(sub);
    return (sub as any).__pendingPromise
      .then((r: any) => {
        summary.tables.push({
          ddl: t.ddl.slice(0, 80) + (t.ddl.length > 80 ? '…' : ''),
          success: true,
          alreadyExists: !!r.alreadyExists,
          affected: r.affected,
        });
      })
      .catch((e: any) => {
        summary.tables.push({
          ddl: t.ddl.slice(0, 80) + (t.ddl.length > 80 ? '…' : ''),
          success: false,
          error: e?.payload?.error || String(e),
          sqlNumber: e?.payload?.sqlNumber,
        });
      });
  });

  Promise.all(tablePromises).then(() => {
    // [P2-#3] Continue even if some tables failed — only abort forms that
    // depend on a failed table. For MVP we treat all table failures as
    // soft: form creation still runs (auto-wire to existing tables).
    const formPromises = (spec.forms || []).map(f => {
      const sub: Op = { op: 'create_form', ...f } as any;
      if (!sub.bindToTable && (f as any).tableName) {
        sub.bindToTable = { tableName: (f as any).tableName, schemaName: (f as any).schemaName };
      }
      // Pass parsed DDL so buildInsertSqlFor can resolve real column names.
      (sub as any).__parsedTables = parsedTables;
      // Run FK auto-wire on a copy of the fields before sending
      if (sub.fields && parsedTables.length) {
        const wired = autoWireFkDropdowns(sub.fields, tablesByCol);
        summary.fkWiredFields += wired;
      }
      opCreateForm(sub);
      return (sub as any).__pendingPromise
        .then((r: any) => { summary.forms.push({ title: f.title, formId: r.formId, success: true, fkWiredFields: 0 }); })
        .catch((e: any) => { summary.forms.push({ title: f.title, success: false, error: e?.payload?.Message || e?.payload?.error || String(e) }); });
    });
    return Promise.all(formPromises);
  }).then(() => {
    summary.completedAt = new Date().toISOString();
    console.log('[ai app_batch] complete', summary);

    // [P2-#3] Render rich chat summary including failure details + Retry-failed button
    // [QA-20260615] Fixed selector: the AI chat log is #mf-ai-log, not mfai-chat-log.
    const log = document.getElementById('mf-ai-log') as HTMLElement | null;
    if (log) {
      const tablesOk      = summary.tables.filter((t: any) => t.success).length;
      const tablesExisted = summary.tables.filter((t: any) => t.success && t.alreadyExists).length;
      const formsOk       = summary.forms.filter((f: any) => f.success).length;
      const formsFailed   = summary.forms.filter((f: any) => !f.success);
      const tablesFailed  = summary.tables.filter((t: any) => !t.success);
      const allOk = formsFailed.length === 0 && tablesFailed.length === 0;

      const div = document.createElement('div');
      div.style.cssText = 'padding:12px 14px;margin:6px 0;background:' + (allOk ? '#ecfdf5' : '#fffbeb')
        + ';border:1px solid ' + (allOk ? '#6ee7b7' : '#fcd34d') + ';border-radius:8px;font-size:13px;color:'
        + (allOk ? '#065f46' : '#92400e');

      let html = '<strong>' + (allOk ? '✓ App batch complete' : '⚠ App batch partial') + '</strong> '
        + '— ' + tablesOk + '/' + summary.tables.length + ' tables '
        + (tablesExisted > 0 ? '(' + tablesExisted + ' already existed) ' : '')
        + ', ' + formsOk + '/' + summary.forms.length + ' forms'
        + (summary.fkWiredFields > 0 ? ', ' + summary.fkWiredFields + ' FK dropdown(s) auto-wired' : '')
        + '.';

      const formLinks = summary.forms.filter((f: any) => f.success)
        .map((f: any) => '<a href="/xx?mfFormId=' + f.formId + '#mf-builder" target="_blank" style="color:#0369a1;text-decoration:underline">' + esc(f.title) + ' (id ' + f.formId + ')</a>')
        .join(' · ');
      if (formLinks) html += '<div style="margin-top:6px">' + formLinks + '</div>';

      if (tablesFailed.length || formsFailed.length) {
        html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">' + (tablesFailed.length + formsFailed.length) + ' failure(s)</summary>';
        if (tablesFailed.length) html += '<div style="margin-top:4px"><strong>Tables:</strong><ul style="margin:4px 0 0 18px;padding:0">' + tablesFailed.map((t: any) => '<li><code>' + esc(t.ddl) + '</code> — ' + esc(t.error) + '</li>').join('') + '</ul></div>';
        if (formsFailed.length) html += '<div style="margin-top:4px"><strong>Forms:</strong><ul style="margin:4px 0 0 18px;padding:0">' + formsFailed.map((f: any) => '<li><strong>' + esc(f.title) + '</strong>: ' + esc(f.error) + '</li>').join('') + '</ul></div>';
        html += '<div style="margin-top:6px;font-size:11px;color:#78350f">Tables that already existed are kept (no rollback) so any data already in them is preserved.</div>';
        html += '</details>';
      }

      div.innerHTML = html;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    }

    // [P2-#4] Dispatch event so Dashboard / other UIs refresh form list
    try {
      var createdIds = summary.forms.filter((f: any) => f.success).map((f: any) => f.formId);
      window.dispatchEvent(new CustomEvent('mfai:forms-changed', {
        detail: { source: 'app_batch', createdIds, tablesCreated: summary.tables.filter((t: any) => t.success && !t.alreadyExists).length },
      }));
      // Cross-tab notify via localStorage poke (Dashboard tab can listen 'storage' event)
      try {
        localStorage.setItem('mfai:forms-changed', JSON.stringify({
          ts: Date.now(), createdIds, source: 'app_batch',
        }));
      } catch (_e) { /* private mode might block storage */ }
    } catch (e) { console.warn('[ai app_batch] event dispatch failed', e); }
  });

  const tableCount = (spec.tables || []).length;
  const formCount  = (spec.forms || []).length;
  return { op: op.op, ok: true, message: 'app_batch dispatched: ' + tableCount + ' tables + ' + formCount + ' forms (running…)' };
}

function esc(s: any): string {
  const t = s == null ? '' : String(s);
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function humanize(s: string): string {
  return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────
// Public dispatcher
// ─────────────────────────────────────────────────────────────────────────

const HANDLERS: Record<string, (op: Op) => OpResult> = {
  add_field: opAddField,
  remove_field: opRemoveField,
  set_field_property: opSetFieldProperty,
  set_field_sql: opSetFieldSql,
  apply_dynlabel_preset: opApplyDynLabelPreset,
  set_form_meta: opSetFormMeta,
  reorder_fields: opReorderFields,
  save_form: opSaveForm,
  chat_message: opChatMessage,
  // [v20260528-14] AI-driven schema editing — bulk replace + Unsplash image.
  replace_form_schema: opReplaceFormSchema,
  set_field_image_unsplash: opSetFieldImageUnsplash,
  // [v20260528-16] Relation-database ops — AI can list SQL tables & spawn
  // a Subform/DataGrid from a table name. Builder UI mirrors this via the
  // DB Tables FAB; AI uses these ops so prompts like "create an Invoice
  // form with subform OrderItems and auto Total" work end-to-end.
  add_subform_from_table: opAddSubformFromTable,
  add_field_from_column:  opAddFieldFromColumn,
  // [v20260531-AppBatch] Multi-form + tables in one AI turn — no chat exit.
  execute_sql:            opExecuteSql,
  create_form:            opCreateForm,
  app_batch:              opAppBatch,
  // [B86] Portal / row-level security — turn the form into a private per-user portal.
  set_record_visibility:  opSetRecordVisibility,
};

// [v20260530-24 ASK-DESIGN] Per-batch token so the orange bubble re-renders
// on EVERY new AI turn (not just the first one in the page lifetime).
let __askBubbleBatchToken = 0;

// [v20260530-25 ASK-DESIGN] Snapshot of the ops the dispatcher REJECTED at the
// ASK-DESIGN gate, so the A/B button click can REPLAY them automatically
// without making the user re-type their prompt.
let __lastRejectedBatch: Op[] = [];

// [v20260530-21 ASK-DESIGN] Ops that don't touch the form schema at all —
// safe to run on a customised form without asking the user first.
const NON_MUTATING_OPS = new Set(['chat_message', 'save_form']);

// [v20260602-B37] Detect a pure form-width tweak — set_form_meta touching ONLY
// themeCssOverrides[--mf-form-max-width] (and nothing else). When true the
// ASK-DESIGN gate is skipped because container width is not a "design" change.
function isPureWidthChange(op: any): boolean {
  if (!op || op.op !== 'set_form_meta') return false;
  // Recognise width-only intent across the 3 channels AI may emit
  const keys = Object.keys(op).filter(k => k !== 'op' && k !== 'designDecision' && k !== 'explain');
  // Allow themeCssOverrides path
  if (keys.length === 1 && keys[0] === 'themeCssOverrides') {
    const tco = op.themeCssOverrides || {};
    const tcoKeys = Object.keys(tco);
    return tcoKeys.length === 1 && tcoKeys[0] === '--mf-form-max-width';
  }
  // Allow customCssAppend path when the appended block is a single width rule
  if (keys.length === 1 && keys[0] === 'customCssAppend') {
    var s = String(op.customCssAppend || '').trim();
    var widthOnly = /^[^{}]*\{\s*(?:max-width|width)\s*:[^;}]+;?\s*(?:(?:max-width|width)\s*:[^;}]+;?\s*)?\}\s*$/i.test(s);
    return widthOnly;
  }
  return false;
}

/**
 * Default = PRESERVE design. When the current form has any non-empty
 * customisation (customHtml / customCss / customScripts / theme /
 * themeCssOverrides), the AI must FIRST chat_message ask the user "keep
 * design or change it?", get an explicit answer, then re-emit each op
 * with op.designDecision='preserve' or 'change' (or set
 * window.__mfai_session.designDecision before dispatching).
 *
 * Once a decision is recorded on window.__mfai_session.designDecision,
 * subsequent ops in the same browser session don't need to re-ask.
 * The user-side chat UI can reset this by calling
 * `window.MFAI_Ops.resetDesignDecision()` (exposed below).
 */
function checkDesignConfirmation(op: Op): OpResult | null {
  if (NON_MUTATING_OPS.has(String(op.op))) return null;
  // [v20260602-B37] WIDTH-ONLY exemption — when the op is a pure width
  // change (themeCssOverrides[--mf-form-max-width] only, no field/style/HTML
  // touches), it's NOT a design change. Container width grows/shrinks but
  // interior layout, theme, fonts, customHtml, customCss all stay intact.
  // Without this exemption the user has to answer A/B every time they say
  // "make form 100% width" on any premium form.
  if (op.op === 'set_form_meta' && isPureWidthChange(op)) return null;
  const schema = getSchema();
  const settings = (schema?.settings || (schema as any)?.Settings || {}) as any;
  const lengths: Record<string, number> = {};
  const has = (v: any): number => {
    if (v == null) return 0;
    if (typeof v === 'string') return v.trim().length;
    if (typeof v === 'object') return Object.keys(v).length;
    return 0;
  };
  const fields = [
    ['customHtml',     has(settings.customHtml     || settings.CustomHtml)],
    ['customCss',      has(settings.customCss      || settings.CustomCss)],
    ['customScripts',  has(settings.customScripts  || settings.CustomScripts)],
    ['theme',          has(settings.theme          || settings.Theme)],
    ['themeCssOverrides', has(settings.themeCssOverrides || settings.ThemeCssOverrides)],
  ] as Array<[string, number]>;
  const presentList = fields.filter(([, n]) => n > 0);
  if (presentList.length === 0) return null;  // no design to protect

  // Session-level decision: once set, all subsequent ops skip this check.
  const w = window as any;
  const session = w.__mfai_session = w.__mfai_session || {};
  if (session.designDecision === 'preserve' || session.designDecision === 'change') return null;

  // Per-op opt-in flag
  if (op.designDecision === 'preserve' || op.designDecision === 'change') {
    session.designDecision = op.designDecision;
    return null;
  }

  const detail = presentList.map(([k, n]) => k + ':' + (typeof n === 'number' && n > 0 && (k === 'customScripts' || k === 'themeCssOverrides') ? n + 'keys' : (n + 'ch'))).join(', ');
  const askText = 'Form này đã có thiết kế tuỳ biến (' + detail + '). Bạn muốn tôi: (A) GIỮ NGUYÊN thiết kế và chỉ cập nhật fields/logic theo yêu cầu của bạn — mặc định, an toàn nhất; hay (B) cho phép tôi cập nhật cả thiết kế (vd thay đổi màu/font/layout cho khớp mục đích mới)?';
  renderAskDesignBubble(askText);
  return {
    op: op.op, ok: false,
    message: '[ASK-DESIGN] This form has a custom design (' + detail + '). STOP — do NOT retry this op, do NOT call save_form, do NOT try alternative ops in this batch. Your VERY NEXT and ONLY action must be: {"op":"chat_message","text":' + JSON.stringify(askText) + '}. Then WAIT for the user reply. When the user replies (A / "giữ nguyên" / "preserve") → re-emit your real ops with `designDecision:"preserve"` on the FIRST op only. When the user replies (B / "thay đổi" / "change") → re-emit with `designDecision:"change"`. The session marker remembers the decision so subsequent ops in the same chat skip this gate.',
  };
}

// [v20260530-26] When the user has chosen `designDecision='preserve'`, the
// dispatcher strips ALL destructive design fields from incoming ops before any
// handler runs. This prevents the "AI edited customHtml once, second edit
// wipes it" bug — even if AI emits {customHtml:'', replaceCustomHtml:true} in
// a second turn (after the gate has been satisfied), the destructive fields
// silently fall off and the form's design survives intact.
const DESTRUCTIVE_FIELDS = ['customHtml', 'customCss', 'customScripts', 'theme', 'themeCssOverrides'];
const DESTRUCTIVE_FLAGS  = ['replaceCustomHtml', 'replaceCustomCss', 'replaceTheme'];
function scrubPreserveDesign(op: Op): Op {
  if (!op) return op;
  const w = window as any;
  if (w.__mfai_session?.designDecision !== 'preserve') return op;  // only scrub on preserve
  if (NON_MUTATING_OPS.has(String(op.op))) return op;
  const dropped: string[] = [];
  const copy: Op = { ...op };
  DESTRUCTIVE_FIELDS.forEach((f) => {
    const v = (copy as any)[f];
    // Strip when AI is BLANKING (most common wipe path).
    if (typeof v === 'string' && v.length === 0) { delete (copy as any)[f]; dropped.push(f + '=""'); return; }
    if (v && typeof v === 'object' && Object.keys(v).length === 0) { delete (copy as any)[f]; dropped.push(f + '={}'); return; }
  });
  // Also strip the explicit destructive-confirmation flags. With preserve
  // chosen, AI does not get to override the user's stated intent.
  DESTRUCTIVE_FLAGS.forEach((f) => {
    if ((copy as any)[f]) { delete (copy as any)[f]; dropped.push(f); }
  });
  // For replace_form_schema, scrub the embedded settings as well so the
  // auto-merge sees an empty value and back-fills from the existing settings.
  if (copy.op === 'replace_form_schema' && copy.schema && typeof copy.schema === 'object' && copy.schema.settings) {
    DESTRUCTIVE_FIELDS.forEach((f) => {
      const v = (copy.schema.settings as any)[f];
      if (typeof v === 'string' && v.length === 0) { delete (copy.schema.settings as any)[f]; dropped.push('schema.settings.' + f + '=""'); }
      else if (v && typeof v === 'object' && Object.keys(v).length === 0) { delete (copy.schema.settings as any)[f]; dropped.push('schema.settings.' + f + '={}'); }
    });
  }
  if (dropped.length) {
    try { console.info('[mfai preserve-scrub]', op.op, 'dropped:', dropped.join(', ')); } catch {}
  }
  return copy;
}

// Render the ASK-DESIGN question as an assistant message bubble directly in the
// chat log so the user sees it even if the AI fails to emit chat_message. The
// dispatcher does this once per session-design-decision cycle.
function renderAskDesignBubble(text: string): void {
  try {
    const w = window as any;
    const session = w.__mfai_session = w.__mfai_session || {};
    // [v20260530-24] Dedupe ONLY within the same dispatchOps batch. Fresh AI
    // turn ⇒ fresh batch token ⇒ bubble re-renders so user always sees the
    // A/B buttons in the latest chat scroll position.
    if (session.lastBubbleBatchToken === __askBubbleBatchToken) return;
    session.lastBubbleBatchToken = __askBubbleBatchToken;
    const log = document.getElementById('mf-ai-log');
    if (!log) return;
    const bubble = document.createElement('div');
    bubble.className = 'mf-ai-msg mf-ai-msg-assistant mf-ai-ask-design';
    bubble.style.cssText = 'align-self:flex-start;max-width:85%;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.5;box-shadow:0 1px 2px rgba(0,0,0,0.04);';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600;margin-bottom:4px;color:#c2410c;';
    head.textContent = '⚠ Form có thiết kế tuỳ biến — xác nhận';
    bubble.appendChild(head);
    const body = document.createElement('div');
    body.textContent = text;
    bubble.appendChild(body);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;';
    const makeBtn = (label: string, bg: string, fg: string, decision: 'preserve' | 'change') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = 'flex:1 1 auto;min-width:140px;padding:8px 12px;background:' + bg + ';color:' + fg + ';border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;';
      b.textContent = label;
      b.addEventListener('click', () => {
        const s = (w.__mfai_session = w.__mfai_session || {});
        s.designDecision = decision;
        try {
          btnRow.style.opacity = '0.55';
          btnRow.style.pointerEvents = 'none';
          Array.from(btnRow.querySelectorAll('button')).forEach((x: any) => { x.disabled = true; });
        } catch {}

        // [v20260530-25] Auto-replay the rejected batch right away so the user
        // doesn't have to re-type their prompt. The session marker is set, so
        // the gate releases.
        const replay = __lastRejectedBatch.slice();
        const ack = document.createElement('div');
        ack.style.cssText = 'align-self:flex-start;max-width:85%;background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:8px 11px;border-radius:8px;font-size:12px;';
        ack.textContent = decision === 'preserve'
          ? '✓ GIỮ NGUYÊN thiết kế — đang áp dụng ' + replay.length + ' thay đổi…'
          : '✓ CHO PHÉP thay đổi thiết kế — đang áp dụng ' + replay.length + ' thay đổi…';
        log.appendChild(ack);
        log.scrollTop = log.scrollHeight;

        if (replay.length) {
          // dispatchOps fires synchronously; render each result inline
          const results = dispatchOps(replay);
          results.forEach((r) => {
            const line = document.createElement('div');
            line.style.cssText = 'align-self:flex-start;max-width:90%;padding:6px 10px;border-radius:6px;font-size:12px;background:' + (r.ok ? '#f0fdf4' : '#fef2f2') + ';color:' + (r.ok ? '#15803d' : '#991b1b') + ';border:1px solid ' + (r.ok ? '#bbf7d0' : '#fecaca') + ';';
            line.textContent = (r.ok ? '✓ ' : '✗ ') + r.op + (r.message ? ' — ' + r.message : '');
            log.appendChild(line);
          });
          const successCount = results.filter((r) => r.ok).length;
          const tail = document.createElement('div');
          tail.style.cssText = 'align-self:flex-start;font-size:11px;color:#475569;margin-top:2px;';
          tail.textContent = successCount === results.length
            ? 'Hoàn tất — nhớ bấm Save để lưu form.'
            : (successCount + '/' + results.length + ' thành công. Xem chi tiết bên trên.');
          log.appendChild(tail);
          log.scrollTop = log.scrollHeight;
        }
      });
      return b;
    };
    btnRow.appendChild(makeBtn('A · Giữ nguyên thiết kế (an toàn)', '#fb923c', '#ffffff', 'preserve'));
    btnRow.appendChild(makeBtn('B · Cho phép thay đổi thiết kế', '#fff', '#9a3412', 'change'));
    bubble.appendChild(btnRow);

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:6px;font-size:11px;color:#7c2d12;opacity:0.8;';
    hint.textContent = 'Hoặc gõ "A" / "B" trong ô chat.';
    bubble.appendChild(hint);

    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
  } catch { /* DOM not ready or chat log missing — silent fallback */ }
}

export function dispatchOps(ops: Op[]): OpResult[] {
  __askBubbleBatchToken++;  // new batch ⇒ allow one bubble render this round
  __lastRejectedBatch = [];  // reset; gate will refill if it rejects anything
  const out: OpResult[] = [];
  if (!Array.isArray(ops)) return out;
  ops = ops.map(scrubPreserveDesign);  // [v20260530-26] strip destructive design fields when user chose PRESERVE
  // [AskDesignGateAbortBatch v20260601-B13] When the gate fires for the FIRST
  // op in a batch, the dispatcher used to keep iterating — every remaining op
  // ran the gate too and emitted an identical ASK-DESIGN reject. AI saw 6
  // copies of the same error and got confused. Abort the batch on first gate
  // fire; subsequent ops get a soft "batch-aborted" result that's NOT a real
  // reject the AI should react to.
  let batchAbortedByGate = false;
  ops.forEach((op) => {
    if (batchAbortedByGate) {
      __lastRejectedBatch.push(op);  // queue for auto-replay on A/B click
      const r: OpResult = { op: op.op, ok: false, message: '[ASK-DESIGN] Batch paused — waiting for user A/B decision (see bubble above). This op will auto-replay after the choice. DO NOT re-emit it.' };
      out.push(r);
      return;
    }
    if (!op || !op.op) {
      const r: OpResult = { op: '(unknown)', ok: false, message: 'Missing op field' };
      out.push(r);
      reportFeedback(op, r);
      return;
    }
    const handler = HANDLERS[op.op];
    if (!handler) {
      const r: OpResult = { op: op.op, ok: false, message: 'Unknown op: ' + op.op };
      out.push(r);
      reportFeedback(op, r);
      return;
    }
    // ASK-DESIGN gate — runs before every handler.
    const askResult = checkDesignConfirmation(op);
    if (askResult) {
      out.push(askResult);
      __lastRejectedBatch.push(op);  // snapshot for A/B click auto-replay
      reportFeedback(op, askResult);
      // [AskDesignGateAbortBatch v20260601-B13] Flag the batch as aborted so
      // remaining ops short-circuit instead of re-firing the gate.
      batchAbortedByGate = true;
      return;
    }
    try {
      const r = handler(op);
      out.push(r);
      if (!r.ok) reportFeedback(op, r);
    } catch (e) {
      const r: OpResult = { op: op.op, ok: false, message: 'Op error: ' + (e as Error).message };
      out.push(r);
      reportFeedback(op, r);
    }
  });
  return out;
}

// Expose a session reset hook so the chat UI / user can clear the
// design decision (e.g. when starting a new prompt where context changes).
function resetDesignDecision(): void {
  const w = window as any;
  if (w.__mfai_session) {
    delete w.__mfai_session.designDecision;
    delete w.__mfai_session.lastBubbleBatchToken;
  }
}

/**
 * [v20260530-13] Fire-and-forget dispatcher feedback log. Every ok:false
 * result lands in MF_AI_KB_Feedback so admin can review + promote good
 * fix patterns into MF_AI_KB_Templates. Includes the original op JSON
 * (so the AI's exact attempt is preserved) and an inferred ruleId when
 * the rejection message cites one (e.g. "DL-001").
 */
function reportFeedback(op: any, result: OpResult): void {
  try {
    const ruleId = pickRuleId(result?.message);
    const widgetType = op && (op.type || op.widgetType) ? String(op.type || op.widgetType) : undefined;
    logFeedback({
      ruleId,
      widgetType,
      op: result?.op || (op && op.op),
      attemptedJson: JSON.stringify(op ?? null),
      rejectionMessage: result?.message,
      outcome: 'rejected',
    });
  } catch { /* never throw from dispatcher */ }
}

export function listOpSchemas(): Array<{ op: string; description: string; params: string }> {
  return [
    { op: 'add_field', description: 'Insert a new MegaForm field', params: '{type, key?, label, required?, placeholder?, helpText?, defaultValue?, validation?, options?, widgetProps?, insertAt?}' },
    { op: 'remove_field', description: 'Remove a field by key', params: '{key}' },
    { op: 'set_field_property', description: 'Set a property of an existing field (dot path)', params: '{key, path, value}' },
    { op: 'set_field_sql', description: 'Configure SQL widget settings on a field', params: '{key, masterQuery, mode?: "simple"|"multi", templates?: {header,detail,footer,pager,simple}, queryDependsOn?, pageSize?}' },
    { op: 'apply_dynlabel_preset', description: 'Apply a DynamicLabel widget preset by index or label match', params: '{key, presetIndex?, presetLabel?}' },
    { op: 'set_form_meta', description: 'Set form title/description/buttons OR mutate settings.customCss / customHtml / customScripts / theme / themeCssOverrides. PREFER customCssAppend over customCss when modifying a premium form so you do not need to re-send the existing 5-10KB stylesheet. customHtml replacement requires replaceCustomHtml:true (PRESERVE-002).', params: '{title?, description?, submitButtonText?, successMessage?, customCss?, customCssAppend?, customHtml?, customHtmlAppend?, replaceCustomHtml?, customScripts?, theme?, themeCssOverrides?}' },
    { op: 'reorder_fields', description: 'Reorder fields by an array of keys (unmentioned keys keep their order at the end)', params: '{keys: [string]}' },
    { op: 'save_form', description: 'Trigger the Save button', params: '{}' },
    { op: 'chat_message', description: 'Send a textual message back to the user (the AI uses this to explain its actions)', params: '{text}' },
    { op: 'replace_form_schema', description: 'Replace the entire form schema in one shot (use for big structural rewrites instead of dozens of small ops)', params: '{schema: {version, fields:[...], settings:{...}}}' },
    { op: 'set_field_image_unsplash', description: 'Set a real visible Unsplash image URL on a field (no API key needed, always renders). Pass `query` keywords; we generate the URL.', params: '{key, query, width?, height?, alt?, target?: "defaultValue"|"htmlContent"|"widgetProps.imageUrl"}' },
    { op: 'add_subform_from_table', description: 'Insert a Subform (DataGrid) bound to a SQL table on the DashboardDatabase. Columns auto-detected via /Subform/Columns. Set totalField + totalFormula="Sum(\"qty * price\")" for live totals.', params: '{tableName, parentKeyColumn?, totalField?, totalFormula?, label?}' },
    { op: 'add_field_from_column', description: 'Insert a single input field bound to a SQL column from a DashboardDatabase table. Type inferred from data type.', params: '{tableName, columnName, key?}' },
    // [v20260531-AppBatch] Multi-form + relational-DB-table creation in ONE turn.
    { op: 'execute_sql', description: 'Host-only. Run ONE additive SQL statement on DashboardDatabase. Server guard (SqlDdlGuard) enforces EXACTLY ONE statement and an additive allow-list: CREATE TABLE / CREATE INDEX / ALTER TABLE ... ADD / INSERT. DROP, DELETE, TRUNCATE, UPDATE, MERGE, multi-statement (";"-separated), GO batches and EXEC/xp_ are REJECTED. Use this for CREATE TABLE in the app_batch flow; pass {dryRun:true} to validate without persisting.', params: '{sql, connectionKey?, dryRun?}' },
    { op: 'create_form', description: 'Create a brand-new MegaForm without leaving the chat. Pass {title, fields, settings?, bindToTable?:{tableName, schemaName?, mapping?}}. When bindToTable is set the form auto-wires settings.databaseInsert so each submission INSERTs a row into the target table.', params: '{title, description?, fields:[...], settings?, bindToTable?:{tableName, schemaName?, mapping?}}' },
    { op: 'app_batch', description: 'Atomic multi-form + multi-table app creation. Pass {tables:[{ddl}], forms:[{title, fields, settings?, tableName?, schemaName?, mapping?}]}. Server runs every DDL then every create_form sequentially; chat summary lists created formIds. Use this for "create an app with forms for X, Y, Z + relational DB" prompts.', params: '{tables:[{ddl}], forms:[{title, fields, tableName?, bindToTable?, ...}]}' },
    { op: 'set_record_visibility', description: 'Turn the CURRENT form into an end-user PORTAL with row-level security. mode "private-own" = every signed-in user sees ONLY the records they submitted (customer portal, support tickets, "my applications"); admins always see all; anonymous is blocked. mode "public" = anyone can browse (default). Use when the user says: "make this a customer portal", "each user/customer should only see their own", "mỗi khách chỉ thấy ticket/đơn của mình", "biến form này thành cổng khách hàng", "private submissions per user". After applying, the end-user page is /Modules/MegaForm/portal.html?formId=N (or mfpanel=portal).', params: '{mode: "private-own"|"public"}' },
  ];
}

export const opsBadge = OPS_BADGE;

// Expose for chat.ts and external callers.
(window as any).MFAI_Ops = { dispatchOps, listOpSchemas, resetDesignDecision, badge: OPS_BADGE };
