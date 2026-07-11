/* ============================================================
   MegaForm Builder — Panels + App Init
   File: megaform-builder-panels.ts
   Absorbs ALL logic previously in the inline <script> of Builder.cshtml.

   BUGS FIXED:
   #1  Plugin icons: normalize "fa-xxx" → "fas fa-xxx"
   #2  Right panel: always starts OPEN (remove mf-collapsed on setup)
   #3  activateRightTab() hides ALL 9 panes incl. print + workflow
   ============================================================ */


import { MegaFormBuilder } from './core';
import { fetchFormGetOnce } from './boot-fetch-dedup';
import { getEmbedFormUrl, getPublicFormUrl, resolveAssetUrl } from '@shared/platform-host';
const IFRAME_RESIZE_BADGE = 'Iframe resize v20260401-01';
if (typeof window !== 'undefined') (window as any).__MF_IFRAME_RESIZE_BADGE__ = IFRAME_RESIZE_BADGE;
const BUILDER_RESOLVED_LOAD_BADGE = 'BuilderResolvedLoad v20260408-02';
if (typeof window !== 'undefined') (window as any).__MF_BUILDER_RESOLVED_LOAD_BADGE__ = BUILDER_RESOLVED_LOAD_BADGE;
const BUILDER_PENDING_SCHEMA_BADGE = 'BuilderPendingSchema v20260422-02';
const PENDING_TEMPLATE_GUARD_BADGE = 'PendingTemplateGuard v20260422-02';
if (typeof window !== 'undefined') (window as any).__MF_BUILDER_PENDING_SCHEMA_BADGE__ = BUILDER_PENDING_SCHEMA_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_PENDING_TEMPLATE_GUARD_BADGE__ = PENDING_TEMPLATE_GUARD_BADGE;

function buildIframeEmbedCode(origin: string, formId: number, height?: number, radius?: number): string {
    var minHeight = Math.max(320, Number(height) || 600);
    var rad = Math.max(0, Number(radius) || 12);
    var viewUrl = origin + getEmbedFormUrl(formId);
    var wrapId = 'megaform-iframe-wrap-' + formId;
    var frameId = 'megaform-iframe-' + formId;
    return `<div id="${wrapId}" style="width:100%;max-width:100%;margin:0 auto;overflow:hidden;border-radius:${rad}px;">
  <iframe id="${frameId}" src="${viewUrl}"
        width="100%" height="${minHeight}" frameborder="0" scrolling="no"
        style="display:block;width:100%;min-height:${minHeight}px;height:${minHeight}px;border:none;border-radius:${rad}px;overflow:hidden;background:transparent"
        allowtransparency="true" loading="lazy" title="MegaForm ${formId}">
  </iframe>
</div>
<script>
(function(){
  var BADGE = ${JSON.stringify('Iframe resize v20260401-01')};
  var frame = document.getElementById('${frameId}');
  var wrap = document.getElementById('${wrapId}');
  if (!frame) return;
  function applyHeight(next){
    var n = Math.max(${minHeight}, Math.round(Number(next) || 0));
    if (!n) return;
    frame.style.height = n + 'px';
    frame.style.minHeight = n + 'px';
    frame.setAttribute('height', String(n));
    if (wrap) wrap.style.minHeight = n + 'px';
  }
  function onMessage(event){
    var data = event && event.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { return; } }
    if (!data || data.type !== 'mf:resize') return;
    if (data.formId && Number(data.formId) !== ${formId}) return;
    if (event.source && frame.contentWindow && event.source !== frame.contentWindow) return;
    applyHeight(data.height);
  }
  window.addEventListener('message', onMessage, false);
  frame.addEventListener('load', function(){ applyHeight(${minHeight}); });
  void BADGE;
})();
<\/script>`;
}
// ── 1. WebSF shim ────────────────────────────────────────────
var WebSF = {
    getAntiForgeryValue: function(): string { return ''; },
    getModuleId:         function(): number { return 0;  },
    getTabId:            function(): number { return 0;  }
};
(window as any).WebSF = WebSF;

// ── 2. Title sync ────────────────────────────────────────────
function initTitleSync(): void {
    var wTitle = document.getElementById('w-title')          as HTMLInputElement | null;
    var cTitle = document.getElementById('mf-canvas-title')  as HTMLInputElement | null;
    if (wTitle) {
        wTitle.addEventListener('input', function(this: HTMLInputElement) {
            if (cTitle && cTitle.value !== this.value) cTitle.value = this.value;
        });
    }
    document.addEventListener('input', function(e: Event) {
        var t = e.target as HTMLInputElement;
        if (t && t.id === 'mf-canvas-title' && wTitle && wTitle.value !== t.value)
            wTitle.value = t.value;
    });
}

