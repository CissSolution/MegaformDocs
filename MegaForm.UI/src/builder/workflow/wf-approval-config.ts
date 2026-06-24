// wf-approval-config.ts -- Pure helpers for Approval workflow nodes.
// Keep this file DOM-free so it can be reused by normalize/build logic.

export var APPROVAL_PANEL_BADGE = 'WF Approval split v20260423-01';

function toTrimmedString(value: any): string {
  return String(value == null ? '' : value).trim();
}

export function normalizeApprovalList(input: any): string[] {
  if (Array.isArray(input)) {
    return input
      .map(function (value: any) { return toTrimmedString(value); })
      .filter(function (value: string) { return value.length > 0; });
  }

  var raw = toTrimmedString(input);
  if (!raw) return [];

  if (raw.charAt(0) === '[') {
    try {
      return normalizeApprovalList(JSON.parse(raw));
    } catch (_e) { }
  }

  return raw
    .split(/[\r\n,;]+/)
    .map(function (value: string) { return toTrimmedString(value); })
    .filter(function (value: string) { return value.length > 0; });
}

export function approvalListToText(values: any): string {
  return normalizeApprovalList(values).join('\n');
}

export function normalizeApprovalConfig(config: any): any {
  var c = config || {};
  var dueInHoursRaw = c.dueInHours != null ? c.dueInHours : c.DueInHours;
  var dueInHours = parseInt(String(dueInHoursRaw == null ? '' : dueInHoursRaw), 10);
  if (!(dueInHours > 0)) dueInHours = 0;

  return {
    candidateRoles: normalizeApprovalList(c.candidateRoles != null ? c.candidateRoles : c.CandidateRoles),
    candidateUsers: normalizeApprovalList(c.candidateUsers != null ? c.candidateUsers : c.CandidateUsers),
    allowClaim: c.allowClaim != null ? !!c.allowClaim : !!(c.AllowClaim != null ? c.AllowClaim : true),
    allowForward: c.allowForward != null ? !!c.allowForward : !!(c.AllowForward != null ? c.AllowForward : true),
    allowReassign: c.allowReassign != null ? !!c.allowReassign : !!(c.AllowReassign != null ? c.AllowReassign : true),
    commentRequiredOnReject: c.commentRequiredOnReject != null ? !!c.commentRequiredOnReject : !!c.CommentRequiredOnReject,
    dueInHours: dueInHours,
    pendingSubmissionStatus: toTrimmedString(c.pendingSubmissionStatus != null ? c.pendingSubmissionStatus : c.PendingSubmissionStatus) || 'pending_approval',
    approvedSubmissionStatus: toTrimmedString(c.approvedSubmissionStatus != null ? c.approvedSubmissionStatus : c.ApprovedSubmissionStatus) || 'approved',
    rejectedSubmissionStatus: toTrimmedString(c.rejectedSubmissionStatus != null ? c.rejectedSubmissionStatus : c.RejectedSubmissionStatus) || 'rejected',
    notifyOnCreate: c.notifyOnCreate != null ? !!c.notifyOnCreate : !!(c.NotifyOnCreate != null ? c.NotifyOnCreate : true),
    notifyOnForward: c.notifyOnForward != null ? !!c.notifyOnForward : !!(c.NotifyOnForward != null ? c.NotifyOnForward : true),
    notifyCreateSubject: toTrimmedString(c.notifyCreateSubject != null ? c.notifyCreateSubject : c.NotifyCreateSubject),
    notifyCreateBody: toTrimmedString(c.notifyCreateBody != null ? c.notifyCreateBody : c.NotifyCreateBody),
    notifyForwardSubject: toTrimmedString(c.notifyForwardSubject != null ? c.notifyForwardSubject : c.NotifyForwardSubject),
    notifyForwardBody: toTrimmedString(c.notifyForwardBody != null ? c.notifyForwardBody : c.NotifyForwardBody)
  };
}

export function serializeApprovalConfig(config: any): any {
  var c = normalizeApprovalConfig(config || {});
  return {
    CandidateRoles: c.candidateRoles,
    CandidateUsers: c.candidateUsers,
    AllowClaim: !!c.allowClaim,
    AllowForward: !!c.allowForward,
    AllowReassign: !!c.allowReassign,
    CommentRequiredOnReject: !!c.commentRequiredOnReject,
    DueInHours: c.dueInHours || 0,
    PendingSubmissionStatus: c.pendingSubmissionStatus || 'pending_approval',
    ApprovedSubmissionStatus: c.approvedSubmissionStatus || 'approved',
    RejectedSubmissionStatus: c.rejectedSubmissionStatus || 'rejected',
    NotifyOnCreate: !!c.notifyOnCreate,
    NotifyOnForward: !!c.notifyOnForward,
    NotifyCreateSubject: c.notifyCreateSubject,
    NotifyCreateBody: c.notifyCreateBody,
    NotifyForwardSubject: c.notifyForwardSubject,
    NotifyForwardBody: c.notifyForwardBody
  };
}

export function isApprovalHandle(handle: string): boolean {
  return handle === 'approved' || handle === 'rejected';
}

export function getApprovalEdgeColor(handle: string): string {
  if (handle === 'approved') return '#16a34a';
  if (handle === 'rejected') return '#dc2626';
  return '';
}

export function getApprovalEdgeLabel(config: any, handle: string): string {
  if (handle === 'approved') return 'Approved';
  if (handle === 'rejected') return 'Rejected';
  return '';
}
