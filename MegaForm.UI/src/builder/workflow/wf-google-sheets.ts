// wf-google-sheets.ts — Google Sheets node config panel
// Canonical split for Google Sheets node UI in workflow builder.

export var GOOGLE_SHEETS_PANEL_BADGE = 'WF Google Sheets split v20260401-05';

function stopPanelBubble(e: any): void {
  if (!e) return;
  if (e.stopPropagation) e.stopPropagation();
}

function guardProps(props?: any): any {
  var next = Object.assign({}, props || {});
  var cls = String(next.className || '').trim();
  next.className = (cls ? cls + ' ' : '') + 'nodrag nopan nowheel';
  next.onPointerDown = function (e: any) { stopPanelBubble(e); if (props && props.onPointerDown) props.onPointerDown(e); };
  next.onMouseDown = function (e: any) { stopPanelBubble(e); if (props && props.onMouseDown) props.onMouseDown(e); };
  next.onClick = function (e: any) { stopPanelBubble(e); if (props && props.onClick) props.onClick(e); };
  next.onWheel = function (e: any) { stopPanelBubble(e); if (props && props.onWheel) props.onWheel(e); };
  return next;
}

function normMapRow(row: any, idx: number): any {
  row = row || {};
  return {
    column: String(row.column || row.Column || '').trim(),
    source: String(row.source || row.Source || row.fieldKey || row.FieldKey || '').trim(),
    value: String(row.value || row.Value || '').trim(),
    id: 'gs-col-' + idx
  };
}

