/**
 * MegaForm MultiColumnCombo Widget
 * Badge: MultiColumnCombo v20260603-B54
 *
 * Multi-column dropdown / combobox.
 *  - Static options or SQL-backed (uses the same DataRepeater endpoint as
 *    DynamicLabel; query lives server-side, client sends formId + widgetKey
 *    + parameter values).
 *  - Configurable columns with per-column width (%, px, or fr).
 *  - Type-ahead search filters every visible column.
 *  - Selection returns the row's `displayKey` value (defaulting to 'name')
 *    so the form payload stays a flat string.
 *
 * Ported in spirit from the React reference at
 *   E:/MENU SPECS/form-builder-controls/components/megaform/multi-column-combo-box/index.tsx
 * but rewritten as a vanilla IIFE matching the MegaForm widget plugin
 * contract (meta / properties / render / bind / collect / validate).
 */

(function (global: any) {
  'use strict';

  var BADGE = 'MultiColumnCombo v20260603-B54';
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

  function safeJsonParse(text: any, fallback: any): any {
    try {
      var raw = String(text == null ? '' : text).trim();
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_e) { return fallback; }
  }

  // Normalise the widgetProps bag — coerce strings into the structured
  // shapes the runtime expects (columns[], options[]).
  function getProps(field: any): any {
    var wp = field && (field.widgetProps || field.WidgetProps) ? (field.widgetProps || field.WidgetProps) : {};
    var dataSource = String(wp.dataSource || 'static');
    var columnsParsed = Array.isArray(wp.columns) ? wp.columns : safeJsonParse(wp.columnsJson || wp.columns, []);
    if (!Array.isArray(columnsParsed) || !columnsParsed.length) {
      columnsParsed = [
        { key: 'name', label: 'Name', width: '60%' },
        { key: 'position', label: 'Position', width: '40%' }
      ];
    }
    var optionsParsed = Array.isArray(wp.options) ? wp.options : safeJsonParse(wp.optionsJson || wp.options, []);
    return {
      dataSource: dataSource === 'sql' ? 'sql' : 'static',
      displayKey: String(wp.displayKey || 'name'),
      valueKey: String(wp.valueKey || wp.displayKey || 'name'),
      columns: columnsParsed,
      options: Array.isArray(optionsParsed) ? optionsParsed : [],
      placeholder: String(wp.placeholder || 'Select an option...'),
      searchable: toBool(wp.searchable, true),
      searchPlaceholder: String(wp.searchPlaceholder || 'Search...'),
      // SQL-backed mode mirrors DynamicLabel — query is server-stored, client
      // just supplies formId/widgetKey/parameter values.
      masterQuery: String(wp.masterQuery || ''),
      connectionKey: String(wp.connectionKey || 'DashboardDatabase'),
      databaseType: String(wp.databaseType || ''),
      queryDependsOn: String(wp.queryDependsOn || ''),
      maxRows: parseInt(String(wp.maxRows || '500'), 10) || 500,
      cssClass: String(wp.cssClass || '')
    };
  }

  function encodeProps(props: any): string {
    return attr(JSON.stringify(props || {}));
  }

  function parseProps(wrap: Element): any {
    try {
      return JSON.parse(wrap.getAttribute('data-mfc-props') || '{}');
    } catch (_e) { return {}; }
  }

  function gridTemplate(columns: any[]): string {
    var parts: string[] = [];
    for (var i = 0; i < columns.length; i++) {
      var w = String((columns[i] && columns[i].width) || '').trim();
      if (!w) w = '1fr';
      parts.push(w);
    }
    return parts.join(' ');
  }

  function renderRowHtml(row: any, columns: any[], selectedValue: string, valueKey: string): string {
    var rowVal = row && row[valueKey] != null ? String(row[valueKey]) : '';
    var sel = String(selectedValue) === rowVal;
    var html = '<li class="mfc-row' + (sel ? ' is-selected' : '') + '" role="option" aria-selected="' + (sel ? 'true' : 'false') + '" data-value="' + esc(rowVal) + '">';
    for (var c = 0; c < columns.length; c++) {
      var col = columns[c] || {};
      var v = row && row[col.key] != null ? row[col.key] : '';
      html += '<span class="mfc-cell">' + esc(v) + '</span>';
    }
    html += '</li>';
    return html;
  }

  function applyGridStyles(panel: HTMLElement, columns: any[]): void {
    var template = gridTemplate(columns);
    var header = panel.querySelector('.mfc-header') as HTMLElement | null;
    if (header) header.style.gridTemplateColumns = template;
    var rows = panel.querySelectorAll('.mfc-row');
    for (var i = 0; i < rows.length; i++) {
      (rows[i] as HTMLElement).style.gridTemplateColumns = template;
    }
  }

  function filterRows(options: any[], term: string, columns: any[]): any[] {
    var trimmed = String(term || '').trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter(function (opt) {
      for (var c = 0; c < columns.length; c++) {
        var key = columns[c] && columns[c].key;
        if (!key) continue;
        var v = opt && opt[key] != null ? String(opt[key]).toLowerCase() : '';
        if (v.indexOf(trimmed) >= 0) return true;
      }
      return false;
    });
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

  function loadSqlRows(formId: number | string, widgetKey: string, props: any, onOk: (rows: any[]) => void, onErr: () => void): void {
    var params = '?formId=' + encodeURIComponent(String(formId)) + '&widgetKey=' + encodeURIComponent(String(widgetKey)) + '&pageSize=' + props.maxRows;
    var url = getApiBase() + 'DataRepeater/Rows' + params;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var payload = JSON.parse(xhr.responseText || '{}');
          var rows = Array.isArray(payload.rows) ? payload.rows : (Array.isArray(payload.Rows) ? payload.Rows : []);
          onOk(rows);
        } catch (_e) { onErr(); }
      } else onErr();
    };
    xhr.onerror = onErr;
    xhr.send();
  }

  function render(field: any, formId: number | string, val: string): string {
    var props = getProps(field);
    var id = 'mf-' + formId + '-' + (field && field.key ? field.key : 'mfc');
    var rendered = '<div class="mfw-multicolumn-combo' + (props.cssClass ? ' ' + esc(props.cssClass) : '') + '" id="' + id + '-wrap" data-field-key="' + esc(field && field.key ? field.key : '') + '" data-form-id="' + esc(String(formId)) + '" data-mfc-props="' + encodeProps(props) + '">';
    rendered += '  <div class="mfc-trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox" tabindex="0">';
    rendered += '    <div class="mfc-display" data-mfc-display>' + esc(props.placeholder) + '</div>';
    rendered += '    <button type="button" class="mfc-clear" data-mfc-clear hidden aria-label="Clear">&times;</button>';
    rendered += '    <span class="mfc-caret" aria-hidden="true">&#9662;</span>';
    rendered += '  </div>';
    rendered += '  <div class="mfc-panel" hidden role="listbox">';
    if (props.searchable) {
      rendered += '    <div class="mfc-search">';
      rendered += '      <input type="text" class="mfc-search-input" data-mfc-search placeholder="' + esc(props.searchPlaceholder) + '" autocomplete="off">';
      rendered += '    </div>';
    }
    rendered += '    <div class="mfc-header" role="row">';
    for (var c = 0; c < props.columns.length; c++) {
      var col = props.columns[c] || {};
      rendered += '<span class="mfc-cell mfc-header-cell" role="columnheader">' + esc(col.label || col.key || '') + '</span>';
    }
    rendered += '    </div>';
    rendered += '    <ul class="mfc-rows" data-mfc-rows role="presentation"></ul>';
    rendered += '    <div class="mfc-empty" data-mfc-empty hidden>No options match.</div>';
    rendered += '  </div>';
    rendered += '  <input type="hidden" name="' + esc(field && field.key ? field.key : '') + '" id="' + id + '" value="' + esc(val || '') + '">';
    rendered += '</div>';
    return rendered;
  }

  function findSelectedOption(options: any[], value: string, valueKey: string): any {
    if (!value) return null;
    for (var i = 0; i < options.length; i++) {
      if (options[i] && String(options[i][valueKey]) === String(value)) return options[i];
    }
    return null;
  }

  function renderRowsInto(wrap: HTMLElement, options: any[], filtered: any[], props: any): void {
    var rowsHost = wrap.querySelector('[data-mfc-rows]') as HTMLElement | null;
    var emptyEl = wrap.querySelector('[data-mfc-empty]') as HTMLElement | null;
    var hidden = wrap.querySelector('input[type="hidden"]') as HTMLInputElement | null;
    if (!rowsHost) return;
    var selected = hidden ? hidden.value : '';
    var template = gridTemplate(props.columns);
    var html = '';
    for (var i = 0; i < filtered.length; i++) html += renderRowHtml(filtered[i], props.columns, selected, props.valueKey);
    rowsHost.innerHTML = html;
    // Apply per-row grid template since CSS modules aren't available.
    var rowEls = rowsHost.querySelectorAll('.mfc-row');
    for (var r = 0; r < rowEls.length; r++) (rowEls[r] as HTMLElement).style.gridTemplateColumns = template;
    if (emptyEl) {
      if (filtered.length === 0) emptyEl.removeAttribute('hidden');
      else emptyEl.setAttribute('hidden', 'hidden');
    }

    // Wire click → select row.
    for (var k = 0; k < rowEls.length; k++) {
      (function (rowEl: Element) {
        rowEl.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var val = rowEl.getAttribute('data-value') || '';
          if (hidden) hidden.value = val;
          // Update display label.
          var sib = wrap.querySelector('[data-mfc-display]') as HTMLElement | null;
          var opt = findSelectedOption(options, val, props.valueKey);
          if (sib) {
            if (opt && opt[props.displayKey] != null) sib.textContent = String(opt[props.displayKey]);
            else sib.textContent = val;
            sib.classList.add('is-filled');
          }
          // Toggle clear button.
          var clr = wrap.querySelector('[data-mfc-clear]') as HTMLElement | null;
          if (clr) clr.removeAttribute('hidden');
          // Mark row.
          for (var m = 0; m < rowEls.length; m++) {
            rowEls[m].classList.remove('is-selected');
            rowEls[m].setAttribute('aria-selected', 'false');
          }
          rowEl.classList.add('is-selected');
          rowEl.setAttribute('aria-selected', 'true');
          // Close panel.
          var pane = wrap.querySelector('.mfc-panel') as HTMLElement | null;
          if (pane) pane.setAttribute('hidden', 'hidden');
          var trig = wrap.querySelector('.mfc-trigger') as HTMLElement | null;
          if (trig) trig.setAttribute('aria-expanded', 'false');
          wrap.classList.remove('is-open');
        });
      })(rowEls[k]);
    }
  }

  function bind(_formId: number | string): void {
    var wraps = document.querySelectorAll('.mfw-multicolumn-combo');
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i] as HTMLElement;
      if ((wrap as any)._mfcBound) continue;
      (wrap as any)._mfcBound = true;

      var props = parseProps(wrap);
      // Normalise columns/options after JSON round-trip.
      if (!Array.isArray(props.columns) || !props.columns.length) {
        props.columns = [{ key: props.displayKey || 'name', label: 'Name', width: '100%' }];
      }
      if (!Array.isArray(props.options)) props.options = [];

      var hidden = wrap.querySelector('input[type="hidden"]') as HTMLInputElement | null;
      var trig = wrap.querySelector('.mfc-trigger') as HTMLElement | null;
      var pane = wrap.querySelector('.mfc-panel') as HTMLElement | null;
      var searchInput = wrap.querySelector('[data-mfc-search]') as HTMLInputElement | null;
      var displayEl = wrap.querySelector('[data-mfc-display]') as HTMLElement | null;
      var clearBtn = wrap.querySelector('[data-mfc-clear]') as HTMLElement | null;

      var options = props.options || [];
      var renderRows = function (term: string) {
        var filtered = filterRows(options, term, props.columns);
        renderRowsInto(wrap, options, filtered, props);
        applyGridStyles(wrap, props.columns);
      };

      var loadAndRender = function () {
        if (props.dataSource === 'sql' && props.masterQuery) {
          var formId = wrap.getAttribute('data-form-id') || '0';
          var widgetKey = wrap.getAttribute('data-field-key') || '';
          loadSqlRows(formId, widgetKey, props, function (rows) {
            options = rows;
            renderRows(searchInput ? searchInput.value : '');
          }, function () {
            // On error, just show the configured static fallback (could be empty).
            renderRows(searchInput ? searchInput.value : '');
          });
        } else {
          renderRows(searchInput ? searchInput.value : '');
        }
      };

      var setOpen = function (open: boolean) {
        if (!pane || !trig) return;
        if (open) {
          pane.removeAttribute('hidden');
          trig.setAttribute('aria-expanded', 'true');
          wrap.classList.add('is-open');
          if (searchInput) try { searchInput.focus(); } catch (_e) {}
        } else {
          pane.setAttribute('hidden', 'hidden');
          trig.setAttribute('aria-expanded', 'false');
          wrap.classList.remove('is-open');
        }
      };

      if (trig) trig.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var willOpen = pane && pane.hasAttribute('hidden');
        if (willOpen) loadAndRender();
        setOpen(!!willOpen);
      });
      if (trig) trig.addEventListener('keydown', function (ev: KeyboardEvent) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          var willOpen = pane && pane.hasAttribute('hidden');
          if (willOpen) loadAndRender();
          setOpen(!!willOpen);
        } else if (ev.key === 'Escape') setOpen(false);
      });

      if (searchInput) searchInput.addEventListener('input', function () {
        renderRows(searchInput!.value);
      });

      if (clearBtn) clearBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (hidden) hidden.value = '';
        if (displayEl) { displayEl.textContent = props.placeholder; displayEl.classList.remove('is-filled'); }
        clearBtn!.setAttribute('hidden', 'hidden');
      });

      document.addEventListener('click', function (ev) {
        var target = ev.target as Node | null;
        if (!pane || pane.hasAttribute('hidden')) return;
        if (target && wrap.contains(target)) return;
        setOpen(false);
      });

      // Initial hydration of the display label if a value is preset.
      if (hidden && hidden.value && options.length) {
        var opt = findSelectedOption(options, hidden.value, props.valueKey);
        if (opt && displayEl) {
          displayEl.textContent = String(opt[props.displayKey] != null ? opt[props.displayKey] : hidden.value);
          displayEl.classList.add('is-filled');
        }
        if (clearBtn) clearBtn.removeAttribute('hidden');
      }
    }
  }

  function collect(key: string, container: Element): string {
    var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
    return el ? String(el.value || '') : '';
  }

  function validate(key: string, container: Element): boolean {
    // The form-level required check decides if empty is acceptable. We mirror
    // the standard "has value" gate here so the widget never blocks submissions
    // when not marked required.
    var el = container.querySelector('input[name="' + key + '"]') as HTMLInputElement | null;
    if (!el) return true;
    var wrap = container.querySelector('.mfw-multicolumn-combo[data-field-key="' + key + '"]') as HTMLElement | null;
    var isRequired = !!(wrap && wrap.getAttribute('data-required') === 'true');
    if (!isRequired) return true;
    return !!String(el.value || '').trim();
  }

  MegaFormWidgets.register('MultiColumnCombo', {
    meta: { label: 'Multi-Column Combo', icon: 'fa-table', category: 'advanced' },
    badge: BADGE,
    defaults: {
      dataSource: 'static',
      displayKey: 'name',
      valueKey: 'name',
      columns: [
        { key: 'name', label: 'Name', width: '60%' },
        { key: 'position', label: 'Position', width: '40%' }
      ],
      options: [],
      placeholder: 'Select an option...',
      searchable: true,
      searchPlaceholder: 'Search...'
    },
    properties: [
      { key: 'dataSource', label: 'Data Source', type: 'select', options: [
        { label: 'Static options', value: 'static' },
        { label: 'SQL (DataRepeater endpoint)', value: 'sql' }
      ], default: 'static' },
      { key: 'displayKey', label: 'Display Key', type: 'text', default: 'name' },
      { key: 'valueKey', label: 'Value Key (defaults to display)', type: 'text', default: 'name' },
      { key: 'columns', label: 'Columns (JSON array)', type: 'textarea', default: '[{"key":"name","label":"Name","width":"60%"},{"key":"position","label":"Position","width":"40%"}]' },
      { key: 'options', label: 'Options (JSON array, static mode)', type: 'textarea', default: '[]' },
      { key: 'placeholder', label: 'Placeholder', type: 'text', default: 'Select an option...' },
      { key: 'searchable', label: 'Searchable', type: 'checkbox', default: true },
      { key: 'searchPlaceholder', label: 'Search Placeholder', type: 'text', default: 'Search...' },
      { key: 'masterQuery', label: 'SQL Master Query (sql mode)', type: 'textarea', default: '' },
      { key: 'connectionKey', label: 'Connection Key', type: 'text', default: 'DashboardDatabase' },
      { key: 'queryDependsOn', label: 'Query Depends On (CSV)', type: 'text', default: '' },
      { key: 'maxRows', label: 'Max Rows', type: 'number', default: 500 }
    ],
    render: render,
    bind: bind,
    collect: collect,
    validate: validate
  });
})(typeof window !== 'undefined' ? window : this);
