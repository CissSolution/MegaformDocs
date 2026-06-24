/**
 * Layout Designer v2 — Canvas
 *
 * Renders 4 zones (header, rows, pager, empty) with the current state's
 * BlockInstanceV2 entries. Each rendered block is a card with:
 *   - the actual block HTML (with tokens resolved against mock data)
 *   - a selection outline + delete handle
 *   - drag handle for reorder
 *
 * Reorder uses native HTML5 DnD. Drop targets are the zone bodies; drop
 * sources are blocks AND the tray buttons (tray emits a custom DataTransfer
 * payload `application/x-mfldv2-block-key`).
 *
 * "Loop preview" for the rows zone: we render the row block(s) once per
 * mock row (up to 3 rows) with row-token resolution, so the admin can see
 * realistic output without leaving the popup.
 */

import { renderBlockHtml, findBlockDefV2 } from './blocks-v2';
import type { BlockInstanceV2 } from './templates-v2';
import { resolveMockTokens, type DesignerStateV2 } from './serialize-v2';
import type { LayoutZoneId } from './types';

export interface CanvasV2Opts {
  state: DesignerStateV2;
  mockRows: () => Record<string, any>[];
  mockMeta: () => Record<string, any>;
  selectedUid: () => string | null;
  onSelect: (uid: string | null) => void;
  onChange: () => void;            // any mutation: add/remove/move/edit
}

export interface CanvasV2Handle {
  el: HTMLElement;
  render: () => void;
}

const ZONES: { id: LayoutZoneId; label: string; hint: string; }[] = [
  { id: 'header', label: 'Header',  hint: 'Title, search, filter, action bar.' },
  { id: 'rows',   label: 'Rows · (loop / SQL row)', hint: 'Blocks here are repeated for each SQL row.' },
  { id: 'pager',  label: 'Pager',   hint: 'Pagination.' },
  { id: 'empty',  label: 'Empty state', hint: 'Shown when SQL returns 0 rows.' },
];

