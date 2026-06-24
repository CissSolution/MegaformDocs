import { normalizeSubmissionDetailResponse } from '@adapters/submission-detail';
import type { SubmissionDetailInfo } from '@core/types';
import type {
  WorkflowInboxConfig,
  WorkflowInboxResult,
  WorkflowInboxTask,
  WorkflowInboxTaskAction,
  WorkflowInboxTaskDetail,
  WorkflowInboxCase,
  MyInboxResult,
  MyInboxFormRef,
  DirectoryGroup,
} from './types';

export interface WorkflowInboxApi {
  getInbox(pageIndex?: number, pageSize?: number): Promise<WorkflowInboxResult>;
  getMyInbox(recentCompleted?: number): Promise<MyInboxResult>;
  getTask(taskId: string): Promise<WorkflowInboxTaskDetail>;
  getSubmissionDetail(submissionId: number): Promise<SubmissionDetailInfo>;
  claim(taskId: string, comment: string): Promise<WorkflowInboxTaskDetail>;
  approve(taskId: string, comment: string, data?: Record<string, unknown>): Promise<WorkflowInboxTaskDetail>;
  reject(taskId: string, comment: string, data?: Record<string, unknown>): Promise<WorkflowInboxTaskDetail>;
  forward(taskId: string, targetUser: string, comment: string, data?: Record<string, unknown>): Promise<WorkflowInboxTaskDetail>;
  comment(taskId: string, comment: string): Promise<WorkflowInboxTaskDetail>;
  getDirectory(): Promise<DirectoryGroup[]>;
}

export function createWorkflowInboxApi(config: WorkflowInboxConfig): WorkflowInboxApi {
  return {
    getInbox: async (pageIndex = 0, pageSize = 100) => {
      const raw = await requestJson<unknown>(
        config.apiBase,
        withContext(config, `Inbox?pageIndex=${pageIndex}&pageSize=${pageSize}`),
        { method: 'GET' },
        config,
      );
      return normalizeInbox(raw);
    },
    getMyInbox: async (recentCompleted = 25) => {
      const raw = await requestJson<unknown>(
        config.apiBase,
        withContext(config, `MyInbox?recentCompleted=${recentCompleted}`),
        { method: 'GET' },
        config,
      );
      return normalizeMyInbox(raw);
    },
    getTask: async (taskId: string) => {
      const raw = await requestJson<unknown>(
        config.apiBase,
        withContext(config, `Tasks/Get?taskId=${encodeURIComponent(taskId)}`),
        { method: 'GET' },
        config,
      );
      return normalizeTaskDetail(raw);
    },
    getSubmissionDetail: async (submissionId: number) => {
      try {
        return normalizeSubmissionDetailResponse(await requestJson<unknown>(
          config.submissionsApiBase,
          withContext(config, `Submissions/${submissionId}`),
          { method: 'GET' },
          config,
        ));
      } catch {
        return normalizeSubmissionDetailResponse(await requestJson<unknown>(
          config.submissionsApiBase,
          withContext(config, `Submissions/Get?submissionId=${submissionId}`),
          { method: 'GET' },
          config,
        ));
      }
    },
    claim: (taskId: string, comment: string) =>
      postTaskAction(config, 'Tasks/Claim', { taskId, comment }),
    approve: (taskId: string, comment: string, data: Record<string, unknown> = {}) =>
      postTaskAction(config, 'Tasks/Approve', { taskId, comment, data }),
    reject: (taskId: string, comment: string, data: Record<string, unknown> = {}) =>
      postTaskAction(config, 'Tasks/Reject', { taskId, comment, data }),
    forward: (taskId: string, targetUser: string, comment: string, data: Record<string, unknown> = {}) =>
      postTaskAction(config, 'Tasks/Forward', { taskId, targetUser, comment, data }),
    comment: (taskId: string, comment: string) =>
      postTaskAction(config, 'Tasks/Comment', { taskId, comment }),
    getDirectory: async () => {
      const raw = await requestJson<unknown>(
        config.apiBase,
        withContext(config, 'Directory'),
        { method: 'GET' },
        config,
      );
      const src = toRecord(raw);
      return toArray(src.groups ?? src.Groups).map((g): DirectoryGroup => {
        const grp = toRecord(g);
        return {
          roleId: readNumber(grp, 'roleId', 'RoleId'),
          name: readString(grp, 'name', 'Name'),
          userCount: readNumber(grp, 'userCount', 'UserCount'),
          users: toArray(grp.users ?? grp.Users).map((u) => {
            const usr = toRecord(u);
            return {
              userId: readNumber(usr, 'userId', 'UserId'),
              userName: readString(usr, 'userName', 'UserName'),
              displayName: readString(usr, 'displayName', 'DisplayName'),
              email: readString(usr, 'email', 'Email'),
              roleName: readString(usr, 'roleName', 'RoleName'),
            };
          }),
        };
      });
    },
  };
}

