// ============================================================
// MegaForm ListView — Runtime Renderer
// Public-facing list view for a chosen form's submissions.
//   • Pulls submissions via the existing /Submissions endpoint
//     (paged, with optional search/status/dateFrom/dateTo).
//   • Renders rows through admin-supplied HTML template (or default).
//   • Built-in header sort, search box, pagination, page-size picker.
//   • Auto-included CSS prefixes everything with .mflv-* so it can't
//     bleed into the host site (RULES: don't break what works).
//
// Mounts on any element with `data-mf-listview="1"`. Reads config from
// data-attributes (form id, fields, template, page size, options) and
// also accepts a runtime config override via window.MFListView.init().
// ============================================================

import {
  buildAuthorizedApiUrl,
  fetchSubmissions,
  parseTemplateContextFromElement,
  readField,
  renderFieldDisplayHtml,
  type SubmissionRow,
  type TemplateContext,
} from '../submission-views/shared';
// readField is used by both rerender (via wrapper) and openViewModal.
void readField;
import {
  applyRowTemplate,
  defaultRowTemplate,
  defaultWrapperTemplate,
  escapeHtml,
  type ListViewSchemaField,
} from './template';
import { normalizeSubmissionDetailResponse } from '../adapters/submission-detail';
import type { RendererConfig } from '../renderer/helpers';
import { clearFieldErrors, collectFormData, validateForm } from '../renderer/validation';
import { collectSubmissionFiles } from '../submissions/file-links';
import { renderSubmissionDetailShell } from '../submissions/submission-detail-shell';
import type { SubmissionWorkflowActionRequest, SubmissionWorkflowActionResult } from '../submissions/submission-detail-workflow-panel';

export const LISTVIEW_RUNTIME_BADGE = 'ListViewRuntime v20260525-02';
if (typeof window !== 'undefined') (window as any).__MF_LISTVIEW_RUNTIME_BADGE__ = LISTVIEW_RUNTIME_BADGE;

export interface ListViewConfig {
  formId: number;
  apiBase: string;
  queryKey?: string;
  fields: ListViewSchemaField[];
  rowTemplate: string;
  wrapperTemplate: string;
  pageSize: number;
  enableSearch: boolean;
  enableSort: boolean;
  emptyMessage: string;
  title: string;
  // [ListViewActions v20260507-28] CRUD affordances on the public ListView.
  // showAddButton  → renders "+ Add new" toolbar button (opens form in modal/tab)
  // showRowActions → adds a per-row column with View / Edit / Delete icons
  // rendererHostUrl → URL of the page that hosts the form renderer
  //                   (defaults to current page; admins set in module settings)
  showAddButton?: boolean;
  showRowActions?: boolean;
  rendererHostUrl?: string;
  // [ListViewDetailTemplate v20260508-03] Optional admin-supplied HTML for
  // the View modal. Tokens replaced via applyRowTemplate (same engine as
  // rowTemplate). When blank, runtime renders an auto field/value list.
  detailTemplate?: string;
  context?: TemplateContext;
}

interface ListViewState {
  page: number;
  search: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  rows: SubmissionRow[];
  filtered: SubmissionRow[];
}

interface SubmissionActionDescriptor {
  key: string;
  label: string;
  title: string;
  tone: 'danger' | 'info' | 'neutral' | 'success';
  taskId: string;
  requiresComment: boolean;
}

const DEFAULTS: ListViewConfig = {
  formId: 0,
  apiBase: '/api/MegaForm/',
  fields: [],
  rowTemplate: '',
  wrapperTemplate: '',
  pageSize: 25,
  enableSearch: true,
  enableSort: true,
  emptyMessage: 'No submissions yet.',
  title: '',
  showAddButton: true,
  showRowActions: true,
  rendererHostUrl: '',
  detailTemplate: '',
};

export function readConfigFromElement(root: HTMLElement, override?: Partial<ListViewConfig>): ListViewConfig {
  const ds = root.dataset;
  const cfg: ListViewConfig = { ...DEFAULTS };
  cfg.formId         = parseInt(ds.mfFormId || '0', 10) || 0;
  cfg.apiBase        = (ds.mfApiBase || DEFAULTS.apiBase).replace(/\/?$/, '/');
  cfg.queryKey       = String(ds.mfQueryKey || '').trim();
  cfg.pageSize       = parseInt(ds.mfPageSize || String(DEFAULTS.pageSize), 10) || DEFAULTS.pageSize;
  cfg.enableSearch   = ds.mfSearch !== 'false';
  cfg.enableSort     = ds.mfSort !== 'false';
  cfg.emptyMessage   = String(ds.mfEmptyMessage || DEFAULTS.emptyMessage);
  cfg.title          = String(ds.mfTitle || '');
  cfg.rowTemplate    = String(ds.mfRowTemplate || ds.mfTemplate || '');
  cfg.wrapperTemplate = String(ds.mfWrapperTemplate || '');
  // [ListViewActions v20260507-28] Read CRUD-affordance flags from data-attrs.
  cfg.showAddButton    = ds.mfShowAdd     !== 'false';
  cfg.showRowActions   = ds.mfShowActions !== 'false';
  cfg.rendererHostUrl  = String(ds.mfRendererHostUrl || '');
  // [ListViewDetailTemplate v20260508-03]
  cfg.detailTemplate   = String(ds.mfDetailTemplate || '');
  cfg.context          = parseTemplateContextFromElement(root, {
    form: { id: cfg.formId },
    module: { id: parseInt(ds.mfModuleId || ds.moduleId || '0', 10) || 0 },
  });

  // Fields: prefer JSON in data-mf-fields-json; fall back to comma-separated keys.
  const rawJson = ds.mfFieldsJson || '';
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) cfg.fields = parsed.map(normalizeField).filter(Boolean) as ListViewSchemaField[];
    } catch { /* fall through */ }
  }
  if (!cfg.fields.length) {
    const keys = String(ds.mfFields || '').split(',').map(s => s.trim()).filter(Boolean);
    cfg.fields = keys.map(k => ({ key: k, label: k }));
  }

  return Object.assign(cfg, override || {});
}

function normalizeField(f: any): ListViewSchemaField | null {
  if (!f) return null;
  if (typeof f === 'string') return { key: f, label: f };
  const key = String(f.key || f.Key || f.name || f.Name || '').trim();
  if (!key) return null;
  return { key, label: String(f.label || f.Label || key), type: String(f.type || f.Type || '') };
}

function compareSubmissions(a: SubmissionRow, b: SubmissionRow, key: string, dir: 'asc' | 'desc'): number {
  let va: unknown, vb: unknown;
  if (key === 'submittedOnUtc') { va = a.submittedOnUtc; vb = b.submittedOnUtc; }
  else if (key === 'submissionId' || key === 'id') { va = a.submissionId; vb = b.submissionId; }
  else if (key === 'status') { va = a.status; vb = b.status; }
  else { va = readField(a, key); vb = readField(b, key); }
  const cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
  return dir === 'asc' ? cmp : -cmp;
}

function matchesSearch(row: SubmissionRow, term: string, fields: ListViewSchemaField[]): boolean {
  if (!term) return true;
  const needle = term.toLowerCase();
  for (const f of fields) {
    const v = String(readField(row, f.key) ?? '').toLowerCase();
    if (v.indexOf(needle) >= 0) return true;
  }
  return String(row.submissionId).indexOf(needle) >= 0
      || String(row.status || '').toLowerCase().indexOf(needle) >= 0;
}

function paginate(rows: SubmissionRow[], page: number, pageSize: number): { slice: SubmissionRow[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage   = Math.min(Math.max(0, page), totalPages - 1);
  const slice      = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  return { slice, totalPages };
}

function getUrlDetailFilter(): { submissionId: number; slug: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search || '');
  const rawId = params.get('mfid') || params.get('submissionId') || params.get('sid') || '';
  const submissionId = parseInt(rawId, 10) || 0;
  const slug = (params.get('slug') || params.get('mfslug') || params.get('post') || '').trim().toLowerCase();
  return submissionId > 0 || slug ? { submissionId, slug } : null;
}

function rowMatchesUrlDetailFilter(row: SubmissionRow, filter: { submissionId: number; slug: string }): boolean {
  if (filter.submissionId > 0 && row.submissionId === filter.submissionId) return true;
  if (!filter.slug) return false;
  const rowSlug = String(readField(row, 'slug') || '').trim().toLowerCase();
  return rowSlug === filter.slug;
}

function recordLabelForConfig(cfg: ListViewConfig): string {
  const title = String(cfg.title || '').toLowerCase();
  return title.indexOf('blog') >= 0 ? 'Blog Post' : 'submission';
}

function renderToolbar(cfg: ListViewConfig, state: ListViewState): string {
  const parts: string[] = [];
  const recordLabel = recordLabelForConfig(cfg);
  if (cfg.title) parts.push('<h3 class="mflv-title">' + escapeHtml(cfg.title) + '</h3>');
  if (cfg.enableSearch) {
    parts.push(
      '<div class="mflv-search">' +
        '<input type="search" class="mflv-search-input" placeholder="Search…" value="' + escapeHtml(state.search) + '" />' +
      '</div>'
    );
  }
  parts.push('<div class="mflv-meta">' + state.filtered.length + ' result' + (state.filtered.length === 1 ? '' : 's') + '</div>');
  // [ListViewActions v20260507-28] "+ Add new" opens the public form to add
  // a submission. Right-aligned for prominence.
  if (cfg.showAddButton) {
    parts.push('<button type="button" class="mflv-btn mflv-btn-primary mflv-add-btn" data-mflv-add="1" title="Add new ' + escapeHtml(recordLabel) + '">+ New ' + escapeHtml(recordLabel) + '</button>');
  }
  return '<div class="mflv-toolbar">' + parts.join('') + '</div>';
}

function renderActionCell(submissionId: number): string {
  return '<td class="mflv-cell mflv-cell-actions">' +
    '<button type="button" class="mflv-ic-btn" data-mflv-action="view"   data-mflv-id="' + submissionId + '" title="View">👁</button>' +
    '<button type="button" class="mflv-ic-btn" data-mflv-action="edit"   data-mflv-id="' + submissionId + '" title="Edit">✎</button>' +
    '<button type="button" class="mflv-ic-btn mflv-ic-btn-danger" data-mflv-action="delete" data-mflv-id="' + submissionId + '" title="Delete">🗑</button>' +
  '</td>';
}

/** Build the URL fallback for the "open in a new tab" link only — the modal
 *  itself mounts the renderer DIRECTLY, no iframe. The fallback URL is for
 *  admins who configured a Renderer Host page; it's pasted into the ↗ link. */
