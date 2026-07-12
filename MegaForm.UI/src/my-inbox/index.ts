// ============================================================
// MegaForm — My Inbox (3-pane design: left nav | task list | detail panel)
// A project-manager-style inbox built on the submission grid.
// Reuses the shared workflow-inbox API client + the C# GET /Workflow/MyInbox.
// ============================================================
import { readContext } from '@core/index';
import { createWorkflowInboxApi, type WorkflowInboxApi } from '../workflow-inbox/api';
import type { MyInboxResult, WorkflowInboxTask, WorkflowInboxTaskDetail, DirectoryGroup } from '../workflow-inbox/types';
import { renderBoard, type BoardContext } from './view';
import { openTaskDrawer } from './drawer';
import { ic, T } from './ui';
import { loadLocale, detectLocale, setDir, resolveI18nBase } from '@i18n';
import type { InboxView, InboxTab, ReplyMode, InboxSort, InboxDensity, InboxTaskStatus } from './types';
import { adaptTask } from './types';
import { buildEnrichedDetail, type EnrichedDetail } from './enrich';

const BADGE = 'MyInbox3Pane v20260614-B160';

interface Runtime {
  api: WorkflowInboxApi;
  forms: () => MyInboxResult['forms'];
}

export function initMyInbox(root: HTMLElement): void {
  if (root.dataset.mfMounted === '1') return;
  root.dataset.mfMounted = '1';

  const config = readConfig(root);
  const api = createWorkflowInboxApi(config);

  let data: MyInboxResult | null = null;
  let tab: 'incoming' | 'inProgress' | 'completed' = 'incoming';
  let busy = false;
  let error = '';
  let activeView: InboxView = 'inbox';
  let selectedTaskId = '';
  // [Forward audit 2026-06-14] After approve/reject/forward the task leaves my
  // queue, so a board reload drops it from the lists → the open detail would go
  // blank and the user never sees the action land in History. Keep the last raw
  // task here so render() can still show its (refetched) detail + audit trail.
  let detachedTask: WorkflowInboxTask | null = null;
  let detachedStatus: InboxTaskStatus | null = null; // resolved state to paint on the detached card
  let searchQuery = '';
  let activeDetailTab: InboxTab = 'details';
  let replyMode: ReplyMode = 'none';
  let priorityFilter = 'all';
  let sortBy: InboxSort = 'newest';
  // [Inbox redesign 2026-06-12] density (comfortable default), by-form filter, status filter.
  let density: InboxDensity = (() => { try { return (localStorage.getItem('mf-inbox-density') as InboxDensity) || 'comfortable'; } catch { return 'comfortable'; } })();
  let formFilter = '';      // empty = no form filter; holds a form TITLE
  let statusFilter = 'all'; // 'all' or an InboxTaskStatus value
  let openMenu: 'filter' | 'sort' | 'more' | 'density' | 'status' | null = null;
  const starredIds = new Set<string>();
  // [Forward org-tree] org directory (lazy) + selected forward recipient.
  let directory: DirectoryGroup[] | null = null;
  let dirLoading = false;
  let forwardTarget = '';      // selected username
  let forwardTargetName = '';  // selected display name
  // [Phase 1] Lazy detail enrichment: on task-select we fetch the submission
  // detail (fields/attachments/returnCount) + task actions (history) once, cache
  // by submissionId, and merge into the selected presentation item.
  const detailCache = new Map<number, EnrichedDetail>();
  let enrichingSid: number | null = null;

  if (typeof window !== 'undefined') (window as any).__MF_MYINBOX_BADGE__ = BADGE;

  const rt: Runtime = { api, forms: () => data?.forms || {} };

  function render(): void {
    const allTasks = [...(data?.incoming || []), ...(data?.inProgress || []), ...(data?.completed || [])];
    const selectedTask = allTasks.find((t) => t.taskId === selectedTaskId)
      || (detachedTask && detachedTask.taskId === selectedTaskId ? detachedTask : null);

    // Build the presentation item from the shared adapter, then overlay the
    // session star state + any cached enrichment (fields/attachments/history).
    let selectedItem = null as ReturnType<typeof adaptTask> | null;
    if (selectedTask) {
      const formTitle = rt.forms()[String(selectedTask.formId)]?.title || `Form #${selectedTask.formId}`;
      const item = adaptTask(selectedTask, formTitle, []);
      item.isStarred = starredIds.has(selectedTask.taskId);
      // Paint the resolved state on a detached (just-actioned) card so the action
      // bar collapses and the badge reads forwarded/approved/rejected.
      if (selectedTask === detachedTask && detachedStatus) { item.status = detachedStatus; item.isRead = true; }
      const enr = detailCache.get(selectedTask.submissionId);
      if (enr) {
        item.fields = enr.fields;
        item.attachments = enr.attachments;
        item.history = enr.history;
        item.hasAttachment = enr.hasAttachment;
        item.returnCount = enr.returnCount;
        if (enr.submitter) item.submitter = enr.submitter;
        if (enr.submitterEmail) item.submitterEmail = enr.submitterEmail;
        if (enr.submitterPhone) item.submitterPhone = enr.submitterPhone;
        if (enr.submitterDept) item.submitterDept = enr.submitterDept;
        if (enr.tags && enr.tags.length) item.tags = enr.tags;
      }
      selectedItem = item;
    }
    const detailLoading = !!selectedTask
      && enrichingSid === selectedTask.submissionId
      && !detailCache.has(selectedTask.submissionId);

    renderBoard(root, {
      data, tab, busy, error,
      activeView,
      selectedTask: selectedItem,
      detailLoading,
      replyMode,
      searchQuery,
      priorityFilter,
      sortBy,
      density,
      formFilter,
      statusFilter,
      openMenu,
      enrichLookup: (sid: number) => detailCache.get(sid),
      isStarred: (taskId) => starredIds.has(taskId),
      activeDetailTab,
      onTab: (t) => { tab = t; render(); },
      onRefresh: () => void load(),
      onViewChange: (v) => { activeView = v; selectedTaskId = ''; detachedTask = null; detachedStatus = null; replyMode = 'none'; openMenu = null; render(); },
      onSelectTask: (t) => { selectedTaskId = t ? t.id : ''; detachedTask = null; detachedStatus = null; replyMode = 'none'; activeDetailTab = 'details'; openMenu = null; if (t) void loadDetail(t); render(); },
      onSearch: (q) => { searchQuery = q; render(); },
      onToggleMenu: (m) => { openMenu = openMenu === m ? null : m; render(); },
      onSetPriority: (p) => { priorityFilter = p; openMenu = null; render(); },
      onSetSort: (s) => { sortBy = s; openMenu = null; render(); },
      onSetDensity: (d) => { density = d; openMenu = null; try { localStorage.setItem('mf-inbox-density', d); } catch { /* */ } render(); },
      onFormFilter: (f) => { formFilter = formFilter === f ? '' : f; selectedTaskId = ''; render(); },
      onSetStatus: (s) => { statusFilter = s; openMenu = null; render(); },
      onDetailTab: (t) => { activeDetailTab = t; render(); },
      onQuickAction: (kind, task) => void quickAction(kind, task),
      directory,
      dirLoading,
      forwardTarget,
      forwardTargetName,
      onForwardSelect: (userName, displayName) => { forwardTarget = userName; forwardTargetName = displayName; render(); },
      onForwardClear: () => { forwardTarget = ''; forwardTargetName = ''; render(); },
      onReplyMode: (m) => {
        replyMode = m;
        if (m === 'forward') { forwardTarget = ''; forwardTargetName = ''; void loadDirectory(); }
        render();
      },
      onSubmitReply: (m, text, target) => void submitReply(m, text, target),
      onExport: () => exportCsv(),
      onOpenInSubmissions: (t) => { openMenu = null; openInSubmissions(t); },
      onMoreAction: (action, t) => { openMenu = null; moreAction(action, t); },
      onOpen: (task, focus) => openDrawer(task, focus || null),
      onToggleStar: (taskId) => {
        if (starredIds.has(taskId)) starredIds.delete(taskId);
        else starredIds.add(taskId);
        render();
      },
    });
  }

  async function load(): Promise<void> {
    busy = true; error = ''; render();
    try {
      data = await api.getMyInbox(25);
      // [Submitter fix 2026-07-12] Stamp the server-resolved submitter onto each
      // task so adaptTask stops guessing from candidateUsers (the approvers).
      const submitters = data?.submitters || {};
      for (const t of [...(data?.incoming || []), ...(data?.inProgress || []), ...(data?.completed || [])]) {
        const s = submitters[String(t.submissionId)];
        if (s) {
          t.submittedByUserName = s.userName || '';
          t.submittedByDisplayName = s.displayName || s.userName || '';
        }
      }
      // If the active tab is empty but another has items, surface the busiest one.
      if (!tasksFor(tab).length) {
        const order: Array<'incoming' | 'inProgress' | 'completed'> = ['inProgress', 'incoming', 'completed'];
        const best = order.find((t) => tasksFor(t).length);
        if (best) tab = best;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e || 'Failed to load inbox.');
    } finally {
      busy = false;
      render();
    }
  }

  // [Phase 1] Fetch + cache the rich detail for a task's submission on select.
  // One submission-detail call (fields/attachments/returnCount) + one task-detail
  // call (history actions), in parallel. Cached by submissionId so re-selecting
  // is instant. On error we leave it uncached (the empty sections just don't show).
  async function loadDetail(item: { source: WorkflowInboxTask }): Promise<void> {
    const task = item.source;
    const sid = task.submissionId;
    if (!sid || sid <= 0 || detailCache.has(sid) || enrichingSid === sid) return;
    enrichingSid = sid;
    render();
    try {
      const [detail, taskDetail] = await Promise.all([
        api.getSubmissionDetail(sid),
        api.getTask(task.taskId).catch(() => null),
      ]);
      const actions = taskDetail?.actions || [];
      const downloadBase = config.submissionsApiBase || '/api/MegaForm/';
      detailCache.set(sid, buildEnrichedDetail(detail, actions, downloadBase));
    } catch (e) {
      // Non-fatal — keep the panel usable with the base (un-enriched) item.
      // eslint-disable-next-line no-console
      console.warn('MyInbox: detail enrichment failed', e);
    } finally {
      if (enrichingSid === sid) enrichingSid = null;
      render();
    }
  }

  // [Forward audit 2026-06-14] Rebuild the cached detail (fields + History +
  // workflow) from a task-action RESPONSE. The response's action list is
  // authoritative (it contains the action just written), so we don't depend on a
  // follow-up getTask that may 403 once a forward reassigns the task. Fields/status
  // come from a fresh submission-detail read.
  async function refreshDetailFromResponse(sid: number, resp: WorkflowInboxTaskDetail | null): Promise<void> {
    if (!sid || sid <= 0) return;
    try {
      const detail = await api.getSubmissionDetail(sid);
      const base = config.submissionsApiBase || '/api/MegaForm/';
      detailCache.set(sid, buildEnrichedDetail(detail, resp?.actions || [], base));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('MyInbox: detail refresh after action failed', e);
      detailCache.delete(sid);
    }
    render();
  }

  // [Forward org-tree] Load the org directory once (lazy, on first Forward).
  async function loadDirectory(): Promise<void> {
    if (directory || dirLoading) return;
    dirLoading = true; render();
    try {
      directory = await api.getDirectory();
    } catch (e) {
      directory = [];
      // eslint-disable-next-line no-console
      console.warn('MyInbox: directory load failed', e);
    } finally {
      dirLoading = false; render();
    }
  }

  function selectedRaw(): WorkflowInboxTask | null {
    const all = [...(data?.incoming || []), ...(data?.inProgress || []), ...(data?.completed || [])];
    return all.find((t) => t.taskId === selectedTaskId) || null;
  }

  // [Phase 2] Submit an inline reply action. Approve/Reject/Forward hit the real
  // workflow endpoints (task leaves the inbox → reload board). Comment & Return
  // record a non-destructive audit comment (task stays open → refetch its history).
  async function submitReply(mode: ReplyMode, text: string, target: string): Promise<void> {
    const sel = selectedRaw();
    if (!sel || mode === 'none') return;
    if ((mode === 'reject' || mode === 'return' || mode === 'comment') && !text) {
      toast('error', T('inbox.note_required', 'Please enter a note first.'));
      return;
    }
    if (mode === 'forward' && !target) {
      toast('error', T('inbox.recipient_required', 'Enter a recipient to forward to.'));
      return;
    }
    busy = true; replyMode = 'none'; forwardTarget = ''; forwardTargetName = ''; render();
    try {
      if (mode === 'approve' || mode === 'reject' || mode === 'forward') {
        let resp: WorkflowInboxTaskDetail;
        if (mode === 'approve') { resp = await api.approve(sel.taskId, text, {}); toast('success', T('inbox.toast_approved', 'Task approved.')); detachedStatus = 'approved'; }
        else if (mode === 'reject') { resp = await api.reject(sel.taskId, text, {}); toast('success', T('inbox.toast_rejected', 'Task rejected.')); detachedStatus = 'rejected'; }
        else { resp = await api.forward(sel.taskId, target, text, {}); toast('success', T('inbox.toast_forwarded', 'Task forwarded.')); detachedStatus = 'forwarded'; }
        // [Forward audit 2026-06-14] Keep the just-actioned task on screen + refresh
        // its detail FROM THE ACTION RESPONSE (which carries the just-written audit
        // action) so the new action lands in History and the Workflow tab reflects
        // the reassignment IMMEDIATELY — then refresh the board in the background.
        // Previously we only reloaded the board, the task left my queue, and the
        // audit trail was never shown ("History/Workflow chưa cập nhật").
        detachedTask = (resp && resp.task && resp.task.taskId) ? resp.task : sel; // updated task → workflow tab reflects new assignment
        busy = false;
        await refreshDetailFromResponse(sel.submissionId, resp);
        void load();
      } else if (mode === 'comment' || mode === 'return') {
        const note = mode === 'return' ? `🔄 Returned for revision: ${text}` : text;
        const resp = await api.comment(sel.taskId, note);
        toast('success', mode === 'return'
          ? T('inbox.toast_returned', 'Return note sent.')
          : T('inbox.toast_commented', 'Comment added.'));
        busy = false;
        await refreshDetailFromResponse(sel.submissionId, resp); // history changed → repaint from response
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : T('inbox.toast_action_failed', 'Action failed.'));
    } finally {
      busy = false;
      render();
    }
  }

  // [Phase 2] Client-side CSV export of the selected submission's form responses.
  function exportCsv(): void {
    const sel = selectedRaw();
    if (!sel) return;
    const enr = detailCache.get(sel.submissionId);
    const fields = enr?.fields || [];
    const rows = [['Field', 'Value'], ...fields.map((f) => [f.label, f.value])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    try {
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `submission-${sel.submissionId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('success', T('inbox.toast_exported', 'Exported CSV.'));
    } catch {
      toast('error', T('inbox.toast_export_failed', 'Could not export.'));
    }
  }

  // [§4-1/§4-5] Open the submission on the Submissions surface (new tab).
  function openInSubmissions(item: { source: WorkflowInboxTask }): void {
    const t = item.source;
    try {
      const url = `?mfpanel=submissions&formId=${t.formId}&submissionId=${t.submissionId}`;
      window.open(url, '_blank', 'noopener');
    } catch { toast('error', T('inbox.open_failed', 'Could not open Submissions.')); }
  }

  // [§4-2] Header more-menu actions. PDF reuses the CSV export; the rest are
  // surfaced as clear "not yet available" notices (no backend hook yet).
  function moreAction(action: 'snooze' | 'tag' | 'pdf' | 'archive' | 'delete', _item: { source: WorkflowInboxTask }): void {
    if (action === 'pdf') { exportCsv(); return; }
    const labels: Record<string, string> = {
      snooze: T('inbox.snooze', 'Snooze'),
      tag: T('inbox.add_tag', 'Add tag'),
      archive: T('inbox.archive', 'Archive'),
      delete: T('inbox.delete', 'Delete'),
    };
    toast('info', `${labels[action] || action} — ${T('inbox.coming_soon', 'coming soon')}`);
  }

  function tasksFor(t: 'incoming' | 'inProgress' | 'completed'): WorkflowInboxTask[] {
    if (!data) return [];
    if (t === 'incoming') return data.incoming || [];
    if (t === 'inProgress') return data.inProgress || [];
    return data.completed || [];
  }

  async function quickAction(kind: 'approve' | 'claim', task: WorkflowInboxTask): Promise<void> {
    busy = true; render();
    try {
      if (kind === 'claim') {
        await api.claim(task.taskId, '');
        toast('success', T('inbox.toast_claimed', 'Task claimed — moved to In Progress.'));
      } else {
        await api.approve(task.taskId, '', {});
        toast('success', T('inbox.toast_approved', 'Task approved.'));
      }
      await load();
    } catch (e) {
      busy = false;
      toast('error', e instanceof Error ? e.message : T('inbox.toast_action_failed', 'Action failed.'));
      render();
    }
  }

  function openDrawer(task: WorkflowInboxTask, focus: 'forward' | 'reject' | null): void {
    openTaskDrawer({
      api,
      task,
      focus,
      formTitle: rt.forms()[String(task.formId)]?.title || `Form #${task.formId}`,
      onToast: toast,
      onDone: () => void load(),
    });
  }

  // Close the filter/sort dropdown when clicking outside of it.
  document.addEventListener('click', (e) => {
    if (!openMenu) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.mf-mi3-dd')) return;
    openMenu = null;
    render();
  });

  // [i18n] Load the page-locale catalog before first paint
  void (async () => {
    try {
      const loc = detectLocale();
      setDir(loc);
      if (loc && loc !== 'en-US') {
        await loadLocale(loc, resolveI18nBase());
      }
    } catch { /* English fallback */ }
    await load();
  })();
}

