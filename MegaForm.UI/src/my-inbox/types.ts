// My Inbox — 3-pane design data model (adapted from mock TaskItem)
// Maps WorkflowInboxTask → a richer presentation model for the new UI.
import type { WorkflowInboxTask, WorkflowInboxTaskAction } from '../workflow-inbox/types';

export type InboxView = 'inbox' | 'assigned' | 'forwarded' | 'completed' | 'starred';
export type InboxTab = 'details' | 'history' | 'workflow';
export type ReplyMode = 'none' | 'approve' | 'reject' | 'return' | 'forward' | 'comment';
export type InboxSort = 'newest' | 'oldest' | 'priority' | 'due' | 'form' | 'submitter' | 'status';
export type InboxDensity = 'comfortable' | 'compact';
export type InboxPriority = 'urgent' | 'high' | 'normal' | 'low';
export type InboxTaskStatus = 'pending' | 'claimed' | 'approved' | 'rejected' | 'forwarded' | 'done' | 'overdue';
// [Inbox redesign 2026-06-12] Sort rank for the new "Status" sort option.
export const STATUS_RANK: Record<InboxTaskStatus, number> = {
  overdue: 0, pending: 1, claimed: 2, forwarded: 3, approved: 4, rejected: 5, done: 6,
};

// [TzFix 2026-07-13] The API serializes UTC DateTimes with no offset suffix
// ("2026-07-13T08:15:00" — DateTimeKind is lost in the DB round-trip), and
// new Date() reads offset-less ISO strings as LOCAL time. On a UTC+7 browser
// every fresh task therefore aged 7 hours at birth ("7h ago"). Treat an ISO
// datetime without an explicit offset as UTC; leave anything else untouched.
export function parseServerDate(iso: string): Date {
  const s = String(iso || '').trim();
  if (/T\d{2}:\d{2}/.test(s) && !/(?:Z|z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(s + 'Z');
  return new Date(s);
}

export interface InboxField {
  label: string;
  value: string;
  type?: 'text' | 'date' | 'amount' | 'long';
  // [Field render 2026-06-14] original form widget type (lowercased: 'html',
  // 'richtext', 'image', 'signature', 'textarea', …) so the detail panel can
  // render HTML as rich content and images as <img> instead of raw text.
  fieldType?: string;
}

export interface InboxAttachment {
  name: string;
  size: string;
  type: string;
  url?: string;
}

export interface InboxHistoryItem {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  note?: string;
  type: 'approve' | 'reject' | 'forward' | 'comment' | 'submit' | 'return';
}

export interface InboxTaskItem {
  id: string;
  submissionId: string;
  form: string;
  formColor: string;
  subject: string;
  submitter: string;
  submitterEmail: string;
  submitterPhone?: string;
  submitterDept?: string;
  assignedTo: string;
  priority: InboxPriority;
  status: InboxTaskStatus;
  dueDate: string;
  receivedAt: string;
  isRead: boolean;
  isStarred: boolean;
  hasAttachment: boolean;
  returnCount: number;
  currentStep: string;
  tags: string[];
  snippet: string;
  fields: InboxField[];
  attachments: InboxAttachment[];
  history: InboxHistoryItem[];
  // Raw source for API calls
  source: WorkflowInboxTask;
}

// View metadata for left nav
export interface ViewMeta {
  label: string;
  icon: string; // lucide-style icon name for ic()
}

export const VIEW_META: Record<InboxView, ViewMeta> = {
  inbox:     { label: 'Inbox',          icon: 'inbox' },
  assigned:  { label: 'Assigned to Me', icon: 'user' },
  forwarded: { label: 'Forwarded',      icon: 'forward' },
  completed: { label: 'Completed',      icon: 'checkCheck' },
  starred:   { label: 'Starred',        icon: 'star' },
};

// Status badge config
// [BadgeCls fix 2026-07-13] These cls values said "mf-mi-badge-*" but the CSS only
// defines "mf-mi3-badge-*" — every status badge rendered with the base gray chip
// style, no per-status color. Also adds 'claimed' (In Review): a claimed/ad-hoc
// assigned task used to fall through to 'pending', so a task sitting in someone's
// Assigned-to-Me read "Pending" as if nobody had picked it up.
export const STATUS_CONFIG: Record<InboxTaskStatus, { label: string; cls: string; icon: string }> = {
  pending:   { label: 'Pending',   cls: 'mf-mi3-badge-pending',   icon: 'clock' },
  claimed:   { label: 'In Review', cls: 'mf-mi3-badge-claimed',   icon: 'eye' },
  approved:  { label: 'Approved',  cls: 'mf-mi3-badge-approved',  icon: 'checkCircle' },
  rejected:  { label: 'Rejected',  cls: 'mf-mi3-badge-rejected',  icon: 'thumbsDown' },
  forwarded: { label: 'Forwarded', cls: 'mf-mi3-badge-forwarded', icon: 'forward' },
  done:      { label: 'Done',      cls: 'mf-mi3-badge-done',      icon: 'checkCheck' },
  overdue:   { label: 'Overdue',   cls: 'mf-mi3-badge-overdue',   icon: 'alertTriangle' },
};

// Priority config
export const PRIORITY_CONFIG: Record<InboxPriority, { label: string; color: string; dot: string }> = {
  urgent: { label: 'Urgent', color: 'mf-mi-priority-urgent',  dot: 'mf-mi-dot-red' },
  high:   { label: 'High',   color: 'mf-mi-priority-high',    dot: 'mf-mi-dot-orange' },
  normal: { label: 'Normal', color: 'mf-mi-priority-normal',  dot: 'mf-mi-dot-blue' },
  low:    { label: 'Low',    color: 'mf-mi-priority-low',     dot: 'mf-mi-dot-slate' },
};

// History type config
export const HISTORY_TYPE_CFG: Record<string, { icon: string; color: string; ring: string }> = {
  submit:  { icon: 'send',       color: 'mf-mi-hist-submit',  ring: 'mf-mi-ring-blue' },
  approve: { icon: 'thumbsUp',   color: 'mf-mi-hist-approve', ring: 'mf-mi-ring-green' },
  reject:  { icon: 'thumbsDown', color: 'mf-mi-hist-reject',  ring: 'mf-mi-ring-red' },
  forward: { icon: 'forward',    color: 'mf-mi-hist-forward', ring: 'mf-mi-ring-violet' },
  comment: { icon: 'messageSquare', color: 'mf-mi-hist-comment', ring: 'mf-mi-ring-slate' },
  return:  { icon: 'rotateCcw',  color: 'mf-mi-hist-return',  ring: 'mf-mi-ring-amber' },
};

// Map workflow actionType → history type
export function actionTypeToHistoryType(actionType: number): InboxHistoryItem['type'] {
  const map: Record<number, InboxHistoryItem['type']> = {
    1: 'submit', 2: 'comment', 3: 'approve', 4: 'reject', 5: 'forward', 6: 'comment',
  };
  return map[actionType] || 'comment';
}

// Derive priority from due date
export function derivePriority(dueAt?: string | null): InboxPriority {
  if (!dueAt) return 'normal';
  const diff = parseServerDate(dueAt).getTime() - Date.now();
  if (diff < 0) return 'urgent';
  if (diff < 86400000 * 2) return 'high'; // < 2 days
  if (diff < 86400000 * 7) return 'normal'; // < 1 week
  return 'low';
}

// Derive status from workflow task (server enum: 1=Pending, 2=Claimed, 3=Completed, 4=Cancelled)
export function deriveStatus(task: WorkflowInboxTask): InboxTaskStatus {
  const now = Date.now();
  const due = task.dueAt ? parseServerDate(task.dueAt).getTime() : 0;
  if (task.status === 3) return task.outcome?.toLowerCase().includes('reject') ? 'rejected' : 'approved';
  if (task.status === 4) return 'done';
  if (due && due < now) return 'overdue';
  if (task.outcome?.toLowerCase().includes('forward')) return 'forwarded';
  // [BadgeCls fix 2026-07-13] Trust the server's Claimed state over the
  // assignedUserId guess — ad-hoc Send-to-Inbox tasks are Claimed with a
  // NULL AssignedUserId and used to masquerade as "Pending".
  if (task.status === 2) return 'claimed';
  if (task.allowClaim && !task.assignedUserId) return 'pending';
  return 'pending';
}

// Derive form color from formId (deterministic)
export function deriveFormColor(formId: number): string {
  const colors = ['mf-mi-fc-blue', 'mf-mi-fc-amber', 'mf-mi-fc-emerald', 'mf-mi-fc-violet', 'mf-mi-fc-rose', 'mf-mi-fc-teal'];
  return colors[Math.abs(formId) % colors.length];
}

// Build tags from form title + step
export function deriveTags(formTitle: string, step: string): string[] {
  const tags: string[] = [];
  const ft = (formTitle || '').toLowerCase();
  if (ft.includes('leave')) tags.push('leave');
  if (ft.includes('purchase') || ft.includes('expense')) tags.push('finance');
  if (ft.includes('contract')) tags.push('legal');
  if (ft.includes('it') || ft.includes('support')) tags.push('it');
  if (ft.includes('onboard')) tags.push('hr');
  return tags;
}

// Adapter: WorkflowInboxTask → InboxTaskItem
export function adaptTask(
  task: WorkflowInboxTask,
  formTitle: string,
  history: WorkflowInboxTaskAction[],
): InboxTaskItem {
  const status = deriveStatus(task);
  const priority = derivePriority(task.dueAt);
  const tags = deriveTags(formTitle, task.nodeLabel);
  return {
    id: task.taskId,
    submissionId: `SUB-${task.submissionId}`,
    form: formTitle || `Form #${task.formId}`,
    formColor: deriveFormColor(task.formId),
    subject: task.nodeLabel || 'Task',
    // [Submitter fix 2026-07-12] candidateUsers are the APPROVERS, never the
    // submitter — that old fallback is why the inbox said "Unknown" (or worse,
    // named an approver) for logged-in submitters. The server now resolves the
    // real submitter from submission.UserId (stamped in load()).
    submitter: task.submittedByDisplayName || task.submittedByUserName || 'Unknown',
    submitterEmail: '',
    assignedTo: task.assignedDisplayName || task.assignedUserName || '',
    priority,
    status,
    dueDate: task.dueAt ? parseServerDate(task.dueAt).toLocaleDateString() : '—',
    receivedAt: task.createdAt ? relativeDate(task.createdAt) : '—',
    isRead: status !== 'pending' || !!task.claimedAt,
    isStarred: false,
    hasAttachment: false,
    returnCount: 0,
    currentStep: task.nodeLabel || 'Review',
    tags,
    snippet: task.comment || `Awaiting ${task.nodeLabel || 'review'}`,
    fields: [],
    attachments: [],
    history: history.map((h, i) => ({
      id: h.actionId || `h-${i}`,
      action: h.outcome || h.comment || 'Action taken',
      actor: h.actorDisplayName || h.actorUserName || 'System',
      timestamp: h.createdAt ? parseServerDate(h.createdAt).toLocaleDateString() : '—',
      note: h.comment || undefined,
      type: actionTypeToHistoryType(h.actionType),
    })),
    source: task,
  };
}

function relativeDate(iso: string): string {
  const d = parseServerDate(iso);
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
