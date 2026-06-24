import { h } from '@shared/dom';
import type { PlatformAdapter } from '@core/platform';
import type { FormField, SubmissionDetailInfo, SubmissionInfo } from '@core/types';
import { renderSubmissionDataTab } from './submission-detail-data-tab';
import { renderSubmissionFormTab } from './submission-detail-form-tab';
import { renderSubmissionFlowTab } from './submission-detail-flow-tab';
import { renderSubmissionActivityTimeline } from './submission-activity-timeline';
import { renderSubmissionDbTab } from './submission-detail-db-tab';
import { coerceSubmissionDetail } from './submission-detail-utils';
import {
  renderSubmissionWorkflowPanel,
  type SubmissionWorkflowActionController,
} from './submission-detail-workflow-panel';

export const SUBMISSION_DETAIL_SHELL_BADGE = 'SubmissionDetailShell v20260601-DbViewIdFix';

export type SubmissionDetailShellTab = 'data' | 'form' | 'db' | 'flow' | 'activity';

export interface SubmissionDetailShellOptions {
  submission: SubmissionDetailInfo | SubmissionInfo;
  adapter?: PlatformAdapter;
  fallbackFields?: FormField[];
  initialTab?: SubmissionDetailShellTab;
  mode?: 'modal' | 'embedded';
  readOnly?: boolean;
  showTypePills?: boolean;
  onSaved?: () => void;
  workflowActions?: SubmissionWorkflowActionController | null;
  // [FlowAutoExpand fix 2026-06-12] Fired on EVERY tab change, incl. clicks on
  // the internal tab buttons. The modal uses this to widen/expand for the Flow
  // process tab. Previously the modal overrode handle.setTab, but the buttons
  // call the local setTab closure directly, so the override never ran on clicks.
  onTabChange?: (tab: SubmissionDetailShellTab) => void;
}

export interface SubmissionDetailShellHandle {
  root: HTMLElement;
  getTab(): SubmissionDetailShellTab;
  setTab(tab: SubmissionDetailShellTab): void;
}

