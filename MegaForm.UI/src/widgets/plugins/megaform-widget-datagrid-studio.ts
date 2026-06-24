/**
 * MegaForm DataGrid Studio — Umbraco-style configuration popup.
 *
 * Build:   tsc -p MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-datagrid-studio.js
 *
 * Mounts a modal popup that lets an admin configure every aspect of a
 * DataGrid widget — Settings, Columns (CRUD with per-column editor),
 * Display Template (grid/card/master-detail) + image/title pickers,
 * and Data Bind (SQL connection / masterQuery / queryDependsOn).
 *
 * Edits write back to
 *   MegaFormBuilder.state.schema.fields[N].widgetProps
 * and call MegaFormBuilder.callModule('canvas','render') so the canvas
 * updates instantly.
 *
 * Auto-injects an "🛠 Open Studio" button into every DataGrid widget
 * preview inside the builder canvas (via a MutationObserver, since the
 * canvas re-renders on every state change).
 *
 * Badge: DataGridStudio v20260531-01
 */

(function (global: any) {
  'use strict';

  var BADGE = 'DataGridStudio v20260531-R2-04';

  // ───────────────────────────────────────────────────────────────────
  //  Style injection — popup chrome + tabs + form rows
  // ───────────────────────────────────────────────────────────────────
  function injectStyles(): void {
    if (document.getElementById('mf-datagrid-studio-styles')) return;
    var css =
      '.mf-dgs-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483640;display:flex;align-items:center;justify-content:center;padding:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}' +
      '.mf-dgs-modal{background:#fff;border-radius:14px;width:980px;max-width:100%;max-height:90vh;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,.3);display:flex;flex-direction:column}' +
      '.mf-dgs-head{padding:14px 20px;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;display:flex;align-items:center;gap:12px;font-weight:700;font-size:15px}' +
      '.mf-dgs-head .mf-dgs-badge{margin-left:auto;font-size:10px;letter-spacing:.08em;text-transform:uppercase;background:rgba(255,255,255,.18);padding:3px 9px;border-radius:999px}' +
      '.mf-dgs-head .mf-dgs-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;line-height:1}' +
      '.mf-dgs-tabs{display:flex;border-bottom:1px solid #e2e8f0;background:#f8fafc;padding:0 14px}' +
      '.mf-dgs-tab{padding:11px 16px;font-size:13px;font-weight:600;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;background:transparent;border-left:0;border-right:0;border-top:0}' +
      '.mf-dgs-tab.is-active{color:#4f46e5;border-bottom-color:#6366f1;background:#fff}' +
      '.mf-dgs-tab:hover:not(.is-active){background:#eef2ff;color:#0f172a}' +
      '.mf-dgs-body{padding:18px 22px;overflow:auto;flex:1;background:#fff}' +
      '.mf-dgs-panel{display:none}' +
      '.mf-dgs-panel.is-active{display:block}' +
      '.mf-dgs-row{display:grid;grid-template-columns:200px 1fr;gap:14px;align-items:start;margin-bottom:12px}' +
      '.mf-dgs-label{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;padding-top:7px}' +
      '.mf-dgs-label .mf-dgs-hint{display:block;font-weight:400;font-size:10px;color:#94a3b8;text-transform:none;letter-spacing:0;margin-top:2px;line-height:1.4}' +
      '.mf-dgs-control input,.mf-dgs-control select,.mf-dgs-control textarea{width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:13px;background:#fff;color:#0f172a;box-sizing:border-box}' +
      '.mf-dgs-control input:focus,.mf-dgs-control select:focus,.mf-dgs-control textarea:focus{outline:0;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}' +
      '.mf-dgs-control textarea{font-family:Menlo,Consolas,monospace;font-size:12px;resize:vertical;min-height:64px}' +
      '.mf-dgs-control-check{display:flex;align-items:center;gap:7px;padding-top:7px;font-size:13px;color:#0f172a}' +
      '.mf-dgs-section-title{font-size:11px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.06em;padding:10px 0 6px;border-bottom:1px solid #e2e8f0;margin:18px 0 12px}' +
      '.mf-dgs-section-title:first-child{margin-top:0}' +
      /* Columns CRUD list */
      '.mf-dgs-cols{display:flex;flex-direction:column;gap:10px}' +
      '.mf-dgs-col{border:1px solid #e2e8f0;border-radius:8px;background:#fff;padding:0;overflow:hidden}' +
      '.mf-dgs-col-head{padding:9px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none}' +
      '.mf-dgs-col-handle{color:#cbd5e1;cursor:grab;font-size:14px}' +
      '.mf-dgs-col-title{font-weight:700;color:#0f172a;font-size:13px;flex:1}' +
      '.mf-dgs-col-type{font-size:10px;background:#eef2ff;color:#4f46e5;padding:2px 8px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}' +
      '.mf-dgs-col-actions{display:flex;gap:4px}' +
      '.mf-dgs-col-actions button{width:24px;height:24px;padding:0;border-radius:5px;background:#fff;border:1px solid #cbd5e1;cursor:pointer;font-size:12px;color:#475569}' +
      '.mf-dgs-col-actions button:hover{background:#eef2ff;color:#4f46e5;border-color:#a5b4fc}' +
      '.mf-dgs-col-actions button.is-danger:hover{background:#fef2f2;color:#dc2626;border-color:#fca5a5}' +
      '.mf-dgs-col-body{padding:12px;display:none;background:#fff;border-top:1px solid #e2e8f0;gap:10px;flex-direction:column}' +
      '.mf-dgs-col.is-expanded .mf-dgs-col-body{display:flex}' +
      '.mf-dgs-col.is-expanded .mf-dgs-col-handle{cursor:default}' +
      '.mf-dgs-col-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '.mf-dgs-col-grid label{display:flex;flex-direction:column;gap:3px;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em}' +
      '.mf-dgs-col-grid input,.mf-dgs-col-grid select,.mf-dgs-col-grid textarea{padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font:inherit;font-size:12px;text-transform:none;color:#0f172a}' +
      '.mf-dgs-col-grid textarea{grid-column:1/-1;font-family:Menlo,Consolas,monospace;font-size:11px;min-height:60px}' +
      '.mf-dgs-add-col{background:#fff;border:1px dashed #cbd5e1;border-radius:8px;padding:10px;color:#64748b;font-size:13px;cursor:pointer;width:100%;font-weight:600;transition:all .12s}' +
      '.mf-dgs-add-col:hover{background:#eef2ff;color:#4f46e5;border-color:#6366f1;border-style:solid}' +
      /* Footer */
      '.mf-dgs-foot{padding:14px 22px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:12px}' +
      '.mf-dgs-foot-meta{font-size:11px;color:#64748b}' +
      '.mf-dgs-foot-actions{display:flex;gap:8px}' +
      '.mf-dgs-foot button{padding:7px 16px;border-radius:7px;font:inherit;font-size:13px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;font-weight:600}' +
      '.mf-dgs-foot button.is-primary{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.mf-dgs-foot button.is-primary:hover{background:#4f46e5}' +
      '.mf-dgs-foot button:hover:not(.is-primary){background:#eef2ff}' +
      /* [v20260531-03] Hide any leftover .mf-dgs-launcher elements that a
         cached v01 of this plugin may have injected directly into the
         runtime DataGrid wrap on the public form — defensive belt while
         the JS purge code (purgeStaleRuntimeLaunchers) also removes them. */
      '.mf-dgs-launcher{display:none !important}';
    var s = document.createElement('style');
    s.id = 'mf-datagrid-studio-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ───────────────────────────────────────────────────────────────────
  //  State helpers
  // ───────────────────────────────────────────────────────────────────
  function esc(s: any): string { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function getBuilder(): any { return (global as any).MegaFormBuilder; }

  function findField(fieldKey: string): { idx: number; field: any } | null {
    var b = getBuilder();
    if (!b || !b.state || !b.state.schema || !Array.isArray(b.state.schema.fields)) return null;
    var fields = b.state.schema.fields;
    function walk(arr: any[]): { idx: number; field: any } | null {
      for (var i = 0; i < arr.length; i++) {
        var f = arr[i];
        if (f && f.key === fieldKey) return { idx: i, field: f };
        // Row containers — recurse into columns[].fields[]
        if (f && Array.isArray(f.columns)) {
          for (var j = 0; j < f.columns.length; j++) {
            var col = f.columns[j];
            if (col && Array.isArray(col.fields)) {
              var nested = walk(col.fields);
              if (nested) return nested;
            }
          }
        }
      }
      return null;
    }
    return walk(fields);
  }

  function commit(field: any, mutate: () => void): void {
    var b = getBuilder();
    if (!field.widgetProps) field.widgetProps = {};
    mutate();
    if (b && b.state) b.state.isDirty = true;
    try { b && b.syncSchemaToHtmlImmediate && b.syncSchemaToHtmlImmediate({}); } catch (_e) { /* noop */ }
    // [v20260531-03] Refresh BOTH the canvas preview AND the right-side
    // Field properties panel. Without showProps the right panel's COLUMNS
    // JSON / DISPLAY TEMPLATE / table-name fields stay frozen on the
    // pre-edit values until the user re-clicks the field. Mirrors the
    // pattern in megaform-widget-razor.ts inject() onApplyProps callback.
    try { b && b.callModule && b.callModule('properties', 'showProps', [field]); } catch (_e) { /* noop */ }
    try { b && b.callModule && b.callModule('canvas', 'render', []); } catch (_e) { /* noop */ }
  }

  // ───────────────────────────────────────────────────────────────────
  //  Studio modal
  // ───────────────────────────────────────────────────────────────────
  var currentOverlay: HTMLElement | null = null;

  function open(fieldKey: string): void {
    injectStyles();
    if (currentOverlay) { currentOverlay.remove(); currentOverlay = null; }
    var sel = findField(fieldKey);
    if (!sel || !sel.field || (sel.field.type !== 'DataGrid' && sel.field.type !== 'datagrid')) {
      console.warn('DataGridStudio.open: field not found or not a DataGrid:', fieldKey);
      return;
    }
    var field = sel.field;
    var wp = field.widgetProps = field.widgetProps || {};
    if (!Array.isArray(wp.columns)) wp.columns = [];

    var overlay = document.createElement('div');
    overlay.className = 'mf-dgs-overlay';
    overlay.innerHTML =
      '<div class="mf-dgs-modal">' +
        '<div class="mf-dgs-head">' +
          '<span>🛠 DataGrid Studio</span>' +
          '<span style="font-weight:400;font-size:12px;opacity:.85">field: <code>' + esc(field.key) + '</code></span>' +
          '<span class="mf-dgs-badge">' + esc(BADGE) + '</span>' +
          '<button type="button" class="mf-dgs-close" data-mf-dgs-close title="Close">×</button>' +
        '</div>' +
        '<div class="mf-dgs-tabs">' +
          '<button type="button" class="mf-dgs-tab is-active" data-mf-dgs-tab="settings">Settings</button>' +
          '<button type="button" class="mf-dgs-tab" data-mf-dgs-tab="columns">Columns (<span data-mf-dgs-colcount>0</span>)</button>' +
          '<button type="button" class="mf-dgs-tab" data-mf-dgs-tab="template">Display Template</button>' +
          '<button type="button" class="mf-dgs-tab" data-mf-dgs-tab="bind">Data Bind</button>' +
        '</div>' +
        '<div class="mf-dgs-body">' +
          '<div class="mf-dgs-panel is-active" data-mf-dgs-panel="settings"></div>' +
          '<div class="mf-dgs-panel" data-mf-dgs-panel="columns"></div>' +
          '<div class="mf-dgs-panel" data-mf-dgs-panel="template"></div>' +
          '<div class="mf-dgs-panel" data-mf-dgs-panel="bind"></div>' +
        '</div>' +
        '<div class="mf-dgs-foot">' +
          '<div class="mf-dgs-foot-meta">Changes save instantly. Close when done.</div>' +
          '<div class="mf-dgs-foot-actions">' +
            '<button type="button" data-mf-dgs-close>Close</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Close handlers
    overlay.querySelectorAll('[data-mf-dgs-close]').forEach(function (b: any) {
      b.addEventListener('click', function () { overlay.remove(); currentOverlay = null; });
    });
    overlay.addEventListener('click', function (e: any) { if (e.target === overlay) { overlay.remove(); currentOverlay = null; } });

    // Tabs
    overlay.querySelectorAll('.mf-dgs-tab').forEach(function (t: any) {
      t.addEventListener('click', function () {
        overlay.querySelectorAll('.mf-dgs-tab').forEach(function (x: any) { x.classList.remove('is-active'); });
        overlay.querySelectorAll('.mf-dgs-panel').forEach(function (x: any) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        var key = t.getAttribute('data-mf-dgs-tab');
        var panel = overlay.querySelector('[data-mf-dgs-panel="' + key + '"]');
        if (panel) panel.classList.add('is-active');
      });
    });

    renderSettings(overlay, field);
    renderColumns(overlay, field);
    renderTemplate(overlay, field);
    renderBind(overlay, field);
    updateColCount(overlay, field);
  }

  function updateColCount(overlay: HTMLElement, field: any): void {
    var c = (field.widgetProps && Array.isArray(field.widgetProps.columns)) ? field.widgetProps.columns.length : 0;
    var el = overlay.querySelector('[data-mf-dgs-colcount]');
    if (el) el.textContent = String(c);
  }

  // ── Settings panel ────────────────────────────────────────────────
  function renderSettings(overlay: HTMLElement, field: any): void {
    var panel = overlay.querySelector('[data-mf-dgs-panel="settings"]') as HTMLElement;
    var wp = field.widgetProps;
    panel.innerHTML =
      row('Field key',           inputCtrl('text', field.key,                                            '(read-only)',                                'readonly')) +
      row('Field label',         inputCtrl('text', field.label || '',                                    'User-facing label',                          '', 'label')) +
      row('Storage table name',  inputCtrl('text', wp.tableName || '',                                   'leave blank for in-form-only storage',       '', 'tableName')) +
      row('Parent key column',   inputCtrl('text', wp.parentKeyColumn || '',                             'FK column on the child table, e.g. SupplierId', '', 'parentKeyColumn')) +
      row('Empty message',       inputCtrl('text', wp.emptyMessage || '',                                'shown when no rows yet',                     '', 'emptyMessage')) +
      row('Allow add row',       checkCtrl(wp.allowAdd !== false,    'allowAdd')) +
      row('Allow delete row',    checkCtrl(wp.allowDelete !== false, 'allowDelete')) +
      row('Sticky header',       checkCtrl(wp.stickyHeader !== false, 'stickyHeader')) +
      row('Edit mode',           selectCtrl(wp.editMode || 'inline', [['inline','Inline (in row)'], ['modal','Modal (popup)'], ['auto','Auto (>5 cols → modal)']], 'editMode')) +
      row('Row height',          selectCtrl(wp.rowHeight || 'normal', [['compact','Compact'], ['normal','Normal'], ['comfortable','Comfortable']], 'rowHeight')) +
      row('Min rows',            inputCtrl('number', String(wp.minRows || 0), '0 = no min', '', 'minRows')) +
      row('Max rows',            inputCtrl('number', String(wp.maxRows || 0), '0 = unlimited', '', 'maxRows')) +
      row('Total field key',     inputCtrl('text', wp.totalField || '',  'master field that receives the running total',  '', 'totalField')) +
      row('Total formula',       inputCtrl('text', wp.totalFormula || '', 'e.g. Sum("qty * price")',                       '', 'totalFormula'));

    wireInputs(panel, field, function (name, val) {
      if (name === 'label') field.label = val;
      else (field.widgetProps as any)[name] = val;
    });
    wireChecks(panel, field, function (name, val) { (field.widgetProps as any)[name] = val; });
  }

  // ── Columns panel ─────────────────────────────────────────────────
  function renderColumns(overlay: HTMLElement, field: any): void {
    var panel = overlay.querySelector('[data-mf-dgs-panel="columns"]') as HTMLElement;
    var cols = field.widgetProps.columns as any[];
    panel.innerHTML =
      '<div class="mf-dgs-section-title">Columns — drag to reorder, click row to expand</div>' +
      '<div class="mf-dgs-cols" data-mf-dgs-cols></div>' +
      '<button type="button" class="mf-dgs-add-col" data-mf-dgs-add-col>+ Add column</button>';

    var list = panel.querySelector('[data-mf-dgs-cols]') as HTMLElement;
    function paint() {
      list.innerHTML = cols.map(function (c, i) {
        return renderOneCol(c, i);
      }).join('');
      wireColumnRows();
      updateColCount(overlay, field);
    }

    function renderOneCol(c: any, idx: number): string {
      return (
        '<div class="mf-dgs-col" data-mf-dgs-col="' + idx + '">' +
          '<div class="mf-dgs-col-head" data-mf-dgs-col-toggle>' +
            '<span class="mf-dgs-col-handle">⋮⋮</span>' +
            '<span class="mf-dgs-col-title">' + esc(c.label || c.key || '(unnamed column)') + '</span>' +
            '<span class="mf-dgs-col-type">' + esc(c.type || 'text') + '</span>' +
            '<div class="mf-dgs-col-actions">' +
              '<button type="button" data-mf-dgs-col-up   title="Move up">▲</button>' +
              '<button type="button" data-mf-dgs-col-down title="Move down">▼</button>' +
              '<button type="button" data-mf-dgs-col-del class="is-danger" title="Delete">×</button>' +
            '</div>' +
          '</div>' +
          '<div class="mf-dgs-col-body">' +
            '<div class="mf-dgs-col-grid">' +
              '<label>Key<input type="text" data-mf-dgs-col-field="key" value="' + esc(c.key || '') + '" placeholder="snake_case_key"/></label>' +
              '<label>Label<input type="text" data-mf-dgs-col-field="label" value="' + esc(c.label || '') + '" /></label>' +
              '<label>Type<select data-mf-dgs-col-field="type">' +
                ['text','number','currency','date','select','computed','image']
                  .map(function (t) { return '<option value="' + t + '"' + ((c.type || 'text') === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
              '</select></label>' +
              '<label>Width<input type="text" data-mf-dgs-col-field="width" value="' + esc(c.width || '1fr') + '" placeholder="e.g. 120px or 2fr"/></label>' +
              '<label>Required<select data-mf-dgs-col-field="required"><option value="false"' + (!c.required ? ' selected' : '') + '>No</option><option value="true"' + (c.required ? ' selected' : '') + '>Yes</option></select></label>' +
              '<label>Decimals (number)<input type="number" data-mf-dgs-col-field="decimals" value="' + esc(c.decimals != null ? c.decimals : '') + '" placeholder="0 / 2"/></label>' +
              '<label>Placeholder<input type="text" data-mf-dgs-col-field="placeholder" value="' + esc(c.placeholder || '') + '" /></label>' +
              '<label>Compute formula (computed)<input type="text" data-mf-dgs-col-field="computeFormula" value="' + esc(c.computeFormula || '') + '" placeholder="e.g. qty * price"/></label>' +
              '<label style="grid-column:1/-1">SQL options (select-with-SQL)<textarea data-mf-dgs-col-field="optionsSql" placeholder="SELECT [Id] AS value, [Name] AS label FROM …">' + esc(c.optionsSql || '') + '</textarea></label>' +
              '<label>SQL connection (select-with-SQL)<input type="text" data-mf-dgs-col-field="optionsConnectionKey" value="' + esc(c.optionsConnectionKey || '') + '" placeholder="DashboardDatabase"/></label>' +
              '<label>Static options (one per line, value|label)<textarea data-mf-dgs-col-field="staticOptionsText" placeholder="active|Active&#10;archived|Archived">' + esc(serializeStaticOpts(c.options)) + '</textarea></label>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    function wireColumnRows() {
      list.querySelectorAll('[data-mf-dgs-col]').forEach(function (rowEl: any) {
        var idx = parseInt(rowEl.getAttribute('data-mf-dgs-col') || '0', 10);
        // toggle expand
        var head = rowEl.querySelector('[data-mf-dgs-col-toggle]');
        if (head) head.addEventListener('click', function (e: any) {
          if ((e.target as HTMLElement).closest('.mf-dgs-col-actions')) return;
          rowEl.classList.toggle('is-expanded');
        });
        // actions
        var up   = rowEl.querySelector('[data-mf-dgs-col-up]');
        var down = rowEl.querySelector('[data-mf-dgs-col-down]');
        var del  = rowEl.querySelector('[data-mf-dgs-col-del]');
        if (up)   up.addEventListener  ('click', function (e: any) { e.stopPropagation(); if (idx > 0) { var t = cols[idx]; cols[idx] = cols[idx - 1]; cols[idx - 1] = t; commit(field, function () { field.widgetProps.columns = cols; }); paint(); } });
        if (down) down.addEventListener('click', function (e: any) { e.stopPropagation(); if (idx < cols.length - 1) { var t = cols[idx]; cols[idx] = cols[idx + 1]; cols[idx + 1] = t; commit(field, function () { field.widgetProps.columns = cols; }); paint(); } });
        if (del)  del.addEventListener ('click', function (e: any) { e.stopPropagation(); if (!confirm('Delete column "' + (cols[idx].label || cols[idx].key) + '"?')) return; cols.splice(idx, 1); commit(field, function () { field.widgetProps.columns = cols; }); paint(); });

        // field edits
        rowEl.querySelectorAll('[data-mf-dgs-col-field]').forEach(function (inp: any) {
          var name = inp.getAttribute('data-mf-dgs-col-field') || '';
          inp.addEventListener('change', function () {
            var v: any = inp.value;
            if (name === 'required') v = inp.value === 'true';
            else if (name === 'decimals') v = inp.value === '' ? undefined : Number(inp.value);
            if (name === 'staticOptionsText') {
              cols[idx].options = parseStaticOpts(inp.value);
            } else if (v === '' || v === undefined) {
              delete (cols[idx] as any)[name];
            } else {
              (cols[idx] as any)[name] = v;
            }
            commit(field, function () { field.widgetProps.columns = cols; });
            // Update head title/type chip in place
            var titleEl = rowEl.querySelector('.mf-dgs-col-title'); if (titleEl) titleEl.textContent = cols[idx].label || cols[idx].key || '(unnamed column)';
            var typeEl  = rowEl.querySelector('.mf-dgs-col-type');  if (typeEl) typeEl.textContent  = cols[idx].type || 'text';
          });
        });
      });
    }

    panel.querySelector('[data-mf-dgs-add-col]')!.addEventListener('click', function () {
      cols.push({ key: 'col_' + (cols.length + 1), label: 'New column', type: 'text', width: '1fr' });
      commit(field, function () { field.widgetProps.columns = cols; });
      paint();
    });

    paint();
  }

  function serializeStaticOpts(opts: any): string {
    if (!Array.isArray(opts)) return '';
    return opts.map(function (o: any) {
      if (o && typeof o === 'object') return String(o.value || '') + '|' + String(o.label || o.value || '');
      return String(o);
    }).join('\n');
  }
  function parseStaticOpts(text: string): any[] {
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l !== ''; }).map(function (l) {
      var i = l.indexOf('|');
      if (i < 0) return { value: l, label: l };
      return { value: l.slice(0, i).trim(), label: l.slice(i + 1).trim() };
    });
  }

  // ── Template panel ────────────────────────────────────────────────
  function renderTemplate(overlay: HTMLElement, field: any): void {
    var panel = overlay.querySelector('[data-mf-dgs-panel="template"]') as HTMLElement;
    var wp = field.widgetProps;
    var cols = (wp.columns || []) as any[];
    var colOptions = '<option value="">— none —</option>' + cols.map(function (c: any) { return '<option value="' + esc(c.key) + '"' + ((wp.imageColumn === c.key || wp.titleColumn === c.key || wp.subtitleColumn === c.key) ? '' : '') + '>' + esc(c.label || c.key) + ' (' + esc(c.type) + ')</option>'; }).join('');
    panel.innerHTML =
      '<div class="mf-dgs-section-title">Display template</div>' +
      row('Template variant',  selectCtrl(wp.displayTemplate || 'grid', [['grid','Grid (table)'], ['card','Card (image cards)'], ['master-detail','Master-detail (collapsed rows)']], 'displayTemplate')) +
      '<div class="mf-dgs-section-title">Card / Master-detail bindings</div>' +
      row('Image column',     '<select data-mf-dgs-input="imageColumn">' + colOptionsWithSel(cols, wp.imageColumn) + '</select><div style="font-size:10px;color:#94a3b8;margin-top:4px">Used when displayTemplate=card. Pick a column of type "image".</div>') +
      row('Title column',     '<select data-mf-dgs-input="titleColumn">' + colOptionsWithSel(cols, wp.titleColumn) + '</select><div style="font-size:10px;color:#94a3b8;margin-top:4px">Big text in card / master-detail head.</div>') +
      row('Subtitle column',  '<select data-mf-dgs-input="subtitleColumn">' + colOptionsWithSel(cols, wp.subtitleColumn) + '</select><div style="font-size:10px;color:#94a3b8;margin-top:4px">Small grey text under the title.</div>');

    wireInputs(panel, field, function (name, val) { (field.widgetProps as any)[name] = val; });
  }
  function colOptionsWithSel(cols: any[], currentVal: string): string {
    var sel = String(currentVal || '');
    return '<option value=""' + (sel === '' ? ' selected' : '') + '>— none —</option>' + cols.map(function (c: any) {
      return '<option value="' + esc(c.key) + '"' + (sel === c.key ? ' selected' : '') + '>' + esc(c.label || c.key) + ' (' + esc(c.type || 'text') + ')</option>';
    }).join('');
  }

  // ── Bind panel ────────────────────────────────────────────────────
  function renderBind(overlay: HTMLElement, field: any): void {
    var panel = overlay.querySelector('[data-mf-dgs-panel="bind"]') as HTMLElement;
    var wp = field.widgetProps;
    var rl = (wp.rowLifecycle = wp.rowLifecycle || {});
    panel.innerHTML =
      '<div class="mf-dgs-section-title">Display-mode SQL (read-only grid driven by a query)</div>' +
      row('Use SQL display mode',  checkCtrl(!!wp.useSql, 'useSql')) +
      row('Connection key',        inputCtrl('text', wp.connectionKey || '', 'default DashboardDatabase', '', 'connectionKey')) +
      row('Master SELECT',         '<textarea data-mf-dgs-input="masterQuery" placeholder="SELECT col1, col2 FROM … WHERE foo = :param">' + esc(wp.masterQuery || '') + '</textarea>') +
      row('Parent field keys (CSV)', inputCtrl('text', String(wp.queryDependsOn || ''), 'e.g. player_id,round_id', '', 'queryDependsOn')) +
      row('Page size',             inputCtrl('number', String(wp.pageSize || 100), 'max rows fetched', '', 'pageSize')) +
      // [R2 LifecycleHooks v20260531-01] Lifecycle hooks section
      '<div class="mf-dgs-section-title">Lifecycle hooks (DataGrid row-scope)</div>' +
      '<div style="font-size:11px;color:#64748b;line-height:1.5;margin-bottom:10px">Pre/post hooks fire inside the submission transaction. Audit tokens auto-fill: <code>:_createdBy :_createdOn :_modifiedBy :_modifiedOn :_portalId :_ipAddress :_formId :_submissionId</code>. Batch fires once with <code>:rows</code> JSON; Row fires per row with field-key params.</div>' +
      hookRow('preInsert',  rl.preInsert)  +
      hookRow('postInsert', rl.postInsert) +
      hookRow('preDelete',  rl.preDelete);

    wireInputs(panel, field, function (name, val) { (field.widgetProps as any)[name] = val; });
    wireChecks(panel, field, function (name, val) { (field.widgetProps as any)[name] = val; });

    // Wire each lifecycle hook block
    ['preInsert','postInsert','preDelete'].forEach(function (slot) {
      var wrap = panel.querySelector('[data-mf-dgs-hook="' + slot + '"]') as HTMLElement;
      if (!wrap) return;
      wireHookBlock(wrap, field, slot, function (mutated) {
        commit(field, function () { (field.widgetProps.rowLifecycle as any)[slot] = mutated; });
      });
    });
  }

  function hookRow(slot: string, hook: any): string {
    var h = hook || {};
    return (
      '<div class="mf-dgs-hook" data-mf-dgs-hook="' + esc(slot) + '" style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fafbff">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<strong style="font-size:12px;color:#0f172a;text-transform:uppercase;letter-spacing:.05em">' + esc(slot) + '</strong>' +
          '<label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#475569"><input type="checkbox" data-mf-dgs-hookfield="enabled"' + (h.enabled ? ' checked' : '') + ' /> Enabled</label>' +
          '<select data-mf-dgs-hookfield="granularity" style="padding:3px 7px;font-size:11px;border-radius:5px;border:1px solid #cbd5e1">' +
            '<option value="batch"' + ((h.granularity || 'batch') === 'batch' ? ' selected' : '') + '>Batch (one call, :rows JSON)</option>' +
            '<option value="row"'   + (h.granularity === 'row'   ? ' selected' : '') + '>Row (per-row, field-key params)</option>' +
          '</select>' +
          '<select data-mf-dgs-hookfield="onFailure" style="padding:3px 7px;font-size:11px;border-radius:5px;border:1px solid #cbd5e1">' +
            '<option value="continue"' + ((h.onFailure || 'continue') === 'continue' ? ' selected' : '') + '>onFailure: continue</option>' +
            '<option value="abort"'    + (h.onFailure === 'abort'    ? ' selected' : '') + '>onFailure: abort (rollback)</option>' +
          '</select>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:140px 1fr;gap:6px;font-size:11px;margin-bottom:6px">' +
          '<label style="color:#475569;padding-top:5px">Connection</label>' +
          '<input type="text" data-mf-dgs-hookfield="connectionKey" value="' + esc(h.connectionKey || '') + '" placeholder="DashboardDatabase" style="padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px" />' +
        '</div>' +
        '<textarea data-mf-dgs-hookfield="sql" placeholder="INSERT INTO ... VALUES (:_submissionId, :field_key)" style="width:100%;min-height:60px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;font-family:Menlo,Consolas,monospace;font-size:11px">' + esc(h.sql || '') + '</textarea>' +
      '</div>'
    );
  }

  function wireHookBlock(wrap: HTMLElement, _field: any, _slot: string, onChange: (mutated: any) => void): void {
    function read(): any {
      function v(name: string): any {
        var el = wrap.querySelector('[data-mf-dgs-hookfield="' + name + '"]') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
        if (!el) return undefined;
        if ((el as HTMLInputElement).type === 'checkbox') return (el as HTMLInputElement).checked;
        return (el as any).value;
      }
      return {
        enabled:       !!v('enabled'),
        runtime:       'sql',
        granularity:   v('granularity') || 'batch',
        connectionKey: v('connectionKey') || '',
        sql:           v('sql') || '',
        parameterMapping: {},
        onFailure:     v('onFailure') || 'continue',
        order:         100,
      };
    }
    wrap.querySelectorAll('[data-mf-dgs-hookfield]').forEach(function (el: any) {
      var evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'change';
      el.addEventListener(evt, function () { onChange(read()); });
    });
  }

  // ── Generic row + control helpers ─────────────────────────────────
  function row(label: string, control: string): string {
    return '<div class="mf-dgs-row"><div class="mf-dgs-label">' + esc(label) + '</div><div class="mf-dgs-control">' + control + '</div></div>';
  }
  function inputCtrl(type: string, value: string, hint: string, extra: string, name?: string): string {
    var nameAttr = name ? ' data-mf-dgs-input="' + name + '"' : '';
    var attrs = type === 'number' ? '' : '';
    var hintHtml = hint ? '<div style="font-size:10px;color:#94a3b8;margin-top:4px">' + esc(hint) + '</div>' : '';
    return '<input type="' + type + '"' + nameAttr + ' value="' + esc(value) + '"' + (extra === 'readonly' ? ' readonly' : '') + ' />' + hintHtml;
  }
  function selectCtrl(value: string, options: Array<[string, string]>, name: string): string {
    return '<select data-mf-dgs-input="' + name + '">' + options.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (value === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select>';
  }
  function checkCtrl(checked: boolean, name: string): string {
    return '<label class="mf-dgs-control-check"><input type="checkbox" data-mf-dgs-check="' + name + '"' + (checked ? ' checked' : '') + ' /><span>' + (checked ? 'Enabled' : 'Disabled') + '</span></label>';
  }
  function wireInputs(panel: HTMLElement, field: any, onSet: (name: string, val: any) => void): void {
    panel.querySelectorAll('[data-mf-dgs-input]').forEach(function (inp: any) {
      var name = inp.getAttribute('data-mf-dgs-input') || '';
      inp.addEventListener('change', function () {
        var v: any = inp.value;
        if (inp.type === 'number') v = inp.value === '' ? 0 : Number(inp.value);
        commit(field, function () { onSet(name, v); });
      });
    });
  }
  function wireChecks(panel: HTMLElement, field: any, onSet: (name: string, val: boolean) => void): void {
    panel.querySelectorAll('[data-mf-dgs-check]').forEach(function (cb: any) {
      var name = cb.getAttribute('data-mf-dgs-check') || '';
      var span = cb.parentElement ? cb.parentElement.querySelector('span') : null;
      cb.addEventListener('change', function () {
        commit(field, function () { onSet(name, !!cb.checked); });
        if (span) span.textContent = cb.checked ? 'Enabled' : 'Disabled';
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────
  //  Launcher injection — the builder canvas renders each field as a
  //  `.mf-canvas-field[data-type="<Type>"]` card (NOT the runtime wrap
  //  with data-mfw-dgrid). We inject the "🛠 Studio" button right next
  //  to the existing toolbar actions inside each DataGrid card.
  //
  //  Mirrors the pattern used by megaform-widget-razor.ts line 678–702.
  // ───────────────────────────────────────────────────────────────────
  var INJECTED_FLAG = 'mfDgsInjected';

  // [v20260531-03] Builder-context guard. We're only "in the builder" when
  // the canvas DOM actually exists — checking window.MegaFormBuilder alone
  // is too lax because the admin's PUBLIC form view also boots the builder
  // bundle (which sets window.MegaFormBuilder), so an admin viewing the
  // live form would otherwise see a stray "Studio" button next to the
  // runtime DataGrid. The drop-zone container only exists inside the
  // actual builder shell.
  function isInBuilder(): boolean {
    if (!getBuilder()) return false;
    if (document.getElementById('mf-canvas-dropzone')) return true;
    if (document.querySelector('.mf-canvas-field')) return true;
    return false;
  }

  // [v20260531-03] Clean up any stale launchers that a cached v01 of this
  // plugin may have injected directly into the RUNTIME widget wrap
  // ([data-mfw-dgrid="1"] .mf-dgs-launcher). The current build only ever
  // injects .mf-dgs-launcher-btn into builder canvas cards.
  function purgeStaleRuntimeLaunchers(): void {
    document.querySelectorAll('[data-mfw-dgrid="1"] .mf-dgs-launcher').forEach(function (el) {
      el.parentNode && el.parentNode.removeChild(el);
    });
  }

  function tryInjectLaunchers(): void {
    purgeStaleRuntimeLaunchers();
    if (!isInBuilder()) return;
    injectStyles();
    var cards = document.querySelectorAll<HTMLElement>('.mf-canvas-field[data-type="DataGrid"], .mf-canvas-field[data-type="datagrid"]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if ((card as any).dataset[INJECTED_FLAG] === '1') continue;
      (card as any).dataset[INJECTED_FLAG] = '1';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mf-dgs-launcher-btn';
      btn.title = 'Open DataGrid Studio — columns, display template, image binding, SQL';
      btn.innerHTML = '\u{1F6E0} <span>DataGrid Studio</span>';
      btn.style.cssText = 'background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;border:0;padding:5px 11px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;margin-left:8px;line-height:1.3;font-family:inherit';
      (function (cardEl) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var key = cardEl.getAttribute('data-key') || '';
          if (!key) { alert('DataGrid Studio: field key missing on canvas card.'); return; }
          open(key);
        });
      })(card);
      var actions = card.querySelector('.mf-canvas-field-actions');
      if (actions && actions.parentNode) actions.parentNode.insertBefore(btn, actions);
      else card.appendChild(btn);
    }
  }

  function watchBuilder(): void {
    tryInjectLaunchers();
    if (typeof MutationObserver === 'undefined') return;
    try {
      var mo = new MutationObserver(function () { tryInjectLaunchers(); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (_e) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchBuilder);
  } else {
    watchBuilder();
  }

  (global as any).MFDataGridStudio = { open: open, badge: BADGE };
})(typeof window !== 'undefined' ? window : globalThis);
