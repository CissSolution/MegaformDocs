/**
 * Layout Designer v2 — Block tray
 *
 * Left-rail palette of available blocks, grouped by category (header,
 * row, pager, empty). Each block shows its icon + label + short
 * description. Drag to canvas zone OR click "+" to append to the
 * matching zone.
 *
 * No custom-block API in v2 yet (kept v1's separately).
 */

import { BUILTIN_BLOCKS_V2, type BlockDefV2 } from './blocks-v2';
import type { LayoutZoneId } from './types';

export interface TrayV2Opts {
  host?: HTMLElement;
  /** Called when admin clicks "+" on a block, to add it to the matching zone. */
  onAddToZone: (blockKey: string, zone: LayoutZoneId | 'any') => void;
}

export interface TrayV2Handle {
  el: HTMLElement;
}

const CATEGORY_ORDER: Array<{ id: BlockDefV2['category']; label: string; icon: string; }> = [
  { id: 'header', label: 'Header',   icon: 'fa-heading' },
  { id: 'row',    label: 'Rows',     icon: 'fa-th-list' },
  { id: 'pager',  label: 'Pager',    icon: 'fa-list-ol' },
  { id: 'empty',  label: 'Empty',    icon: 'fa-inbox' },
];

export function createTrayV2(opts: TrayV2Opts): TrayV2Handle {
  const el = document.createElement('aside');
  el.className = 'mfldv2-tray';

  const header = document.createElement('div');
  header.className = 'mfldv2-tray-head';
  header.innerHTML = `
    <strong>Block library</strong>
    <input type="search" class="mfldv2-tray-filter" placeholder="Search blocks…" />
  `;
  el.appendChild(header);

  const filterInput = header.querySelector('.mfldv2-tray-filter') as HTMLInputElement;

  const body = document.createElement('div');
  body.className = 'mfldv2-tray-body';
  el.appendChild(body);

  function renderList(filter: string): void {
    body.innerHTML = '';
    const needle = filter.trim().toLowerCase();

    CATEGORY_ORDER.forEach((cat) => {
      const blocks = BUILTIN_BLOCKS_V2.filter((b) => b.category === cat.id)
        .filter((b) => !needle || (b.label + ' ' + (b.description || '') + ' ' + b.key).toLowerCase().includes(needle));
      if (!blocks.length) return;

      const grp = document.createElement('div');
      grp.className = 'mfldv2-tray-group';
      grp.innerHTML = `<div class="mfldv2-tray-grouphead"><i class="fa ${cat.icon}"></i> ${cat.label}</div>`;

      blocks.forEach((b) => {
        const item = document.createElement('div');
        item.className = 'mfldv2-tray-item';
        item.draggable = true;
        item.setAttribute('data-block-key', b.key);
        item.setAttribute('data-zone', String(b.zone));
        item.innerHTML = `
          <span class="mfldv2-tray-icon" style="background:${hexA(b.iconColor || '#94a3b8', 0.12)};color:${b.iconColor || '#475569'}">
            <i class="fa ${b.icon}"></i>
          </span>
          <span class="mfldv2-tray-meta">
            <span class="mfldv2-tray-label">${escapeHtml(b.label)}</span>
            <span class="mfldv2-tray-desc">${escapeHtml(b.description || '')}</span>
          </span>
          <button type="button" class="mfldv2-tray-add" title="Add"><i class="fa fa-plus"></i></button>
        `;
        item.addEventListener('dragstart', (e) => {
          const dt = e.dataTransfer; if (!dt) return;
          dt.effectAllowed = 'copy';
          dt.setData('application/x-mfldv2-block-key', b.key);
          item.classList.add('is-dragging');
        });
        item.addEventListener('dragend', () => item.classList.remove('is-dragging'));
        item.querySelector('.mfldv2-tray-add')?.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onAddToZone(b.key, b.zone);
        });
        grp.appendChild(item);
      });

      body.appendChild(grp);
    });

    if (!body.children.length) {
      const empty = document.createElement('div');
      empty.className = 'mfldv2-tray-noresults';
      empty.textContent = 'No matching blocks.';
      body.appendChild(empty);
    }
  }

  filterInput.addEventListener('input', () => renderList(filterInput.value));
  renderList('');

  if (opts.host) opts.host.appendChild(el);
  return { el };
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}

function hexA(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(148,163,184,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n>>16)&0xff},${(n>>8)&0xff},${n&0xff},${alpha})`;
}