export function renderSubmissionDetailShell(options: SubmissionDetailShellOptions): SubmissionDetailShellHandle {
  const detail = coerceSubmissionDetail(options.submission);
  const fallbackFields = options.fallbackFields || [];
  const initialTab = options.initialTab || 'data';
  const readOnly = !!options.readOnly;
  const showTypePills = options.showTypePills ?? options.mode !== 'modal';
  let activeTab: SubmissionDetailShellTab = initialTab;

  const root = h('div', {
    class: `mf-subdetail-shell${options.mode === 'embedded' ? ' is-embedded' : ''}`,
  });
  void SUBMISSION_DETAIL_SHELL_BADGE;

  const workflowPanel = renderSubmissionWorkflowPanel(detail, options.workflowActions || null);
  if (workflowPanel) root.appendChild(workflowPanel);

  // [SubmissionDetailShell v20260507-19] Tabs use Lucide-style icons + label
  // pairs. "Flow Canvas" renamed to "Flow process" to better describe what
  // it shows (the actual workflow/processing pipeline for this submission).
  const tabBar = h('div', { class: 'mf-modal-tabs' });
  const dataButton = buildTabButton('Data View', 'database', () => setTab('data'));
  const formButton = buildTabButton('Form View', 'fileText', () => setTab('form'));
  const dbButton   = buildTabButton('DB View', 'serverDb', () => setTab('db'));
  const flowButton = buildTabButton('Flow process', 'workflow', () => setTab('flow'));
  const activityButton = buildTabButton('Activity', 'history', () => setTab('activity'));
  tabBar.appendChild(dataButton);
  tabBar.appendChild(formButton);
  tabBar.appendChild(dbButton);
  tabBar.appendChild(flowButton);
  tabBar.appendChild(activityButton);
  root.appendChild(tabBar);

  const dataView = renderSubmissionDataTab({
    submission: detail,
    adapter: options.adapter,
    fallbackFields,
    onSaved: options.onSaved,
    readOnly,
    showTypePills,
  });
  const formView = renderSubmissionFormTab(detail, fallbackFields);
  // [DbViewIdFix v20260601-06] The DNN Submission/Get endpoint returns four
  // shapes depending on which controller serialised the payload:
  //   1. { submission: { submissionId } }            (camelCase wrapper)
  //   2. { Submission: { SubmissionId } }            (PascalCase wrapper)
  //   3. { submissionId }                            (flat camelCase)
  //   4. { SubmissionId }                            (flat PascalCase)
  // coerceSubmissionDetail only recognises shape 1+3, so shape 2+4 ended up
  // with detail.submission = the outer wrapper and `.submissionId = undefined`.
  // Walk every common casing here so the DB tab actually gets a real id.
  const sid = extractSubmissionId(options.submission, detail);
  const dbView   = renderSubmissionDbTab(sid);
  const flowView = renderSubmissionFlowTab(detail);
  const activityView = renderSubmissionActivityTimeline(detail);
  root.appendChild(dataView);
  root.appendChild(formView);
  root.appendChild(dbView);
  root.appendChild(flowView);
  root.appendChild(activityView);

  setTab(initialTab);

  return {
    root,
    getTab: () => activeTab,
    setTab,
  };

  function setTab(nextTab: SubmissionDetailShellTab): void {
    activeTab = nextTab;
    dataView.style.display = nextTab === 'data' ? '' : 'none';
    formView.style.display = nextTab === 'form' ? '' : 'none';
    dbView.style.display   = nextTab === 'db'   ? '' : 'none';
    flowView.style.display = nextTab === 'flow' ? '' : 'none';
    activityView.style.display = nextTab === 'activity' ? '' : 'none';
    dataButton.classList.toggle('active', nextTab === 'data');
    formButton.classList.toggle('active', nextTab === 'form');
    dbButton.classList.toggle('active',   nextTab === 'db');
    flowButton.classList.toggle('active', nextTab === 'flow');
    activityButton.classList.toggle('active', nextTab === 'activity');
    // Notify the host (e.g. the modal's auto-expand) on every change, clicks included.
    options.onTabChange?.(nextTab);
  }
}

const TAB_ICONS: Record<string, string> = {
  database: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>',
  fileText: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" x2="16" y1="13" y2="13"/><line x1="8" x2="16" y1="17" y2="17"/></svg>',
  workflow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h7a2 2 0 0 1 2 2v7"/><path d="m15 12-3-3 3-3"/></svg>',
  history: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  serverDb: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>',
};

function buildTabButton(label: string, iconKey: string, onClick: () => void): HTMLButtonElement {
  const icon = TAB_ICONS[iconKey] || '';
  const button = h('button', { type: 'button', class: 'mf-modal-tab' }) as HTMLButtonElement;
  button.innerHTML = '<span class="mf-modal-tab-ic" style="display:inline-flex;margin-right:6px;vertical-align:-2px">' + icon + '</span>' + label;
  button.addEventListener('click', onClick);
  return button;
}

// [DbViewIdFix v20260601-06] Walk every common shape a submission detail
// payload can take across DNN + Oqtane and the four serializer variants:
//   coerced.submission.submissionId  · coerced.submission.SubmissionId
//   raw.submission.submissionId      · raw.submission.SubmissionId
//   raw.Submission.SubmissionId      · raw.Submission.submissionId
//   raw.submissionId                 · raw.SubmissionId
// Returns 0 if nothing parses to a positive int.
function extractSubmissionId(raw: any, coerced: any): number {
  const cands: any[] = [
    coerced?.submission?.submissionId,
    coerced?.submission?.SubmissionId,
    raw?.submission?.submissionId,
    raw?.submission?.SubmissionId,
    raw?.Submission?.SubmissionId,
    raw?.Submission?.submissionId,
    raw?.submissionId,
    raw?.SubmissionId,
  ];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}
