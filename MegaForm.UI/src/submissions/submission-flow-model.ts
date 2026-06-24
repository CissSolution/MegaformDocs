import type {
  SubmissionDetailInfo,
  SubmissionWorkflowDetailInfo,
  WorkflowNodeInfo,
  WorkflowTaskInfo,
  WorkflowTransparencyEventInfo,
  WorkflowTransparencyInfo,
  WorkflowTransparencyStepInfo,
} from '@core/types';
import { formatSubmissionDate, getSubmissionValues } from './submission-detail-utils';

export type SubmissionFlowNodeState =
  | 'pending'
  | 'current'
  | 'completed'
  | 'rejected'
  | 'returned'
  | 'overdue';

export interface SubmissionFlowNodeContext {
  node: WorkflowNodeInfo;
  step: WorkflowTransparencyStepInfo | null;
  tasks: WorkflowTaskInfo[];
  primaryTask: WorkflowTaskInfo | null;
  state: SubmissionFlowNodeState;
  statusLabel: string;
}

export interface SubmissionFlowHistoryRow {
  index: number;
  step: WorkflowTransparencyStepInfo;
  actionLabel: string;
  actorLabel: string;
  timestampLabel: string;
  durationLabel: string;
  note: string;
  statusLabel: string;
  statusTone: SubmissionFlowNodeState;
}

export function getInitialSelectedNodeId(detail: SubmissionWorkflowDetailInfo | null | undefined): string {
  if (!detail?.hasWorkflow || !detail.workflow?.nodes?.length) return '';
  return detail.transparency?.activeNodeId
    || detail.workflowCase?.currentNodeId
    || detail.workflowTasks.find((task) => isWorkflowTaskOpen(task))?.nodeId
    || detail.workflow.nodes[0]?.id
    || '';
}

export function getNodeContext(
  detail: SubmissionWorkflowDetailInfo,
  nodeId: string,
): SubmissionFlowNodeContext | null {
  const node = detail.workflow?.nodes?.find((entry) => entry.id === nodeId);
  if (!node) return null;
  const step = getLatestNodeStep(detail.transparency, nodeId);
  const tasks = getNodeTasks(detail, nodeId);
  const primaryTask = tasks.find((task) => isWorkflowTaskOpen(task)) || tasks[tasks.length - 1] || null;
  const state = getNodeState(detail.transparency, step, nodeId);
  return {
    node,
    step,
    tasks,
    primaryTask,
    state,
    statusLabel: getNodeStatusLabel(detail.transparency, step, state),
  };
}

export function getLatestNodeStep(
  transparency: WorkflowTransparencyInfo | null | undefined,
  nodeId: string,
): WorkflowTransparencyStepInfo | null {
  const steps = (transparency?.steps || []).filter((step) => step.nodeId === nodeId);
  return steps.length ? steps[steps.length - 1] : null;
}

export function getNodeTasks(
  detail: SubmissionWorkflowDetailInfo | null | undefined,
  nodeId: string,
): WorkflowTaskInfo[] {
  return (detail?.workflowTasks || []).filter((task) => task.nodeId === nodeId);
}

export function getNodeState(
  transparency: WorkflowTransparencyInfo | null | undefined,
  step: WorkflowTransparencyStepInfo | null | undefined,
  nodeId: string,
): SubmissionFlowNodeState {
  if (transparency?.activeNodeId === nodeId || step?.isCurrent) {
    return step?.isOverdue ? 'overdue' : 'current';
  }

  const status = String(step?.status || '').toLowerCase();
  const outcome = String(step?.outcome || '').toLowerCase();

  if (outcome.includes('reject') || status.includes('reject')) return 'rejected';
  if (outcome.includes('return') || status.includes('return')) return 'returned';
  if (step?.isOverdue) return 'overdue';
  if (step?.completedAtUtc || status.includes('complete') || outcome.includes('approve')) return 'completed';
  return 'pending';
}

export function getNodeStatusLabel(
  transparency: WorkflowTransparencyInfo | null | undefined,
  step: WorkflowTransparencyStepInfo | null | undefined,
  state: SubmissionFlowNodeState,
): string {
  if ((step?.nodeId || '') === (transparency?.activeNodeId || '')) return 'Current';
  if (step?.outcome) return normalizeWorkflowLabel(step.outcome);
  if (step?.status) return normalizeWorkflowLabel(step.status);
  switch (state) {
    case 'completed': return 'Completed';
    case 'rejected': return 'Rejected';
    case 'returned': return 'Returned';
    case 'overdue': return 'Over SLA';
    default: return 'Pending';
  }
}

