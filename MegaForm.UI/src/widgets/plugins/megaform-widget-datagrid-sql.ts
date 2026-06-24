/**
 * MegaForm DataGrid — SQL display-mode handler
 *
 * Build:   tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-datagrid-sql.js
 *
 * When a DataGrid field carries `widgetProps.useSql === true`, it is no
 * longer an editable line-items grid. Instead it becomes a read-only
 * tabular display that:
 *   - Fetches rows server-side via the existing /api/MegaForm/DataRepeater/Query
 *     endpoint (the canonical SQL+token-bind pipeline — DataRepeaterService
 *     is widget-type-agnostic, it reads widgetProps by widgetKey regardless
 *     of field.type).
 *   - Derives columns from `widgetProps.columns` when provided, otherwise
 *     auto-derives from the first row of the SQL result.
 *   - Refetches automatically when any field listed in `widgetProps.queryDependsOn`
 *     changes (cascade behavior — picking a parent dropdown re-loads the
 *     dependent grid in place).
 *   - Suppresses Add/Delete buttons (display-only).
 *
 * The main megaform-widget-datagrid.ts checks for `props.useSql` and
 * delegates to `window.MFDataGridSql.bind(...)` defined here. This split
 * keeps the edit-mode file focused on inline-editing logic and the SQL-mode
 * file focused on fetch + cascade, per the user's "tach ra cac file TS nho"
 * directive (2026-05-29).
 *
 * Badge: DataGridSqlMode v20260530-11
 */
