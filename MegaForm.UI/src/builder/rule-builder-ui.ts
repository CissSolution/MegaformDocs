/* ============================================================
   MegaForm Rule Builder UI v1.0
   Visual rule editor that integrates into the builder's right panel.

   Depends on:
     - megaform-builder-core.js   (MegaFormBuilder)
     - megaform-rule-engine.js    (MegaFormRules)

   Adds a "Rules" tab to the right panel.
   DOM IDs required in the host page:
     #mf-tab-link-rules   — tab nav link
     #mf-tab-rules        — tab content container
   ============================================================ */
import { MegaFormBuilder } from './core';
(function () {
    'use strict';

    /* ── Wait for deps ───────────────────────────────────────── */
    if (typeof MegaFormBuilder === 'undefined') {
        console.warn('[RuleBuilderUI] MegaFormBuilder not found. Load megaform-builder-core.js first.');
        return;
    }
    if (typeof MegaFormRules === 'undefined') {
        console.warn('[RuleBuilderUI] MegaFormRules not found. Load megaform-rule-engine.js first.');
        return;
    }

    var B = MegaFormBuilder;
    var R = MegaFormRules;

    /* ── State ───────────────────────────────────────────────── */
    var state = {
        rules:        [],   // RuleDefinition[]
        selectedIdx:  -1
    };

    /* ── Operator labels ─────────────────────────────────────── */
    var OP_LABELS = {
        eq: '= equals', neq: '≠ not equals',
        gt: '> greater than', gte: '≥ ≥ or equal',
        lt: '< less than', lte: '≤ ≤ or equal',
        contains: 'contains', startsWith: 'starts with', endsWith: 'ends with',
        'in': 'in list', notIn: 'not in list',
        isEmpty: 'is empty', isNotEmpty: 'is not empty',
        isTrue: 'is true', isFalse: 'is false'
    };

    var OPS_BY_TYPE = {
        text:     ['eq','neq','contains','startsWith','endsWith','isEmpty','isNotEmpty'],
        textarea: ['eq','neq','contains','startsWith','endsWith','isEmpty','isNotEmpty'],
        number:   ['eq','neq','gt','gte','lt','lte','isEmpty','isNotEmpty'],
        select:   ['eq','neq','in','notIn','isEmpty','isNotEmpty'],
        radio:    ['eq','neq','in','notIn'],
        checkbox: ['isTrue','isFalse','eq','neq'],
        date:     ['eq','neq','gt','gte','lt','lte','isEmpty','isNotEmpty'],
        email:    ['eq','neq','contains','isEmpty','isNotEmpty'],
        phone:    ['eq','neq','isEmpty','isNotEmpty'],
        url:      ['eq','neq','contains','isEmpty','isNotEmpty'],
        default:  ['eq','neq','isEmpty','isNotEmpty']
    };

    var ACTION_LABELS = {
        show: 'Show', hide: 'Hide',
        require: 'Require', optional: 'Optional',
        enable: 'Enable', disable: 'Disable',
        setValue: 'Set Value', clear: 'Clear'
    };

    /* ── Helpers ─────────────────────────────────────────────── */
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function getSchema() {
        // Build schema from builder's current field list
        var fields = [];
        var sections = [];
        var steps = [];
        var schema = B.state && B.state.schema;
        if (schema && schema.fields) {
            schema.fields.forEach(function(f) {
                if (!f || !f.key || f.type === 'Row') return;
                fields.push({ key: f.key, label: f.label || f.key, type: (f.type || 'text').toLowerCase() });
            });
        }
        return { fields: fields, sections: sections, steps: steps };
    }

    function getFieldDef(key) {
        var schema = getSchema();
        for (var i = 0; i < schema.fields.length; i++) {
            if (schema.fields[i].key === key) return schema.fields[i];
        }
        return null;
    }

    function getOpsForField(key) {
        var f = getFieldDef(key);
        var type = f ? f.type : 'text';
        return OPS_BY_TYPE[type] || OPS_BY_TYPE['default'];
    }

    /* ── Load / Save rules from builder state ────────────────── */
    function loadRules() {
        var schema = B.state && B.state.schema;
        if (!schema) return;
        // Priority: schema.settings.rules (template path) > schema.rulesJson > schema.rules
        var settingsRules = schema.settings && schema.settings.rules;
        if (Array.isArray(settingsRules) && settingsRules.length) {
            state.rules = settingsRules;
            return;
        }
        var raw = schema.rulesJson || schema.rules;
        if (typeof raw === 'string') {
            try { state.rules = JSON.parse(raw) || []; } catch(e) { state.rules = []; }
        } else if (Array.isArray(raw)) {
            state.rules = raw;
        } else {
            state.rules = [];
        }
    }

    function saveRules() {
        var schema = B.state && B.state.schema;
        if (!schema) return;
        // Save to both paths for compatibility
        if (!schema.settings) schema.settings = {};
        schema.settings.rules = state.rules;
        schema.rulesJson = JSON.stringify(state.rules);
        if (B.state) B.state.isDirty = true;
        // Refresh canvas badges
        if (B.callModule) B.callModule('canvas', 'renderBadges');
    }

    /* ── Render rules list (sidebar) ─────────────────────────── */
    function renderRulesList(container) {
        var html = '<div class="mf-rules-list">';
        if (!state.rules.length) {
            html += '<div class="mf-rules-empty"><i class="fas fa-code-branch" style="font-size:24px;color:#cbd5e1;display:block;margin-bottom:8px"></i><p style="color:#94a3b8;font-size:12px;margin:0">No rules yet.<br>Click + to add one.</p></div>';
        } else {
            state.rules.forEach(function(rule, idx) {
                var active = (idx === state.selectedIdx) ? ' mf-rule-item-active' : '';
                var badge = rule.enabled ? '<span class="mf-rule-badge-on">ON</span>' : '<span class="mf-rule-badge-off">OFF</span>';
                html += '<div class="mf-rule-item' + active + '" data-idx="' + idx + '">'
                      + '<div style="display:flex;align-items:center;gap:6px;min-width:0">'
                      + badge
                      + '<span class="mf-rule-name" title="' + esc(rule.name) + '">' + esc(rule.name) + '</span>'
                      + '</div>'
                      + '<button class="mf-rule-del" data-idx="' + idx + '" title="Delete"><i class="fas fa-times"></i></button>'
                      + '</div>';
            });
        }
        html += '</div>';
        html += '<button class="mf-rules-add-btn" id="mf-rules-add"><i class="fas fa-plus"></i> Add Rule</button>';
        container.innerHTML = html;

        // Events — list items
        container.querySelectorAll('.mf-rule-item').forEach(function(el) {
            el.addEventListener('click', function(e) {
                if (e.target.closest('.mf-rule-del')) return;
                state.selectedIdx = parseInt(el.getAttribute('data-idx'), 10);
                render();
            });
        });
        container.querySelectorAll('.mf-rule-del').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var idx = parseInt(btn.getAttribute('data-idx'), 10);
                state.rules.splice(idx, 1);
                if (state.selectedIdx >= state.rules.length) state.selectedIdx = state.rules.length - 1;
                saveRules();
                render();
            });
        });
        var addBtn = container.querySelector('#mf-rules-add');
        if (addBtn) addBtn.addEventListener('click', function() {
            var newRule = R.createRuleDefinition('Rule ' + (state.rules.length + 1));
            var schema = getSchema();
            if (schema.fields.length) {
                newRule.when.children[0].field = schema.fields[0].key;
            }
            state.rules.push(newRule);
            state.selectedIdx = state.rules.length - 1;
            saveRules();
            render();
        });
    }

    /* ── Render rule editor (right side) ─────────────────────── */
    function renderRuleEditor(container) {
        if (state.selectedIdx < 0 || state.selectedIdx >= state.rules.length) {
            container.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#94a3b8;font-size:12px">'
                + '<i class="fas fa-code-branch" style="font-size:28px;display:block;margin-bottom:10px;color:#cbd5e1"></i>'
                + 'Select a rule to edit it,<br>or click + to create one.</div>';
            return;
        }

        var rule = state.rules[state.selectedIdx];
        var html = '<div class="mf-rule-editor">';

        // Header
        html += '<div class="mf-rule-editor-head">'
              + '<input type="text" class="mf-rule-name-input" id="mf-re-name" value="' + esc(rule.name) + '" placeholder="Rule name"/>'
              + '<div style="display:flex;gap:6px;align-items:center">'
              + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#64748b;cursor:pointer">'
              + '<input type="checkbox" id="mf-re-enabled"' + (rule.enabled ? ' checked' : '') + '/> Enabled</label>'
              + '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#64748b">'
              + 'Priority <input type="number" id="mf-re-priority" value="' + (rule.priority || 1) + '" min="1" style="width:44px;font-size:11px;padding:2px 4px;border:1px solid #e2e8f0;border-radius:4px"/>'
              + '</label>'
              + '</div>'
              + '</div>';

        // WHEN
        html += '<div class="mf-re-section">'
              + '<div class="mf-re-section-title"><i class="fas fa-question-circle"></i> WHEN</div>'
              + renderGroupHTML(rule.when, 'when', 0)
              + '</div>';

        // THEN
        html += '<div class="mf-re-section">'
              + '<div class="mf-re-section-title" style="color:#059669"><i class="fas fa-check-circle"></i> THEN (if matched)</div>'
              + renderActionsHTML(rule.then, 'then')
              + '</div>';

        // ELSE
        html += '<div class="mf-re-section">'
              + '<div class="mf-re-section-title" style="color:#dc2626"><i class="fas fa-times-circle"></i> ELSE (if not matched)</div>'
              + renderActionsHTML(rule.else, 'else')
              + '</div>';

        html += '</div>';
        container.innerHTML = html;
        bindEditorEvents(container, rule);
    }

    /* ── Render condition group ──────────────────────────────── */
    function renderGroupHTML(group, path, depth) {
        var bgColor = depth === 0 ? '#f8fafc' : '#f1f5f9';
        var html = '<div class="mf-cg" data-path="' + esc(path) + '" style="background:' + bgColor + '">'
                 + '<div class="mf-cg-head">'
                 + 'Match <select class="mf-cg-logic" data-path="' + esc(path) + '">'
                 + '<option value="all"' + (group.logic === 'all' ? ' selected' : '') + '>ALL</option>'
                 + '<option value="any"' + (group.logic === 'any' ? ' selected' : '') + '>ANY</option>'
                 + '</select> of the following'
                 + '<div style="margin-left:auto;display:flex;gap:4px">'
                 + '<button class="mf-cg-add-rule" data-path="' + esc(path) + '">+ Condition</button>'
                 + (depth < 2 ? '<button class="mf-cg-add-group" data-path="' + esc(path) + '">+ Group</button>' : '')
                 + '</div>'
                 + '</div>'
                 + '<div class="mf-cg-children">';

        var children = group.children || [];
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            var childPath = path + '.' + i;
            if (child.type === 'group') {
                html += '<div class="mf-nested-group">'
                      + '<div class="mf-nested-group-head">Nested group '
                      + '<button class="mf-remove-node" data-path="' + esc(childPath) + '">Remove</button></div>'
                      + renderGroupHTML(child, childPath, depth + 1)
                      + '</div>';
            } else {
                html += renderRuleRowHTML(child, childPath);
            }
        }

        html += '</div></div>';
        return html;
    }

    function renderRuleRowHTML(node, path) {
        var schema = getSchema();
        var ops = getOpsForField(node.field);
        var isBool = (node.operator === 'isTrue' || node.operator === 'isFalse' || node.operator === 'isEmpty' || node.operator === 'isNotEmpty');
        var fieldDef = getFieldDef(node.field);

        var html = '<div class="mf-cr" data-path="' + esc(path) + '">'
                 + '<div class="mf-cr-drag" title="Drag to reorder">⋮⋮</div>'
                 // Field select
                 + '<select class="mf-cr-field" data-path="' + esc(path) + '">'
                 + schema.fields.map(function(f) {
                     return '<option value="' + esc(f.key) + '"' + (f.key === node.field ? ' selected' : '') + '>' + esc(f.label) + '</option>';
                   }).join('')
                 + (schema.fields.length === 0 ? '<option value="">No fields</option>' : '')
                 + '</select>'
                 // Operator select
                 + '<select class="mf-cr-op" data-path="' + esc(path) + '">'
                 + ops.map(function(op) {
                     return '<option value="' + op + '"' + (op === node.operator ? ' selected' : '') + '>' + (OP_LABELS[op] || op) + '</option>';
                   }).join('')
                 + '</select>';

        // Value input (hidden for boolean ops)
        if (!isBool) {
            if (fieldDef && fieldDef.options && fieldDef.options.length) {
                html += '<select class="mf-cr-val" data-path="' + esc(path) + '">'
                      + '<option value="">Select…</option>'
                      + fieldDef.options.map(function(o) {
                          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(node.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
                        }).join('')
                      + '</select>';
            } else {
                html += '<input type="text" class="mf-cr-val" data-path="' + esc(path) + '" value="' + esc(node.value) + '" placeholder="Value"/>';
            }
        } else {
            html += '<span style="flex:1"></span>';
        }

        html += '<button class="mf-remove-node" data-path="' + esc(path) + '">✕</button>'
              + '</div>';
        return html;
    }

    /* ── Render actions list ─────────────────────────────────── */
    function renderActionsHTML(actions, branch) {
        var html = '<div class="mf-actions-list" data-branch="' + branch + '">';
        var schema = getSchema();
        (actions || []).forEach(function(action, i) {
            var path = branch + '.' + i;
            var needsValue = (action.action === 'setValue');
            html += '<div class="mf-action-row" data-path="' + esc(path) + '">'
                  // Action type
                  + '<select class="mf-act-type" data-path="' + esc(path) + '">'
                  + Object.keys(ACTION_LABELS).map(function(k) {
                      return '<option value="' + k + '"' + (k === action.action ? ' selected' : '') + '>' + ACTION_LABELS[k] + '</option>';
                    }).join('')
                  + '</select>'
                  // Target type
                  + '<select class="mf-act-ttype" data-path="' + esc(path) + '">'
                  + '<option value="field"'   + (action.targetType === 'field'   ? ' selected' : '') + '>Field</option>'
                  + '<option value="section"' + (action.targetType === 'section' ? ' selected' : '') + '>Section</option>'
                  + '<option value="step"'    + (action.targetType === 'step'    ? ' selected' : '') + '>Step</option>'
                  + '</select>'
                  // Target
                  + '<select class="mf-act-target" data-path="' + esc(path) + '">'
                  + '<option value="">Select target</option>'
                  + schema.fields.map(function(f) {
                      return '<option value="' + esc(f.key) + '"' + (f.key === action.target ? ' selected' : '') + '>' + esc(f.label) + '</option>';
                    }).join('')
                  + '</select>'
                  // setValue input
                  + (needsValue ? '<input type="text" class="mf-act-val" data-path="' + esc(path) + '" value="' + esc(action.value) + '" placeholder="Value"/>' : '')
                  + '<button class="mf-remove-action" data-path="' + esc(path) + '">✕</button>'
                  + '</div>';
        });
        html += '<button class="mf-add-action" data-branch="' + branch + '">+ Action</button>';
        html += '</div>';
        return html;
    }

    /* ── Bind events on editor ───────────────────────────────── */
    function bindEditorEvents(container, rule) {
        // Name
        var nameInput = container.querySelector('#mf-re-name');
        if (nameInput) nameInput.addEventListener('input', function() {
            rule.name = this.value;
            saveRules();
            // Update list item name without full re-render
            var listEl = document.querySelector('.mf-rule-item[data-idx="' + state.selectedIdx + '"] .mf-rule-name');
            if (listEl) listEl.textContent = rule.name;
        });

        // Enabled
        var enabledCb = container.querySelector('#mf-re-enabled');
        if (enabledCb) enabledCb.addEventListener('change', function() {
            rule.enabled = this.checked;
            saveRules();
            render();
        });

        // Priority
        var prioInput = container.querySelector('#mf-re-priority');
        if (prioInput) prioInput.addEventListener('change', function() {
            rule.priority = parseInt(this.value, 10) || 1;
            saveRules();
        });

        // Logic toggles
        container.querySelectorAll('.mf-cg-logic').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var group = getNodeByPath(rule, sel.getAttribute('data-path'));
                if (group) { group.logic = sel.value; saveRules(); }
            });
        });

        // Add condition
        container.querySelectorAll('.mf-cg-add-rule').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var group = getNodeByPath(rule, btn.getAttribute('data-path'));
                if (!group) return;
                var schema = getSchema();
                group.children.push(R.createConditionRule(schema.fields[0] ? schema.fields[0].key : '', 'eq', ''));
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Add nested group
        container.querySelectorAll('.mf-cg-add-group').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var group = getNodeByPath(rule, btn.getAttribute('data-path'));
                if (!group) return;
                group.children.push(R.createConditionGroup('all'));
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Remove node
        container.querySelectorAll('.mf-remove-node').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var path = btn.getAttribute('data-path');
                removeNodeByPath(rule, path);
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Field change in condition row
        container.querySelectorAll('.mf-cr-field').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var node = getNodeByPath(rule, sel.getAttribute('data-path'));
                if (!node) return;
                node.field = sel.value;
                var ops = getOpsForField(sel.value);
                node.operator = ops[0] || 'eq';
                node.value = '';
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Operator change
        container.querySelectorAll('.mf-cr-op').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var node = getNodeByPath(rule, sel.getAttribute('data-path'));
                if (!node) return;
                node.operator = sel.value;
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Value change
        container.querySelectorAll('.mf-cr-val').forEach(function(el) {
            el.addEventListener('change', function() {
                var node = getNodeByPath(rule, el.getAttribute('data-path'));
                if (node) { node.value = el.value; saveRules(); }
            });
        });

        // Action type change
        container.querySelectorAll('.mf-act-type').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var action = getActionByPath(rule, sel.getAttribute('data-path'));
                if (!action) return;
                action.action = sel.value;
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Action target type
        container.querySelectorAll('.mf-act-ttype').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var action = getActionByPath(rule, sel.getAttribute('data-path'));
                if (!action) return;
                action.targetType = sel.value;
                action.target = '';
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Action target
        container.querySelectorAll('.mf-act-target').forEach(function(sel) {
            sel.addEventListener('change', function() {
                var action = getActionByPath(rule, sel.getAttribute('data-path'));
                if (action) { action.target = sel.value; saveRules(); }
            });
        });

        // Action value
        container.querySelectorAll('.mf-act-val').forEach(function(el) {
            el.addEventListener('input', function() {
                var action = getActionByPath(rule, el.getAttribute('data-path'));
                if (action) { action.value = el.value; saveRules(); }
            });
        });

        // Remove action
        container.querySelectorAll('.mf-remove-action').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var path = btn.getAttribute('data-path');
                var parts = path.split('.');
                var branch = parts[0];  // 'then' or 'else'
                var idx    = parseInt(parts[1], 10);
                rule[branch].splice(idx, 1);
                saveRules(); renderEditorOnly(container, rule);
            });
        });

        // Add action
        container.querySelectorAll('.mf-add-action').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var branch = btn.getAttribute('data-branch');
                if (!rule[branch]) rule[branch] = [];
                rule[branch].push(R.createAction('show'));
                saveRules(); renderEditorOnly(container, rule);
            });
        });
    }

    function renderEditorOnly(container, rule) {
        renderRuleEditor(container);
    }

    /* ── Path helpers ────────────────────────────────────────── */
    // path format: "when.0.1" = rule.when.children[0].children[1]
    function getNodeByPath(rule, path) {
        var parts = path.split('.');
        var node = rule;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (p === 'when') { node = node.when; continue; }
            if (p === 'then' || p === 'else') return null;
            var idx = parseInt(p, 10);
            if (isNaN(idx)) return null;
            if (!node.children) return null;
            node = node.children[idx];
            if (!node) return null;
        }
        return node;
    }

    function getActionByPath(rule, path) {
        var parts = path.split('.');
        var branch = parts[0]; // 'then' or 'else'
        var idx    = parseInt(parts[1], 10);
        if (isNaN(idx)) return null;
        return rule[branch] ? rule[branch][idx] : null;
    }

    function removeNodeByPath(rule, path) {
        var parts = path.split('.');
        // Navigate to parent
        var parent = rule;
        for (var i = 0; i < parts.length - 1; i++) {
            var p = parts[i];
            if (p === 'when') { parent = parent.when; continue; }
            var idx = parseInt(p, 10);
            if (isNaN(idx) || !parent.children) return;
            parent = parent.children[idx];
        }
        var lastIdx = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastIdx) && parent.children) {
            parent.children.splice(lastIdx, 1);
        }
    }

    /* ── CSS injection ───────────────────────────────────────── */
    function injectCSS() {
        if (document.getElementById('mf-rule-ui-css')) return;
        var style = document.createElement('style');
        style.id = 'mf-rule-ui-css';
        style.textContent = [
            '.mf-rules-wrap{display:flex;height:100%;overflow:hidden}',
            '.mf-rules-sidebar{width:168px;flex-shrink:0;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;background:#fafafa}',
            '.mf-rules-sidebar-head{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:12px;color:#334155}',
            '.mf-rules-list{flex:1;overflow-y:auto;padding:4px}',
            '.mf-rules-empty{padding:20px 10px;text-align:center}',
            '.mf-rule-item{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:6px;cursor:pointer;margin-bottom:2px;gap:4px}',
            '.mf-rule-item:hover{background:#f1f5f9}',
            '.mf-rule-item-active{background:#eff6ff !important;outline:1.5px solid #6366f1}',
            '.mf-rule-name{font-size:11px;font-weight:500;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px}',
            '.mf-rule-badge-on{font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:#dcfce7;color:#16a34a;flex-shrink:0}',
            '.mf-rule-badge-off{font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;background:#f1f5f9;color:#94a3b8;flex-shrink:0}',
            '.mf-rule-del{background:none;border:none;cursor:pointer;color:#94a3b8;padding:2px;line-height:1;font-size:10px;flex-shrink:0}',
            '.mf-rule-del:hover{color:#ef4444}',
            '.mf-rules-add-btn{margin:6px 8px;padding:5px;border:1.5px dashed #cbd5e1;background:transparent;border-radius:6px;cursor:pointer;font-size:11px;color:#6366f1;font-weight:600;width:calc(100% - 16px)}',
            '.mf-rules-add-btn:hover{background:#f5f3ff;border-color:#6366f1}',

            '.mf-rules-editor-wrap{flex:1;overflow-y:auto;padding:10px}',
            '.mf-rule-editor{}',
            '.mf-rule-editor-head{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e2e8f0}',
            '.mf-rule-name-input{font-weight:600;font-size:13px;border:1.5px solid #e2e8f0;border-radius:6px;padding:5px 8px;width:100%;outline:none}',
            '.mf-rule-name-input:focus{border-color:#6366f1}',

            '.mf-re-section{margin-bottom:10px}',
            '.mf-re-section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:6px;display:flex;align-items:center;gap:5px}',

            '.mf-cg{border:1.5px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:4px}',
            '.mf-cg-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:#64748b;flex-wrap:wrap}',
            '.mf-cg-logic{font-size:11px;padding:2px 4px;border:1px solid #e2e8f0;border-radius:4px;font-weight:700;color:#6366f1}',
            '.mf-cg-add-rule,.mf-cg-add-group{font-size:10px;padding:2px 7px;border:1px solid #6366f1;border-radius:4px;background:transparent;color:#6366f1;cursor:pointer;font-weight:600}',
            '.mf-cg-add-rule:hover,.mf-cg-add-group:hover{background:#f5f3ff}',
            '.mf-cg-children{display:flex;flex-direction:column;gap:4px}',
            '.mf-nested-group{border:1.5px dashed #c7d2fe;border-radius:6px;padding:6px}',
            '.mf-nested-group-head{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;color:#6366f1;margin-bottom:4px}',

            '.mf-cr{display:flex;align-items:center;gap:4px;padding:4px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;flex-wrap:wrap}',
            '.mf-cr-drag{color:#cbd5e1;cursor:grab;font-size:12px;padding:0 2px;user-select:none}',
            '.mf-cr select,.mf-cr input{font-size:11px;padding:3px 5px;border:1px solid #e2e8f0;border-radius:4px;background:#fff;min-width:0;flex:1}',
            '.mf-cr-field{max-width:100px}',
            '.mf-cr-op{max-width:110px}',
            '.mf-cr-val{max-width:90px}',
            '.mf-remove-node{background:none;border:none;cursor:pointer;color:#94a3b8;font-size:12px;padding:1px 3px;flex-shrink:0}',
            '.mf-remove-node:hover{color:#ef4444}',

            '.mf-actions-list{display:flex;flex-direction:column;gap:4px}',
            '.mf-action-row{display:flex;align-items:center;gap:4px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:6px;flex-wrap:wrap}',
            '.mf-action-row select,.mf-action-row input{font-size:11px;padding:3px 5px;border:1px solid #e2e8f0;border-radius:4px;flex:1;min-width:60px}',
            '.mf-act-type{max-width:88px}',
            '.mf-act-ttype{max-width:68px}',
            '.mf-act-target{max-width:100px}',
            '.mf-act-val{max-width:80px}',
            '.mf-remove-action{background:none;border:none;cursor:pointer;color:#94a3b8;font-size:11px;padding:1px 3px;flex-shrink:0}',
            '.mf-remove-action:hover{color:#ef4444}',
            '.mf-add-action{font-size:10px;padding:3px 8px;border:1px dashed #cbd5e1;border-radius:4px;background:transparent;color:#6366f1;cursor:pointer;font-weight:600;margin-top:2px}',
            '.mf-add-action:hover{background:#f5f3ff;border-color:#6366f1}',

            /* ── Canvas Logic Badges ── */
            '.mf-logic-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;margin-left:4px;cursor:pointer;vertical-align:middle;letter-spacing:.01em;transition:opacity .15s}',
            '.mf-logic-badge:hover{opacity:.8}',
            '.mf-logic-source{background:#fef3c7;color:#92400e;border:1px solid #fde68a}',
            '.mf-logic-source i{color:#f59e0b}',
            '.mf-logic-target{background:#f0fdf4;color:#166534;border:1px solid #86efac}',
            '.mf-logic-target i{color:#22c55e}',
            '.mf-logic-showif{background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd}',
            '.mf-logic-showif i{color:#3b82f6}',

            /* ── Logic Summary in Field tab ── */
            '.mf-prop-logic-summary{margin:0 0 8px;padding:0 12px}',
            '.mf-logic-summary-row{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;margin-bottom:4px}',
            '.mf-logic-summary-source{background:#fffbeb;border:1px solid #fde68a}',
            '.mf-logic-summary-target{background:#f0fdf4;border:1px solid #bbf7d0}',
            '.mf-logic-summary-showif{background:#eff6ff;border:1px solid #bfdbfe}',
            '.mf-lsr-icon{font-size:13px;padding-top:1px;flex-shrink:0}',
            '.mf-logic-summary-source .mf-lsr-icon{color:#f59e0b}',
            '.mf-logic-summary-target .mf-lsr-icon{color:#22c55e}',
            '.mf-logic-summary-showif .mf-lsr-icon{color:#3b82f6}',
            '.mf-lsr-body{flex:1;min-width:0}',
            '.mf-lsr-title{font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}',
            '.mf-lsr-items{display:flex;flex-wrap:wrap;gap:4px}',
            '.mf-lsr-pill{display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:2px 7px;border-radius:8px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:opacity .15s}',
            '.mf-lsr-pill:hover{opacity:.75}',
            '.mf-lsr-pill-source{background:#fef3c7;color:#92400e;border:1px solid #fde68a;cursor:pointer}',
            '.mf-lsr-pill-target{background:#dcfce7;color:#166534;border:1px solid #86efac;cursor:pointer}',
        ].join('');
        document.head.appendChild(style);
    }

    /* ── Main render ─────────────────────────────────────────── */
    function render() {
        var tab = document.getElementById('mf-tab-rules');
        if (!tab) return;

        var sidebar = tab.querySelector('.mf-rules-sidebar');
        var editorWrap = tab.querySelector('.mf-rules-editor-wrap');

        if (!sidebar) {
            // First render — build layout
            tab.innerHTML = '<div class="mf-rules-wrap">'
                + '<div class="mf-rules-sidebar">'
                +   '<div class="mf-rules-sidebar-head"><i class="fas fa-code-branch"></i> Rules</div>'
                +   '<div class="mf-rules-list-wrap"></div>'
                + '</div>'
                + '<div class="mf-rules-editor-wrap"></div>'
                + '</div>';
            sidebar    = tab.querySelector('.mf-rules-list-wrap');
            editorWrap = tab.querySelector('.mf-rules-editor-wrap');
        } else {
            sidebar    = tab.querySelector('.mf-rules-list-wrap');
        }

        renderRulesList(sidebar);
        renderRuleEditor(editorWrap);
    }

    /* ── Module registration ─────────────────────────────────── */
    B.registerModule('rule-builder-ui', {
        init: function() {
            injectCSS();
            loadRules();
            render();
        },
        refresh: function() {
            loadRules();
            render();
        },
        selectRule: function(idx: number) {
            state.selectedIdx = idx;
            render();
        },
        getRulesJson: function() {
            return JSON.stringify(state.rules);
        }
    });

    // Global export
    (window as any).MegaFormRuleBuilderUI = {
        selectRule: function(idx: number) { state.selectedIdx = idx; render(); },
        getRules: function() { return state.rules; }
    };

    // Hook into tab activation
    document.addEventListener('click', function(e) {
        var link = e.target.closest('#mf-tab-link-rules');
        if (!link) return;
        loadRules();
        render();
    });

    // Hook into builder save — ensure rulesJson is included in payload
    var origBuildPayload = null;
    if (B.buildPayload) {
        origBuildPayload = B.buildPayload;
        B.buildPayload = function(status) {
            var payload = origBuildPayload(status);
            payload.RulesJson = JSON.stringify(state.rules);
            return payload;
        };
    }

}());

export {};
