import type {
  FormField,
  FormInfo,
  FormSchema,
  SubmissionData,
  SubmissionDetailInfo,
  SubmissionFieldSnapshot,
  SubmissionInfo,
  SubmissionWorkflowDetailInfo,
  WorkflowCaseInfo,
  WorkflowDefinitionInfo,
  WorkflowEdgeInfo,
  WorkflowExecutionInfo,
  WorkflowNodeInfo,
  WorkflowPositionInfo,
  WorkflowTaskActionInfo,
  WorkflowTaskInfo,
  WorkflowTransparencyEventInfo,
  WorkflowTransparencyInfo,
  WorkflowTransparencyStepInfo,
  SubmissionAvailableActionInfo,
} from '@core/types';

type UnknownRecord = Record<string, unknown>;
const SUBMISSION_DETAIL_ADAPTER_PDF_BADGE = 'SubmissionDetailAdapterPdf v20260505-01';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_DETAIL_ADAPTER_PDF_BADGE__ = SUBMISSION_DETAIL_ADAPTER_PDF_BADGE;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pick(value: UnknownRecord | null, ...keys: string[]): unknown {
  if (!value) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

function toStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function toNullableString(value: unknown): string | null {
  const result = toStringValue(value, '');
  return result || null;
}

function toNumberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = toNumberValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

function toStringArray(value: unknown): string[] {
  return asArray(value)
    .map((item) => toStringValue(item, '').trim())
    .filter(Boolean);
}

function toRecordValue(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return record ? { ...record } : undefined;
}

function toUtcString(value: unknown): string | null {
  if (value == null || value === '') return null;
  return toStringValue(value, '') || null;
}

function parseJsonObject(value: unknown): UnknownRecord | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizeFieldOption(raw: unknown): { label: string; value: string } {
  const item = asRecord(raw);
  return {
    label: toStringValue(pick(item, 'label', 'Label', 'text', 'Text')),
    value: toStringValue(pick(item, 'value', 'Value')),
  };
}

function normalizeRowColumn(raw: unknown): { span: number; fields: FormField[] } {
  const item = asRecord(raw);
  return {
    span: toNumberValue(pick(item, 'span', 'Span'), 12),
    fields: asArray(pick(item, 'fields', 'Fields')).map(normalizeFormField),
  };
}

function normalizeFormField(raw: unknown): FormField {
  const item = asRecord(raw) || {};
  const key = toStringValue(pick(item, 'key', 'Key', 'name', 'Name', 'id', 'Id'));
  return {
    key,
    type: toStringValue(pick(item, 'type', 'Type')),
    label: toStringValue(pick(item, 'label', 'Label', 'adminLabel', 'AdminLabel'), key),
    placeholder: toNullableString(pick(item, 'placeholder', 'Placeholder')) ?? undefined,
    helpText: toNullableString(pick(item, 'helpText', 'HelpText')) ?? undefined,
    required: toBooleanValue(pick(item, 'required', 'Required')),
    readOnly: toBooleanValue(pick(item, 'readOnly', 'ReadOnly')),
    defaultValue: toNullableString(pick(item, 'defaultValue', 'DefaultValue')) ?? undefined,
    cssClass: toNullableString(pick(item, 'cssClass', 'CssClass')) ?? undefined,
    width: toNullableString(pick(item, 'width', 'Width')) ?? undefined,
    prefillParam: toNullableString(pick(item, 'prefillParam', 'PrefillParam')) ?? undefined,
    validations: asArray(pick(item, 'validations', 'Validations')).map((entry) => {
      const validation = asRecord(entry);
      return {
        type: toStringValue(pick(validation, 'type', 'Type')) as 'minLength' | 'maxLength' | 'min' | 'max' | 'pattern' | 'custom',
        value: (pick(validation, 'value', 'Value') ?? '') as string | number,
        message: toNullableString(pick(validation, 'message', 'Message')) ?? undefined,
      };
    }),
    validation: toRecordValue(pick(item, 'validation', 'Validation')),
    properties: toRecordValue(pick(item, 'properties', 'Properties')),
    conditions: asArray(pick(item, 'conditions', 'Conditions')).map((entry) => {
      const condition = asRecord(entry);
      return {
        field: toStringValue(pick(condition, 'field', 'Field')),
        operator: toStringValue(pick(condition, 'operator', 'Operator')) as 'equals' | 'notEquals' | 'contains' | 'isEmpty' | 'isNotEmpty' | 'greaterThan' | 'lessThan',
        value: toStringValue(pick(condition, 'value', 'Value')),
        action: toStringValue(pick(condition, 'action', 'Action')) as 'show' | 'hide' | 'require' | 'unrequire',
      };
    }),
    showIf: (pick(item, 'showIf', 'ShowIf') as FormField['showIf']) ?? null,
    columns: asArray(pick(item, 'columns', 'Columns')).map(normalizeRowColumn),
    options: asArray(pick(item, 'options', 'Options')).map(normalizeFieldOption),
    subfields: asArray(pick(item, 'subfields', 'Subfields')).map(normalizeFormField),
    htmlContent: toNullableString(pick(item, 'htmlContent', 'HtmlContent', 'content', 'Content')) ?? undefined,
    fileSettings: toRecordValue(pick(item, 'fileSettings', 'FileSettings')) as FormField['fileSettings'],
    widgetType: toNullableString(pick(item, 'widgetType', 'WidgetType')) ?? undefined,
    widgetConfig: toRecordValue(pick(item, 'widgetConfig', 'WidgetConfig')),
    widgetProps: toRecordValue(pick(item, 'widgetProps', 'WidgetProps')),
  };
}

function normalizeFormSchema(raw: unknown): FormSchema | null {
  const item = asRecord(raw) || parseJsonObject(raw);
  if (!item) return null;
  const fields = asArray(pick(item, 'fields', 'Fields')).map(normalizeFormField);
  return {
    ...(item as Record<string, unknown>),
    fields,
    settings: (pick(item, 'settings', 'Settings') as FormSchema['settings']) ?? undefined,
    customScripts: (pick(item, 'customScripts', 'CustomScripts') as Record<string, string> | undefined),
    CustomScripts: (pick(item, 'CustomScripts', 'customScripts') as Record<string, string> | undefined),
  } as FormSchema;
}

function normalizeFormInfo(raw: unknown): FormInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    formId: toNumberValue(pick(item, 'formId', 'FormId')),
    moduleId: toNumberValue(pick(item, 'moduleId', 'ModuleId')),
    portalId: toNumberValue(pick(item, 'portalId', 'PortalId')),
    title: toStringValue(pick(item, 'title', 'Title')),
    description: toStringValue(pick(item, 'description', 'Description')),
    schemaJson: toStringValue(pick(item, 'schemaJson', 'SchemaJson'), '{}'),
    settingsJson: toStringValue(pick(item, 'settingsJson', 'SettingsJson'), '{}'),
    themeJson: toStringValue(pick(item, 'themeJson', 'ThemeJson')),
    status: toStringValue(pick(item, 'status', 'Status'), 'Draft') as FormInfo['status'],
    submitButtonText: toStringValue(pick(item, 'submitButtonText', 'SubmitButtonText'), 'Submit'),
    successMessage: toStringValue(pick(item, 'successMessage', 'SuccessMessage')),
    redirectUrl: toStringValue(pick(item, 'redirectUrl', 'RedirectUrl')),
    maxSubmissions: toNullableNumber(pick(item, 'maxSubmissions', 'MaxSubmissions')),
    expiresOnUtc: toUtcString(pick(item, 'expiresOnUtc', 'ExpiresOnUtc')),
    requireAuth: toBooleanValue(pick(item, 'requireAuth', 'RequireAuth')),
    enableCaptcha: toBooleanValue(pick(item, 'enableCaptcha', 'EnableCaptcha')),
    enableSaveResume: toBooleanValue(pick(item, 'enableSaveResume', 'EnableSaveResume')),
    webhookUrl: toStringValue(pick(item, 'webhookUrl', 'WebhookUrl')),
    notifyEmails: toStringValue(pick(item, 'notifyEmails', 'NotifyEmails')),
    autoresponderEnabled: toBooleanValue(pick(item, 'autoresponderEnabled', 'AutoresponderEnabled')),
    autoresponderEmailField: toStringValue(pick(item, 'autoresponderEmailField', 'AutoresponderEmailField')),
    autoresponderSubject: toStringValue(pick(item, 'autoresponderSubject', 'AutoresponderSubject')),
    autoresponderBody: toStringValue(pick(item, 'autoresponderBody', 'AutoresponderBody')),
    createdByUserId: toNumberValue(pick(item, 'createdByUserId', 'CreatedByUserId')),
    createdOnUtc: toStringValue(pick(item, 'createdOnUtc', 'CreatedOnUtc')),
    updatedByUserId: toNullableNumber(pick(item, 'updatedByUserId', 'UpdatedByUserId')),
    updatedOnUtc: toUtcString(pick(item, 'updatedOnUtc', 'UpdatedOnUtc')),
    appScope: toStringValue(pick(item, 'appScope', 'AppScope')),
    submissionCount: toNumberValue(pick(item, 'submissionCount', 'SubmissionCount', 'totalSubmissions', 'TotalSubmissions')),
  };
}