// ── 3. setStatus ─────────────────────────────────────────────
function setStatus(s: any): void {
    // Normalize: API may return status as number enum
    if (typeof s === 'number') s = (['draft','published','archived'][s] || 'draft');
    s = String(s || 'draft');
    var el = document.getElementById('w-status');
    if (!el) return;
    el.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    el.className   = 'w-pill ' + s.toLowerCase();
    var viewLiveBtn = document.getElementById('mf-btn-view-live') as HTMLAnchorElement | null;
    if (viewLiveBtn) {
        var fidEl = document.getElementById('mf-builder-form-id') as HTMLInputElement | null;
        var fid   = parseInt(fidEl ? fidEl.value : '0');
        if (s.toLowerCase() === 'published' && fid > 0) {
            // [ViewLiveUrlFix v20260518-02] getPublicFormUrl returns either a relative
            // path (when the configured renderer host is on the current origin) OR a
            // full absolute URL (when the renderer host is on a different domain).
            // Previously we concatenated location.origin unconditionally → for absolute
            // URLs it produced `http://current.aihttp://other.ai/...`. Use the URL
            // constructor: it preserves an absolute href as-is and resolves a relative
            // one against the current origin.
            var raw = getPublicFormUrl(fid);
            try {
                viewLiveBtn.href = new URL(raw, location.origin).toString();
            } catch (_e) {
                viewLiveBtn.href = raw;
            }
            viewLiveBtn.style.display = '';
        } else {
            viewLiveBtn.style.display = 'none';
        }
    }
}
(window as any).setStatus = setStatus;

// ── 4. initBuilder ───────────────────────────────────────────
function buildPendingSchemaJsonFromSnapshot(snap: any): string {
    try {
        if (!snap) return '{}';
        var settings = Object.assign({}, snap.settings || {});
        settings.customHtml = snap.customHtml || settings.customHtml || '';
        settings.customCss = snap.customCss || settings.customCss || '';
        settings.rules = snap.rules || settings.rules || [];
        if (typeof snap.workflow !== 'undefined' && snap.workflow !== null) settings.workflowTemplate = snap.workflow;
        else if (typeof settings.workflowTemplate === 'undefined') settings.workflowTemplate = null;
        return JSON.stringify({
            version: '1.0',
            fields: JSON.parse(JSON.stringify(snap.fields || [])),
            settings: settings
        });
    } catch (_e) { return '{}'; }
}

function applyPendingTemplateSnapshot(): boolean {
    try {
        var builder = MegaFormBuilder as any;
        var snap = (window as any).__MF_PENDING_TEMPLATE || null;
        if (!builder || !builder.state || !builder.state.schema || !snap) return false;
        var canonicalSchema = builder.exportCanonicalSchema
            ? builder.exportCanonicalSchema({
                version: '1.0',
                fields: Array.isArray(snap.fields) ? snap.fields : [],
                settings: Object.assign({}, snap.settings || {}, {
                    customHtml: snap.customHtml || ((snap.settings || {}).customHtml) || '',
                    customCss: snap.customCss || ((snap.settings || {}).customCss) || '',
                    rules: snap.rules || ((snap.settings || {}).rules) || [],
                    workflowTemplate: snap.workflow || ((snap.settings || {}).workflowTemplate) || null
                })
            })
            : { version: '1.0', fields: Array.isArray(snap.fields) ? snap.fields : [], settings: Object.assign({}, snap.settings || {}) };
        builder.state.schema = canonicalSchema;
        builder.state.fieldCounter = (builder.state.schema.fields || []).length;
        builder.state.selectedFieldIndex = -1;
        builder.state.isDirty = true;
        var root = document.getElementById('mf-builder-root') as HTMLElement | null;
        if (root) {
            root.dataset.schemaJson = JSON.stringify(canonicalSchema);
            root.dataset.pendingTemplateGuard = PENDING_TEMPLATE_GUARD_BADGE;
        }
        (window as any).__MF_PENDING_SCHEMA_JSON = JSON.stringify(canonicalSchema);
        if (builder.setVal && builder.EL) {
            builder.setVal(builder.EL.canvasTitle, snap.title || 'Untitled Form');
            builder.setVal(builder.EL.canvasDescription, snap.description || '');
            builder.setVal(builder.EL.submitBtnText, snap.submitButtonText || 'Submit');
        }
        var htmlEd = document.getElementById('mf-custom-html-editor') as HTMLTextAreaElement | null;
        var cssEd = document.getElementById('mf-custom-css-editor') as HTMLTextAreaElement | null;
        if (htmlEd) htmlEd.value = (canonicalSchema.settings && canonicalSchema.settings.customHtml) || '';
        if (cssEd) cssEd.value = (canonicalSchema.settings && canonicalSchema.settings.customCss) || '';
        if (builder.callModule) {
            builder.callModule('canvas', 'render');
            builder.callModule('properties', 'hideProps');
            builder.callModule('rule-builder-ui', 'refresh');
        }
        return !!((builder.state.schema.fields || []).length);
    } catch (_e) { return false; }
}

function getPendingTemplateSnapshot(tplId: string | null): any {
    try {
        var snap = (window as any).__MF_PENDING_TEMPLATE || null;
        if (snap) return snap;
        if (!tplId || tplId === 'blank' || typeof MegaFormBuilder === 'undefined' || !(MegaFormBuilder as any).callModule) return null;
        return (MegaFormBuilder as any).callModule('templates', 'getPreset', tplId)
            || (MegaFormBuilder as any).callModule('presets', 'getAllPresets')?.[tplId]
            || null;
    } catch (_e) { return null; }
}

