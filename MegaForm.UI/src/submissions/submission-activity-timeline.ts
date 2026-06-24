/**
 * Submission Activity Timeline — unified inbox view
 * ===================================================
 * Merges 3 activity streams that were previously shown in separate places into
 * one chronological feed for the submission detail view:
 *   1. Submission lifecycle  (created / read / modified)
 *   2. Workflow transparency (each step start, claim, complete + each event)
 *   3. Workflow case state   (started / completed by user)
 *
 * Pure data transformation — no new C# endpoint, no SQL change.
 * All source data already arrives via /api/MegaForm/Submissions/Get
 * (submission + workflowDetail).
 *
 * Badge: SubmissionActivityTimeline v20260430-10
 */
import { h } from '@shared/dom';
import type {
  SubmissionDetailInfo,
  SubmissionInfo,
  SubmissionWorkflowDetailInfo,
  WorkflowTransparencyEventInfo,
  WorkflowTransparencyStepInfo,
  WorkflowCaseInfo,
} from '@core/types';
import { formatSubmissionDate } from './submission-detail-utils';
import { normalizeWorkflowLabel } from './submission-flow-model';

export const SUBMISSION_ACTIVITY_TIMELINE_BADGE = 'SubmissionActivityTimeline v20260430-10';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_ACTIVITY_TIMELINE_BADGE__ = SUBMISSION_ACTIVITY_TIMELINE_BADGE;
}

type TimelineKind =
  | 'submitted'
  | 'read'
  | 'modified'
  | 'status'
  | 'workflow-start'
  | 'workflow-step-start'
  | 'workflow-step-claim'
  | 'workflow-step-complete'
  | 'workflow-event'
  | 'workflow-complete';

interface TimelineEntry {
  kind: TimelineKind;
  timestamp: string;            // ISO UTC string used for sorting
  title: string;                // primary headline
  actor: string;                // who did it (or "System")
  comment?: string | null;      // optional detail / note
  outcome?: string | null;      // approval / reject / etc
  nodeLabel?: string | null;    // step name for workflow rows
  iconClass: string;            // FontAwesome class
  toneClass: string;            // mf-act-tone-{ok|info|warn|err|muted}
}

export function renderSubmissionActivityTimeline(submission: SubmissionDetailInfo): HTMLElement {
  const root = h('div', { class: 'mf-modal-body mf-act-body' });
  const entries = buildTimeline(submission);

  const head = h('div', { class: 'mf-act-head' },
    h('h4', null, 'Activity Timeline'),
    h('span', { class: 'mf-act-count' }, `${entries.length} ${entries.length === 1 ? 'event' : 'events'}`),
  );
  root.appendChild(head);

  if (!entries.length) {
    root.appendChild(h('div', { class: 'mf-subflow-empty mf-subflow-empty-panel' },
      h('i', { class: 'fas fa-stream' }),
      h('div', null,
        h('strong', null, 'No activity yet'),
        h('p', null, 'Once this submission is read, edited, or moves through the workflow, every event will appear here.'),
      ),
    ));
    return root;
  }

  const list = h('ol', { class: 'mf-act-list' });
  entries.forEach((entry, idx) => list.appendChild(renderEntry(entry, idx === entries.length - 1)));
  root.appendChild(list);
  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build merged + sorted timeline
// ─────────────────────────────────────────────────────────────────────────────
export function buildTimeline(detail: SubmissionDetailInfo): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const sub = detail.submission;
  if (!sub) return out;

  pushSubmissionLifecycle(out, sub);
  pushWorkflowEvents(out, detail.workflowDetail);

  // Sort ascending by timestamp; stable fallback by kind order
  out.sort((a, b) => {
    const ta = parseTime(a.timestamp);
    const tb = parseTime(b.timestamp);
    if (ta !== tb) return ta - tb;
    return kindOrder(a.kind) - kindOrder(b.kind);
  });
  return out;
}

