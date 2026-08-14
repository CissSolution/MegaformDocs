// ============================================================================
//  MegaForm — Submissions Advanced Filter + Presets
//  Pixel-parity port of the redesign mock's `submission-filter-bar.tsx`
//  (mega-form-admin-redesign(10)). The mock supplies the UI + interaction;
//  the FIELD SET is adapted intelligently to MegaForm's REAL columns
//  (form response fields + real metadata + Device derived from user-agent).
//  Filtering is client-side over the currently-loaded page — same model as the
//  existing `applyDateRange` in SubmissionsShell.
//
//  Self-contained: the shell passes a small deps bag (ic/T/onChange). No
//  floating-popover infra existed in the shell, so a minimal one lives here.
// ============================================================================

// ── Types (mirror the mock) ────────────────────────────────────────────────
export type AdvFieldType =
  | 'text' | 'email' | 'phone' | 'select' | 'date' | 'number'
  | 'location' | 'device' | 'url' | 'textarea';

export interface AdvFilterField {
  key: string;
  label: string;
  type: AdvFieldType;
  group: 'response' | 'metadata' | 'system';
  options?: string[];
}

export type AdvOperator =
  | 'contains' | 'not_contains' | 'equals' | 'not_equals'
  | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'before' | 'after' | 'between'
  | 'is' | 'is_not';

export interface AdvActiveFilter {
  id: string;
  field: AdvFilterField;
  operator: AdvOperator;
  value: string;
  value2?: string;
}

export interface AdvSavedPreset {
  id: string;
  name: string;
  filters: AdvActiveFilter[];
  searchScope: string;
  dateRange: string;
}

export interface AdvDeps {
  ic: (key: string, size?: number) => string;
  T: (key: string, fallback: string, params?: Record<string, string | number>) => string;
  /** Re-render the shell after state changes (apply/remove/load-preset). */
  onChange: () => void;
  /** Current client-side date-range key (for preset save/load parity). */
  getDateRange: () => string;
  setDateRange: (v: string) => void;
  /** Storage bucket for per-form presets: 'f<formId>' or 'all' (mirrors the columns store). */
  getFormKey: () => string;
}

// ── Module state (same lifetime model as the shell's `_dateRange`) ──────────
export const advState: {
  searchScope: string;
  filters: AdvActiveFilter[];
  presets: AdvSavedPreset[];
} = {
  searchScope: 'all',
  filters: [],
  presets: [],
};

// ── Preset persistence ─────────────────────────────────────────────────────
// Presets used to live only in module state, so every reload threw them away.
// Persist them exactly like the column layout (`mf-subs-columns-v4`): a map of
// bucket → presets, keyed per form, so form A's filters never reference form B's
// fields. The built-in preset is regenerated (not stored) so its name follows the
// active locale instead of freezing at whatever locale created it.
const PRESETS_STORE_KEY = 'mf-subs-presets-v1';
const DEFAULT_PRESET_ID = 'preset-new';
let _presetsBucket: string | null = null;

function readPresetStore(): Record<string, AdvSavedPreset[]> {
  try {
    const raw = localStorage.getItem(PRESETS_STORE_KEY);
    const m = raw ? JSON.parse(raw) : null;
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch { return {}; }
}

/** Reject anything that isn't a preset we wrote (hand-edited/older storage). */
function isValidPreset(p: any): p is AdvSavedPreset {
  return !!p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.filters)
    && p.filters.every((f: any) => f && f.field && typeof f.field.key === 'string' && typeof f.operator === 'string');
}

function persistPresets(d: AdvDeps): void {
  try {
    const m = readPresetStore();
    m[d.getFormKey()] = advState.presets.filter((p) => p.id !== DEFAULT_PRESET_ID);
    localStorage.setItem(PRESETS_STORE_KEY, JSON.stringify(m));
  } catch { /* private mode / quota → presets stay in-memory for this session */ }
}

