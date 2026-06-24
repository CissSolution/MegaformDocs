// ============================================================
// MegaForm DataRepeater — Unified Designer Adapter (v20260602-B40 step 4)
// File: src/widgets/plugins/megaform-datarepeater-adapter.ts
//
// Wraps the Columns / Filters / Detail / Templates / Display surface
// of the legacy DataRepeater inline Properties panel as a
// UnifiedTabApi-compatible factory so the unified shell can host it
// as one of its tabs.
//
// SCOPE for v1
//   • NO SQL controls — the SQL config surface lives in the shell's
//     built-in Data tab (buildDataTab() in unified-shell.ts).
//     Q5 OWNERSHIP MATRIX (locked):
//       Data tab owns: connectionKey · databaseType · dataSource ·
//                      masterQuery · queryDependsOn · reloadOnParamChange
//       Adapter owns: every other widgetProps key.
//   • The adapter is split into 5 sub-tabs INSIDE its host pane:
//       Columns · Filters · Detail · Templates · Display
//   • Holds a local DRAFT slice (no live writes to field.widgetProps).
//     The shell collects the slice on Apply via getDraft().
//
// SHAPE NOTE (from scout report)
//   The Builder properties.ts editor persists FLAT keys
//   (detail1Query / detail1TriggerCol / detail1Placement / detail1Template /
//    detail2…, detail3…, filter1Label / filter1Param / filter1Type / filter1Query,
//    filter2…). The runtime resolver reconstructs detailLevels[] and filters[]
//   arrays on its own (see megaform-widget-data-repeater.ts:762-805).
//   Therefore this adapter MUST stage FLAT keys to keep parity with the
//   legacy editor + existing form schemas. Do NOT stage the reconstructed
//   arrays here.
//
// SHIM CONTRACT
//   • mountDataRepeaterConfig(host, ctx) renders the 5 sub-tabs.
//   • Each edit stages into draftSlice; isDirty flips true.
//   • setProps() reseeds draft slice from a fresh widgetProps snapshot.
//   • getDraft() returns the slice that the host should merge on Apply.
//   • Returned shape: { getDraft, setProps, isDirty, destroy }.
// ============================================================
// @ts-nocheck
'use strict';

import type {
  UnifiedTabContext,
  UnifiedTabSpec
} from '../../view-designer/shared/unified-shell';

// ── Public shape (mirrored from B38/B39 designs) ─────────────
export interface UnifiedTabApi {
  /** Returns the merge slice the tab wants to contribute on Apply. */
  getDraft(): Record<string, any>;
  /** Hydrate the tab UI from a freshly-supplied widgetProps snapshot. */
  setProps(props: Record<string, any>): void;
  /** True when the user has staged a change relative to setProps(). */
  isDirty(): boolean;
  /** Tear down DOM + listeners (called by the host when the shell closes). */
  destroy(): void;
}

// ── Q5 ownership matrices ────────────────────────────────────
// Keys owned by the SHELL Data tab — adapter MUST NEVER include these
// in its draft slice.
var SQL_OWNED_KEYS = [
  'connectionKey',
  'databaseType',
  'dataSource',
  'masterQuery',
  'queryDependsOn',
  'reloadOnParamChange',
  // MegaForm Submissions source — owned by the shell Data tab (form-submissions mode),
  // never by this adapter, so designer edits there are not clobbered on Apply.
  'submissionsFormId',
  'statusFilter',
  'fieldWhitelist',
  'fieldWhitelistCsv'
];

// Columns sub-tab — column definitions surface.
// DataRepeater builds its table from the SQL columns automatically; the
// "columns" config here lets admins override labels / hide cols / pin
// the trigger column for drill-down. We persist a single `columns` JSON
// array so the legacy resolver can pick it up if/when it adds support,
// plus the loose triggers that already exist.
var COLUMN_KEYS = [
  'columns',                  // [{ name, label, hidden, align }]
  'detail1TriggerCol',
  'detail2TriggerCol',
  'detail3TriggerCol',
  'groupByCol',
  'chartLabelCol',
  'chartValueCol'
];