function pushSubmissionLifecycle(out: TimelineEntry[], sub: SubmissionInfo): void {
  if (sub.submittedOnUtc) {
    out.push({
      kind: 'submitted',
      timestamp: sub.submittedOnUtc,
      title: 'Submission received',
      actor: sub.userId ? `User #${sub.userId}` : 'Anonymous',
      comment: sub.summaryText || null,
      iconClass: 'fas fa-paper-plane',
      toneClass: 'mf-act-tone-info',
    });
  }
  if (sub.readOnUtc) {
    out.push({
      kind: 'read',
      timestamp: sub.readOnUtc,
      title: 'First viewed by reviewer',
      actor: 'Reviewer',
      iconClass: 'fas fa-eye',
      toneClass: 'mf-act-tone-muted',
    });
  }
  if (sub.modifiedOnUtc) {
    out.push({
      kind: 'modified',
      timestamp: sub.modifiedOnUtc,
      title: 'Submission data edited',
      actor: sub.modifiedByUserId ? `User #${sub.modifiedByUserId}` : 'System',
      iconClass: 'fas fa-pen-to-square',
      toneClass: 'mf-act-tone-warn',
    });
  }
  // Current status as a "marker" entry, anchored at last-known mutation time
  const statusAnchor = sub.modifiedOnUtc || sub.submittedOnUtc;
  if (sub.status && statusAnchor) {
    out.push({
      kind: 'status',
      timestamp: statusAnchor,
      title: `Status: ${normalizeWorkflowLabel(sub.status)}`,
      actor: 'System',
      iconClass: 'fas fa-tag',
      toneClass: statusTone(sub.status),
    });
  }
}

function pushWorkflowEvents(out: TimelineEntry[], detail: SubmissionWorkflowDetailInfo | null): void {
  if (!detail?.hasWorkflow) return;
  const steps = detail.transparency?.steps || [];
  steps.forEach((step) => pushStepEvents(out, step));
  pushCaseCompletion(out, detail.workflowCase);
}

function pushStepEvents(out: TimelineEntry[], step: WorkflowTransparencyStepInfo): void {
  const stepLabel = step.nodeLabel || step.nodeId || normalizeWorkflowLabel(step.nodeType || 'Step');
  if (step.startedAtUtc) {
    out.push({
      kind: 'workflow-step-start',
      timestamp: step.startedAtUtc,
      title: `Step started: ${stepLabel}`,
      actor: step.assignedTo || 'Workflow',
      nodeLabel: stepLabel,
      iconClass: 'fas fa-play',
      toneClass: 'mf-act-tone-info',
    });
  }
  if (step.claimedAtUtc) {
    out.push({
      kind: 'workflow-step-claim',
      timestamp: step.claimedAtUtc,
      title: `Step claimed: ${stepLabel}`,
      actor: step.assignedTo || 'Reviewer',
      nodeLabel: stepLabel,
      iconClass: 'fas fa-hand-paper',
      toneClass: 'mf-act-tone-info',
    });
  }
  // Per-event (action) rows — finest detail
  (step.events || []).forEach((ev) => out.push(buildEventEntry(ev, stepLabel)));
  if (step.completedAtUtc) {
    out.push({
      kind: 'workflow-step-complete',
      timestamp: step.completedAtUtc,
      title: `Step ${outcomeVerb(step.outcome)}: ${stepLabel}`,
      actor: step.assignedTo || 'System',
      comment: step.comment || step.summary || null,
      outcome: step.outcome || null,
      nodeLabel: stepLabel,
      iconClass: outcomeIcon(step.outcome),
      toneClass: outcomeTone(step.outcome),
    });
  }
}

function buildEventEntry(ev: WorkflowTransparencyEventInfo, stepLabel: string): TimelineEntry {
  const action = ev.displayLabel || normalizeWorkflowLabel(ev.actionType || '') || 'Action';
  return {
    kind: 'workflow-event',
    timestamp: ev.createdAtUtc || '',
    title: `${action} at ${stepLabel}`,
    actor: ev.actorName || 'System',
    comment: ev.comment || null,
    outcome: ev.outcome || null,
    nodeLabel: stepLabel,
    iconClass: outcomeIcon(ev.outcome || ev.actionType),
    toneClass: outcomeTone(ev.outcome || ev.actionType),
  };
}

