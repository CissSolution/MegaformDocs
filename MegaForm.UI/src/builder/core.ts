import { getPlatformRoute } from '@shared/platform-host';
// [Composite Registry v20260616] Single source for the alias→preset map + labels.
import { compositeAliasToPresetMap, compositePresetLabel } from '../renderer/helpers';
import { defaultChipOptions, defaultCardOptions } from '@shared/choice-defaults';
/* ============================================================
   MegaForm Builder — Core (State, Helpers, Public API)
   File: megaform-builder-core.js
   All other builder modules depend on this.
   ============================================================ */
var MegaFormBuilder = (function () {
    'use strict';
    var SCHEMA_PARSE_GUARD_BADGE = 'BuilderSchemaParseGuard v20260622-B228';
    try { (window as any).__MF_BUILDER_SCHEMA_PARSE_GUARD__ = SCHEMA_PARSE_GUARD_BADGE; } catch (_e) { }

    // =========================================================
    //  STATE
    // =========================================================
    var state = {
        config: {},
        schema: { version: '1.0', fields: [], settings: {} },
        selectedFieldIndex: -1,
        currentPage: 0,
        fieldCounter: 0,
        isDirty: false
    };

    // =========================================================
    //  ELEMENT ID MAP — single source of truth
    //  ASCX must match these IDs exactly.
    // =========================================================
    var EL = {
        // Canvas
        canvasFields:       'mf-canvas-fields',
        canvasDropzone:     'mf-canvas-dropzone',
        emptyState:         'mf-empty-state',
        canvasTitle:        'mf-canvas-title',
        canvasDescription:  'mf-canvas-description',
        submitBtnText:      'mf-submit-btn-text',
        prevBtnText:        'mf-prev-btn-text',
        nextBtnText:        'mf-next-btn-text',
        defaultLanguage:    'mf-default-language',
        // Properties panel
        fieldProps:         'mf-field-props',
        noFieldSelected:    'mf-no-field-selected',
        propFieldTypeLabel: 'mf-prop-field-type-label',
        propOptionsList:    'mf-prop-options-list',
        addOptionBtn:       'mf-add-option',
        deleteFieldBtn:     'mf-btn-delete-field',
        // Tabs
        tabLinkField:       'mf-tab-link-field',
        tabLinkWidget:      'mf-tab-link-widget',
        tabLinkSettings:    'mf-tab-link-settings',
        tabLinkHtml:        'mf-tab-link-html',
        tabLinkAi:          'mf-tab-link-ai',
        tabLinkEmbed:       'mf-tab-link-embed',
        tabLinkRules:       'mf-tab-link-rules',
        tabRules:           'mf-tab-rules',
        tabField:           'mf-tab-field',
        tabWidget:          'mf-tab-widget',
        tabSettings:        'mf-tab-settings',
        tabHtml:            'mf-tab-html',
        tabAi:              'mf-tab-ai',
        tabEmbed:           'mf-tab-embed',
        // Toolbar
        btnSaveDraft:       'mf-btn-save-draft',
        btnPublish:         'mf-btn-publish',
        btnPreview:         'mf-btn-preview',
        // Hidden data
        builderFormId:      'mf-builder-form-id',
        builderSchemaJson:  'mf-builder-schema-json',
        builderSettingsJson:'mf-builder-settings-json',
        // Palette
        fieldSearch:        'mf-field-search',
        // Template gallery
        templateGallery:    'mf-template-gallery',
        builderApp:         'mf-builder-app',
        tplUseBtn:          'mf-tpl-use-btn'
    };

    // =========================================================
    //  FIELD TYPE DEFINITIONS
    //  Source of truth: field-plugins/_index.ts (FieldPlugin registry)
    //  Object này được populate bởi FieldPlugins.register() khi mỗi
    //  plugin tự đăng ký vào registry (xảy ra trước dom.ts init).
    //  Giữ lại fallback tối thiểu để tránh crash nếu registry chưa load.
    // =========================================================
    var fieldTypes = {
        // Fallback tối thiểu — registry sẽ ghi đè / bổ sung các entry này
        'Text':    { icon: 'fa-font',      label: 'Short Text', category: 'basic',  hasOptions: false },
        'Html':    { icon: 'fa-code',      label: 'HTML Block', category: 'layout', hasOptions: false },
        'Section': { icon: 'fa-minus',     label: 'Section',    category: 'layout', hasOptions: false },
        'Row':     { icon: 'fa-columns',   label: 'Row',        category: 'layout', hasOptions: false },
        'Hidden':  { icon: 'fa-eye-slash', label: 'Hidden',     category: 'layout', hasOptions: false },
        // Widgets & Payment loaded dynamically from plugins via MegaFormWidgets.register()
    };

    // IMPORTANT:
    // field-plugins/_index.ts load TRƯỚC core.ts để dựng palette,
    // nhưng lúc plugin register thì window.MegaFormBuilder chưa tồn tại,
    // nên _registry.ts chưa thể sync ngược vào fieldTypes.
    // → Kết quả runtime: palette có item Date/Email/... nhưng B.fieldTypes thiếu entry,
    //   onAdd()/click-add coi type là invalid và xoá item ngay sau khi drop.
    // Fix: hydrate fieldTypes từ registry NGAY khi core khởi tạo.
    function hydrateFieldTypesFromRegistry() {
        var registry = (window as any).MFFieldPlugins;
        if (!registry || typeof registry.getAll !== 'function') return;
        try {
            registry.getAll().forEach(function(plugin: any) {
                if (!plugin || !plugin.type) return;
                fieldTypes[plugin.type] = {
                    icon: plugin.icon || 'fa-puzzle-piece',
                    label: plugin.label || plugin.type,
                    color: plugin.color || '#64748b',
                    category: plugin.category || 'basic',
                    hasOptions: !!plugin.hasOptions
                };
            });
        } catch (e) {
            console.warn('[MegaFormBuilder] hydrateFieldTypesFromRegistry failed', e);
        }
    }
    hydrateFieldTypesFromRegistry();

    // =========================================================
    //  HELPERS
    // =========================================================
    function el(id) { return document.getElementById(id); }
    function escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function escAttr(s) { return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function getVal(id) { var e = el(id); return e ? e.value : ''; }
    function setVal(id, val) { var e = el(id); if (e) e.value = val || ''; }
    function isChecked(id) { var e = el(id); return e ? e.checked : false; }
    function setChecked(id, val) { var e = el(id); if (e) e.checked = !!val; }
    function show(id) { var e = el(id); if (e) e.style.display = ''; }
    function hide(id) { var e = el(id); if (e) e.style.display = 'none'; }
    function toggle(id, visible) { visible ? show(id) : hide(id); }


    var BUILDER_LABEL_BADGE = 'BuilderLabelRules v20260403-03';
    var BUILDER_SCHEMA_NORM_BADGE = 'BuilderSchemaNorm v20260421-02';
    var CREATE_FIELD_GUARD_BADGE = 'CreateFieldGuard v20260504-12';
    try { (window as any).__MF_BUILDER_SCHEMA_NORM_BADGE__ = BUILDER_SCHEMA_NORM_BADGE; } catch (_e) { }
    try { (window as any).__MF_CREATE_FIELD_GUARD_BADGE__ = CREATE_FIELD_GUARD_BADGE; } catch (_e) { }
    var FIELD_I18N_KEYS = {
        'Text': 'field.text',
        'Textarea': 'field.textarea',
        'Email': 'field.email',
        'Number': 'field.number',
        'Date': 'field.date',
        'Phone': 'field.phone',
        'Select': 'field.select',
        'Radio': 'field.radio',
        'Checkbox': 'field.checkbox',
        'File': 'field.file',
        'Url': 'field.url',
        'Rating': 'field.rating',
        'Signature': 'field.signature',
        'Html': 'field.html',
        'Section': 'field.section',
        'Hidden': 'field.hidden'
    };

    function builderT(key, fallback, params) {
        var raw = String(fallback == null ? '' : fallback);
        try {
            var i18n = (window).MegaFormI18n || (window).MF_I18N;
            if (i18n && typeof i18n.t === 'function') {
                var out = i18n.t(key, params || {});
                if (out && out !== key) return String(out);
            }
        } catch (_err) {}
        if (params) {
            Object.keys(params).forEach(function(name) {
                raw = raw.replace(new RegExp('\\{' + name + '\}', 'g'), String(params[name] == null ? '' : params[name]));
            });
        }
        return raw;
    }

    function extractVersionBadge(text) {
        var raw = String(text == null ? '' : text).trim();
        if (!raw) return '';
        var bullet = raw.match(/•\s*([A-Za-z][A-Za-z0-9+._ -]*\sv\d{8}(?:-\d+[A-Za-z0-9]*)?)\s*$/);
        if (bullet && bullet[1]) return String(bullet[1]).trim();
        var plain = raw.match(/([A-Za-z][A-Za-z0-9+._ -]*\sv\d{8}(?:-\d+[A-Za-z0-9]*)?)\s*$/);
        return plain && plain[1] ? String(plain[1]).trim() : '';
    }

    function stripVersionBadge(text) {
        var raw = String(text == null ? '' : text).trim();
        if (!raw) return '';
        raw = raw.replace(/\s*•\s*[A-Za-z][A-Za-z0-9+._ -]*\sv\d{8}(?:-\d+[A-Za-z0-9]*)?\s*$/,'');
        return raw.trim();
    }

    function getLocalizedControlLabel(type, fallback) {
        var clean = stripVersionBadge(fallback || type || '') || String(type || '');
        var key = FIELD_I18N_KEYS[type] || '';
        // [PaletteI18n v20260619] Fall back to a DERIVED key for any control type not in the
        // explicit map (composites, layout Row/FlexGrid, widget tiles, etc.) so every palette
        // tile + canvas/property label can be localized just by adding `field.<snake(type)>` to
        // the catalog. CompositeMoney → field.composite_money, FlexGrid → field.flex_grid.
        // builderT returns the English `clean` fallback when the derived key is absent, so this
        // never regresses an un-keyed type — it only enables translation once the key exists.
        if (!key && type) {
            key = 'field.' + String(type).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
        }
        return key ? builderT(key, clean) : clean;
    }

    // Collect every field key currently in the schema (incl. nested Row columns)
    // so generated keys never collide. Returns a lowercase lookup map.
    function collectFieldKeys() {
        var used: any = {};
        function walk(arr: any) {
            if (!Array.isArray(arr)) return;
            for (var i = 0; i < arr.length; i++) {
                var f = arr[i];
                if (!f || typeof f !== 'object') continue;
                if (f.key) used[String(f.key).toLowerCase()] = true;
                if (Array.isArray(f.columns)) {
                    for (var c = 0; c < f.columns.length; c++) {
                        if (f.columns[c] && Array.isArray(f.columns[c].fields)) walk(f.columns[c].fields);
                    }
                }
            }
        }
        try { walk(state && state.schema && state.schema.fields); } catch (_e) {}
        return used;
    }

    // [FieldKey v20260616] Clean, human-readable auto keys derived from the field TYPE
    // (e.g. "composite", "composite_2") instead of the old random "composite_10_xvjj".
    // Collision-checked against existing keys; admins rename via the "Field Key" input.
    function generateFieldKey(type) {
        state.fieldCounter++;  // kept for back-compat (load seeds it = fields.length)
        var base = String(type || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
        var used = collectFieldKeys();
        if (!used[base]) return base;
        var n = 2;
        while (used[base + '_' + n]) n++;
        return base + '_' + n;
    }


    function cloneJson(value) {
        try { return JSON.parse(JSON.stringify(value == null ? null : value)); } catch (_e) { return value; }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    // [HumanizeKey v20260430-13] Inlined from html-sync.ts (which keeps it in an IIFE).
    // Was being called as a free identifier on line 253 → ReferenceError → schema parse
    // failed silently → "new form blank" until refresh re-ran the bundle.
    function humanizeKey(key: any): string {
        return String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, function (c: string) { return c.toUpperCase(); }) || 'Text';
    }

    function normalizeSettingsShape(settings) {
        var st = isPlainObject(settings) ? cloneJson(settings) || {} : {};
        if (st.CustomHtml && !st.customHtml) st.customHtml = st.CustomHtml;
        if (st.CustomCss && !st.customCss) st.customCss = st.CustomCss;
        if (st.CustomContent && !st.customContent) st.customContent = st.CustomContent;
        if (st.CustomScripts && !st.customScripts) st.customScripts = st.CustomScripts;
        if (typeof st.customHtml !== 'string') st.customHtml = typeof st.CustomHtml === 'string' ? st.CustomHtml : '';
        if (typeof st.customCss !== 'string') st.customCss = typeof st.CustomCss === 'string' ? st.CustomCss : '';
        if (!isPlainObject(st.customContent)) st.customContent = {};
        if (!isPlainObject(st.customScripts)) st.customScripts = {};
        if (Array.isArray(st.theme)) st.theme = st.theme.length ? String(st.theme[0] || '') : '';
        if (Array.isArray(st.multiPage)) st.multiPage = !!st.multiPage[0];
        st.multiPage = !!st.multiPage;
        if (Array.isArray(st.displayOnly)) st.displayOnly = !!st.displayOnly[0];
        st.displayOnly = !!st.displayOnly;
        if (!Array.isArray(st.rules)) st.rules = Array.isArray(st.Rules) ? cloneJson(st.Rules) : [];
        if (typeof st.workflowTemplate === 'undefined' && typeof st.WorkflowTemplate !== 'undefined') st.workflowTemplate = cloneJson(st.WorkflowTemplate);
        if (st.TemplateGuideSlug && !st.templateGuideSlug) st.templateGuideSlug = st.TemplateGuideSlug;
        if (typeof st.templateGuideSlug !== 'string') st.templateGuideSlug = typeof st.TemplateGuideSlug === 'string' ? st.TemplateGuideSlug : '';
        return st;
    }

    function normalizeFieldShape(field) {
        if (!field || typeof field !== 'object') return {};

        var f = cloneJson(field) || {};
        f.key = String(f.key ?? f.Key ?? '').trim();
        f.type = String(f.type ?? f.Type ?? f.fieldType ?? f.FieldType ?? '').trim() || 'Text';
        f.label = String(f.label ?? f.Label ?? '').trim();
        f.placeholder = String(f.placeholder ?? f.Placeholder ?? '').trim();
        f.required = !!(f.required ?? f.Required ?? false);
        f.helpText = String(f.helpText ?? f.HelpText ?? '').trim();
        f.defaultValue = f.defaultValue ?? f.DefaultValue ?? '';
        if (typeof f.default === 'undefined') f.default = f.Default;
        f.cssClass = String(f.cssClass ?? f.CssClass ?? '');
        f.width = String(f.width ?? f.Width ?? '100%');
        f.readOnly = !!(f.readOnly ?? f.ReadOnly ?? false);
        f.prefillParam = String(f.prefillParam ?? f.PrefillParam ?? '');
        f.validation = isPlainObject(f.validation) ? f.validation : (isPlainObject(f.Validation) ? cloneJson(f.Validation) : {});
        if (!Array.isArray(f.options)) f.options = Array.isArray(f.Options) ? cloneJson(f.Options) : [];
        f.showIf = f.showIf ?? f.ShowIf ?? null;
        f.htmlContent = f.htmlContent ?? f.HtmlContent ?? '';
        f.fileSettings = f.fileSettings ?? f.FileSettings ?? null;
        f.properties = isPlainObject(f.properties) ? f.properties : (isPlainObject(f.Properties) ? cloneJson(f.Properties) : {});
        f.widgetProps = isPlainObject(f.widgetProps) ? f.widgetProps : (isPlainObject(f.WidgetProps) ? cloneJson(f.WidgetProps) : undefined);

        // [SqlConnDefault v20260519-04] Auto-fill optionsConnectionKey on save.
        // SQL options were added in v01.06.16 after most existing forms shipped,
        // so legacy schemas (and freshly-built ones where the user didn't touch
        // the Connection input) end up with a blank key — the server-side options
        // service then silently returns []. Fill the platform default here so
        // every saved form always has a key.
        var fp = f.properties;
        var src = String((fp && (fp as any).optionsSource) || '').toLowerCase();
        if (src === 'sql' && !String((fp as any).optionsConnectionKey || '').trim()) {
            (fp as any).optionsConnectionKey = 'DashboardDatabase';
        }
        if (!f.label && f.type !== 'Html' && f.type !== 'Section') f.label = humanizeKey(f.key || f.type);

        if (!Array.isArray(f.columns) && Array.isArray(f.Columns)) f.columns = cloneJson(f.Columns);
        if (Array.isArray(f.columns)) {
            f.columns = f.columns.map(function (col) {
                var nextCol = isPlainObject(col) ? cloneJson(col) || {} : {};
                nextCol.span = parseInt(String(nextCol.span ?? nextCol.Span ?? 6), 10) || 6;
                if (!Array.isArray(nextCol.fields)) nextCol.fields = Array.isArray(nextCol.Fields) ? cloneJson(nextCol.Fields) : [];
                nextCol.fields = nextCol.fields.map(normalizeFieldShape).filter(function (child) { return !!child && typeof child === 'object'; });
                return nextCol;
            });
        }

        return f;
    }

    function normalizeSchemaShape(schema) {
        var s = isPlainObject(schema) ? cloneJson(schema) || {} : {};
        if (!Array.isArray(s.fields)) s.fields = Array.isArray(s.Fields) ? cloneJson(s.Fields) : [];
        if (!isPlainObject(s.settings)) s.settings = normalizeSettingsShape(s.Settings);
        else s.settings = normalizeSettingsShape(s.settings);

        s.fields = s.fields.map(normalizeFieldShape).filter(function (field) { return !!field && typeof field === 'object'; });

        if (!isPlainObject(s.customScripts)) {
            if (isPlainObject(s.CustomScripts)) s.customScripts = cloneJson(s.CustomScripts);
            else if (isPlainObject(s.settings.customScripts)) s.customScripts = cloneJson(s.settings.customScripts);
            else s.customScripts = {};
        }
        s.CustomScripts = s.customScripts;
        s.settings.customScripts = isPlainObject(s.settings.customScripts) ? s.settings.customScripts : cloneJson(s.customScripts);
        s.settings.CustomScripts = s.settings.customScripts;
        s.settings.customContent = isPlainObject(s.settings.customContent) ? s.settings.customContent : {};
        s.settings.CustomContent = s.settings.customContent;
        s.settings.customHtml = String(s.settings.customHtml || '');
        s.settings.CustomHtml = s.settings.customHtml;
        s.settings.customCss = String(s.settings.customCss || '');
        s.settings.CustomCss = s.settings.customCss;
        s.settings.templateGuideSlug = String(s.settings.templateGuideSlug || '');
        s.settings.TemplateGuideSlug = s.settings.templateGuideSlug;
        s.version = String(s.version || s.Version || '1.0');

        return s;
    }

    function decodeSchemaString(raw) {
        var text = raw == null ? '{}' : String(raw);
        if (text && (text.indexOf('&quot;') !== -1 || text.indexOf('&#') !== -1)) {
            try {
                var tmp = document.createElement('textarea');
                tmp.innerHTML = text;
                text = tmp.value;
            } catch (_e) { }
        }
        return text && text.trim() ? text : '{}';
    }

    function repairKnownBrokenScriptJson(raw) {
        var text = decodeSchemaString(raw);
        var before = text;
        // Form 747 legacy customScripts regression:
        // JSON string contains JS source `...,'\"':'"',\"'\":'''}...`.
        // The unescaped " closes the JSON string early, and the apostrophe map
        // value is invalid JS. Repair to the standard entity escape.
        text = text
            .replace(/'\\"':'"',\\"'\\"':'''}/g, "'\\\"':'\\\"',\\\"'\\\":'&#39;'}")
            .replace(/'\\"':'"',\\"'\\"':''}/g, "'\\\"':'\\\"',\\\"'\\\":'&#39;'}");
        text = text
            .split("'\\\"':'\"'").join("'\\\"':'\\\"'")
            .split("\\\"'\\\":'''}").join("\\\"'\\\":'&#39;'}")
            .split("\\\"'\\\":''}").join("\\\"'\\\":'&#39;'}");
        text = text
            .replace(/'\\+"':'"'/g, "'\\\"':'\\\"'")
            .replace(/\\+"'\\+":'''}/g, "\\\"'\\\":'&#39;'}")
            .replace(/\\+"'\\+":''}/g, "\\\"'\\\":'&#39;'}");
        if (text !== before) {
            try {
                (window as any).__MF_BUILDER_SCHEMA_REPAIR_COUNT__ = (text.match(/&#39;/g) || []).length;
                (window as any).__MF_BUILDER_SCHEMA_REPAIRED__ = SCHEMA_PARSE_GUARD_BADGE;
            } catch (_e) { }
        }
        return text;
    }

    function repairKnownBrokenScriptSource(value) {
        var text = String(value == null ? '' : value);
        if (text.indexOf("'''}") === -1 && text.indexOf("''}") === -1) return text;
        return text
            .split("\"'\":'''}").join("\"'\":'&#39;'}")
            .split("\"'\":''}").join("\"'\":'&#39;'}")
            .split("\\\"'\\\":'''}").join("\\\"'\\\":'&#39;'}")
            .split("\\\"'\\\":''}").join("\\\"'\\\":'&#39;'}");
    }

    function repairSchemaStringValues(value) {
        if (typeof value === 'string') return repairKnownBrokenScriptSource(value);
        if (Array.isArray(value)) return value.map(repairSchemaStringValues);
        if (isPlainObject(value)) {
            var next: any = {};
            Object.keys(value).forEach(function (key) {
                next[key] = repairSchemaStringValues(value[key]);
            });
            return next;
        }
        return value;
    }

    function parseSchemaJson(raw) {
        if (raw && typeof raw === 'object') {
            var normalizedObject = normalizeSchemaShape(repairSchemaStringValues(raw));
            return { schema: normalizedObject, json: JSON.stringify(normalizedObject), repaired: false, fallback: false, error: null };
        }
        var text = decodeSchemaString(raw);
        var parsed: any = null;
        try {
            parsed = JSON.parse(text);
        } catch (firstError) {
            var repaired = repairKnownBrokenScriptJson(text);
            if (repaired !== text) {
                try {
                    parsed = JSON.parse(repaired);
                    parsed = repairSchemaStringValues(parsed);
                    var normalizedRepaired = normalizeSchemaShape(parsed);
                    return { schema: normalizedRepaired, json: JSON.stringify(normalizedRepaired), repaired: true, fallback: false, error: firstError };
                } catch (_repairError) { }
            }
            console.warn('MegaForm: failed to parse existing schema; using empty fallback', firstError);
            var fallbackSchema = normalizeSchemaShape({});
            return { schema: fallbackSchema, json: JSON.stringify(fallbackSchema), repaired: false, fallback: true, error: firstError };
        }
        parsed = repairSchemaStringValues(parsed);
        var normalized = normalizeSchemaShape(parsed);
        return { schema: normalized, json: JSON.stringify(normalized), repaired: false, fallback: false, error: null };
    }

    function sanitizeSchemaJson(raw) {
        return parseSchemaJson(raw).json;
    }

    function syncSchemaJsonToPage(json, meta) {
        var canonical = json && String(json).trim() ? String(json) : '{}';
        try { (window as any).SCHEMA_JSON = canonical; } catch (_e) { }
        try { (window as any).__MF_PENDING_SCHEMA_JSON = canonical; } catch (_e) { }
        try {
            var root = document.getElementById('mf-builder-root') as HTMLElement | null;
            if (root) {
                root.dataset.schemaJson = canonical;
                root.dataset.schemaParseGuard = SCHEMA_PARSE_GUARD_BADGE;
                if (meta && meta.repaired) root.dataset.schemaRepaired = '1';
                if (meta && meta.fallback) root.dataset.schemaParseFallback = '1';
            }
            var hidden = document.getElementById(EL.builderSchemaJson) as HTMLInputElement | null;
            if (hidden) hidden.value = canonical;
        } catch (_e) { }
        return canonical;
    }

    function exportCanonicalSchema(schema) {
        return normalizeSchemaShape(schema || state.schema || {});
    }

    // [Composite v1] The palette exposes 3 virtual tiles (CompositePhone/Name/Address);
    // each maps to ONE canonical Composite field + a preset (renderer reads
    // widgetProps.preset). Keeps the ratified "one Composite type + presets" model.
    // [Composite v1.4] Expanded palette tiles for the new presets (SSN, Name+, DOB,
    // Time, Confirm Email/Password). Each maps to ONE canonical Composite field.
    // [Composite Registry v20260616] Derived from the single source COMPOSITE_PRESET_META
    // (renderer/helpers) so every preset — incl. the new Layout-tab field-groups — maps
    // automatically. alias (CompositePhone…) → preset key; label via compositePresetLabel().
    var COMPOSITE_PALETTE_MAP = compositeAliasToPresetMap();

    function createFieldFromTemplate(tpl) {
        // [Composite v1] Rewrite palette tile → canonical Composite + preset (single
        // chokepoint covering every drop path: canvas, row-column, FlexGrid, sortable).
        var paletteType = String((tpl && tpl.type) || '');
        if (COMPOSITE_PALETTE_MAP[paletteType]) {
            var _preset = COMPOSITE_PALETTE_MAP[paletteType];
            tpl = Object.assign({}, tpl, {
                type: 'Composite',
                label: (tpl && tpl.label && tpl.label !== paletteType) ? tpl.label : compositePresetLabel(_preset),
                widgetProps: Object.assign({ preset: _preset }, isPlainObject(tpl && tpl.widgetProps) ? tpl.widgetProps : {})
            });
        }
        var source = normalizeFieldShape(tpl || {});
        var type = String(source.type || '').trim() || 'Text';
        var safeKey = String(source.key || '').trim() || generateFieldKey(type);
        var fieldMeta = fieldTypes[type] || null;
        var fallbackLabel = getLocalizedControlLabel(type, (fieldMeta ? fieldMeta.label : type));
        var f = {
            key: safeKey,
            type: type,
            label: source.label || fallbackLabel,
            required: !!source.required,
            placeholder: source.placeholder || '',
            helpText: source.helpText || '',
            defaultValue: source.defaultValue || source.default || '',
            cssClass: source.cssClass || '',
            width: source.width || '100%',
            readOnly: !!source.readOnly,
            prefillParam: source.prefillParam || '',
            validation: cloneJson(source.validation || {}),
            options: Array.isArray(source.options) ? cloneJson(source.options) : [],
            showIf: source.showIf || null,
            htmlContent: source.htmlContent || '',
            fileSettings: source.fileSettings ? cloneJson(source.fileSettings) : null,
            properties: isPlainObject(source.properties) ? cloneJson(source.properties) : {}
        };

        // Row type — initialize columns with nested fields
        if (type === 'Row') {
            f.columns = Array.isArray(source.columns) ? cloneJson(source.columns) : [
                { span: 6, fields: [] },
                { span: 6, fields: [] }
            ];
            f.columns.forEach(function(col) {
                if (!col.fields) col.fields = [];
                col.fields = col.fields.map(function(cf) {
                    return createFieldFromTemplate(cf);
                });
            });
        }

        // [FlexGrid P2 v20260601-B17] FlexGrid type — initialize empty items[]
        // array + default gridConfig. Admin uses "+ Add" inside the cell to
        // populate fields. Each item carries its own placement per breakpoint.
        if (type === 'FlexGrid') {
            f.gridConfig = isPlainObject(source.gridConfig) ? cloneJson(source.gridConfig) : { cols: 12, rowHeight: 64, gap: 12 };
            f.items = Array.isArray(source.items) ? cloneJson(source.items) : [];
        }

        // [Composite v1] getDefaultWidgetProps('Composite') is null, so the generic
        // widgetProps line below would drop source.widgetProps — set it here so the
        // preset (and any parts override) always survives.
        if (type === 'Composite') {
            var _cwp = isPlainObject(source.widgetProps) ? cloneJson(source.widgetProps) : {};
            // [Unify v3 2026-06-18] The generic 'Composite' palette tile carries no preset →
            // default to 'text' (a plain Short Text input) so the single unified control drops
            // as the most common case; the Settings "Composite preset" dropdown switches type.
            if (!_cwp.preset) _cwp.preset = source.preset || 'text';
            f.widgetProps = _cwp;
            // The bare tile's label is the type name ('Composite'); give a freshly-dropped
            // one the preset's friendly label (alias drops already carry the preset label).
            if (!source.label || source.label === 'Composite') f.label = compositePresetLabel(_cwp.preset);
        }

        // Widget default props
        var wp = getDefaultWidgetProps(type);
        if (wp) f.widgetProps = source.widgetProps ? Object.assign({}, wp, cloneJson(source.widgetProps)) : wp;

        // [WidgetPropsGuard v20260504-12] Defense against the "template-as-widgetProps"
        // corruption pattern: when a user accidentally pastes a full form-template JSON
        // into a widget's properties (e.g. into "Custom Master Template" textarea, or via
        // a server-side bulk-import that wraps the file wrong), the field's widgetProps
        // ends up containing top-level template keys (`fields[]`, `settings{}`, `version`,
        // `title`, etc). Strip them — they are never valid inside widgetProps and break
        // every renderer downstream.
        if (f.widgetProps && typeof f.widgetProps === 'object') {
            var fwp: any = f.widgetProps;
            var looksLikeTemplate = Array.isArray(fwp.fields)
                && (typeof fwp.version === 'string' || isPlainObject(fwp.settings) || typeof fwp.title === 'string');
            if (looksLikeTemplate) {
                try {
                    console.warn('[MegaForm CreateFieldGuard] Field "' + safeKey + '" had template-shaped widgetProps (fields=' +
                        fwp.fields.length + ', version=' + fwp.version + '). Stripping invalid keys.');
                } catch (_e) { }
                var BAD_KEYS = ['version', 'fields', 'settings', 'title', 'description',
                                'submitButtonText', 'slug', 'category', 'categories', 'icon',
                                'meta', 'form', 'schema', 'pages', 'translations', 'customScripts'];
                for (var bi = 0; bi < BAD_KEYS.length; bi++) {
                    if (Object.prototype.hasOwnProperty.call(fwp, BAD_KEYS[bi])) delete fwp[BAD_KEYS[bi]];
                }
            }
        }

        // Widget default options
        if (!f.options.length) {
            // [Chips/Cards 2026-06-28] Rich premium seeds (icon/title/meta/desc for Cards) so a
            // freshly dropped control already shows the full layout for the author to edit.
            if (type === 'Cards') { f.options = defaultCardOptions(); f.allowOptionHtml = true; }
            else if (type === 'Chips') { f.options = defaultChipOptions(); }
            else if (type === 'Select' || type === 'Radio' || type === 'Checkbox' || type === 'MultiSelect') {
                f.options = [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }, { value: 'option_3', label: 'Option 3' }];
            }
            if (type === 'ImageChoice') f.options = [{value:'opt1',label:'Option 1'},{value:'opt2',label:'Option 2'},{value:'opt3',label:'Option 3'}];
            if (type === 'Ranking') f.options = [{value:'item_a',label:'Item A'},{value:'item_b',label:'Item B'},{value:'item_c',label:'Item C'}];
        }

        return f;
    }

    function getDefaultWidgetProps(type) {
        // Built-in widget defaults
        if (type === 'UniqueId') {
            return { prefix: '', padding: 5, startValue: 1, suffixType: 'none' };
        }
        // All other widget defaults come from plugin registry
        if (typeof MegaFormWidgets !== 'undefined' && MegaFormWidgets.getPluginDefaults) {
            var pd = MegaFormWidgets.getPluginDefaults(type);
            if (pd) return pd;
        }
        return null;
    }

    
    var LOCK_KEY = 'mf_locked_forms_v1';

    function getLockedFormIds() {
        try {
            var raw = localStorage.getItem(LOCK_KEY);
            var arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_e) { return []; }
    }

    function isProtectedFormId(formId) {
        var id = parseInt(String(formId || 0), 10) || 0;
        if (!id) return false;
        return getLockedFormIds().indexOf(id) >= 0;
    }

    function renderProtectedBuilderNotice(formId) {
        var root = document.getElementById('mf-builder-root');
        if (!root) {
            showToast('This form is protected. Editing is disabled.', 'error');
            return;
        }
        root.innerHTML = '' +
            '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">' +
            '  <div style="max-width:620px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 24px 60px rgba(15,23,42,.12);padding:28px;">' +
            '    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">' +
            '      <div style="width:44px;height:44px;border-radius:14px;background:#eef2ff;color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:20px;">🔒</div>' +
            '      <div>' +
            '        <div style="font-size:22px;line-height:1.2;font-weight:800;color:#0f172a;">Protected form</div>' +
            '        <div style="margin-top:4px;font-size:13px;color:#64748b;">Form ID: ' + String(parseInt(String(formId || 0), 10) || 0) + '</div>' +
            '      </div>' +
            '    </div>' +
            '    <div style="font-size:15px;line-height:1.75;color:#334155;">This form is protected. Viewing and submissions can still work normally, but editing and deleting are disabled.</div>' +
            '    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:20px;">' +
            '      <button type="button" id="mf-protected-back" style="appearance:none;border:none;border-radius:999px;padding:12px 18px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;">Back to dashboard</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        var btn = document.getElementById('mf-protected-back');
        if (btn) {
            btn.addEventListener('click', function () {
                try {
                    var dashboardUrl = getPlatformRoute('dashboard');
                    if (dashboardUrl) {
                        window.location.href = dashboardUrl;
                        return;
                    }
                } catch (_e) {}
                try {
                    window.location.href = window.location.pathname + window.location.search;
                } catch (_e) {}
            });
        }
        showToast('This form is protected. Editing is disabled.', 'error');
    }

function showToast(message, type) {
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:12px 24px;border-radius:999px;color:#fff;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(15,23,42,0.24);transition:all 0.3s ease;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:min(calc(100vw - 32px),560px);text-align:center;';
        toast.style.background = type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6';
        toast.style.opacity = '0';
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(function () { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(function () { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(12px)'; setTimeout(function () { if (toast.parentNode) document.body.removeChild(toast); }, 300); }, 3000);
    }

    // =========================================================
    //  MODULE REGISTRY — other modules register here
    // =========================================================
    var modules = {};

    function registerModule(name, mod) {
        modules[name] = mod;
    }

    function callModule(name, method, args) {
        if (modules[name] && typeof modules[name][method] === 'function') {
            return modules[name][method].apply(null, args || []);
        }
    }

    // =========================================================
    //  INIT
    // =========================================================
    function init(cfg) {
        state.config = cfg;

        if (cfg && isProtectedFormId(cfg.formId)) {
            renderProtectedBuilderNotice(cfg.formId);
            return;
        }

        // Load existing schema
        if (cfg.existingSchema) {
            var parsedSchema = parseSchemaJson(cfg.existingSchema);
            cfg.existingSchema = syncSchemaJsonToPage(parsedSchema.json, parsedSchema);
            state.schema = parsedSchema.schema;
            state.fieldCounter = (state.schema.fields || []).length;
            if (parsedSchema.repaired) console.warn('MegaForm: repaired invalid builder schema before init', parsedSchema.error);
            if (!state.schema.settings) state.schema.settings = {};
        }

        // Init all registered modules
        Object.keys(modules).forEach(function (name) {
            if (typeof modules[name].init === 'function') {
                modules[name].init();
            }
        });

        // If new form with no fields AND template gallery exists, show it
        // unless the user explicitly entered the blank builder from gallery.
        var forceBuilder = !!((window as any).__MF_FORCE_BUILDER);
        if (state.schema.fields.length === 0 && state.config.formId === 0 && !forceBuilder) {
            var gallery = el(EL.templateGallery);
            if (gallery) {
                // Gallery is in ASCX, just make sure builder is hidden
                hide(EL.builderApp);
            } else {
                // Fallback: JS-generated template chooser
                callModule('templates', 'showChooser');
            }
        }
        if (forceBuilder) {
            try { hide(EL.templateGallery); } catch (_e) {}
            show(EL.builderApp);
            try { (window as any).__MF_FORCE_BUILDER = false; } catch (_e) {}
        }

        // Render canvas
        callModule('canvas', 'render');

        // Hydrate settings panel checkboxes from loaded schema
        hydrateSettingsPanel();
    }

    function hydrateSettingsPanel() {
        var st = (state.schema && state.schema.settings) || {};
        var mp = document.getElementById('mf-setting-multi-page') as HTMLInputElement | null;
        if (mp) mp.checked = !!st.multiPage;
        var mpHint = document.getElementById('mf-multipage-hint');
        if (mpHint) mpHint.style.display = st.multiPage ? '' : 'none';
        var doEl = document.getElementById('mf-setting-display-only') as HTMLInputElement | null;
        if (doEl) doEl.checked = !!st.displayOnly;
        // [HideHeader v20260501-02] hydrate Hide Form Header toggle
        var hhEl = document.getElementById('mf-setting-hide-header') as HTMLInputElement | null;
        if (hhEl) hhEl.checked = !!(st as any).hideHeader;
        // Hydrate Database INSERT panel (FormDatabaseInsertUi v20260430-01)
        var dbi = (st as any).databaseInsert || {};
        var dbiEnabled = document.getElementById('mf-setting-db-insert-enabled') as HTMLInputElement | null;
        if (dbiEnabled) dbiEnabled.checked = !!dbi.enabled;
        var dbiBody = document.getElementById('mf-setting-db-insert-body');
        if (dbiBody) dbiBody.style.display = dbi.enabled ? '' : 'none';
        var dbiConn = document.getElementById('mf-setting-db-insert-conn') as HTMLInputElement | null;
        if (dbiConn) dbiConn.value = String(dbi.connectionKey || '');
        var dbiDb = document.getElementById('mf-setting-db-insert-dbtype') as HTMLSelectElement | null;
        if (dbiDb) dbiDb.value = String(dbi.databaseType || '');
        var dbiSql = document.getElementById('mf-setting-db-insert-sql') as HTMLTextAreaElement | null;
        if (dbiSql) dbiSql.value = String(dbi.insertSql || '');
        // Render field chips once after hydration (chip list reads B.state.schema.fields)
        try { var fn = (window as any).MFRenderDbInsertChips; if (typeof fn === 'function') fn(); } catch (_e) {}
    }

    // Load schema from template (called by template gallery)
    function loadSchema(schemaStr) {
        try {
            var parsedResult = parseSchemaJson(schemaStr);
            var parsed = parsedResult.schema;
            if (parsed && parsed.fields) {
                state.schema = parsed;
                syncSchemaJsonToPage(parsedResult.json, parsedResult);
                state.fieldCounter = parsed.fields.length;
                state.selectedFieldIndex = -1;
                state.isDirty = true;
                callModule('canvas', 'render');
                callModule('properties', 'hideProps');
            }
        } catch (e) { console.warn('MegaForm: failed to load schema', e); }
    }

    // =========================================================
    //  PUBLIC API
    // =========================================================

    function getBuilderSettings() {
        if (!state.schema.settings) state.schema.settings = {};
        return state.schema.settings;
    }

    function hasMultiStepSchema() {
        var fields = (state.schema && state.schema.fields) || [];
        var settings = getBuilderSettings();
        if (settings.multiPage) return true;
        var pageBreaks = 0;
        fields.forEach(function (f) {
            if (f && f.type === 'Section' && f.properties && f.properties.pageBreak) pageBreaks++;
        });
        return pageBreaks > 0;
    }

    var localeOptionsLoaded = false;
    function loadBuilderLocaleOptions(selected) {
        var selectEl = el(EL.defaultLanguage);
        if (!selectEl) return;
        var desired = String(selected || getBuilderSettings().defaultLanguage || 'en-US');
        function apply(locales) {
            var list = (locales || []).slice();
            if (list.indexOf('en-US') < 0) list.unshift('en-US');
            selectEl.innerHTML = list.map(function(loc) { return '<option value="' + escHtml(loc) + '">' + escHtml(loc) + '</option>'; }).join('');
            selectEl.value = list.indexOf(desired) >= 0 ? desired : 'en-US';
            localeOptionsLoaded = true;
        }
        if (localeOptionsLoaded) {
            if (desired) selectEl.value = desired;
            return;
        }
        var apiBase = (state.config && state.config.apiBaseUrl) ? String(state.config.apiBaseUrl) : '/api/MegaForm/';
        apiBase = apiBase.replace(/\/?$/, '/');
        fetch(apiBase + 'i18n/list', { credentials: 'same-origin', cache: 'no-store' })
            .then(function(r) { return r.ok ? r.json() : ['en-US']; })
            .then(function(locales) { apply(Array.isArray(locales) ? locales : ['en-US']); })
            .catch(function() { apply(['en-US']); });
    }

    function syncFormActionEditorsFromSchema() {
        var settings = getBuilderSettings();
        var submitEl = el(EL.submitBtnText);
        var prevEl = el(EL.prevBtnText);
        var nextEl = el(EL.nextBtnText);
        var langEl = el(EL.defaultLanguage);
        var multiWrap = document.getElementById('mf-multistep-action-texts');
        var submitText = String((settings as any).submitButtonText || (settings as any).SubmitButtonText || (state.schema as any).submitButtonText || (state.schema as any).SubmitButtonText || 'Submit');
        if (submitEl && !getVal(EL.submitBtnText)) setVal(EL.submitBtnText, submitText);
        if (prevEl) prevEl.value = String(settings.previousButtonText || 'Previous');
        if (nextEl) nextEl.value = String(settings.nextButtonText || 'Next');
        if (langEl && !settings.defaultLanguage) settings.defaultLanguage = 'en-US';
        loadBuilderLocaleOptions(String(settings.defaultLanguage || 'en-US'));
        if (multiWrap) multiWrap.style.display = hasMultiStepSchema() ? '' : 'none';
        return settings;
    }

    function persistFormActionEditorsToSchema() {
        var settings = getBuilderSettings();
        var submitText = getVal(EL.submitBtnText) || (settings as any).submitButtonText || (settings as any).SubmitButtonText || 'Submit';
        (settings as any).submitButtonText = submitText;
        (settings as any).SubmitButtonText = submitText;
        (state.schema as any).submitButtonText = submitText;
        (state.schema as any).SubmitButtonText = submitText;
        settings.previousButtonText = getVal(EL.prevBtnText) || 'Previous';
        settings.nextButtonText = getVal(EL.nextBtnText) || 'Next';
        settings.defaultLanguage = getVal(EL.defaultLanguage) || settings.defaultLanguage || 'en-US';
        return settings;
    }

    // Helper for plugins: get list of all fields in current form
    function getFieldList(excludeKey) {
        return state.schema.fields
            .filter(function(f) { return f.key !== excludeKey && f.type !== 'Section' && f.type !== 'Html'; })
            .map(function(f) { return { key: f.key, label: f.label || f.key, type: f.type }; });
    }

    return {
        init: init,
        loadSchema: loadSchema,
        // Expose internals for modules
        state: state,
        EL: EL,
        fieldTypes: fieldTypes,
        el: el,
        escHtml: escHtml,
        escAttr: escAttr,
        getVal: getVal,
        setVal: setVal,
        isChecked: isChecked,
        setChecked: setChecked,
        show: show,
        hide: hide,
        toggle: toggle,
        generateFieldKey: generateFieldKey,
        createFieldFromTemplate: createFieldFromTemplate,
        normalizeFieldShape: normalizeFieldShape,
        normalizeSchemaShape: normalizeSchemaShape,
        normalizeSettingsShape: normalizeSettingsShape,
        parseSchemaJson: parseSchemaJson,
        sanitizeSchemaJson: sanitizeSchemaJson,
        repairKnownBrokenScriptJson: repairKnownBrokenScriptJson,
        syncSchemaJsonToPage: syncSchemaJsonToPage,
        exportCanonicalSchema: exportCanonicalSchema,
        getFieldList: getFieldList,
        showToast: showToast,
        registerModule: registerModule,
        callModule: callModule,
        hasMultiStepSchema: hasMultiStepSchema,
        syncFormActionEditorsFromSchema: syncFormActionEditorsFromSchema,
        persistFormActionEditorsToSchema: persistFormActionEditorsToSchema,
        builderT: builderT,
        extractVersionBadge: extractVersionBadge,
        stripVersionBadge: stripVersionBadge,
        getLocalizedControlLabel: getLocalizedControlLabel,
        labelRuleBadge: BUILDER_LABEL_BADGE
    };
})();

export {};

(window as any).MegaFormBuilder = MegaFormBuilder;
export { MegaFormBuilder };