export function normalizeSubmissionInfo(raw: unknown): SubmissionInfo {
  const item = asRecord(raw) || {};
  return {
    submissionId: toNumberValue(pick(item, 'submissionId', 'SubmissionId')),
    formId: toNumberValue(pick(item, 'formId', 'FormId')),
    dataJson: toStringValue(pick(item, 'dataJson', 'DataJson'), '{}'),
    ipAddress: toStringValue(pick(item, 'ipAddress', 'IpAddress')),
    userAgent: toStringValue(pick(item, 'userAgent', 'UserAgent')),
    userId: toNullableNumber(pick(item, 'userId', 'UserId')),
    status: toStringValue(pick(item, 'status', 'Status')),
    isSpam: toBooleanValue(pick(item, 'isSpam', 'IsSpam')),
    spamScore: toNullableNumber(pick(item, 'spamScore', 'SpamScore')),
    submittedOnUtc: toStringValue(pick(item, 'submittedOnUtc', 'SubmittedOnUtc')),
    readOnUtc: toUtcString(pick(item, 'readOnUtc', 'ReadOnUtc')),
    modifiedOnUtc: toUtcString(pick(item, 'modifiedOnUtc', 'ModifiedOnUtc')),
    modifiedByUserId: toNullableNumber(pick(item, 'modifiedByUserId', 'ModifiedByUserId')),
    formTitle: toNullableString(pick(item, 'formTitle', 'FormTitle')) ?? undefined,
    summaryText: toNullableString(pick(item, 'summaryText', 'SummaryText')) ?? undefined,
    activeTaskId: toNullableString(pick(item, 'activeTaskId', 'ActiveTaskId')),
    availableActions: asArray(pick(item, 'availableActions', 'AvailableActions')).map(normalizeSubmissionAction),
  };
}

