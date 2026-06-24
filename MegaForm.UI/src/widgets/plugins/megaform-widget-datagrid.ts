/**
 * MegaForm DataGrid Widget — Master-Detail data grid (Subform / Repeater Field)
 *
 * Build:   tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-datagrid.js
 *
 * The DataGrid widget renders an inline-editable / modal-editable data grid
 * for the canonical "Bảng phụ" (Master-Detail / Subform) UX:
 *   - Drag from Advanced Fields → drop into form canvas
 *   - Bind to a SQL table on the DashboardDatabase (Builder reads
 *     /Subform/Tables + /Subform/Columns to introspect schema)
 *   - Each column can be text/number/date/select/computed; computed columns
 *     re-evaluate in real-time as the user types (formula: "qty * price")
 *   - Total row formula bubbles up into a master field (e.g. invoice total)
 *   - Sticky header, Inline + Modal edit modes, Add/Delete/Reorder rows,
 *     min/max row limits, required-cell validation with red highlight + scroll
 *
 * Server contracts (see SubformController.cs):
 *   POST /Subform/Compute   { formula, row, rows }  → { value, formatted, error }
 *   GET  /Subform/Tables                              → { tables: [...] }
 *   GET  /Subform/Columns?tableName=Foo               → { table, columns: [...] }
 *
 * Client-side compute mirrors server arithmetic+Sum() grammar — see evalLocal().
 *
 * Badge: DataGridWidget v20260528-15
 */