function ensureBuilderVisible(): void {
    var gallery = document.getElementById('tpl-gallery') as HTMLElement | null;
    var app = document.getElementById('mf-builder-app') as HTMLElement | null;
    if (gallery) gallery.style.display = 'none';
    if (app) app.style.display = '';
}

function initBuilder(fId: number, schemaJson: string, tplId: string | null): void {
    if (typeof MegaFormBuilder === 'undefined') return;
    var moduleId = (window as any).MODULE_ID || 0;
    var portalId = (window as any).PORTAL_ID || 0;
    var tabId    = (window as any).TAB_ID    || 0;
    var apiBase  = (window as any).API_BASE  || '/api/MegaForm/';
    var platform = (window as any).PLATFORM  || 'aspcore';

    // Use real DNN ServicesFramework if available, else shim
    var sf: any;
    if (platform === 'dnn' && moduleId > 0 &&
        typeof (window as any).$ !== 'undefined' && (window as any).$.ServicesFramework) {
        sf = (window as any).$.ServicesFramework(moduleId);
    } else {
        sf = WebSF;
    }

    var pendingTplId = tplId || (window as any).__MF_PENDING_TEMPLATE_ID || null;
    var pendingSnap = getPendingTemplateSnapshot(pendingTplId);
    var bootSchemaJson = (window as any).__MF_PENDING_SCHEMA_JSON || schemaJson || '{}';
    if ((!bootSchemaJson || bootSchemaJson === '{}') && pendingTplId && pendingTplId !== 'blank' && pendingSnap && (pendingSnap.fields || []).length) {
        bootSchemaJson = buildPendingSchemaJsonFromSnapshot(pendingSnap);
    }
    try {
        var sanitizer = (MegaFormBuilder as any).sanitizeSchemaJson;
        if (typeof sanitizer === 'function') bootSchemaJson = sanitizer(bootSchemaJson || '{}');
    } catch (_e) { }

    var bootRoot = document.getElementById('mf-builder-root') as HTMLElement | null;
    if (bootRoot) {
        bootRoot.dataset.schemaJson = bootSchemaJson || '{}';
        bootRoot.dataset.pendingSchemaBadge = BUILDER_PENDING_SCHEMA_BADGE;
    }
    (window as any).__MF_PENDING_SCHEMA_JSON = bootSchemaJson || '{}';
    (window as any).SCHEMA_JSON = bootSchemaJson || '{}';
    var schemaHidden = document.getElementById('mf-builder-schema-json') as HTMLInputElement | null;
    if (schemaHidden) schemaHidden.value = bootSchemaJson || '{}';

    MegaFormBuilder.init({
        moduleId:          moduleId,
        portalId:          portalId,
        tabId:             tabId,
        formId:            fId || 0,
        apiBaseUrl:        apiBase,
        servicesFramework: sf,
        existingSchema:    bootSchemaJson
    });

    if (pendingTplId && pendingTplId !== 'blank') {
        ensureBuilderVisible();
        if (pendingSnap && MegaFormBuilder.setVal && (MegaFormBuilder as any).EL) {
            MegaFormBuilder.setVal((MegaFormBuilder as any).EL.canvasTitle, pendingSnap.title || 'Untitled Form');
            MegaFormBuilder.setVal((MegaFormBuilder as any).EL.canvasDescription, pendingSnap.description || '');
            MegaFormBuilder.setVal((MegaFormBuilder as any).EL.submitBtnText, pendingSnap.submitButtonText || 'Submit');
            if ((MegaFormBuilder as any).callModule) {
                (MegaFormBuilder as any).callModule('canvas', 'render');
                (MegaFormBuilder as any).callModule('properties', 'hideProps');
            }
        }
        if (MegaFormBuilder && MegaFormBuilder.state && MegaFormBuilder.state.schema) {
            var hydrated = applyPendingTemplateSnapshot();
            if (!hydrated && !(MegaFormBuilder.state.schema.fields || []).length && MegaFormBuilder.applyTemplate) {
                MegaFormBuilder.applyTemplate(pendingTplId);
                applyPendingTemplateSnapshot();
            }
        }
        window.setTimeout(function () {
            ensureBuilderVisible();
            var applied = false;
            if (MegaFormBuilder && MegaFormBuilder.state && MegaFormBuilder.state.schema) {
                applied = applyPendingTemplateSnapshot();
                if (!applied && !(MegaFormBuilder.state.schema.fields || []).length && MegaFormBuilder.applyTemplate) MegaFormBuilder.applyTemplate(pendingTplId);
            }
        }, 80);
        window.setTimeout(function () {
            ensureBuilderVisible();
            if (MegaFormBuilder && MegaFormBuilder.state && MegaFormBuilder.state.schema) {
                applyPendingTemplateSnapshot();
            }
        }, 220);
    } else {
        ensureBuilderVisible();
        try {
            if ((MegaFormBuilder as any).callModule) {
                (MegaFormBuilder as any).callModule('canvas', 'render');
                (MegaFormBuilder as any).callModule('canvas', 'refreshInteractions');
                (MegaFormBuilder as any).callModule('properties', 'hideProps');
            }
        } catch (_e) { }
        window.setTimeout(function () {
            ensureBuilderVisible();
            try {
                if ((MegaFormBuilder as any).callModule) (MegaFormBuilder as any).callModule('canvas', 'refreshInteractions');
            } catch (_e) { }
            try { (window as any).__MF_FORCE_BUILDER = false; } catch (_e) { }
        }, 50);
    }
}
(window as any).initBuilder = initBuilder;