/** Load this form's saved presets on first render for that form (bucket change). */
function ensurePresetsLoaded(d: AdvDeps): void {
  const bucket = d.getFormKey();
  if (_presetsBucket === bucket) return;
  const stored = readPresetStore()[bucket];
  advState.presets = [
    { id: DEFAULT_PRESET_ID, name: d.T('subs.advf.preset_new_subs', 'New submissions'), filters: [], searchScope: 'all', dateRange: '7d' },
    ...(Array.isArray(stored) ? stored.filter(isValidPreset) : []),
  ];
  _presetsBucket = bucket;
}

export function advActiveCount(searchQuery: string): number {
  return advState.filters.length + (searchQuery ? 1 : 0);
}

export function resetAdvFilters(): void {
  advState.searchScope = 'all';
  advState.filters = [];
}

// ── Operators per field type (mirror the mock) ─────────────────────────────
// `key` is the i18n key, `label` the en-US fallback. The same AdvOperator can read
// differently per field type ('equals' = "is exactly" for text, "on" for dates), so
// the key lives on the entry, not on the operator value. Number ops are symbols.
interface OpDef { value: AdvOperator; key: string; label: string }
const TEXT_OPS: OpDef[] = [
  { value: 'contains', key: 'subs.advf.op_contains', label: 'contains' },
  { value: 'not_contains', key: 'subs.advf.op_not_contains', label: 'does not contain' },
  { value: 'equals', key: 'subs.advf.op_is_exactly', label: 'is exactly' },
  { value: 'not_equals', key: 'subs.advf.op_is_not', label: 'is not' },
  { value: 'starts_with', key: 'subs.advf.op_starts_with', label: 'starts with' },
  { value: 'ends_with', key: 'subs.advf.op_ends_with', label: 'ends with' },
  { value: 'is_empty', key: 'subs.advf.op_is_empty', label: 'is empty' },
  { value: 'is_not_empty', key: 'subs.advf.op_is_not_empty', label: 'is not empty' },
];
const SELECT_OPS: OpDef[] = [
  { value: 'is', key: 'subs.advf.op_is', label: 'is' },
  { value: 'is_not', key: 'subs.advf.op_is_not', label: 'is not' },
  { value: 'is_empty', key: 'subs.advf.op_is_empty', label: 'is empty' },
  { value: 'is_not_empty', key: 'subs.advf.op_is_not_empty', label: 'is not empty' },
];
const DATE_OPS: OpDef[] = [
  { value: 'before', key: 'subs.advf.op_before', label: 'before' },
  { value: 'after', key: 'subs.advf.op_after', label: 'after' },
  { value: 'between', key: 'subs.advf.op_between', label: 'between' },
  { value: 'equals', key: 'subs.advf.op_on', label: 'on' },
];
const NUMBER_OPS: OpDef[] = [
  { value: 'equals', key: '', label: '=' },
  { value: 'gt', key: '', label: '>' },
  { value: 'lt', key: '', label: '<' },
  { value: 'gte', key: '', label: '>=' },
  { value: 'lte', key: '', label: '<=' },
];
function opsFor(type: AdvFieldType): OpDef[] {
  if (type === 'select' || type === 'device' || type === 'location') return SELECT_OPS;
  if (type === 'date') return DATE_OPS;
  if (type === 'number') return NUMBER_OPS;
  return TEXT_OPS;
}
function opLabel(d: AdvDeps, op: OpDef): string {
  return op.key ? d.T(op.key, op.label) : op.label;
}

// ── Field-type → icon key (mapped onto the shell's `ic()` registry) ─────────
const FIELD_ICON: Record<AdvFieldType, string> = {
  text: 'text', email: 'mail', phone: 'phone', select: 'tag', date: 'calendarDays',
  number: 'hash', location: 'mapPin', device: 'monitor', url: 'globe', textarea: 'alignLeft',
};

