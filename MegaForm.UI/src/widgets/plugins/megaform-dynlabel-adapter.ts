// ============================================================
// MegaForm DynamicLabel — Unified Designer Adapter (v20260602-B39 step 3)
// File: src/widgets/plugins/megaform-dynlabel-adapter.ts
//
// Wraps the Templates / Rendering / Display / Presets surface of the
// legacy DynamicLabel inline Properties panel as a UnifiedTabApi-compatible
// factory so the unified shell can host it as one of its tabs.
//
// SCOPE for v1
//   • NO SQL controls — the SQL config surface lives in the shell's
//     built-in Data tab (buildDataTab() in unified-shell.ts).
//   • The adapter is split into 4 sub-tabs INSIDE its host pane:
//       Templates · Rendering · Display · Presets
//   • Holds a local DRAFT slice (no live writes to field.widgetProps).
//     The shell collects the slice on Apply via getDraft().
//   • Replaces the keystroke-write risk from properties.ts:1836-1853
//     for the props it owns (templates/rendering/display).
//
//   masterQuery may surface in the Current Settings tab for read-only
//   confirmation but it is OWNED by the Data tab.
//
// SHIM CONTRACT
//   • mountDynLabelTemplates(host, ctx) renders the 4 sub-tabs.
//   • Each edit stages into draftSlice; isDirty flips true.
//   • setProps() reseeds draft slice from a fresh widgetProps snapshot.
//   • getDraft() returns the slice that the host should merge on Apply.
//
// Returned shape mirrors the UnifiedTabApi expected by step-1 docs:
//   { getDraft, setProps, isDirty, destroy }
// ============================================================
// @ts-nocheck
'use strict';

import type {
  UnifiedTabContext,
  UnifiedTabSpec
} from '../../view-designer/shared/unified-shell';

// ── Public shape mirrored from the B38 designs ───────────────
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

// ── Prop ownership matrices ──────────────────────────────────
// Templates: the HTML scaffold around rows + the static-mode body.
var TEMPLATE_KEYS = [
  'html',           // static-HTML body when useSql=false
  'sqlTemplate',    // simple-mode (single row) template
  'headerTemplate',
  'detailTemplate',
  'footerTemplate',
  'pagerTemplate',
  'emptyHtml',
  'errorHtml'
];

// Rendering: how the resolver interprets the templates above.
var RENDERING_KEYS = [
  'allowRawHtml',
  'enableTokens',
  'resultMode'      // 'simple' | 'multi'
];

// Display: visible UI affordances + caps.
var DISPLAY_KEYS = [
  'showPager',
  'pageSize',
  'maxRows',
  'cssClass'
];

var OWNED_KEYS = TEMPLATE_KEYS.concat(RENDERING_KEYS).concat(DISPLAY_KEYS);

// ── 5 DNN Tabs sample presets cloned from megaform-widget-dynamic-label.ts
//    lines 550-691. Each preset is a single-button stage into draft slice.
//    Keeping the exact preset bodies inline (no shared import) so this
//    adapter has zero runtime dependency on the widget bundle.
// ────────────────────────────────────────────────────────────
var TABS_SQL_MULTI =
  "SELECT TabID, TabName, Title, Description, Url, ParentId, Level, TabPath, IconFile, IsVisible\n" +
  "FROM Tabs\n" +
  "WHERE PortalID = :portalId AND IsDeleted = 0 AND DisableLink = 0\n" +
  "  AND (:search = '' OR TabName LIKE '%' + :search + '%' OR Title LIKE '%' + :search + '%')\n" +
  "ORDER BY ParentId, TabOrder";

var TABS_SQL_SINGLE_STAT =
  "SELECT\n" +
  "  COUNT(*) AS totalPages,\n" +
  "  SUM(CASE WHEN IsVisible=1 THEN 1 ELSE 0 END) AS visiblePages,\n" +
  "  SUM(CASE WHEN ParentId IS NULL THEN 1 ELSE 0 END) AS rootPages\n" +
  "FROM Tabs\n" +
  "WHERE PortalID = :portalId AND IsDeleted = 0";