function buildFormUrl(cfg: ListViewConfig, submissionId?: number): string {
  const base = (cfg.rendererHostUrl || window.location.pathname).replace(/[?#].*$/, '');
  const params: string[] = ['formid=' + encodeURIComponent(String(cfg.formId))];
  if (submissionId && submissionId > 0) params.push('submissionId=' + encodeURIComponent(String(submissionId)));
  return base + '?' + params.join('&');
}

function todayInputDate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

async function submitBlogKitComment(cfg: ListViewConfig, shell: HTMLElement, button: HTMLElement): Promise<void> {
  const formId = parseInt(shell.getAttribute('data-mf-blogkit-comment-form') || '0', 10) || 0;
  const statusEl = shell.querySelector('[data-mf-blogkit-comment-status]') as HTMLElement | null;
  const nameEl = shell.querySelector('[data-mf-blogkit-comment-name]') as HTMLInputElement | null;
  const emailEl = shell.querySelector('[data-mf-blogkit-comment-email]') as HTMLInputElement | null;
  const bodyEl = shell.querySelector('[data-mf-blogkit-comment-body]') as HTMLTextAreaElement | null;
  const commentBody = String(bodyEl?.value || '').trim();

  const setStatus = (message: string, tone: 'ok' | 'error' | 'muted' = 'muted') => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('text-green-600', tone === 'ok');
    statusEl.classList.toggle('text-red-600', tone === 'error');
    statusEl.classList.toggle('text-muted-foreground', tone === 'muted');
  };

  if (formId <= 0) {
    setStatus('Comment form is not configured for this Blog kit view.', 'error');
    return;
  }
  if (!commentBody) {
    setStatus('Write a comment before posting.', 'error');
    bodyEl?.focus();
    return;
  }

  const startedAt = parseInt(shell.getAttribute('data-mf-blogkit-comment-start') || '', 10) || Date.now();
  const submissionTime = Math.max(8, Math.min(900, (Date.now() - startedAt) / 1000));

  const payload = {
    formId,
    submissionTime,
    data: {
      post_uid: shell.getAttribute('data-mf-blogkit-post-uid') || '',
      post_slug: shell.getAttribute('data-mf-blogkit-post-slug') || '',
      parent_comment_id: '',
      commenter_name: String(nameEl?.value || '').trim() || 'Guest Reader',
      commenter_email: String(emailEl?.value || '').trim(),
      cms_user_id: '',
      comment_body: commentBody,
      moderation_status: 'pending',
      like_count: 0,
      posted_on: todayInputDate(),
    },
  };

  const original = button.textContent || 'Post Comment';
  button.setAttribute('disabled', 'disabled');
  button.textContent = 'Posting...';
  setStatus('Saving comment to Blog Comments...', 'muted');

  try {
    const resp = await fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Submit/Post', cfg.context), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.success === false || json?.Success === false) {
      throw new Error(json?.error || json?.Error || ('HTTP ' + resp.status));
    }
    if (bodyEl) bodyEl.value = '';
    await loadBlogKitComments(cfg, shell);
    setStatus('Comment submitted for moderation and linked to this post.', 'ok');
  } catch (err) {
    setStatus('Could not post comment: ' + ((err as any)?.message || String(err)), 'error');
  } finally {
    button.removeAttribute('disabled');
    button.textContent = original;
  }
}

function getBlogKitCommentListElement(shell: HTMLElement): HTMLElement | null {
  const explicit = shell.parentElement?.querySelector('[data-mf-blogkit-comment-list]') as HTMLElement | null;
  if (explicit) return explicit;

  const next = shell.nextElementSibling;
  if (next instanceof HTMLElement && next.className.indexOf('space-y-6') >= 0) return next;

  return shell.parentElement?.querySelector('.bg-card.rounded-xl.border.p-6') as HTMLElement | null;
}

function formatBlogKitCommentDate(row: SubmissionRow): string {
  const raw = String(readField(row, 'posted_on') || row.submittedOnUtc || '').trim();
  if (!raw) return 'Just now';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderBlogKitComment(row: SubmissionRow): string {
  const name = String(readField(row, 'commenter_name') || 'Guest Reader').trim();
  const body = String(readField(row, 'comment_body') || '').trim();
  const status = String(readField(row, 'moderation_status') || '').trim().toLowerCase();
  const likes = String(readField(row, 'like_count') || '0').trim();
  const isPending = status === 'pending';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || 'GR';

  return '<div class="bg-card rounded-xl border p-6" data-mf-blogkit-comment-row="1">' +
    '<div class="flex gap-4">' +
      '<div class="h-11 w-11 rounded-full bg-primary/10 text-primary grid place-items-center font-bold text-sm shrink-0">' + escapeHtml(initials) + '</div>' +
      '<div class="flex-1 min-w-0">' +
        '<div class="flex items-center gap-2 mb-2 flex-wrap">' +
          '<span class="font-semibold">' + escapeHtml(name) + '</span>' +
          (isPending ? '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium">Pending moderation</span>' : '') +
          '<span class="text-sm text-muted-foreground">' + escapeHtml(formatBlogKitCommentDate(row)) + '</span>' +
        '</div>' +
        '<p class="text-muted-foreground mb-3">' + escapeHtml(body) + '</p>' +
        '<div class="flex items-center gap-4">' +
          '<button data-mflv-stop="1" type="button" class="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><i class="fa-regular fa-thumbs-up h-4 w-4" aria-hidden="true"></i>' + escapeHtml(likes || '0') + '</button>' +
          '<button data-mflv-stop="1" type="button" class="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><i class="fa-solid fa-reply h-4 w-4" aria-hidden="true"></i>Reply</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

async function loadBlogKitComments(cfg: ListViewConfig, shell: HTMLElement): Promise<void> {
  const formId = parseInt(shell.getAttribute('data-mf-blogkit-comment-form') || '0', 10) || 0;
  const postUid = String(shell.getAttribute('data-mf-blogkit-post-uid') || '').trim();
  const listEl = getBlogKitCommentListElement(shell);
  if (formId <= 0 || !postUid || !listEl) return;

  const rows = await fetchSubmissions({
    formId,
    apiBase: cfg.apiBase,
    queryKey: '',
    fields: [],
    template: '',
    pageSize: 1000,
    emptyMessage: '',
    context: cfg.context || {},
  });

  const comments = rows
    .filter(row => String(readField(row, 'post_uid') || '').trim() === postUid)
    .filter(row => {
      const status = String(readField(row, 'moderation_status') || '').trim().toLowerCase();
      return status !== 'spam' && status !== 'hidden';
    })
    .sort((a, b) => {
      const ad = Date.parse(String(readField(a, 'posted_on') || a.submittedOnUtc || '')) || 0;
      const bd = Date.parse(String(readField(b, 'posted_on') || b.submittedOnUtc || '')) || 0;
      return bd - ad;
    });

  if (!comments.length) {
    listEl.innerHTML = '<div class="bg-card rounded-xl border p-6 text-muted-foreground">No public comments yet. Start the conversation.</div>';
    return;
  }

  listEl.innerHTML = comments.slice(0, 8).map(renderBlogKitComment).join('');
}

function normalizeActionTone(value: unknown): SubmissionActionDescriptor['tone'] {
  const tone = String(value || '').trim().toLowerCase();
  if (tone === 'danger' || tone === 'success' || tone === 'info') return tone;
  return 'neutral';
}

const WORKFLOW_ROW_ACTION_KEYS = new Set(['claim', 'approve', 'reject', 'forward']);

function readSubmissionActions(row: SubmissionRow): SubmissionActionDescriptor[] {
  const raw = Array.isArray(row.availableActions) ? row.availableActions : [];
  const parsed = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const key = String(record.key ?? record.Key ?? '').trim().toLowerCase();
      if (!key) return null;
      return {
        key,
        label: String(record.label ?? record.Label ?? key).trim(),
        title: String(record.title ?? record.Title ?? record.label ?? record.Label ?? key).trim(),
        tone: normalizeActionTone(record.tone ?? record.Tone),
        taskId: String(record.taskId ?? record.TaskId ?? row.activeTaskId ?? '').trim(),
        requiresComment: !!(record.requiresComment ?? record.RequiresComment),
      } as SubmissionActionDescriptor;
    })
    .filter((entry): entry is SubmissionActionDescriptor => !!entry);

  if (parsed.length) {
    const hasWorkflowDecision = parsed.some((entry) => WORKFLOW_ROW_ACTION_KEYS.has(entry.key));
    if (hasWorkflowDecision) {
      const viewAction = parsed.find((entry) => entry.key === 'view');
      return [{
        key: 'view',
        label: 'Review',
        title: 'Open this submission review',
        tone: 'neutral',
        taskId: viewAction?.taskId || parsed.find((entry) => !!entry.taskId)?.taskId || row.activeTaskId || '',
        requiresComment: false,
      }];
    }
    return parsed;
  }

  return [
    { key: 'view', label: 'View', title: 'Open submission details', tone: 'neutral', taskId: '', requiresComment: false },
    { key: 'edit', label: 'Edit', title: 'Edit this submission', tone: 'neutral', taskId: '', requiresComment: false },
    { key: 'delete', label: 'Delete', title: 'Delete this submission', tone: 'danger', taskId: '', requiresComment: false },
  ];
}

function renderSubmissionActionCell(row: SubmissionRow): string {
  const actionHtml = readSubmissionActions(row)
    .map((action) => {
      const toneClass = action.tone !== 'neutral' ? ' mflv-action-btn-' + action.tone : '';
      const taskAttr = action.taskId ? ' data-mflv-task-id="' + escapeHtml(action.taskId) + '"' : '';
      const commentAttr = action.requiresComment ? ' data-mflv-requires-comment="1"' : '';
      return '<button type="button" class="mflv-action-btn' + toneClass + '"' +
        ' data-mflv-action="' + escapeHtml(action.key) + '"' +
        ' data-mflv-id="' + row.submissionId + '"' +
        taskAttr +
        commentAttr +
        ' title="' + escapeHtml(action.title || action.label) + '">' +
        escapeHtml(action.label) +
      '</button>';
    })
    .join('');

  return '<td class="mflv-cell mflv-cell-actions"><div class="mflv-action-stack">' + actionHtml + '</div></td>';
}

function buildMutableRequestHeaders(cfg: ListViewConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const jqueryRef = (window as any).jQuery;
    const moduleId = Number(cfg.context?.module?.id || 0);
    if (moduleId > 0 && typeof jqueryRef !== 'undefined' && jqueryRef.ServicesFramework) {
      const services = jqueryRef.ServicesFramework(moduleId);
      headers.RequestVerificationToken = services.getAntiForgeryValue();
      headers.TabId = services.getTabId();
      headers.ModuleId = services.getModuleId();
    }
  } catch {
    // Let the request fail naturally if host-specific auth helpers are absent.
  }
  return headers;
}