// ── 5. Template gallery ──────────────────────────────────────
function initGallery(): void {
    var modernGallery = (window as any).MFBuilderGallery;
    if (modernGallery && typeof modernGallery.init === 'function') {
        modernGallery.init();
        return;
    }

    var catMeta: Record<string, { label: string }> = {
        all: { label:'All' }, general: { label:'General' }, events: { label:'Events' },
        hr:  { label:'HR' }, survey:  { label:'Surveys'  }, healthcare: { label:'Healthcare' }
    };

    var presets: Record<string, any> =
        (typeof MegaFormBuilder !== 'undefined' && MegaFormBuilder.callModule)
            ? MegaFormBuilder.callModule('templates', 'getAllPresets') || {}
            : {};

    if (!presets || !Object.keys(presets).length) {
        presets = {
            'blank':                { title:'Blank Form',              description:'Start from scratch',                                       category:'all',        icon:'📋', fields:[] },
            'job-application':      { title:'Job Application Form',    description:'4 steps · skip Experience if Fresher · validation rules',  category:'hr',         icon:'💼', fields:[] },
            'medical-intake':       { title:'Patient Intake Form',     description:'3 steps · conditional health fields · insurance toggle',   category:'healthcare', icon:'🏥', fields:[] },
            'event-registration':   { title:'Event Registration',      description:'3 steps · VIP extras · workshop selection · dietary',      category:'events',     icon:'🎟️', fields:[] }
        };
    }

    var selected: string | null = null;
    var tplGrid    = document.getElementById('tpl-grid');
    var tplFilters = document.getElementById('tpl-filters');
    var useBtn     = document.getElementById('tpl-use-btn') as HTMLButtonElement | null;
    if (!tplGrid || !tplFilters || !useBtn) return;

    var cats: string[] = ['all'];
    Object.keys(presets).forEach(function(k) {
        var c = presets[k].category;
        if (c && c !== 'all' && cats.indexOf(c) === -1) cats.push(c);
    });
    tplFilters.innerHTML = '';
    cats.forEach(function(c) {
        var b = document.createElement('button');
        b.className = 'tpl-cat' + (c === 'all' ? ' active' : '');
        b.setAttribute('data-cat', c);
        b.textContent = catMeta[c] ? catMeta[c].label : c.charAt(0).toUpperCase() + c.slice(1);
        tplFilters.appendChild(b);
    });

    var gradients: Record<string, [string,string]> = {
        general:  ['#f472b6','#fb923c'],
        events:   ['#a78bfa','#f472b6'],
        hr:       ['#34d399','#059669'],
        survey:   ['#60a5fa','#818cf8'],
        healthcare:['#f87171','#fbbf24'],
        all:      ['#94a3b8','#cbd5e1']
    };

    function renderGrid(cat: string): void {
        var html = '';
        Object.keys(presets).forEach(function(id) {
            var tpl = presets[id];
            if (cat && cat !== 'all' && (tpl.category || 'general') !== cat && id !== 'blank') return;
            var icon       = tpl.icon || '📋';
            var fieldCount = (tpl.fields && tpl.fields.length) ? tpl.fields.length : 0;
            var isMulti    = tpl.fields && tpl.fields.some(function(f: any) { return f.properties && f.properties.pageBreak; });

            if (id === 'blank') {
                html += '<div class="tpl-card tpl-blank' + (selected === id ? ' sel' : '') + '" data-tpl="blank">' +
                        '<div class="tpl-blank-plus">+</div>' +
                        '<div class="tpl-blank-label">Start Blank</div></div>';
            } else {
                var g = gradients[tpl.category || 'general'] || ['#6366f1','#818cf8'];
                var badge = isMulti ? '<span class="tpl-badge">multi-page</span>' : '';
                html += '<div class="tpl-card' + (selected === id ? ' sel' : '') + '" data-tpl="' + id + '">' +
                        '<div class="tpl-thumb" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + badge + '<span>' + icon + '</span></div>' +
                        '<div class="tpl-body">' +
                        '<div class="tpl-name">' + (tpl.title || id) + '</div>' +
                        '<div class="tpl-desc">' + (tpl.description || '') + '</div>' +
                        (fieldCount ? '<div class="tpl-fields">' + fieldCount + ' fields</div>' : '') +
                        '</div></div>';
            }
        });
        tplGrid.innerHTML = html;
        tplGrid.querySelectorAll<HTMLElement>('.tpl-card').forEach(function(c) {
            c.addEventListener('click', function() {
                tplGrid.querySelectorAll('.tpl-card').forEach(function(x) { x.classList.remove('sel'); });
                c.classList.add('sel');
                selected = c.getAttribute('data-tpl');
                useBtn!.disabled = false;
            });
            c.addEventListener('dblclick', function() {
                selected = c.getAttribute('data-tpl');
                useBtn!.disabled = false;
                enterBuilder(selected);
            });
        });
    }

    tplFilters.addEventListener('click', function(e: MouseEvent) {
        var btn = (e.target as HTMLElement).closest<HTMLElement>('.tpl-cat');
        if (!btn) return;
        tplFilters.querySelectorAll('.tpl-cat').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderGrid(btn.getAttribute('data-cat') || 'all');
    });

    useBtn.addEventListener('click', function() {
        if (!selected) return;
        enterBuilder(selected);
    });


    // ── helper: transition gallery → builder (swap topbar + body class)
    function enterBuilder(tplId: string | null): void {
        var fn = (window as any).enterBuilder;
        if (typeof fn === 'function') {
            fn(tplId);
            return;
        }
        // Fallback if gallery.ts not yet init
        var gallery    = document.getElementById('tpl-gallery');
        var builderApp = document.getElementById('mf-builder-app');
        if (gallery)    gallery.style.display    = 'none';
        if (builderApp) builderApp.style.display = '';
        var galTop = document.querySelector<HTMLElement>('.w-topbar-gallery');
        var bldTop = document.querySelector<HTMLElement>('.w-topbar-builder');
        if (galTop) galTop.classList.add('mf-hidden');
        if (bldTop) bldTop.classList.remove('mf-hidden');
        document.body.classList.remove('state-gallery');
        document.body.classList.add('state-builder');
        initBuilder(0, '{}', tplId);
    }

    renderGrid('all');
}