export function normalizeWorkflowLabel(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function formatSubmissionCode(detail: SubmissionDetailInfo): string {
  const id = Math.max(1, Number(detail.submission.submissionId || 0));
  const submittedAt = detail.submission.submittedOnUtc ? new Date(detail.submission.submittedOnUtc) : null;
  const year = submittedAt && Number.isFinite(submittedAt.getTime()) ? submittedAt.getFullYear() : new Date().getFullYear();
  return `SUB-${year}-${String(id).padStart(4, '0')}`;
}

export function resolveSubmissionActor(detail: SubmissionDetailInfo): string {
  const values = getSubmissionValues(detail);
  const names = [
    joinParts(values.firstName, values.lastName),
    joinParts(values.first_name, values.last_name),
    joinParts(values.givenName, values.familyName),
    stringValue(values.fullName),
    stringValue(values.full_name),
    stringValue(values.name),
    stringValue(values.employeeName),
  ].filter(Boolean);
  if (names.length > 0) return names[0];
  const email = [
    stringValue(values.email),
    stringValue(values.work_email),
    stringValue(values.personal_email),
  ].filter(Boolean)[0];
  if (email) return email;
  return detail.submission.userId ? `User #${detail.submission.userId}` : 'Anonymous';
}

export function getCompletedStepCount(detail: SubmissionWorkflowDetailInfo | null | undefined): number {
  return (detail?.transparency?.steps || []).filter((step) => {
    const state = getNodeState(detail?.transparency, step, step.nodeId || '');
    return state === 'completed' || state === 'returned' || state === 'rejected';
  }).length;
}

export function getOpenTaskCount(detail: SubmissionWorkflowDetailInfo | null | undefined): number {
  return (detail?.workflowTasks || []).filter((task) => isWorkflowTaskOpen(task)).length;
}

export function getReturnSteps(detail: SubmissionWorkflowDetailInfo | null | undefined): WorkflowTransparencyStepInfo[] {
  return (detail?.transparency?.steps || []).filter((step) => {
    const state = getNodeState(detail?.transparency, step, step.nodeId || '');
    return state === 'returned' || state === 'rejected';
  });
}

export function getTotalDurationLabel(detail: SubmissionWorkflowDetailInfo | null | undefined, fallbackStart?: string | null): string {
  const steps = detail?.transparency?.steps || [];
  const starts = steps
    .map((step) => toDate(step.startedAtUtc))
    .filter((value): value is Date => !!value);
  const ends = steps
    .map((step) => toDate(step.completedAtUtc || step.claimedAtUtc || step.startedAtUtc))
    .filter((value): value is Date => !!value);
  const start = starts[0] || toDate(fallbackStart);
  if (!start) return '0m';
  const end = ends.length > 0 ? ends[ends.length - 1] : new Date();
  return formatDurationBetween(start, end);
}

export function buildHistoryRows(detail: SubmissionWorkflowDetailInfo | null | undefined): SubmissionFlowHistoryRow[] {
  const steps = detail?.transparency?.steps || [];
  return steps.map((step, index) => {
    const latestEvent = (step.events || []).length ? step.events[step.events.length - 1] : null;
    const tone = getNodeState(detail?.transparency, step, step.nodeId || '');
    return {
      index: index + 1,
      step,
      actionLabel: resolveActionLabel(step, latestEvent),
      actorLabel: resolveActorLabel(step, latestEvent),
      timestampLabel: formatSubmissionDate(resolveTimestamp(step, latestEvent)) || '—',
      durationLabel: resolveDurationLabel(step),
      note: resolveNote(step, latestEvent),
      statusLabel: getNodeStatusLabel(detail?.transparency, step, tone),
      statusTone: tone,
    };
  });
}

export function formatTaskStatusLabel(status: string | number | null | undefined): string {
  const numeric = Number(status);
  if (Number.isFinite(numeric)) {
    switch (numeric) {
      case 1: return 'Pending';
      case 2: return 'Claimed';
      case 3: return 'Completed';
      case 4: return 'Cancelled';
      default: return 'Unknown';
    }
  }
  const raw = String(status || '').trim();
  return raw ? normalizeWorkflowLabel(raw) : 'Pending';
}

export function isWorkflowTaskOpen(task: WorkflowTaskInfo | null | undefined): boolean {
  const numeric = Number(task?.status);
  if (Number.isFinite(numeric)) return numeric === 1 || numeric === 2;
  const status = String(task?.status || '').toLowerCase();
  return status.includes('pending') || status.includes('claim') || status === '1' || status === '2';
}

export function formatDurationBetween(start: Date, end: Date): string {
  const delta = Math.max(0, end.getTime() - start.getTime());
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return `${Math.max(0, Math.floor(delta / 1000))}s`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function resolveActionLabel(step: WorkflowTransparencyStepInfo, latestEvent: WorkflowTransparencyEventInfo | null): string {
  if (latestEvent?.displayLabel) return latestEvent.displayLabel;
  if (latestEvent?.actionType) return normalizeEventAction(latestEvent.actionType);
  if (step.outcome) return normalizeWorkflowLabel(step.outcome);
  if (step.status) return normalizeWorkflowLabel(step.status);
  return normalizeWorkflowLabel(step.nodeType || 'Step');
}

function resolveActorLabel(step: WorkflowTransparencyStepInfo, latestEvent: WorkflowTransparencyEventInfo | null): string {
  return latestEvent?.actorName || step.assignedTo || 'System';
}

function resolveTimestamp(step: WorkflowTransparencyStepInfo, latestEvent: WorkflowTransparencyEventInfo | null): string {
  return step.completedAtUtc
    || latestEvent?.createdAtUtc
    || step.claimedAtUtc
    || step.startedAtUtc
    || '';
}

function resolveDurationLabel(step: WorkflowTransparencyStepInfo): string {
  const start = toDate(step.startedAtUtc);
  const end = toDate(step.completedAtUtc || step.claimedAtUtc);
  if (!start || !end) return '—';
  return formatDurationBetween(start, end);
}

function resolveNote(step: WorkflowTransparencyStepInfo, latestEvent: WorkflowTransparencyEventInfo | null): string {
  return step.comment || latestEvent?.comment || step.summary || step.candidateSummary || '—';
}

function normalizeEventAction(value: string): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    switch (numeric) {
      case 2: return 'Claimed';
      case 3: return 'Approved';
      case 4: return 'Rejected';
      case 5: return 'Forwarded';
      case 6: return 'Commented';
      default: return 'Updated';
    }
  }
  return normalizeWorkflowLabel(value);
}

function joinParts(first: unknown, last: unknown): string {
  return [stringValue(first), stringValue(last)].filter(Boolean).join(' ').trim();
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
