/**
 * MegaForm Card View Designer — popup with 12-col drag-drop grid builder.
 *
 * Output bundle:  Assets/js/megaform-view-designer-card.js
 * Entry:          window.MFCardDesigner.open({ moduleId, formId, fields, current, onSaved })
 *
 * Same shape as list-designer but the canvas is a 12-column responsive grid
 * (each cell can span 1–12 cols). Card output is wrapped in a CSS grid that
 * repeats per submission.
 *
 * Persistence: writes ModuleConfig.CardTemplate as a JSON CardDesignSpec;
 * CardFields stays a CSV of selected keys for legacy renderers.
 *
 * Badge: CardDesigner v20260503-02
 */

import {
  h,
  openPopup,
  createFieldPalette,
  makeDropZone,
  defaultTokens,
  createTokenPanel,
  insertAtCursor,
  htmlEscape,
  fieldsCsv,
  parseDesignSpec,
  serializeDesignSpec,
  saveModuleConfig,
  type FieldDef,
  type ModuleConfig,
  type CardDesignSpec,
} from './shared';

const BADGE = 'CardDesigner v20260503-02';
if (typeof window !== 'undefined') (window as any).__MF_CARD_DESIGNER_BADGE__ = BADGE;

export interface CardDesignerOpts {
  moduleId: number;
  formId: number;
  formTitle?: string;
  fields: FieldDef[];
  current: ModuleConfig;
  onSaved?: (cfg: ModuleConfig) => void;
}

const DEFAULT_SPEC: CardDesignSpec = {
  version: 1,
  cells: [],
  cardTemplate: '',
  cardMinWidth: 260,
  gridGap: 16,
  pageSize: 0,
};