function normalizeSubmissionAction(raw: unknown): SubmissionAvailableActionInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as SubmissionAvailableActionInfo),
    key: toStringValue(pick(item, 'key', 'Key')).trim().toLowerCase(),
    label: toStringValue(pick(item, 'label', 'Label')),
    title: toNullableString(pick(item, 'title', 'Title')),
    tone: toNullableString(pick(item, 'tone', 'Tone')),
    taskId: toNullableString(pick(item, 'taskId', 'TaskId')),
    requiresComment: toBooleanValue(pick(item, 'requiresComment', 'RequiresComment')),
  };
}

function normalizePosition(raw: unknown): WorkflowPositionInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    x: toNumberValue(pick(item, 'x', 'X')),
    y: toNumberValue(pick(item, 'y', 'Y')),
  };
}

function normalizeWorkflowNode(raw: unknown): WorkflowNodeInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowNodeInfo),
    id: toStringValue(pick(item, 'id', 'Id')),
    type: toStringValue(pick(item, 'type', 'Type')),
    label: toStringValue(pick(item, 'label', 'Label')),
    zoneType: toNullableString(pick(item, 'zoneType', 'ZoneType')),
    position: normalizePosition(pick(item, 'position', 'Position')),
    config: toRecordValue(pick(item, 'config', 'Config')) ?? null,
  };
}

function normalizeWorkflowEdge(raw: unknown): WorkflowEdgeInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowEdgeInfo),
    id: toStringValue(pick(item, 'id', 'Id')),
    sourceNodeId: toStringValue(pick(item, 'sourceNodeId', 'SourceNodeId', 'source', 'Source')),
    targetNodeId: toStringValue(pick(item, 'targetNodeId', 'TargetNodeId', 'target', 'Target')),
    sourceHandle: toNullableString(pick(item, 'sourceHandle', 'SourceHandle')),
    targetHandle: toNullableString(pick(item, 'targetHandle', 'TargetHandle')),
    label: toNullableString(pick(item, 'label', 'Label')),
  };
}

