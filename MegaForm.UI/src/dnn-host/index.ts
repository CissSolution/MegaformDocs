import { clearStoredRendererHostUrl, getPlatformRoute } from '@shared/platform-host';

declare global {
  interface Window {
    MegaForm?: any;
    jQuery?: any;
  }
}

const DNN_HOST_ROUTE_BADGE = 'DNN Host Route v20260412-02';
const DNN_LANG_ROUTE_BADGE = 'DNN LanguagesRoute v20260407-01';
const DNN_UPLOAD_SECURITY_BADGE = 'DNNUploadSecurity v20260419-11';
const DNN_MODULE_MODE_BADGE = 'DnnModuleMode v20260419-16';

// ─────────────────────────────────────────────────────────────────────────────
// EARLY BOOTSTRAP (Bug fixes: wrong URL + missing env on hard refresh)
//
// 1. TIMING: megaform-dnn-host.js loads at priority 124, AFTER dashboard (118)
//    and submissions (119). On hard refresh at #mf-dashboard the dashboard IIFE
//    runs first and captures window.__MF_PLATFORM__ before we set it. Fix: set
//    __MF_PLATFORM__ here, at IIFE parse time, before DOMContentLoaded.
//
// 2. WRONG URL (/Home/formId/24?formId=24#mf-builder):
//    window.location.pathname may contain DNN routing segments like /formId/24
//    (from a prior EditUrl navigation). If we use pathname as the base for hash
//    routes, those segments get baked into builderUrl/submissionsUrl. Then
//    getPlatformRoute calls addQuery → appends ?formId=24 → broken URL.
//    Fix: use data-return-url (server-rendered by BuildReturnUrl using the
//    clean DNN tab path, e.g. /Home) as the base for all hash routes.
// ─────────────────────────────────────────────────────────────────────────────
(function earlyBootstrap() {
  const host = document.getElementById('mf-dnn-host') as HTMLElement | null;
  cleanupStaleWorkflowChrome();
  if (!host) return;
  host.setAttribute('data-upload-security-badge', DNN_UPLOAD_SECURITY_BADGE);
  host.setAttribute('data-module-mode-badge', DNN_MODULE_MODE_BADGE);

  // Use data-return-url as the canonical DNN tab base path — always the clean
  // page URL without DNN edit-mode path segments (/formId/xx, /ctl/Edit, etc.)
  // window.location.pathname may be /Home/formId/24 (DNN routing artifact) which
  // would produce /Home/formId/24#mf-builder → then addQuery appends ?formId=24
  // → broken URL /Home/formId/24?formId=24#mf-builder.
  const returnUrl: string = host.dataset.returnUrl || window.location.pathname || '/';
  const bootUrl = new URL(window.location.href, window.location.origin);
  if (bootUrl.searchParams.has('mfvSaved')) {
    bootUrl.searchParams.delete('mfvSaved');
    const clean = bootUrl.pathname + (bootUrl.search || '') + (bootUrl.hash || '');
    try { window.history.replaceState({}, document.title, clean); } catch {}
  }
  const dnnBase: string = returnUrl.split('?')[0].split('#')[0] || '/';
  // BUG FIX v20260405-18: overlay hash routes must NOT include ?configure=1.
  // configure=1 → ShowConfigPanel=true → fullscreen builder mode → dnn-host.js
  // is NOT loaded → overlay hash (#mf-dashboard, #mf-submissions, etc.) has no
  // handler → overlay never opens on page reload. Only the fullscreen builder URL
  // (builderRoute) keeps configure=1 because that IS a full-page navigation
  // intentionally opening the fullscreen Vite builder.
  const hashRoute = (mode: string): string => dnnBase + `#mf-${mode}`;
  const builderRoute = (isNew = false): string => dnnBase + (isNew ? '?new=1#mf-builder-new' : '#mf-builder');

  // Compute final values: DOM data-* always wins for server-context fields
  const moduleId = Number.parseInt(host.dataset.moduleId || '0', 10) || 0;
  const prev = (window.__MF_PLATFORM__ || {}) as Record<string, unknown>;

  window.__MF_PLATFORM__ = {
    // Preserve non-URL fields from any previously set value (e.g. server inline script)
    ...(prev as object),
    // Server context — DOM data-* is authoritative (server-rendered, cannot be spoofed)
    platform:         'dnn',
    apiBase:          host.dataset.apiBase    || (prev.apiBase    as string) || '/DesktopModules/MegaForm/API/',
    assetsBaseUrl:    host.dataset.assetsBase || (prev.assetsBaseUrl as string) || '/DesktopModules/MegaForm/Assets/',
    moduleId,
    instanceId:       moduleId,
    tabId:            Number.parseInt(host.dataset.tabId    || '0', 10) || (prev.tabId    as number) || 0,
    portalId:         Number.parseInt(host.dataset.portalId || '0', 10) || (prev.portalId as number) || 0,
    formId:           Number.parseInt(host.dataset.formId   || '0', 10) || (prev.formId   as number) || 0,
    returnUrl:        dnnBase,
    // Hash routes — always derived from dnnBase (clean server tab path)
    dashboardUrl:     hashRoute('dashboard'),
    builderUrl:       builderRoute(false),
    submissionsUrl:   hashRoute('submissions'),
    settingsUrl:      hashRoute('views'),
    themeDesignerUrl: hashRoute('theme'),
    languagesUrl:     hashRoute('languages'),
    logoutUrl:        dnnBase,
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// [DnnMFStarterShim v20260518-02] window.MFStarter.launch for DNN
//
// Mirrors the Oqtane MFStarter.launch shim (emitted inline by Index.razor) so
// the same "Business Starters" UI code can drive both platforms. The shim
// POSTs the starterKey to /DesktopModules/MegaForm/API/Starter/Launch and
// redirects on success. Uses DNN's ServicesFramework to pick up the
// RequestVerificationToken + TabId + ModuleId headers that
// [ValidateAntiForgeryToken] requires.
//
// v02: surface the server response body in console + thrown Error.message so
// 400/401/403 from the controller is debuggable from the dashboard modal toast.
// ─────────────────────────────────────────────────────────────────────────────
(function installMFStarterShim() {
  const W = window as any;
  W.MFStarter = W.MFStarter || {};
  if (typeof W.MFStarter.launch === 'function') return;

  function dnnApiBase(): string {
    const platform = (W.__MF_PLATFORM__ || {}) as any;
    return String(platform.apiBase || '/DesktopModules/MegaForm/API/');
  }

  function dnnAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const platform = (W.__MF_PLATFORM__ || {}) as any;
    const moduleId = platform.moduleId || platform.instanceId || 0;
    try {
      const sf = W.jQuery?.ServicesFramework?.(moduleId);
      if (sf) {
        headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
        // [v20260527-04] Do NOT set TabId/ModuleId — DNN's framework
        // cross-checks them against the alias-resolved portal and 400s on
        // child-portal subpath aliases. Server reads portalId from
        // ?portalId=N query string (appended via dnnHostWithPortalId()).
      }
    } catch { /* ServicesFramework unavailable — backend will reject */ }
    return headers;
  }

  // Shared helper used by every fetch() in this bundle to append
  // ?portalId=N (sourced from __MF_PLATFORM__) so the server scopes data
  // to the caller's portal without depending on TabId/ModuleId headers.
  function dnnHostWithPortalId(url: string): string {
    if (/[?&]portalId=/i.test(url)) return url;
    const pf = (W.__MF_PLATFORM__ || {}) as any;
    const raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
    const pid = (isFinite(n) && n >= 0) ? n : 0;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }
  (W as any).__mfDnnHostWithPortalId__ = dnnHostWithPortalId;

  async function parseJson(resp: Response): Promise<any> {
    const text = await resp.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!resp.ok) {
      const detail = (json && (json.error || json.message || json.Message)) || text || ('HTTP ' + resp.status);
      // Log the FULL response (headers + body) so a 400/401 from antiforgery
      // or controller-level guard is visible in the Network tab + console.
      try {
        console.error('[MFStarter] Server rejected starter launch', {
          status: resp.status,
          url: resp.url,
          body: text,
          json
        });
      } catch { /* ignore */ }
      throw new Error('Starter launch failed (' + resp.status + '): ' + detail);
    }
    return json || {};
  }

  W.MFStarter.launch = async function (opts: any) {
    opts = opts || {};
    const key = String(opts.starterKey || '').trim().toLowerCase();
    const platform = (W.__MF_PLATFORM__ || {}) as any;
    const moduleId = Number(opts.moduleId || platform.moduleId || platform.instanceId || 0);
    if (moduleId <= 0) throw new Error('Missing moduleId context for starter app launch. Refresh the page and try again.');
    if (!key) throw new Error('Missing starterKey. Reopen the Business Starters panel and pick a card.');

    const currentPageUrl = String(opts.currentPageUrl || (window.location.origin + window.location.pathname));
    const payload = {
      starterKey: key,
      moduleId,
      homeUrl: currentPageUrl,
      currentUrl: String(opts.currentUrl || window.location.href),
      currentPageUrl
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    Object.assign(headers, dnnAuthHeaders());

    // Debug breadcrumb so future 4xx is easy to triage from the console.
    try {
      console.info('[MFStarter] launching', {
        starterKey: key,
        moduleId,
        payload,
        hasAntiforgery: !!headers['RequestVerificationToken'],
        hasModuleIdHeader: !!headers['ModuleId']
      });
    } catch { /* ignore */ }

    const resp = await fetch(dnnHostWithPortalId(dnnApiBase() + 'Starter/Launch'), {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify(payload)
    });
    const result = await parseJson(resp);
    const redirectUrl = String(result.redirectUrl || result.RedirectUrl || '').trim();
    if (redirectUrl) {
      window.location.replace(redirectUrl);
      return result;
    }
    // Fallback: stay on this page but switch view via ?vk=
    const defaultViewKey = String(result.defaultViewKey || result.DefaultViewKey || '').trim();
    const target = new URL(currentPageUrl, window.location.origin);
    target.searchParams.delete('view');
    target.searchParams.delete('formid');
    target.searchParams.delete('mfpanel');
    target.searchParams.delete('edit');
    if (defaultViewKey) target.searchParams.set('vk', defaultViewKey);
    else target.searchParams.delete('vk');
    window.location.replace(target.pathname + target.search + (target.hash || ''));
    return result;
  };
})();

type HostMode = 'dashboard' | 'views' | 'builder' | 'submissions' | 'theme' | 'languages' | 'myinbox';

interface HostElements {
  host: HTMLElement;
  dashboard: HTMLElement;
  views: HTMLElement;
  builder: HTMLElement;
  submissions: HTMLElement;
  theme: HTMLElement;
  languages: HTMLElement;
  viewsGrid: HTMLElement;
  viewsSave: HTMLButtonElement;
}

function dnnHeaders(moduleId: number): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const sf = window.jQuery?.ServicesFramework?.(moduleId);
    if (sf) {
      headers.RequestVerificationToken = sf.getAntiForgeryValue();
      // [v20260527-04] Do NOT set TabId/ModuleId headers — see installMFStarterShim
      // dnnAuthHeaders() above. Server reads portalId from ?portalId=N query.
    }
  } catch (error) {
    console.warn('[MegaForm.DNN.Host] ServicesFramework unavailable', error);
  }
  return headers;
}

