/**
 * Layout Designer — inspector pane (right column).
 *
 * Edits the selected BlockInstance: raw inner HTML + arbitrary attrs.
 * Changes flow back to state via onChange() so canvas + code-view
 * re-render against the new tree.
 */

import { findBlockInTree } from './canvas';
import { findBlock } from './catalog';
import type { DesignerState } from './types';

export interface InspectorHandle {
  el: HTMLElement;
  render: () => void;
}

export interface InspectorOpts {
  state: DesignerState;
  onChange: () => void;
  onPromoteToCustomBlock: () => void;
}

export function createInspector(opts: InspectorOpts): InspectorHandle {
  const root = document.createElement('div');
  root.className = 'mf-ld-inspector';

  function render(): void {
    root.innerHTML = '';
    const uid = opts.state.selectedBlockUid;
    if (!uid) {
      root.innerHTML =
        '<h4>Block đã chọn</h4>' +
        '<p>Nhấp vào một block trong canvas để chỉnh sửa HTML, token, hoặc lưu thành block tái sử dụng.</p>' +
        '<h4>Hướng dẫn nhanh</h4>' +
        '<p>• Kéo từ tray bên trái vào canvas.<br>' +
        '• Block trong vùng <strong>Rows</strong> sẽ lặp với mỗi row SQL.<br>' +
        '• Dùng <code>{{row:Field}}</code> / <code>{{qs:param}}</code> / <code>{{meta:key}}</code> để chèn token.</p>';
      return;
    }
    const found = findBlockInTree(opts.state, uid);
    if (!found) {
      root.innerHTML = '<h4>Block đã chọn</h4><p>Block không còn tồn tại — chọn lại.</p>';
      return;
    }
    const { block } = found;
    const def = findBlock(block.blockKey);

    const header = document.createElement('h4');
    header.textContent = def?.label || block.blockKey;
    root.appendChild(header);

    if (def?.helpText) {
      const help = document.createElement('p');
      help.textContent = def.helpText;
      root.appendChild(help);
    }

    // Inner HTML editor
    const innerWrap = document.createElement('div');
    innerWrap.className = 'mf-ld-row';
    innerWrap.innerHTML = '<label>HTML block</label>';
    const innerTa = document.createElement('textarea');
    innerTa.value = block.innerHtml;
    innerTa.rows = 8;
    innerTa.addEventListener('input', () => {
      block.innerHtml = innerTa.value;
      opts.onChange();
    });
    innerWrap.appendChild(innerTa);
    root.appendChild(innerWrap);

    // Attribute editor — show as compact key=value list
    const attrsWrap = document.createElement('div');
    attrsWrap.className = 'mf-ld-row';
    attrsWrap.innerHTML = '<label>Thuộc tính (key=value, mỗi dòng một)</label>';
    const attrsTa = document.createElement('textarea');
    attrsTa.rows = 3;
    attrsTa.value = Object.entries(block.attrs)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    attrsTa.addEventListener('input', () => {
      const map: Record<string, string> = {};
      attrsTa.value.split(/\r?\n/).forEach((line) => {
        const idx = line.indexOf('=');
        if (idx <= 0) return;
        const k = line.slice(0, idx).trim();
        const v = line.slice(idx + 1).trim();
        if (k) map[k] = v;
      });
      block.attrs = map;
      opts.onChange();
    });
    attrsWrap.appendChild(attrsTa);
    root.appendChild(attrsWrap);

    // Promote to custom button
    const promote = document.createElement('button');
    promote.type = 'button';
    promote.className = 'mf-ld-save-block';
    promote.textContent = '⭐ Lưu thành block dùng lại';
    promote.addEventListener('click', () => opts.onPromoteToCustomBlock());
    root.appendChild(promote);

    // Mock data overview
    const mockHeader = document.createElement('h4');
    mockHeader.textContent = 'Mock data preview';
    mockHeader.style.marginTop = '18px';
    root.appendChild(mockHeader);
    if (opts.state.mockError) {
      const err = document.createElement('p');
      err.style.color = '#b91c1c';
      err.textContent = opts.state.mockError;
      root.appendChild(err);
    } else {
      const list = document.createElement('p');
      list.innerHTML =
        '<strong>' + opts.state.mockRows.length + ' rows</strong> · ' +
        '<strong>' + opts.state.mockCols.length + ' columns</strong><br>' +
        opts.state.mockCols.map((c) => '<code>' + escapeHtml(c) + '</code>').join(' · ');
      root.appendChild(list);
    }
  }

  return { el: root, render };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