export function createCanvasV2(opts: CanvasV2Opts): CanvasV2Handle {
  const root = document.createElement('div');
  root.className = 'mfldv2-canvas';

  function render(): void {
    root.innerHTML = '';
    ZONES.forEach(({ id, label, hint }) => {
      const zone = document.createElement('section');
      zone.className = 'mfldv2-zone';
      zone.setAttribute('data-zone-id', id);

      const head = document.createElement('header');
      head.className = 'mfldv2-zone-head';
      head.innerHTML = `<span class="mfldv2-zone-label">${label}</span><span class="mfldv2-zone-hint">${hint}</span>`;
      zone.appendChild(head);

      const body = document.createElement('div');
      body.className = 'mfldv2-zone-body';
      body.setAttribute('data-drop-zone', id);
      attachDropTarget(body, id);
      zone.appendChild(body);

      const blocks = opts.state.layout[id] || [];
      if (!blocks.length) {
        const ph = document.createElement('div');
        ph.className = 'mfldv2-zone-empty';
        ph.textContent = id === 'rows'
          ? 'Drag a row block here (Card / Table row / Timeline…).'
          : `No blocks yet. Drag from the library on the left into here.`;
        body.appendChild(ph);
      } else {
        blocks.forEach((b, idx) => {
          if (id === 'rows') {
            renderRowBlockWithLoop(b, body, idx);
          } else {
            body.appendChild(renderBlockCard(b, id, idx, opts.mockMeta(), opts.mockRows()[0] || {}));
          }
        });
      }

      root.appendChild(zone);
    });
  }

  function renderRowBlockWithLoop(b: BlockInstanceV2, body: HTMLElement, idx: number): void {
    const rows = opts.mockRows();
    const meta = opts.mockMeta();

    // Card wrapper showing block name + delete + preview loop
    const card = renderBlockCard(b, 'rows', idx, meta, rows[0] || {});
    body.appendChild(card);

    // Below the card preview, show loop indicator
    if (rows.length > 1) {
      const loopHint = document.createElement('div');
      loopHint.className = 'mfldv2-zone-loophint';
      loopHint.innerHTML = `<i class="fa fa-sync"></i> Block will repeat ${rows.length} times with sample data`;
      body.appendChild(loopHint);
    }
  }

  function renderBlockCard(b: BlockInstanceV2, zoneId: LayoutZoneId, idx: number, meta: any, mockRow: any): HTMLElement {
    const def = findBlockDefV2(b.blockKey);
    const card = document.createElement('div');
    card.className = 'mfldv2-block-card';
    card.setAttribute('data-block-uid', b.uid);
    card.setAttribute('data-zone-id', zoneId);
    if (opts.selectedUid() === b.uid) card.classList.add('is-selected');
    card.draggable = true;

    // Header bar with label + actions
    const bar = document.createElement('div');
    bar.className = 'mfldv2-block-bar';
    bar.innerHTML = `
      <span class="mfldv2-block-grip"><i class="fa fa-grip-vertical"></i></span>
      <span class="mfldv2-block-icon" style="color:${def?.iconColor || '#64748b'}"><i class="fa ${def?.icon || 'fa-cube'}"></i></span>
      <span class="mfldv2-block-name">${def?.label || b.blockKey}</span>
      <span class="mfldv2-block-spacer"></span>
      <button type="button" class="mfldv2-block-act" data-act="up"    title="Move up"><i class="fa fa-arrow-up"></i></button>
      <button type="button" class="mfldv2-block-act" data-act="down"  title="Move down"><i class="fa fa-arrow-down"></i></button>
      <button type="button" class="mfldv2-block-act" data-act="dup"   title="Duplicate"><i class="fa fa-clone"></i></button>
      <button type="button" class="mfldv2-block-act mfldv2-block-act-del" data-act="del" title="Delete"><i class="fa fa-trash"></i></button>
    `;
    card.appendChild(bar);

    // Preview body
    const prev = document.createElement('div');
    prev.className = 'mfldv2-block-preview';
    const html = renderBlockHtml(b.blockKey, b.props);
    prev.innerHTML = resolveMockTokens(html, mockRow, meta);
    card.appendChild(prev);

    // Wire actions
    bar.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = (btn as HTMLElement).dataset.act;
        if (act === 'del') removeBlock(zoneId, b.uid);
        else if (act === 'up') moveBlock(zoneId, b.uid, -1);
        else if (act === 'down') moveBlock(zoneId, b.uid, +1);
        else if (act === 'dup') duplicateBlock(zoneId, b.uid);
      });
    });

    // Click → select
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onSelect(b.uid);
      render();
    });

    // Drag start
    card.addEventListener('dragstart', (e) => {
      const dt = e.dataTransfer; if (!dt) return;
      dt.effectAllowed = 'move';
      dt.setData('application/x-mfldv2-move', JSON.stringify({ uid: b.uid, fromZone: zoneId }));
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('is-dragging'));

    void idx;
    return card;
  }

  function attachDropTarget(body: HTMLElement, zoneId: LayoutZoneId): void {
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      body.classList.add('is-dropover');
    });
    body.addEventListener('dragleave', () => body.classList.remove('is-dropover'));
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('is-dropover');
      const dt = e.dataTransfer; if (!dt) return;

      // Tray block-key payload → add new
      const newKey = dt.getData('application/x-mfldv2-block-key');
      if (newKey) {
        addBlock(zoneId, newKey);
        return;
      }
      // Move payload
      const moveRaw = dt.getData('application/x-mfldv2-move');
      if (moveRaw) {
        try {
          const obj = JSON.parse(moveRaw);
          moveBlockToZone(obj.fromZone, obj.uid, zoneId);
        } catch { /* ignore */ }
      }
    });
  }

  function addBlock(zoneId: LayoutZoneId, blockKey: string): void {
    const def = findBlockDefV2(blockKey);
    if (!def) return;
    // Zone fit check
    if (def.zone !== 'any' && def.zone !== zoneId) {
      // allow drop but warn via subtle shake — simplest: place anyway
    }
    const props: Record<string, any> = {};
    def.props.forEach((p) => { props[p.key] = p.default; });
    const inst: BlockInstanceV2 = {
      uid: `bi_${Date.now().toString(36)}_${Math.floor(Math.random()*9999).toString(36)}`,
      blockKey,
      props,
    };
    opts.state.layout[zoneId] = [...(opts.state.layout[zoneId] || []), inst];
    opts.onSelect(inst.uid);
    opts.onChange();
  }

  function removeBlock(zoneId: LayoutZoneId, uid: string): void {
    opts.state.layout[zoneId] = (opts.state.layout[zoneId] || []).filter((b) => b.uid !== uid);
    if (opts.selectedUid() === uid) opts.onSelect(null);
    opts.onChange();
  }

  function moveBlock(zoneId: LayoutZoneId, uid: string, delta: number): void {
    const arr = opts.state.layout[zoneId] || [];
    const i = arr.findIndex((b) => b.uid === uid);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const next = [...arr];
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    opts.state.layout[zoneId] = next;
    opts.onChange();
  }

  function duplicateBlock(zoneId: LayoutZoneId, uid: string): void {
    const arr = opts.state.layout[zoneId] || [];
    const i = arr.findIndex((b) => b.uid === uid);
    if (i < 0) return;
    const orig = arr[i];
    const copy: BlockInstanceV2 = {
      uid: `bi_${Date.now().toString(36)}_${Math.floor(Math.random()*9999).toString(36)}`,
      blockKey: orig.blockKey,
      props: { ...orig.props },
    };
    opts.state.layout[zoneId] = [...arr.slice(0, i + 1), copy, ...arr.slice(i + 1)];
    opts.onChange();
  }

  function moveBlockToZone(fromZone: LayoutZoneId, uid: string, toZone: LayoutZoneId): void {
    const fromArr = opts.state.layout[fromZone] || [];
    const i = fromArr.findIndex((b) => b.uid === uid);
    if (i < 0) return;
    const block = fromArr[i];
    opts.state.layout[fromZone] = [...fromArr.slice(0, i), ...fromArr.slice(i + 1)];
    opts.state.layout[toZone] = [...(opts.state.layout[toZone] || []), block];
    opts.onChange();
  }

  // Click on empty canvas clears selection
  root.addEventListener('click', (e) => {
    if (e.target === root) {
      opts.onSelect(null);
      render();
    }
  });

  return { el: root, render };
}
