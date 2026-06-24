// wf-switch.ts — Switch node config panel
// Canonical split for Switch node UI in workflow builder.

export var SWITCH_PANEL_BADGE = 'WF Switch split v20260401-08';

function normalizeSwitchCase(input: any, index: number): any {
  var row = input || {};
  return {
    id: 'case-' + index,
    value: String(row.value || row.Value || ''),
    label: String(row.label || row.Label || ('Case ' + (index + 1)))
  };
}

export function renderSwitchConfig(ctx: any): any {
  var h = ctx.h;
  var R = ctx.R;
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var cfgField = ctx.cfgField;
  var schema = ctx.schema || { fields: [] };
  var normalizeSwitchConfig = ctx.normalizeSwitchConfig;

  var c = normalizeSwitchConfig(config || {});
  var cases = Array.isArray(c.cases) ? c.cases.slice(0, 4) : [];
  while (cases.length < 4) cases.push(normalizeSwitchCase({}, cases.length));
  cases = cases.map(function (row: any, idx: number) { return normalizeSwitchCase(row, idx); });

  function patch(next: any): void {
    setConfig(Object.assign({}, c, next || {}));
  }

  function updateCase(idx: number, patchRow: any): void {
    var nextCases = cases.slice(0, 4);
    nextCases[idx] = Object.assign({}, normalizeSwitchCase(nextCases[idx], idx), patchRow || {}, { id: 'case-' + idx });
    patch({ cases: nextCases });
  }

  return h(R.Fragment, null,
    h('div', { className: 'mf-rf-helper-card', 'data-wf-switch-badge': SWITCH_PANEL_BADGE },
      h('strong', null, 'Switch routing'),
      h('div', null, 'Fixed 4-case routing. The node uses a hex routing shape with four numbered outputs: 1, 2, 3, 4 along the right edge.'),
      h('div', { style: { marginTop: 6, fontSize: 11, color: '#7c3aed', fontWeight: 700 } }, SWITCH_PANEL_BADGE)
    ),
    cfgField('Field', h('select', { className: 'mf-rf-cfg-input', value: c.fieldKey || '', onChange: function (e: any) { patch({ fieldKey: e.target.value }); } },
      h('option', { value: '' }, 'Select field...'),
      (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, String(f.label || f.key || '') + ' (' + String(f.key || '') + ')'); })
    )),
    cfgField('Match mode', h('select', { className: 'mf-rf-cfg-input', value: c.matchMode || 'equals', onChange: function (e: any) { patch({ matchMode: e.target.value }); } },
      h('option', { value: 'equals' }, 'Equals'),
      h('option', { value: 'contains' }, 'Contains')
    )),
    h('div', { className: 'mf-rf-cfg-field nodrag nopan nowheel' },
      h('label', { className: 'mf-rf-cfg-label' }, 'Fixed cases'),
      h('div', { style: { display: 'grid', gap: 10 } },
        cases.map(function (row: any, idx: number) {
          row = normalizeSwitchCase(row, idx);
          return h('div', { key: row.id, className: 'mf-rf-card-lite', style: { border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#fff' } },
            h('div', { style: { display: 'grid', gap: 8 } },
              h('div', { style: { fontSize: 11, fontWeight: 700, color: '#7c3aed' } }, 'Output ' + String(idx + 1)),
              h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' } },
                h('div', null,
                  h('label', { className: 'mf-rf-cfg-label', style: { marginBottom: 4 } }, 'Case label'),
                  h('input', { className: 'mf-rf-cfg-input', value: row.label || '', placeholder: 'Case ' + String(idx + 1), onChange: function (e: any) { updateCase(idx, { label: e.target.value }); } })
                ),
                h('div', null,
                  h('label', { className: 'mf-rf-cfg-label', style: { marginBottom: 4 } }, 'Match value'),
                  h('input', { className: 'mf-rf-cfg-input', value: row.value || '', placeholder: 'value-' + String(idx + 1), onChange: function (e: any) { updateCase(idx, { value: e.target.value }); } })
                )
              )
            )
          );
        })
      )
    )
  );
}
