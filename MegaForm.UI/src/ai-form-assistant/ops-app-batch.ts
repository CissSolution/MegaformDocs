/* [split 2026-06-27] Extracted from the former 2408-line ops.ts. */
import {
  type Op, type OpResult,
  subformUrl, getBuilder, normalizeCompositeField,
} from './ops-shared';
import { getDbProviderKey } from '@shared/ddl-dialect';
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
export function opAddSubformFromTable(op: Op): OpResult {
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
export function opAddFieldFromColumn(op: Op): OpResult {
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

export function getApiBaseLocal(): string {
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
export function getAiBaseLocal(): string {
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
export function isOqtaneLocal(): boolean {
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
export function getLocalPlatform(): { platform: string; moduleId?: number; siteId?: number; portalId?: number } {
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  let platform = String(pf.platform || '').toLowerCase();
  if (!platform && isOqtaneLocal()) platform = 'oqtane';
  return { platform: platform || 'dnn', moduleId: pf.moduleId, siteId: pf.siteId, portalId: pf.portalId };
}
export function antiForgeryToken(): string {
  return (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
}
// [QA-20260615] Build save headers matching the dashboard AI creator so
// Oqtane X-OQTANE-* / DNN RequestVerificationToken are both sent.
export function buildSaveHeadersLocal(): Record<string, string> {
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
export function appendPlatformQueryLocal(url: string): string {
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
export function saveFormEndpoint(): string {
  const cfg = getLocalPlatform();
  const base = getApiBaseLocal();
  // Defense-in-depth: if any Oqtane signal is present, always use Form (not Form/Save).
  const path = (cfg.platform === 'oqtane' || isOqtaneLocal()) ? 'Form' : 'Form/Save';
  return appendPlatformQueryLocal(base + path);
}
export function appendErrorToChatLog(message: string): void {
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
export function postJsonSync<T = any>(url: string, body: any, extraHeaders?: Record<string, string>): Promise<T> {
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

export function opExecuteSql(op: Op): OpResult {
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
export function getCurrentFormIdForOps(): number {
  const el = document.querySelector('#mf-builder-root, [data-mf-builder]') as HTMLElement | null;
  const fromAttr = el ? parseInt(el.getAttribute('data-form-id') || '0', 10) : 0;
  if (fromAttr > 0) return fromAttr;
  const B = getBuilder();
  const cand = B && B.state && (B.state.formId || (B.state.config && B.state.config.formId) || (B.state.schema && B.state.schema.formId));
  const n = parseInt(String(cand || '0'), 10);
  return n > 0 ? n : 0;
}
export function opSetRecordVisibility(op: Op): OpResult {
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

export interface CreateFormSpec {
  title: string;
  description?: string;
  fields: any[];
  settings?: any;
  bindToTable?: { tableName: string; schemaName?: string; mapping?: Record<string, string> };
}

// [2026-06-27 restore] Provider-aware SQL identifier quoting so the generated
// app_batch / create_form INSERT works on SQLite / MySQL / Postgres, not only
// MSSQL `[brackets]`. (This was an uncommitted prior-session change accidentally
// dropped by a `git checkout`; the mirror lives in dashboard/ai-form-creator.ts.)
export function buildInsertSqlFor(spec: CreateFormSpec, parsedTables?: ParsedTable[], providerKey?: string): { insertSql: string; mapping: Record<string, string> } {
  const tbl    = spec.bindToTable!;
  const schema = tbl.schemaName || 'dbo';
  const table  = tbl.tableName;
  const p = String(providerKey || '').toLowerCase() || 'mssql';
  function q(ident: string): string {
    if (p === 'sqlite' || p === 'postgres') return '"' + ident.replace(/"/g, '""') + '"';
    if (p === 'mysql') return '`' + ident.replace(/`/g, '``') + '`';
    return '[' + ident.replace(/\]/g, ']]') + ']';
  }
  function qualifiedTable(sch: string, tblName: string): string {
    if (p === 'sqlite' || p === 'mysql' || p === 'postgres') return q(tblName);
    return q(sch) + '.' + q(tblName);
  }
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
  const insertSql = `INSERT INTO ${qualifiedTable(schema, table)} (${cols.map(q).join(', ')}) VALUES (${params.join(', ')})`;
  const mapping: Record<string, string> = {};
  flat.forEach(f => { mapping[':' + f.key] = f.key; });
  return { insertSql, mapping };
}

export function opCreateForm(op: Op): OpResult {
  const spec = (op as any) as CreateFormSpec & { op: string; __parsedTables?: ParsedTable[]; __providerKey?: string };
  if (!spec.title || !Array.isArray(spec.fields)) {
    return { op: op.op, ok: false, message: 'create_form needs `title` + `fields`' };
  }
  // [B172] Normalise composite alias field-types (also covers app_batch, which
  // dispatches one create_form per form).
  spec.fields.forEach(normalizeCompositeField);
  // Build a minimal FormInfo payload accepted by /Form/Save
  const schemaObj = { version: '1.0', fields: spec.fields, settings: spec.settings || {} };
  const settingsObj: any = (spec.settings && JSON.parse(JSON.stringify(spec.settings))) || {};

  // Auto-wire DatabaseInsert when bindToTable provided. [2026-06-27 restore]
  // __providerKey is threaded in by opAppBatch (resolved once via getDbProviderKey)
  // so the INSERT SQL quotes identifiers for the ACTIVE DashboardDatabase provider.
  if (spec.bindToTable && spec.bindToTable.tableName) {
    const { insertSql, mapping } = buildInsertSqlFor(spec, spec.__parsedTables, spec.__providerKey);
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

export interface AppBatchSpec {
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

export interface ParsedTable {
  name: string;
  schemaName: string;
  columns: { name: string; sqlType: string; nullable: boolean }[];
  pk: string;
  fks: { column: string; referencesTable: string; referencesSchema: string; referencesColumn: string }[];
}

export function parseDdl(ddl: string): ParsedTable | null {
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
export function extractSqlType(line: string): string {
  const m = line.match(/^\[?\w+\]?\s+(\w+(?:\s*\([^)]+\))?)/);
  return m ? m[1] : 'NVARCHAR(120)';
}
export function guessLabelColumn(t: ParsedTable): string {
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
export function autoWireFkDropdowns(fields: any[], tablesByCol: Record<string, { parent: ParsedTable; pkCol: string }>): number {
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

export function opAppBatch(op: Op): OpResult {
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

  Promise.all(tablePromises).then(async () => {
    // [P2-#3] Continue even if some tables failed — only abort forms that
    // depend on a failed table. For MVP we treat all table failures as
    // soft: form creation still runs (auto-wire to existing tables).
    // [2026-06-27 restore] Resolve the ACTIVE DashboardDatabase provider ONCE so
    // each create_form builds provider-correct INSERT SQL (SQLite/MySQL/Postgres).
    let providerKey = '';
    try { providerKey = await getDbProviderKey(); } catch { /* default mssql */ }
    const formPromises = (spec.forms || []).map(f => {
      const sub: Op = { op: 'create_form', ...f } as any;
      if (!sub.bindToTable && (f as any).tableName) {
        sub.bindToTable = { tableName: (f as any).tableName, schemaName: (f as any).schemaName };
      }
      // Pass parsed DDL so buildInsertSqlFor can resolve real column names.
      (sub as any).__parsedTables = parsedTables;
      (sub as any).__providerKey = providerKey;
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
export function esc(s: any): string {
  const t = s == null ? '' : String(s);
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function humanize(s: string): string {
  return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