// ── 6. Load existing form ────────────────────────────────────
function initFormLoader(): void {
    var FORM_ID: number = (window as any).FORM_ID || 0;
    var API_BASE: string = (window as any).API_BASE || '/api/MegaForm/';
    var wTitle  = document.getElementById('w-title')          as HTMLInputElement | null;
    var cTitle  = document.getElementById('mf-canvas-title')  as HTMLInputElement | null;
    if (FORM_ID <= 0) return;

    // [v20260527-04] FormController is [DnnAuthorize(StaticRoles="Administrators")] →
    // fetch without anti-forgery token returns 401 on DNN. Build minimal DNN
    // headers (RequestVerificationToken only — TabId/ModuleId headers were
    // dropped because they 400 on child-portal subpath aliases per the
    // ResolveTargetPortalId story documented in adapters/dnn.ts:14).
    var _panelSfHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    var _portalIdQ = 0;
    try {
        var _platform = (window as any).PLATFORM || (window as any).__MF_PLATFORM__?.platform || 'aspcore';
        var _mid = (window as any).MODULE_ID || (window as any).__MF_PLATFORM__?.moduleId || 0;
        var _pfPortal = (window as any).__MF_PLATFORM__?.portalId;
        if (typeof _pfPortal === 'number' && _pfPortal >= 0) _portalIdQ = _pfPortal;
        else { var _n = parseInt(String(_pfPortal == null ? '0' : _pfPortal), 10); if (isFinite(_n) && _n >= 0) _portalIdQ = _n; }
        if (String(_platform).toLowerCase() === 'dnn' && _mid > 0) {
            var _jq = (window as any).jQuery || (window as any).$;
            var _sf = _jq && _jq.ServicesFramework && _jq.ServicesFramework(_mid);
            if (_sf && _sf.getAntiForgeryValue()) {
                _panelSfHeaders['RequestVerificationToken'] = _sf.getAntiForgeryValue();
            }
        }
    } catch (_) {}

    fetchFormGetOnce(FORM_ID, API_BASE + 'Form/Get?formId=' + FORM_ID + '&moduleId=0&portalId=' + _portalIdQ, { headers: _panelSfHeaders })   // [dedup] shared with dom.ts boot path
        .then(function(form: any) {
            var title  = form.title || form.Title || form.formName || form.FormName || 'Untitled';
            var resolvedModel = form.resolvedRenderModel || form.ResolvedRenderModel || null;
            var schema = (resolvedModel && (resolvedModel.schemaJson || resolvedModel.SchemaJson)) || form.resolvedSchemaJson || form.ResolvedSchemaJson || form.schemaJson || form.SchemaJson || '{}';
            var bootRoot = document.getElementById('mf-builder-root') as HTMLElement | null;
            if (bootRoot) {
                bootRoot.dataset.schemaJson = schema || '{}';
                bootRoot.dataset.pendingSchemaBadge = BUILDER_PENDING_SCHEMA_BADGE;
            }
            (window as any).__MF_PENDING_SCHEMA_JSON = schema || '{}';
            var settingsJson = (resolvedModel && (resolvedModel.settingsJson || resolvedModel.SettingsJson)) || form.resolvedSettingsJson || form.ResolvedSettingsJson || form.settingsJson || form.SettingsJson || '{}';
            var _rawSt = form.status != null ? form.status : form.Status;
            var status = typeof _rawSt === 'string' ? _rawSt.toLowerCase()
                       : typeof _rawSt === 'number' ? (['draft','published','archived'][_rawSt] || 'draft')
                       : 'draft';
            if (wTitle) wTitle.value = title;
            if (cTitle) cTitle.value = title;
            setStatus(status);
            initBuilder(FORM_ID, schema, null);

            try {
                var B = (window as any).MegaFormBuilder;
                if (B && B.state && B.state.schema) {
                    var parsedSettings = {} as any;
                    try { parsedSettings = settingsJson ? (typeof settingsJson === 'string' ? JSON.parse(settingsJson) : settingsJson) : {}; } catch (_settingsErr) { parsedSettings = {}; }
                    if (!B.state.schema.settings) B.state.schema.settings = {};
                    B.state.schema.settings = Object.assign({}, B.state.schema.settings || {}, parsedSettings || {});
                    var resolvedSubmitText = String((parsedSettings && (parsedSettings.submitButtonText || parsedSettings.SubmitButtonText)) || form.submitButtonText || form.SubmitButtonText || 'Submit');
                    B.state.schema.settings.submitButtonText = resolvedSubmitText;
                    B.state.schema.settings.SubmitButtonText = resolvedSubmitText;
                    if (parsedSettings && (parsedSettings.postSubmitExperience || parsedSettings.PostSubmitExperience)) {
                        B.state.schema.settings.postSubmitExperience = parsedSettings.postSubmitExperience || parsedSettings.PostSubmitExperience;
                        B.state.schema.settings.PostSubmitExperience = B.state.schema.settings.postSubmitExperience;
                    }
                    B.state.schema.submitButtonText = resolvedSubmitText;
                    B.state.schema.SubmitButtonText = resolvedSubmitText;
                    if (B.setVal && B.EL) B.setVal(B.EL.submitBtnText, resolvedSubmitText);
                    if (B.syncFormActionEditorsFromSchema) B.syncFormActionEditorsFromSchema();
                    if (B.callModule) B.callModule('post-submit-settings', 'syncFromSchema');
                    if (B.callModule) B.callModule('integration-settings', 'syncFromSchema');
                }
            } catch (_psErr) { /* noop */ }

            var origin = location.origin;
            var publicUrl = origin + getPublicFormUrl(FORM_ID);
            var embedUrl = origin + getEmbedFormUrl(FORM_ID);
            var embedJs = origin + resolveAssetUrl('js/megaform-embed.js');
            var ejEl = document.getElementById('mf-embed-js')     as HTMLTextAreaElement | null;
            var eiEl = document.getElementById('mf-embed-iframe') as HTMLTextAreaElement | null;
            if (ejEl) ejEl.value =
                '<div id="megaform-' + FORM_ID + '"></div>\n' +
                '<script src="' + embedJs + '"\n' +
                '        data-form-id="' + FORM_ID + '"\n' +
                '        data-server="' + origin + '"\n' +
                '        data-view-url="' + publicUrl + '"\n' +
                '        data-embed-url="' + embedUrl + '">\n<\/script>';
            if (eiEl) eiEl.value =
                '<iframe src="' + embedUrl + '"\n' +
                '        width="100%" height="600" frameborder="0"\n' +
                '        style="border:none;border-radius:12px">\n</iframe>';
            var er = document.getElementById('embed-ready');
            var ep = document.getElementById('embed-pending');
            if (er) er.style.display = '';
            if (ep) ep.style.display = 'none';
        })
        .catch(function(e: any) {
            console.warn('Could not load form:', e);
            initBuilder(FORM_ID, '{}', null);
        });
}