// Reuses the shell's existing date-range keys so a preset's summary line reads the
// same as the date-range picker above it.
const DATE_RANGE_KEYS: Record<string, [string, string]> = {
  all: ['subs.range_all', 'All time'],
  today: ['subs.range_today', 'Today'],
  '7d': ['subs.range_7d', 'Last 7 days'],
  '30d': ['subs.range_30d', 'Last 30 days'],
  '90d': ['subs.range_90d', 'Last 90 days'],
  year: ['subs.range_year', 'This year'],
};
function dateRangeLabel(d: AdvDeps, key: string): string {
  const e = DATE_RANGE_KEYS[key] || DATE_RANGE_KEYS.all;
  return d.T(e[0], e[1]);
}

// ── tiny DOM helpers (self-contained) ──────────────────────────────────────
function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function add(parent: HTMLElement, ...kids: Node[]): HTMLElement { kids.forEach(k => parent.appendChild(k)); return parent; }

function fieldIconHtml(d: AdvDeps, type: AdvFieldType, size = 14): string {
  return d.ic(FIELD_ICON[type] || 'text', size);
}

// ── Minimal floating popover (anchor → panel below, outside-click/Esc close) ─
interface PopoverHandle { close: () => void; panel: HTMLElement; }

function openPopover(
  anchor: HTMLElement,
  build: (h: PopoverHandle) => HTMLElement,
  opts?: { align?: 'start' | 'end'; width?: number },
): PopoverHandle {
  const align = opts?.align ?? 'start';
  const panel = el('div', 'mf-advf-pop');
  if (opts?.width) panel.style.width = opts.width + 'px';

  const handle: PopoverHandle = {
    panel,
    close: () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', reposition, true);
      window.removeEventListener('scroll', reposition, true);
      panel.remove();
    },
  };

  const onDoc = (e: Event) => {
    const t = e.target as Node;
    if (panel.contains(t) || anchor.contains(t)) return;
    handle.close();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); handle.close(); } };
  // The panel is `position:fixed` (see .mf-advf-pop), so these are VIEWPORT coords —
  // never add scrollX/scrollY. The admin panel renders inside `.mf-oq-surface.is-fs`
  // (position:fixed; overflow:auto), which scrolls independently of the window: a
  // document-coordinate panel would sit under the surface and never track the anchor.
  const reposition = () => {
    const r = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth || opts?.width || 288;
    const ph = panel.offsetHeight;
    // Flip above the anchor when the panel would overflow the viewport bottom —
    // in fullscreen the surface is exactly viewport-tall, so an overflowing panel
    // can never be scrolled into view.
    let top = r.bottom + 6;
    if (ph && top + ph > window.innerHeight - 8) {
      const above = r.top - 6 - ph;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - ph - 8);
    }
    panel.style.top = Math.round(top) + 'px';
    let left = align === 'end' ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    panel.style.left = Math.round(left) + 'px';
  };

  add(panel, build(handle));
  document.body.appendChild(panel);
  reposition();
  // defer listener attach so the opening click doesn't immediately close it
  setTimeout(() => {
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition, true);
    window.addEventListener('scroll', reposition, true);
  }, 0);
  return handle;
}

