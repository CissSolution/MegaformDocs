import { clear, h } from '@shared/dom';
import type { SubmissionDetailInfo } from '@core/types';
import { buildSubmissionReviewSection } from './task-detail-review';
import { buildInfoCard, formatDate, getStatusBadgeClass, getStatusLabel, isOverdue } from './task-detail-shared';
import { buildTimelineSection } from './task-detail-timeline';
import type { WorkflowInboxTaskDetail } from './types';
import type { SubmissionWorkflowActionRequest, SubmissionWorkflowActionResult } from '../submissions/submission-detail-workflow-panel';

export interface WorkflowTaskDetailRenderOptions {
  detail: WorkflowInboxTaskDetail | null;
  submissionDetail: SubmissionDetailInfo | null;
  onClaim(taskId: string, comment: string): Promise<void>;
  onApprove(taskId: string, comment: string, data?: Record<string, unknown>): Promise<void>;
  onReject(taskId: string, comment: string, data?: Record<string, unknown>): Promise<void>;
  onForward(taskId: string, targetUser: string, comment: string, data?: Record<string, unknown>): Promise<void>;
  onActionCompleted?(): Promise<void> | void;
}

export function renderTaskDetail(container: HTMLElement, options: WorkflowTaskDetailRenderOptions): void {
  clear(container);

  if (!options.detail) {
    container.appendChild(h('div', { class: 'mf-dnn-empty' },
      'Select a task from the inbox to inspect workflow history and take action.',
    ));
    return;
  }

  const { detail, submissionDetail } = options;
  const task = detail.task;
  const workflowCase = detail.workflowCase;

  container.appendChild(h('div', { class: 'mf-dnn-detail-head' },
    h('div', null,
      h('h3', { class: 'mf-dnn-detail-title' }, task.nodeLabel || task.nodeId || 'Workflow task'),
      h('div', { class: 'mf-dnn-detail-sub' }, `Task #${task.taskId} | Submission #${task.submissionId} | Case #${task.caseId}`),
    ),
    h('span', { class: `mf-dnn-badge ${getStatusBadgeClass(task.status)}` }, getStatusLabel(task.status)),
  ));

  container.appendChild(h('div', { class: 'mf-dnn-grid' },
    buildInfoCard('Assigned To', task.assignedDisplayName || task.assignedUserName || 'Unassigned'),
    buildInfoCard('Candidate Roles', task.candidateRoles.join(', ') || '\u2014'),
    buildInfoCard('Candidate Users', task.candidateUsers.join(', ') || '\u2014'),
    buildInfoCard('Created', formatDate(task.createdAt)),
    buildInfoCard('Claimed', formatDate(task.claimedAt)),
    buildInfoCard('Due', `${formatDate(task.dueAt)}${isOverdue(task) ? ' \u00b7 Over SLA' : ''}`),
    buildInfoCard('Current Node', submissionDetail?.workflowDetail?.transparency?.activeNodeLabel || workflowCase?.currentNodeId || task.nodeLabel || task.nodeId || '\u2014'),
    buildInfoCard('Workflow Outcome', workflowCase?.outcome || task.outcome || 'Waiting'),
    buildInfoCard('Submission Status', submissionDetail?.submission.status || task.pendingSubmissionStatus || '\u2014'),
    buildInfoCard('Submitted', formatDate(submissionDetail?.submission.submittedOnUtc || null)),
  ));

  container.appendChild(buildSubmissionReviewSection(submissionDetail, task, {
    preferredAction: task.status === 1 ? 'claim' : 'approve',
    onAction: async (request: SubmissionWorkflowActionRequest): Promise<SubmissionWorkflowActionResult> => {
      switch (request.action) {
        case 'claim':
          await options.onClaim(request.taskId, request.comment);
          return { ok: true, message: 'Task claimed.' };
        case 'approve':
          await options.onApprove(request.taskId, request.comment, request.data);
          return { ok: true, message: 'Task approved.' };
        case 'reject':
          await options.onReject(request.taskId, request.comment, request.data);
          return { ok: true, message: 'Task rejected.' };
        case 'forward':
          if (!request.targetUser) return { ok: false, message: 'Choose a configured delegate first.' };
          await options.onForward(request.taskId, request.targetUser, request.comment, request.data);
          return { ok: true, message: 'Task forwarded.' };
        default:
          return { ok: false, message: 'Unsupported workflow action.' };
      }
    },
    onActionCompleted: () => options.onActionCompleted?.(),
  }));
  container.appendChild(buildTimelineSection(detail.actions));
}