(function (global: any) {
  'use strict';

  var BADGE = 'DataGridWidget v20260531-R1-keyboard-sort-01';
  var MegaFormWidgets: any = global.MegaFormWidgets;
  if (!MegaFormWidgets || typeof MegaFormWidgets.register !== 'function') return;

  // ─────────────────────────────────────────────────────────────────────
  //  Types (loose runtime contract — widgetProps shape)
  // ─────────────────────────────────────────────────────────────────────
  interface GridColumn {
    key: string; label: string; type: string;
    required?: boolean; width?: string; editor?: string; decimals?: number;
    computeFormula?: string; options?: string[]; readonly?: boolean; placeholder?: string;
  }
  interface GridProps {
    tableName?: string; parentKeyColumn?: string; columns?: GridColumn[];
    editMode?: string; allowAdd?: boolean; allowDelete?: boolean; allowReorder?: boolean;
    stickyHeader?: boolean; rowHeight?: string; emptyMessage?: string;
    totalField?: string; totalFormula?: string; minRows?: number; maxRows?: number;
    // SQL display mode — read-only tabular view fed by widgetProps.masterQuery.
    // Handled by megaform-widget-datagrid-sql.ts (window.MFDataGridSql.bind).
    useSql?: boolean; dataSource?: string; connectionKey?: string;
    masterQuery?: string; queryDependsOn?: string; pageSize?: number;
    readOnly?: boolean;
    // [v20260531-DataGridTemplates] Display template variants:
    //   "grid"          — classic table (default)
    //   "card"          — each row as an image card (image column → cover)
    //   "master-detail" — compact parent row + click-to-expand details
    displayTemplate?: 'grid' | 'card' | 'master-detail' | string;
    imageColumn?: string;   // which column.key holds the image URL (card mode)
    titleColumn?: string;   // primary title field for card / detail head
    subtitleColumn?: string;
  }

  function esc(v: any): string {
    var s = v == null ? '' : String(v);
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function attr(v: any): string { return esc(v); }

  function getProps(field: any): GridProps {
    var wp = (field && (field.widgetProps || field.WidgetProps)) || {};
    var cols: GridColumn[] = [];
    if (Array.isArray(wp.columns)) cols = wp.columns as GridColumn[];
    else if (typeof wp.columns === 'string') { try { cols = JSON.parse(wp.columns); } catch { cols = []; } }
    return {
      tableName:       String(wp.tableName || ''),
      parentKeyColumn: String(wp.parentKeyColumn || ''),
      columns:         cols,
      editMode:        String(wp.editMode || 'inline'),
      allowAdd:        wp.allowAdd !== false,
      allowDelete:     wp.allowDelete !== false,
      allowReorder:    !!wp.allowReorder,
      stickyHeader:    wp.stickyHeader !== false,
      rowHeight:       String(wp.rowHeight || 'normal'),
      emptyMessage:    String(wp.emptyMessage || (wp.useSql ? 'No matching rows.' : 'No rows yet. Click + Add row.')),
      totalField:      String(wp.totalField || ''),
      totalFormula:    String(wp.totalFormula || ''),
      minRows:         parseInt(String(wp.minRows || 0), 10) || 0,
      maxRows:         parseInt(String(wp.maxRows || 0), 10) || 0,
      useSql:          !!wp.useSql,
      dataSource:      String(wp.dataSource || ''),
      connectionKey:   String(wp.connectionKey || ''),
      masterQuery:     String(wp.masterQuery || ''),
      queryDependsOn:  String(wp.queryDependsOn || ''),
      pageSize:        parseInt(String(wp.pageSize || 100), 10) || 100,
      readOnly:        !!wp.readOnly,
      // [v20260531-DataGridTemplates] Pass through display template config
      displayTemplate: String(wp.displayTemplate || 'grid'),
      imageColumn:     String(wp.imageColumn || ''),
      titleColumn:     String(wp.titleColumn || ''),
      subtitleColumn:  String(wp.subtitleColumn || ''),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Client-side formula evaluator (mirrors SubformExpressionEvaluator.cs)
  //  Subset: arithmetic, parens, identifiers, Math.*, Sum/Avg/Min/Max/If/Count/Round
  // ─────────────────────────────────────────────────────────────────────
  function tokenize(s: string): any[] {
    var list: any[] = []; var i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s.charAt(i+1)))) {
        var j = i; while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
        list.push({ t: 'num', v: s.substring(i, j) }); i = j; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var j2 = i; while (j2 < s.length && /[A-Za-z0-9_.]/.test(s.charAt(j2))) j2++;
        list.push({ t: 'id', v: s.substring(i, j2) }); i = j2; continue;
      }
      if (c === '"' || c === "'") {
        var q = c; var j3 = i + 1;
        while (j3 < s.length && s.charAt(j3) !== q) j3++;
        list.push({ t: 'str', v: s.substring(i + 1, j3) }); i = j3 + 1; continue;
      }
      if (c === '(') { list.push({ t: 'lp', v: '(' }); i++; continue; }
      if (c === ')') { list.push({ t: 'rp', v: ')' }); i++; continue; }
      if (c === ',') { list.push({ t: 'cm', v: ',' }); i++; continue; }
      if ('+-*/%'.indexOf(c) >= 0) { list.push({ t: 'op', v: c }); i++; continue; }
      throw new Error('Unexpected char ' + c);
    }
    return list;
  }
  function prec(op: string): number { return op === '*' || op === '/' || op === '%' ? 2 : 1; }
  function toRpn(tokens: any[]): any[] {
    var output: any[] = []; var ops: any[] = []; var prev: any = null;
    for (var idx = 0; idx < tokens.length; idx++) {
      var t = tokens[idx];
      if (t.t === 'num' || t.t === 'str') output.push(t);
      else if (t.t === 'id') {
        if (tokens[idx + 1] && tokens[idx + 1].t === 'lp') ops.push(t); else output.push(t);
      }
      else if (t.t === 'cm') { while (ops.length && ops[ops.length-1].t !== 'lp') output.push(ops.pop()); }
      else if (t.t === 'op') {
        var unary = !prev || prev.t === 'op' || prev.t === 'lp' || prev.t === 'cm';
        if (unary && (t.v === '-' || t.v === '+')) output.push({ t: 'num', v: '0' });
        while (ops.length && ops[ops.length-1].t === 'op' && prec(ops[ops.length-1].v) >= prec(t.v)) output.push(ops.pop());
        ops.push(t);
      }
      else if (t.t === 'lp') ops.push(t);
      else if (t.t === 'rp') {
        while (ops.length && ops[ops.length-1].t !== 'lp') output.push(ops.pop());
        ops.pop();
        if (ops.length && ops[ops.length-1].t === 'id') output.push(ops.pop());
      }
      prev = t;
    }
    while (ops.length) output.push(ops.pop());
    return output;
  }
  function toNum(v: any): number {
    if (v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var n = parseFloat(String(v)); return isFinite(n) ? n : 0;
  }
  function evalLocal(expr: string, row: any, rows: any[]): number {
    if (!expr) return 0;
    try {
      var FUNCS: any = {
        'Math.Round': function (x: any, d: any) { var p = Math.pow(10, toNum(d)); return Math.round(toNum(x) * p) / p; },
        'Math.Min':   function (a: any, b: any) { return Math.min(toNum(a), toNum(b)); },
        'Math.Max':   function (a: any, b: any) { return Math.max(toNum(a), toNum(b)); },
        'Math.Abs':   function (x: any) { return Math.abs(toNum(x)); },
        'Math.Floor': function (x: any) { return Math.floor(toNum(x)); },
        'Math.Ceiling': function (x: any) { return Math.ceil(toNum(x)); },
        Round: function (x: any, d: any) { var p = Math.pow(10, toNum(d)); return Math.round(toNum(x) * p) / p; },
        Abs:   function (x: any) { return Math.abs(toNum(x)); },
        Floor: function (x: any) { return Math.floor(toNum(x)); },
        Ceiling: function (x: any) { return Math.ceil(toNum(x)); },
        If:    function (c: any, a: any, b: any) { return toNum(c) !== 0 ? a : b; },
        Sum:   function (subExpr: any) {
          if (typeof subExpr !== 'string') throw new Error('Sum needs quoted expression');
          var s = 0; for (var i = 0; i < (rows||[]).length; i++) s += evalLocal(subExpr, rows[i], rows); return s;
        },
        Avg:   function (subExpr: any) {
          if (!rows || !rows.length) return 0;
          var s = 0; for (var i = 0; i < rows.length; i++) s += evalLocal(subExpr, rows[i], rows); return s / rows.length;
        },
        Min:   function (subExpr: any) {
          if (!rows || !rows.length) return 0;
          var v = evalLocal(subExpr, rows[0], rows);
          for (var i = 1; i < rows.length; i++) { var x = evalLocal(subExpr, rows[i], rows); if (x < v) v = x; }
          return v;
        },
        Max:   function (subExpr: any) {
          if (!rows || !rows.length) return 0;
          var v = evalLocal(subExpr, rows[0], rows);
          for (var i = 1; i < rows.length; i++) { var x = evalLocal(subExpr, rows[i], rows); if (x > v) v = x; }
          return v;
        },
        Count: function () { return (rows||[]).length; },
      };
      var argCount = function (n: string): number {
        var x = n.toLowerCase();
        if (x === 'math.round' || x === 'round' || x === 'math.min' || x === 'math.max') return 2;
        if (x === 'if') return 3;
        if (x === 'count') return 0;
        return 1;
      };
      var lookup = function (n: string): any {
        if (!row) return 0;
        if (row[n] != null) return row[n];
        var dot = n.indexOf('.');
        if (dot > 0) {
          var p = n.substring(0, dot); var k = n.substring(dot + 1);
          if (p === 'row' && row[k] != null) return row[k];
        }
        return 0;
      };
      var rpn = toRpn(tokenize(expr));
      var stk: any[] = [];
      for (var k = 0; k < rpn.length; k++) {
        var t = rpn[k];
        if (t.t === 'num') stk.push(parseFloat(t.v));
        else if (t.t === 'str') stk.push(t.v);
        else if (t.t === 'op') {
          var b = toNum(stk.pop()); var a = toNum(stk.pop());
          if (t.v === '+') stk.push(a + b);
          else if (t.v === '-') stk.push(a - b);
          else if (t.v === '*') stk.push(a * b);
          else if (t.v === '/') stk.push(b === 0 ? 0 : a / b);
          else if (t.v === '%') stk.push(b === 0 ? 0 : a % b);
        }
        else if (t.t === 'id') {
          if (FUNCS[t.v]) {
            var ac = argCount(t.v); var args: any[] = [];
            for (var z = 0; z < ac; z++) args.unshift(stk.pop());
            stk.push(FUNCS[t.v].apply(null, args));
          } else stk.push(toNum(lookup(t.v)));
        }
      }
      return toNum(stk.pop());
    } catch (err) { return 0; }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  CSS (one-time inject)
  // ─────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('mf-datagrid-styles')) return;
    var css =
      '.mfw-dgrid{font-family:Inter,system-ui,sans-serif;border:1px solid #e2e8f0;border-radius:10px;overflow:auto;background:#fff;margin-bottom:8px;max-height:560px}' +
      '.mfw-dgrid-toolbar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;position:sticky;top:0;z-index:2}' +
      '.mfw-dgrid-title{font-weight:600;font-size:13px;color:#0f172a}' +
      '.mfw-dgrid-add{padding:5px 11px;border-radius:6px;background:#6366f1;color:#fff;border:0;cursor:pointer;font-size:12px;font-weight:600}' +
      '.mfw-dgrid-add:hover{background:#4f46e5}' +
      '.mfw-dgrid-add:disabled{background:#cbd5e1;cursor:not-allowed}' +
      '.mfw-dgrid-grid{display:grid;width:100%}' +
      '.mfw-dgrid-cell{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;display:flex;align-items:center;min-height:36px;overflow:hidden}' +
      '.mfw-dgrid-head .mfw-dgrid-cell{background:#f8fafc;font-weight:600;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em;position:sticky;top:38px;z-index:1}' +
      '.mfw-dgrid-row .mfw-dgrid-cell{background:#fff}' +
      '.mfw-dgrid-cell.is-readonly{color:#0f172a}' +
      '.mfw-dgrid-row:hover .mfw-dgrid-cell{background:#fafbfd}' +
      '.mfw-dgrid-row .is-computed{background:#fff8e7;color:#92400e;justify-content:flex-end;font-variant-numeric:tabular-nums}' +
      '.mfw-dgrid-row.is-error .mfw-dgrid-cell{background:#fef2f2}' +
      '.mfw-dgrid-input{width:100%;border:0;background:transparent;font-size:13px;padding:2px 0;color:#0f172a;font-family:inherit}' +
      '.mfw-dgrid-input:focus{outline:2px solid #6366f1;outline-offset:-2px;background:#fff}' +
      '.mfw-dgrid-input.is-number{text-align:right;font-variant-numeric:tabular-nums}' +
      '.mfw-dgrid-input.is-error{outline:2px solid #ef4444 !important;background:#fef2f2}' +
      '.mfw-dgrid-empty{padding:24px;text-align:center;color:#94a3b8;font-style:italic;font-size:13px}' +
      '.mfw-dgrid-del{background:transparent;border:0;color:#ef4444;font-size:16px;cursor:pointer;padding:2px 8px;opacity:.6}' +
      '.mfw-dgrid-del:hover{opacity:1;background:#fee2e2;border-radius:4px}' +
      '.mfw-dgrid-edit{background:transparent;border:0;color:#64748b;font-size:13px;cursor:pointer;padding:2px 8px}' +
      '.mfw-dgrid-edit:hover{color:#6366f1;background:#eef2ff;border-radius:4px}' +
      '.mfw-dgrid.row-compact .mfw-dgrid-cell{min-height:28px;padding:4px 8px;font-size:12px}' +
      '.mfw-dgrid.row-comfortable .mfw-dgrid-cell{min-height:48px;padding:12px 12px}' +
      '.mfw-dgrid-foot{padding:8px 12px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#475569;display:flex;justify-content:space-between;align-items:center;position:sticky;bottom:0}' +
      '.mfw-dgrid-foot strong{color:#0f172a;font-size:14px;font-variant-numeric:tabular-nums}' +
      /* Modal overlay */
      '.mfw-dgrid-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:18px}' +
      '.mfw-dgrid-modal{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 50px rgba(15,23,42,.3)}' +
      '.mfw-dgrid-modal-head{padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:#0f172a;font-size:15px}' +
      '.mfw-dgrid-modal-body{padding:16px 18px;display:grid;gap:12px}' +
      '.mfw-dgrid-modal-body label{display:grid;gap:4px;font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.04em}' +
      '.mfw-dgrid-modal-body input,.mfw-dgrid-modal-body select,.mfw-dgrid-modal-body textarea{padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-family:inherit}' +
      '.mfw-dgrid-modal-foot{padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;background:#f8fafc}' +
      '.mfw-dgrid-modal-foot button{padding:6px 14px;border-radius:7px;font-size:13px;cursor:pointer;border:1px solid #cbd5e1;background:#fff}' +
      '.mfw-dgrid-modal-foot button.is-primary{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.mfw-dgrid-modal-foot button.is-primary:hover{background:#4f46e5}' +
      /* [v20260531-DataGridTemplates] Card layout */
      '.mfw-dgrid-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;padding:14px;background:#f8fafc}' +
      '.mfw-dgrid-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(15,23,42,0.04);transition:box-shadow .15s,transform .15s}' +
      '.mfw-dgrid-card:hover{box-shadow:0 6px 16px rgba(15,23,42,.10);transform:translateY(-2px)}' +
      '.mfw-dgrid-card-cover{position:relative;width:100%;aspect-ratio:1/1;background:#f1f5f9;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #e2e8f0}' +
      '.mfw-dgrid-card-cover img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.mfw-dgrid-card-noimg{color:#cbd5e1;font-size:36px}' +
      '.mfw-dgrid-card-imgurl{position:absolute;left:8px;right:42px;bottom:8px;font-size:11px;padding:4px 6px;border-radius:5px;background:rgba(255,255,255,.95);border:1px solid #cbd5e1}' +
      '.mfw-dgrid-card-cover .mfw-dgrid-image-upload{position:absolute;right:8px;bottom:8px;width:28px;height:28px;padding:0;border-radius:5px;background:rgba(255,255,255,.95);border:1px solid #cbd5e1;cursor:pointer;font-size:14px}' +
      '.mfw-dgrid-card-cover .mfw-dgrid-image-upload:hover{background:#6366f1;color:#fff;border-color:#6366f1}' +
      '.mfw-dgrid-card-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;flex:1;position:relative}' +
      '.mfw-dgrid-card-del{position:absolute;top:4px;right:4px;width:22px;height:22px;padding:0;border-radius:50%;background:transparent;border:0;cursor:pointer;color:#cbd5e1;font-size:16px;line-height:1}' +
      '.mfw-dgrid-card-del:hover{background:#fef2f2;color:#dc2626}' +
      '.mfw-dgrid-card-field{display:flex;flex-direction:column;gap:3px}' +
      '.mfw-dgrid-card-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em}' +
      '.mfw-dgrid-card-field .mfw-dgrid-input{width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font:inherit;font-size:12px}' +
      '.mfw-dgrid-card-field .mfw-dgrid-image-cell{display:flex;gap:4px;align-items:center}' +
      /* [v20260531-DataGridTemplates] Master-detail layout */
      '.mfw-dgrid-md{background:#fff;border-radius:8px;overflow:hidden}' +
      '.mfw-dgrid-md-row{border-bottom:1px solid #e2e8f0}' +
      '.mfw-dgrid-md-row:last-child{border-bottom:0}' +
      '.mfw-dgrid-md-head{padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;background:#fff;transition:background .12s}' +
      '.mfw-dgrid-md-head:hover{background:#f8fafc}' +
      '.mfw-dgrid-md-row.is-expanded .mfw-dgrid-md-head{background:#eef2ff}' +
      '.mfw-dgrid-md-chevron{color:#7c3aed;font-size:12px;transition:transform .15s;flex:0 0 auto;width:14px;text-align:center}' +
      '.mfw-dgrid-md-row.is-expanded .mfw-dgrid-md-chevron{transform:rotate(90deg)}' +
      '.mfw-dgrid-md-title{font-weight:600;color:#0f172a;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.mfw-dgrid-md-sub{font-size:11px;color:#64748b}' +
      '.mfw-dgrid-md-del{width:22px;height:22px;padding:0;border-radius:50%;background:transparent;border:0;cursor:pointer;color:#cbd5e1;font-size:14px;line-height:1}' +
      '.mfw-dgrid-md-del:hover{background:#fef2f2;color:#dc2626}' +
      '.mfw-dgrid-md-detail{padding:14px 14px 14px 38px;background:#f8fafc;display:none;border-top:1px solid #e2e8f0;gap:10px;flex-direction:column}' +
      '.mfw-dgrid-md-row.is-expanded .mfw-dgrid-md-detail{display:flex}' +
      '.mfw-dgrid-md-field{display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center}' +
      '.mfw-dgrid-md-label{font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.04em}' +
      '.mfw-dgrid-md-field .mfw-dgrid-input{width:100%;padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font:inherit;font-size:12px}' +
      /* [v20260531-DataGridImageCol] Image column */
      '.mfw-dgrid-image-cell{display:flex;gap:6px;align-items:center;width:100%}' +
      '.mfw-dgrid-image-thumb{width:38px;height:38px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0}' +
      '.mfw-dgrid-image-empty{width:38px;height:38px;border-radius:5px;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:9px}' +
      '.mfw-dgrid-image-url{flex:1;min-width:0}' +
      '.mfw-dgrid-image-upload{flex:0 0 auto;padding:4px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;cursor:pointer;font-size:13px}' +
      '.mfw-dgrid-image-upload:hover{background:#eef2ff;border-color:#6366f1}' +
      /* [R1.4 v20260531-resize-01] Header resize handle */
      '.mfw-dgrid-head-cell{position:relative}' +
      '.mfw-dgrid-col-resize{position:absolute;top:0;bottom:0;right:0;width:5px;cursor:col-resize;background:transparent;border-right:1px solid transparent;z-index:3}' +
      '.mfw-dgrid-col-resize:hover{background:#6366f1;border-right-color:#6366f1}' +
      '.mfw-dgrid-col-resize:active{background:#4f46e5;border-right-color:#4f46e5}' +
      /* [R1.1 v20260531-virt-01] Virtualised viewport */
      '.mfw-dgrid-virtport{border:1px solid #e2e8f0;border-radius:8px}' +
      '.mfw-dgrid-virthead .mfw-dgrid-grid{border-bottom:1px solid #e2e8f0}';
    var s = document.createElement('style'); s.id = 'mf-datagrid-styles'; s.textContent = css; document.head.appendChild(s);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────
  function render(field: any, formId: number): string {
    injectStyles();
    var props = getProps(field);
    var wrapId = 'mf-' + formId + '-' + field.key + '-dgrid';
    // [v20260530-12] Emit the hidden input alongside the wrap so collect()
    // and sync() actually have a target. Without this, submissions saved
    // empty strings for every DataGrid field. SQL display mode renders a
    // read-only view and skips the hidden input.
    var hiddenInput = props.useSql
      ? ''
      : '<input type="hidden" name="' + attr(field.key) + '" value="" data-mfw-dgrid-state="1" />';
    return hiddenInput + '<div class="mfw-dgrid row-' + esc(props.rowHeight || 'normal') + '"' +
      ' id="' + attr(wrapId) + '"' +
      ' data-badge="' + attr(BADGE) + '"' +
      ' data-mfw-dgrid="1"' +
      ' data-field-key="' + attr(field.key) + '"' +
      ' data-form-id="' + attr(formId) + '"' +
      ' data-props="' + attr(JSON.stringify(props)) + '"' +
      '></div>';
  }

  function bindOne(wrap: HTMLElement) {
    if ((wrap as any).__mfwDgridBound) return;
    (wrap as any).__mfwDgridBound = true;
    var props: GridProps; try { props = JSON.parse(wrap.getAttribute('data-props') || '{}'); } catch { props = {}; }

    // [v20260530-11] SQL display mode — read-only tabular view driven by
    // widgetProps.masterQuery + queryDependsOn cascade. Delegate to the
    // companion sql-mode bundle (megaform-widget-datagrid-sql.ts).
    var sqlGlobal: any = (window as any).MFDataGridSql;
    if (props.useSql && sqlGlobal && typeof sqlGlobal.bind === 'function') {
      var fid = parseInt(wrap.getAttribute('data-form-id') || '0', 10) || 0;
      var fkey = wrap.getAttribute('data-field-key') || '';
      try { sqlGlobal.bind(wrap, props, fid, fkey); } catch (e) {
        wrap.innerHTML = '<div class="mfw-dgrid-empty" style="color:#dc2626">DataGrid SQL bind failed: ' + esc(String(e && (e as any).message || e)) + '</div>';
      }
      return;
    }

    var cols: GridColumn[] = (props.columns && props.columns.length) ? props.columns : [
      { key:'item', label:'Item', type:'text', width:'2fr', required:true },
      { key:'qty',  label:'Qty',  type:'number', width:'100px', required:true, decimals:0 },
      { key:'price',label:'Price',type:'currency', width:'120px', required:true, decimals:2 },
      { key:'total',label:'Total',type:'computed', width:'120px', computeFormula:'qty * price', decimals:2 },
    ];

    // Decide effective edit mode (auto = modal if > 5 cols)
    var effMode = props.editMode || 'inline';
    if (effMode === 'auto') effMode = cols.length > 5 ? 'modal' : 'inline';

    var state: { rows: any[] } = { rows: [] };
    // Try to seed from existing hidden field value
    var hiddenName = wrap.getAttribute('data-field-key') || '';
    var hidden = hiddenName ? (document.querySelector('[name="' + hiddenName + '"]') as HTMLInputElement | null) : null;
    if (hidden && hidden.value) {
      try { var seed = JSON.parse(hidden.value); if (Array.isArray(seed)) state.rows = seed; } catch { /* ignore */ }
    }
    // [v20260530-12] Expose state on the wrap so collect() can fall back to it
    // if the hidden input was somehow stripped.
    (wrap as any).__mfwDgridState = state;

    function gridTemplate() {
      var parts = cols.map(function (c) { return c.width || '1fr'; });
      parts.push('44px');
      return parts.join(' ');
    }

    // [R1.2 v20260531-sort] Multi-column comparator. Numbers sort numerically;
    // dates as Date; everything else as case-insensitive string.
    function applySort(rows: any[], chain: Array<{ col: string; dir: 'asc'|'desc' }>, columns: GridColumn[]): any[] {
      if (!chain || !chain.length || !rows.length) return rows;
      var copy = rows.slice();
      var colTypeMap: Record<string, string> = {};
      columns.forEach(function (c) { colTypeMap[c.key] = c.type || 'text'; });
      copy.sort(function (a, b) {
        for (var i = 0; i < chain.length; i++) {
          var key = chain[i].col;
          var dir = chain[i].dir === 'desc' ? -1 : 1;
          var t = colTypeMap[key] || 'text';
          var av = a ? a[key] : undefined;
          var bv = b ? b[key] : undefined;
          var cmp = 0;
          if (av == null && bv == null) cmp = 0;
          else if (av == null) cmp = -1;
          else if (bv == null) cmp = 1;
          else if (t === 'number' || t === 'currency' || t === 'computed') {
            cmp = (parseFloat(av) || 0) - (parseFloat(bv) || 0);
          } else if (t === 'date') {
            var ad = new Date(av).getTime(); var bd = new Date(bv).getTime();
            cmp = (isNaN(ad) ? 0 : ad) - (isNaN(bd) ? 0 : bd);
          } else {
            var as = String(av).toLowerCase(); var bs = String(bv).toLowerCase();
            cmp = as < bs ? -1 : as > bs ? 1 : 0;
          }
          if (cmp !== 0) return cmp * dir;
        }
        return 0;
      });
      return copy;
    }

    function renderUI() {
      // [v20260531-DataGridTemplates] Branch on displayTemplate.
      var dt = String(props.displayTemplate || 'grid').toLowerCase();
      var toolbar =
        '<div class="mfw-dgrid-toolbar">' +
          '<span class="mfw-dgrid-title">' + esc(props.tableName ? props.tableName : 'Items') + ' <span style="color:#94a3b8;font-weight:400">· ' + state.rows.length + ' rows</span></span>' +
          (props.allowAdd !== false
            ? '<button type="button" class="mfw-dgrid-add" data-mfw-add' + (props.maxRows && state.rows.length >= props.maxRows ? ' disabled' : '') + '>' +
                '+ Add row' +
              '</button>'
            : '') +
        '</div>';
      var foot = (props.totalFormula
        ? '<div class="mfw-dgrid-foot"><span>Total' + (props.totalField ? ' (→ <code>' + esc(props.totalField) + '</code>)' : '') + '</span><strong data-mfw-total>0.00</strong></div>'
        : '');
      var body: string;
      if (dt === 'card') {
        body = '<div class="mfw-dgrid-cards">' +
          (state.rows.length
            ? state.rows.map(function (r, idx) { return renderRowCard(r, idx); }).join('')
            : '<div class="mfw-dgrid-empty" style="grid-column:1/-1">' + esc(props.emptyMessage || 'No rows yet.') + '</div>') +
          '</div>';
      } else if (dt === 'master-detail') {
        body = '<div class="mfw-dgrid-md">' +
          (state.rows.length
            ? state.rows.map(function (r, idx) { return renderRowMasterDetail(r, idx); }).join('')
            : '<div class="mfw-dgrid-empty">' + esc(props.emptyMessage || 'No rows yet.') + '</div>') +
          '</div>';
      } else {
        // [R1.2 v20260531-sort] Multi-column sort indicators. Header cells
        // get a data-mfw-sort-col + indicator showing ▲/▼ + the index of
        // this column in the active sort priority (1, 2, …). Shift-click
        // header to add to priority; plain click resets to just this col.
        var sortChain = (state as any).__mfwSort || [] as Array<{ col: string; dir: 'asc'|'desc' }>;
        var sortedRows = applySort(state.rows, sortChain, cols);
        body = '<div class="mfw-dgrid-grid" style="grid-template-columns:' + gridTemplate() + '">' +
          '<div class="mfw-dgrid-head" style="display:contents">' +
            cols.map(function (c) {
              var idx = -1;
              for (var si = 0; si < sortChain.length; si++) if (sortChain[si].col === c.key) { idx = si; break; }
              var marker = idx >= 0
                ? ' <span class="mfw-dgrid-sort-mark" style="margin-left:4px;font-size:10px;color:#6366f1">' + (sortChain[idx].dir === 'asc' ? '▲' : '▼') + (sortChain.length > 1 ? ('<sup style="font-size:8px">' + (idx + 1) + '</sup>') : '') + '</span>'
                : '';
              return '<div class="mfw-dgrid-cell mfw-dgrid-head-cell" data-mfw-sort-col="' + esc(c.key) + '" style="cursor:pointer;user-select:none">' + esc(c.label || c.key) + (c.required ? ' <span style="color:#ef4444">*</span>' : '') + marker + '</div>';
            }).join('') +
            '<div class="mfw-dgrid-cell"></div>' +
          '</div>' +
          (sortedRows.length
            ? sortedRows.map(function (r, ri) { return renderRow(r, ri); }).join('')
            : '<div class="mfw-dgrid-empty" style="grid-column:1/-1">' + esc(props.emptyMessage || 'No rows yet.') + '</div>') +
        '</div>';
      }
      wrap.innerHTML = toolbar + body + foot;
      wire();
      recomputeAll();
      sync();
      // [v20260531-DataGridSqlCols] Lazily populate SQL-options selects.
      fetchSqlColumnOptions();
    }

    // [v20260531-DataGridSqlCols] For each [data-mfw-sqlcol] select cell,
    // GET /Field/Options?formId&fieldKey&columnKey → fill <options>.
    // Cached per (formId+fieldKey+columnKey) to avoid re-fetching when a
    // user adds rows; new rows reuse the cached <select> options.
    var __mfwSqlColOptionsCache: Record<string, Array<{ value: string; label: string }>> = {};
    function fetchSqlColumnOptions() {
      var nodes = wrap.querySelectorAll('select[data-mfw-sqlcol]');
      if (!nodes.length) return;
      var formId  = parseInt(wrap.getAttribute('data-form-id') || '0', 10) || 0;
      var fieldKey = String(wrap.getAttribute('data-field-key') || '');
      if (!formId || !fieldKey) return;
      // Group by columnKey
      var byColumn: Record<string, HTMLSelectElement[]> = {};
      for (var i = 0; i < nodes.length; i++) {
        var sel = nodes[i] as HTMLSelectElement;
        var col = sel.getAttribute('data-mfw-sqlcol') || '';
        (byColumn[col] = byColumn[col] || []).push(sel);
      }
      Object.keys(byColumn).forEach(function (col) {
        var cacheKey = formId + '|' + fieldKey + '|' + col;
        if (__mfwSqlColOptionsCache[cacheKey]) {
          paint(byColumn[col], __mfwSqlColOptionsCache[cacheKey]);
          return;
        }
        // [B51] Platform-aware base (Oqtane vs DNN) when __MF_PLATFORM__ not set
        var _gPF = (global as any).__MF_PLATFORM__ || {};
        var _gOq = String(_gPF.platform || '').toLowerCase() === 'oqtane' || !!(global as any).Oqtane || !!(global as any).__OQTANE__;
        var _gDef = _gOq ? '/api/MegaForm/' : '/DesktopModules/MegaForm/API/';
        var base = _gPF.apiBase ? String(_gPF.apiBase).replace(/\/?$/, '/') : _gDef;
        var url = base + 'Field/Options?formId=' + formId + '&fieldKey=' + encodeURIComponent(fieldKey) + '&columnKey=' + encodeURIComponent(col);
        fetch(url, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows: any) {
          if (!Array.isArray(rows)) rows = [];
          __mfwSqlColOptionsCache[cacheKey] = rows;
          paint(byColumn[col], rows);
        }).catch(function () { /* ignore */ });
      });
      function paint(selects: HTMLSelectElement[], rows: any[]) {
        // [v20260531-DataGridSqlColsPaint] FieldController serializes FieldOption
        // as Pascal-case { Value, Label }; older Oqtane variants emit lower-case.
        // Accept BOTH so the dropdown actually fills.
        selects.forEach(function (sel) {
          var current = sel.getAttribute('data-mfw-current') || '';
          var html = '<option value="">— Select —</option>';
          rows.forEach(function (o) {
            var val = (o && (o.value != null ? o.value : o.Value)) || '';
            var lbl = (o && (o.label != null ? o.label : o.Label)) || val;
            html += '<option value="' + attr(String(val)) + '"' + (String(val) === current ? ' selected' : '') + '>' + esc(String(lbl)) + '</option>';
          });
          sel.innerHTML = html;
        });
      }
    }

    // [v20260531-DataGridTemplates] Inner editor for one cell, sans wrapping
    // <div class="mfw-dgrid-cell">. Card + master-detail variants reuse it
    // inside their own card-cell wrappers so the same column types render
    // consistently across templates.
    function renderCellEditor(c: GridColumn, v: any, modal: boolean): string {
      var isNum = c.type === 'number' || c.type === 'currency' || c.type === 'computed';
      if (c.type === 'computed' || c.computeFormula) {
        return '<span class="mfw-dgrid-computed-val" data-mfw-cell="' + esc(c.key) + '">' + esc(v) + '</span>';
      }
      if (modal) {
        return '<span class="mfw-dgrid-readonly" data-mfw-cell="' + esc(c.key) + '">' + esc(v) + '</span>';
      }
      // [v20260531-DataGridImageCol] Image column — URL paste input + thumb
      // preview + optional Upload button (delegates to /Upload/File). The
      // hidden <input data-mfw-cell> holds the URL so collect() picks it up.
      if (c.type === 'image') {
        var thumb = v ? '<img src="' + attr(v) + '" class="mfw-dgrid-image-thumb" alt="" />' : '<div class="mfw-dgrid-image-empty">No image</div>';
        return '<div class="mfw-dgrid-image-cell">' +
          thumb +
          '<input type="url" class="mfw-dgrid-input mfw-dgrid-image-url" data-mfw-cell="' + esc(c.key) + '" value="' + attr(v) + '" placeholder="' + attr(c.placeholder || 'Paste image URL...') + '"' + (c.required ? ' required' : '') + ' />' +
          '<button type="button" class="mfw-dgrid-image-upload" data-mfw-image-upload="' + esc(c.key) + '" title="Upload image">📁</button>' +
        '</div>';
      }
      if (c.type === 'select' && c.options && c.options.length) {
        var opts = ['<option value=""></option>'].concat(c.options.map(function (o: any) {
          if (o && typeof o === 'object' && 'value' in o) {
            return '<option value="' + attr(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label || o.value) + '</option>';
          }
          return '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>';
        })).join('');
        return '<select class="mfw-dgrid-input" data-mfw-cell="' + esc(c.key) + '">' + opts + '</select>';
      }
      if (c.type === 'select' && ((c as any).optionsSource === 'sql' || (c as any).optionsSql)) {
        return '<select class="mfw-dgrid-input" data-mfw-cell="' + esc(c.key) + '" data-mfw-sqlcol="' + esc(c.key) + '" data-mfw-current="' + attr(v) + '"><option value="">' + esc(c.placeholder || '— Select —') + '</option></select>';
      }
      var inputType = c.type === 'date' ? 'date' : (isNum ? 'number' : 'text');
      var stepAttr = isNum ? ' step="' + (c.decimals ? Math.pow(10, -(c.decimals || 2)) : 'any') + '"' : '';
      return '<input type="' + inputType + '" class="mfw-dgrid-input ' + (isNum ? 'is-number' : '') + '" ' +
        'data-mfw-cell="' + esc(c.key) + '" value="' + attr(v) + '" placeholder="' + attr(c.placeholder || '') + '"' +
        (c.required ? ' required' : '') + stepAttr +
        (c.readonly ? ' readonly' : '') + '/>';
    }

    // [v20260531-DataGridTemplates] Card layout — each row is an image card
    // with a primary title and stacked field editors below the image. Uses
    // props.imageColumn / titleColumn / subtitleColumn if set, otherwise
    // auto-picks the first image / first text column.
    function renderRowCard(row: any, idx: number): string {
      var imgKey = props.imageColumn || (function () {
        var ic = cols.filter(function (c) { return c.type === 'image'; })[0];
        return ic ? ic.key : '';
      })();
      var titleKey = props.titleColumn || (function () {
        var tc = cols.filter(function (c) { return c.type === 'text' && c.key !== imgKey; })[0];
        return tc ? tc.key : (cols[0] ? cols[0].key : '');
      })();
      var subKey = props.subtitleColumn || '';
      var imgUrl = imgKey ? (row[imgKey] || '') : '';
      var title = titleKey ? (row[titleKey] || '') : '';
      var sub = subKey ? (row[subKey] || '') : '';

      var bodyCells = cols.map(function (c) {
        if (c.key === imgKey) return ''; // image goes in cover
        return '<div class="mfw-dgrid-card-field"><label class="mfw-dgrid-card-label">' + esc(c.label || c.key) + (c.required ? ' <span style="color:#ef4444">*</span>' : '') + '</label>' + renderCellEditor(c, row[c.key] != null ? row[c.key] : '', false) + '</div>';
      }).join('');

      return '<div class="mfw-dgrid-card" data-mfw-row="' + idx + '">' +
        '<div class="mfw-dgrid-card-cover">' +
          (imgKey
            ? (imgUrl
                ? '<img src="' + attr(imgUrl) + '" alt="' + attr(title) + '" />'
                : '<div class="mfw-dgrid-card-noimg">📷</div>') +
              '<input type="url" class="mfw-dgrid-input mfw-dgrid-card-imgurl" data-mfw-cell="' + esc(imgKey) + '" value="' + attr(imgUrl) + '" placeholder="Image URL..." />' +
              '<button type="button" class="mfw-dgrid-image-upload" data-mfw-image-upload="' + esc(imgKey) + '" title="Upload image">📁</button>'
            : '<div class="mfw-dgrid-card-noimg">No image column</div>') +
        '</div>' +
        '<div class="mfw-dgrid-card-body">' +
          (props.allowDelete !== false ? '<button type="button" class="mfw-dgrid-card-del" data-mfw-del title="Delete row">×</button>' : '') +
          bodyCells +
        '</div>' +
      '</div>';
    }

    // [v20260531-DataGridTemplates] Master-detail — compact one-line summary
    // (title + subtitle) with click-to-expand details containing all editors.
    function renderRowMasterDetail(row: any, idx: number): string {
      var titleKey = props.titleColumn || (cols[0] ? cols[0].key : '');
      var subKey   = props.subtitleColumn || '';
      var title = titleKey ? (row[titleKey] || '(unnamed)') : '(row ' + (idx + 1) + ')';
      var sub   = subKey ? (row[subKey] || '') : '';

      var detailRows = cols.map(function (c) {
        return '<div class="mfw-dgrid-md-field"><label class="mfw-dgrid-md-label">' + esc(c.label || c.key) + (c.required ? ' <span style="color:#ef4444">*</span>' : '') + '</label>' + renderCellEditor(c, row[c.key] != null ? row[c.key] : '', false) + '</div>';
      }).join('');

      return '<div class="mfw-dgrid-md-row" data-mfw-row="' + idx + '">' +
        '<div class="mfw-dgrid-md-head" data-mfw-md-toggle>' +
          '<span class="mfw-dgrid-md-chevron">▶</span>' +
          '<span class="mfw-dgrid-md-title">' + esc(title) + '</span>' +
          (sub ? '<span class="mfw-dgrid-md-sub">' + esc(sub) + '</span>' : '') +
          (props.allowDelete !== false ? '<button type="button" class="mfw-dgrid-md-del" data-mfw-del title="Delete row">×</button>' : '') +
        '</div>' +
        '<div class="mfw-dgrid-md-detail">' + detailRows + '</div>' +
      '</div>';
    }

    function renderRow(row: any, idx: number) {
      var modal = effMode === 'modal';
      return '<div class="mfw-dgrid-row" style="display:contents" data-mfw-row="' + idx + '">' +
        cols.map(function (c) {
          var v = row[c.key] != null ? row[c.key] : '';
          var isComputed = c.type === 'computed' || c.computeFormula;
          return '<div class="mfw-dgrid-cell' + (isComputed ? ' is-computed' : '') + (c.type === 'image' ? ' is-image' : '') + '">' + renderCellEditor(c, v, modal) + '</div>';
        }).join('') +
        '<div class="mfw-dgrid-cell" style="justify-content:flex-end;gap:4px">' +
          (effMode === 'modal' ? '<button type="button" class="mfw-dgrid-edit" data-mfw-edit title="Edit row">✎</button>' : '') +
          (props.allowDelete !== false ? '<button type="button" class="mfw-dgrid-del" data-mfw-del title="Delete row">×</button>' : '') +
        '</div>' +
      '</div>';
    }

    function wire() {
      // [R1.2 v20260531-sort] Header click → modify sort chain.
      wrap.querySelectorAll('[data-mfw-sort-col]').forEach(function (cellEl: any) {
        cellEl.addEventListener('click', function (ev: any) {
          var key = String(cellEl.getAttribute('data-mfw-sort-col') || '');
          if (!key) return;
          var chain: Array<{ col: string; dir: 'asc'|'desc' }> = ((state as any).__mfwSort || []).slice();
          var existingIdx = -1;
          for (var i = 0; i < chain.length; i++) if (chain[i].col === key) { existingIdx = i; break; }
          if (ev.shiftKey) {
            // Add or cycle within multi-sort
            if (existingIdx < 0) chain.push({ col: key, dir: 'asc' });
            else if (chain[existingIdx].dir === 'asc') chain[existingIdx].dir = 'desc';
            else chain.splice(existingIdx, 1); // 3rd shift-click drops it
          } else {
            if (existingIdx >= 0 && chain.length === 1) {
              if (chain[0].dir === 'asc') chain = [{ col: key, dir: 'desc' }];
              else chain = []; // toggle off
            } else {
              chain = [{ col: key, dir: 'asc' }];
            }
          }
          (state as any).__mfwSort = chain;
          renderUI();
        });
      });
      var addBtn = wrap.querySelector('[data-mfw-add]') as HTMLButtonElement | null;
      if (addBtn) addBtn.addEventListener('click', function () {
        if (props.maxRows && state.rows.length >= props.maxRows) return;
        var blank: any = {}; cols.forEach(function (c) {
          blank[c.key] = c.type === 'number' || c.type === 'currency' ? 0 : '';
        });
        state.rows.push(blank);
        renderUI();
        // Focus first input of new row
        var rows = wrap.querySelectorAll('[data-mfw-row]');
        var last = rows[rows.length - 1];
        if (last) {
          var f = last.querySelector('.mfw-dgrid-input') as HTMLElement | null;
          if (f) (f as HTMLInputElement).focus();
        }
      });

      wrap.querySelectorAll('[data-mfw-row]').forEach(function (rowEl: any) {
        var idx = parseInt(rowEl.getAttribute('data-mfw-row') || '0', 10);
        var row = state.rows[idx]; if (!row) return;

        rowEl.querySelectorAll('[data-mfw-cell]').forEach(function (cellEl: any) {
          var key = cellEl.getAttribute('data-mfw-cell');
          var input = cellEl.tagName === 'INPUT' || cellEl.tagName === 'SELECT' || cellEl.tagName === 'TEXTAREA' ? cellEl : cellEl.querySelector('.mfw-dgrid-input');
          if (!input) return;
          input.addEventListener('input', function () { row[key] = input.value; recomputeAll(); sync(); });
          input.addEventListener('change', function () { row[key] = input.value; recomputeAll(); sync(); });
          // Tab on last cell of last row → add new row
          input.addEventListener('keydown', function (e: any) {
            if (e.key === 'Tab' && !e.shiftKey && idx === state.rows.length - 1) {
              var cells = rowEl.querySelectorAll('.mfw-dgrid-input');
              if (cells[cells.length - 1] === input && props.allowAdd !== false) {
                if (!props.maxRows || state.rows.length < props.maxRows) {
                  e.preventDefault();
                  setTimeout(function () { (addBtn as any)?.click(); }, 0);
                }
              }
            }
            // [R1.3a v20260531-keyboard] WinForm minimal pack — keyboard model.
            // Ctrl+Insert  → new row at bottom (same as Add row button)
            // Ctrl+Delete  → remove current row
            // Enter        → move focus to same cell in next row (Excel-style)
            //                creates a new row if at end
            // Esc          → blur current cell (cancel intent)
            if (e.ctrlKey && (e.key === 'Insert' || e.code === 'Insert')) {
              e.preventDefault();
              if (props.allowAdd !== false && (!props.maxRows || state.rows.length < props.maxRows)) {
                setTimeout(function () { (addBtn as any)?.click(); }, 0);
              }
            }
            if (e.ctrlKey && (e.key === 'Delete' || e.code === 'Delete')) {
              e.preventDefault();
              if (props.allowDelete !== false) {
                state.rows.splice(idx, 1); renderUI();
              }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              if (input.tagName !== 'TEXTAREA') {
                e.preventDefault();
                var dataKey = input.getAttribute('data-mfw-cell') || '';
                var nextRowEl = wrap.querySelector('[data-mfw-row="' + (idx + 1) + '"]') as HTMLElement | null;
                if (nextRowEl) {
                  var nextCell = nextRowEl.querySelector('[data-mfw-cell="' + dataKey + '"]') as HTMLElement | null;
                  if (nextCell && (nextCell.tagName === 'INPUT' || nextCell.tagName === 'SELECT' || nextCell.tagName === 'TEXTAREA')) (nextCell as HTMLInputElement).focus();
                  else if (nextCell) (nextCell.querySelector('input, select, textarea') as HTMLInputElement | null)?.focus();
                } else if (props.allowAdd !== false && (!props.maxRows || state.rows.length < props.maxRows)) {
                  setTimeout(function () { (addBtn as any)?.click(); }, 0);
                }
              }
            }
            if (e.key === 'Escape') {
              (input as HTMLElement).blur();
            }
          });
          // [R1.3b v20260531-excelpaste] Paste-into-cell intercept. When the
          // clipboard has a tab-separated multi-row block (Excel range copy),
          // expand it across rows + columns starting at the focused cell.
          // Single-cell paste falls through to native input behaviour.
          input.addEventListener('paste', function (ev: any) {
            try {
              var text = (ev.clipboardData || (window as any).clipboardData)?.getData('text');
              if (!text) return;
              if (text.indexOf('\n') < 0 && text.indexOf('\t') < 0) return; // single value — let it through
              ev.preventDefault();
              var lines = text.split(/\r?\n/).map(function (l: string) { return l.replace(/\r$/, ''); });
              while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
              if (!lines.length) return;
              var startKey = input.getAttribute('data-mfw-cell') || '';
              var colKeys = cols.map(function (c) { return c.key; });
              var startColIdx = colKeys.indexOf(startKey);
              if (startColIdx < 0) startColIdx = 0;
              for (var li = 0; li < lines.length; li++) {
                var rowTokens = lines[li].split('\t');
                var targetRowIdx = idx + li;
                if (targetRowIdx >= state.rows.length) {
                  if (props.maxRows && targetRowIdx >= props.maxRows) break;
                  var blank: any = {};
                  cols.forEach(function (c) { blank[c.key] = c.type === 'number' || c.type === 'currency' ? 0 : ''; });
                  state.rows.push(blank);
                }
                for (var ci = 0; ci < rowTokens.length; ci++) {
                  var targetColIdx = startColIdx + ci;
                  if (targetColIdx >= colKeys.length) break;
                  var k = colKeys[targetColIdx];
                  state.rows[targetRowIdx][k] = rowTokens[ci];
                }
              }
              renderUI();
            } catch (pasteErr) { /* fall through */ }
          });
        });

        var del = rowEl.querySelector('[data-mfw-del]');
        if (del) del.addEventListener('click', function (e: any) { e.stopPropagation(); state.rows.splice(idx, 1); renderUI(); });

        var editBtn = rowEl.querySelector('[data-mfw-edit]');
        if (editBtn) editBtn.addEventListener('click', function () { openModal(idx); });

        // [v20260531-DataGridTemplates] Master-detail expand toggle
        var mdHead = rowEl.querySelector('[data-mfw-md-toggle]');
        if (mdHead) mdHead.addEventListener('click', function (e: any) {
          if ((e.target as HTMLElement).closest('[data-mfw-del]')) return;
          rowEl.classList.toggle('is-expanded');
        });

        // [v20260531-DataGridImageCol] Upload button → /Upload/File → set URL
        rowEl.querySelectorAll('[data-mfw-image-upload]').forEach(function (btn: any) {
          btn.addEventListener('click', function (ev: any) {
            ev.stopPropagation();
            var colKey = btn.getAttribute('data-mfw-image-upload');
            var picker = document.createElement('input');
            picker.type = 'file';
            picker.accept = 'image/*';
            picker.style.display = 'none';
            document.body.appendChild(picker);
            picker.addEventListener('change', function () {
              var f = picker.files && picker.files[0]; if (!f) { picker.remove(); return; }
              var fd = new FormData();
              fd.append('file', f);
              fd.append('formId', String(wrap.getAttribute('data-form-id') || '0'));
              fd.append('fieldKey', String(wrap.getAttribute('data-field-key') || ''));
              // [B51] Platform-aware base (Oqtane vs DNN) when __MF_PLATFORM__ not set
              var _uPF = (global as any).__MF_PLATFORM__ || {};
              var _uOq = String(_uPF.platform || '').toLowerCase() === 'oqtane' || !!(global as any).Oqtane || !!(global as any).__OQTANE__;
              var _uDef = _uOq ? '/api/MegaForm/' : '/DesktopModules/MegaForm/API/';
              var base = _uPF.apiBase ? String(_uPF.apiBase).replace(/\/?$/, '/') : _uDef;
              var orig = btn.textContent; btn.textContent = '⏳'; btn.disabled = true;
              var restore = function () { btn.textContent = orig; btn.disabled = false; picker.remove(); };
              fetch(base + 'Upload/File', { method: 'POST', body: fd, credentials: 'same-origin' })
                .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
                .then(function (resp: any) {
                  var url = resp && (resp.url || resp.Url || resp.path || resp.Path) || '';
                  if (url) {
                    row[colKey] = url;
                    var urlInp = rowEl.querySelector('[data-mfw-cell="' + colKey + '"]') as HTMLInputElement | null;
                    if (urlInp) urlInp.value = url;
                    renderUI();
                  }
                  restore();
                }, function (err) { console.error('DataGrid image upload failed:', err); restore(); });
            });
            picker.click();
          });
        });
      });
    }

    function openModal(idx: number) {
      var row = state.rows[idx]; if (!row) return;
      var snap = JSON.parse(JSON.stringify(row));
      var overlay = document.createElement('div');
      overlay.className = 'mfw-dgrid-overlay';
      overlay.innerHTML =
        '<div class="mfw-dgrid-modal">' +
          '<div class="mfw-dgrid-modal-head"><span>Edit row #' + (idx + 1) + '</span><button type="button" class="mfw-dgrid-del" data-mfw-cancel>×</button></div>' +
          '<div class="mfw-dgrid-modal-body">' +
            cols.map(function (c) {
              if (c.type === 'computed' || c.computeFormula) return ''; // skip computed
              var v = snap[c.key] != null ? snap[c.key] : '';
              var inputType = c.type === 'date' ? 'date' : (c.type === 'number' || c.type === 'currency' ? 'number' : 'text');
              if (c.type === 'select' && c.options && c.options.length) {
                return '<label>' + esc(c.label) + (c.required ? ' *' : '') +
                  '<select data-mfw-modal-cell="' + esc(c.key) + '">' +
                  ['<option value=""></option>'].concat(c.options.map(function (o) { return '<option' + (String(o)===String(v)?' selected':'') + '>' + esc(o) + '</option>'; })).join('') +
                  '</select></label>';
              }
              return '<label>' + esc(c.label) + (c.required ? ' *' : '') +
                '<input type="' + inputType + '" data-mfw-modal-cell="' + esc(c.key) + '" value="' + attr(v) + '"/></label>';
            }).join('') +
          '</div>' +
          '<div class="mfw-dgrid-modal-foot">' +
            '<button type="button" data-mfw-cancel>Cancel</button>' +
            '<button type="button" class="is-primary" data-mfw-save>Save row</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);

      overlay.querySelectorAll('[data-mfw-cancel]').forEach(function (b) { b.addEventListener('click', function () { overlay.remove(); }); });
      overlay.querySelector('[data-mfw-save]')?.addEventListener('click', function () {
        overlay.querySelectorAll('[data-mfw-modal-cell]').forEach(function (input: any) {
          row[input.getAttribute('data-mfw-modal-cell')] = input.value;
        });
        overlay.remove();
        renderUI();
      });
      overlay.addEventListener('click', function (e: any) { if (e.target === overlay) overlay.remove(); });
    }

    function recomputeAll() {
      // Re-evaluate computed cells per row
      state.rows.forEach(function (row: any, idx: number) {
        cols.forEach(function (c) {
          if (c.type === 'computed' || c.computeFormula) {
            var v = evalLocal(c.computeFormula || '', row, state.rows);
            row[c.key] = c.decimals != null ? +v.toFixed(c.decimals) : v;
            var cell = wrap.querySelector('[data-mfw-row="' + idx + '"] [data-mfw-cell="' + c.key + '"]');
            if (cell) (cell as HTMLElement).textContent = String(row[c.key]);
          }
        });
      });
      // Total bubble-up
      if (props.totalFormula) {
        var total = evalLocal(props.totalFormula, {}, state.rows);
        var totalEl = wrap.querySelector('[data-mfw-total]');
        if (totalEl) (totalEl as HTMLElement).textContent = total.toFixed(2);
        if (props.totalField) {
          var hostInput = document.querySelector('[name="' + props.totalField + '"]') as HTMLInputElement | null;
          if (hostInput) {
            hostInput.value = total.toFixed(2);
            try { hostInput.dispatchEvent(new Event('input', { bubbles: true })); } catch { /* ignore */ }
          }
        }
      }
    }

    function sync() {
      // Persist current state.rows JSON into the hidden field
      if (hidden) hidden.value = JSON.stringify(state.rows);
    }

    renderUI();
  }

  function bind(_formId: number) {
    document.querySelectorAll('[data-mfw-dgrid="1"]').forEach(function (el: any) { bindOne(el); });
  }

  function collect(fieldOrKey: any, container?: HTMLElement): string {
    // [v20260530-12] The widgets framework calls plugin.collect(key, container)
    // — `fieldOrKey` is a STRING in the renderer path. Older callers pass a
    // field OBJECT with .key. Accept both.
    var key = typeof fieldOrKey === 'string' ? fieldOrKey : (fieldOrKey && fieldOrKey.key);
    if (!key) return '';
    var scope: Document | HTMLElement = container || document;
    var wrap = scope.querySelector('[data-field-key="' + key + '"][data-mfw-dgrid="1"]') as any;
    if (!wrap || !wrap.__mfwDgridBound) return '';
    // SQL display mode never persists anything (read-only).
    try {
      var p = JSON.parse(wrap.getAttribute('data-props') || '{}');
      if (p && p.useSql) return '';
    } catch (_e) { /* ignore */ }
    var hidden = (scope.querySelector('[name="' + key + '"]') as HTMLInputElement | null);
    if (hidden && hidden.value) return hidden.value;
    var state = (wrap as any).__mfwDgridState;
    if (state && Array.isArray(state.rows)) return JSON.stringify(state.rows);
    return '';
  }

  function validate(field: any): boolean | string {
    var props = getProps(field);
    var wrap = document.querySelector('[data-field-key="' + field.key + '"][data-mfw-dgrid="1"]') as any;
    if (!wrap) return true;
    var rowEls = wrap.querySelectorAll('[data-mfw-row]');
    if (props.minRows && rowEls.length < props.minRows) return 'At least ' + props.minRows + ' row(s) required.';
    var bad = false; var firstBad: HTMLElement | null = null;
    rowEls.forEach(function (r: any) {
      (props.columns || []).forEach(function (c) {
        if (!c.required) return;
        var input = r.querySelector('[data-mfw-cell="' + c.key + '"] .mfw-dgrid-input, [data-mfw-cell="' + c.key + '"]') as HTMLElement | null;
        if (!input) return;
        var val = (input as any).value != null ? (input as any).value : input.textContent;
        if (val == null || String(val).trim() === '') {
          input.classList.add('is-error');
          if (!firstBad) firstBad = input;
          bad = true;
        } else {
          input.classList.remove('is-error');
        }
      });
    });
    if (firstBad) {
      try { (firstBad as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* ignore */ }
    }
    return bad ? 'Please fill required cells (highlighted red).' : true;
  }

  MegaFormWidgets.register('DataGrid', {
    meta: { label: 'Data Grid (Master-Detail)', icon: 'fa-table', category: 'advanced', color: '#0ea5e9', defaultWidth: '100%' },
    defaults: {
      tableName: '',
      parentKeyColumn: '',
      columns: [
        { key: 'item',  label: 'Item',  type: 'text',     width: '2fr',   required: true },
        { key: 'qty',   label: 'Qty',   type: 'number',   width: '100px', required: true, decimals: 0 },
        { key: 'price', label: 'Price', type: 'currency', width: '120px', required: true, decimals: 2 },
        { key: 'total', label: 'Total', type: 'computed', width: '120px', computeFormula: 'qty * price', decimals: 2 }
      ],
      editMode: 'inline',
      allowAdd: true, allowDelete: true, stickyHeader: true,
      rowHeight: 'normal',
      emptyMessage: 'No rows yet. Click + Add row.',
      totalField: '', totalFormula: 'Sum("qty * price")',
      minRows: 0, maxRows: 0,
      // [v20260531-DataGridTemplates]
      displayTemplate: 'grid',
      imageColumn: '',
      titleColumn: '',
      subtitleColumn: ''
    },
    properties: [
      { key: 'useSql',          label: 'Display mode (read-only, SQL-driven)', type: 'checkbox', default: false },
      { key: 'connectionKey',   label: 'SQL connection key (default DashboardDatabase)', type: 'text', default: '' },
      { key: 'masterQuery',     label: 'Master SELECT (use :paramName for parent-field params)', type: 'textarea', default: '' },
      { key: 'queryDependsOn',  label: 'Parent field keys (CSV, e.g. player_id,round_id)', type: 'text', default: '' },
      { key: 'pageSize',        label: 'Display mode — max rows to fetch', type: 'number', default: 100 },
      { key: 'tableName',       label: 'SQL Table (DashboardDatabase) — leave blank for in-form storage', type: 'text', default: '' },
      { key: 'parentKeyColumn', label: 'FK column linking to master submission ID', type: 'text', default: '' },
      { key: 'columns',         label: 'Columns JSON [{key,label,type,width,required,computeFormula,decimals,options}]', type: 'textarea', default: '[{"key":"item","label":"Item","type":"text","width":"2fr","required":true},{"key":"qty","label":"Qty","type":"number","width":"100px","required":true,"decimals":0},{"key":"price","label":"Price","type":"currency","width":"120px","required":true,"decimals":2},{"key":"total","label":"Total","type":"computed","width":"120px","computeFormula":"qty * price","decimals":2}]' },
      { key: 'displayTemplate', label: 'Display template', type: 'select', options: [{label:'Grid (table)',value:'grid'},{label:'Card (image cards)',value:'card'},{label:'Master-detail (collapsed rows)',value:'master-detail'}], default: 'grid' },
      { key: 'imageColumn',     label: 'Image column (card mode) — column key of an image field', type: 'text', default: '' },
      { key: 'titleColumn',     label: 'Title column (card / master-detail head)', type: 'text', default: '' },
      { key: 'subtitleColumn',  label: 'Subtitle column (master-detail summary)', type: 'text', default: '' },
      { key: 'editMode',        label: 'Edit mode', type: 'select', options: [{label:'Inline (in row)',value:'inline'},{label:'Modal (popup)',value:'modal'},{label:'Auto (>5 cols → modal)',value:'auto'}], default: 'inline' },
      { key: 'allowAdd',        label: 'Allow add row', type: 'checkbox', default: true },
      { key: 'allowDelete',     label: 'Allow delete row', type: 'checkbox', default: true },
      { key: 'stickyHeader',    label: 'Sticky column headers', type: 'checkbox', default: true },
      { key: 'rowHeight',       label: 'Row height', type: 'select', options: [{label:'Compact',value:'compact'},{label:'Normal',value:'normal'},{label:'Comfortable',value:'comfortable'}], default: 'normal' },
      { key: 'minRows',         label: 'Minimum rows', type: 'number', default: 0 },
      { key: 'maxRows',         label: 'Maximum rows (0 = unlimited)', type: 'number', default: 0 },
      { key: 'totalField',      label: 'Master field to receive total (field key)', type: 'text', default: '' },
      { key: 'totalFormula',    label: 'Total formula (e.g. Sum("qty * price"))', type: 'text', default: 'Sum("qty * price")' },
      { key: 'emptyMessage',    label: 'Empty-state message', type: 'text', default: 'No rows yet. Click + Add row.' },
    ],
    render:   render,
    bind:     bind,
    collect:  collect,
    validate: validate
  });

  if (typeof window !== 'undefined') (window as any).__MF_DATAGRID_BADGE__ = BADGE;
})(typeof window !== 'undefined' ? window : globalThis);