// ── Field picker list (grouped response/metadata/system) — mock parity ──────
function buildFieldList(
  d: AdvDeps, fields: AdvFilterField[], onPick: (f: AdvFilterField) => void,
): HTMLElement {
  const wrap = el('div', 'mf-advf-cmd');
  const searchWrap = el('div', 'mf-advf-cmd-search');
  add(searchWrap, el('span', 'mf-advf-cmd-search-ic', d.ic('search', 14)));
  const input = document.createElement('input');
  input.className = 'mf-advf-cmd-input';
  input.placeholder = d.T('subs.advf.search_fields', 'Search fields...');
  add(searchWrap, input);
  add(wrap, searchWrap);

  const listEl = el('div', 'mf-advf-cmd-list');
  add(wrap, listEl);

  const groups: Array<{ g: AdvFilterField['group']; label: string }> = [
    { g: 'response', label: d.T('subs.response_fields', 'Response Fields') },
    { g: 'metadata', label: d.T('subs.advf.metadata', 'Metadata') },
    { g: 'system', label: d.T('subs.advf.system', 'System') },
  ];

  const renderList = (q: string) => {
    listEl.innerHTML = '';
    const ql = q.trim().toLowerCase();
    let any = false;
    groups.forEach(({ g, label }) => {
      const items = fields.filter(f => f.group === g && (!ql || f.label.toLowerCase().includes(ql)));
      if (!items.length) return;
      any = true;
      add(listEl, el('div', 'mf-advf-cmd-group', label));
      items.forEach(f => {
        const row = el('button', 'mf-advf-cmd-item');
        row.type = 'button';
        const chipCls = g === 'response' ? 'is-response' : g === 'metadata' ? 'is-metadata' : 'is-system';
        add(row,
          el('span', 'mf-advf-cmd-item-ic ' + chipCls, fieldIconHtml(d, f.type, 12)),
          Object.assign(el('span', 'mf-advf-cmd-item-lbl'), { textContent: f.label }),
          el('span', 'mf-advf-cmd-item-chev', d.ic('chevronRight', 14)),
        );
        row.addEventListener('click', () => onPick(f));
        add(listEl, row);
      });
    });
    if (!any) add(listEl, el('div', 'mf-advf-cmd-empty', d.T('subs.advf.no_fields', 'No matching fields')));
  };
  renderList('');
  input.addEventListener('input', () => renderList(input.value));
  setTimeout(() => input.focus(), 30);
  return wrap;
}

// ── Operator + value editor (shared by Add-filter step 2 and chip edit) ─────
function buildOperatorValue(
  d: AdvDeps,
  field: AdvFilterField,
  init: { operator: AdvOperator; value: string; value2?: string },
  onApply: (operator: AdvOperator, value: string, value2?: string) => void,
  onChangeField?: () => void,
): HTMLElement {
  const wrap = el('div', 'mf-advf-ov');
  let operator = init.operator;
  let value = init.value;
  let value2 = init.value2 ?? '';

  // Header
  const hd = el('div', 'mf-advf-ov-hd');
  add(hd,
    el('span', 'mf-advf-ov-hd-ic', fieldIconHtml(d, field.type, 13)),
    Object.assign(el('span', 'mf-advf-ov-hd-lbl'), { textContent: field.label }),
  );
  if (onChangeField) {
    const chg = el('button', 'mf-advf-ov-hd-chg', d.T('subs.advf.change_field', 'change field'));
    chg.type = 'button';
    chg.addEventListener('click', onChangeField);
    add(hd, chg);
  }
  add(wrap, hd);

  const body = el('div', 'mf-advf-ov-body');
  add(wrap, body);

  const ops = opsFor(field.type);
  const hasValue = () => !['is_empty', 'is_not_empty'].includes(operator);
  let applyBtnRef: HTMLButtonElement | null = null;
  const refreshApply = () => {
    if (!applyBtnRef) return;
    const need = hasValue() && !String(value).trim();
    applyBtnRef.disabled = need;
    applyBtnRef.classList.toggle('is-disabled', need);
  };

  const renderBody = () => {
    body.innerHTML = '';
    // Condition
    add(body, el('p', 'mf-advf-ov-cap', d.T('subs.advf.condition', 'Condition')));
    const opRow = el('div', 'mf-advf-ov-ops');
    ops.forEach(op => {
      const b = el('button', 'mf-advf-ov-op' + (operator === op.value ? ' is-active' : ''));
      b.type = 'button'; b.textContent = opLabel(d, op);
      b.addEventListener('click', () => { operator = op.value; renderBody(); });
      add(opRow, b);
    });
    add(body, opRow);

    // Value
    if (hasValue()) {
      add(body, el('p', 'mf-advf-ov-cap', d.T('subs.advf.value', 'Value')));
      if ((field.type === 'select' || field.type === 'device' || field.type === 'location') && field.options && field.options.length) {
        const pills = el('div', 'mf-advf-ov-pills');
        field.options.forEach(opt => {
          const p = el('button', 'mf-advf-ov-pill' + (value === opt ? ' is-active' : ''));
          p.type = 'button'; p.textContent = opt;
          p.addEventListener('click', () => { value = opt; renderBody(); });
          add(pills, p);
        });
        add(body, pills);
      } else if (field.type === 'date') {
        const d1 = document.createElement('input'); d1.type = 'date'; d1.className = 'mf-advf-input'; d1.value = value;
        d1.addEventListener('input', () => { value = d1.value; refreshApply(); });
        add(body, d1);
        if (operator === 'between') {
          const d2 = document.createElement('input'); d2.type = 'date'; d2.className = 'mf-advf-input'; d2.value = value2;
          d2.placeholder = d.T('subs.advf.end_date', 'End date');
          d2.addEventListener('input', () => { value2 = d2.value; });
          add(body, d2);
        }
      } else {
        const inp = document.createElement('input');
        inp.type = field.type === 'number' ? 'number' : 'text';
        inp.className = 'mf-advf-input';
        inp.value = value;
        // Interpolated, not concatenated: word order differs per language.
        inp.placeholder = d.T('subs.advf.value_ph', 'Filter by {field}…', { field: field.label });
        inp.addEventListener('input', () => { value = inp.value; refreshApply(); });
        inp.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); doApply(); } });
        add(body, inp);
        setTimeout(() => inp.focus(), 30);
      }
    }

    const applyBtn = el('button', 'mf-advf-apply', d.T('subs.advf.apply', 'Apply filter')) as HTMLButtonElement;
    applyBtn.type = 'button';
    applyBtnRef = applyBtn;
    applyBtn.addEventListener('click', doApply);
    add(body, applyBtn);
    refreshApply();
  };

  const doApply = () => {
    // A value-requiring operator with no value is meaningless (it would filter the
    // table to empty). Block Apply until a value is chosen — for EVERY field type,
    // including selects (so an empty-value chip like "Priority is any" never happens).
    if (hasValue() && !String(value).trim()) return;
    onApply(operator, value, value2 || undefined);
  };

  renderBody();
  return wrap;
}

