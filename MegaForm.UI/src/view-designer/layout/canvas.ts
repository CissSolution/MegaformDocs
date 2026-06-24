/**
 * Layout Designer — canvas with Sortable.js drop zones + live preview.
 *
 * The canvas renders 4 zones (header / rows / pager / empty). Each zone is
 * a Sortable.js drop target accepting blocks dragged from the tray (which
 * is a separate Sortable group). Drops within a zone reorder blocks; drops
 * from the tray clone the BlockDef into a new BlockInstance.
 *
 * Block bodies render the snippet HTML with mock tokens resolved so the
 * admin sees realistic output. The rows zone repeats the snippet for each
 * mock row (capped at 3 to keep the canvas usable).
 *
 * Selection is single-block; clicking a block highlights it and triggers
 * the inspector pane in layout-designer.ts via onSelect.
 */

import { findBlock } from './catalog';
import { resolveTokens } from './mock-data';
import { newBlockInstance } from './split-sync';
import type {
  BlockInstance,
  DesignerState,
  LayoutZone,
  LayoutZoneId,
} from './types';

declare var Sortable: any;

const ZONES: Array<{ id: LayoutZoneId; label: string; loop: boolean; loopHint?: string }> = [
  { id: 'header', label: 'Vùng đầu trang (Header)',          loop: false },
  { id: 'rows',   label: 'Vùng dữ liệu lặp (Rows)',           loop: true,  loopHint: 'lặp với mỗi row' },
  { id: 'pager',  label: 'Vùng phân trang (Pager)',           loop: false },
  { id: 'empty',  label: 'Trạng thái rỗng (Empty)',           loop: false },
];

export interface CanvasHandle {
  el: HTMLElement;
  render: () => void;
  destroy: () => void;
}

export interface CanvasOpts {
  state: DesignerState;
  onChange: () => void;
  onSelect: (uid: string | null) => void;
}

