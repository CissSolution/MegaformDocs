// [SecFix 2026-07-04] Install the same-origin antiforgery header injector as a side effect.
// platform-host is imported by every admin bundle, so this guarantees Oqtane admin writes
// carry X-XSRF-TOKEN-HEADER once the controllers drop class-level [IgnoreAntiforgeryToken].
import './antiforgery';

export type HostRouteName =
  | 'dashboard'
  | 'builder'
  | 'submissions'
  | 'myinbox'
  | 'settings'
  | 'themeDesigner'
  | 'languages'
  | 'viewLogs'
  | 'logout';

const RENDERER_HOST_BADGE = 'RendererHost v20260407-01';
const DNN_ADMIN_SHELL_ROUTE_BADGE = 'DnnAdminShellRoute v20260407-02';
const DNN_HASH_ONLY_BUILDER_BADGE = 'DnnHashOnlyBuilder v20260407-01';
const HOSTED_EMBED_ROUTE_BADGE = 'HostedEmbedRoute v20260406-01';
if (typeof window !== 'undefined') {
  (window as any).__MF_RENDERER_HOST_BADGE__ = RENDERER_HOST_BADGE;
  (window as any).__MF_HOSTED_EMBED_ROUTE_BADGE__ = HOSTED_EMBED_ROUTE_BADGE;
  (window as any).__MF_DNN_ADMIN_SHELL_ROUTE_BADGE__ = DNN_ADMIN_SHELL_ROUTE_BADGE;
  (window as any).__MF_DNN_HASH_ONLY_BUILDER_BADGE__ = DNN_HASH_ONLY_BUILDER_BADGE;
}

export interface PlatformHostConfig {
  platform?: 'dnn' | 'oqtane' | 'standalone' | 'aspcore' | string;
  dashboardUrl?: string;
  builderUrl?: string;
  submissionsUrl?: string;
  myInboxUrl?: string;
  settingsUrl?: string;
  themeDesignerUrl?: string;
  languagesUrl?: string;
  viewLogsUrl?: string;
  logoutUrl?: string;
  assetsBaseUrl?: string;
  returnUrl?: string;
  apiBase?: string;
  portalId?: number;
  tabId?: number;
  moduleId?: number;
  instanceId?: number;
  formId?: number;
  rendererHostUrl?: string;
  rendererHostTabId?: number;
  rendererHostModuleId?: number;
}

declare global {
  interface Window {
    __MF_PLATFORM__?: PlatformHostConfig;
  }
}

function detectRoot(): HTMLElement | null {
  return (
    document.getElementById('mf-host-dashboard-root') ||
    document.getElementById('mf-dash-root') ||
    document.getElementById('mf-submissions-root') ||
    document.getElementById('mf-builder-root') ||
    document.getElementById('td-root') ||
    document.getElementById('mf-dnn-host') ||
    document.querySelector<HTMLElement>('[data-platform][data-api-base]') ||
    document.querySelector<HTMLElement>('[data-platform]')
  );
}

