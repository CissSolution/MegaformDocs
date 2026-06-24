/**
 * Layout Designer v2 — Inspector
 *
 * Right-rail panel that shows the typed inspector form for the currently
 * selected block (auto-generated from its PropDef[]). Includes an
 * "Advanced HTML" disclosure that lets power users override the entire
 * layout HTML — when non-empty, advancedHtml replaces the serialized
 * zone-rendered HTML on save.
 */

import { findBlockDefV2 } from './blocks-v2';
import { renderInlineForm } from './inline-form';
import type { DesignerStateV2 } from './serialize-v2';
import type { LayoutZoneId } from './types';

export interface InspectorV2Opts {
  host?: HTMLElement;
  state: DesignerStateV2;
  selectedUid: () => string | null;
  onChange: () => void;
  onAdvancedHtmlChange: (newHtml: string) => void;
}

export interface InspectorV2Handle {
  el: HTMLElement;
  render: () => void;
}

export function createInspectorV2(opts: InspectorV2Opts): InspectorV2Handle {
  const el = document.createElement('aside');
  el.className = 'mfldv2-inspector';

  const head = document.createElement('div');
  head.className = 'mfldv2-inspector-head';
  head.innerHTML = `<strong>Properties</strong>`;
  el.appendChild(head);

  const body = document.createElement('div');
  body.className = 'mfldv2-inspector-body';
  el.appendChild(body);

  function findInstance() {
    const uid = opts.selectedUid();
    if (!uid) return null;
    for (const z of ['header','rows','pager','empty'] as LayoutZoneId[]) {
      const found = (opts.state.layout[z] || []).find((b) => b.uid === uid);
      if (found) return { instance: found, zone: z };
    }
    return null;
  }

  function render(): void {
    body.innerHTML = '';
    const sel = findInstance();
    if (!sel) {
      renderEmpty();
      renderAdvancedHtml();
      return;
    }
    const def = findBlockDefV2(sel.instance.blockKey);
    if (!def) {
      body.innerHTML = `<p class="mfldv2-inspector-empty">Unknown block "${sel.instance.blockKey}" — was it removed from the library?</p>`;
      renderAdvancedHtml();
      return;
    }

    const header = document.createElement('div');
    header.className = 'mfldv2-inspector-blockhead';
    header.innerHTML = `
      <span class="mfldv2-inspector-blockicon" style="color:${def.iconColor || '#475569'}"><i class="fa ${def.icon}"></i></span>
      <div>
        <div class="mfldv2-inspector-blocklabel">${escapeHtml(def.label)}</div>
        <div class="mfldv2-inspector-blockdesc">${escapeHtml(def.description || '')}</div>
      </div>
    `;
    body.appendChild(header);

    const formHost = document.createElement('div');
    body.appendChild(formHost);

    renderInlineForm({
      host: formHost,
      block: def,
      values: sel.instance.props,
      onChange: (next) => {
        sel.instance.props = next;
        opts.onChange();
      },
    });

    renderAdvancedHtml();
  }

  function renderEmpty(): void {
    const p = document.createElement('p');
    p.className = 'mfldv2-inspector-empty';
    p.textContent = 'Select a block on the canvas to edit its properties.';
    body.appendChild(p);
  }

  function renderAdvancedHtml(): void {
    const wrap = document.createElement('details');
    wrap.className = 'mfldv2-inspector-advanced';
    if (opts.state.advancedHtml && opts.state.advancedHtml.trim()) wrap.open = true;
    wrap.innerHTML = `<summary>Advanced HTML override</summary>`;
    const note = document.createElement('p');
    note.className = 'mfldv2-inspector-advanced-note';
    note.textContent = 'If provided, this HTML replaces the block-generated HTML. Leave empty to use the block UI on the left.';
    wrap.appendChild(note);

    const ta = document.createElement('textarea');
    ta.className = 'mfldv2-inspector-advanced-ta';
    ta.rows = 10;
    ta.value = opts.state.advancedHtml || '';
    ta.placeholder = '<div class="mf-grid">…</div>';
    ta.addEventListener('input', () => opts.onAdvancedHtmlChange(ta.value));
    wrap.appendChild(ta);
    body.appendChild(wrap);
  }

  return { el, render };
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
