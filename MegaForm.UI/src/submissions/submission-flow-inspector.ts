import { h } from '@shared/dom';
import type { SubmissionWorkflowDetailInfo, WorkflowTaskInfo } from '@core/types';
import { formatSubmissionDate } from './submission-detail-utils';
import { formatTaskStatusLabel, getNodeContext, normalizeWorkflowLabel } from './submission-flow-model';

export function renderSubmissionFlowInspector(
  workflowDetail: SubmissionWorkflowDetailInfo,
  selectedNodeId: string,
): HTMLElement {
  const root = h('aside', { class: 'mf-subflow-panel mf-subflow-inspector' });
  const context = getNodeContext(workflowDetail, selectedNodeId);

  if (!context) {
    root.appendChild(buildEmptyState('Select a workflow step', 'Click a node on the canvas or a history row to inspect its state.'));
    return root;
  }

  root.appendChild(h('div', { class: 'mf-subflow-panel-head' }, 'Step Inspector'));
  root.appendChild(h('div', { class: 'mf-subflow-inspector-title' }, context.node.label || context.node.id || 'Workflow node'));
  root.appendChild(h('div', { class: 'mf-subflow-inspector-subtitle' }, normalizeWorkflowLabel(context.node.type || 'Step')));
  root.appendChild(h('div', { class: 'mf-subflow-current-badges' },
    h('span', { class: `mf-subflow-inline-pill is-${context.state}` }, context.statusLabel),
    context.step?.outcome ? h('span', { class: 'mf-subflow-inline-pill' }, normalizeWorkflowLabel(context.step.outcome)) : h('span', null),
  ));

  root.appendChild(buildInspectorSection('General', [
    ['Node ID', context.node.id || 'Unknown'],
    ['Assigned', context.primaryTask?.assignedDisplayName || context.primaryTask?.assignedUserName || context.step?.assignedTo || 'Unassigned'],
    ['Candidate Roles', formatList(context.primaryTask?.candidateRoles || [])],
    ['Candidate Users', formatList(context.primaryTask?.candidateUsers || [])],
    ['Started', formatSubmissionDate(context.step?.startedAtUtc) || 'Not started'],
    ['Due', formatSubmissionDate(context.primaryTask?.dueAtUtc || context.step?.dueAtUtc) || 'No deadline'],
    ['Completed', formatSubmissionDate(context.step?.completedAtUtc) || 'Open'],
  ]));

  if (context.step?.comment || context.step?.summary || context.step?.candidateSummary) {
    root.appendChild(buildTextSection('Latest Note', context.step?.comment || context.step?.summary || context.step?.candidateSummary || ''));
  }

  root.appendChild(buildTaskSection(context.tasks));

  if ((context.step?.events || []).length > 0) {
    root.appendChild(h('section', { class: 'mf-subflow-panel-section' },
      h('div', { class: 'mf-subflow-panel-subhead' }, `Events (${context.step?.events.length || 0})`),
      h('div', { class: 'mf-subflow-mini-events' },
        ...(context.step?.events || []).slice().reverse().slice(0, 5).map((event) => h('article', { class: 'mf-subflow-mini-event' },
          h('div', { class: 'mf-subflow-mini-event-head' },
            h('strong', null, event.displayLabel || normalizeWorkflowLabel(event.actionType || 'Event')),
            h('span', null, formatSubmissionDate(event.createdAtUtc) || 'Unknown'),
          ),
          h('div', { class: 'mf-subflow-mini-event-meta' },
            [event.actorName, event.targetUser, event.outcome].filter(Boolean).join(' | ') || 'System action',
          ),
          event.comment ? h('div', { class: 'mf-subflow-mini-event-note' }, event.comment) : h('span', null),
        )),
      ),
    ));
  }

  return root;
}

function buildInspectorSection(title: string, rows: Array<[string, string]>): HTMLElement {
  return h('section', { class: 'mf-subflow-panel-section' },
    h('div', { class: 'mf-subflow-panel-subhead' }, title),
    h('dl', { class: 'mf-subflow-detail-list is-compact' },
      ...rows.flatMap(([label, value]) => [
        h('dt', null, label),
        h('dd', null, value || 'Unknown'),
      ]),
    ),
  );
}

function buildTextSection(title: string, value: string): HTMLElement {
  return h('section', { class: 'mf-subflow-panel-section' },
    h('div', { class: 'mf-subflow-panel-subhead' }, title),
    h('div', { class: 'mf-subflow-note-box' }, value),
  );
}

function buildTaskSection(tasks: WorkflowTaskInfo[]): HTMLElement {
  return h('section', { class: 'mf-subflow-panel-section' },
    h('div', { class: 'mf-subflow-panel-subhead' }, `Tasks (${tasks.length})`),
    tasks.length
      ? h('div', { class: 'mf-subflow-mini-tasks' },
        ...tasks.map((task) => h('article', { class: 'mf-subflow-mini-task' },
          h('div', { class: 'mf-subflow-mini-task-head' },
            h('strong', null, task.nodeLabel || task.nodeId || 'Workflow task'),
            h('span', { class: 'mf-subflow-inline-pill' }, formatTaskStatusLabel(task.status)),
          ),
          h('div', { class: 'mf-subflow-mini-task-meta' }, task.assignedDisplayName || task.assignedUserName || 'Unassigned'),
          h('div', { class: 'mf-subflow-mini-task-meta' }, task.dueAtUtc ? `Due ${formatSubmissionDate(task.dueAtUtc)}` : 'No due date'),
        )),
      )
      : buildEmptyState('No task records', 'This step does not have task instances yet.'),
  );
}

function buildEmptyState(title: string, body: string): HTMLElement {
  return h('div', { class: 'mf-subflow-empty mf-subflow-empty-panel' },
    h('i', { class: 'fas fa-info-circle' }),
    h('div', null,
      h('strong', null, title),
      h('p', null, body),
    ),
  );
}

function formatList(values: string[]): string {
  const clean = values.filter(Boolean);
  return clean.length ? clean.join(', ') : 'None';
}