function asInt(value: string | undefined): number | undefined {
  const n = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function readRootConfig(): PlatformHostConfig {
  const root = detectRoot();
  const ds = root?.dataset;
  return {
    platform: ds?.platform,
    apiBase: ds?.apiBase,
    dashboardUrl: ds?.dashboardUrl,
    builderUrl: ds?.builderUrl,
    submissionsUrl: ds?.submissionsUrl,
    myInboxUrl: ds?.myinboxUrl,
    settingsUrl: ds?.settingsUrl,
    themeDesignerUrl: ds?.themeDesignerUrl,
    languagesUrl: ds?.languagesUrl,
    viewLogsUrl: ds?.viewLogsUrl,
    logoutUrl: ds?.logoutUrl,
    assetsBaseUrl: ds?.assetsBase,
    returnUrl: ds?.returnUrl,
    portalId: asInt(ds?.portalId),
    tabId: asInt(ds?.tabId),
    moduleId: asInt(ds?.moduleId),
    instanceId: asInt(ds?.instanceId) || asInt(ds?.moduleId),
    formId: asInt(ds?.formId),
    rendererHostUrl: ds?.rendererHostUrl,
    rendererHostTabId: asInt(ds?.rendererHostTabId),
    rendererHostModuleId: asInt(ds?.rendererHostModuleId),
  };
}

export function getPlatformHostConfig(): PlatformHostConfig {
  const globalCfg = (window.__MF_PLATFORM__ || {}) as PlatformHostConfig;
  const rootCfg = readRootConfig();
  return {
    ...rootCfg,
    ...globalCfg,
    platform: globalCfg.platform || rootCfg.platform || 'aspcore',
    apiBase: globalCfg.apiBase || rootCfg.apiBase,
    portalId: globalCfg.portalId || rootCfg.portalId,
    tabId: globalCfg.tabId || rootCfg.tabId,
    instanceId: globalCfg.instanceId || rootCfg.instanceId,
    moduleId: globalCfg.moduleId || rootCfg.moduleId,
    formId: globalCfg.formId || rootCfg.formId,
    rendererHostUrl: globalCfg.rendererHostUrl || rootCfg.rendererHostUrl,
    rendererHostTabId: globalCfg.rendererHostTabId || rootCfg.rendererHostTabId,
    rendererHostModuleId: globalCfg.rendererHostModuleId || rootCfg.rendererHostModuleId,
  };
}

/**
 * Platform-aware API base resolver. Returns the correct MegaForm API base URL
 * for the current host environment without a trailing slash.
 *
 * Resolution order:
 *   1. window.__MF_API_BASE__ explicit override (set by server-side host page)
 *   2. window.__MF_PLATFORM__.apiBase (or root [data-api-base])
 *   3. window.__MF_PLATFORM__.platform === 'oqtane' or 'dnn'
 *   4. Auto-detect window.Oqtane / window.__OQTANE__ / [data-mf-platform=oqtane]
 *   5. Default: DNN
 */
export function getApiBase(): string {
  if (typeof window === 'undefined') return '/api/MegaForm';
  // Explicit override
  const override = (window as any).__MF_API_BASE__;
  if (override) return String(override).replace(/\/$/, '');
  // Configured apiBase wins
  const cfg = getPlatformHostConfig();
  if (cfg.apiBase) return String(cfg.apiBase).replace(/\/$/, '');
  // Platform string drives default
  const platform = String(cfg.platform || '').toLowerCase();
  if (platform === 'oqtane') return '/api/MegaForm';
  if (platform === 'dnn') return '/DesktopModules/MegaForm/API';
  // Auto-detect Oqtane
  if ((window as any).Oqtane || (window as any).__OQTANE__) return '/api/MegaForm';
  if (document.querySelector('[data-mf-platform="oqtane"]')) return '/api/MegaForm';
  // Default: DNN (preserves prior behavior)
  return '/DesktopModules/MegaForm/API';
}

/**
 * Build a fully-qualified MegaForm API URL by joining the resolved API base
 * with the supplied controller/action path. Leading slash on `path` is stripped
 * so callers can use either form (e.g. 'AiAssistant/DefaultConfig' or
 * '/AiAssistant/DefaultConfig').
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  const p = String(path || '').replace(/^\//, '');
  return base + '/' + p;
}

function addQuery(url: string, params: Record<string, string | number | undefined | null>): string {
  const base = new URL(url, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    base.searchParams.set(key, String(value));
  });
  return base.pathname + (base.search || '') + (base.hash || '');
}

function getCurrentBasePath(platform: string): string {
  const pathname = window.location.pathname || '/';
  if (platform === 'oqtane') {
    // Strip Oqtane control segment so sibling controls (Builder, Submissions, Dashboard, Settings)
    // can be reached by appending the new control name. Without 'dashboard' here, navigating
    // away from /Dashboard URL would produce /Dashboard/builder (concatenated, broken).
    return pathname.replace(/\/(builder|submissions|settings|dashboard)\/?$/i, '') || '/';
  }
  return pathname;
}

function buildDnnHashRoute(basePath: string, mode: string, formId?: number, forceNew = false): string {
  const normalizedMode = String(mode || '').toLowerCase();
  // DNN hash-overlay routes (dashboard / submissions / theme / views) must stay
  // on the clean tab page without ?configure=1. configure=1 switches server-side
  // FormView into the fullscreen config/builder path, which makes #mf-submissions
  // land on the wrong shell. Only fullscreen builder keeps configure=1.
  // IMPORTANT v20260406-01: overlay routes must not use ?formId= because server-side
  // DNN treats that as live render mode. Use ?mfFormId= for admin shell selection.
  const isNewBuilder = normalizedMode === 'builder' && (!formId || forceNew);
  const useShellFormParam = !!formId && normalizedMode !== 'dashboard' && normalizedMode !== 'views' && normalizedMode !== 'languages';
  const url = new URL(basePath || '/', window.location.origin);
  ['configure', 'formId', 'formid', 'mfFormId', 'new'].forEach((key) => url.searchParams.delete(key));
  if (useShellFormParam && formId) url.searchParams.set('mfFormId', String(formId));
  if (isNewBuilder) url.searchParams.set('new', '1');
  const route = url.pathname + (url.search || '');
  if (mode === 'builder' && isNewBuilder) return route + '#mf-builder-new';
  return route + `#mf-${mode}`;
}

function inferAssetsBase(platform: string, apiBase: string | undefined): string {
  if (platform === 'dnn') return '/DesktopModules/MegaForm/Assets/';
  if (platform === 'oqtane') return '/Modules/MegaForm/';
  if (apiBase && /\/DesktopModules\/MegaForm\/API\/?$/i.test(apiBase)) return '/DesktopModules/MegaForm/Assets/';
  if (apiBase && /\/api\/MegaForm\/?$/i.test(apiBase)) return '/megaform/';
  return '/megaform/';
}

function getRendererHostStorageKey(): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  const portalId = cfg.portalId || 0;
  return `mf:${platform}:${window.location.origin}:${portalId}:renderer-host`;
}

function toRelativeOrAbsolute(url: URL): string {
  return url.origin === window.location.origin
    ? url.pathname + (url.search || '') + (url.hash || '')
    : url.toString();
}

export function normalizeRendererHostUrl(urlLike?: string | null): string {
  const raw = String(urlLike || window.location.pathname || '/').trim();
  try {
    const url = new URL(raw, window.location.origin);
    ['formId', 'formid', 'mfFormId', 'embed', 'configure', 'new'].forEach((key) => url.searchParams.delete(key));
    if ((url.hash || '').toLowerCase().startsWith('#mf-')) url.hash = '';
    return toRelativeOrAbsolute(url);
  } catch (_error) {
    return window.location.pathname || '/';
  }
}

export function buildHostedFormUrl(baseUrl: string, formId: number, embed = false, theme?: string): string {
  try {
    const url = new URL(normalizeRendererHostUrl(baseUrl), window.location.origin);
    ['formId', 'formid', 'mfFormId', 'embed', 'configure', 'new', 'embedSource', 'theme'].forEach((key) => url.searchParams.delete(key));
    if (formId > 0) url.searchParams.set('formid', String(formId));
    if (embed) {
      url.searchParams.set('embed', '1');
      url.searchParams.set('mfchromeless', '1');
      void HOSTED_EMBED_ROUTE_BADGE;
    }
    if (theme && String(theme).trim()) url.searchParams.set('theme', String(theme).trim());
    url.hash = '';
    return toRelativeOrAbsolute(url);
  } catch (_error) {
    return normalizeRendererHostUrl(baseUrl);
  }
}

export function getStoredRendererHostUrl(): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  if (platform !== 'dnn' && platform !== 'oqtane') return '';
  const configured = String(cfg.rendererHostUrl || '').trim();
  if (configured) return normalizeRendererHostUrl(configured);
  try {
    const raw = window.localStorage.getItem(getRendererHostStorageKey()) || '';
    return raw ? normalizeRendererHostUrl(raw) : '';
  } catch (_error) {
    return '';
  }
}

export function setStoredRendererHostUrl(urlLike?: string | null): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  if (platform !== 'dnn' && platform !== 'oqtane') return '';
  const normalized = urlLike ? normalizeRendererHostUrl(urlLike) : '';
  const nextCfg = { ...(window.__MF_PLATFORM__ || {}), rendererHostUrl: normalized || undefined } as PlatformHostConfig;
  window.__MF_PLATFORM__ = nextCfg;
  const root = detectRoot();
  if (root) {
    if (normalized) root.dataset.rendererHostUrl = normalized;
    else delete root.dataset.rendererHostUrl;
  }
  try {
    if (normalized) window.localStorage.setItem(getRendererHostStorageKey(), normalized);
    else window.localStorage.removeItem(getRendererHostStorageKey());
  } catch (_error) { /* ignore */ }
  return normalized;
}

