import { h } from '@shared/dom';
import { actionButton } from './task-detail-shared';
import type { WorkflowInboxTask } from './types';

export interface WorkflowTaskActionHandlers {
  onClaim(taskId: string, comment: string): void;
  onApprove(taskId: string, comment: string): void;
  onReject(taskId: string, comment: string): void;
  onForward(taskId: string, targetUser: string, comment: string): void;
}

export function buildActionSection(
  task: WorkflowInboxTask,
  canClaim: boolean,
  canComplete: boolean,
  canForward: boolean,
  handlers: WorkflowTaskActionHandlers,
): HTMLElement {
  const section = h('div', { class: 'mf-dnn-section' },
    h('h4', { class: 'mf-dnn-section-title' }, 'Task Actions'),
  );
  const form = h('div', { class: 'mf-dnn-action-form' });
  const comment = h('textarea', {
    id: 'mf-task-comment',
    class: 'mf-dnn-textarea',
    placeholder: 'Add an approval note, rejection reason, or forwarding context...',
  }) as HTMLTextAreaElement;
  const forwardUser = h('input', {
    id: 'mf-task-forward-user',
    class: 'mf-dnn-input',
    type: 'text',
    placeholder: 'Forward to username, email, or user id (for example: mf.sample.approver)',
  }) as HTMLInputElement;

  form.appendChild(comment);
  form.appendChild(forwardUser);
  form.appendChild(h('div', { class: 'mf-dnn-help' },
    `${task.commentRequiredOnReject ? 'This workflow step requires a comment on rejection. ' : ''}You can approve directly, reject with notes, or forward the task to another DNN user.`,
  ));

  const row = h('div', { class: 'mf-dnn-action-row' });
  if (canClaim) {
    row.appendChild(actionButton('mf-dnn-btn', 'fas fa-hand-paper', 'Claim', () => {
      handlers.onClaim(task.taskId, comment.value || '');
    }));
  }
  if (canComplete) {
    row.appendChild(actionButton('mf-dnn-btn mf-dnn-btn-success', 'fas fa-check', 'Approve', () => {
      handlers.onApprove(task.taskId, comment.value || '');
    }));
    row.appendChild(actionButton('mf-dnn-btn mf-dnn-btn-danger', 'fas fa-times', 'Reject', () => {
      const text = comment.value || '';
      if (task.commentRequiredOnReject && !text.replace(/\s+/g, '')) {
        window.alert('This workflow step requires a rejection comment.');
        comment.focus();
        return;
      }
      handlers.onReject(task.taskId, text);
    }));
  }
  if (canForward) {
    row.appendChild(actionButton('mf-dnn-btn mf-dnn-btn-warning', 'fas fa-share', 'Forward', () => {
      if (!forwardUser.value.replace(/\s+/g, '')) {
        window.alert('Enter a username, email, or user id to forward this task.');
        forwardUser.focus();
        return;
      }
      handlers.onForward(task.taskId, forwardUser.value || '', comment.value || '');
    }));
  }

  form.appendChild(row);
  section.appendChild(form);
  return section;
}
