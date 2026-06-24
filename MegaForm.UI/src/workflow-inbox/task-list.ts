import { clear, h } from '@shared/dom';
import type { WorkflowInboxTask } from './types';

export function renderTaskList(
  container: HTMLElement,
  tasks: WorkflowInboxTask[],
  selectedTaskId: string,
  kind: 'my' | 'role',
  onSelect: (taskId: string) => void,
): void {
  clear(container);

  if (!tasks.length) {
    container.appendChild(h('div', { class: 'mf-dnn-empty' },
      kind === 'my'
        ? 'No assigned tasks are waiting for you right now.'
        : 'No claimable tasks are waiting in your roles right now.',
    ));
    return;
  }

  tasks.forEach((task) => {
    const item = h('button', {
      type: 'button',
      class: `mf-dnn-task-item${selectedTaskId === task.taskId ? ' is-selected' : ''}`,
    }) as HTMLButtonElement;
    item.appendChild(h('div', { class: 'mf-dnn-task-item-top' },
      h('div', null,
        h('div', { class: 'mf-dnn-task-item-title' }, task.nodeLabel || task.nodeId || 'Workflow task'),
        h('div', { class: 'mf-dnn-task-item-form' }, `Submission #${task.submissionId} / Form #${task.formId}`),
      ),
      h('span', { class: `mf-dnn-badge ${getStatusBadgeClass(task.status)}` }, getStatusLabel(task.status)),
    ));
    item.appendChild(h('div', { class: 'mf-dnn-task-item-meta' },
      h('span', null, h('i', { class: 'fas fa-user' }), ` ${task.assignedDisplayName || task.assignedUserName || 'Unassigned'}`),
      h('span', null, h('i', { class: 'fas fa-calendar-alt' }), ` ${task.dueAt ? `Due ${formatDate(task.dueAt)}` : 'No SLA deadline'}`),
      isOverdue(task) ? h('span', { class: 'mf-dnn-overdue' }, h('i', { class: 'fas fa-exclamation-triangle' }), ' Over SLA') : h('span'),
    ));
    item.addEventListener('click', () => onSelect(task.taskId));
    container.appendChild(item);
  });
}

function formatDate(value?: string | null): string {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getStatusLabel(status: number): string {
  switch (status) {
    case 1: return 'Pending';
    case 2: return 'Claimed';
    case 3: return 'Completed';
    case 4: return 'Cancelled';
    default: return 'Unknown';
  }
}

function getStatusBadgeClass(status: number): string {
  switch (status) {
    case 1: return 'mf-dnn-badge-pending';
    case 2: return 'mf-dnn-badge-claimed';
    case 3: return 'mf-dnn-badge-completed';
    default: return 'mf-dnn-badge-cancelled';
  }
}

function isOverdue(task: WorkflowInboxTask): boolean {
  if (!task.dueAt) return false;
  const dueAt = new Date(task.dueAt);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now() && task.status < 3;
}