export function clearStoredRendererHostUrl(): void {
  setStoredRendererHostUrl('');
}

export function hasStoredRendererHostUrl(): boolean {
  return !!getStoredRendererHostUrl();
}

export function getPlatformRoute(name: HostRouteName, formId?: number): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  const apiBase = cfg.apiBase;
  const currentBase = getCurrentBasePath(platform);

  const directMap: Record<HostRouteName, string | undefined> = {
    dashboard: cfg.dashboardUrl,
    builder: cfg.builderUrl,
    submissions: cfg.submissionsUrl,
    myinbox: cfg.myInboxUrl,
    settings: cfg.settingsUrl,
    themeDesigner: cfg.themeDesignerUrl,
    languages: cfg.languagesUrl,
    viewLogs: cfg.viewLogsUrl,
    logout: cfg.logoutUrl,
  };
  const direct = directMap[name];
  if (direct) {
    const isDnnHashRoute = platform === 'dnn' && direct.includes('#mf-');
    if (isDnnHashRoute) {
      const [pathPart, hashPart] = direct.split('#', 2);
      const mode = String(hashPart || '').replace(/^mf-/, '');
      const dnnMode = mode === 'theme' ? 'theme' : mode;
      if (name === 'builder' || name === 'submissions' || name === 'themeDesigner' || name === 'languages') {
        return buildDnnHashRoute(pathPart || currentBase, dnnMode, formId);
      }
      return (pathPart || currentBase) + (hashPart ? `#${hashPart}` : '');
    }
    if ((name === 'builder' || name === 'submissions' || name === 'themeDesigner') && formId) {
      return addQuery(direct, { formId });
    }
    return direct;
  }

  if (platform === 'dnn') {
    switch (name) {
      case 'dashboard':
        return buildDnnHashRoute(currentBase, 'dashboard');
      case 'builder':
        return buildDnnHashRoute(currentBase, 'builder', formId);
      case 'submissions':
        return buildDnnHashRoute(currentBase, 'submissions', formId);
      case 'myinbox':
        // [DNN MyInbox 2026-06-11] hash route handled by dnn-host overlay (#mf-myinbox).
        // Previously fell through to the aspcore default '/admin/myinbox' (a dead link).
        return currentBase + '#mf-myinbox';
      case 'settings':
        return currentBase + '#mf-views';
      case 'themeDesigner':
        return buildDnnHashRoute(currentBase, 'theme', formId);
      case 'languages':
        return currentBase + '#mf-languages';
      case 'viewLogs':
        return currentBase + '#mf-dashboard';
      case 'logout':
        return currentBase;
    }
  }

  if (platform === 'oqtane') {
    switch (name) {
      case 'dashboard':
        return currentBase;
      case 'builder':
        return addQuery(`${currentBase}/builder`, { formId });
      case 'submissions':
        return addQuery(`${currentBase}/submissions`, { formId });
      case 'myinbox':
        return `${currentBase}?mfpanel=myinbox`;
      case 'settings':
        return `${currentBase}/settings`;
      case 'themeDesigner':
        return addQuery(`${currentBase}/builder`, { formId, mode: 'theme' });
      case 'languages':
        return `${currentBase}?mfpanel=languages`;
      case 'viewLogs':
        return currentBase;
      case 'logout':
        return currentBase;
    }
  }

  if (platform === 'umbraco') {
    switch (name) {
      case 'dashboard':
        return '/umbraco/MegaForm/Admin';
      case 'builder':
        return formId ? `/umbraco/MegaForm/Builder/${formId}` : '/umbraco/MegaForm/Builder';
      case 'submissions':
        return formId ? `/umbraco/MegaForm/Submissions?formId=${formId}` : '/umbraco/MegaForm/Submissions';
      case 'myinbox':
        return '/umbraco/MegaForm/Admin';
      case 'settings':
        return '/umbraco/MegaForm/Admin#settings';
      case 'themeDesigner':
        return formId ? `/umbraco/MegaForm/Builder/${formId}?mode=theme` : '/umbraco/MegaForm/Builder';
      case 'languages':
        return '/umbraco/MegaForm/Languages';
      case 'viewLogs':
        return '/umbraco/MegaForm/Admin';
      case 'logout':
        return '/umbraco';
    }
  }

  switch (name) {
    case 'dashboard':
      return '/admin';
    case 'builder':
      return formId ? `/admin/builder?formId=${formId}` : '/admin/builder';
    case 'submissions':
      return formId ? `/admin/submissions?formId=${formId}` : '/admin/submissions';
    case 'myinbox':
      return '/admin/myinbox';
    case 'settings':
      return '/setup/reset';
    case 'themeDesigner':
      return formId ? `/admin/theme-designer?formId=${formId}` : '/admin/theme-designer';
    case 'languages':
      return '/admin/languages';
    case 'viewLogs':
      return '/admin/viewlogs';
    case 'logout':
      return '/admin/logout?returnUrl=%2Fadmin%2Flogin';
  }
}

