import { h } from '@shared/dom';
import type { SubmissionDetailInfo, SubmissionWorkflowDetailInfo } from '@core/types';
import {
  formatSubmissionCode,
  getCompletedStepCount,
  getNodeContext,
  getOpenTaskCount,
  getReturnSteps,
  getTotalDurationLabel,
  normalizeWorkflowLabel,
  resolveSubmissionActor,
} from './submission-flow-model';
import { formatSubmissionDate } from './submission-detail-utils';

export function renderSubmissionFlowSidebar(
  detail: SubmissionDetailInfo,
  workflowDetail: SubmissionWorkflowDetailInfo,
  selectedNodeId: string,
): HTMLElement {
  const root = h('aside', { class: 'mf-subflow-sidebar' });
  const currentContext = getNodeContext(workflowDetail, workflowDetail.transparency?.activeNodeId || selectedNodeId);
  const selectedContext = getNodeContext(workflowDetail, selectedNodeId);
  const returnSteps = getReturnSteps(workflowDetail);

  root.appendChild(h('section', { class: 'mf-subflow-panel' },
    h('div', { class: 'mf-subflow-panel-head' }, 'Submission Details'),
    buildDetailList([
      ['Submission ID', formatSubmissionCode(detail)],
      ['Form', detail.form?.title || detail.submission.formTitle || `Form #${detail.submission.formId}`],
      ['Submitted By', resolveSubmissionActor(detail)],
      ['Submitted At', formatSubmissionDate(detail.submission.submittedOnUtc) || 'Unknown'],
    ]),
  ));

  root.appendChild(h('section', { class: 'mf-subflow-panel mf-subflow-current-card' },
    h('div', { class: 'mf-subflow-panel-head' }, 'Current Step'),
    h('div', { class: 'mf-subflow-current-title' }, currentContext?.node.label || workflowDetail.transparency?.activeNodeLabel || 'Not active'),
    h('div', { class: 'mf-subflow-current-badges' },
      h('span', { class: 'mf-subflow-inline-pill is-current' }, currentContext?.statusLabel || 'Pending'),
      h('span', { class: 'mf-subflow-inline-pill' }, normalizeWorkflowLabel(detail.submission.status || 'New')),
    ),
    currentContext?.step?.comment ? h('p', { class: 'mf-subflow-current-note' }, currentContext.step.comment) : h('span', null),
  ));

  root.appendChild(h('section', { class: 'mf-subflow-panel mf-subflow-return-card' },
    h('div', { class: 'mf-subflow-panel-head' },
      h('span', null, 'Return Count'),
      h('span', { class: 'mf-subflow-counter' }, String(returnSteps.length)),
    ),
    returnSteps.length
      ? h('div', { class: 'mf-subflow-return-list' },
        ...returnSteps.slice().reverse().map((step) => h('button', {
          type: 'button',
          class: `mf-subflow-return-item${step.nodeId === selectedNodeId ? ' is-selected' : ''}`,
          'data-node-id': step.nodeId || '',
        },
        h('strong', null, `Round ${step.roundIndex || 1}`),
        h('span', null, step.nodeLabel || step.nodeId || 'Workflow step'),
        )),
      )
      : h('p', { class: 'mf-subflow-empty-copy' }, 'This submission has not been returned yet.'),
  ));

  root.appendChild(h('section', { class: 'mf-subflow-stat-grid' },
    buildStatCard(String(getCompletedStepCount(workflowDetail)), 'Steps Completed'),
    buildStatCard(getTotalDurationLabel(workflowDetail, detail.submission.submittedOnUtc), 'Total Duration'),
    buildStatCard(String(getOpenTaskCount(workflowDetail)), 'Open Tasks'),
    buildStatCard(selectedContext?.statusLabel || 'Pending', 'Focused Step'),
  ));

  return root;
}

function buildDetailList(items: Array<[string, string]>): HTMLElement {
  return h('dl', { class: 'mf-subflow-detail-list' },
    ...items.flatMap(([label, value]) => [
      h('dt', null, label),
      h('dd', null, value || 'Unknown'),
    ]),
  );
}

function buildStatCard(value: string, label: string): HTMLElement {
  return h('article', { class: 'mf-subflow-stat-card' },
    h('strong', { class: 'mf-subflow-stat-value' }, value || '0'),
    h('span', { class: 'mf-subflow-stat-label' }, label),
  );
}
