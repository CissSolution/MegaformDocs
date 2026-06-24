// wf-loop.ts — Loop node config panel
// Canonical split for Loop node UI in workflow builder.

export var LOOP_PANEL_BADGE = 'WF Loop split v20260401-08';

export function renderLoopConfig(ctx: any): any {
  var h = ctx.h;
  var R = ctx.R;
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var cfgField = ctx.cfgField;
  var schema = ctx.schema || { fields: [] };
  var variables = ctx.variables || [];
  var normalizeLoopConfig = ctx.normalizeLoopConfig;

  var c = normalizeLoopConfig(config || {});

  function patch(next: any): void {
    setConfig(Object.assign({}, c, next || {}));
  }

  return h(R.Fragment, null,
    h('div', { className: 'mf-rf-helper-card', 'data-wf-loop-badge': LOOP_PANEL_BADGE },
      h('strong', null, 'Loop routing'),
      h('div', null, 'Use loop and done outputs to process repeated grid / repeater items, then finish iteration.'),
      h('div', { style: { marginTop: 6, fontSize: 11, color: '#0ea5e9', fontWeight: 700 } }, LOOP_PANEL_BADGE)
    ),
    cfgField('Iterate source', h('select', { className: 'mf-rf-cfg-input', value: c.sourceType || 'field', onChange: function (e: any) { patch({ sourceType: e.target.value }); } },
      h('option', { value: 'field' }, 'Form field'),
      h('option', { value: 'variable' }, 'Workflow variable')
    )),
    c.sourceType === 'field'
      ? cfgField('Form field', h('select', { className: 'mf-rf-cfg-input', value: c.fieldKey || '', onChange: function (e: any) { patch({ fieldKey: e.target.value }); } },
          h('option', { value: '' }, 'Select field...'),
          (schema.fields || []).map(function (f: any) { return h('option', { key: f.key, value: f.key }, String(f.label || f.key || '') + ' (' + String(f.key || '') + ')'); })
        ))
      : cfgField('Variable', h('select', { className: 'mf-rf-cfg-input', value: c.variableKey || '', onChange: function (e: any) { patch({ variableKey: e.target.value }); } },
          h('option', { value: '' }, 'Select variable...'),
          (variables || []).map(function (v: any, idx: number) { return h('option', { key: String(v.key || idx), value: String(v.key || '') }, String(v.key || 'variable')); })
        )),
    cfgField('Item variable', h('input', { className: 'mf-rf-cfg-input', value: c.itemVariable || 'loopItem', onChange: function (e: any) { patch({ itemVariable: e.target.value }); } })),
    cfgField('Index variable', h('input', { className: 'mf-rf-cfg-input', value: c.indexVariable || 'loopIndex', onChange: function (e: any) { patch({ indexVariable: e.target.value }); } })),
    cfgField('Max iterations', h('input', { type: 'number', min: 1, max: 500, className: 'mf-rf-cfg-input', value: c.maxIterations || 25, onChange: function (e: any) { patch({ maxIterations: Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 25)) }); } })),
    cfgField('Loop edge label', h('input', { className: 'mf-rf-cfg-input', value: c.loopLabel || 'Loop', onChange: function (e: any) { patch({ loopLabel: e.target.value }); } })),
    cfgField('Done edge label', h('input', { className: 'mf-rf-cfg-input', value: c.doneLabel || 'Done', onChange: function (e: any) { patch({ doneLabel: e.target.value }); } }))
  );
}
