import { h } from '@shared/dom';
import type { WorkflowInboxTask } from './types';

export function buildInfoCard(label: string, value: string): HTMLElement {
  return h('div', { class: 'mf-dnn-info' },
    h('div', { class: 'mf-dnn-info-label' }, label),
    h('div', { class: 'mf-dnn-info-value' }, value || '\u2014'),
  );
}

export function actionButton(className: string, iconClass: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = h('button', { type: 'button', class: className }, h('i', { class: iconClass }), ` ${label}`) as HTMLButtonElement;
  button.addEventListener('click', onClick);
  return button;
}

export function getStatusLabel(status: number): string {
  switch (status) {
    case 1: return 'Pending';
    case 2: return 'Claimed';
    case 3: return 'Completed';
    case 4: return 'Cancelled';
    default: return 'Unknown';
  }
}

export function getStatusBadgeClass(status: number): string {
  switch (status) {
    case 1: return 'mf-dnn-badge-pending';
    case 2: return 'mf-dnn-badge-claimed';
    case 3: return 'mf-dnn-badge-completed';
    default: return 'mf-dnn-badge-cancelled';
  }
}

export function getActionLabel(actionType: number): string {
  switch (actionType) {
    case 1: return 'Created';
    case 2: return 'Claimed';
    case 3: return 'Approved';
    case 4: return 'Rejected';
    case 5: return 'Forwarded';
    case 6: return 'Commented';
    default: return 'Updated';
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '\u2014';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function isOverdue(task: WorkflowInboxTask): boolean {
  if (!task.dueAt) return false;
  const dueAt = new Date(task.dueAt);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < Date.now() && task.status < 3;
}
