import { renderTemplateWithLookups } from '../templating/engine';
import { escapeForToken, formatValue, LookUpEngine, type ILookUp } from '../templating/lookup';
import { renderSubmissionDisplayHtml, type SubmissionDisplayOptions } from './display';

/**
 * Shared helpers for submission view bundles.
 *
 * Two reasons this module is separate from the form renderer
 * (`src/renderer/`):
 *   1. The form renderer is the input/edit engine — heavy with field
 *      rendering, validation, conditional logic, multi-step pages, etc.
 *      List/Card views are read-only browse surfaces — they should not
 *      pull all that weight (or risk breaking it).
 *   2. Each view mode is its own Vite entry → each gets its own bundle
 *      file → small, isolated, easy to maintain. A bug in card.ts can
 *      never break the form renderer.
 */

export interface SubmissionViewConfig {
  /** Form id whose submissions to render. */
  formId: number;
  /** API base — defaults to "/api/MegaForm/". */
  apiBase: string;
  /** Comma-separated field keys (informational; templates control output). */
  fields: string[];
  /** Admin-supplied HTML template repeated per submission. */
  template: string;
  /** Optional page size (max rows fetched). */
  pageSize: number;
  /** Optional legacy card grid tuning from JSON design spec. */
  cardMinWidth?: number;
  gridGap?: number;
  /** Optional empty-state message. */
  emptyMessage: string;
  /** Optional bound app query key selected by the active named view. */
  queryKey?: string;
  /** Optional host-supplied token context (form/module/user/query). */
  context: TemplateContext;
}