export function getAssetsBaseUrl(): string {
  const cfg = getPlatformHostConfig();
  return cfg.assetsBaseUrl || inferAssetsBase(String(cfg.platform || '').toLowerCase(), cfg.apiBase);
}

export function resolveAssetUrl(relativePath: string): string {
  const base = getAssetsBaseUrl().replace(/\/?$/, '/');
  return base + relativePath.replace(/^\//, '');
}

export function getReturnUrl(defaultUrl = '/admin'): string {
  const cfg = getPlatformHostConfig();
  return cfg.returnUrl || getPlatformRoute('dashboard') || defaultUrl;
}

// ── Oqtane panel-nav full-load guard ──────────────────────────────────────────
// [NavFix 2026-06-12] On Oqtane (Blazor Server), clicking a MegaForm sidebar/
// breadcrumb link does a CLIENT-SIDE navigation: the URL changes + Index.razor
// re-renders an empty mount div (#mf-myinbox-root / #mf-languages-root / …), but
// the self-mounting panel bundle ran only once on the initial full load, so it
// never re-mounts → blank page. A manual refresh (full load) boots the bundle, so
// it "works on refresh". Fix: intercept clicks on MegaForm nav links and force a
// real navigation so the target panel's bundle always boots fresh. Scoped to
// MegaForm nav containers + Oqtane only; pure in-page hashes and modified/aux
// clicks are left alone. One document-level capture listener, installed once.
const PANEL_NAV_SELECTOR = '.mf-sidebar a[href], .mf-hd a[href], a.mf-sb-lk, a.mf-bc-link, a.mf-flow-link';

function onPanelNavClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const cfg = getPlatformHostConfig();
  if (String(cfg.platform || '').toLowerCase() !== 'oqtane') return;
  const target = e.target as HTMLElement | null;
  const a = target && typeof target.closest === 'function'
    ? (target.closest(PANEL_NAV_SELECTOR) as HTMLAnchorElement | null)
    : null;
  if (!a) return;
  const href = a.getAttribute('href') || '';
  if (!href || href.charAt(0) === '#') return;          // pure in-page anchor → leave it
  if (a.target && a.target !== '_self') return;          // opens elsewhere → leave it
  let url: URL;
  try { url = new URL(href, window.location.href); } catch { return; }
  if (url.origin !== window.location.origin) return;     // external → leave it
  // Force a full navigation so the destination panel's JS bundle re-initialises.
  e.preventDefault();
  e.stopPropagation();
  try { window.location.assign(url.href); } catch { window.location.href = url.href; }
}

export function installPanelNavGuard(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as any).__mfPanelNavGuard) return;
  (window as any).__mfPanelNavGuard = true;
  document.addEventListener('click', onPanelNavClick, true);
}

// Auto-install: every admin bundle imports this module, and the guard is a no-op
// off-Oqtane / outside MegaForm nav, so a single install here covers all surfaces.
installPanelNavGuard();

// ── Fullscreen toggle for inline admin surfaces ───────────────────────────────
// [Inline default 2026-06-12] All MegaForm panel surfaces render INLINE (embedded in
// the module pane) by default. This injects a "Fullscreen" toggle into the surface so
// the user can zoom any surface to a full-screen overlay (is-inline ⇄ is-fs) and back,
// with the choice persisted across navigations. Injected into the surface's header
// actions (.mf-hd-ac) when present (dashboard/submissions/languages); floated top-right
// otherwise (builder/my-inbox/portal). One install per page, guarded.
const FS_MAX_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const FS_MIN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';

// [2026-06-13] Windowed (is-inline) surfaces render inside the host module pane, BELOW the
// host's fixed/sticky top navbar. Two problems: (a) the SPA's focus-on-navigate scrolls the
// surface to the viewport top — i.e. UNDER the fixed navbar — so the builder topbar / surface
// header "disappears"; (b) any later anchor/focus scroll lands under the navbar too.
// Fix host-agnostically: measure the host fixed/sticky header and (1) set scroll-padding-top on
// the scroll root so ALL future scroll-into-view leaves a gap below it, and (2) one-shot correct
// the scroll that already happened on boot if the surface top is currently occluded.
function hostFixedHeaderBottom(): number {
  let bottom = 0;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const cands = document.querySelectorAll<HTMLElement>(
    'header, nav, .navbar, [class*="navbar"], [class*="header"], [class*="topbar"]');
  cands.forEach((el) => {
    if (el.closest('.mf-oq-surface')) return; // skip MegaForm's own chrome
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    const r = el.getBoundingClientRect();
    // a top-anchored, full-width-ish, reasonably-short bar
    if (r.top <= 1 && r.height > 0 && r.height < 240 && r.width > vw * 0.5) {
      bottom = Math.max(bottom, r.bottom);
    }
  });
  return Math.round(bottom);
}

