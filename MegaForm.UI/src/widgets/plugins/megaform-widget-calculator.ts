/**
 * MegaForm Calculator Widget — TypeScript Source (canonical)
 *
 * Compile: tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
 * Output:  Assets/js/plugins/megaform-widget-calculator.js  → synced to the 4 host wwwroots
 *
 * [Reclaimed 2026-07-28] This widget shipped for months as a build artifact with no source
 * in the repository: Assets/js is gitignored and the .ts it was compiled from was never
 * committed, so the only copy of the calculator lived in a working tree. This file is that
 * artifact brought back under source control — edit HERE, never the emitted .js.
 *
 * Features: variables (own inputs + values sourced from other fields), tiered pricing,
 * formulas with prefix/suffix/decimals, debug breakdown, builder settings UI, and the
 * display modes below.
 */
(function(){
"use strict";
/**
 * MegaForm Calculator Plugin — Helper Utilities
 */
var MegaCalc;
(function (MegaCalc) {
    /** HTML-escape for safe insertion */
    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    MegaCalc.escHtml = escHtml;
    /** Parse any value to number */
    function toNumber(val) {
        if (val == null)
            return NaN;
        if (typeof val === "number")
            return val;
        var s = String(val).trim();
        if (!s)
            return NaN;
        return Number(s);
    }
    MegaCalc.toNumber = toNumber;
    /** Clamp number between min and max */
    function clamp(n, min, max) {
        if (typeof min === "number" && isFinite(min) && n < min)
            n = min;
        if (typeof max === "number" && isFinite(max) && n > max)
            n = max;
        return n;
    }
    MegaCalc.clamp = clamp;
    /** Safe JSON parse */
    function safeJsonParse(s) {
        try {
            return JSON.parse(s);
        }
        catch (e) {
            return null;
        }
    }
    MegaCalc.safeJsonParse = safeJsonParse;
    /** Format number with locale */
    function formatNumber(num, decimals, format) {
        if (!isFinite(num))
            return "\u2014"; // em dash
        var n = Number(num).toFixed(decimals);
        var parts = n.split(".");
        if (format === "vi-VN" || format === "de-DE") {
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            return parts.length > 1 ? parts[0] + "," + parts[1] : parts[0];
        }
        // en-US default
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }
    MegaCalc.formatNumber = formatNumber;
    /** Merge widgetProps with defaults */
    function mergeConfig(wp) {
        var def = {
            variables: [],
            formulas: [{ key: "result", label: "Result", formula: "", prefix: "$", suffix: "", decimals: 2, visible: true, highlight: true }],
            tiers: [],
            showBreakdown: false,
            numberFormat: "en-US",
            displayMode: "hidden"
        };
        if (!wp)
            return def;
        return {
            variables: wp.variables || def.variables,
            formulas: wp.formulas || def.formulas,
            tiers: wp.tiers || def.tiers,
            showBreakdown: !!wp.showBreakdown,
            numberFormat: wp.numberFormat || def.numberFormat,
            displayMode: normalizeDisplayMode(wp.displayMode)
        };
    }
    /**
     * [DisplayModes 2026-07-28] The calculator runs SILENTLY by default: it computes and
     * feeds the value to whatever reads it (a Payment widget's amountFieldKey, a token, a
     * DatabaseInsert column) without painting a second total on the page — showing it next
     * to a Payment block duplicates the amount and bloats the form.
     *
     * The three visible modes all borrow the host form's look instead of imposing one, so
     * the widget lands correctly on a shadowed modern form, a flat minimal one, or a
     * traditional corporate one:
     *   input   — a readonly field that mimics the form's own inputs (.mf-input)
     *   inline  — plain sentence ("Total: 1,500,000 đ"), inherits font + colour
     *   callout — neutral order-summary box on a translucent grey that works light or dark
     * Legacy/unknown values map to callout; anything empty stays hidden.
     */
    function normalizeDisplayMode(value) {
        var v = String(value == null ? "" : value).trim().toLowerCase();
        if (v === "input" || v === "field" || v === "mimic")
            return "input";
        if (v === "inline" || v === "text")
            return "inline";
        if (v === "callout" || v === "box" || v === "summary" || v === "full" || v === "show" || v === "visible")
            return "callout";
        return "hidden";
    }
    MegaCalc.normalizeDisplayMode = normalizeDisplayMode;
    MegaCalc.mergeConfig = mergeConfig;
    /** Walk up DOM to find form container */
    function findFormContainer(el) {
        var node = el;
        while (node) {
            if (node.tagName === "FORM")
                return node;
            if (node.classList && (node.classList.contains("mf-form-wrapper") ||
                node.classList.contains("mf-custom-wrap")))
                return node;
            node = node.parentElement;
        }
        return el.parentElement || el;
    }
    MegaCalc.findFormContainer = findFormContainer;
    /** Find input element for a source field key */
    function findSourceInput(form, key) {
        // 1. By name attribute
        var el = form.querySelector('[name="' + key + '"]');
        if (el)
            return el;
        // 2. By data-field-key wrapper → input
        el = form.querySelector('[data-field-key="' + key + '"] input');
        if (el)
            return el;
        // 3. By data-field-key wrapper → select
        var sel = form.querySelector('[data-field-key="' + key + '"] select');
        if (sel)
            return sel;
        // 4. By id
        el = form.querySelector('#mf-field-' + key);
        if (el)
            return el;
        // 5. Fallback: broader wrapper search
        var wrapper = form.querySelector('.mf-field[data-key="' + key + '"]');
        if (wrapper) {
            var inp = wrapper.querySelector("input, select, textarea");
            if (inp)
                return inp;
        }
        return null;
    }
    MegaCalc.findSourceInput = findSourceInput;
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — Formula Evaluation Engine
 *
 * SAFE EVALUATION — NO eval()
 * Pipeline: processIf → processDateFunctions → processTiers → substituteVars → sanitize → new Function()
 */
var MegaCalc;
(function (MegaCalc) {
    // Allowed Math functions whitelist
    var ALLOWED_MATH = [
        "Math.abs", "Math.ceil", "Math.floor", "Math.round",
        "Math.min", "Math.max", "Math.pow", "Math.sqrt", "Math.PI"
    ];
    /**
     * Convert if(condition, then, else) → JS ternary
     * Handles nested if() by processing innermost first
     */
    function processIf(expr) {
        var maxIter = 30;
        while (expr.indexOf("if(") >= 0 && maxIter-- > 0) {
            var before = expr;
            // Match innermost if() — arguments contain no parentheses (except from previous passes)
            expr = expr.replace(/if\(\s*([^,]+?)\s*,\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/g, function (_m, cond, then_, else_) {
                return "(" + cond.trim() + " ? " + then_.trim() + " : " + else_.trim() + ")";
            });
            if (expr === before)
                break;
        }
        return expr;
    }
    MegaCalc.processIf = processIf;
    /**
     * Process date_diff(a, b) → days, date_diff_hours(a, b) → hours
     */
    function processDateFunctions(expr, vars) {
        // date_diff_hours first (longer name)
        expr = expr.replace(/date_diff_hours\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, function (_m, a, b) {
            var va = vars[a] || 0;
            var vb = vars[b] || 0;
            if (!va || !vb)
                return "0";
            return String(Math.max(0, Math.round((va - vb) / 3600000)));
        });
        // date_diff (days)
        expr = expr.replace(/date_diff\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, function (_m, a, b) {
            var va = vars[a] || 0;
            var vb = vars[b] || 0;
            if (!va || !vb)
                return "0";
            return String(Math.max(0, Math.round((va - vb) / 86400000)));
        });
        return expr;
    }
    MegaCalc.processDateFunctions = processDateFunctions;
    /**
     * Process tier(key) → lookup tiered pricing
     */
    function processTiers(expr, tiers, vars) {
        return expr.replace(/tier\(\s*(\w+)\s*\)/g, function (_m, tierKey) {
            var tier = null;
            for (var i = 0; i < tiers.length; i++) {
                if (tiers[i].key === tierKey) {
                    tier = tiers[i];
                    break;
                }
            }
            if (!tier)
                return "0";
            var inputVal = vars[tier.inputVar] || 0;
            var result = 0;
            for (var j = 0; j < tier.ranges.length; j++) {
                var r = tier.ranges[j];
                if (inputVal >= r.min && inputVal <= r.max)
                    result = r.value;
            }
            return String(result);
        });
    }
    MegaCalc.processTiers = processTiers;
    /**
     * Substitute variable names with numeric values
     * Sort keys by length desc to avoid partial replacement
     */
    function substituteVars(expr, vars) {
        var keys = [];
        for (var k in vars) {
            if (vars.hasOwnProperty(k))
                keys.push(k);
        }
        keys.sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var v = vars[key];
            if (v == null || !isFinite(v))
                v = 0;
            var escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            expr = expr.replace(new RegExp("\\b" + escaped + "\\b", "g"), "(" + String(v) + ")");
        }
        return expr;
    }
    MegaCalc.substituteVars = substituteVars;
    /**
     * Sanitize expression — only allow safe characters
     */
    function sanitize(expr) {
        var temp = expr;
        // Temporarily remove allowed Math references
        for (var i = 0; i < ALLOWED_MATH.length; i++) {
            var m = ALLOWED_MATH[i];
            var re = new RegExp(m.replace(".", "\\."), "g");
            temp = temp.replace(re, "___SAFE___");
        }
        // Remove ___SAFE___, numbers, dots, spaces
        var cleaned = temp.replace(/___SAFE___/g, "").replace(/[0-9.\s]/g, "");
        // Allow only: + - * / ( ) ? : > < = ! & | , %
        var allowed = /^[+\-*\/()?,:%><=!&|]*$/;
        if (!allowed.test(cleaned)) {
            return null;
        }
        return expr;
    }
    MegaCalc.sanitize = sanitize;
    /**
     * Safe formula evaluation — main entry point
     */
    function safeEval(formula, vars, tiers) {
        if (!formula || typeof formula !== "string" || !formula.trim()) {
            return { ok: false, result: NaN, error: "No formula" };
        }
        var expr = formula;
        // Step 1: if() → ternary
        expr = processIf(expr);
        // Step 2: date functions → numbers
        expr = processDateFunctions(expr, vars);
        // Step 3: tier() → numbers
        expr = processTiers(expr, tiers, vars);
        // Step 4: substitute variables
        var substituted = substituteVars(expr, vars);
        // Step 5: sanitize
        var safe = sanitize(substituted);
        if (safe === null) {
            return { ok: false, result: NaN, error: "Unknown variable in formula", substituted: substituted };
        }
        // Step 6: evaluate
        try {
            var fn = new Function("return (" + safe + ");");
            var result = fn();
            return {
                ok: typeof result === "number" && isFinite(result),
                result: result,
                substituted: substituted
            };
        }
        catch (e) {
            return { ok: false, result: NaN, error: e.message || "Eval error", substituted: substituted };
        }
    }
    MegaCalc.safeEval = safeEval;
    /**
     * Evaluate all formulas sequentially
     * Each result becomes available as variable for later formulas
     */
    function evaluateAll(config, varsMap) {
        var results = {};
        var formulas = config.formulas || [];
        for (var i = 0; i < formulas.length; i++) {
            var f = formulas[i];
            // Merge variables + previous results
            var allVars = {};
            var k;
            for (k in varsMap) {
                if (varsMap.hasOwnProperty(k))
                    allVars[k] = varsMap[k];
            }
            for (k in results) {
                if (results.hasOwnProperty(k))
                    allVars[k] = results[k];
            }
            var computed = safeEval(f.formula, allVars, config.tiers || []);
            results[f.key] = computed.ok ? computed.result : NaN;
        }
        return results;
    }
    MegaCalc.evaluateAll = evaluateAll;
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — Event Binding & Recalculation
 */
var MegaCalc;
(function (MegaCalc) {
    function bind(formId) {
        var roots = document.querySelectorAll('.mf-wg-calc[data-mf-form="' + formId + '"]');
        for (var i = 0; i < roots.length; i++) {
            var root = roots[i] as any;
            if (root._mfCalcBound)
                continue;
            root._mfCalcBound = true;
            var configStr = root.getAttribute("data-calc-config") || "{}";
            var config = MegaCalc.mergeConfig(MegaCalc.safeJsonParse(configStr));
            setupCalculator(root, config);
        }
    }
    MegaCalc.bind = bind;
    /**
     * [Headless 2026-07-28] The widget only owns its own markup, so hiding the result rows
     * still leaves the field's label and wrapper behind — the very chrome that made a
     * silent calculator look like an empty row. Hide the whole field group at runtime.
     * The builder canvas is left alone: an invisible field there cannot be selected or edited.
     */
    function hideHostField(root) {
        try {
            if (!root || typeof root.closest !== "function")
                return;
            if (root.closest(".mf-canvas-field, #mf-canvas-dropzone, .mf-canvas-flexgrid, .mf-builder-canvas"))
                return;
            var host = root.closest(".mf-field-group, .mf-field, .mf-flexgrid-item");
            if (host)
                host.classList.add("mf-calc-host-hidden");
        }
        catch (e) { /* never let a cosmetic guard break the calculation */ }
    }
    MegaCalc.hideHostField = hideHostField;
    function setupCalculator(root, config) {
        var recalcFn = createRecalc(root, config);
        if (config.displayMode === "hidden")
            hideHostField(root);
        // Bind own inputs
        var inputs = root.querySelectorAll(".mf-wg-calc-input");
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].addEventListener("input", recalcFn);
            inputs[j].addEventListener("change", recalcFn);
        }
        // Bind checkbox_sum
        var cbs = root.querySelectorAll('[data-var-type="checkbox_sum"] input[type="checkbox"]');
        for (var c = 0; c < cbs.length; c++) {
            cbs[c].addEventListener("change", recalcFn);
        }
        // Bind source fields
        var form = MegaCalc.findFormContainer(root);
        var markers = root.querySelectorAll(".mf-wg-calc-source");
        for (var s = 0; s < markers.length; s++) {
            var marker = markers[s];
            var sourceKey = marker.getAttribute("data-source") || "";
            if (!sourceKey)
                continue;
            var sourceInput = MegaCalc.findSourceInput(form, sourceKey);
            if (sourceInput && !sourceInput._mfCalcBound) {
                sourceInput._mfCalcBound = true;
                sourceInput.addEventListener("input", recalcFn);
                sourceInput.addEventListener("change", recalcFn);
            }
        }
        // Initial calculation
        recalcFn();
    }
    function createRecalc(root, config) {
        return function recalc() {
            var varsMap = {};
            // 1. Collect own inputs
            var inputs = root.querySelectorAll(".mf-wg-calc-input");
            for (var i = 0; i < inputs.length; i++) {
                var inp = inputs[i];
                var key = inp.getAttribute("data-var-key");
                if (!key)
                    continue;
                varsMap[key] = MegaCalc.toNumber(inp.value) || 0;
                // Update range badge
                var varType = (inp.getAttribute("data-var-type") || "").toLowerCase();
                if (varType === "range") {
                    var badge = root.querySelector('[data-range-for="' + key + '"]');
                    if (badge)
                        badge.textContent = isFinite(varsMap[key]) ? String(varsMap[key]) : "\u2014";
                }
            }
            // 2. Collect checkbox_sum
            var checkGroups = root.querySelectorAll('[data-var-type="checkbox_sum"]');
            for (var g = 0; g < checkGroups.length; g++) {
                var group = checkGroups[g];
                var gKey = group.getAttribute("data-var-key") || "";
                var sum = 0;
                var checked = group.querySelectorAll('input[type="checkbox"]:checked');
                for (var cc = 0; cc < checked.length; cc++) {
                    sum += MegaCalc.toNumber(checked[cc].value) || 0;
                }
                varsMap[gKey] = sum;
            }
            // 3. Collect source fields
            var form = MegaCalc.findFormContainer(root);
            var markers = root.querySelectorAll(".mf-wg-calc-source");
            for (var s = 0; s < markers.length; s++) {
                var marker = markers[s];
                var varKey = marker.getAttribute("data-var-key") || "";
                var sourceKey = marker.getAttribute("data-source") || "";
                var srcType = (marker.getAttribute("data-var-type") || "number").toLowerCase();
                if (!varKey || !sourceKey)
                    continue;
                var sourceInput = MegaCalc.findSourceInput(form, sourceKey);
                if (sourceInput) {
                    if (srcType === "date") {
                        var d = new Date(sourceInput.value);
                        varsMap[varKey] = isNaN(d.getTime()) ? 0 : d.getTime();
                    }
                    else {
                        varsMap[varKey] = MegaCalc.toNumber(sourceInput.value) || 0;
                    }
                }
            }
            // 4. Resolve tiers
            var tiers = config.tiers || [];
            for (var t = 0; t < tiers.length; t++) {
                var tier = tiers[t];
                var inputVal = varsMap[tier.inputVar] || 0;
                var tierResult = 0;
                for (var tr = 0; tr < tier.ranges.length; tr++) {
                    var rng = tier.ranges[tr];
                    if (inputVal >= rng.min && inputVal <= rng.max)
                        tierResult = rng.value;
                }
                varsMap[tier.key] = tierResult;
            }
            // 5. Evaluate formulas
            var results = MegaCalc.evaluateAll(config, varsMap);
            // 6. Update result rows
            var formulas = config.formulas || [];
            for (var f = 0; f < formulas.length; f++) {
                var fm = formulas[f];
                var row = root.querySelector('[data-result-key="' + fm.key + '"]') as any;
                if (!row)
                    continue;
                var val = results[fm.key];
                // Input-mimicry mode carries the value in the field itself, prefix/suffix
                // folded in — there is no number span to write to.
                if (row.tagName === "INPUT") {
                    var shown = isFinite(val)
                        ? MegaCalc.formatNumber(val, fm.decimals || 2, config.numberFormat || "en-US")
                        : "—";
                    row.value = (row.getAttribute("data-prefix") || "") + shown + (row.getAttribute("data-suffix") || "");
                    continue;
                }
                var numberEl = row.querySelector(".mf-wg-calc-result-number");
                if (!numberEl)
                    continue;
                if (isFinite(val)) {
                    numberEl.textContent = MegaCalc.formatNumber(val, fm.decimals || 2, config.numberFormat || "en-US");
                    numberEl.className = "mf-wg-calc-result-number";
                }
                else {
                    numberEl.textContent = "\u2014";
                    numberEl.className = "mf-wg-calc-result-number is-error";
                }
            }
            // 7. Update hidden input
            var hidden = root.querySelector(".mf-wg-calc-hidden");
            if (hidden) {
                var payload = { variables: varsMap, results: results };
                hidden.value = JSON.stringify(payload);
            }
            // 8. Update breakdown
            if (config.showBreakdown) {
                var pre = root.querySelector('[data-role="breakdownPre"]');
                if (pre) {
                    var lines = [];
                    lines.push("Variables:");
                    for (var vk in varsMap) {
                        if (varsMap.hasOwnProperty(vk)) {
                            lines.push("  " + vk + " = " + (isFinite(varsMap[vk]) ? String(varsMap[vk]) : "NaN"));
                        }
                    }
                    lines.push("");
                    lines.push("Results:");
                    for (var fi = 0; fi < formulas.length; fi++) {
                        var fml = formulas[fi];
                        var rv = results[fml.key];
                        lines.push("  " + fml.key + " = " + fml.formula);
                        lines.push("    \u2192 " + (isFinite(rv) ? fml.prefix + MegaCalc.formatNumber(rv, fml.decimals, config.numberFormat) + fml.suffix : "ERROR"));
                    }
                    pre.textContent = lines.join("\n");
                }
            }
        };
    }
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — Data Collection & Validation
 */
var MegaCalc;
(function (MegaCalc) {
    /** Collect calculator value as JSON string */
    function collect(fieldKey, container) {
        var root = container.querySelector(".mf-wg-calc") || container;
        var hidden = root.querySelector(".mf-wg-calc-hidden");
        return hidden ? hidden.value : "";
    }
    MegaCalc.collect = collect;
    /** Validate calculator — null = OK, string = error */
    function validate(fieldKey, container) {
        var root = container.querySelector(".mf-wg-calc") || container;
        var hidden = root.querySelector(".mf-wg-calc-hidden");
        if (!hidden || !hidden.value) {
            return "Calculator not initialized";
        }
        var data = MegaCalc.safeJsonParse(hidden.value);
        if (!data) {
            return "Invalid calculator data";
        }
        if (data.results) {
            for (var k in data.results) {
                if (data.results.hasOwnProperty(k)) {
                    if (!isFinite(data.results[k])) {
                        return "Calculation error in " + k;
                    }
                }
            }
        }
        return null;
    }
    MegaCalc.validate = validate;
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — HTML Rendering
 */
var MegaCalc;
(function (MegaCalc) {
    function render(field, formId, existingValue) {
        var wp = field.widgetProps || {};
        var cfg = MegaCalc.mergeConfig(wp);
        // Parse existing value for resume/edit
        var existingVars = null;
        if (existingValue && typeof existingValue === "string") {
            var parsed = MegaCalc.safeJsonParse(existingValue);
            if (parsed && parsed.variables)
                existingVars = parsed.variables;
        }
        var rootId = "mf-" + formId + "-" + field.key;
        var mode = cfg.displayMode;
        var headless = mode === "hidden";
        // Own inputs are the only reason this widget ever needs a card of its own; every
        // other mode borrows the host form's styling and just manages spacing.
        var ownVars = [];
        for (var i = 0; i < cfg.variables.length; i++) {
            if (!cfg.variables[i].source)
                ownVars.push(cfg.variables[i]);
        }
        var showOwnVars = ownVars.length > 0 && !headless;
        var h = "";
        // Container
        h += '<div class="mf-wg mf-wg-calc mf-wg-calc--' + mode + (showOwnVars ? " mf-wg-calc--chrome" : "") + '"';
        h += ' id="' + MegaCalc.escHtml(rootId) + '"';
        h += ' data-mf-form="' + MegaCalc.escHtml(String(formId)) + '"';
        h += ' data-field-key="' + MegaCalc.escHtml(field.key) + '"';
        h += " data-calc-config='" + MegaCalc.escHtml(JSON.stringify(cfg)) + "'";
        h += ">";
        // Variables grid (only own inputs) — a headless calculator has no UI of its own,
        // every value comes from the fields it listens to.
        if (showOwnVars) {
            h += '<div class="mf-wg-calc-grid">';
            for (var j = 0; j < ownVars.length; j++) {
                h += renderVariableInput(ownVars[j], rootId, existingVars);
            }
            h += "</div>";
        }
        // Source field markers (hidden)
        for (var k = 0; k < cfg.variables.length; k++) {
            var v = cfg.variables[k];
            if (v.source) {
                h += '<span class="mf-wg-calc-source"';
                h += ' data-var-key="' + MegaCalc.escHtml(v.key) + '"';
                h += ' data-source="' + MegaCalc.escHtml(v.source) + '"';
                h += ' data-var-type="' + MegaCalc.escHtml(v.type || "number") + '"';
                h += ' style="display:none"></span>';
            }
        }
        // Result rows
        var visibleFormulas = [];
        for (var m = 0; m < cfg.formulas.length; m++) {
            if (cfg.formulas[m].visible !== false && !headless)
                visibleFormulas.push(cfg.formulas[m]);
        }
        if (visibleFormulas.length > 0)
            h += renderResults(visibleFormulas, mode, rootId);
        // Hidden input
        h += '<input type="hidden" class="mf-wg-calc-hidden" name="' + MegaCalc.escHtml(field.key) + '" value="">';
        // Breakdown
        h += '<div class="mf-wg-calc-breakdown" data-role="breakdown" style="display:' + (cfg.showBreakdown && !headless ? "block" : "none") + ';">';
        h += '<div class="mf-wg-calc-breakdown-title">Breakdown</div>';
        h += '<pre class="mf-wg-calc-breakdown-pre" data-role="breakdownPre"></pre>';
        h += "</div>";
        h += "</div>";
        return h;
    }
    MegaCalc.render = render;
    /**
     * [DisplayModes 2026-07-28] One value-carrier per formula, shaped by the chosen mode.
     * Every shape keeps the same update hooks (data-result-key + the prefix/number/suffix
     * spans, or the readonly input itself) so the recalc loop stays mode-agnostic.
     */
    function renderResults(formulas, mode, rootId) {
        var h = "";
        if (mode === "input") {
            for (var a = 0; a < formulas.length; a++) {
                var fi = formulas[a];
                var inputId = rootId + "-out-" + fi.key;
                h += '<div class="mf-wg-calc-native">';
                h += '<label class="mf-wg-calc-native-label" for="' + MegaCalc.escHtml(inputId) + '">' + MegaCalc.escHtml(fi.label) + '</label>';
                // .mf-input is the class the form's own fields use — border, radius, focus
                // ring and background all come from whatever theme the form is wearing.
                h += '<input type="text" readonly tabindex="-1" class="mf-input mf-wg-calc-native-input"';
                h += ' id="' + MegaCalc.escHtml(inputId) + '"';
                h += ' data-result-key="' + MegaCalc.escHtml(fi.key) + '"';
                h += ' data-prefix="' + MegaCalc.escHtml(fi.prefix || "") + '"';
                h += ' data-suffix="' + MegaCalc.escHtml(fi.suffix || "") + '"';
                h += ' value="—">';
                h += '</div>';
            }
            return h;
        }
        if (mode === "inline") {
            for (var b = 0; b < formulas.length; b++) {
                var fl = formulas[b];
                h += '<p class="mf-wg-calc-inline" data-result-key="' + MegaCalc.escHtml(fl.key) + '">';
                h += '<span class="mf-wg-calc-inline-label">' + MegaCalc.escHtml(fl.label) + ':</span> ';
                h += '<strong class="mf-wg-calc-inline-value">';
                h += '<span class="mf-wg-calc-result-prefix">' + MegaCalc.escHtml(fl.prefix || "") + '</span>';
                h += '<span class="mf-wg-calc-result-number">—</span>';
                h += '<span class="mf-wg-calc-result-suffix">' + MegaCalc.escHtml(fl.suffix || "") + '</span>';
                h += '</strong></p>';
            }
            return h;
        }
        // callout — neutral order-summary box
        h += '<div class="mf-wg-calc-callout"><div class="mf-wg-calc-results">';
        for (var n = 0; n < formulas.length; n++) {
            var f = formulas[n];
            var hlClass = f.highlight ? " mf-wg-calc-result-highlight" : "";
            h += '<div class="mf-wg-calc-result-row' + hlClass + '" data-result-key="' + MegaCalc.escHtml(f.key) + '">';
            h += '<span class="mf-wg-calc-result-label">' + MegaCalc.escHtml(f.label) + '</span>';
            h += '<span class="mf-wg-calc-result-value">';
            h += '<span class="mf-wg-calc-result-prefix">' + MegaCalc.escHtml(f.prefix || "") + '</span>';
            h += '<span class="mf-wg-calc-result-number">—</span>';
            h += '<span class="mf-wg-calc-result-suffix">' + MegaCalc.escHtml(f.suffix || "") + '</span>';
            h += '</span></div>';
        }
        h += "</div></div>";
        return h;
    }
    /** Render a single variable input */
    function renderVariableInput(v, rootId, existing) {
        var vKey = v.key || "";
        var vLabel = v.label || vKey;
        var vType = (v.type || "number").toLowerCase();
        var inputId = rootId + "-" + vKey;
        var current = v["default"] != null ? v["default"] : "";
        if (existing && existing.hasOwnProperty(vKey)) {
            current = existing[vKey];
        }
        var fullClass = vType === "checkbox_sum" ? " mf-wg-calc-item-full" : "";
        var h = '<div class="mf-wg-calc-item' + fullClass + '">';
        h += '<label class="mf-wg-calc-label" for="' + MegaCalc.escHtml(inputId) + '">' + MegaCalc.escHtml(vLabel) + '</label>';
        if (vType === "select" && v.options) {
            h += '<select class="mf-wg-calc-input" data-var-key="' + MegaCalc.escHtml(vKey) + '" data-var-type="select" id="' + MegaCalc.escHtml(inputId) + '">';
            for (var i = 0; i < v.options.length; i++) {
                var opt = v.options[i];
                var sel = String(current) === String(opt.value) ? " selected" : "";
                h += '<option value="' + MegaCalc.escHtml(opt.value) + '"' + sel + '>' + MegaCalc.escHtml(opt.label) + '</option>';
            }
            h += '</select>';
        }
        else if (vType === "range") {
            var curNum = isFinite(MegaCalc.toNumber(current)) ? MegaCalc.toNumber(current) : 0;
            h += '<div class="mf-wg-calc-range">';
            h += '<input class="mf-wg-calc-input mf-wg-calc-range-input" type="range"';
            h += ' data-var-key="' + MegaCalc.escHtml(vKey) + '" data-var-type="range"';
            h += ' id="' + MegaCalc.escHtml(inputId) + '"';
            if (v.min != null)
                h += ' min="' + v.min + '"';
            if (v.max != null)
                h += ' max="' + v.max + '"';
            if (v.step != null)
                h += ' step="' + v.step + '"';
            h += ' value="' + curNum + '">';
            h += '<span class="mf-wg-calc-range-value" data-range-for="' + MegaCalc.escHtml(vKey) + '">' + curNum + '</span>';
            h += '</div>';
        }
        else if (vType === "checkbox_sum" && v.options) {
            h += '<div class="mf-wg-calc-checks" data-var-key="' + MegaCalc.escHtml(vKey) + '" data-var-type="checkbox_sum">';
            for (var c = 0; c < v.options.length; c++) {
                var co = v.options[c];
                h += '<label class="mf-wg-calc-check">';
                h += '<input type="checkbox" value="' + MegaCalc.escHtml(co.value) + '"> ' + MegaCalc.escHtml(co.label);
                h += '</label>';
            }
            h += '</div>';
        }
        else {
            // number input
            var valAttr = isFinite(MegaCalc.toNumber(current)) ? String(MegaCalc.toNumber(current)) : "";
            h += '<input class="mf-wg-calc-input" type="number"';
            h += ' data-var-key="' + MegaCalc.escHtml(vKey) + '" data-var-type="number"';
            h += ' id="' + MegaCalc.escHtml(inputId) + '"';
            if (v.min != null)
                h += ' min="' + v.min + '"';
            if (v.max != null)
                h += ' max="' + v.max + '"';
            if (v.step != null)
                h += ' step="' + v.step + '"';
            if (valAttr)
                h += ' value="' + valAttr + '"';
            h += '>';
        }
        h += '</div>';
        return h;
    }
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — Builder Settings UI
 * Plugin renders its OWN complete settings interface.
 */
var MegaCalc;
(function (MegaCalc) {
    function renderProperties(container, field, onChange) {
        if (!field.widgetProps)
            field.widgetProps = {};
        var wp = field.widgetProps;
        if (!wp.variables)
            wp.variables = [];
        if (!wp.formulas)
            wp.formulas = [{ key: "result", label: "Result", formula: "", prefix: "$", suffix: "", decimals: 2, visible: true, highlight: true }];
        if (!wp.tiers)
            wp.tiers = [];
        if (!wp.numberFormat)
            wp.numberFormat = "en-US";
        var B = (window as any).MegaFormBuilder;
        var formFields = (B && B.getFieldList) ? B.getFieldList(field.key) : [];
        var wrapper = document.createElement("div");
        wrapper.className = "mf-calc-props";
        function rebuild() {
            var h = "";
            // A. Display Settings
            h += secHdr("\ud83d\udcca", "Display Settings");
            h += selRow("displayMode", "Display", MegaCalc.normalizeDisplayMode(wp.displayMode), [
                { v: "hidden", l: "Hidden \u2014 runs silently (default)" },
                { v: "input", l: "Read-only field (matches your inputs)" },
                { v: "inline", l: "Inline text (Total: 1,500,000 \u0111)" },
                { v: "callout", l: "Summary box" }
            ]);
            h += selRow("numberFormat", "Number Format", wp.numberFormat, [
                { v: "en-US", l: "1,234.56 (US)" }, { v: "de-DE", l: "1.234,56 (EU)" }, { v: "vi-VN", l: "1.234,56 (VN)" }
            ]);
            h += chkRow("showBreakdown", "Show Debug Breakdown", wp.showBreakdown);
            // B. Variables
            h += secHdr("\u2699", "Variables");
            for (var i = 0; i < wp.variables.length; i++) {
                h += varCard(wp.variables[i], i, formFields);
            }
            h += addBtn("mf-cv-add", "Add Variable");
            // C. Tiered Pricing
            h += secHdr("\ud83d\udcb0", "Tiered Pricing (optional)");
            for (var t = 0; t < wp.tiers.length; t++) {
                h += tierCard(wp.tiers[t], t, wp.variables);
            }
            h += addBtn("mf-ct-add", "Add Tier Table");
            // D. Formulas
            h += secHdr("\ud83d\udcd0", "Formulas");
            for (var f = 0; f < wp.formulas.length; f++) {
                h += fmCard(wp.formulas[f], f);
            }
            h += addBtn("mf-cf-add", "Add Formula");
            // E. Reference
            h += formulaRef(wp);
            wrapper.innerHTML = h;
            bindPropEvents(wrapper, wp, onChange, rebuild, formFields);
        }
        rebuild();
        container.appendChild(wrapper);
    }
    MegaCalc.renderProperties = renderProperties;
    // ===== UI Helpers =====
    function secHdr(icon, title) {
        return '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.5px;margin:14px 0 8px;border-top:1px solid #e2e8f0;padding-top:10px;">' + icon + ' ' + title + '</div>';
    }
    function inpRow(cls, idx, fld, label, value, type?) {
        return '<div><label style="font-size:11px;color:#64748b;">' + label + '</label>' +
            '<input type="' + (type || "text") + '" class="form-control form-control-sm ' + cls + '" data-idx="' + idx + '" data-f="' + fld + '" value="' + MegaCalc.escHtml(value != null ? value : "") + '" /></div>';
    }
    function selRow(fld, label, value, options) {
        var h = '<div class="form-group"><label style="font-size:11px;color:#64748b;">' + label + '</label>';
        h += '<select class="form-control form-control-sm mf-cp-global" data-f="' + fld + '">';
        for (var i = 0; i < options.length; i++) {
            h += '<option value="' + options[i].v + '"' + (value === options[i].v ? ' selected' : '') + '>' + options[i].l + '</option>';
        }
        return h + '</select></div>';
    }
    function chkRow(fld, label, checked) {
        return '<div class="form-check mb-1"><input type="checkbox" class="form-check-input mf-cp-global-chk" data-f="' + fld + '"' + (checked ? ' checked' : '') + ' /><label class="form-check-label" style="font-size:12px;">' + label + '</label></div>';
    }
    function addBtn(cls, label) {
        return '<a href="#" class="' + cls + '" style="display:block;text-align:center;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;color:#6366f1;font-size:12px;font-weight:600;text-decoration:none;margin:6px 0;"><i class="fa fa-plus"></i> ' + label + '</a>';
    }
    function delBtn(cls, idx) {
        return '<a href="#" class="' + cls + '" data-idx="' + idx + '" style="color:#ef4444;font-size:13px;" title="Delete"><i class="fa fa-trash"></i></a>';
    }
    function cardStart(title, delCls, idx) {
        return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<b style="font-size:12px;color:#334155;">' + title + '</b>' + delBtn(delCls, idx) + '</div>';
    }
    // ===== Variable Card =====
    function varCard(v, i, formFields) {
        var h = cardStart("Variable #" + (i + 1), "mf-cv-del", i);
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        h += inpRow("mf-cv-f", i, "key", "Key (in formula)", v.key);
        h += inpRow("mf-cv-f", i, "label", "Label", v.label);
        // Source dropdown
        h += '<div style="grid-column:span 2;"><label style="font-size:11px;color:#64748b;"><i class="fa fa-link" style="color:#6366f1"></i> Source Field</label>';
        h += '<select class="form-control form-control-sm mf-cv-f" data-idx="' + i + '" data-f="source">';
        h += '<option value=""' + (!v.source ? ' selected' : '') + '>\u2014 Own input \u2014</option>';
        for (var fi = 0; fi < formFields.length; fi++) {
            var ff = formFields[fi];
            h += '<option value="' + MegaCalc.escHtml(ff.key) + '"' + (v.source === ff.key ? ' selected' : '') + '>' + MegaCalc.escHtml(ff.label) + ' [' + ff.type + '] \u2192 ' + ff.key + '</option>';
        }
        h += '</select></div>';
        if (!v.source) {
            h += '<div><label style="font-size:11px;color:#64748b;">Type</label>';
            h += '<select class="form-control form-control-sm mf-cv-f" data-idx="' + i + '" data-f="type">';
            var types = ["number", "range", "select", "checkbox_sum", "date"];
            for (var ti = 0; ti < types.length; ti++) {
                h += '<option value="' + types[ti] + '"' + (v.type === types[ti] ? ' selected' : '') + '>' + types[ti] + '</option>';
            }
            h += '</select></div>';
            h += inpRow("mf-cv-f", i, "default", "Default", v["default"], "number");
            h += inpRow("mf-cv-f", i, "min", "Min", v.min, "number");
            h += inpRow("mf-cv-f", i, "max", "Max", v.max, "number");
            h += inpRow("mf-cv-f", i, "step", "Step", v.step, "number");
            if (v.type === "select" || v.type === "checkbox_sum") {
                h += '<div style="grid-column:span 2;"><label style="font-size:11px;color:#64748b;">Options (value|label per line)</label>';
                var optStr = "";
                if (v.options) {
                    for (var oi = 0; oi < v.options.length; oi++) {
                        optStr += v.options[oi].value + "|" + v.options[oi].label + "\n";
                    }
                }
                h += '<textarea class="form-control form-control-sm mf-cv-opts" data-idx="' + i + '" rows="3" style="font-size:11px;">' + MegaCalc.escHtml(optStr.trim()) + '</textarea></div>';
            }
        }
        else {
            h += '<div style="grid-column:span 2;background:#f0f0ff;border-radius:6px;padding:6px 8px;font-size:11px;color:#4f46e5;"><i class="fa fa-info-circle"></i> Reads value from <b>' + MegaCalc.escHtml(v.source) + '</b></div>';
        }
        h += '</div></div>';
        return h;
    }
    // ===== Tier Card =====
    function tierCard(t, i, variables) {
        var h = cardStart("Tier: " + (t.key || "unnamed"), "mf-ct-del", i);
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        h += inpRow("mf-ct-f", i, "key", "Output Key", t.key);
        h += '<div><label style="font-size:11px;color:#64748b;">Based on variable</label>';
        h += '<select class="form-control form-control-sm mf-ct-f" data-idx="' + i + '" data-f="inputVar">';
        for (var vi = 0; vi < variables.length; vi++) {
            h += '<option value="' + MegaCalc.escHtml(variables[vi].key) + '"' + (t.inputVar === variables[vi].key ? ' selected' : '') + '>' + MegaCalc.escHtml(variables[vi].key) + '</option>';
        }
        h += '</select></div></div>';
        // Ranges table
        h += '<table style="width:100%;font-size:11px;margin-top:6px;"><tr style="color:#64748b;"><th>Min</th><th>Max</th><th>Value</th><th></th></tr>';
        var ranges = t.ranges || [];
        for (var ri = 0; ri < ranges.length; ri++) {
            h += '<tr>';
            h += '<td><input type="number" class="form-control form-control-sm mf-cr-f" data-tidx="' + i + '" data-ridx="' + ri + '" data-f="min" value="' + ranges[ri].min + '" style="width:70px"></td>';
            h += '<td><input type="number" class="form-control form-control-sm mf-cr-f" data-tidx="' + i + '" data-ridx="' + ri + '" data-f="max" value="' + ranges[ri].max + '" style="width:70px"></td>';
            h += '<td><input type="number" class="form-control form-control-sm mf-cr-f" data-tidx="' + i + '" data-ridx="' + ri + '" data-f="value" value="' + ranges[ri].value + '" style="width:70px"></td>';
            h += '<td><a href="#" class="mf-cr-del" data-tidx="' + i + '" data-ridx="' + ri + '" style="color:#ef4444"><i class="fa fa-times"></i></a></td>';
            h += '</tr>';
        }
        h += '</table>';
        h += '<a href="#" class="mf-cr-add" data-tidx="' + i + '" style="font-size:11px;color:#6366f1;">+ Add Range</a>';
        h += '</div>';
        return h;
    }
    // ===== Formula Card =====
    function fmCard(f, i) {
        var h = cardStart("#" + (i + 1) + " " + (f.key || ""), "mf-cf-del", i);
        h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">';
        h += inpRow("mf-cf-f", i, "key", "Key", f.key);
        h += inpRow("mf-cf-f", i, "label", "Label", f.label);
        h += '<div style="grid-column:span 2;">' + inpRow("mf-cf-f", i, "formula", "Formula", f.formula) + '</div>';
        h += inpRow("mf-cf-f", i, "prefix", "Prefix", f.prefix);
        h += inpRow("mf-cf-f", i, "suffix", "Suffix", f.suffix);
        h += inpRow("mf-cf-f", i, "decimals", "Decimals", f.decimals, "number");
        h += '</div>';
        h += '<div style="display:flex;gap:12px;margin-top:4px;">';
        h += '<label style="font-size:11px;"><input type="checkbox" class="mf-cf-chk" data-idx="' + i + '" data-f="visible"' + (f.visible ? ' checked' : '') + '> Visible</label>';
        h += '<label style="font-size:11px;"><input type="checkbox" class="mf-cf-chk" data-idx="' + i + '" data-f="highlight"' + (f.highlight ? ' checked' : '') + '> Highlight</label>';
        h += '</div></div>';
        return h;
    }
    // ===== Formula Reference =====
    function formulaRef(wp) {
        var h = secHdr("\ud83d\udcd6", "Formula Reference");
        h += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:11px;font-family:monospace;">';
        if (wp.variables.length > 0) {
            h += '<div><b>Variables:</b> ';
            var parts = [];
            for (var i = 0; i < wp.variables.length; i++) {
                var v = wp.variables[i];
                parts.push('<code>' + MegaCalc.escHtml(v.key) + '</code>' + (v.source ? ' \u2190' + MegaCalc.escHtml(v.source) : ''));
            }
            h += parts.join(', ') + '</div>';
        }
        if (wp.tiers.length > 0) {
            h += '<div><b>Tiers:</b> ';
            var tp = [];
            for (var t = 0; t < wp.tiers.length; t++) {
                tp.push('<code>tier(' + MegaCalc.escHtml(wp.tiers[t].key) + ')</code>');
            }
            h += tp.join(', ') + '</div>';
        }
        if (wp.formulas.length > 0) {
            h += '<div><b>Results:</b> ';
            var fp = [];
            for (var f = 0; f < wp.formulas.length; f++) {
                fp.push('<code>' + MegaCalc.escHtml(wp.formulas[f].key) + '</code>');
            }
            h += fp.join(', ') + ' <i>(sequential)</i></div>';
        }
        h += '<div style="margin-top:4px;"><b>Math:</b> <code>Math.ceil floor round min max pow sqrt abs PI</code></div>';
        h += '<div><b>Logic:</b> <code>if(a > b, x, y)</code> \u2014 nested OK</div>';
        h += '<div><b>Date:</b> <code>date_diff(a,b)</code> days, <code>date_diff_hours(a,b)</code></div>';
        h += '<div><b>Ops:</b> <code>+ - * / ( ) % > < >= <= == != && ||</code></div>';
        h += '</div>';
        return h;
    }
    // ===== Event Binding =====
    function bindPropEvents(wrapper, wp, onChange, rebuild, formFields) {
        // Global settings
        bindAll(wrapper, ".mf-cp-global", "change", function (el) {
            wp[el.dataset["f"]] = el.value;
            onChange();
        });
        bindAll(wrapper, ".mf-cp-global-chk", "change", function (el) {
            wp[el.dataset["f"]] = el.checked;
            onChange();
        });
        // Variable fields
        bindAll(wrapper, ".mf-cv-f", "change", function (el) {
            var idx = parseInt(el.dataset["idx"] || "0", 10);
            var f = el.dataset["f"] || "";
            var val = el.value;
            if (el.type === "number")
                val = val !== "" ? parseFloat(val) : undefined;
            wp.variables[idx][f] = val;
            onChange();
            if (f === "source" || f === "type")
                rebuild();
        });
        // Variable options textarea
        bindAll(wrapper, ".mf-cv-opts", "change", function (el) {
            var idx = parseInt(el.dataset["idx"] || "0", 10);
            var lines = el.value.split("\n");
            var opts = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (!line)
                    continue;
                var pipe = line.indexOf("|");
                if (pipe > -1) {
                    opts.push({ value: line.substring(0, pipe), label: line.substring(pipe + 1) });
                }
                else {
                    opts.push({ value: line, label: line });
                }
            }
            wp.variables[idx].options = opts;
            onChange();
        });
        // Variable delete
        bindAll(wrapper, ".mf-cv-del", "click", function (el, e) {
            e.preventDefault();
            wp.variables.splice(parseInt(el.dataset["idx"] || "0", 10), 1);
            onChange();
            rebuild();
        });
        // Variable add
        bindAll(wrapper, ".mf-cv-add", "click", function (_el, e) {
            e.preventDefault();
            wp.variables.push({ key: "var" + (wp.variables.length + 1), label: "Variable " + (wp.variables.length + 1), type: "number", source: "", min: 0, max: 1000, step: 1, "default": 0 });
            onChange();
            rebuild();
        });
        // Tier fields
        bindAll(wrapper, ".mf-ct-f", "change", function (el) {
            var idx = parseInt(el.dataset["idx"] || "0", 10);
            var f = el.dataset["f"] || "";
            wp.tiers[idx][f] = el.value;
            onChange();
        });
        // Tier range fields
        bindAll(wrapper, ".mf-cr-f", "change", function (el) {
            var tidx = parseInt(el.dataset["tidx"] || "0", 10);
            var ridx = parseInt(el.dataset["ridx"] || "0", 10);
            var f = el.dataset["f"] || "";
            wp.tiers[tidx].ranges[ridx][f] = parseFloat(el.value) || 0;
            onChange();
        });
        // Tier range delete
        bindAll(wrapper, ".mf-cr-del", "click", function (el, e) {
            e.preventDefault();
            var tidx = parseInt(el.dataset["tidx"] || "0", 10);
            var ridx = parseInt(el.dataset["ridx"] || "0", 10);
            wp.tiers[tidx].ranges.splice(ridx, 1);
            onChange();
            rebuild();
        });
        // Tier range add
        bindAll(wrapper, ".mf-cr-add", "click", function (el, e) {
            e.preventDefault();
            var tidx = parseInt(el.dataset["tidx"] || "0", 10);
            if (!wp.tiers[tidx].ranges)
                wp.tiers[tidx].ranges = [];
            wp.tiers[tidx].ranges.push({ min: 1, max: 100, value: 10 });
            onChange();
            rebuild();
        });
        // Tier delete
        bindAll(wrapper, ".mf-ct-del", "click", function (el, e) {
            e.preventDefault();
            wp.tiers.splice(parseInt(el.dataset["idx"] || "0", 10), 1);
            onChange();
            rebuild();
        });
        // Tier add
        bindAll(wrapper, ".mf-ct-add", "click", function (_el, e) {
            e.preventDefault();
            wp.tiers.push({ key: "price_tier", inputVar: wp.variables.length > 0 ? wp.variables[0].key : "", ranges: [{ min: 1, max: 100, value: 10 }] });
            onChange();
            rebuild();
        });
        // Formula fields
        bindAll(wrapper, ".mf-cf-f", "change", function (el) {
            var idx = parseInt(el.dataset["idx"] || "0", 10);
            var f = el.dataset["f"] || "";
            var val = el.value;
            if (f === "decimals")
                val = parseInt(val, 10) || 2;
            wp.formulas[idx][f] = val;
            onChange();
        });
        // Formula checkboxes
        bindAll(wrapper, ".mf-cf-chk", "change", function (el) {
            var idx = parseInt(el.dataset["idx"] || "0", 10);
            var f = el.dataset["f"] || "";
            wp.formulas[idx][f] = el.checked;
            onChange();
        });
        // Formula delete
        bindAll(wrapper, ".mf-cf-del", "click", function (el, e) {
            e.preventDefault();
            wp.formulas.splice(parseInt(el.dataset["idx"] || "0", 10), 1);
            onChange();
            rebuild();
        });
        // Formula add
        bindAll(wrapper, ".mf-cf-add", "click", function (_el, e) {
            e.preventDefault();
            wp.formulas.push({ key: "calc" + (wp.formulas.length + 1), label: "Result", formula: "", prefix: "$", suffix: "", decimals: 2, visible: true, highlight: false });
            onChange();
            rebuild();
        });
    }
    /** Helper: bind event to all matching elements */
    function bindAll(parent, selector, event, handler) {
        var els = parent.querySelectorAll(selector);
        for (var i = 0; i < els.length; i++) {
            (function (el) {
                el.addEventListener(event, function (e) { handler(el, e); });
            })(els[i]);
        }
    }
})(MegaCalc || (MegaCalc = {}));
/**
 * MegaForm Calculator Plugin — Assembly & Registration
 */
var MegaCalc;
(function (MegaCalc) {
    var plugin = {
        render: MegaCalc.render,
        bind: MegaCalc.bind,
        collect: MegaCalc.collect,
        validate: MegaCalc.validate,
        renderProperties: MegaCalc.renderProperties,
        defaults: {
            variables: [],
            formulas: [
                { key: "result", label: "Result", formula: "", prefix: "$", suffix: "", decimals: 2, visible: true, highlight: true }
            ],
            tiers: [],
            showBreakdown: false,
            numberFormat: "en-US",
            displayMode: "hidden"
        },
        meta: {
            icon: "fa fa-calculator",
            label: "Calculator",
            category: "widget",
            description: "Advanced calculator with formulas, tiered pricing, date math, and conditional logic"
        }
    };
    // Register
    var w = window as any;
    if (w.MegaFormWidgets && typeof w.MegaFormWidgets.register === "function") {
        w.MegaFormWidgets.register("Calculator", plugin);
    }
    else {
        w.MegaFormCalculatorWidget = plugin;
    }
})(MegaCalc || (MegaCalc = {}));

})();
