import { clear, h } from '@shared/dom';
import { renderSubmissionFlowCanvas } from './submission-flow-canvas';
import { getInitialSelectedNodeId } from './submission-flow-model';
import { renderSubmissionFlowSidebar } from './submission-flow-sidebar';
import { renderSubmissionFlowInspector } from './submission-flow-inspector';
import { renderSubmissionFlowHistory } from './submission-flow-history';
import { coerceSubmissionDetail } from './submission-detail-utils';

export const SUBMISSION_FLOW_WORKSPACE_BADGE = 'SubmissionFlowWorkspace v20260426-02';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_FLOW_WORKSPACE_BADGE__ = SUBMISSION_FLOW_WORKSPACE_BADGE;
}

export function renderSubmissionFlowTab(submission: any): HTMLElement {
  const detail = coerceSubmissionDetail(submission);
  const workflowDetail = detail.workflowDetail;
  const root = h('div', { class: 'mf-modal-body mf-modal-flow-body' });
  void SUBMISSION_FLOW_WORKSPACE_BADGE;

  if (!workflowDetail?.hasWorkflow) {
    // [DefaultFlowMini v20260601-B10] Even when no workflow is attached, draw
    // the canonical lifecycle (Submitted → Reviewed → Archived) so the user
    // sees something useful instead of a bare "not available" message.
    // Highlights the step matching the submission's status.
    const status = String(detail.submission?.status || 'Submitted').toLowerCase();
    const steps: Array<{ key: string; label: string; icon: string; aliases: string[] }> = [
      { key: 'submitted', label: 'Submitted', icon: 'fa-paper-plane', aliases: ['submitted','new','pending','draft'] },
      { key: 'reviewed',  label: 'Reviewed',  icon: 'fa-eye',         aliases: ['reviewed','read','viewed','in-review'] },
      { key: 'processed', label: 'Processed', icon: 'fa-check',       aliases: ['processed','approved','done','completed'] },
      { key: 'archived',  label: 'Archived',  icon: 'fa-archive',     aliases: ['archived','closed','rejected'] },
    ];
    const activeIdx = Math.max(0, steps.findIndex(s => s.aliases.includes(status)));

    const wrap = h('div', { class: 'mf-subflow-defaultflow' });
    wrap.appendChild(h('div', { class: 'mf-subflow-defaultflow-head' },
      h('strong', null, 'Default lifecycle'),
      h('span', null, 'No custom workflow attached'),
    ));
    const lane = h('div', { class: 'mf-subflow-defaultflow-lane' });
    steps.forEach((s, i) => {
      const cls = i === activeIdx ? 'mf-subflow-defaultflow-node is-active'
                 : i < activeIdx ? 'mf-subflow-defaultflow-node is-done'
                 : 'mf-subflow-defaultflow-node';
      lane.appendChild(h('div', { class: cls },
        h('div', { class: 'mf-subflow-defaultflow-icon' }, h('i', { class: 'fas ' + s.icon })),
        h('div', { class: 'mf-subflow-defaultflow-lbl' }, s.label),
      ));
      if (i < steps.length - 1) {
        lane.appendChild(h('div', { class: 'mf-subflow-defaultflow-edge' + (i < activeIdx ? ' is-done' : '') }));
      }
    });
    wrap.appendChild(lane);
    wrap.appendChild(h('div', { class: 'mf-subflow-defaultflow-hint' },
      h('i', { class: 'fas fa-info-circle' }),
      ' This is the canonical lifecycle. Apply a custom workflow on the form to replace it with branching, approvals, and SLA tracking.',
    ));
    root.appendChild(wrap);
    return root;
  }

  const workspace = h('div', { class: 'mf-subflow-workspace' });
  const top = h('div', { class: 'mf-subflow-top' });
  const main = h('div', { class: 'mf-subflow-main' });
  const side = h('div', { class: 'mf-subflow-side' });
  const sidebarHost = h('div', { class: 'mf-subflow-sidebar-host' });
  const inspectorHost = h('div', { class: 'mf-subflow-inspector-host' });
  const historyHost = h('div', { class: 'mf-subflow-history-host' });

  let selectedNodeId = getInitialSelectedNodeId(workflowDetail);
  const canvas = renderSubmissionFlowCanvas(workflowDetail, {
    selectedNodeId,
    onSelectNode(nodeId) {
      selectedNodeId = nodeId;
      syncPanels();
    },
  });

  main.appendChild(canvas.root);
  side.appendChild(sidebarHost);
  side.appendChild(inspectorHost);
  top.appendChild(main);
  top.appendChild(side);
  workspace.appendChild(top);
  workspace.appendChild(historyHost);
  root.appendChild(workspace);

  syncPanels();
  return root;

  function syncPanels(): void {
    clear(sidebarHost);
    sidebarHost.appendChild(renderSubmissionFlowSidebar(detail, workflowDetail, selectedNodeId));
    sidebarHost.querySelectorAll<HTMLButtonElement>('[data-node-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const nodeId = button.dataset.nodeId || '';
        if (!nodeId) return;
        selectedNodeId = nodeId;
        canvas.setSelectedNode(nodeId);
        syncPanels();
      });
    });

    clear(inspectorHost);
    inspectorHost.appendChild(renderSubmissionFlowInspector(workflowDetail, selectedNodeId));

    clear(historyHost);
    historyHost.appendChild(renderSubmissionFlowHistory(workflowDetail, selectedNodeId, (nodeId) => {
      selectedNodeId = nodeId;
      canvas.setSelectedNode(nodeId);
      syncPanels();
    }));
  }
}
