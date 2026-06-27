/* [split 2026-06-27] Extracted from the former 2408-line ops.ts. */
// [v20260601-B27] Platform-aware Subform endpoint resolver.
// DNN:    /DesktopModules/MegaForm/API/Subform/<path>
// Oqtane: /api/MegaFormPopup/Subform/<path>  (NOT /api/MegaForm/Subform — that 404s)
export function subformUrl(path: string, qs?: Record<string, string | number>): string {
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
// ─────────────────────────────────────────────────────────────────────────
// Template-guide enforcement (client-side hard guard).
// chat.ts fetches the guide and stores the parsed frontmatter on
// window.__mfai_session.templateGuide so this synchronous dispatcher can
// enforce immutable/mutable rules without a network round-trip.
// ─────────────────────────────────────────────────────────────────────────
export function getActiveTemplateGuide(): any {
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

export function guideLockedKeys(guide: any): string[] {
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

export function guideForbiddenTypes(guide: any): string[] {
  if (!guide || typeof guide !== 'object') return [];
  const policy = guide.compositeWidgetPolicy || {};
  return Array.isArray(policy.forbiddenFieldTypes)
    ? policy.forbiddenFieldTypes.map((t: string) => String(t).toLowerCase())
    : [];
}

export function guideImmutableDesign(guide: any): { customHtml: boolean; customCss: boolean; theme: boolean; scripts: boolean } {
  const out = { customHtml: false, customCss: false, theme: false, scripts: false };
  if (!guide || !Array.isArray(guide.immutableRules)) return out;
  const text = guide.immutableRules.join(' ').toLowerCase();
  if (text.indexOf('customhtml') >= 0 || text.indexOf('custom html') >= 0) out.customHtml = true;
  if (text.indexOf('customcss') >= 0 || text.indexOf('custom css') >= 0) out.customCss = true;
  if (text.indexOf('theme') >= 0) out.theme = true;
  if (text.indexOf('customscripts') >= 0 || text.indexOf('custom scripts') >= 0) out.scripts = true;
  return out;
}

export function guideDefaultAppendPanel(guide: any): string | null {
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
export const ALLOWED_IMAGE_HOSTS = [
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

export function isAllowedImageUrl(u: string): boolean {
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

export function uniqKey(base: string, existing: string[]): string {
  const slug = String(base || 'field').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  if (existing.indexOf(slug) < 0) return slug;
  for (let i = 2; i < 999; i++) {
    const candidate = slug + '_' + i;
    if (existing.indexOf(candidate) < 0) return candidate;
  }
  return slug + '_' + Date.now();
}

export function getBuilder(): any {
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
export function getSchema(): any {
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

export function reRenderCanvas(): void {
  const B = getBuilder();
  if (!B) return;
  try {
    if (typeof B.callModule === 'function') B.callModule('canvas', 'render');
    else if (B.canvas && typeof B.canvas.render === 'function') B.canvas.render();
  } catch (_e) { /* ignore */ }
  try { if (B.state) B.state.isDirty = true; } catch (_e) { /* ignore */ }
}

export function setCanvasTitle(title: string, desc?: string): void {
  try {
    const t = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-title') as HTMLInputElement | null : null;
    if (t && typeof title === 'string') { t.value = title; t.dispatchEvent(new Event('input', { bubbles: true })); }
    if (desc !== undefined) {
      const d = (typeof document !== 'undefined' && document) ? document.getElementById('mf-canvas-description') as HTMLInputElement | null : null;
      if (d) { d.value = String(desc || ''); d.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  } catch (_e) { /* ignore */ }
}

export function findField(key: string): any {
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
export function normalizeOptionFields(field: any): void {
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
export function normalizeDynamicLabelProps(field: any): void {
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
export function normalizeDataRepeaterProps(field: any): void {
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

export function setByPath(target: any, path: string, value: any): void {
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
// [QA-20260615b] Defense-in-depth for §5.3: 'Listbox' is NOT a native MegaForm
// widget type. The system prompt asks the model to map it to Select/MultiSelect,
// but if the model ignores that, normalise here so a hallucinated type can never
// reach the renderer (which would render an unknown type as a bare text input).
export function normalizeFieldType(t: string): string {
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
export const COMPOSITE_ALIAS_PRESET: Record<string, string> = {
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
export function resolveCompositeAlias(t: string): string | null {
  const norm = String(t || '').toLowerCase().replace(/[\s_-]+/g, '');
  return COMPOSITE_ALIAS_PRESET[norm] || null;
}
// Rewrite a friendly composite alias field-type to the canonical Composite shape.
// Mutates + returns the field. No-op for non-composite types so it is safe to map
// over an entire fields[] array.
export function normalizeCompositeField(field: any): any {
  if (!field || typeof field !== 'object') return field;
  const preset = resolveCompositeAlias(field.type);
  if (preset) {
    field.type = 'Composite';
    field.widgetProps = (field.widgetProps && typeof field.widgetProps === 'object') ? field.widgetProps : {};
    if (!field.widgetProps.preset) field.widgetProps.preset = preset;
  }
  return field;
}
// [v20260530-28] Verify a rule array matches the engine's required shape so
// silent half-broken rules don't ship. Returns {ok, rules, error}.
export function validateRuleArray(arr: any[]): { ok: boolean; rules: any[]; error?: string } {
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