function normalizeWorkflowDefinition(raw: unknown): WorkflowDefinitionInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    ...(item as WorkflowDefinitionInfo),
    workflowId: toNullableString(pick(item, 'workflowId', 'WorkflowId', 'id', 'Id')),
    name: toNullableString(pick(item, 'name', 'Name', 'title', 'Title')),
    startNodeId: toNullableString(pick(item, 'startNodeId', 'StartNodeId')),
    nodes: asArray(pick(item, 'nodes', 'Nodes')).map(normalizeWorkflowNode),
    edges: asArray(pick(item, 'edges', 'Edges')).map(normalizeWorkflowEdge),
  };
}

function normalizeWorkflowExecution(raw: unknown): WorkflowExecutionInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    ...(item as WorkflowExecutionInfo),
    executionId: toNullableString(pick(item, 'executionId', 'ExecutionId')),
    workflowId: toNullableString(pick(item, 'workflowId', 'WorkflowId')),
    status: pick(item, 'status', 'Status') as string | number | null,
    currentNodeId: toNullableString(pick(item, 'currentNodeId', 'CurrentNodeId')),
    startedAtUtc: toUtcString(pick(item, 'startedAtUtc', 'StartedAtUtc', 'startedAt', 'StartedAt')),
    completedAtUtc: toUtcString(pick(item, 'completedAtUtc', 'CompletedAtUtc', 'completedAt', 'CompletedAt')),
  };
}

function normalizeWorkflowCase(raw: unknown): WorkflowCaseInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    ...(item as WorkflowCaseInfo),
    caseId: toNullableString(pick(item, 'caseId', 'CaseId')),
    executionId: toNullableString(pick(item, 'executionId', 'ExecutionId')),
    workflowId: toNullableString(pick(item, 'workflowId', 'WorkflowId')),
    currentNodeId: toNullableString(pick(item, 'currentNodeId', 'CurrentNodeId')),
    activeTaskId: toNullableString(pick(item, 'activeTaskId', 'ActiveTaskId')),
    status: pick(item, 'status', 'Status') as string | number | null,
    outcome: toNullableString(pick(item, 'outcome', 'Outcome')),
    lastComment: toNullableString(pick(item, 'lastComment', 'LastComment')),
    createdAtUtc: toUtcString(pick(item, 'createdAtUtc', 'CreatedAtUtc', 'createdAt', 'CreatedAt')),
    completedAtUtc: toUtcString(pick(item, 'completedAtUtc', 'CompletedAtUtc', 'completedAt', 'CompletedAt')),
    startedByUserId: toNullableNumber(pick(item, 'startedByUserId', 'StartedByUserId')),
    startedByUserName: toNullableString(pick(item, 'startedByUserName', 'StartedByUserName')),
  };
}

function normalizeWorkflowTask(raw: unknown): WorkflowTaskInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowTaskInfo),
    taskId: toNullableString(pick(item, 'taskId', 'TaskId')),
    caseId: toNullableString(pick(item, 'caseId', 'CaseId')),
    executionId: toNullableString(pick(item, 'executionId', 'ExecutionId')),
    nodeId: toNullableString(pick(item, 'nodeId', 'NodeId')),
    nodeLabel: toNullableString(pick(item, 'nodeLabel', 'NodeLabel')),
    status: pick(item, 'status', 'Status') as string | number | null,
    candidateRoles: toStringArray(pick(item, 'candidateRoles', 'CandidateRoles')),
    candidateUsers: toStringArray(pick(item, 'candidateUsers', 'CandidateUsers')),
    assignedUserId: toNullableNumber(pick(item, 'assignedUserId', 'AssignedUserId')),
    assignedUserName: toNullableString(pick(item, 'assignedUserName', 'AssignedUserName')),
    assignedDisplayName: toNullableString(pick(item, 'assignedDisplayName', 'AssignedDisplayName')),
    allowClaim: toBooleanValue(pick(item, 'allowClaim', 'AllowClaim')),
    allowForward: toBooleanValue(pick(item, 'allowForward', 'AllowForward')),
    allowReassign: toBooleanValue(pick(item, 'allowReassign', 'AllowReassign')),
    commentRequiredOnReject: toBooleanValue(pick(item, 'commentRequiredOnReject', 'CommentRequiredOnReject')),
    outcome: toNullableString(pick(item, 'outcome', 'Outcome')),
    comment: toNullableString(pick(item, 'comment', 'Comment')),
    createdAtUtc: toUtcString(pick(item, 'createdAtUtc', 'CreatedAtUtc', 'createdAt', 'CreatedAt')),
    claimedAtUtc: toUtcString(pick(item, 'claimedAtUtc', 'ClaimedAtUtc', 'claimedAt', 'ClaimedAt')),
    dueAtUtc: toUtcString(pick(item, 'dueAtUtc', 'DueAtUtc', 'dueAt', 'DueAt')),
    completedAtUtc: toUtcString(pick(item, 'completedAtUtc', 'CompletedAtUtc', 'completedAt', 'CompletedAt')),
  };
}

