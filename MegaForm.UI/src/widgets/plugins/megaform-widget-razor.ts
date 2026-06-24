// @ts-nocheck
/**
 * MegaForm Razor Widget — server-rendered .razor template host
 * Badge: RazorWidget v20260530-01
 *
 * The Razor widget is MegaForm's escape hatch for use cases the standard
 * widgets cannot reach: pivots, calendars driven by SQL, interactive
 * calculators, map pickers, anything that benefits from real C# + LINQ
 * + Blazor binding. The actual rendering happens server-side (Blazor
 * HtmlRenderer on Oqtane, classic-Razor in Phase 2 on DNN) — this
 * plugin is the form-side host that:
 *
 *   1. POSTs to /RazorWidget/Render with { templateName, parameters,
 *      sqlRows, widgetKey } and sets the slot innerHTML to the response.
 *   2. Watches `dependsOn[]` form fields → debounced re-fetch + swap
 *      (cascade behavior parallel to SQL widgets).
 *   3. If the template emits a value (`emitsValue: true`), reads it back
 *      via Render-response shape `{value: {...}}` and pushes the value
 *      into a hidden input named [field.key] so the submission JSON
 *      carries it forward.
 *   4. SQL pre-fetch: when widgetProps.useSql is true, fetches rows via
 *      the existing DataRepeater endpoint first, then forwards them to
 *      Render as sqlRows (mirrors DynamicLabel's pipeline).
 *
 * Builder canvas: shows a thin placeholder card with the template name
 * + a "Live preview" button that calls Render with the configured props.
 * Customer's @code overrides are NOT executed in the Builder (security
 * boundary — only host-edited source compiles).
 */