async function postTaskAction(config: WorkflowInboxConfig, path: string, body: Record<string, unknown>): Promise<WorkflowInboxTaskDetail> {
  // The action endpoints return the updated task payload (task + case + the FULL
  // action list, incl. the action just written). Returning it lets callers refresh
  // the History/Workflow audit trail without a follow-up getTask (which can 403
  // once the task is reassigned away by a forward).
  const raw = await requestJson<unknown>(
    config.apiBase,
    withContext(config, path),
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    config,
  );
  return normalizeTaskDetail(raw);
}

async function requestJson<T>(
  baseUrl: string,
  endpoint: string,
  init: RequestInit,
  config: WorkflowInboxConfig,
): Promise<T> {
  const response = await fetch(joinUrl(baseUrl, endpoint), {
    ...init,
    headers: {
      ...buildHeaders(config, init.method === 'POST'),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(formatHttpError(response.status, response.statusText, body));
  }

  return response.json() as Promise<T>;
}

function buildHeaders(config: WorkflowInboxConfig, includeJson: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const jq = (window as any).jQuery;
    if (jq && typeof jq.ServicesFramework === 'function') {
      const sf = jq.ServicesFramework(config.moduleId);
      headers.RequestVerificationToken = sf.getAntiForgeryValue();
      headers.TabId = sf.getTabId();
      headers.ModuleId = sf.getModuleId();
    } else if ((window as any).WebSF) {
      const webSf = (window as any).WebSF;
      if (typeof webSf.getAntiForgeryValue === 'function') headers.RequestVerificationToken = webSf.getAntiForgeryValue();
      if (typeof webSf.getTabId === 'function') headers.TabId = String(webSf.getTabId());
      if (typeof webSf.getModuleId === 'function') headers.ModuleId = String(webSf.getModuleId());
    }
  } catch {
    // Fall back to root config below.
  }

  if (!headers.ModuleId && config.moduleId > 0) headers.ModuleId = String(config.moduleId);
  if (!headers.TabId && config.tabId > 0) headers.TabId = String(config.tabId);
  if (includeJson) headers['Content-Type'] = 'application/json; charset=utf-8';
  return headers;
}

function withContext(config: WorkflowInboxConfig, endpoint: string): string {
  const platform = typeof window !== 'undefined' && (window as any).__MF_PLATFORM__ && typeof (window as any).__MF_PLATFORM__ === 'object'
    ? (window as any).__MF_PLATFORM__ as Record<string, unknown>
    : {};
  const platformName = String(platform.platform || '').trim().toLowerCase();
  const siteId = asPositiveInt(platform.siteId ?? platform.portalId);
  const moduleId = asPositiveInt(platform.moduleId) || config.moduleId;

  const query: string[] = [];
  if (platformName === 'oqtane') {
    if (moduleId > 0) query.push(`authmoduleid=${encodeURIComponent(String(moduleId))}`);
    if (siteId > 0) query.push(`authsiteid=${encodeURIComponent(String(siteId))}`);
  } else {
    if (config.moduleId > 0) query.push(`moduleid=${encodeURIComponent(String(config.moduleId))}`);
    if (config.tabId > 0) query.push(`tabid=${encodeURIComponent(String(config.tabId))}`);
  }

  if (!query.length) return endpoint;
  return endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
}

function asPositiveInt(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function joinUrl(baseUrl: string, endpoint: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(endpoint || '').replace(/^\/+/, '')}`;
}

function formatHttpError(status: number, statusText: string, body: string): string {
  let message = `HTTP ${status}${statusText ? ` ${statusText}` : ''}`;
  if (!body) return message;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const detail = String(parsed.error || parsed.message || '').trim();
    if (detail) return `${message}: ${detail}`;
  } catch {
    // Use text fallback below.
  }
  const text = String(body).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) message += `: ${text.slice(0, 220)}`;
  return message;
}

function normalizeInbox(raw: unknown): WorkflowInboxResult {
  const source = toRecord(raw);
  return {
    myTasks: toArray(source.myTasks ?? source.MyTasks).map(normalizeTask),
    roleQueue: toArray(source.roleQueue ?? source.RoleQueue).map(normalizeTask),
  };
}

function normalizeMyInbox(raw: unknown): MyInboxResult {
  const source = toRecord(raw);
  const user = toRecord(source.user ?? source.User);
  const kpis = toRecord(source.kpis ?? source.Kpis);
  const formsRaw = toRecord(source.forms ?? source.Forms);
  const forms: Record<string, MyInboxFormRef> = {};
  Object.keys(formsRaw).forEach((key) => {
    const f = toRecord(formsRaw[key]);
    forms[key] = {
      formId: readNumber(f, 'formId', 'FormId'),
      title: readString(f, 'title', 'Title'),
    };
  });
  return {
    user: {
      userId: readNumber(user, 'userId', 'UserId'),
      userName: readString(user, 'userName', 'UserName'),
      displayName: readString(user, 'displayName', 'DisplayName'),
      isAdmin: readBoolean(user, 'isAdmin', 'IsAdmin'),
    },
    kpis: {
      incoming: readNumber(kpis, 'incoming', 'Incoming'),
      inProgress: readNumber(kpis, 'inProgress', 'InProgress'),
      completed: readNumber(kpis, 'completed', 'Completed'),
      overdue: readNumber(kpis, 'overdue', 'Overdue'),
    },
    incoming: toArray(source.incoming ?? source.Incoming).map(normalizeTask),
    inProgress: toArray(source.inProgress ?? source.InProgress).map(normalizeTask),
    completed: toArray(source.completed ?? source.Completed).map(normalizeTask),
    forms,
    generatedAt: readString(source, 'generatedAt', 'GeneratedAt'),
  };
}

function normalizeTaskDetail(raw: unknown): WorkflowInboxTaskDetail {
  const source = toRecord(raw);
  return {
    task: normalizeTask(source.task ?? source.Task),
    workflowCase: normalizeCase(source.case ?? source.Case),
    actions: toArray(source.actions ?? source.Actions).map(normalizeAction),
  };
}

function normalizeTask(raw: unknown): WorkflowInboxTask {
  const source = toRecord(raw);
  return {
    taskId: readString(source, 'taskId', 'TaskId'),
    caseId: readString(source, 'caseId', 'CaseId'),
    formId: readNumber(source, 'formId', 'FormId'),
    submissionId: readNumber(source, 'submissionId', 'SubmissionId'),
    nodeId: readString(source, 'nodeId', 'NodeId'),
    nodeLabel: readString(source, 'nodeLabel', 'NodeLabel'),
    status: readNumber(source, 'status', 'Status'),
    candidateRoles: readArray(source, 'candidateRoles', 'CandidateRoles'),
    candidateUsers: readArray(source, 'candidateUsers', 'CandidateUsers'),
    assignedUserId: readNullableNumber(source, 'assignedUserId', 'AssignedUserId'),
    assignedUserName: readString(source, 'assignedUserName', 'AssignedUserName'),
    assignedDisplayName: readString(source, 'assignedDisplayName', 'AssignedDisplayName'),
    allowClaim: readBoolean(source, 'allowClaim', 'AllowClaim'),
    allowForward: readBoolean(source, 'allowForward', 'AllowForward'),
    allowReassign: readBoolean(source, 'allowReassign', 'AllowReassign'),
    commentRequiredOnReject: readBoolean(source, 'commentRequiredOnReject', 'CommentRequiredOnReject'),
    pendingSubmissionStatus: readString(source, 'pendingSubmissionStatus', 'PendingSubmissionStatus'),
    approvedSubmissionStatus: readString(source, 'approvedSubmissionStatus', 'ApprovedSubmissionStatus'),
    rejectedSubmissionStatus: readString(source, 'rejectedSubmissionStatus', 'RejectedSubmissionStatus'),
    outcome: readString(source, 'outcome', 'Outcome'),
    comment: readString(source, 'comment', 'Comment'),
    createdAt: readString(source, 'createdAt', 'CreatedAt'),
    claimedAt: readNullableString(source, 'claimedAt', 'ClaimedAt'),
    dueAt: readNullableString(source, 'dueAt', 'DueAt'),
    completedAt: readNullableString(source, 'completedAt', 'CompletedAt'),
  };
}

function normalizeCase(raw: unknown): WorkflowInboxCase | null {
  const source = toRecord(raw);
  if (!Object.keys(source).length) return null;
  return {
    caseId: readString(source, 'caseId', 'CaseId'),
    currentNodeId: readString(source, 'currentNodeId', 'CurrentNodeId'),
    status: readNumber(source, 'status', 'Status'),
    outcome: readString(source, 'outcome', 'Outcome'),
    lastComment: readString(source, 'lastComment', 'LastComment'),
    createdAt: readString(source, 'createdAt', 'CreatedAt'),
    completedAt: readNullableString(source, 'completedAt', 'CompletedAt'),
  };
}

function normalizeAction(raw: unknown): WorkflowInboxTaskAction {
  const source = toRecord(raw);
  return {
    actionId: readString(source, 'actionId', 'ActionId'),
    taskId: readString(source, 'taskId', 'TaskId'),
    caseId: readString(source, 'caseId', 'CaseId'),
    actionType: readNumber(source, 'actionType', 'ActionType'),
    actorUserId: readNullableNumber(source, 'actorUserId', 'ActorUserId'),
    actorUserName: readString(source, 'actorUserName', 'ActorUserName'),
    actorDisplayName: readString(source, 'actorDisplayName', 'ActorDisplayName'),
    targetUser: readString(source, 'targetUser', 'TargetUser'),
    outcome: readString(source, 'outcome', 'Outcome'),
    comment: readString(source, 'comment', 'Comment'),
    createdAt: readString(source, 'createdAt', 'CreatedAt'),
  };
}

function toRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
}

function toArray(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
}

function readString(source: Record<string, unknown>, primary: string, secondary: string): string {
  const value = source[primary] ?? source[secondary];
  return value == null ? '' : String(value);
}

function readNullableString(source: Record<string, unknown>, primary: string, secondary: string): string | null {
  const value = source[primary] ?? source[secondary];
  return value == null || value === '' ? null : String(value);
}

function readNumber(source: Record<string, unknown>, primary: string, secondary: string): number {
  const value = Number(source[primary] ?? source[secondary] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function readNullableNumber(source: Record<string, unknown>, primary: string, secondary: string): number | null {
  const value = source[primary] ?? source[secondary];
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBoolean(source: Record<string, unknown>, primary: string, secondary: string): boolean {
  return !!(source[primary] ?? source[secondary]);
}

function readArray(source: Record<string, unknown>, primary: string, secondary: string): string[] {
  const value = source[primary] ?? source[secondary];
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}
