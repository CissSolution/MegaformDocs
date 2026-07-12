import type { SubmissionDetailInfo } from '@core/types';

export interface WorkflowInboxConfig {
  moduleId: number;
  tabId: number;
  apiBase: string;
  submissionsApiBase: string;
  formId: number;
  initialTaskId: string;
}

// [Forward org-tree 2026-06-11] Org directory grouped by role/department.
export interface DirectoryUser {
  userId: number;
  userName: string;
  displayName: string;
  email: string;
  roleName: string;
}
export interface DirectoryGroup {
  roleId: number;
  name: string;
  userCount: number;
  users: DirectoryUser[];
}

export interface WorkflowInboxTask {
  taskId: string;
  caseId: string;
  formId: number;
  submissionId: number;
  nodeId: string;
  nodeLabel: string;
  status: number;
  candidateRoles: string[];
  candidateUsers: string[];
  assignedUserId: number | null;
  assignedUserName: string;
  assignedDisplayName: string;
  allowClaim: boolean;
  allowForward: boolean;
  allowReassign: boolean;
  commentRequiredOnReject: boolean;
  pendingSubmissionStatus: string;
  approvedSubmissionStatus: string;
  rejectedSubmissionStatus: string;
  outcome: string;
  comment: string;
  createdAt: string;
  claimedAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  // [Submitter fix 2026-07-12] Stamped client-side from MyInboxResult.submitters
  // (the server resolves submission.UserId → real user). Optional: absent for
  // anonymous submissions and on older payloads.
  submittedByUserName?: string;
  submittedByDisplayName?: string;
}

export interface WorkflowInboxTaskAction {
  actionId: string;
  taskId: string;
  caseId: string;
  actionType: number;
  actorUserId: number | null;
  actorUserName: string;
  actorDisplayName: string;
  targetUser: string;
  outcome: string;
  comment: string;
  createdAt: string;
}

export interface WorkflowInboxCase {
  caseId: string;
  currentNodeId: string;
  status: number;
  outcome: string;
  lastComment: string;
  createdAt: string;
  completedAt: string | null;
}

export interface WorkflowInboxTaskDetail {
  task: WorkflowInboxTask;
  workflowCase: WorkflowInboxCase | null;
  actions: WorkflowInboxTaskAction[];
}

export interface WorkflowInboxResult {
  myTasks: WorkflowInboxTask[];
  roleQueue: WorkflowInboxTask[];
}

// [MyInbox v20260610-B120] Personal project-manager workboard payload returned by
// GET /Workflow/MyInbox. Splits tasks into incoming / in-progress / completed plus
// KPI counts and a formId→title lookup so the board grid can label rows cheaply.
export interface MyInboxUser {
  userId: number;
  userName: string;
  displayName: string;
  isAdmin: boolean;
}

export interface MyInboxKpis {
  incoming: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface MyInboxFormRef {
  formId: number;
  title: string;
}

export interface MyInboxResult {
  user: MyInboxUser;
  kpis: MyInboxKpis;
  incoming: WorkflowInboxTask[];
  inProgress: WorkflowInboxTask[];
  completed: WorkflowInboxTask[];
  forms: Record<string, MyInboxFormRef>;
  // [Submitter fix 2026-07-12] submissionId (string key) → who actually
  // submitted, resolved server-side from submission.UserId.
  submitters?: Record<string, { userId?: number; userName?: string; displayName?: string }>;
  generatedAt: string;
}

export interface WorkflowInboxState {
  inbox: WorkflowInboxResult | null;
  selectedTaskId: string;
  selectedTaskDetail: WorkflowInboxTaskDetail | null;
  selectedSubmissionDetail: SubmissionDetailInfo | null;
  busy: boolean;
  error: string;
}