// ── "All fields" search-scope selector (lives inside the search box) ────────
export function buildScopeSelector(d: AdvDeps, fields: AdvFilterField[]): HTMLElement {
  const label = () => advState.searchScope === 'all'
    ? d.T('subs.advf.all_fields', 'All fields')
    : (fields.find(f => f.key === advState.searchScope)?.label ?? advState.searchScope);

  const btnEl = el('button', 'mf-advf-scope');
  btnEl.type = 'button';
  btnEl.innerHTML = `<span class="mf-advf-scope-lbl">${label()}</span>${d.ic('chevronDown', 12)}`;
  btnEl.addEventListener('click', () => {
    openPopover(btnEl, (h) => {
      const list = el('div', 'mf-advf-scope-list');
      const mkItem = (key: string, lbl: string, iconType?: AdvFieldType) => {
        const b = el('button', 'mf-advf-scope-item' + (advState.searchScope === key ? ' is-active' : ''));
        b.type = 'button';
        b.innerHTML = (iconType ? `<span class="mf-advf-scope-item-ic">${fieldIconHtml(d, iconType, 13)}</span>` : '')
          + `<span>${lbl}</span>`
          + (advState.searchScope === key ? `<span class="mf-advf-scope-item-ck">${d.ic('check', 13)}</span>` : '');
        b.addEventListener('click', () => { advState.searchScope = key; h.close(); d.onChange(); });
        return b;
      };
      add(list, mkItem('all', d.T('subs.advf.all_fields', 'All fields')));
      add(list, el('div', 'mf-advf-scope-sep'));
      fields.forEach(f => add(list, mkItem(f.key, f.label, f.type)));
      return list;
    }, { align: 'end', width: 208 });
  });
  return btnEl;
}