export function renderGoogleSheetsConfig(ctx: any): any {
  var h = ctx.h;
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var cfgField = ctx.cfgField;
  var cfgFieldRow = ctx.cfgFieldRow;
  var cfgSection = ctx.cfgSection;
  var FieldInsertButton = ctx.FieldInsertButton;
  var schema = ctx.schema || { fields: [] };
  var normalizeGoogleSheetsConfig = ctx.normalizeGoogleSheetsConfig;

  var c = normalizeGoogleSheetsConfig(config || {});
  var fields = (schema.fields || []).slice(0);
  var mappings = Array.isArray(c.columnMappings) ? c.columnMappings.slice(0, 6).map(function (row: any, idx: number) { return normMapRow(row, idx); }) : [];
  while (mappings.length < 4) mappings.push(normMapRow({}, mappings.length));

  function patch(p: any): void {
    setConfig(normalizeGoogleSheetsConfig(Object.assign({}, c, p || {})));
  }

  function setMappingRow(idx: number, patchRow: any): void {
    var next = mappings.slice(0);
    next[idx] = Object.assign({}, normMapRow(next[idx], idx), patchRow || {}, { id: 'gs-col-' + idx });
    patch({ columnMappings: next });
  }

  function requestUrlPreview(): string {
    var spreadsheetId = String(c.spreadsheetId || '').trim() || 'YOUR_SPREADSHEET_ID';
    var range = String(c.range || c.sheetName || 'Sheet1').trim();
    if ((c.operation || 'append') === 'update') {
      return 'POST https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + encodeURIComponent(range) + '?valueInputOption=' + encodeURIComponent(String(c.valueInputOption || 'USER_ENTERED'));
    }
    return 'POST https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + encodeURIComponent(range) + ':append?valueInputOption=' + encodeURIComponent(String(c.valueInputOption || 'USER_ENTERED')) + '&insertDataOption=' + encodeURIComponent(String(c.insertDataOption || 'INSERT_ROWS'));
  }

  function requestBodyPreview(): string {
    var cols = mappings.filter(function (row: any) { return row.column || row.source || row.value; });
    if (!cols.length) cols = [normMapRow({ column: 'A', source: (fields[0] && fields[0].key) || '' }, 0)];
    var values = cols.map(function (row: any) {
      if (row.value) return row.value;
      if (row.source) return '{{field.' + row.source + '}}';
      return '';
    });
    return JSON.stringify({ range: String(c.range || c.sheetName || 'Sheet1'), majorDimension: 'ROWS', values: [values] }, null, 2);
  }

  function fetchSnippet(): string {
    return [
      "fetch('" + requestUrlPreview().replace(/^POST\s+/, '') + "', {",
      "  method: 'POST',",
      "  headers: {",
      "    'Authorization': 'Bearer ' + accessToken,",
      "    'Content-Type': 'application/json'",
      "  },",
      "  body: JSON.stringify(" + requestBodyPreview().replace(/\n/g, '\n  ') + ")",
      "});"
    ].join('\n');
  }

  return h('div', guardProps({ className: 'mf-rf-gs-panel', 'data-wf-google-sheets-badge': GOOGLE_SHEETS_PANEL_BADGE }),
    h('div', guardProps({ className: 'mf-rf-helper-card', style: { marginBottom: 12 } }),
      h('strong', null, 'Google Sheets'),
      h('div', { style: { fontSize: 12, color: '#64748b', marginTop: 4 } }, 'Append or update a row in Google Sheets using the Sheets API v4 request shape.'),
      h('div', { style: { marginTop: 8, fontSize: 12, fontWeight: 700, color: '#7c3aed' } }, GOOGLE_SHEETS_PANEL_BADGE)
    ),
    cfgSection('Destination', 'Target spreadsheet and sheet range.', h('div', null,
      cfgField('Spreadsheet ID *', h('input', guardProps({ className: 'mf-rf-cfg-input', value: c.spreadsheetId || '', placeholder: '1AbCdEf...', onChange: function (e: any) { patch({ spreadsheetId: e.target.value }); } }))),
      cfgField('Sheet / Range *', h('input', guardProps({ className: 'mf-rf-cfg-input', value: c.range || '', placeholder: 'Sheet1!A:D', onChange: function (e: any) { patch({ range: e.target.value, sheetName: e.target.value }); } }))),
      h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
        cfgField('Operation', h('select', guardProps({ className: 'mf-rf-cfg-input', value: c.operation || 'append', onChange: function (e: any) { patch({ operation: e.target.value }); } }),
          h('option', { value: 'append' }, 'Append row'),
          h('option', { value: 'update' }, 'Update range')
        )),
        cfgField('Value input option', h('select', guardProps({ className: 'mf-rf-cfg-input', value: c.valueInputOption || 'USER_ENTERED', onChange: function (e: any) { patch({ valueInputOption: e.target.value }); } }),
          h('option', { value: 'USER_ENTERED' }, 'USER_ENTERED'),
          h('option', { value: 'RAW' }, 'RAW')
        ))
      ),
      (c.operation || 'append') === 'append' ? cfgField('Insert data option', h('select', guardProps({ className: 'mf-rf-cfg-input', value: c.insertDataOption || 'INSERT_ROWS', onChange: function (e: any) { patch({ insertDataOption: e.target.value }); } }),
        h('option', { value: 'INSERT_ROWS' }, 'INSERT_ROWS'),
        h('option', { value: 'OVERWRITE' }, 'OVERWRITE')
      )) : null
    )),
    cfgSection('Column mappings', 'Map each sheet column to a form field or a fixed value.', h('div', null,
      mappings.map(function (row: any, idx: number) {
        return h('div', { key: row.id, className: 'mf-rf-map-card', style: { marginBottom: 10 } },
          h('div', { className: 'mf-rf-row2 mf-rf-row2--stackable' },
            cfgField('Column ' + (idx + 1), h('input', guardProps({ className: 'mf-rf-cfg-input', value: row.column || '', placeholder: idx === 0 ? 'A' : '', onChange: function (e: any) { setMappingRow(idx, { column: e.target.value }); } }))),
            cfgField('Form field', h('select', guardProps({ className: 'mf-rf-cfg-input', value: row.source || '', onChange: function (e: any) { setMappingRow(idx, { source: e.target.value }); } }),
              h('option', { value: '' }, 'Select field...'),
              fields.map(function (f: any) { return h('option', { key: String(f.key || '') + '-' + idx, value: String(f.key || '') }, String(f.label || f.key || '') + ' (' + String(f.key || '') + ')'); })
            ))
          ),
          cfgFieldRow('Fixed value', 'mf-wf-gs-fixed-' + idx, h('input', guardProps({ id: 'mf-wf-gs-fixed-' + idx, className: 'mf-rf-cfg-input', value: row.value || '', placeholder: 'Optional static value', onChange: function (e: any) { setMappingRow(idx, { value: e.target.value }); } })), h(FieldInsertButton, { targetId: 'mf-wf-gs-fixed-' + idx }))
        );
      })
    )),
    cfgSection('Request preview', 'This is the canonical request shape the node will persist with the workflow definition.', h('div', null,
      cfgField('HTTP request', h('pre', { className: 'mf-rf-sql-preview__code', style: { whiteSpace: 'pre-wrap' } }, requestUrlPreview())),
      cfgField('JSON body', h('pre', { className: 'mf-rf-sql-preview__code', style: { whiteSpace: 'pre-wrap' } }, requestBodyPreview())),
      cfgField('Fetch snippet', h('pre', { className: 'mf-rf-sql-preview__code', style: { whiteSpace: 'pre-wrap' } }, fetchSnippet()))
    ))
  );
}
