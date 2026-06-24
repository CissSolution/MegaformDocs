import { clear, h } from '@shared/dom';
import type {
  SubmissionWorkflowDetailInfo,
  WorkflowEdgeInfo,
  WorkflowNodeInfo,
  WorkflowPositionInfo,
} from '@core/types';
import { NODE_META } from '../builder/workflow/wf-meta';
import {
  getNodeContext,
  getNodeStatusLabel,
  getOpenTaskCount,
  normalizeWorkflowLabel,
  type SubmissionFlowNodeState,
} from './submission-flow-model';

export const SUBMISSION_FLOW_CANVAS_BADGE = 'SubmissionFlowCanvas v20260426-02';

export interface SubmissionFlowCanvasOptions {
  selectedNodeId?: string;
  onSelectNode?(nodeId: string): void;
}

export interface SubmissionFlowCanvasHandle {
  root: HTMLElement;
  getSelectedNodeId(): string;
  setSelectedNode(nodeId: string): void;
}

interface PositionedNode {
  node: WorkflowNodeInfo;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NodeLayout {
  items: PositionedNode[];
  width: number;
  height: number;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 76;
const CANVAS_PADDING = 56;
const GRID_GAP_X = 88;
const GRID_GAP_Y = 76;

export function renderSubmissionFlowCanvas(
  detail: SubmissionWorkflowDetailInfo,
  options: SubmissionFlowCanvasOptions = {},
): SubmissionFlowCanvasHandle {
  const selectedFromOptions = options.selectedNodeId || detail.transparency?.activeNodeId || detail.workflow?.nodes?.[0]?.id || '';
  let selectedNodeId = selectedFromOptions;
  const layout = buildNodeLayout(detail.workflow?.nodes || []);

  const root = h('section', { class: 'mf-subflow-canvas-card' });

  // [SubflowFullscreen v20260516-12] Toggle expand/collapse for the BPMN canvas
  // so users aren't stuck reading the flow inside a 540px-tall box.
  const fsBtn = h('button', { class: 'mf-subflow-fs-btn', type: 'button', title: 'Toggle full screen' }, '⛶ Fullscreen');
  fsBtn.addEventListener('click', () => {
    const expanded = root.classList.toggle('is-fullscreen');
    fsBtn.textContent = expanded ? '✕ Close' : '⛶ Fullscreen';
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && root.classList.contains('is-fullscreen')) {
      root.classList.remove('is-fullscreen');
      fsBtn.textContent = '⛶ Fullscreen';
    }
  });
  root.appendChild(fsBtn);

  const head = h('div', { class: 'mf-subflow-canvas-head' });
  const titleWrap = h('div', { class: 'mf-subflow-canvas-title-wrap' });
  titleWrap.appendChild(h('h5', { class: 'mf-subflow-canvas-title' }, detail.workflow?.name || 'Workflow Canvas'));
  titleWrap.appendChild(h(
    'div',
    { class: 'mf-subflow-canvas-subtitle' },
    `Current step: ${detail.transparency?.activeNodeLabel || detail.workflowCase?.currentNodeId || 'Not active'} | Open tasks: ${getOpenTaskCount(detail)}`,
  ));
  head.appendChild(titleWrap);
  head.appendChild(buildLegend());
  root.appendChild(head);

  const surface = h('div', { class: 'mf-rf-canvas mf-subflow-rf-canvas' });
  surface.appendChild(buildZones());
  const wrap = h('div', { class: 'mf-subflow-rf-stage-wrap' });
  const stage = h('div', { class: 'mf-subflow-rf-stage' });
  wrap.appendChild(stage);
  surface.appendChild(wrap);
  root.appendChild(surface);

  renderStage();

  return {
    root,
    getSelectedNodeId: () => selectedNodeId,
    setSelectedNode(nodeId: string) {
      applySelection(nodeId, false);
    },
  };

  function applySelection(nodeId: string, notify: boolean): void {
    if (!nodeId) return;
    selectedNodeId = nodeId;
    renderStage();
    scrollSelectedNodeIntoView();
    if (notify) options.onSelectNode?.(nodeId);
  }

  function renderStage(): void {
    clear(stage);
    stage.style.width = `${Math.max(layout.width, 840)}px`;
    stage.style.height = `${Math.max(layout.height, 460)}px`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'mf-subflow-rf-svg');
    svg.setAttribute('viewBox', `0 0 ${Math.max(layout.width, 840)} ${Math.max(layout.height, 460)}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    (detail.workflow?.edges || []).forEach((edge) => {
      const edgeEl = buildEdge(edge, layout.items);
      if (edgeEl) svg.appendChild(edgeEl);
    });

    stage.appendChild(svg);
    layout.items.forEach((item) => {
      stage.appendChild(buildNodeCard(item));
    });
  }

  function buildNodeCard(item: PositionedNode): HTMLElement {
    const context = getNodeContext(detail, item.node.id);
    const state = context?.state || 'pending';
    const statusLabel = context?.statusLabel || getNodeStatusLabel(detail.transparency, null, state);
    const meta = resolveNodeMeta(item.node.type);
    const hasOpenTask = !!context?.tasks?.some((task) => Number(task.status) === 1 || Number(task.status) === 2 || String(task.status || '').toLowerCase().includes('pending') || String(task.status || '').toLowerCase().includes('claim'));
    const isCurrent = detail.transparency?.activeNodeId === item.node.id || !!context?.step?.isCurrent;
    const isSelected = item.node.id === selectedNodeId;
    const isStart = isStartNode(detail, item.node.id);
    const candidateSummary = context?.primaryTask?.assignedDisplayName
      || context?.primaryTask?.assignedUserName
      || context?.step?.assignedTo
      || context?.step?.candidateSummary
      || statusLabel;

    const card = h('button', {
      type: 'button',
      class: [
        'mf-rf-node',
        'mf-subflow-rf-node',
        isSelected ? 'mf-rf-node--sel' : '',
        isCurrent ? 'mf-rf-node--sub-current mf-rf-node--traced' : '',
        state !== 'pending' ? `mf-rf-node--sub-${state}` : '',
      ].filter(Boolean).join(' '),
      title: `${item.node.label || item.node.id} | ${statusLabel}`,
      'data-node-id': item.node.id,
    }) as HTMLButtonElement;
    card.style.left = `${item.x}px`;
    card.style.top = `${item.y}px`;
    card.style.width = `${item.width}px`;
    card.style.minHeight = `${item.height}px`;
    card.addEventListener('click', () => applySelection(item.node.id, true));

    card.appendChild(h('span', { class: 'mf-rf-node__accent', style: `background:${meta.accent}` }));
    if (isStart) {
      card.appendChild(h('span', { class: 'mf-rf-node__start-badge' }, 'START'));
    }
    card.appendChild(h('span', { class: `mf-rf-node__status ${statusClassForState(state)}` }));
    if (isCurrent) {
      card.appendChild(h('span', { class: 'mf-subflow-rf-node-pill' }, 'Current'));
    }

    const body = h('div', { class: 'mf-rf-node__body' });
    body.appendChild(h('span', {
      class: 'mf-rf-node__icon-wrap',
      style: `background:${alpha(meta.accent, 0.12)}`,
    }, h('span', { class: 'mf-rf-node__icon' }, meta.icon || '•')));

    const info = h('div', { class: 'mf-rf-node__info' });
    info.appendChild(h('span', { class: 'mf-rf-node__label', title: item.node.label || item.node.id || 'Workflow node' }, item.node.label || item.node.id || 'Workflow node'));
    info.appendChild(h('span', { class: 'mf-rf-node__type' }, meta.label || normalizeWorkflowLabel(item.node.type || 'Step')));
    info.appendChild(h('span', { class: 'mf-subflow-rf-node-caption' }, candidateSummary));
    body.appendChild(info);
    card.appendChild(body);

    if (hasOpenTask) {
      card.appendChild(h('span', { class: 'mf-subflow-rf-node-open' }, 'Open'));
    }

    card.appendChild(h('span', { class: 'mf-rf-handle mf-rf-handle--in mf-subflow-rf-handle' }));
    if (isBranchingNode(item.node.type)) {
      card.appendChild(h('span', { class: 'mf-rf-handle mf-rf-handle--approved mf-subflow-rf-handle mf-subflow-rf-handle--bottom mf-subflow-rf-handle--left' }));
      card.appendChild(h('span', { class: 'mf-rf-handle mf-rf-handle--rejected mf-subflow-rf-handle mf-subflow-rf-handle--bottom mf-subflow-rf-handle--right' }));
    } else {
      card.appendChild(h('span', { class: 'mf-rf-handle mf-rf-handle--out mf-subflow-rf-handle mf-subflow-rf-handle--out' }));
    }

    return card;
  }

  function scrollSelectedNodeIntoView(): void {
    const target = stage.querySelector<HTMLElement>(`[data-node-id="${cssEscape(selectedNodeId)}"]`);
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function buildZones(): HTMLElement {
  return h('div', { class: 'mf-rf-zones' },
    h('div', { class: 'mf-rf-zone mf-rf-zone--nav' }, h('span', { class: 'mf-rf-zone__label mf-rf-zone__label--nav' }, 'Navigation Zone')),
    h('div', { class: 'mf-rf-zone mf-rf-zone--action' }, h('span', { class: 'mf-rf-zone__label mf-rf-zone__label--action' }, 'Action Zone')),
  );
}

function buildLegend(): HTMLElement {
  return h('div', { class: 'mf-subflow-legend' },
    buildLegendItem('Current', 'current'),
    buildLegendItem('Completed', 'completed'),
    buildLegendItem('Returned', 'returned'),
    buildLegendItem('Rejected', 'rejected'),
    buildLegendItem('Over SLA', 'overdue'),
  );
}

function buildLegendItem(label: string, tone: SubmissionFlowNodeState): HTMLElement {
  return h('span', { class: `mf-subflow-legend-item is-${tone}` },
    h('i', { class: 'mf-subflow-legend-dot' }),
    label,
  );
}

function buildNodeLayout(nodes: WorkflowNodeInfo[]): NodeLayout {
  if (!nodes.length) return { items: [], width: 0, height: 0 };

  const rawPositions = nodes.map((node, index) => {
    const pos = readNodePosition(node, index);
    return {
      node,
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    };
  });

  const minX = Math.min(...rawPositions.map((item) => item.x));
  const minY = Math.min(...rawPositions.map((item) => item.y));
  const offsetX = CANVAS_PADDING - minX;
  const offsetY = CANVAS_PADDING - minY;

  const items = rawPositions.map((item) => ({
    ...item,
    x: item.x + offsetX,
    y: item.y + offsetY,
  }));

  const width = Math.max(...items.map((item) => item.x + item.width)) + CANVAS_PADDING;
  const height = Math.max(...items.map((item) => item.y + item.height)) + CANVAS_PADDING;
  return { items, width, height };
}

function buildEdge(edge: WorkflowEdgeInfo, items: PositionedNode[]): SVGGElement | null {
  const source = items.find((item) => item.node.id === edge.sourceNodeId);
  const target = items.find((item) => item.node.id === edge.targetNodeId);
  if (!source || !target) return null;

  const { startX, startY, endX, endY, controlX1, controlY1, controlX2, controlY2 } = describeEdgePath(source, target);
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', `mf-subflow-rf-edge-group ${edgeToneClass(edge.label)}`);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'mf-subflow-rf-edge');
  path.setAttribute('d', `M ${startX} ${startY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${endX} ${endY}`);
  group.appendChild(path);

  if (edge.label) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'mf-subflow-rf-edge-label');
    text.setAttribute('x', `${(startX + endX) / 2}`);
    text.setAttribute('y', `${(startY + endY) / 2 - 8}`);
    text.textContent = normalizeWorkflowLabel(edge.label);
    group.appendChild(text);
  }

  return group;
}

function describeEdgePath(source: PositionedNode, target: PositionedNode) {
  const sourceCenterX = source.x + source.width / 2;
  const sourceCenterY = source.y + source.height / 2;
  const targetCenterX = target.x + target.width / 2;
  const targetCenterY = target.y + target.height / 2;
  const deltaX = targetCenterX - sourceCenterX;
  const deltaY = targetCenterY - sourceCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const startX = deltaX >= 0 ? source.x + source.width : source.x;
    const endX = deltaX >= 0 ? target.x : target.x + target.width;
    const startY = sourceCenterY;
    const endY = targetCenterY;
    const bend = Math.max(42, Math.abs(deltaX) * 0.32);
    return {
      startX,
      startY,
      endX,
      endY,
      controlX1: startX + (deltaX >= 0 ? bend : -bend),
      controlY1: startY,
      controlX2: endX - (deltaX >= 0 ? bend : -bend),
      controlY2: endY,
    };
  }

  const startX = sourceCenterX;
  const endX = targetCenterX;
  const startY = deltaY >= 0 ? source.y + source.height : source.y;
  const endY = deltaY >= 0 ? target.y : target.y + target.height;
  const bend = Math.max(42, Math.abs(deltaY) * 0.32);
  return {
    startX,
    startY,
    endX,
    endY,
    controlX1: startX,
    controlY1: startY + (deltaY >= 0 ? bend : -bend),
    controlX2: endX,
    controlY2: endY - (deltaY >= 0 ? bend : -bend),
  };
}

function readNodePosition(node: WorkflowNodeInfo, index: number): WorkflowPositionInfo {
  const pos = node.position || (node as any).Position || ((node.config as any)?.position || null);
  const x = Number((pos as any)?.x);
  const y = Number((pos as any)?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }

  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: column * (NODE_WIDTH + GRID_GAP_X),
    y: row * (NODE_HEIGHT + GRID_GAP_Y),
  };
}

function resolveNodeMeta(type: string | null | undefined): { icon: string; label: string; accent: string } {
  const meta = (NODE_META as Record<string, any>)[String(type || '')] || (NODE_META as Record<string, any>).FormField || {};
  return {
    icon: String(meta.icon || '•'),
    label: String(meta.label || normalizeWorkflowLabel(type || 'Step') || 'Step'),
    accent: String(meta.accent || '#6366f1'),
  };
}

function edgeToneClass(label?: string | null): string {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('approve') || normalized.includes('yes') || normalized.includes('success')) return 'is-positive';
  if (normalized.includes('reject') || normalized.includes('no') || normalized.includes('fail')) return 'is-negative';
  if (normalized.includes('return')) return 'is-return';
  return 'is-neutral';
}

function isBranchingNode(type: string | null | undefined): boolean {
  const value = String(type || '').toLowerCase();
  return value === 'condition' || value === 'approval' || value === 'switch' || value === 'filter';
}

function isStartNode(detail: SubmissionWorkflowDetailInfo, nodeId: string): boolean {
  const explicit = String(detail.workflow?.startNodeId || '').trim();
  if (explicit) return explicit === nodeId;
  const targeted = new Set((detail.workflow?.edges || []).map((edge) => edge.targetNodeId));
  return !targeted.has(nodeId);
}

function statusClassForState(state: SubmissionFlowNodeState): string {
  switch (state) {
    case 'completed':
      return 'mf-rf-node__status--ok';
    case 'returned':
    case 'overdue':
      return 'mf-rf-node__status--warn';
    case 'rejected':
      return 'mf-rf-node__status--err';
    default:
      return 'mf-rf-node__status--pending';
  }
}

function alpha(color: string, opacity: number): string {
  const hex = color.replace('#', '').trim();
  if (hex.length !== 6) return color;
  const channel = (value: string) => Number.parseInt(value, 16);
  const r = channel(hex.slice(0, 2));
  const g = channel(hex.slice(2, 4));
  const b = channel(hex.slice(4, 6));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function cssEscape(value: string): string {
  return String(value || '').replace(/["\\]/g, '\\$&');
}