// ── "+ Add filter" button + 2-step popover ─────────────────────────────────
export function buildAddFilterButton(d: AdvDeps, fields: AdvFilterField[]): HTMLElement {
  const btnEl = el('button', 'mf-advf-addbtn');
  btnEl.type = 'button';
  btnEl.innerHTML = `${d.ic('plus', 12)}<span>${d.T('subs.advf.add_filter', 'Add filter')}</span>`;
  btnEl.addEventListener('click', () => {
    openPopover(btnEl, (h) => {
      const host = el('div');
      const showFieldStep = () => {
        host.innerHTML = '';
        add(host, buildFieldList(d, fields, (f) => showValueStep(f)));
      };
      const showValueStep = (f: AdvFilterField) => {
        host.innerHTML = '';
        add(host, buildOperatorValue(
          d, f,
          { operator: opsFor(f.type)[0].value, value: '' },
          (operator, value, value2) => {
            advState.filters.push({ id: 'f-' + Date.now(), field: f, operator, value, value2 });
            h.close();
            d.onChange();
          },
          () => showFieldStep(),
        ));
      };
      showFieldStep();
      return host;
    }, { align: 'start', width: 304 });
  });
  return btnEl;
}

// ── "Presets" button + popover (Saved Presets / load / save current) ────────
export function buildPresetsButton(d: AdvDeps, currentSearch: string): HTMLElement {
  ensurePresetsLoaded(d);
  const btnEl = el('button', 'mf-advf-presetbtn');
  btnEl.type = 'button';
  btnEl.innerHTML = `${d.ic('bookmark', 14)}<span class="mf-advf-presetbtn-lbl">${d.T('subs.advf.presets', 'Presets')}</span>`
    + (advState.presets.length ? `<span class="mf-advf-presetbtn-badge">${advState.presets.length}</span>` : '');
  btnEl.addEventListener('click', () => {
    openPopover(btnEl, (h) => {
      const wrap = el('div', 'mf-advf-preset-pop');
      const hd = el('div', 'mf-advf-preset-hd');
      add(hd,
        el('p', 'mf-advf-preset-hd-ttl', d.T('subs.advf.saved_presets', 'Saved Presets')),
        el('p', 'mf-advf-preset-hd-sub', d.T('subs.advf.load_preset', 'Load a saved filter configuration')),
      );
      add(wrap, hd);

      if (!advState.presets.length) {
        add(wrap, el('div', 'mf-advf-preset-empty', d.T('subs.advf.no_presets', 'No presets saved yet')));
      } else {
        const list = el('div', 'mf-advf-preset-list');
        advState.presets.forEach(p => {
          const row = el('div', 'mf-advf-preset-row');
          const b = el('button', 'mf-advf-preset-item');
          b.type = 'button';
          const n = p.filters.length;
          const meta = d.T(
            n === 1 ? 'subs.advf.preset_meta_one' : 'subs.advf.preset_meta',
            n === 1 ? '{n} filter · {range}' : '{n} filters · {range}',
            { n, range: dateRangeLabel(d, p.dateRange) },
          );
          add(b,
            el('span', 'mf-advf-preset-item-ic', d.ic('bookmarkCheck', 14)),
            (() => { const c = el('div');
              add(c, Object.assign(el('p', 'mf-advf-preset-item-name'), { textContent: p.name }),
                     Object.assign(el('p', 'mf-advf-preset-item-meta'), { textContent: meta }));
              return c; })(),
          );
          b.addEventListener('click', () => {
            advState.searchScope = p.searchScope;
            advState.filters = p.filters.map(f => ({ ...f, id: 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2) }));
            d.setDateRange(p.dateRange);
            h.close();
            d.onChange();
          });
          add(row, b);
          // Saved presets outlive the session now, so they need a way out. The built-in
          // one is regenerated on every load and cannot be deleted.
          if (p.id !== DEFAULT_PRESET_ID) {
            const del = el('button', 'mf-advf-preset-del', d.ic('trash', 12));
            del.type = 'button';
            del.title = d.T('subs.advf.delete_preset', 'Delete preset');
            del.addEventListener('click', (e) => {
              e.stopPropagation();
              advState.presets = advState.presets.filter(x => x.id !== p.id);
              persistPresets(d);
              h.close();
              d.onChange();
            });
            add(row, del);
          }
          add(list, row);
        });
        add(wrap, list);
      }

      const footer = el('div', 'mf-advf-preset-foot');
      const saveBtn = el('button', 'mf-advf-preset-save', `${d.ic('plus', 12)}<span>${d.T('subs.advf.save_preset', 'Save current filters as preset')}</span>`);
      saveBtn.type = 'button';
      saveBtn.addEventListener('click', () => {
        footer.innerHTML = '';
        const row = el('div', 'mf-advf-preset-saverow');
        const inp = document.createElement('input');
        inp.className = 'mf-advf-input'; inp.placeholder = d.T('subs.advf.preset_name', 'Preset name...');
        const doSave = () => {
          const name = inp.value.trim();
          if (!name) return;
          advState.presets.push({
            id: 'preset-' + Date.now(), name,
            filters: advState.filters.map(f => ({ ...f })),
            searchScope: advState.searchScope, dateRange: d.getDateRange(),
          });
          persistPresets(d);
          h.close(); d.onChange();
        };
        inp.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
        const ok = el('button', 'mf-advf-preset-savebtn', d.T('subs.advf.save', 'Save'));
        ok.type = 'button'; ok.addEventListener('click', doSave);
        add(row, inp, ok);
        add(footer, row);
        setTimeout(() => inp.focus(), 30);
      });
      add(footer, saveBtn);
      add(wrap, footer);
      return wrap;
    }, { align: 'start', width: 260 });
  });
  return btnEl;
}