function normalizeWorkflowTaskAction(raw: unknown): WorkflowTaskActionInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowTaskActionInfo),
    actionId: toNullableString(pick(item, 'actionId', 'ActionId')),
    taskId: toNullableString(pick(item, 'taskId', 'TaskId')),
    caseId: toNullableString(pick(item, 'caseId', 'CaseId')),
    executionId: toNullableString(pick(item, 'executionId', 'ExecutionId')),
    actionType: pick(item, 'actionType', 'ActionType') as string | number | null,
    actorUserId: toNullableNumber(pick(item, 'actorUserId', 'ActorUserId')),
    actorUserName: toNullableString(pick(item, 'actorUserName', 'ActorUserName')),
    actorDisplayName: toNullableString(pick(item, 'actorDisplayName', 'ActorDisplayName')),
    targetUser: toNullableString(pick(item, 'targetUser', 'TargetUser')),
    outcome: toNullableString(pick(item, 'outcome', 'Outcome')),
    comment: toNullableString(pick(item, 'comment', 'Comment')),
    createdAtUtc: toUtcString(pick(item, 'createdAtUtc', 'CreatedAtUtc', 'createdAt', 'CreatedAt')),
  };
}

function normalizeTransparencyEvent(raw: unknown): WorkflowTransparencyEventInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowTransparencyEventInfo),
    actionType: toNullableString(pick(item, 'actionType', 'ActionType')),
    displayLabel: toNullableString(pick(item, 'displayLabel', 'DisplayLabel')),
    actorName: toNullableString(pick(item, 'actorName', 'ActorName')),
    targetUser: toNullableString(pick(item, 'targetUser', 'TargetUser')),
    outcome: toNullableString(pick(item, 'outcome', 'Outcome')),
    comment: toNullableString(pick(item, 'comment', 'Comment')),
    createdAtUtc: toUtcString(pick(item, 'createdAtUtc', 'CreatedAtUtc', 'createdAt', 'CreatedAt')),
  };
}

function normalizeTransparencyStep(raw: unknown): WorkflowTransparencyStepInfo {
  const item = asRecord(raw) || {};
  return {
    ...(item as WorkflowTransparencyStepInfo),
    sequence: toNumberValue(pick(item, 'sequence', 'Sequence')),
    roundIndex: toNumberValue(pick(item, 'roundIndex', 'RoundIndex'), 1),
    isRoundStart: toBooleanValue(pick(item, 'isRoundStart', 'IsRoundStart')),
    roundAnchorId: toNullableString(pick(item, 'roundAnchorId', 'RoundAnchorId')),
    previousRoundAnchorId: toNullableString(pick(item, 'previousRoundAnchorId', 'PreviousRoundAnchorId')),
    nodeId: toNullableString(pick(item, 'nodeId', 'NodeId')),
    nodeLabel: toNullableString(pick(item, 'nodeLabel', 'NodeLabel')),
    nodeType: toNullableString(pick(item, 'nodeType', 'NodeType')),
    status: toNullableString(pick(item, 'status', 'Status')),
    outcome: toNullableString(pick(item, 'outcome', 'Outcome')),
    isCurrent: toBooleanValue(pick(item, 'isCurrent', 'IsCurrent')),
    isOverdue: toBooleanValue(pick(item, 'isOverdue', 'IsOverdue')),
    isApprovalStep: toBooleanValue(pick(item, 'isApprovalStep', 'IsApprovalStep')),
    taskId: toNullableString(pick(item, 'taskId', 'TaskId')),
    assignedTo: toNullableString(pick(item, 'assignedTo', 'AssignedTo')),
    candidateSummary: toNullableString(pick(item, 'candidateSummary', 'CandidateSummary')),
    summary: toNullableString(pick(item, 'summary', 'Summary')),
    comment: toNullableString(pick(item, 'comment', 'Comment')),
    startedAtUtc: toUtcString(pick(item, 'startedAtUtc', 'StartedAtUtc', 'startedAt', 'StartedAt')),
    claimedAtUtc: toUtcString(pick(item, 'claimedAtUtc', 'ClaimedAtUtc', 'claimedAt', 'ClaimedAt')),
    dueAtUtc: toUtcString(pick(item, 'dueAtUtc', 'DueAtUtc', 'dueAt', 'DueAt')),
    completedAtUtc: toUtcString(pick(item, 'completedAtUtc', 'CompletedAtUtc', 'completedAt', 'CompletedAt')),
    maxProcessingHours: toNullableNumber(pick(item, 'maxProcessingHours', 'MaxProcessingHours')),
    events: asArray(pick(item, 'events', 'Events')).map(normalizeTransparencyEvent),
  };
}