function toast(kind: 'success' | 'error', message: string): void {
  let host = document.getElementById('mf-mi-toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mf-mi-toast-host';
    host.className = 'mf-mi-toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = `mf-mi-toast mf-mi-toast-${kind}`;
  t.innerHTML = `${ic(kind === 'success' ? 'check' : 'alert', 15)} <span></span>`;
  (t.querySelector('span') as HTMLElement).textContent = message;
  host.appendChild(t);
  setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 250); }, 3200);
}

function readConfig(root: HTMLElement): import('../workflow-inbox/types').WorkflowInboxConfig {
  const ctx = readContext(root);
  const apiBase = String(ctx.apiBase || '/api/MegaForm/').replace(/\/+$/, '');
  const workflowBase = root.dataset.workflowBase || (apiBase + '/Workflow/');
  return {
    moduleId: (ctx as any).instanceId || parseInt(root.dataset.moduleId || '0', 10) || 0,
    tabId: parseInt(root.dataset.tabId || '0', 10) || 0,
    apiBase: workflowBase,
    submissionsApiBase: root.dataset.submissionsApiBase || (apiBase + '/'),
    formId: 0,
    initialTaskId: '',
  };
}

// ── Derive helpers (mirrored from types.ts to avoid circular import) ─────────
function derivePriority(dueAt?: string | null): 'urgent' | 'high' | 'normal' | 'low' {
  if (!dueAt) return 'normal';
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff < 0) return 'urgent';
  if (diff < 86400000 * 2) return 'high';
  if (diff < 86400000 * 7) return 'normal';
  return 'low';
}