// ── 7. Copy buttons ──────────────────────────────────────────
function initCopyButtons(): void {
    document.addEventListener('click', function(e: MouseEvent) {
        var btn = (e.target as HTMLElement).closest<HTMLElement>('.mf-copy-btn');
        if (!btn) return;
        var targetEl = document.getElementById(btn.getAttribute('data-target') || '');
        if (!targetEl) return;
        var text = (targetEl as HTMLInputElement).value || targetEl.textContent || '';
        navigator.clipboard.writeText(text).then(function() {
            var orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(function() { btn.innerHTML = orig; }, 1500);
        });
    });
}

// ── ALL_TABS: BUG #3 — print + workflow included ─────────────
var ALL_TABS = ['field','widget','settings','html','ai','embed','rules','perms','print','workflow'];

function activateRightTab(tabName: string): void {
    ALL_TABS.forEach(function(t) {
        var link = document.getElementById('mf-tab-link-' + t);
        var pane = document.getElementById('mf-tab-' + t);
        if (link) link.classList.toggle('active', t === tabName);
        if (pane) pane.style.display = (t === tabName) ? '' : 'none';
    });
}

// ── 8. Print tab ─────────────────────────────────────────────
function initPrintTab(): void {
    var printTabLink = document.getElementById('mf-tab-link-print');
    if (!printTabLink) return;
    var printInited = false;
    printTabLink.addEventListener('click', function() {
        activateRightTab('print');   // FIX #3: hides all others incl. workflow
        if (!printInited) {
            printInited = true;
            if (typeof MFPrintSettings !== 'undefined') {
                MFPrintSettings.injectStyles();
                MFPrintSettings.init('mf-print-settings-container');
            }
        }
    });
}