// ── Active filter chips row (Row 2) ────────────────────────────────────────
export function buildChipsRow(d: AdvDeps, fields: AdvFilterField[]): HTMLElement | null {
  if (!advState.filters.length) return null;
  const row = el('div', 'mf-advf-chips');
  add(row, el('span', 'mf-advf-chips-cap', d.T('subs.advf.filters', 'Filters')));

  advState.filters.forEach(filter => {
    const chip = el('button', 'mf-advf-chip');
    chip.type = 'button';
    const ops = opsFor(filter.field.type);
    const op = ops.find(o => o.value === filter.operator);
    const opTxt = op ? opLabel(d, op) : filter.operator;
    const hasValue = !['is_empty', 'is_not_empty'].includes(filter.operator);
    const valTxt = filter.operator === 'between'
      ? `${filter.value} → ${filter.value2 ?? ''}`
      : (filter.value || d.T('subs.advf.any', 'any'));

    // Field labels come from the form schema — render them as text, never as HTML.
    const fieldSpan = el('span', 'mf-advf-chip-field', fieldIconHtml(d, filter.field.type, 12));
    add(fieldSpan, Object.assign(document.createElement('span'), { textContent: filter.field.label }));
    add(chip,
      fieldSpan,
      Object.assign(el('span', 'mf-advf-chip-op'), { textContent: opTxt }),
    );
    if (hasValue) {
      const v = el('span', 'mf-advf-chip-val' + (filter.value ? '' : ' is-any'));
      v.textContent = valTxt;
      add(chip, v);
    }
    const rm = el('span', 'mf-advf-chip-x', d.ic('x', 12));
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      advState.filters = advState.filters.filter(f => f.id !== filter.id);
      d.onChange();
    });
    add(chip, rm);

    // Click chip → edit operator/value (mock: opens at operator stage)
    chip.addEventListener('click', () => {
      openPopover(chip, (h) => buildOperatorValue(
        d, filter.field,
        { operator: filter.operator, value: filter.value, value2: filter.value2 },
        (operator, value, value2) => {
          advState.filters = advState.filters.map(f =>
            f.id === filter.id ? { ...f, operator, value, value2 } : f);
          h.close(); d.onChange();
        },
      ), { align: 'start', width: 288 });
    });
    add(row, chip);
  });

  if (advState.filters.length > 1) {
    const clr = el('button', 'mf-advf-chips-clr', d.T('subs.advf.clear_all', 'Clear all filters'));
    clr.type = 'button';
    clr.addEventListener('click', () => { advState.filters = []; d.onChange(); });
    add(row, clr);
  }
  return row;
}