// Filters sub-tab — filter1/filter2 query + label + param + type.
var FILTER_KEYS = [
  'filter1Label', 'filter1Param', 'filter1Type', 'filter1Query',
  'filter2Label', 'filter2Param', 'filter2Type', 'filter2Query'
];

// Detail sub-tab — drill-down level 1/2/3 query + trigger + placement.
// (Templates for detail levels live in the Templates sub-tab.)
var DETAIL_KEYS = [
  'detail1Query', 'detail1TriggerCol', 'detail1Placement',
  'detail2Query', 'detail2TriggerCol', 'detail2Placement',
  'detail3Query', 'detail3TriggerCol', 'detail3Placement'
];

// Templates sub-tab — master + detail level templates + empty/error html.
var TEMPLATE_KEYS = [
  'masterTemplate',
  'detail1Template',
  'detail2Template',
  'detail3Template',
  'emptyMessage',
  'emptyHtml',
  'errorHtml'
];

// Display sub-tab — pager, paging, layout, css, exports, chart, refresh.
var DISPLAY_KEYS = [
  'showPager',
  'pageSize',
  'maxRows',
  'cssClass',
  'layout',
  'golfMode',
  'refreshInterval',
  'allowExportCsv',
  'allowExportPdf',
  'chartType'
];

// Union of all adapter-owned keys. The trigger-col keys overlap between
// Columns and Detail tabs intentionally; uniqueness is enforced by the
// draft dictionary itself.
function uniqStr(arr: string[]): string[] {
  var seen: Record<string, boolean> = {};
  var out: string[] = [];
  for (var i = 0; i < arr.length; i++) {
    var k = arr[i]; if (seen[k]) continue;
    seen[k] = true; out.push(k);
  }
  return out;
}
var OWNED_KEYS = uniqStr(
  COLUMN_KEYS.concat(FILTER_KEYS).concat(DETAIL_KEYS).concat(TEMPLATE_KEYS).concat(DISPLAY_KEYS)
);

// Hard-guard: strip SQL keys from anything the adapter touches.
function stripSqlKeys(slice: Record<string, any>): Record<string, any> {
  if (!slice) return {};
  var out: Record<string, any> = {};
  Object.keys(slice).forEach(function (k) {
    if (SQL_OWNED_KEYS.indexOf(k) >= 0) return; // Q5 enforcement
    out[k] = slice[k];
  });
  return out;
}

// ── Utilities ────────────────────────────────────────────────
function esc(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deepClone<T>(v: T): T {
  try { return JSON.parse(JSON.stringify(v)); } catch (_e) { return v; }
}

function eqShallow(a: Record<string, any>, b: Record<string, any>, keys: string[]): boolean {
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var av = a ? a[k] : undefined;
    var bv = b ? b[k] : undefined;
    if (typeof av === 'object' && typeof bv === 'object') {
      try {
        if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      } catch (_) { if (av !== bv) return false; }
    } else if (av !== bv) {
      return false;
    }
  }
  return true;
}