// ── 9. Workflow tab ──────────────────────────────────────────
// BUG FIX v20260405-15: initWorkflowTab() was registering a SECOND click handler
// on #mf-tab-link-workflow. dom.ts already registers the canonical handler (with
// retry logic). Having two handlers caused MFWorkflowRF.init() to fire twice per
// click: the second call deleted the overlay created by the first, causing the
// workflow canvas to render into a detached (invisible) DOM node.
// Resolution: consolidate to the single handler in dom.ts. initWorkflowTab() now
// only handles activateRightTab() which dom.ts does not call — that call is kept
// here so the right-panel tab CSS stays correct.
function initWorkflowTab(): void {
    // Intentionally empty — tab switching (activateRightTab) is handled by the
    // delegated click listener already set up on #mf-panel-right in initPanelTabs().
    // The MFWorkflowRF.init() call lives exclusively in dom.ts to avoid double-init.
}

// ── 10. Left panel ───────────────────────────────────────────
function setupLeftPanel(): void {
    var panel = document.getElementById('mf-panel-left');
    if (!panel) return;
    var btn = document.getElementById('mf-left-collapse-btn') as HTMLAnchorElement | null;
    if (!btn) {
        var header = panel.querySelector<HTMLElement>('.mf-panel-header h4');
        if (header) {
            header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:0;font-size:14px;font-weight:600;';
            btn = document.createElement('a');
            btn.id = 'mf-left-collapse-btn'; btn.href = '#'; btn.title = 'Hide panel';
            btn.style.cssText = 'color:#94a3b8;font-size:14px;padding:4px 6px;border-radius:4px;text-decoration:none;';
            btn.innerHTML = '<i class="fa fa-chevron-left"></i>';
            header.appendChild(btn);
        }
    }
    // [B83c-TriggersFlushEdge] Open trigger is now pre-rendered by dom.ts
    // (createBuilderLayout) as `<a id="mf-left-open-btn" class="mf-edge-open
    // mf-edge-open-left">…</a>` with inline Lucide PanelLeftOpen SVG. Style
    // owned by megaform-builder-shell.css (16×64 flush at viewport-left:0).
    var openBtn = document.getElementById('mf-left-open-btn') as HTMLAnchorElement | null;
    addStyle(
        '.mf-panel-left{transition:width .3s ease,opacity .3s ease,padding .3s ease;overflow:hidden;}' +
        '.mf-panel-left.mf-collapsed{width:0 !important;opacity:0;padding:0;border-right:none;overflow:hidden;}'
    );
    if (btn && !(btn as any).dataset?.mfCollapseWired) {
        (btn as any).dataset.mfCollapseWired = '1';
        btn.addEventListener('click', function(e: Event) {
            e.preventDefault(); panel.classList.remove('mf-expanded'); panel.classList.add('mf-collapsed');
            if (openBtn) openBtn.style.display = 'flex';
        });
    }
    if (openBtn && !(openBtn as any).dataset?.mfCollapseWired) {
        (openBtn as any).dataset.mfCollapseWired = '1';
        openBtn.addEventListener('click', function(e: Event) {
            e.preventDefault(); panel.classList.remove('mf-collapsed'); openBtn!.style.display = 'none';
        });
    }
    // [B83c] Initial state — open trigger hidden until panel is collapsed
    if (openBtn) openBtn.style.display = 'none';
}

// ── 11. Right panel — BUG #2 FIX ────────────────────────────
function setupRightPanel(): void {
    var panel = document.getElementById('mf-panel-right');
    if (!panel) return;

    // BUG #2 FIX: always start open
    panel.classList.remove('mf-collapsed');

    var tabBar = panel.querySelector<HTMLElement>('.mf-right-tabs');
    var btn = document.getElementById('mf-right-collapse-btn') as HTMLAnchorElement | null;
    if (!btn && tabBar) {
        btn = document.createElement('a');
        btn.id = 'mf-right-collapse-btn'; btn.href = '#'; btn.className = 'mf-right-tab'; btn.title = 'Hide panel';
        btn.style.cssText = 'flex:0 !important;padding:10px 8px !important;color:#94a3b8;';
        btn.innerHTML = '<i class="fa fa-chevron-right"></i>';
        tabBar.insertBefore(btn, tabBar.firstChild);
    }
    // [B83c-TriggersFlushEdge] Open trigger pre-rendered by dom.ts; style owned
    // by megaform-builder-shell.css.
    var openBtn = document.getElementById('mf-right-open-btn') as HTMLAnchorElement | null;
    addStyle(
        '.mf-panel-right{position:relative;overflow:visible;transition:width .3s ease,opacity .3s ease,padding .3s ease;border-left:1px solid #e4e4e7;box-shadow:none;}' +
        // [B83c] Right resizer — thin invisible hit area (was 14px wide gradient bar).
        // Keeps drag-to-resize functional via the wider hit zone but visible chrome
        // is just a 1px hairline; hover thickens it slightly for affordance.
        // [2026-06-10] Wider hit zone (14px) + an always-visible grip handle (a
        // small rounded pill with 3 dots) centred on the edge so users discover
        // the inspector is draggable. Turns indigo on hover/drag.
        '.mf-right-resizer{position:absolute;left:-7px;top:0;bottom:0;width:14px;cursor:col-resize;z-index:9;background:transparent;border:none;display:flex;align-items:center;justify-content:center;}' +
        '.mf-right-resizer:before{content:"";position:absolute;left:6px;top:0;bottom:0;width:1px;background:#e4e4e7;transition:width .15s ease,background .15s ease;}' +
        '.mf-right-resizer:after{content:"⋮";position:absolute;left:1px;top:50%;transform:translateY(-50%);width:12px;height:34px;line-height:34px;text-align:center;font-size:14px;color:#94a3b8;background:#fff;border:1px solid #e4e4e7;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);transition:.15s;}' +
        '.mf-right-resizer:hover:before,.mf-resizing-right-panel .mf-right-resizer:before{width:2px;background:#6366f1;}' +
        '.mf-right-resizer:hover:after,.mf-resizing-right-panel .mf-right-resizer:after{color:#fff;background:#6366f1;border-color:#6366f1;}' +
        '.mf-panel-right.mf-collapsed{width:0 !important;min-width:0 !important;max-width:0 !important;padding:0 !important;margin:0 !important;opacity:0;overflow:hidden;border-left:none;pointer-events:none;box-shadow:none;}' +
        '.mf-panel-right.mf-collapsed #mf-right-resizer{display:none !important;}' +
        '#mf-right-collapse-btn:hover{color:#6366f1 !important;background:#f1f5f9;}'
    );
    if (btn && !(btn as any).dataset?.mfCollapseWired) {
        (btn as any).dataset.mfCollapseWired = '1';
        btn.addEventListener('click', function(e: Event) {
            e.preventDefault(); panel.classList.remove('mf-expanded'); panel.classList.add('mf-collapsed');
            if (openBtn) openBtn.style.display = 'flex';
        });
    }
    if (openBtn && !(openBtn as any).dataset?.mfCollapseWired) {
        (openBtn as any).dataset.mfCollapseWired = '1';
        openBtn.addEventListener('click', function(e: Event) {
            e.preventDefault(); panel.classList.remove('mf-collapsed'); openBtn!.style.display = 'none';
        });
    }
    // [B83c] Initial state — open trigger hidden until panel is collapsed
    if (openBtn) openBtn.style.display = 'none';
}

