/**
 * MegaForm DynamicLabel Widget
 * Badge: DynamicLabel v20260525-02
 *
 * Display-only HTML/Literal control with runtime tokens and optional SQL source.
 * SQL uses the existing DataRepeater endpoint: query lives in server-side schema,
 * client sends only formId + widgetKey + parameter values.
 */

(function (global: any) {
  'use strict';

  var BADGE = 'DynamicLabel v20260525-02';
  var MegaFormWidgets: any = global.MegaFormWidgets;
  var MFUtil: any = global.MFUtil;

  if (!MegaFormWidgets || typeof MegaFormWidgets.register !== 'function') return;

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function attr(v: any): string { return esc(v); }

  function toBool(v: any, fallback: boolean): boolean {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    var s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes' || s === 'on';
  }

  function toInt(v: any, fallback: number, min: number, max: number): number {
    var n = parseInt(String(v == null ? '' : v), 10);
    if (!isFinite(n)) n = fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function getProps(field: any): any {
    var wp = field && (field.widgetProps || field.WidgetProps) ? (field.widgetProps || field.WidgetProps) : {};
    var defaultText = field && (field.defaultValue || field.DefaultValue) ? String(field.defaultValue || field.DefaultValue) : 'Hello World';
    var defaultHtml = '<div class="mf-dynamic-label-note"><strong>Dynamic label</strong><br>' + esc(defaultText) + '</div>';
    var html = wp.html != null ? String(wp.html) : defaultHtml;
    var masterQuery = String(wp.masterQuery || '');
    return {
      html: html,
      allowRawHtml: toBool(wp.allowRawHtml, true),
      enableTokens: toBool(wp.enableTokens, true),
      useSql: toBool(wp.useSql, !!masterQuery.trim()),
      resultMode: String(wp.resultMode || wp.sqlResultMode || 'simple').toLowerCase() === 'multi' ? 'multi' : 'simple',
      dataSource: String(wp.dataSource || 'sql'),
      connectionKey: String(wp.connectionKey || wp.connectionName || 'DashboardDatabase'),
      databaseType: String(wp.databaseType || ''),
      masterQuery: masterQuery,
      sqlTemplate: String(wp.sqlTemplate || ''),
      headerTemplate: String(wp.headerTemplate || '<div class="mf-dynamic-label-list">'),
      detailTemplate: String(wp.detailTemplate || wp.rowTemplate || '<article class="mf-dynamic-label-item"><strong>{{row:title}}</strong><div>{{row:summary}}</div></article>'),
      footerTemplate: String(wp.footerTemplate || '</div>'),
      pagerTemplate: String(wp.pagerTemplate || '<span>Page {{meta:page}} of {{meta:totalPages}} &middot; {{meta:totalRows}} rows</span>'),
      queryDependsOn: String(wp.queryDependsOn || wp.cascadeFields || wp.sqlDependsOn || ''),
      reloadOnParamChange: toBool(wp.reloadOnParamChange, true),
      showPager: toBool(wp.showPager, true),
      pageSize: toInt(wp.pageSize, 10, 1, 100),
      emptyHtml: String(wp.emptyHtml || ''),
      errorHtml: String(wp.errorHtml || '<div class="mf-dynamic-label-error">Could not load dynamic label content.</div>'),
      cssClass: String(wp.cssClass || ''),
      maxRows: toInt(wp.maxRows, 1000, 1, 5000)
    };
  }

  function encodeProps(props: any): string {
    return attr(JSON.stringify(props || {}));
  }

  function parseProps(wrap: Element): any {
    try {
      return JSON.parse((wrap.getAttribute('data-dl-props') || '{}'));
    } catch (_e) {
      return {};
    }
  }

  function getApiBase(): string {
    if (MFUtil && typeof MFUtil.getApiBase === 'function') {
      var base = String(MFUtil.getApiBase() || '');
      if (base) return base.replace(/\/?$/, '/');
    }
    var platform = global.__MF_PLATFORM__ || {};
    if (platform.apiBase) return String(platform.apiBase).replace(/\/?$/, '/');
    if (platform.apiBaseUrl) return String(platform.apiBaseUrl).replace(/\/?$/, '/');
    if (global.$ && global.$.ServicesFramework) return '/DesktopModules/MegaForm/API/';
    return '/api/MegaForm/';
  }

  function apiGet(path: string, onOk: (payload: any) => void, onErr: () => void): void {
    if (MFUtil && typeof MFUtil.apiCall === 'function') {
      MFUtil.apiCall('GET', path, null).then(onOk).catch(onErr);
      return;
    }
    // [v20260527-04] Append ?portalId=N so server scopes data to the page's
    // portal. Do NOT set TabId/ModuleId headers — DNN's framework cross-checks
    // them against the alias-resolved portal and 400s ("Specified page is not
    // in this site") when the page is in a child-portal subpath alias.
    var fullUrl = getApiBase() + path;
    var platform = global.__MF_PLATFORM__ || {};
    var portalIdRaw = platform.portalId != null ? platform.portalId : platform.PortalId;
    var portalId = typeof portalIdRaw === 'number' ? portalIdRaw : parseInt(String(portalIdRaw == null ? '0' : portalIdRaw), 10);
    if (!isFinite(portalId) || portalId < 0) portalId = 0;
    if (!/[?&]portalId=/i.test(fullUrl)) {
      fullUrl += (fullUrl.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + portalId;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', fullUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      var sfFactory = global.$ && global.$.ServicesFramework;
      if (sfFactory) {
        var moduleId = platform.moduleId || platform.ModuleId || 0;
        var sf = sfFactory(moduleId);
        if (sf && sf.getAntiForgeryValue) {
          var token = sf.getAntiForgeryValue();
          if (token) xhr.setRequestHeader('RequestVerificationToken', token);
        }
      }
    } catch (_e) { }
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { onOk(JSON.parse(xhr.responseText || '{}')); }
        catch (_e) { onOk(xhr.responseText); }
      } else {
        onErr();
      }
    };
    xhr.onerror = onErr;
    xhr.send();
  }

  function queryParams(): any {
    var out: any = {};
    var raw = String(global.location && global.location.search ? global.location.search : '');
    if (raw.charAt(0) === '?') raw = raw.substring(1);
    if (!raw) return out;
    raw.split('&').forEach(function (part: string) {
      if (!part) return;
      var bits = part.split('=');
      var key = decodeURIComponent((bits.shift() || '').replace(/\+/g, ' '));
      if (!key) return;
      out[key] = decodeURIComponent(bits.join('=').replace(/\+/g, ' '));
    });
    return out;
  }

  function findNamedControls(root: Element, key: string): Element[] {
    var all = root.querySelectorAll('input,select,textarea');
    var result: Element[] = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i] as HTMLInputElement;
      if (String(el.getAttribute('name') || '') === key) result.push(el);
    }
    return result;
  }

  function readControlValue(root: Element, key: string): string {
    var controls = findNamedControls(root, key);
    if (!controls.length) return '';
    var values: string[] = [];
    for (var i = 0; i < controls.length; i++) {
      var el: any = controls[i];
      var type = String(el.type || '').toLowerCase();
      if (type === 'radio') {
        if (el.checked) return String(el.value || '');
      } else if (type === 'checkbox') {
        if (el.checked) values.push(String(el.value || 'on'));
      } else {
        return String(el.value == null ? '' : el.value);
      }
    }
    return values.join(', ');
  }

  function collectFormValues(root: Element): any {
    var out: any = {};
    var all = root.querySelectorAll('input,select,textarea');
    for (var i = 0; i < all.length; i++) {
      var el: any = all[i];
      var name = String(el.getAttribute('name') || '');
      if (!name || name.indexOf('__') === 0) continue;
      out[name] = readControlValue(root, name);
    }
    return out;
  }

  function splitCsv(value: string): string[] {
    return String(value || '').split(',').map(function (x: string) { return x.trim(); }).filter(function (x: string) { return !!x; });
  }

  function uniqueList(values: string[]): string[] {
    var seen: any = {};
    var out: string[] = [];
    values.forEach(function (value: string) {
      var key = String(value || '').trim();
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function normalizeTokenKey(key: any): string {
    return String(key == null ? '' : key).trim().toLowerCase();
  }

  function aliasTokenKey(key: any): string {
    return normalizeTokenKey(key)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function registerLookup(map: any, key: any, value: any): void {
    var raw = normalizeTokenKey(key);
    if (!raw) return;
    if (!map.hasOwnProperty(raw)) map[raw] = value;
    var alias = aliasTokenKey(key);
    if (alias && !map.hasOwnProperty(alias)) map[alias] = value;
    var compact = alias.replace(/_/g, '');
    if (compact && !map.hasOwnProperty(compact)) map[compact] = value;
  }

  function buildLookup(source: any): any {
    var map: any = {};
    if (!source) return map;
    for (var k in source) if (source.hasOwnProperty(k)) registerLookup(map, k, source[k]);
    return map;
  }

  function lookupValue(source: any, key: string): any {
    if (!source || !key) return { found: false, value: '' };
    if (source.hasOwnProperty(key)) return { found: true, value: source[key] };
    var map = buildLookup(source);
    var keys = [normalizeTokenKey(key), aliasTokenKey(key), aliasTokenKey(key).replace(/_/g, '')];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] && map.hasOwnProperty(keys[i])) return { found: true, value: map[keys[i]] };
    }
    return { found: false, value: '' };
  }

  function extractSqlParams(sql: string): string[] {
    var cleaned = String(sql || '')
      .replace(/'([^']|'')*'/g, "''")
      .replace(/"([^"]|"")*"/g, '""');
    var found: string[] = [];
    cleaned.replace(/(^|[^:]):([A-Za-z_][A-Za-z0-9_]*)/g, function (_m: string, _prefix: string, key: string) {
      found.push(key);
      return _m;
    });
    return uniqueList(found);
  }

  function getSqlParamKeys(props: any): string[] {
    return uniqueList(splitCsv(props.queryDependsOn).concat(extractSqlParams(props.masterQuery)));
  }

  function buildTokenContext(root: Element, props: any): any {
    var qs = queryParams();
    var fields = collectFormValues(root);
    return { query: qs, fields: fields, props: props || {} };
  }

  function replaceTokens(html: string, ctx: any, row?: any): string {
    var out = String(html || '');
    var rawRow = row || {};
    out = out.replace(/\{\{\{\s*(?:row|sql):([a-zA-Z0-9_.-]+)\s*\}\}\}/g, function (_m, key) {
      var found = lookupValue(rawRow, key);
      return !found.found || found.value == null ? '' : String(found.value);
    });
    out = out.replace(/\{\{\s*(query|qs):([a-zA-Z0-9_.-]+)\s*\}\}/g, function (_m, kind, key) {
      if (kind === 'query') {
        var fromRow = lookupValue(rawRow, key);
        if (fromRow.found) return esc(fromRow.value == null ? '' : fromRow.value);
      }
      var fromQuery = lookupValue(ctx.query, key);
      return esc(fromQuery.found && fromQuery.value != null ? fromQuery.value : '');
    });
    out = out.replace(/\{\{\s*(field|value|control):([a-zA-Z0-9_.-]+)\s*\}\}/g, function (_m, _kind, key) {
      var fromField = lookupValue(ctx.fields, key);
      if (fromField.found) return esc(fromField.value == null ? '' : fromField.value);
      var fromRow = lookupValue(rawRow, key);
      return esc(fromRow.found && fromRow.value != null ? fromRow.value : '');
    });
    out = out.replace(/\{\{\s*(meta|pager):([a-zA-Z0-9_.-]+)\s*\}\}/g, function (_m, _kind, key) {
      var found = lookupValue(ctx.meta, key);
      return esc(found.found && found.value != null ? found.value : '');
    });
    out = out.replace(/\{\{\s*(?:row|sql):([a-zA-Z0-9_.-]+)\s*\}\}/g, function (_m, key) {
      var found = lookupValue(rawRow, key);
      return esc(!found.found || found.value == null ? '' : found.value);
    });
    out = out.replace(/\{([a-zA-Z0-9_.-]+)\}/g, function (m, key) {
      var found = lookupValue(rawRow, key);
      return found.found ? esc(found.value) : m;
    });
    return out;
  }

  function normalizeWidth(value: any): string {
    var width = String(value == null ? '' : value).trim();
    if (!width || width === '100%') return '';
    if (/^\d+$/.test(width)) width += '%';
    if (!/^\d+(\.\d+)?(%|px|rem|em|vw|vh)$/i.test(width)) return '';
    return width;
  }

  function widthStyle(field: any): string {
    var wp = field && (field.widgetProps || field.WidgetProps) ? (field.widgetProps || field.WidgetProps) : {};
    var width = normalizeWidth((field && (field.width || field.Width)) || wp.width || wp.controlWidth || '');
    return width ? ' style="width:' + attr(width) + ';max-width:100%;box-sizing:border-box;"' : '';
  }

  function getState(wrap: Element): any {
    var w: any = wrap as any;
    if (!w._dlState) w._dlState = { page: 1 };
    return w._dlState;
  }

  function resultRows(payload: any): any[] {
    if (!payload) return [];
    var rows = payload.rows || payload.Rows || [];
    var cols = payload.columns || payload.Columns || [];
    if (!rows || !rows.length) return [];
    return rows.map(function (rawRow: any) {
      if (!rawRow) return {};
      if (!Array.isArray(rawRow)) return rawRow;
      var row: any = {};
      for (var i = 0; i < rawRow.length; i++) {
        var col = cols[i] || {};
        var name = col.name || col.Name || ('col' + (i + 1));
        row[name] = rawRow[i];
      }
      return row;
    });
  }

  function renderStatic(target: Element, props: any, ctx: any): void {
    var html = props.enableTokens ? replaceTokens(props.html, ctx) : String(props.html || '');
    (target as HTMLElement).innerHTML = props.allowRawHtml ? html : esc(html);
  }

  function firstRowTemplate(row: any, props: any): string {
    if (props.sqlTemplate) return props.sqlTemplate;
    if (props.html) return props.html;
    return row.html != null ? String(row.html)
      : row.Html != null ? String(row.Html)
      : row.label != null ? String(row.label)
      : row.Label != null ? String(row.Label)
      : row.value != null ? String(row.value)
      : row.Value != null ? String(row.Value)
      : String(row.col1 == null ? '' : row.col1);
  }

  function payloadValue(payload: any, camel: string, pascal: string, fallback: any): any {
    if (!payload) return fallback;
    if (payload[camel] !== undefined && payload[camel] !== null) return payload[camel];
    if (payload[pascal] !== undefined && payload[pascal] !== null) return payload[pascal];
    return fallback;
  }

  function buildMeta(payload: any, page: number, pageSize: number, rowCount: number): any {
    var totalRows = toInt(payloadValue(payload, 'totalRows', 'TotalRows', rowCount), rowCount, 0, 9999999);
    var totalPages = pageSize > 0 ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
    var from = totalRows > 0 ? ((page - 1) * pageSize) + 1 : 0;
    var to = totalRows > 0 ? Math.min(totalRows, from + rowCount - 1) : 0;
    return {
      page: page,
      pageSize: pageSize,
      totalRows: totalRows,
      totalPages: totalPages,
      rowCount: rowCount,
      from: from,
      to: to,
      hasPrev: page > 1 ? 'true' : 'false',
      hasNext: page < totalPages ? 'true' : 'false'
    };
  }

  function renderPager(props: any, ctx: any, meta: any): string {
    if (!props.showPager || meta.totalPages <= 1) return '';
    var info = props.enableTokens ? replaceTokens(props.pagerTemplate, ctx) : String(props.pagerTemplate || '');
    return '<nav class="mfw-dynamic-label-pager" aria-label="Dynamic label pagination">' +
      '<button type="button" class="mfw-dynamic-label-page-btn" data-dl-page="' + (meta.page - 1) + '"' + (meta.page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>' +
      '<div class="mfw-dynamic-label-page-info">' + info + '</div>' +
      '<button type="button" class="mfw-dynamic-label-page-btn" data-dl-page="' + (meta.page + 1) + '"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>Next &raquo;</button>' +
      '</nav>';
  }

  function bindPager(wrap: Element, target: Element): void {
    var buttons = target.querySelectorAll('.mfw-dynamic-label-page-btn[data-dl-page]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var btn = this as HTMLButtonElement;
        if (btn.disabled) return;
        var page = toInt(btn.getAttribute('data-dl-page'), 1, 1, 999999);
        getState(wrap).page = page;
        refresh(wrap);
      });
    }
  }

  function renderSql(wrap: Element, target: Element, formId: string, key: string, props: any, ctx: any): void {
    if (!props.masterQuery) {
      renderStatic(target, props, ctx);
      return;
    }

    var root = wrap.closest('form') || document.body;
    var qsValues = queryParams();
    var paramKeys = getSqlParamKeys(props);
    var params: any = {};
    if (paramKeys.length) {
      paramKeys.forEach(function (dep) {
        params[dep] = qsValues[dep] != null ? qsValues[dep] : readControlValue(root, dep);
      });
    } else {
      params = qsValues;
      var formValues = collectFormValues(root);
      for (var fv in formValues) if (formValues.hasOwnProperty(fv)) params[fv] = formValues[fv];
    }

    var state = getState(wrap);
    var page = props.resultMode === 'multi' ? toInt(state.page, 1, 1, 999999) : 1;
    var pageSize = props.resultMode === 'multi' ? props.pageSize : 1;
    var qs = [
      'formId=' + encodeURIComponent(formId),
      'widgetKey=' + encodeURIComponent(key),
      'page=' + encodeURIComponent(String(page)),
      'pageSize=' + encodeURIComponent(String(pageSize)),
      'filterJson=' + encodeURIComponent(JSON.stringify(params))
    ].join('&');

    (target as HTMLElement).classList.add('is-loading');
    apiGet('DataRepeater/Query?' + qs, function (payload: any) {
      (target as HTMLElement).classList.remove('is-loading');
      if (payload && (payload.error || payload.Error)) {
        (target as HTMLElement).innerHTML = props.errorHtml || '';
        return;
      }
      var rows = resultRows(payload);
      if (!rows.length) {
        (target as HTMLElement).innerHTML = props.emptyHtml || '';
        return;
      }

      var html = '';
      if (props.resultMode === 'simple') {
        html = replaceTokens(firstRowTemplate(rows[0], props), ctx, rows[0]);
      } else {
        var meta = buildMeta(payload, page, pageSize, rows.length);
        var metaCtx = { query: ctx.query, fields: ctx.fields, props: ctx.props, meta: meta };
        html += replaceTokens(props.headerTemplate, metaCtx);
        var detailTpl = props.detailTemplate || props.sqlTemplate || firstRowTemplate(rows[0], props);
        for (var i = 0; i < rows.length; i++) {
          html += replaceTokens(detailTpl, metaCtx, rows[i]);
        }
        html += replaceTokens(props.footerTemplate, metaCtx);
        html += renderPager(props, metaCtx, meta);
      }
      (target as HTMLElement).innerHTML = props.allowRawHtml ? html : esc(html);
      bindPager(wrap, target);
    }, function () {
      (target as HTMLElement).classList.remove('is-loading');
      (target as HTMLElement).innerHTML = props.errorHtml || '';
    });
  }

  function refresh(wrap: Element): void {
    var props = parseProps(wrap);
    var formId = wrap.getAttribute('data-formid') || '';
    var key = wrap.getAttribute('data-field-key') || '';
    var target = wrap.querySelector('.mfw-dynamic-label-content');
    if (!target) return;
    var root = wrap.closest('form') || document.body;
    var ctx = buildTokenContext(root, props);
    if (props.useSql) renderSql(wrap, target, formId, key, props, ctx);
    else renderStatic(target, props, ctx);
  }

  function bindWatchers(wrap: Element): void {
    if ((wrap as any)._dlBound) return;
    (wrap as any)._dlBound = true;
    var props = parseProps(wrap);
    var root = wrap.closest('form') || document.body;
    var deps = getSqlParamKeys(props);
    var controls: Element[] = [];
    if (deps.length) {
      deps.forEach(function (dep) {
        controls = controls.concat(findNamedControls(root, dep));
      });
    } else {
      controls = Array.prototype.slice.call(root.querySelectorAll('input,select,textarea'));
    }
    for (var i = 0; i < controls.length; i++) {
      controls[i].addEventListener('change', function () {
        getState(wrap).page = 1;
        refresh(wrap);
      });
      controls[i].addEventListener('input', function () {
        if (props.reloadOnParamChange !== false) {
          getState(wrap).page = 1;
          refresh(wrap);
        }
      });
    }
  }

  /**
   * [v20260527-04] DynamicLabel sample presets.
   * Each preset's `apply` object is shallow-merged onto field.widgetProps,
   * so picking one fills every relevant setting (SQL, templates, mode, pager,
   * cascade params, page size) in a single click. All queries target DNN's
   * Tabs/Portals tables so they run on any DNN install with no extra data.
   */
  function samplePresets(): any[] {
    var TABS_SQL_MULTI = 'SELECT\n  TabID,\n  TabName,\n  COALESCE(NULLIF(Title, \'\'), TabName) AS PageTitle,\n  REPLACE(TabPath, \'//\', \'/\') AS UrlPath,\n  Level,\n  CASE WHEN IsVisible = 1 THEN \'Visible\' ELSE \'Hidden\' END AS Visibility\nFROM dbo.Tabs\nWHERE IsDeleted = 0\n  AND DisableLink = 0\n  AND PortalID = COALESCE(TRY_CONVERT(int, :portalId),\n                          (SELECT MIN(PortalID) FROM dbo.Portals))\n  AND (\n    LTRIM(RTRIM(COALESCE(:search, \'\'))) = \'\'\n    OR TabName LIKE \'%\' + :search + \'%\'\n    OR Title   LIKE \'%\' + :search + \'%\'\n  )\nORDER BY Level, TabName';

    var TABS_SQL_SINGLE_STAT = 'SELECT\n  p.PortalID,\n  COUNT(t.TabID) AS PageCount,\n  SUM(CASE WHEN t.IsVisible = 1 THEN 1 ELSE 0 END) AS VisibleCount\nFROM dbo.Portals p\nLEFT JOIN dbo.Tabs t\n  ON t.PortalID = p.PortalID\n AND t.IsDeleted = 0\n AND t.DisableLink = 0\nWHERE p.PortalID = TRY_CONVERT(int, :portalId)\nGROUP BY p.PortalID';

    var TABS_SQL_DETAIL = 'SELECT TOP 1\n  TabID,\n  COALESCE(NULLIF(Title,\'\'), TabName) AS PageTitle,\n  TabName,\n  REPLACE(TabPath, \'//\', \'/\') AS UrlPath,\n  Description,\n  KeyWords,\n  CreatedOnDate\nFROM dbo.Tabs\nWHERE TabID = TRY_CONVERT(int, :tabId)\n  AND IsDeleted = 0';

    var CARDS_HEADER = '<section class="mf-tabs-grid"\n  style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:14px 0;">';
    var CARDS_DETAIL = '<a href="{UrlPath}" target="_blank" rel="noopener"\n   style="display:block;padding:16px;border:1px solid #dbe4f0;border-radius:14px;background:#fff;text-decoration:none;color:inherit;box-shadow:0 6px 18px rgba(15,23,42,.06);">\n  <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">DNN Page #{TabID} &middot; Level {Level} &middot; {Visibility}</div>\n  <div style="margin-top:6px;font-size:18px;font-weight:700;color:#0f172a;">{PageTitle}</div>\n  <div style="margin-top:6px;font-size:13px;color:#1d4ed8;word-break:break-all;">&#128279; {UrlPath}</div>\n  <div style="margin-top:8px;font-size:12px;color:#475569;">Internal name: <code>{TabName}</code></div>\n</a>';
    var CARDS_FOOTER = '</section>';

    var LIST_HEADER = '<table class="mf-tabs-table" style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">\n  <thead>\n    <tr style="background:#f1f5f9;border-bottom:2px solid #cbd5f5;text-align:left;">\n      <th style="padding:10px 12px;font-weight:700;">#</th>\n      <th style="padding:10px 12px;font-weight:700;">Page title</th>\n      <th style="padding:10px 12px;font-weight:700;">Slug</th>\n      <th style="padding:10px 12px;font-weight:700;">Level</th>\n      <th style="padding:10px 12px;font-weight:700;">Visibility</th>\n    </tr>\n  </thead>\n  <tbody>';
    var LIST_DETAIL = '<tr style="border-bottom:1px solid #e2e8f0;">\n  <td style="padding:10px 12px;color:#64748b;">{TabID}</td>\n  <td style="padding:10px 12px;font-weight:600;">\n    <a href="{UrlPath}" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:none;">{PageTitle}</a>\n  </td>\n  <td style="padding:10px 12px;color:#475569;"><code>{UrlPath}</code></td>\n  <td style="padding:10px 12px;">{Level}</td>\n  <td style="padding:10px 12px;">{Visibility}</td>\n</tr>';
    var LIST_FOOTER = '</tbody></table>';

    var COMPACT_HEADER = '<ul class="mf-tabs-compact" style="list-style:none;padding:0;margin:10px 0;font-size:14px;">';
    var COMPACT_DETAIL = '<li style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><a href="{UrlPath}" target="_blank" rel="noopener" style="color:#1d4ed8;text-decoration:none;font-weight:600;">{PageTitle}</a> <span style="color:#94a3b8;">&middot; {UrlPath}</span></li>';
    var COMPACT_FOOTER = '</ul>';

    var STAT_TEMPLATE = '<div class="mf-stat" style="padding:14px 18px;border-radius:12px;background:#0f172a;color:#e2e8f0;font:14px/1.5 system-ui,-apple-system,sans-serif;">\n  Portal <strong style="color:#fff;">#{PortalID}</strong> has\n  <strong style="color:#fff;">{PageCount}</strong> pages\n  (<span style="color:#16a34a;">{VisibleCount} visible</span>).\n</div>';

    var DETAIL_TEMPLATE = '<article class="mf-tab-detail" style="padding:18px;border:1px solid #dbe4f0;border-radius:12px;background:#fff;max-width:640px;">\n  <h2 style="margin:0 0 10px;color:#0f172a;">{PageTitle}</h2>\n  <a href="{UrlPath}" style="color:#1d4ed8;text-decoration:none;">{UrlPath}</a>\n  <p style="margin:14px 0 4px;color:#475569;">{Description}</p>\n  <small style="color:#94a3b8;">Keywords: {KeyWords}</small>\n</article>';

    var PAGER = '<strong>Page {{meta:page}}</strong> of {{meta:totalPages}} &middot; rows {{meta:from}}&ndash;{{meta:to}} of {{meta:totalRows}} DNN pages';

    return [
      {
        label: 'DNN Tabs — Card grid (multi-row)',
        description: 'Cards with hyperlink to each DNN page. Paginated 6 per page.',
        apply: {
          useSql: true,
          resultMode: 'multi',
          dataSource: 'sql',
          connectionKey: 'DashboardDatabase',
          databaseType: 'SqlServer',
          masterQuery: TABS_SQL_MULTI,
          headerTemplate: CARDS_HEADER,
          detailTemplate: CARDS_DETAIL,
          footerTemplate: CARDS_FOOTER,
          pagerTemplate: PAGER,
          queryDependsOn: 'portalId,search',
          reloadOnParamChange: true,
          showPager: true,
          pageSize: 6,
          maxRows: 500,
          html: '<div class="mf-dynamic-label-note">Card grid &mdash; SQL did not load.</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      },
      {
        label: 'DNN Tabs — Table list view (multi-row)',
        description: 'Traditional table rows with hyperlinked page titles. Paginated 20 per page.',
        apply: {
          useSql: true,
          resultMode: 'multi',
          dataSource: 'sql',
          connectionKey: 'DashboardDatabase',
          databaseType: 'SqlServer',
          masterQuery: TABS_SQL_MULTI,
          headerTemplate: LIST_HEADER,
          detailTemplate: LIST_DETAIL,
          footerTemplate: LIST_FOOTER,
          pagerTemplate: PAGER,
          queryDependsOn: 'portalId,search',
          reloadOnParamChange: true,
          showPager: true,
          pageSize: 20,
          maxRows: 500,
          html: '<div class="mf-dynamic-label-note">Table view &mdash; SQL did not load.</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      },
      {
        label: 'DNN Tabs — Compact link list (multi-row)',
        description: 'Minimal <ul> of hyperlinks; ideal for sidebars and footers. 30 per page.',
        apply: {
          useSql: true,
          resultMode: 'multi',
          dataSource: 'sql',
          connectionKey: 'DashboardDatabase',
          databaseType: 'SqlServer',
          masterQuery: TABS_SQL_MULTI,
          headerTemplate: COMPACT_HEADER,
          detailTemplate: COMPACT_DETAIL,
          footerTemplate: COMPACT_FOOTER,
          pagerTemplate: PAGER,
          queryDependsOn: 'portalId,search',
          reloadOnParamChange: true,
          showPager: true,
          pageSize: 30,
          maxRows: 1000,
          html: '<div class="mf-dynamic-label-note">Link list &mdash; SQL did not load.</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      },
      {
        label: 'DNN Tabs — Single-row portal stat (simple mode)',
        description: 'One scalar row: portal page count + visible count. Use for a banner / KPI tile.',
        apply: {
          useSql: true,
          resultMode: 'simple',
          dataSource: 'sql',
          connectionKey: 'DashboardDatabase',
          databaseType: 'SqlServer',
          masterQuery: TABS_SQL_SINGLE_STAT,
          sqlTemplate: STAT_TEMPLATE,
          headerTemplate: '<div class="mf-dynamic-label-list">',
          detailTemplate: STAT_TEMPLATE,
          footerTemplate: '</div>',
          pagerTemplate: '',
          queryDependsOn: 'portalId',
          reloadOnParamChange: true,
          showPager: false,
          pageSize: 1,
          maxRows: 1,
          html: '<div class="mf-dynamic-label-note">Portal stat &mdash; SQL did not load.</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      },
      {
        label: 'DNN Tabs — Page detail card (simple mode, bind :tabId)',
        description: 'One Tab fetched by :tabId &mdash; shows title, slug, description, keywords. Use for a side panel.',
        apply: {
          useSql: true,
          resultMode: 'simple',
          dataSource: 'sql',
          connectionKey: 'DashboardDatabase',
          databaseType: 'SqlServer',
          masterQuery: TABS_SQL_DETAIL,
          sqlTemplate: DETAIL_TEMPLATE,
          headerTemplate: '<div class="mf-dynamic-label-list">',
          detailTemplate: DETAIL_TEMPLATE,
          footerTemplate: '</div>',
          pagerTemplate: '',
          queryDependsOn: 'tabId',
          reloadOnParamChange: true,
          showPager: false,
          pageSize: 1,
          maxRows: 1,
          html: '<div class="mf-dynamic-label-note">Page detail &mdash; SQL did not load.</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      },
      {
        label: 'Static HTML — Reset to default',
        description: 'Disable SQL and show a literal HTML block. Useful for tokens-only labels.',
        apply: {
          useSql: false,
          resultMode: 'simple',
          masterQuery: '',
          sqlTemplate: '',
          headerTemplate: '<div class="mf-dynamic-label-list">',
          detailTemplate: '<article class="mf-dynamic-label-item"><strong>{{row:title}}</strong><div>{{row:summary}}</div></article>',
          footerTemplate: '</div>',
          pagerTemplate: '<span>Page {{meta:page}} of {{meta:totalPages}} &middot; {{meta:totalRows}} rows</span>',
          queryDependsOn: '',
          showPager: true,
          pageSize: 10,
          html: '<div class="mf-dynamic-label-note"><strong>Dynamic label</strong><br>Welcome, {{qs:name}}!</div>',
          allowRawHtml: true,
          enableTokens: true
        }
      }
    ];
  }

  function helpHtml(): string {
    var pre = 'style="white-space:pre-wrap;margin:8px 0 0;font:11px/1.5 ui-monospace,Consolas,monospace;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:10px;"';
    var details = 'style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#fff;"';
    var summary = 'style="cursor:pointer;font-weight:700;color:#0f172a;"';
    var note = 'style="margin-top:6px;color:#475569;font-size:12px;"';
    var hint = 'style="margin-top:6px;color:#64748b;font-size:12px;"';

    return [
      '<div style="font-weight:700;color:#0f172a;margin-bottom:6px;">DynamicLabel: HTML, tokens, and SQL-driven content</div>',
      '<div style="margin-bottom:10px;color:#334155;">Display-only widget: literal HTML, query-string tokens, values from other controls, or one/many rows from SQL or stored procedures. The runnable samples below all query the DNN <code>Tabs</code> table for a given portal, so you can paste them as-is on any DNN site.</div>',

      '<div style="display:grid;gap:10px;">',

      '<div><strong>Modes</strong><br><code>Simple</code> reads the first SQL row only and replaces tokens in the simple/detail template. Use it for a one-line label, a status banner, a profile card, or any single-record summary.<br><code>Multi-row</code> renders every returned row with Header + Detail + Footer + Pager templates. Use it for page lists, card grids, recent items, menus, dashboards.</div>',

      '<div><strong>Tokens (working with Tabs sample below)</strong><br>SQL row values: <code>{{row:TabName}}</code>, <code>{{row:TabID}}</code>, or short form <code>{TabName}</code>, <code>{TabID}</code>. URL query string: <code>{{qs:portalId}}</code>. Other form controls: <code>{{field:portalId}}</code> or <code>{{control:portalId}}</code>. Pager/meta: <code>{{meta:page}}</code>, <code>{{meta:totalPages}}</code>, <code>{{meta:totalRows}}</code>, <code>{{meta:from}}</code>, <code>{{meta:to}}</code>. Triple braces <code>{{{row:Title}}}</code> bypass HTML-escaping &mdash; use only for trusted HTML returned by SQL.</div>',

      '<div><strong>Cascade SQL params</strong><br>Use <code>:fieldname</code> directly in SQL. The widget binds <code>:portalId</code> to a query-string <code>?portalId=</code> first, then to a form control whose <code>name</code> is <code>portalId</code>. If the SQL doesn\'t mention the param but you still need to react to a control, list it in <code>queryDependsOn</code> &mdash; e.g. <code>portalId,search</code>. When any bound control changes, the widget re-queries automatically.</div>',

      '<details ' + details + ' open><summary ' + summary + '>Sample 1 &mdash; Simple mode (one row): count pages in a portal</summary>',
      '<div ' + hint + '>Returns one scalar row. Connection: <code>DashboardDatabase</code>. <code>resultMode</code> = <strong>Simple</strong>.</div>',
      '<pre ' + pre + '>SELECT\n  p.PortalID,\n  COUNT(t.TabID) AS PageCount,\n  SUM(CASE WHEN t.IsVisible = 1 THEN 1 ELSE 0 END) AS VisibleCount\nFROM dbo.Portals p\nLEFT JOIN dbo.Tabs t\n  ON t.PortalID = p.PortalID\n AND t.IsDeleted = 0\n AND t.DisableLink = 0\nWHERE p.PortalID = TRY_CONVERT(int, :portalId)\nGROUP BY p.PortalID</pre>',
      '<div ' + note + '>Simple/detail template:</div>',
      '<pre ' + pre + '>&lt;div class=&quot;mf-stat&quot;&gt;\n  Portal &lt;strong&gt;#{PortalID}&lt;/strong&gt; has\n  &lt;strong&gt;{PageCount}&lt;/strong&gt; pages\n  (&lt;span style=&quot;color:#16a34a;&quot;&gt;{VisibleCount} visible&lt;/span&gt;).\n&lt;/div&gt;</pre>',
      '</details>',

      '<details ' + details + ' open><summary ' + summary + '>Sample 2 &mdash; Multi-row (cards with hyperlinks): list pages in a portal</summary>',
      '<div ' + hint + '>Each Tab becomes an HTML card linking to the real DNN page. Connection: <code>DashboardDatabase</code>. <code>resultMode</code> = <strong>Multi-row</strong>, <code>pageSize</code> = 6, <code>queryDependsOn</code> = <code>portalId,search</code>.</div>',
      '<pre ' + pre + '>SELECT\n  TabID,\n  TabName,\n  COALESCE(NULLIF(Title, \'\'), TabName) AS PageTitle,\n  REPLACE(TabPath, \'//\', \'/\') AS UrlPath,\n  Level,\n  CASE WHEN IsVisible = 1 THEN \'Visible\' ELSE \'Hidden\' END AS Visibility\nFROM dbo.Tabs\nWHERE IsDeleted = 0\n  AND DisableLink = 0\n  AND PortalID = COALESCE(TRY_CONVERT(int, :portalId),\n                          (SELECT MIN(PortalID) FROM dbo.Portals))\n  AND (\n    LTRIM(RTRIM(COALESCE(:search, \'\'))) = \'\'\n    OR TabName LIKE \'%\' + :search + \'%\'\n    OR Title   LIKE \'%\' + :search + \'%\'\n  )\nORDER BY Level, TabName</pre>',
      '<div ' + note + ">Multi-row templates (paste into Header / Detail / Footer / Pager textareas):</div>",
      '<pre ' + pre + '>Header:\n&lt;section class=&quot;mf-tabs-grid&quot;\n  style=&quot;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:14px 0;&quot;&gt;\n\nDetail:\n&lt;a href=&quot;{UrlPath}&quot; target=&quot;_blank&quot; rel=&quot;noopener&quot;\n   style=&quot;display:block;padding:16px;border:1px solid #dbe4f0;border-radius:14px;\n          background:#fff;text-decoration:none;color:inherit;\n          box-shadow:0 6px 18px rgba(15,23,42,.06);&quot;&gt;\n  &lt;div style=&quot;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;&quot;&gt;\n    DNN Page #{TabID} &middot; Level {Level} &middot; {Visibility}\n  &lt;/div&gt;\n  &lt;div style=&quot;margin-top:6px;font-size:18px;font-weight:700;color:#0f172a;&quot;&gt;{PageTitle}&lt;/div&gt;\n  &lt;div style=&quot;margin-top:6px;font-size:13px;color:#1d4ed8;word-break:break-all;&quot;&gt;&amp;#128279; {UrlPath}&lt;/div&gt;\n  &lt;div style=&quot;margin-top:8px;font-size:12px;color:#475569;&quot;&gt;Internal name: &lt;code&gt;{TabName}&lt;/code&gt;&lt;/div&gt;\n&lt;/a&gt;\n\nFooter:\n&lt;/section&gt;\n\nPager:\n&lt;strong&gt;Page {{meta:page}}&lt;/strong&gt; of {{meta:totalPages}} &middot;\nshowing rows {{meta:from}}&ndash;{{meta:to}} of {{meta:totalRows}} DNN pages</pre>',
      '</details>',

      '<details ' + details + '><summary ' + summary + '>Sample 3 &mdash; Stored procedure variant</summary>',
      '<div ' + hint + '>Wrap the query above in a sproc so the SQL lives on the server:</div>',
      '<pre ' + pre + '>CREATE OR ALTER PROCEDURE dbo.spMegaForm_PortalTabs\n    @portalId int = NULL,\n    @search   nvarchar(200) = NULL\nAS\nBEGIN\n  SET NOCOUNT ON;\n  SELECT TabID, TabName, COALESCE(NULLIF(Title,\'\'),TabName) AS PageTitle,\n         REPLACE(TabPath,\'//\',\'/\') AS UrlPath, Level,\n         CASE WHEN IsVisible=1 THEN \'Visible\' ELSE \'Hidden\' END AS Visibility\n  FROM dbo.Tabs\n  WHERE IsDeleted = 0 AND DisableLink = 0\n    AND PortalID = COALESCE(@portalId, (SELECT MIN(PortalID) FROM dbo.Portals))\n    AND (LTRIM(RTRIM(COALESCE(@search,\'\'))) = \'\'\n         OR TabName LIKE \'%\' + @search + \'%\'\n         OR Title   LIKE \'%\' + @search + \'%\')\n  ORDER BY Level, TabName;\nEND</pre>',
      '<div ' + note + '>In the builder, choose <strong>Stored procedure</strong> for <code>SQL source type</code>, set <code>SQL query or stored procedure name</code> = <code>dbo.spMegaForm_PortalTabs</code>, and set <code>queryDependsOn</code> = <code>portalId,search</code>. The widget sends only those two parameters.</div>',
      '</details>',

      '<details ' + details + '><summary ' + summary + '>Sample 4 &mdash; Page-detail (simple mode, one Tab by id)</summary>',
      '<div ' + hint + '>Useful for a side panel that shows the selected page&rsquo;s details.</div>',
      '<pre ' + pre + '>SELECT TOP 1\n  TabID,\n  COALESCE(NULLIF(Title,\'\'), TabName) AS PageTitle,\n  TabName,\n  REPLACE(TabPath, \'//\', \'/\') AS UrlPath,\n  Description,\n  KeyWords,\n  CreatedOnDate\nFROM dbo.Tabs\nWHERE TabID = TRY_CONVERT(int, :tabId)\n  AND IsDeleted = 0</pre>',
      '<pre ' + pre + '>&lt;article class=&quot;mf-tab-detail&quot;&gt;\n  &lt;h2&gt;{PageTitle}&lt;/h2&gt;\n  &lt;a href=&quot;{UrlPath}&quot;&gt;{UrlPath}&lt;/a&gt;\n  &lt;p&gt;{Description}&lt;/p&gt;\n  &lt;small&gt;Keywords: {KeyWords}&lt;/small&gt;\n&lt;/article&gt;</pre>',
      '<div ' + note + '>Bind <code>:tabId</code> to a query string like <code>?tabId=51</code>, or to a control named <code>tabId</code>.</div>',
      '</details>',

      '<details ' + details + '><summary ' + summary + '>Tips</summary>',
      '<ul style="margin:8px 0 0 18px;padding:0;color:#334155;font-size:12px;line-height:1.6;">',
      '<li>Connection alias <code>DashboardDatabase</code> is configured in DNN Host Settings (<code>MegaForm_Database_*</code>) and points to the site DB by default, so the samples work without extra setup.</li>',
      '<li>To prefill <code>:portalId</code> or <code>:search</code> from the URL, set <code>prefillParam</code> on the matching form field, then open the page like <code>?portalId=0&amp;search=News</code>.</li>',
      '<li>Multi-row paging is client-state (Prev/Next re-render in place). If you need URL-state paging (<code>page&lt;moduleId&gt;</code>, <code>size&lt;moduleId&gt;</code>), use the DataRepeater widget instead.</li>',
      '<li>Tokens are HTML-escaped by default. Use <code>{{{row:Column}}}</code> only when the SQL column already contains sanitized HTML.</li>',
      '</ul></details>',

      '</div>'
    ].join('');
  }

  MegaFormWidgets.register('DynamicLabel', {
    meta: { label: 'Dynamic Label', icon: 'fa-table-cells', category: 'advanced', color: '#38bdf8', defaultWidth: '100%' },
    defaults: {
      html: '<div class="mf-dynamic-label-note"><strong>Dynamic label</strong><br>Hello World</div>',
      allowRawHtml: true,
      enableTokens: true,
      useSql: false,
      resultMode: 'simple',
      dataSource: 'sql',
      connectionKey: 'DashboardDatabase',
      databaseType: '',
      masterQuery: '',
      sqlTemplate: '',
      headerTemplate: '<div class="mf-dynamic-label-list">',
      detailTemplate: '<article class="mf-dynamic-label-item"><strong>{{row:title}}</strong><div>{{row:summary}}</div></article>',
      footerTemplate: '</div>',
      pagerTemplate: '<span>Page {{meta:page}} of {{meta:totalPages}} &middot; {{meta:totalRows}} rows</span>',
      queryDependsOn: '',
      reloadOnParamChange: true,
      showPager: true,
      pageSize: 10,
      emptyHtml: '',
      errorHtml: '<div class="mf-dynamic-label-error">Could not load dynamic label content.</div>',
      cssClass: '',
      maxRows: 1000
    },
    properties: [
      {
        key: '__dynamicLabelHelp',
        label: 'DynamicLabel Help & SQL Samples',
        type: 'help',
        buttonLabel: 'Help / SQL samples',
        html: helpHtml(),
        // [v20260527-04] Inline sample presets — click "Apply" to fill every
        // widget setting in one shot. Every sample queries DNN's Tabs/Portals
        // so it works on any DNN install without extra data.
        samples: samplePresets()
      },
      { key: 'html', label: 'Raw HTML / static/simple template', type: 'textarea', default: '<div class="mf-dynamic-label-note"><strong>Dynamic label</strong><br>Hello World</div>' },
      { key: 'allowRawHtml', label: 'Render raw HTML', type: 'checkbox', default: true },
      { key: 'enableTokens', label: 'Resolve query string and control tokens', type: 'checkbox', default: true },
      { key: 'useSql', label: 'Load HTML from SQL', type: 'checkbox', default: false },
      { key: 'resultMode', label: 'SQL result mode', type: 'select', options: [{ label: 'Simple: first row only', value: 'simple' }, { label: 'Multi-row list with pager', value: 'multi' }], default: 'simple' },
      { key: 'dataSource', label: 'SQL source type', type: 'select', options: [{ label: 'SQL query', value: 'sql' }, { label: 'Stored procedure', value: 'storedproc' }], default: 'sql' },
      { key: 'connectionKey', label: 'Connection Name', type: 'text', default: 'DashboardDatabase' },
      { key: 'databaseType', label: 'Database type', type: 'select', options: [{ label: 'Auto-detect', value: '' }, { label: 'SQL Server', value: 'SqlServer' }, { label: 'SQLite', value: 'Sqlite' }, { label: 'PostgreSQL', value: 'PostgreSql' }, { label: 'MySQL', value: 'MySql' }], default: '' },
      { key: 'masterQuery', label: 'SQL query or stored procedure name', type: 'textarea', default: '' },
      { key: 'sqlTemplate', label: 'Simple row template override', type: 'textarea', default: '' },
      { key: 'headerTemplate', label: 'Multi-row header template', type: 'textarea', default: '<div class="mf-dynamic-label-list">' },
      { key: 'detailTemplate', label: 'Multi-row detail template', type: 'textarea', default: '<article class="mf-dynamic-label-item"><strong>{{row:title}}</strong><div>{{row:summary}}</div></article>' },
      { key: 'footerTemplate', label: 'Multi-row footer template', type: 'textarea', default: '</div>' },
      { key: 'pagerTemplate', label: 'Pager template', type: 'textarea', default: '<span>Page {{meta:page}} of {{meta:totalPages}} &middot; {{meta:totalRows}} rows</span>' },
      { key: 'queryDependsOn', label: 'Cascade SQL params from fields (:fieldname keys)', type: 'text', default: '' },
      { key: 'reloadOnParamChange', label: 'Reload when params change', type: 'checkbox', default: true },
      { key: 'showPager', label: 'Show pager in multi-row mode', type: 'checkbox', default: true },
      { key: 'pageSize', label: 'Rows per page', type: 'number', default: 10 },
      { key: 'maxRows', label: 'Server max rows', type: 'number', default: 1000 },
      { key: 'emptyHtml', label: 'Empty HTML', type: 'textarea', default: '' },
      { key: 'errorHtml', label: 'Error HTML', type: 'textarea', default: '<div class="mf-dynamic-label-error">Could not load dynamic label content.</div>' },
      { key: 'cssClass', label: 'CSS class', type: 'text', default: '' }
    ],
    render: function (field: any, formId: number) {
      var props = getProps(field);
      var wrapId = 'mf-' + formId + '-' + field.key + '-dynamic-label';
      return '<div class="mfw-dynamic-label-wrap ' + attr(props.cssClass) + '" id="' + attr(wrapId) + '"' + widthStyle(field) + ' data-badge="' + attr(BADGE) + '" data-formid="' + attr(formId) + '" data-field-key="' + attr(field.key) + '" data-dl-props="' + encodeProps(props) + '">' +
        '<div class="mfw-dynamic-label-content"></div>' +
        '</div>';
    },
    bind: function (_formId: number) {
      var wraps = document.querySelectorAll('.mfw-dynamic-label-wrap');
      for (var i = 0; i < wraps.length; i++) {
        bindWatchers(wraps[i]);
        refresh(wraps[i]);
      }
    },
    collect: function () { return ''; },
    validate: function () { return true; }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  [B62-HardCutover] legacy launcher disabled forever; unified designer is the only entry point.
  //  IIFE below is helper-only — no DOM scan, no `.mfdl-layout-launcher` button.
  //  Verified 2026-06-03: source contains ZERO createElement('button'),
  //  insertBefore, or canvas-card appendChild calls. Sole canvas entry-point
  //  is the unified launcher shipped by megaform-dynlabel-launcher.ts.
  //  The IIFE only exposes window.MFDynamicLabelLayoutHelpers (compose/split
  //  helpers) so the unified shell's Templates tab can reuse the same
  //  zone-marker contract — it never touches the canvas DOM.
  //  [B59 verified] IIFE below is helper-only — no DOM scan, no button
  //  inject. Sole canvas entry-point is "Open Unified Designer"
  //  (megaform-dynlabel-launcher.ts).
  //  [B53 hard cutover — entry consolidation]
  //  REMOVED: the standalone "Layout Designer" button injector.
  //
  //  Per the B53 user decision (Q1 = HARD CUTOVER), DynamicLabel now has a
  //  single Builder entry-point: the "Open Unified Designer" button shipped
  //  by `megaform-dynlabel-launcher.ts`. The Layout Designer surface lives
  //  INSIDE the unified shell as the "Templates → Presets" tab pane
  //  (mountDynLabelTemplates eventually delegates to MFLayoutDesigner.open()
  //  under the hood). Keeping two buttons doing related things was
  //  confusing per the scout report.
  //
  //  The MFLayoutDesigner bundle is still lazy-loaded by the unified
  //  shell's Templates tab; only the canvas-card button injection has been
  //  removed. External callers that relied on `.mfdl-layout-launcher`
  //  should switch to `.mfdl-unified-launcher` (the new sole entry-point
  //  class). Helper functions composeInitialHtml() and splitBackToFields()
  //  are now exposed via the legacy global below so the unified Templates
  //  tab adapter can reuse them.
  // ═══════════════════════════════════════════════════════════════════════════
  if (typeof document !== 'undefined') {
    (function exposeDynamicLabelLauncherHelpers() {
      var WIDGET_TYPE = 'DynamicLabel';
      // [B53] Helper-only IIFE — no DOM scan / no button injection.
      // Just keeps the layout-zone HTML compose/split helpers reachable from
      // the unified shell adapter (window.MFDynamicLabelLayoutHelpers).
      var BUNDLE_VERSION = '20260603-B53';

      function findField(key: string): any {
        var B = (window as any).MegaFormBuilder;
        var fields = B && B.state && B.state.schema && B.state.schema.fields ? B.state.schema.fields : [];
        function walk(list: any[]): any {
          for (var i = 0; i < list.length; i++) {
            var f = list[i]; if (!f) continue;
            if (f.key === key) return f;
            if (f.type === 'Row' && f.columns) {
              for (var ci = 0; ci < f.columns.length; ci++) {
                var col = f.columns[ci];
                if (col && col.fields) { var hit = walk(col.fields); if (hit) return hit; }
              }
            }
          }
          return null;
        }
        return walk(fields);
      }

      function composeInitialHtml(field: any): string {
        var wp = field && field.widgetProps ? field.widgetProps : {};
        // If the user previously saved combined HTML we preserve it
        // as-is. Otherwise stitch the 4 templates into zone markers.
        if (wp.layoutHtml && String(wp.layoutHtml).indexOf('<!-- mf:zone') >= 0) {
          return String(wp.layoutHtml);
        }
        var header = String(wp.headerTemplate || '');
        var detail = String(wp.detailTemplate || wp.rowTemplate || '');
        var footer = String(wp.footerTemplate || '');
        var pager  = String(wp.pagerTemplate || '');
        var empty  = String(wp.emptyHtml || '');
        var out = '';
        if (header || footer) {
          out += '<!-- mf:zone name="header" -->\n';
          if (header) out += '<!-- mf:block type="raw-header" -->' + header + '<!-- /mf:block -->\n';
          out += '<!-- /mf:zone -->\n';
        }
        if (detail) {
          out += '<!-- mf:zone name="rows" loop="true" -->\n';
          out += '<!-- mf:block type="row-template" -->' + detail + '<!-- /mf:block -->\n';
          out += '<!-- /mf:zone -->\n';
        }
        if (pager) {
          out += '<!-- mf:zone name="pager" -->\n';
          out += '<!-- mf:block type="pager" -->' + pager + '<!-- /mf:block -->\n';
          out += '<!-- /mf:zone -->\n';
        }
        if (empty) {
          out += '<!-- mf:zone name="empty" -->\n';
          out += '<!-- mf:block type="empty-state" -->' + empty + '<!-- /mf:block -->\n';
          out += '<!-- /mf:zone -->\n';
        }
        return out;
      }

      function splitBackToFields(html: string, field: any): void {
        var ZONE_RE = /<!--\s*mf:zone\s+([^>]*?)-->([\s\S]*?)<!--\s*\/mf:zone\s*-->/g;
        var BLOCK_RE = /<!--\s*mf:block[^>]*?-->([\s\S]*?)<!--\s*\/mf:block\s*-->/g;
        var captured: { [k: string]: string } = { header: '', rows: '', pager: '', empty: '' };
        var m: RegExpExecArray | null;
        while ((m = ZONE_RE.exec(html)) !== null) {
          var attrs = m[1] || '';
          var body = m[2] || '';
          var nameMatch = /name\s*=\s*"([^"]+)"/.exec(attrs);
          if (!nameMatch) continue;
          var name = nameMatch[1].toLowerCase();
          var inner = '';
          BLOCK_RE.lastIndex = 0;
          var bm: RegExpExecArray | null;
          while ((bm = BLOCK_RE.exec(body)) !== null) inner += bm[1];
          if (!inner) inner = body.trim();
          if (captured.hasOwnProperty(name)) captured[name] = inner;
        }
        field.widgetProps = field.widgetProps || {};
        field.widgetProps.layoutHtml = html;
        if (captured.header) field.widgetProps.headerTemplate = captured.header;
        if (captured.rows)   field.widgetProps.detailTemplate = captured.rows;
        if (captured.pager)  field.widgetProps.pagerTemplate  = captured.pager;
        if (captured.empty)  field.widgetProps.emptyHtml      = captured.empty;
        var B = (window as any).MegaFormBuilder;
        if (B && B.state) B.state.isDirty = true;
        try { if (B && B.callModule) B.callModule('properties', 'showProps', [field]); } catch (_) { /* ignore */ }
      }

      function lazyLoadAndOpen(field: any) {
        var open = function () {
          var d = (window as any).MFLayoutDesigner;
          if (!d || typeof d.open !== 'function') {
            alert('Layout Designer bundle did not load.');
            return;
          }
          d.open({
            widget: 'dynamic-label',
            initialHtml: composeInitialHtml(field),
            formId: ((window as any).MegaFormBuilder && (window as any).MegaFormBuilder.state && (window as any).MegaFormBuilder.state.formId) || 0,
            fieldKey: field && field.key ? field.key : '',
            portalId: ((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.portalId) || 0,
            sqlPreview: {
              fetchTopRows: function () { return Promise.resolve({ columns: [], rows: [] }); },
            },
            onApply: function (newHtml: string) { splitBackToFields(newHtml, field); },
          });
        };
        if ((window as any).MFLayoutDesigner) { open(); return; }
        var basePath = '/Modules/MegaForm/js/';
        try {
          var scripts = Array.prototype.slice.call(document.scripts);
          for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            var mm = src.match(/^(.*\/)(?:plugins\/)?megaform-widget-dynamic-label\.js/i);
            if (mm) { basePath = mm[1].replace(/plugins\/$/, ''); break; }
          }
        } catch (_) { /* keep default */ }
        var url = basePath + 'megaform-layout-designer.js?v=' + encodeURIComponent(BUNDLE_VERSION);
        var sc = document.createElement('script');
        sc.src = url; sc.async = true;
        sc.onload = function () { open(); };
        sc.onerror = function () { alert('Failed to load ' + url); };
        document.head.appendChild(sc);
      }

      // [B53 hard cutover] No DOM scan, no inject(), no MutationObserver.
      // The unified Designer launcher (megaform-dynlabel-launcher.ts) is now
      // the only Builder entry-point for DynamicLabel. Expose the helpers
      // for the unified Templates tab adapter so it can lazy-load layout
      // designer with the same compose/split contract.
      try {
        (window as any).MFDynamicLabelLayoutHelpers = {
          version: BUNDLE_VERSION,
          findField: findField,
          composeInitialHtml: composeInitialHtml,
          splitBackToFields: splitBackToFields,
          lazyLoadAndOpen: lazyLoadAndOpen,
        };
      } catch (_) { /* ignore */ }
    })();
  }
})(window as any);
