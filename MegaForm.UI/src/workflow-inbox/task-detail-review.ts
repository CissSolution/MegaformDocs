import { h } from '@shared/dom';
import type { SubmissionDetailInfo } from '@core/types';
import { showSubmissionModal } from '../submissions/SubmissionModal';
import { renderSubmissionDetailShell } from '../submissions/submission-detail-shell';
import type { SubmissionWorkflowActionController } from '../submissions/submission-detail-workflow-panel';
import type { WorkflowInboxTask } from './types';

export function buildSubmissionReviewSection(
  submissionDetail: SubmissionDetailInfo | null,
  task: WorkflowInboxTask,
  workflowActions?: SubmissionWorkflowActionController | null,
): HTMLElement {
  const host = h('div', { class: 'mf-dnn-section' });
  const header = h('div', { class: 'mf-dnn-section-head-inline' },
    h('h4', { class: 'mf-dnn-section-title' }, 'Submission Review'),
  );

  if (submissionDetail) {
    const fullButton = h('button', {
      type: 'button',
      class: 'mf-dnn-btn',
    }, h('i', { class: 'fas fa-expand' }), ' Open Fullscreen') as HTMLButtonElement;
    fullButton.addEventListener('click', () => {
      showSubmissionModal(document.body, submissionDetail, null, () => {}, undefined, {
        readOnly: true,
        initialTab: 'flow',
        workflowActions: workflowActions || null,
      });
    });
    header.appendChild(fullButton);
  }

  host.appendChild(header);

  if (!submissionDetail) {
    host.appendChild(h('div', { class: 'mf-dnn-empty' },
      `Submission #${task.submissionId} is linked to this task, but the detailed payload is not available right now.`,
    ));
    return host;
  }

  const shell = renderSubmissionDetailShell({
    submission: submissionDetail,
    readOnly: true,
    initialTab: 'data',
    mode: 'embedded',
    showTypePills: false,
    workflowActions: workflowActions || null,
  });
  const shellHost = h('div', { class: 'mf-dnn-submission-review-shell' });
  shellHost.appendChild(shell.root);
  host.appendChild(shellHost);
  return host;
}
