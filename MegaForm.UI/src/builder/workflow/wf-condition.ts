// wf-condition.ts — Condition node config panel
// Canonical split for Condition node UI in workflow builder.

export var CONDITION_PANEL_BADGE = 'WF Condition split v20260401-01';

export function renderConditionConfig(ctx: any): any {
  var h = ctx.h;
  var R = ctx.R;
  var config = ctx.config || {};
  var setConfig = ctx.setConfig;
  var cfgField = ctx.cfgField;
  var ConditionGroupEditor = ctx.ConditionGroupEditor;
  var normalizeConditionConfig = ctx.normalizeConditionConfig;

  var c = normalizeConditionConfig(config || {});
  return h(R.Fragment, null,
    h('div', { className: 'mf-rf-helper-card', 'data-wf-condition-badge': CONDITION_PANEL_BADGE },
      h('strong', null, 'Condition routing'),
      h('div', null, 'Workflow follows the true/false edge labels below.'),
      h('div', { style: { marginTop: 6, fontSize: 11, color: '#7c3aed', fontWeight: 700 } }, CONDITION_PANEL_BADGE)
    ),
    h(ConditionGroupEditor, {
      groups: c.conditionGroups,
      setGroups: function (groups: any[]) {
        setConfig(Object.assign({}, c, { conditionGroups: groups }));
      }
    }),
    cfgField('True edge label',
      h('input', {
        className: 'mf-rf-cfg-input',
        value: c.trueLabel || 'Yes',
        onChange: function (e: any) {
          setConfig(Object.assign({}, c, { trueLabel: e.target.value }));
        }
      })
    ),
    cfgField('False edge label',
      h('input', {
        className: 'mf-rf-cfg-input',
        value: c.falseLabel || 'No',
        onChange: function (e: any) {
          setConfig(Object.assign({}, c, { falseLabel: e.target.value }));
        }
      })
    )
  );
}