export interface SubmissionRow {
  submissionId: number;
  formId: number;
  submittedOnUtc: string;
  status: string;
  activeTaskId?: string;
  availableActions?: Array<Record<string, unknown>>;
  /** Field values keyed by field key — server may put them under .data or as
   *  flat properties. The shared `readField` helper handles both shapes. */
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TemplateContext {
  form?: Record<string, unknown>;
  module?: Record<string, unknown>;
  user?: Record<string, unknown>;
  query?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PlatformRequestContext {
  platform: string;
  moduleId: number;
  siteId: number;
}

export function readConfigFromElement(root: HTMLElement): SubmissionViewConfig {
  const ds = root.dataset;
  const formId = parseInt(ds.mfFormId || ds.formId || '0', 10) || 0;
  const moduleId = parseInt(ds.mfModuleId || ds.moduleId || '0', 10) || 0;
  const inputFields = String(ds.mfFields || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const normalized = normalizeLegacyTemplateConfig(String(ds.mfTemplate || ''), inputFields, parseInt(ds.mfPageSize || '50', 10) || 50);
  return {
    formId,
    apiBase: (ds.mfApiBase || '/api/MegaForm/').replace(/\/?$/, '/'),
    fields: normalized.fields,
    template: normalized.template,
    pageSize: normalized.pageSize,
    cardMinWidth: normalized.cardMinWidth,
    gridGap: normalized.gridGap,
    emptyMessage: String(ds.mfEmptyMessage || 'No submissions yet.'),
    queryKey: String(ds.mfQueryKey || '').trim(),
    context: parseTemplateContextFromElement(root, {
      form: { id: formId },
      module: { id: moduleId },
    }),
  };
}

function normalizeLegacyTemplateConfig(
  rawTemplate: string,
  inputFields: string[],
  inputPageSize: number,
): {
  template: string;
  fields: string[];
  pageSize: number;
  cardMinWidth?: number;
  gridGap?: number;
} {
  const fallback = {
    template: String(rawTemplate || ''),
    fields: inputFields,
    pageSize: inputPageSize,
  };
  const trimmed = String(rawTemplate || '').trim();
  if (!trimmed || !trimmed.startsWith('{')) return fallback;
  try {
    const spec = JSON.parse(trimmed);
    if (!spec || typeof spec !== 'object' || Array.isArray(spec) || !spec.version) return fallback;
    if (Array.isArray(spec.cells)) {
      const fields = spec.cells
        .map((cell: any) => String(cell?.key || '').trim())
        .filter(Boolean);
      return {
        template: String(spec.cardTemplate || ''),
        fields: fields.length ? fields : inputFields,
        pageSize: toPositiveInt(spec.pageSize, inputPageSize),
        cardMinWidth: toPositiveInt(spec.cardMinWidth, 260),
        gridGap: toPositiveInt(spec.gridGap, 16),
      };
    }
    if (Array.isArray(spec.fields)) {
      const fields = spec.fields
        .map((field: any) => String(field?.key || '').trim())
        .filter(Boolean);
      return {
        template: String(spec.rowTemplate || ''),
        fields: fields.length ? fields : inputFields,
        pageSize: toPositiveInt(spec.pageSize, inputPageSize),
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const next = parseInt(String(value ?? ''), 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

export function parseTemplateContextFromElement(root: HTMLElement, defaults?: TemplateContext): TemplateContext {
  const ds = root?.dataset || ({} as DOMStringMap);
  return buildTemplateContext(ds.mfContextJson || '', defaults);
}

export function buildTemplateContext(rawJson?: string, defaults?: TemplateContext): TemplateContext {
  let parsed: Record<string, unknown> = {};
  if (rawJson && rawJson.trim()) {
    try {
      const next = JSON.parse(rawJson);
      if (next && typeof next === 'object' && !Array.isArray(next)) parsed = next as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  const platform = readPlatformContext();
  const query = readQueryContext();
  const ctx: TemplateContext = {
    ...defaults,
    ...platform.root,
    ...parsed,
  };

  ctx.form = mergeContextRecord(defaults?.form, platform.form, parsed.form);
  ctx.module = mergeContextRecord(defaults?.module, platform.module, parsed.module);
  ctx.user = mergeContextRecord(defaults?.user, platform.user, parsed.user);
  ctx.query = mergeContextRecord(defaults?.query, query, parsed.query);
  return ctx;
}

export function buildAuthorizedApiUrl(baseUrl: string, endpoint: string, context?: TemplateContext): string {
  const rawUrl = joinApiUrl(baseUrl, endpoint);
  if (typeof window === 'undefined') return rawUrl;

  const requestContext = readPlatformRequestContext(context);
  if (requestContext.platform !== 'oqtane' || requestContext.moduleId <= 0 || requestContext.siteId <= 0) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl, window.location.origin);
    if (!url.searchParams.has('authmoduleid')) url.searchParams.set('authmoduleid', String(requestContext.moduleId));
    if (!url.searchParams.has('authsiteid')) url.searchParams.set('authsiteid', String(requestContext.siteId));
    return toRelativeOrAbsoluteUrl(url);
  } catch {
    return rawUrl;
  }
}

function mergeContextRecord(...parts: Array<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
    Object.assign(out, part as Record<string, unknown>);
  }
  return out;
}

function readPlatformContext(): {
  root: Record<string, unknown>;
  form: Record<string, unknown>;
  module: Record<string, unknown>;
  user: Record<string, unknown>;
} {
  if (typeof window === 'undefined') {
    return { root: {}, form: {}, module: {}, user: {} };
  }
  const raw = (window as any).__MF_PLATFORM__;
  const platform = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const module: Record<string, unknown> = {};
  if (platform.moduleId != null) module.id = platform.moduleId;
  if (platform.pageId != null) module.pageId = platform.pageId;
  if (platform.siteId != null) module.siteId = platform.siteId;
  if (platform.portalId != null) module.portalId = platform.portalId;
  if (platform.platform != null) module.platform = platform.platform;
  if (platform.rendererHostUrl != null) module.rendererHostUrl = platform.rendererHostUrl;

  const userRaw = platform.user && typeof platform.user === 'object' && !Array.isArray(platform.user)
    ? platform.user as Record<string, unknown>
    : {};
  const user = mergeContextRecord(userRaw);
  if (platform.isAdmin != null && user.isAdmin == null) user.isAdmin = platform.isAdmin;
  if (platform.userId != null && user.id == null) user.id = platform.userId;
  if (platform.userName != null && user.userName == null) user.userName = platform.userName;
  if (platform.displayName != null && user.displayName == null) user.displayName = platform.displayName;
  if (platform.isAuthenticated != null && user.isAuthenticated == null) user.isAuthenticated = platform.isAuthenticated;

  return {
    root: {},
    form: {},
    module,
    user,
  };
}

function readQueryContext(): Record<string, unknown> {
  if (typeof window === 'undefined' || !window.location) return {};
  const out: Record<string, unknown> = {};
  try {
    const params = new URLSearchParams(window.location.search || '');
    params.forEach((value, key) => {
      const existing = out[key];
      if (existing == null) {
        out[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        out[key] = [existing, value];
      }
    });
  } catch {
    return {};
  }
  return out;
}

function readPlatformRequestContext(context?: TemplateContext): PlatformRequestContext {
  const moduleCtx = context?.module && typeof context.module === 'object'
    ? context.module as Record<string, unknown>
    : {};
  const platformRaw = typeof window !== 'undefined' && (window as any).__MF_PLATFORM__ && typeof (window as any).__MF_PLATFORM__ === 'object'
    ? (window as any).__MF_PLATFORM__ as Record<string, unknown>
    : {};
  return {
    platform: String(moduleCtx.platform ?? platformRaw.platform ?? '').trim().toLowerCase(),
    moduleId: asPositiveInt(moduleCtx.id ?? platformRaw.moduleId),
    siteId: asPositiveInt(moduleCtx.siteId ?? moduleCtx.portalId ?? platformRaw.siteId ?? platformRaw.portalId),
  };
}

function asPositiveInt(value: unknown): number {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function joinApiUrl(baseUrl: string, endpoint: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(endpoint || '').replace(/^\/+/, '')}`;
}

function toRelativeOrAbsoluteUrl(url: URL): string {
  return url.origin === window.location.origin
    ? url.pathname + (url.search || '') + (url.hash || '')
    : url.toString();
}

export function htmlEscape(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Read a field value from a submission, accepting both nested and flat shapes.
 *  [SubmissionsDataParse v20260507-29] Also unwraps widget value-objects of the
 *  form `{ value, displayValue, … }` (e.g. dropdown / file widgets) so the
 *  rendered cell shows the human label instead of `[object Object]`. */
export function readField(submission: SubmissionRow, key: string): unknown {
  if (!key) return '';
  return unwrapFieldValue(readFieldRaw(submission, key));
}

function unwrapFieldValue(v: unknown): unknown {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => unwrapFieldValue(x)).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const o = v as any;
    // [SubmitJsonElementFix v20260508-01] Detect legacy mis-serialised
    // System.Text.Json.JsonElement values (shape: { ValueKind: N }) — these
    // are unrecoverable on the client (the actual value was lost when the
    // server wrote it) so render as empty rather than literal "{ValueKind:3}".
    if (o.ValueKind != null && Object.keys(o).length === 1) return '';
    if (o.displayValue != null && o.displayValue !== '') return o.displayValue;
    if (o.DisplayValue != null && o.DisplayValue !== '') return o.DisplayValue;
    if (o.value != null && o.value !== '') return o.value;
    if (o.Value != null && o.Value !== '') return o.Value;
    if (o.fileName != null) return o.fileName;
    if (o.FileName != null) return o.FileName;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return v;
}

function readFieldRaw(submission: SubmissionRow, key: string): unknown {
  if (!submission || !key) return '';
  const nested = submission.data ? readRecordValue(submission.data, key) : undefined;
  if (nested !== undefined) return nested;
  const topLevel = readRecordValue(submission as Record<string, unknown>, key);
  return topLevel !== undefined ? topLevel : '';
}

export function applyTemplate(template: string, submission: SubmissionRow, context?: TemplateContext): string {
  if (!template) return '';
  return renderTemplateWithLookups(template, buildSubmissionLookUpEngine(submission, [submission], context));
}

export function renderFieldDisplayHtml(rawValue: unknown, options?: SubmissionDisplayOptions): string {
  const displayHtml = renderSubmissionDisplayHtml(rawValue, options);
  if (displayHtml) return displayHtml;
  const plain = escapeForToken(formatValue(unwrapFieldValue(rawValue)));
  return plain || '<span class="mf-sub-display-empty">—</span>';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function buildSubmissionLookUpEngine(submission: SubmissionRow, submissions: SubmissionRow[], context?: TemplateContext): LookUpEngine {
  const ctx = buildTemplateContext('', context);
  return new LookUpEngine(null, [
    createSubmissionLookUp(submission),
    createFieldLookUp(submission),
    createSubmissionsLookUp(submissions),
    createNamedObjectLookUp('form', ctx.form),
    createNamedObjectLookUp('module', ctx.module),
    createNamedObjectLookUp('user', ctx.user),
    createNamedObjectLookUp('query', ctx.query),
  ]);
}

function createSubmissionLookUp(submission: SubmissionRow): ILookUp {
  return {
    name: 'submission',
    get(key, format) {
      const normalized = String(key || '').trim().toLowerCase();
      if (normalized === 'date' || normalized === 'submittedonutc') {
        return renderTokenValue(format ? submission.submittedOnUtc : formatDate(submission.submittedOnUtc), format);
      }
      return renderTokenValue(resolveSubmissionValueRaw(submission, key), format, { allowRichDisplay: true, fieldKey: key });
    },
    getRaw(key) {
      return resolveSubmissionValueRaw(submission, key);
    },
  };
}

function createFieldLookUp(submission: SubmissionRow): ILookUp {
  return {
    name: 'field',
    get(key, format) {
      return renderTokenValue(resolveFieldValueRaw(submission, key), format, { allowRichDisplay: true, fieldKey: key });
    },
    getRaw(key) {
      return resolveFieldValueRaw(submission, key);
    },
  };
}

function createSubmissionsLookUp(submissions: SubmissionRow[]): ILookUp {
  return {
    name: 'submissions',
    get(key) {
      const normalized = String(key || '').trim().toLowerCase();
      if (normalized === 'count') return String(submissions.length);
      return '';
    },
    getRaw(key) {
      const normalized = String(key || '').trim().toLowerCase();
      if (!normalized) return submissions;
      if (normalized === 'count') return submissions.length;
      return undefined;
    },
  };
}

function createNamedObjectLookUp(name: string, source?: Record<string, unknown>): ILookUp {
  return {
    name,
    get(key, format) {
      return renderTokenValue(resolveNamedContextValue(source, key), format);
    },
    getRaw(key) {
      return resolveNamedContextValue(source, key);
    },
  };
}

function renderTokenValue(
  value: unknown,
  format?: string,
  options?: { allowRichDisplay?: boolean; fieldKey?: string; fieldType?: string },
): string {
  if (options?.allowRichDisplay && !shouldForcePlainToken(format)) {
    const displayHtml = renderSubmissionDisplayHtml(value, {
      fieldKey: options.fieldKey,
      fieldType: options.fieldType,
    });
    if (displayHtml) return displayHtml;
  }
  return escapeForToken(formatValue(unwrapFieldValue(value), normalizePlainTokenFormat(format)));
}

function shouldForcePlainToken(format?: string): boolean {
  const normalized = String(format || '').trim().toLowerCase();
  return normalized === 'text' || normalized === 'plain' || normalized === 'raw'
    || normalized === 'upper' || normalized === 'upper-case' || normalized === 'uppercase'
    || normalized === 'lower' || normalized === 'lower-case' || normalized === 'lowercase'
    || normalized === 'title' || normalized === 'title-case'
    || /^[ndpcfe]\d*$/i.test(normalized)
    || /^(yyyy|yy|mm|m|dd|d|hh|h|ss|s|'|[\/:\- ])+/i.test(normalized);
}

function normalizePlainTokenFormat(format?: string): string | undefined {
  const normalized = String(format || '').trim().toLowerCase();
  if (normalized === 'text' || normalized === 'plain' || normalized === 'raw'
    || normalized === 'display' || normalized === 'html' || normalized === 'media' || normalized === 'auto') {
    return undefined;
  }
  return format;
}

function resolveNamedContextValue(source: Record<string, unknown> | undefined, keyPath: string): unknown {
  if (!source) return '';
  const segments = splitKeyPath(keyPath);
  if (!segments.length) return source;
  const [head, ...rest] = segments;
  const root = readRecordValue(source, head);
  if (!rest.length) return root;
  return resolvePath(root, rest);
}

function resolveSubmissionValue(submission: SubmissionRow, keyPath: string): unknown {
  return unwrapFieldValue(resolveSubmissionValueRaw(submission, keyPath));
}

function resolveSubmissionValueRaw(submission: SubmissionRow, keyPath: string): unknown {
  const segments = splitKeyPath(keyPath);
  if (!segments.length) return '';
  const [head, ...rest] = segments;
  const normalized = head.toLowerCase();

  let current: unknown;
  switch (normalized) {
    case 'id':
    case 'submissionid':
      current = submission.submissionId;
      break;
    case 'formid':
      current = submission.formId;
      break;
    case 'date':
    case 'submittedonutc':
      current = submission.submittedOnUtc;
      break;
    case 'status':
      current = submission.status || 'submitted';
      break;
    case 'data':
      current = submission.data || {};
      break;
    default:
      current = readRecordValue(submission as Record<string, unknown>, head);
      if (current === undefined) current = readFieldRaw(submission, head);
      break;
  }

  if (!rest.length) return current;
  return resolvePath(current, rest);
}

function resolveFieldValue(submission: SubmissionRow, keyPath: string): unknown {
  return unwrapFieldValue(resolveFieldValueRaw(submission, keyPath));
}

function resolveFieldValueRaw(submission: SubmissionRow, keyPath: string): unknown {
  const segments = splitKeyPath(keyPath);
  if (!segments.length) return '';
  const [fieldKey, ...rest] = segments;
  const root = readFieldRaw(submission, fieldKey);
  if (!rest.length) return root;
  return resolvePath(root, rest);
}

function splitKeyPath(keyPath: string): string[] {
  return String(keyPath || '')
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolvePath(value: unknown, segments: string[]): unknown {
  let current: unknown = value;
  for (const segment of segments) {
    current = readPathSegment(current, segment);
    if (current == null) return current;
  }
  return current;
}

function readPathSegment(value: unknown, segment: string): unknown {
  if (value == null || !segment) return undefined;
  if (Array.isArray(value) && /^[0-9]+$/.test(segment)) {
    const index = parseInt(segment, 10);
    return index >= 0 && index < value.length ? value[index] : undefined;
  }
  if (typeof value !== 'object') return undefined;
  return readRecordValue(value as Record<string, unknown>, segment);
}

function readRecordValue(record: Record<string, unknown>, key: string): unknown {
  if (!record || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
  const lowered = key.toLowerCase();
  const match = Object.keys(record).find((name) => name.toLowerCase() === lowered);
  return match ? record[match] : undefined;
}

/** Fetch submissions list for a form. Returns empty array on error.
 *  [SubmissionsDataParse v20260507-29] The Oqtane / DNN API returns each row
 *  with `DataJson` (a JSON STRING) — not a parsed `data` object. Without this
 *  fix, all `{{field:KEY}}` tokens render as empty strings because
 *  `submission.data` was an empty `{}` literal placeholder. */
export async function fetchSubmissions(cfg: SubmissionViewConfig): Promise<SubmissionRow[]> {
  if (!cfg.formId) return [];
  const url = buildAuthorizedApiUrl(
    cfg.apiBase,
    'Submissions?formId=' + encodeURIComponent(String(cfg.formId)) +
      '&pageIndex=0&pageSize=' + encodeURIComponent(String(cfg.pageSize || 50)) +
      (cfg.queryKey ? '&queryKey=' + encodeURIComponent(String(cfg.queryKey)) : ''),
    cfg.context,
  );
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return [];
    const body = await r.json().catch(() => null) as any;
    const items = (body && (body.items || body.Items)) || [];
    return items.map((it: any): SubmissionRow => {
      // Resolve `data` from any of: data/Data (already-parsed object), or
      // dataJson/DataJson (JSON string). Falls back to {} so cells are blank
      // not crashing.
      let dataObj: Record<string, unknown> = {};
      const rawObj = it.data ?? it.Data ?? it.fields ?? it.Fields;
      if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
        dataObj = rawObj as Record<string, unknown>;
      } else {
        const rawStr = it.dataJson ?? it.DataJson ?? '';
        if (typeof rawStr === 'string' && rawStr.trim()) {
          try {
            const parsed = JSON.parse(rawStr);
            if (parsed && typeof parsed === 'object') dataObj = parsed as Record<string, unknown>;
          } catch { /* keep empty */ }
        }
      }
      return {
        submissionId: it.submissionId ?? it.SubmissionId ?? 0,
        formId: it.formId ?? it.FormId ?? cfg.formId,
        submittedOnUtc: it.submittedOnUtc ?? it.SubmittedOnUtc ?? '',
        status: it.status ?? it.Status ?? 'submitted',
        activeTaskId: String(it.activeTaskId ?? it.ActiveTaskId ?? ''),
        availableActions: Array.isArray(it.availableActions ?? it.AvailableActions)
          ? (it.availableActions ?? it.AvailableActions)
          : [],
        data: dataObj,
      };
    });
  } catch {
    return [];
  }
}

export function renderEmpty(message: string): string {
  return '<div class="mf-sub-view-empty" style="padding:24px;text-align:center;color:#94a3b8;font-size:14px;font-style:italic">' +
    htmlEscape(message) + '</div>';
}
