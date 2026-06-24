import { h } from '@shared/dom';
import { formatDate, getActionLabel } from './task-detail-shared';
import type { WorkflowInboxTaskAction } from './types';

export function buildTimelineSection(actions: WorkflowInboxTaskAction[]): HTMLElement {
  const section = h('div', { class: 'mf-dnn-section' },
    h('h4', { class: 'mf-dnn-section-title' }, 'Activity Timeline'),
  );
  const list = h('div', { class: 'mf-dnn-history' });
  const sorted = actions.slice().sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  if (!sorted.length) {
    list.appendChild(h('div', { class: 'mf-dnn-empty' }, 'No actions recorded yet for this task.'));
  } else {
    sorted.forEach((item) => {
      list.appendChild(h('div', { class: 'mf-dnn-history-item' },
        h('div', { class: 'mf-dnn-history-title' }, getActionLabel(item.actionType)),
        h('div', { class: 'mf-dnn-history-meta' },
          [
            item.actorDisplayName || item.actorUserName || 'System',
            formatDate(item.createdAt),
            item.targetUser ? `Target: ${item.targetUser}` : '',
            item.outcome ? `Outcome: ${item.outcome}` : '',
          ].filter(Boolean).join(' \u00b7 '),
        ),
        item.comment ? h('div', { class: 'mf-dnn-history-comment' }, item.comment) : h('span'),
      ));
    });
  }

  section.appendChild(list);
  return section;
}
