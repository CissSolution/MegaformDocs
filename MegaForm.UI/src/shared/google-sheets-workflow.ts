// Shared "Connect form → Google Sheet" workflow builder. Builds (or updates) a
// form's workflow so every new submission appends a row to a Google Sheet, with
// column mappings derived from the form's real schema (no empty rows). Used by
// the dashboard form-row action; the submissions shell has an equivalent flow.
import { flattenFields } from './utils';

export interface GsColumnMapping { Column: string; Source: string; Value?: string }

const LAYOUT_TYPES = new Set([
  'heading', 'paragraph', 'divider', 'spacer', 'image', 'html', 'rawhtml',
  'columns', 'section', 'button', 'submit', 'pagebreak', 'page', 'label', 'banner',
]);

function isLayoutType(t: any): boolean {
  return LAYOUT_TYPES.has(String(t || '').toLowerCase());
}

export function newGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function bumpVersion(v?: string): string {
  const n = Number.parseInt(String(v || '0'), 10);
  return String((Number.isFinite(n) ? n : 0) + 1);
}

// Build column mappings from a parsed form schema. A leading "Submitted At"
// column is added; the executor caps at 12 columns.
export function buildColumnMappings(schema: any): GsColumnMapping[] {
  const sch = schema && (schema.fields || schema.Fields || schema);
  const out: GsColumnMapping[] = [{ Column: 'Submitted At', Source: '', Value: '{{submission.submittedOn}}' }];
  try {
    flattenFields(Array.isArray(sch) ? sch : []).forEach((f: any) => {
      const key = f && (f.key || f.Key);
      const type = f && (f.type || f.Type);
      if (!key || isLayoutType(type)) return;
      const label = String(f.label || f.Label || key);
      out.push({ Column: label, Source: String(key) });
    });
  } catch { /* keep minimal */ }
  return out.slice(0, 12);
}