// ────────────────────────────────────────────────────────────
// Factory — mountDataRepeaterConfig(host, ctx)
// ────────────────────────────────────────────────────────────
export function mountDataRepeaterConfig(
  host: HTMLElement,
  ctx: UnifiedTabContext
): UnifiedTabApi {
  // Snapshot incoming props for dirty tracking + initial UI population.
  var initialProps: Record<string, any> = deepClone(ctx.opts.currentProps || {}) || {};
  // draft holds only the OWNED keys; getDraft returns the slice.
  var draft: Record<string, any> = pickOwned(initialProps);
  var dirty = false;
  var disposed = false;
  var activeSub: string = 'columns'; // columns | filters | detail | templates | display

  function pickOwned(src: Record<string, any>): Record<string, any> {
    var out: Record<string, any> = {};
    if (!src) return out;
    for (var i = 0; i < OWNED_KEYS.length; i++) {
      var k = OWNED_KEYS[i];
      if (k in src) out[k] = src[k];
    }
    return out;
  }

  function recomputeDirty() {
    dirty = !eqShallow(draft, initialProps, OWNED_KEYS);
  }

  function stage(slice: Record<string, any>) {
    var clean = stripSqlKeys(slice || {}); // Q5 belt-and-braces
    Object.assign(draft, clean);
    recomputeDirty();
    try { ctx.stageDraft(clean); } catch (_) {}
  }

  function paint() {
    if (disposed) return;

    host.innerHTML =
      '<div class="mf-ud-datarepeater-tab" style="display:flex;flex-direction:column;gap:10px;padding:4px 2px">' +
        '<div class="mf-ud-dr-subtabs" style="display:flex;gap:4px;border-bottom:1px solid #e2e8f0;padding-bottom:0;flex-wrap:wrap">' +
          subBtn('columns',   'Columns',   'fas fa-columns') +
          subBtn('filters',   'Filters',   'fas fa-filter') +
          subBtn('detail',    'Detail',    'fas fa-stream') +
          subBtn('templates', 'Templates', 'fas fa-file-code') +
          subBtn('display',   'Display',   'fas fa-tv') +
        '</div>' +
        '<div class="mf-ud-dr-pane" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px"></div>' +
      '</div>';

    var pane = host.querySelector('.mf-ud-dr-pane') as HTMLElement;
    if (pane) {
      if (activeSub === 'columns')        paintColumns(pane);
      else if (activeSub === 'filters')   paintFilters(pane);
      else if (activeSub === 'detail')    paintDetail(pane);
      else if (activeSub === 'templates') paintTemplates(pane);
      else if (activeSub === 'display')   paintDisplay(pane);
    }

    var btns = host.querySelectorAll<HTMLButtonElement>('.mf-ud-dr-subtabs button');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          activeSub = b.getAttribute('data-sub') || 'columns';
          paint();
        });
      })(btns[i]);
    }
  }

  function subBtn(id: string, label: string, icon: string): string {
    var active = activeSub === id;
    var bg = active ? '#0ea5e9' : '#f1f5f9';
    var fg = active ? '#fff' : '#0f172a';
    var bd = active ? '#0ea5e9' : '#e2e8f0';
    return '<button type="button" data-sub="' + id + '" style="background:' + bg + ';color:' + fg + ';border:1px solid ' + bd +
      ';padding:6px 12px;border-radius:8px 8px 0 0;cursor:pointer;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px">' +
      '<i class="' + icon + '"></i>' + esc(label) + '</button>';
  }

  // ── Columns sub-tab ─────────────────────────────────────────
  function paintColumns(pane: HTMLElement) {
    var colsJson = '';
    var rawCols = draft['columns'];
    if (rawCols && typeof rawCols === 'object') {
      try { colsJson = JSON.stringify(rawCols, null, 2); } catch (_) { colsJson = ''; }
    } else if (typeof rawCols === 'string') {
      colsJson = rawCols;
    }

    pane.innerHTML =
      hint('Column definitions override labels / hide cols / pin the trigger column. Leave empty to auto-generate from the SQL columns. The Data tab owns the SQL query — drive column names from there.') +
      textareaRowRaw('columns', 'Columns JSON  e.g. [{"name":"Total","label":"Total $","align":"right","hidden":false}]', 6, colsJson) +
      hint('The four boxes below pin specific column names from your SQL into the master / drill-down / chart wiring. Use the exact column name as it appears in the SELECT clause.') +
      textRow('detail1TriggerCol', 'L1 click column (opens detail level 1)') +
      textRow('detail2TriggerCol', 'L2 click column (in L1 results)') +
      textRow('detail3TriggerCol', 'L3 click column (in L2 results)') +
      textRow('groupByCol', 'Group-by column (accordion sections)') +
      textRow('chartLabelCol', 'Chart label column') +
      textRow('chartValueCol', 'Chart value column');

    wireSimpleInputs(pane);
    wireColumnsJson(pane);
  }

  function wireColumnsJson(pane: HTMLElement) {
    var ta = pane.querySelector('textarea[data-key="columns"]') as HTMLTextAreaElement | null;
    if (!ta) return;
    ta.addEventListener('change', function () {
      var raw = String(ta.value || '').trim();
      if (!raw) { stage({ columns: null }); return; }
      try {
        var parsed = JSON.parse(raw);
        stage({ columns: parsed });
      } catch (_) {
        // Keep as string when invalid so the user can fix it.
        stage({ columns: raw });
        try { ctx.toast('Columns JSON is not valid — saved as raw string', 'error'); } catch (__) {}
      }
    });
  }

  // ── Filters sub-tab ─────────────────────────────────────────
  function paintFilters(pane: HTMLElement) {
    pane.innerHTML =
      hint('Each filter binds a UI control to a SQL parameter (e.g. <code>:flight</code>). Dropdown filters need an options query; text filters do not.') +
      sectionHead('Filter 1') +
      textRow('filter1Label', 'Filter 1 label') +
      textRow('filter1Param', 'Filter 1 SQL param name (e.g. flight)') +
      selectRow('filter1Type', 'Filter 1 type', [
        { v: '',         l: '(none)' },
        { v: 'text',     l: 'Text' },
        { v: 'number',   l: 'Number' },
        { v: 'date',     l: 'Date' },
        { v: 'dropdown', l: 'Dropdown' }
      ]) +
      textareaRow('filter1Query', 'Filter 1 options query (dropdown only — SELECT value, label)', 3) +

      sectionHead('Filter 2') +
      textRow('filter2Label', 'Filter 2 label') +
      textRow('filter2Param', 'Filter 2 SQL param name') +
      selectRow('filter2Type', 'Filter 2 type', [
        { v: '',         l: '(none)' },
        { v: 'text',     l: 'Text' },
        { v: 'number',   l: 'Number' },
        { v: 'date',     l: 'Date' },
        { v: 'dropdown', l: 'Dropdown' }
      ]) +
      textareaRow('filter2Query', 'Filter 2 options query (dropdown only)', 3);

    wireSimpleInputs(pane);
    wireTextareas(pane);
  }

  // ── Detail sub-tab ──────────────────────────────────────────
  function paintDetail(pane: HTMLElement) {
    pane.innerHTML =
      hint('Drill-down levels open inline when a row is clicked. Use <code>:parentId</code> in the detail query to bind the clicked row’s value. Templates live in the Templates sub-tab.') +
      sectionHead('Level 1 (master → L1)') +
      textRow('detail1TriggerCol', 'L1 click column (the master column that opens L1)') +
      textareaRow('detail1Query', 'L1 detail query (use :parentId)', 4) +
      selectRow('detail1Placement', 'L1 placement', placementOpts()) +

      sectionHead('Level 2 (L1 → L2)') +
      textRow('detail2TriggerCol', 'L2 click column (in L1 results)') +
      textareaRow('detail2Query', 'L2 detail query (use :parentId)', 4) +
      selectRow('detail2Placement', 'L2 placement', placementOpts()) +

      sectionHead('Level 3 (L2 → L3)') +
      textRow('detail3TriggerCol', 'L3 click column (in L2 results)') +
      textareaRow('detail3Query', 'L3 detail query (use :parentId)', 4) +
      selectRow('detail3Placement', 'L3 placement', placementOpts());

    wireSimpleInputs(pane);
    wireTextareas(pane);
  }

  function placementOpts(): Array<{ v: string; l: string }> {
    return [
      { v: '',       l: '(default — after row)' },
      { v: 'after',  l: 'After the row' },
      { v: 'before', l: 'Before the row' }
    ];
  }

  // ── Templates sub-tab ───────────────────────────────────────
  function paintTemplates(pane: HTMLElement) {
    pane.innerHTML =
      hint('Custom HTML scaffolds with <code>{col}</code> tokens. Leave the master template empty for the default auto-generated table.') +
      textareaRow('masterTemplate', 'Master template (HTML with {col} tokens — empty = auto table)', 6) +
      textareaRow('detail1Template', 'L1 detail template', 4) +
      textareaRow('detail2Template', 'L2 detail template', 4) +
      textareaRow('detail3Template', 'L3 detail template', 4) +
      textRow('emptyMessage', 'Empty message (single line)') +
      textareaRow('emptyHtml', 'Empty-state HTML (overrides empty message)', 2) +
      textareaRow('errorHtml', 'Error HTML', 2);

    wireSimpleInputs(pane);
    wireTextareas(pane);
  }

  // ── Display sub-tab ─────────────────────────────────────────
  function paintDisplay(pane: HTMLElement) {
    pane.innerHTML =
      hint('Display caps how many rows render, surfaces the pager, and toggles export / chart modes. <code>cssClass</code> is added to the wrapper for custom skinning.') +
      checkRow('showPager', 'Show pager') +
      numberRow('pageSize', 'Page size (0 = all)', 0, 10000) +
      numberRow('maxRows', 'Max rows (server cap)', 1, 100000) +
      numberRow('refreshInterval', 'Auto-refresh seconds (0 = off)', 0, 86400) +
      selectRow('layout', 'Layout mode', [
        { v: '',           l: '(default — table)' },
        { v: 'table',      l: 'Table' },
        { v: 'cards',      l: 'Cards' },
        { v: 'list',       l: 'List' },
        { v: 'accordion',  l: 'Accordion (use Group-by col)' }
      ]) +
      checkRow('golfMode', 'Golf scorecard mode (color-coded)') +
      checkRow('allowExportCsv', 'Allow CSV export') +
      checkRow('allowExportPdf', 'Allow PDF export (print)') +
      selectRow('chartType', 'Chart mode', [
        { v: '',         l: '(off)' },
        { v: 'bar',      l: 'Bar' },
        { v: 'line',     l: 'Line' },
        { v: 'pie',      l: 'Pie' },
        { v: 'donut',    l: 'Donut' }
      ]) +
      textRow('cssClass', 'Wrapper CSS class');

    wireSimpleInputs(pane);
  }

  // ── HTML helpers ───────────────────────────────────────────
  function hint(txt: string): string {
    return '<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:11px;color:#854d0e;line-height:1.4;margin-bottom:10px">' + txt + '</div>';
  }

  function sectionHead(txt: string): string {
    return '<div style="font-size:11px;font-weight:700;color:#4338ca;text-transform:uppercase;letter-spacing:.05em;background:#eef2ff;border:1px solid #e2e8f0;border-radius:6px;padding:5px 10px;margin:10px 0 6px">' + esc(txt) + '</div>';
  }

  function labelHtml(forId: string, txt: string): string {
    return '<label for="' + esc(forId) + '" style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:3px">' + esc(txt) + '</label>';
  }

  function textareaRow(key: string, label: string, rows: number): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    return textareaRowRaw(key, label, rows, v);
  }

  function textareaRowRaw(key: string, label: string, rows: number, v: string): string {
    var id = 'mfdr-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<textarea id="' + id + '" data-key="' + key + '" rows="' + rows + '" style="width:100%;font-family:Consolas,monospace;font-size:11px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box">' + esc(v) + '</textarea>' +
      '</div>';
  }

  function textRow(key: string, label: string): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdr-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<input id="' + id + '" type="text" data-key="' + key + '" value="' + esc(v) + '" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:12px">' +
      '</div>';
  }

  function numberRow(key: string, label: string, min: number, max: number): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdr-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<input id="' + id + '" type="number" min="' + min + '" max="' + max + '" data-key="' + key + '" value="' + esc(v) + '" style="width:160px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:12px">' +
      '</div>';
  }

  function checkRow(key: string, label: string): string {
    var checked = !!draft[key];
    var id = 'mfdr-' + key;
    return '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">' +
      '<input id="' + id + '" type="checkbox" data-key="' + key + '"' + (checked ? ' checked' : '') + '>' +
      '<label for="' + id + '" style="font-size:12px;color:#0f172a;cursor:pointer">' + esc(label) + '</label>' +
      '</div>';
  }

  function selectRow(key: string, label: string, opts: Array<{ v: string; l: string }>): string {
    var cur = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdr-' + key;
    var optsHtml = '';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      optsHtml += '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<select id="' + id + '" data-key="' + key + '" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;min-width:260px">' + optsHtml + '</select>' +
      '</div>';
  }

  // ── Wire inputs — debounced staging (change-event only for textareas
  //    to avoid the per-keystroke writes documented in feedback). ────
  function wireTextareas(pane: HTMLElement) {
    var tas = pane.querySelectorAll<HTMLTextAreaElement>('textarea[data-key]');
    for (var i = 0; i < tas.length; i++) {
      (function (ta) {
        // Skip the columns JSON textarea — wireColumnsJson handles it.
        if (ta.getAttribute('data-key') === 'columns') return;
        ta.addEventListener('change', function () {
          var k = ta.getAttribute('data-key') || '';
          if (!k) return;
          var slice: Record<string, any> = {};
          slice[k] = ta.value;
          stage(slice);
        });
      })(tas[i]);
    }
  }

  function wireSimpleInputs(pane: HTMLElement) {
    var inputs = pane.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[data-key],select[data-key]');
    for (var i = 0; i < inputs.length; i++) {
      (function (el) {
        var evt = (el.tagName === 'SELECT' || (el as HTMLInputElement).type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, function () {
          var k = el.getAttribute('data-key') || '';
          if (!k) return;
          var slice: Record<string, any> = {};
          var t = (el as HTMLInputElement).type;
          if (t === 'checkbox') {
            slice[k] = !!(el as HTMLInputElement).checked;
          } else if (t === 'number') {
            var n = parseFloat((el as HTMLInputElement).value);
            slice[k] = isNaN(n) ? null : n;
          } else {
            slice[k] = (el as HTMLInputElement).value;
          }
          stage(slice);
        });
      })(inputs[i]);
    }
  }

  // ── UnifiedTabApi surface ──────────────────────────────────
  var api: UnifiedTabApi = {
    getDraft: function () {
      // Final Q5 guard — strip any SQL key that may have slipped in.
      return stripSqlKeys(deepClone(draft) || {});
    },
    setProps: function (props) {
      initialProps = deepClone(props || {}) || {};
      draft = pickOwned(initialProps);
      dirty = false;
      paint();
    },
    isDirty: function () { return !!dirty; },
    destroy: function () {
      disposed = true;
      try { host.innerHTML = ''; } catch (_) { /* ignore */ }
    }
  };

  paint();
  return api;
}

// ── Convenience: a UnifiedTabSpec wrapper so callers can drop the
//    factory straight into openUnifiedDesigner({ tabs:[…] }).
// ────────────────────────────────────────────────────────────
export function buildDataRepeaterConfigTab(): UnifiedTabSpec {
  var apiHandle: UnifiedTabApi | null = null;
  return {
    id: 'config',
    label: 'Config',
    icon: 'fas fa-table',
    getDraft: function () { return apiHandle ? apiHandle.getDraft() : {}; },
    render: function (host, ctx) {
      apiHandle = mountDataRepeaterConfig(host, ctx);
    }
  };
}

// ── Optional: legacy window namespace so non-bundle callers can hit it.
try {
  (window as any).MFDataRepeaterAdapter = {
    mountDataRepeaterConfig: mountDataRepeaterConfig,
    buildDataRepeaterConfigTab: buildDataRepeaterConfigTab
  };
} catch (_e) { /* ignore */ }
