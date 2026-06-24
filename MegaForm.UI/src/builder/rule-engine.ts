/* ============================================================
   MegaForm Rule Engine v1.0
   Vanilla JS port of rule-builder/src/core/evaluator.ts
   Handles: nested ConditionGroup/ConditionRule trees,
   14 operators, 8 action types, priority sorting.

   Mirrors C# MegaForm.Core.Services.RuleEvaluator exactly.
   Depends on: nothing (standalone IIFE)
   ============================================================ */
(function (root) {
    'use strict';

    // ── ID generator ────────────────────────────────────────────
    function createId(prefix) {
        prefix = prefix || 'id';
        return prefix + '_' + Math.random().toString(36).slice(2, 10);
    }

    // ── Normalize (same logic as TS + C#) ───────────────────────
    function normalize(value) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
            var t = value.trim();
            if (t === 'true')  return true;
            if (t === 'false') return false;
            var n = Number(t);
            if (t !== '' && !isNaN(n)) return n;
            return t;
        }
        return value;
    }

    function toArray(value) {
        if (Array.isArray(value)) return value;
        if (value == null || value === '') return [];
        return [value];
    }

    // ── Compare single rule ──────────────────────────────────────
    function compare(rule, actualRaw) {
        var actual   = normalize(actualRaw);
        var expected = normalize(rule.value);

        switch (rule.operator) {
            case 'eq':         return actual === expected;
            case 'neq':        return actual !== expected;
            case 'gt':         return Number(actual) > Number(expected);
            case 'gte':        return Number(actual) >= Number(expected);
            case 'lt':         return Number(actual) < Number(expected);
            case 'lte':        return Number(actual) <= Number(expected);
            case 'contains':
                return String(actual  || '').toLowerCase()
                    .indexOf(String(expected || '').toLowerCase()) >= 0;
            case 'startsWith':
                return String(actual  || '').toLowerCase()
                    .indexOf(String(expected || '').toLowerCase()) === 0;
            case 'endsWith': {
                var a = String(actual || '').toLowerCase();
                var e = String(expected || '').toLowerCase();
                return a.slice(-e.length) === e;
            }
            case 'in':    return toArray(expected).some(function (v) { return normalize(v) === actual; });
            case 'notIn': return toArray(expected).every(function (v) { return normalize(v) !== actual; });
            case 'isEmpty':
                return actual == null || actual === '' ||
                    (Array.isArray(actual) && actual.length === 0);
            case 'isNotEmpty':
                return !(actual == null || actual === '' ||
                    (Array.isArray(actual) && actual.length === 0));
            case 'isTrue':  return actual === true;
            case 'isFalse': return actual === false;
            default:        return false;
        }
    }

    // ── Evaluate a tree node ─────────────────────────────────────
    function evaluateNode(node, formData) {
        if (node.type === 'rule') {
            return compare(node, formData[node.field]);
        }
        // type === 'group'
        var results = (node.children || []).map(function (child) {
            return evaluateNode(child, formData);
        });
        return node.logic === 'all'
            ? results.every(Boolean)
            : results.some(Boolean);
    }

    // ── Collect effects from matched/unmatched branch ────────────
    function collectEffects(rule, matched) {
        var actions = matched ? (rule.then || []) : (rule.else || []);
        return actions
            .filter(function (a) { return a.target; })
            .map(function (a) {
                return {
                    action:         a.action,
                    targetType:     a.targetType,
                    target:         a.target,
                    value:          a.value,
                    sourceRuleId:   rule.id,
                    sourceRuleName: rule.name
                };
            });
    }

    // ── Public evaluators ────────────────────────────────────────
    function evaluateRule(rule, formData) {
        var matched = rule.enabled !== false && evaluateNode(rule.when, formData);
        return {
            matched: matched,
            effects: collectEffects(rule, matched)
        };
    }

    function evaluateRules(rules, formData) {
        return (rules || [])
            .slice()
            .sort(function (a, b) { return (a.priority || 1) - (b.priority || 1); })
            .reduce(function (acc, rule) {
                return acc.concat(evaluateRule(rule, formData).effects);
            }, []);
    }

    // ── Validation ────────────────────────────────────────────────
    function getEmptyGroupValidation(group) {
        var errors = [];
        if (!group.children || group.children.length === 0) {
            errors.push('Group ' + group.id + ' has no children.');
        }
        (group.children || []).forEach(function (child) {
            if (child.type === 'group') {
                errors = errors.concat(getEmptyGroupValidation(child));
            } else if (!child.field) {
                errors.push('Rule ' + child.id + ' is missing field.');
            }
        });
        return errors;
    }

    // ── Factory helpers ───────────────────────────────────────────
    function createConditionRule(field, operator, value) {
        return {
            id:       createId('rule'),
            type:     'rule',
            field:    field    || '',
            operator: operator || 'eq',
            value:    value !== undefined ? value : ''
        };
    }

    function createConditionGroup(logic) {
        return {
            id:       createId('group'),
            type:     'group',
            logic:    logic || 'all',
            children: [createConditionRule()]
        };
    }

    function createRuleAction(action) {
        return {
            id:         createId('action'),
            action:     action     || 'show',
            targetType: 'field',
            target:     ''
        };
    }

    function createRuleDefinition(name) {
        return {
            id:       createId('definition'),
            name:     name || 'New Rule',
            enabled:  true,
            priority: 1,
            when:     createConditionGroup('all'),
            then:     [createRuleAction('show')],
            else:     [createRuleAction('hide')]
        };
    }

    // ── Apply effects to the live form ────────────────────────────
    // Called after evaluateRules() to actually show/hide/require fields.
    // Integrates with MegaFormRenderer DOM structure.
    function applyEffects(effects, containerSelector) {
        var container = document.querySelector(containerSelector || '.mf-form-container');
        if (!container) return;

        effects.forEach(function (effect) {
            var targets = [];
            if (effect.targetType === 'field') {
                var el = container.querySelector('[data-field-key="' + effect.target + '"]');
                if (el) targets.push(el);
            } else if (effect.targetType === 'section') {
                var els = container.querySelectorAll('[data-section-key="' + effect.target + '"]');
                for (var i = 0; i < els.length; i++) targets.push(els[i]);
            } else if (effect.targetType === 'step') {
                var stepEls = container.querySelectorAll('[data-step-key="' + effect.target + '"]');
                for (var j = 0; j < stepEls.length; j++) targets.push(stepEls[j]);
            }

            targets.forEach(function (t) {
                switch (effect.action) {
                    case 'show':     t.style.display = ''; t.removeAttribute('hidden'); break;
                    case 'hide':     t.style.display = 'none'; break;
                    case 'require': {
                        var inputs = t.querySelectorAll('input,select,textarea');
                        for (var k = 0; k < inputs.length; k++) inputs[k].required = true;
                        t.classList.add('mf-required');
                        break;
                    }
                    case 'optional': {
                        var optInputs = t.querySelectorAll('input,select,textarea');
                        for (var m = 0; m < optInputs.length; m++) optInputs[m].required = false;
                        t.classList.remove('mf-required');
                        break;
                    }
                    case 'enable': {
                        var enInputs = t.querySelectorAll('input,select,textarea,button');
                        for (var n = 0; n < enInputs.length; n++) enInputs[n].disabled = false;
                        break;
                    }
                    case 'disable': {
                        var disInputs = t.querySelectorAll('input,select,textarea,button');
                        for (var p = 0; p < disInputs.length; p++) disInputs[p].disabled = true;
                        break;
                    }
                    case 'setValue': {
                        var svInputs = t.querySelectorAll('input,select,textarea');
                        for (var q = 0; q < svInputs.length; q++) {
                            svInputs[q].value = effect.value != null ? String(effect.value) : '';
                        }
                        break;
                    }
                    case 'clear': {
                        var clInputs = t.querySelectorAll('input,select,textarea');
                        for (var r = 0; r < clInputs.length; r++) clInputs[r].value = '';
                        break;
                    }
                }
            });
        });
    }

    // ── Export ────────────────────────────────────────────────────
    var MegaFormRuleEngine = {
        // Evaluate
        evaluateRule:              evaluateRule,
        evaluateRules:             evaluateRules,
        // Validate
        getEmptyGroupValidation:   getEmptyGroupValidation,
        // Factory
        createConditionRule:       createConditionRule,
        createConditionGroup:      createConditionGroup,
        createRuleAction:          createRuleAction,
        createRuleDefinition:      createRuleDefinition,
        // DOM integration
        applyEffects:              applyEffects,
        // Util
        createId:                  createId
    };

    // Register on MegaFormBuilder if present (builder UI mode)
    if (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.registerModule) {
        MegaFormBuilder.registerModule('ruleEngine', {
            init:              function () {},
            evaluateRules:     evaluateRules,
            applyEffects:      applyEffects,
            createDefinition:  createRuleDefinition
        });
    }

    // Global export
    root.MegaFormRuleEngine = MegaFormRuleEngine;

}(typeof window !== 'undefined' ? window : this));

export {};