var TABS_SQL_DETAIL =
  "SELECT TOP 1 TabID, TabName, Title, Description, Url, ParentId, Level, TabPath, IconFile\n" +
  "FROM Tabs\n" +
  "WHERE PortalID = :portalId AND IsDeleted = 0 AND TabID = :tabId";

var PRESETS: Array<{ id: string; label: string; desc: string; apply: Record<string, any> }> = [
  {
    id: 'cards',
    label: 'Card grid (multi-row)',
    desc: 'Responsive CSS-grid of DNN tab cards. Cascade filters: portalId, search.',
    apply: {
      useSql: true, resultMode: 'multi', dataSource: 'sql',
      connectionKey: 'DashboardDatabase', databaseType: 'SqlServer',
      masterQuery: TABS_SQL_MULTI,
      headerTemplate: '<div class="mf-dl-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">',
      detailTemplate: '<a class="mf-dl-card" href="{{row:Url}}" style="display:block;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;text-decoration:none;color:#0f172a"><div style="font-weight:700">{{row:TabName}}</div><div style="font-size:11px;color:#64748b;margin-top:4px">{{row:Title}}</div></a>',
      footerTemplate: '</div>',
      pagerTemplate: '<div class="mf-dl-pager" style="margin-top:10px;text-align:center;color:#64748b">{{pager}}</div>',
      queryDependsOn: 'portalId,search', reloadOnParamChange: true,
      showPager: true, pageSize: 6, maxRows: 500
    }
  },
  {
    id: 'table',
    label: 'Table list view (multi-row)',
    desc: 'Classic table of DNN tabs. Cascade filters: portalId, search.',
    apply: {
      useSql: true, resultMode: 'multi', dataSource: 'sql',
      connectionKey: 'DashboardDatabase', databaseType: 'SqlServer',
      masterQuery: TABS_SQL_MULTI,
      headerTemplate: '<table class="mf-dl-table" style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f5f9"><th style="padding:6px 10px;text-align:left">Tab</th><th style="padding:6px 10px;text-align:left">Title</th><th style="padding:6px 10px;text-align:left">URL</th></tr></thead><tbody>',
      detailTemplate: '<tr><td style="padding:6px 10px;border-top:1px solid #e2e8f0">{{row:TabName}}</td><td style="padding:6px 10px;border-top:1px solid #e2e8f0">{{row:Title}}</td><td style="padding:6px 10px;border-top:1px solid #e2e8f0"><a href="{{row:Url}}">{{row:Url}}</a></td></tr>',
      footerTemplate: '</tbody></table>',
      pagerTemplate: '<div class="mf-dl-pager" style="margin-top:8px;color:#64748b">{{pager}}</div>',
      queryDependsOn: 'portalId,search', reloadOnParamChange: true,
      showPager: true, pageSize: 20, maxRows: 500
    }
  },
  {
    id: 'compact',
    label: 'Compact link list (multi-row)',
    desc: 'Dense <ul> of tab links. Cascade filters: portalId, search.',
    apply: {
      useSql: true, resultMode: 'multi', dataSource: 'sql',
      connectionKey: 'DashboardDatabase', databaseType: 'SqlServer',
      masterQuery: TABS_SQL_MULTI,
      headerTemplate: '<ul class="mf-dl-compact" style="margin:0;padding-left:18px">',
      detailTemplate: '<li><a href="{{row:Url}}">{{row:TabName}}</a> <span style="color:#94a3b8;font-size:11px">— {{row:Title}}</span></li>',
      footerTemplate: '</ul>',
      pagerTemplate: '<div class="mf-dl-pager" style="margin-top:6px;color:#64748b">{{pager}}</div>',
      queryDependsOn: 'portalId,search', reloadOnParamChange: true,
      showPager: true, pageSize: 30, maxRows: 1000
    }
  },
  {
    id: 'stat',
    label: 'Portal stat KPI (single-row)',
    desc: 'Single-row COUNT-of-Tabs KPI card. Cascade filter: portalId.',
    apply: {
      useSql: true, resultMode: 'simple', dataSource: 'sql',
      connectionKey: 'DashboardDatabase', databaseType: 'SqlServer',
      masterQuery: TABS_SQL_SINGLE_STAT,
      sqlTemplate: '<div class="mf-dl-stat" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px"><div style="font-size:11px;color:#64748b">Total pages</div><div style="font-size:22px;font-weight:800;color:#0f172a">{{row:totalPages}}</div></div><div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px"><div style="font-size:11px;color:#64748b">Visible</div><div style="font-size:22px;font-weight:800;color:#0f172a">{{row:visiblePages}}</div></div><div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px"><div style="font-size:11px;color:#64748b">Root pages</div><div style="font-size:22px;font-weight:800;color:#0f172a">{{row:rootPages}}</div></div></div>',
      headerTemplate: '<div>', detailTemplate: '<div></div>', footerTemplate: '</div>',
      pagerTemplate: '',
      queryDependsOn: 'portalId', reloadOnParamChange: true,
      showPager: false, pageSize: 1, maxRows: 1
    }
  },
  {
    id: 'detail',
    label: 'Page detail card (single-row, :tabId)',
    desc: 'Single-row detail card. Binds :tabId param.',
    apply: {
      useSql: true, resultMode: 'simple', dataSource: 'sql',
      connectionKey: 'DashboardDatabase', databaseType: 'SqlServer',
      masterQuery: TABS_SQL_DETAIL,
      sqlTemplate: '<article class="mf-dl-detail" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px"><h3 style="margin:0 0 6px 0">{{row:TabName}}</h3><div style="color:#64748b;font-size:12px">{{row:Title}}</div><p style="margin:10px 0 0 0;color:#0f172a">{{row:Description}}</p><div style="margin-top:8px"><a href="{{row:Url}}" style="color:#0ea5e9">Open page →</a></div></article>',
      headerTemplate: '<div>', detailTemplate: '<div></div>', footerTemplate: '</div>',
      pagerTemplate: '',
      queryDependsOn: 'tabId', reloadOnParamChange: true,
      showPager: false, pageSize: 1, maxRows: 1
    }
  }
];

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
// Factory — mountDynLabelTemplates(host, ctx)
// ────────────────────────────────────────────────────────────
export function mountDynLabelTemplates(
  host: HTMLElement,
  ctx: UnifiedTabContext
): UnifiedTabApi {
  // Snapshot incoming props for dirty tracking + initial UI population.
  var initialProps: Record<string, any> = deepClone(ctx.opts.currentProps || {}) || {};
  // draft holds only the OWNED keys; getDraft returns the slice.
  var draft: Record<string, any> = pickOwned(initialProps);
  var dirty = false;
  var disposed = false;
  var activeSub: string = 'templates'; // templates | rendering | display | presets

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
    Object.assign(draft, slice || {});
    recomputeDirty();
    try { ctx.stageDraft(slice || {}); } catch (_) {}
  }

  function paint() {
    if (disposed) return;

    host.innerHTML =
      '<div class="mf-ud-dynlabel-tab" style="display:flex;flex-direction:column;gap:10px;padding:4px 2px">' +
        '<div class="mf-ud-dl-subtabs" style="display:flex;gap:4px;border-bottom:1px solid #e2e8f0;padding-bottom:0">' +
          subBtn('templates', 'Templates', 'fas fa-file-code') +
          subBtn('rendering', 'Rendering', 'fas fa-sliders-h') +
          subBtn('display',   'Display',   'fas fa-tv') +
          subBtn('presets',   'Presets',   'fas fa-magic') +
        '</div>' +
        '<div class="mf-ud-dl-pane" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px"></div>' +
      '</div>';

    var pane = host.querySelector('.mf-ud-dl-pane') as HTMLElement;
    if (pane) {
      if (activeSub === 'templates') paintTemplates(pane);
      else if (activeSub === 'rendering') paintRendering(pane);
      else if (activeSub === 'display')   paintDisplay(pane);
      else if (activeSub === 'presets')   paintPresets(pane);
    }

    var btns = host.querySelectorAll<HTMLButtonElement>('.mf-ud-dl-subtabs button');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          activeSub = b.getAttribute('data-sub') || 'templates';
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

  // ── Templates sub-tab ───────────────────────────────────────
  function paintTemplates(pane: HTMLElement) {
    pane.innerHTML =
      hint('Templates control the HTML scaffold around rows. <code>{{row:Column}}</code> tokens are resolved per row. The Data tab owns the SQL query.') +
      textareaRow('html', 'Static HTML (used when SQL is off)', 6) +
      textareaRow('sqlTemplate', 'Simple-mode template (single row)', 5) +
      textareaRow('headerTemplate', 'Header template', 3) +
      textareaRow('detailTemplate', 'Detail template (per row)', 4) +
      textareaRow('footerTemplate', 'Footer template', 3) +
      textareaRow('pagerTemplate', 'Pager template', 2) +
      textareaRow('emptyHtml', 'Empty-state HTML', 2) +
      textareaRow('errorHtml', 'Error HTML', 2);
    wireTextareas(pane);
  }

  // ── Rendering sub-tab ──────────────────────────────────────
  function paintRendering(pane: HTMLElement) {
    pane.innerHTML =
      hint('Rendering toggles change how the resolver interprets templates above. Use Allow Raw HTML carefully — disables escaping.') +
      checkRow('allowRawHtml', 'Allow raw HTML (skip escaping)') +
      checkRow('enableTokens', 'Resolve {{row:Column}} / {{token}} expressions') +
      selectRow('resultMode', 'Result mode', [
        { v: 'simple', l: 'Simple (single row)' },
        { v: 'multi', l: 'Multi-row (header / detail / footer)' }
      ]);
    wireSimpleInputs(pane);
  }

  // ── Display sub-tab ────────────────────────────────────────
  function paintDisplay(pane: HTMLElement) {
    pane.innerHTML =
      hint('Display caps how many rows render and surfaces the pager. cssClass is added to the wrapper for custom skinning.') +
      checkRow('showPager', 'Show pager') +
      numberRow('pageSize', 'Page size (1-100)', 1, 100) +
      numberRow('maxRows', 'Max rows (1-5000)', 1, 5000) +
      textRow('cssClass', 'Wrapper CSS class');
    wireSimpleInputs(pane);
  }

  // ── Presets sub-tab ────────────────────────────────────────
  function paintPresets(pane: HTMLElement) {
    var html =
      hint('One-click DNN Tabs starter presets. Each preset stages a full bundle (SQL + templates + display) into the draft — click Apply at the bottom to commit.');
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">';
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      html +=
        '<div class="mf-ud-dl-preset" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px">' +
          '<div style="font-weight:700;font-size:13px;color:#0f172a">' + esc(p.label) + '</div>' +
          '<div style="font-size:11px;color:#64748b;line-height:1.4">' + esc(p.desc) + '</div>' +
          '<button type="button" data-preset="' + esc(p.id) + '" style="background:#0ea5e9;color:#fff;border:0;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-top:4px">Stage preset</button>' +
        '</div>';
    }
    html += '</div>';
    pane.innerHTML = html;

    var btns = pane.querySelectorAll<HTMLButtonElement>('button[data-preset]');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function (e) {
          e.preventDefault();
          var id = b.getAttribute('data-preset') || '';
          var preset = null;
          for (var k = 0; k < PRESETS.length; k++) { if (PRESETS[k].id === id) { preset = PRESETS[k]; break; } }
          if (!preset) return;
          // Stage the OWNED portion into the local draft (templates +
          // rendering + display), and stage the full preset (incl. SQL
          // keys) into ctx.stageDraft so the Data tab can pick up the
          // SQL config on the same Apply.
          var owned = pickOwned(preset.apply);
          Object.assign(draft, owned);
          recomputeDirty();
          try {
            ctx.stageDraft(preset.apply);
            ctx.toast('Preset "' + preset.label + '" staged — click Apply at the bottom to commit.', 'success');
          } catch (_) {}
        });
      })(btns[i]);
    }
  }

  // ── HTML helpers ───────────────────────────────────────────
  function hint(txt: string): string {
    return '<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;font-size:11px;color:#854d0e;line-height:1.4;margin-bottom:10px">' + txt + '</div>';
  }

  function labelHtml(forId: string, txt: string): string {
    return '<label for="' + esc(forId) + '" style="display:block;font-size:11px;font-weight:600;color:#475569;margin-bottom:3px">' + esc(txt) + '</label>';
  }

  function textareaRow(key: string, label: string, rows: number): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdl-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<textarea id="' + id + '" data-key="' + key + '" rows="' + rows + '" style="width:100%;font-family:Consolas,monospace;font-size:11px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box">' + esc(v) + '</textarea>' +
      '</div>';
  }

  function textRow(key: string, label: string): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdl-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<input id="' + id + '" type="text" data-key="' + key + '" value="' + esc(v) + '" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:12px">' +
      '</div>';
  }

  function numberRow(key: string, label: string, min: number, max: number): string {
    var v = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdl-' + key;
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<input id="' + id + '" type="number" min="' + min + '" max="' + max + '" data-key="' + key + '" value="' + esc(v) + '" style="width:140px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;box-sizing:border-box;font-size:12px">' +
      '</div>';
  }

  function checkRow(key: string, label: string): string {
    var checked = !!draft[key];
    var id = 'mfdl-' + key;
    return '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">' +
      '<input id="' + id + '" type="checkbox" data-key="' + key + '"' + (checked ? ' checked' : '') + '>' +
      '<label for="' + id + '" style="font-size:12px;color:#0f172a;cursor:pointer">' + esc(label) + '</label>' +
      '</div>';
  }

  function selectRow(key: string, label: string, opts: Array<{ v: string; l: string }>): string {
    var cur = draft[key] == null ? '' : String(draft[key]);
    var id = 'mfdl-' + key;
    var optsHtml = '';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      optsHtml += '<option value="' + esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }
    return '<div style="margin-bottom:8px">' +
      labelHtml(id, label) +
      '<select id="' + id + '" data-key="' + key + '" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;min-width:240px">' + optsHtml + '</select>' +
      '</div>';
  }

  // ── Wire inputs — debounced staging (change-event only for textareas
  //    to avoid the per-keystroke writes documented in feedback). ────
  function wireTextareas(pane: HTMLElement) {
    var tas = pane.querySelectorAll<HTMLTextAreaElement>('textarea[data-key]');
    for (var i = 0; i < tas.length; i++) {
      (function (ta) {
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
    getDraft: function () { return deepClone(draft) || {}; },
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
export function buildDynLabelTemplatesTab(): UnifiedTabSpec {
  var apiHandle: UnifiedTabApi | null = null;
  return {
    id: 'templates',
    label: 'Templates',
    icon: 'fas fa-file-code',
    getDraft: function () { return apiHandle ? apiHandle.getDraft() : {}; },
    render: function (host, ctx) {
      apiHandle = mountDynLabelTemplates(host, ctx);
    }
  };
}

// ── Optional: legacy window namespace so non-bundle callers can hit it.
try {
  (window as any).MFDynLabelAdapter = {
    mountDynLabelTemplates: mountDynLabelTemplates,
    buildDynLabelTemplatesTab: buildDynLabelTemplatesTab
  };
} catch (_e) { /* ignore */ }