function deriveStatus(task: WorkflowInboxTask): import('./types').InboxTaskStatus {
  const now = Date.now();
  const due = task.dueAt ? new Date(task.dueAt).getTime() : 0;
  if (task.status === 3) return task.outcome?.toLowerCase().includes('reject') ? 'rejected' : 'approved';
  if (due && due < now) return 'overdue';
  if (task.outcome?.toLowerCase().includes('forward')) return 'forwarded';
  return 'pending';
}

function deriveTags(formTitle: string, step: string): string[] {
  const tags: string[] = [];
  const ft = (formTitle || '').toLowerCase();
  if (ft.includes('leave')) tags.push('leave');
  if (ft.includes('purchase') || ft.includes('expense')) tags.push('finance');
  if (ft.includes('contract')) tags.push('legal');
  if (ft.includes('it') || ft.includes('support')) tags.push('it');
  if (ft.includes('onboard')) tags.push('hr');
  return tags;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

// ── Self-mount ───────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  (window as any).MegaForm = (window as any).MegaForm || {};
  (window as any).MegaForm.initMyInbox = initMyInbox;

  const autoMount = (): void => {
    document.querySelectorAll<HTMLElement>('#mf-myinbox-root').forEach((root) => {
      if (root.dataset.mfMounted) return;
      try { initMyInbox(root); } catch (e) { console.error('initMyInbox failed', e); }
    });
  };
  const start = (): void => {
    autoMount();
    try {
      const obs = new MutationObserver(() => autoMount());
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 15000);
    } catch { /* observer optional */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}

export {};