function pushCaseCompletion(out: TimelineEntry[], wfCase: WorkflowCaseInfo | null | undefined): void {
  if (!wfCase) return;
  if (wfCase.createdAtUtc) {
    out.push({
      kind: 'workflow-start',
      timestamp: wfCase.createdAtUtc,
      title: 'Workflow started',
      actor: wfCase.startedByUserName || (wfCase.startedByUserId ? `User #${wfCase.startedByUserId}` : 'System'),
      iconClass: 'fas fa-flag-checkered',
      toneClass: 'mf-act-tone-info',
    });
  }
  if (wfCase.completedAtUtc) {
    out.push({
      kind: 'workflow-complete',
      timestamp: wfCase.completedAtUtc,
      title: `Workflow ${outcomeVerb(wfCase.outcome)}`,
      actor: 'System',
      comment: wfCase.lastComment || null,
      outcome: wfCase.outcome || null,
      iconClass: 'fas fa-flag',
      toneClass: outcomeTone(wfCase.outcome),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render single entry as a vertical timeline node
// ─────────────────────────────────────────────────────────────────────────────
function renderEntry(entry: TimelineEntry, isLast: boolean): HTMLElement {
  const li = h('li', { class: `mf-act-item ${entry.toneClass}${isLast ? ' is-last' : ''}` });
  li.appendChild(h('span', { class: 'mf-act-icon' }, h('i', { class: entry.iconClass })));
  const body = h('div', { class: 'mf-act-cell' });
  body.appendChild(h('div', { class: 'mf-act-line' },
    h('strong', { class: 'mf-act-title' }, entry.title),
    h('span', { class: 'mf-act-time' }, formatSubmissionDate(entry.timestamp) || '—'),
  ));
  const metaParts: string[] = [entry.actor];
  if (entry.outcome) metaParts.push(`Outcome: ${normalizeWorkflowLabel(entry.outcome)}`);
  body.appendChild(h('div', { class: 'mf-act-meta' }, metaParts.join('  ·  ')));
  if (entry.comment) {
    body.appendChild(h('div', { class: 'mf-act-comment' }, entry.comment));
  }
  li.appendChild(body);
  return li;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function kindOrder(k: TimelineKind): number {
  switch (k) {
    case 'submitted':              return 1;
    case 'workflow-start':         return 2;
    case 'workflow-step-start':    return 3;
    case 'workflow-step-claim':    return 4;
    case 'workflow-event':         return 5;
    case 'workflow-step-complete': return 6;
    case 'workflow-complete':      return 7;
    case 'read':                   return 8;
    case 'modified':               return 9;
    case 'status':                 return 10;
    default:                       return 99;
  }
}

function outcomeVerb(outcome: string | null | undefined): string {
  const v = String(outcome || '').toLowerCase();
  if (v.includes('approve')) return 'approved';
  if (v.includes('reject'))  return 'rejected';
  if (v.includes('return'))  return 'returned';
  if (v.includes('forward')) return 'forwarded';
  if (v.includes('cancel'))  return 'cancelled';
  if (v.includes('complete')) return 'completed';
  return 'completed';
}

function outcomeIcon(outcome: string | number | null | undefined): string {
  const v = String(outcome || '').toLowerCase();
  if (v.includes('approve') || v === '3') return 'fas fa-check-circle';
  if (v.includes('reject')  || v === '4') return 'fas fa-times-circle';
  if (v.includes('return'))               return 'fas fa-undo';
  if (v.includes('forward') || v === '5') return 'fas fa-share';
  if (v.includes('comment') || v === '6') return 'fas fa-comment';
  if (v.includes('claim')   || v === '2') return 'fas fa-hand-paper';
  return 'fas fa-circle-info';
}

function outcomeTone(outcome: string | number | null | undefined): string {
  const v = String(outcome || '').toLowerCase();
  if (v.includes('approve') || v.includes('complete') || v === '3') return 'mf-act-tone-ok';
  if (v.includes('reject')  || v === '4')                            return 'mf-act-tone-err';
  if (v.includes('return') || v.includes('overdue'))                 return 'mf-act-tone-warn';
  return 'mf-act-tone-info';
}

function statusTone(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (s.includes('approve') || s.includes('complete') || s.includes('done')) return 'mf-act-tone-ok';
  if (s.includes('reject') || s.includes('cancel'))                            return 'mf-act-tone-err';
  if (s.includes('hold') || s.includes('return'))                              return 'mf-act-tone-warn';
  return 'mf-act-tone-info';
}
