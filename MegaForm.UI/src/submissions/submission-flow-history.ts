import { h } from '@shared/dom';
import type { SubmissionWorkflowDetailInfo } from '@core/types';
import { buildHistoryRows, normalizeWorkflowLabel, type SubmissionFlowHistoryRow } from './submission-flow-model';

export function renderSubmissionFlowHistory(
  workflowDetail: SubmissionWorkflowDetailInfo,
  selectedNodeId: string,
  onSelectNode: (nodeId: string) => void,
): HTMLElement {
  const rows = buildHistoryRows(workflowDetail);
  const section = h('section', { class: 'mf-subflow-history' });
  section.appendChild(h('div', { class: 'mf-subflow-section-head' },
    h('h5', null, 'Processing History'),
    h('span', null, `${rows.length} entries`),
  ));

  if (!rows.length) {
    section.appendChild(h('div', { class: 'mf-subflow-empty mf-subflow-empty-panel' },
      h('i', { class: 'fas fa-history' }),
      h('div', null,
        h('strong', null, 'No history yet'),
        h('p', null, 'This submission has not produced workflow history entries yet.'),
      ),
    ));
    return section;
  }

  const table = h('table', { class: 'mf-subflow-history-table' });
  table.appendChild(h('thead', null,
    h('tr', null,
      h('th', null, '#'),
      h('th', null, 'Step'),
      h('th', null, 'Action'),
      h('th', null, 'Actor'),
      h('th', null, 'Timestamp'),
      h('th', null, 'Duration'),
      h('th', null, 'Note'),
      h('th', null, 'Status'),
    ),
  ));

  const tbody = h('tbody', null);
  rows.forEach((row) => {
    tbody.appendChild(buildHistoryRow(row, selectedNodeId, onSelectNode));
  });
  table.appendChild(tbody);

  section.appendChild(h('div', { class: 'mf-subflow-history-table-wrap' }, table));
  return section;
}

function buildHistoryRow(
  row: SubmissionFlowHistoryRow,
  selectedNodeId: string,
  onSelectNode: (nodeId: string) => void,
): HTMLElement {
  const nodeId = row.step.nodeId || '';
  const tr = h('tr', { class: `mf-subflow-history-row${nodeId === selectedNodeId ? ' is-selected' : ''}` });

  const stepCell = h('td', null);
  const stepButton = h('button', {
    type: 'button',
    class: 'mf-subflow-history-step-btn',
  },
  h('strong', null, row.step.nodeLabel || row.step.nodeId || `Step ${row.index}`),
  h('span', null, normalizeWorkflowLabel(row.step.nodeType || 'Step')),
  ) as HTMLButtonElement;
  if (nodeId) {
    stepButton.addEventListener('click', () => onSelectNode(nodeId));
  } else {
    stepButton.disabled = true;
  }
  stepCell.appendChild(stepButton);

  tr.appendChild(h('td', null, String(row.index)));
  tr.appendChild(stepCell);
  tr.appendChild(h('td', null, row.actionLabel));
  tr.appendChild(h('td', null, row.actorLabel));
  tr.appendChild(h('td', null, row.timestampLabel));
  tr.appendChild(h('td', null, row.durationLabel));
  tr.appendChild(h('td', { class: 'mf-subflow-history-note' }, row.note));
  tr.appendChild(h('td', null, h('span', { class: `mf-subflow-inline-pill is-${row.statusTone}` }, row.statusLabel)));
  return tr;
}