// Shared helper: append ?portalId=N from __MF_PLATFORM__ to any URL.
function dnnHostUrlWithPortalId(url: string): string {
  if (/[?&]portalId=/i.test(url)) return url;
  const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
  const raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
  const pid = (isFinite(n) && n >= 0) ? n : 0;
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

function normalizeViewForm(raw: any): { formId: number; title: string; status?: string } | null {
  const formId = Number.parseInt(String(raw?.formId || raw?.FormId || '0'), 10) || 0;
  if (!formId) return null;
  return {
    formId,
    title: String(raw?.title || raw?.Title || '').trim(),
    status: String(raw?.status || raw?.Status || '').trim() || 'Draft',
  };
}



type PopupTriggerType = 'time_delay' | 'scroll_depth' | 'click_trigger';
type PopupBorderMode = 'transparent_popup';

interface PopupDisplayConfig {
  displayMode: 'fixed' | 'popup';
  popup: {
    triggerType: PopupTriggerType;
    delaySeconds: number;
    scrollPercent: number;
    clickSelector: string;
    borderMode: PopupBorderMode;
    showOncePerSession: boolean;
    closeOnOverlay: boolean;
    startAt: string;
    endAt: string;
  };
}

function defaultPopupDisplayConfig(): PopupDisplayConfig {
  return {
    displayMode: 'fixed',
    popup: {
      triggerType: 'time_delay',
      delaySeconds: 5,
      scrollPercent: 50,
      clickSelector: '',
      borderMode: 'transparent_popup',
      showOncePerSession: true,
      closeOnOverlay: true,
      startAt: '',
      endAt: '',
    }
  };
}

function normalizePopupDisplayConfig(raw: any): PopupDisplayConfig {
  var cfg: any = {};
  try {
    cfg = typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : (raw || {});
  } catch { cfg = {}; }
  var defaults = defaultPopupDisplayConfig();
  var popup = cfg.popup || cfg.Popup || {};
  var displayMode = String(cfg.displayMode || cfg.DisplayMode || defaults.displayMode).toLowerCase() === 'popup' ? 'popup' : 'fixed';
  var triggerRaw = String(popup.triggerType || popup.TriggerType || defaults.popup.triggerType).toLowerCase();
  var triggerType: PopupTriggerType = triggerRaw === 'scroll_depth' || triggerRaw === 'click_trigger' ? triggerRaw as PopupTriggerType : 'time_delay';
  var borderMode: PopupBorderMode = 'transparent_popup';
  var delaySeconds = Number.parseInt(String(popup.delaySeconds || popup.DelaySeconds || defaults.popup.delaySeconds), 10);
  var scrollPercent = Number.parseInt(String(popup.scrollPercent || popup.ScrollPercent || defaults.popup.scrollPercent), 10);
  return {
    displayMode,
    popup: {
      triggerType,
      delaySeconds: Number.isFinite(delaySeconds) && delaySeconds >= 0 ? delaySeconds : defaults.popup.delaySeconds,
      scrollPercent: Number.isFinite(scrollPercent) && scrollPercent > 0 ? Math.max(5, Math.min(95, scrollPercent)) : defaults.popup.scrollPercent,
      clickSelector: String(popup.clickSelector || popup.ClickSelector || '').trim(),
      borderMode,
      showOncePerSession: popup.showOncePerSession === undefined && popup.ShowOncePerSession === undefined ? defaults.popup.showOncePerSession : !!(popup.showOncePerSession ?? popup.ShowOncePerSession),
      closeOnOverlay: popup.closeOnOverlay === undefined && popup.CloseOnOverlay === undefined ? defaults.popup.closeOnOverlay : !!(popup.closeOnOverlay ?? popup.CloseOnOverlay),
      startAt: String(popup.startAt || popup.StartAt || '').trim(),
      endAt: String(popup.endAt || popup.EndAt || '').trim(),
    }
  };
}

function buildPopupDisplayConfigForSave(existingRaw: any, nextCfg: PopupDisplayConfig): string {
  var base: any = {};
  try {
    base = typeof existingRaw === 'string' ? (existingRaw ? JSON.parse(existingRaw) : {}) : (existingRaw || {});
  } catch { base = {}; }
  base.displayMode = nextCfg.displayMode;
  base.popup = {
    triggerType: nextCfg.popup.triggerType,
    delaySeconds: nextCfg.popup.delaySeconds,
    scrollPercent: nextCfg.popup.scrollPercent,
    clickSelector: nextCfg.popup.clickSelector,
    borderMode: 'transparent_popup',
    showOncePerSession: nextCfg.popup.showOncePerSession,
    closeOnOverlay: nextCfg.popup.closeOnOverlay,
    startAt: nextCfg.popup.startAt,
    endAt: nextCfg.popup.endAt,
  };
  return JSON.stringify(base);
}



function isTrialModeActive(): boolean {
  const platform = (window.__MF_PLATFORM__ || {}) as Record<string, unknown>;
  const raw = platform.productionMode;
  if (raw === undefined || raw === null || raw === '') return false;
  return String(raw).toLowerCase() !== 'true';
}

// [DockParity v20260714-01] The pill is now a TRIAL badge only. It used to double as a "Render"
// state chip, which Oqtane's dock does not have — and which made the DNN dock a button wider than
// the Oqtane one for no information. On a licensed site the pill stays hidden.
function applyTrialDockPill(host: HTMLElement): void {
  const pill = host.querySelector<HTMLElement>('.mf-host-admin-pill');
  if (!pill) return;
  if (isTrialModeActive()) {
    pill.style.display = '';
    pill.innerHTML = '<i class="fas fa-flask"></i> Trial Mode';
    pill.setAttribute('title', String(((window.__MF_PLATFORM__ || {}) as any).trialFooterText || 'https://dnndefender.com  Megaform Trial Mode'));
    pill.setAttribute('data-badge', DNN_MODULE_MODE_BADGE);
  } else {
    pill.style.display = 'none';
  }
}



// [RendererHostRetired v20260714-01] The Renderer Host dock button + callout are gone.
// What survives is the Views panel labelling: pick the form this module renders on this page
// and how it displays (fixed / popup). Any leftover renderer-host chrome from an older
// deployed ASCX is removed here so a stale page cannot resurrect the dead concept.
function ensureViewsUx(host: HTMLElement, els: HostElements): void {
  applyTrialDockPill(host);
  window.setTimeout(() => applyTrialDockPill(host), 0);
  window.setTimeout(() => applyTrialDockPill(host), 300);
  window.setTimeout(() => applyTrialDockPill(host), 1200);

  host.querySelectorAll<HTMLElement>('[data-mf-renderer-host-status]').forEach((el) => el.remove());

  const viewsBtn = host.querySelector<HTMLElement>('[data-mf-open="views"]');
  if (viewsBtn) {
    viewsBtn.innerHTML = '<i class="fas fa-clone"></i> Module View';
    viewsBtn.setAttribute('title', 'Choose the form this module renders on this page');
  }

  const viewsHeadTitle = els.views.querySelector<HTMLElement>('.mf-host-title');
  if (viewsHeadTitle) viewsHeadTitle.innerHTML = '<i class="fas fa-clone"></i> Module View';

  const card = els.viewsGrid.parentElement;
  if (!card) return;
  card.querySelectorAll<HTMLElement>('[data-mf-renderer-host-callout]').forEach((el) => el.remove());
  const topBlocks = Array.from(card.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (topBlocks[0]) {
    topBlocks[0].textContent = 'Form shown by this module on this page';
    topBlocks[0].setAttribute('data-badge', DNN_MODULE_MODE_BADGE);
  }
  if (topBlocks[1]) {
    topBlocks[1].textContent = 'Step 1: choose the form in the compact dropdown. Step 2: choose Fixed form or Popup form display.';
  }
  let formLabel = card.querySelector<HTMLElement>('[data-mf-form-selection-label]');
  if (!formLabel) {
    formLabel = document.createElement('div');
    formLabel.setAttribute('data-mf-form-selection-label', '1');
    formLabel.style.cssText = 'margin:16px 0 6px;font:700 12px/1.3 Inter,system-ui,sans-serif;color:#334155;letter-spacing:.02em;text-transform:uppercase;';
    card.insertBefore(formLabel, els.viewsGrid);
  }
  formLabel.textContent = 'Form rendered by this module on this page';
  els.viewsSave.textContent = 'Use selected form on this page';
}



async function loadModuleConfigSnapshot(host: HTMLElement): Promise<{ forms: Array<{ formId: number; title: string; status?: string }>; config: any }> {
  const moduleId = Number.parseInt(host.dataset.moduleId || '0', 10) || 0;
  const apiBase = (host.dataset.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/');
  const fallbackForms = (parseJson<any[]>(host.dataset.formsJson, []) || []).map(normalizeViewForm).filter(Boolean) as Array<{ formId: number; title: string; status?: string }>;
  const fallbackConfig = parseJson<any>(host.dataset.moduleConfigJson, {});
  if (!moduleId) return { forms: fallbackForms, config: fallbackConfig };
  try {
    const res = await fetch(dnnHostUrlWithPortalId(apiBase + `ModuleConfig/Get?moduleId=${moduleId}`), { headers: dnnHeaders(moduleId) });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json().catch(() => ({}));
    const forms = ((data?.forms || data?.Forms || []) as any[]).map(normalizeViewForm).filter(Boolean) as Array<{ formId: number; title: string; status?: string }>;
    return { forms: forms.length ? forms : fallbackForms, config: data?.config || data?.Config || fallbackConfig };
  } catch (error) {
    console.warn('[MegaForm.DNN.Host] module config snapshot fallback', error);
    return { forms: fallbackForms, config: fallbackConfig };
  }
}


function currentModeFromHash(): HostMode | null {
  const hash = String(window.location.hash || '').toLowerCase();
  if (hash.startsWith('#mf-dashboard')) return 'dashboard';
  if (hash.startsWith('#mf-views')) return 'views';
  if (hash.startsWith('#mf-builder')) return 'builder';   // catches both #mf-builder and #mf-builder-new
  if (hash.startsWith('#mf-submissions')) return 'submissions';
  if (hash.startsWith('#mf-myinbox')) return 'myinbox';
  if (hash.startsWith('#mf-theme')) return 'theme';
  if (hash.startsWith('#mf-languages')) return 'languages';
  return null;
}

/** Returns true when the current hash requests a brand-new (gallery) builder session. */
function isBuilderNewFromHash(): boolean {
  const hash = String(window.location.hash || '').toLowerCase();
  if (hash.startsWith('#mf-builder-new')) return true;
  try {
    const url = new URL(window.location.href);
    return String(url.searchParams.get('new') || '').toLowerCase() === '1';
  } catch (_e) {
    return false;
  }
}

function setHash(mode: HostMode | null, forceNew = false): void {
  const url = new URL(window.location.href);
  // BUG FIX v20260405-18: NEVER set configure=1 via replaceState for overlay modes.
  // The overlay system (dnn-host.js) works WITHOUT configure=1 — it reads the hash.
  // Adding configure=1 via replaceState means any page reload at that URL fires
  // ShowConfigPanel=true (fullscreen builder) instead of overlay mode → broken.
  // Only the builder FULL-PAGE navigation (builderRoute) uses configure=1.
  if (!mode) {
    // Closing overlay: strip configure, new, formId from URL, remove hash
    url.searchParams.delete('configure');
    url.searchParams.delete('new');
    url.searchParams.delete('formId');
    url.searchParams.delete('formid');
    url.searchParams.delete('mfFormId');
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + (url.search || ''));
    return;
  }
  // Opening overlay: do NOT set configure=1 — hash alone is the state signal
  url.searchParams.delete('configure'); // strip any leftover configure param
  if (mode === 'dashboard') {
    url.searchParams.delete('formId');
    url.searchParams.delete('formid');
    url.searchParams.delete('mfFormId');
    url.searchParams.delete('new');
    url.hash = '#mf-dashboard';
  } else if (mode === 'builder' && forceNew) {
    url.searchParams.delete('formId');
    url.searchParams.delete('formid');
    url.searchParams.delete('mfFormId');
    url.searchParams.set('new', '1');
    url.hash = '#mf-builder-new';
  } else {
    const legacyFormId = url.searchParams.get('mfFormId') || url.searchParams.get('formId') || url.searchParams.get('formid') || '';
    // FORMID-FIX v20260412-01: for theme overlay, also check platform formId so
    // that refreshing at #mf-theme?mfFormId=N reloads the correct form.
    // Previously legacyFormId was empty when navigating from #mf-builder (no ?mfFormId),
    // so theme URL became /Default.aspx#mf-theme with no formId → wrong form on refresh.
    const platformFormId = mode === 'theme' || mode === 'builder' || mode === 'submissions'
      ? String((window.__MF_PLATFORM__ as any)?.formId || 0)
      : '';
    const effectiveFormId = legacyFormId || (parseInt(platformFormId, 10) > 0 ? platformFormId : '');
    url.searchParams.delete('formId');
    url.searchParams.delete('formid');
    if (mode === 'builder') {
      url.searchParams.delete('new');
      if (effectiveFormId) url.searchParams.set('mfFormId', effectiveFormId);
      else url.searchParams.delete('mfFormId');
    } else if (effectiveFormId && mode !== 'dashboard' && mode !== 'views' && mode !== 'languages') {
      url.searchParams.set('mfFormId', effectiveFormId);
    } else {
      url.searchParams.delete('mfFormId');
    }
    url.hash = `#mf-${mode}`;
  }
  window.history.replaceState({}, document.title, url.pathname + (url.search || '') + (url.hash || ''));
}

// [DnnBodyPortals v20260714-01] MegaForm popovers/toasts that live as direct <body>
// children (they are body-appended on purpose so no ancestor overflow can clip them).
// The chrome hider must NOT display:none them — hiding the language picker panel is
// what made "Display language" look dead inside the Languages overlay.
const MF_BODY_PORTAL_SELECTOR = '.mf-langpick-panel, .mf-dnn-fs-toggle, .mf-loc-toast, [data-mf-portal], [data-mf-overlay]';

function isMegaFormBodyPortal(el: HTMLElement): boolean {
  try { return typeof el.matches === 'function' && el.matches(MF_BODY_PORTAL_SELECTOR); } catch { return false; }
}

function createChromeHider() {
  let hidden: Array<{ el: HTMLElement; display: string }> = [];
  let originalBodyOverflow = '';
  return {
    hide(keep: HTMLElement) {
      hidden = [];
      originalBodyOverflow = document.body.style.overflow || '';
      // BUG FIX v20260405-18: Do NOT set overflow:hidden on <html>.
      // Setting html.overflow:hidden blocks mouse-wheel scroll events from reaching
      // fixed-position overlays (dashboard, submissions, etc.). The overlay is
      // position:fixed so it is already independent of the body scroll — body
      // overflow:hidden is sufficient to suppress the DNN page scrollbar underneath.
      document.body.style.overflow = 'hidden';
      // Hide every direct body child EXCEPT the overlay being shown
      Array.from(document.body.children).forEach((node) => {
        const el = node as HTMLElement;
        if (el === keep || el.contains(keep)) return;
        if (isMegaFormBodyPortal(el)) return;
        hidden.push({ el, display: el.style.display || '' });
        el.style.display = 'none';
      });
    },
    restore() {
      hidden.forEach(({ el, display }) => { el.style.display = display; });
      hidden = [];
      document.body.style.overflow = originalBodyOverflow;
      // html overflow was never set — nothing to restore
    }
  };
}

function bootDashboard(root: HTMLElement): void {
  if (root.dataset.booted === '1' || root.dataset.bootPending === '1') return;

  let attempts = 0;
  const maxAttempts = 40;

  const tryInit = (): void => {
    const init = window.MegaForm?.initDashboard;
    if (typeof init === 'function') {
      try {
        init(root);
        root.dataset.booted = '1';
      } catch (error) {
        delete root.dataset.booted;
        console.error('[MegaForm.DNN.Host] dashboard init failed', error);
      } finally {
        delete root.dataset.bootPending;
      }
      return;
    }

    attempts += 1;
    if (attempts >= maxAttempts) {
      delete root.dataset.bootPending;
      console.warn('[MegaForm.DNN.Host] initDashboard was not ready after retry window');
      return;
    }

    window.setTimeout(tryInit, 150);
  };

  root.dataset.bootPending = '1';
  tryInit();
}

function bootSubmissions(root: HTMLElement): void {
  // [SubmissionsShellRoute v20260609-01] Canonical SubmissionsShell is the
  // only submission dashboard. Gmail-style inbox was removed.
  if (root.dataset.booted) return;
  if (!root.dataset.platform) root.dataset.platform = 'dnn';
  if (!root.dataset.mfApiBase) root.dataset.mfApiBase = '/API/MegaForm/';
  const init = window.MegaForm?.initSubmissions;
  if (typeof init === 'function') {
    init(root);
    root.dataset.booted = '1';
  }
}

function bootLanguages(root: HTMLElement): void {
  const init = window.MegaForm?.initLanguages;
  if (typeof init === 'function' && !root.dataset.booted) {
    init(root);
    root.dataset.booted = '1';
    void DNN_LANG_ROUTE_BADGE;
  }
}

function bootMyInbox(root: HTMLElement): void {
  if (!root || root.dataset.booted) return;
  if (!root.dataset.platform) root.dataset.platform = 'dnn';
  const init = (window as any).MegaForm?.initMyInbox;
  if (typeof init === 'function') {
    init(root);
    root.dataset.booted = '1';
  }
}

function relativeUrl(url: URL): string {
  return url.pathname + (url.search || '') + (url.hash || '');
}

function navigateToViewsAfterSave(host: HTMLElement, selectedFormId: number, savedViewConfig: string): void {
  try {
    host.dataset.formId = String(selectedFormId || 0);
    host.dataset.moduleConfigJson = JSON.stringify({
      ...(parseJson<any>(host.dataset.moduleConfigJson, {}) || {}),
      FormId: selectedFormId,
      formId: selectedFormId,
      ViewConfigJson: savedViewConfig,
      viewConfigJson: savedViewConfig,
    });
  } catch {}
  const nextUrl = new URL(host.dataset.returnUrl || window.location.pathname || '/', window.location.origin);
  nextUrl.searchParams.set('mfvSaved', String(Date.now()));
  nextUrl.hash = 'mf-views';
  window.location.replace(relativeUrl(nextUrl));
}

async function renderViews(host: HTMLElement, els: HostElements): Promise<void> {
  const snapshot = await loadModuleConfigSnapshot(host);
  const forms = snapshot.forms;
  const moduleConfig = snapshot.config || {};
  const currentFormId = Number.parseInt(String(moduleConfig?.FormId || moduleConfig?.formId || host.dataset.formId || '0'), 10) || 0;
  let selectedFormId = currentFormId > 0 ? currentFormId : ((forms[0]?.formId as number) || 0);
  let displayCfg = normalizePopupDisplayConfig(moduleConfig?.ViewConfigJson || moduleConfig?.viewConfigJson || '{}');

  ensureViewsUx(host, els);
  els.viewsGrid.innerHTML = '';
  if (!forms.length) {
    const empty = document.createElement('div');
    empty.className = 'mf-host-boot';
    empty.textContent = 'No forms found for this portal yet.';
    els.viewsGrid.appendChild(empty);
    return;
  }

  const panel = document.createElement('div');
  panel.style.cssText = 'display:grid;grid-template-columns:minmax(280px,1.3fr) minmax(220px,.9fr);gap:14px;align-items:start;';
  const left = document.createElement('div');
  const right = document.createElement('div');
  panel.appendChild(left);
  panel.appendChild(right);

  const sectionTitle = document.createElement('div');
  sectionTitle.style.cssText = 'font:700 12px/1.3 Inter,system-ui,sans-serif;color:#334155;letter-spacing:.02em;text-transform:uppercase;margin:0 0 6px;';
  sectionTitle.textContent = 'Form on this page';
  left.appendChild(sectionTitle);

  const select = document.createElement('select');
  select.className = 'mf-host-select';
  select.style.cssText = 'width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;font:600 14px/1.4 Inter,system-ui,sans-serif;outline:none;';
  forms.forEach((form) => {
    const option = document.createElement('option');
    option.value = String(form.formId);
    option.textContent = `${form.title || `Form #${form.formId}`} · ${form.status || 'Draft'}`;
    if (form.formId === selectedFormId) option.selected = true;
    select.appendChild(option);
  });
  select.value = selectedFormId > 0 ? String(selectedFormId) : (select.options[0]?.value || '0');
  selectedFormId = Number.parseInt(select.value || '0', 10) || 0;
  select.addEventListener('change', () => {
    selectedFormId = Number.parseInt(select.value || '0', 10) || 0;
  });
  left.appendChild(select);

  const helper = document.createElement('div');
  helper.style.cssText = 'margin-top:8px;color:#64748b;font:500 12px/1.55 Inter,system-ui,sans-serif;';
  helper.textContent = `${forms.length} forms found. Use the dropdown to keep this pane compact.`;
  left.appendChild(helper);

  const modeLabel = document.createElement('div');
  modeLabel.style.cssText = 'font:700 12px/1.3 Inter,system-ui,sans-serif;color:#334155;letter-spacing:.02em;text-transform:uppercase;margin:0 0 6px;';
  modeLabel.textContent = 'Display mode';
  right.appendChild(modeLabel);

  const modeSelect = document.createElement('select');
  modeSelect.style.cssText = 'width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:14px;background:#fff;color:#0f172a;font:600 14px/1.4 Inter,system-ui,sans-serif;outline:none;';
  modeSelect.innerHTML = '<option value="fixed">Fixed form</option><option value="popup">Popup form</option>';
  modeSelect.value = displayCfg.displayMode;
  right.appendChild(modeSelect);

  const popupCard = document.createElement('div');
  popupCard.style.cssText = 'grid-column:1 / -1;margin-top:4px;padding:14px;border:1px solid #dbe4ff;border-radius:16px;background:linear-gradient(180deg,#f8faff 0%,#ffffff 100%);';

  const popupHead = document.createElement('div');
  popupHead.style.cssText = 'font:700 13px/1.4 Inter,system-ui,sans-serif;color:#4338ca;margin-bottom:10px;';
  popupHead.textContent = 'Popup form settings';
  popupCard.appendChild(popupHead);

  const popupGrid = document.createElement('div');
  popupGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px 14px;';
  popupCard.appendChild(popupGrid);

  function fieldWrap(labelText: string): { wrap: HTMLLabelElement; inputWrap: HTMLElement } {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:block;';
    const label = document.createElement('div');
    label.style.cssText = 'margin:0 0 6px;color:#334155;font:700 12px/1.3 Inter,system-ui,sans-serif;letter-spacing:.01em;';
    label.textContent = labelText;
    const inputWrap = document.createElement('div');
    wrap.appendChild(label);
    wrap.appendChild(inputWrap);
    return { wrap, inputWrap };
  }

  function makeSelect(options: Array<{ value: string; text: string }>, value: string): HTMLSelectElement {
    const el = document.createElement('select');
    el.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:600 13px/1.4 Inter,system-ui,sans-serif;outline:none;';
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.value === value) option.selected = true;
      el.appendChild(option);
    });
    return el;
  }

  function makeNumber(value: number, min: number, max?: number): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'number';
    el.min = String(min);
    if (typeof max === 'number') el.max = String(max);
    el.value = String(value);
    el.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:600 13px/1.4 Inter,system-ui,sans-serif;outline:none;';
    return el;
  }

  function makeText(value: string, placeholder: string): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'text';
    el.value = value;
    el.placeholder = placeholder;
    el.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:600 13px/1.4 Inter,system-ui,sans-serif;outline:none;';
    return el;
  }

  function makeToggle(text: string, checked: boolean): HTMLLabelElement {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#334155;font:600 13px/1.4 Inter,system-ui,sans-serif;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    row.appendChild(input);
    row.appendChild(document.createTextNode(text));
    return row;
  }

  const triggerField = fieldWrap('Trigger');
  const triggerSelect = makeSelect([
    { value: 'time_delay', text: 'Time delay' },
    { value: 'scroll_depth', text: 'Scroll depth' },
    { value: 'click_trigger', text: 'Click trigger' },
  ], displayCfg.popup.triggerType);
  triggerField.inputWrap.appendChild(triggerSelect);
  popupGrid.appendChild(triggerField.wrap);

  const borderInfo = document.createElement('div');
  borderInfo.style.cssText = 'grid-column:1 / -1;padding:10px 12px;border:1px dashed #c7d2fe;border-radius:12px;background:rgba(255,255,255,.75);color:#4338ca;font:600 12px/1.55 Inter,system-ui,sans-serif;';
  borderInfo.textContent = 'Popup shell is now always transparent. Visitors only see the form itself and the Close button.';
  popupGrid.appendChild(borderInfo);

  const delayField = fieldWrap('Time delay (seconds)');
  const delayInput = makeNumber(displayCfg.popup.delaySeconds, 0, 600);
  delayField.inputWrap.appendChild(delayInput);
  popupGrid.appendChild(delayField.wrap);

  const scrollField = fieldWrap('Scroll depth (%)');
  const scrollInput = makeNumber(displayCfg.popup.scrollPercent, 5, 95);
  scrollField.inputWrap.appendChild(scrollInput);
  popupGrid.appendChild(scrollField.wrap);

  const clickField = fieldWrap('Click selector');
  clickField.wrap.style.gridColumn = '1 / -1';
  const clickInput = makeText(displayCfg.popup.clickSelector, '.open-megaform-popup or #open-form');
  clickField.inputWrap.appendChild(clickInput);

  const clickSampleWrap = document.createElement('div');
  clickSampleWrap.style.cssText = 'margin-top:8px;';
  const clickSampleLabel = document.createElement('div');
  clickSampleLabel.style.cssText = 'margin:0 0 6px;color:#64748b;font:700 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.01em;text-transform:uppercase;';
  clickSampleLabel.textContent = 'Sample HTML trigger';
  const clickSample = document.createElement('textarea');
  clickSample.readOnly = true;
  clickSample.rows = 4;
  clickSample.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#0f172a;font:600 12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical;';
  const clickSampleActions = document.createElement('div');
  clickSampleActions.style.cssText = 'margin-top:8px;display:flex;justify-content:flex-end;';
  const clickSampleCopy = document.createElement('button');
  clickSampleCopy.type = 'button';
  clickSampleCopy.className = 'mf-host-admin-btn';
  clickSampleCopy.textContent = 'Copy HTML';
  clickSampleActions.appendChild(clickSampleCopy);
  clickSampleWrap.appendChild(clickSampleLabel);
  clickSampleWrap.appendChild(clickSample);
  clickSampleWrap.appendChild(clickSampleActions);
  clickField.inputWrap.appendChild(clickSampleWrap);
  popupGrid.appendChild(clickField.wrap);

  const startField = fieldWrap('Display window start');
  const startInput = document.createElement('input');
  startInput.type = 'datetime-local';
  startInput.value = String(displayCfg.popup.startAt || '');
  startInput.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:600 13px/1.4 Inter,system-ui,sans-serif;outline:none;';
  startField.inputWrap.appendChild(startInput);
  popupGrid.appendChild(startField.wrap);

  const endField = fieldWrap('Display window end');
  const endInput = document.createElement('input');
  endInput.type = 'datetime-local';
  endInput.value = String(displayCfg.popup.endAt || '');
  endInput.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;font:600 13px/1.4 Inter,system-ui,sans-serif;outline:none;';
  endField.inputWrap.appendChild(endInput);
  popupGrid.appendChild(endField.wrap);

  const onceToggle = makeToggle('Show only once per browser session', displayCfg.popup.showOncePerSession);
  const closeToggle = makeToggle('Allow closing by clicking outside the popup', displayCfg.popup.closeOnOverlay);
  popupGrid.appendChild(onceToggle);
  popupGrid.appendChild(closeToggle);

  const popupHelp = document.createElement('div');
  popupHelp.style.cssText = 'grid-column:1 / -1;color:#64748b;font:500 12px/1.55 Inter,system-ui,sans-serif;';
  popupHelp.textContent = 'Fixed form is the default. Popup form can open after a delay, by scroll depth, or when a matching button/link selector is clicked. Leave the display window blank to keep the popup always eligible.';
  popupGrid.appendChild(popupHelp);

  function updateClickSample(): void {
    const selector = String(clickInput.value || '').trim() || '.open-megaform-popup';
    const attrMatch = selector.match(/^\[([^\]=]+)(?:=([^\]]+))?\]$/);
    let sample = '';
    if (selector.startsWith('#')) {
      const id = selector.slice(1).replace(/[^a-zA-Z0-9_-]/g, '') || 'open-form';
      sample = `<button type="button" id="${id}">Open form popup</button>`;
    } else if (selector.startsWith('.')) {
      const cls = selector.slice(1).replace(/[^a-zA-Z0-9_-]/g, '-') || 'open-megaform-popup';
      sample = `<button type="button" class="${cls}">Open form popup</button>`;
    } else if (attrMatch) {
      const attrName = attrMatch[1] || 'data-megaform-trigger';
      const attrValue = String(attrMatch[2] || 'open').replace(/^["']|["']$/g, '') || 'open';
      sample = `<button type="button" ${attrName}="${attrValue}">Open form popup</button>`;
    } else {
      sample = `<button type="button" class="open-megaform-popup">Open form popup</button>`;
    }
    clickSample.value = sample;
  }

  clickInput.addEventListener('input', updateClickSample);
  clickSampleCopy.addEventListener('click', async () => {
    const previous = clickSampleCopy.textContent || 'Copy HTML';
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(clickSample.value);
      } else {
        clickSample.focus();
        clickSample.select();
        document.execCommand('copy');
      }
      clickSampleCopy.textContent = 'Copied';
      window.setTimeout(() => { clickSampleCopy.textContent = previous; }, 1200);
    } catch (_error) {
      clickSampleCopy.textContent = 'Copy failed';
      window.setTimeout(() => { clickSampleCopy.textContent = previous; }, 1600);
    }
  });

  function syncPopupVisibility(): void {
    popupCard.style.display = modeSelect.value === 'popup' ? '' : 'none';
    delayField.wrap.style.display = triggerSelect.value === 'time_delay' ? '' : 'none';
    scrollField.wrap.style.display = triggerSelect.value === 'scroll_depth' ? '' : 'none';
    clickField.wrap.style.display = triggerSelect.value === 'click_trigger' ? '' : 'none';
  }

  modeSelect.addEventListener('change', syncPopupVisibility);
  triggerSelect.addEventListener('change', syncPopupVisibility);
  updateClickSample();
  syncPopupVisibility();

  els.viewsGrid.appendChild(panel);
  els.viewsGrid.appendChild(popupCard);

  let saveSeq = 0;
  els.viewsSave.onclick = async () => {
    selectedFormId = Number.parseInt(select.value || '0', 10) || 0;
    if (!selectedFormId) {
      window.alert('Please choose a form first.');
      return;
    }
    const previous = els.viewsSave.textContent || 'Use selected form on this page';
    const saveId = ++saveSeq;
    els.viewsSave.disabled = true;
    els.viewsSave.textContent = 'Saving…';
    displayCfg = {
      displayMode: modeSelect.value === 'popup' ? 'popup' : 'fixed',
      popup: {
        triggerType: (triggerSelect.value as PopupTriggerType) || 'time_delay',
        delaySeconds: Math.max(0, Number.parseInt(delayInput.value || '0', 10) || 0),
        scrollPercent: Math.max(5, Math.min(95, Number.parseInt(scrollInput.value || '50', 10) || 50)),
        clickSelector: String(clickInput.value || '').trim(),
        borderMode: 'transparent_popup',
        showOncePerSession: !!(onceToggle.querySelector('input') as HTMLInputElement | null)?.checked,
        closeOnOverlay: !!(closeToggle.querySelector('input') as HTMLInputElement | null)?.checked,
        startAt: String(startInput.value || '').trim(),
        endAt: String(endInput.value || '').trim(),
      }
    };
    const moduleId = Number.parseInt(host.dataset.moduleId || '0', 10) || 0;
    const apiBase = (host.dataset.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/');
    const savedViewConfig = buildPopupDisplayConfigForSave(moduleConfig?.ViewConfigJson || moduleConfig?.viewConfigJson || '{}', displayCfg);
    const body = {
      moduleId,
      formId: selectedFormId,
      viewType: moduleConfig?.ViewType || moduleConfig?.viewType || 'submit',
      viewConfig: savedViewConfig,
      cssClass: moduleConfig?.CssClass || moduleConfig?.cssClass || '',
      cacheMinutes: moduleConfig?.CacheMinutes || moduleConfig?.cacheMinutes || 0,
      permissions: moduleConfig?.PermissionsJson || moduleConfig?.permissionsJson || ''
    };
    try {
      const res = await fetch(dnnHostUrlWithPortalId(apiBase + 'ModuleConfig/Save'), {
        method: 'POST',
        headers: dnnHeaders(moduleId),
        body: JSON.stringify(body),
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(await res.text());
      if (saveId !== saveSeq) return;
      navigateToViewsAfterSave(host, selectedFormId, savedViewConfig);
    } catch (error) {
      console.error('[MegaForm.DNN.Host] save module config failed', error);
      if (saveId !== saveSeq) return;
      els.viewsSave.disabled = false;
      els.viewsSave.textContent = previous;
      window.alert('Could not save module view configuration. See console for details.');
    }
  };
}

function cleanupStaleWorkflowChrome(): void {
  try {
    const cleanup = (window as any).MFWorkflowRF?.cleanupHostChrome;
    if (typeof cleanup === 'function') cleanup(true);
  } catch {}
  try {
    document.body.classList.remove('mf-dnn-workflow-open');
    document.documentElement.classList.remove('mf-dnn-workflow-open');
    document.querySelectorAll('style[id^="mf-wfrf-hide-style-"]').forEach((el) => el.parentNode?.removeChild(el));
    document.querySelectorAll<HTMLElement>('[data-mf-wfrf-hidden="1"]').forEach((el) => {
      const prev = el.getAttribute('data-mf-wfrf-prev-style');
      if (typeof prev === 'string' && prev.length) el.setAttribute('style', prev);
      else el.removeAttribute('style');
      el.removeAttribute('data-mf-wfrf-hidden');
      el.removeAttribute('data-mf-wfrf-prev-style');
    });
  } catch {}
}

function setLiveEditorTriggerVisible(visible: boolean): void {
  try {
    const trigger = document.getElementById('mf-le-trigger') as HTMLElement | null;
    const panel = document.getElementById('mf-le-panel') as HTMLElement | null;
    const overlay = document.getElementById('mf-le-overlay') as HTMLElement | null;
    if (trigger) trigger.style.display = visible ? '' : 'none';
    if (!visible) {
      panel?.classList.remove('open');
      panel?.setAttribute('aria-hidden', 'true');
      overlay?.classList.remove('open');
      trigger?.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
    }
  } catch {}
}

// [B200 2026-06-19] Lazy-load the builder bundle on first Builder-overlay open.
// FormView.ascx.cs no longer eager-loads bundles/megaform-builder.js (+ the workflow
// ReactFlow bundle) on the render page — that was ~1.2 MB (gz ~285 KB) downloaded on
// EVERY admin page view even when the builder was never opened. We inject them here
// the first time the admin actually opens the Builder overlay (hash #mf-builder /
// "Edit Form"). Sortable + megaform-widgets + schema-based plugins stay eager (small,
// already needed to render the public form), so the builder boots with the SAME plugin
// set as before — only the heavy bundle defers. The open('builder') init-retry loop
// below tolerates the bundle not being ready yet, so no extra wiring is required.
// Bump whenever the builder bundle's CONTENT changes: the URL is the cache key, so a stale
// stamp serves yesterday's bundle from the browser cache and the fix "does not work".
const BUILDER_LAZY_VERSION = '20260714-B237';
let _builderBundleRequested = false;
function ensureBuilderBundleLazyLoaded(assetsBase: string): void {
  if (_builderBundleRequested) return;
  // Already present (an older eager-loading ASCX is still deployed, or a prior open
  // injected it) — nothing to do; the existing init path takes over.
  if (typeof (window as any).MegaFormBuilder !== 'undefined') { _builderBundleRequested = true; return; }
  _builderBundleRequested = true;
  const base = (assetsBase || '/DesktopModules/MegaForm/Assets/').replace(/\/?$/, '/');
  const v = '?v=' + BUILDER_LAZY_VERSION;
  const inject = (src: string): void => {
    const bare = src.split('?')[0];
    const already = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
      .some((s) => s.src.split('?')[0].endsWith(bare));
    if (already) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // preserve insertion order across the two injected scripts
    document.head.appendChild(s);
  };
  // Workflow ReactFlow bundle (FLOW tab) — self-loads its React deps from js/builder/.
  inject(base + 'js/builder/megaform-workflow-reactflow.js' + v);
  // Main builder bundle — dom.ts registers window.MegaForm.initBuilder on load; the
  // open('builder') retry loop then boots it into #mf-builder-root.
  inject(base + 'js/bundles/megaform-builder.js' + v);
}

function init(): void {
  const host = document.getElementById('mf-dnn-host') as HTMLElement | null;
  cleanupStaleWorkflowChrome();
  if (!host) return;
  const els: HostElements = {
    host,
    dashboard: document.getElementById('mf-host-dashboard-overlay') as HTMLElement,
    views: document.getElementById('mf-host-views-overlay') as HTMLElement,
    builder: document.getElementById('mf-host-builder-overlay') as HTMLElement,
    submissions: document.getElementById('mf-host-submissions-overlay') as HTMLElement,
    theme: document.getElementById('mf-host-theme-overlay') as HTMLElement,
    languages: document.getElementById('mf-host-languages-overlay') as HTMLElement,
    myinbox: document.getElementById('mf-host-myinbox-overlay') as HTMLElement,
    viewsGrid: document.getElementById('mf-host-views-grid') as HTMLElement,
    viewsSave: document.getElementById('mf-host-views-save') as HTMLButtonElement,
  };
  const overlays: Record<HostMode, HTMLElement> = {
    dashboard: els.dashboard,
    views: els.views,
    builder: els.builder,
    submissions: els.submissions,
    theme: els.theme,
    languages: els.languages,
    myinbox: els.myinbox,
  };
  // Null-safe: a host overlay element may be absent if the deployed ASCX predates a
  // newly-added mode (e.g. myinbox). Skip missing overlays instead of throwing.
  Object.values(overlays).forEach((overlay) => { if (overlay && overlay.parentElement !== document.body) document.body.appendChild(overlay); });
  const chrome = createChromeHider();

  // ── [DnnSurfaceMode v20260714-02] Windowed ⇄ Fullscreen ────────────────────
  // Oqtane admin surfaces (.mf-oq-surface) ship a Windowed/Fullscreen toggle via
  // platform-host.installFullscreenToggle(). DNN has no .mf-oq-surface — its admin
  // surfaces are the #mf-host-*-overlay elements — so that toggle never mounted and
  // every DNN surface was hard-locked to fullscreen.
  //
  // v02: "windowed" means the surface renders as a NORMAL DNN MODULE — moved back
  // into the module pane (#mf-dnn-host's container), in page flow, with the DNN skin
  // (header, menu, footer) around it. Not a floating popup. Fullscreen re-parents it
  // to <body> as the position:fixed overlay it has always been. Persisted per browser,
  // like Oqtane's.
  const SURFACE_MODE_KEY = 'mf-dnn-surface-windowed';
  // The DNN module pane this module instance lives in — captured BEFORE the overlays
  // are hoisted to <body>, because that is where a windowed surface has to go back to.
  const moduleContainer: HTMLElement = (host.closest('.DnnModule') as HTMLElement) || (host.parentElement as HTMLElement) || document.body;
  let windowed = (() => { try { return localStorage.getItem(SURFACE_MODE_KEY) === '1'; } catch { return false; } })();
  let fsToggleBtn: HTMLButtonElement | null = null;

  const FS_MAX_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const FS_MIN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

  function openOverlayEl(): HTMLElement | null {
    return Object.values(overlays).find((o) => !!o && o.classList.contains('is-open')) || null;
  }

  function syncFsToggle(): void {
    if (!fsToggleBtn) return;
    const anyOpen = !!openOverlayEl();
    fsToggleBtn.style.display = anyOpen ? 'inline-flex' : 'none';
    fsToggleBtn.innerHTML = (windowed ? FS_MAX_SVG : FS_MIN_SVG)
      + '<span class="mf-fs-lbl">' + (windowed ? 'Fullscreen' : 'Windowed') + '</span>';
    fsToggleBtn.title = windowed ? 'Expand this panel to full screen' : 'Shrink this panel to a window (the DNN page stays visible)';
  }

  // Apply the current surface mode to an overlay.
  //   windowed   → the surface IS a DNN module: parented back into the module pane, in
  //                page flow, DNN chrome untouched (no display:none on the skin).
  //   fullscreen → hoisted to <body> as the position:fixed overlay, DNN chrome hidden.
  function applySurfaceMode(overlay: HTMLElement): void {
    overlay.classList.toggle('is-windowed', windowed);
    if (windowed) {
      chrome.restore();
      if (overlay.parentElement !== moduleContainer) moduleContainer.appendChild(overlay);
      document.body.classList.add('mf-dnn-windowed');
    } else {
      document.body.classList.remove('mf-dnn-windowed');
      if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
      chrome.hide(overlay);
    }
    syncFsToggle();
    try { window.dispatchEvent(new Event('resize')); } catch {}
  }

  function ensureFsToggle(): void {
    if (fsToggleBtn && document.body.contains(fsToggleBtn)) { syncFsToggle(); return; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mf-dnn-fs-toggle';
    btn.style.display = 'none';
    btn.addEventListener('click', () => {
      windowed = !windowed;
      try { localStorage.setItem(SURFACE_MODE_KEY, windowed ? '1' : '0'); } catch { /* no storage */ }
      const overlay = openOverlayEl();
      if (overlay) applySurfaceMode(overlay);
      else syncFsToggle();
    });
    document.body.appendChild(btn);
    fsToggleBtn = btn;
    syncFsToggle();
  }

  function closeAll(writeHash = true): void {
    Object.values(overlays).forEach((overlay) => {
      if (!overlay) return;
      overlay.classList.remove('is-open');
      overlay.classList.remove('is-windowed');
      // Park every surface back on <body> so a closed windowed surface leaves no
      // collapsed placeholder inside the DNN module pane.
      if (overlay.parentElement !== document.body) document.body.appendChild(overlay);
    });
    document.body.classList.remove('mf-dnn-windowed');
    // [OneSurfaceAtATime v20260714-01] Give the public form back — see open().
    document.documentElement.classList.remove('mf-admin-shell-route');
    document.body.classList.remove('mf-admin-shell-route');
    chrome.restore();
    setLiveEditorTriggerVisible(true);
    // A pinned-surface open must not touch the URL at all — not even to clear it (that would
    // strip query params the page was loaded with). Only an explicit close/navigation does.
    if (writeHash) setHash(null);
    syncFsToggle();
  }

  // [PinnedSurfaceNoHash v20260714-01] `writeHash` is false when the surface opens because the
  // MODULE IS PINNED to it (Module mode = Admin Dashboard / My Inbox). The module setting already
  // says what this page shows, so rewriting the URL to /Page#mf-dashboard is redundant state — and
  // wrong: it makes a pinned page look like an ad-hoc overlay route and leaves a hash the admin
  // never asked for. Hash routing stays for EXPLICIT navigation (dock buttons, dashboard nav,
  // deep links), which is what it is for.
  function open(mode: HostMode, forceNew = false, writeHash = true): void {
    cleanupStaleWorkflowChrome();
    // Resolve the overlay BEFORE tearing the current one down. Closing first and only
    // then discovering the target overlay is missing (e.g. an older deployed ASCX with
    // no My Inbox overlay) dumped the admin out of the dashboard back to the DNN page —
    // that "clicking My Inbox kicks me out" bug. Bail out with the current surface intact.
    const overlay = overlays[mode];
    if (!overlay) {
      console.warn('[MegaForm.DNN.Host] no overlay for mode', mode);
      return;
    }
    closeAll(writeHash);
    setLiveEditorTriggerVisible(false);
    // [OneSurfaceAtATime v20260714-01] A page shows EITHER the form OR a surface, never both.
    // The mf-admin-shell-route class (which hides .mf-form-wrapper / .mf-view-container, CSS in
    // FormView.ascx) was only ever set by the inline script AT PAGE LOAD, from the hash. Opening
    // a surface from the dock does not reload the page, so on a form-view module the dashboard
    // rendered UNDERNEATH the still-visible form — the stacked page the owner reported. Set the
    // class whenever a surface opens; closeAll() takes it back off.
    document.documentElement.classList.add('mf-admin-shell-route');
    document.body.classList.add('mf-admin-shell-route');
    overlay.classList.add('is-open');
    ensureFsToggle();
    applySurfaceMode(overlay);
    if (writeHash) setHash(mode, forceNew);
    if (mode === 'dashboard') bootDashboard(document.getElementById('mf-host-dashboard-root') as HTMLElement);
    if (mode === 'submissions') bootSubmissions(document.getElementById('mf-submissions-root') as HTMLElement);
    if (mode === 'myinbox') bootMyInbox(document.getElementById('mf-myinbox-root') as HTMLElement);
    if (mode === 'views') renderViews(host, els);
    if (mode === 'languages') bootLanguages(document.getElementById('mf-languages-root') as HTMLElement);
    if (mode === 'theme') {
      window.setTimeout(() => {
        try { window.dispatchEvent(new Event('resize')); } catch {}
      }, 0);
    }
    if (mode === 'builder') {
      // [B200] Pull in the heavy builder bundle now (deferred off the render page).
      ensureBuilderBundleLazyLoaded(host.dataset.assetsBase || '');
      const builderRoot = document.getElementById('mf-builder-root');
      if (builderRoot && forceNew) {
        // Force gallery / new-form mode: override server-rendered data-is-new
        builderRoot.dataset.isNew = 'true';
        builderRoot.dataset.formId = '0';
        // Reset booted flag so initBuilder re-runs with fresh state
        delete builderRoot.dataset.booted;
      }
      if (builderRoot && !builderRoot.dataset.booted) {
        // BUG FIX: panels.ts only sets window.initBuilder (bare global), NOT
        // window.MegaForm.initBuilder. dom.ts now exports window.MegaForm.initBuilder
        // as the canonical entry. Use a fallback chain to handle all cases:
        // 1. window.MegaForm.initBuilder  (new bridge in dom.ts)
        // 2. window.MFBuilderDom + MFBuilderGallery.init() (legacy path)
        const initFn = (window as any).MegaForm?.initBuilder
                    || (window as any).initBuilder;
        if (typeof initFn === 'function') {
          initFn(builderRoot);
          builderRoot.dataset.booted = '1';
        } else {
          // Bundle not yet loaded — wait and retry (happens on very first open).
          // [B200] Budget raised 20→80 (×150ms = up to 12s) because the builder
          // bundle is now lazy-injected on this first open instead of eager-loaded,
          // so on a cold/slow connection the ~285 KB gz download + parse may take a
          // little longer than the old "already cached" case.
          let attempts = 0;
          const tryInit = (): void => {
            const fn = (window as any).MegaForm?.initBuilder
                    || (window as any).initBuilder;
            if (typeof fn === 'function') {
              fn(builderRoot);
              builderRoot.dataset.booted = '1';
            } else if (++attempts < 80) {
              setTimeout(tryInit, 150);
            }
          };
          setTimeout(tryInit, 150);
        }
      }
    }
  }

  // [RendererHostRetired v20260714-01] Drop the localStorage ghost
  // (mf:dnn:<origin>:<portalId>:renderer-host). Without this, an admin whose browser still
  // holds the old value keeps getting View/Embed/QR links pointing at the dead host page,
  // and the removal looks like it did not work.
  try { clearStoredRendererHostUrl(); } catch { /* no storage */ }
  ensureViewsUx(host, els);

  host.querySelectorAll<HTMLElement>('[data-mf-open]').forEach((button) => {
    button.addEventListener('click', () => open(String(button.dataset.mfOpen || 'dashboard') as HostMode));
  });
  document.querySelectorAll<HTMLElement>('[data-mf-close]').forEach((button) => {
    button.addEventListener('click', closeAll);
  });
  // Null-safe (see overlays construction above): a host overlay element may be
  // absent when the deployed ASCX predates a newly-added mode (e.g. myinbox).
  // Without this guard, overlay.addEventListener throws on the missing element,
  // aborting init() before hashchange routing / __MF_PLATFORM__ / initial open
  // run — which breaks the whole dashboard host. Skip missing overlays instead.
  Object.values(overlays).forEach((overlay) => {
    if (!overlay) return;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeAll(); });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });

  window.addEventListener('hashchange', () => {
    const mode = currentModeFromHash();
    if (mode) open(mode, mode === 'builder' && isBuilderNewFromHash());
    else closeAll();
  });

  // BUG FIX: Use data-return-url as dnnBase (clean tab path) for hash routes.
  // See earlyBootstrap comment above for the full explanation.
  const dnnReturnUrl = host.dataset.returnUrl || window.location.pathname || '/';
  const dnnBase = dnnReturnUrl.split('?')[0].split('#')[0] || '/';
  // BUG FIX v20260405-18: builderUrl keeps configure=1 (full-page fullscreen builder).
  // All other overlay URLs use hash-only (no configure=1) so page reload stays in
  // overlay mode (ShowConfigPanel=false, dnn-host.js loaded, hash handler fires).
  const dnnBuilderUrl = dnnBase + '#mf-builder';
  const dnnDashboardUrl = dnnBase + '#mf-dashboard';
  // FORMID-FIX v20260412-01: include mfFormId in themeDesignerUrl so refresh at
  // #mf-theme?mfFormId=N reloads the correct form instead of formId=0.
  const dnnFormId = Number.parseInt(host.dataset.formId || '0', 10) || 0;
  const dnnThemeUrl = dnnFormId > 0
    ? dnnBase + '?mfFormId=' + dnnFormId + '#mf-theme'
    : dnnBase + '#mf-theme';

  console.log('[MegaForm.DNN.Host] ' + DNN_HOST_ROUTE_BADGE + ' → ' + dnnBuilderUrl);

  // normalize current platform URLs for DNN: no ctl=Edit, single-host shell only
  window.__MF_PLATFORM__ = {
    ...(window.__MF_PLATFORM__ || {}),
    platform: 'dnn',
    dashboardUrl: dnnDashboardUrl,
    builderUrl: dnnBuilderUrl,
    submissionsUrl: dnnBase + '#mf-submissions',
    myInboxUrl: dnnBase + '#mf-myinbox',
    settingsUrl: dnnBase + '#mf-views',
    themeDesignerUrl: dnnThemeUrl,
    languagesUrl: dnnBase + '#mf-languages',
    assetsBaseUrl: host.dataset.assetsBase || '/DesktopModules/MegaForm/Assets/',
    apiBase: host.dataset.apiBase || '/DesktopModules/MegaForm/API/',
    instanceId: Number.parseInt(host.dataset.moduleId || '0', 10) || 0,
    moduleId: Number.parseInt(host.dataset.moduleId || '0', 10) || 0,
    // BUG FIX: tabId and portalId were previously missing; required by ServicesFramework
    tabId: Number.parseInt(host.dataset.tabId || '0', 10) || 0,
    portalId: Number.parseInt(host.dataset.portalId || '0', 10) || 0,
    formId: Number.parseInt(host.dataset.formId || '0', 10) || 0,
    returnUrl: dnnBase,
    logoutUrl: dnnBase,
  };

  // [FormPreview v20260714-01] ?formid=N is the admin's "View live form" link. When it is
  // present the admin came here to SEE the form, so a pinned surface (Admin Dashboard /
  // My Inbox) must NOT auto-open its overlay on top of it. The server makes the same call
  // (it renders the form body instead of the surface), so the two must agree.
  const hasLiveFormRequest = (): boolean => {
    try { return (Number.parseInt(new URL(window.location.href).searchParams.get('formid') || new URL(window.location.href).searchParams.get('formId') || '0', 10) || 0) > 0; }
    catch { return false; }
  };

  const initial = currentModeFromHash();
  if (initial) open(initial, initial === 'builder' && isBuilderNewFromHash());
  else if (!hasLiveFormRequest()) {
    // A module pinned to a surface opens that surface on load — WITHOUT writing a hash. The
    // module setting is the source of truth for what this page shows; appending #mf-dashboard /
    // #mf-myinbox to a clean page URL is redundant and misleading. [Revert inline 2026-06-11]
    // admin_dashboard was the first; myinbox joins it ([DnnInboxMode v20260714-01]).
    const pinned = String(host.dataset.moduleMode || '').toLowerCase();
    if (String(host.dataset.adminDashboardMode || '').toLowerCase() === 'true' || pinned === 'admin_dashboard') open('dashboard', false, false);
    else if (pinned === 'myinbox') open('myinbox', false, false);
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}
