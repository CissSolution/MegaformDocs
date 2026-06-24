/**
 * MegaForm List View Designer — popup with drag-drop column builder.
 *
 * Output bundle:  Assets/js/megaform-view-designer-list.js
 * Entry:          window.MFListDesigner.open({ moduleId, formId, fields, current, onSaved })
 *
 * Sections:
 *   - Field palette (left): every field in the chosen form, draggable
 *   - Canvas (center): tabs Visual | HTML | JS — Visual is a horizontal row
 *     of column cells, drop a field to add a column, drag to reorder, click ×
 *     to remove. Width input per cell.
 *   - Properties (right): pagination, empty state, custom CSS, token list
 *
 * Persistence: writes to ModuleConfig.ListTemplate as a JSON ListDesignSpec
 * (ListFields stays a CSV of selected keys for legacy renderers).
 *
 * Badge: ListDesigner v20260503-02
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
  type ListDesignSpec,
} from './shared';

const BADGE = 'ListDesigner v20260503-02';
if (typeof window !== 'undefined') (window as any).__MF_LIST_DESIGNER_BADGE__ = BADGE;

export interface ListDesignerOpts {
  moduleId: number;
  formId: number;
  formTitle?: string;
  fields: FieldDef[];
  current: ModuleConfig;             // existing module config (for save round-trip)
  onSaved?: (cfg: ModuleConfig) => void;
}

const DEFAULT_SPEC: ListDesignSpec = {
  version: 1,
  fields: [],
  rowTemplate: '',
  pageSize: 0,
};

export function open(opts: ListDesignerOpts): void {
  const fieldsByKey = new Map<string, FieldDef>();
  for (const f of opts.fields) fieldsByKey.set(f.key, f);

  // ── Restore existing spec (or migrate from legacy CSV+HTML) ─────────────
  const existingTemplate = opts.current.listTemplate || '';
  const existingFieldsCsv = opts.current.listFields || '';
  let spec: ListDesignSpec = parseDesignSpec<ListDesignSpec>(existingTemplate, { ...DEFAULT_SPEC });
  if (spec === DEFAULT_SPEC || !spec.fields?.length) {
    // Migrate from legacy CSV: build columns at equal width
    const keys = existingFieldsCsv.split(',').map((s) => s.trim()).filter(Boolean);
    if (keys.length) {
      const w = Math.floor(100 / keys.length);
      spec = { version: 1, fields: keys.map((k) => ({ key: k, widthPercent: w })), rowTemplate: existingTemplate || '', pageSize: 0 };
    } else {
      spec = { ...DEFAULT_SPEC };
    }
  }

  // ── State ───────────────────────────────────────────────────────────────
  let activeTab: 'visual' | 'html' | 'js' = 'visual';
  let selectedIndex = -1;
  // Forward-declare so addFieldOnce/removeAllOf can call .refresh() — actual
  // handle is assigned in the layout block below, before any user interaction.
  let paletteHandle: import('./shared').FieldPaletteHandle | null = null;

  // ── Build canvas ────────────────────────────────────────────────────────
  const canvasInner = h('div', { class: 'mf-vd-canvas-inner' });
  const tabsBar = h('div', { class: 'mf-vd-tabs' });
  const tabBody = h('div', { class: 'mf-vd-tab-body' });
  canvasInner.append(tabsBar, tabBody);

  const tabButtons: Record<string, HTMLButtonElement> = {};
  for (const tab of ['visual', 'html', 'js'] as const) {
    const btn = h('button', {
      class: 'mf-vd-tab',
      onclick: () => { activeTab = tab; renderTab(); },
    }, tab === 'visual' ? 'Visual' : tab === 'html' ? 'HTML' : 'JavaScript');
    tabButtons[tab] = btn;
    tabsBar.appendChild(btn);
  }

  // ── Visual tab body ─────────────────────────────────────────────────────
  const dropEl = h('div', { class: 'mf-vd-drop mf-vd-row', 'data-placeholder': 'Tick a field on the left, or drop one here to add a column →' });

  // dedupe-aware add: silently no-op if the field is already in the layout.
  // The user gets visual feedback because the palette checkbox already shows
  // the field as selected.
  function addFieldOnce(key: string): void {
    if (spec.fields.some((c) => c.key === key)) return;
    spec.fields.push({ key, widthPercent: 0 });
    rebalanceWidths();
    renderRow();
    syncRowTemplate();
    paletteHandle?.refresh();
  }

  function removeAllOf(key: string): void {
    const before = spec.fields.length;
    spec.fields = spec.fields.filter((c) => c.key !== key);
    if (spec.fields.length === before) return;
    rebalanceWidths();
    if (selectedIndex >= spec.fields.length) selectedIndex = -1;
    renderRow();
    renderProps();
    syncRowTemplate();
  }

  makeDropZone(dropEl, (data: FieldDef) => {
    if (!data?.key) return;
    addFieldOnce(data.key);
  });

  // Distribute width % equally across all columns. Always called after add/
  // remove because the previous "skip if sum is already 100" optimisation
  // left newly-added columns at 0% (one column ended up at 100, the rest at
  // 0). The user can still override per-column via the Properties pane.
  function rebalanceWidths(): void {
    if (!spec.fields.length) return;
    const w = Math.floor(100 / spec.fields.length);
    const remainder = 100 - w * spec.fields.length;
    spec.fields.forEach((f, i) => { f.widthPercent = w + (i === 0 ? remainder : 0); });
  }

  function renderRow(): void {
    dropEl.innerHTML = '';
    if (!spec.fields.length) { dropEl.classList.add('mf-vd-empty'); return; }
    dropEl.classList.remove('mf-vd-empty');
    spec.fields.forEach((cell, idx) => {
      const fdef = fieldsByKey.get(cell.key);
      const label = fdef?.label || cell.key;
      const cellEl = h('div', {
        class: 'mf-vd-cell' + (idx === selectedIndex ? ' selected' : ''),
        draggable: 'true',
        style: { flex: `0 0 ${cell.widthPercent}%` },
        onclick: () => { selectedIndex = idx; renderRow(); renderProps(); },
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
          const moved = spec.fields.splice(from, 1)[0];
          spec.fields.splice(idx, 0, moved);
          // selection follows the moved cell
          if (selectedIndex === from) selectedIndex = idx;
          renderRow();
          syncRowTemplate();
        },
      },
        h('button', {
          class: 'mf-vd-cell-del',
          title: 'Remove column',
          onclick: (e: MouseEvent) => {
            e.stopPropagation();
            spec.fields.splice(idx, 1);
            rebalanceWidths();
            selectedIndex = -1;
            renderRow();
            renderProps();
            syncRowTemplate();
            paletteHandle?.refresh();
          },
        }, '×'),
        h('div', { class: 'mf-vd-cell-head' },
          h('span', { class: 'mf-vd-cell-drag', title: 'Drag to reorder' }, '⋮⋮'),
          h('span', { class: 'mf-vd-cell-label' }, label)
        ),
        h('span', { class: 'mf-vd-cell-token' }, `{{field:${cell.key}}}`)
      );
      dropEl.appendChild(cellEl);
    });
  }

  // Builds the legacy <tr> string from the current cell layout. Admins can
  // still hand-edit via the HTML tab and we'll preserve that.
  function buildRowTemplate(): string {
    if (!spec.fields.length) return '';
    const cells = spec.fields.map((cell) => {
      const w = cell.widthPercent || 0;
      const align = cell.align ? `text-align:${cell.align};` : '';
      return `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;width:${w}%;${align}">{{field:${cell.key}}}</td>`;
    }).join('');
    return `<tr class="mf-sub-row">${cells}</tr>`;
  }

  function syncRowTemplate(): void {
    spec.rowTemplate = buildRowTemplate();
    if (htmlTextarea) htmlTextarea.value = spec.rowTemplate;
  }

  // ── HTML tab body ───────────────────────────────────────────────────────
  let htmlTextarea: HTMLTextAreaElement | null = null;
  function buildHtmlTab(): HTMLElement {
    const ta = h('textarea', {
      class: 'mf-vd-textarea',
      rows: '14',
      placeholder: '<tr class="mf-sub-row"><td>{{field:first_name}}</td><td>{{field:email}}</td></tr>',
      oninput: () => { spec.rowTemplate = ta.value; },
    }) as HTMLTextAreaElement;
    ta.value = spec.rowTemplate || buildRowTemplate();
    htmlTextarea = ta;
  const help = h('div', { class: 'mf-vd-help' }, 'Edit the raw <tr> markup. Tokens: {{field:KEY}}, {{submission:id|date|status|user}}, {{form:id}}, {{module:id}}, {{query:view}}, {{user:isAdmin}}, and <mf-repeat each=\"item in field:KEY\">...</mf-repeat>. Visual changes overwrite this template.');
    return h('div', {}, ta, help);
  }

  // ── JS tab body ─────────────────────────────────────────────────────────
  let jsTextarea: HTMLTextAreaElement | null = null;
  function buildJsTab(): HTMLElement {
    const ta = h('textarea', {
      class: 'mf-vd-textarea',
      rows: '14',
      placeholder: '// (rows, root) => { ... }\n// e.g. add row click handlers\nfor (const tr of root.querySelectorAll(".mf-sub-row")) {\n  tr.addEventListener("click", () => { /* ... */ });\n}',
      oninput: () => { spec.jsHook = ta.value; },
    }) as HTMLTextAreaElement;
    ta.value = spec.jsHook || '';
    jsTextarea = ta;
    return h('div', {},
      ta,
      h('div', { class: 'mf-vd-help' }, 'JavaScript runs once after the list renders. Receives `(rows, root)`. Runs in user browser — be careful with untrusted input.')
    );
  }

  function renderTab(): void {
    for (const t of Object.keys(tabButtons)) tabButtons[t].classList.toggle('active', t === activeTab);
    tabBody.innerHTML = '';
    if (activeTab === 'visual') {
      const intro = h('div', { class: 'mf-vd-help', style: { marginBottom: '10px' } }, 'Drag fields from the left into the row below. Click a column to edit its width. Drag columns to reorder.');
      tabBody.append(intro, dropEl);
      renderRow();
    } else if (activeTab === 'html') {
      tabBody.appendChild(buildHtmlTab());
    } else {
      tabBody.appendChild(buildJsTab());
    }
  }

  // ── Right pane: properties + tokens ─────────────────────────────────────
  const props = h('div', { class: 'mf-vd-pane mf-vd-props' });

  function renderProps(): void {
    props.innerHTML = '';
    props.appendChild(h('h3', {}, 'Properties'));

    if (selectedIndex >= 0 && spec.fields[selectedIndex]) {
      const cell = spec.fields[selectedIndex];
      const fdef = fieldsByKey.get(cell.key);
      props.append(
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Selected column'),
          h('div', { style: { fontSize: '13px', fontWeight: '600', color: '#1f2a44' } }, fdef?.label || cell.key),
          h('div', { class: 'mf-vd-cell-token' }, `{{field:${cell.key}}}`)
        ),
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Width %'),
          h('input', {
            class: 'mf-vd-input', type: 'number', min: '5', max: '100', value: String(cell.widthPercent || 0),
            oninput: (e: Event) => { cell.widthPercent = parseInt((e.target as HTMLInputElement).value, 10) || 0; renderRow(); syncRowTemplate(); },
          })
        ),
        h('div', { class: 'mf-vd-prop-block' },
          h('label', {}, 'Align'),
          (() => {
            const sel = h('select', {
              class: 'mf-vd-input',
              onchange: (e: Event) => { cell.align = ((e.target as HTMLSelectElement).value || 'left') as any; syncRowTemplate(); },
            },
              h('option', { value: 'left' }, 'Left'),
              h('option', { value: 'center' }, 'Center'),
              h('option', { value: 'right' }, 'Right'),
            ) as HTMLSelectElement;
            sel.value = cell.align || 'left';
            return sel;
          })()
        ),
      );
    }

    props.append(
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Page size'),
        h('input', {
          class: 'mf-vd-input', type: 'number', min: '0', value: String(spec.pageSize || 0),
          oninput: (e: Event) => { spec.pageSize = parseInt((e.target as HTMLInputElement).value, 10) || 0; },
        }),
        h('div', { class: 'mf-vd-help' }, '0 = show all rows. >0 enables pagination.')
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
          class: 'mf-vd-textarea', rows: '4', placeholder: '.mf-sub-list { border:1px solid #ccc }',
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

  // ── Layout ──────────────────────────────────────────────────────────────
  paletteHandle = createFieldPalette({
    fields: opts.fields,
    isSelected: (key) => spec.fields.some((c) => c.key === key),
    onAdd: (f) => addFieldOnce(f.key),
    onRemoveAll: (key) => removeAllOf(key),
  });

  const grid = h('div', { class: 'mf-vd-grid' }, paletteHandle.el, h('div', { class: 'mf-vd-pane mf-vd-canvas' }, canvasInner), props);

  renderTab();
  renderProps();

  // ── Save handler ────────────────────────────────────────────────────────
  openPopup({
    title: 'List View Designer',
    subtitle: opts.formTitle ? `Form: ${htmlEscape(opts.formTitle)} (#${opts.formId})` : `Form #${opts.formId}`,
    body: grid,
    width: '1280px',
    saveLabel: 'Save list design',
    reloadOnSave: true,
    onSave: async () => {
      // Persist back into ModuleConfig.listFields + listTemplate (JSON spec)
      const merged: ModuleConfig = { ...opts.current };
      merged.viewMode = 'list';
      merged.listFields = fieldsCsv(spec.fields);
      merged.listTemplate = serializeDesignSpec(spec);
      // Keep cardFields/cardTemplate untouched
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
  w.MFListDesigner = { open, badge: BADGE };
})();

export const badge = BADGE;