(function (global: any) {
  'use strict';

  var BADGE = 'RazorWidget v20260530-01';
  var MegaFormWidgets: any = global.MegaFormWidgets;
  if (!MegaFormWidgets || typeof MegaFormWidgets.register !== 'function') return;

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(v: any): string { return esc(v); }
  function splitCsv(s: string): string[] {
    return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Platform / URL helpers
  // ─────────────────────────────────────────────────────────────────────

  function getApiBase(): string {
    var pf = (global.__MF_PLATFORM__ || {}) as any;
    if (pf && typeof pf.apiBase === 'string' && pf.apiBase) return String(pf.apiBase).replace(/\/?$/, '/');
    if (pf && typeof pf.apiBaseUrl === 'string' && pf.apiBaseUrl) return String(pf.apiBaseUrl).replace(/\/?$/, '/');
    if ((global as any).$ && (global as any).$.ServicesFramework) return '/DesktopModules/MegaForm/API/';
    return '/api/MegaForm/';
  }

  // Detect Oqtane vs DNN — different POST popup route prefix.
  // Oqtane: /api/MegaFormPopup/RazorWidget/Render
  // DNN:    /DesktopModules/MegaForm/API/RazorWidget/Render
  function getRazorRenderUrl(): string {
    var base = getApiBase();
    if (/\/api\/MegaForm\//i.test(base) || /\/api\/MegaFormPopup\//i.test(base)) {
      // Oqtane path — use popup namespace where the controller lives.
      var origin = base.replace(/\/api\/.*$/i, '');
      return origin + '/api/MegaFormPopup/RazorWidget/Render';
    }
    return base + 'RazorWidget/Render';
  }
  function getRazorListUrl(): string {
    var base = getApiBase();
    if (/\/api\/MegaForm\//i.test(base) || /\/api\/MegaFormPopup\//i.test(base)) {
      var origin = base.replace(/\/api\/.*$/i, '');
      return origin + '/api/MegaFormPopup/RazorWidget/List';
    }
    return base + 'RazorWidget/List';
  }

  function getPortalId(): number {
    var pf = (global.__MF_PLATFORM__ || {}) as any;
    var raw = pf.portalId != null ? pf.portalId : pf.PortalId;
    var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
    return isFinite(n) && n >= 0 ? n : 0;
  }
  function getAuthToken(): string {
    var pf = (global as any).__MF_PLATFORM__ || {};
    return (global as any).__MF_TOKEN || pf.authToken || '';
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

  function jsonPost(url: string, body: any, cb: (err: any, data: any) => void): void {
    var fullUrl = url;
    if (!/[?&]portalId=/i.test(fullUrl)) {
      fullUrl += (fullUrl.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + getPortalId();
    }
    var xhr = new XMLHttpRequest();
    xhr.open('POST', fullUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
    var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      try {
        var data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) cb(null, data);
        else cb({ status: xhr.status, payload: data }, null);
      } catch (e) {
        cb({ status: xhr.status, raw: xhr.responseText }, null);
      }
    };
    xhr.send(JSON.stringify(body || {}));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  SQL pre-fetch via DataRepeater (when widgetProps.useSql)
  // ─────────────────────────────────────────────────────────────────────

  function fetchSqlRows(formId: number, widgetKey: string, paramValues: any, cb: (err: any, rows: any[]) => void): void {
    // DataRepeater/Query is a GET endpoint (same shape DynamicLabel uses).
    // Cascade values + page hints ride as query-string parameters; the
    // controller looks up widgetProps.masterQuery server-side from the form
    // schema by (formId, widgetKey) so we don't have to resend the SQL.
    var parts = ['formId=' + encodeURIComponent(String(formId)), 'widgetKey=' + encodeURIComponent(String(widgetKey)), 'page=1', 'pageSize=2000'];
    if (paramValues && typeof paramValues === 'object') {
      try { parts.push('filterJson=' + encodeURIComponent(JSON.stringify(paramValues))); }
      catch (_e) { /* ignore */ }
    }
    var url = getApiBase() + 'DataRepeater/Query?' + parts.join('&');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
    var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) { cb({ status: xhr.status, raw: xhr.responseText }, []); return; }
      try {
        var data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        // DataRepeater returns {Columns:[{Name,DataType}], Rows:[[v1,v2,v3]…]}.
        // Zip into objects keyed by column name so the .razor template can
        // address fields by name (Row.PlayerName etc).
        var rows = (data && (data.rows || data.Rows)) || [];
        var cols = (data && (data.columns || data.Columns)) || null;
        if (Array.isArray(cols) && cols.length && rows.length && Array.isArray(rows[0])) {
          var colNames = cols.map(function (c: any) { return String((c && (c.name || c.Name)) || ''); });
          rows = rows.map(function (r: any[]) {
            var o: any = {};
            for (var i = 0; i < colNames.length; i++) o[colNames[i]] = r[i];
            return o;
          });
        }
        cb(null, Array.isArray(rows) ? rows : []);
      } catch (e) { cb(e, []); }
    };
    xhr.send();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Form context helpers (read sibling field values, write hidden input)
  // ─────────────────────────────────────────────────────────────────────

  function findFormRoot(el: Element): Element {
    var node: any = el;
    while (node && node !== document.body) {
      if (node.classList && (node.classList.contains('mf-form') || node.classList.contains('mfw-form') || node.tagName === 'FORM')) return node;
      node = node.parentNode;
    }
    return document.body;
  }
  function readFieldValue(formRoot: Element, key: string): string {
    if (!key) return '';
    var el = formRoot.querySelector('[name="' + key.replace(/"/g, '\\"') + '"]') as HTMLInputElement | null;
    if (!el) return '';
    var t = String((el as any).type || '').toLowerCase();
    if (t === 'checkbox') return (el as HTMLInputElement).checked ? 'true' : 'false';
    if (t === 'radio') {
      var picks = formRoot.querySelectorAll('input[name="' + key.replace(/"/g, '\\"') + '"]:checked');
      return picks.length ? String((picks[0] as HTMLInputElement).value || '') : '';
    }
    return String((el as any).value == null ? '' : (el as any).value);
  }
  function collectDeps(formRoot: Element, deps: string[]): any {
    var out: any = {};
    for (var i = 0; i < deps.length; i++) out[deps[i]] = readFieldValue(formRoot, deps[i]);
    return out;
  }

  function ensureHiddenInput(wrap: Element, fieldKey: string): HTMLInputElement {
    var existing = wrap.querySelector('input[type="hidden"][data-razor-emit="1"]') as HTMLInputElement | null;
    if (existing) return existing;
    var h = document.createElement('input');
    h.type = 'hidden';
    h.name = fieldKey;
    h.setAttribute('data-razor-emit', '1');
    wrap.appendChild(h);
    return h;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────

  function getProps(field: any): any {
    var wp = (field && (field.widgetProps || field.WidgetProps)) || {};
    var actions = wp.actions || null;
    if (typeof actions === 'string') {
      try { actions = JSON.parse(actions); } catch (_e) { actions = null; }
    }
    return {
      templateName:        String(wp.templateName || wp.template || ''),
      parameters:          wp.parameters || wp.params || {},
      useSql:              !!wp.useSql,
      connectionKey:       String(wp.connectionKey || 'DashboardDatabase'),
      masterQuery:         String(wp.masterQuery || ''),
      dependsOn:           splitCsv(wp.dependsOn || ''),
      queryDependsOn:      splitCsv(wp.queryDependsOn || ''),
      reloadOnParamChange: wp.reloadOnParamChange !== false,
      cssClass:            String(wp.cssClass || ''),
      placeholder:         String(wp.placeholder || ''),
      actions:             actions || {},
      // [v20260531-RZ7] Inline custom .razor source — design-and-apply
      // flow. When set, the server JIT-compiles + renders this instead of
      // looking up templateName in the registry.
      razorSource:         String(wp.razorSource || wp.razorSourceOverride || ''),
    };
  }

  function encodeProps(props: any): string { return attr(JSON.stringify(props || {})); }
  function parseProps(wrap: Element): any {
    try { return JSON.parse(wrap.getAttribute('data-razor-props') || '{}'); }
    catch (_e) { return {}; }
  }

  function fetchAndRender(wrap: Element, formId: number, fieldKey: string, props: any): void {
    var slot = wrap.querySelector('.mfw-razor-slot') as HTMLElement | null;
    if (!slot) return;
    var formRoot = findFormRoot(wrap);

    // Defensive: friendly placeholder when neither a registry template
    // nor a custom inline source is configured.
    if (!props.templateName && !props.razorSource) {
      slot.innerHTML = '<div class="mfw-razor-placeholder">'
        + '<strong>Razor Widget</strong> — not configured yet.<br/>'
        + 'Open <em>Razor Studio</em> to pick a template, or have AI design a custom .razor for this field.'
        + '</div>';
      return;
    }

    function sendRender(sqlRows: any[]) {
      var payload: any = {
        templateName: props.templateName,
        parameters: props.parameters || {},
        widgetKey: fieldKey,
      };
      if (props.razorSource) payload.razorSource = props.razorSource;
      if (sqlRows && sqlRows.length) payload.sqlRows = sqlRows;

      jsonPost(getRazorRenderUrl(), payload, function (err, data) {
        if (err) {
          var status = err && err.status ? err.status : '?';
          var detail = err && err.payload && (err.payload.error || err.payload.hint) ? (err.payload.hint || err.payload.error) : '';
          // [v20260531-RazorErrorUX] Pull the structured compile errors out
          // of the server response (filter out CS1701 assembly-version
          // warnings — they're noise — and show the first 3 real errors
          // with line numbers so AI/host can fix the source quickly).
          var errsHtml = '';
          if (err.payload && Array.isArray(err.payload.errors)) {
            var real = err.payload.errors.filter(function (e: any) {
              return e && e.severity === 'error' && e.code !== 'CS1701';
            });
            if (real.length) {
              errsHtml = '<ul style="margin:6px 0 0 18px;padding:0;font-size:11px;line-height:1.5">'
                + real.slice(0, 3).map(function (e: any) {
                  return '<li><strong>L' + (e.line || '?') + ' C' + (e.column || '?') + ' [' + (e.code || '') + ']</strong>: ' + esc(e.message || '') + '</li>';
                }).join('')
                + (real.length > 3 ? '<li style="color:#94a3b8">+ ' + (real.length - 3) + ' more error(s) — see Razor Studio for the rest</li>' : '')
                + '</ul>';
            }
          }
          slot.innerHTML = '<div class="mfw-razor-error"><strong>Razor render failed</strong> (HTTP ' + esc(status) + ')' + (detail ? ' — ' + esc(detail) : '') + errsHtml + '</div>';
          return;
        }
        if (!data || typeof data.html !== 'string') {
          slot.innerHTML = '<div class="mfw-razor-error">Empty Razor response.</div>';
          return;
        }
        slot.innerHTML = data.html;
        bindRowActions(slot, formId, fieldKey, props);

        if (data.emitsValue && data.value != null) {
          var h = ensureHiddenInput(wrap, fieldKey);
          try { h.value = typeof data.value === 'string' ? data.value : JSON.stringify(data.value); }
          catch (_e) { h.value = String(data.value); }
        }
      });
    }

    if (props.useSql && props.masterQuery) {
      var depValues = collectDeps(formRoot, props.queryDependsOn);
      fetchSqlRows(formId, fieldKey, depValues, function (_e, rows) { sendRender(rows || []); });
    } else {
      sendRender([]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  CRUD row-action bridge — EditableList + MasterDetailList
  // ─────────────────────────────────────────────────────────────────────

  function getActionUrl(): string {
    var base = getApiBase();
    if (/\/api\/MegaForm\//i.test(base) || /\/api\/MegaFormPopup\//i.test(base)) {
      return base.replace(/\/api\/.*$/i, '') + '/api/MegaFormPopup/RazorWidget/Action';
    }
    return base + 'RazorWidget/Action';
  }

  function readRowData(tr: Element): any {
    var out: any = {};
    var tds = tr.querySelectorAll('td[data-mf-col]');
    for (var i = 0; i < tds.length; i++) {
      var k = String(tds[i].getAttribute('data-mf-col') || '');
      if (k) out[k] = String((tds[i] as HTMLElement).innerText || '').trim();
    }
    var rid = String(tr.getAttribute('data-mf-row-id') || '');
    if (rid) out.__rowId = rid;
    return out;
  }

  function bindRowActions(slot: HTMLElement, formId: number, fieldKey: string, props: any): void {
    var buttons = slot.querySelectorAll('[data-mf-razor-action]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i] as HTMLElement;
      if ((btn as any).__mfActionBound) continue;
      (btn as any).__mfActionBound = true;
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var b = e.currentTarget as HTMLElement;
        var action = String(b.getAttribute('data-mf-razor-action') || '');
        var rowId  = String(b.getAttribute('data-mf-row-id') || '');
        handleRowAction(action, rowId, b, slot, formId, fieldKey, props);
      });
    }
  }

  function handleRowAction(action: string, rowId: string, btn: HTMLElement, slot: HTMLElement, formId: number, fieldKey: string, props: any): void {
    if (action === 'loadDetail') {
      // MasterDetailList expand
      var pid = String(btn.getAttribute('data-mf-parent-id') || '');
      var box = slot.querySelector('[data-mf-detail-slot="' + pid.replace(/"/g, '\\"') + '"]') as HTMLElement | null;
      if (!box) return;
      if (box.classList.contains('is-open')) {
        box.classList.remove('is-open'); btn.classList.remove('is-expanded'); return;
      }
      box.classList.add('is-open'); btn.classList.add('is-expanded');
      box.innerHTML = '<em style="color:#94a3b8;font-size:11px">Loading…</em>';
      var parts = ['formId=' + encodeURIComponent(String(formId)), 'widgetKey=' + encodeURIComponent(fieldKey), 'parentId=' + encodeURIComponent(pid), 'level=1', 'page=1', 'pageSize=200'];
      var url = getApiBase() + 'DataRepeater/Query?' + parts.join('&');
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept', 'application/json');
      var t = getAuthToken(); if (t) xhr.setRequestHeader('Authorization', 'Bearer ' + t);
      var af = getAntiForgery(); if (af) xhr.setRequestHeader('RequestVerificationToken', af);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) { box.innerHTML = '<div class="mfw-razor-error">Detail load failed.</div>'; return; }
        try {
          var data = JSON.parse(xhr.responseText || '{}');
          var cols = (data.columns || data.Columns) || [];
          var rows = (data.rows || data.Rows) || [];
          if (!cols.length || !rows.length) { box.innerHTML = '<em style="color:#94a3b8;font-size:11px">No children.</em>'; return; }
          var ths = cols.map(function (c: any) { return '<th>' + esc(String(c.name || c.Name || '')) + '</th>'; }).join('');
          var trs = rows.map(function (r: any[]) { return '<tr>' + r.map(function (v) { return '<td>' + esc(String(v == null ? '' : v)) + '</td>'; }).join('') + '</tr>'; }).join('');
          box.innerHTML = '<table><thead><tr>' + ths + '</tr></thead><tbody>' + trs + '</tbody></table>';
        } catch (_e) { box.innerHTML = '<div class="mfw-razor-error">Bad response.</div>'; }
      };
      xhr.send();
      return;
    }

    if (action === 'delete') {
      if (!confirm('Delete this row?')) return;
      runWriteAction(action, rowId, null, slot, formId, fieldKey, props);
      return;
    }

    if (action === 'insert' || action === 'update') {
      var tr = btn.closest ? btn.closest('tr') : null;
      var seed = (action === 'update' && tr) ? readRowData(tr) : {};
      openInlineForm(action, rowId, seed, slot, formId, fieldKey, props);
      return;
    }
  }

  function openInlineForm(action: string, rowId: string, seed: any, slot: HTMLElement, formId: number, fieldKey: string, props: any): void {
    // Field list comes from widgetProps.actions[action].fields (csv)
    // or, when missing, the visible row columns + IdColumn.
    var wp     = props.widgetProps || props.parameters || {};
    var act    = (props.actions || {})[action] || {};
    var csv    = String(act.fields || '');
    var fields = csv.split(',').map(function (s: string) { return s.trim(); }).filter(Boolean);
    if (!fields.length && seed && typeof seed === 'object') {
      fields = Object.keys(seed).filter(function (k) { return k !== '__rowId'; });
    }
    if (!fields.length) {
      alert('No fields configured for ' + action + '. Set widgetProps.actions.' + action + '.fields.');
      return;
    }

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:2147483641;font-family:-apple-system,sans-serif';
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;padding:20px;border-radius:12px;width:min(420px,92vw);box-shadow:0 24px 60px rgba(2,6,23,.4)';
    var head = (action === 'insert' ? 'Add row' : 'Edit row');
    modal.innerHTML = '<h3 style="margin:0 0 14px;color:#0f172a;font-size:16px">' + head + '</h3>'
      + fields.map(function (f: string) {
          var v = seed && seed[f] != null ? String(seed[f]) : '';
          return '<div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#475569;font-weight:600;margin-bottom:4px">' + esc(f) + '</label>'
               + '<input type="text" name="' + esc(f) + '" value="' + esc(v) + '" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;box-sizing:border-box" /></div>';
        }).join('')
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
      + '<button data-cancel style="padding:7px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;cursor:pointer">Cancel</button>'
      + '<button data-ok style="padding:7px 14px;border:0;background:#7c3aed;color:#fff;border-radius:6px;cursor:pointer;font-weight:600">Save</button>'
      + '</div>';
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) document.body.removeChild(overlay); });
    (modal.querySelector('[data-cancel]') as HTMLElement).addEventListener('click', function () { document.body.removeChild(overlay); });
    (modal.querySelector('[data-ok]') as HTMLElement).addEventListener('click', function () {
      var bag: any = {};
      var inputs = modal.querySelectorAll('input[name]');
      for (var i = 0; i < inputs.length; i++) {
        var ip = inputs[i] as HTMLInputElement;
        bag[ip.name] = ip.value;
      }
      document.body.removeChild(overlay);
      runWriteAction(action, rowId, bag, slot, formId, fieldKey, props);
    });
  }

  function runWriteAction(action: string, rowId: string, formValues: any, slot: HTMLElement, formId: number, fieldKey: string, props: any): void {
    var act = (props.actions || {})[action] || {};
    if (!act.sql) {
      alert('No SQL configured for action "' + action + '". Set widgetProps.actions.' + action + '.sql.');
      return;
    }
    var bag: any = formValues ? Object.assign({}, formValues) : {};
    if (rowId) {
      // Convention: id parameter binds via the IdColumn name or a default ":Id"
      var idKey = String((props.parameters && (props.parameters.idColumn || props.parameters.IdColumn)) || 'Id');
      bag[idKey] = rowId;
    }
    var payload = {
      actionSql: act.sql,
      parameters: bag,
      connectionKey: props.connectionKey || 'DashboardDatabase',
    };
    jsonPost(getActionUrl(), payload, function (err, data) {
      if (err) {
        var msg = err && err.payload && err.payload.error ? err.payload.error : ('HTTP ' + (err && err.status));
        alert('Action "' + action + '" failed: ' + msg);
        return;
      }
      // Success → re-fetch data + re-render
      fetchAndRender(slot.parentElement as Element, formId, fieldKey, props);
    });
  }

  // Debounce wrapper so cascade re-renders aren't chatty
  function debounce(fn: any, ms: number): any {
    var t: any = null;
    return function () {
      var ctx = this, args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  function bindWatchers(wrap: Element, formId: number, fieldKey: string, props: any): void {
    var formRoot = findFormRoot(wrap);
    var deps = (props.dependsOn || []).concat(props.queryDependsOn || []);
    if (!deps.length) return;
    var run = debounce(function () { fetchAndRender(wrap, formId, fieldKey, props); }, 300);
    for (var i = 0; i < deps.length; i++) {
      var name = deps[i];
      var targets = formRoot.querySelectorAll('[name="' + name.replace(/"/g, '\\"') + '"]');
      for (var j = 0; j < targets.length; j++) {
        targets[j].addEventListener('change', run);
        targets[j].addEventListener('input', run);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Builder-side help
  // ─────────────────────────────────────────────────────────────────────

  function helpHtml(): string {
    return [
      '<div style="font-weight:700;color:#0f172a;margin-bottom:6px;">Razor Widget — server-rendered C# template</div>',
      '<div style="margin-bottom:10px;color:#334155;">Render a registered .razor template on the server (Blazor HtmlRenderer on Oqtane, classic Razor on DNN companion). Use this when the standard widgets can\'t express the layout: pivots, calendars from SQL, interactive calculators, map pickers, charts.</div>',
      '<div style="display:grid;gap:10px;color:#334155;font-size:13px;">',
      '<div><strong>Template name</strong>: required. Pick from the registered catalog (e.g. <code>SqlTablePivot</code>, <code>InteractiveCalculator</code>) or roll your own per Phase 1.5.</div>',
      '<div><strong>Parameters</strong>: JSON object whose keys match the template\'s <code>[Parameter]</code> property names (PascalCase). The server forwards these into the component.</div>',
      '<div><strong>useSql + masterQuery</strong>: when set, the widget fetches rows via DataRepeater first and passes them to the template as <code>SqlRows</code>. Add <code>:paramName</code> tokens to bind sibling fields.</div>',
      '<div><strong>dependsOn</strong>: comma-separated field keys. When any listed field changes, the widget re-renders (debounced 300ms). Use this for calculators that watch <code>item_qty</code>, <code>promo_discount</code>, etc.</div>',
      '<div><strong>Emit value</strong>: templates with <code>EmitsValue=true</code> push their result into a hidden input keyed by this field\'s name so the submission JSON carries it.</div>',
      '</div>'
    ].join('');
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Registration
  // ─────────────────────────────────────────────────────────────────────

  MegaFormWidgets.register('Razor', {
    meta: { label: 'Razor Widget', icon: 'fa-code', category: 'advanced', color: '#a855f7', defaultWidth: '100%' },
    defaults: {
      templateName: 'SqlTablePivot',
      parameters: {},
      useSql: false,
      connectionKey: 'DashboardDatabase',
      masterQuery: '',
      dependsOn: '',
      queryDependsOn: '',
      reloadOnParamChange: true,
      placeholder: 'Loading Razor template…',
      cssClass: ''
    },
    properties: [
      { key: '__razorHelp', label: 'Razor Widget Help', type: 'help', buttonLabel: 'About Razor widgets', html: helpHtml() },
      { key: 'templateName', label: 'Template name', type: 'text', default: 'SqlTablePivot' },
      { key: 'parameters', label: 'Template parameters (JSON object)', type: 'textarea', default: '{}', placeholder: '{"RowGroupColumn":"Region","ColGroupColumn":"Category"}' },
      { key: 'useSql', label: 'Pre-fetch SQL rows + pass to template', type: 'checkbox', default: false },
      { key: 'connectionKey', label: 'Connection Name', type: 'text', default: 'DashboardDatabase' },
      { key: 'masterQuery', label: 'SQL query', type: 'textarea', default: '' },
      { key: 'queryDependsOn', label: 'SQL param fields (comma-separated)', type: 'text', default: '' },
      { key: 'dependsOn', label: 'Re-render when these fields change (comma-separated)', type: 'text', default: '' },
      { key: 'reloadOnParamChange', label: 'Reload when params change', type: 'checkbox', default: true },
      { key: 'cssClass', label: 'CSS class', type: 'text', default: '' }
    ],
    render: function (field: any, formId: number) {
      var props = getProps(field);
      // parameters may arrive as JSON string from the property textarea — normalize.
      if (typeof field.widgetProps?.parameters === 'string') {
        try { props.parameters = JSON.parse(field.widgetProps.parameters || '{}'); } catch (_) { props.parameters = {}; }
      }
      var id = 'mf-' + formId + '-' + field.key + '-razor';
      return '<div class="mfw-razor-wrap ' + attr(props.cssClass) + '" id="' + attr(id) + '"'
        + ' data-badge="' + attr(BADGE) + '"'
        + ' data-formid="' + attr(formId) + '"'
        + ' data-field-key="' + attr(field.key) + '"'
        + ' data-razor-props="' + encodeProps(props) + '">'
        + '<div class="mfw-razor-slot">' + esc(props.placeholder || '') + '</div>'
        + '</div>';
    },
    bind: function (formId: number) {
      var wraps = document.querySelectorAll('.mfw-razor-wrap');
      for (var i = 0; i < wraps.length; i++) {
        var w = wraps[i];
        if ((w as any).__mfRazorBound) continue;
        (w as any).__mfRazorBound = true;
        var fieldKey = String(w.getAttribute('data-field-key') || '');
        var props = parseProps(w);
        // Re-parse parameters if it slipped through as a JSON-string
        if (typeof props.parameters === 'string') {
          try { props.parameters = JSON.parse(props.parameters || '{}'); } catch (_) { props.parameters = {}; }
        }
        bindWatchers(w, formId, fieldKey, props);
        fetchAndRender(w, formId, fieldKey, props);
      }
    },
    collect: function (_field: any, wrap?: Element) {
      // Submission value comes from the hidden input that the emit bridge
      // populates (when the template emits). If no emit, return empty.
      if (!wrap) return '';
      var h = wrap.querySelector('input[type="hidden"][data-razor-emit="1"]') as HTMLInputElement | null;
      return h ? String(h.value || '') : '';
    },
    validate: function () { return true; }
  });

  // Expose internals for the Builder template picker + Razor Studio
  (global as any).MFRazorWidget = {
    badge: BADGE,
    listUrl: getRazorListUrl,
    renderUrl: getRazorRenderUrl,
    refresh: function (wrap: Element) {
      var formId = parseInt(String(wrap.getAttribute('data-formid') || '0'), 10) || 0;
      var fieldKey = String(wrap.getAttribute('data-field-key') || '');
      fetchAndRender(wrap, formId, fieldKey, parseProps(wrap));
    },
  };

  // ─────────────────────────────────────────────────────────────────────
  //  [B62-HardCutover] legacy launcher disabled forever; unified designer is the only entry point.
  //  No DOM scan, no MutationObserver, no `.mfrz-studio-launcher` button.
  //  Verified 2026-06-03: the source file contains ZERO calls to
  //  createElement('button'), insertBefore, or appendChild for canvas cards.
  //  The unified launcher is shipped exclusively by megaform-razor-launcher.ts.
  //  [B59 verified] No legacy launcher injection — sole entry point is
  //  the "Open Unified Designer" button shipped by megaform-razor-launcher.ts.
  //  [B53 hard cutover — entry consolidation]
  //  REMOVED: the legacy "Razor Studio" button injector.
  //
  //  Per the B53 user decision (Q1 = HARD CUTOVER), the Razor widget now
  //  has a SINGLE entry point in the Builder canvas: the "Open Unified
  //  Designer" button shipped by `megaform-razor-launcher.ts`. The Razor
  //  Studio surface lives INSIDE the unified shell as the "Recipe" tab
  //  (mountRazorRecipe → MFRazorStudio.open under the hood). Keeping two
  //  buttons doing related things was confusing per the scout report.
  //
  //  The MFRazorStudio bundle still exposes `window.MFRazorStudio.open()`
  //  for the recipe tab adapter; only the canvas-card button injection
  //  has been removed. Any external callers that relied on
  //  `.mfrz-studio-launcher` should switch to `.mfrz-unified-launcher`
  //  (the new sole entry-point class).
  // ─────────────────────────────────────────────────────────────────────
})(typeof window !== 'undefined' ? window : (this as any));
