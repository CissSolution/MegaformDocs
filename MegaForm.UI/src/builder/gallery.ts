/* ============================================================
   MegaForm — Builder Gallery v5
   - In-memory preview modal (no form creation required)
   - Quick preview popover on hover
   - Richer live thumbnail cards
   - Reliable template replacement into existing builder schema
   ============================================================ */

(function () {
  'use strict';

  type AnyObj = any;

  var _builderInited = false;
  var _galleryInited = false;
  var PAGE_SIZE = 12;
  var _currentPage = 0;
  var _currentCat  = 'all';
  var _allKeys: string[] = [];
  var _presets: Record<string, any> = {};
  var _selected: string | null = null;
  var _tplGrid: HTMLElement | null = null;
  var _useBtn: HTMLButtonElement | null = null;
  var _quickPreviewEl: HTMLElement | null = null;
  var _quickPreviewTimer = 0;
  var _quickPreviewHideTimer = 0;
  var _quickPreviewTplId: string | null = null;
  var _previewModalEl: HTMLElement | null = null;
  var _previewDevice: 'desktop' | 'tablet' | 'mobile' = 'desktop';
  var _previewTplId: string | null = null;
  var GALLERY_DEMO_BADGE = 'Theme Gallery demo badge v20260401-05d';
  var GALLERY_RECURSIVE_BADGE = 'TemplateGalleryRecursive v20260405-17';
  var DEV_BULK_BADGE = 'Dev bulk publish forms v20260410-08';
  var PREVIEW_OVERLAY_BADGE = 'TemplatePreviewHost v20260410-06';
  var GALLERY_ZIP_UPLOAD_BADGE = 'TemplateGalleryZipUpload v20260407-01';
  var TEMPLATE_FOLDER_HINT_BADGE = 'TemplateFolderHint v20260409-09';
  var GALLERY_MULTI_CATEGORY_BADGE = 'GalleryMultiCategory v20260414-08';
  var TRUE_NEW_TEMPLATE_BADGE = 'BuilderTrueNewTemplate v20260419-09';
  (window as any).__MF_TEMPLATE_FOLDER_HINT_BADGE__ = TEMPLATE_FOLDER_HINT_BADGE;
  (window as any).__MF_GALLERY_MULTI_CATEGORY_BADGE__ = GALLERY_MULTI_CATEGORY_BADGE;
  var LOCK_KEY = 'mf_locked_forms_v1';
  var _demoLockPromise: Promise<boolean> | null = null;
  var _devLockPromise: Promise<boolean> | null = null;

  function isExplicitNewBuilderSession(): boolean {
    try {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      if (root && root.dataset && String(root.dataset.isNew || '').toLowerCase() === 'true') return true;
    } catch (_e) {}
    try {
      var qp = new URLSearchParams(window.location.search || '');
      var raw = String(qp.get('new') || '').toLowerCase();
      if (raw === '1' || raw === 'true') return true;
    } catch (_e) {}
    return false;
  }

  function resetExplicitNewBuilderSession(): void {
    try {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      if (root && root.dataset) {
        root.dataset.isNew = 'true';
        root.dataset.formId = '0';
      }
    } catch (_e) {}
    try {
      var fidEl = document.getElementById('mf-builder-form-id') as HTMLInputElement | null;
      if (fidEl) fidEl.value = '0';
    } catch (_e) {}
    try { (window as any).FORM_ID = 0; } catch (_e) {}
    try {
      var builder = (window as any).MegaFormBuilder;
      if (builder && builder.state && builder.state.config) builder.state.config.formId = 0;
    } catch (_e) {}
    try {
      var platform = (window as any).__MF_PLATFORM__ || {};
      platform.formId = 0;
      (window as any).__MF_PLATFORM__ = platform;
    } catch (_e) {}
    try { (window as any).__MF_TRUE_NEW_TEMPLATE_BADGE__ = TRUE_NEW_TEMPLATE_BADGE; } catch (_e) {}
  }

  function getApiBase(): string {
    // Priority: 1) window.API_BASE (set by dom.ts initBuilder)
    //           2) __MF_PLATFORM__.apiBase (set by dnn-host on DOMContentLoaded)
    //           3) '/api/MegaForm/' (Web/Oqtane fallback)
    var base = (window as any).API_BASE
      || (window as any).__MF_PLATFORM__?.apiBase
      || '/api/MegaForm/';
    return base.replace(/\/?$/, '/');
  }

  /** Build DNN auth headers when running inside DNN. Returns {} for Web/Oqtane.
   * BUG FIX v20260405-16: In DNN fullscreen builder (configure=1), window.__MF_PLATFORM__
   * is NOT set by the ASCX inline script (that block has !ShowConfigPanel guard).
   * Fall back to window.PLATFORM (set by dom.ts) and window.WebSF shim (set by
   * dom.ts installDnnWebSFShim()) so UploadJson gets the RequestVerificationToken. */
  function getDnnAuthHeaders(): Record<string, string> {
    var platform = (window as any).__MF_PLATFORM__?.platform
                || (window as any).PLATFORM
                || '';
    if (String(platform).toLowerCase() !== 'dnn') return {};
    try {
      var moduleId = (window as any).__MF_PLATFORM__?.moduleId
                  || (window as any).MODULE_ID || 0;
      // Overlay builder: jQuery ServicesFramework (set by dnn-host)
      // Fullscreen builder: WebSF shim installed by dom.ts installDnnWebSFShim()
      var sf = (window as any).jQuery?.ServicesFramework?.(moduleId)
             || (window as any).WebSF;
      if (!sf) return {};
      var token = typeof sf.getAntiForgeryValue === 'function' ? sf.getAntiForgeryValue() : '';
      if (!token) return {};
      // [v20260527-04] Drop TabId/ModuleId — see adapters/dnn.ts.
      // Server reads portalId from URL query string instead.
      return { 'RequestVerificationToken': token };
    } catch (_e) { return {}; }
  }

  function isDemoLocked(): Promise<boolean> {
    if (_demoLockPromise) return _demoLockPromise;

    try {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      var attr = String(root?.getAttribute('data-demo-lock') || '').toLowerCase();
      if (attr === 'true' || attr === '1' || attr === 'yes') {
        _demoLockPromise = Promise.resolve(true);
        return _demoLockPromise;
      }
      if (attr === 'false' || attr === '0' || attr === 'no') {
        _demoLockPromise = Promise.resolve(false);
        return _demoLockPromise;
      }
    } catch (_e) { }

    var platform = getPlatformName();
    var allowHeadFallback = platform === 'aspcore' || platform === 'standalone' || platform === 'web' || !platform;
    if (!allowHeadFallback) {
      _demoLockPromise = Promise.resolve(false);
      return _demoLockPromise;
    }

    _demoLockPromise = fetch((window.location.origin || '') + '/demo.lock', {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(function (r) { return !!r.ok; }).catch(function () { return false; });
    return _demoLockPromise;
  }

  function getPlatformName(): string {
    return String((window as any).__MF_PLATFORM__?.platform || 'aspcore').toLowerCase();
  }

  function supportsDevBulkCreate(): boolean {
    var platform = getPlatformName();
    // [DevBulkCreate Oqtane v20260618] Oqtane now has a /api/MegaForm/BuilderTemplates/
    // DevBulkCreateForms endpoint (dev.lock-gated) → enable the gallery button there too.
    return platform === 'dnn' || platform === 'oqtane' || platform === 'aspcore' || platform === 'standalone' || platform === 'web' || !platform;
  }

  function hasDevLock(): Promise<boolean> {
    if (!supportsDevBulkCreate()) return Promise.resolve(false);
    if (_devLockPromise) return _devLockPromise;

    try {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      var attr = String(root?.getAttribute('data-dev-lock') || '').toLowerCase();
      if (attr === 'true' || attr === '1' || attr === 'yes') {
        _devLockPromise = Promise.resolve(true);
        return _devLockPromise;
      }
      if (attr === 'false' || attr === '0' || attr === 'no') {
        _devLockPromise = Promise.resolve(false);
        return _devLockPromise;
      }
    } catch (_e) { }

    var platform = getPlatformName();
    // [DevBulkCreate Oqtane v20260618] Oqtane has no server-rendered data-dev-lock attr, so
    // detect the dev.lock marker the same way Web does — a HEAD fetch of /dev.lock (served from
    // wwwroot). The server endpoint re-checks dev.lock via AiFeatureGate, so this is only UI gating.
    var allowHeadFallback = platform === 'oqtane' || platform === 'aspcore' || platform === 'standalone' || platform === 'web' || !platform;
    if (!allowHeadFallback) {
      _devLockPromise = Promise.resolve(false);
      return _devLockPromise;
    }

    // [DevBulkCreate Oqtane v20260618] Oqtane's static server returns 404 for /dev.lock (no .lock
    // MIME mapping), so probe the AiFeatureGate state via the admin API instead of a HEAD fetch.
    if (platform === 'oqtane') {
      _devLockPromise = fetch(getApiBase() + 'DevLockStatus', { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j: any) { return !!(j && (j.devLock || j.DevLock)); })
        .catch(function () { return false; });
      return _devLockPromise;
    }

    _devLockPromise = fetch((window.location.origin || '') + '/dev.lock', {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(function (r) { return !!r.ok; }).catch(function () { return false; });
    return _devLockPromise;
  }


  function getLockedFormIds(): number[] {
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }

  function saveLockedFormIds(ids: number[]): void {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify(ids));
    } catch (_e) {}
  }

  function forgetLockedFormIds(ids: number[]): void {
    var removeMap: Record<number, true> = {};
    (ids || []).forEach(function (value: any) {
      var id = parseInt(String(value || 0), 10) || 0;
      if (id > 0) removeMap[id] = true;
    });

    if (!Object.keys(removeMap).length) return;

    var kept = getLockedFormIds().filter(function (value: any) {
      var id = parseInt(String(value || 0), 10) || 0;
      return id > 0 && !removeMap[id];
    });

    saveLockedFormIds(kept);
  }

  async function runDevBulkCreate(): Promise<any> {
    // [DevBulkCreate Oqtane v20260618] The Oqtane endpoint needs moduleId + siteId to know where
    // to save the seeded forms. AuthEntityId can't resolve them for a host (who bypasses the
    // EditModule policy globally), so pass them explicitly via the X-OQTANE-* headers the endpoint
    // reads as a fallback. IDs come from #mf-builder-root[data-module-id/data-site-id] (set on load).
    var ds = (document.getElementById('mf-builder-root') || ({} as any)).dataset || ({} as any);
    var moduleId = parseInt(String(ds.moduleId || (window as any).MODULE_ID || (window as any).__MF_PLATFORM__?.moduleId || 0), 10) || 0;
    var siteId = parseInt(String(ds.siteId || ds.portalId || (window as any).SITE_ID || (window as any).PORTAL_ID || 0), 10) || 0;
    var payload = { moduleId: moduleId, siteId: siteId };
    var res = await fetch(getApiBase() + 'BuilderTemplates/DevBulkCreateForms', {
      method: 'POST',
      credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json', 'X-OQTANE-MODULEID': String(moduleId), 'X-OQTANE-SITEID': String(siteId) }, getDnnAuthHeaders()),
      body: JSON.stringify(payload)
    });
    var json: any = null;
    try { json = await res.json(); } catch (_e) {}
    if (!res.ok) throw new Error((json && (json.error || json.message)) || ('HTTP ' + res.status));
    return json || {};
  }

  function getDefaultTemplateFolderLabel(): string {
    var platform = String((window as any).__MF_PLATFORM__?.platform || (window as any).PLATFORM || '').toLowerCase();
    return platform === 'dnn'
      ? 'DesktopModules/MegaForm/Templates'
      : 'App_Data/MegaForm/Templates';
  }

  function handleDevBulkCreate(btn: HTMLButtonElement): void {
    hasDevLock().then(function (enabled) {
      if (!enabled) {
        showToast('dev.lock not found. Dev bulk create is unavailable.', 'error');
        return;
      }

      var templateFolder = getDefaultTemplateFolderLabel();
      if (!window.confirm('Create or refresh published forms for every template JSON in ' + templateFolder + '?\n\nEach form title will match its JSON filename exactly. Existing dev-seeded forms will be updated instead of duplicated when possible.')) return;

      var originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Creating...';

      runDevBulkCreate().then(function (result) {
        var ids = Array.isArray(result && result.formIds) ? result.formIds : [];
        forgetLockedFormIds(ids);
        var created = parseInt(String(result && result.created || 0), 10) || 0;
        var updated = parseInt(String(result && result.updated || 0), 10) || 0;
        var failed = parseInt(String(result && result.failed || 0), 10) || 0;
        if (Array.isArray(result && result.errors) && result.errors.length) {
          try { console.warn('[MegaForm] Dev bulk create errors', result.errors); } catch (_e) {}
        }
        showToast('Dev bulk create complete: ' + created + ' created, ' + updated + ' updated, ' + failed + ' failed, ' + ids.length + ' published.', failed > 0 ? 'warning' : 'success');
      }).catch(function (err: any) {
        showToast('Dev bulk create failed: ' + ((err && err.message) || err || 'unknown error'), 'error');
      }).finally(function () {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      });
    }).catch(function () {
      showToast('Could not verify dev.lock.', 'error');
    });
  }

  function ensureGalleryDemoBadge(host: HTMLElement): void {
    if (host.querySelector('#tpl-demo-badge')) return;
    var badge = document.createElement('span');
    badge.id = 'tpl-demo-badge';
    badge.className = 'tpl-source-badge';
    badge.textContent = 'Demo site • uploads off • v20260401-05d';
    badge.setAttribute('title', GALLERY_DEMO_BADGE);
    badge.style.background = '#fff7ed';
    badge.style.borderColor = '#fdba74';
    badge.style.color = '#9a3412';
    host.appendChild(badge);
  }

  function applyGalleryDemoMode(hd: HTMLElement | null, uploadBtn: HTMLButtonElement | null): void {
    isDemoLocked().then(function (locked) {
      if (!locked) return;
      if (hd) ensureGalleryDemoBadge(hd);
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        uploadBtn.title = 'Upload disabled on demo site';
        uploadBtn.setAttribute('aria-disabled', 'true');
      }
    }).catch(function () { /* ignore */ });
  }

  function slugify(input: string): string {
    return String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || ('tpl-' + Date.now());
  }

  function escHtml(value: any): string {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(value: any): string {
    return escHtml(value);
  }

  function escRegExp(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  var TEMPLATE_JSON_CANONICAL_BADGE = 'TemplateJsonCanonical v20260419-17';
  var TEMPLATE_SETTINGS_CANONICAL_BADGE = 'TemplateSettingsCanonical v20260422-02';
  (window as any).__MF_TEMPLATE_JSON_CANONICAL_BADGE__ = TEMPLATE_JSON_CANONICAL_BADGE;
  (window as any).__MF_TEMPLATE_SETTINGS_CANONICAL_BADGE__ = TEMPLATE_SETTINGS_CANONICAL_BADGE;

  function cloneJson<T>(value: T): T {
    try { return JSON.parse(JSON.stringify(value == null ? null : value)); } catch (_e) { return value; }
  }

  function readLegacyColumnCount(value: any): number {
    var n = parseInt(String(value == null ? '' : value), 10);
    if (!isFinite(n) || n <= 0) return 1;
    return Math.min(Math.max(n, 1), 4);
  }

  function normalizeTemplateFields(fields: any[]): any[] {
    if (!Array.isArray(fields)) return [];
    return fields.map(function (field: any) { return normalizeTemplateField(field); }).filter(Boolean);
  }

  function normalizeTemplateField(field: any): any {
    if (!field || typeof field !== 'object') return field;
    var next = cloneJson(field) || {};
    next.key = next.key || next.Key || '';
    next.type = next.type || next.Type || '';
    if (String(next.type || '').toLowerCase() === 'row') {
      var rawColumns = next.columns != null ? next.columns : next.Columns;
      if (Array.isArray(rawColumns)) {
        next.columns = rawColumns.map(function (col: any) {
          var c = cloneJson(col) || {};
          c.span = parseInt(String(c.span != null ? c.span : c.Span), 10) || 6;
          c.fields = normalizeTemplateFields((c.fields || c.Fields || []) as any[]);
          return c;
        });
      } else {
        var flatFields = normalizeTemplateFields((next.fields || next.Fields || []) as any[]);
        var colCount = readLegacyColumnCount(rawColumns);
        var chunkSize = Math.max(1, Math.ceil((flatFields.length || 1) / colCount));
        var columns: any[] = [];
        for (var ci = 0; ci < colCount; ci++) {
          var start = ci * chunkSize;
          var end = ci === colCount - 1 ? flatFields.length : Math.min(flatFields.length, start + chunkSize);
          var span = ci === colCount - 1 ? (12 - ((colCount - 1) * Math.floor(12 / colCount))) : Math.floor(12 / colCount);
          if (span <= 0) span = 6;
          columns.push({ span: span, fields: flatFields.slice(start, end) });
        }
        next.columns = columns;
      }
      delete next.Columns;
      delete next.fields;
      delete next.Fields;
    }
    return next;
  }

  function normalizeTemplateSettings(settings: any, raw?: any): any {
    var next = cloneJson((settings && typeof settings === 'object' && !Array.isArray(settings)) ? settings : {}) || {};
    var source = raw || {};
    var customHtml = source.customHtml;
    if (customHtml == null) customHtml = source.CustomHtml;
    if (customHtml == null) customHtml = next.customHtml;
    if (customHtml == null) customHtml = next.CustomHtml;
    var customCss = source.customCss;
    if (customCss == null) customCss = source.CustomCss;
    if (customCss == null) customCss = next.customCss;
    if (customCss == null) customCss = next.CustomCss;
    var workflow = source.workflow;
    if (workflow == null) workflow = source.Workflow;
    if (workflow == null) workflow = next.workflowTemplate;
    if (workflow == null) workflow = next.WorkflowTemplate;
    var rules = source.rules;
    if (rules == null) rules = source.Rules;
    if (rules == null) rules = next.rules;
    if (rules == null) rules = next.Rules;
    next.customHtml = typeof customHtml === 'string' ? customHtml : '';
    next.customCss = typeof customCss === 'string' ? customCss : '';
    if (!next.customContent || typeof next.customContent !== 'object' || Array.isArray(next.customContent)) next.customContent = {};
    if (!next.customScripts || typeof next.customScripts !== 'object' || Array.isArray(next.customScripts)) next.customScripts = {};
    if (Array.isArray(next.theme)) next.theme = next.theme.length ? String(next.theme[0] || '') : '';
    if (Array.isArray(next.multiPage)) next.multiPage = !!next.multiPage[0];
    next.multiPage = !!next.multiPage;
    next.rules = Array.isArray(rules) ? cloneJson(rules) : [];
    next.workflowTemplate = workflow || null;
    next.CustomHtml = next.customHtml;
    next.CustomCss = next.customCss;
    next.CustomContent = next.customContent;
    next.CustomScripts = next.customScripts;
    next.Rules = next.rules;
    next.WorkflowTemplate = next.workflowTemplate;
    return next;
  }

  function normalizeTemplateRecord(raw: any, fallbackId?: string): any {
    if (!raw || typeof raw !== 'object') return raw;
    var settings = normalizeTemplateSettings(raw.settings || raw.Settings || {}, raw);
    var customHtml = settings.customHtml || '';
    var customCss = settings.customCss || '';
    var workflow = settings.workflowTemplate || null;
    var rules = Array.isArray(settings.rules) ? settings.rules : [];
    var templateGuideSlug = settings.templateGuideSlug || raw.templateGuideSlug || raw.TemplateGuideSlug || '';
    var fields = raw.fields;
    if (fields == null) fields = raw.Fields;
    fields = normalizeTemplateFields(Array.isArray(fields) ? fields : []);
    return Object.assign({}, raw, {
      id: raw.id || raw.Id || fallbackId || '',
      slug: raw.slug || raw.Slug || '',
      title: raw.title || raw.Title || fallbackId || 'Template',
      description: raw.description || raw.Description || '',
      category: getPrimaryCategory(raw),
      categories: getTemplateCategories(raw),
      icon: raw.icon || raw.Icon || '✦',
      fields: fields,
      customHtml: customHtml,
      customCss: customCss,
      rules: rules,
      workflow: workflow,
      templateGuideSlug: templateGuideSlug,
      settings: settings,
      fileName: raw.fileName || raw.FileName || '',
      relativePath: raw.relativePath || raw.RelativePath || '',
      folder: raw.folder || raw.Folder || '',
      updatedUtc: raw.updatedUtc || raw.UpdatedUtc || null
    });
  }

  function mergeTemplate(id: string, tpl: any, toFront: boolean): void {
    if (!id || !tpl) return;
    _presets[id] = normalizeTemplateRecord(tpl, id);
    var idx = _allKeys.indexOf(id);
    if (idx >= 0) _allKeys.splice(idx, 1);
    if (toFront) _allKeys.splice(1, 0, id);
    else _allKeys.push(id);
  }


  function normalizeCategories(rawCategories: any, rawCategory?: any): string[] {
    var list: string[] = [];
    if (Array.isArray(rawCategories)) {
      rawCategories.forEach(function (value: any) {
        var normalized = String(value || '').trim().toLowerCase();
        if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
      });
    }
    var primary = String(rawCategory || '').trim().toLowerCase();
    if (primary && list.indexOf(primary) === -1) list.unshift(primary);
    if (!list.length) list.push('general');
    return list;
  }

  function getTemplateCategories(tpl: any): string[] {
    return normalizeCategories(tpl && (tpl.categories || tpl.Categories), tpl && (tpl.category || tpl.Category));
  }

  function getPrimaryCategory(tpl: any): string {
    return getTemplateCategories(tpl)[0] || 'general';
  }

  function getAllPresetSources(): Record<string, any> {
    try {
      var mfb = (window as any).MegaFormBuilder;
      if (!mfb || typeof mfb.callModule !== 'function') return {};
      var a = mfb.callModule('templates', 'getAllPresets') || {};
      var b = mfb.callModule('presets', 'getAllPresets') || {};
      return Object.assign({}, a || {}, b || {});
    } catch (_e) {
      return {};
    }
  }

  function rebuildCategoryFilters(): void {
    var tplFilters = document.getElementById('tpl-filters');
    if (!tplFilters) return;
    var cats: string[] = ['all'];
    _allKeys.forEach(function (k) {
      var categories = getTemplateCategories(_presets[k]);
      categories.forEach(function (c) { if (c && c !== 'all' && cats.indexOf(c) === -1) cats.push(c); });
    });
    var catLabels: Record<string,string> = {
      all:'All', general:'General', hr:'HR', healthcare:'Healthcare',
      events:'Events', survey:'Surveys', finance:'Finance', education:'Education'
    };
    tplFilters.innerHTML = '';
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'tpl-cat' + (c === _currentCat ? ' active' : '');
      b.setAttribute('data-cat', c);
      b.textContent = catLabels[c] || (c.charAt(0).toUpperCase() + c.slice(1));
      tplFilters.appendChild(b);
    });
  }

  function updateGalleryStats(total: number): void {
    var hd = document.querySelector('.tpl-hd') as HTMLElement | null;
    if (!hd) return;
    var stats = document.getElementById('tpl-gallery-stats');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'tpl-gallery-stats';
      stats.className = 'tpl-gallery-stats';
      hd.appendChild(stats);
    }
    stats.textContent = total + ' template' + (total === 1 ? '' : 's') + ' available';
    stats.setAttribute('title', GALLERY_RECURSIVE_BADGE);
  }

  async function loadFolderTemplatesOnce(retryCount: number): Promise<void> {
    try {
      var headers = getDnnAuthHeaders();
      var res = await fetch(getApiBase() + 'BuilderTemplates/List', { credentials: 'same-origin', headers: headers });

      // BUG FIX: If ServicesFramework hasn't initialised yet (race condition when
      // gallery opens before DOMContentLoaded of dnn-host), the antiforgery token
      // may be missing → DNN returns 401. Retry up to 3 times with 600ms delay.
      if (res.status === 401 && retryCount < 3) {
        setTimeout(function () { void loadFolderTemplatesOnce(retryCount + 1); }, 600);
        return;
      }
      if (!res.ok) return;

      var items = await res.json();
      if (!Array.isArray(items)) return;
      items.forEach(function (tpl: any) {
        var normalized = normalizeTemplateRecord(tpl);
        var baseId = String(normalized.id || normalized.slug || normalized.title || ('tpl-' + Date.now()));
        var id = baseId.indexOf('file-') === 0 ? baseId : ('file-' + slugify(baseId));
        mergeTemplate(id, normalized, true);
      });
      rebuildCategoryFilters();
      renderGrid(_currentCat);
    } catch (_e) {
      // optional endpoint — server templates missing is not fatal
    }
  }

  async function loadFolderTemplates(): Promise<void> {
    await loadFolderTemplatesOnce(0);
  }

  function getPresetSnapshot(tplId: string): any {
    try {
      var all = getAllPresetSources();
      var tpl = all[tplId] || _presets[tplId] || null;
      return tpl ? normalizeTemplateRecord(tpl, tplId) : null;
    } catch (_e) {
      return null;
    }
  }

  function hasNonWhitespace(value: any): boolean {
    return !!String(value == null ? '' : value).replace(/\s+/g, '');
  }

  function builderHasMeaningfulContent(builder: any): boolean {
    try {
      if (!builder || !builder.state || !builder.state.schema) return false;
      var fields = builder.state.schema.fields || [];
      if (fields.length) return true;
      var settings = builder.state.schema.settings || {};
      if (hasNonWhitespace(settings.customHtml) || hasNonWhitespace(settings.customCss)) return true;
      if (typeof builder.getVal === 'function' && builder.EL) {
        if (hasNonWhitespace(builder.getVal(builder.EL.canvasTitle))) return true;
        if (hasNonWhitespace(builder.getVal(builder.EL.canvasDescription))) return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  function confirmReplaceActiveBuilder(nextTplId?: string | null): boolean {
    try {
      var builder = (window as any).MegaFormBuilder;
      if (!builderHasMeaningfulContent(builder)) return true;
      var tpl = nextTplId ? (getPresetSnapshot(nextTplId) || _presets[nextTplId] || null) : null;
      var tplName = tpl && tpl.title ? String(tpl.title) : 'this template';
      return window.confirm('Replace the current form schema with "' + tplName + '"? Unsaved fields, custom HTML, and custom CSS in the current builder will be replaced.');
    } catch (_e) {
      return window.confirm('Replace the current form schema?');
    }
  }

  function buildPendingSchemaFromSnapshot(snap: any): string {
    try {
      if (!snap) return '{}';
      var settings = Object.assign({}, snap.settings || {});
      settings.customHtml = snap.customHtml || settings.customHtml || '';
      settings.customCss = snap.customCss || settings.customCss || '';
      settings.rules = snap.rules || settings.rules || [];
      settings.templateGuideSlug = snap.templateGuideSlug || settings.templateGuideSlug || '';
      if (typeof snap.workflow !== 'undefined' && snap.workflow !== null) settings.workflowTemplate = snap.workflow;
      else if (typeof settings.workflowTemplate === 'undefined') settings.workflowTemplate = null;
      return JSON.stringify({
        version: '1.0',
        fields: JSON.parse(JSON.stringify(snap.fields || [])),
        settings: settings
      });
    } catch (_e) {
      return '{}';
    }
  }

  function applyTemplateSnapshot(builder: any, snap: any): boolean {
    try {
      if (!builder || !builder.state || !builder.state.schema || !snap) return false;
      builder.state.schema.fields = [];
      (snap.fields || []).forEach(function (f: any) {
        builder.state.schema.fields.push(builder.createFieldFromTemplate ? builder.createFieldFromTemplate(f) : f);
      });
      builder.state.fieldCounter = (builder.state.schema.fields || []).length;
      builder.state.selectedFieldIndex = -1;
      builder.state.isDirty = true;

      var settings = Object.assign({}, snap.settings || {});
      var customHtml = snap.customHtml || settings.customHtml || '';
      var customCss  = snap.customCss  || settings.customCss  || '';
      var rules = snap.rules || settings.rules || [];
      var workflowTpl = snap.workflow || settings.workflowTemplate || null;
      var templateGuideSlug = snap.templateGuideSlug || settings.templateGuideSlug || '';

      settings.customHtml = customHtml;
      settings.customCss = customCss;
      settings.rules = rules;
      settings.templateGuideSlug = templateGuideSlug;
      if (workflowTpl) settings.workflowTemplate = workflowTpl;
      builder.state.schema.settings = settings;

      if (typeof builder.setVal === 'function' && builder.EL) {
        builder.setVal(builder.EL.canvasTitle, snap.title || 'Untitled Form');
        builder.setVal(builder.EL.canvasDescription, snap.description || '');
        builder.setVal(builder.EL.submitBtnText, snap.submitButtonText || 'Submit');
      }

      var htmlEd = document.getElementById('mf-custom-html-editor') as HTMLTextAreaElement | null;
      var cssEd  = document.getElementById('mf-custom-css-editor') as HTMLTextAreaElement | null;
      if (htmlEd) htmlEd.value = customHtml;
      if (cssEd) cssEd.value = customCss;

      if (typeof builder.callModule === 'function') {
        builder.callModule('canvas', 'render');
        builder.callModule('properties', 'hideProps');
        builder.callModule('rule-builder-ui', 'refresh');
      }

      // Show SQL setup modal if template carries setupSql (badge: TplSetupSql v20260429-01)
      try {
        if (snap && snap.setupSql && typeof (builder as any).showSqlSetupModal === 'function') {
          (builder as any).showSqlSetupModal(String(snap.setupSql), snap.title || 'Template');
        }
      } catch (_eSql) {}

      return !!((builder.state.schema.fields || []).length || snap.title || snap.description);
    } catch (_e) {
      return false;
    }
  }

  function forceTemplateIntoBuilder(tplId: string): void {
    try {
      var snap = getPresetSnapshot(tplId) || _presets[tplId] || null;
      (window as any).__MF_PENDING_TEMPLATE_ID = tplId;
      (window as any).__MF_PENDING_TEMPLATE = snap;
      if (snap) {
        (window as any).__MF_PENDING_SCHEMA_JSON = buildPendingSchemaFromSnapshot(snap);
      }

      var mfb = (window as any).MegaFormBuilder;
      if (snap && mfb && mfb.state && mfb.state.schema) {
        applyTemplateSnapshot(mfb, snap);
        return;
      }

      if (mfb && typeof mfb.applyTemplate === 'function') mfb.applyTemplate(tplId);

      var attempts = 0;
      var timer = window.setInterval(function () {
        attempts++;
        var builder = (window as any).MegaFormBuilder;
        if (builder && builder.state && builder.state.schema) {
          var currentSnap = (window as any).__MF_PENDING_TEMPLATE || getPresetSnapshot(tplId) || _presets[tplId] || null;
          if (currentSnap) applyTemplateSnapshot(builder, currentSnap);
          if (((builder.state.schema.fields || []).length || currentSnap) && attempts >= 1) {
            window.clearInterval(timer);
            return;
          }
        }
        if (attempts >= 12) window.clearInterval(timer);
      }, 120);
    } catch (_e) {}
  }

  function enterBuilder(tplId?: string): void {
    var explicitNewBuilderSession = isExplicitNewBuilderSession();
    if (explicitNewBuilderSession) {
      resetExplicitNewBuilderSession();
      _builderInited = false;
    }
    if (_builderInited && !confirmReplaceActiveBuilder(tplId || null)) return;
    try { hideQuickPreview(); } catch (_e) {}
    try { closePreviewModal(); } catch (_e) {}
    var gallery = document.getElementById('tpl-gallery');
    var app = document.getElementById('mf-builder-app');
    if (gallery) gallery.style.display = 'none';
    if (app) app.style.display = '';
    var galTop = document.querySelector('.w-topbar-gallery') as HTMLElement | null;
    var bldTop = document.querySelector('.w-topbar-builder') as HTMLElement | null;
    if (galTop) { galTop.classList.add('mf-hidden'); galTop.style.display = ''; }
    if (bldTop) { bldTop.classList.remove('mf-hidden'); bldTop.style.display = ''; }
    document.body.classList.remove('state-gallery');
    document.body.classList.add('state-builder');

    // Blank template must start from a truly empty schema and must not be bounced back
    // to gallery just because the schema has no fields yet.
    (window as any).__MF_FORCE_BUILDER = true;

    if (tplId) {
      var snap = getPresetSnapshot(tplId) || _presets[tplId] || null;
      (window as any).__MF_PENDING_TEMPLATE_ID = tplId;
      (window as any).__MF_PENDING_TEMPLATE = snap;
      (window as any).__MF_PENDING_SCHEMA_JSON = (snap && snap.fields && snap.fields.length)
        ? buildPendingSchemaFromSnapshot(snap)
        : '{}';
    } else {
      // [B65l] Blank template is now truly EMPTY scaffolding: 2 two-column
      // rows with empty Drop-field placeholders. User wanted code-generated
      // blank, not a pre-filled "starter" form with First Name/Last Name etc.
      var blankSnap = _presets['blank'] || null;
      var blankFields = blankSnap && blankSnap.fields && blankSnap.fields.length ? blankSnap.fields : [
        { key:'row_1', type:'Row', columns:[
            { span:6, fields:[] },
            { span:6, fields:[] }
        ]},
        { key:'row_2', type:'Row', columns:[
            { span:6, fields:[] },
            { span:6, fields:[] }
        ]}
      ];
      (window as any).__MF_PENDING_TEMPLATE_ID = null;
      (window as any).__MF_PENDING_TEMPLATE = { fields: blankFields };
      (window as any).__MF_PENDING_SCHEMA_JSON = JSON.stringify({
        version: '1.0', fields: JSON.parse(JSON.stringify(blankFields)), settings: {}
      });
    }
    if (!_builderInited) {
      _builderInited = true;
      var fn = (window as any).initBuilder;
      if (typeof fn === 'function') fn(0, ((window as any).__MF_PENDING_SCHEMA_JSON || '{}'), tplId || null);
      if (tplId) forceTemplateIntoBuilder(tplId);
    } else if (tplId) {
      forceTemplateIntoBuilder(tplId);
    } else {
      try {
        var builder = (window as any).MegaFormBuilder;
        if (builder && builder.state) {
          // [B65l] Blank reset = truly empty 2-row × 2-column scaffolding
          // (matches the schema seeded at gallery enterBuilder above).
          var _blankFields = (window as any).__MF_PENDING_TEMPLATE?.fields || [
            { key:'row_1', type:'Row', columns:[
                { span:6, fields:[] },
                { span:6, fields:[] }
            ]},
            { key:'row_2', type:'Row', columns:[
                { span:6, fields:[] },
                { span:6, fields:[] }
            ]}
          ];
          builder.state.schema = { version: '1.0', fields: JSON.parse(JSON.stringify(_blankFields)), settings: {} };
          builder.state.fieldCounter = 0;
          builder.state.selectedFieldIndex = -1;
          builder.state.isDirty = true;
          if (builder.setVal && builder.EL) {
            builder.setVal(builder.EL.canvasTitle, '');
            builder.setVal(builder.EL.canvasDescription, '');
            builder.setVal(builder.EL.submitBtnText, 'Submit');
          }
          if (builder.callModule) {
            builder.callModule('canvas', 'render');
            builder.callModule('canvas', 'refreshInteractions');
            builder.callModule('properties', 'hideProps');
          }
          window.setTimeout(function () {
            try { if (builder && builder.callModule) builder.callModule('canvas', 'refreshInteractions'); } catch (_e) {}
          }, 40);
        }
      } catch (_e) {}
    }
  }

  // [TplStatsMemo v20260507-13] WeakMap memoization: collectTemplateStats
  // walks the entire template field tree (rows → columns → fields, deeply
  // nested), then is called by buildThumbnailMarkup + cardHTML + getFilteredKeys
  // for EVERY visible card EVERY time the gallery re-renders (filter click,
  // pagination, search). For 59 templates × 5+ render passes that's measurable
  // on slower machines. Memoize per-tpl-object so the walk runs ONCE per tpl.
  var _tplStatsMemo: WeakMap<AnyObj, AnyObj> = (typeof WeakMap !== 'undefined') ? new WeakMap() : (null as any);
  if (typeof window !== 'undefined') (window as any).__MF_TPL_STATS_MEMO_BADGE__ = 'TplStatsMemo v20260507-13';

  function collectTemplateStats(tpl: AnyObj): AnyObj {
    if (_tplStatsMemo && tpl && typeof tpl === 'object') {
      var cached = _tplStatsMemo.get(tpl);
      if (cached) return cached;
    }
    var info: AnyObj = {
      items: [],
      fields: [],
      fieldCount: 0,
      hiddenCount: 0,
      sectionCount: 0,
      pageBreakCount: 0,
      rowCount: 0,
      htmlBlockCount: 0,
      customLayout: !!(tpl && (tpl.customHtml || (tpl.settings && tpl.settings.customHtml)))
    };

    function walk(list: any[]): void {
      (list || []).forEach(function (field: AnyObj) {
        if (!field) return;
        var type = String(field.type || '').toLowerCase();
        if (type === 'section') {
          info.sectionCount += 1;
          if (field.properties && field.properties.pageBreak) info.pageBreakCount += 1;
          info.items.push({ kind: 'section', field: field });
          return;
        }
        if (type === 'row') {
          info.rowCount += 1;
          info.items.push({ kind: 'row', field: field });
          (field.columns || []).forEach(function (col: AnyObj) {
            walk((col && col.fields) || []);
          });
          return;
        }
        if (type === 'html') {
          info.htmlBlockCount += 1;
          info.items.push({ kind: 'html', field: field });
          return;
        }
        if (type === 'hidden') {
          info.hiddenCount += 1;
          info.items.push({ kind: 'hidden', field: field });
          return;
        }
        info.fieldCount += 1;
        info.items.push({ kind: 'field', field: field });
        info.fields.push(field);
      });
    }

    walk((tpl && tpl.fields) || []);
    info.pageCount = Math.max(1, info.pageBreakCount + (info.fieldCount || info.sectionCount || info.rowCount || info.htmlBlockCount ? 1 : 0));
    if (_tplStatsMemo && tpl && typeof tpl === 'object') {
      try { _tplStatsMemo.set(tpl, info); } catch (_e) { /* WeakMap key non-object — skip */ }
    }
    return info;
  }

  function getFieldLabel(field: AnyObj): string {
    return String((field && (field.label || field.title || field.key || field.name)) || 'Untitled Field');
  }

  function getFieldPlaceholder(field: AnyObj): string {
    var placeholder = field && field.placeholder;
    if (placeholder) return String(placeholder);
    var type = String((field && field.type) || 'Text').toLowerCase();
    if (type === 'email') return 'name@example.com';
    if (type === 'phone') return '+84 900 000 000';
    if (type === 'date') return 'Select date';
    if (type === 'number') return '0';
    if (type === 'textarea') return 'Type your answer';
    return 'Enter ' + getFieldLabel(field).toLowerCase();
  }

  function getFieldKindText(field: AnyObj): string {
    var type = String((field && field.type) || 'Text');
    if (type === 'Text') return 'text';
    if (type === 'Textarea') return 'textarea';
    if (type === 'Select') return 'select';
    if (type === 'Checkbox') return 'checkbox';
    if (type === 'Radio') return 'radio';
    if (type === 'Email') return 'email';
    if (type === 'Phone') return 'phone';
    if (type === 'Date') return 'date';
    if (type === 'File') return 'upload';
    if (type === 'Payment' || type === 'PayNow' || type === 'Paypal') return 'payment';
    return type.toLowerCase();
  }

  function getOptionLabels(field: AnyObj, limit?: number): string[] {
    var out: string[] = [];
    ((field && field.options) || []).slice(0, limit || 3).forEach(function (opt: AnyObj) {
      out.push(String((opt && (opt.label || opt.value)) || 'Option'));
    });
    return out;
  }

  function buildFieldControlHtml(field: AnyObj, compact: boolean): string {
    var type = String((field && field.type) || 'Text').toLowerCase();
    var label = escHtml(getFieldLabel(field));
    var placeholder = escHtml(getFieldPlaceholder(field));
    var control = '';
    var options: string[];

    switch (type) {
      case 'textarea':
        control = '<div class="tpl-pv-control tpl-pv-control-textarea">' + placeholder + '</div>';
        break;
      case 'select':
        options = getOptionLabels(field, compact ? 2 : 3);
        control = '<div class="tpl-pv-control tpl-pv-control-select"><span>' + (options.length ? escHtml(options[0]) : placeholder) + '</span><i class="fa-solid fa-chevron-down"></i></div>';
        break;
      case 'checkbox':
      case 'radio':
        options = getOptionLabels(field, compact ? 2 : 3);
        control = '<div class="tpl-pv-options">' + options.map(function (opt: string) {
          return '<span class="tpl-pv-option"><i class="fa-regular ' + (type === 'checkbox' ? 'fa-square' : 'fa-circle') + '"></i>' + escHtml(opt) + '</span>';
        }).join('') + '</div>';
        break;
      case 'file':
        control = '<div class="tpl-pv-control tpl-pv-control-upload"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload a file</span></div>';
        break;
      case 'rating':
        control = '<div class="tpl-pv-rating">★★★★★</div>';
        break;
      case 'signature':
        control = '<div class="tpl-pv-control tpl-pv-control-signature"><i class="fa-solid fa-signature"></i><span>Signature area</span></div>';
        break;
      case 'payment':
      case 'paypal':
      case 'paynow':
        control = '<div class="tpl-pv-control tpl-pv-control-payment"><i class="fa-solid fa-credit-card"></i><span>Payment step</span></div>';
        break;
      default:
        control = '<div class="tpl-pv-control tpl-pv-control-input">' + placeholder + '</div>';
        break;
    }

    return '<div class="tpl-pv-field">'
      + '<div class="tpl-pv-label-row"><label>' + label + '</label><span class="tpl-pv-type">' + escHtml(getFieldKindText(field)) + '</span></div>'
      + control
      + '</div>';
  }

  function buildGenericPreview(fields: any[]): string {
    var html: string[] = [];

    function walk(list: any[]): void {
      (list || []).forEach(function (field: AnyObj) {
        if (!field) return;
        var type = String(field.type || '').toLowerCase();
        if (type === 'section') {
          html.push('<div class="tpl-pv-section">' + escHtml(getFieldLabel(field)) + '</div>');
          return;
        }
        if (type === 'html') {
          html.push('<div class="tpl-pv-html-block"><i class="fa-solid fa-code"></i><span>Custom HTML block</span></div>');
          return;
        }
        if (type === 'row') {
          var cols = (field.columns || []).map(function (col: AnyObj) {
            return '<div class="tpl-pv-col">' + buildGenericPreview((col && col.fields) || []) + '</div>';
          }).join('');
          html.push('<div class="tpl-pv-row">' + cols + '</div>');
          return;
        }
        if (type === 'hidden') {
          return;
        }
        html.push(buildFieldControlHtml(field, false));
      });
    }

    walk(fields || []);
    return html.join('');
  }

  function buildMockTokenField(field: AnyObj, compact?: boolean): string {
    var type = String((field && field.type) || 'Text').toLowerCase();
    var label = escHtml(getFieldLabel(field));
    var placeholder = escHtml(getFieldPlaceholder(field));
    var rootCls = 'tpl-token-field' + (compact ? ' tpl-token-field-compact' : '');
    var inputCls = 'tpl-token-input' + (compact ? ' tpl-token-input-compact' : '');
    if (type === 'checkbox' || type === 'radio') {
      return '<div class="' + rootCls + ' tpl-token-field-options"><div class="tpl-token-label">' + label + '</div>'
        + '<div class="tpl-token-options' + (compact ? ' compact' : '') + '">' + getOptionLabels(field, compact ? 2 : 3).map(function (opt: string) {
          return '<span class="tpl-token-option"><i class="fa-regular ' + (type === 'checkbox' ? 'fa-square' : 'fa-circle') + '"></i>' + escHtml(opt) + '</span>';
        }).join('') + '</div></div>';
    }
    if (type === 'select') {
      return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-select">' + placeholder + '<i class="fa-solid fa-chevron-down"></i></div></div>';
    }
    if (type === 'textarea') {
      return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-textarea">' + placeholder + '</div></div>';
    }
    if (type === 'file') {
      return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-upload"><i class="fa-solid fa-cloud-arrow-up"></i><span>Upload file</span></div></div>';
    }
    if (type === 'payment' || type === 'paypal' || type === 'paynow') {
      return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + ' tpl-token-input-payment"><i class="fa-solid fa-credit-card"></i><span>Payment widget</span></div></div>';
    }
    return '<div class="' + rootCls + '"><div class="tpl-token-label">' + label + '</div><div class="' + inputCls + '">' + placeholder + '</div></div>';
  }

  function sanitizeCustomPreviewHtml(html: string): string {
    html = String(html || '');
    try {
      if (typeof DOMParser !== 'undefined') {
        var parser = new DOMParser();
        var doc = parser.parseFromString('<!DOCTYPE html><html><body>' + html + '</body></html>', 'text/html');
        doc.querySelectorAll('script,noscript,iframe,object,embed,meta[http-equiv="refresh"],link[rel="preload"][as="script"],link[rel="modulepreload"]').forEach(function (node) {
          node.parentNode && node.parentNode.removeChild(node);
        });
        doc.querySelectorAll('*').forEach(function (el) {
          Array.prototype.slice.call(el.attributes || []).forEach(function (attr: Attr) {
            var name = String(attr.name || '').toLowerCase();
            var value = String(attr.value || '');
            if (!name) return;
            if (name.indexOf('on') === 0 || name === 'srcdoc') {
              el.removeAttribute(attr.name);
              return;
            }
            if ((name === 'src' || name === 'href' || name === 'xlink:href' || name === 'formaction') && /^\s*javascript:/i.test(value)) {
              el.removeAttribute(attr.name);
            }
          });
        });
        html = doc.body ? doc.body.innerHTML : html;
      }
    } catch (_e) { }

    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    html = html.replace(/<object[\s\S]*?<\/object>/gi, '');
    html = html.replace(/<embed[^>]*>/gi, '');
    html = html.replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '');
    html = html.replace(/\s(?:src|href|xlink:href|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');
    return html;
  }

  function buildResolvedCustomTemplateHtml(tpl: AnyObj, compact?: boolean): string {
    var html = String(tpl.customHtml || (tpl.settings && tpl.settings.customHtml) || '');
    if (!html) return '';

    var stats = collectTemplateStats(tpl);
    var fieldsByKey: Record<string, string> = {};
    stats.fields.forEach(function (field: AnyObj) {
      if (field && field.key) fieldsByKey[String(field.key)] = buildMockTokenField(field, compact);
    });

    var contentValues = ((tpl.settings && (tpl.settings.customContent || tpl.settings.CustomContent)) || tpl.customContent || {}) as Record<string, unknown>;
    html = sanitizeCustomPreviewHtml(html);
    html = html.replace(/\{\{form:title\}\}/g, escHtml(tpl.title || 'Untitled Form'));
    html = html.replace(/\{\{form:description\}\}/g, escHtml(tpl.description || ''));
    html = html.replace(/\{\{form:submit\}\}/g, '<span class="tpl-token-submit-label">' + escHtml(tpl.submitButtonText || 'Submit') + '</span>');
    html = html.replace(/\{\{content:([a-zA-Z0-9_-]+)\}\}/g, function (_m: string, key: string) { return escHtml(String((contentValues as any)[key] || '')); });

    Object.keys(fieldsByKey).forEach(function (key: string) {
      var pattern = new RegExp('\\{\\{field:' + escRegExp(key) + '\\}\\}', 'g');
      html = html.replace(pattern, fieldsByKey[key]);
    });

    html = html.replace(/\{\{field:[^}]+\}\}/g, '<div class="tpl-token-field tpl-token-field-missing' + (compact ? ' tpl-token-field-compact' : '') + '"><div class="tpl-token-label">Field</div><div class="tpl-token-input' + (compact ? ' tpl-token-input-compact' : '') + '">Field placeholder</div></div>');
    return html;
  }

  function buildCustomPreview(tpl: AnyObj): string {
    var html = buildResolvedCustomTemplateHtml(tpl, false);
    var css = String(tpl.customCss || (tpl.settings && tpl.settings.customCss) || '');
    if (!html) return '';

    return '<div class="tpl-preview-live tpl-preview-live-custom">'
      + '<style>' + css + '</style>'
      + '<div class="tpl-preview-custom-banner"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Custom layout preview · rendered from template HTML/CSS in memory</span></div>'
      + '<div class="tpl-preview-custom-body">' + html + '</div>'
      + '</div>';
  }

  function buildCustomThumbnailMarkup(tpl: AnyObj): string {
    var html = buildResolvedCustomTemplateHtml(tpl, true);
    var css = String(tpl.customCss || (tpl.settings && tpl.settings.customCss) || '');
    if (!html) return '';
    var srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=760, initial-scale=1"><style>'
      + 'html,body{margin:0;padding:0;background:#ffffff;color:#0f172a;font-family:Inter,Segoe UI,Arial,sans-serif;}'
      + 'body{width:760px;min-height:520px;overflow:hidden;}'
      + '.tpl-thumb-doc{padding:18px;box-sizing:border-box;min-height:520px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);}'
      + '.tpl-thumb-doc .mfp,.tpl-thumb-doc form{pointer-events:none;}'
      + '.tpl-token-field{margin-bottom:10px;}'
      + '.tpl-token-label{margin-bottom:5px;color:#0f172a;font-size:11px;font-weight:700;line-height:1.35;}'
      + '.tpl-token-input{min-height:28px;border-radius:10px;border:1px solid #dbe4f0;background:#ffffff;color:#64748b;padding:7px 10px;box-sizing:border-box;font-size:11px;display:flex;align-items:center;justify-content:space-between;gap:8px;}'
      + '.tpl-token-input-textarea{min-height:58px;align-items:flex-start;padding-top:10px;}'
      + '.tpl-token-input-upload,.tpl-token-input-payment{justify-content:flex-start;}'
      + '.tpl-token-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;}'
      + '.tpl-token-options.compact{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}'
      + '.tpl-token-option{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:6px 9px;border-radius:999px;border:1px solid #dbe4f0;background:#ffffff;color:#334155;font-size:10px;font-weight:600;line-height:1.3;box-sizing:border-box;}'
      + '.tpl-token-submit-label{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 16px;border-radius:999px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;font-weight:800;font-size:12px;}'
      + '.tpl-token-field-missing .tpl-token-input{border-style:dashed;color:#cbd5e1;}'
      + css
      + '</style></head><body><div class="tpl-thumb-doc">' + html + '</div></body></html>';
    return '<div class="tpl-thumb-live tpl-thumb-live-custom">'
      + '<div class="tpl-thumb-frame-shell">'
      + '<iframe class="tpl-thumb-frame" loading="lazy" tabindex="-1" aria-hidden="true" sandbox="allow-same-origin" srcdoc="' + escAttr(srcdoc) + '"></iframe>'
      + '</div>'
      + '<div class="tpl-thumb-live-fade"></div>'
      + '</div>';
  }

  function buildPreviewStageHtml(tpl: AnyObj): string {
    var stats = collectTemplateStats(tpl);
    if (stats.customLayout) {
      var custom = buildCustomPreview(tpl);
      if (custom) return custom;
    }
    return '<div class="tpl-preview-live">'
      + '<div class="tpl-pv-head">'
      + '<div class="tpl-pv-kicker">Template Preview</div>'
      + '<h3>' + escHtml(tpl.title || 'Untitled Form') + '</h3>'
      + '<p>' + escHtml(tpl.description || '') + '</p>'
      + '</div>'
      + '<div class="tpl-pv-body">' + buildGenericPreview((tpl && tpl.fields) || []) + '</div>'
      + '<div class="tpl-pv-footer"><button type="button" class="tpl-pv-submit" disabled>' + escHtml(tpl.submitButtonText || 'Submit') + '</button></div>'
      + '</div>';
  }

  function buildThumbnailMarkup(tpl: AnyObj): string {
    var stats = collectTemplateStats(tpl);
    if (stats.customLayout) {
      var liveThumb = buildCustomThumbnailMarkup(tpl);
      if (liveThumb) return liveThumb;
    }
    var snippets = stats.items.filter(function (item: AnyObj) {
      return item.kind === 'field' || item.kind === 'section';
    }).slice(0, 4);

    return '<div class="tpl-mini-shell">'
      + '<div class="tpl-mini-head"><span></span><span></span><span></span></div>'
      + '<div class="tpl-mini-title"></div>'
      + snippets.map(function (item: AnyObj) {
        if (item.kind === 'section') {
          return '<div class="tpl-mini-section">' + escHtml(getFieldLabel(item.field)) + '</div>';
        }
        var field = item.field;
        var type = String((field && field.type) || 'Text').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
          return '<div class="tpl-mini-row tpl-mini-row-options"><div class="tpl-mini-label"></div><div class="tpl-mini-option-line"></div><div class="tpl-mini-option-line short"></div></div>';
        }
        if (type === 'textarea') {
          return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input tall"></div></div>';
        }
        if (type === 'select') {
          return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input select"></div></div>';
        }
        return '<div class="tpl-mini-row"><div class="tpl-mini-label"></div><div class="tpl-mini-input"></div></div>';
      }).join('')
      + '</div>';
  }

  var GRADIENTS: Record<string, string> = {
    general: 'linear-gradient(135deg,#5b8def,#7c3aed)',
    hr: 'linear-gradient(135deg,#0ea5e9,#6366f1)',
    healthcare: 'linear-gradient(135deg,#10b981,#0ea5e9)',
    events: 'linear-gradient(135deg,#8b5cf6,#ec4899)',
    survey: 'linear-gradient(135deg,#f59e0b,#ef4444)',
    finance: 'linear-gradient(135deg,#14b8a6,#3b82f6)',
    education: 'linear-gradient(135deg,#f97316,#ec4899)'
  };

  function cardHTML(id: string, tpl: any, selected: boolean): string {
    var sel = selected ? ' sel' : '';
    var cat = getPrimaryCategory(tpl);
    var grad = GRADIENTS[cat] || GRADIENTS.general;
    var stats = collectTemplateStats(tpl || {});
    var isMulti = stats.pageCount > 1;
    var badge = isMulti ? '<span class="tpl-badge">' + stats.pageCount + ' pages</span>' : '';
    var catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    var iconRaw = String(tpl.icon || '');
    // Only fa-* classes and real glyphs (emoji/symbols) render. Lucide-style catalog names
    // (compass / sparkles / globe-2 / flower-2) are NOT glyphs → they'd print as raw text in the
    // hero-icon. Fall back to a neutral FA glyph for those (matches gallery-modal / step-setup).
    var iconHtml = iconRaw.indexOf('fa-') === 0
      ? '<i class="fa-solid ' + escAttr(iconRaw) + '"></i>'
      : /^[a-z][a-z0-9-]*$/.test(iconRaw)
        ? '<i class="fa-solid fa-file-lines"></i>'
        : escHtml(iconRaw || '✦');
    var sourceBadge = id.indexOf('file-') === 0 ? '<span class="tpl-source-badge">uploaded</span>' : '';
    var quickPeek = '<button type="button" class="tpl-quickpeek-btn" data-preview="' + escAttr(id) + '"><i class="fa-regular fa-eye"></i><span>Preview</span></button>';
    // FileName comes from BuilderTemplateRecord.FileName (Newtonsoft → PascalCase)
    var fileName = String(tpl.FileName || tpl.fileName || '');
    var fileChip = fileName
      ? '<div class="tpl-filename-chip" title="' + escAttr(fileName) + '">'
        + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'
        + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
        + '<polyline points="14 2 14 8 20 8"/></svg>'
        + escHtml(fileName) + '</div>'
      : '';

    if (id === 'blank') {
      return '<div class="tpl-card tpl-blank' + sel + '" data-tpl="blank">'
        + '<div class="tpl-blank-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>'
        + '<div class="tpl-blank-lbl">Start Blank</div>'
        + '<div class="tpl-blank-sub">Build your form from scratch</div>'
        + '</div>';
    }

    return '<div class="tpl-card' + sel + '" data-tpl="' + escAttr(id) + '" data-filename="' + escAttr(fileName) + '">'
      + '<div class="tpl-thumb" style="background:' + escAttr(grad) + '">'
      + badge
      + sourceBadge
      + '<div class="tpl-hero-icon">' + iconHtml + '</div>'
      + '<div class="tpl-thumb-surface">' + buildThumbnailMarkup(tpl) + '</div>'
      + '<div class="tpl-thumb-overlay">'
      + '<div class="tpl-thumb-actions">'
      + '<button type="button" class="tpl-preview-overlay-btn" data-preview="' + escAttr(id) + '"><i class="fa-regular fa-eye"></i><span>Preview</span></button>'
      + '<button type="button" class="tpl-use-overlay-btn"><i class="fa-solid fa-bolt"></i><span>Use Template</span></button>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="tpl-info">'
      + '<div class="tpl-title-row"><div class="tpl-title">' + escHtml(tpl.title || id) + '</div></div>'
      + '<div class="tpl-desc">' + escHtml(tpl.description || '') + '</div>'
      + '<div class="tpl-meta">'
      + '<span class="tpl-field-count">' + stats.fieldCount + ' fields</span>'
      + '<span class="tpl-cat-tag">' + escHtml(catLabel) + '</span>'
      + '</div>'
      + fileChip
      + '<div class="tpl-card-actions-inline">' + quickPeek + '<button type="button" class="tpl-inline-use-btn">Use</button></div>'
      + '</div></div>';
  }

  function getFilteredKeys(cat: string): string[] {
    return _allKeys.filter(function (k) {
      if (k === 'blank') return true;
      var p: any = _presets[k];
      if (cat === 'all') return true;
      return !!(p && getTemplateCategories(p).indexOf(cat) >= 0);
    });
  }

  function renderPagination(container: HTMLElement, total: number, page: number): void {
    var totalPages = Math.ceil(total / PAGE_SIZE);
    var existing = document.getElementById('tpl-pagination');
    if (existing) existing.remove();
    if (totalPages <= 1) return;

    var pag = document.createElement('div');
    pag.id = 'tpl-pagination';
    pag.className = 'tpl-pagination';

    var prev = document.createElement('button');
    prev.className = 'tpl-pag-btn' + (page === 0 ? ' disabled' : '');
    prev.disabled = page === 0;
    prev.textContent = '← Previous';
    prev.addEventListener('click', function () { if (_currentPage > 0) { _currentPage--; renderGrid(_currentCat); } });
    pag.appendChild(prev);

    var nums = document.createElement('div');
    nums.className = 'tpl-pag-numbers';
    var start = Math.max(0, page - 2);
    var end = Math.min(totalPages - 1, start + 4);
    start = Math.max(0, end - 4);
    for (var i = start; i <= end; i++) {
      var b = document.createElement('button');
      b.className = 'tpl-pag-num' + (i === page ? ' active' : '');
      b.textContent = String(i + 1);
      (function (targetPage: number, btn: HTMLButtonElement) {
        btn.addEventListener('click', function () { _currentPage = targetPage; renderGrid(_currentCat); });
      })(i, b);
      nums.appendChild(b);
    }
    pag.appendChild(nums);

    var info = document.createElement('span');
    info.className = 'tpl-pag-info';
    var from = total === 0 ? 0 : (page * PAGE_SIZE) + 1;
    var to = Math.min(total, (page + 1) * PAGE_SIZE);
    info.textContent = 'Showing ' + from + '–' + to + ' of ' + total;
    pag.appendChild(info);

    var next = document.createElement('button');
    next.className = 'tpl-pag-btn' + (page >= totalPages - 1 ? ' disabled' : '');
    next.disabled = page >= totalPages - 1;
    next.textContent = 'Next →';
    next.addEventListener('click', function () { if (_currentPage < totalPages - 1) { _currentPage++; renderGrid(_currentCat); } });
    pag.appendChild(next);

    container.appendChild(pag);
  }

  async function uploadTemplateToServer(file: File, tpl?: any | null): Promise<any> {
    var form = new FormData();
    form.append('file', file, file.name);
    if (tpl != null) form.append('templateJson', JSON.stringify(tpl));
    var res = await fetch(getApiBase() + 'BuilderTemplates/UploadJson', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      headers: getDnnAuthHeaders()
    });
    if (!res.ok) {
      var msg = 'Upload failed';
      try {
        var err = await res.json();
        msg = err && (err.error || err.message) || msg;
      } catch (_e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  function isZipTemplateUpload(file: File | null | undefined): boolean {
    if (!file) return false;
    var name = String(file.name || '').toLowerCase();
    var type = String((file as AnyObj).type || '').toLowerCase();
    return /\.zip$/i.test(name)
      || type === 'application/zip'
      || type === 'application/x-zip-compressed'
      || type === 'multipart/x-zip';
  }

  function createUploadedTemplatePayload(data: AnyObj, fileName: string): AnyObj {
    if (!data || (!data.fields && !data.title)) throw new Error('Invalid template format');
    var dataSettings = data.settings || {};
    var customHtml = data.customHtml || dataSettings.customHtml || '';
    var customCss = data.customCss || dataSettings.customCss || '';
    var rules = data.rules || dataSettings.rules || [];
    var workflow = data.workflow || dataSettings.workflowTemplate || null;
    return normalizeTemplateRecord({
      title: data.title || fileName.replace(/\.json$/i, ''),
      description: data.description || 'Uploaded template',
      category: getPrimaryCategory(data),
      categories: getTemplateCategories(data),
      icon: data.icon || '📂',
      fields: data.fields || [],
      customHtml: customHtml,
      customCss: customCss,
      rules: rules,
      workflow: workflow,
      settings: Object.assign({}, dataSettings, {
        customHtml: customHtml,
        customCss: customCss,
        rules: rules,
        workflowTemplate: workflow || null
      })
    });
  }

  function collectUploadedTemplates(result: AnyObj, fileName: string): AnyObj[] {
    var list = Array.isArray(result && (result.templates || result.Templates))
      ? (result.templates || result.Templates)
      : [];
    if (list.length) {
      return list.map(function (item: AnyObj, idx: number) {
        var fallbackId = 'file-' + slugify((item && (item.title || item.Title || item.fileName || item.FileName)) || (fileName + '-' + String(idx + 1)));
        return normalizeTemplateRecord(item, fallbackId);
      });
    }
    if (result && typeof result === 'object') return [normalizeTemplateRecord(result)];
    return [];
  }

  // Sync demo check (best-effort) — browsers REQUIRE input[type=file].click() to be invoked
  // synchronously inside the same user-gesture handler that received the click event. Wrapping
  // in await/Promise.then() loses the user-activation token → file picker silently blocked.
  // Badge: GalleryUploadSync v20260430-05
  function isDemoLockedSync(): boolean {
    try {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      var attr = String(root?.getAttribute('data-demo-lock') || '').toLowerCase();
      if (attr === 'true' || attr === '1' || attr === 'yes') return true;
      var winFlag = (window as any).__mfDemoLock;
      if (winFlag === true || String(winFlag).toLowerCase() === 'true') return true;
    } catch (_e) {}
    return false;
  }

  var GALLERY_UPLOAD_SYNC_BADGE = 'GalleryUploadSync v20260430-15';
  if (typeof window !== 'undefined') (window as any).__MF_GALLERY_UPLOAD_SYNC_BADGE__ = GALLERY_UPLOAD_SYNC_BADGE;
  // [DragDropUpload v20260618] Import ONE template file (.json or .zip) — shared by the file
  // picker AND the drag-drop zone, so dropping a file works even when the OS file dialog opens
  // behind the fullscreen builder window (the #1 "can't upload on Oqtane" cause). `cleanup` runs
  // when done (removes the transient <input> in the picker path; no-op for drop).
  function processTemplateUploadFile(file: File | null | undefined, cleanup?: () => void): void {
    var done = function () { try { if (cleanup) cleanup(); } catch (_e) {} };
    if (!file) { done(); return; }
    if (isDemoLockedSync()) { showToast('Theme gallery upload is disabled on the demo site.', 'error'); done(); return; }

    var finalizeUploadedTemplates = function (templates: AnyObj[], successMessage: string): void {
      if (!templates.length) throw new Error('No templates were imported from this upload.');
      templates.forEach(function (saved: AnyObj) {
        var id = String(saved.id || ('file-' + slugify(saved.title || saved.fileName || (file as File).name)));
        mergeTemplate(id, saved, true);
        _selected = id;
      });
      rebuildCategoryFilters();
      _currentCat = 'all';
      _currentPage = 0;
      renderGrid(_currentCat);
      if (_useBtn) _useBtn.disabled = false;
      showToast(successMessage, 'success');
    };

    if (isZipTemplateUpload(file)) {
      uploadTemplateToServer(file, null).then(function (result) {
        var imported = collectUploadedTemplates(result, (file as File).name);
        var count = imported.length || parseInt(String((result && (result.importedTemplateCount || result.ImportedTemplateCount)) || 0), 10) || 0;
        finalizeUploadedTemplates(imported, count > 0
          ? ('Imported ' + count + ' template' + (count === 1 ? '' : 's') + ' from ZIP (' + GALLERY_ZIP_UPLOAD_BADGE + ').')
          : ('ZIP uploaded: ' + (file as File).name));
      }).catch(function (err: any) {
        showToast('ZIP upload failed: ' + ((err && err.message) || 'upload error'), 'error');
      }).finally(done);
      return;
    }

    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var data = JSON.parse((e.target as AnyObj).result as string);
        var tpl = createUploadedTemplatePayload(data, (file as File).name);
        var imported = collectUploadedTemplates(await uploadTemplateToServer(file, tpl), (file as File).name);
        var saved = imported[0];
        finalizeUploadedTemplates(imported, 'Template "' + ((saved && saved.title) || tpl.title) + '" uploaded to folder.');
      } catch (err: any) {
        showToast('Invalid template JSON: ' + (err.message || 'parse error'), 'error');
      }
      done();
    };
    reader.readAsText(file);
  }

  // [DragDropUpload v20260618] Wire drag-and-drop onto the gallery so the user can drop a
  // template .json/.zip anywhere on it — bypassing the OS file picker entirely. Idempotent
  // (guarded by a data flag); shows a dashed overlay while a file is dragged over.
  function installTemplateDropZone(rootEl: HTMLElement | null): void {
    if (!rootEl || (rootEl as any).__mfDropZoneWired) return;
    (rootEl as any).__mfDropZoneWired = true;
    try { if (!rootEl.style.position) rootEl.style.position = 'relative'; } catch (_e) {}
    if (!document.getElementById('mf-tpl-dropzone-css')) {
      var st = document.createElement('style'); st.id = 'mf-tpl-dropzone-css';
      st.textContent =
        '.mf-tpl-dropover{outline:3px dashed #6366f1 !important;outline-offset:-10px;}' +
        '.mf-tpl-dropover::after{content:"\\2B07  Drop a template file (.json or .zip) to upload";position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.12);color:#4338ca;font-weight:700;font-size:16px;pointer-events:none;}';
      document.head.appendChild(st);
    }
    var depth = 0;
    var hasFiles = function (e: DragEvent): boolean {
      var dt = e.dataTransfer; if (!dt) return false;
      var types = dt.types ? Array.prototype.slice.call(dt.types) : [];
      return types.indexOf('Files') >= 0;
    };
    var setOver = function (on: boolean) { rootEl!.classList.toggle('mf-tpl-dropover', on); };
    rootEl.addEventListener('dragenter', function (e: DragEvent) { if (!hasFiles(e)) return; e.preventDefault(); depth++; setOver(true); });
    rootEl.addEventListener('dragover', function (e: DragEvent) { if (!hasFiles(e)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    rootEl.addEventListener('dragleave', function (e: DragEvent) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) setOver(false); });
    rootEl.addEventListener('drop', function (e: DragEvent) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); depth = 0; setOver(false);
      var file = e.dataTransfer.files[0];
      var name = (file && file.name || '').toLowerCase();
      if (!/\.(json|zip)$/.test(name)) { showToast('Drop a .json or .zip template file.', 'error'); return; }
      processTemplateUploadFile(file);
    });
  }

  function handleUploadTemplate(): void {
    // Visible confirmation so user knows the click handler ran (helps diagnose
    // "click không thấy gì" reports — almost always a stale cache or the OS file
    // dialog opening behind another window).
    try { console.log('[' + GALLERY_UPLOAD_SYNC_BADGE + '] Upload Template clicked — opening file picker'); } catch (_e) {}
    if (isDemoLockedSync()) {
      showToast('Theme gallery upload is disabled on the demo site.', 'error');
      return;
    }
    {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.zip,application/json,application/zip,application/x-zip-compressed';
      input.title = GALLERY_ZIP_UPLOAD_BADGE;
      input.style.display = 'none';
      // [OverlayHostFix v20260501-01] Mark as MegaForm overlay so loader's hideChrome
      // CSS rule (body.mf-builder-open > *) doesn't apply pointer-events:none to it.
      // Without this, Chrome refuses to open the OS file picker on Oqtane fullscreen.
      input.setAttribute('data-mf-overlay', '1');
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        // [DragDropUpload v20260618] Shared with the drag-drop zone (installTemplateDropZone)
        // so a dropped file imports identically to a picked one — no OS dialog needed.
        processTemplateUploadFile(input.files && input.files[0], function () { input.remove(); });
      });
      // Force focus on the input before clicking — helps Windows show the file
      // dialog on top instead of behind the browser window.
      try { input.focus(); } catch (_e) {}
      input.click();
      try { console.log('[' + GALLERY_UPLOAD_SYNC_BADGE + '] input.click() dispatched'); } catch (_e) {}
    }
  }

  function handleDownloadTemplate(id: string): void {
    var tpl = _presets[id];
    if (!tpl) return;
    var snap = getPresetSnapshot(id) || {};
    var snapSettings = (snap as AnyObj).settings || {};
    var tplSettings = tpl.settings || {};
    var customHtml = tpl.customHtml || (snap as AnyObj).customHtml || tplSettings.customHtml || snapSettings.customHtml || '';
    var customCss = tpl.customCss || (snap as AnyObj).customCss || tplSettings.customCss || snapSettings.customCss || '';
    var rules = tpl.rules || (snap as AnyObj).rules || tplSettings.rules || snapSettings.rules || [];
    var workflow = tpl.workflow || (snap as AnyObj).workflow || tplSettings.workflowTemplate || snapSettings.workflowTemplate || null;
    var mergedSettings = Object.assign({}, tplSettings, snapSettings, {
      customHtml: customHtml,
      customCss: customCss,
      rules: rules,
      workflowTemplate: workflow || null
    });
    var fields = tpl.fields || (snap as AnyObj).fields || [];
    var data = JSON.stringify({
      version: '1.0',
      id: id,
      title: tpl.title || (snap as AnyObj).title || id,
      description: tpl.description || (snap as AnyObj).description || '',
      category: getPrimaryCategory(tpl),
      categories: getTemplateCategories(tpl),
      icon: tpl.icon || '',
      fields: fields,
      customHtml: customHtml,
      customCss: customCss,
      rules: rules,
      workflow: workflow,
      settings: mergedSettings
    }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = String(tpl.title || id).replace(/\s+/g, '-').toLowerCase() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    showToast('Template downloaded!', 'success');
  }

  function getFloatingHost(): HTMLElement {
    var platform = getPlatformName();
    if (platform === 'dnn') {
      var root = document.getElementById('mf-builder-root') as HTMLElement | null;
      var overlay = (root && root.closest('.mf-host-overlay')) as HTMLElement | null;
      if (!overlay) overlay = document.getElementById('mf-host-builder-overlay') as HTMLElement | null;
      if (overlay) return overlay;
      if (root) return root;
    }
    return document.body;
  }

  function appendFloatingElement(el: HTMLElement): HTMLElement {
    var host = getFloatingHost();
    try { el.setAttribute('data-mf-overlay', '1'); } catch (_e) {}
    if (host && el.parentElement !== host) host.appendChild(el);
    return el;
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success'): void {
    var t = document.createElement('div');
    t.className = 'tpl-toast tpl-toast-' + type;
    t.textContent = msg;
    appendFloatingElement(t);
    requestAnimationFrame(function () { t.classList.add('is-visible'); });
    setTimeout(function () { t.classList.remove('is-visible'); setTimeout(function () { t.remove(); }, 300); }, 3000);
  }

  function ensureQuickPreview(): HTMLElement {
    if (_quickPreviewEl && _quickPreviewEl.isConnected) return appendFloatingElement(_quickPreviewEl);
    var el = document.createElement('div');
    el.id = 'tpl-quick-preview';
    el.className = 'tpl-quick-preview';
    el.innerHTML = '<div class="tpl-quick-preview-inner"></div>';
    el.addEventListener('mouseenter', function () {
      if (_quickPreviewHideTimer) window.clearTimeout(_quickPreviewHideTimer);
    });
    el.addEventListener('mouseleave', function () {
      scheduleHideQuickPreview();
    });
    el.addEventListener('click', function (e) {
      var target = e.target as HTMLElement;
      var closeBtn = target.closest('[data-quick-action="close"]') as HTMLElement | null;
      var previewBtn = target.closest('[data-quick-action="preview"]') as HTMLElement | null;
      var useBtn = target.closest('[data-quick-action="use"]') as HTMLElement | null;
      if (closeBtn) {
        hideQuickPreview();
      } else if (previewBtn && _quickPreviewTplId) {
        openPreviewModal(_quickPreviewTplId);
      } else if (useBtn && _quickPreviewTplId) {
        hideQuickPreview();
        enterBuilder(_quickPreviewTplId === 'blank' ? undefined : _quickPreviewTplId);
      }
    });
    appendFloatingElement(el);
    _quickPreviewEl = el;
    return el;
  }

  function buildQuickPreviewHtml(id: string, tpl: AnyObj): string {
    var stats = collectTemplateStats(tpl || {});
    var labels = stats.fields.slice(0, 4).map(function (field: AnyObj) {
      return '<span class="tpl-quick-chip">' + escHtml(getFieldLabel(field)) + '</span>';
    }).join('');

    return '<div class="tpl-quick-head">'
      + '<div class="tpl-quick-title-wrap">'
      + '<div class="tpl-quick-title">' + escHtml(tpl.title || id) + '</div>'
      + '<div class="tpl-quick-desc">' + escHtml(tpl.description || '') + '</div>'
      + '</div>'
      + '<button type="button" class="tpl-quick-close" data-quick-action="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
      + '</div>'
      + '<div class="tpl-quick-meta">'
      + '<span>' + stats.fieldCount + ' fields</span>'
      + '<span>' + stats.pageCount + ' page' + (stats.pageCount === 1 ? '' : 's') + '</span>'
      + (stats.customLayout ? '<span>custom layout</span>' : '<span>schema preview</span>')
      + '</div>'
      + '<div class="tpl-quick-chips">' + labels + '</div>'
      + '<div class="tpl-quick-actions">'
      + '<button type="button" class="tpl-quick-btn" data-quick-action="preview"><i class="fa-regular fa-eye"></i><span>Open preview</span></button>'
      + '<button type="button" class="tpl-quick-btn primary" data-quick-action="use"><i class="fa-solid fa-bolt"></i><span>Use template</span></button>'
      + '</div>';
  }

  function showQuickPreview(id: string, card: HTMLElement): void {
    if (id === 'blank') return;
    var tpl = _presets[id] || getPresetSnapshot(id);
    if (!tpl) return;
    var pop = ensureQuickPreview();
    var inner = pop.querySelector('.tpl-quick-preview-inner') as HTMLElement | null;
    if (!inner) return;
    _quickPreviewTplId = id;
    inner.innerHTML = buildQuickPreviewHtml(id, tpl);

    var rect = card.getBoundingClientRect();
    var width = 320;
    var left = rect.right + 16;
    var top = rect.top;
    if (left + width > window.innerWidth - 12) left = rect.left - width - 16;
    if (left < 12) left = Math.max(12, window.innerWidth - width - 12);
    if (top + 220 > window.innerHeight - 12) top = Math.max(12, window.innerHeight - 232);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.classList.add('is-visible');
  }

  function hideQuickPreview(): void {
    if (_quickPreviewEl) _quickPreviewEl.classList.remove('is-visible');
    _quickPreviewTplId = null;
  }

  function scheduleHideQuickPreview(): void {
    if (_quickPreviewHideTimer) window.clearTimeout(_quickPreviewHideTimer);
    _quickPreviewHideTimer = window.setTimeout(function () {
      hideQuickPreview();
    }, 160);
  }

  function ensurePreviewModal(): HTMLElement {
    if (_previewModalEl && _previewModalEl.isConnected) return appendFloatingElement(_previewModalEl);
    var modal = document.createElement('div');
    modal.id = 'tpl-preview-modal';
    modal.className = 'tpl-preview-modal';
    modal.setAttribute('data-preview-host-badge', PREVIEW_OVERLAY_BADGE);
    modal.innerHTML = ''
      + '<div class="tpl-preview-backdrop" data-preview-close="1"></div>'
      + '<div class="tpl-preview-dialog">'
      + '  <div class="tpl-preview-top">'
      + '    <div class="tpl-preview-title-wrap">'
      + '      <div class="tpl-preview-kicker">Template Preview</div>'
      + '      <h3 id="tpl-preview-title">Template</h3>'
      + '      <p id="tpl-preview-description"></p>'
      + '    </div>'
      + '    <div class="tpl-preview-top-actions">'
      + '      <div class="tpl-preview-devices">'
      + '        <button type="button" class="tpl-preview-device is-active" data-device="desktop"><i class="fa-solid fa-desktop"></i><span>Desktop</span></button>'
      + '        <button type="button" class="tpl-preview-device" data-device="tablet"><i class="fa-solid fa-tablet-screen-button"></i><span>Tablet</span></button>'
      + '        <button type="button" class="tpl-preview-device" data-device="mobile"><i class="fa-solid fa-mobile-screen"></i><span>Mobile</span></button>'
      + '      </div>'
      + '      <button type="button" class="tpl-preview-close" data-preview-close="1" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
      + '    </div>'
      + '  </div>'
      + '  <div class="tpl-preview-content">'
      + '    <aside class="tpl-preview-sidebar">'
      + '      <div class="tpl-preview-summary" id="tpl-preview-summary"></div>'
      + '      <div class="tpl-preview-sidebar-actions">'
      + '        <button type="button" class="tpl-preview-primary" id="tpl-preview-use-btn"><i class="fa-solid fa-bolt"></i><span>Use this template</span></button>'
      + '        <button type="button" class="tpl-preview-secondary" data-preview-close="1">Close</button>'
      + '      </div>'
      + '    </aside>'
      + '    <div class="tpl-preview-stage-wrap">'
      + '      <div class="tpl-preview-stage is-desktop" id="tpl-preview-stage"></div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    appendFloatingElement(modal);

    modal.addEventListener('click', function (e) {
      var target = e.target as HTMLElement;
      if (target.closest('[data-preview-close="1"]')) {
        closePreviewModal();
        return;
      }
      var btn = target.closest('.tpl-preview-device') as HTMLElement | null;
      if (btn) {
        setPreviewDevice(String(btn.getAttribute('data-device') || 'desktop') as 'desktop' | 'tablet' | 'mobile');
      }
    });

    var useBtn = modal.querySelector('#tpl-preview-use-btn') as HTMLButtonElement | null;
    if (useBtn) {
      useBtn.addEventListener('click', function () {
        if (!_previewTplId) return;
        closePreviewModal();
        enterBuilder(_previewTplId === 'blank' ? undefined : _previewTplId);
      });
    }

    document.addEventListener('keydown', function (e: KeyboardEvent) {
      if (e.key === 'Escape' && modal.classList.contains('is-visible')) closePreviewModal();
    });

    _previewModalEl = modal;
    return modal;
  }

  function setPreviewDevice(device: 'desktop' | 'tablet' | 'mobile'): void {
    _previewDevice = device;
    var modal = ensurePreviewModal();
    modal.querySelectorAll('.tpl-preview-device').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-device') === device);
    });
    var stage = modal.querySelector('#tpl-preview-stage') as HTMLElement | null;
    if (!stage) return;
    stage.classList.remove('is-desktop', 'is-tablet', 'is-mobile');
    stage.classList.add('is-' + device);
  }

  function buildPreviewSummary(tpl: AnyObj): string {
    var stats = collectTemplateStats(tpl || {});
    var fieldLabels = stats.fields.slice(0, 7).map(function (field: AnyObj) {
      return '<span class="tpl-preview-chip">' + escHtml(getFieldLabel(field)) + '</span>';
    }).join('');
    return ''
      + '<div class="tpl-preview-summary-grid">'
      + '  <div class="tpl-preview-stat"><strong>' + stats.fieldCount + '</strong><span>Fields</span></div>'
      + '  <div class="tpl-preview-stat"><strong>' + stats.pageCount + '</strong><span>Pages</span></div>'
      + '  <div class="tpl-preview-stat"><strong>' + stats.sectionCount + '</strong><span>Sections</span></div>'
      + '  <div class="tpl-preview-stat"><strong>' + (stats.customLayout ? 'Yes' : 'No') + '</strong><span>Custom HTML</span></div>'
      + '</div>'
      + '<div class="tpl-preview-note">Preview uses the same MegaForm renderer engine in memory. No form is created until you choose <em>Use this template</em>.</div>'
      + '<div class="tpl-preview-chip-list">' + fieldLabels + '</div>';
  }

  function renderPreviewWithRenderer(stageEl: HTMLElement, tpl: AnyObj): boolean {
    try {
      var renderer = (window as any).MegaFormRenderer;
      if (!renderer || typeof renderer.init !== 'function') return false;
      var previewSchema = {
        version: '1.0',
        fields: normalizeTemplateFields(((tpl && tpl.fields) || []) as any[]),
        settings: Object.assign({}, (tpl && tpl.settings) || {}, {
          customHtml: tpl && (tpl.customHtml || (tpl.settings && tpl.settings.customHtml) || ''),
          customCss: tpl && (tpl.customCss || (tpl.settings && tpl.settings.customCss) || ''),
          rules: tpl && (tpl.rules || (tpl.settings && tpl.settings.rules) || []),
          workflowTemplate: tpl && (tpl.workflow || (tpl.settings && tpl.settings.workflowTemplate) || null)
        })
      };
      var previewId = 990000 + Math.floor(Date.now() % 100000);
      stageEl.innerHTML = '<div class="tpl-preview-render-host"></div>';
      var host = stageEl.querySelector('.tpl-preview-render-host') as HTMLElement | null;
      if (!host) return false;
      renderer.init({
        formId: previewId,
        container: host,
        apiBaseUrl: getApiBase(),
        apiBase: getApiBase(),
        schema: previewSchema,
        isPreview: true,
        title: String((tpl && tpl.title) || ''),
        description: String((tpl && tpl.description) || ''),
        submitButtonText: String((tpl && tpl.submitButtonText) || 'Submit'),
        successMessage: String((tpl && tpl.successMessage) || ''),
        rules: Array.isArray(tpl && tpl.rules) ? tpl.rules : []
      });
      return true;
    } catch (err) {
      console.warn('[MegaForm] Template preview renderer fallback:', err);
      return false;
    }
  }

  function openPreviewModal(id: string): void {
    try { console.log('[GalleryPreview v20260501-01] openPreviewModal called id=' + id); } catch (_e) {}
    var tpl = getPresetSnapshot(id) || _presets[id];
    if (!tpl) {
      try { console.warn('[GalleryPreview v20260501-01] template not found for id=' + id); } catch (_e) {}
      return;
    }
    _previewTplId = id;
    var modal = ensurePreviewModal();
    // [OverlayHostFix v20260501-01] Oqtane's loader hideChrome may have applied
    // inline display:none !important to body children before our data-mf-overlay
    // attribute was set. Strip those inline styles whenever we show the modal.
    try { modal.removeAttribute('style'); modal.setAttribute('data-mf-overlay', '1'); } catch (_e) {}
    var titleEl = modal.querySelector('#tpl-preview-title') as HTMLElement | null;
    var descEl = modal.querySelector('#tpl-preview-description') as HTMLElement | null;
    var summaryEl = modal.querySelector('#tpl-preview-summary') as HTMLElement | null;
    var stageEl = modal.querySelector('#tpl-preview-stage') as HTMLElement | null;
    if (titleEl) titleEl.textContent = tpl.title || id;
    if (descEl) descEl.textContent = tpl.description || 'Preview this template before replacing your current schema.';
    if (summaryEl) summaryEl.innerHTML = buildPreviewSummary(tpl);
    if (stageEl && !renderPreviewWithRenderer(stageEl, tpl)) stageEl.innerHTML = buildPreviewStageHtml(tpl);
    setPreviewDevice(_previewDevice || 'desktop');
    modal.classList.add('is-visible');
    document.body.classList.add('tpl-preview-open');
  }

  function closePreviewModal(): void {
    if (_previewModalEl) _previewModalEl.classList.remove('is-visible');
    document.body.classList.remove('tpl-preview-open');
  }

  function bindCard(card: HTMLElement, id: string): void {
    card.addEventListener('click', function (e) {
      var target = e.target as HTMLElement;
      if (target.closest('.tpl-use-overlay-btn') || target.closest('.tpl-inline-use-btn') || target.closest('.tpl-preview-overlay-btn') || target.closest('.tpl-quickpeek-btn')) return;
      if (!_tplGrid) return;
      _tplGrid.querySelectorAll('.tpl-card').forEach(function (x) { x.classList.remove('sel'); });
      card.classList.add('sel');
      _selected = id;
      if (_useBtn) _useBtn.disabled = false;
      updateDownloadBtn();
    });

    card.addEventListener('dblclick', function () {
      _selected = id;
      enterBuilder(id === 'blank' ? undefined : id);
    });

    var previewButtons = card.querySelectorAll<HTMLElement>('.tpl-preview-overlay-btn, .tpl-quickpeek-btn');
    try { console.log('[GalleryPreview v20260430-16] bindCard id=' + id + ' previewBtnCount=' + previewButtons.length); } catch (_e) {}
    previewButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        try { console.log('[GalleryPreview v20260430-16] preview button clicked id=' + id); } catch (_e) {}
        openPreviewModal(id);
      });
    });

    var useButtons = card.querySelectorAll<HTMLElement>('.tpl-use-overlay-btn, .tpl-inline-use-btn');
    useButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        _selected = id;
        enterBuilder(id === 'blank' ? undefined : id);
      });
    });

    if (id !== 'blank') {
      card.addEventListener('mouseenter', function () {
        if (_quickPreviewTimer) window.clearTimeout(_quickPreviewTimer);
        if (_quickPreviewHideTimer) window.clearTimeout(_quickPreviewHideTimer);
        _quickPreviewTimer = window.setTimeout(function () {
          showQuickPreview(id, card);
        }, 220);
      });
      card.addEventListener('mouseleave', function () {
        if (_quickPreviewTimer) window.clearTimeout(_quickPreviewTimer);
        scheduleHideQuickPreview();
      });
    }
  }

  function renderGrid(cat: string): void {
    if (!_tplGrid) return;
    var keys = getFilteredKeys(cat);
    var total = keys.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (_currentPage >= totalPages) _currentPage = totalPages - 1;
    var start = _currentPage * PAGE_SIZE;
    var slice = keys.slice(start, start + PAGE_SIZE);

    _tplGrid.innerHTML = slice.map(function (id) {
      return cardHTML(id, _presets[id], _selected === id);
    }).join('');

    _tplGrid.querySelectorAll<HTMLElement>('.tpl-card').forEach(function (card) {
      var id = card.getAttribute('data-tpl') || '';
      bindCard(card, id);
    });

    var galleryEl = document.querySelector('.tpl-gallery') as HTMLElement | null;
    if (galleryEl) renderPagination(galleryEl, total, _currentPage);
    updateGalleryStats(total);
    updateDownloadBtn();
  }

  function updateDownloadBtn(): void {
    var dlBtn = document.getElementById('tpl-dl-btn') as HTMLButtonElement | null;
    if (!dlBtn) return;
    dlBtn.disabled = !_selected || _selected === 'blank';
  }

  function initGalleryGrid(): void {
    if (_galleryInited) return;
    // BUG FIX v20260405-17: Do NOT set _galleryInited=true before the DOM-ready check.
    //
    // In DNN fullscreen builder (?configure=1&new=1), gallery.ts IIFE auto-calls
    // MFBuilderGallery.init() at the bottom of the script (line ~1655) before
    // dom.ts has run build() and created #tpl-grid in the DOM.
    // Old code set _galleryInited=true here → DOM check fails → returns early →
    // flag stays true → later call from dom.ts (after build()) is blocked → no
    // server templates are ever fetched from BuilderTemplates/List → gallery shows
    // only the 4 hardcoded fallback templates, never the uploaded/portal ones.
    //
    // Fix: move _galleryInited=true to AFTER the DOM element check. If the elements
    // are absent (DOM not built yet), return WITHOUT setting the flag so the next
    // call (which happens after dom.ts build()) can succeed.
    _tplGrid = document.getElementById('tpl-grid');
    var tplFilters = document.getElementById('tpl-filters');
    _useBtn = document.getElementById('tpl-use-btn') as HTMLButtonElement | null;
    if (!_tplGrid || !tplFilters || !_useBtn) return; // DOM not ready — allow retry
    _galleryInited = true; // Set only after confirming DOM elements are present

    _presets = getAllPresetSources();
    // [TrueBlankTemplate v20260506-07] "Start Blank" must produce a TRULY
    // empty schema (fields:[]) — not a Row+sample-fields preset disguised as
    // blank. The old blank had 2 Rows + 5 sample fields which surprised
    // users. Empty schema lets the user start from a clean canvas.
    var BLANK_PRESET = { title:'Start Blank', description:'Build your form from scratch — no pre-filled fields', category:'all', icon:'', fields: [] as any[] };
    if (!Object.keys(_presets).length) {
      _presets = {
        'blank': BLANK_PRESET,
        'corporate-contact': { title:'Corporate Contact', description:'Professional contact with sidebar layout', category:'general', icon:'🏢', fields:[] },
        'patient-intake': { title:'Patient Intake Form', description:'Clean healthcare intake with teal accent', category:'healthcare', icon:'🏥', fields:[] },
        'tech-job-application': { title:'Join Our Team', description:'Dark glassmorphism tech job application', category:'hr', icon:'🚀', fields:[] }
      };
    }

    var keys = Object.keys(_presets);
    var blankIdx = keys.indexOf('blank');
    if (blankIdx > 0) { keys.splice(blankIdx, 1); keys.unshift('blank'); }
    else if (blankIdx === -1) { keys.unshift('blank'); _presets.blank = BLANK_PRESET; }
    // Force-replace any existing 'blank' preset (from getAllPresetSources or
    // legacy template files) with the truly-empty one. Must be the LAST step
    // so it always wins.
    _presets.blank = BLANK_PRESET;
    (window as any).__MF_TRUE_BLANK_BADGE__ = 'TrueBlankTemplate v20260506-07';
    _allKeys = keys;

    rebuildCategoryFilters();
    ensureQuickPreview();
    ensurePreviewModal();

    var hd = document.querySelector('.tpl-hd') as HTMLElement | null;
    if (hd && !document.getElementById('tpl-ul-btn')) {
      var actRow = document.createElement('div');
      actRow.className = 'tpl-hd-actions';

      var ulBtn = document.createElement('button');
      ulBtn.className = 'tpl-action-btn';
      ulBtn.id = 'tpl-ul-btn';
      ulBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Upload Template';
      ulBtn.addEventListener('click', handleUploadTemplate);

      var dlBtn = document.createElement('button') as HTMLButtonElement;
      dlBtn.className = 'tpl-action-btn';
      dlBtn.id = 'tpl-dl-btn';
      dlBtn.disabled = true;
      dlBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download JSON';
      dlBtn.addEventListener('click', function () { if (_selected && _selected !== 'blank') handleDownloadTemplate(_selected); });

      actRow.appendChild(ulBtn);
      actRow.appendChild(dlBtn);

      if (supportsDevBulkCreate()) {
        var devBtn = document.createElement('button') as HTMLButtonElement;
        devBtn.className = 'tpl-action-btn';
        devBtn.id = 'tpl-dev-bulk-btn';
        devBtn.style.display = 'none';
        devBtn.title = DEV_BULK_BADGE;
        devBtn.style.gap = '8px';
        devBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"></path><path d="M5 12h14"></path><path d="M4 4h16v16H4z"></path></svg><span>Dev: Bulk Create Forms</span><span style="display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;border:1px solid #c7d2fe;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700;line-height:1;">v20260410-06</span>';
        devBtn.addEventListener('click', function () { handleDevBulkCreate(devBtn); });
        actRow.appendChild(devBtn);
        hasDevLock().then(function (enabled) {
          if (enabled) devBtn.style.display = 'inline-flex';
        }).catch(function () { /* ignore */ });
      }

      hd.appendChild(actRow);
      applyGalleryDemoMode(hd, ulBtn);
      // [DragDropUpload v20260618] Drop a .json/.zip anywhere on the gallery to upload —
      // bypasses the OS file dialog (which opens behind the fullscreen builder on Oqtane).
      try { installTemplateDropZone(document.getElementById('tpl-gallery') || (hd.parentElement as HTMLElement | null)); } catch (_e) {}
    }

    tplFilters.addEventListener('click', function (e: Event) {
      var btn = (e.target as HTMLElement).closest('.tpl-cat') as HTMLElement | null;
      if (!btn) return;
      tplFilters.querySelectorAll('.tpl-cat').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _currentCat = btn.getAttribute('data-cat') || 'all';
      _currentPage = 0;
      hideQuickPreview();
      renderGrid(_currentCat);
    });

    _useBtn.addEventListener('click', function () {
      if (!_selected) return;
      enterBuilder(_selected === 'blank' ? undefined : _selected);
    });

    window.addEventListener('scroll', hideQuickPreview, true);
    window.addEventListener('resize', hideQuickPreview);

    renderGrid('all');
    loadFolderTemplates();
  }

  var MFBuilderGallery = {
    init: function (): void {
      if (document.getElementById('tpl-grid')) initGalleryGrid();
      (window as any).enterBuilder = enterBuilder;
      (window as any).openTemplatePreview = openPreviewModal;
    },
    enterBuilder: enterBuilder,
    openPreview: openPreviewModal,
  };

  (window as any).MFBuilderGallery = MFBuilderGallery;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { MFBuilderGallery.init(); });
  } else {
    MFBuilderGallery.init();
  }
})();

export {};