function buildSubmissionDetailEndpoints(submissionId: number): string[] {
  const id = encodeURIComponent(String(submissionId));
  return [
    'Submissions/' + id,
    'Submissions/Get?submissionId=' + id,
    'Submission/' + id,
    'Submission/Get?submissionId=' + id,
  ];
}

function extractSubmissionValues(raw: unknown): Record<string, unknown> {
  const detail = normalizeSubmissionDetailResponse(raw);
  if (detail.values && Object.keys(detail.values).length > 0) {
    return detail.values as Record<string, unknown>;
  }

  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const submission = item.submission && typeof item.submission === 'object'
    ? item.submission as Record<string, unknown>
    : item.Submission && typeof item.Submission === 'object'
      ? item.Submission as Record<string, unknown>
      : null;
  const rawObject = item.data ?? item.Data ?? submission?.data ?? submission?.Data;
  if (rawObject && typeof rawObject === 'object' && !Array.isArray(rawObject)) {
    return rawObject as Record<string, unknown>;
  }
  const rawJson = item.dataJson ?? item.DataJson ?? submission?.dataJson ?? submission?.DataJson;
  if (typeof rawJson === 'string' && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to empty object.
    }
  }
  return {};
}

async function fetchSubmissionDetail(cfg: ListViewConfig, submissionId: number): Promise<Record<string, unknown>> {
  let lastError = 'HTTP 404';
  for (const endpoint of buildSubmissionDetailEndpoints(submissionId)) {
    try {
      const response = await fetch(buildAuthorizedApiUrl(cfg.apiBase, endpoint, cfg.context), { credentials: 'include' });
      if (!response.ok) {
        lastError = 'HTTP ' + response.status;
        if (response.status === 404) continue;
        continue;
      }
      return extractSubmissionValues(await response.json());
    } catch (err) {
      lastError = (err as any)?.message || String(err);
    }
  }
  throw new Error(lastError);
}

async function fetchSubmissionDetailInfo(cfg: ListViewConfig, submissionId: number): Promise<ReturnType<typeof normalizeSubmissionDetailResponse>> {
  let lastError = 'HTTP 404';
  for (const endpoint of buildSubmissionDetailEndpoints(submissionId)) {
    try {
      const response = await fetch(buildAuthorizedApiUrl(cfg.apiBase, endpoint, cfg.context), { credentials: 'include' });
      if (!response.ok) {
        lastError = 'HTTP ' + response.status;
        if (response.status === 404) continue;
        continue;
      }
      return normalizeSubmissionDetailResponse(await response.json());
    } catch (err) {
      lastError = (err as any)?.message || String(err);
    }
  }
  throw new Error(lastError);
}

async function updateSubmissionData(cfg: ListViewConfig, submissionId: number, data: Record<string, unknown>): Promise<void> {
  const payload = { ...data };
  Object.keys(payload).forEach((key) => {
    if (key.startsWith('__mf_')) delete payload[key];
  });

  const endpoints = [
    'Submissions/UpdateData?submissionId=' + encodeURIComponent(String(submissionId)),
    'Submission/UpdateData?submissionId=' + encodeURIComponent(String(submissionId)),
  ];
  let lastError = 'HTTP 404';
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(buildAuthorizedApiUrl(cfg.apiBase, endpoint, cfg.context), {
        method: 'POST',
        credentials: 'include',
        headers: buildMutableRequestHeaders(cfg),
        body: JSON.stringify(payload),
      });
      if (response.ok) return;
      lastError = 'HTTP ' + response.status;
      if (response.status === 404) continue;
      const body = await response.text().catch(() => '');
      throw new Error(body || lastError);
    } catch (err) {
      lastError = (err as any)?.message || String(err);
    }
  }
  throw new Error(lastError);
}

function setEditSubmitBusyState(mountEl: HTMLElement, formId: number, busy: boolean): void {
  const loading = document.getElementById(`mf-loading-${formId}`);
  if (loading) loading.style.display = busy ? '' : 'none';

  const submitBtn = document.getElementById(`mf-btn-submit-${formId}`) as HTMLButtonElement | null;
  if (submitBtn) submitBtn.disabled = busy;

  mountEl.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[type="submit"], input[type="submit"]').forEach((btn) => {
    btn.disabled = busy;
    if (btn instanceof HTMLElement) btn.style.opacity = busy ? '0.6' : '';
  });
}

function showEditSubmitError(mountEl: HTMLElement, message: string): void {
  const existing = mountEl.querySelector('.mflv-error[data-mflv-edit-error="1"]');
  if (existing) existing.remove();
  const errorEl = document.createElement('div');
  errorEl.className = 'mflv-error';
  errorEl.setAttribute('data-mflv-edit-error', '1');
  errorEl.textContent = message;
  mountEl.prepend(errorEl);
}

function bindEditSubmitHandler(
  cfg: ListViewConfig,
  mountEl: HTMLElement,
  rendererConfig: RendererConfig,
  submissionId: number,
): void {
  const bindKey = String(submissionId) + ':' + String(rendererConfig.formId);
  if ((mountEl as any).__mfEditSubmitBound === bindKey) return;
  (mountEl as any).__mfEditSubmitBound = bindKey;

  let busy = false;
  const runSubmit = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      mountEl.querySelector('.mflv-error[data-mflv-edit-error="1"]')?.remove();
      clearFieldErrors(rendererConfig.formId);
      if (!validateForm(rendererConfig)) return;
      const data = collectFormData(rendererConfig);
      if (!data) return;
      setEditSubmitBusyState(mountEl, rendererConfig.formId, true);
      await updateSubmissionData(cfg, submissionId, data);
      document.dispatchEvent(new CustomEvent('mf:submission-success', {
        detail: { formId: rendererConfig.formId, submissionId, result: { success: true, submissionId } },
      }));
    } catch (err) {
      showEditSubmitError(mountEl, 'Could not save changes (' + ((err as any)?.message || String(err)) + ').');
    } finally {
      setEditSubmitBusyState(mountEl, rendererConfig.formId, false);
      busy = false;
    }
  };

  mountEl.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const submitTarget = target.closest(`#mf-btn-submit-${rendererConfig.formId}, button[type="submit"], input[type="submit"]`);
    if (!submitTarget || !mountEl.contains(submitTarget)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    void runSubmit();
  }, true);

  mountEl.addEventListener('submit', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && !mountEl.contains(target)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    void runSubmit();
  }, true);
}

