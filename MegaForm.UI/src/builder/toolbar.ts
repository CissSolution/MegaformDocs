/* ============================================================
   MegaForm Builder — Toolbar Module
   File: megaform-builder-toolbar.js
   Depends on: megaform-builder-core.js
   ============================================================ */
import { MegaFormBuilder } from './core';
import { getPlatformRoute, getPlatformHostConfig, getPublicFormUrl } from '@shared/platform-host';
import { flushActiveFieldSettingsFromDom } from './field-settings';
import { openSaveAsTemplateDialog } from './save-as-template';
(function () {
    'use strict';

    var B = MegaFormBuilder;

    // [i18n] Localize toolbar toasts (global catalog → English fallback).
    function bt(key: string, fallback: string, params?: Record<string, string>): string {
        var out = fallback;
        try { var I = (window as any).MegaFormI18n; if (I && typeof I.t === 'function') { var v = I.t(key, params); if (v && v !== key) out = String(v); } } catch (_e) { /* no i18n */ }
        if (params) for (var k in params) out = out.replace('{' + k + '}', params[k]);
        return out;
    }

    var publishReturnBadge = 'BuilderReturnDashboard v20260412-01';
    try { (window as any).__MF_BUILDER_RETURN_BADGE__ = publishReturnBadge; } catch (_e) {}


    var oqtanePreviewBadge = 'OqtanePreviewLive v20260417-10';
    try { (window as any).__MF_OQTANE_PREVIEW_BADGE__ = oqtanePreviewBadge; } catch (_e) {}

    var trueNewModeBadge = 'BuilderTrueNewMode v20260419-07';
    try { (window as any).__MF_BUILDER_TRUE_NEW_MODE_BADGE__ = trueNewModeBadge; } catch (_e) {}

    var preserveModuleBindingBadge = 'BuilderPreserveModuleBind v20260419-08';
    try { (window as any).__MF_BUILDER_PRESERVE_BIND_BADGE__ = preserveModuleBindingBadge; } catch (_e) {}

    var oqtaneAuthPolicyBadge = 'OqtaneAuthPolicy v20260420-02';
    var builderSaveCanonicalBadge = 'BuilderSaveCanonical v20260421-02';
    try { (window as any).__MF_OQTANE_AUTH_POLICY_BADGE__ = oqtaneAuthPolicyBadge; } catch (_e) {}
    try { (window as any).__MF_BUILDER_SAVE_CANONICAL_BADGE__ = builderSaveCanonicalBadge; } catch (_e) {}

    function getSavedFormCacheKey() {
        var ctx = getRootCtx();
        return [
            'mf',
            'oqtane-builder-formid',
            String(ctx.moduleId || 0),
            String(ctx.siteId || 0),
            String(window.location.pathname || '/')
        ].join(':');
    }

    function readPersistedFormId() {
        try {
            var raw = window.sessionStorage.getItem(getSavedFormCacheKey()) || window.localStorage.getItem(getSavedFormCacheKey()) || '';
            var n = Number(raw || 0) || 0;
            return n > 0 ? n : 0;
        } catch (_e) { return 0; }
    }

    function persistFormId(formId) {
        var id = Number(formId || 0) || 0;
        if (id <= 0) return 0;
        try { window.sessionStorage.setItem(getSavedFormCacheKey(), String(id)); } catch (_e) {}
        try { window.localStorage.setItem(getSavedFormCacheKey(), String(id)); } catch (_e) {}
        return id;
    }

    // [BuilderNewModePostSave v20260502-04] Trust dataset.isNew='false' as
    // authoritative — once syncSavedFormId() flips it after first save, the
    // builder is no longer in "new" mode regardless of what the URL still
    // shows. Previous code returned true if URL had ?new=1 even after first
    // save → resolveEffectiveFormId returned 0 → second save (Publish) created
    // a DUPLICATE form instead of updating the just-saved one.
    function isExplicitNewMode() {
        try {
            var root = document.getElementById('mf-builder-root') as HTMLElement | null;
            var dsIsNew = (root && root.dataset) ? String(root.dataset.isNew || '').toLowerCase() : '';
            // Authoritative override: explicit "false" beats stale URL ?new=1.
            if (dsIsNew === 'false') return false;
            if (dsIsNew === 'true') return true;
        } catch (_e) {}
        try {
            var qp = new URLSearchParams(window.location.search || '');
            var raw = String(qp.get('new') || '').toLowerCase();
            if (raw === '1' || raw === 'true') return true;
        } catch (_e) {}
        return false;
    }

    function resolveEffectiveFormId() {
        if (isExplicitNewMode()) return 0;
        var id = Number((B.state && B.state.config && B.state.config.formId) || 0) || 0;
        if (id > 0) return id;
        try {
            var platformFormId = Number(((window as any).__MF_PLATFORM__ && (window as any).__MF_PLATFORM__.formId) || 0) || 0;
            if (platformFormId > 0) return platformFormId;
        } catch (_e) {}
        try {
            var root = document.getElementById('mf-builder-root') as HTMLElement | null;
            var dsId = Number((root && root.dataset && (root.dataset.formId || '')) || 0) || 0;
            if (dsId > 0) return dsId;
        } catch (_e) {}
        try {
            var formIdEl = B.el(B.EL.builderFormId) as HTMLInputElement | null;
            var elId = Number((formIdEl && formIdEl.value) || 0) || 0;
            if (elId > 0) return elId;
        } catch (_e) {}
        try {
            var qp = new URLSearchParams(window.location.search || '');
            var qId = Number(qp.get('formId') || qp.get('formid') || 0) || 0;
            if (qId > 0) return qId;
        } catch (_e) {}
        return readPersistedFormId();
    }

    function syncSavedFormId(nextFormId) {
        var formId = Number(nextFormId || 0) || 0;
        if (formId <= 0) return 0;
        try {
            B.state.config.formId = formId;
        } catch (_e) {}
        try {
            (window as any).FORM_ID = formId;
        } catch (_e) {}
        try {
            var formIdEl = B.el(B.EL.builderFormId) as HTMLInputElement | null;
            if (formIdEl) formIdEl.value = String(formId);
        } catch (_e) {}
        try {
            var root = document.getElementById('mf-builder-root') as HTMLElement | null;
            if (root && root.dataset) {
                root.dataset.formId = String(formId);
                root.dataset.isNew = 'false';
            }
        } catch (_e) {}
        try {
            (window as any).__MF_PLATFORM__ = (window as any).__MF_PLATFORM__ || {};
            (window as any).__MF_PLATFORM__.formId = formId;
        } catch (_e) {}
        persistFormId(formId);
        try {
            var cfg = getPlatformHostConfig();
            var platform = String((cfg && cfg.platform) || '').toLowerCase();
            if (platform !== 'oqtane') {
                var url = new URL(window.location.href);
                url.searchParams.set('formId', String(formId));
                window.history.replaceState(window.history.state || {}, document.title, url.pathname + url.search + url.hash);
            }
        } catch (_e) {}
        return formId;
    }

    function initModule() {
        if (isExplicitNewMode()) {
            try { B.state.config.formId = 0; } catch (_e) {}
            try { (window as any).FORM_ID = 0; } catch (_e) {}
            try {
                var formIdEl = B.el(B.EL.builderFormId) as HTMLInputElement | null;
                if (formIdEl) formIdEl.value = '0';
            } catch (_e) {}
            try {
                var root = document.getElementById('mf-builder-root') as HTMLElement | null;
                if (root && root.dataset) root.dataset.formId = '0';
            } catch (_e) {}
        }

        var btnSave = B.el(B.EL.btnSaveDraft);
        var btnPublish = B.el(B.EL.btnPublish);
        var btnPreview = B.el(B.EL.btnPreview);

        // [Save-keeps-published v20260618] The "Save" button must NOT unpublish a live form.
        // It now persists with the form's CURRENT status — a Published form stays Published
        // (the edit is saved straight to the live form), a Draft stays a Draft — and never
        // redirects away. Only the explicit "Publish" button promotes a draft and returns to
        // the dashboard. (Current status comes from #mf-builder-root[data-form-status], set on
        // load by dom.ts updateBuilderMeta → 'published' | 'draft' | 'archived'.)
        if (btnSave) btnSave.addEventListener('click', function () {
            saveForm(currentFormStatus(), { returnAfter: false, toast: bt('builder.toast_saved', 'Saved!') });
        });
        if (btnPublish) btnPublish.addEventListener('click', function () { saveForm('Published', { returnAfter: true }); });
        if (btnPreview) btnPreview.addEventListener('click', previewForm);

        // [BuilderSaveAsTemplate v20260518-01] Hook the new toolbar button.
        // Pass buildPayload directly so the dialog reads the FRESH builder
        // state at submit time, not at button-mount time.
        var btnSaveAsTemplate = document.getElementById('mf-btn-save-as-template');
        if (btnSaveAsTemplate) {
            btnSaveAsTemplate.addEventListener('click', function () {
                openSaveAsTemplateDialog(buildPayload);
            });
        }

        // [CreateTableViaAi v20260529-03 / v20260529-06] "Create DB Table" button.
        // Does NOT touch the form JSON — fires MFAiChat.sendProgrammatic so the AI
        // assistant calls propose_table_schema(formId) and emits the DDL via
        // chat_message for the admin to review + run.
        //
        // [v20260529-06] If the form has never been saved (formId=0) the tool
        // can't read it. Two options: (a) inline the in-memory schema in the
        // prompt so AI has something to work with, (b) ask user to save first.
        // We do (a) — better UX, no interruption — by passing the field list
        // directly. AI is told to skip the tool call when formId=0.
        var btnCreateTable = document.getElementById('mf-btn-create-table');
        if (btnCreateTable) {
            btnCreateTable.addEventListener('click', function () {
                var Bx: any = (window as any).MegaFormBuilder;
                var formId = (Bx && Bx.state && Bx.state.formId) || 0;
                var title = (Bx && Bx.state && Bx.state.schema && Bx.state.schema.settings && Bx.state.schema.settings.title) || 'NewForm';
                var fields = (Bx && Bx.state && Bx.state.schema && Bx.state.schema.fields) || [];
                var w: any = window as any;
                if (!w.MFAiChat || typeof w.MFAiChat.sendProgrammatic !== 'function') {
                    alert('AI assistant not loaded. Enable it via dev.lock + reload.');
                    return;
                }
                var prompt: string;
                if (formId > 0) {
                    prompt = 'Call the propose_table_schema tool with formId=' + formId +
                             ' to draft a CREATE TABLE that mirrors this form. Show me the DDL via chat_message — DO NOT modify the form widgetProps. I will review and run it myself.';
                } else {
                    // Build a compact field summary so AI has the schema even though it isn't saved.
                    var summary = fields.slice(0, 60).map(function (f: any) {
                        return '- ' + (f.key || '?') + ' : ' + (f.type || '?') + (f.required ? ' (required)' : '');
                    }).join('\n');
                    prompt = 'The form is not saved yet (formId=0), so do NOT call propose_table_schema. ' +
                             'Instead draft a CREATE TABLE DDL inline based on this field list. Use App_' +
                             String(title).replace(/[^A-Za-z0-9]+/g, '') + ' as the table name, ' +
                             'Id INT IDENTITY(1,1) PRIMARY KEY, plus CreatedOnUtc DATETIME2 DEFAULT SYSUTCDATETIME(). ' +
                             'Map types: Text/Phone/Url/Color→NVARCHAR(250), Email→NVARCHAR(254), LongText/RichText/Signature→NVARCHAR(MAX), ' +
                             'Number/Slider/Rating→DECIMAL(18,6), Date→DATE, Time→TIME, DateTime→DATETIME2, Checkbox/Switch→BIT, ' +
                             'Radio/Select→NVARCHAR(120), MultiSelect→NVARCHAR(MAX). Skip layout fields (Row, Heading, Divider, HtmlBlock, Image, DynamicLabel, DataRepeater, DataGrid, FileUpload). ' +
                             'Return the DDL via chat_message. DO NOT modify the form widgetProps.\n\n' +
                             'Fields (key : type):\n' + summary;
                }
                w.MFAiChat.sendProgrammatic(prompt);
            });
        }

        // [AiDesignerTopbar 20260617] Top-bar "AI Designer" button. Opens the
        // unified AI studio (the SAME one as the dashboard "Create with AI":
        // Chat | Database + Live preview) docked-over-canvas, with onApply
        // writing the generated schema to THIS form's canvas (builderApplySchema
        // → replace_form_schema, design-preserving). window.MFAiChat is provided
        // by megaform-ai-form-assistant.js (loaded unconditionally by the builder
        // loader), so the button works regardless of the AI auto-mount gate; the
        // studio itself reports an "enable AI" state if the provider is off.
        var btnAiDesigner = document.getElementById('mf-btn-ai-designer');
        if (btnAiDesigner) {
            btnAiDesigner.addEventListener('click', function () {
                var w: any = window as any;
                if (w.MFAiChat && typeof w.MFAiChat.open === 'function') {
                    w.MFAiChat.open();
                } else {
                    alert('AI Designer is not available. Enable AI in Dashboard → AI Settings.');
                }
            });
        }

        // Minimal DNN/Web cleanup: Import/Export toolbar buttons are disabled for now.
        var btnImport = document.getElementById('mf-btn-import');
        var btnExport = document.getElementById('mf-btn-export');
        if (btnImport && btnImport.parentNode) btnImport.parentNode.removeChild(btnImport);
        if (btnExport && btnExport.parentNode) btnExport.parentNode.removeChild(btnExport);

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', function (e) {
            if (B.state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    function buildPayload(status) {
        flushActiveFieldSettingsFromDom();
        if (B.syncCustomHtmlBidirectional) B.syncCustomHtmlBidirectional({ reason: 'build-payload' });
        var ctx = getRootCtx();
        var schema = B.state.schema || {};
        if ((B as any).persistFormActionEditorsToSchema) (B as any).persistFormActionEditorsToSchema();
        var settings = schema.settings || {};
        var postSubmit = B.callModule ? B.callModule('post-submit-settings', 'getConfig') : null;
        if (!schema.settings) schema.settings = settings;
        if (postSubmit) schema.settings.postSubmitExperience = postSubmit;
        var canonicalSchema = B.exportCanonicalSchema ? B.exportCanonicalSchema(schema) : schema;
        B.state.schema = canonicalSchema;
        settings = canonicalSchema.settings || {};

        var effectiveMessage = (postSubmit && postSubmit.message) || B.getVal('mf-setting-success-msg') || 'Thank you! Your submission has been received.';
        var effectiveRedirect = '';
        if (postSubmit && postSubmit.mode === 'redirect-immediate') {
            effectiveRedirect = postSubmit.redirectUrl || '';
        }

        var moduleRulesJson = '';
        try {
            moduleRulesJson = String((B.callModule && B.callModule('rule-builder-ui', 'getRulesJson')) || '');
        } catch (_rulesErr) { moduleRulesJson = ''; }
        if (!moduleRulesJson) {
            try {
                moduleRulesJson = JSON.stringify(((canonicalSchema as any).rules || (settings as any).rules || []));
            } catch (_rulesFallbackErr) { moduleRulesJson = '[]'; }
        }

        var themeJson: string;
        try {
            var rootEl = document.getElementById('mf-builder-root');
            var rawThemeJson = rootEl && rootEl.getAttribute('data-theme-json');
            var currentPreset = (canonicalSchema.settings && canonicalSchema.settings.theme) || 'default';
            if (rawThemeJson && rawThemeJson !== '{}' && rawThemeJson !== 'null') {
                var parsedTheme = JSON.parse(rawThemeJson);
                parsedTheme.theme = currentPreset;
                themeJson = JSON.stringify(parsedTheme);
            } else {
                themeJson = JSON.stringify({ theme: currentPreset });
            }
            if (rootEl) rootEl.setAttribute('data-builder-save-canonical', builderSaveCanonicalBadge);
        } catch (_themeErr) {
            themeJson = JSON.stringify({ theme: (canonicalSchema.settings && canonicalSchema.settings.theme) || 'default' });
        }

        return {
            FormId:           resolveEffectiveFormId() || 0,
            PreserveModuleBindingOnSave: isExplicitNewMode(),
            ModuleId:         ctx.moduleId || B.state.config.moduleId || 0,
            SiteId:           ctx.siteId || B.state.config.portalId || 0,
            Title:            B.getVal(B.EL.canvasTitle) || 'Untitled Form',
            Description:      B.getVal(B.EL.canvasDescription) || '',
            SchemaJson:       JSON.stringify(canonicalSchema),
            SettingsJson:     JSON.stringify(canonicalSchema.settings || settings),
            ThemeJson:        themeJson,
            Status:           status,
            SubmitButtonText: B.getVal(B.EL.submitBtnText) || 'Submit',
            SuccessMessage:   effectiveMessage,
            RedirectUrl:      effectiveRedirect,
            NotifyEmails:     B.getVal('mf-setting-notify-email') || '',
            WebhookUrl:       B.getVal('mf-setting-webhook-url') || '',
            EnableCaptcha:    B.isChecked('mf-setting-captcha'),
            RequireAuth:      B.isChecked('mf-setting-require-auth'),
            EnableSaveResume: B.isChecked('mf-setting-save-resume'),
            RulesJson:        moduleRulesJson || '[]'
        };
    }

    function getRootCtx() {
        var root = document.getElementById('mf-builder-root');
        var ds = root ? root.dataset : ({} as DOMStringMap);
        return {
            root: root,
            platform: (ds.platform || '').toLowerCase(),
            moduleId: parseInt(ds.moduleId || String(B.state.config.moduleId || 0), 10) || 0,
            siteId: parseInt(ds.siteId || ds.portalId || String(B.state.config.portalId || 0), 10) || 0,
            aliasId: parseInt(ds.aliasId || '0', 10) || 0,
        };
    }

    function appendOqtaneAuthQuery(url, ctx) {
        if (!ctx || ctx.platform !== 'oqtane') return url;
        var qs = [] as string[];
        if (ctx.moduleId > 0) qs.push('authmoduleid=' + encodeURIComponent(String(ctx.moduleId)));
        if (ctx.siteId > 0) qs.push('authsiteid=' + encodeURIComponent(String(ctx.siteId)));
        if (!qs.length) return url;
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs.join('&');
    }

    // [v20260527-04] On DNN, append ?portalId=N (read from __MF_PLATFORM__) so
    // the server scopes data to the caller's portal instead of trusting
    // PortalSettings.Current — which DNN resolves from the request URL alias
    // and gets wrong when the caller is in a child-portal subpath alias.
    function appendDnnPortalQuery(url, ctx) {
        if (!ctx || ctx.platform !== 'dnn') return url;
        if (/[?&]portalId=/i.test(url)) return url;
        var pf = (window as any).__MF_PLATFORM__ || {};
        var raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
        var n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '' : raw), 10);
        if (!isFinite(n) || n < 0) n = 0;
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + n;
    }

    function getSaveEndpoint() {
        var ctx = getRootCtx();
        var apiBase = B.state.config.apiBaseUrl || '/api/MegaForm/';
        if (apiBase.charAt(apiBase.length - 1) !== '/') apiBase += '/';

        // Oqtane server controller uses REST-style POST /api/MegaForm/Form
        if (ctx.platform === 'oqtane') return appendOqtaneAuthQuery(apiBase + 'Form', ctx);

        // Web + DNN legacy builder/backend still use /Form/Save
        return appendDnnPortalQuery(apiBase + 'Form/Save', ctx);
    }

    function getListEndpoint() {
        var ctx = getRootCtx();
        var apiBase = B.state.config.apiBaseUrl || '/api/MegaForm/';
        if (apiBase.charAt(apiBase.length - 1) !== '/') apiBase += '/';
        var url = apiBase + 'Form/List?moduleId=' + encodeURIComponent(String(ctx.moduleId || 0)) + '&siteId=' + encodeURIComponent(String(ctx.siteId || 0));
        return appendDnnPortalQuery(appendOqtaneAuthQuery(url, ctx), ctx);
    }

    function buildOqtaneViewHeaders() {
        var ctx = getRootCtx();
        var headers = { 'X-Requested-With': 'XMLHttpRequest' } as Record<string, string>;
        if (ctx.platform === 'oqtane') {
            if (ctx.moduleId > 0) headers['X-OQTANE-MODULEID'] = String(ctx.moduleId);
            if (ctx.siteId > 0) headers['X-OQTANE-SITEID'] = String(ctx.siteId);
            if (ctx.aliasId > 0) headers['X-OQTANE-ALIASID'] = String(ctx.aliasId);
        }
        return headers;
    }

    function normalizeTitle(value) {
        return String(value || '').trim().toLowerCase();
    }

    function pickBestFormIdFromList(list, preferredTitle) {
        var items = Array.isArray(list) ? list : [];
        if (!items.length) return 0;
        var title = normalizeTitle(preferredTitle || '');
        var scoped = items.slice();
        if (title) {
            var exact = scoped.filter(function (item) {
                return normalizeTitle(item && (item.title || item.Title || item.formName || item.FormName || '')) === title;
            });
            if (exact.length) scoped = exact;
        }
        scoped.sort(function (a, b) {
            var aId = Number((a && (a.formId || a.FormId)) || 0) || 0;
            var bId = Number((b && (b.formId || b.FormId)) || 0) || 0;
            return bId - aId;
        });
        return Number((scoped[0] && (scoped[0].formId || scoped[0].FormId)) || 0) || 0;
    }

    function resolveLatestOqtaneFormId(preferredTitle) {
        var ctx = getRootCtx();
        if (ctx.platform !== 'oqtane') return Promise.resolve(0);
        return fetch(getListEndpoint(), { headers: buildOqtaneViewHeaders() })
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) { return pickBestFormIdFromList(list, preferredTitle); })
            .catch(function () { return 0; });
    }

    function applySaveHeaders(xhr) {
        var ctx = getRootCtx();
        xhr.setRequestHeader('Content-Type', 'application/json');

        if (ctx.platform === 'dnn') {
            // [v20260527-04] Do NOT set TabId/ModuleId headers — DNN's framework
            // cross-checks them against the alias-resolved portal and 400s with
            // "Specified page is not in this site" when the page is in a
            // child-portal subpath alias (e.g. /megaf) but the API URL is
            // root-relative. Server reads portalId from ?portalId=... query.
            // [B65h] Multi-fallback for the antiforgery token. The injected
            // state.config.servicesFramework sometimes returns empty (when DNN
            // $.ServicesFramework is unloaded on the current tab), so also
            // consult window.WebSF (the bridge installed by dom.ts) and a
            // direct DOM scan as last resort. Without this the Save endpoint
            // 401s on pages that don't bootstrap DNN's client framework.
            var sfToken = '';
            try {
                if (B.state.config.servicesFramework && typeof B.state.config.servicesFramework.getAntiForgeryValue === 'function') {
                    sfToken = B.state.config.servicesFramework.getAntiForgeryValue() || '';
                }
            } catch (_e) { sfToken = ''; }
            if (!sfToken) {
                try {
                    if ((window as any).WebSF && typeof (window as any).WebSF.getAntiForgeryValue === 'function') {
                        sfToken = (window as any).WebSF.getAntiForgeryValue() || '';
                    }
                } catch (_e) { /* noop */ }
            }
            if (!sfToken) {
                try {
                    var inputs = document.getElementsByName('__RequestVerificationToken');
                    for (var i = 0; i < inputs.length; i++) {
                        var v = (inputs[i] as HTMLInputElement).value;
                        if (v && v.length > 10) { sfToken = v; break; }
                    }
                } catch (_e) { /* noop */ }
            }
            if (sfToken) xhr.setRequestHeader('RequestVerificationToken', sfToken);
            return;
        }

        var bearer = (window as any).__MF_TOKEN;
        if (bearer) xhr.setRequestHeader('Authorization', 'Bearer ' + bearer);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        if (ctx.platform === 'oqtane') {
            if (ctx.moduleId > 0) xhr.setRequestHeader('X-OQTANE-MODULEID', String(ctx.moduleId));
            if (ctx.siteId > 0) xhr.setRequestHeader('X-OQTANE-SITEID', String(ctx.siteId));
            if (ctx.aliasId > 0) xhr.setRequestHeader('X-OQTANE-ALIASID', String(ctx.aliasId));
        }
    }


    function cleanupWorkflowHostChromeBeforeReturn() {
        try {
            var MFW = (window as any).MFWorkflowRF;
            if (MFW && typeof MFW.cleanupHostChrome === 'function') {
                MFW.cleanupHostChrome(true);
            }
        } catch (_e) {}
        try {
            document.body.classList.remove('mf-dnn-workflow-open');
            document.documentElement.classList.remove('mf-dnn-workflow-open');
            document.querySelectorAll('style[id^="mf-wfrf-hide-style-"]').forEach(function (el) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            });
        } catch (_e2) {}
    }

    function getPublishReturnUrl() {
        try {
            var platform = String((getPlatformHostConfig().platform || '')).toLowerCase();
            if (platform === 'dnn') {
                return getPlatformRoute('dashboard');
            }
        } catch (_e) {}
        try {
            var qp = new URLSearchParams(window.location.search || '');
            var q = qp.get('returnUrl') || qp.get('return') || '';
            if (q) return q;
        } catch (_e) {}
        try {
            var root = document.getElementById('mf-builder-root') as HTMLElement | null;
            var ds = root ? root.dataset : ({} as DOMStringMap);
            if (ds && ds.returnUrl) return ds.returnUrl;
        } catch (_e) {}
        try {
            if (document.referrer) {
                var ref = new URL(document.referrer, window.location.origin);
                if (ref.origin === window.location.origin) return ref.toString();
            }
        } catch (_e) {}
        return '';
    }

    // [Save-keeps-published v20260618] Current persisted status of the loaded form, normalized to
    // the payload casing the server expects ('Published' | 'Draft'). Read from the root dataset
    // that dom.ts sets on load. Unknown / new form → 'Draft'.
    function currentFormStatus() {
        try {
            var root = document.getElementById('mf-builder-root');
            var s = root && root.dataset ? String(root.dataset.formStatus || '') : '';
            return s.toLowerCase() === 'published' ? 'Published' : 'Draft';
        } catch (_e) { return 'Draft'; }
    }

    // saveForm(status, opts?) — opts.returnAfter: only the explicit Publish button redirects to
    // the dashboard afterwards; opts.toast overrides the success toast (so "Save" on a live form
    // shows "Saved!", not "Form published!").
    function saveForm(status, opts?: any) {
        opts = opts || {};
        var payload = buildPayload(status);
        var xhr = new XMLHttpRequest();
        xhr.open('POST', getSaveEndpoint(), true);
        applySaveHeaders(xhr);

        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var result = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                    var responseFormId = Number((result && (result.FormId || result.formId)) || 0) || 0;
                    var savedFormId = syncSavedFormId(responseFormId || resolveEffectiveFormId());
                    var finishSuccess = function (finalFormId) {
                        if (finalFormId > 0) {
                            try { B.state.config.formId = finalFormId; } catch (_e) {}
                            syncSavedFormId(finalFormId);
                        }
                        B.state.isDirty = false;
                        var toastMsg = opts.toast || (status === 'Published' ? bt('builder.toast_published', 'Form published!') : bt('builder.toast_draft_saved', 'Draft saved!'));
                        B.showToast(toastMsg, 'success');
                        // Keep the in-builder status badge in sync with what we just persisted.
                        try { var rootEl2 = document.getElementById('mf-builder-root'); if (rootEl2 && rootEl2.dataset) rootEl2.dataset.formStatus = (status === 'Published' ? 'published' : 'draft'); } catch (_e2) {}
                        if (status === 'Published' && opts.returnAfter) {
                            var returnUrl = getPublishReturnUrl();
                            if (returnUrl) {
                                cleanupWorkflowHostChromeBeforeReturn();
                                window.setTimeout(function () { window.location.href = returnUrl; }, 250);
                            }
                        }
                    };
                    if (savedFormId > 0) {
                        finishSuccess(savedFormId);
                        return;
                    }
                    var ctx = getRootCtx();
                    if (ctx.platform === 'oqtane') {
                        resolveLatestOqtaneFormId(payload.Title || B.getVal(B.EL.canvasTitle) || '')
                            .then(function (latestId) { finishSuccess(latestId || 0); });
                        return;
                    }
                    finishSuccess(0);
                } catch (e) {
                    B.showToast(bt('builder.toast_unexpected', 'Unexpected response'), 'error');
                }
            } else {
                var msg = xhr.responseText || xhr.statusText || ('HTTP ' + xhr.status);
                B.showToast(bt('builder.toast_error_saving', 'Error saving:') + ' ' + msg, 'error');
            }
        };
        xhr.onerror = function () { B.showToast(bt('builder.toast_network_error', 'Network error'), 'error'); };
        xhr.send(JSON.stringify(payload));
    }

    // ── Preview: in-builder iframe overlay (Oqtane) or Theme Designer (DNN/Web) ──
    // [BuilderPreview v20260503-08] Oqtane previously opened the public form URL
    // in a new browser tab. New behaviour: pop a fullscreen overlay inside the
    // builder with the live form in an iframe — same one-click feel that
    // DNN/Web get from the theme designer's preview iframe, without needing
    // a real theme-designer integration on the Oqtane side. The overlay also
    // exposes "Open in new tab" for the original behaviour when desired.
    function openPreviewForFormId(formId) {
        if (!formId) {
            B.showToast(bt('builder.toast_save_before_preview', 'Please save the form first before previewing.'), 'error');
            return;
        }
        syncSavedFormId(formId);
        var cfg = getPlatformHostConfig();
        var platform = String((cfg && cfg.platform) || '').toLowerCase();
        if (platform === 'oqtane') {
            var liveUrl = getPublicFormUrl(formId, false, cfg && cfg.rendererHostUrl ? cfg.rendererHostUrl : undefined);
            showInBuilderPreviewOverlay(liveUrl, formId);
            void oqtanePreviewBadge;
            return;
        }
        (function(){ var url = getPlatformRoute('themeDesigner', formId); if (url.indexOf('mode=') === -1) { url += (url.indexOf('?') >= 0 ? '&' : '?') + 'mode=preview'; } window.open(url, '_blank'); })();
    }

    function showInBuilderPreviewOverlay(url: string, formId: number): void {
        var existing = document.getElementById('mf-builder-preview-overlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'mf-builder-preview-overlay';
        overlay.style.cssText = [
            'position:fixed','inset:0','background:rgba(15,23,42,.78)',
            'z-index:99999','display:flex','flex-direction:column',
            'padding:24px','box-sizing:border-box',
            "font-family:Inter,'Segoe UI',system-ui,sans-serif",
            'animation:mf-bp-fade .15s ease-out'
        ].join(';');

        // One-time keyframe injection (overlay re-creates on every preview)
        if (!document.getElementById('mf-bp-styles')) {
            var st = document.createElement('style');
            st.id = 'mf-bp-styles';
            st.textContent = '@keyframes mf-bp-fade{from{opacity:0}to{opacity:1}}';
            document.head.appendChild(st);
        }

        var header = document.createElement('div');
        header.style.cssText = [
            'display:flex','align-items:center','gap:10px',
            'padding:12px 18px','background:#fff',
            'border-radius:14px 14px 0 0','flex-shrink:0',
            'border-bottom:1px solid #e2e8f0'
        ].join(';');
        header.innerHTML =
            '<strong style="flex:1;color:#1f2a44;font-size:14px;font-weight:600">'
                + '<i class="fa-regular fa-eye" style="margin-right:8px;color:#6366f1"></i>'
                + 'Preview · Form #' + formId
            + '</strong>'
            + '<a id="mf-bp-newtab" href="' + url + '" target="_blank" rel="noopener" style="font-size:12px;color:#6366f1;text-decoration:none;padding:6px 12px;border:1px solid #c7d2fe;border-radius:6px;background:#eef2ff">'
                + 'Open in new tab <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:10px;margin-left:4px"></i>'
            + '</a>'
            + '<button id="mf-bp-close" type="button" style="background:#0f172a;color:#fff;border:0;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px">Close</button>';

        var iframeWrap = document.createElement('div');
        iframeWrap.style.cssText = 'flex:1;background:#fff;border-radius:0 0 14px 14px;overflow:hidden;position:relative;box-shadow:0 32px 80px rgba(15,23,42,.4)';
        var loading = document.createElement('div');
        loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;background:#fff';
        loading.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Loading preview…';
        iframeWrap.appendChild(loading);

        var iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff';
        iframe.addEventListener('load', function () { loading.remove(); });
        iframeWrap.appendChild(iframe);

        overlay.appendChild(header);
        overlay.appendChild(iframeWrap);
        document.body.appendChild(overlay);

        var prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        var close = function () {
            overlay.remove();
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', escListener);
        };
        var escListener = function (e: KeyboardEvent) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escListener);
        var closeBtn = document.getElementById('mf-bp-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        // Click outside header/iframe (the overlay padding) also closes
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }

    function previewForm() {
        var formId = resolveEffectiveFormId();
        if (formId > 0) {
            openPreviewForFormId(formId);
            return;
        }
        var cfg = getPlatformHostConfig();
        var platform = String((cfg && cfg.platform) || '').toLowerCase();
        if (platform === 'oqtane') {
            B.showToast('Resolving saved form for preview...', 'info');
            resolveLatestOqtaneFormId(B.getVal(B.EL.canvasTitle) || '')
                .then(function (latestId) {
                    if (latestId > 0) {
                        openPreviewForFormId(latestId);
                        return;
                    }
                    B.showToast(bt('builder.toast_save_before_preview', 'Please save the form first before previewing.'), 'error');
                });
            return;
        }
        B.showToast('Please save the form first before previewing.', 'error');
    }

    // Expose for extension hooks (rule-builder-ui patches this when present)
    (B as any).buildPayload = buildPayload;

    // Register
    B.registerModule('toolbar', {
        init: initModule,
        saveForm: saveForm,
        previewForm: previewForm,
        preview: previewForm
    });

})();

export {};
