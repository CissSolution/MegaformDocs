// ============================================================
// Submission Modal Orchestrator
// Uses the shared submission detail shell so hosts can reuse the same
// detail experience inline or inside a fullscreen modal.
// ============================================================

import { h } from '@shared/dom';
import type { PlatformAdapter } from '@core/platform';
import type { SubmissionDetailInfo, SubmissionInfo } from '@core/types';
import { tryGetSubsState } from './state';
import { coerceSubmissionDetail, formatSubmissionDate } from './submission-detail-utils';
import {
  renderSubmissionDetailShell,
  type SubmissionDetailShellTab,
} from './submission-detail-shell';
import type { SubmissionWorkflowActionController } from './submission-detail-workflow-panel';

export const SUBMISSION_DETAIL_MODAL_BADGE = 'SubmissionDetailFlow v20260426-02';

export interface SubmissionModalDisplayOptions {
  initialTab?: SubmissionDetailShellTab;
  readOnly?: boolean;
  workflowActions?: SubmissionWorkflowActionController | null;
}

export function showSubmissionModal(
  parent: HTMLElement,
  submission: SubmissionDetailInfo | SubmissionInfo,
  adapter: PlatformAdapter | null,
  onClose: () => void,
  submissionList?: Array<SubmissionDetailInfo | SubmissionInfo>,
  displayOptions?: SubmissionModalDisplayOptions,
): void {
  parent.querySelector('.mf-modal-overlay')?.remove();

  const detail = coerceSubmissionDetail(submission);
  const state = tryGetSubsState();
  const navList = submissionList || state?.submissions || [];
  const fallbackFields = state?.config.schema?.fields || detail.schema?.fields || [];
  const subId = detail.submission.submissionId;
  const readOnly = !!displayOptions?.readOnly;
  let isExpanded = false;

  const currentIdx = navList.findIndex((item) => {
    const itemDetail = coerceSubmissionDetail(item);
    return itemDetail.submission.submissionId === subId;
  });

  const overlay = h('div', { class: 'mf-modal-overlay' });
  overlay.addEventListener('click', close);

  const modal = h('div', { class: 'mf-modal' });
  modal.addEventListener('click', (event) => event.stopPropagation());
  void SUBMISSION_DETAIL_MODAL_BADGE;

  // Auto-expand layout fn — assigned once the expand button exists (below); the
  // shell calls it on EVERY tab change, button clicks included. No-op until wired.
  let applyFlowLayout: (tab: SubmissionDetailShellTab) => void = () => {};

  const shell = renderSubmissionDetailShell({
    submission: detail,
    adapter: adapter || undefined,
    fallbackFields,
    initialTab: displayOptions?.initialTab || 'data',
    mode: 'modal',
    readOnly,
    onSaved: () => {
      close();
    },
    workflowActions: displayOptions?.workflowActions || null,
    onTabChange: (tab) => applyFlowLayout(tab),
  });

  const printButton = h('button', {
    type: 'button',
    class: 'mf-subs-btn mf-subs-btn-sm',
    title: 'Print form view',
  }, h('i', { class: 'fas fa-print' }), ' Print') as HTMLButtonElement;
  printButton.addEventListener('click', () => {
    if (shell.getTab() !== 'form') {
      shell.setTab('form');
      setTimeout(() => window.print(), 180);
      return;
    }
    window.print();
  });

  const expandButton = h('button', {
    type: 'button',
    class: 'mf-subs-btn mf-subs-btn-sm',
    title: 'Toggle full screen',
  }, h('i', { class: 'fas fa-expand' }), ' Fullscreen') as HTMLButtonElement;
  expandButton.addEventListener('click', () => {
    isExpanded = !isExpanded;
    modal.classList.toggle('mf-modal-expanded', isExpanded);
    expandButton.innerHTML = isExpanded
      ? '<i class="fas fa-compress"></i> Windowed'
      : '<i class="fas fa-expand"></i> Fullscreen';
  });

  modal.appendChild(h('div', { class: 'mf-modal-header' },
    h('h4', null, `Submission #${subId}`),
    h('div', { class: 'mf-modal-header-actions' },
      printButton,
      expandButton,
      h('button', { type: 'button', class: 'mf-modal-close', onclick: close }, '×'),
    ),
  ));

  if (readOnly) {
    modal.appendChild(h('div', { class: 'mf-modal-status-bar' },
      h('span', null, 'Status:'),
      h('strong', { class: 'mf-modal-read-status' }, detail.submission.status || 'Submitted'),
      h('span', { style: 'flex:1' }),
      h('span', { class: 'mf-modal-date' }, formatSubmissionDate(detail.submission.submittedOnUtc)),
    ));
  } else {
    const statusSelect = buildStatusSelect(detail.submission.status || 'Submitted');
    modal.appendChild(h('div', { class: 'mf-modal-status-bar' },
      h('span', null, 'Status:'),
      statusSelect,
      h('button', {
        type: 'button',
        class: 'mf-subs-btn mf-subs-btn-sm',
        onclick: async (event: Event) => {
          event.preventDefault();
          if (!adapter) return;
          try {
            await adapter.api.updateSubmissionStatus(subId, statusSelect.value);
            adapter.showToast('Status updated', 'success');
            close();
            onClose();
          } catch {
            adapter.showToast('Failed', 'error');
          }
        },
      }, 'Save'),
      h('span', { style: 'flex:1' }),
      h('span', { class: 'mf-modal-date' }, formatSubmissionDate(detail.submission.submittedOnUtc)),
    ));
  }

  modal.appendChild(h('div', { class: 'mf-modal-meta' },
    h('span', null, `IP: ${detail.submission.ipAddress || 'N/A'}`),
    h('span', null, `User: ${detail.submission.userId || 'Anonymous'}`),
    detail.workflowDetail?.transparency?.activeNodeLabel
      ? h('span', null, `Current step: ${detail.workflowDetail.transparency.activeNodeLabel}`)
      : h('span', null, 'Current step: —'),
  ));

  modal.appendChild(shell.root);
  modal.appendChild(buildFooter());

  overlay.appendChild(modal);
  parent.appendChild(overlay);
  // [FlowAutoExpand fix 2026-06-12] Widen + expand for the Flow process tab. Wired
  // through the shell's onTabChange so it fires on the internal tab BUTTONS too —
  // the previous shell.setTab override only ran for external calls, never on a
  // click, which is exactly why Flow process rendered cramped in the narrow drawer.
  applyFlowLayout = (tab) => {
    modal.classList.toggle('mf-modal-wide', tab !== 'data');
    if (tab === 'flow' && !isExpanded) {
      isExpanded = true;
      modal.classList.add('mf-modal-expanded');
      expandButton.innerHTML = '<i class="fas fa-compress"></i> Windowed';
    }
  };
  applyFlowLayout(shell.getTab());

  function buildFooter(): HTMLElement {
    const left = h('div', { class: 'mf-modal-footer-left' });
    const right = h('div', { class: 'mf-modal-footer-right' });

    if (navList.length > 1 && currentIdx >= 0) {
      const prevButton = h('button', { type: 'button', class: 'mf-subs-btn mf-subs-btn-sm' }, '← Previous') as HTMLButtonElement;
      const nextButton = h('button', { type: 'button', class: 'mf-subs-btn mf-subs-btn-sm' }, 'Next →') as HTMLButtonElement;
      prevButton.disabled = currentIdx <= 0;
      nextButton.disabled = currentIdx >= navList.length - 1;
      prevButton.addEventListener('click', () => navigateTo(currentIdx - 1));
      nextButton.addEventListener('click', () => navigateTo(currentIdx + 1));
      left.appendChild(prevButton);
      left.appendChild(h('span', { class: 'mf-modal-nav-info' }, `${currentIdx + 1} / ${navList.length}`));
      left.appendChild(nextButton);
    }

    right.appendChild(h('button', { type: 'button', class: 'mf-subs-btn', onclick: close }, 'Close'));
    return h('div', { class: 'mf-modal-footer' }, left, right);
  }

  function navigateTo(index: number): void {
    if (index < 0 || index >= navList.length) return;
    overlay.remove();
    const nextItem = navList[index];
    const nextId = coerceSubmissionDetail(nextItem).submission.submissionId;
    void loadAndShow(nextId, adapter, parent, onClose, navList, displayOptions);
  }

  function close(): void {
    overlay.remove();
    onClose();
  }
}

async function loadAndShow(
  id: number,
  adapter: PlatformAdapter | null,
  parent: HTMLElement,
  onClose: () => void,
  navList: Array<SubmissionDetailInfo | SubmissionInfo>,
  displayOptions?: SubmissionModalDisplayOptions,
): Promise<void> {
  if (!adapter || typeof adapter.api.getSubmissionDetail !== 'function') return;

  try {
    const nextSubmission = await adapter.api.getSubmissionDetail(id);
    showSubmissionModal(parent, nextSubmission, adapter, onClose, navList, displayOptions);
  } catch {
    adapter.showToast('Failed to load submission', 'error');
  }
}

function buildStatusSelect(current: string): HTMLSelectElement {
  const select = h('select', { class: 'mf-modal-status-select' }) as HTMLSelectElement;
  [
    { value: 'Submitted', label: 'New' },
    { value: 'Read', label: 'Processed' },
    { value: 'Starred', label: 'Starred' },
    { value: 'Archived', label: 'Archived' },
  ].forEach((option) => {
    const el = h('option', { value: option.value }, option.label) as HTMLOptionElement;
    if (option.value === current) el.selected = true;
    select.appendChild(el);
  });
  return select;
}