function escapeSelectorLiteral(value: string): string {
  const raw = String(value || '');
  const cssApi = typeof CSS !== 'undefined' ? (CSS as any) : null;
  if (cssApi && typeof cssApi.escape === 'function') return cssApi.escape(raw);
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function hydrateEditFormFields(mountEl: HTMLElement, formId: number, data: Record<string, unknown> | null | undefined): void {
  if (!data || typeof data !== 'object') return;

  for (const [key, rawValue] of Object.entries(data)) {
    const escapedKey = escapeSelectorLiteral(key);
    const candidates = Array.from(new Set([
      ...Array.from(mountEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${escapedKey}"]`)),
      ...Array.from(mountEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`#mf-${formId}-${escapedKey}`)),
    ]));
    if (!candidates.length) continue;

    const inputGroup = candidates.filter((entry): entry is HTMLInputElement => entry instanceof HTMLInputElement);
    const isCheckboxGroup = inputGroup.length > 0 && inputGroup.every((entry) => entry.type === 'checkbox');
    const isRadioGroup = inputGroup.length > 0 && inputGroup.every((entry) => entry.type === 'radio');

    if (isCheckboxGroup || isRadioGroup) {
      const selectedValues = Array.isArray(rawValue)
        ? rawValue.map((entry) => String(entry ?? '').trim()).filter(Boolean)
        : String(rawValue ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
      inputGroup.forEach((input) => {
        input.checked = selectedValues.includes(String(input.value || '').trim());
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      continue;
    }

    const control = candidates[0];
    if (control instanceof HTMLSelectElement && control.multiple) {
      const selectedValues = Array.isArray(rawValue)
        ? rawValue.map((entry) => String(entry ?? '').trim())
        : String(rawValue ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
      Array.from(control.options).forEach((option) => {
        option.selected = selectedValues.includes(option.value);
      });
      control.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }

    if (control instanceof HTMLInputElement && control.type === 'file') {
      continue;
    }

    const fileEntries = collectSubmissionFiles(rawValue);
    const stringValue = rawValue == null
      ? ''
      : fileEntries.length > 0
        ? fileEntries.map((entry) => entry.fileName || 'Uploaded file').join(', ')
        : Array.isArray(rawValue)
          ? rawValue.join(', ')
          : typeof rawValue === 'object'
            ? JSON.stringify(rawValue)
            : String(rawValue);

    control.value = stringValue;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** [CleanFormModal v20260507-29] Open the form in a clean centred modal.
 *  Design notes:
 *  - Appended to <html> (documentElement) so no body-level transform/filter
 *    creates a new containing block for our position:fixed overlay (this is
 *    the same fix as the PDF cursor ghost — Oqtane/DNN skins sometimes apply
 *    transform on .container that breaks fixed positioning).
 *  - Body scroll locked while modal open — host page can't scroll behind.
 *  - Backdrop is near-black (rgba(0,0,0,.78)) so the host's chrome (Oqtane
 *    header, navigation, footer) is fully obscured — the user's eye sees
 *    only the form card.
 *  - Modal card is white, centred, max 880×92vh, with internal scroll for
 *    long forms. Header has just title + ↗ pop-out + × close.
 *  - The form mount uses MegaFormRenderer.init({ container: '#…' }) — same
 *    renderer the public page uses (single source of truth). */
function openFormModal(cfg: ListViewConfig, mode: 'add' | 'edit', submissionId?: number, onClose?: () => void): void {
  const url = buildFormUrl(cfg, mode === 'edit' ? submissionId : undefined);
  const recordLabel = recordLabelForConfig(cfg);
  const overlay = document.createElement('div');
  overlay.className = 'mflv-form-modal-overlay';
  overlay.setAttribute('data-mf-overlay', '1');
  const mountId = 'mflv-form-mount-' + cfg.formId + '-' + Date.now();
  overlay.innerHTML =
    '<div class="mflv-form-modal" role="dialog" aria-modal="true">' +
      '<div class="mflv-form-modal-hd">' +
        '<strong class="mflv-form-modal-title">' + (mode === 'add' ? '+ New ' + escapeHtml(recordLabel) : 'Edit ' + escapeHtml(recordLabel) + ' #' + submissionId) + '</strong>' +
        '<a class="mflv-form-modal-pop" href="' + escapeHtml(url) + '" target="_blank" rel="noopener" title="Open in a new tab">↗</a>' +
        '<button type="button" class="mflv-form-modal-close" aria-label="Close" title="Close (Esc)">×</button>' +
      '</div>' +
      '<div class="mflv-form-modal-body">' +
        '<div id="' + mountId + '" class="mflv-form-modal-mount">' +
          '<div class="mflv-loading">Loading form…</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // Append to <html> not <body> so ancestor transforms can't trap our fixed positioning.
  (document.documentElement || document.body).appendChild(overlay);

  // Lock body scroll so the host page can't slide behind the modal.
  const prevBodyOverflow = document.body.style.overflow;
  const prevHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
    overlay.remove();
    if (onClose) onClose();
  };
  (overlay.querySelector('.mflv-form-modal-close') as HTMLElement).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey, true);

  // [AddAnother v20260508-01] For Add mode, instead of auto-closing, show
  // an "Add another" button next to the success card so the admin can keep
  // entering rows without reopening. Edit mode keeps the auto-close behaviour
  // (you can only edit one row at a time).
  void mountFormInModal(cfg, mountId, mode, submissionId, () => {
    if (mode !== 'add') {
      window.setTimeout(close, 1800);
      return;
    }
    showAddAnotherBar(overlay, mountId, () => {
      // Reset the mount (re-init renderer with empty data) — keeps modal open.
      const mountEl = document.getElementById(mountId);
      if (mountEl) {
        mountEl.innerHTML = '<div class="mflv-loading">Loading form…</div>';
        delete (mountEl as any).dataset.mfRendererBooted;
        void mountFormInModal(cfg, mountId, 'add', undefined, () => {
          showAddAnotherBar(overlay, mountId, () => {/* repeat */});
        });
      }
    }, close);
  });
}

/** Inject a small action bar at the top of the modal body after a successful
 *  submit so the admin can choose: enter another row, or close + return to list. */
function showAddAnotherBar(overlay: HTMLElement, mountId: string, onAddAnother: () => void, onDone: () => void): void {
  const body = overlay.querySelector('.mflv-form-modal-body') as HTMLElement | null;
  if (!body) return;
  // Remove any previous bar before injecting.
  body.querySelectorAll('.mflv-add-another-bar').forEach((el) => el.remove());
  const bar = document.createElement('div');
  bar.className = 'mflv-add-another-bar';
  bar.innerHTML =
    '<span class="mflv-add-another-msg">✓ Submission saved. What next?</span>' +
    '<button type="button" class="mflv-btn mflv-btn-primary mflv-add-another-btn">+ Add another</button>' +
    '<button type="button" class="mflv-btn mflv-btn-ghost mflv-add-done-btn">Done</button>';
  body.insertBefore(bar, body.firstChild);
  (bar.querySelector('.mflv-add-another-btn') as HTMLElement).addEventListener('click', () => { bar.remove(); onAddAnother(); });
  (bar.querySelector('.mflv-add-done-btn')   as HTMLElement).addEventListener('click', () => { onDone(); });
  // Keep mount id reference so future re-mount can locate it.
  void mountId;
}

/** Fetch schema + boot MegaFormRenderer into the given mount id. */
async function mountFormInModal(
  cfg: ListViewConfig,
  mountId: string,
  mode: 'add' | 'edit',
  submissionId: number | undefined,
  onSubmitSuccess: () => void,
): Promise<void> {
  const w = window as any;
  // Wait for the renderer core to be loaded (Index.razor / FormView.ascx already
  // include megaform-renderer.js — just defend in case the bundle is late).
  let tries = 0;
  while ((!w.MegaFormRenderer || typeof w.MegaFormRenderer.init !== 'function') && tries < 60) {
    await new Promise((r) => setTimeout(r, 100));
    tries++;
  }
  const mountEl = document.getElementById(mountId);
  if (!mountEl) return;
  if (!w.MegaFormRenderer || typeof w.MegaFormRenderer.init !== 'function') {
    mountEl.innerHTML = '<div class="mflv-error">Form renderer is not available on this page. Use ↗ to open in a new tab.</div>';
    return;
  }

  let schemaPayload: any = {};
  try {
    const resp = await fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Schema/' + encodeURIComponent(String(cfg.formId)), cfg.context), { credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    schemaPayload = await resp.json();
  } catch (err) {
    mountEl.innerHTML = '<div class="mflv-error">Could not load form schema (' + escapeHtml((err as any)?.message || String(err)) + ').</div>';
    return;
  }
  let schema: any = schemaPayload && (schemaPayload.schema || schemaPayload.Schema);
  if (typeof schema === 'string') { try { schema = JSON.parse(schema); } catch { schema = {}; } }
  if (!schema || typeof schema !== 'object') schema = schemaPayload;

  // Prefilled data for edit mode — fetch the existing submission and pass it.
  let prefilled: any = null;
  if (mode === 'edit' && submissionId && submissionId > 0) {
    try {
        const r = await fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Submission/' + encodeURIComponent(String(submissionId)), cfg.context), { credentials: 'include' });
      if (r.ok) {
        const sub = await r.json();
        const dataRaw = sub.data ?? sub.Data ?? sub.dataJson ?? sub.DataJson ?? null;
        prefilled = typeof dataRaw === 'string' ? JSON.parse(dataRaw) : dataRaw;
      }
    } catch { /* swallow — form will load empty */ }
  }

  mountEl.innerHTML = ''; // clear loading state

  // [SuccessDetection v20260508-02] Three-way redundant detection so the
  // Add-another bar / auto-close ALWAYS fires after a successful submit:
  //   (a) renderer dispatches `mf:submission-success` (v20260507-29 & later)
  //   (b) MutationObserver watches the mount for the success container becoming
  //       visible OR the form container becoming hidden — works even on legacy
  //       renderers that don't dispatch the event
  //   (c) interval poll as a final safety net (custom-html shells where the
  //       observer's mutations may be inside an iframe-like sub-tree)
  let triggered = false;
  const fireOnce = () => {
    if (triggered) return;
    triggered = true;
    try { observer.disconnect(); } catch { /* */ }
    window.clearInterval(successPoller);
    document.removeEventListener('mf:submission-success', onSuccess as EventListener);
    onSubmitSuccess();
  };
  const onSuccess = (ev: Event) => {
    const detail = ((ev as CustomEvent).detail || {}) as any;
    const fid = Number(detail.formId || 0);
    if (!fid || fid === cfg.formId) fireOnce();
  };
  document.addEventListener('mf:submission-success', onSuccess as EventListener);

  function detectSuccess(): boolean {
    const successEl = mountEl.querySelector('.mf-success-message, [id^="mf-success-"]') as HTMLElement | null;
    if (successEl) {
      const cs = window.getComputedStyle(successEl);
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && successEl.offsetWidth > 0) {
        // Make sure it actually has content (not just an empty placeholder).
        if (successEl.textContent && successEl.textContent.trim().length > 0) return true;
      }
    }
    const formEl = mountEl.querySelector('[id^="mf-form-"]:not([id*="wrapper"]):not([id*="success"]):not([id*="error"]):not([id*="loading"])') as HTMLElement | null;
    if (formEl && window.getComputedStyle(formEl).display === 'none') return true;
    return false;
  }

  const observer = new MutationObserver(() => { if (detectSuccess()) fireOnce(); });
  try { observer.observe(mountEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch { /* */ }

  const successPoller = window.setInterval(() => { if (detectSuccess()) fireOnce(); }, 600);
  window.setTimeout(() => window.clearInterval(successPoller), 600000);

  try {
    w.MegaFormRenderer.init({
      formId: cfg.formId,
      schema: schema,
      settingsJson: schemaPayload.settingsJson || null,
      themeJson:    schemaPayload.themeJson || null,
      title:        String(schemaPayload.title || schemaPayload.Title || ''),
      description:  String(schemaPayload.description || schemaPayload.Description || ''),
      container:    '#' + mountId,
      submitButtonText: String(schemaPayload.submitButtonText || schemaPayload.SubmitButtonText || 'Submit'),
      successMessage:   String(schemaPayload.successMessage   || schemaPayload.SuccessMessage   || 'Thank you!'),
      apiBase: cfg.apiBase,
      rules: schemaPayload.rules || schemaPayload.Rules || [],
      prefilledData: prefilled || undefined,
      resumeToken:   mode === 'edit' && submissionId ? ('edit-' + submissionId) : undefined,
    });
    if (mode === 'edit' && submissionId && submissionId > 0) {
      const editRendererConfig: RendererConfig = {
        formId: cfg.formId,
        schema,
        container: '#' + mountId,
        apiBaseUrl: cfg.apiBase,
        apiBase: cfg.apiBase,
        submitButtonText: String(schemaPayload.submitButtonText || schemaPayload.SubmitButtonText || 'Submit'),
        successMessage: String(schemaPayload.successMessage || schemaPayload.SuccessMessage || 'Thank you!'),
        rules: schemaPayload.rules || schemaPayload.Rules || [],
        prefilledData: prefilled || undefined,
        loadTimestamp: Date.now() / 1000,
      };
      bindEditSubmitHandler(cfg, mountEl, editRendererConfig, submissionId);
      void fetchSubmissionDetail(cfg, submissionId)
        .then((data) => { hydrateEditFormFields(mountEl, cfg.formId, data); })
        .catch(() => { /* keep renderer state as-is */ });
    }
  } catch (err) {
    mountEl.innerHTML = '<div class="mflv-error">Renderer init failed: ' + escapeHtml((err as any)?.message || String(err)) + '</div>';
  }
}

/** [ListViewActions v20260508-02] Inline read-only view of a submission.
 *  Renders field labels + values from the row's parsed data — no form renderer
 *  needed. If the row's data isn't loaded yet (search filtered it out), fetch
 *  it from /Submission/{id}. */
function openViewModal(
  cfg: ListViewConfig,
  submissionId: number,
  row?: SubmissionRow,
  preferredAction?: string,
  onWorkflowChanged?: () => void,
): void {
  const rowTitle = row ? String(readField(row, 'title') || readField(row, 'name') || '').trim() : '';
  const modalTitle = rowTitle || ('View submission #' + submissionId);
  const overlay = document.createElement('div');
  overlay.className = 'mflv-form-modal-overlay';
  overlay.setAttribute('data-mf-overlay', '1');
  overlay.innerHTML =
    '<div class="mflv-form-modal" role="dialog" aria-modal="true">' +
      '<div class="mflv-form-modal-hd">' +
        '<strong class="mflv-form-modal-title">' + escapeHtml(modalTitle) + '</strong>' +
        '<button type="button" class="mflv-form-modal-close" title="Close (Esc)">×</button>' +
      '</div>' +
      '<div class="mflv-form-modal-body">' +
        '<div class="mflv-view-card mflv-view-shell">' +
          '<div class="mflv-loading">Loading…</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  (document.documentElement || document.body).appendChild(overlay);
  const prevBodyOverflow = document.body.style.overflow;
  const prevHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
    overlay.remove();
  };
  (overlay.querySelector('.mflv-form-modal-close') as HTMLElement).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey, true);

  const card = overlay.querySelector('.mflv-view-card') as HTMLElement;
  const renderRows = (data: Record<string, unknown>) => {
    const submissionRow: SubmissionRow = { data, submissionId, formId: cfg.formId, status: 'submitted', submittedOnUtc: '' };
    // [ListViewDetailTemplate v20260508-03] If admin supplied a detail HTML
    // template, run it through the same token engine as row templates and
    // inject directly. Otherwise fall back to the auto field/value table.
    const tpl = String(cfg.detailTemplate || '').trim();
    if (tpl) {
      card.innerHTML = applyRowTemplate(tpl, submissionRow, cfg.context);
      return;
    }
    const fieldsToShow = cfg.fields.length > 0
      ? cfg.fields
      : Object.keys(data || {}).filter(k => !k.startsWith('__mf_')).map(k => ({ key: k, label: k }));
    if (!fieldsToShow.length) {
      card.innerHTML = '<div class="mflv-empty">No fields to show.</div>';
      return;
    }
    const htmlSlots: Array<{ slot: string; html: string }> = [];
    const rowsHtml = fieldsToShow.map((f, index) => {
      const displayHtml = renderFieldDisplayHtml(readFieldRawForDetail(submissionRow, f.key), { fieldKey: f.key, fieldType: f.type });
      const txt = '__MF_HTML_SLOT_' + index + '__';
      htmlSlots.push({ slot: txt, html: displayHtml });
      return '<div class="mflv-view-row">' +
        '<div class="mflv-view-label">' + escapeHtml(f.label || f.key) + '</div>' +
        '<div class="mflv-view-value">' + (txt ? escapeHtml(txt) : '<span class="mflv-view-empty">—</span>') + '</div>' +
      '</div>';
    }).join('');
    card.innerHTML = htmlSlots.reduce((markup, entry) => markup.replace(entry.slot, entry.html), rowsHtml);
  };

  if (row && row.data && Object.keys(row.data).length > 0) {
    renderRows(row.data);
    return;
  }
  // Fallback fetch
  fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Submission/' + encodeURIComponent(String(submissionId)), cfg.context), { credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
    .then((sub) => {
      let data: Record<string, unknown> = {};
      const rawObj = sub.data ?? sub.Data;
      if (rawObj && typeof rawObj === 'object') data = rawObj;
      else {
        const rawStr = sub.dataJson ?? sub.DataJson ?? '';
        if (typeof rawStr === 'string' && rawStr.trim()) {
          try { data = JSON.parse(rawStr); } catch { /* keep empty */ }
        }
      }
      renderRows(data);
    })
    .catch((err) => { card.innerHTML = '<div class="mflv-error">Could not load submission: ' + escapeHtml(String(err)) + '</div>'; });
}

function openWorkflowSubmissionModal(
  cfg: ListViewConfig,
  submissionId: number,
  preferredAction?: string,
  onWorkflowChanged?: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'mflv-form-modal-overlay';
  overlay.setAttribute('data-mf-overlay', '1');
  overlay.innerHTML =
    '<div class="mflv-form-modal" role="dialog" aria-modal="true">' +
      '<div class="mflv-form-modal-hd">' +
        '<strong class="mflv-form-modal-title">Submission #' + submissionId + '</strong>' +
        '<button type="button" class="mflv-form-modal-close" title="Close (Esc)">Ã—</button>' +
      '</div>' +
      '<div class="mflv-form-modal-body">' +
        '<div class="mflv-view-card mflv-view-shell"><div class="mflv-loading">Loadingâ€¦</div></div>' +
      '</div>' +
    '</div>';
  (document.documentElement || document.body).appendChild(overlay);

  const prevBodyOverflow = document.body.style.overflow;
  const prevHtmlOverflow = document.documentElement.style.overflow;
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = prevBodyOverflow;
    document.documentElement.style.overflow = prevHtmlOverflow;
    overlay.remove();
  };
  (overlay.querySelector('.mflv-form-modal-close') as HTMLElement).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey, true);

  const card = overlay.querySelector('.mflv-view-card') as HTMLElement;
  void fetchSubmissionDetailInfo(cfg, submissionId)
    .then((detail) => {
      const currentStep = detail.workflowDetail?.transparency?.activeNodeLabel
        || detail.workflowDetail?.workflowCase?.currentNodeId
        || '—';
      const meta = document.createElement('div');
      meta.className = 'mflv-view-meta';
      meta.innerHTML =
        '<span>Status: <strong>' + escapeHtml(detail.submission.status || 'Submitted') + '</strong></span>' +
        '<span>Current step: <strong>' + escapeHtml(currentStep) + '</strong></span>' +
        '<span>Submitted: <strong>' + escapeHtml(formatInlineDate(detail.submission.submittedOnUtc)) + '</strong></span>';

      const shell = renderSubmissionDetailShell({
        submission: detail,
        fallbackFields: cfg.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type || 'Text',
        })),
        initialTab: 'data',
        mode: 'modal',
        readOnly: true,
        workflowActions: {
          preferredAction: preferredAction || null,
          onAction: async (request: SubmissionWorkflowActionRequest): Promise<SubmissionWorkflowActionResult> => {
            const endpoint = request.action === 'claim'
              ? 'Claim'
              : request.action === 'approve'
                ? 'Approve'
                : request.action === 'reject'
                  ? 'Reject'
                  : 'Forward';
            const body = request.action === 'forward'
              ? { taskId: request.taskId, targetUser: request.targetUser, comment: request.comment, data: request.data }
              : request.action === 'claim'
                ? { taskId: request.taskId, comment: request.comment }
                : { taskId: request.taskId, comment: request.comment, data: request.data };
            const result = await postWorkflowTaskAction(cfg, endpoint, body);
            return result.ok
              ? { ok: true, message: labelForWorkflowAction(request.action) + ' completed.' }
              : { ok: false, message: result.message || 'Workflow action failed.' };
          },
          onActionCompleted: () => {
            close();
            onWorkflowChanged?.();
          },
        },
      });

      card.innerHTML = '';
      card.appendChild(meta);
      card.appendChild(shell.root);
    })
    .catch((err) => {
      card.innerHTML = '<div class="mflv-error">Could not load submission: ' + escapeHtml(String((err as any)?.message || err)) + '</div>';
    });
}

