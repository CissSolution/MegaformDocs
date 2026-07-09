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

    // ── Shared context evaluator ─────────────────────────────────────────
    // Used by showIf rules and permission-aware display logic. This extends the
    // original workflow rule evaluator without changing its evaluateRules contract.
    function stringArray(value) {
        if (value == null) return [];
        if (Array.isArray(value)) return value.map(function (v) { return String(v == null ? '' : v); }).filter(Boolean);
        if (typeof Set !== 'undefined' && value instanceof Set) return Array.from(value).map(function (v) { return String(v == null ? '' : v); }).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        return [String(value)];
    }

    function firstArray() {
        for (var i = 0; i < arguments.length; i++) {
            var arr = stringArray(arguments[i]);
            if (arr.length) return arr;
        }
        return [];
    }

    function lookup(obj, key) {
        if (!obj || !key) return undefined;
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        var lower = String(key).toLowerCase();
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === lower) return obj[keys[i]];
        }
        if (String(key).indexOf('.') < 0) return undefined;
        var parts = String(key).split('.');
        var cur = obj;
        for (var p = 0; p < parts.length; p++) {
            cur = lookup(cur, parts[p]);
            if (cur == null) return cur;
        }
        return cur;
    }

    function getBrowserRuleContext() {
        var platform = root.__MF_PLATFORM__ || {};
        var explicit = root.__MF_RULE_CONTEXT__ || platform.ruleContext || {};
        var user = explicit.user || platform.user || platform.currentUser || platform.auth || {};
        var query = {};
        var srcQuery = explicit.query || platform.query || {};
        Object.keys(srcQuery || {}).forEach(function (key) { query[key] = srcQuery[key]; });
        try {
            var params = new URLSearchParams(root.location && root.location.search || '');
            params.forEach(function (value, key) {
                if (query[key] == null) query[key] = value;
            });
        } catch (_) {}
        return {
            roles: firstArray(explicit.roles, user.roles, user.Roles, platform.roles, platform.userRoles, platform.roleNames),
            permissions: firstArray(explicit.permissions, user.permissions, user.Permissions, platform.permissions, platform.userPermissions),
            query: query,
            user: user || {}
        };
    }

    function normalizeSourceName(source) {
        var raw = String(source || 'field').toLowerCase();
        if (raw === 'roles') return 'role';
        if (raw === 'permissions') return 'permission';
        if (raw === 'querystring') return 'query';
        return raw || 'field';
    }

    function userValues(key, ctx) {
        var user = ctx.user || {};
        var k = String(key || '').toLowerCase();
        if (k === 'id' || k === 'userid' || k === 'user_id') return stringArray(lookup(user, 'userId') != null ? lookup(user, 'userId') : lookup(user, 'id'));
        if (k === 'username' || k === 'user' || k === 'name') return stringArray(lookup(user, 'userName') != null ? lookup(user, 'userName') : (lookup(user, 'username') != null ? lookup(user, 'username') : lookup(user, 'name')));
        if (k === 'displayname' || k === 'fullname') return stringArray(lookup(user, 'displayName') != null ? lookup(user, 'displayName') : lookup(user, 'fullName'));
        if (k === 'email' || k === 'emailaddress') return stringArray(lookup(user, 'email') != null ? lookup(user, 'email') : lookup(user, 'emailAddress'));
        if (k === 'isauthenticated' || k === 'authenticated') return [String(!!(lookup(user, 'isAuthenticated') != null ? lookup(user, 'isAuthenticated') : lookup(user, 'authenticated')))];
        if (k === 'isadmin' || k === 'admin') return [String(!!(lookup(user, 'isAdmin') != null ? lookup(user, 'isAdmin') : lookup(user, 'admin')))];
        if (k === 'issuperuser' || k === 'superuser' || k === 'host') return [String(!!(lookup(user, 'isSuperUser') != null ? lookup(user, 'isSuperUser') : (lookup(user, 'superUser') != null ? lookup(user, 'superUser') : lookup(user, 'host'))))];
        if (k === 'role' || k === 'roles') return ctx.roles || [];
        return stringArray(lookup(user, key));
    }

    function resolveContextValues(rule, fieldResolver, ctx) {
        var source = normalizeSourceName(rule.sourceType);
        var key = String(rule.key || rule.fieldKey || rule.field || '').trim();
        if (source === 'role') return ctx.roles || [];
        if (source === 'permission') {
            var admin = userValues('isAdmin', ctx)[0] === 'true' || userValues('isSuperUser', ctx)[0] === 'true';
            return admin ? (ctx.permissions || []).concat(['*']) : (ctx.permissions || []);
        }
        if (source === 'query') return stringArray((ctx.query || {})[key]);
        if (source === 'user') return userValues(key, ctx);
        return stringArray(fieldResolver ? fieldResolver(key) : undefined);
    }

    function splitTargets(value) {
        var parts = String(value == null ? '' : value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        return parts.length ? parts : [''];
    }

    function equalsTarget(values, target) {
        if (values.indexOf('*') >= 0) return true;
        var targets = splitTargets(target).map(function (v) { return v.toLowerCase(); });
        return (values || []).some(function (v) { return targets.indexOf(String(v || '').toLowerCase()) >= 0; });
    }

    function compareContextRule(rule, fieldResolver, ctx) {
        ctx = ctx || getBrowserRuleContext();
        var source = normalizeSourceName(rule.sourceType);
        var key = String(rule.key || rule.fieldKey || rule.field || '').trim();
        var target = String(rule.value != null ? rule.value : ((source === 'role' || source === 'permission') ? key : ''));
        var values = resolveContextValues(rule, fieldResolver, ctx);
        var op = String(rule.operator || rule.condition || 'Equals');
        switch (op) {
            case 'Equals': case 'eq': return equalsTarget(values, target);
            case 'NotEquals': case 'neq': return !equalsTarget(values, target);
            case 'Contains': case 'contains': return values.some(function (v) { return v === '*' || String(v || '').toLowerCase().indexOf(target.toLowerCase()) >= 0; });
            case 'NotContains': return !values.some(function (v) { return String(v || '').toLowerCase().indexOf(target.toLowerCase()) >= 0; });
            case 'StartsWith': case 'startsWith': return values.some(function (v) { return String(v || '').toLowerCase().indexOf(target.toLowerCase()) === 0; });
            case 'EndsWith': case 'endsWith': return values.some(function (v) { var s = String(v || '').toLowerCase(); var t = target.toLowerCase(); return s.slice(-t.length) === t; });
            case 'GreaterThan': case 'gt': return values.some(function (v) { return Number(v) > Number(target); });
            case 'LessThan': case 'lt': return values.some(function (v) { return Number(v) < Number(target); });
            case 'GreaterOrEqual': case 'gte': return values.some(function (v) { return Number(v) >= Number(target); });
            case 'LessOrEqual': case 'lte': return values.some(function (v) { return Number(v) <= Number(target); });
            case 'IsEmpty': case 'isEmpty': return values.length === 0 || values.every(function (v) { return !String(v || '').trim(); });
            case 'IsNotEmpty': case 'isNotEmpty': return values.some(function (v) { return !!String(v || '').trim(); });
            case 'In': case 'in': return equalsTarget(values, target);
            case 'NotIn': case 'notIn': return !equalsTarget(values, target);
            default: return true;
        }
    }

    function evaluateRuleGroup(group, fieldResolver, ctx) {
        if (!group) return true;
        var conditions = (group.conditions && group.conditions.length) ? group.conditions : (group.rules || []);
        if (!conditions.length) return true;
        var results = conditions.map(function (condition) { return compareContextRule(condition, fieldResolver, ctx); });
        return String(group.operator || 'And').toLowerCase() === 'or' ? results.some(Boolean) : results.every(Boolean);
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
        // Shared context evaluation
        evaluateRuleGroup:         evaluateRuleGroup,
        evaluateRuleCondition:     compareContextRule,
        getBrowserRuleContext:     getBrowserRuleContext,
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
    root.MegaFormRules = root.MegaFormRules || MegaFormRuleEngine;

}(typeof window !== 'undefined' ? window : this));

export {};