export function open(opts: CardDesignerOpts): void {
  const fieldsByKey = new Map<string, FieldDef>();
  for (const f of opts.fields) fieldsByKey.set(f.key, f);

  const existingTemplate = opts.current.cardTemplate || '';
  const existingFieldsCsv = opts.current.cardFields || '';
  let spec: CardDesignSpec = parseDesignSpec<CardDesignSpec>(existingTemplate, { ...DEFAULT_SPEC });
  if (!spec.cells || !spec.cells.length) {
    const keys = existingFieldsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    spec = {
      version: 1,
      cells: keys.length ? keys.map((k) => ({ key: k, span: 12 })) : [],
      cardTemplate: existingTemplate || '',
      cardMinWidth: 260,
      gridGap: 16,
      pageSize: 0,
    };
  }

  let activeTab: 'visual' | 'html' | 'js' = 'visual';
  let selectedIndex = -1;
  // Forward-declare; assigned below in the Layout block.
  let paletteHandle: import('./shared').FieldPaletteHandle | null = null;

  const canvasInner = h('div', { class: 'mf-vd-canvas-inner' });
  const tabsBar = h('div', { class: 'mf-vd-tabs' });
  const tabBody = h('div', { class: 'mf-vd-tab-body' });
  canvasInner.append(tabsBar, tabBody);

  const tabButtons: Record<string, HTMLButtonElement> = {};
  for (const tab of ['visual', 'html', 'js'] as const) {
    const btn = h('button', { class: 'mf-vd-tab', onclick: () => { activeTab = tab; renderTab(); } },
      tab === 'visual' ? 'Visual' : tab === 'html' ? 'HTML' : 'JavaScript');
    tabButtons[tab] = btn;
    tabsBar.appendChild(btn);
  }

  // ── Visual: 12-col grid ─────────────────────────────────────────────────
  const dropEl = h('div', { class: 'mf-vd-drop mf-vd-grid12', 'data-placeholder': 'Tick a field on the left, or drop one here to add a card cell →' });

  // dedupe: a given form field can only land in the grid once. Re-dropping
  // (or re-ticking) is a no-op. Custom HTML cells are exempt — admins may
  // want multiple custom blocks.
  function addFieldOnce(key: string): void {
    if (spec.cells.some((c) => c.key === key)) return;
    spec.cells.push({ key, span: 6 });
    renderGrid();
    syncCardTemplate();
    paletteHandle?.refresh();
  }

  function removeAllOf(key: string): void {
    const before = spec.cells.length;
    spec.cells = spec.cells.filter((c) => c.key !== key);
    if (spec.cells.length === before) return;
    if (selectedIndex >= spec.cells.length) selectedIndex = -1;
    renderGrid();
    renderProps();
    syncCardTemplate();
  }

  makeDropZone(dropEl, (data: FieldDef) => {
    if (!data?.key) return;
    addFieldOnce(data.key);
  });

  function renderGrid(): void {
    dropEl.innerHTML = '';
    if (!spec.cells.length) { dropEl.classList.add('mf-vd-empty'); return; }
    dropEl.classList.remove('mf-vd-empty');
    spec.cells.forEach((cell, idx) => {
      const fdef = cell.key ? fieldsByKey.get(cell.key) : undefined;
      const label = cell.key ? (fdef?.label || cell.key) : (cell.html ? 'Custom HTML' : 'Empty');
      const cellEl = h('div', {
        class: `mf-vd-cell col-${cell.span} ${idx === selectedIndex ? 'selected' : ''}`,
        draggable: 'true',
        onclick: () => { selectedIndex = idx; renderGrid(); renderProps(); },
        ondragstart: (e: DragEvent) => {
          e.dataTransfer!.setData('text/x-mf-cell-index', String(idx));
          e.dataTransfer!.effectAllowed = 'move';
        },
        ondragover: (e: DragEvent) => {
          if (e.dataTransfer?.types.includes('text/x-mf-cell-index')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cellEl.classList.add('mf-vd-cell-drop-target');
          }
        },
        ondragleave: () => cellEl.classList.remove('mf-vd-cell-drop-target'),
        ondrop: (e: DragEvent) => {
          cellEl.classList.remove('mf-vd-cell-drop-target');
          const fromRaw = e.dataTransfer?.getData('text/x-mf-cell-index');
          if (fromRaw == null) return;
          e.preventDefault();
          const from = parseInt(fromRaw, 10);
          if (isNaN(from) || from === idx) return;
          const moved = spec.cells.splice(from, 1)[0];
          spec.cells.splice(idx, 0, moved);
          if (selectedIndex === from) selectedIndex = idx;
          renderGrid();
          syncCardTemplate();
        },
      },
        h('button', {
          class: 'mf-vd-cell-del', title: 'Remove cell',
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            spec.cells.splice(idx, 1);
            selectedIndex = -1;
            renderGrid();
            renderProps();
            syncCardTemplate();
            paletteHandle?.refresh();
          },
        }, '×'),
        h('div', { class: 'mf-vd-cell-head' },
          h('span', { class: 'mf-vd-cell-drag', title: 'Drag to reorder' }, '⋮⋮'),
          h('span', { class: 'mf-vd-cell-label' }, label),
          h('span', { class: 'mf-vd-pal-type' }, `col-${cell.span}`)
        ),
        cell.key ? h('span', { class: 'mf-vd-cell-token' }, `{{field:${cell.key}}}`)
                 : h('span', { class: 'mf-vd-cell-token' }, cell.html ? 'inline html' : '—')
      );
      dropEl.appendChild(cellEl);
    });
  }

  function buildCardTemplate(): string {
    if (!spec.cells.length) return '';
    const gap = spec.gridGap ?? 12;
    const inner = spec.cells.map((cell) => {
      const start = `<div style="grid-column:span ${cell.span};font-size:13px;color:#1f2a44">`;
      const body = cell.key
        ? `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em">${htmlEscape(cell.key)}</div><div>{{field:${cell.key}}}</div>`
        : (cell.html || '');
      return `${start}${body}</div>`;
    }).join('');
    return `<article class="mf-sub-card" style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;display:grid;grid-template-columns:repeat(12,1fr);gap:${gap}px;box-shadow:0 1px 3px rgba(15,23,42,.04)">${inner}</article>`;
  }

  function syncCardTemplate(): void {
    spec.cardTemplate = buildCardTemplate();
    if (htmlTextarea) htmlTextarea.value = spec.cardTemplate;
  }

  let htmlTextarea: HTMLTextAreaElement | null = null;
  function buildHtmlTab(): HTMLElement {
    const ta = h('textarea', {
      class: 'mf-vd-textarea', rows: '14',
      placeholder: '<article class="mf-sub-card">...{{field:first_name}}...</article>',
      oninput: () => { spec.cardTemplate = ta.value; },
    }) as HTMLTextAreaElement;
    ta.value = spec.cardTemplate || buildCardTemplate();
    htmlTextarea = ta;
  return h('div', {}, ta, h('div', { class: 'mf-vd-help' }, 'Edit the raw <article> markup. Tokens: {{field:KEY}}, {{submission:id|date|status|user}}, {{form:id}}, {{module:id}}, {{query:view}}, {{user:isAdmin}}, and <mf-repeat each=\"item in field:KEY\">...</mf-repeat>.'));
  }

  let jsTextarea: HTMLTextAreaElement | null = null;
  function buildJsTab(): HTMLElement {
    const ta = h('textarea', {
      class: 'mf-vd-textarea', rows: '14',
      placeholder: '// (rows, root) => { ... }\nfor (const card of root.querySelectorAll(".mf-sub-card")) {\n  card.addEventListener("click", () => { /* ... */ });\n}',
      oninput: () => { spec.jsHook = ta.value; },
    }) as HTMLTextAreaElement;
    ta.value = spec.jsHook || '';
    jsTextarea = ta;
    return h('div', {}, ta, h('div', { class: 'mf-vd-help' }, 'JavaScript runs once after cards render. Receives `(rows, root)`. Runs in user browser.'));
  }

  function renderTab(): void {
    for (const t of Object.keys(tabButtons)) tabButtons[t].classList.toggle('active', t === activeTab);
    tabBody.innerHTML = '';
    if (activeTab === 'visual') {
      const intro = h('div', { class: 'mf-vd-help', style: { marginBottom: '10px' } }, 'Drag fields onto the 12-column grid. Click a cell to set its column span. Drag cells to reorder.');
      tabBody.append(intro, dropEl);
      renderGrid();
    } else if (activeTab === 'html') {
      tabBody.appendChild(buildHtmlTab());
    } else {
      tabBody.appendChild(buildJsTab());
    }
  }

  const props = h('div', { class: 'mf-vd-pane mf-vd-props' });

  function renderProps(): void {
    props.innerHTML = '';
    props.appendChild(h('h3', {}, 'Properties'));

    if (selectedIndex >= 0 && spec.cells[selectedIndex]) {
      const cell = spec.cells[selectedIndex];
      props.append(
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Selected cell'),
          h('div', { style: { fontSize: '13px', fontWeight: '600', color: '#1f2a44' } }, cell.key || (cell.html ? 'Custom HTML' : 'Empty'))
        ),
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Column span (1–12)'),
          h('input', {
            class: 'mf-vd-input', type: 'number', min: '1', max: '12', value: String(cell.span),
            oninput: (e: Event) => { cell.span = Math.max(1, Math.min(12, parseInt((e.target as HTMLInputElement).value, 10) || 6)); renderGrid(); syncCardTemplate(); },
          })
        ),
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Custom HTML (overrides field render)'),
          h('textarea', {
            class: 'mf-vd-textarea', rows: '4', placeholder: '<strong>{{field:first_name}}</strong>',
            oninput: (e: Event) => { cell.html = (e.target as HTMLTextAreaElement).value; syncCardTemplate(); },
          }, cell.html || '')
        ),
      );
    }

    props.append(
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Card min width (px)'),
        h('input', {
          class: 'mf-vd-input', type: 'number', min: '120', max: '600', value: String(spec.cardMinWidth || 260),
          oninput: (e: Event) => { spec.cardMinWidth = parseInt((e.target as HTMLInputElement).value, 10) || 260; },
        }),
        h('div', { class: 'mf-vd-help' }, 'Cards grow/shrink responsively above this width.')
      ),
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Grid gap (px)'),
        h('input', {
          class: 'mf-vd-input', type: 'number', min: '0', max: '40', value: String(spec.gridGap || 16),
          oninput: (e: Event) => { spec.gridGap = parseInt((e.target as HTMLInputElement).value, 10) || 16; syncCardTemplate(); },
        })
      ),
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Page size'),
        h('input', {
          class: 'mf-vd-input', type: 'number', min: '0', value: String(spec.pageSize || 0),
          oninput: (e: Event) => { spec.pageSize = parseInt((e.target as HTMLInputElement).value, 10) || 0; },
        }),
        h('div', { class: 'mf-vd-help' }, '0 = show all cards. >0 enables pagination.')
      ),
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Empty state HTML'),
        h('textarea', {
          class: 'mf-vd-textarea', rows: '3', placeholder: '<div>No submissions yet</div>',
          oninput: (e: Event) => { spec.emptyHtml = (e.target as HTMLTextAreaElement).value; },
        }, spec.emptyHtml || '')
      ),
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Custom CSS'),
        h('textarea', {
          class: 'mf-vd-textarea', rows: '4', placeholder: '.mf-sub-card-grid { background:#f8fafc }',
          oninput: (e: Event) => { spec.css = (e.target as HTMLTextAreaElement).value; },
        }, spec.css || '')
      ),
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Tokens (click to insert)'),
        createTokenPanel(defaultTokens(opts.fields), (token) => {
          const target = activeTab === 'html' ? htmlTextarea : activeTab === 'js' ? jsTextarea : null;
          if (target) insertAtCursor(target, token);
        })
      )
    );
  }

  paletteHandle = createFieldPalette({
    fields: opts.fields,
    isSelected: (key) => spec.cells.some((c) => c.key === key),
    onAdd: (f) => addFieldOnce(f.key),
    onRemoveAll: (key) => removeAllOf(key),
  });

  const grid = h('div', { class: 'mf-vd-grid' }, paletteHandle.el, h('div', { class: 'mf-vd-pane mf-vd-canvas' }, canvasInner), props);

  renderTab();
  renderProps();

  openPopup({
    title: 'Card View Designer',
    subtitle: opts.formTitle ? `Form: ${htmlEscape(opts.formTitle)} (#${opts.formId})` : `Form #${opts.formId}`,
    body: grid,
    width: '1280px',
    saveLabel: 'Save card design',
    reloadOnSave: true,
    onSave: async () => {
      const merged: ModuleConfig = { ...opts.current };
      merged.viewMode = 'card';
      merged.cardFields = fieldsCsv(spec.cells.filter((c) => c.key).map((c) => ({ key: c.key! })));
      merged.cardTemplate = serializeDesignSpec(spec);
      const result = await saveModuleConfig(merged, merged.siteId);
      if (!result.ok) {
        alert(`Save failed (HTTP ${result.status}): ${result.body || 'unknown error'}`);
        return false;
      }
      if (opts.onSaved) opts.onSaved(merged);
      return true;
    },
  });
}

(function bootstrap() {
  const w = window as any;
  w.MFCardDesigner = { open, badge: BADGE };
})();

export const badge = BADGE;
