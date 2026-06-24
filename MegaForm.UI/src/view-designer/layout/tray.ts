/**
 * Layout Designer — block tray (left pane).
 *
 * Groups blocks by category (Header / Row / Pager / Empty / Custom),
 * renders them as draggable items. The tray is a Sortable.js source
 * (group: 'mf-ld', pull: 'clone', put: false) so dropping into a zone
 * creates a clone on the canvas while preserving the tray entry.
 *
 * Custom-block entries get a delete button; clicking it calls
 * deleteCustomBlock and re-renders.
 */

import { BUILTIN_BLOCKS } from './blocks-builtin';
import { deleteCustomBlock, getAllBlocks, loadCustomBlocks } from './catalog';
import type { BlockCategory, BlockDef } from './types';

declare var Sortable: any;

export interface TrayHandle {
  el: HTMLElement;
  refresh: () => Promise<void>;
  destroy: () => void;
}

export interface TrayOpts {
  portalId?: number;
  onSaveBlockFromSelection: () => void;     // tray top button
}

const CATEGORY_ORDER: BlockCategory[] = ['header', 'row', 'pager', 'empty', 'media', 'navigation', 'custom'];
const CATEGORY_LABEL: Record<BlockCategory, string> = {
  header: 'Header',
  row: 'Row (lặp)',
  pager: 'Pager',
  empty: 'Empty state',
  media: 'Media',
  navigation: 'Navigation',
  custom: 'Đã lưu (Custom)',
};

export function createTray(opts: TrayOpts): TrayHandle {
  const root = document.createElement('div');
  root.className = 'mf-ld-tray';

  const sortables: any[] = [];

  function destroy(): void {
    sortables.forEach((s) => { try { s.destroy(); } catch { /* ignore */ } });
    sortables.length = 0;
  }

  async function refresh(): Promise<void> {
    destroy();
    root.innerHTML = '';

    // Top action — save selection as custom
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'mf-ld-btn';
    saveBtn.style.cssText = 'width:100%;padding:7px 10px;border:1px solid #6366f1;background:#eef2ff;color:#4338ca;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:10px';
    saveBtn.textContent = '+ Lưu block đã chọn';
    saveBtn.addEventListener('click', () => opts.onSaveBlockFromSelection());
    root.appendChild(saveBtn);

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Tìm block…';
    search.className = 'mf-ld-tray-search';
    root.appendChild(search);

    // Load custom blocks first (network call); use built-in immediately
    await loadCustomBlocks(opts.portalId).catch(() => []);
    const all = getAllBlocks();
    const grouped = groupByCategory(all);

    for (const cat of CATEGORY_ORDER) {
      const list = grouped[cat];
      if (!list || !list.length) continue;
      const h = document.createElement('h4');
      h.textContent = CATEGORY_LABEL[cat];
      root.appendChild(h);

      const group = document.createElement('div');
      group.setAttribute('data-cat', cat);
      root.appendChild(group);

      for (const def of list) {
        group.appendChild(renderTrayItem(def));
      }

      if (typeof Sortable !== 'undefined') {
        const s = new Sortable(group, {
          group: { name: 'mf-ld', pull: 'clone', put: false },
          sort: false,
          animation: 150,
          onClone: (evt: any) => {
            const clone = evt.clone as HTMLElement;
            clone.setAttribute('data-block-source', 'tray');
          },
        });
        sortables.push(s);
      }
    }

    const help = document.createElement('p');
    help.className = 'mf-ld-tray-help';
    help.textContent = 'Kéo bất kỳ block nào vào canvas bên phải. Block trong nhóm "Đã lưu" có thể xoá.';
    root.appendChild(help);

    // Wire search
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      const items = root.querySelectorAll('.mf-ld-block-item');
      items.forEach((item) => {
        const text = item.textContent || '';
        (item as HTMLElement).style.display = !q || text.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function renderTrayItem(def: BlockDef): HTMLElement {
    const item = document.createElement('div');
    item.className = 'mf-ld-block-item' + (def.origin === 'custom' ? ' is-custom' : '');
    item.setAttribute('data-block-key', def.key);
    item.setAttribute('draggable', 'true');
    item.title = def.helpText || def.label;
    item.innerHTML =
      '<span class="mf-ld-block-name">' + escapeHtml(def.label) + '</span>' +
      '<span class="mf-ld-block-cat">' + escapeHtml(def.category) + '</span>';
    if (def.origin === 'custom' && def.id) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mf-ld-block-del';
      del.title = 'Xoá block lưu';
      del.textContent = '×';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Xoá block "' + def.label + '"?')) return;
        const ok = await deleteCustomBlock(def.id!, opts.portalId);
        if (ok) await refresh();
        else alert('Không xoá được block. Kiểm tra quyền hoặc kết nối.');
      });
      item.appendChild(del);
    }
    return item;
  }

  return { el: root, refresh, destroy };
}

function groupByCategory(blocks: BlockDef[]): Record<BlockCategory, BlockDef[]> {
  const out = {} as Record<BlockCategory, BlockDef[]>;
  for (const cat of CATEGORY_ORDER) out[cat] = [];
  for (const b of blocks) {
    if (!out[b.category]) out[b.category] = [];
    out[b.category].push(b);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Re-export so layout-designer.ts can detect "builtin block count" without
// touching catalog directly.
export { BUILTIN_BLOCKS };