(function (global: any) {
  'use strict';

  var BADGE = 'DataGridSqlMode v20260531-R1.4-reorder-savedviews-01';

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers (mirrors data-repeater pattern — kept minimal)
  // ─────────────────────────────────────────────────────────────────────

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(v: any): string { return esc(v); }
  function splitCsv(s: string): string[] {
    return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function getApiBase(): string {
    var pf = (global.__MF_PLATFORM__ || {}) as any;
    if (pf && typeof pf.apiBase === 'string' && pf.apiBase) return pf.apiBase.replace(/\/$/, '') + '/';
    var explicit = (global as any).__MF_API_BASE__;
    if (explicit) return String(explicit).replace(/\/$/, '') + '/';
    // [B51] Platform-aware default (Oqtane vs DNN)
    var platform = String(pf.platform || '').toLowerCase();
    if (platform === 'oqtane' || (global as any).Oqtane || (global as any).__OQTANE__ || (typeof document !== 'undefined' && document.querySelector && document.querySelector('[data-mf-platform="oqtane"]'))) {
      return '/api/MegaForm/';
    }
    return '/DesktopModules/MegaForm/API/';
  }
  function getPortalId(): number {
    var pf = (global.__MF_PLATFORM__ || {}) as any;
    var raw = pf.portalId != null ? pf.portalId : pf.PortalId;
    var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
    return isFinite(n) && n >= 0 ? n : 0;
  }
  function getAuthToken(): string {
    return (global as any).__MF_TOKEN || ((global as any).__MF_PLATFORM__ && (global as any).__MF_PLATFORM__.authToken) || '';
  }
  function getAntiForgery(): string {
    try {
      var sf = (global as any).$ && (global as any).$.ServicesFramework;
      if (sf) {
        var inst = sf(0);
        if (inst && typeof inst.getAntiForgeryValue === 'function') return inst.getAntiForgeryValue() || '';
      }
    } catch (_e) { /* ignore */ }
    return '';
  }

  function ajaxJson(url: string, cb: (err: string | null, data: any) => void): void {
    var openUrl = url;
    if (!/[?&]portalId=/i.test(openUrl)) {
      openUrl += (openUrl.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + getPortalId();
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', openUrl, true);
    xhr.setRequestHeader('Accept', 'application/json');
    var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
    var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(null, JSON.parse(xhr.responseText || '{}')); }
        catch (_e) { cb('Invalid JSON', null); }
      } else {
        cb('HTTP ' + xhr.status, null);
      }
    };
    xhr.send();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Column auto-derive
  //  When `widgetProps.columns` is empty, derive from server response.
  // ─────────────────────────────────────────────────────────────────────

  interface RuntimeColumn { key: string; label: string; type: string; }

  function deriveColumnsFromResult(declared: any[], serverCols: any[], firstRow: any): RuntimeColumn[] {
    if (declared && declared.length) {
      return declared.map(function (c: any) {
        return { key: String(c.key || c.name || ''), label: String(c.label || c.key || c.name || ''), type: String(c.type || 'text') };
      }).filter(function (c) { return !!c.key; });
    }
    if (Array.isArray(serverCols) && serverCols.length) {
      return serverCols.map(function (c: any) {
        var name = String(c.name || c.Name || c.key || '');
        var t = String(c.type || c.Type || 'text').toLowerCase();
        return { key: name, label: name, type: /int|num|dec|money|float|real/.test(t) ? 'number' : (/date|time/.test(t) ? 'date' : 'text') };
      }).filter(function (c) { return !!c.key; });
    }
    if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
      return Object.keys(firstRow).map(function (k) { return { key: k, label: k, type: 'text' }; });
    }
    return [];
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Bind — entry point called by megaform-widget-datagrid.ts when useSql
  // ─────────────────────────────────────────────────────────────────────

  function bind(wrap: HTMLElement, props: any, formId: number, fieldKey: string): void {
    if ((wrap as any).__mfwDgridSqlBound) return;
    (wrap as any).__mfwDgridSqlBound = true;

    var dependsOn = splitCsv(String(props.queryDependsOn || ''));
    var pageSize = parseInt(String(props.pageSize || 100), 10) || 100;
    var declaredCols = Array.isArray(props.columns) ? props.columns : [];
    var emptyMessage = String(props.emptyMessage || 'No matching rows.');

    function collectParams(): Record<string, string> {
      var out: Record<string, string> = {};
      dependsOn.forEach(function (k) {
        var sel = document.querySelector('[name="' + k + '"]') as HTMLInputElement | null;
        if (sel) out[k] = sel.value || '';
      });
      return out;
    }

    function buildUrl(): string {
      var url = getApiBase() + 'DataRepeater/Query?formId=' + encodeURIComponent(String(formId)) +
                '&widgetKey=' + encodeURIComponent(fieldKey) +
                '&page=1&pageSize=' + pageSize;
      var p = collectParams();
      Object.keys(p).forEach(function (k) {
        url += '&__p__' + encodeURIComponent(k) + '=' + encodeURIComponent(p[k]);
      });
      return url;
    }

    function renderShell(stateHtml: string): void {
      wrap.innerHTML =
        '<div class="mfw-dgrid-toolbar">' +
          '<span class="mfw-dgrid-title">' +
            esc(String(props.tableName || 'Results')) + ' ' +
            '<span style="color:#94a3b8;font-weight:400" data-mfw-sql-status></span>' +
          '</span>' +
        '</div>' +
        '<div data-mfw-sql-body>' + stateHtml + '</div>';
    }

    function setStatus(s: string): void {
      var n = wrap.querySelector('[data-mfw-sql-status]'); if (n) n.textContent = s;
    }

    // [R1.1 v20260531-virtual-01] Render rows with a windowed (virtualised)
    // viewport when the dataset exceeds VIRT_THRESHOLD rows. Only the rows
    // that intersect the visible scroll port (+ OVERSCAN above/below) live in
    // the DOM at any time; padding spacers preserve the natural scrollbar
    // travel. Below the threshold we keep the dense single-pass renderer so
    // small queries don't pay any wrapper cost.
    var VIRT_THRESHOLD = 200;
    var ROW_PX  = 32;
    var OVERSCAN = 10;
    var WINDOW_ROWS = 30;
    function renderRows(cols: RuntimeColumn[], rows: any[]): void {
      var body = wrap.querySelector('[data-mfw-sql-body]') as HTMLElement | null;
      if (!body) return;
      // [R1.4 v20260531-reorder-01] Re-order columns from the persisted order
      // (mutated by drag-reorder or restored from a saved view).
      var savedOrder: string[] = (wrap as any).__mfwColOrder || [];
      if (savedOrder.length) {
        var byKey: Record<string, RuntimeColumn> = {};
        cols.forEach(function (c: any) { byKey[c.key] = c; });
        var reordered: RuntimeColumn[] = [];
        savedOrder.forEach(function (k) { if (byKey[k]) { reordered.push(byKey[k]); delete byKey[k]; } });
        Object.keys(byKey).forEach(function (k) { reordered.push(byKey[k]); }); // appended unknown cols
        cols = reordered;
      }
      if (!rows || rows.length === 0) {
        body.innerHTML = '<div class="mfw-dgrid-empty" style="grid-column:1/-1">' + esc(emptyMessage) + '</div>';
        return;
      }
      var template = cols.map(function (c: any) {
        // Honour user-tweaked column widths persisted by R1.4 (data-mfw-colw).
        var w = (wrap as any).__mfwColWidths && (wrap as any).__mfwColWidths[c.key];
        return w || '1fr';
      }).join(' ');
      function cellsFor(r: any): string {
        if (Array.isArray(r)) return cols.map(function (_c, i) { return '<div class="mfw-dgrid-cell is-readonly">' + esc(r[i]) + '</div>'; }).join('');
        return cols.map(function (c) { return '<div class="mfw-dgrid-cell is-readonly">' + esc((r as any)[c.key]) + '</div>'; }).join('');
      }
      var head = cols.map(function (c) { return '<div class="mfw-dgrid-cell mfw-dgrid-head-cell" data-mfw-colkey="' + esc(c.key) + '">' + esc(c.label) + '<span class="mfw-dgrid-col-resize" data-mfw-resize="' + esc(c.key) + '" title="Drag to resize column"></span></div>'; }).join('');
      if (rows.length < VIRT_THRESHOLD) {
        var dense = rows.map(function (r) { return '<div class="mfw-dgrid-row" style="display:contents">' + cellsFor(r) + '</div>'; }).join('');
        body.innerHTML =
          '<div class="mfw-dgrid-grid" data-mfw-grid-template="' + esc(template) + '" style="grid-template-columns:' + template + '">' +
            '<div class="mfw-dgrid-head" style="display:contents">' + head + '</div>' +
            dense +
          '</div>';
        var headGrid = body.querySelector('.mfw-dgrid-grid') as HTMLElement;
        wireResizeHandles(body, cols, headGrid);
        wireReorderHandles(body, cols, headGrid, function (newOrder) {
          (wrap as any).__mfwColOrder = newOrder;
          renderRows(cols, rows);
        });
        return;
      }
      // ── Windowed mode ──────────────────────────────────────────────────
      var total = rows.length;
      var totalPx = total * ROW_PX;
      body.innerHTML =
        '<div class="mfw-dgrid-virtport" data-mfw-virtport style="max-height:480px;overflow-y:auto;overflow-x:auto;position:relative">' +
          '<div class="mfw-dgrid-virtinner" data-mfw-virtinner style="position:relative;min-height:' + totalPx + 'px">' +
            '<div class="mfw-dgrid-virthead" data-mfw-virthead style="position:sticky;top:0;z-index:2;background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
              '<div class="mfw-dgrid-grid" style="grid-template-columns:' + template + '"><div class="mfw-dgrid-head" style="display:contents">' + head + '</div></div>' +
            '</div>' +
            '<div class="mfw-dgrid-virtwindow" data-mfw-virtwindow style="position:absolute;left:0;right:0;top:0;will-change:transform">' +
              '<div class="mfw-dgrid-grid" style="grid-template-columns:' + template + '" data-mfw-virtgrid></div>' +
            '</div>' +
          '</div>' +
          '<div class="mfw-dgrid-virt-status" data-mfw-virtstatus style="position:sticky;bottom:0;background:rgba(248,250,252,.95);padding:4px 10px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between"></div>' +
        '</div>';
      var port   = body.querySelector('[data-mfw-virtport]')  as HTMLElement;
      var head2  = body.querySelector('[data-mfw-virthead]')  as HTMLElement;
      var window2= body.querySelector('[data-mfw-virtwindow]') as HTMLElement;
      var grid2  = body.querySelector('[data-mfw-virtgrid]')  as HTMLElement;
      var status = body.querySelector('[data-mfw-virtstatus]') as HTMLElement;
      // Account for the sticky header height (≈row height) — push window below it.
      function paint() {
        var scrollTop = port.scrollTop;
        var startIdx  = Math.max(0, Math.floor(scrollTop / ROW_PX) - OVERSCAN);
        var visible   = Math.ceil((port.clientHeight - ROW_PX) / ROW_PX);
        var endIdx    = Math.min(total, startIdx + visible + OVERSCAN * 2);
        var slice     = rows.slice(startIdx, endIdx);
        var sliceHtml = slice.map(function (r) { return '<div class="mfw-dgrid-row" style="display:contents">' + cellsFor(r) + '</div>'; }).join('');
        grid2.innerHTML = sliceHtml;
        var offsetPx = startIdx * ROW_PX + ROW_PX; // +ROW_PX for the sticky header gap
        window2.style.transform = 'translateY(' + offsetPx + 'px)';
        status.innerHTML = '<span>Rows ' + (startIdx + 1) + '–' + endIdx + ' of <strong>' + total + '</strong></span>' +
                          '<span>Virtualised window: ' + (endIdx - startIdx) + ' / ' + total + '</span>';
      }
      var ticking = false;
      port.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { paint(); ticking = false; });
      });
      paint();
      var virtHeadGrid = head2.querySelector('.mfw-dgrid-grid') as HTMLElement;
      wireResizeHandles(body, cols, virtHeadGrid);
      wireReorderHandles(body, cols, virtHeadGrid, function (newOrder) {
        (wrap as any).__mfwColOrder = newOrder;
        renderRows(cols, rows);
      });
    }

    // [R1.4 v20260531-reorder-01] Column drag-reorder. Mouse-down on a
    // header cell (not its resize handle) starts a drag; mouseup over a
    // different header swaps the column order. The mutation lives in
    // wrap.__mfwColOrder[] and re-renders the grid.
    function wireReorderHandles(_body: HTMLElement, cols: RuntimeColumn[], headGrid: HTMLElement, onReorder: (newOrder: string[]) => void): void {
      if (!headGrid) return;
      headGrid.querySelectorAll<HTMLElement>('.mfw-dgrid-head-cell').forEach(function (cell) {
        if ((cell as any).__mfwReorderBound) return;
        (cell as any).__mfwReorderBound = true;
        cell.setAttribute('draggable', 'true');
        cell.style.cursor = 'grab';
        cell.addEventListener('dragstart', function (ev: any) {
          if ((ev.target as HTMLElement).classList.contains('mfw-dgrid-col-resize')) { ev.preventDefault(); return; }
          var key = cell.getAttribute('data-mfw-colkey') || '';
          if (!key) return;
          ev.dataTransfer.setData('text/plain', key);
          ev.dataTransfer.effectAllowed = 'move';
          cell.style.opacity = '0.5';
        });
        cell.addEventListener('dragend', function () { cell.style.opacity = '1'; });
        cell.addEventListener('dragover', function (ev: any) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; cell.style.outline = '2px dashed #6366f1'; });
        cell.addEventListener('dragleave', function () { cell.style.outline = ''; });
        cell.addEventListener('drop', function (ev: any) {
          ev.preventDefault(); cell.style.outline = '';
          var dragKey = ev.dataTransfer.getData('text/plain');
          var dropKey = cell.getAttribute('data-mfw-colkey');
          if (!dragKey || !dropKey || dragKey === dropKey) return;
          var order = ((wrap as any).__mfwColOrder || cols.map(function (c: any) { return c.key; })).slice();
          var di = order.indexOf(dragKey), pi = order.indexOf(dropKey);
          if (di < 0 || pi < 0) return;
          order.splice(di, 1);
          order.splice(pi, 0, dragKey);
          (wrap as any).__mfwColOrder = order;
          onReorder(order);
        });
      });
    }

    // [R1.4 v20260531-savedviews-01] Saved views chip bar. Fetches the user's
    // saved view list via /AiTools/DataGridPrefs and renders a small horizontal
    // strip of clickable chips at the top of the wrap. Clicking a chip restores
    // its config (column order, widths, sorts). A "+" chip prompts for a name
    // and POSTs the current state.
    function mountSavedViewsBar(wrap: HTMLElement, formId: number, fieldKey: string, applyConfig: (cfg: any) => void): void {
      var bar = wrap.querySelector('[data-mfw-savedviews]') as HTMLElement | null;
      if (!bar) {
        bar = document.createElement('div');
        bar.setAttribute('data-mfw-savedviews', '1');
        bar.style.cssText = 'padding:5px 10px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:6px;font-size:11px;color:#475569;flex-wrap:wrap';
        bar.innerHTML = '<span style="font-weight:600">Views:</span><span data-mfw-savedviews-list></span>';
        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.style.cssText = 'padding:2px 8px;border:1px dashed #94a3b8;border-radius:999px;background:transparent;cursor:pointer;color:#475569;font-size:11px;margin-left:auto';
        saveBtn.textContent = '+ Save current as view';
        saveBtn.addEventListener('click', function () {
          var name = window.prompt('Save current view as:');
          if (!name) return;
          var widths = (wrap as any).__mfwColWidths || {};
          var order  = (wrap as any).__mfwColOrder  || [];
          var cfg = { columnOrder: order, columnWidths: widths };
          var url = getApiBase() + 'AiTools/DataGridPrefs';
          fetch(url, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': getCsrfToken() },
            body: JSON.stringify({ formId, fieldKey, viewName: name, configJson: JSON.stringify(cfg) })
          }).then(function () { loadList(); });
        });
        bar.appendChild(saveBtn);
        wrap.insertBefore(bar, wrap.firstChild);
      }
      function loadList() {
        var list = bar!.querySelector('[data-mfw-savedviews-list]') as HTMLElement;
        if (!list) return;
        list.innerHTML = '<span style="color:#94a3b8;font-style:italic">loading…</span>';
        var url = getApiBase() + 'AiTools/DataGridPrefs?formId=' + formId + '&fieldKey=' + encodeURIComponent(fieldKey);
        fetch(url, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : { views: [] }; })
          .then(function (d) {
            var views = (d && d.views) || [];
            if (!views.length) { list.innerHTML = '<span style="color:#94a3b8;font-style:italic">no saved views yet</span>'; return; }
            list.innerHTML = views.filter(function (v: any) { return v.viewName; }).map(function (v: any) {
              return '<span class="mfw-savedview-chip" data-mfw-view="' + esc(v.viewName) + '" style="display:inline-block;padding:2px 9px;background:#fff;border:1px solid #cbd5e1;border-radius:999px;cursor:pointer;color:#0f172a;font-weight:600;font-size:11px;margin-right:4px">' + esc(v.viewName) + '</span>';
            }).join('');
            list.querySelectorAll<HTMLElement>('[data-mfw-view]').forEach(function (chip) {
              chip.addEventListener('click', function () {
                var name = chip.getAttribute('data-mfw-view');
                var target = views.filter(function (v: any) { return v.viewName === name; })[0];
                if (target) {
                  try { applyConfig(JSON.parse(target.configJson)); }
                  catch { applyConfig({}); }
                }
              });
            });
          })
          .catch(function () { list.innerHTML = '<span style="color:#dc2626">views load error</span>'; });
      }
      loadList();
    }

    function getCsrfToken(): string {
      var el = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
      return el ? el.value : '';
    }

    // [R1.4 v20260531-resize-01] Column resize via drag the right edge of a
    // header cell. New width persists on the wrap as a per-column width map
    // and is re-applied on every render.
    function wireResizeHandles(_body: HTMLElement, cols: RuntimeColumn[], headGrid: HTMLElement): void {
      if (!headGrid) return;
      headGrid.querySelectorAll('[data-mfw-resize]').forEach(function (h: any) {
        if (h.__mfwResizeBound) return;
        h.__mfwResizeBound = true;
        h.addEventListener('mousedown', function (ev: any) {
          ev.preventDefault();
          ev.stopPropagation();
          var key = String(h.getAttribute('data-mfw-resize') || '');
          if (!key) return;
          var startX = ev.clientX;
          var thCell = h.closest('.mfw-dgrid-head-cell, .mfw-dgrid-cell') as HTMLElement | null;
          var startW = thCell ? thCell.getBoundingClientRect().width : 100;
          var widths = (wrap as any).__mfwColWidths || ((wrap as any).__mfwColWidths = {});
          function move(mv: any) {
            var newW = Math.max(40, startW + (mv.clientX - startX));
            widths[key] = newW + 'px';
            // Live-update every grid template-columns in the wrap.
            wrap.querySelectorAll<HTMLElement>('.mfw-dgrid-grid').forEach(function (g) {
              var tpl = cols.map(function (c: any) { return widths[c.key] || '1fr'; }).join(' ');
              g.style.gridTemplateColumns = tpl;
            });
          }
          function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
          }
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        });
      });
    }

    function reload(): void {
      setStatus('· loading…');
      ajaxJson(buildUrl(), function (err, data) {
        if (err) {
          setStatus('· error');
          var body = wrap.querySelector('[data-mfw-sql-body]') as HTMLElement | null;
          if (body) body.innerHTML = '<div class="mfw-dgrid-empty" style="color:#dc2626">SQL error: ' + esc(err) + '</div>';
          return;
        }
        var serverCols = (data && (data.columns || data.Columns)) || [];
        var rows = (data && (data.rows || data.Rows)) || [];
        var first = rows && rows.length ? rows[0] : null;
        var cols = deriveColumnsFromResult(declaredCols, serverCols, first);
        setStatus('· ' + (rows ? rows.length : 0) + ' rows');
        renderRows(cols, rows);
      });
    }

    renderShell('<div class="mfw-dgrid-empty">Waiting for selection…</div>');

    // [R1.4] Mount the saved-views chip bar at the top of the wrap.
    mountSavedViewsBar(wrap, formId, fieldKey, function (cfg: any) {
      if (cfg && Array.isArray(cfg.columnOrder)) (wrap as any).__mfwColOrder = cfg.columnOrder.slice();
      if (cfg && cfg.columnWidths && typeof cfg.columnWidths === 'object') (wrap as any).__mfwColWidths = Object.assign({}, cfg.columnWidths);
      reload();
    });

    // Cascade: refetch when any depends-on field changes.
    dependsOn.forEach(function (k) {
      var sel = document.querySelector('[name="' + k + '"]') as HTMLElement | null;
      if (!sel) return;
      sel.addEventListener('change', function () { reload(); });
      sel.addEventListener('input', function () { /* debounce for text inputs */
        clearTimeout((sel as any).__mfwDg);
        (sel as any).__mfwDg = setTimeout(reload, 350);
      });
    });

    // Initial fetch (or wait if dependsOn fields are still empty)
    var p0 = collectParams();
    var hasAllParams = dependsOn.length === 0 || dependsOn.every(function (k) { return String(p0[k] || '').length > 0; });
    if (hasAllParams) reload();
  }

  (global as any).MFDataGridSql = { bind: bind, badge: BADGE };
  if (typeof window !== 'undefined') (window as any).__MF_DATAGRID_SQL_BADGE__ = BADGE;
})(typeof window !== 'undefined' ? window : globalThis);
