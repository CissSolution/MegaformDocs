// ============================================================
// My Inbox — Standalone Detail host (SINGLE SOURCE OF TRUTH)
// ------------------------------------------------------------
// Hosts the SAME detail panel the My Inbox board renders (buildDetailPanel)
// outside the 3-pane board, so other surfaces (the Submissions list row →
// detail sheet) REUSE it instead of duplicating the avatar header / FORM
// RESPONSES rich-render / Details·History·Workflow tabs / action bar.
//
// Reuses, does NOT re-implement: buildDetailPanel (view.ts), adaptTask +
// buildEnrichedDetail (the field/history mappers), createWorkflowInboxApi
// (the Approve/Reject/Forward/Comment endpoints). The only new code is the
// thin local state machine + the submission→task glue. Action handling
// refetches from the authoritative response so Forward leaves an audit trail
// in History (same fix as the board).
// ============================================================

import type { SubmissionDetailInfo, WorkflowTaskInfo, WorkflowTaskActionInfo } from '@core/types';
import type {
  WorkflowInboxConfig, WorkflowInboxTask, WorkflowInboxTaskAction, WorkflowInboxTaskDetail,
  DirectoryGroup,
} from '../workflow-inbox/types';
import { createWorkflowInboxApi, type WorkflowInboxApi } from '../workflow-inbox/api';
import { buildDetailPanel, type BoardContext } from './view';
import { adaptTask, type InboxTaskItem, type InboxTab, type ReplyMode, type InboxTaskStatus } from './types';
import { buildEnrichedDetail } from './enrich';
import { T } from './ui';

export interface StandaloneDetailOptions {
  config: WorkflowInboxConfig;       // apiBase / submissionsApiBase / moduleId / tabId
  submissionId: number;
  formId?: number;
  formTitle?: string;
  onChanged?: () => void;            // after an action — refresh the host list
  toast?: (kind: 'success' | 'error' | 'info', msg: string) => void;
}

// ── shape glue: WorkflowTaskInfo/ActionInfo → the inbox task/action shape ──
function toInboxTask(t: WorkflowTaskInfo, submissionId: number, formId: number): WorkflowInboxTask {
  return {
    taskId: t.taskId || '', caseId: t.caseId || '', formId, submissionId,
    nodeId: t.nodeId || '', nodeLabel: t.nodeLabel || '',
    status: typeof t.status === 'number' ? t.status : Number(t.status) || 0,
    candidateRoles: t.candidateRoles || [], candidateUsers: t.candidateUsers || [],
    assignedUserId: t.assignedUserId ?? null, assignedUserName: t.assignedUserName || '',
    assignedDisplayName: t.assignedDisplayName || '',
    allowClaim: !!t.allowClaim, allowForward: !!t.allowForward, allowReassign: !!t.allowReassign,
    commentRequiredOnReject: !!t.commentRequiredOnReject,
    pendingSubmissionStatus: '', approvedSubmissionStatus: '', rejectedSubmissionStatus: '',
    outcome: t.outcome || '', comment: t.comment || '',
    createdAt: t.createdAtUtc || '', claimedAt: t.claimedAtUtc || null,
    dueAt: t.dueAtUtc || null, completedAt: t.completedAtUtc || null,
  };
}
function toInboxAction(a: WorkflowTaskActionInfo): WorkflowInboxTaskAction {
  return {
    actionId: a.actionId || '', taskId: a.taskId || '', caseId: a.caseId || '',
    actionType: typeof a.actionType === 'number' ? a.actionType : Number(a.actionType) || 0,
    actorUserId: a.actorUserId ?? null, actorUserName: a.actorUserName || '',
    actorDisplayName: a.actorDisplayName || '', targetUser: a.targetUser || '',
    outcome: a.outcome || '', comment: a.comment || '', createdAt: a.createdAtUtc || '',
  };
}
// Synthetic placeholder task for a submission that has no workflow — so the
// detail still renders (fields + "Submitted" history) with the action bar
// collapsed (no task to act on).
function synthTask(submissionId: number, formId: number): WorkflowInboxTask {
  return {
    taskId: '', caseId: '', formId, submissionId, nodeId: '', nodeLabel: 'Submission',
    status: 0, candidateRoles: [], candidateUsers: [], assignedUserId: null,
    assignedUserName: '', assignedDisplayName: '', allowClaim: false, allowForward: false,
    allowReassign: false, commentRequiredOnReject: false, pendingSubmissionStatus: '',
    approvedSubmissionStatus: '', rejectedSubmissionStatus: '', outcome: '', comment: '',
    createdAt: '', claimedAt: null, dueAt: null, completedAt: null,
  };
}