export function buildGoogleSheetWorkflow(
  formId: number,
  existing: any,
  spreadsheetId: string,
  range: string,
  columnMappings: GsColumnMapping[],
): any {
  const now = new Date().toISOString();
  const gsNodeId = existing?.nodes?.find((n: any) => n.type === 25 || n.type === 'GoogleSheets')?.id || newGuid();
  const endNodeId = existing?.nodes?.find((n: any) => n.type === 5 || n.type === 'End')?.id || newGuid();
  const gsNode = {
    id: gsNodeId, type: 25, label: 'Google Sheets', zoneType: 2,
    position: { x: 200, y: 200 },
    config: { SpreadsheetId: spreadsheetId, Range: range, SheetName: range, Operation: 'append', ValueInputOption: 'USER_ENTERED', InsertDataOption: 'INSERT_ROWS', ColumnMappings: columnMappings || [] },
    legacyRules: [], isDisabled: false,
  };
  const endNode = {
    id: endNodeId, type: 5, label: 'End', zoneType: 2,
    position: { x: 200, y: 400 },
    config: { endType: 1, message: 'Submission synced to Google Sheets.' },
    legacyRules: [], isDisabled: false,
  };
  let nodes: any[] = []; let edges: any[] = [];
  if (existing && existing.nodes && existing.nodes.length > 0) {
    nodes = (existing.nodes || []).map((n: any) => ({ ...n }));
    edges = (existing.edges || []).map((e: any) => ({ ...e }));
    const gsIdx = nodes.findIndex((n: any) => n.id === gsNodeId);
    if (gsIdx >= 0) nodes[gsIdx] = gsNode; else nodes.push(gsNode);
    const endIdx = nodes.findIndex((n: any) => n.id === endNodeId);
    if (endIdx >= 0) nodes[endIdx] = endNode; else nodes.push(endNode);
    const outgoing = new Set(edges.map((e: any) => e.sourceNodeId || e.SourceNodeId));
    const leafIds = nodes.map((n: any) => n.id).filter((id: string) => !outgoing.has(id) && id !== endNodeId);
    edges = edges.filter((e: any) => (e.targetNodeId || e.TargetNodeId) !== endNodeId);
    edges = edges.filter((e: any) => (e.sourceNodeId || e.SourceNodeId) !== gsNodeId);
    leafIds.forEach((leafId: string) => edges.push({ id: newGuid(), sourceNodeId: leafId, targetNodeId: gsNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }));
    if (!edges.some((e: any) => (e.targetNodeId || e.TargetNodeId) === gsNodeId)) {
      const first = nodes[0]?.id;
      if (first && first !== gsNodeId) edges.push({ id: newGuid(), sourceNodeId: first, targetNodeId: gsNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
    }
    edges.push({ id: newGuid(), sourceNodeId: gsNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
  } else {
    nodes = [gsNode, endNode];
    edges = [{ id: newGuid(), sourceNodeId: gsNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }];
  }
  return { id: existing?.id || newGuid(), formId, name: existing?.name || 'Form Workflow', version: bumpVersion(existing?.version), startNodeId: existing?.startNodeId || (nodes[0] ? nodes[0].id : gsNodeId), nodes, edges, variables: existing?.variables || [], settings: existing?.settings || { executionTimeoutSeconds: 300, dryRun: false, enableExecutionLog: true }, createdAt: existing?.createdAt || now, updatedAt: now, migratedFromRules: existing?.migratedFromRules || false };
}

async function fetchJson(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
}

// ── Custom-URL (Webhook) destination ──────────────────────────────────────
// Mirrors buildGoogleSheetWorkflow but with a Webhook node (type 3) that POSTs
// each new submission to a user-supplied URL. Backend executor: WebhookNodeExecutor.
export function buildWebhookWorkflow(formId: number, existing: any, url: string, method = 'POST'): any {
  const now = new Date().toISOString();
  const hookNodeId = existing?.nodes?.find((n: any) => n.type === 3 || n.type === 'Webhook')?.id || newGuid();
  const endNodeId = existing?.nodes?.find((n: any) => n.type === 5 || n.type === 'End')?.id || newGuid();
  const hookNode = {
    id: hookNodeId, type: 3, label: 'Push to URL', zoneType: 2,
    position: { x: 200, y: 200 },
    config: { Url: url, Method: method, ContentType: 'application/json', IncludeSubmissionData: true },
    legacyRules: [], isDisabled: false,
  };
  const endNode = {
    id: endNodeId, type: 5, label: 'End', zoneType: 2,
    position: { x: 200, y: 400 },
    config: { endType: 1, message: 'Submission pushed to custom URL.' },
    legacyRules: [], isDisabled: false,
  };
  let nodes: any[] = []; let edges: any[] = [];
  if (existing && existing.nodes && existing.nodes.length > 0) {
    nodes = (existing.nodes || []).map((n: any) => ({ ...n }));
    edges = (existing.edges || []).map((e: any) => ({ ...e }));
    const hIdx = nodes.findIndex((n: any) => n.id === hookNodeId);
    if (hIdx >= 0) nodes[hIdx] = hookNode; else nodes.push(hookNode);
    const endIdx = nodes.findIndex((n: any) => n.id === endNodeId);
    if (endIdx >= 0) nodes[endIdx] = endNode; else nodes.push(endNode);
    const outgoing = new Set(edges.map((e: any) => e.sourceNodeId || e.SourceNodeId));
    const leafIds = nodes.map((n: any) => n.id).filter((id: string) => !outgoing.has(id) && id !== endNodeId);
    edges = edges.filter((e: any) => (e.targetNodeId || e.TargetNodeId) !== endNodeId);
    edges = edges.filter((e: any) => (e.sourceNodeId || e.SourceNodeId) !== hookNodeId);
    leafIds.forEach((leafId: string) => edges.push({ id: newGuid(), sourceNodeId: leafId, targetNodeId: hookNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }));
    if (!edges.some((e: any) => (e.targetNodeId || e.TargetNodeId) === hookNodeId)) {
      const first = nodes[0]?.id;
      if (first && first !== hookNodeId) edges.push({ id: newGuid(), sourceNodeId: first, targetNodeId: hookNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
    }
    edges.push({ id: newGuid(), sourceNodeId: hookNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
  } else {
    nodes = [hookNode, endNode];
    edges = [{ id: newGuid(), sourceNodeId: hookNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }];
  }
  return { id: existing?.id || newGuid(), formId, name: existing?.name || 'Form Workflow', version: bumpVersion(existing?.version), startNodeId: existing?.startNodeId || (nodes[0] ? nodes[0].id : hookNodeId), nodes, edges, variables: existing?.variables || [], settings: existing?.settings || { executionTimeoutSeconds: 300, dryRun: false, enableExecutionLog: true }, createdAt: existing?.createdAt || now, updatedAt: now, migratedFromRules: existing?.migratedFromRules || false };
}

// Orchestrates the full connect: fetch the existing workflow, graft a webhook node, save.
export async function connectCustomUrl(opts: {
  apiBase: string; platform: string; formId: number; url: string; method?: string; headers?: Record<string, string>;
}): Promise<void> {
  const base = String(opts.apiBase || '/api/MegaForm/').replace(/\/+$/, '') + '/';
  const isOq = String(opts.platform || '').toLowerCase() === 'oqtane';
  const hdrs = { Accept: 'application/json', ...(opts.headers || {}) };
  let existing: any = null;
  try {
    const getPath = isOq ? `Form/Workflow/Get?formId=${opts.formId}` : `Workflow/Get?formId=${opts.formId}`;
    const wr = await fetchJson(base + getPath, { method: 'GET', headers: hdrs });
    if (wr.ok) { const d = await wr.json(); existing = d && (d.workflow || d.Workflow) ? d : null; }
  } catch { /* no existing workflow */ }
  const workflow = buildWebhookWorkflow(opts.formId, existing, opts.url, opts.method || 'POST');
  const savePath = isOq ? 'Form/Workflow/Save' : 'Workflow/Save';
  const sr = await fetchJson(base + savePath, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...hdrs },
    body: JSON.stringify({ formId: opts.formId, workflow }),
  });
  if (!sr.ok) {
    let msg = `Save failed: HTTP ${sr.status}`;
    try { const d = await sr.json(); if (d && (d.error || d.message)) msg = d.error || d.message; } catch { /* keep */ }
    throw new Error(msg);
  }
}

// Orchestrates the full connect: fetch the form schema + existing workflow,
// build the Sheets workflow with field mappings, and save it.
export async function connectGoogleSheet(opts: {
  apiBase: string;          // e.g. /api/MegaForm/
  platform: string;         // 'oqtane' | 'dnn' | ...
  formId: number;
  spreadsheetId: string;
  range: string;
  headers?: Record<string, string>;
}): Promise<void> {
  const base = String(opts.apiBase || '/api/MegaForm/').replace(/\/+$/, '') + '/';
  const isOq = String(opts.platform || '').toLowerCase() === 'oqtane';
  const hdrs = { Accept: 'application/json', ...(opts.headers || {}) };

  // 1. Form schema → column mappings.
  let schema: any = {};
  try {
    const fr = await fetchJson(base + `Form/Get?formId=${opts.formId}`, { method: 'GET', headers: hdrs });
    if (fr.ok) {
      const f = await fr.json();
      const sj = f && (f.schemaJson || f.SchemaJson);
      if (sj) { try { schema = JSON.parse(sj); } catch { schema = {}; } }
    }
  } catch { /* mappings stay minimal */ }
  const mappings = buildColumnMappings(schema);

  // 2. Existing workflow (merge target).
  let existing: any = null;
  try {
    const getPath = isOq ? `Form/Workflow/Get?formId=${opts.formId}` : `Workflow/Get?formId=${opts.formId}`;
    const wr = await fetchJson(base + getPath, { method: 'GET', headers: hdrs });
    if (wr.ok) { const d = await wr.json(); existing = d && (d.workflow || d.Workflow) ? d : null; }
  } catch { /* no existing workflow */ }

  // 3. Build + save.
  const workflow = buildGoogleSheetWorkflow(opts.formId, existing, opts.spreadsheetId, opts.range, mappings);
  const savePath = isOq ? 'Form/Workflow/Save' : 'Workflow/Save';
  const sr = await fetchJson(base + savePath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...hdrs },
    body: JSON.stringify({ formId: opts.formId, workflow }),
  });
  if (!sr.ok) {
    let msg = `Save failed: HTTP ${sr.status}`;
    try { const d = await sr.json(); if (d && (d.error || d.message)) msg = d.error || d.message; } catch { /* keep */ }
    throw new Error(msg);
  }
}