export function createCanvas(opts: CanvasOpts): CanvasHandle {
  const root = document.createElement('div');
  root.className = 'mf-ld-canvas';

  const sortables: any[] = [];

  function destroy(): void {
    sortables.forEach((s) => { try { s.destroy(); } catch { /* ignore */ } });
    sortables.length = 0;
  }

  function render(): void {
    destroy();
    root.innerHTML = '';

    for (const zoneSpec of ZONES) {
      const zoneEl = renderZone(zoneSpec);
      root.appendChild(zoneEl);
    }
  }

  function renderZone(spec: typeof ZONES[number]): HTMLElement {
    const zone = opts.state.tree.zones[spec.id];
    const zoneWrap = document.createElement('div');
    zoneWrap.className = 'mf-ld-zone';
    zoneWrap.setAttribute('data-zone', spec.id);

    const label = document.createElement('span');
    label.className = 'mf-ld-zone-label';
    label.textContent = spec.label;
    if (spec.loopHint) {
      const hint = document.createElement('span');
      hint.className = 'mf-ld-zone-loop-hint';
      hint.textContent = spec.loopHint;
      label.appendChild(hint);
    }
    zoneWrap.appendChild(label);

    if (!zone.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'mf-ld-zone-empty';
      empty.textContent = 'Kéo khối từ bên trái vào đây để bắt đầu.';
      zoneWrap.appendChild(empty);
    } else {
      for (const block of zone.blocks) {
        zoneWrap.appendChild(renderBlock(spec, block));
      }
    }

    if (typeof Sortable !== 'undefined') {
      const s = new Sortable(zoneWrap, {
        group: { name: 'mf-ld', pull: true, put: true },
        animation: 150,
        filter: '.mf-ld-zone-empty,.mf-ld-zone-label',
        draggable: '.mf-ld-block',
        handle: '.mf-ld-block-head',
        onAdd: (evt: any) => handleAdd(spec.id, evt),
        onUpdate: (evt: any) => handleReorder(spec.id, evt),
        onRemove: (evt: any) => handleRemove(spec.id, evt),
      });
      sortables.push(s);
    }

    return zoneWrap;
  }

  function renderBlock(spec: typeof ZONES[number], block: BlockInstance): HTMLElement {
    const def = findBlock(block.blockKey);
    const wrap = document.createElement('div');
    wrap.className = 'mf-ld-block';
    if (opts.state.selectedBlockUid === block.uid) wrap.classList.add('is-selected');
    wrap.setAttribute('data-uid', block.uid);
    wrap.setAttribute('data-block-key', block.blockKey);

    const head = document.createElement('div');
    head.className = 'mf-ld-block-head';
    head.innerHTML =
      '<span class="mf-ld-block-head-label">' + escapeHtml(def?.label || block.blockKey) + '</span>' +
      '<button type="button" class="mf-ld-block-head-action" data-act="up" title="Lên">▲</button>' +
      '<button type="button" class="mf-ld-block-head-action" data-act="down" title="Xuống">▼</button>' +
      '<button type="button" class="mf-ld-block-head-action is-del" data-act="del" title="Xoá">×</button>';
    head.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const act = target.getAttribute('data-act');
      if (act === 'del') { e.stopPropagation(); deleteBlock(spec.id, block.uid); return; }
      if (act === 'up')   { e.stopPropagation(); moveBlock(spec.id, block.uid, -1); return; }
      if (act === 'down') { e.stopPropagation(); moveBlock(spec.id, block.uid,  1); return; }
      opts.state.selectedBlockUid = block.uid;
      opts.onSelect(block.uid);
    });
    wrap.appendChild(head);

    const body = document.createElement('div');
    body.className = 'mf-ld-block-body';
    body.innerHTML = renderBlockPreview(spec, block);
    wrap.appendChild(body);

    return wrap;
  }

  function renderBlockPreview(spec: typeof ZONES[number], block: BlockInstance): string {
    const mock = opts.state.mockRows;
    if (!spec.loop || !mock.length) {
      const row = mock[0] || null;
      return resolveTokens(block.innerHtml, row);
    }
    const sample = mock.slice(0, 3);
    return sample.map((row) => resolveTokens(block.innerHtml, row)).join('\n');
  }

  // ── Sortable event handlers ─────────────────────────────────────────────
  function handleAdd(zoneId: LayoutZoneId, evt: any): void {
    const item = evt.item as HTMLElement;
    const fromTray = item.getAttribute('data-block-source') === 'tray';
    const blockKey = item.getAttribute('data-block-key') || '';
    const def = findBlock(blockKey);
    if (fromTray && def) {
      // Replace tray ghost with a fresh BlockInstance in our state
      item.remove();
      const newInst = newBlockInstance(def.key, def.html);
      const zone = opts.state.tree.zones[zoneId];
      const insertAt = evt.newIndex;
      zone.blocks.splice(insertAt, 0, newInst);
      opts.state.selectedBlockUid = newInst.uid;
      opts.onChange();
      opts.onSelect(newInst.uid);
      return;
    }
    if (!fromTray) {
      // Cross-zone move
      const fromZone = (item.parentElement?.getAttribute('data-zone') || '') as LayoutZoneId;
      const uid = item.getAttribute('data-uid') || '';
      item.remove();
      if (fromZone && uid) {
        const src = opts.state.tree.zones[fromZone];
        const idx = src.blocks.findIndex((b) => b.uid === uid);
        if (idx >= 0) {
          const [moved] = src.blocks.splice(idx, 1);
          opts.state.tree.zones[zoneId].blocks.splice(evt.newIndex, 0, moved);
          opts.onChange();
        }
      }
    }
  }

  function handleReorder(zoneId: LayoutZoneId, evt: any): void {
    const zone = opts.state.tree.zones[zoneId];
    const { oldIndex, newIndex } = evt;
    if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
    const [moved] = zone.blocks.splice(oldIndex, 1);
    zone.blocks.splice(newIndex, 0, moved);
    opts.onChange();
  }

  function handleRemove(zoneId: LayoutZoneId, evt: any): void {
    // Cross-zone moves trigger Remove on source — but state update already
    // happened inside handleAdd on the target zone. Suppress duplicate
    // mutation here.
    void zoneId; void evt;
  }

  function deleteBlock(zoneId: LayoutZoneId, uid: string): void {
    const zone = opts.state.tree.zones[zoneId];
    const idx = zone.blocks.findIndex((b) => b.uid === uid);
    if (idx < 0) return;
    zone.blocks.splice(idx, 1);
    if (opts.state.selectedBlockUid === uid) {
      opts.state.selectedBlockUid = null;
      opts.onSelect(null);
    }
    opts.onChange();
  }

  function moveBlock(zoneId: LayoutZoneId, uid: string, delta: number): void {
    const zone = opts.state.tree.zones[zoneId];
    const idx = zone.blocks.findIndex((b) => b.uid === uid);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= zone.blocks.length) return;
    const [moved] = zone.blocks.splice(idx, 1);
    zone.blocks.splice(next, 0, moved);
    opts.onChange();
  }

  return { el: root, render, destroy };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Helper used by inspector — exposed so users can change a zone's blocks
// from outside the canvas (e.g. when the inspector edits a block).
export function findBlockInTree(state: DesignerState, uid: string): { zone: LayoutZone; block: BlockInstance } | null {
  for (const zoneId of Object.keys(state.tree.zones) as LayoutZoneId[]) {
    const zone = state.tree.zones[zoneId];
    const block = zone.blocks.find((b) => b.uid === uid);
    if (block) return { zone, block };
  }
  return null;
}