// The host surface (e.g. Submissions) may not have declared the My Inbox CSS as a
// page Resource, so the .mf-mi3-* styles would be missing. Self-load it once, with
// the same /Modules/MegaForm/css/ base as an already-present MegaForm stylesheet.
function ensureInboxCss(): void {
  try {
    if (document.querySelector('link[href*="megaform-my-inbox-ts.css"]')) return;
    const ref = (document.querySelector('link[href*="megaform-submissions-ts.css"]')
      || document.querySelector('link[href*="megaform-admin-shell.css"]')) as HTMLLinkElement | null;
    const href = ref
      ? ref.href.replace(/megaform-(submissions-ts|admin-shell)\.css/, 'megaform-my-inbox-ts.css')
      : '/Modules/MegaForm/css/megaform-my-inbox-ts.css';
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    document.head.appendChild(link);
  } catch { /* non-fatal */ }
}

export function mountTaskDetail(container: HTMLElement, opts: StandaloneDetailOptions): void {
  ensureInboxCss();
  const api: WorkflowInboxApi = createWorkflowInboxApi(opts.config);
  const base = opts.config.submissionsApiBase || '/api/MegaForm/';
  const toast = opts.toast || (() => { /* no-op */ });

  // ── local state ──
  let rawTask: WorkflowInboxTask = synthTask(opts.submissionId, opts.formId || 0);
  let actions: WorkflowInboxTaskAction[] = [];
  let detail: SubmissionDetailInfo | null = null;
  let hasTask = false;
  let loading = true;
  let busy = false;
  let activeDetailTab: InboxTab = 'details';
  let replyMode: ReplyMode = 'none';
  let forwardTarget = '';
  let forwardTargetName = '';
  let directory: DirectoryGroup[] | null = null;
  let dirLoading = false;
  let overrideStatus: InboxTaskStatus | null = null; // forced state (no-task → 'done', post-action → forwarded/…)

  function buildItem(): InboxTaskItem {
    const item = adaptTask(rawTask, opts.formTitle || `Form #${rawTask.formId}`, []);
    if (detail) {
      const enr = buildEnrichedDetail(detail, actions, base);
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
    if (!hasTask && !overrideStatus) item.status = 'done'; // collapse the action bar for plain submissions
    if (overrideStatus) { item.status = overrideStatus; item.isRead = true; }
    return item;
  }

  function ctx(): BoardContext {
    const noop = () => { /* board-list callbacks unused in the standalone host */ };
    return {
      data: null, tab: 'incoming', busy, error: '', activeView: 'inbox',
      selectedTask: loading ? null : buildItem(),
      detailLoading: loading,
      hideTaskActions: !hasTask, // plain submission (no workflow) → Export only

      replyMode, searchQuery: '', priorityFilter: 'all', sortBy: 'newest',
      density: 'comfortable', formFilter: '', statusFilter: 'all', openMenu: null,
      isStarred: () => false,
      activeDetailTab,
      onTab: noop, onRefresh: noop, onViewChange: noop,
      onSelectTask: noop, onSearch: noop, onToggleMenu: noop, onSetPriority: noop,
      onSetSort: noop, onSetDensity: noop, onFormFilter: noop, onSetStatus: noop,
      onOpenInSubmissions: noop, onMoreAction: noop,
      directory, dirLoading, forwardTarget, forwardTargetName,
      onForwardSelect: (u, d) => { forwardTarget = u; forwardTargetName = d; render(); },
      onForwardClear: () => { forwardTarget = ''; forwardTargetName = ''; render(); },
      onDetailTab: (t) => { activeDetailTab = t; render(); },
      onQuickAction: noop,
      onReplyMode: (m) => { replyMode = m; if (m === 'forward') { forwardTarget = ''; forwardTargetName = ''; void loadDirectory(); } render(); },
      onSubmitReply: (m, text, target) => void submitReply(m, text, target),
      onExport: () => exportCsv(),
      onOpen: noop, onToggleStar: noop,
    };
  }

  function render(): void {
    container.innerHTML = '';
    // The detail panel's CSS tokens (--fg/--border/--font/…) are scoped to
    // .mf-mi3-shell, so wrap it — otherwise it renders unstyled outside the board.
    const shell = document.createElement('div');
    shell.className = 'mf-mi3-shell mf-mi3-standalone';
    shell.appendChild(buildDetailPanel(ctx()));
    container.appendChild(shell);
  }

  async function loadDirectory(): Promise<void> {
    if (directory || dirLoading) return;
    dirLoading = true; render();
    try { directory = await api.getDirectory(); }
    catch { directory = []; }
    finally { dirLoading = false; render(); }
  }

  async function load(): Promise<void> {
    loading = true; render();
    try {
      detail = await api.getSubmissionDetail(opts.submissionId);
      const wf = detail.workflowDetail;
      const tasks = (wf && Array.isArray(wf.workflowTasks)) ? wf.workflowTasks : [];
      // Prefer the open (not-yet-completed) task, else the latest.
      const active = tasks.find((t) => !t.completedAtUtc) || tasks[tasks.length - 1] || null;
      const fid = opts.formId || (detail.form?.formId ?? 0);
      if (active && active.taskId) {
        hasTask = true;
        // Prefer the clean task payload from getTask (also gives the full action
        // list); fall back to the submission detail's own task/actions on failure.
        const td = await api.getTask(active.taskId).catch(() => null);
        if (td && td.task && td.task.taskId) { rawTask = td.task; actions = td.actions || []; }
        else {
          rawTask = toInboxTask(active, opts.submissionId, fid);
          actions = (wf && Array.isArray(wf.workflowActions) ? wf.workflowActions : []).map(toInboxAction);
        }
      } else {
        hasTask = false;
        rawTask = synthTask(opts.submissionId, fid);
        actions = (wf && Array.isArray(wf.workflowActions) ? wf.workflowActions : []).map(toInboxAction);
      }
    } catch (e) {
      detail = null;
      toast('error', T('inbox.toast_action_failed', 'Could not load the submission.'));
    } finally {
      loading = false; render();
    }
  }

  // Rebuild History/fields from a task-action RESPONSE (authoritative action list)
  // so Forward/Approve/Reject leave an audit trail in History immediately — same
  // mechanism as the board (no follow-up getTask that could 403 post-forward).
  async function refreshFromResponse(resp: WorkflowInboxTaskDetail | null): Promise<void> {
    try {
      detail = await api.getSubmissionDetail(opts.submissionId);
      if (resp && resp.actions && resp.actions.length) actions = resp.actions;
    } catch { /* keep prior */ }
    render();
  }

  async function submitReply(mode: ReplyMode, text: string, target: string): Promise<void> {
    if (mode === 'none' || !rawTask.taskId) return;
    if ((mode === 'reject' || mode === 'return' || mode === 'comment') && !text) {
      toast('error', T('inbox.note_required', 'Please enter a note first.')); return;
    }
    if (mode === 'forward' && !target) {
      toast('error', T('inbox.recipient_required', 'Enter a recipient to forward to.')); return;
    }
    busy = true; replyMode = 'none'; forwardTarget = ''; forwardTargetName = ''; render();
    try {
      let resp: WorkflowInboxTaskDetail | null = null;
      if (mode === 'approve') { resp = await api.approve(rawTask.taskId, text, {}); toast('success', T('inbox.toast_approved', 'Task approved.')); overrideStatus = 'approved'; }
      else if (mode === 'reject') { resp = await api.reject(rawTask.taskId, text, {}); toast('success', T('inbox.toast_rejected', 'Task rejected.')); overrideStatus = 'rejected'; }
      else if (mode === 'forward') { resp = await api.forward(rawTask.taskId, target, text, {}); toast('success', T('inbox.toast_forwarded', 'Task forwarded.')); overrideStatus = 'forwarded'; }
      else { const note = mode === 'return' ? `🔄 Returned for revision: ${text}` : text; resp = await api.comment(rawTask.taskId, note); toast('success', mode === 'return' ? T('inbox.toast_returned', 'Return note sent.') : T('inbox.toast_commented', 'Comment added.')); }
      if (resp && resp.task && resp.task.taskId) rawTask = resp.task;
      busy = false;
      await refreshFromResponse(resp);
      if (opts.onChanged) opts.onChanged();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : T('inbox.toast_action_failed', 'Action failed.'));
    } finally { busy = false; render(); }
  }

  function exportCsv(): void {
    const item = buildItem();
    const rows = [['Field', 'Value'], ...item.fields.map((f) => [f.label, f.value])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    try {
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `submission-${opts.submissionId}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('success', T('inbox.toast_exported', 'Exported CSV.'));
    } catch { toast('error', T('inbox.toast_export_failed', 'Could not export.')); }
  }

  render();
  void load();
}