function clearHostFixedHeaderForInline(): void {
  const surface = document.querySelector('.mf-oq-surface.is-inline') as HTMLElement | null;
  if (!surface) return;
  const navB = hostFixedHeaderBottom();
  if (navB <= 0) return;
  // (1) future scroll-into-view (focus, anchors) clears the host navbar
  try { document.documentElement.style.scrollPaddingTop = (navB + 8) + 'px'; } catch { /* */ }
  // (2) correct the boot scroll that buries the surface top under the host navbar. The SPA's
  // focus-on-navigate scroll fires at an UNPREDICTABLE time after mount AND can REPEAT (re-render
  // re-focus), so a one-shot correction gets overridden by a later framework scroll. Instead,
  // listen to scroll events for a bounded boot window and re-assert the correction each time the
  // surface top is found occluded while still near the page top. The correction itself lifts the
  // surface to top≈navB+8 (no longer occluded), so the guard stops it from looping on its own
  // scroll event — it only re-fires when the framework buries it again.
  if ((window as any).__mfInlineScrollWatch) return;
  (window as any).__mfInlineScrollWatch = true;
  const correct = (): void => {
    const surf = document.querySelector('.mf-oq-surface.is-inline') as HTMLElement | null;
    const nb = hostFixedHeaderBottom();
    if (!surf || nb <= 0) return;
    try { document.documentElement.style.scrollPaddingTop = (nb + 8) + 'px'; } catch { /* */ }
    const top = surf.getBoundingClientRect().top;
    // only while near the top (boot state) — never yank a user who has scrolled into content
    if (top < nb - 1 && window.scrollY < nb + 220) {
      try { window.scrollBy({ top: top - nb - 8, left: 0, behavior: 'auto' }); } catch { /* */ }
      (window as any).__mfInlineScrollFixed = true;
    }
  };
  correct();
  const onScroll = (): void => correct();
  window.addEventListener('scroll', onScroll, { passive: true });
  // also nudge a few times in case the burying scroll happens with no further scroll event we hear
  [120, 300, 600, 1200, 2000].forEach((d) => setTimeout(correct, d));
  // tear the listener down after the boot window so the user can scroll freely afterwards
  setTimeout(() => window.removeEventListener('scroll', onScroll), 4000);
}