function normalizeTransparency(raw: unknown): WorkflowTransparencyInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  return {
    ...(item as WorkflowTransparencyInfo),
    activeNodeId: toNullableString(pick(item, 'activeNodeId', 'ActiveNodeId')),
    activeNodeLabel: toNullableString(pick(item, 'activeNodeLabel', 'ActiveNodeLabel')),
    activeTaskId: toNullableString(pick(item, 'activeTaskId', 'ActiveTaskId')),
    executionStatus: pick(item, 'executionStatus', 'ExecutionStatus') as string | number | null,
    caseStatus: pick(item, 'caseStatus', 'CaseStatus') as string | number | null,
    currentRound: toNumberValue(pick(item, 'currentRound', 'CurrentRound'), 1),
    returnCount: toNumberValue(pick(item, 'returnCount', 'ReturnCount')),
    steps: asArray(pick(item, 'steps', 'Steps')).map(normalizeTransparencyStep),
  };
}

function normalizeWorkflowDetail(raw: unknown): SubmissionWorkflowDetailInfo | null {
  const item = asRecord(raw);
  if (!item) return null;
  const workflow = normalizeWorkflowDefinition(pick(item, 'workflow', 'Workflow'));
  return {
    hasWorkflow: toBooleanValue(pick(item, 'hasWorkflow', 'HasWorkflow'), !!workflow),
    workflow,
    workflowExecution: normalizeWorkflowExecution(pick(item, 'workflowExecution', 'WorkflowExecution')),
    workflowCase: normalizeWorkflowCase(pick(item, 'workflowCase', 'WorkflowCase')),
    workflowTasks: asArray(pick(item, 'workflowTasks', 'WorkflowTasks')).map(normalizeWorkflowTask),
    workflowActions: asArray(pick(item, 'workflowActions', 'WorkflowActions')).map(normalizeWorkflowTaskAction),
    transparency: normalizeTransparency(pick(item, 'transparency', 'Transparency')),
  };
}

function normalizeFieldSnapshot(raw: unknown): SubmissionFieldSnapshot {
  const item = asRecord(raw) || {};
  return {
    ...(item as SubmissionFieldSnapshot),
    key: toStringValue(pick(item, 'key', 'Key', 'fieldKey', 'FieldKey')),
    label: toNullableString(pick(item, 'label', 'Label', 'fieldLabel', 'FieldLabel')) ?? undefined,
    type: toNullableString(pick(item, 'type', 'Type', 'fieldType', 'FieldType')) ?? undefined,
    value: pick(item, 'value', 'Value', 'rawValue', 'RawValue', 'displayValue', 'DisplayValue'),
    displayValue: toNullableString(pick(item, 'displayValue', 'DisplayValue')),
  };
}

export function normalizeSubmissionDetailResponse(raw: unknown): SubmissionDetailInfo {
  const item = asRecord(raw) || {};
  const submission = normalizeSubmissionInfo(pick(item, 'submission', 'Submission') ?? item);
  const values = asRecord(pick(item, 'values', 'Values'))
    ?? parseJsonObject(submission.dataJson)
    ?? {} as SubmissionData;

  return {
    submission,
    form: normalizeFormInfo(pick(item, 'form', 'Form')),
    schema: normalizeFormSchema(pick(item, 'schema', 'Schema')),
    files: asArray(pick(item, 'files', 'Files')).map((entry) => asRecord(entry) || {}),
    values,
    fieldSnapshots: asArray(pick(item, 'fieldSnapshots', 'FieldSnapshots')).map(normalizeFieldSnapshot),
    hasSnapshot: toBooleanValue(pick(item, 'hasSnapshot', 'HasSnapshot')),
    workflowDetail: normalizeWorkflowDetail(pick(item, 'workflowDetail', 'WorkflowDetail')),
  };
}
