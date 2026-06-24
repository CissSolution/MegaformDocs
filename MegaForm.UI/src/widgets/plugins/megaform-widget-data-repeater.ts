/**
 * MegaForm DataRepeater Widget — TypeScript Source
 *
 * Build:   tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-data-repeater.js
 *
 * Purpose: Display SQL-driven data tables with XSL-style tokenized templates,
 *          multi-level drill-down, filters, pagination, charts, and export.
 *
 * Phase 1: Master query + template rendering, 1-level drill-down, basic tokens
 * Phase 2: Conditional formatting, pagination, auto-refresh, export CSV/PDF
 * Phase 3: Multi-level recursive drill-down, filter dropdowns, chart mode, stored procs
 *
 * Security: Client NEVER sends raw SQL — only formId + widgetKey.
 *           Server reads SQL from form schema (widgetProps).
 *
 * @version  v20260521-02
 * @category advanced
 */

(function (global: any) {
  'use strict';

  var BADGE = 'DataRepeater v20260521-02';

  // ═══════════════════════════════════════════════════════════════════════════
  //  TYPES
  // ═══════════════════════════════════════════════════════════════════════════

  interface DataRepeaterProps {
    dataSource: string;        // "sql" | "storedproc" | "megaform_submissions"
    connectionKey: string;
    databaseType: string;
    masterQuery: string;
    // MegaForm Submissions source (dataSource === "megaform_submissions")
    submissionsFormId?: number;   // 0 = the host form
    statusFilter?: string;        // blank/"all" = no submission-Status filter
    fieldWhitelistCsv?: string;   // comma-separated field keys — ONLY these leave the server
    masterTemplate: string;
    detailLevels: DetailLevelConfig[];
    filters: FilterConfig[];
    pageSize: number;
    refreshInterval: number;   // seconds, 0=off
    emptyMessage: string;
    cssClass: string;
    maxRows: number;
    allowExportCsv: boolean;
    allowExportPdf: boolean;
    chartType: string;         // null | "bar" | "line" | "pie"
    chartLabelCol: string;
    chartValueCol: string;
    queryDependsOn: string;   // comma-separated field keys whose values become __p__ params
    reloadOnParamChange: boolean;
    // Grouped / Layout
    groupByCol: string;        // column name for accordion grouping
    golfMode: boolean;         // enable golf scorecard styling
    // Flat detail level props (builder UI)
    detail1Query: string; detail1Template: string; detail1TriggerCol: string; detail1Placement: string;
    detail2Query: string; detail2Template: string; detail2TriggerCol: string; detail2Placement: string;
    detail3Query: string; detail3Template: string; detail3TriggerCol: string; detail3Placement: string;
    // Flat filter props (builder UI)
    filter1Label: string; filter1Type: string; filter1Query: string; filter1Param: string;
    filter2Label: string; filter2Type: string; filter2Query: string; filter2Param: string;
  }

  interface DetailLevelConfig {
    query: string;
    template: string;
    triggerCol: string;
    placement?: string;
  }

  interface FilterConfig {
    key: string;
    label: string;
    filterType: string;  // "dropdown" | "text" | "daterange"
    query: string;       // SQL for dropdown options
    paramName: string;
  }

  interface QueryResult {
    columns: { name: string; dataType: string }[];
    rows: any[][];
    totalRows: number;
    page: number;
    pageSize: number;
    executionMs: number;
    hasMore: boolean;
    error?: string;
  }

  interface FieldLike {
    key: string;
    label?: string;
    required?: boolean;
    widgetProps?: Partial<DataRepeaterProps> & Record<string, any>;
  }

  // MegaFormWidgets accessed via global — no declare needed inside IIFE
  var MegaFormWidgets: any = (global as any).MegaFormWidgets;
  // MFUtil (types.js) — canonical shared utilities for all widgets
  var MFUtil: any = (global as any).MFUtil;

  // ═══════════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tr(key: string, fallback: string): string {
    try {
      var i18n = (window as any).MegaFormI18n;
      if (i18n && typeof i18n.t === 'function') {
        var out = i18n.t(key);
        if (out && out !== key) return String(out);
      }
    } catch (_e) { }
    return fallback;
  }

  function normalizeTokenKey(key: any): string {
    return String(key == null ? '' : key).trim().toLowerCase();
  }

  function aliasTokenKey(key: any): string {
    return normalizeTokenKey(key)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function registerColumnAlias(colMap: Record<string, any>, key: any, value: any): void {
    var raw = normalizeTokenKey(key);
    if (!raw) return;
    if (!colMap.hasOwnProperty(raw)) colMap[raw] = value;

    var alias = aliasTokenKey(key);
    if (alias && !colMap.hasOwnProperty(alias)) colMap[alias] = value;

    var compact = alias.replace(/_/g, '');
    if (compact && !colMap.hasOwnProperty(compact)) colMap[compact] = value;
  }

  function stringOrEmpty(value: any): string {
    return value === undefined || value === null ? '' : String(value);
  }

  function hasExplicitRowMarker(template: string): boolean {
    return /data-row-index\s*=|class\s*=\s*['"][^'"]*\bmfdr-row\b/i.test(template || '');
  }

  function startsWithTableRow(template: string): boolean {
    return /^\s*<tr[\s>]/i.test(String(template || '').trim());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  API HELPERS — use MFUtil (types.js) canonical pattern
  //  MFUtil.getApiBase() handles DNN/Oqtane/Web detection automatically.
  //  MFUtil.apiCall() handles DNN auth headers (ModuleId, TabId, AntiForgery).
  // ═══════════════════════════════════════════════════════════════════════════

  function getApiBase(): string {
    // 1. Explicit platform marker set by the host shell (reliable on Oqtane).
    var plat = (window as any).__MF_PLATFORM__;
    if (plat && plat.apiBase) return String(plat.apiBase).replace(/\/?$/, '/');
    // 2. Element hint (listview/SSR mounts carry data-mf-api-base).
    var el = document.querySelector('[data-mf-api-base]');
    if (el) { var a = el.getAttribute('data-mf-api-base'); if (a) return a.replace(/\/?$/, '/'); }
    // 3. Shared util — but MFUtil.getApiBase() reads window.$.ServicesFramework and THROWS
    //    on Oqtane (no jQuery). Guard it so a throw falls through to the platform sniff.
    try {
      if (typeof MFUtil !== 'undefined' && MFUtil && typeof MFUtil.getApiBase === 'function') {
        var b = MFUtil.getApiBase();
        if (b) return String(b).replace(/\/?$/, '/');
      }
    } catch (_e) { /* fall through */ }
    // 4. Platform sniff: DNN exposes jQuery ServicesFramework; otherwise assume Oqtane.
    var w = window as any;
    if (w.$ && w.$.ServicesFramework) return '/DesktopModules/MegaForm/API/';
    return '/api/MegaForm/';
  }

  /**
   * Normalize API response keys: DNN returns PascalCase, widget expects camelCase.
   * e.g. { Columns, Rows, TotalRows, Error } → { columns, rows, totalRows, error }
   */
  function normalizeKeys(obj: any): any {
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalizeKeys);
    var out: any = {};
    for (var k in obj) {
      if (!obj.hasOwnProperty(k)) continue;
      var lk = k.charAt(0).toLowerCase() + k.slice(1); // PascalCase → camelCase
      out[lk] = normalizeKeys(obj[k]);
    }
    return out;
  }

  function ajax(url: string, callback: (err: string | null, data: any) => void): void {
    // Use MFUtil.apiCall if available (handles DNN auth headers)
    if (MFUtil && typeof MFUtil.apiCall === 'function') {
      // MFUtil.apiCall prepends getApiBase(), but we already have full URL
      // So use XHR directly but with MFUtil's auth pattern
    }

    // [v20260527-04] Append ?portalId=N from __MF_PLATFORM__ and drop
    // TabId/ModuleId headers — DNN's framework rejects the headers with 400
    // "Specified page is not in this site" when the page is in a
    // child-portal subpath alias.
    var pf = (window as any).__MF_PLATFORM__ || {};
    var pidRaw = pf.portalId != null ? pf.portalId : pf.PortalId;
    var pid = typeof pidRaw === 'number' ? pidRaw : parseInt(String(pidRaw == null ? '0' : pidRaw), 10);
    if (!isFinite(pid) || pid < 0) pid = 0;
    var openUrl = url;
    if (!/[?&]portalId=/i.test(openUrl)) {
      openUrl += (openUrl.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', openUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    // DNN auth: anti-forgery token only (no TabId/ModuleId headers — see above)
    try {
      var sf = (window as any).$ && (window as any).$.ServicesFramework;
      if (sf) {
        var inst = sf(0);
        if (inst) {
          var token = inst.getAntiForgeryValue();
          if (token) xhr.setRequestHeader('RequestVerificationToken', token);
        }
      }
    } catch (_e2) { }

    // Oqtane/Web Bearer token
    var authToken = (window as any).__MF_TOKEN || ((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.authToken);
    if (authToken) xhr.setRequestHeader('Authorization', 'Bearer ' + authToken);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { callback(null, normalizeKeys(JSON.parse(xhr.responseText))); }
        catch (e) { callback('Invalid JSON response', null); }
      } else {
        callback('HTTP ' + xhr.status, null);
      }
    };
    xhr.send();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TEMPLATE ENGINE — XSL-style token replacement
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Replace {column_name} tokens in template with row values.
   * Supports:
   *   {col}                     — basic replacement (HTML-escaped)
   *   {col|raw}                 — no escaping
   *   {col|number}              — locale number format
   *   {col|date}                — locale date format
   *   {col|link:detail}         — wrap in clickable drill-down link using the same column as parentId
   *   {col|link:detail:other}   — drill-down link text from {col}, parentId from {other}
   *   {if:col op value}...{/if} — conditional blocks
   *   {#index}                  — row index (0-based)
   *   {#num}                    — row number (1-based)
   */
  function applyTemplate(template: string, row: any[], columns: { name: string }[], rowIndex: number): string {
    if (!template) return '';

    // Build column lookup
    var colMap: Record<string, any> = {};
    for (var i = 0; i < columns.length; i++) {
      registerColumnAlias(colMap, columns[i].name, row[i]);
    }

    var html = template;

    // ── Phase 3: Conditional blocks {if:col op value}...{/if} ──
    html = html.replace(/\{if:([^{}]+?)\s*(==|!=|<|>|<=|>=|contains)\s*([^}]*)\}([\s\S]*?)\{\/if\}/gi,
      function (_m: string, col: string, op: string, val: string, body: string) {
        var cv = colMap[normalizeTokenKey(col)];
        var rv = val.trim().replace(/^['"]|['"]$/g, '');
        var pass = false;
        switch (op) {
          case '==': pass = String(cv) === rv; break;
          case '!=': pass = String(cv) !== rv; break;
          case '<':  pass = Number(cv) < Number(rv); break;
          case '>':  pass = Number(cv) > Number(rv); break;
          case '<=': pass = Number(cv) <= Number(rv); break;
          case '>=': pass = Number(cv) >= Number(rv); break;
          case 'contains': pass = String(cv).toLowerCase().indexOf(rv.toLowerCase()) >= 0; break;
        }
        return pass ? body : '';
      }
    );

    // ── Special tokens ──
    html = html.replace(/\{#index\}/gi, String(rowIndex));
    html = html.replace(/\{#num\}/gi, String(rowIndex + 1));

    // ── Column tokens with pipes ──
    html = html.replace(/\{([^{}|]+?)(?:\|(\w+)(?::([^}]*))?)?\}/g,
      function (_m: string, col: string, pipe: string, pipeArg: string) {
        var val = colMap[normalizeTokenKey(col)];
        if (val === undefined || val === null) val = '';

        if (!pipe) return esc(val);

        switch (pipe.toLowerCase()) {
          case 'raw':
            return String(val);
          case 'number':
            var num = Number(val);
            return isNaN(num) ? esc(val) : num.toLocaleString();
          case 'date':
            try { return new Date(val).toLocaleDateString(); }
            catch (_e) { return esc(val); }
          case 'link':
            if (pipeArg && pipeArg.toLowerCase().indexOf('detail') === 0) {
              var detailCol = String(col).trim();
              var parts = String(pipeArg).split(':');
              if (parts.length > 1 && parts[1]) detailCol = parts[1];
              return '<a class="mfdr-drill" data-col="' + esc(detailCol) + '" href="javascript:void(0)">' + esc(val) + '</a>';
            }
            return '<a href="' + esc(val) + '" target="_blank">' + esc(val) + '</a>';
          case 'badge':
            var cls = pipeArg ? 'mfdr-badge mfdr-badge-' + esc(pipeArg) : 'mfdr-badge';
            return '<span class="' + cls + '">' + esc(val) + '</span>';
          default:
            return esc(val);
        }
      }
    );

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  GOLF SCORECARD — inline detail renderer (when golfMode=true)
  // ═══════════════════════════════════════════════════════════════════════════

  function hasGolfColumns(cols: { name: string }[]): boolean {
    var names = cols.map(function (c) { return c.name.toLowerCase(); });
    return names.indexOf('h1') >= 0 && names.indexOf('h9') >= 0 && names.indexOf('h18') >= 0;
  }

  function golfColVal(row: any[], cols: { name: string }[], name: string): any {
    for (var i = 0; i < cols.length; i++) {
      if (cols[i].name.toLowerCase() === name.toLowerCase()) return row[i];
    }
    return null;
  }

  function golfScoreClass(score: any, par: any): string {
    var s = parseInt(score, 10), p = parseInt(par, 10);
    if (isNaN(s) || isNaN(p) || s === 0) return '';
    var d = s - p;
    if (d <= -2) return 'mfgs-eagle';
    if (d === -1) return 'mfgs-birdie';
    if (d === 0) return 'mfgs-par';
    if (d === 1) return 'mfgs-bogey';
    return 'mfgs-dblbogey';
  }

  function renderGolfScorecard(data: QueryResult): string {
    var cols = data.columns;
    var html = '';
    for (var ri = 0; ri < data.rows.length; ri++) {
      var row = data.rows[ri];
      var course = golfColVal(row, cols, 'courseName') || '';
      var roundLabel = golfColVal(row, cols, 'roundLabel') || '';
      var tee = golfColVal(row, cols, 'tee') || '';
      var slopeRating = golfColVal(row, cols, 'slopeRating') || '';
      var handicap = golfColVal(row, cols, 'handicap') || '';
      var playerName = golfColVal(row, cols, 'playerName') || '';
      var slope = slopeRating ? slopeRating.split('/')[0].trim() : '';
      var rating = slopeRating ? slopeRating.split('/')[1].trim() : '';

      // ── Round header — clickable ──
      html += '<div class="mfgs-round">';
      html += '<div class="mfgs-round-hdr mfgs-toggle' + (ri === 0 ? ' mfgs-open' : '') + '">';
      html += '<span class="mfgs-arrow">&#9656;</span> ';
      html += '<strong>' + esc(roundLabel) + '</strong> &nbsp; ';
      html += '<em>' + esc(course) + ' (' + esc(tee) + ')</em>';
      html += '</div>';

      // ── Course info line: "White - Men Tee / SLOPE®: 123 / Course Rating™: 69.6 / CourseName" ──
      if (slopeRating) {
        html += '<div class="mfgs-slope' + (ri === 0 ? '' : ' mfgs-hidden') + '">';
        html += esc(tee) + ' Tee / SLOPE\u00AE: ' + esc(slope) + ' / Course Rating\u2122: ' + esc(rating) + ' / ' + esc(course);
        html += '</div>';
      }

      // Table — first round open, rest collapsed
      html += '<div class="mfgs-card-body' + (ri === 0 ? '' : ' mfgs-hidden') + '">';

      html += '<table class="mfgs-table"><thead><tr class="mfgs-holes"><th></th>';
      var h: number;
      for (h = 1; h <= 9; h++) html += '<th>' + h + '</th>';
      html += '<th class="mfgs-sep">Out</th>';
      for (h = 10; h <= 18; h++) html += '<th>' + h + '</th>';
      html += '<th class="mfgs-sep">In</th><th class="mfgs-sep">Total</th><th class="mfgs-sep">Net</th></tr></thead><tbody>';

      // ── Yardage row ──
      if (golfColVal(row, cols, 'h1Y') !== null) {
        html += '<tr class="mfgs-yardage"><td>Yardage</td>';
        for (h = 1; h <= 9; h++) html += '<td>' + (golfColVal(row, cols, 'h' + h + 'Y') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'outYard') || '') + '</td>';
        for (h = 10; h <= 18; h++) html += '<td>' + (golfColVal(row, cols, 'h' + h + 'Y') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'inYard') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'totalYard') || '') + '</td><td></td></tr>';
      }

      // ── Par row ──
      var parVals: number[] = [];
      var hasPar = golfColVal(row, cols, 'h1P') !== null;
      if (hasPar) {
        html += '<tr class="mfgs-par-row"><td>Par</td>';
        for (h = 1; h <= 18; h++) {
          var pv = golfColVal(row, cols, 'h' + h + 'P') || '';
          parVals.push(parseInt(String(pv), 10));
          if (h === 10) html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'outPar') || '') + '</td>';
          html += '<td>' + pv + '</td>';
        }
        html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'inPar') || '') + '</td>';
        html += '<td class="mfgs-sep">' + (golfColVal(row, cols, 'par') || '72') + '</td><td></td></tr>';
      }

      // ── Stroke Index row ──
      if (golfColVal(row, cols, 'h1SI') !== null) {
        html += '<tr class="mfgs-si-row"><td>Stroke Index</td>';
        for (h = 1; h <= 18; h++) {
          if (h === 10) html += '<td class="mfgs-sep"></td>';
          html += '<td>' + (golfColVal(row, cols, 'h' + h + 'SI') || '') + '</td>';
        }
        html += '<td class="mfgs-sep"></td><td class="mfgs-sep"></td><td></td></tr>';
      }

      // ── Score row — "Wed, April 22 - Moses Kim (6)" with circle/square indicators ──
      var scoreLabel = esc(roundLabel) + ' - ' + esc(playerName);
      if (handicap) scoreLabel += ' (' + esc(handicap) + ')';
      html += '<tr class="mfgs-score-row"><td class="mfgs-player-cell">' + scoreLabel + '</td>';
      for (h = 1; h <= 18; h++) {
        var sv = golfColVal(row, cols, 'h' + h);
        var cls = hasPar ? golfScoreClass(sv, parVals[h - 1]) : '';
        if (h === 10) html += '<td class="mfgs-sep mfgs-total">' + (golfColVal(row, cols, 'outTotal') || '') + '</td>';
        // Wrap score in span for circle/square decoration
        if (cls) {
          html += '<td><span class="mfgs-mark ' + cls + '">' + (sv || '') + '</span></td>';
        } else {
          html += '<td>' + (sv || '') + '</td>';
        }
      }
      html += '<td class="mfgs-sep mfgs-total">' + (golfColVal(row, cols, 'inTotal') || '') + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + (golfColVal(row, cols, 'total') || '') + '</td>';
      html += '<td class="mfgs-sep mfgs-total">' + (golfColVal(row, cols, 'net') || '') + '</td></tr>';

      html += '</tbody></table></div></div>';
    }
    return html;
  }

  /**
   * Auto-generate a simple table template from column metadata.
   * Used when admin doesn't provide a custom masterTemplate.
   */
  function autoTemplate(columns: { name: string }[], detailLevels: DetailLevelConfig[]): string {
    var triggerCols: Record<string, boolean> = {};
    if (detailLevels) {
      for (var d = 0; d < detailLevels.length; d++) {
        if (detailLevels[d].triggerCol) triggerCols[detailLevels[d].triggerCol.toLowerCase()] = true;
      }
    }
    var hdr = '<tr>';
    var body = '<tr class="mfdr-row" data-row-index="{#index}">';
    for (var i = 0; i < columns.length; i++) {
      var cn = columns[i].name;
      var hdrLabel = (columns[i] as any).label || cn;
      hdr += '<th>' + esc(hdrLabel) + '</th>';
      if (triggerCols[cn.toLowerCase()]) {
        body += '<td>{' + cn + '|link:detail}</td>';
      } else {
        body += '<td>{' + cn + '}</td>';
      }
    }
    hdr += '</tr>';
    body += '</tr>';
    return '<table class="mfdr-table"><thead>' + hdr + '</thead><tbody>{#each row}' + body + '{/each}</tbody></table>';
  }

  /**
   * Render full data table from template + result.
   * Handles the {#each row}...{/each} repeater block.
   */
  function renderDataHtml(template: string, data: QueryResult): string {
    if (!data || !data.rows || data.rows.length === 0) return '';

    // Find {#each row}...{/each} block
    var eachMatch = template.match(/\{#each\s+row\}([\s\S]*?)\{\/each\}/i);
    if (!eachMatch) {
      // No repeater block — treat entire template as per-row
      var rowsHtml = '';
      var ownsRowMarker = hasExplicitRowMarker(template);
      var tableRow = startsWithTableRow(template);
      for (var r = 0; r < data.rows.length; r++) {
        var rendered = applyTemplate(template, data.rows[r], data.columns, r);
        if (!ownsRowMarker && !tableRow) {
          rendered = '<div class="mfdr-row" data-row-index="' + r + '">' + rendered + '</div>';
        }
        rowsHtml += rendered;
      }
      return rowsHtml;
    }

    var beforeEach = template.substring(0, template.indexOf(eachMatch[0]));
    var afterEach = template.substring(template.indexOf(eachMatch[0]) + eachMatch[0].length);
    var rowTemplate = eachMatch[1];

    var rowsHtml2 = '';
    var ownsRowMarker2 = hasExplicitRowMarker(rowTemplate);
    var tableRow2 = startsWithTableRow(rowTemplate);
    for (var r2 = 0; r2 < data.rows.length; r2++) {
      var rendered2 = applyTemplate(rowTemplate, data.rows[r2], data.columns, r2);
      if (!ownsRowMarker2 && !tableRow2) {
        rendered2 = '<div class="mfdr-row" data-row-index="' + r2 + '">' + rendered2 + '</div>';
      }
      rowsHtml2 += rendered2;
    }

    return beforeEach + rowsHtml2 + afterEach;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CHART RENDERER (Phase 3) — lightweight canvas chart
  // ═══════════════════════════════════════════════════════════════════════════

  function renderChart(container: HTMLElement, data: QueryResult, chartType: string, labelCol: string, valueCol: string): void {
    if (!data || !data.rows || data.rows.length === 0) return;

    var labelIdx = -1, valueIdx = -1;
    for (var i = 0; i < data.columns.length; i++) {
      if (data.columns[i].name.toLowerCase() === labelCol.toLowerCase()) labelIdx = i;
      if (data.columns[i].name.toLowerCase() === valueCol.toLowerCase()) valueIdx = i;
    }
    if (labelIdx < 0 || valueIdx < 0) return;

    var labels: string[] = [];
    var values: number[] = [];
    for (var r = 0; r < data.rows.length; r++) {
      labels.push(String(data.rows[r][labelIdx] || ''));
      values.push(Number(data.rows[r][valueIdx]) || 0);
    }

    var maxVal = Math.max.apply(null, values) || 1;
    var w = 600, h = 300, pad = 50;
    var chartDiv = document.createElement('div');
    chartDiv.className = 'mfdr-chart-wrap';

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.style.maxWidth = '100%';
    chartDiv.appendChild(canvas);
    container.appendChild(chartDiv);

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var colors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

    if (chartType === 'pie') {
      var total = 0;
      for (var v = 0; v < values.length; v++) total += values[v];
      var startAngle = -Math.PI / 2;
      var cx = w / 2, cy = h / 2, radius = Math.min(cx, cy) - pad;
      for (var p = 0; p < values.length; p++) {
        var slice = (values[p] / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startAngle, startAngle + slice);
        ctx.fillStyle = colors[p % colors.length];
        ctx.fill();
        startAngle += slice;
      }
      // Legend
      var legend = document.createElement('div');
      legend.className = 'mfdr-chart-legend';
      for (var lg = 0; lg < labels.length; lg++) {
        legend.innerHTML += '<span class="mfdr-legend-item"><span class="mfdr-legend-color" style="background:' +
          colors[lg % colors.length] + '"></span>' + esc(labels[lg]) + ' (' + values[lg] + ')</span>';
      }
      chartDiv.appendChild(legend);
    } else {
      // Bar or Line
      var barW = (w - pad * 2) / labels.length;
      var plotH = h - pad * 2;

      // Y axis
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, h - pad);
      ctx.lineTo(w - pad, h - pad);
      ctx.stroke();

      if (chartType === 'line') {
        ctx.beginPath();
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 2;
        for (var li = 0; li < values.length; li++) {
          var lx = pad + barW * li + barW / 2;
          var ly = h - pad - (values[li] / maxVal) * plotH;
          if (li === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
        }
        ctx.stroke();
        // Dots
        for (var di = 0; di < values.length; di++) {
          var dx = pad + barW * di + barW / 2;
          var dy = h - pad - (values[di] / maxVal) * plotH;
          ctx.beginPath();
          ctx.arc(dx, dy, 4, 0, Math.PI * 2);
          ctx.fillStyle = colors[0];
          ctx.fill();
        }
      } else {
        // Bars
        for (var bi = 0; bi < values.length; bi++) {
          var bx = pad + barW * bi + barW * 0.1;
          var bh = (values[bi] / maxVal) * plotH;
          var by = h - pad - bh;
          ctx.fillStyle = colors[bi % colors.length];
          ctx.fillRect(bx, by, barW * 0.8, bh);
        }
      }

      // X labels
      ctx.fillStyle = '#64748b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      for (var xi = 0; xi < labels.length; xi++) {
        var xPos = pad + barW * xi + barW / 2;
        var lbl = labels[xi].length > 10 ? labels[xi].substring(0, 10) + '…' : labels[xi];
        ctx.fillText(lbl, xPos, h - pad + 14);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DEFAULTS & PROPERTIES (Builder Config Panel)
  // ═══════════════════════════════════════════════════════════════════════════

  var defaults: DataRepeaterProps = {
    dataSource: 'sql',
    connectionKey: 'DashboardDatabase',
    databaseType: '',
    masterQuery: '',
    submissionsFormId: 0,
    statusFilter: '',
    fieldWhitelistCsv: '',
    masterTemplate: '',
    detailLevels: [],
    filters: [],
    pageSize: 50,
    refreshInterval: 0,
    emptyMessage: tr('widget.datarepeater.empty', 'No data found.'),
    cssClass: '',
    maxRows: 1000,
    allowExportCsv: false,
    allowExportPdf: false,
    chartType: '',
    chartLabelCol: '',
    chartValueCol: '',
    queryDependsOn: '',
    reloadOnParamChange: true,
    groupByCol: '',
    golfMode: false,
    detail1Query: '', detail1Template: '', detail1TriggerCol: '', detail1Placement: '',
    detail2Query: '', detail2Template: '', detail2TriggerCol: '', detail2Placement: '',
    detail3Query: '', detail3Template: '', detail3TriggerCol: '', detail3Placement: '',
    filter1Label: '', filter1Type: '', filter1Query: '', filter1Param: '',
    filter2Label: '', filter2Type: '', filter2Query: '', filter2Param: ''
  };

  var properties = [
    // ── STEP 1: Data Source (required) ──
    { key: 'connectionKey', label: 'Connection Name', type: 'text' },
    { key: 'databaseType', label: 'Database Type', type: 'select', options: [
      { label: 'Auto-detect', value: '' },
      { label: 'SQL Server', value: 'SqlServer' },
      { label: 'SQLite', value: 'Sqlite' },
      { label: 'PostgreSQL', value: 'PostgreSql' },
      { label: 'MySQL', value: 'MySql' }
    ]},
    { key: 'dataSource', label: 'Query Type', type: 'select', options: [
      { label: 'SQL Query', value: 'sql' },
      { label: 'Stored Procedure', value: 'storedproc' },
      { label: 'Form Submissions (SDK — no SQL)', value: 'megaform_submissions' }
    ]},
    { key: 'masterQuery', label: 'SQL Query (table auto-generated from columns)', type: 'textarea' },

    // ── Form Submissions source (when Query Type = Form Submissions) ──
    { key: '_divider_submissions', label: '── FORM SUBMISSIONS (Query Type = Form Submissions) ──', type: 'text' },
    { key: 'submissionsFormId', label: 'Source Form ID (0 = this form)', type: 'number' },
    { key: 'statusFilter', label: 'Status Filter (blank = all submissions)', type: 'text' },
    { key: 'fieldWhitelistCsv', label: 'Public Fields — comma-separated keys; ONLY these are shown (privacy)', type: 'text' },
    { key: 'queryDependsOn', label: 'Extra SQL Params From Form Fields (comma-separated keys)', type: 'text' },
    { key: 'reloadOnParamChange', label: 'Reload When Those Form Fields Change', type: 'checkbox' },

    // ── STEP 2: Drill-Down Level 1 (optional) ──
    { key: '_divider_detail1', label: '── DRILL-DOWN LEVEL 1 ──', type: 'text' },
    { key: 'detail1TriggerCol', label: 'Click Column (column name that opens detail)', type: 'text' },
    { key: 'detail1Query', label: 'Detail Query (use :parentId for clicked value)', type: 'textarea' },
    { key: 'detail1Placement', label: 'Detail Placement (after|before)', type: 'text' },

    // ── STEP 3: Drill-Down Level 2 (optional) ──
    { key: '_divider_detail2', label: '── DRILL-DOWN LEVEL 2 ──', type: 'text' },
    { key: 'detail2TriggerCol', label: 'Click Column (in level 1 results)', type: 'text' },
    { key: 'detail2Query', label: 'Detail Query (use :parentId)', type: 'textarea' },
    { key: 'detail2Placement', label: 'Detail Placement (after|before)', type: 'text' },

    // ── STEP 4: Drill-Down Level 3 (optional) ──
    { key: '_divider_detail3', label: '── DRILL-DOWN LEVEL 3 ──', type: 'text' },
    { key: 'detail3TriggerCol', label: 'Click Column', type: 'text' },
    { key: 'detail3Query', label: 'Detail Query (use :parentId)', type: 'textarea' },
    { key: 'detail3Placement', label: 'Detail Placement (after|before)', type: 'text' },

    // ── STEP 5: Filters (optional) ──
    { key: '_divider_filter1', label: '── FILTER 1 ──', type: 'text' },
    { key: 'filter1Label', label: 'Filter Label', type: 'text' },
    { key: 'filter1Param', label: 'SQL Param Name (e.g. flight)', type: 'text' },
    { key: 'filter1Type', label: 'Filter Type', type: 'select', options: [
      { label: 'None', value: '' },
      { label: 'Dropdown (auto from SQL)', value: 'dropdown' },
      { label: 'Text Search', value: 'text' },
      { label: 'Date Range', value: 'daterange' }
    ]},
    { key: 'filter1Query', label: 'Dropdown Options Query (dropdown only)', type: 'textarea' },

    { key: '_divider_filter2', label: '── FILTER 2 ──', type: 'text' },
    { key: 'filter2Label', label: 'Filter Label', type: 'text' },
    { key: 'filter2Param', label: 'SQL Param Name', type: 'text' },
    { key: 'filter2Type', label: 'Filter Type', type: 'select', options: [
      { label: 'None', value: '' },
      { label: 'Dropdown (auto from SQL)', value: 'dropdown' },
      { label: 'Text Search', value: 'text' },
      { label: 'Date Range', value: 'daterange' }
    ]},
    { key: 'filter2Query', label: 'Dropdown Options Query', type: 'textarea' },

    // ── Display ──
    { key: '_divider_display', label: '── DISPLAY ──', type: 'text' },
    { key: 'groupByCol', label: 'Group By Column (accordion sections)', type: 'text' },
    { key: 'golfMode', label: 'Golf Scorecard Mode (color-coded)', type: 'checkbox' },
    { key: 'pageSize', label: 'Page Size (0=all)', type: 'number' },
    { key: 'refreshInterval', label: 'Auto-Refresh Seconds (0=off)', type: 'number' },
    { key: 'allowExportCsv', label: 'Allow CSV Export', type: 'checkbox' },
    { key: 'allowExportPdf', label: 'Allow PDF Export (print)', type: 'checkbox' },
    { key: 'chartType', label: 'Chart Mode', type: 'select', options: [
      { label: 'None (table only)', value: '' },
      { label: 'Bar Chart', value: 'bar' },
      { label: 'Line Chart', value: 'line' },
      { label: 'Pie Chart', value: 'pie' }
    ]},
    { key: 'chartLabelCol', label: 'Chart Label Column', type: 'text' },
    { key: 'chartValueCol', label: 'Chart Value Column', type: 'text' },

    // ── Advanced: Custom Templates (leave empty = auto) ──
    { key: '_divider_adv', label: '── ADVANCED (leave empty = auto table) ──', type: 'text' },
    { key: 'masterTemplate', label: 'Custom Master Template (HTML with {col} tokens)', type: 'textarea' },
    { key: 'detail1Template', label: 'Custom L1 Detail Template', type: 'textarea' },
    { key: 'detail2Template', label: 'Custom L2 Detail Template', type: 'textarea' },
    { key: 'detail3Template', label: 'Custom L3 Detail Template', type: 'textarea' },
    { key: 'emptyMessage', label: 'Empty Message', type: 'text' },
    { key: 'cssClass', label: 'CSS Class', type: 'text' },
    { key: 'maxRows', label: 'Max Rows (server cap)', type: 'number' }
  ];

  /**
   * Reconstruct detailLevels[] and filters[] from flat widgetProps.
   * Builder saves flat keys (detail1Query, detail1Template, detail1TriggerCol, etc.)
   * Runtime needs arrays: detailLevels[{query,template,triggerCol}], filters[{...}]
   */
  function getProps(field: FieldLike): DataRepeaterProps {
    var wp = field.widgetProps || {};
    var merged: any = {};
    for (var k in defaults) { merged[k] = (defaults as any)[k]; }
    for (var k2 in wp) { if (wp[k2] !== undefined && wp[k2] !== null) merged[k2] = wp[k2]; }

    // ── Reconstruct detailLevels from flat props ──
    var levels: DetailLevelConfig[] = [];
    for (var li = 1; li <= 3; li++) {
      var q = String(merged['detail' + li + 'Query'] || '').trim();
      var t = String(merged['detail' + li + 'Template'] || '').trim();
      var tc = String(merged['detail' + li + 'TriggerCol'] || '').trim();
      var plc = String(merged['detail' + li + 'Placement'] || '').trim();
      if (q || t || tc || plc) {
        levels.push({ query: q, template: t, triggerCol: tc, placement: plc });
      }
    }
    // Also keep any detailLevels that were set directly (schema JSON edit)
    if (merged.detailLevels && merged.detailLevels.length > 0 && levels.length === 0) {
      levels = merged.detailLevels;
    }
    for (var lvi = 0; lvi < levels.length; lvi++) {
      if (!levels[lvi].placement) levels[lvi].placement = 'after';
    }
    merged.detailLevels = levels;

    // ── Reconstruct filters from flat props ──
    var filts: FilterConfig[] = [];
    for (var fi = 1; fi <= 2; fi++) {
      var fl = String(merged['filter' + fi + 'Label'] || '').trim();
      var ft = String(merged['filter' + fi + 'Type'] || '').trim();
      var fq = String(merged['filter' + fi + 'Query'] || '').trim();
      var fp = String(merged['filter' + fi + 'Param'] || '').trim();
      if (ft && fp) {
        filts.push({ key: 'filter' + fi, label: fl || 'Filter ' + fi, filterType: ft, query: fq, paramName: fp });
      }
    }
    if (merged.filters && merged.filters.length > 0 && filts.length === 0) {
      filts = merged.filters;
    }
    merged.filters = filts;

    return merged as DataRepeaterProps;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER — returns initial HTML skeleton (data loaded via AJAX in bind)
  // ═══════════════════════════════════════════════════════════════════════════

  function render(field: FieldLike, formId: number, _existingValue?: string): string {
    var props = getProps(field);
    var key = field.key || 'dr_0';
    var cls = 'mfdr-wrap' + (props.cssClass ? ' ' + esc(props.cssClass) : '');

    var html = '<div class="' + cls + '" data-mfdr-key="' + esc(key) + '" data-mfdr-form="' + formId + '"' +
               ' data-mf-displayonly-keep="1"' +
               ' data-mfdr-props="' + esc(JSON.stringify(props)) + '">';

    // [DataRepeaterDesigner v20260504-07] Note: the Builder's canvas does NOT
    // call render() — it uses a simplified placeholder (canvas.ts → "Data
    // Repeater Widget" badge). The Open Designer launcher is therefore
    // injected by the canvas observer at the bottom of this file, which
    // appends a button into each .mf-canvas-field[data-type="DataRepeater"]
    // card on the Builder. Runtime render() stays clean.

    // ── Toolbar: filters + export buttons ──
    html += '<div class="mfdr-toolbar">';

    // Filters (Phase 3)
    if (props.filters && props.filters.length > 0) {
      html += '<div class="mfdr-filters">';
      for (var fi = 0; fi < props.filters.length; fi++) {
        var f = props.filters[fi];
        html += '<div class="mfdr-filter-item">';
        html += '<label class="mfdr-filter-label">' + esc(f.label || f.key) + '</label>';
        if (f.filterType === 'dropdown') {
          html += '<select class="mfdr-filter-select" data-mfdr-filter="' + esc(f.key) + '" data-param="' + esc(f.paramName) + '">';
          html += '<option value="">' + tr('widget.datarepeater.all', 'All') + '</option></select>';
        } else if (f.filterType === 'daterange') {
          html += '<input type="date" class="mfdr-filter-date" data-mfdr-filter="' + esc(f.key) + '_from" data-param="' + esc(f.paramName) + '_from" />';
          html += '<input type="date" class="mfdr-filter-date" data-mfdr-filter="' + esc(f.key) + '_to" data-param="' + esc(f.paramName) + '_to" />';
        } else {
          html += '<input type="text" class="mfdr-filter-input" data-mfdr-filter="' + esc(f.key) + '" data-param="' + esc(f.paramName) + '" placeholder="' + esc(f.label) + '" />';
        }
        html += '</div>';
      }
      html += '<button type="button" class="mfdr-filter-btn">' + tr('widget.datarepeater.apply', 'Apply') + '</button>';
      html += '</div>';
    }

    // Export buttons (Phase 2)
    if (props.allowExportCsv || props.allowExportPdf) {
      html += '<div class="mfdr-export-bar">';
      if (props.allowExportCsv) {
        html += '<button type="button" class="mfdr-export-btn" data-format="csv">&#x2913; CSV</button>';
      }
      if (props.allowExportPdf) {
        html += '<button type="button" class="mfdr-export-btn" data-format="pdf">&#x2913; PDF</button>';
      }
      html += '</div>';
    }
    html += '</div>'; // toolbar

    // ── Chart area (Phase 3) ──
    if (props.chartType) {
      html += '<div class="mfdr-chart" data-chart-type="' + esc(props.chartType) + '"></div>';
    }

    // ── Data area (filled by AJAX) ──
    html += '<div class="mfdr-data">';
    html += '<div class="mfdr-loading"><span class="mfdr-spinner"></span> ' +
            tr('widget.datarepeater.loading', 'Loading data…') + '</div>';
    html += '</div>';

    // ── Pagination (Phase 2) ──
    html += '<div class="mfdr-pagination" style="display:none"></div>';

    // ── Status bar ──
    html += '<div class="mfdr-status"></div>';

    html += '</div>'; // wrap
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  BIND — attach event listeners + AJAX load data
  // ═══════════════════════════════════════════════════════════════════════════

  function bind(formId: number): void {
    var wraps = document.querySelectorAll('[data-mfdr-form="' + formId + '"]');
    for (var i = 0; i < wraps.length; i++) {
      bindInstance(wraps[i] as HTMLElement, formId);
    }
  }

  function bindInstance(wrap: HTMLElement, formId: number): void {
    var key = wrap.getAttribute('data-mfdr-key') || '';
    var dataDiv = wrap.querySelector('.mfdr-data') as HTMLElement;
    var paginationDiv = wrap.querySelector('.mfdr-pagination') as HTMLElement;
    var statusDiv = wrap.querySelector('.mfdr-status') as HTMLElement;
    var chartDiv = wrap.querySelector('.mfdr-chart') as HTMLElement;

    if (!dataDiv) return;
    // [DataRepeaterDesigner v20260504-07] Builder launcher moved to the
    // canvas-observer bootstrap at the bottom of this file (the Builder
    // canvas doesn't call render(), so the in-render launcher never fired).

    // Read props from the original field config (stashed in a script tag by renderer)
    var propsJson = wrap.getAttribute('data-mfdr-props');
    var props: DataRepeaterProps = propsJson ? JSON.parse(propsJson) : defaults;

    // Merge from form schema if available
    try {
      var schemaField = findFieldInRenderedForm(formId, key);
      if (schemaField) props = getProps(schemaField);
    } catch (_e) { }

    // State
    var currentPage = 1;
    var currentFilters: Record<string, string> = {};
    var refreshTimer: any = null;
    var filterSelects = Array.prototype.slice.call(
      wrap.querySelectorAll('.mfdr-filter-select')
    ) as HTMLSelectElement[];
    var reservedQueryKeys: Record<string, boolean> = {
      view: true,
      vk: true,
      id: true,
      edit: true,
      resume: true,
      mfpanel: true,
      formid: true,
      moduleid: true,
      siteid: true,
      tabid: true,
      authmoduleid: true,
      authsiteid: true
    };

    function cloneFilters(src?: Record<string, string>): Record<string, string> {
      var out: Record<string, string> = {};
      if (!src) return out;
      for (var k in src) {
        if (!src.hasOwnProperty(k)) continue;
        out[k] = src[k];
      }
      return out;
    }

    function parseDependsOnKeys(raw: any): string[] {
      if (Array.isArray(raw)) {
        return raw
          .map(function (s) { return String(s || '').trim(); })
          .filter(function (s, idx, arr) { return !!s && arr.indexOf(s) === idx; });
      }
      if (typeof raw === 'string') {
        return raw
          .split(',')
          .map(function (s) { return String(s || '').trim(); })
          .filter(function (s, idx, arr) { return !!s && arr.indexOf(s) === idx; });
      }
      return [];
    }

    function readParentValues(parentKeys: string[]): Record<string, string> {
      var out: Record<string, string> = {};
      if (!parentKeys || !parentKeys.length) return out;
      var wrapperEl = document.getElementById('mf-form-wrapper-' + formId) || document;
      for (var pi = 0; pi < parentKeys.length; pi++) {
        var parentKey = String(parentKeys[pi] || '').trim();
        if (!parentKey) continue;

        var byId = document.getElementById('mf-' + formId + '-' + parentKey) as HTMLInputElement | HTMLSelectElement | null;
        if (byId && 'value' in byId && byId.value !== '' && byId.value != null) {
          out[parentKey] = String(byId.value);
          continue;
        }

        var radio = wrapperEl.querySelector('input[name="' + parentKey + '"]:checked') as HTMLInputElement | null;
        if (radio) {
          out[parentKey] = radio.value;
          continue;
        }

        var checks = Array.prototype.slice.call(
          wrapperEl.querySelectorAll('input[type="checkbox"][name="' + parentKey + '"]:checked')
        ) as HTMLInputElement[];
        if (checks.length) {
          out[parentKey] = checks.map(function (c) { return c.value; }).join(',');
          continue;
        }

        var text = wrapperEl.querySelector('[name="' + parentKey + '"]') as HTMLInputElement | HTMLSelectElement | null;
        if (text && 'value' in text && text.value) {
          out[parentKey] = String(text.value);
        }
      }
      return out;
    }

    function readCommonQueryParams(): Record<string, string> {
      var out: Record<string, string> = {};
      try {
        var params = new URLSearchParams(window.location.search || '');
        params.forEach(function (value, key) {
          var norm = String(key || '').trim().toLowerCase();
          if (!norm || reservedQueryKeys[norm]) return;
          if (value == null || value === '') return;
          out[key] = String(value);
        });
      } catch (_e) { }
      return out;
    }

    function getExternalParamKeys(): string[] {
      return parseDependsOnKeys((props as any).queryDependsOn);
    }

    function collectExternalParams(): Record<string, string> {
      var out = readCommonQueryParams();
      var keys = getExternalParamKeys();
      var parentValues = keys.length ? readParentValues(keys) : {};
      for (var k in parentValues) {
        if (!parentValues.hasOwnProperty(k)) continue;
        out[k] = parentValues[k];
      }
      return out;
    }

    function appendPrefixedParams(url: string, values: Record<string, string>): string {
      if (!values) return url;
      var out = url;
      for (var k in values) {
        if (!values.hasOwnProperty(k)) continue;
        var val = values[k];
        if (!k || val == null || val === '') continue;
        out += '&__p__' + encodeURIComponent(k) + '=' + encodeURIComponent(String(val));
      }
      return out;
    }

    function getSharedFilterScope(): string {
      if (!props.filters || props.filters.length === 0) return '';
      var params: string[] = [];
      for (var i = 0; i < props.filters.length; i++) {
        var p = String((props.filters[i].paramName || props.filters[i].key || '')).trim().toLowerCase();
        if (p) params.push(p);
      }
      if (params.length === 0) return '';
      params.sort();
      return 'form-' + formId + '|mfdr:' + params.join('|');
    }

    var sharedFilterScope = getSharedFilterScope();

    function readSharedFilters(): Record<string, string> {
      if (!sharedFilterScope) return {};
      try {
        var w = window as any;
        var store = w.__MFDR_SHARED_FILTERS__ || {};
        return cloneFilters(store[sharedFilterScope] || {});
      } catch (_e) {
        return {};
      }
    }

    function writeSharedFilters(filters: Record<string, string>): void {
      if (!sharedFilterScope) return;
      try {
        var w = window as any;
        if (!w.__MFDR_SHARED_FILTERS__) w.__MFDR_SHARED_FILTERS__ = {};
        w.__MFDR_SHARED_FILTERS__[sharedFilterScope] = cloneFilters(filters);
        window.dispatchEvent(new CustomEvent('mfdr:filters-changed', {
          detail: {
            scope: sharedFilterScope,
            source: key,
            filters: cloneFilters(filters)
          }
        }));
      } catch (_e) { }
    }

    currentFilters = readSharedFilters();

    function collectFilterValues(excludeFilterKey?: string): Record<string, string> {
      var values: Record<string, string> = {};
      var inputs = wrap.querySelectorAll('[data-mfdr-filter]');
      for (var ii = 0; ii < inputs.length; ii++) {
        var inp = inputs[ii] as HTMLInputElement | HTMLSelectElement;
        var filterKey = inp.getAttribute('data-mfdr-filter') || '';
        if (excludeFilterKey && filterKey === excludeFilterKey) continue;
        var param = inp.getAttribute('data-param') || filterKey;
        if (!param) continue;
        var val = inp.value || '';
        if (val) values[param] = val;
      }
      return values;
    }

    function collectContextValues(excludeFilterKey?: string): Record<string, string> {
      var values = collectExternalParams();
      var filters = collectFilterValues(excludeFilterKey);
      for (var k in filters) {
        if (!filters.hasOwnProperty(k)) continue;
        values[k] = filters[k];
      }
      return values;
    }

    function populateFilterSelect(sel: HTMLSelectElement, preserveValue?: string, callback?: () => void): void {
      var filterKey = sel.getAttribute('data-mfdr-filter') || '';
      var paramName = sel.getAttribute('data-param') || filterKey;
      var existingValue = preserveValue != null
        ? preserveValue
        : ((paramName && currentFilters[paramName]) || sel.value || '');
      sel.innerHTML = '<option value="">' + tr('widget.datarepeater.all', 'All') + '</option>';

      var optUrl = getApiBase() + 'DataRepeater/FilterOptions?formId=' + formId +
                   '&widgetKey=' + encodeURIComponent(key) +
                   '&filterKey=' + encodeURIComponent(filterKey);
      var contextValues = collectContextValues(filterKey);
      var contextJson = JSON.stringify(contextValues);
      if (contextJson !== '{}') {
        optUrl += '&contextJson=' + encodeURIComponent(contextJson);
      }
      optUrl = appendPrefixedParams(optUrl, collectExternalParams());

      ajax(optUrl, function (err, resp) {
        if (!err && resp && resp.options) {
          for (var oi = 0; oi < resp.options.length; oi++) {
            var opt = document.createElement('option');
            opt.value = resp.options[oi].value || '';
            opt.textContent = resp.options[oi].label || resp.options[oi].value || '';
            sel.appendChild(opt);
          }
        }
        if (existingValue) sel.value = existingValue;
        if (callback) callback();
      });
    }

    function repopulateDependentSelects(startIndex: number): void {
      if (!filterSelects || filterSelects.length === 0) return;
      for (var si = startIndex; si < filterSelects.length; si++) {
        filterSelects[si].value = '';
        populateFilterSelect(filterSelects[si], '');
      }
    }

    // ── Load master data ──
    function loadData(page: number): void {
      currentPage = page;
      dataDiv.innerHTML = '<div class="mfdr-loading"><span class="mfdr-spinner"></span> ' +
                          tr('widget.datarepeater.loading', 'Loading data…') + '</div>';

      var url = getApiBase() + 'DataRepeater/Query?formId=' + formId +
                '&widgetKey=' + encodeURIComponent(key) +
                '&page=' + page +
                '&pageSize=' + (props.pageSize || 50);

      // Append filters
      var filterJson = JSON.stringify(currentFilters);
      if (filterJson !== '{}') {
        url += '&filterJson=' + encodeURIComponent(filterJson);
      }
      url = appendPrefixedParams(url, collectExternalParams());

      ajax(url, function (err, data: QueryResult) {
        if (err || !data) {
          dataDiv.innerHTML = '<div class="mfdr-error">' + esc(err || 'Unknown error') + '</div>';
          return;
        }
        if (data.error) {
          dataDiv.innerHTML = '<div class="mfdr-error">' + esc(data.error) + '</div>';
          return;
        }
        if (!data.rows || data.rows.length === 0) {
          dataDiv.innerHTML = '<div class="mfdr-empty">' + esc(props.emptyMessage) + '</div>';
          updatePagination(0, page);
          updateStatus(0, 0);
          return;
        }

        // Determine template
        var tmpl = props.masterTemplate;
        if (!tmpl) tmpl = autoTemplate(data.columns, props.detailLevels);

        // Render — grouped accordion or flat table
        var html: string;
        if (props.groupByCol) {
          html = renderGrouped(data, tmpl, props.groupByCol);
        } else {
          html = renderDataHtml(tmpl, data);
        }
        dataDiv.innerHTML = html;

        // Bind accordion toggle
        var groupHeaders = dataDiv.querySelectorAll('.mfdr-group-hdr');
        for (var gi = 0; gi < groupHeaders.length; gi++) {
          groupHeaders[gi].addEventListener('click', function () {
            var body = this.nextElementSibling;
            if (body) body.classList.toggle('mfdr-group-collapsed');
            this.classList.toggle('mfdr-group-open');
          });
        }

        // Stash data for drill-down
        (dataDiv as any).__mfdrData = data;

        // Bind drill-down links
        bindDrillDown(dataDiv, data, props, formId, key);

        // Bind sortable headers
        bindSort(dataDiv);

        // Update pagination
        updatePagination(data.totalRows, page);

        // Update status
        updateStatus(data.totalRows, data.executionMs);

        // Render chart (Phase 3)
        if (chartDiv && props.chartType) {
          chartDiv.innerHTML = '';
          renderChart(chartDiv, data, props.chartType, props.chartLabelCol, props.chartValueCol);
        }
      });
    }

    // ── Grouped Accordion Rendering ──
    function renderGrouped(data: QueryResult, tmpl: string, groupCol: string): string {
      var colIdx = -1;
      for (var ci = 0; ci < data.columns.length; ci++) {
        if (data.columns[ci].name.toLowerCase() === groupCol.toLowerCase()) { colIdx = ci; break; }
      }
      if (colIdx < 0) return renderDataHtml(tmpl, data); // fallback to flat

      // Group rows by column value
      var groups: Record<string, any[][]> = {};
      var groupOrder: string[] = [];
      for (var ri = 0; ri < data.rows.length; ri++) {
        var gv = String(data.rows[ri][colIdx] || 'Other');
        if (!groups[gv]) { groups[gv] = []; groupOrder.push(gv); }
        // Strip groupByCol value from row
        var row = data.rows[ri].slice();
        row.splice(colIdx, 1);
        groups[gv].push(row);
      }

      // Strip groupByCol from columns
      var displayCols = data.columns.filter(function (_c, i) { return i !== colIdx; });

      // Regenerate template without the groupByCol
      var groupTmpl = autoTemplate(displayCols, props.detailLevels);

      var out = '';
      for (var g = 0; g < groupOrder.length; g++) {
        var gName = groupOrder[g];
        var gRows = groups[gName];
        var isFirst = g === 0;
        out += '<div class="mfdr-group">';
        out += '<div class="mfdr-group-hdr' + (isFirst ? ' mfdr-group-open' : '') + '">';
        out += '<span class="mfdr-group-arrow">&#9656;</span> ' + esc(gName);
        out += ' <span class="mfdr-group-count">(' + gRows.length + ')</span></div>';
        out += '<div class="mfdr-group-body' + (isFirst ? '' : ' mfdr-group-collapsed') + '">';

        var groupData: QueryResult = {
          columns: displayCols,
          rows: gRows,
          totalRows: gRows.length,
          page: 1, pageSize: gRows.length,
          executionMs: 0, error: null, hasMore: false
        };
        out += renderDataHtml(props.masterTemplate || groupTmpl, groupData);
        out += '</div></div>';
      }
      return out;
    }

    // ── Drill-down (Phase 1 + Phase 3 multi-level) ──
    function bindDrillDown(container: HTMLElement, data: QueryResult, props: DataRepeaterProps, formId: number, widgetKey: string): void {
      var links = container.querySelectorAll('.mfdr-drill');
      for (var li = 0; li < links.length; li++) {
        (function (link) {
          link.addEventListener('click', function (e) {
            e.preventDefault();
            var rowEl = link.closest('[data-row-index]') || link.closest('.mfdr-row') || link.closest('tr') || link.parentElement;
            if (!rowEl) return;

            // Toggle — if detail already open, close it
            var existing = null as any;

            // Determine detail level
            var level = 1;
            var parentNode = rowEl.parentElement;
            while (parentNode) {
              if (parentNode.classList && parentNode.classList.contains('mfdr-detail-row')) level++;
              parentNode = parentNode.parentElement;
            }

            var lvlIdx = Math.min(level - 1, (props.detailLevels || []).length - 1);
            var levelCfg = (props.detailLevels && props.detailLevels[lvlIdx]) ? props.detailLevels[lvlIdx] : null;
            var detailPlacement = levelCfg && String(levelCfg.placement || '').toLowerCase() === 'before' ? 'before' : 'after';

            // Toggle — if detail already open, close it
            existing = detailPlacement === 'before' ? rowEl.previousElementSibling : rowEl.nextElementSibling;
            if ((!existing || !existing.classList.contains('mfdr-detail-row'))) {
              var altExisting = detailPlacement === 'before' ? rowEl.nextElementSibling : rowEl.previousElementSibling;
              if (altExisting && altExisting.classList.contains('mfdr-detail-row')) existing = altExisting;
            }
            if (existing && existing.classList.contains('mfdr-detail-row')) {
              existing.parentElement.removeChild(existing);
              return;
            }

            // Find row index to get parentId
            var rowIdx = parseInt((rowEl.getAttribute && rowEl.getAttribute('data-row-index')) || '0', 10);
            var triggerCol = link.getAttribute('data-col') || '';

            // Find the parentId value — use first column value as ID by default
            var parentId = '';
            if (data && data.rows && data.rows[rowIdx]) {
              // Try to find the trigger column's value, or fall back to first column
              for (var ci = 0; ci < data.columns.length; ci++) {
                if (data.columns[ci].name.toLowerCase() === triggerCol.toLowerCase()) {
                  parentId = stringOrEmpty(data.rows[rowIdx][ci]);
                  break;
                }
              }
              if (!parentId && data.rows[rowIdx].length > 0) {
                parentId = stringOrEmpty(data.rows[rowIdx][0]);
              }
            }

            // Create detail row placeholder
            var isTableRowHost = rowEl.tagName === 'TR';
            var detailRow = document.createElement(isTableRowHost ? 'tr' : 'div');

            // ── Emit to MegaFormBus (for GolfScorecard + other listeners) ──
            try {
              var bus = (window as any).MegaFormBus;
              if (bus && bus.emit) {
                // Collect all column values for this row
                var rowData: Record<string, any> = {};
                for (var rci = 0; rci < data.columns.length; rci++) {
                  rowData[data.columns[rci].name] = data.rows[rowIdx] ? data.rows[rowIdx][rci] : null;
                }
                bus.emit('mfw:drill-down', {
                  channel: 'form-' + formId,
                  formId: formId,
                  widgetKey: widgetKey,
                  parentId: parentId,
                  triggerCol: triggerCol,
                  level: level,
                  row: rowData
                });
              }
            } catch (_busErr) { }
            detailRow.className = 'mfdr-detail-row mfdr-detail-level-' + level;
            if (detailPlacement === 'before') detailRow.className += ' mfdr-detail-before';
            if (isTableRowHost) {
              var renderedCols = (rowEl && (rowEl as any).children && (rowEl as any).children.length) ? (rowEl as any).children.length : 0;
              var colSpan = renderedCols > 0 ? renderedCols : data.columns.length;
              detailRow.innerHTML = '<td colspan="' + colSpan + '">' +
                '<div class="mfdr-detail-content mfdr-loading">' +
                '<span class="mfdr-spinner"></span> Loading…</div></td>';
            } else {
              detailRow.innerHTML = '<div class="mfdr-detail-content mfdr-loading">' +
                '<span class="mfdr-spinner"></span> Loading…</div>';
            }
            if (detailPlacement === 'before') {
              rowEl.parentElement.insertBefore(detailRow, rowEl);
            } else if (rowEl.nextSibling) {
              rowEl.parentElement.insertBefore(detailRow, rowEl.nextSibling);
            } else {
              rowEl.parentElement.appendChild(detailRow);
            }

            // AJAX load detail
            var detailUrl = getApiBase() + 'DataRepeater/Query?formId=' + formId +
                            '&widgetKey=' + encodeURIComponent(widgetKey) +
                            '&parentId=' + encodeURIComponent(parentId) +
                            '&level=' + level +
                            '&pageSize=200';

            var detailFilterJson = JSON.stringify(currentFilters);
            if (detailFilterJson !== '{}') {
              detailUrl += '&filterJson=' + encodeURIComponent(detailFilterJson);
            }
            detailUrl = appendPrefixedParams(detailUrl, collectExternalParams());

            ajax(detailUrl, function (err2, detailData: QueryResult) {
              var cell = detailRow.querySelector('.mfdr-detail-content') as HTMLElement;
              if (!cell) return;

              if (err2 || !detailData || detailData.error) {
                cell.innerHTML = '<div class="mfdr-error">' + esc(err2 || (detailData && detailData.error) || 'Error') + '</div>';
                cell.classList.remove('mfdr-loading');
                return;
              }

              if (!detailData.rows || detailData.rows.length === 0) {
                cell.innerHTML = '<div class="mfdr-empty">No detail data.</div>';
                cell.classList.remove('mfdr-loading');
                return;
              }

              // Apply detail template
              var detailTmpl = '';
              if (props.detailLevels && props.detailLevels[lvlIdx]) {
                detailTmpl = props.detailLevels[lvlIdx].template;
              }

              // Golf mode: render scorecard instead of flat table
              if (props.golfMode && !detailTmpl && hasGolfColumns(detailData.columns)) {
                cell.innerHTML = renderGolfScorecard(detailData);
                cell.classList.remove('mfdr-loading');
                // Bind round toggle
                var toggles = cell.querySelectorAll('.mfgs-toggle');
                for (var ti = 0; ti < toggles.length; ti++) {
                  toggles[ti].addEventListener('click', function () {
                    this.classList.toggle('mfgs-open');
                    var round = this.closest('.mfgs-round');
                    if (!round) return;
                    var slope = round.querySelector('.mfgs-slope');
                    var body = round.querySelector('.mfgs-card-body');
                    if (slope) slope.classList.toggle('mfgs-hidden');
                    if (body) body.classList.toggle('mfgs-hidden');
                  });
                }
                return;
              }

              if (!detailTmpl) detailTmpl = autoTemplate(detailData.columns, props.detailLevels || []);

              cell.innerHTML = renderDataHtml(detailTmpl, detailData);
              cell.classList.remove('mfdr-loading');

              // Recursive: bind drill-down within detail
              (cell as any).__mfdrData = detailData;
              bindDrillDown(cell, detailData, props, formId, widgetKey);
            });
          });
        })(links[li]);
      }
    }

    // ── Column sorting ──
    function bindSort(container: HTMLElement): void {
      var headers = container.querySelectorAll('th');
      for (var hi = 0; hi < headers.length; hi++) {
        (function (th) {
          th.style.cursor = 'pointer';
          th.title = 'Click to sort';
          th.addEventListener('click', function () {
            // Simple client-side sort: reload with sort params
            // For now, just re-sort the DOM table rows
            // TODO: server-side sort via sortCol/sortDir params
            var colName = th.textContent || '';
            th.classList.toggle('mfdr-sort-asc');
            var isDesc = !th.classList.contains('mfdr-sort-asc');
            th.classList.toggle('mfdr-sort-desc', isDesc);
          });
        })(headers[hi]);
      }
    }

    // ── Pagination (Phase 2) ──
    function updatePagination(totalRows: number, currentPage: number): void {
      if (!paginationDiv) return;
      var ps = props.pageSize || 50;
      if (ps <= 0 || totalRows <= ps) {
        paginationDiv.style.display = 'none';
        return;
      }
      paginationDiv.style.display = '';
      var totalPages = Math.ceil(totalRows / ps);
      var html = '<div class="mfdr-page-info">' +
        tr('widget.datarepeater.page', 'Page') + ' ' + currentPage + ' / ' + totalPages +
        ' (' + totalRows + ' ' + tr('widget.datarepeater.rows', 'rows') + ')</div>';
      html += '<div class="mfdr-page-btns">';
      if (currentPage > 1) {
        html += '<button type="button" class="mfdr-page-btn" data-page="' + (currentPage - 1) + '">&laquo; ' +
                tr('widget.datarepeater.prev', 'Prev') + '</button>';
      }
      if (currentPage < totalPages) {
        html += '<button type="button" class="mfdr-page-btn" data-page="' + (currentPage + 1) + '">' +
                tr('widget.datarepeater.next', 'Next') + ' &raquo;</button>';
      }
      html += '</div>';
      paginationDiv.innerHTML = html;

      // Bind page buttons
      var btns = paginationDiv.querySelectorAll('.mfdr-page-btn');
      for (var bi = 0; bi < btns.length; bi++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            var pg = parseInt(btn.getAttribute('data-page') || '1', 10);
            loadData(pg);
          });
        })(btns[bi]);
      }
    }

    // ── Status bar ──
    function updateStatus(totalRows: number, executionMs: number): void {
      if (!statusDiv) return;
      if (totalRows > 0) {
        statusDiv.innerHTML = '<span class="mfdr-status-text">' + totalRows + ' ' +
          tr('widget.datarepeater.rows', 'rows') + ' &middot; ' + executionMs + 'ms</span>';
      } else {
        statusDiv.innerHTML = '';
      }
    }

    // ── Filters (Phase 3) ──
    // Load dropdown options
    for (var fsi = 0; fsi < filterSelects.length; fsi++) {
      (function (sel, idx) {
        populateFilterSelect(sel);
        sel.addEventListener('change', function () {
          repopulateDependentSelects(idx + 1);
        });
      })(filterSelects[fsi], fsi);
    }

    var externalParamKeys = getExternalParamKeys();
    if (externalParamKeys.length > 0 && props.reloadOnParamChange !== false) {
      var hostWrapper = document.getElementById('mf-form-wrapper-' + formId) || document;
      externalParamKeys.forEach(function (parentKey) {
        var targets: Element[] = [];
        var byId = document.getElementById('mf-' + formId + '-' + parentKey);
        if (byId) targets.push(byId);
        Array.prototype.slice.call(hostWrapper.querySelectorAll('[name="' + parentKey + '"]')).forEach(function (el: Element) {
          if (targets.indexOf(el) < 0) targets.push(el);
        });
        if (!targets.length) return;
        targets.forEach(function (el) {
          el.addEventListener('change', function () {
            currentFilters = {};
            writeSharedFilters(currentFilters);
            var inputs = wrap.querySelectorAll('.mfdr-filter-input, .mfdr-filter-date, .mfdr-filter-select');
            for (var ii = 0; ii < inputs.length; ii++) {
              (inputs[ii] as HTMLInputElement | HTMLSelectElement).value = '';
            }
            for (var si = 0; si < filterSelects.length; si++) {
              populateFilterSelect(filterSelects[si], '');
            }
            loadData(1);
          });
        });
      });
    }

    // Filter apply button
    var filterBtn = wrap.querySelector('.mfdr-filter-btn');
    if (filterBtn) {
      filterBtn.addEventListener('click', function () {
        currentFilters = collectFilterValues();
        writeSharedFilters(currentFilters);
        loadData(1);
      });
    }

    if (sharedFilterScope) {
      window.addEventListener('mfdr:filters-changed', function (ev: Event) {
        var detail = (ev as CustomEvent).detail || {};
        if (!detail || detail.scope !== sharedFilterScope || detail.source === key) return;
        currentFilters = cloneFilters(detail.filters || {});
        loadData(1);
      });
    }

    // ── Export buttons (Phase 2) ──
    var exportBtns = wrap.querySelectorAll('.mfdr-export-btn');
    for (var ei = 0; ei < exportBtns.length; ei++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var fmt = btn.getAttribute('data-format') || 'csv';
          if (fmt === 'csv') {
            var csvUrl = getApiBase() + 'DataRepeater/Export?formId=' + formId +
                         '&widgetKey=' + encodeURIComponent(key) + '&format=csv';
            var filterJson = JSON.stringify(currentFilters);
            if (filterJson !== '{}') csvUrl += '&filterJson=' + encodeURIComponent(filterJson);
            csvUrl = appendPrefixedParams(csvUrl, collectExternalParams());
            window.open(csvUrl, '_blank');
          } else if (fmt === 'pdf') {
            // Client-side PDF via print
            var printWin = window.open('', '_blank');
            if (printWin && dataDiv) {
              printWin.document.write('<html><head><title>Export</title>' +
                '<style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}</style>' +
                '</head><body>' + dataDiv.innerHTML + '</body></html>');
              printWin.document.close();
              printWin.print();
            }
          }
        });
      })(exportBtns[ei]);
    }

    // ── Auto-refresh (Phase 2) ──
    if (props.refreshInterval && props.refreshInterval > 0) {
      refreshTimer = setInterval(function () {
        loadData(currentPage);
      }, props.refreshInterval * 1000);

      // Cleanup on page unload
      window.addEventListener('beforeunload', function () {
        if (refreshTimer) clearInterval(refreshTimer);
      });
    }

    // ── Stash props for drill-down ──
    wrap.setAttribute('data-mfdr-props', JSON.stringify(props));

    // ── Initial load ──
    loadData(1);
  }

  // ── Helper: find field in the rendered form's schema ──
  function findFieldInRenderedForm(formId: number, key: string): FieldLike | null {
    try {
      // Try multiple form element selectors (DNN, Oqtane, Web)
      var formEl = document.querySelector('[data-form-id="' + formId + '"]')
                || document.querySelector('#mf-form-' + formId)
                || document.querySelector('[data-mf-form-id="' + formId + '"]')
                || document.querySelector('.mf-form-rendered');
      if (!formEl) return null;
      var schemaAttr = formEl.getAttribute('data-schema-json')
                    || formEl.getAttribute('data-schema');
      if (!schemaAttr) return null;
      var schema = JSON.parse(schemaAttr);
      if (!schema) return null;

      // Format 1: schema.pages[].fields[]
      if (schema.pages) {
        for (var pi = 0; pi < schema.pages.length; pi++) {
          var pfields = schema.pages[pi].fields;
          if (!pfields) continue;
          for (var fi = 0; fi < pfields.length; fi++) {
            if (pfields[fi].key === key) return pfields[fi];
          }
        }
      }
      // Format 2: schema.fields[] (flat — DNN default)
      if (schema.fields) {
        for (var fi2 = 0; fi2 < schema.fields.length; fi2++) {
          if (schema.fields[fi2].key === key) return schema.fields[fi2];
        }
      }
    } catch (_e) { }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  COLLECT & VALIDATE (display-only widget)
  // ═══════════════════════════════════════════════════════════════════════════

  function collect(_key: string, _container: HTMLElement): any {
    return null;  // display-only — does not submit data
  }

  function validate(_key: string, _container: HTMLElement): boolean {
    return true;  // always valid
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  if (typeof MegaFormWidgets !== 'undefined' && MegaFormWidgets && typeof MegaFormWidgets.register === 'function') {
    MegaFormWidgets.register('DataRepeater', {
      meta: { label: 'Data Repeater', icon: 'fa-database', category: 'advanced', canonical: true },
      defaults: defaults,
      properties: properties,
      render: render,
      bind: bind,
      collect: collect,
      validate: validate
    });
    console.log('[MegaForm] ' + BADGE + ' registered.');
  } else {
    console.warn('[MegaForm] ' + BADGE + ': MegaFormWidgets not found — deferred registration.');
    // Deferred: retry when MegaFormWidgets becomes available
    var _drRetry = setInterval(function () {
      if (typeof (window as any).MegaFormWidgets !== 'undefined' &&
          (window as any).MegaFormWidgets &&
          typeof (window as any).MegaFormWidgets.register === 'function') {
        clearInterval(_drRetry);
        (window as any).MegaFormWidgets.register('DataRepeater', {
          meta: { label: 'Data Repeater', icon: 'fa-database', category: 'advanced', canonical: true },
          defaults: defaults,
          properties: properties,
          render: render,
          bind: bind,
          collect: collect,
          validate: validate
        });
        console.log('[MegaForm] ' + BADGE + ' registered (deferred).');
      }
    }, 200);
    setTimeout(function () { clearInterval(_drRetry); }, 10000);
  }

  // Expose badge for verification
  if (typeof window !== 'undefined') {
    (window as any).__MF_DATA_REPEATER_BADGE__ = BADGE;
    (window as any).MegaFormDataRepeater = { render: render, bind: bind, collect: collect, validate: validate };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  [DataRepeaterDesigner v20260504-07]  BUILDER CANVAS LAUNCHER
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // The Builder canvas (canvas.ts → renderFieldPreview) renders a *placeholder*
  // for advanced widgets like DataRepeater (icon + "Data Repeater Widget"
  // label) — it never calls render(). To surface the Open Designer button
  // inside the Builder, we observe the canvas DOM and inject a launcher into
  // each .mf-canvas-field[data-type="DataRepeater"] card. Pure DOM, zero
  // canvas.ts changes.
  //
  // Click flow:
  //   1. Read field key from card's data-key attribute
  //   2. Look up field in MegaFormBuilder.state.schema.fields
  //   3. Lazy-load megaform-datarepeater-designer.js if not loaded
  //   4. MFDataRepeaterDesigner.open with field.widgetProps as JSON
  //   5. onApply: parse JSON, replace field.widgetProps, mark dirty, re-render
  //
  // Public form (RederHost) is untouched — the observer is a no-op when no
  // .mf-canvas-field elements ever appear.

  // [B58 hard cutover follow-through] The legacy "🧱 Open Designer" button
  // injector has been disabled. DataRepeater field cards now have a SINGLE
  // entry-point: the "🧬 Open Unified Designer" button shipped by
  // megaform-datarepeater-launcher.ts. The Layout Designer surface lives
  // INSIDE the unified shell as the Config → Templates tab pane.
  //
  // MFLayoutDesigner and MFDataRepeaterDesigner bundles are still lazy-loaded
  // by the unified shell's Config tab. External callers that targeted
  // `.mfdr-card-designer-launcher` should switch to `.mfdr-unified-launcher`.
  //
  // [B62-HardCutover] Legacy DataRepeater launcher is now PERMANENTLY disabled.
  // The runtime flag MF_LEGACY_DR_LAUNCHER is IGNORED — the unified designer
  // shipped by megaform-datarepeater-launcher.ts (.mfdr-unified-launcher) is
  // the ONLY entry point. The outer gate now forces `false` so the IIFE
  // cannot execute even if window.MF_LEGACY_DR_LAUNCHER is set to true at
  // runtime. The inner early-return is kept as belt-and-suspenders.
  var MF_LEGACY_DR_LAUNCHER = !!((typeof window !== 'undefined') && (window as any).MF_LEGACY_DR_LAUNCHER);
  if (false && MF_LEGACY_DR_LAUNCHER && typeof document !== 'undefined') { // [B62-HardCutover] outer gate forced false
    (function injectBuilderLaunchers() {
      if (true) return; // [B62-HardCutover] legacy launcher disabled forever; unified designer is the only entry point
      var WIDGET_TYPE = 'DataRepeater';
      var BTN_CLASS   = 'mfdr-card-designer-launcher';
      var INJECTED_FLAG = 'mfdrLauncherInjected';
var DESIGNER_BUNDLE_VERSION = '20260529-01';

      function findField(key: string): any {
        var B = (window as any).MegaFormBuilder;
        var fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          if (!f) continue;
          if (f.key === key) return f;
          // Walk Row → columns → fields if needed
          if (f.type === 'Row' && f.columns) {
            for (var ci = 0; ci < f.columns.length; ci++) {
              var col = f.columns[ci];
              if (!col || !col.fields) continue;
              for (var fi = 0; fi < col.fields.length; fi++) {
                if (col.fields[fi] && col.fields[fi].key === key) return col.fields[fi];
              }
            }
          }
        }
        return null;
      }

      function lazyLoadAndOpen(initialJson: string, onApply: (json: string) => void, fieldKey?: string) {
        var open = function () {
          var d = (window as any).MFDataRepeaterDesigner;
          console.log('[mfdr-launcher] open() — MFDataRepeaterDesigner=', !!d);
          if (!d || typeof d.open !== 'function') {
            alert('DataRepeater Designer bundle did not load. Check Network for megaform-datarepeater-designer.js.');
            return;
          }
          try {
            d.open({ initialJson: initialJson, onApply: onApply, fieldKey: fieldKey });
            console.log('[mfdr-launcher] open() returned without throwing');
          } catch (err) {
            console.error('[mfdr-launcher] open() threw:', err);
            alert('Designer threw: ' + (err && (err as any).message ? (err as any).message : String(err)));
          }
        };
        if ((window as any).MFDataRepeaterDesigner) { open(); return; }
        // Find the same /js/ path as this widget script
        var basePath = '/Modules/MegaForm/js/';
        try {
          var scripts = Array.prototype.slice.call(document.scripts);
          for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            var m = src.match(/^(.*\/)(?:plugins\/)?megaform-widget-data-repeater\.js/i);
            if (m) { basePath = m[1].replace(/plugins\/$/, ''); break; }
          }
        } catch (_) { /* keep default */ }
        var url = basePath + 'megaform-datarepeater-designer.js?v=' + encodeURIComponent(DESIGNER_BUNDLE_VERSION);
        console.log('[mfdr-launcher] lazy-loading designer from', url);
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = function () { console.log('[mfdr-launcher] designer script loaded'); open(); };
        s.onerror = function () { console.error('[mfdr-launcher] designer script FAILED to load:', url); alert('Failed to load ' + url); };
        document.head.appendChild(s);
      }

      // [LayoutDesigner v20260528-15] Lazy-load the Layout Designer bundle.
      function lazyLoadLayoutAndOpen(field: any) {
        var open = function () {
          var d = (window as any).MFLayoutDesigner;
          if (!d || typeof d.open !== 'function') {
            alert('Layout Designer bundle did not load. Check Network for megaform-layout-designer.js.');
            return;
          }
          var wp = field && field.widgetProps ? field.widgetProps : {};
          var initialHtml = String(wp.masterTemplate || '');
          d.open({
            widget: 'data-repeater',
            initialHtml: initialHtml,
            formId: ((window as any).MegaFormBuilder && (window as any).MegaFormBuilder.state && (window as any).MegaFormBuilder.state.formId) || 0,
            fieldKey: field && field.key ? field.key : '',
            portalId: ((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.portalId) || 0,
            apiBase: ((window as any).__MF_API_BASE__ || '/api/MegaForm'),
            sqlPreview: {
              fetchTopRows: function () { return Promise.resolve({ columns: [], rows: [] }); },
            },
            onApply: function (html: string) {
              field.widgetProps = field.widgetProps || {};
              field.widgetProps.masterTemplate = html;
              var B = (window as any).MegaFormBuilder;
              if (B && B.state) B.state.isDirty = true;
              try { if (B && B.callModule) B.callModule('properties', 'showProps', [field]); } catch (_) { /* ignore */ }
            },
          });
        };
        if ((window as any).MFLayoutDesigner) { open(); return; }
        var basePath = '/Modules/MegaForm/js/';
        try {
          var scripts = Array.prototype.slice.call(document.scripts);
          for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            var m = src.match(/^(.*\/)(?:plugins\/)?megaform-widget-data-repeater\.js/i);
            if (m) { basePath = m[1].replace(/plugins\/$/, ''); break; }
          }
        } catch (_) { /* keep default */ }
        var url = basePath + 'megaform-layout-designer.js?v=' + encodeURIComponent(DESIGNER_BUNDLE_VERSION);
        var s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = function () { open(); };
        s.onerror = function () { alert('Failed to load ' + url); };
        document.head.appendChild(s);
      }

      function inject(card: HTMLElement) {
        if (true) return; // [B62-HardCutover] legacy launcher disabled forever; unified designer is the only entry point
        if (!card || (card as any).dataset[INJECTED_FLAG] === '1') return;
        (card as any).dataset[INJECTED_FLAG] = '1';

        // [v20260530-15] Canvas now exposes ONE launcher — Layout Designer
        // (the canonical visual designer). The old "Open Designer" purple
        // button opened MFDataRepeaterDesigner which presented the SAME
        // masterTemplate edit surface as Layout Designer, just with tabs
        // instead of a block tray — pure UI duplication that confused
        // admins ("which one do I click?"). Layout Designer v2 already
        // mounts WidgetConfigPanel on its right rail so SQL config (data
        // source, master query, queryDependsOn, paging) edits inline
        // alongside the visual template canvas.
        var layoutBtn = document.createElement('button');
        layoutBtn.type = 'button';
        layoutBtn.className = BTN_CLASS;
        layoutBtn.title = 'Open Layout Designer (visual canvas + block tray + SQL config)';
        layoutBtn.innerHTML = '\u{1F9F1} Open Designer';
        layoutBtn.style.cssText = 'background:#6366f1;color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:8px;line-height:1.3';
        layoutBtn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          var key = card.getAttribute('data-key') || '';
          var field = findField(key);
          if (!field) { alert('Field not found in builder state — try refreshing the form.'); return; }
          lazyLoadLayoutAndOpen(field);
        });
        // Insert next to the field-type badge so it sits in the header strip.
        var actions = card.querySelector('.mf-canvas-field-actions');
        if (actions && actions.parentNode) {
          actions.parentNode.insertBefore(layoutBtn, actions);
        } else {
          card.appendChild(layoutBtn);
        }
      }

      function scan() {
        if (true) return; // [B62-HardCutover] legacy scan disabled forever; unified designer is the only entry point
        var cards = document.querySelectorAll('.mf-canvas-field[data-type="' + WIDGET_TYPE + '"]');
        for (var i = 0; i < cards.length; i++) inject(cards[i] as HTMLElement);
      }

      // Initial pass + observe for canvas re-renders
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scan);
      } else {
        scan();
      }
      if (typeof MutationObserver !== 'undefined') {
        try {
          new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true });
        } catch (_) { /* ignore */ }
      }
    })();
  }

})(typeof window !== 'undefined' ? window : globalThis);