function labelForWorkflowAction(action: string): string {
  switch (String(action || '').trim().toLowerCase()) {
    case 'claim': return 'Claim';
    case 'approve': return 'Approve';
    case 'reject': return 'Reject';
    case 'forward': return 'Forward';
    default: return 'Action';
  }
}

function formatInlineDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function readFieldRawForDetail(submission: SubmissionRow, key: string): unknown {
  if (!submission || !key) return '';
  const data = submission.data && typeof submission.data === 'object'
    ? submission.data as Record<string, unknown>
    : null;
  if (data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
    const lowered = key.toLowerCase();
    const match = Object.keys(data).find((name) => name.toLowerCase() === lowered);
    if (match) return data[match];
  }
  return readField(submission, key);
}

async function deleteSubmission(cfg: ListViewConfig, submissionId: number): Promise<boolean> {
  if (!submissionId) return false;
  if (!window.confirm('Delete submission #' + submissionId + '? This cannot be undone.')) return false;
  try {
    const url = buildAuthorizedApiUrl(cfg.apiBase, 'Submissions/' + encodeURIComponent(String(submissionId)), cfg.context);
    const r = await fetch(url, { method: 'DELETE', credentials: 'include' });
    if (r.ok) return true;
    // Try alternate endpoint shape if the first 404s.
    const r2 = await fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Submission/Delete?submissionId=' + encodeURIComponent(String(submissionId)), cfg.context), { method: 'POST', credentials: 'include' });
    return r2.ok;
  } catch { return false; }
}

async function postWorkflowTaskAction(
  cfg: ListViewConfig,
  endpoint: 'Claim' | 'Approve' | 'Reject' | 'Forward',
  body: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const response = await fetch(buildAuthorizedApiUrl(cfg.apiBase, 'Workflow/Tasks/' + endpoint, cfg.context), {
      method: 'POST',
      credentials: 'include',
      headers: buildMutableRequestHeaders(cfg),
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true };
    const raw = await response.text().catch(() => '');
    return { ok: false, message: raw || ('HTTP ' + response.status) };
  } catch (err) {
    return { ok: false, message: (err as any)?.message || String(err) };
  }
}

async function performWorkflowRowAction(
  cfg: ListViewConfig,
  row: SubmissionRow,
  action: SubmissionActionDescriptor,
): Promise<{ ok: boolean; refresh: boolean }> {
  if (!action.taskId) {
    alert('This workflow action is missing a task id.');
    return { ok: false, refresh: false };
  }

  if (action.key === 'claim') {
    const comment = window.prompt('Optional claim note for submission #' + row.submissionId + ':', '') || '';
    const result = await postWorkflowTaskAction(cfg, 'Claim', { taskId: action.taskId, comment });
    if (!result.ok) {
      alert('Could not claim task (' + (result.message || 'Unknown error') + ').');
      return { ok: false, refresh: false };
    }
    return { ok: true, refresh: true };
  }

  if (action.key === 'approve') {
    const comment = window.prompt('Approval note for submission #' + row.submissionId + ' (optional):', '') || '';
    const result = await postWorkflowTaskAction(cfg, 'Approve', { taskId: action.taskId, comment, data: {} });
    if (!result.ok) {
      alert('Could not approve task (' + (result.message || 'Unknown error') + ').');
      return { ok: false, refresh: false };
    }
    return { ok: true, refresh: true };
  }

  if (action.key === 'reject') {
    const promptLabel = action.requiresComment
      ? 'Rejection note is required for submission #' + row.submissionId + ':'
      : 'Rejection note for submission #' + row.submissionId + ' (optional):';
    const comment = window.prompt(promptLabel, '') || '';
    if (action.requiresComment && !comment.trim()) {
      alert('This workflow step requires a rejection comment.');
      return { ok: false, refresh: false };
    }
    const result = await postWorkflowTaskAction(cfg, 'Reject', { taskId: action.taskId, comment, data: {} });
    if (!result.ok) {
      alert('Could not reject task (' + (result.message || 'Unknown error') + ').');
      return { ok: false, refresh: false };
    }
    return { ok: true, refresh: true };
  }

  if (action.key === 'forward') {
    const targetUser = window.prompt('Forward this BPMN task to which username/email?', '') || '';
    if (!targetUser.trim()) return { ok: false, refresh: false };
    const comment = window.prompt('Forwarding note for submission #' + row.submissionId + ' (optional):', '') || '';
    const result = await postWorkflowTaskAction(cfg, 'Forward', { taskId: action.taskId, targetUser, comment });
    if (!result.ok) {
      alert('Could not forward task (' + (result.message || 'Unknown error') + ').');
      return { ok: false, refresh: false };
    }
    return { ok: true, refresh: true };
  }

  return { ok: false, refresh: false };
}