export function installFullscreenToggle(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as any).__mfFsToggle) return;
  (window as any).__mfFsToggle = true;
  const KEY = 'mf-surface-fs';
  const getSurface = (): HTMLElement | null => document.querySelector('.mf-oq-surface');
  const isFs = (): boolean => { const s = getSurface(); return !!(s && s.classList.contains('is-fs')); };
  // [P2/P1-7] Isolate the fullscreen builder from host-page DOM. Walk from the
  // surface up to <body> and mark every SIBLING off the ancestor path `inert`
  // (+ aria-hidden) so Oqtane/host-skin controls (control panel, nav, AcmeMega
  // utility bar) drop out of the tab order AND the accessibility/automation tree
  // and stop receiving interaction — without removing them from the DOM (so the
  // host SPA keeps working). Reversible: restore exactly what we touched on exit.
  const inertHostBackground = (surface: HTMLElement): void => {
    try {
      const touched: HTMLElement[] = [];
      let node: HTMLElement | null = surface;
      while (node && node !== document.body && node.parentElement) {
        const parent = node.parentElement;
        const kids = Array.prototype.slice.call(parent.children) as HTMLElement[];
        for (const sib of kids) {
          if (sib === node) continue;
          if (sib.hasAttribute('data-mf-overlay')) continue; // keep MegaForm's own overlays alive
          const tag = sib.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE' || tag === 'NOSCRIPT') continue;
          if (sib.getAttribute('data-mf-inerted') === '1') continue;
          // NEVER inert MegaForm's own body-level chrome (the fullscreen toggle, the
          // builder container, template-preview modals, toasts) — only host-page
          // elements. Inerting our own toggle would trap the user in fullscreen.
          const idCls = ((sib.id || '') + ' ' + (typeof sib.className === 'string' ? sib.className : '')).toLowerCase();
          if (idCls.indexOf('megaform') !== -1 || idCls.indexOf('mf-') !== -1 || idCls.indexOf('tpl-') !== -1) continue;
          try { (sib as unknown as { inert: boolean }).inert = true; } catch { /* older engine */ }
          sib.setAttribute('inert', '');
          sib.setAttribute('aria-hidden', 'true');
          sib.setAttribute('data-mf-inerted', '1');
          touched.push(sib);
        }
        node = parent;
      }
      (window as unknown as { __mfInertedHost?: HTMLElement[] }).__mfInertedHost = touched;
    } catch { /* defensive */ }
  };
  const restoreHostBackground = (): void => {
    try {
      const tracked = (window as unknown as { __mfInertedHost?: HTMLElement[] }).__mfInertedHost;
      const list: HTMLElement[] = (tracked && tracked.length)
        ? tracked
        : (Array.prototype.slice.call(document.querySelectorAll('[data-mf-inerted="1"]')) as HTMLElement[]);
      for (const el of list) {
        try { (el as unknown as { inert: boolean }).inert = false; } catch { /* */ }
        el.removeAttribute('inert');
        el.removeAttribute('aria-hidden');
        el.removeAttribute('data-mf-inerted');
      }
      (window as unknown as { __mfInertedHost?: HTMLElement[] }).__mfInertedHost = [];
    } catch { /* defensive */ }
  };
  const apply = (toFs: boolean): void => {
    const s = getSurface();
    if (!s) return;
    s.classList.toggle('is-fs', toFs);
    s.classList.toggle('is-inline', !toFs);
    if (toFs) inertHostBackground(s); else restoreHostBackground();
  };
  // Detect Oqtane page EDIT mode (admin is arranging modules) — the user wants the mode toast
  // to be especially obvious then. `?edit=true` is the reliable client signal; the control
  // panel DOM is a fallback.
  const inEditMode = (): boolean => {
    try {
      if (new URLSearchParams(location.search).get('edit') === 'true') return true;
    } catch { /* */ }
    return !!document.querySelector('#ControlPanel, .mt-controlpanel, .app-controlpanel, [class*="control-panel"]');
  };
  const build = (): HTMLButtonElement => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mf-fs-toggle mf-fs-floating';
    const sync = (): void => {
      btn.innerHTML = (isFs() ? FS_MIN_SVG : FS_MAX_SVG) + '<span class="mf-fs-lbl">' + (isFs() ? 'Windowed' : 'Fullscreen') + '</span>';
      btn.title = isFs() ? 'Exit full screen' : 'Full screen';
    };
    btn.addEventListener('click', () => {
      const toFs = !isFs();
      apply(toFs);
      try { localStorage.setItem(KEY, toFs ? '1' : '0'); } catch { /* no storage */ }
      sync();
      try { window.dispatchEvent(new Event('resize')); } catch { /* relayout inner apps */ }
    });
    sync();
    return btn;
  };
  // [Viewport toast 2026-06-13] The mode toggle is mounted ONCE on <body> as a viewport-FIXED
  // toast (NOT inside the surface). Why: a surface is `position:relative; isolation:isolate`, so a
  // toggle appended inside it (a) scrolls out of view when the surface sits below the fold / the
  // user scrolls, and (b) lives in the surface's stacking context, so the host fixed-top navbar
  // paints over it. A body-level fixed toast escapes both — it is ALWAYS visible so an admin can
  // always switch working mode (windowed⇄fullscreen), which is the whole point in EDIT mode where
  // the surface can be far down the page. It reads `.mf-oq-surface` fresh on every click so it
  // survives surface re-renders (the dashboard does root.innerHTML='').
  const ensure = (): void => {
    const surface = getSurface();
    const existing = document.querySelector('body > .mf-fs-toggle') as HTMLButtonElement | null;
    if (!surface) {
      // navigated to a page with no MegaForm surface — remove the stale toast
      if (existing) existing.remove();
      document.documentElement.classList.remove('mf-host-editmode');
      return;
    }
    // Apply the persisted fullscreen preference as soon as the surface exists (idempotent).
    try { if (localStorage.getItem(KEY) === '1' && !surface.classList.contains('is-fs')) apply(true); } catch { /* */ }
    // Keep the windowed surface header clear of the host's fixed navbar (set scroll-padding
    // early so the SPA's focus-on-navigate scroll stops below it instead of burying it).
    clearHostFixedHeaderForInline();
    document.documentElement.classList.toggle('mf-host-editmode', inEditMode());
    // NOTE: do NOT call sync() here. ensure() runs on every body mutation (the observer), and
    // sync() rewrites btn.innerHTML — which is itself a (subtree) mutation that would re-trigger
    // ensure() → infinite loop. The toast lives on <body> so it survives surface re-renders; its
    // label only needs updating on click (handled in build()).
    if (existing) return;
    document.body.appendChild(build());
  };
  ensure();
  // The boot focus-scroll can land AFTER the surface first mounts — re-run the header-clear a
  // few times so the one-shot correction catches it. (Idempotent + guarded by __mfInlineScrollFixed.)
  [200, 500, 1000, 1800].forEach((d) => setTimeout(clearHostFixedHeaderForInline, d));
  // [Resilient 2026-06-12] A surface re-render (the dashboard does root.innerHTML='') WIPES the
  // floating toggle. The old one-shot placement (disconnect-on-success + a 5s timeout) then left
  // the button missing until a full page refresh — "sometimes not there, refresh shows it".
  // Keep a PERSISTENT observer that re-adds the toggle whenever a surface lacks it. ensure() is
  // cheap + idempotent (a querySelector guard early-returns once the button is present), so the
  // re-add only fires on the brief window after a re-render.
  const obs = new MutationObserver(() => ensure());
  try { obs.observe(document.body, { childList: true, subtree: true }); } catch { /* */ }
}
installFullscreenToggle();

const MINIMAL_EMBED_HOST_BADGE = 'MinimalEmbedHost v20260406-01';
if (typeof window !== 'undefined') (window as any).__MF_MINIMAL_EMBED_HOST_BADGE__ = MINIMAL_EMBED_HOST_BADGE;

const EMBED_CORE_CSS = [
  'css/megaform.css',
  'css/megaform-widgets.css',
  'css/megaform-themes.css',
  'css/plugins/megaform-widgets-builtin.css',
];