// ── 12. Widget tab — BUG #1 FIX (normalizeIcon) ──────────────
function normalizeIcon(raw: string): string {
    if (!raw) return 'fas fa-puzzle-piece';
    if (/^fa[brs]\s/.test(raw)) return raw;
    if (/^fa-/.test(raw))       return 'fas ' + raw;
    return raw;
}

const BUILDER_PANEL_RULES_BADGE = 'BuilderPanelRules v20260403-03';

function setupWidgetTab(): void {
    // Session 219c+: widget settings stay inside the Field tab only.
    // Remove any legacy widget tab injected by older JS so the right pane stays clean.
    var widgetTabLink = document.getElementById('mf-tab-link-widget');
    if (widgetTabLink && widgetTabLink.parentNode) widgetTabLink.parentNode.removeChild(widgetTabLink);
    var widgetPane = document.getElementById('mf-tab-widget');
    if (widgetPane && widgetPane.parentNode) widgetPane.parentNode.removeChild(widgetPane);
}

function updateWidgetTab(_field: any): void {
    // No-op on purpose. Widget settings are rendered inside Field tab.
}


// ── Utility ───────────────────────────────────────────────────
function addStyle(css: string): void {
    var tag = document.getElementById('mf-panels-css');
    if (!tag) { tag = document.createElement('style'); tag.id = 'mf-panels-css'; document.head.appendChild(tag); }
    tag.textContent += css;
}

// ── Boot ──────────────────────────────────────────────────────
function bootPanels(): void {
    if (typeof MegaFormBuilder === 'undefined') { setTimeout(bootPanels, 100); return; }
    if (!(MegaFormBuilder as any)._modules) (MegaFormBuilder as any)._modules = {};
    (MegaFormBuilder as any)._builderPanelRulesBadge = BUILDER_PANEL_RULES_BADGE;
    setupLeftPanel();
    setupRightPanel();
    setupWidgetTab();
    // fixSortable() REMOVED — canvas.ts initMainSortable() handles all Sortable logic.
    // Two Sortable on #mf-canvas-fields with different group names breaks palette drag.
    initPrintTab();
    initWorkflowTab();
}

function bootApp(): void {
    initTitleSync();
    initGallery();
    initCopyButtons();
    initFormLoader();
    bootPanels();
}

// [B359] Re-boot hook for Blazor enhanced-nav. The builder bundle only auto-boots ONCE (module
// load). When the tab navigates to a DIFFERENT builder in-place (?mfpanel=builder&formId=N), a
// fresh EMPTY #mf-builder-root is mounted but the already-loaded bundle never boots it → blank.
// The loader (loadBuilderBundle / boot) already calls MegaFormBuilder.reInit() in that path; it
// was just never wired. Wire it to bootApp, guarded to only build a freshly-mounted EMPTY root so
// re-entering an already-built root is a no-op (no double-build). initFormLoader inside reads the
// fresh window.FORM_ID / root data set by the new page's boot script.
try {
    if (typeof (window as any).MegaFormBuilder !== 'undefined') {
        (window as any).MegaFormBuilder.reInit = function () {
            var r = document.getElementById('mf-builder-root');
            if (!r || r.children.length > 0) return;
            bootApp();
        };
    }
} catch (_e) { /* reInit is best-effort */ }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(bootApp, 200); });
} else {
    setTimeout(bootApp, 200);
}

export {};