function renderPagination(state: ListViewState, totalPages: number): string {
  if (totalPages <= 1) return '';
  const prev = state.page > 0 ? '<button type="button" class="mflv-pg-btn" data-mflv-page="' + (state.page - 1) + '">‹ Prev</button>' : '';
  const next = state.page < totalPages - 1 ? '<button type="button" class="mflv-pg-btn" data-mflv-page="' + (state.page + 1) + '">Next ›</button>' : '';
  return '<div class="mflv-pagination">' +
    prev +
    '<span class="mflv-pg-info">Page ' + (state.page + 1) + ' / ' + totalPages + '</span>' +
    next +
  '</div>';
}

function renderEmptyState(message: string): string {
  return '<div class="mflv-empty">' + escapeHtml(message) + '</div>';
}

function renderError(message: string): string {
  return '<div class="mflv-error">' + escapeHtml(message) + '</div>';
}

async function mount(root: HTMLElement, override?: Partial<ListViewConfig>): Promise<void> {
  if (!root) return;
  if (root.dataset.mfListviewBooted === '1') return;
  root.dataset.mfListviewBooted = '1';

  const cfg = readConfigFromElement(root, override);
  if (!cfg.formId) {
    root.innerHTML = renderError('ListView requires data-mf-form-id.');
    return;
  }

  root.innerHTML = '<div class="mflv-loading">Loading submissions…</div>';

  let rows: SubmissionRow[] = [];
  try {
    rows = await fetchSubmissions({
      formId: cfg.formId,
      apiBase: cfg.apiBase,
      queryKey: cfg.queryKey,
      fields: cfg.fields.map(f => f.key),
      template: '',
      pageSize: 1000, // Fetch a big batch; pagination is client-side here for simplicity.
      emptyMessage: cfg.emptyMessage,
      context: cfg.context || {},
    });
  } catch {
    root.innerHTML = renderError('Could not load submissions.');
    return;
  }

  const state: ListViewState = {
    page: 0,
    search: '',
    sortKey: '',
    sortDir: 'desc',
    rows,
    filtered: rows.slice(),
  };

  function reload(): Promise<void> {
    return fetchSubmissions({
      formId: cfg.formId,
      apiBase: cfg.apiBase,
      queryKey: cfg.queryKey,
      fields: cfg.fields.map(f => f.key),
      template: '',
      pageSize: 1000,
      emptyMessage: cfg.emptyMessage,
      context: cfg.context || {},
    }).then((next) => {
      state.rows = next;
      rerender();
    }).catch(() => { /* swallow — keep current state */ });
  }

  function rerender(): void {
    const detailFilter = getUrlDetailFilter();
    const sourceRows = detailFilter
      ? state.rows.filter(r => rowMatchesUrlDetailFilter(r, detailFilter))
      : state.rows;
    const filtered = sourceRows
      .filter(r => matchesSearch(r, state.search, cfg.fields));
    state.filtered = state.sortKey
      ? filtered.slice().sort((a, b) => compareSubmissions(a, b, state.sortKey, state.sortDir))
      : filtered;

    const pg = paginate(state.filtered, state.page, cfg.pageSize);
    state.page = Math.min(state.page, pg.totalPages - 1);

    const visibleFields = cfg.fields.length ? cfg.fields : [{ key: 'submissionId', label: 'ID' }];
    const rowTpl = cfg.rowTemplate || defaultRowTemplate(visibleFields);
    const wrapTpl = cfg.wrapperTemplate || defaultWrapperTemplate(visibleFields);

    // [ListViewActions v20260507-28] Append the action cell to each row when
    // showRowActions is on. Adds a matching <th> via wrapper-template post-processing.
    const hasCustomWrapper = !!cfg.wrapperTemplate;
    const rowsHtml = pg.slice.length
      ? pg.slice.map(r => {
          const baseRow = applyRowTemplate(rowTpl, r, cfg.context);
          if (!cfg.showRowActions) return baseRow;
          return baseRow.replace(/<\/tr>\s*$/i, renderSubmissionActionCell(r) + '</tr>');
        }).join('\n')
      // [WrapperEmptyState v20260516-13] When a custom wrapper template is
      // supplied (Outlook / SharePoint chrome etc.) we keep the chrome rendered
      // even with zero rows by injecting a styled empty notice in place of
      // {{rows}}. Without this, the runtime fell back to renderEmptyState()
      // and the wrapper never painted on freshly-installed sites.
      : (hasCustomWrapper
          ? `<div class="mflv-wrapper-empty">${escapeHtml(cfg.emptyMessage)}</div>`
          : '');
    let tableHtml = wrapTpl.replace(/\{\{\s*rows\s*\}\}/g, rowsHtml);
    if (cfg.showRowActions) {
      // Inject an extra <th> for the actions column right before the closing </tr> of <thead>.
      tableHtml = tableHtml.replace(/(<\/tr>\s*<\/thead>)/i, '<th class="mflv-th mflv-th-actions">Actions</th>$1');
    }

    // [WrapperEmptyState v20260516-13] Render the wrapper unconditionally
    // whenever a custom template is provided — even with no rows — so the
    // chrome is visible. Only fall back to the bare empty-state card when
    // the runtime is using the default skeleton wrapper.
    const bodyHtml = (pg.slice.length || hasCustomWrapper)
      ? tableHtml
      : renderEmptyState(cfg.emptyMessage);

    root.innerHTML =
      '<div class="mflv-shell" data-mf-listview-badge="' + LISTVIEW_RUNTIME_BADGE + '">' +
        renderToolbar(cfg, state) +
        bodyHtml +
        renderPagination(state, pg.totalPages) +
      '</div>';
    ensureAcmeBlogMockCss(root);
    ensureAcmeBlogHostCompatibilityCss(root);
    applyAcmeBlogStaticEnhancements(root);

    // [WrapperInlineScripts v20260518-01] HTML5 spec: <script> tags inserted via
    // innerHTML do NOT execute. Custom wrapper templates (Gmail Inbox etc.) ship
    // a small bootstrap script that wires sidebar nav → search filter. Clone and
    // re-insert each script on every rerender so newly-replaced sidebar elements
    // get fresh listeners. Skip external scripts (they would re-fetch every time).
    root.querySelectorAll('script:not([src])').forEach((s) => {
      const fresh = document.createElement('script');
      fresh.text = s.textContent || '';
      s.parentNode?.replaceChild(fresh, s);
    });

    bindUi();
  }

  function bindUi(): void {
    const searchInp = root.querySelector('.mflv-search-input') as HTMLInputElement | null;
    if (searchInp) {
      searchInp.addEventListener('input', () => {
        state.search = String(searchInp.value || '').trim();
        state.page = 0;
        rerender();
        // Re-focus & restore caret since rerender replaced the DOM.
        const next = root.querySelector('.mflv-search-input') as HTMLInputElement | null;
        if (next) { next.focus(); next.setSelectionRange(state.search.length, state.search.length); }
      });
    }
    if (cfg.enableSort) {
      root.querySelectorAll('[data-mflv-sort]').forEach(el => {
        (el as HTMLElement).style.cursor = 'pointer';
        el.addEventListener('click', () => {
          const key = (el as HTMLElement).getAttribute('data-mflv-sort') || '';
          if (!key) return;
          if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          else { state.sortKey = key; state.sortDir = 'asc'; }
          rerender();
        });
      });
    }
    root.querySelectorAll('[data-mflv-page]').forEach(el => {
      el.addEventListener('click', () => {
        const next = parseInt((el as HTMLElement).getAttribute('data-mflv-page') || '0', 10) || 0;
        state.page = next;
        rerender();
      });
    });

    // [ListViewActions v20260507-28] Wire + Add new + per-row View/Edit/Delete.
    root.querySelectorAll('.mflv-add-btn,[data-mflv-add]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        openFormModal(cfg, 'add', undefined, () => { void reload(); });
      });
    });
    bindBlogKitControls();
    root.querySelectorAll('[data-mflv-action]').forEach((el) => {
      el.addEventListener('click', async (event) => {
        const target = event.target as HTMLElement | null;
        const nestedInteractive = target?.closest('a,button,input,select,textarea,[data-mflv-stop]');
        if (nestedInteractive && nestedInteractive !== el) return;
        event.preventDefault();
        const action = (el as HTMLElement).getAttribute('data-mflv-action') || '';
        const id = parseInt((el as HTMLElement).getAttribute('data-mflv-id') || '0', 10) || 0;
        if (!id) return;
        const row = state.rows.find(r => r.submissionId === id);
        if (action === 'navigate') {
          const url = (el as HTMLElement).getAttribute('data-mflv-url') || '';
          if (url) window.location.href = url;
        } else if (action === 'view') {
          const hasTask = !!((el as HTMLElement).getAttribute('data-mflv-task-id') || row?.activeTaskId || '');
          if (hasTask) openWorkflowSubmissionModal(cfg, id);
          else openViewModal(cfg, id, row);
        } else if (action === 'edit') {
          openFormModal(cfg, 'edit', id, () => { void reload(); });
        } else if (action === 'delete') {
          const ok = await deleteSubmission(cfg, id);
          if (ok) { void reload(); }
          else { alert('Could not delete submission.'); }
        } else if ((action === 'claim' || action === 'approve' || action === 'reject' || action === 'forward') && row) {
          openWorkflowSubmissionModal(cfg, id, action, () => { void reload(); });
        }
      });
    });
  }

  function bindBlogKitControls(): void {
    root.querySelectorAll('[data-mf-blogkit-comment-submit]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const button = el as HTMLElement;
        const shell = button.closest('[data-mf-blogkit-comment-shell]') as HTMLElement | null;
        if (!shell) return;
        void submitBlogKitComment(cfg, shell, button);
      });
    });
    root.querySelectorAll('[data-mf-blogkit-comment-shell]').forEach((el) => {
      const shell = el as HTMLElement;
      if (!shell.getAttribute('data-mf-blogkit-comment-start')) {
        shell.setAttribute('data-mf-blogkit-comment-start', String(Date.now()));
      }
      void loadBlogKitComments(cfg, shell);
    });

    root.querySelectorAll('[data-mf-blogkit-layout],[data-mf-acme-layout]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const button = el as HTMLElement;
        const mode = (button.getAttribute('data-mf-blogkit-layout') || button.getAttribute('data-mf-acme-layout') || 'grid').toLowerCase();
        const shell = button.closest('.mf-blogkit-archive,.mf-acme-blog-archive') as HTMLElement | null;
        if (!shell) return;
        shell.setAttribute('data-view-mode', mode === 'list' ? 'list' : 'grid');
        applyAcmeArchiveLayout(shell, mode === 'list' ? 'list' : 'grid');
        shell.querySelectorAll('[data-mf-blogkit-layout],[data-mf-acme-layout]').forEach((peer) => {
          const active = ((peer as HTMLElement).getAttribute('data-mf-blogkit-layout') || (peer as HTMLElement).getAttribute('data-mf-acme-layout')) === mode;
          (peer as HTMLElement).classList.toggle('is-active', active);
          (peer as HTMLElement).classList.toggle('bg-primary', active);
          (peer as HTMLElement).classList.toggle('text-primary-foreground', active);
          (peer as HTMLElement).setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });

    root.querySelectorAll('[data-mf-blogkit-state],[data-mf-acme-state]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const button = el as HTMLElement;
        const state = (button.getAttribute('data-mf-blogkit-state') || button.getAttribute('data-mf-acme-state') || 'normal').toLowerCase();
        const shell = button.closest('.mf-blogkit-archive,.mf-acme-blog-archive') as HTMLElement | null;
        if (!shell) return;
        shell.setAttribute('data-demo-state', state);
        applyAcmeArchiveState(shell, state);
        shell.querySelectorAll('[data-mf-blogkit-state],[data-mf-acme-state]').forEach((peer) => {
          const active = ((peer as HTMLElement).getAttribute('data-mf-blogkit-state') || (peer as HTMLElement).getAttribute('data-mf-acme-state')) === state;
          (peer as HTMLElement).classList.toggle('is-active', active);
          (peer as HTMLElement).setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });

    root.querySelectorAll('[data-mf-blogkit-toggle],[data-mf-acme-toggle]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const button = el as HTMLElement;
        const wasActive = button.classList.contains('is-active');
        button.classList.toggle('is-active', !wasActive);
        button.setAttribute('aria-pressed', wasActive ? 'false' : 'true');
        const counterSelector = button.getAttribute('data-mf-blogkit-counter') || button.getAttribute('data-mf-acme-counter') || '';
        const counter = counterSelector ? button.querySelector(counterSelector) as HTMLElement | null : null;
        if (!counter) return;
        const raw = parseInt((counter.textContent || '').replace(/[^0-9-]/g, ''), 10);
        const next = (Number.isFinite(raw) ? raw : 0) + (wasActive ? -1 : 1);
        counter.textContent = String(Math.max(0, next));
      });
    });

    root.querySelectorAll('[data-mf-blogkit-filter],[data-mf-acme-filter]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.preventDefault();
        const button = el as HTMLElement;
        const filterName = (button.getAttribute('data-mf-blogkit-filter') || button.getAttribute('data-mf-acme-filter') || '').toLowerCase();
        const value = button.getAttribute('data-mf-blogkit-value') || button.getAttribute('data-mf-acme-value') || '';
        const shell = button.closest('.mf-blogkit,.mf-acme-blog') as HTMLElement | null;
        const group = button.closest('[data-mf-blogkit-filter-group],[data-mf-acme-filter-group]') as HTMLElement | null;
        if (!shell || !filterName) return;
        shell.setAttribute('data-mf-blogkit-filter-' + filterName, value);
        (group || shell).querySelectorAll('[data-mf-blogkit-filter="' + filterName + '"],[data-mf-acme-filter="' + filterName + '"]').forEach((peer) => {
          const active = ((peer as HTMLElement).getAttribute('data-mf-blogkit-value') || (peer as HTMLElement).getAttribute('data-mf-acme-value')) === value;
          (peer as HTMLElement).classList.toggle('is-active', active);
          (peer as HTMLElement).classList.toggle('bg-primary', active);
          (peer as HTMLElement).classList.toggle('text-primary-foreground', active);
          (peer as HTMLElement).classList.toggle('bg-muted', !active);
          (peer as HTMLElement).classList.toggle('text-muted-foreground', !active);
          (peer as HTMLElement).setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        applyBlogKitFilters(shell);
      });
    });
  }

  function applyAcmeArchiveLayout(shell: HTMLElement, mode: 'grid' | 'list'): void {
    if (!shell.classList.contains('mf-acme-blog-archive')) return;
    const list = shell.querySelector('.mf-acme-archive-list') as HTMLElement | null;
    if (list) {
      list.className = mode === 'list'
        ? 'mf-acme-archive-list space-y-4'
        : 'mf-acme-archive-list grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
    }
    shell.querySelectorAll('.mf-acme-archive-wrap').forEach((node) => {
      const el = node as HTMLElement;
      el.classList.toggle('sm:flex-row', mode === 'list');
    });
    shell.querySelectorAll('.mf-acme-archive-image').forEach((node) => {
      const el = node as HTMLElement;
      el.classList.toggle('sm:w-48', mode === 'list');
      el.classList.toggle('lg:w-64', mode === 'list');
      el.classList.toggle('shrink-0', mode === 'list');
      el.classList.toggle('sm:aspect-[4/3]', mode === 'list');
    });
    shell.querySelectorAll('.mf-acme-archive-card').forEach((node) => {
      const el = node as HTMLElement;
      el.classList.toggle('mf-acme-list-mode', mode === 'list');
    });
  }

  function applyAcmeArchiveState(shell: HTMLElement, state: string): void {
    if (!shell.classList.contains('mf-acme-blog-archive')) return;
    const normalized = state === 'loading' || state === 'empty' ? state : 'normal';
    const posts = shell.querySelector('.mf-acme-archive-list') as HTMLElement | null;
    const loading = shell.querySelector('.mf-acme-loading-state') as HTMLElement | null;
    const empty = shell.querySelector('.mf-acme-empty-state') as HTMLElement | null;
    const pager = shell.querySelector('.mf-acme-pagination') as HTMLElement | null;
    if (posts) posts.hidden = normalized !== 'normal';
    if (pager) pager.hidden = normalized !== 'normal';
    if (loading) loading.hidden = normalized !== 'loading';
    if (empty) empty.hidden = normalized !== 'empty';
  }

  function ensureAcmeBlogMockCss(scope: HTMLElement): void {
    if (!scope.querySelector('.mf-acme-blog')) return;
    if (document.querySelector('link[data-mf-acme-blog-css="1"]')) return;
    const href = resolveSiblingAssetUrl('megaform-listview.js', '../css/acme-blog-mock.css')
      || resolveSiblingAssetUrl('megaform-listview.css', 'acme-blog-mock.css')
      || (readPlatformName() === 'oqtane'
        ? '/Modules/MegaForm/css/acme-blog-mock.css'
        : '/DesktopModules/MegaForm/Assets/css/acme-blog-mock.css');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-mf-acme-blog-css', '1');
    document.head.appendChild(link);
  }

  function ensureAcmeBlogHostCompatibilityCss(scope: HTMLElement): void {
    if (!scope.querySelector('.mf-acme-blog')) return;
    if (document.querySelector('style[data-mf-acme-blog-host-css="1"]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-mf-acme-blog-host-css', '1');
    style.textContent = `
.mflv-shell:has(.mf-acme-blog)>.mflv-toolbar,
.mflv-shell:has(.mf-acme-blog)>.mflv-pagination{display:none!important}
html:has(.mf-acme-blog),body:has(.mf-acme-blog){overflow-x:hidden}
.mf-acme-blog,.mf-acme-blog *{box-sizing:border-box;letter-spacing:0}
.mf-acme-blog{font-family:var(--font-sans);font-size:16px;line-height:24px;color:var(--foreground);
  --spacing:4px;--container-2xl:672px;--container-4xl:896px;--container-5xl:1024px;--container-7xl:1280px;
  --text-xs:12px;--text-xs--line-height:16px;--text-sm:14px;--text-sm--line-height:20px;
  --text-base:16px;--text-base--line-height:24px;--text-lg:18px;--text-lg--line-height:28px;
  --text-xl:20px;--text-xl--line-height:28px;--text-2xl:24px;--text-2xl--line-height:32px;
  --text-3xl:30px;--text-3xl--line-height:36px;--text-4xl:36px;--text-4xl--line-height:40px;
  --text-5xl:48px;--text-5xl--line-height:1;--text-6xl:60px;--text-6xl--line-height:1}
.mf-acme-blog h1,.mf-acme-blog h2,.mf-acme-blog h3,.mf-acme-blog h4,.mf-acme-blog h5,.mf-acme-blog h6,.mf-acme-blog p{margin-top:0}
.mf-acme-blog h1,.mf-acme-blog h2,.mf-acme-blog h3,.mf-acme-blog h4,.mf-acme-blog h5,.mf-acme-blog h6{font-family:var(--font-sans);font-size:inherit;font-weight:inherit;line-height:inherit;color:inherit}
.mf-acme-blog button,.mf-acme-blog input,.mf-acme-blog textarea,.mf-acme-blog select{font:inherit}
.mf-acme-blog a{color:inherit;text-decoration:inherit}
.mf-acme-blog .text-xs{font-size:var(--text-xs);line-height:var(--tw-leading,var(--text-xs--line-height))}
.mf-acme-blog .text-sm{font-size:var(--text-sm);line-height:var(--tw-leading,var(--text-sm--line-height))}
.mf-acme-blog .text-base{font-size:var(--text-base);line-height:var(--tw-leading,var(--text-base--line-height))}
.mf-acme-blog .text-lg{font-size:var(--text-lg);line-height:var(--tw-leading,var(--text-lg--line-height))}
.mf-acme-blog .text-xl{font-size:var(--text-xl);line-height:var(--tw-leading,var(--text-xl--line-height))}
.mf-acme-blog .text-2xl{font-size:var(--text-2xl);line-height:var(--tw-leading,var(--text-2xl--line-height))}
.mf-acme-blog .text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}
.mf-acme-blog .text-4xl{font-size:var(--text-4xl);line-height:var(--tw-leading,var(--text-4xl--line-height))}
.mf-acme-blog .text-5xl{font-size:var(--text-5xl);line-height:var(--tw-leading,var(--text-5xl--line-height))}
.mf-acme-blog .text-6xl{font-size:var(--text-6xl);line-height:var(--tw-leading,var(--text-6xl--line-height))}
.mf-acme-blog .font-medium{font-weight:var(--font-weight-medium)!important}
.mf-acme-blog .font-semibold{font-weight:var(--font-weight-semibold)!important}
.mf-acme-blog .font-bold{font-weight:var(--font-weight-bold)!important}
.mf-acme-blog .tracking-tight{letter-spacing:var(--tracking-tight)}
.mf-acme-blog .text-primary{color:var(--primary)!important}
.mf-acme-blog .text-primary-foreground{color:var(--primary-foreground)!important}
.mf-acme-blog .text-secondary-foreground{color:var(--secondary-foreground)!important}
.mf-acme-blog .text-muted-foreground{color:var(--muted-foreground)!important}
.mf-acme-blog .text-foreground{color:var(--foreground)!important}
.mf-acme-blog .bg-primary{background-color:var(--primary)!important}
.mf-acme-blog .bg-primary\\/10{background-color:color-mix(in oklab,var(--primary) 10%,transparent)!important}
.mf-acme-blog .bg-primary\\/20{background-color:color-mix(in oklab,var(--primary) 20%,transparent)!important}
.mf-acme-blog .bg-primary\\/80{background-color:color-mix(in oklab,var(--primary) 80%,transparent)!important}
.mf-acme-blog .bg-secondary{background-color:var(--secondary)!important}
.mf-acme-blog .bg-background{background-color:var(--background)!important}
.mf-acme-blog .bg-muted{background-color:var(--muted)!important}
.mf-acme-blog .bg-muted\\/30{background-color:color-mix(in oklab,var(--muted) 30%,transparent)!important}
.mf-acme-blog .bg-card{background-color:var(--card)!important}
.mf-acme-blog .border{border-color:var(--border)!important}
.mf-acme-blog .mx-auto{margin-left:auto!important;margin-right:auto!important}
.mf-acme-blog .max-w-2xl{max-width:672px!important}
.mf-acme-blog .max-w-4xl{max-width:896px!important}
.mf-acme-blog .max-w-5xl{max-width:1024px!important}
.mf-acme-blog .max-w-7xl{max-width:1280px!important}
.mf-acme-blog .p-1{padding:4px!important}.mf-acme-blog .p-2{padding:8px!important}.mf-acme-blog .p-3{padding:12px!important}.mf-acme-blog .p-4{padding:16px!important}.mf-acme-blog .p-5{padding:20px!important}.mf-acme-blog .p-6{padding:24px!important}
.mf-acme-blog .px-1\\.5{padding-left:6px!important;padding-right:6px!important}.mf-acme-blog .px-2{padding-left:8px!important;padding-right:8px!important}.mf-acme-blog .px-3{padding-left:12px!important;padding-right:12px!important}.mf-acme-blog .px-4{padding-left:16px!important;padding-right:16px!important}.mf-acme-blog .px-5{padding-left:20px!important;padding-right:20px!important}.mf-acme-blog .px-6{padding-left:24px!important;padding-right:24px!important}.mf-acme-blog .px-8{padding-left:32px!important;padding-right:32px!important}
.mf-acme-blog .py-0\\.5{padding-top:2px!important;padding-bottom:2px!important}.mf-acme-blog .py-1{padding-top:4px!important;padding-bottom:4px!important}.mf-acme-blog .py-1\\.5{padding-top:6px!important;padding-bottom:6px!important}.mf-acme-blog .py-2{padding-top:8px!important;padding-bottom:8px!important}.mf-acme-blog .py-4{padding-top:16px!important;padding-bottom:16px!important}.mf-acme-blog .py-8{padding-top:32px!important;padding-bottom:32px!important}.mf-acme-blog .py-12{padding-top:48px!important;padding-bottom:48px!important}.mf-acme-blog .py-16{padding-top:64px!important;padding-bottom:64px!important}.mf-acme-blog .py-24{padding-top:96px!important;padding-bottom:96px!important}
.mf-acme-blog .pl-4{padding-left:16px!important}.mf-acme-blog .pl-6{padding-left:24px!important}.mf-acme-blog .pl-9{padding-left:36px!important}.mf-acme-blog .pr-4{padding-right:16px!important}
.mf-acme-blog .m-0{margin:0!important}.mf-acme-blog .mt-1{margin-top:4px!important}.mf-acme-blog .mt-2{margin-top:8px!important}.mf-acme-blog .mt-3{margin-top:12px!important}.mf-acme-blog .mt-4{margin-top:16px!important}.mf-acme-blog .mt-8{margin-top:32px!important}.mf-acme-blog .mt-12{margin-top:48px!important}.mf-acme-blog .mt-16{margin-top:64px!important}
.mf-acme-blog .mb-1{margin-bottom:4px!important}.mf-acme-blog .mb-2{margin-bottom:8px!important}.mf-acme-blog .mb-3{margin-bottom:12px!important}.mf-acme-blog .mb-4{margin-bottom:16px!important}.mf-acme-blog .mb-6{margin-bottom:24px!important}.mf-acme-blog .mb-8{margin-bottom:32px!important}.mf-acme-blog .mb-10{margin-bottom:40px!important}.mf-acme-blog .mb-12{margin-bottom:48px!important}
.mf-acme-blog .ml-1\\.5{margin-left:6px!important}.mf-acme-blog .ml-2{margin-left:8px!important}.mf-acme-blog .ml-6{margin-left:24px!important}
.mf-acme-blog .gap-1{gap:4px!important}.mf-acme-blog .gap-2{gap:8px!important}.mf-acme-blog .gap-3{gap:12px!important}.mf-acme-blog .gap-4{gap:16px!important}.mf-acme-blog .gap-6{gap:24px!important}.mf-acme-blog .gap-8{gap:32px!important}
.mf-acme-blog .aspect-\\[16\\/9\\]{aspect-ratio:16/9!important}.mf-acme-blog .aspect-\\[4\\/3\\]{aspect-ratio:4/3!important}
.mf-acme-blog .border-b{border-bottom-width:1px!important}.mf-acme-blog .border-t{border-top-width:1px!important}.mf-acme-blog .rounded-2xl{border-radius:16px!important}.mf-acme-blog .rounded-xl{border-radius:12px!important}.mf-acme-blog .rounded-md{border-radius:6px!important}.mf-acme-blog .rounded-full{border-radius:9999px!important}
@media (min-width:64rem){
  .mf-acme-blog .lg\\:px-8{padding-left:32px!important;padding-right:32px!important}
  .mf-acme-blog .lg\\:py-16{padding-top:64px!important;padding-bottom:64px!important}
  .mf-acme-blog .lg\\:py-24{padding-top:96px!important;padding-bottom:96px!important}
  .mf-acme-blog .lg\\:text-3xl{font-size:var(--text-3xl);line-height:var(--tw-leading,var(--text-3xl--line-height))}
  .mf-acme-blog .lg\\:text-4xl{font-size:var(--text-4xl);line-height:var(--tw-leading,var(--text-4xl--line-height))}
  .mf-acme-blog .lg\\:text-5xl{font-size:var(--text-5xl);line-height:var(--tw-leading,var(--text-5xl--line-height))}
  .mf-acme-blog .lg\\:text-6xl{font-size:var(--text-6xl);line-height:var(--tw-leading,var(--text-6xl--line-height))}
}
@media (min-width:40rem){
  .mf-acme-blog .sm\\:px-6{padding-left:24px!important;padding-right:24px!important}
}
@media (min-width:64rem){
  .mf-acme-blog .lg\\:px-8{padding-left:32px!important;padding-right:32px!important}
}`;
    document.head.appendChild(style);
  }

  function applyAcmeBlogStaticEnhancements(scope: HTMLElement): void {
    const firstHomeCard = scope.querySelector('.mf-acme-home-posts .mf-acme-popular-card') as HTMLElement | null;
    if (firstHomeCard) firstHomeCard.classList.add('md:col-span-2');
    const firstHomeGrid = firstHomeCard?.querySelector('.mf-acme-popular-card-grid') as HTMLElement | null;
    if (firstHomeGrid) firstHomeGrid.classList.add('md:grid-cols-2');
    const archive = scope.querySelector('.mf-acme-blog-archive') as HTMLElement | null;
    if (archive) {
      applyAcmeArchiveLayout(archive, (archive.getAttribute('data-view-mode') === 'list') ? 'list' : 'grid');
      applyAcmeArchiveState(archive, archive.getAttribute('data-demo-state') || 'normal');
    }
  }

  function resolveSiblingAssetUrl(fileName: string, replacement: string): string {
    const nodes = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[href]'));
    for (const node of nodes) {
      const raw = (node as HTMLScriptElement).src || (node as HTMLLinkElement).href || '';
      if (!raw || raw.indexOf(fileName) < 0) continue;
      try {
        return new URL(replacement, raw).toString();
      } catch {
        const index = raw.lastIndexOf('/');
        return index >= 0 ? raw.slice(0, index + 1) + replacement.replace(/^\.\.\//, '') : '';
      }
    }
    return '';
  }

  function readPlatformName(): string {
    const raw = typeof window !== 'undefined' ? (window as any).__MF_PLATFORM__ : null;
    return raw && typeof raw === 'object' ? String(raw.platform || '').toLowerCase() : '';
  }

  function applyBlogKitFilters(shell: HTMLElement): void {
    const category = normalizeFilterValue(shell.getAttribute('data-mf-blogkit-filter-category'));
    const status = normalizeFilterValue(shell.getAttribute('data-mf-blogkit-filter-status'));
    let visible = 0;
    shell.querySelectorAll('[data-mf-blogkit-item],[data-mf-acme-item]').forEach((el) => {
      const item = el as HTMLElement;
      const itemCategory = normalizeFilterValue(item.getAttribute('data-mf-blogkit-category') || item.getAttribute('data-mf-acme-category'));
      const itemStatus = normalizeFilterValue(item.getAttribute('data-mf-blogkit-status') || item.getAttribute('data-mf-acme-status'));
      const categoryOk = !category || category === 'all' || itemCategory === category;
      const statusOk = !status || status === 'all' || itemStatus === status;
      const show = categoryOk && statusOk;
      item.hidden = !show;
      if (show) visible += 1;
    });
    const empty = shell.querySelector('.mf-blogkit-filter-empty,.mf-acme-filter-empty') as HTMLElement | null;
    if (empty) empty.hidden = visible !== 0;
  }

  function normalizeFilterValue(value: string | null): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  rerender();
}

export const ListViewRuntime = {
  badge: LISTVIEW_RUNTIME_BADGE,
  init: mount,
};