const EMBED_PLUGIN_CSS = [
  'css/plugins/megaform-widget-signature.css',
  'css/plugins/megaform-widget-rich-text.css',
  // [2026-06-15] megaform-widget-infinite-list.css removed — InfiniteList retired.
  'css/plugins/megaform-widget-data-repeater.css',
  'css/plugins/megaform-widget-golf-scorecard.css',
  'css/plugins/megaform-widget-paypal.css',
  'css/plugins/megaform-widget-phone-pro.css',
  // [2026-06-15] megaform-widget-repeater.css removed — Repeater (Repeating List) retired; use Grid Repeater.
  'css/plugins/megaform-widget-draw-on-image.css',
  'css/plugins/megaform-widget-video-embed.css',
  'css/plugins/megaform-widget-rating-suite.css',
  'css/plugins/megaform-widget-dynamic-label.css',
  'css/plugins/megaform-widget-payment.css',
  'css/plugins/megaform-widget-grid-repeater.css',
  'css/plugins/megaform-widget-stripe.css',
  'css/plugins/megaform-widget-advanced-file.css',
  'css/plugins/megaform-widget-calculator.css',
];

const EMBED_CORE_JS = [
  'js/megaform-i18n.js',
  'js/megaform-widgets.js',
  'js/megaform-rule-engine.js',
  'js/megaform-renderer.js',
];

const EMBED_PLUGIN_JS = [
  'js/plugins/types.js',
  'js/plugins/megaform-widget-appointment.js',
  'js/plugins/megaform-widget-advanced-file.js',
  'js/plugins/megaform-widget-calculator.js',
  'js/plugins/megaform-widget-captcha.js',
  'js/plugins/megaform-widget-draw-on-image.js',
  'js/plugins/megaform-widget-geolocation.js',
  'js/plugins/megaform-widget-grid-repeater.js',
  'js/plugins/megaform-widget-image-choice.js',
  // [2026-06-15] megaform-widget-infinite-list.js removed — InfiniteList retired.
  'js/plugins/megaform-widget-payment-unified.js',
  'js/plugins/megaform-widget-paypal.js',
  'js/plugins/megaform-widget-phone-pro.js',
  'js/plugins/megaform-widget-content-slider.js',
  'js/plugins/megaform-widget-qrcode.js',
  'js/plugins/megaform-widget-data-repeater.js',
  'js/plugins/megaform-widget-golf-scorecard.js',
  'js/plugins/megaform-widget-rating-suite.js',
  'js/plugins/megaform-widget-dynamic-label.js',
  // [2026-06-15] megaform-widget-repeater.js removed — Repeater (Repeating List) retired; use Grid Repeater.
  'js/plugins/megaform-widget-rich-text.js',
  'js/plugins/megaform-widget-signature.js',
  'js/plugins/megaform-widget-stripe.js',
  'js/plugins/megaform-widget-video-embed.js',
  // [Map B42] OSM-backed Map widget; CSS inlined in render() like QRCode.
  'js/plugins/megaform-widget-map.js',
];

function ensureTrailingSlash(urlLike: string): string {
  return String(urlLike || '/').replace(/\/?$/, '/');
}

function toAbsoluteUrl(urlLike: string, serverOrigin: string): string {
  return new URL(urlLike, serverOrigin).toString();
}

function inferPublicApiBase(platform: string, apiBase: string | undefined, serverOrigin: string): string {
  const raw = String(apiBase || '').trim();
  if (raw) return ensureTrailingSlash(toAbsoluteUrl(raw, serverOrigin));
  if (platform === 'dnn') return ensureTrailingSlash(toAbsoluteUrl('/DesktopModules/MegaForm/API/', serverOrigin));
  return ensureTrailingSlash(toAbsoluteUrl('/api/MegaForm/', serverOrigin));
}

export function buildMinimalEmbedHostUrl(options: {
  formId: number;
  theme?: string;
  platform?: string;
  serverOrigin?: string;
  assetsBaseUrl?: string;
  apiBase?: string;
}): string {
  const cfg = getPlatformHostConfig();
  const platform = String(options.platform || cfg.platform || 'aspcore').toLowerCase();
  const serverOrigin = String(options.serverOrigin || window.location.origin || '').replace(/\/+$/, '') || window.location.origin;
  const assetsBase = ensureTrailingSlash(toAbsoluteUrl(options.assetsBaseUrl || cfg.assetsBaseUrl || inferAssetsBase(platform, options.apiBase || cfg.apiBase), serverOrigin));
  const apiBase = inferPublicApiBase(platform, options.apiBase || cfg.apiBase, serverOrigin);
  const cssUrls = [...EMBED_CORE_CSS, ...EMBED_PLUGIN_CSS].map((path) => new URL(path, assetsBase).toString());
  const jsUrls = [...EMBED_CORE_JS.slice(0, 3), ...EMBED_PLUGIN_JS, EMBED_CORE_JS[3]].map((path) => new URL(path, assetsBase).toString());
  const cfgJson = JSON.stringify({
    formId: options.formId,
    theme: options.theme || '',
    apiBase,
    i18nBase: apiBase.replace(/\/?$/, '/i18n'),
  });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MegaForm Embed</title>
<style>
html,body{margin:0;padding:0;background:transparent;min-height:100%;overflow-x:hidden}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a}
#mf-embed-root{width:100%;max-width:100%;margin:0 auto;padding:0;background:transparent}
#mf-embed-boot{display:flex;align-items:center;justify-content:center;min-height:180px;padding:24px;color:#64748b;font:500 14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
#mf-embed-boot.is-error{color:#991b1b;background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;margin:12px}
</style>
${cssUrls.map((href) => `<link rel="stylesheet" href="${href}" />`).join('')}
</head>
<body>
<div id="mf-embed-root">
  <div id="mf-embed-boot">Loading form…</div>
  <div id="mf-form-mount"></div>