// ── Client-side filter application ─────────────────────────────────────────
function cmp(op: AdvOperator, raw: string, target: string, target2?: string): boolean {
  const v = (raw ?? '').toString();
  const vl = v.toLowerCase();
  const t = (target ?? '').toString();
  const tl = t.toLowerCase();
  switch (op) {
    case 'contains': return vl.includes(tl);
    case 'not_contains': return !vl.includes(tl);
    case 'equals': return vl === tl;
    case 'not_equals': return vl !== tl;
    case 'starts_with': return vl.startsWith(tl);
    case 'ends_with': return vl.endsWith(tl);
    case 'is_empty': return v.trim() === '';
    case 'is_not_empty': return v.trim() !== '';
    case 'is': return vl === tl;
    case 'is_not': return vl !== tl;
    case 'gt': return parseFloat(v) > parseFloat(t);
    case 'lt': return parseFloat(v) < parseFloat(t);
    case 'gte': return parseFloat(v) >= parseFloat(t);
    case 'lte': return parseFloat(v) <= parseFloat(t);
    case 'before': { const a = Date.parse(v), b = Date.parse(t); return !isNaN(a) && !isNaN(b) && a < b; }
    case 'after':  { const a = Date.parse(v), b = Date.parse(t); return !isNaN(a) && !isNaN(b) && a > b; }
    case 'between': {
      const a = Date.parse(v), b1 = Date.parse(t), b2 = Date.parse(target2 ?? '');
      return !isNaN(a) && !isNaN(b1) && !isNaN(b2) && a >= b1 && a <= b2;
    }
    default: return true;
  }
}

/** A filter is "active" only if it has a value (or is an is-empty/is-not-empty op). */
function isActiveFilter(f: AdvActiveFilter): boolean {
  if (f.operator === 'is_empty' || f.operator === 'is_not_empty') return true;
  return !!String(f.value ?? '').trim();
}

/**
 * The single Status filter (is/equals) is pushed to the SERVER (it filters ALL
 * rows, not just the loaded page) — the shell reads this and calls the API.
 * Returns the UI status LABEL (e.g. "New") or null. Only "is"/"equals" qualify.
 */
export function advServerStatusLabel(): string | null {
  const f = advState.filters.find(x =>
    x.field.key === 'status' && (x.operator === 'is' || x.operator === 'equals') && isActiveFilter(x));
  return f ? String(f.value) : null;
}

/** Filters applied CLIENT-side on the loaded page (everything except the server Status). */
function clientFilters(): AdvActiveFilter[] {
  return advState.filters.filter(f => {
    if (!isActiveFilter(f)) return false;                              // skip empty-value (no accidental empty table)
    if (f.field.key === 'status' && (f.operator === 'is' || f.operator === 'equals')) return false; // server handles it
    return true;
  });
}

/** Is any client-side refinement active (so the loaded page is being narrowed)? */
export function advHasClientRefinement(searchQuery: string): boolean {
  const scopedSearch = !!(searchQuery || '').trim() && advState.searchScope !== 'all';
  return scopedSearch || clientFilters().length > 0;
}

/**
 * Apply the field-scoped search + client-side custom filters to a row set.
 * (Status is excluded — the shell pushes it to the server.) Empty-value filters
 * are ignored so a half-built filter never blanks the table.
 * `getValue(row, fieldKey)` resolves a submission's value for any field.
 */
export function applyAdvancedFilters<T>(
  rows: T[],
  searchQuery: string,
  fields: AdvFilterField[],
  getValue: (row: T, fieldKey: string) => string,
): T[] {
  let out = rows;

  // Field-scoped search (only when scope is a specific field; "all" goes to the server).
  const q = (searchQuery || '').trim().toLowerCase();
  if (q && advState.searchScope !== 'all') {
    out = out.filter(r => (getValue(r, advState.searchScope) || '').toLowerCase().includes(q));
  }

  const cfs = clientFilters();
  if (cfs.length) {
    out = out.filter(r => cfs.every(f => cmp(f.operator, getValue(r, f.field.key), f.value, f.value2)));
  }
  return out;
}
