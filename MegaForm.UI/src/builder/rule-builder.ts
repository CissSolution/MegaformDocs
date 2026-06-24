/* ============================================================
   MegaForm Rule Builder UI v1.0
   Visual editor for RuleDefinition trees.
   Depends on: megaform-builder-core.js, megaform-rule-engine.js
   ============================================================ */
(function () {
    'use strict';

    var RE = window.MegaFormRuleEngine;

    // ── Operator labels ──────────────────────────────────────────
    var OP_LABELS = {
        eq:         'equals',
        neq:        'not equals',
        gt:         'greater than',
        gte:        'greater than or equal',
        lt:         'less than',
        lte:        'less than or equal',
        contains:   'contains',
        startsWith: 'starts with',
        endsWith:   'ends with',
        in:         'in list',
        notIn:      'not in list',
        isEmpty:    'is empty',
        isNotEmpty: 'is not empty',
        isTrue:     'is true',
        isFalse:    'is false'
    };

    var OPS_BY_TYPE = {
        text:     ['eq','neq','contains','startsWith','endsWith','isEmpty','isNotEmpty'],
        textarea: ['eq','neq','contains','startsWith','endsWith','isEmpty','isNotEmpty'],
        number:   ['eq','neq','gt','gte','lt','lte','isEmpty','isNotEmpty'],
        select:   ['eq','neq','in','notIn','isEmpty','isNotEmpty'],
        radio:    ['eq','neq','in','notIn'],
        checkbox: ['isTrue','isFalse','eq','neq'],
        date:     ['eq','neq','gt','gte','lt','lte','isEmpty','isNotEmpty'],
        default:  ['eq','neq','contains','isEmpty','isNotEmpty']
    };

    var ACTION_LABELS = {
        show:'Show', hide:'Hide', require:'Require', optional:'Optional',
        enable:'Enable', disable:'Disable', setValue:'Set Value', clear:'Clear'
    };

    // ── State ────────────────────────────────────────────────────
    var _state = {
        rules:        [],   // RuleDefinition[]
        activeIndex:  -1,   // which rule is selected
        schema:       null  // FormSchema from current form
    };

    // ── Helpers ──────────────────────────────────────────────────
    function h(tag, attrs, children) {
        var el = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'className') el.className = attrs[k];
            else if (k.slice(0,2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
            else el.setAttribute(k, attrs[k]);
        });
        if (children) {
            if (typeof children === 'string') el.textContent = children;
            else if (Array.isArray(children)) children.forEach(function (c) { if (c) el.appendChild(c); });
            else el.appendChild(children);
        }
        return el;
    }

    function sel(options, current, onChange) {
        var el = document.createElement('select');
        el.className = 'form-control form-control-sm';
        options.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = typeof o === 'string' ? o : o.value;
            opt.textContent = typeof o === 'string' ? (OP_LABELS[o] || o) : o.label;
            if (opt.value === String(current)) opt.selected = true;
            el.appendChild(opt);
        });
        el.addEventListener('change', function () { onChange(el.value); });
        return el;
    }

    function inp(value, placeholder, onChange) {
        var el = document.createElement('input');
        el.type = 'text';
        el.className = 'form-control form-control-sm';
        el.value = value != null ? String(value) : '';
        el.placeholder = placeholder || '';
        el.addEventListener('input', function () { onChange(el.value); });
        return el;
    }

    function btn(label, cls, onClick) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = cls || 'btn btn-sm btn-outline-secondary';
        el.innerHTML = label;
        el.addEventListener('click', onClick);
        return el;
    }

    function getSchema() {
        // Pull schema from MegaFormBuilder state
        if (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.state && MegaFormBuilder.state.schema) {
            var s = MegaFormBuilder.state.schema;
            var fields = (s.fields || []).filter(function (f) {
                return f.type !== 'Html' && f.type !== 'Section' && f.type !== 'Hidden';
            }).map(function (f) {
                return {
                    key:   f.key,
                    label: f.label || f.key,
                    type:  (f.type || 'text').toLowerCase()
                };
            });
            var sections = (s.fields || [])
                .filter(function (f) { return f.type === 'Section'; })
                .map(function (f) { return { key: f.key, label: f.label || f.key }; });
            return { fields: fields, sections: sections, steps: [] };
        }
        return { fields: [], sections: [], steps: [] };
    }

    function getOps(fieldKey, schema) {
        var field = (schema.fields || []).find(function (f) { return f.key === fieldKey; });
        var type  = field ? (field.type || 'text') : 'text';
        return OPS_BY_TYPE[type] || OPS_BY_TYPE.default;
    }

    function getFieldOptions(fieldKey) {
        if (typeof MegaFormBuilder === 'undefined') return null;
        var fields = (MegaFormBuilder.state.schema || {}).fields || [];
        var field  = fields.find(function (f) { return f.key === fieldKey; });
        return (field && field.options && field.options.length) ? field.options : null;
    }

    // ── Persist rules into MegaFormBuilder state ─────────────────
    function persistRules() {
        if (typeof MegaFormBuilder === 'undefined') return;
        if (!MegaFormBuilder.state.schema.settings)
            MegaFormBuilder.state.schema.settings = {};
        MegaFormBuilder.state.schema.settings.rules = _state.rules;
        MegaFormBuilder.state.isDirty = true;
    }

    // ── Load rules from MegaFormBuilder state ────────────────────
    function loadRules() {
        if (typeof MegaFormBuilder === 'undefined') return;
        var settings = (MegaFormBuilder.state.schema || {}).settings || {};
        _state.rules = settings.rules || [];
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: condition node (recursive)
    // ─────────────────────────────────────────────────────────────
    function renderConditionNode(node, schema, onUpdate, onRemove) {
        var wrap = document.createElement('div');

        if (node.type === 'rule') {
            wrap.className = 'mf-rule-row';

            // Field select
            var fieldOpts = (schema.fields || []).map(function (f) {
                return { value: f.key, label: (f.label || f.key) + ' (' + f.key + ')' };
            });
            var fieldSel = sel(fieldOpts, node.field, function (v) {
                var ops = getOps(v, schema);
                node.field    = v;
                node.operator = ops[0];
                node.value    = '';
                onUpdate(node);
            });

            // Operator select
            var ops    = getOps(node.field, schema);
            var opSel  = sel(ops, node.operator, function (v) {
                node.operator = v;
                onUpdate(node);
            });

            var isBool = node.operator === 'isTrue' || node.operator === 'isFalse' ||
                         node.operator === 'isEmpty' || node.operator === 'isNotEmpty';
            var valEl = null;
            if (!isBool) {
                var fOpts = getFieldOptions(node.field);
                if (fOpts) {
                    var vOpts = [{value:'',label:'Select…'}].concat(fOpts.map(function (o) {
                        return { value: String(o.value), label: o.label };
                    }));
                    valEl = sel(vOpts, node.value, function (v) {
                        node.value = v; onUpdate(node);
                    });
                } else {
                    valEl = inp(node.value, 'Value', function (v) {
                        node.value = v; onUpdate(node);
                    });
                }
            }

            var removeBtn = btn('<i class="fas fa-times"></i>', 'btn btn-sm btn-outline-danger mf-rule-remove', function () { onRemove(node.id); });

            var dragHandle = h('div', { className: 'mf-rule-drag', title: 'Drag to reorder' }, '⋮⋮');

            wrap.appendChild(dragHandle);
            wrap.appendChild(fieldSel);
            wrap.appendChild(opSel);
            if (valEl) wrap.appendChild(valEl);
            wrap.appendChild(removeBtn);

            // drag
            wrap.draggable = true;
            wrap.dataset.nodeId = node.id;

        } else {
            // group
            wrap.className = 'mf-rule-group-nested';

            var groupHead = h('div', { className: 'mf-rule-group-head' });
            groupHead.appendChild(h('span', {}, 'Nested group:'));

            var logicSel = sel(
                [{value:'all',label:'ALL (AND)'},{value:'any',label:'ANY (OR)'}],
                node.logic,
                function (v) { node.logic = v; onUpdate(node); }
            );
            groupHead.appendChild(logicSel);

            var addRuleBtn = btn('+ Condition', 'btn btn-xs btn-outline-primary', function () {
                var firstField = (schema.fields[0] || {}).key || '';
                node.children.push(RE.createConditionRule(firstField, 'eq', ''));
                onUpdate(node);
            });
            var removeGrpBtn = btn('Remove group', 'btn btn-xs btn-outline-danger', function () { onRemove(node.id); });
            groupHead.appendChild(addRuleBtn);
            groupHead.appendChild(removeGrpBtn);
            wrap.appendChild(groupHead);

            var childContainer = h('div', { className: 'mf-rule-group-children' });
            (node.children || []).forEach(function (child) {
                childContainer.appendChild(renderConditionNode(
                    child, schema,
                    function (updated) {
                        node.children = node.children.map(function (c) { return c.id === updated.id ? updated : c; });
                        onUpdate(node);
                    },
                    function (removeId) {
                        node.children = node.children.filter(function (c) { return c.id !== removeId; });
                        onUpdate(node);
                    }
                ));
            });
            wrap.appendChild(childContainer);
        }

        return wrap;
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: action row
    // ─────────────────────────────────────────────────────────────
    function renderActionRow(action, schema, onUpdate, onRemove) {
        var row = h('div', { className: 'mf-rule-action-row' });

        var actionOpts = Object.keys(ACTION_LABELS).map(function (k) { return { value: k, label: ACTION_LABELS[k] }; });
        row.appendChild(sel(actionOpts, action.action, function (v) {
            action.action = v; onUpdate(action);
        }));

        // target type
        var ttOpts = [{value:'field',label:'Field'},{value:'section',label:'Section'},{value:'step',label:'Step'}];
        row.appendChild(sel(ttOpts, action.targetType, function (v) {
            action.targetType = v; action.target = ''; onUpdate(action);
        }));

        // target picker
        var targetOpts = [{value:'',label:'Select target…'}];
        if (action.targetType === 'field') {
            (schema.fields || []).forEach(function (f) {
                targetOpts.push({ value: f.key, label: (f.label || f.key) });
            });
        } else if (action.targetType === 'section') {
            (schema.sections || []).forEach(function (s) {
                targetOpts.push({ value: s.key, label: s.label || s.key });
            });
        } else {
            (schema.steps || []).forEach(function (s) {
                targetOpts.push({ value: s.key, label: s.label || s.key });
            });
        }
        row.appendChild(sel(targetOpts, action.target, function (v) {
            action.target = v; onUpdate(action);
        }));

        // value (only for setValue)
        if (action.action === 'setValue') {
            row.appendChild(inp(action.value, 'Value', function (v) {
                action.value = v; onUpdate(action);
            }));
        }

        row.appendChild(btn('<i class="fas fa-times"></i>', 'btn btn-sm btn-outline-danger', function () { onRemove(action.id); }));
        return row;
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: full rule editor
    // ─────────────────────────────────────────────────────────────
    function renderRuleEditor(rule, schema, onChange) {
        var wrap = h('div', { className: 'mf-rule-editor' });

        // ── Header ───────────────────────────────────────────────
        var hd = h('div', { className: 'mf-rule-editor-hd' });
        var nameInp = inp(rule.name, 'Rule name', function (v) {
            rule.name = v; onChange(rule);
        });
        nameInp.style.fontWeight = '600';
        hd.appendChild(h('span', { className: 'mf-rule-editor-label' }, 'Rule name'));
        hd.appendChild(nameInp);

        var priWrap = h('div', { className: 'mf-rule-priority' });
        priWrap.appendChild(h('span', { className: 'mf-rule-editor-label' }, 'Priority'));
        var priInp = document.createElement('input');
        priInp.type = 'number'; priInp.min = '1'; priInp.className = 'form-control form-control-sm';
        priInp.style.width = '60px'; priInp.value = String(rule.priority || 1);
        priInp.addEventListener('change', function () { rule.priority = parseInt(priInp.value) || 1; onChange(rule); });
        priWrap.appendChild(priInp);
        hd.appendChild(priWrap);

        var enWrap = h('div', { className: 'mf-rule-enabled' });
        var enChk = document.createElement('input'); enChk.type = 'checkbox'; enChk.checked = rule.enabled !== false;
        enChk.addEventListener('change', function () { rule.enabled = enChk.checked; onChange(rule); });
        enWrap.appendChild(enChk);
        enWrap.appendChild(h('span', {}, ' Enabled'));
        hd.appendChild(enWrap);

        wrap.appendChild(hd);

        // ── WHEN ─────────────────────────────────────────────────
        var whenSec = h('div', { className: 'mf-rule-section' });
        var whenHd  = h('div', { className: 'mf-rule-section-hd' });
        whenHd.appendChild(h('strong', {}, 'WHEN'));
        var logicSel = sel(
            [{value:'all',label:'ALL (AND)'},{value:'any',label:'ANY (OR)'}],
            rule.when.logic,
            function (v) { rule.when.logic = v; onChange(rule); }
        );
        whenHd.appendChild(logicSel);
        var addCondBtn = btn('+ Condition', 'btn btn-xs btn-outline-primary', function () {
            var firstField = (schema.fields[0] || {}).key || '';
            rule.when.children.push(RE.createConditionRule(firstField, 'eq', ''));
            onChange(rule);
        });
        var addGrpBtn = btn('+ Group', 'btn btn-xs btn-outline-secondary', function () {
            rule.when.children.push(RE.createConditionGroup('all'));
            onChange(rule);
        });
        whenHd.appendChild(addCondBtn);
        whenHd.appendChild(addGrpBtn);
        whenSec.appendChild(whenHd);

        var whenChildren = h('div', { className: 'mf-rule-conditions' });
        (rule.when.children || []).forEach(function (child) {
            whenChildren.appendChild(renderConditionNode(
                child, schema,
                function (updated) {
                    rule.when.children = rule.when.children.map(function (c) { return c.id === updated.id ? updated : c; });
                    onChange(rule);
                },
                function (removeId) {
                    rule.when.children = rule.when.children.filter(function (c) { return c.id !== removeId; });
                    onChange(rule);
                }
            ));
        });
        whenSec.appendChild(whenChildren);
        wrap.appendChild(whenSec);

        // ── THEN / ELSE ──────────────────────────────────────────
        function renderActionBlock(title, actions, setter) {
            var sec  = h('div', { className: 'mf-rule-section' });
            var shd  = h('div', { className: 'mf-rule-section-hd' });
            shd.appendChild(h('strong', {}, title));
            var addAct = btn('+ Action', 'btn btn-xs btn-outline-success', function () {
                actions.push(RE.createRuleAction('show'));
                setter(actions);
                onChange(rule);
            });
            shd.appendChild(addAct);
            sec.appendChild(shd);

            var actList = h('div', { className: 'mf-rule-actions' });
            actions.forEach(function (action) {
                actList.appendChild(renderActionRow(
                    action, schema,
                    function (updated) {
                        setter(actions.map(function (a) { return a.id === updated.id ? updated : a; }));
                        onChange(rule);
                    },
                    function (removeId) {
                        setter(actions.filter(function (a) { return a.id !== removeId; }));
                        onChange(rule);
                    }
                ));
            });
            sec.appendChild(actList);
            return sec;
        }

        wrap.appendChild(renderActionBlock('THEN', rule.then, function (v) { rule.then = v; }));
        wrap.appendChild(renderActionBlock('ELSE', rule.else, function (v) { rule.else = v; }));

        // ── Validation summary ───────────────────────────────────
        var errs = RE.getEmptyGroupValidation(rule.when);
        if (errs.length) {
            var errBox = h('div', { className: 'mf-rule-errors' });
            errs.forEach(function (e) { errBox.appendChild(h('div', { className: 'mf-rule-error' }, '⚠ ' + e)); });
            wrap.appendChild(errBox);
        }

        return wrap;
    }

    // ─────────────────────────────────────────────────────────────
    // RENDER: full Rules tab panel
    // ─────────────────────────────────────────────────────────────
    function renderTab(container) {
        container.innerHTML = '';
        loadRules();
        var schema = getSchema();

        // ── Rule list ────────────────────────────────────────────
        var listHeader = h('div', { className: 'mf-rules-list-hd' });
        listHeader.appendChild(h('span', { className: 'mf-rules-list-title' }, 'Conditional Rules'));
        listHeader.appendChild(btn('+ New Rule', 'btn btn-sm btn-outline-primary', function () {
            _state.rules.push(RE.createRuleDefinition('New Rule'));
            _state.activeIndex = _state.rules.length - 1;
            persistRules();
            renderTab(container);
        }));
        container.appendChild(listHeader);

        if (_state.rules.length === 0) {
            container.appendChild(h('div', { className: 'mf-rules-empty' },
                'No rules yet. Click "+ New Rule" to add conditional logic.'));
        }

        var list = h('div', { className: 'mf-rules-list' });
        _state.rules.forEach(function (rule, idx) {
            var item = h('div', {
                className: 'mf-rule-list-item' + (idx === _state.activeIndex ? ' active' : '')
            });
            var nameSpan = h('span', { className: 'mf-rule-list-name' }, rule.name || 'Untitled');
            var meta = h('span', { className: 'mf-rule-list-meta' }, 'P' + (rule.priority || 1) +
                (rule.enabled === false ? ' · disabled' : ''));
            item.appendChild(nameSpan);
            item.appendChild(meta);
            item.addEventListener('click', function () {
                _state.activeIndex = idx;
                renderTab(container);
            });

            var delBtn = btn('<i class="fas fa-trash"></i>', 'btn btn-xs btn-outline-danger mf-rule-list-del', function (e) {
                e.stopPropagation();
                _state.rules.splice(idx, 1);
                if (_state.activeIndex >= _state.rules.length) _state.activeIndex = _state.rules.length - 1;
                persistRules();
                renderTab(container);
            });
            item.appendChild(delBtn);
            list.appendChild(item);
        });
        container.appendChild(list);

        // ── Active rule editor ───────────────────────────────────
        if (_state.activeIndex >= 0 && _state.activeIndex < _state.rules.length) {
            var hr = document.createElement('hr');
            hr.style.margin = '8px 0';
            container.appendChild(hr);
            container.appendChild(renderRuleEditor(
                _state.rules[_state.activeIndex],
                schema,
                function (updatedRule) {
                    _state.rules[_state.activeIndex] = updatedRule;
                    persistRules();
                    // Partial re-render: just the list item names
                    var items = list.querySelectorAll('.mf-rule-list-name');
                    if (items[_state.activeIndex])
                        items[_state.activeIndex].textContent = updatedRule.name || 'Untitled';
                }
            ));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // REGISTER with MegaFormBuilder
    // ─────────────────────────────────────────────────────────────
    if (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.registerModule) {
        MegaFormBuilder.registerModule('ruleBuilder', {
            init: function () {
                _state.activeIndex = -1;
                loadRules();
            },
            renderTab: renderTab,
            getRules:  function () { return _state.rules; },
            loadRules: loadRules
        });
    }

    // Global export
    window.MegaFormRuleBuilder = {
        renderTab:  renderTab,
        loadRules:  loadRules,
        getRules:   function () { return _state.rules; }
    };

}());

export {};