</div>
${jsUrls.map((src) => `<script src="${src}"></script>`).join('')}
<script>
(function(){
  var BADGE = ${JSON.stringify(MINIMAL_EMBED_HOST_BADGE)};
  var CFG = ${cfgJson};
  function boot(){ return document.getElementById('mf-embed-boot'); }
  function setMessage(message, isError){
    var el = boot();
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'flex' : 'none';
    el.className = isError ? 'is-error' : '';
  }
  function notifyHeight(){
    try {
      var h = Math.max(document.documentElement ? document.documentElement.scrollHeight : 0, document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.offsetHeight : 0, document.body ? document.body.offsetHeight : 0);
      var targetOrigin = window.location.origin;
      try { if (document.referrer) targetOrigin = new URL(document.referrer).origin; } catch (_originErr) {}
      if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'mf:resize', height: h, formId: CFG.formId, badge: BADGE }, targetOrigin);
    } catch (_e) { }
  }
  function normalizeMaybeJson(value, fallback){
    if (value == null || value === '') return fallback;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_e) { return fallback; }
    }
    return value;
  }
  function safeThemeJson(data){
    var raw = data && (data.themeJson || data.ThemeJson || data.theme || data.Theme) || null;
    if (raw) return raw;
    if (CFG.theme) return JSON.stringify({ theme: CFG.theme });
    return null;
  }
  function startObservers(){
    notifyHeight();
    window.addEventListener('load', notifyHeight);
    window.addEventListener('resize', notifyHeight);
    if (typeof MutationObserver !== 'undefined') {
      try {
        new MutationObserver(function(){ notifyHeight(); }).observe(document.documentElement || document.body, { childList:true, subtree:true, attributes:true, characterData:true });
      } catch (_e) { }
    }
    window.setInterval(notifyHeight, 500);
  }
  function render(data){
    var rawSchema = data && (data.schema || data.Schema) || '{}';
    var schema = normalizeMaybeJson(rawSchema, {});
    var locale = String((data && (data.locale || data.Locale)) || ((schema.settings || {}).defaultLanguage) || ((schema.settings || {}).locale) || document.documentElement.getAttribute('lang') || 'en-US');
    document.documentElement.setAttribute('data-mf-locale', locale);
    document.body.setAttribute('data-mf-locale', locale);
    var mount = document.getElementById('mf-form-mount');
    if (!mount) throw new Error('Missing #mf-form-mount');
    setMessage('', false);
    var initI18n = window.MegaFormI18n && typeof window.MegaFormI18n.initI18n === 'function'
      ? window.MegaFormI18n.initI18n(CFG.i18nBase, locale)
      : Promise.resolve();
    Promise.resolve(initI18n).catch(function(){ return null; }).then(function(){
      if (!window.MegaFormRenderer || typeof window.MegaFormRenderer.init !== 'function') throw new Error('MegaFormRenderer is not available.');
      window.MegaFormRenderer.init({
        formId: CFG.formId,
        container: '#mf-form-mount',
        apiBaseUrl: CFG.apiBase,
        apiBase: CFG.apiBase,
        schema: schema,
        settingsJson: data && (data.settingsJson || data.SettingsJson) || null,
        themeJson: safeThemeJson(data),
        title: data && (data.title || data.Title) || '',
        description: data && (data.description || data.Description) || '',
        submitButtonText: data && (data.submitButtonText || data.SubmitButtonText) || 'Submit',
        enableCaptcha: !!(data && (data.enableCaptcha || data.EnableCaptcha)),
        enableSaveResume: !!(data && (data.enableSaveResume || data.EnableSaveResume)),
        requireAuth: !!(data && (data.requireAuth || data.RequireAuth)),
        rules: (schema && (schema.rules || schema.Rules)) || [],
        locale: locale,
        isPreview: false,
      });
      window.setTimeout(notifyHeight, 0);
      window.setTimeout(notifyHeight, 250);
      window.setTimeout(notifyHeight, 1000);
    });
  }
  fetch(CFG.apiBase + 'Submit/Schema?formId=' + encodeURIComponent(String(CFG.formId)), { credentials: 'include' })
    .then(function(res){
      if (res.status === 401 || res.status === 403) throw new Error('You must be logged in to access this form.');
      if (!res.ok) throw new Error('Could not load this form.');
      return res.json();
    })
    .then(function(data){
      if (data && (data.requireAuth || data.RequireAuth)) {
        setMessage('You must be logged in to access this form.', true);
        notifyHeight();
        return;
      }
      render(data || {});
    })
    .catch(function(error){
      console.error('[MegaFormEmbedHost]', error);
      setMessage((error && error.message) || 'Could not load this form.', true);
      notifyHeight();
    });
  startObservers();
})();
</script>
</body>
</html>`;
  void MINIMAL_EMBED_HOST_BADGE;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

export function getPublicFormUrl(formId: number, embed = false, viewUrlOverride?: string): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  const currentBase = getCurrentBasePath(platform);

  if (platform === 'dnn' || platform === 'oqtane') {
    const baseUrl = (viewUrlOverride && viewUrlOverride.trim())
      ? viewUrlOverride.trim()
      : (getStoredRendererHostUrl() || currentBase || '/');
    return buildHostedFormUrl(baseUrl, formId, embed);
  }

  return embed ? `/f/${formId}/embed` : `/f/${formId}`;
}

export function getEmbedFormUrl(formId: number, viewUrlOverride?: string): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || 'aspcore').toLowerCase();
  if (platform === 'dnn' || platform === 'oqtane') {
    const currentBase = getCurrentBasePath(platform);
    const baseUrl = (viewUrlOverride && viewUrlOverride.trim())
      ? viewUrlOverride.trim()
      : (getStoredRendererHostUrl() || currentBase || '/');
    return buildHostedFormUrl(baseUrl, formId, true);
  }
  return getPublicFormUrl(formId, true, viewUrlOverride);
}
