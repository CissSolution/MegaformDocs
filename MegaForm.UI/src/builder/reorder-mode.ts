/* ============================================================
   MegaForm Builder — Reorder mode
   File: src/builder/reorder-mode.ts

   A dedicated mode for putting fields in order, modelled on the one in
   Umbraco Forms ("Reorder" → compact rows with handles → "I am done
   reordering").

   Why a separate mode instead of improving the canvas drag:
   on the canvas every field renders its real control, so a row is tall,
   the drop targets are nested (canvas → row → column → field) and a drag
   crosses several of them on the way to its destination. Ordering ten
   fields means ten long, ambiguous drags. Here each field is one short
   row, the only thing you can do is move it, and every row also carries
   ▲ / ▼ buttons — so ordering never depends on landing a drag at all.

   Moves are confined to the list a field already belongs to (the form, or
   one column of a layout row). Moving a field INTO a different container
   stays on the canvas, where the target is visible.
   ============================================================ */
import { MegaFormBuilder } from './core';

(function () {
  'use strict';

  const B: any = MegaFormBuilder;

  function t(key: string, fallback: string, params?: Record<string, any>): string {
    return B.builderT ? B.builderT(key, fallback, params) : fallback;
  }

  /** One movable entry: which array it lives in, and at which position. */
  interface Entry {
    field: any;
    list: any[];
    depth: number;
    label: string;
    key: string;
    type: string;
  }

  let overlay: HTMLElement | null = null;
  let working: { top: any[]; columns: Array<{ row: any; colIndex: number; items: any[] }> } | null = null;

  // ── schema helpers ───────────────────────────────────────────────

  function schemaFields(): any[] {
    const schema = B.state && B.state.schema;
    return schema && Array.isArray(schema.fields) ? schema.fields : [];
  }

  function fieldLabel(field: any): string {
    const label = field?.label ?? field?.Label ?? '';
    if (label) return String(label);
    const type = String(field?.type ?? field?.Type ?? '');
    return type || t('builder.reorder.untitled', 'Untitled field');
  }

  function fieldKey(field: any): string {
    return String(field?.key ?? field?.Key ?? '');
  }

  function fieldType(field: any): string {
    return String(field?.type ?? field?.Type ?? '');
  }

  function columnsOf(field: any): any[] | null {
    const columns = field?.columns ?? field?.Columns;
    return Array.isArray(columns) ? columns : null;
  }

  /**
   * Snapshot the schema into arrays we can shuffle without touching the real
   * one, so Cancel is genuinely a cancel.
   */
  function buildWorking() {
    const top = schemaFields().slice();
    const columns: Array<{ row: any; colIndex: number; items: any[] }> = [];

    top.forEach(field => {
      const cols = columnsOf(field);
      if (!cols) return;
      cols.forEach((col: any, colIndex: number) => {
        const items = Array.isArray(col?.fields) ? col.fields.slice() : [];
        columns.push({ row: field, colIndex, items });
      });
    });

    working = { top, columns };
  }

  function listFor(field: any): any[] {
    if (!working) return [];
    if (working.top.indexOf(field) >= 0) return working.top;
    const owner = working.columns.find(c => c.items.indexOf(field) >= 0);
    return owner ? owner.items : [];
  }

  /** Flatten the working model into display rows, rows followed by their columns. */
  function entries(): Entry[] {
    if (!working) return [];
    const out: Entry[] = [];

    working.top.forEach(field => {
      out.push({ field, list: working!.top, depth: 0, label: fieldLabel(field), key: fieldKey(field), type: fieldType(field) });

      const cols = columnsOf(field);
      if (!cols) return;
      cols.forEach((_col: any, colIndex: number) => {
        const owner = working!.columns.find(c => c.row === field && c.colIndex === colIndex);
        if (!owner) return;
        owner.items.forEach(child => {
          out.push({ field: child, list: owner.items, depth: 1, label: fieldLabel(child), key: fieldKey(child), type: fieldType(child) });
        });
      });
    });

    return out;
  }

  // ── moves ────────────────────────────────────────────────────────

  function move(field: any, delta: number) {
    const list = listFor(field);
    const from = list.indexOf(field);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    list.splice(from, 1);
    list.splice(to, 0, field);
    renderRows();
  }

  function dropBefore(dragged: any, target: any, after: boolean) {
    const list = listFor(dragged);
    // Confined on purpose: a field can only be re-ordered inside the container
    // it already belongs to. Silently moving it between containers here would
    // change the layout without showing where it landed.
    if (list !== listFor(target) || dragged === target) return;

    const from = list.indexOf(dragged);
    list.splice(from, 1);
    let to = list.indexOf(target);
    if (after) to += 1;
    list.splice(to, 0, dragged);
    renderRows();
  }

  function apply() {
    if (!working) return;
    const schema = B.state && B.state.schema;
    if (!schema) return;

    schema.fields.length = 0;
    working.top.forEach(field => schema.fields.push(field));
    working.columns.forEach(col => {
      const cols = columnsOf(col.row);
      if (cols && cols[col.colIndex]) cols[col.colIndex].fields = col.items;
    });

    B.state.isDirty = true;
    if (B.callModule) B.callModule('canvas', 'render');
    if (B.syncSchemaToHtmlImmediate) B.syncSchemaToHtmlImmediate({ reason: 'reorder-mode' });
    if (B.setStatus) B.setStatus(t('builder.reorder.applied', 'Field order updated'), 'ok');
  }

  // ── UI ───────────────────────────────────────────────────────────

  const STYLE_ID = 'mf-reorder-mode-style';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mf-reorder-bar{display:flex;justify-content:flex-end;flex:0 0 auto;box-sizing:border-box;padding:8px 16px 6px;background:transparent}
      .mf-reorder-bar .mf-reorder-btn{display:inline-flex;align-items:center;gap:7px}
      .mf-reorder-bar .mf-reorder-btn .lbl{display:inline}
      .mf-reorder-overlay{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;
        background:#f8fafc;overflow:hidden}
      .mf-reorder-head{display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fff;
        border-bottom:1px solid #e2e8f0}
      .mf-reorder-head h3{margin:0;font-size:14px;font-weight:700;color:#0f172a}
      .mf-reorder-head p{margin:0;font-size:12px;color:#64748b}
      .mf-reorder-head .mf-reorder-spacer{flex:1}
      .mf-reorder-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:8px;
        padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer}
      .mf-reorder-btn:hover{background:#f1f5f9}
      .mf-reorder-btn.primary{background:#0f172a;border-color:#0f172a;color:#fff}
      .mf-reorder-btn.primary:hover{background:#1e293b}
      .mf-reorder-list{flex:1;overflow:auto;padding:12px 16px 24px}
      .mf-reorder-row{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e8f0;
        border-radius:8px;padding:9px 12px;margin:0 0 6px;cursor:grab;user-select:none}
      .mf-reorder-row.child{margin-left:28px;background:#fbfdff}
      .mf-reorder-row.dragging{opacity:.4}
      .mf-reorder-row.drop-before{box-shadow:0 -3px 0 0 #2563eb}
      .mf-reorder-row.drop-after{box-shadow:0 3px 0 0 #2563eb}
      .mf-reorder-grip{color:#94a3b8;font-size:14px;line-height:1;letter-spacing:1px}
      .mf-reorder-name{font-size:13px;font-weight:600;color:#0f172a}
      .mf-reorder-key{font-size:12px;color:#94a3b8}
      .mf-reorder-type{margin-left:auto;font-size:11px;color:#475569;background:#f1f5f9;
        border-radius:999px;padding:2px 9px}
      .mf-reorder-move{border:1px solid #e2e8f0;background:#fff;border-radius:6px;width:26px;height:26px;
        color:#475569;cursor:pointer;font-size:12px;line-height:1}
      .mf-reorder-move:hover:not(:disabled){background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
      .mf-reorder-move:disabled{opacity:.35;cursor:default}
      .mf-reorder-empty{padding:24px;color:#64748b;font-size:13px;text-align:center}
    `;
    document.head.appendChild(style);
  }

  function rowElement(entry: Entry, index: number, all: Entry[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'mf-reorder-row' + (entry.depth ? ' child' : '');
    row.draggable = true;

    const grip = document.createElement('span');
    grip.className = 'mf-reorder-grip';
    grip.textContent = '⠿';
    row.appendChild(grip);

    const name = document.createElement('span');
    name.className = 'mf-reorder-name';
    name.textContent = entry.label;
    row.appendChild(name);

    if (entry.key) {
      const key = document.createElement('span');
      key.className = 'mf-reorder-key';
      key.textContent = entry.key;
      row.appendChild(key);
    }

    const type = document.createElement('span');
    type.className = 'mf-reorder-type';
    type.textContent = entry.type;
    row.appendChild(type);

    const position = entry.list.indexOf(entry.field);
    // Buttons, not just dragging: a drag that has to travel past twenty rows is
    // the thing people were fighting, and the arrows also make the mode usable
    // from the keyboard.
    const up = moveButton('▲', t('builder.reorder.moveUp', 'Move up'), position <= 0, () => move(entry.field, -1));
    const down = moveButton('▼', t('builder.reorder.moveDown', 'Move down'), position >= entry.list.length - 1, () => move(entry.field, 1));
    row.appendChild(up);
    row.appendChild(down);

    row.addEventListener('dragstart', (ev) => {
      (ev.dataTransfer || { setData: () => {} }).setData('text/plain', String(index));
      ev.dataTransfer!.effectAllowed = 'move';
      row.classList.add('dragging');
      (row as any).__mfEntry = entry;
      dragged = entry;
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      clearDropCues();
      dragged = null;
    });
    row.addEventListener('dragover', (ev) => {
      if (!dragged || dragged === entry) return;
      if (listFor(dragged.field) !== entry.list) return;   // different container — not a valid target
      ev.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      clearDropCues();
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    row.addEventListener('drop', (ev) => {
      if (!dragged || dragged === entry) return;
      ev.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = ev.clientY > rect.top + rect.height / 2;
      clearDropCues();
      dropBefore(dragged.field, entry.field, after);
    });

    void all;
    return row;
  }

  let dragged: Entry | null = null;

  function moveButton(glyph: string, title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mf-reorder-move';
    button.textContent = glyph;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = disabled;
    button.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
    return button;
  }

  function clearDropCues() {
    if (!overlay) return;
    overlay.querySelectorAll('.drop-before, .drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
  }

  function renderRows() {
    if (!overlay) return;
    const list = overlay.querySelector('.mf-reorder-list');
    if (!list) return;

    list.innerHTML = '';
    const all = entries();

    if (!all.length) {
      const empty = document.createElement('div');
      empty.className = 'mf-reorder-empty';
      empty.textContent = t('builder.reorder.empty', 'This form has no fields to reorder yet.');
      list.appendChild(empty);
      return;
    }

    all.forEach((entry, index) => list.appendChild(rowElement(entry, index, all)));
  }

  function close() {
    if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
    overlay = null;
    working = null;
    dragged = null;
    setButtonLabel(document.getElementById('mf-reorder-toggle'), t('builder.reorder.open', 'Reorder'));
  }

  function open() {
    if (overlay) { close(); return; }

    const dropzone = document.getElementById('mf-canvas-dropzone');
    const host = (dropzone?.parentElement as HTMLElement) || dropzone;
    if (!host) return;

    ensureStyles();
    buildWorking();

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    overlay = document.createElement('div');
    overlay.className = 'mf-reorder-overlay';

    const head = document.createElement('div');
    head.className = 'mf-reorder-head';

    const titles = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = t('builder.reorder.title', 'Reorder fields');
    const hint = document.createElement('p');
    hint.textContent = t('builder.reorder.hint', 'Drag a row, or use the arrows. Fields stay inside their own section.');
    titles.appendChild(title);
    titles.appendChild(hint);
    head.appendChild(titles);

    const spacer = document.createElement('div');
    spacer.className = 'mf-reorder-spacer';
    head.appendChild(spacer);

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mf-reorder-btn';
    cancel.textContent = t('builder.reorder.cancel', 'Cancel');
    cancel.addEventListener('click', () => close());
    head.appendChild(cancel);

    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'mf-reorder-btn primary';
    done.textContent = t('builder.reorder.done', 'I am done reordering');
    done.addEventListener('click', () => { apply(); close(); });
    head.appendChild(done);

    const list = document.createElement('div');
    list.className = 'mf-reorder-list';

    overlay.appendChild(head);
    overlay.appendChild(list);
    host.appendChild(overlay);

    renderRows();

    setButtonLabel(document.getElementById('mf-reorder-toggle'), t('builder.reorder.close', 'Close reorder'));
  }

  // ── toolbar button ───────────────────────────────────────────────

  /** The top bar buttons carry their text in a .lbl span; plain textContent wipes the icon. */
  function setButtonLabel(button: HTMLElement | null, text: string) {
    if (!button) return;
    const label = button.querySelector('.lbl');
    if (label) label.textContent = text;
    else button.textContent = text;
  }

  function installButton() {
    if (document.getElementById('mf-reorder-toggle')) return true;

    const button = document.createElement('button');
    button.id = 'mf-reorder-toggle';
    button.type = 'button';
    button.title = t('builder.reorder.tooltip', 'Put the fields in order without dragging them across the canvas');

    // [2026-08-17] First choice: the tool row in the top bar, which is where Umbraco Forms
    // keeps Reorder (next to "Add page to start / end of form"). The button used to sit on
    // a bar of its own above the canvas — a whole band of white for one button, which is
    // what the owner marked. That bar is only built now if there is no tool row to join,
    // which is the case on hosts still running the old topbar markup.
    const toolbar = document.querySelector<HTMLElement>('.mf-secondary-toolbar');
    if (toolbar) {
      button.className = 'mf-secondary-tool mf-reorder-tool';
      button.setAttribute('data-tip', t('builder.reorder.open', 'Reorder'));
      button.setAttribute('aria-label', t('builder.reorder.open', 'Reorder'));
      button.innerHTML = '<i class="fa-solid fa-arrow-down-short-wide"></i>' +
        '<span class="mf-secondary-tool-label lbl"></span>';
      setButtonLabel(button, t('builder.reorder.open', 'Reorder'));
      button.addEventListener('click', () => open());
      toolbar.appendChild(button);
      ensureStyles();
      return true;
    }

    const dropzone = document.getElementById('mf-canvas-dropzone');
    if (!dropzone) return false;

    const bar = document.createElement('div');
    bar.className = 'mf-reorder-bar';

    button.className = 'mf-reorder-btn';
    button.innerHTML = '<i class="fa-solid fa-arrow-down-short-wide"></i><span class="lbl"></span>';
    setButtonLabel(button, t('builder.reorder.open', 'Reorder'));
    button.addEventListener('click', () => open());

    bar.appendChild(button);

    // Sibling ABOVE the scroll area, not a child of it: #mf-canvas-dropzone lays its children
    // out in a row, so a bar dropped inside became a tall column beside the form card and
    // squeezed the canvas — photographed on form 104 before this was moved.
    const host = dropzone.parentElement;
    if (host) host.insertBefore(bar, dropzone);
    else dropzone.insertBefore(bar, dropzone.firstChild);

    ensureStyles();
    return true;
  }

  function waitForTopbar() {
    if (installButton()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (installButton() || attempts > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForTopbar);
  } else {
    waitForTopbar();
  }

  if (B.registerModule) {
    B.registerModule('reorder', { open, close, isOpen: () => !!overlay });
  }
})();
