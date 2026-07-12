// ============================================================
// MegaForm Dashboard v3 — Full Payment + Email Settings
// ============================================================

const DASHBOARD_SHARE_FIX_BADGE = 'DashboardShareFix v20260406-01';
const DASHBOARD_RENDERER_HOST_BADGE = 'DashboardRendererHost v20260406-01';
const DASHBOARD_NEW_ROUTE_BADGE = 'DashboardNewRoute v20260420-01';
const DASHBOARD_LANG_ROUTE_BADGE = 'DashboardLangRoute v20260407-01';
const DASHBOARD_DB_SETTINGS_COMPACT_BADGE = 'DashboardDbSettingsCompact v20260409-09';
const DASHBOARD_HASH_LINK_FIX_BADGE = 'DashboardHashLinkFix v20260426-01';
const DASHBOARD_APP_ACCORDION_BADGE = 'DashboardAppAccordion v20260526-01';
// [B55 v20260603] Reporting System P1-P3 cache-bust. P1 ships the flat
// MF_SubmissionValues index + SubmissionIndexerService hook in
// SubmissionProcessor; P2 ships MF_ReportDefinitions + CRUD endpoints
// on /api/MegaForm/Reports/*; P3 ships the per-form Submission Report
// popup wired to a Report icon on every dashboard form card.
const DASHBOARD_REPORTS_BADGE = 'DashboardReports v20260603-B55';
// [B84 2026-06-07] AI Settings page added to the dashboard Configuration menu —
// shared provider/baseUrl/apiKey/model + the master "Enable AI Assistant"
// toggle that governs whether the builder chatbot appears. Replaces the per-
// browser cog that used to live inside the chat bubble.
const DASHBOARD_AI_SETTINGS_BADGE = 'DashboardAiSettings v20260607-B84';
// [B86 2026-06-08] Per-form Portal / row-level-access toggle (private-own mode).
const DASHBOARD_PORTAL_BADGE = 'DashboardPortalAccess v20260608-B86';
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_PORTAL_BADGE__ = DASHBOARD_PORTAL_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_AI_SETTINGS_BADGE__ = DASHBOARD_AI_SETTINGS_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_RENDERER_HOST_BADGE__ = DASHBOARD_RENDERER_HOST_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_SHARE_FIX_BADGE__ = DASHBOARD_SHARE_FIX_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_NEW_ROUTE_BADGE__ = DASHBOARD_NEW_ROUTE_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_LANG_ROUTE_BADGE__ = DASHBOARD_LANG_ROUTE_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_DB_SETTINGS_COMPACT_BADGE__ = DASHBOARD_DB_SETTINGS_COMPACT_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_HASH_LINK_FIX_BADGE__ = DASHBOARD_HASH_LINK_FIX_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_APP_ACCORDION_BADGE__ = DASHBOARD_APP_ACCORDION_BADGE;
if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_REPORTS_BADGE__ = DASHBOARD_REPORTS_BADGE;

import { getPlatformRoute, getPlatformHostConfig, getPublicFormUrl, getStoredRendererHostUrl, normalizeRendererHostUrl, getApiBase } from '@shared/platform-host';
import { connectGoogleSheet } from '@shared/google-sheets-workflow';
import { bindSkinSafeHashLink } from '@shared/hash-nav';
import { t as i18nT, tplural as i18nTplural, loadLocale, detectLocale, setDir, resolveI18nBase } from '@i18n';

/** Translate with an English fallback baked in → never blanks (no UI break). */
function T(key: string, fallback: string, params?: Record<string, string | number>): string {
  try { const o = i18nT(key, params); if (o && o !== key) return o; } catch { /* engine */ }
  let raw = fallback;
  if (params) for (const p in params) raw = raw.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]));
  return raw;
}

/** Plural-aware translate (CLDR via Intl). Reads `<baseKey>.<category>` sub-keys; falls
 *  back to the English `<other>` form. e.g. Tp('dash.n_submissions', 1, '{n} submissions'). */
function Tp(baseKey: string, count: number, fallbackOther: string): string {
  try { const o = i18nTplural(baseKey, count); if (o && o.indexOf(baseKey) !== 0) return o; } catch { /* engine */ }
  return fallbackOther.replace(/\{n\}/g, String(count)).replace(/\{count\}/g, String(count));
}
import { openDashboardEmbedModal } from './embed-modal';
import { openAiFormCreator } from './ai-form-creator';
import { isTrialMode, showTrialUpgrade } from '@shared/trial';
import { openSubmissionReport } from './submission-report';
// [2026-06-27] Form Creation Wizard — "New Form" opens the 5-step wizard which, on
// "Create Form", saves a fully-populated form and redirects into the existing builder.
import { openFormCreationWizard } from './wizard';

// [v20260530-29] Helper for the gradient "✨ Create with AI" button next to
// every "+ New Form" — opens the AI Form Creator modal (chat + live preview
// + Save & Use Now / Open Builder).
function makeAiCreateBtn(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mf-btn mf-btn-sm mf-btn-ai-create';
  // [TrialTighten v20260706] AI is a premium feature — in trial the button stays VISIBLE but shows a
  // lock + opens the Upgrade CTA (the server also withholds the AI key + enabled flag as enforcement).
  const trial = isTrialMode();
  const glyph = trial ? '<i class="fas fa-lock" style="font-size:12px;line-height:1"></i>' : '<span style="font-size:14px;line-height:1">✨</span>';
  btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">' + glyph + T('dash.create_with_ai', 'Create with AI') + '</span>';
  btn.style.cssText = 'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;cursor:pointer;' + (trial ? 'opacity:.78;' : '');
  btn.title = trial ? T('trial.ai_msg', 'AI form building is a premium feature. Upgrade to use it.') : T('dash.ai_create_hint', 'Describe a form in plain language — AI builds it for you');
  btn.addEventListener('click', () => {
    if (isTrialMode()) { showTrialUpgrade({ title: T('trial.ai_title', 'AI is a premium feature'), message: T('trial.ai_msg', 'AI form building is a premium feature. Upgrade to use it.') }); return; }
    openAiFormCreator();
  });
  return btn;
}

type DashboardData = {
  stats: Array<{ label: string; value: string | number; meta?: string; icon?: string }>;
  recentForms: Array<{ formId: number; title: string; status?: string; fields?: number; modified?: string; viewUrl?: string; appScope?: string; appKey?: string; appName?: string; appIcon?: string; appColor?: string; appDescription?: string; formRole?: string; isAppPrimary?: boolean; submissions?: number }>;
  appDefinitions?: Array<{ appId?: number; appKey?: string; appName?: string; appScope?: string; description?: string; icon?: string; accentColor?: string; formCount?: number; sortOrder?: number }>;
  recentSubmissions: Array<{ submissionId: number; formId: number; formTitle?: string; submittedOnUtc?: string; status?: string }>;
  quickActions: Array<{ title: string; subtitle?: string; icon?: string; href?: string }>;
  system: Array<{ key: string; value: string }>;
  counts?: { forms?: number; submissions?: number };
  lockedFormIds?: number[];
};

let API = '/api/MegaForm/';
let PAY_API = '/api/megaform/payments/';

const URLS = {
  dashboard: () => getPlatformRoute('dashboard'),
  builder: (formId?: number) => getPlatformRoute('builder', formId),
  submissions: (formId?: number) => getPlatformRoute('submissions', formId),
  myinbox: () => getPlatformRoute('myinbox'),
  settings: () => getPlatformRoute('settings'),
  languages: () => getPlatformRoute('languages'),
  themeDesigner: (formId?: number) => getPlatformRoute('themeDesigner', formId),
  viewLogs: () => getPlatformRoute('viewLogs'),
  logout: () => getPlatformRoute('logout'),
};

/**
 * [v20260528-14] In-memory cache of every "pinned" DNN page in the current
 * portal — pages where a MegaForm module's ModuleSettings already bind a
 * formId / viewKey / surface / inbox scope. Populated once on dashboard
 * mount via Phase2/PinnedPages; used by getDashboardShellRouteScoped() and
 * the per-form "Open App / Builder / Data" buttons so they land on the
 * clean URL (e.g. /megaf/Blog/Editorial) instead of the legacy
 * `?mfFormId=…&vk=…` querystring.
 */
interface PinnedPage {
  moduleId: number;
  tabId: number;
  tabName: string;
  tabUrl: string;
  formId: number;
  viewKey: string;
  surface: string;
  inboxAppScope: string;
  inboxFormId: number;
}
const _pinnedPages: PinnedPage[] = [];
let _pinnedPagesLoaded = false;
async function loadPinnedPages(): Promise<void> {
  if (_pinnedPagesLoaded) return;
  _pinnedPagesLoaded = true;
  try {
    const cfg = getPlatformHostConfig();
    if (String(cfg.platform || '').toLowerCase() !== 'dnn') return;
    const apiBase = (cfg.apiBase || getApiBase() + '/').replace(/\/?$/, '/');
    const portalId = ((window as any).__MF_PLATFORM__ || {}).portalId ?? 0;
    const r = await fetch(apiBase + 'Phase2/PinnedPages?portalId=' + portalId, { credentials: 'same-origin' });
    if (!r.ok) return;
    const arr = await r.json().catch(() => null);
    if (Array.isArray(arr)) {
      _pinnedPages.length = 0;
      for (const p of arr) _pinnedPages.push(p as PinnedPage);
    }
  } catch { /* swallow — fallback to legacy querystring routes */ }
}
function findPinnedPage(target: { formId?: number; viewKey?: string; appScope?: string; surface?: string }): PinnedPage | null {
  const list = _pinnedPages;
  // Most specific match wins: formId + viewKey, then formId only,
  // then appScope (for inbox), then surface-only.
  if (target.formId) {
    const exact = list.find(p => p.formId === target.formId && (!target.viewKey || p.viewKey === target.viewKey) && (!target.surface || p.surface === target.surface || !p.surface));
    if (exact) return exact;
    const byForm = list.find(p => p.formId === target.formId && (!target.surface || p.surface === target.surface || !p.surface));
    if (byForm) return byForm;
  }
  if (target.appScope) {
    const byApp = list.find(p => p.inboxAppScope && p.inboxAppScope.toLowerCase() === target.appScope!.toLowerCase());
    if (byApp) return byApp;
  }
  if (target.surface) {
    const bySurface = list.find(p => p.surface === target.surface);
    if (bySurface) return bySurface;
  }
  return null;
}

/**
 * [v20260528-12] Build a hash route into the in-page shell, optionally scoped
 * to a single form (mfFormId) OR to every form in an AppScope (mfAppScope).
 * Used by the per-app and per-form "Data" buttons so the Submission Inbox
 * mounts a NEW, filtered instance instead of always showing the cross-form view.
 *
 * [v20260528-14] If a pinned page exists that matches the requested scope,
 * we prefer its clean URL over the legacy querystring route. So clicking
 * "Open App" on Blog → /megaf/Blog, "Data" → /megaf/Blog/Inbox, etc.
 */
function getDashboardShellRouteScoped(
  mode: 'builder' | 'submissions' | 'theme' | 'dashboard',
  scope: { formId?: number; appScope?: string }
): string {
  // Surface ↔ mode mapping — module pin uses 'submissions' but dashboard
  // mode names match it. 'builder' and 'theme' map straight.
  const surfaceForMode = mode === 'dashboard' ? '' : mode;
  const pinned = findPinnedPage({ formId: scope.formId, appScope: scope.appScope, surface: surfaceForMode });
  if (pinned && pinned.tabUrl) {
    // Trust the pinned page: no querystring, no hash needed because the
    // module render reads ModuleSettings directly (see FormView.ascx.cs
    // pin block). Surface is encoded by the page itself.
    return pinned.tabUrl;
  }
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || '').toLowerCase();
  if (platform !== 'dnn') {
    if (scope.formId) return getDashboardShellRoute(mode, scope.formId);
    return getDashboardShellRoute(mode);
  }
  try {
    const rawBase = cfg.dashboardUrl || cfg.returnUrl || window.location.pathname || '/';
    const url = new URL(rawBase, window.location.origin);
    url.pathname = url.pathname.replace(/\/mfFormId\/\d+\/?/i, '').replace(/\/formId\/\d+\/?/i, '') || '/';
    ['configure', 'formId', 'formid', 'mfFormId', 'new', 'mfAppScope'].forEach(key => url.searchParams.delete(key));
    if (scope.formId && mode !== 'dashboard') url.searchParams.set('mfFormId', String(scope.formId));
    if (scope.appScope && mode === 'submissions') url.searchParams.set('mfAppScope', scope.appScope);
    url.hash = mode === 'dashboard' ? '#mf-dashboard' : `#mf-${mode}`;
    return url.pathname + (url.search || '') + url.hash;
  } catch {
    return getDashboardShellRoute(mode, scope.formId);
  }
}

function getDashboardShellRoute(mode: 'builder' | 'submissions' | 'theme' | 'dashboard', formId?: number): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || '').toLowerCase();
  if (platform !== 'dnn') {
    if (mode === 'theme') return URLS.themeDesigner(formId);
    if (mode === 'submissions') return URLS.submissions(formId);
    if (mode === 'builder') return URLS.builder(formId);
    return URLS.dashboard();
  }

  try {
    const rawBase = cfg.dashboardUrl || cfg.returnUrl || window.location.pathname || '/';
    const url = new URL(rawBase, window.location.origin);
    url.pathname = url.pathname.replace(/\/mfFormId\/\d+\/?/i, '').replace(/\/formId\/\d+\/?/i, '') || '/';
    ['configure', 'formId', 'formid', 'mfFormId', 'new'].forEach(key => url.searchParams.delete(key));
    if (formId && mode !== 'dashboard') url.searchParams.set('mfFormId', String(formId));
    url.hash = mode === 'dashboard' ? '#mf-dashboard' : `#mf-${mode}`;
    return url.pathname + (url.search || '') + url.hash;
  } catch {
    const path = String(window.location.pathname || '/').replace(/\/mfFormId\/\d+\/?/i, '') || '/';
    const query = formId && mode !== 'dashboard' ? `?mfFormId=${encodeURIComponent(String(formId))}` : '';
    return `${path}${query}#mf-${mode === 'dashboard' ? 'dashboard' : mode}`;
  }
}


// ─────────────────────────────────────────────────────────────
// FORM LOCK — Server-side storage (cross-device/browser)
// Locked IDs are stored in App_Data/MegaForm/locked-forms.json on the server.
// localStorage is used only as a fast-load cache (avoids flash on refresh).
// ─────────────────────────────────────────────────────────────
const LOCK_KEY = 'mf_locked_forms_v1';

// Server-authoritative set, populated from data-dashboard on init
let _serverLockedIds: Set<number> | null = null;

function getLockedIds(): Set<number> {
  // If server data was loaded, use it (authoritative, cross-device)
  if (_serverLockedIds !== null) return _serverLockedIds;
  // Fallback: localStorage cache (for initial render before server data arrives)
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const arr: number[] = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch { return new Set(); }
}

function syncLockedCache(ids: Set<number>): void {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(Array.from(ids))); } catch {}
}

function initServerLockedIds(ids: number[]): void {
  _serverLockedIds = new Set(ids);
  syncLockedCache(_serverLockedIds);
}

async function lockForm(formId: number): Promise<void> {
  const ids = getLockedIds();
  ids.add(formId);
  syncLockedCache(ids);
  _serverLockedIds = ids;
  try {
    await fetch(API + 'Form/Lock', {
      method: 'POST', headers: dnnAuthHeaders(),
      body: JSON.stringify({ formId })
    });
  } catch { /* server update best-effort */ }
}

async function unlockForm(formId: number): Promise<void> {
  const ids = getLockedIds();
  ids.delete(formId);
  syncLockedCache(ids);
  _serverLockedIds = ids;
  try {
    await fetch(API + 'Form/Unlock', {
      method: 'POST', headers: dnnAuthHeaders(),
      body: JSON.stringify({ formId })
    });
  } catch { /* server update best-effort */ }
}

function isLocked(formId: number): boolean {
  return getLockedIds().has(formId);
}

/**
 * FEATURE: "View Form URL" (DNN + Oqtane only)
 * Saves a custom public URL for a form into settingsJson.viewUrl via Form/SaveSettings.
 * When set, "View Live" opens this URL instead of the default ?formid=N URL.
 */
async function saveFormViewUrl(formId: number, viewUrl: string): Promise<void> {
  const apiBase = (document.getElementById('mf-dash-root')?.getAttribute('data-api-base') || API || '/api/MegaForm/').replace(/\/?$/, '/');
  const r = await fetch(apiBase + 'Form/SaveSettings', {
    method: 'POST',
    headers: { ...dnnAuthHeaders(), 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ formId, viewUrl: viewUrl.trim() })
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(txt || `HTTP ${r.status}`);
  }
}

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Build DNN ServicesFramework auth headers when running inside DNN overlay. */
function dnnAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const cfg = getPlatformHostConfig();
  if (cfg.platform !== 'dnn') return headers;
  try {
    const sf = (window as any).jQuery?.ServicesFramework?.(cfg.instanceId || cfg.moduleId || 0);
    if (sf) {
      headers['RequestVerificationToken'] = sf.getAntiForgeryValue();
      headers['TabId']    = String(sf.getTabId());
      headers['ModuleId'] = String(sf.getModuleId());
    }
  } catch { /* ServicesFramework not available */ }
  return headers;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function div(cls?: string, html?: string) { return el('div', cls, html); }
function span(cls?: string, html?: string) { return el('span', cls, html); }
function mk(parent: HTMLElement, ...c: (HTMLElement|Node)[]) { c.forEach(x => parent.appendChild(x)); return parent; }
function a(cls?: string, href?: string, html?: string) {
  const e = el('a', cls, html); if (href) e.href = href; return e;
}

// ── SVG Icons ────────────────────────────────────────────────
const I: Record<string,string> = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  googleSheet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 10h18"/><path d="M8 6v12"/><path d="M16 6v12"/></svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  files: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/></svg>`,
  inbox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>`,
  card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  mail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  gear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  chevD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`,
  logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`,
  panel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
  more: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  share: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  alert: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  circle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  dl: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  fedit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22h6a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v10"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z"/></svg>`,
  db: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  spin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mf-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  unlock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  shield: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  ok: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 13.5 4 10"/></svg>`,
  key: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  stripe: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6.5 9.5C6.5 8.1 7.6 7 9 7h6c1.4 0 2.5 1.1 2.5 2.5v0C17.5 10.9 16.4 12 15 12H9c-1.4 0-2.5 1.1-2.5 2.5v0C6.5 15.9 7.6 17 9 17h6c1.4 0 2.5-1.1 2.5-2.5"/></svg>`,
  paypal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 11l1-7h5.5a4 4 0 0 1 4 4.5c-.3 2-2 3.5-4 3.5H10l-1 6H5l2-7z"/><path d="M11 11l1-4h3.5a2.5 2.5 0 0 1 2.5 2.8c-.2 1.3-1.3 2.2-2.6 2.2H12"/></svg>`,
  info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="8"/><line x1="12" x2="12" y1="12" y2="16"/></svg>`,
  zap: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  externalLink: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>`,
  monitor: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
  // [B59] Bar-chart icon used by the per-form Submission Report button so the
  // affordance matches the 📊 mental model (instead of the previous "monitor"
  // display icon, which read more like a "live page preview").
  barChart: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/><line x1="3" x2="21" y1="20" y2="20"/></svg>`,
  inboxSm: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  codeEmbed: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  link: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  checkSm: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  download: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  sparkles: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  // [B86] Portal / row-level-access — "people" glyph for the per-form portal toggle.
  users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
};

function ic(k: string, sz = 16): string {
  const raw = I[k] || I['file'];
  return raw.replace(/width="\d+"/, `width="${sz}"`).replace(/height="\d+"/, `height="${sz}"`);
}

function badge(status: string): HTMLElement {
  const s = (status || '').toLowerCase();
  const b = span('mf-badge');
  if (['active','published','online','processed'].includes(s)) {
    b.classList.add('mf-badge-green');
    b.innerHTML = ic('check',12) + ' ' + (s==='processed'?T('dash.status_processed','Processed'):T('dash.status_active','Active'));
  } else if (['draft','pending'].includes(s)) {
    b.classList.add('mf-badge-amber');
    b.innerHTML = ic('clock',12) + ' ' + (s==='pending'?T('dash.status_pending','Pending'):T('dash.status_draft','Draft'));
  } else if (['new','submitted'].includes(s)) {
    b.classList.add('mf-badge-blue');
    b.innerHTML = ic('alert',12) + ' ' + T('dash.status_new','New');
  } else if (['inactive','archived'].includes(s)) {
    b.classList.add('mf-badge-gray');
    b.innerHTML = ic('circle',12) + ' ' + T('dash.status_inactive','Inactive');
  } else { b.textContent = status || '—'; }
  return b;
}

function fmtDate(v?: string): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}); } catch { return v; }
}
function siIcon(hint?: string): string {
  if (!hint) return 'file';
  if (hint.includes('message')||hint.includes('inbox')||hint.includes('sub')) return 'inbox';
  if (hint.includes('floppy')||hint.includes('draft')||hint.includes('edit')) return 'fedit';
  if (hint.includes('database')||hint.includes('server')) return 'db';
  return 'file';
}

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────


const DASHBOARD_DEMO_BADGE = 'Dashboard demo badge v20260402-08';
const DASHBOARD_LANG_CAPTCHA_BADGE = 'CaptchaSettingsFix v20260404-04';

async function parseJsonResponseSafe(r: Response): Promise<any> {
  var text = '';
  try { text = await r.text(); } catch (_e) { text = ''; }
  if (!text) return {};
  try { return JSON.parse(text); } catch (_e: any) {
    var preview = String(text || '').trim().slice(0, 180);
    throw new Error(preview || ('HTTP ' + r.status));
  }
}
const DASHBOARD_EMAIL_TABS_BADGE = 'Dashboard EmailTabs v20260403-08';
const DASHBOARD_DEMO_SETTINGS_BADGE = 'Dashboard DemoSettingsGuard v20260404-10';
const DASHBOARD_FORMLIST_LAYOUT_BADGE = 'Dashboard AppGroupedForms v20260526-01';

function readDemoLockAttrSync(): boolean {
  try {
    const root = document.getElementById('mf-builder-root')
      || document.getElementById('mf-dashboard-root')
      || document.getElementById('mf-submissions-root');
    const attr = String((root as HTMLElement | null)?.getAttribute('data-demo-lock') || '').toLowerCase();
    if (attr === 'true' || attr === '1' || attr === 'yes') return true;
    const winFlag = (window as any).__mfDemoLock;
    if (winFlag === true || String(winFlag).toLowerCase() === 'true') return true;
  } catch { }
  return false;
}

async function isDemoLocked(): Promise<boolean> {
  return readDemoLockAttrSync();
}

async function guardDemoAction(area: string): Promise<boolean> {
  if (!(await isDemoLocked())) return false;
  // Prominent blocking dialog — toast was too small and disappeared before users noticed it
  const wrap = div('mf-demo-guard-body');
  wrap.innerHTML = [
    '<div style="text-align:center;padding:8px 0 16px;">',
      '<div style="width:52px;height:52px;border-radius:14px;background:#fef3c7;display:flex;',
        'align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;">&#128274;</div>',
      '<p style="font-size:15px;font-weight:700;color:var(--fg,#09090b);margin:0 0 8px;">' + area + ' is disabled on the demo site</p>',
      '<p style="font-size:13px;color:var(--muted-fg,#64748b);margin:0;line-height:1.6;">',
        'This feature only works on a real site.<br>',
        'Deploy MegaForm on your own server to enable full configuration.',
      '</p>',
    '</div>',
    '<div style="display:flex;justify-content:center;margin-top:4px;">',
      '<button type="button" class="mf-btn mf-btn-primary mf-demo-guard-ok">Got it</button>',
    '</div>',
  ].join('');
  const ov = modal(area, 'lock', wrap, 420);
  (ov.querySelector<HTMLButtonElement>('.mf-demo-guard-ok'))?.addEventListener('click', () => ov.remove());
  return true;
}
function toast(msg: string, type: 'success'|'error'|'info' = 'info') {
  const t = div(`mf-toast mf-toast-${type}`, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 3500);
}

function ensureDashboardDemoBadge(root: ParentNode): void {
  const badges = root.querySelector('.mf-hd-badges') as HTMLElement | null;
  if (badges && !badges.querySelector('.mf-hd-badge-demo-lock')) {
    const demoBadge = span('mf-hd-badge mf-hd-badge-demo-lock', `${ic('lock',12)} Demo lock`);
    demoBadge.setAttribute('title', DASHBOARD_DEMO_BADGE + ' • ' + DASHBOARD_DEMO_SETTINGS_BADGE);
    badges.appendChild(demoBadge);
  }

  if (!document.querySelector('.mf-demo-lock-fixed-badge')) {
    const fixed = div('mf-demo-lock-fixed-badge', `${ic('lock',12)} Demo lock active • settings protected • ${DASHBOARD_DEMO_SETTINGS_BADGE}`);
    fixed.setAttribute('title', DASHBOARD_DEMO_BADGE + ' • ' + DASHBOARD_DEMO_SETTINGS_BADGE);
    document.body.appendChild(fixed);
  }
}

function applyDashboardDemoMode(root: HTMLElement): void {
  if (readDemoLockAttrSync()) {
    ensureDashboardDemoBadge(root);
  }

  root.addEventListener('click', function (ev) {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const guarded = target.closest('[data-demo-guard="settings"]') as HTMLElement | null;
    if (!guarded) return;
    if (guarded.getAttribute('aria-disabled') === 'true' || guarded.classList.contains('is-demo-disabled') || readDemoLockAttrSync()) {
      ev.preventDefault();
      ev.stopPropagation();
      void guardDemoAction('Settings');
    }
  }, true);

  isDemoLocked().then(function (locked) {
    if (!locked) return;
    ensureDashboardDemoBadge(root);
    root.querySelectorAll('.mf-ic-btn-lock, .mf-ic-btn-unlock').forEach(function (el) {
      var btn = el as HTMLButtonElement;
      btn.disabled = true;
      btn.classList.add('is-demo-disabled');
      btn.title = 'Form lock changes are disabled on demo site';
      btn.setAttribute('aria-disabled', 'true');
    });
    root.querySelectorAll('[data-demo-guard="settings"]').forEach(function (el) {
      var btn = el as HTMLElement;
      btn.classList.add('is-demo-disabled');
      btn.title = 'Settings editing is disabled on demo site';
      btn.setAttribute('aria-disabled', 'true');
      (btn as any).dataset.demoBlocked = '1';
      if (btn instanceof HTMLAnchorElement) btn.href = '#demo-locked';
    });
  }).catch(function () { /* ignore demo badge errors */ });
}

// ─────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────
function modal(title: string, icon: string, content: HTMLElement, maxW = 560): HTMLElement {
  document.getElementById('mf-modal-overlay')?.remove();
  const ov = div('mf-modal-overlay'); ov.id = 'mf-modal-overlay';
  // Must be above dashboard overlay (z-index 100000) which itself is inside DNN page overlays
  ov.style.zIndex = '200001';
  const box = div('mf-modal'); box.style.maxWidth = maxW + 'px';

  const hd = div('mf-modal-hd');
  const hIcon = div('mf-modal-hd-icon'); hIcon.innerHTML = ic(icon, 18);
  const hTitle = div('mf-modal-hd-title', title);
  const closeBtn = el('button','mf-modal-close'); closeBtn.type='button'; closeBtn.innerHTML=ic('x',16);
  closeBtn.onclick = () => ov.remove();
  mk(hd, hIcon, hTitle, closeBtn);

  const body = div('mf-modal-body');
  body.appendChild(content);

  mk(box, hd, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key==='Escape') { ov.remove(); document.removeEventListener('keydown',esc); }
  });
  return ov;
}

// ── Google Sheets: settings (creds) + per-form connect ───────────────────────
function gsApiBase(): string {
  const cfg = getPlatformHostConfig();
  return String(cfg.apiBase || (getApiBase() + '/')).replace(/\/?$/, '/');
}

const GS_INPUT_CSS = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-family:inherit';
function gsBlock(label: string, child: HTMLElement, hint?: string): HTMLElement {
  const w = div('mf-gs-block'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:12px';
  const l = div('mf-gs-lbl', label); l.style.cssText = 'font-size:12px;font-weight:600;color:#334155';
  w.appendChild(l); w.appendChild(child);
  if (hint) { const h = div('mf-gs-hint', hint); h.style.cssText = 'font-size:11px;color:#94a3b8;line-height:1.5'; w.appendChild(h); }
  return w;
}

/** Dashboard "Google Sheets" settings — paste a Service Account JSON + default
 *  spreadsheet, Test the credentials, and Save (stored as a private site setting
 *  read by the runtime executor). */
async function openGoogleSheetsSettings(targetBody?: HTMLElement): Promise<void> {
  const content = div('mf-gs-settings'); content.style.cssText = 'font-size:13px';
  const status = div('mf-gs-status'); status.style.cssText = 'font-size:12px;min-height:18px;margin-top:4px';
  const setStatus = (msg: string, color = '#475569') => { status.textContent = msg; status.style.color = color; };

  const jsonTa = el('textarea', 'mf-input') as HTMLTextAreaElement;
  jsonTa.rows = 7; jsonTa.placeholder = '{\n  "type": "service_account",\n  "client_email": "...@...iam.gserviceaccount.com",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n..."\n}';
  jsonTa.style.cssText = GS_INPUT_CSS + ';resize:vertical;font-family:ui-monospace,monospace;font-size:12px';
  const ssInp = el('input', 'mf-input') as HTMLInputElement; ssInp.type = 'text'; ssInp.placeholder = '1AbCd…spreadsheet id'; ssInp.style.cssText = GS_INPUT_CSS;
  const rangeInp = el('input', 'mf-input') as HTMLInputElement; rangeInp.type = 'text'; rangeInp.value = 'Sheet1!A:Z'; rangeInp.style.cssText = GS_INPUT_CSS;

  content.appendChild(gsBlock('Service Account JSON', jsonTa, 'Create a Service Account in Google Cloud, enable the Sheets API, and share your sheet with its client_email. Leave blank to keep the saved key.'));
  content.appendChild(gsBlock('Default spreadsheet ID (optional)', ssInp, 'From the sheet URL: docs.google.com/spreadsheets/d/<ID>/edit'));
  content.appendChild(gsBlock('Default range (optional)', rangeInp));

  const footer = div(); footer.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px';
  const testBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement; testBtn.type = 'button'; testBtn.textContent = 'Test connection';
  const saveBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement; saveBtn.type = 'button'; saveBtn.textContent = 'Save'; saveBtn.style.marginLeft = 'auto';
  mk(footer, testBtn, saveBtn);
  content.appendChild(footer); content.appendChild(status);

  if (targetBody) { targetBody.innerHTML = ''; targetBody.appendChild(content); }
  else { modal('Google Sheets', 'googleSheet', content, 560); }

  // Prefill from saved settings.
  try {
    const r = await fetch(gsApiBase() + 'ModuleConfig/GoogleSheetsSettings', { credentials: 'same-origin', cache: 'no-store', headers: dnnAuthHeaders() });
    if (r.ok) {
      const d = await r.json();
      if (d.defaultSpreadsheetId) ssInp.value = d.defaultSpreadsheetId;
      if (d.defaultRange) rangeInp.value = d.defaultRange;
      if (d.hasJson) { jsonTa.placeholder = '✓ A key is saved for ' + (d.clientEmail || 'this site') + '. Paste a new one to replace it.'; setStatus('Configured: ' + (d.clientEmail || 'service account saved'), '#16a34a'); }
    }
  } catch { /* ignore prefill failure */ }

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true; setStatus('Testing…');
    try {
      const r = await fetch(gsApiBase() + 'ModuleConfig/GoogleSheetsSettings/Test', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...dnnAuthHeaders() },
        body: JSON.stringify({ serviceAccountJson: jsonTa.value.trim() }),
      });
      const d = await r.json().catch(() => null);
      if (d && d.success) setStatus('✓ ' + (d.message || 'Connection OK') + (d.clientEmail ? ' (' + d.clientEmail + ')' : ''), '#16a34a');
      else setStatus('✕ ' + ((d && d.message) || ('HTTP ' + r.status)), '#dc2626');
    } catch (e) { setStatus('✕ ' + (e as Error).message, '#dc2626'); }
    finally { testBtn.disabled = false; }
  });

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; setStatus('Saving…');
    try {
      const r = await fetch(gsApiBase() + 'ModuleConfig/GoogleSheetsSettings', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...dnnAuthHeaders() },
        body: JSON.stringify({ serviceAccountJson: jsonTa.value.trim(), defaultSpreadsheetId: ssInp.value.trim(), defaultRange: rangeInp.value.trim() }),
      });
      const d = await r.json().catch(() => null);
      if (d && d.success) { setStatus('✓ Saved.', '#16a34a'); jsonTa.value = ''; }
      else setStatus('✕ ' + ((d && (d.message || d.error)) || ('HTTP ' + r.status)), '#dc2626');
    } catch (e) { setStatus('✕ ' + (e as Error).message, '#dc2626'); }
    finally { saveBtn.disabled = false; }
  });
}

/** Per-form "Connect Google Sheet" — wires the form's workflow so each new
 *  submission appends a row (field→column mappings from the real schema). */
async function openGoogleSheetConnectForForm(formId: number, formTitle: string): Promise<void> {
  if (!formId) return;
  const content = div('mf-gs-connect'); content.style.cssText = 'font-size:13px';
  const sub = div('mf-gs-sub', 'Form: ' + (formTitle || ('Form #' + formId))); sub.style.cssText = 'font-size:12px;color:#64748b;margin-bottom:12px';
  content.appendChild(sub);
  const ssInp = el('input', 'mf-input') as HTMLInputElement; ssInp.type = 'text'; ssInp.placeholder = '1AbCd…spreadsheet id'; ssInp.style.cssText = GS_INPUT_CSS;
  const rangeInp = el('input', 'mf-input') as HTMLInputElement; rangeInp.type = 'text'; rangeInp.value = 'Sheet1!A:Z'; rangeInp.style.cssText = GS_INPUT_CSS;
  // [PerSheetTest 2026-06-11] GS settings are GLOBAL but each form connects to its OWN sheet.
  // Show the service-account email so the user shares THIS form's sheet with it + a Test button.
  const shareHint = div('mf-gs-share'); shareHint.style.cssText = 'font-size:12px;line-height:1.55;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:9px 11px;margin-bottom:12px;color:#075985;';
  shareHint.textContent = 'Loading credentials…';
  content.appendChild(shareHint);
  content.appendChild(gsBlock('Spreadsheet ID (or full URL) *', ssInp));
  content.appendChild(gsBlock('Sheet / Range *', rangeInp));
  const note = div('mf-gs-note'); note.style.cssText = 'font-size:12px;color:#64748b;line-height:1.5;margin-bottom:8px';
  note.innerHTML = 'Each new submission is appended as a row (columns mapped from this form’s fields). Click <b>Test</b> to confirm the sheet is shared, then <b>Connect</b>.';
  content.appendChild(note);
  const status = div('mf-gs-status'); status.style.cssText = 'font-size:12px;min-height:18px';
  const footer = div(); footer.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px';
  const testBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement; testBtn.type = 'button'; testBtn.textContent = 'Test';
  const connectBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement; connectBtn.type = 'button'; connectBtn.textContent = 'Connect'; connectBtn.style.marginLeft = 'auto';
  mk(footer, testBtn, connectBtn); content.appendChild(footer); content.appendChild(status);

  modal('Connect Google Sheet', 'googleSheet', content, 480);

  // Extract a spreadsheet id from a pasted full Google Sheets URL (or pass through an id).
  const sheetId = (): string => { const v = ssInp.value.trim(); const m = v.match(/\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : v; };

  // Load the GLOBAL service account email so the user can share THIS form's sheet with it.
  // Do NOT prefill a spreadsheet id — each form connects to a different sheet.
  try {
    const r = await fetch(gsApiBase() + 'ModuleConfig/GoogleSheetsSettings', { credentials: 'same-origin', cache: 'no-store', headers: dnnAuthHeaders() });
    if (r.ok) {
      const d = await r.json();
      if (d.defaultRange) rangeInp.value = d.defaultRange;
      if (d.hasJson && d.clientEmail) {
        shareHint.innerHTML = 'Share this form’s Google Sheet (as <b>Editor</b>) with this service account:<br><code style="user-select:all;font-size:11.5px;background:#fff;border:1px solid #bae6fd;border-radius:5px;padding:2px 6px;display:inline-block;margin-top:4px;">' + d.clientEmail + '</code>';
      } else {
        shareHint.style.background = '#fef3c7'; shareHint.style.borderColor = '#fde68a'; shareHint.style.color = '#92400e';
        shareHint.innerHTML = '⚠ No Google service account saved yet. Open <b>Google Sheets</b> in the sidebar to add + test a key first.';
      }
    }
  } catch { shareHint.textContent = ''; }

  testBtn.addEventListener('click', async () => {
    const spreadsheetId = sheetId();
    if (!spreadsheetId) { status.textContent = 'Enter a Spreadsheet ID/URL to test.'; status.style.color = '#dc2626'; return; }
    testBtn.disabled = true; status.textContent = 'Testing sheet access…'; status.style.color = '#475569';
    try {
      const r = await fetch(gsApiBase() + 'ModuleConfig/GoogleSheetsTestSheet', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...dnnAuthHeaders() },
        body: JSON.stringify({ defaultSpreadsheetId: spreadsheetId }),
      });
      const d = await r.json().catch(() => null);
      if (d && d.success) {
        status.textContent = (d.message || '✓ Sheet reachable.'); status.style.color = '#16a34a';
        // Auto-correct the range to a REAL tab when the current one doesn't exist (e.g. the
        // default "Sheet1" on a non-English sheet whose first tab is "Trang tính1").
        const tabs: string[] = Array.isArray(d.sheets) ? d.sheets : [];
        if (tabs.length) {
          const cur = rangeInp.value.trim();
          const curTab = cur.includes('!') ? cur.split('!')[0].replace(/^'|'$/g, '') : cur;
          if (!tabs.includes(curTab)) {
            const t = tabs[0];
            const cell = cur.includes('!') ? cur.split('!').slice(1).join('!') : 'A:Z';
            const quoted = /[^A-Za-z0-9_]/.test(t) ? "'" + t.replace(/'/g, "''") + "'" : t;
            rangeInp.value = quoted + '!' + (cell || 'A:Z');
            status.textContent = '✓ Connected. Tab set to "' + t + '" (your sheet tabs: ' + tabs.join(', ') + '). Now click Connect.';
          }
        }
      }
      else { status.textContent = '✕ ' + ((d && d.message) || ('HTTP ' + r.status)); status.style.color = '#dc2626'; }
    } catch (e) { status.textContent = '✕ ' + (e as Error).message; status.style.color = '#dc2626'; }
    finally { testBtn.disabled = false; }
  });

  connectBtn.addEventListener('click', async () => {
    const spreadsheetId = sheetId(), range = rangeInp.value.trim();
    if (!spreadsheetId) { status.textContent = 'Spreadsheet ID is required.'; status.style.color = '#dc2626'; return; }
    if (!range) { status.textContent = 'Sheet / Range is required.'; status.style.color = '#dc2626'; return; }
    connectBtn.disabled = true; status.textContent = 'Connecting…'; status.style.color = '#475569';
    try {
      const cfg = getPlatformHostConfig();
      await connectGoogleSheet({ apiBase: gsApiBase(), platform: String(cfg.platform || 'oqtane'), formId, spreadsheetId, range, headers: dnnAuthHeaders() });
      status.textContent = '✓ Connected. New submissions will sync to the sheet.'; status.style.color = '#16a34a';
      setTimeout(() => document.getElementById('mf-modal-overlay')?.remove(), 1200);
    } catch (e) { status.textContent = '✕ ' + (e as Error).message; status.style.color = '#dc2626'; connectBtn.disabled = false; }
  });
}

/**
 * [v20260528-14] Pin-to-new-page wizard. Opens a small modal asking for
 * page name + surface + (optional) view key / inbox scope, then POSTs to
 * Phase2/PinToNewPage. On success → redirects the admin to the new URL.
 * Saves them a trip into the DNN Persona Bar.
 */
function openPinToNewPageModal(opts: {
  defaultName: string;
  defaultFormId: number;
  defaultViewKey: string;
  defaultSurface: string;
  defaultAppScope?: string;
}): void {
  const content = div('mf-pin-wizard');
  content.style.cssText = 'display:flex;flex-direction:column;gap:12px;font-size:13px;';
  const lbl = (text: string): HTMLElement => { const e = div('mf-pin-lbl', text); e.style.cssText = 'font-size:11px;font-weight:700;color:#475569;letter-spacing:.04em;text-transform:uppercase;'; return e; };
  const nameInput = el('input', 'mf-input') as HTMLInputElement;
  nameInput.type = 'text'; nameInput.value = opts.defaultName || 'New page'; nameInput.placeholder = 'e.g. Blog Editorial';
  nameInput.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;';
  const formIdInput = el('input', 'mf-input') as HTMLInputElement;
  formIdInput.type = 'number'; formIdInput.value = String(opts.defaultFormId || 0); formIdInput.min = '0';
  formIdInput.style.cssText = nameInput.style.cssText;
  const viewKeyInput = el('input', 'mf-input') as HTMLInputElement;
  viewKeyInput.type = 'text'; viewKeyInput.value = opts.defaultViewKey || ''; viewKeyInput.placeholder = 'e.g. blog-editorial-board (optional)';
  viewKeyInput.style.cssText = nameInput.style.cssText;
  const surfaceSelect = el('select', 'mf-input') as HTMLSelectElement;
  surfaceSelect.style.cssText = nameInput.style.cssText;
  // [B86] 'portal' = end-user "My Records" surface (row-level-secured) alongside the others.
  ['render', 'builder', 'dashboard', 'submissions', 'portal', 'theme', 'languages'].forEach((v) => {
    const o = document.createElement('option'); o.value = v;
    o.textContent = v === 'portal' ? 'portal (My Records · end-user)' : v;
    if (v === opts.defaultSurface) o.selected = true; surfaceSelect.appendChild(o);
  });
  const inboxAppInput = el('input', 'mf-input') as HTMLInputElement;
  inboxAppInput.type = 'text'; inboxAppInput.value = opts.defaultAppScope || ''; inboxAppInput.placeholder = 'e.g. blog (only when surface=submissions)';
  inboxAppInput.style.cssText = nameInput.style.cssText;
  const status = div('mf-pin-status'); status.style.cssText = 'font-size:12px;color:#475569;';

  const block = (label: string, child: HTMLElement): HTMLElement => {
    const w = div('mf-pin-block'); w.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    w.appendChild(lbl(label)); w.appendChild(child); return w;
  };
  content.appendChild(block('Page name (URL slug derived from this)', nameInput));
  content.appendChild(block('Form ID to bind (0 = none)', formIdInput));
  content.appendChild(block('View key (optional, e.g. blog-home)', viewKeyInput));
  content.appendChild(block('Page surface', surfaceSelect));
  content.appendChild(block('Inbox app scope (only when surface=submissions)', inboxAppInput));

  const footer = div('mf-pin-footer'); footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:6px;';
  const cancelBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  cancelBtn.type = 'button'; cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => document.getElementById('mf-modal-overlay')?.remove());
  const createBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
  createBtn.type = 'button'; createBtn.textContent = 'Create page';
  createBtn.addEventListener('click', async () => {
    const tabName = String(nameInput.value || '').trim();
    if (!tabName) { status.textContent = 'Page name is required.'; status.style.color = '#dc2626'; return; }
    createBtn.disabled = true; status.textContent = 'Creating page…'; status.style.color = '#475569';
    try {
      const cfg = getPlatformHostConfig();
      const apiBase = (cfg.apiBase || getApiBase() + '/').replace(/\/?$/, '/');
      const portalId = ((window as any).__MF_PLATFORM__ || {}).portalId ?? 0;
      const body = {
        portalId,
        tabName,
        formId: parseInt(formIdInput.value, 10) || 0,
        viewKey: String(viewKeyInput.value || '').trim(),
        surface: surfaceSelect.value,
        inboxAppScope: surfaceSelect.value === 'submissions' ? String(inboxAppInput.value || '').trim() : '',
        inboxFormId: 0,
      };
      const r = await fetch(apiBase + 'Phase2/PinToNewPage?portalId=' + portalId, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...dnnAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) {
        status.textContent = 'Create failed: ' + (data && (data.error || data.detail) ? (data.error + ' ' + (data.detail || '')) : ('HTTP ' + r.status));
        status.style.color = '#dc2626';
        createBtn.disabled = false;
        return;
      }
      status.textContent = 'Created. Redirecting to ' + data.tabUrl + ' …';
      status.style.color = '#16a34a';
      setTimeout(() => { try { window.location.assign(String(data.tabUrl)); } catch { /* ignore */ } }, 600);
    } catch (e) {
      status.textContent = 'Create failed: ' + (e as Error).message;
      status.style.color = '#dc2626';
      createBtn.disabled = false;
    }
  });
  mk(footer, cancelBtn, createBtn);
  content.appendChild(status);
  content.appendChild(footer);

  modal('Pin to new page', 'externalLink', content, 540);
}

// Stacked modal: does NOT remove existing overlays, sits on top of them.
// Use for editors opened from within another modal so the parent stays alive.
function stackedModal(title: string, icon: string, content: HTMLElement, maxW = 560): HTMLElement {
  const ov = div('mf-modal-overlay');
  ov.style.zIndex = '200005';
  const box = div('mf-modal'); box.style.maxWidth = maxW + 'px';
  const hd = div('mf-modal-hd');
  const hIcon = div('mf-modal-hd-icon'); hIcon.innerHTML = ic(icon, 18);
  const hTitle = div('mf-modal-hd-title', title);
  const closeBtn = el('button','mf-modal-close'); closeBtn.type='button'; closeBtn.innerHTML=ic('x',16);
  closeBtn.onclick = () => ov.remove();
  mk(hd, hIcon, hTitle, closeBtn);
  const body = div('mf-modal-body');
  body.appendChild(content);
  mk(box, hd, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target===ov) ov.remove(); });
  return ov;
}

// ─────────────────────────────────────────────────────────────
// FORM HELPERS
// ─────────────────────────────────────────────────────────────
function field(label: string, inp: HTMLElement, hint?: string): HTMLElement {
  const w = div('mf-field');
  const lbl = el('label','mf-field-lbl'); lbl.textContent = label;
  mk(w, lbl, inp);
  if (hint) w.appendChild(div('mf-field-hint', hint));
  return w;
}
function input(type: string, id: string, ph = '', val = '', attrs?: Record<string, string>): HTMLInputElement {
  const i = el('input','mf-input') as HTMLInputElement;
  i.type=type; i.id=id; i.name=id; i.placeholder=ph; i.value=val;
  if (attrs) Object.keys(attrs).forEach(k => i.setAttribute(k, String(attrs[k])));
  return i;
}
function select(id: string, opts: Array<{v:string;l:string}>, cur=''): HTMLSelectElement {
  const s = el('select','mf-input') as HTMLSelectElement;
  s.id = id;
  opts.forEach(o => {
    const opt = el('option','',o.l) as HTMLOptionElement;
    opt.value=o.v; if(o.v===cur) opt.selected=true;
    s.appendChild(opt);
  });
  return s;
}
function textarea(id: string, ph = '', val = '', rows = 4): HTMLTextAreaElement {
  const t = el('textarea','mf-input') as HTMLTextAreaElement;
  t.id = id; t.placeholder = ph; t.value = val; t.rows = rows; return t;
}
function pwField(id: string, ph='', savedHint?: string, attrs?: Record<string, string>): HTMLElement {
  const w = div('mf-pw');
  const i = input('password', id, ph, '', attrs);
  i.name = id;
  const btn = el('button','mf-pw-eye'); btn.type='button'; btn.innerHTML=ic('eye',14); btn.title='Show/hide';
  btn.onclick = () => { const shown=i.type==='text'; i.type=shown?'password':'text'; btn.innerHTML=ic(shown?'eye':'eyeOff',14); };
  mk(w, i, btn);
  if (savedHint) w.appendChild(div('mf-field-hint mf-hint-saved', savedHint));
  return w;
}
function toggle(id: string, checked=false): HTMLElement {
  const w = div('mf-switch');
  const i = el('input','mf-switch-inp') as HTMLInputElement;
  i.type='checkbox'; i.id=id; i.checked=checked;
  const t = el('label','mf-switch-track'); t.setAttribute('for',id);
  mk(w, i, t); return w;
}
function getCheck(id: string): boolean {
  return !!(document.getElementById(id) as HTMLInputElement)?.checked;
}
function getVal(id: string): string {
  return (document.getElementById(id) as HTMLInputElement|HTMLSelectElement)?.value || '';
}
function sectionHead(iconKey: string, title: string, badge?: string): HTMLElement {
  const h = div('mf-sect-head');
  const ic2 = span('mf-sect-icon'); ic2.innerHTML = ic(iconKey, 16);
  const t = span('mf-sect-title', title);
  mk(h, ic2, t);
  if (badge) h.appendChild(span('mf-sect-badge', badge));
  return h;
}
function infoBox(msg: string): HTMLElement {
  const b = div('mf-info-box'); b.innerHTML = ic('info',14) + ' ' + msg; return b;
}
function divider(): HTMLElement { return div('mf-divider'); }
function row2(a: HTMLElement, b: HTMLElement): HTMLElement {
  const r = div('mf-row2'); r.appendChild(a); r.appendChild(b); return r;
}

// ─────────────────────────────────────────────────────────────
// UNIFIED SETTINGS PANE — one modal, tabs for every settings group
// (Database / Payment / Email / Upload / Captcha / AI / Google Sheets).
// Languages stays a separate Configuration nav item (NOT a tab here).
// Each open*Settings(targetBody?) renders into the shared tab body when a
// targetBody is passed, else it still opens its own standalone modal (so
// nothing that called them directly breaks).
// ─────────────────────────────────────────────────────────────
// Returns the overlay an open*Settings() should treat as its modal. In standalone
// mode that's the real modal overlay. In TAB mode (targetBody passed) it's a tiny
// stand-in whose querySelector('.mf-modal-body') resolves to the tab body — so every
// existing `ov.querySelector('.mf-modal-body')` line in the 7 functions keeps working
// unchanged, and ov.remove() becomes a no-op (a Save doesn't close the whole pane).
function settingsHost(
  targetBody: HTMLElement | undefined,
  title: string, icon: string, loading: HTMLElement, maxW: number,
): HTMLElement {
  if (targetBody) {
    targetBody.innerHTML = '';
    targetBody.appendChild(loading);
    return {
      querySelector: (sel: string) =>
        /mf-modal-body/.test(sel) ? targetBody : targetBody.querySelector(sel),
      querySelectorAll: (sel: string) => targetBody.querySelectorAll(sel),
      remove: () => { /* no-op in tab mode — keep the Settings pane open */ },
    } as unknown as HTMLElement;
  }
  return modal(title, icon, loading, maxW);
}

type SettingsTabDef = { key: string; labelKey: string; labelFallback: string; icon: string; render: (body: HTMLElement) => void | Promise<void> };

function openSettingsPane(initialTab?: string): void {
  document.getElementById('mf-modal-overlay')?.remove();
  const ov = div('mf-modal-overlay'); ov.id = 'mf-modal-overlay'; ov.style.zIndex = '200001';
  const box = div('mf-modal mf-settings-modal');
  box.style.cssText = 'max-width:940px;width:94vw';

  const hd = div('mf-modal-hd');
  const hIcon = div('mf-modal-hd-icon'); hIcon.innerHTML = ic('gear', 18);
  const hTitle = div('mf-modal-hd-title'); hTitle.textContent = T('dash.settings_title', 'Settings');
  const closeBtn = el('button', 'mf-modal-close'); closeBtn.type = 'button'; closeBtn.innerHTML = ic('x', 16);
  closeBtn.onclick = () => ov.remove();
  mk(hd, hIcon, hTitle, closeBtn);

  const tabs: SettingsTabDef[] = [
    { key: 'database', labelKey: 'dash.nav_database', labelFallback: 'Database Settings', icon: 'db',          render: (b) => openDatabaseSettings(b) },
    { key: 'payment',  labelKey: 'dash.nav_payment',  labelFallback: 'Payment Settings',  icon: 'card',        render: (b) => openPaymentSettings(b) },
    { key: 'email',    labelKey: 'dash.nav_email',    labelFallback: 'Email Settings',    icon: 'mail',        render: (b) => openEmailSettings(b) },
    { key: 'upload',   labelKey: 'dash.nav_upload',   labelFallback: 'Upload Settings',   icon: 'files',       render: (b) => openUploadSettings(b) },
    { key: 'captcha',  labelKey: 'dash.nav_captcha',  labelFallback: 'Captcha Settings',  icon: 'shield',      render: (b) => openCaptchaSettings(b) },
    { key: 'ai',       labelKey: 'dash.nav_ai',       labelFallback: 'AI Settings',       icon: 'sparkles',    render: (b) => openAiSettings(b) },
    { key: 'gsheets',  labelKey: 'dash.nav_gsheets',  labelFallback: 'Google Sheets',     icon: 'googleSheet', render: (b) => openGoogleSheetsSettings(b) },
  ];

  // Left tab rail + right content host (race-safe: a fresh content div per select,
  // so a slow async load that resolves after a tab switch fills a detached node).
  const layout = div('mf-settings-layout');
  layout.style.cssText = 'display:flex;gap:0;min-height:420px';
  const rail = div('mf-settings-rail');
  rail.style.cssText = 'flex:0 0 188px;border-right:1px solid var(--mf-border,#e2e8f0);padding:8px;display:flex;flex-direction:column;gap:2px;background:var(--mf-bg-soft,#f8fafc)';
  const contentHost = div('mf-settings-content-host');
  contentHost.style.cssText = 'flex:1 1 auto;min-width:0;padding:14px 16px;overflow:auto;max-height:74vh';

  let active = initialTab && tabs.some((t) => t.key === initialTab) ? initialTab : tabs[0].key;
  const railBtns: Record<string, HTMLElement> = {};

  function selectTab(key: string): void {
    active = key;
    Object.keys(railBtns).forEach((k) => railBtns[k].classList.toggle('is-active', k === key));
    contentHost.innerHTML = '';
    const c = div('mf-settings-tab-body');
    contentHost.appendChild(c);
    const tab = tabs.find((t) => t.key === key);
    if (tab) Promise.resolve(tab.render(c)).catch(() => { /* per-tab errors render their own banner */ });
  }

  tabs.forEach((t) => {
    const b = el('button', 'mf-settings-tab'); b.type = 'button';
    b.style.cssText = 'display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:9px 11px;border:0;background:transparent;border-radius:8px;font-size:13px;font-weight:500;color:var(--mf-fg,#334155);cursor:pointer';
    const lbl = span('mf-settings-tab-lbl'); lbl.textContent = T(t.labelKey, t.labelFallback);
    b.innerHTML = ic(t.icon, 15);
    b.appendChild(lbl);
    b.onclick = () => selectTab(t.key);
    railBtns[t.key] = b;
    rail.appendChild(b);
  });

  mk(layout, rail, contentHost);
  const body = div('mf-modal-body mf-settings-body');
  body.style.cssText = 'padding:0';
  body.appendChild(layout);
  mk(box, hd, body);
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', esc); } });

  selectTab(active);
}

// ─────────────────────────────────────────────────────────────
// DATABASE SETTINGS MODAL
// ─────────────────────────────────────────────────────────────
async function openDatabaseSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('Database Settings')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin',20) + ' Loading database settings…';
  const ov = settingsHost(targetBody, 'Database Settings', 'db', wrap, 720);

  // BUG FIX: ModuleConfigController is [DnnAuthorize] → GET without auth headers = 401
  fetch(API + 'ModuleConfig/DatabaseSettings', { headers: dnnAuthHeaders() })
    .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
    .then((d: any) => {
      const c = div('mf-modal-inner');
      c.appendChild(sectionHead('db', 'Database Connection', d.dashboardConnectionName || 'DashboardDatabase'));

      // Red error banner — surfaces backend error.message from Test/Save/load
      const errorBanner = div('mf-modal-error-banner');
      errorBanner.style.display = 'none';
      errorBanner.style.cssText = 'display:none;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:10px 12px;border-radius:6px;margin:0 0 12px 0;font-size:13px;line-height:1.5;';
      const showError = (msg: string) => {
        errorBanner.innerHTML = ic('warn',14) + ' <strong>Error:</strong> ' + (msg || 'Unknown error');
        errorBanner.style.display = '';
      };
      const hideError = () => { errorBanner.style.display = 'none'; errorBanner.innerHTML = ''; };
      c.appendChild(errorBanner);

      // Site-default tip banner (shown when hasDefault===false after first-load prefetch)
      const defaultTip = div('mf-modal-tip-banner');
      defaultTip.style.cssText = 'display:none;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;padding:8px 12px;border-radius:6px;margin:0 0 12px 0;font-size:12.5px;';
      c.appendChild(defaultTip);

      c.appendChild(infoBox('Configure a reusable database connection here. It can be tested first, then reused from workflow nodes as a named connection.'));

      // DNN only supports SQL Server (net472, GAC SqlClient)
      // Web/Oqtane support all 4 providers via NuGet drivers
      const isDnnPlatform = getPlatformHostConfig().platform === 'dnn';
      const providerOpts = isDnnPlatform
        ? [{ v: 'SqlServer', l: 'SQL Server' }]
        : [
            { v: 'Sqlite', l: 'SQLite' },
            { v: 'SqlServer', l: 'SQL Server' },
            { v: 'MySql', l: 'MySQL' },
            { v: 'PostgreSql', l: 'PostgreSQL' },
          ];
      const defaultProvider = isDnnPlatform ? 'SqlServer' : (d.provider || 'Sqlite');
      const samples = (d && d.samples) || {};
      const sampleFor = (provider: string): string => {
        const p = String(provider || 'Sqlite');
        if (p === 'SqlServer') return samples.sqlServer || '';
        if (p === 'MySql') return samples.mySql || '';
        if (p === 'PostgreSql') return samples.postgreSql || '';
        return samples.sqlite || '';
      };

      const providerSel = select('db-provider', providerOpts, defaultProvider);
      const connInp = textarea('db-connstr', 'Connection string', d.connectionString || '', 5);
      connInp.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      const trustChk = toggle('db-trust-cert', /trustservercertificate\s*=\s*true/i.test(String(d.connectionString || '')) || String(d.provider || '').toLowerCase() === 'sqlserver');
      const encryptChk = toggle('db-encrypt', !/encrypt\s*=\s*false/i.test(String(d.connectionString || '')));
      const sqlOpts = div('mf-row2');
      // SQL Server options always visible on DNN (only provider), conditional on Web
      sqlOpts.style.display = isDnnPlatform || defaultProvider === 'SqlServer' ? '' : 'none';
      sqlOpts.appendChild(field('Encrypt', encryptChk, 'Recommended for SQL Server connections.'));
      sqlOpts.appendChild(field('Trust Server Certificate', trustChk, 'Useful for local/dev SQL Server with self-signed certificates.'));

      const sampleBox = div('mf-info-box mf-db-sample-box');
      const sampleIcon = span('mf-db-sample-box__icon', ic('info',14));
      const sampleBody = div('mf-db-sample-box__body');
      const sampleLabel = div('mf-db-sample-box__label', 'Sample connection string');
      const sampleCode = el('code', 'mf-db-sample-box__code');
      const sampleHelp = div('mf-db-sample-box__help');
      mk(sampleBody, sampleLabel, sampleCode, sampleHelp);
      mk(sampleBox, sampleIcon, sampleBody);
      function applySqlServerToggles(base: string): string {
        let text = String(base || '').trim();
        if (providerSel.value !== 'SqlServer') return text;
        if (!text) text = sampleFor('SqlServer');
        const setPart = (name: string, value: string) => {
          const rx = new RegExp('(?:^|;\\s*)' + name + '\\s*=\\s*[^;]*', 'i');
          if (rx.test(text)) text = text.replace(rx, ';' + name + '=' + value);
          else text += (text && !/;\s*$/.test(text) ? ';' : '') + name + '=' + value;
        };
        setPart('Encrypt', (encryptChk.querySelector('input') as HTMLInputElement).checked ? 'True' : 'False');
        setPart('TrustServerCertificate', (trustChk.querySelector('input') as HTMLInputElement).checked ? 'True' : 'False');
        return text.replace(/^;+/,'');
      }
      const refreshSample = () => {
        const sample = providerSel.value === 'SqlServer' ? applySqlServerToggles(sampleFor(providerSel.value)) : sampleFor(providerSel.value);
        sampleCode.textContent = sample;
        sampleHelp.textContent = providerSel.value === 'SqlServer'
          ? 'For local/dev SQL Server, Trust Server Certificate is often needed.'
          : '';
        sampleHelp.style.display = providerSel.value === 'SqlServer' ? '' : 'none';
      };
      refreshSample();
      function syncSqlVisibility(): void {
        sqlOpts.style.display = providerSel.value === 'SqlServer' ? '' : 'none';
      }
      providerSel.addEventListener('change', () => {
        syncSqlVisibility();
        refreshSample();
        if (!connInp.value.trim()) connInp.value = providerSel.value === 'SqlServer' ? applySqlServerToggles(sampleFor(providerSel.value)) : sampleFor(providerSel.value);
      });
      (trustChk.querySelector('input') as HTMLInputElement).addEventListener('change', () => { if (providerSel.value === 'SqlServer') { connInp.value = applySqlServerToggles(connInp.value); refreshSample(); } });
      (encryptChk.querySelector('input') as HTMLInputElement).addEventListener('change', () => { if (providerSel.value === 'SqlServer') { connInp.value = applySqlServerToggles(connInp.value); refreshSample(); } });

      const loadSampleBtn = el('button','mf-btn mf-btn-outline mf-btn-sm'); loadSampleBtn.type='button';
      loadSampleBtn.innerHTML = ic('refresh',13) + ' Load Sample';
      loadSampleBtn.onclick = () => { connInp.value = providerSel.value === 'SqlServer' ? applySqlServerToggles(sampleFor(providerSel.value)) : sampleFor(providerSel.value); };

      // "Use Site Default" button — fetches DefaultConnectionString and resets the field
      const useDefaultBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      useDefaultBtn.type = 'button';
      useDefaultBtn.innerHTML = ic('db',13) + ' Use Site Default';
      useDefaultBtn.title = 'Pull the host application default connection string';
      const applyDefault = async (silent: boolean): Promise<boolean> => {
        try {
          const r = await fetch(API + 'ModuleConfig/DefaultConnectionString', { headers: dnnAuthHeaders() });
          if (!r.ok) {
            if (!silent) showError('Could not load site default (HTTP ' + r.status + ').');
            return false;
          }
          const def: any = await r.json();
          if (def && def.hasDefault) {
            if (def.provider) {
              const opt = Array.from(providerSel.options).find(o => o.value.toLowerCase() === String(def.provider).toLowerCase());
              if (opt) providerSel.value = opt.value;
            }
            connInp.value = String(def.connectionString || '');
            syncSqlVisibility();
            refreshSample();
            defaultTip.style.display = 'none';
            hideError();
            return true;
          } else {
            if (!silent) {
              defaultTip.innerHTML = ic('info',13) + ' No default connection on this host — paste your own connection string.';
              defaultTip.style.display = '';
            }
            return false;
          }
        } catch (e: any) {
          if (!silent) showError('Network error loading default: ' + (e && e.message ? e.message : e));
          return false;
        }
      };
      useDefaultBtn.onclick = () => {
        hideError();
        useDefaultBtn.disabled = true;
        const prev = useDefaultBtn.innerHTML;
        useDefaultBtn.innerHTML = ic('spin',13) + ' Loading…';
        applyDefault(false).finally(() => { useDefaultBtn.disabled = false; useDefaultBtn.innerHTML = prev; });
      };

      c.appendChild(row2(
        field('Database Type', providerSel, 'Choose the provider before testing'),
        field('Reusable Name', input('text','db-alias','DashboardDatabase', d.dashboardConnectionName || 'DashboardDatabase'), 'Workflow can use this saved connection by name')
      ));

      // Connection String field with Use Site Default action above the textarea
      const csFieldWrap = field('Connection String', connInp, 'Paste the real connection string here, then click Test Connection.');
      const csActionRow = div('mf-cs-action-row');
      csActionRow.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:6px;';
      csActionRow.appendChild(useDefaultBtn);
      if (connInp.parentElement) connInp.parentElement.insertBefore(csActionRow, connInp);
      else csFieldWrap.insertBefore(csActionRow, csFieldWrap.firstChild);
      c.appendChild(csFieldWrap);
      c.appendChild(sqlOpts);
      c.appendChild(sampleBox);
      c.appendChild(divider());

      c.appendChild(sectionHead('zap','Test Connection'));
      const testWrap = div('mf-test-section');
      testWrap.innerHTML = `<div class="mf-test-label">${ic('zap',13)} Validate provider, connection string, and server access before saving</div>`;
      const testActions = div('mf-test-input-row');
      const testBtn = el('button','mf-btn mf-btn-outline mf-btn-sm'); testBtn.type='button';
      testBtn.innerHTML = ic('zap',13) + ' Test Connection';
      const testStatus = div('mf-test-result');
      mk(testActions, loadSampleBtn, testBtn);
      mk(testWrap, testActions, testStatus);
      c.appendChild(testWrap);

      testBtn.onclick = async () => {
        testBtn.disabled = true;
        testBtn.innerHTML = ic('spin',13) + ' Testing…';
        testStatus.className='mf-test-result'; testStatus.textContent='';
        hideError();
        try {
          const r = await fetch(API + 'ModuleConfig/DatabaseSettings/Test', {
            method: 'POST', headers: dnnAuthHeaders(),
            body: JSON.stringify({ provider: providerSel.value, connectionString: providerSel.value === 'SqlServer' ? applySqlServerToggles(connInp.value) : connInp.value })
          });
          let res: any = {};
          try { res = await r.json(); } catch { res = {}; }
          // Surface backend error.message into the red banner above the form for 4xx/5xx
          if (!r.ok) {
            const backendMsg = (res && (res.error && (res.error.message || res.error)) || res.message) || ('HTTP ' + r.status + ' ' + (r.statusText || ''));
            showError(typeof backendMsg === 'string' ? backendMsg : JSON.stringify(backendMsg));
            testStatus.className = 'mf-test-result is-error';
            testStatus.textContent = '✗ ' + (typeof backendMsg === 'string' ? backendMsg : 'Request failed');
          } else if (res.error) {
            const m = (res.error && (res.error.message || res.error)) || 'Test failed';
            showError(typeof m === 'string' ? m : JSON.stringify(m));
            testStatus.className = 'mf-test-result is-error';
            testStatus.textContent = '✗ ' + (typeof m === 'string' ? m : 'Test failed');
          } else {
            testStatus.className = 'mf-test-result ' + (res.success ? 'is-success' : 'is-error');
            testStatus.innerHTML = (res.success ? '✓ ' : '✗ ') + (res.message || '') + (res.databaseName ? (' <br/><small>Database: ' + res.databaseName + (res.serverVersion ? ' · ' + res.serverVersion : '') + '</small>') : '');
            if (!res.success && res.message) showError(String(res.message));
          }
        } catch (e: any) {
          const msg = 'Network error: ' + (e && e.message ? e.message : e);
          testStatus.className='mf-test-result is-error';
          testStatus.textContent = '✗ ' + msg;
          showError(msg);
        } finally {
          testBtn.disabled = false;
          testBtn.innerHTML = ic('zap',13) + ' Test Connection';
        }
      };

      const footer = div('mf-modal-footer');
      const cancelBtn = el('button','mf-btn mf-btn-outline mf-btn-sm','Cancel') as HTMLButtonElement; cancelBtn.type='button'; cancelBtn.onclick=()=>ov.remove();
      const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement; saveBtn.type='button'; saveBtn.innerHTML = ic('ok',14) + ' Save Database Settings';
      saveBtn.onclick = async () => {
        saveBtn.disabled=true; saveBtn.innerHTML=ic('spin',14)+' Saving…';
        hideError();
        try {
          const r = await fetch(API + 'ModuleConfig/DatabaseSettings', {
            method:'POST', headers: dnnAuthHeaders(),
            body: JSON.stringify({ provider: providerSel.value, connectionString: providerSel.value === 'SqlServer' ? applySqlServerToggles(connInp.value) : connInp.value, alias: getVal('db-alias') })
          });
          let res: any = {};
          try { res = await r.json(); } catch { res = {}; }
          if (!r.ok) {
            const backendMsg = (res && (res.error && (res.error.message || res.error)) || res.message) || ('HTTP ' + r.status + ' ' + (r.statusText || ''));
            showError(typeof backendMsg === 'string' ? backendMsg : JSON.stringify(backendMsg));
            toast(typeof backendMsg === 'string' ? backendMsg : 'Save failed', 'error');
          } else if (res.success) {
            toast('Database settings saved', 'success'); ov.remove();
          } else {
            const m = (res && (res.error && (res.error.message || res.error)) || res.message) || 'Save failed';
            showError(typeof m === 'string' ? m : JSON.stringify(m));
            toast(typeof m === 'string' ? m : 'Save failed', 'error');
          }
        } catch (e: any) {
          showError('Network error: ' + (e && e.message ? e.message : e));
          toast('Network error','error');
        }
        finally { saveBtn.disabled=false; saveBtn.innerHTML=ic('ok',14)+' Save Database Settings'; }
      };
      mk(footer, cancelBtn, saveBtn);
      c.appendChild(footer);

      const mb = ov.querySelector('.mf-modal-body') as HTMLElement; mb.innerHTML=''; mb.appendChild(c);

      // First-open auto-prefill — if the loaded CS is empty (or just a sample),
      // silently pull the site default and prefill provider + masked CS.
      // Reveals the warning tip when hasDefault===false so user knows to paste a CS.
      const initialCs = String(connInp.value || '').trim();
      const looksLikeSample = !!initialCs && initialCs === String(sampleFor(providerSel.value) || '').trim();
      if (!initialCs || looksLikeSample) {
        applyDefault(true).then(ok => {
          if (!ok) {
            defaultTip.innerHTML = ic('info',13) + ' No default connection on this host — paste your CS.';
            defaultTip.style.display = '';
          }
        });
      }
    })
    .catch((err: any) => {
      const msg = (err && err.message) ? err.message : (typeof err === 'string' ? err : 'Failed to load database settings.');
      (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML = '<div class="mf-modal-err">' + msg + '</div>';
    });
}

// ─────────────────────────────────────────────────────────────
// PAYMENT SETTINGS MODAL — Full Stripe + PayPal
// ─────────────────────────────────────────────────────────────
async function openPaymentSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('Payment Settings')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin',20) + ' Loading payment settings…';
  const ov = settingsHost(targetBody, 'Payment Settings', 'card', wrap, 600);

  // BUG FIX: [DnnAuthorize] endpoint — needs auth headers on DNN
  fetch(API + 'ModuleConfig/PaymentSettings', { headers: dnnAuthHeaders() })
    .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
    .then((d: any) => {
      const c = div('mf-modal-inner');

      // ══ STRIPE SECTION ══════════════════════════════════════
      c.appendChild(sectionHead('stripe', 'Stripe', 'Recommended'));
      c.appendChild(infoBox('Stripe powers card payments (Visa, Mastercard, Amex). Keys are available in your <a href="https://dashboard.stripe.com/apikeys" target="_blank">Stripe Dashboard → API Keys</a>.'));

      const stripeOn = d.stripeEnabled === true;
      const stripeTogRow = div('mf-toggle-row');
      const stLabel = div('mf-toggle-label');
      stLabel.innerHTML = '<strong>Enable Stripe payments</strong><p>Allows Stripe widget fields in forms</p>';
      const stSwitch = toggle('pm-stripe-on', stripeOn);
      mk(stripeTogRow, stLabel, stSwitch);
      c.appendChild(stripeTogRow);

      const stripeBody = div('mf-collapsible');
      stripeBody.style.display = stripeOn ? '' : 'none';
      (stSwitch.querySelector('input') as HTMLInputElement).addEventListener('change', function() {
        stripeBody.style.display = this.checked ? '' : 'none';
      });

      stripeBody.appendChild(field('Publishable Key',
        input('text','pm-stripe-pk','pk_live_xxxx or pk_test_xxxx', d.stripePublishableKey||''),
        'Starts with pk_live_ (production) or pk_test_ (testing). Safe to expose publicly.'));

      stripeBody.appendChild(field('Secret Key',
        pwField('pm-stripe-sk','sk_live_xxxx or sk_test_xxxx',
          d.stripeSecretKeySaved ? '✓ Secret key is saved — leave blank to keep, or enter new to replace' : undefined),
        'Never expose this key. Starts with sk_live_ or sk_test_. Stored encrypted.'));

      stripeBody.appendChild(field('Webhook Secret (optional)',
        pwField('pm-stripe-wh','whsec_xxxx'),
        'From Stripe Dashboard → Webhooks. Used to verify event signatures.'));

      // Test Stripe button
      const stripeTestRow = div('mf-test-section');
      stripeTestRow.innerHTML = `<div class="mf-test-label">${ic('zap',13)} Test API Connection</div>`;
      const stripeTestBtn = el('button','mf-btn mf-btn-outline mf-btn-sm'); stripeTestBtn.type='button';
      stripeTestBtn.innerHTML = ic('zap',13) + ' Test Stripe Keys';
      const stripeTestStatus = div('mf-test-result');

      stripeTestBtn.onclick = async () => {
        stripeTestBtn.disabled = true;
        stripeTestBtn.innerHTML = ic('spin',13) + ' Testing…';
        stripeTestStatus.className = 'mf-test-result';
        stripeTestStatus.textContent = '';
        try {
          // Test by calling our create-intent with $0.50 (minimum) in test mode
          const pk = getVal('pm-stripe-pk');
          if (!pk) { stripeTestStatus.className='mf-test-result is-error'; stripeTestStatus.textContent='✗ Enter Publishable Key first'; return; }
          const resp = await fetch(PAY_API + 'stripe/create-intent', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ amount: 50, currency: 'usd', description: 'MegaForm connection test' })
          });
          const json = await resp.json();
          if (json.clientSecret || json.paymentIntentId) {
            stripeTestStatus.className='mf-test-result is-success';
            stripeTestStatus.textContent='✓ Stripe API connection successful. Keys are valid.';
          } else {
            stripeTestStatus.className='mf-test-result is-error';
            stripeTestStatus.textContent='✗ ' + (json.error || 'API returned no payment intent. Check secret key.');
          }
        } catch (e: any) {
          stripeTestStatus.className='mf-test-result is-error';
          stripeTestStatus.textContent='✗ Network error: ' + (e.message||e);
        } finally {
          stripeTestBtn.disabled=false;
          stripeTestBtn.innerHTML=ic('zap',13)+' Test Stripe Keys';
        }
      };
      mk(stripeTestRow, stripeTestBtn, stripeTestStatus);
      stripeBody.appendChild(stripeTestRow);

      c.appendChild(stripeBody);
      c.appendChild(divider());

      // ══ PAYPAL SECTION ══════════════════════════════════════
      c.appendChild(sectionHead('paypal', 'PayPal'));
      c.appendChild(infoBox('Get credentials from <a href="https://developer.paypal.com/dashboard/" target="_blank">PayPal Developer Dashboard → Apps &amp; Credentials</a>. Use Sandbox for testing, Live for production.'));

      const ppOn = d.paypalEnabled === true;
      const ppTogRow = div('mf-toggle-row');
      const ppLabel = div('mf-toggle-label');
      ppLabel.innerHTML = '<strong>Enable PayPal payments</strong><p>Allows PayPal widget fields in forms</p>';
      const ppSwitch = toggle('pm-pp-on', ppOn);
      mk(ppTogRow, ppLabel, ppSwitch);
      c.appendChild(ppTogRow);

      const ppBody = div('mf-collapsible');
      ppBody.style.display = ppOn ? '' : 'none';
      (ppSwitch.querySelector('input') as HTMLInputElement).addEventListener('change', function() {
        ppBody.style.display = this.checked ? '' : 'none';
      });

      ppBody.appendChild(field('Mode', select('pm-pp-mode',[
        {v:'sandbox',l:'🧪 Sandbox — testing only'},
        {v:'live',l:'🚀 Live — production payments'},
      ], d.paypalMode||'sandbox'), 'Use Sandbox while testing. Switch to Live before going to production.'));

      ppBody.appendChild(row2(
        field('Client ID', input('text','pm-pp-cid','AYxxxx…', d.paypalClientId||''), 'From PayPal Dashboard → Apps → your app'),
        field('Client Secret', pwField('pm-pp-cs','', d.paypalClientSecretSaved ? '✓ Secret saved' : undefined), 'Keep secret — never expose in frontend'),
      ));

      // Test PayPal credentials
      const ppTestRow = div('mf-test-section');
      ppTestRow.innerHTML = `<div class="mf-test-label">${ic('zap',13)} Validate API Credentials</div>`;
      const ppTestBtn = el('button','mf-btn mf-btn-outline mf-btn-sm'); ppTestBtn.type='button';
      ppTestBtn.innerHTML = ic('zap',13) + ' Validate PayPal Credentials';
      const ppTestStatus = div('mf-test-result');
      const ppTestHint = div('mf-input-hint');
      ppTestHint.textContent = 'This checks the current Mode + Client ID + Client Secret against the PayPal API. It does not create a real payment. Leave Client Secret blank to reuse the saved secret.';

      ppTestBtn.onclick = async () => {
        ppTestBtn.disabled=true;
        ppTestBtn.innerHTML=ic('spin',13)+' Validating…';
        ppTestStatus.className='mf-test-result'; ppTestStatus.textContent='';
        try {
          const resp = await fetch(PAY_API + 'paypal/test-credentials', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              mode: getVal('pm-pp-mode'),
              clientId: getVal('pm-pp-cid'),
              clientSecret: getVal('pm-pp-cs')
            })
          });
          const json = await resp.json();
          const diag = json && json.diagnostic ? json.diagnostic : null;
          const diagText = diag
            ? ` [mode=${diag.mode||'?'} api=${diag.apiBaseUrl||'?'} client=${diag.clientIdPreview||'?'} clientIdSource=${diag.clientIdSource||'?'} secretSource=${diag.clientSecretSource||'?'} secretLen=${diag.clientSecretLength ?? '?'}]`
            : '';
          if (resp.ok && json.success) {
            ppTestStatus.className='mf-test-result is-success';
            ppTestStatus.textContent='✓ ' + (json.message || 'PayPal API connection successful. Credentials are valid.') + diagText;
          } else {
            ppTestStatus.className='mf-test-result is-error';
            ppTestStatus.textContent='✗ ' + (json.error||json.message||'Could not validate PayPal credentials.') + (json.hint ? ' — ' + json.hint : '') + diagText;
          }
        } catch(e: any) {
          ppTestStatus.className='mf-test-result is-error';
          ppTestStatus.textContent='✗ Network error: '+(e.message||e);
        } finally {
          ppTestBtn.disabled=false;
          ppTestBtn.innerHTML=ic('zap',13)+' Validate PayPal Credentials';
        }
      };
      mk(ppTestRow, ppTestBtn, ppTestStatus);
      ppBody.appendChild(ppTestRow);
      ppBody.appendChild(ppTestHint);

      c.appendChild(ppBody);

      // ══ FOOTER ══════════════════════════════════════════════
      const footer = div('mf-modal-footer');
      const cancelBtn = el('button','mf-btn mf-btn-outline mf-btn-sm','Cancel'); cancelBtn.type='button';
      cancelBtn.onclick = () => ov.remove();
      const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm'); saveBtn.type='button';
      saveBtn.innerHTML = ic('ok',14) + ' Save Payment Settings';

      saveBtn.onclick = async () => {
        saveBtn.disabled=true;
        saveBtn.innerHTML=ic('spin',14)+' Saving…';
        const body: any = {
          stripeEnabled: getCheck('pm-stripe-on'),
          stripePublishableKey: getVal('pm-stripe-pk'),
          stripeSecretKey: getVal('pm-stripe-sk'),
          paypalEnabled: getCheck('pm-pp-on'),
          paypalMode: getVal('pm-pp-mode'),
          paypalClientId: getVal('pm-pp-cid'),
          paypalClientSecret: getVal('pm-pp-cs'),
        };
        try {
          const r = await fetch(API+'ModuleConfig/PaymentSettings',{method:'POST',headers:dnnAuthHeaders(),body:JSON.stringify(body)});
          const res = await r.json();
          if (res.success) { toast('Payment settings saved','success'); ov.remove(); }
          else toast(res.message||'Save failed','error');
        } catch { toast('Network error','error'); }
        finally { saveBtn.disabled=false; saveBtn.innerHTML=ic('ok',14)+' Save Payment Settings'; }
      };
      mk(footer, cancelBtn, saveBtn);
      c.appendChild(footer);

      const mb = ov.querySelector('.mf-modal-body') as HTMLElement;
      mb.innerHTML=''; mb.appendChild(c);
    })
    .catch(() => {
      (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML =
        '<div class="mf-modal-err">Failed to load payment settings. Check API connectivity.</div>';
    });
}

// ─────────────────────────────────────────────────────────────
// EMAIL SETTINGS MODAL
// ─────────────────────────────────────────────────────────────

async function openEmailSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('Email Settings')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin',20) + ' Loading email settings…';
  const ov = settingsHost(targetBody, 'Email / SMTP Settings', 'mail', wrap, 760);

  const PROVIDERS: Record<string, {
    id: string;
    title: string;
    badge?: string;
    host?: string;
    port?: string;
    enableSsl?: boolean;
    username?: string;
    docs: string;
    summary: string;
    note: string;
  }> = {
    generic: {
      id: 'generic',
      title: 'Generic SMTP',
      docs: 'https://en.wikipedia.org/wiki/Simple_Mail_Transfer_Protocol',
      summary: 'Use your own SMTP relay or hosting provider mail server.',
      note: 'Fill in the SMTP server details from your provider.'
    },
    gmail: {
      id: 'gmail',
      title: 'Gmail / Google Workspace',
      host: 'smtp.gmail.com',
      port: '587',
      enableSsl: true,
      docs: 'https://support.google.com/accounts/answer/185833',
      summary: 'SMTP relay using Gmail or Google Workspace with an App Password.',
      note: 'Use port 587 with STARTTLS. The password should be an App Password, not your normal Google password.'
    },
    mailchimp: {
      id: 'mailchimp',
      title: 'Mailchimp Transactional',
      badge: 'Mandrill SMTP',
      host: 'smtp.mandrillapp.com',
      port: '587',
      enableSsl: true,
      docs: 'https://mailchimp.com/developer/transactional/docs/smtp-integration/',
      summary: 'Transactional email over Mailchimp Transactional SMTP.',
      note: 'Use smtp.mandrillapp.com. Username can be any string; password must be a valid Mailchimp Transactional API key.'
    },
    sendgrid: {
      id: 'sendgrid',
      title: 'SendGrid',
      host: 'smtp.sendgrid.net',
      port: '587',
      enableSsl: true,
      username: 'apikey',
      docs: 'https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api',
      summary: 'Twilio SendGrid SMTP relay with API key authentication.',
      note: 'Username must be the literal string "apikey". Password is your SendGrid API key.'
    }
  };

  function inferProvider(d: any): string {
    const saved = String(d?.provider || '').trim().toLowerCase();
    if (saved && PROVIDERS[saved]) return saved;
    const host = String(d?.host || '').trim().toLowerCase();
    const user = String(d?.username || '').trim().toLowerCase();
    if (host.includes('mandrillapp.com')) return 'mailchimp';
    if (host.includes('sendgrid.net') || user === 'apikey') return 'sendgrid';
    if (host.includes('gmail.com')) return 'gmail';
    return 'generic';
  }

  fetch(API + 'ModuleConfig/EmailSettings', { headers: dnnAuthHeaders() })
    .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
    .then((d: any) => {
      const c = div('mf-modal-inner mf-email-settings');
      c.setAttribute('data-dashboard-badge', DASHBOARD_EMAIL_TABS_BADGE);

      let currentProvider = inferProvider(d);

      const providerSummary = div('mf-email-provider-summary');
      const tabs = div('mf-settings-tabs');
      const panelWrap = div('mf-settings-panels');

      const providerPanel = div('mf-settings-panel');
      const smtpPanel = div('mf-settings-panel');
      const senderPanel = div('mf-settings-panel');
      const testPanel = div('mf-settings-panel');
      [providerPanel, smtpPanel, senderPanel, testPanel].forEach(panel => panel.setAttribute('data-dashboard-email-badge', DASHBOARD_EMAIL_TABS_BADGE));

      const tabDefs = [
        { id: 'provider', label: 'Providers', icon: 'gear', panel: providerPanel },
        { id: 'smtp', label: 'SMTP', icon: 'mail', panel: smtpPanel },
        { id: 'sender', label: 'Sender', icon: 'file', panel: senderPanel },
        { id: 'test', label: 'Test', icon: 'send', panel: testPanel }
      ];

      function activateTab(id: string) {
        tabs.querySelectorAll<HTMLButtonElement>('.mf-settings-tab').forEach(btn => {
          btn.classList.toggle('is-active', btn.dataset.tab === id);
        });
        tabDefs.forEach(t => {
          t.panel.style.display = t.id === id ? 'block' : 'none';
        });
      }

      function setInputValue(id: string, value: string | undefined) {
        const inp = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (inp && value !== undefined) inp.value = value;
      }

      function renderProviderSummary() {
        const p = PROVIDERS[currentProvider] || PROVIDERS.generic;
        providerSummary.innerHTML =
          `<div class="mf-email-provider-badge">${ic('mail',14)} ${p.title}${p.badge ? ' · ' + p.badge : ''}</div>` +
          `<div class="mf-email-provider-note">${p.summary}</div>`;
      }

      function applyProviderPreset(id: string) {
        const p = PROVIDERS[id];
        if (!p) return;
        currentProvider = id;
        setInputValue('em-provider', id);
        setInputValue('em-provider-display', id);
        if (p.host) setInputValue('em-host', p.host);
        if (p.port) setInputValue('em-port', p.port);
        if (p.username !== undefined) setInputValue('em-user', p.username);
        const ssl = document.getElementById('em-ssl') as HTMLInputElement | null;
        if (ssl && p.enableSsl !== undefined) ssl.checked = !!p.enableSsl;
        renderProviderSummary();
        activateTab('smtp');
      }

      tabDefs.forEach((t, idx) => {
        const btn = el('button', 'mf-settings-tab' + (idx === 0 ? ' is-active' : '')) as HTMLButtonElement;
        btn.type = 'button';
        btn.dataset.tab = t.id;
        btn.innerHTML = `${ic(t.icon,14)} <span>${t.label}</span>`;
        btn.onclick = () => activateTab(t.id);
        tabs.appendChild(btn);
      });

      const providerHidden = input('hidden', 'em-provider', '', currentProvider);

      providerPanel.appendChild(infoBox('Keep the shared SMTP engine, but use provider presets and official setup guidance for Gmail, Mailchimp Transactional, and SendGrid.'));
      const cards = div('mf-provider-cards');
      ['generic','gmail','mailchimp','sendgrid'].forEach(id => {
        const p = PROVIDERS[id];
        const card = div('mf-provider-card' + (currentProvider === id ? ' is-active' : ''));
        const head = div('mf-provider-card-hd');
        head.innerHTML = `<strong>${p.title}</strong>${p.badge ? `<span class="mf-provider-mini">${p.badge}</span>` : ''}`;
        const body = div('mf-provider-card-body');
        body.innerHTML = `<p>${p.summary}</p><p class="mf-provider-card-note">${p.note}</p>`;
        const meta = div('mf-provider-meta');
        const bits = [
          p.host ? `Host: <code>${p.host}</code>` : '',
          p.port ? `Port: <code>${p.port}</code>` : '',
          p.username !== undefined ? `Username: <code>${p.username || '(your SMTP username)'}</code>` : ''
        ].filter(Boolean).join(' · ');
        meta.innerHTML = bits;
        const actions = div('mf-provider-actions');
        const docs = a('mf-btn mf-btn-outline mf-btn-sm', p.docs, `${ic('externalLink',13)} Official docs`);
        docs.target = '_blank';
        docs.rel = 'noopener noreferrer';
        const useBtn = el('button','mf-btn mf-btn-primary mf-btn-sm', `${ic('ok',13)} Use ${p.title}`) as HTMLButtonElement;
        useBtn.type = 'button';
        useBtn.onclick = () => {
          cards.querySelectorAll('.mf-provider-card').forEach(x => x.classList.remove('is-active'));
          card.classList.add('is-active');
          applyProviderPreset(id);
        };
        mk(actions, docs, useBtn);
        mk(card, head, body);
        if (meta.innerHTML) card.appendChild(meta);
        card.appendChild(actions);
        cards.appendChild(card);
      });
      providerPanel.appendChild(cards);

      const providerSelectEl = select('em-provider-display', [
        { v: 'generic', l: 'Generic SMTP' },
        { v: 'gmail', l: 'Gmail / Google Workspace' },
        { v: 'mailchimp', l: 'Mailchimp Transactional' },
        { v: 'sendgrid', l: 'SendGrid' }
      ], currentProvider);

      smtpPanel.appendChild(sectionHead('mail', 'SMTP Credentials', DASHBOARD_EMAIL_TABS_BADGE));
      smtpPanel.appendChild(providerSummary);
      smtpPanel.appendChild(row2(
        field('Provider', providerSelectEl, 'Choose a provider preset or keep Generic SMTP for a custom relay.'),
        field('Port', input('number','em-port','587', d.port||'587'), '587 for TLS/STARTTLS is usually preferred. Use 465 for SSL where supported.')
      ));
      smtpPanel.appendChild(field('Host', input('text','em-host','smtp.gmail.com', d.host||''), 'SMTP server hostname or relay address.'));
      smtpPanel.appendChild(field('Username', input('text','em-user','user@example.com', d.username||''), 'For SendGrid, the username must be the exact string "apikey". For Mailchimp Transactional, username can be any string.'));
      smtpPanel.appendChild(field('Password', pwField('em-pass','••••••••', d.passwordSaved ? '✓ Password saved — enter new to replace' : undefined)));

      const sslRow = div('mf-toggle-row');
      const sslLabel = div('mf-toggle-label');
      sslLabel.innerHTML = '<strong>SSL / TLS</strong><p>Use TLS / STARTTLS on port 587. Use SSL on 465 if your provider requires it.</p>';
      const sslSwitch = toggle('em-ssl', d.enableSsl===true);
      mk(sslRow, sslLabel, sslSwitch);
      smtpPanel.appendChild(sslRow);

      senderPanel.appendChild(sectionHead('file', 'Sender Identity'));
      senderPanel.appendChild(infoBox('Your From address should belong to a verified sending domain for the selected provider. Some providers may rewrite the sender if the domain or sender identity is not verified.'));
      senderPanel.appendChild(row2(
        field('From Address', input('email','em-from','noreply@example.com', d.from||''), 'Sender email shown to recipients.'),
        field('From Name', input('text','em-from-name','MegaForm', d.fromName||'MegaForm'), 'Friendly display name shown beside the sender email.')
      ));
      senderPanel.appendChild(field('Reply-To', input('email','em-reply','', d.replyTo||''), 'Optional. Leave blank to use the From address.'));
      senderPanel.appendChild(field('Timeout (ms)', input('number','em-timeout','20000', String(d.timeoutMs||20000)), 'Connection / send timeout for the SMTP client.'));

      const compliance = div('mf-email-checklist');
      compliance.innerHTML =
        `<div class="mf-email-check-item">${ic('check',12)} Verify the sending domain or sender identity with your provider.</div>` +
        `<div class="mf-email-check-item">${ic('check',12)} Keep API keys or SMTP secrets only in this settings screen.</div>` +
        `<div class="mf-email-check-item">${ic('check',12)} Test both inbox and spam folder after any SMTP change.</div>`;
      senderPanel.appendChild(compliance);

      testPanel.appendChild(sectionHead('send','Send Test Email'));
      testPanel.appendChild(infoBox('Send a real test message using the draft settings in this dialog before you save.'));
      const testWrap = div('mf-test-section');
      testWrap.innerHTML = `<div class="mf-test-label">${ic('info',13)} Enter a recipient to send a test message</div>`;
      const testRow = div('mf-test-input-row');
      const testInp = input('email','em-test-to','you@example.com');
      const testBtn = el('button','mf-btn mf-btn-outline mf-btn-sm'); testBtn.type='button';
      testBtn.innerHTML = ic('send',13)+' Send Test';
      const testStatus = div('mf-test-result');

      const readEmailDraft = () => ({
        provider: currentProvider,
        host: getVal('em-host'),
        port: getVal('em-port'),
        from: getVal('em-from'),
        fromName: getVal('em-from-name'),
        username: getVal('em-user'),
        password: getVal('em-pass'),
        replyTo: getVal('em-reply'),
        timeoutMs: getVal('em-timeout'),
        enableSsl: getCheck('em-ssl')
      });

      providerSelectEl.addEventListener('change', () => {
        currentProvider = providerSelectEl.value || 'generic';
        setInputValue('em-provider', currentProvider);
        renderProviderSummary();
      });

      testBtn.onclick = async () => {
        const to = testInp.value.trim();
        if (!to) { toast('Enter recipient email first','error'); return; }
        testBtn.disabled=true; testBtn.innerHTML=ic('spin',13)+' Sending…';
        testStatus.className='mf-test-result'; testStatus.textContent='';
        try {
          const payload = readEmailDraft();
          const r = await fetch(API+'ModuleConfig/EmailSettings/Test',{method:'POST',headers:dnnAuthHeaders(),body:JSON.stringify({...payload,to})});
          const res = await r.json();
          testStatus.className='mf-test-result '+(res.success?'is-success':'is-error');
          testStatus.textContent=(res.success?'✓ ':'✗ ')+(res.message||res.error||'');
        } catch(e: any) {
          testStatus.className='mf-test-result is-error';
          testStatus.textContent='✗ Network error: '+(e.message||e);
        } finally { testBtn.disabled=false; testBtn.innerHTML=ic('send',13)+' Send Test'; }
      };

      mk(testRow, testInp, testBtn);
      mk(testWrap, testRow, testStatus);
      testPanel.appendChild(testWrap);

      panelWrap.appendChild(providerPanel);
      panelWrap.appendChild(smtpPanel);
      panelWrap.appendChild(senderPanel);
      panelWrap.appendChild(testPanel);

      const footer = div('mf-modal-footer');
      const cancelBtn = el('button','mf-btn mf-btn-outline mf-btn-sm','Cancel'); cancelBtn.type='button'; cancelBtn.onclick=()=>ov.remove();
      const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm'); saveBtn.type='button';
      saveBtn.innerHTML = ic('ok',14)+' Save Email Settings';

      saveBtn.onclick = async () => {
        saveBtn.disabled=true; saveBtn.innerHTML=ic('spin',14)+' Saving…';
        const body = readEmailDraft();
        try {
          const r = await fetch(API+'ModuleConfig/EmailSettings',{method:'POST',headers:dnnAuthHeaders(),body:JSON.stringify(body)});
          const res = await r.json();
          if (res.success) { toast('Email settings saved','success'); ov.remove(); }
          else toast(res.message||'Save failed','error');
        } catch { toast('Network error','error'); }
        finally { saveBtn.disabled=false; saveBtn.innerHTML=ic('ok',14)+' Save Email Settings'; }
      };

      renderProviderSummary();
      activateTab('provider');

      mk(c, providerHidden, tabs, panelWrap);
      c.appendChild(footer);
      mk(footer, cancelBtn, saveBtn);

      const mb = ov.querySelector('.mf-modal-body') as HTMLElement; mb.innerHTML=''; mb.appendChild(c);
    })
    .catch(() => {
      (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML=
        '<div class="mf-modal-err">Failed to load email settings.</div>';
    });
}


async function openCaptchaSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('Captcha Settings')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin',20) + ' Loading captcha settings…';
  const ov = settingsHost(targetBody, 'Captcha Settings', 'shield', wrap, 560);

  fetch(API + 'ModuleConfig/CaptchaSettings', { headers: { ...dnnAuthHeaders(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
    .then(async r => { const json = await parseJsonResponseSafe(r); if (!r.ok) throw new Error((json && (json.error || json.message)) || ('HTTP ' + r.status)); return json || {}; })
    .then((d: any) => {
      const c = div('mf-modal-inner mf-settings');
      c.setAttribute('data-dashboard-badge', DASHBOARD_LANG_CAPTCHA_BADGE);
      c.setAttribute('autocomplete', 'off');
      const badgeText = String(d.badgeVersion || DASHBOARD_LANG_CAPTCHA_BADGE);
      const antiFillText = { autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'data-lpignore': 'true', 'data-form-type': 'other' } as Record<string, string>;
      const antiFillSecret = { autocomplete: 'new-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'data-lpignore': 'true', 'data-form-type': 'other' } as Record<string, string>;
      c.appendChild(infoBox('Store secret keys only here on the server. Public form fields may optionally use these dashboard site keys when their own site key is left blank.'));
      c.appendChild(sectionHead('shield', 'Google reCAPTCHA', 'v20260404-04'));
      c.appendChild(row2(
        field('Site Key', input('text','cap-rc-site','6Lxxxx…', d.reCaptchaSiteKey || '', antiFillText), 'Public key used by reCAPTCHA v2/v3 on the form. Autofill is disabled so browsers do not confuse this with the admin login.'),
        field('Secret Key', pwField('cap-rc-secret','', d.reCaptchaSecretKeySaved ? '✓ Secret saved' : undefined, antiFillSecret), 'Private server key used for Google siteverify. ' + badgeText + ' Autofill is disabled so password managers do not replace this value with the admin password.')
      ));
      c.appendChild(divider());
      c.appendChild(sectionHead('shield', 'hCaptcha', 'v20260404-04'));
      c.appendChild(row2(
        field('Site Key', input('text','cap-hc-site','10000000-ffff-ffff-ffff-000000000001', d.hCaptchaSiteKey || '', antiFillText), 'Public key used by the hCaptcha widget. Autofill is disabled so browsers do not confuse this with the admin login.'),
        field('Secret Key', pwField('cap-hc-secret','', d.hCaptchaSecretKeySaved ? '✓ Secret saved' : undefined, antiFillSecret), 'Private server key used for hCaptcha siteverify. Autofill is disabled so password managers do not replace this value with the admin password.')
      ));

      const footer = div('mf-modal-footer');
      const cancelBtn = el('button','mf-btn mf-btn-outline mf-btn-sm','Cancel') as HTMLButtonElement;
      cancelBtn.type='button'; cancelBtn.onclick=()=>ov.remove();
      const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
      saveBtn.type='button';
      saveBtn.innerHTML = ic('ok',14) + ' Save Captcha Settings';
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = ic('spin',14) + ' Saving…';
        try {
          const body = {
            reCaptchaSiteKey: getVal('cap-rc-site'),
            reCaptchaSecretKey: getVal('cap-rc-secret'),
            hCaptchaSiteKey: getVal('cap-hc-site'),
            hCaptchaSecretKey: getVal('cap-hc-secret')
          };
          const r = await fetch(API + 'ModuleConfig/CaptchaSettings', { method:'POST', headers:{ ...dnnAuthHeaders(), 'Content-Type':'application/json', 'X-Requested-With': 'XMLHttpRequest' }, credentials:'same-origin', body: JSON.stringify(body) });
          const res = await parseJsonResponseSafe(r);
          if (res.success) { toast('Captcha settings saved', 'success'); ov.remove(); }
          else toast(res.message || res.error || 'Save failed', 'error');
        } catch (e: any) {
          toast((e && e.message) ? e.message : 'Network error', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = ic('ok',14) + ' Save Captcha Settings';
        }
      };
      mk(footer, cancelBtn, saveBtn);
      c.appendChild(footer);

      const mb = ov.querySelector('.mf-modal-body') as HTMLElement;
      mb.innerHTML = ''; mb.appendChild(c);
    })
    .catch((err: any) => {
      (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML =
        '<div class="mf-modal-err">' + ((err && err.message) || 'Failed to load captcha settings.') + '</div>';
    });
}

async function openUploadSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('Upload Settings')) return;
  const wrap = div('mf-loading-wrap');
  wrap.innerHTML = `<div class="mf-loading">${ic('spin',16)} Loading upload settings…</div>`;
  const ov = settingsHost(targetBody, 'Upload Settings', 'files', wrap, 700);

  // BUG FIX: [DnnAuthorize] endpoint — needs auth headers on DNN
  fetch(API + 'ModuleConfig/UploadSettings', { headers: { ...dnnAuthHeaders(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
    .then(async r => { const json = await r.json(); if (!r.ok) throw new Error(json?.error || 'Failed to load'); return json; })
    .then((d: any) => {
      const c = div('mf-modal-inner mf-settings mf-upload-settings');

      const hero = div('mf-upload-hero');
      const heroBody = div('mf-upload-hero-body');
      const heroHead = sectionHead('files', 'Private Upload Storage', 'Recommended');
      heroHead.classList.add('mf-upload-hero-head');
      const heroMeta = div('mf-upload-hero-meta');
      heroMeta.appendChild(infoBox('File uploads are stored in a private App_Data folder and downloaded only through the API.'));
      const modePill = span('mf-upload-pill', `${ic('files',12)} ${String(d.storageMode || 'private').toUpperCase()}`);
      heroMeta.appendChild(modePill);
      mk(heroBody, heroHead, heroMeta);
      hero.appendChild(heroBody);
      c.appendChild(hero);

      const maxInput = input('number','up-max','10', String(d.maxSizeMb || 10));
      const storageInput = input('text','up-storage','private', d.storageMode || 'private');
      storageInput.readOnly = true;
      storageInput.disabled = true;

      const topGrid = div('mf-upload-grid');
      const limitsCard = div('mf-upload-card');
      limitsCard.appendChild(sectionHead('zap', 'Limits & runtime'));
      limitsCard.appendChild(row2(
        field('Max File Size (MB)', maxInput, 'Global ceiling for each uploaded file.'),
        field('Storage Mode', storageInput, 'Read-only runtime mode.')
      ));

      const extCard = div('mf-upload-card');
      extCard.appendChild(sectionHead('key', 'Extension policy'));
      extCard.appendChild(field('Allowed Extensions', textarea('up-allow','.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.csv', d.allowedExtensions || '', 4), 'Comma or newline separated. Leave conservative defaults for public forms.'));
      extCard.appendChild(field('Blocked Extensions', textarea('up-block','.exe,.bat,.cmd,.com,.dll,.msi,.ps1,.sh,.php,.phtml,.aspx,.asp,.jsp,.js', d.blockedExtensions || '', 4), 'These are always rejected, even if a field allows them.'));
      const hintRow = div('mf-upload-hints');
      hintRow.appendChild(span('mf-upload-chip', 'Safer public-form defaults'));
      hintRow.appendChild(span('mf-upload-chip', 'Private storage only'));
      hintRow.appendChild(span('mf-upload-chip', 'Unique file names'));
      extCard.appendChild(hintRow);

      mk(topGrid, limitsCard, extCard);
      c.appendChild(topGrid);

      c.appendChild(divider());
      const notesCard = div('mf-upload-card mf-upload-card-notes');
      notesCard.appendChild(sectionHead('info', 'Security Notes'));
      const notes = Array.isArray(d.notes) ? d.notes : [];
      const noteList = el('ul','mf-note-list mf-note-list-strong') as HTMLUListElement;
      notes.forEach((note: string) => {
        const li = el('li','mf-note-item');
        li.textContent = note;
        noteList.appendChild(li);
      });
      notesCard.appendChild(noteList);
      c.appendChild(notesCard);

      const footer = div('mf-modal-footer');
      const cancelBtn = el('button','mf-btn mf-btn-outline mf-btn-sm','Cancel') as HTMLButtonElement;
      cancelBtn.type='button';
      cancelBtn.onclick = () => ov.remove();
      const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
      saveBtn.type='button';
      saveBtn.innerHTML = ic('ok',14) + ' Save Upload Settings';
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        saveBtn.innerHTML = ic('spin',14) + ' Saving…';
        try {
          const body = {
            maxSizeMb: Math.max(1, Number(getVal('up-max') || '10')),
            allowedExtensions: getVal('up-allow'),
            blockedExtensions: getVal('up-block')
          };
          const r = await fetch(API + 'ModuleConfig/UploadSettings', {
            method: 'POST',
            headers: dnnAuthHeaders(),
            credentials: 'same-origin',
            body: JSON.stringify(body)
          });
          const res = await r.json();
          if (res.success) { toast('Upload settings saved', 'success'); ov.remove(); }
          else toast(res.message || res.error || 'Save failed', 'error');
        } catch (e: any) {
          toast((e && e.message) ? e.message : 'Network error', 'error');
        } finally {
          saveBtn.disabled = false;
          saveBtn.innerHTML = ic('ok',14) + ' Save Upload Settings';
        }
      };
      mk(footer, cancelBtn, saveBtn);
      c.appendChild(footer);

      const mb = ov.querySelector('.mf-modal-body') as HTMLElement;
      mb.innerHTML = '';
      mb.appendChild(c);
    })
    .catch((err: any) => {
      (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML =
        '<div class="mf-modal-err">' + ((err && err.message) || 'Failed to load upload settings.') + '</div>';
    });
}

// ─────────────────────────────────────────────────────────────
// PORTAL / ROW-LEVEL ACCESS MODAL  [B86 2026-06-08]
// Per-form toggle for "Portal mode" (each signed-in user sees only their own
// records). Talks to the Oqtane Portal/Status + Portal/SetPrivate endpoints
// (EditModule → needs the module entity context appended).
// ─────────────────────────────────────────────────────────────
function mfModuleId(): number {
  const pf = (window as any).__MF_PLATFORM__ || {};
  return Number(pf.moduleId ?? pf.ModuleId ?? 0) || 0;
}
function isOqtanePlatform(): boolean {
  const p = String(getPlatformHostConfig().platform || '').toLowerCase();
  return p === 'oqtane' || !!(window as any).__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
}
function portalApiUrl(action: string): string {
  let u = API + action;
  if (isOqtanePlatform()) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'entityid=' + mfModuleId() + '&entityname=Module';
  return u;
}
function absoluteUrl(path: string): string {
  try { return new URL(path, window.location.origin).href; } catch { return path; }
}

async function openPortalAccess(formId: number, title?: string) {
  if (await guardDemoAction('Portal Access')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin', 20) + ' Loading access settings…';
  const ov = modal('Portal & Access — ' + (title || ('Form #' + formId)), 'users', wrap, 580);

  let status: any = {};
  try {
    const r = await fetch(portalApiUrl('Portal/Status?formId=' + formId), { headers: { ...dnnAuthHeaders(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin', cache: 'no-store' });
    status = await parseJsonResponseSafe(r);
    if (!r.ok) throw new Error((status && (status.error || status.message)) || ('HTTP ' + r.status));
  } catch (e: any) {
    (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML =
      '<div class="mf-modal-err">' + ((e && e.message) || 'Failed to load access settings.') +
      '<br><br><span style="font-size:12px;color:#64748b">Portal mode currently requires the Oqtane platform.</span></div>';
    return;
  }

  const c = div('mf-modal-inner mf-settings');
  c.setAttribute('data-dashboard-badge', DASHBOARD_PORTAL_BADGE);
  c.appendChild(infoBox('Portal mode makes every signed-in user see ONLY the records they submitted. Admins still see everything; anonymous visitors are blocked. Backed by row-level security on the server.'));

  const isPriv = !!(status.private ?? status.Private);
  const enableRow = div('mf-ai-enable-row');
  enableRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;margin-bottom:6px;';
  const copy = div();
  copy.innerHTML = '<div style="font-weight:600;font-size:13px;color:#0f172a;">Private records (Portal mode)</div><div style="font-size:11px;color:#64748b;margin-top:2px;">Each user sees only their own submissions.</div>';
  mk(enableRow, copy, toggle('portal-private', isPriv));
  c.appendChild(enableRow);

  // End-user portal URL (copyable + open).
  const portalLink = absoluteUrl(String(status.portalUrl || status.PortalUrl || ('/Modules/MegaForm/portal.html?formId=' + formId)));
  const urlField = field('End-user portal page', input('text', 'portal-url', '', portalLink), 'Share this link or pin it to a page. Signed-in users see their own "My Records" here.');
  (urlField.querySelector('#portal-url') as HTMLInputElement).readOnly = true;
  c.appendChild(urlField);

  const footer = div('mf-modal-footer');
  const cancelBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm', 'Cancel') as HTMLButtonElement;
  cancelBtn.type = 'button'; cancelBtn.onclick = () => ov.remove();
  const openBtn = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
  openBtn.href = portalLink; openBtn.target = '_blank'; openBtn.rel = 'noopener';
  openBtn.innerHTML = ic('externalLink', 13) + ' Open portal';
  const saveBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
  saveBtn.type = 'button'; saveBtn.innerHTML = ic('ok', 14) + ' Save';
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.innerHTML = ic('spin', 14) + ' Saving…';
    try {
      const r = await fetch(portalApiUrl('Portal/SetPrivate'), {
        method: 'POST',
        headers: { ...dnnAuthHeaders(), 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        body: JSON.stringify({ formId, enabled: getCheck('portal-private') }),
      });
      const res = await parseJsonResponseSafe(r);
      if (r.ok && (res.success || res.private !== undefined)) {
        toast(getCheck('portal-private') ? 'Portal mode ON — records are now private' : 'Portal mode OFF — records are public', 'success');
        ov.remove();
      } else toast(res.error || res.message || ('Save failed (HTTP ' + r.status + ')'), 'error');
    } catch (e: any) {
      toast((e && e.message) ? e.message : 'Network error', 'error');
    } finally {
      saveBtn.disabled = false; saveBtn.innerHTML = ic('ok', 14) + ' Save';
    }
  };
  mk(footer, cancelBtn, openBtn, saveBtn);
  c.appendChild(footer);

  const mb = ov.querySelector('.mf-modal-body') as HTMLElement;
  mb.innerHTML = ''; mb.appendChild(c);
}

// ─────────────────────────────────────────────────────────────
// AI SETTINGS MODAL  [B84 2026-06-07]
// ─────────────────────────────────────────────────────────────
// Compact provider presets — duplicated (deliberately) from the AI bundle's
// providers.ts because the dashboard does NOT load megaform-ai-form-assistant.js.
// This is config data, not business logic; keeping it inline avoids pulling the
// ~160 KB AI bundle into the dashboard just to render a settings form.
const AI_PROVIDERS: Record<string, { label: string; baseUrl: string; defaultModel: string; helpUrl: string }> = {
  openai:     { label: 'OpenAI',                      baseUrl: 'https://api.openai.com/v1',    defaultModel: 'gpt-4o',             helpUrl: 'https://platform.openai.com/api-keys' },
  claude:     { label: 'Anthropic Claude',            baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5',  helpUrl: 'https://console.anthropic.com/settings/keys' },
  kimi:       { label: 'Kimi (Moonshot.ai)',          baseUrl: 'https://api.moonshot.ai/v1',   defaultModel: 'moonshot-v1-8k',     helpUrl: 'https://platform.moonshot.ai/console/api-keys' },
  openrouter: { label: 'OpenRouter (multi-model)',    baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o',      helpUrl: 'https://openrouter.ai/keys' },
  local:      { label: 'Local (Ollama / LM Studio)',  baseUrl: 'http://localhost:11434/v1',    defaultModel: 'llama3.1',           helpUrl: 'https://ollama.com/' },
  // [B88] Free local provider — shells out to the Claude Code CLI on the server.
  'claude-cli': { label: 'Claude Local CLI (free · no token)', baseUrl: '/api/AiAssistant/LocalCliChat', defaultModel: 'sonnet', helpUrl: 'https://docs.anthropic.com/en/docs/claude-code' },
  custom:     { label: 'Custom OpenAI-compatible',    baseUrl: '',                             defaultModel: '',                   helpUrl: '' },
};

/**
 * Per-platform URL of the AiAssistant DefaultConfig endpoint.
 *   • Oqtane → /api/AiAssistant/DefaultConfig?entityid=<siteId>&entityname=Site
 *   • DNN    → <apiBase>AiAssistant/DefaultConfig?portalId=<n>
 * The Oqtane controller resolves the site id from entityid (AuthEntityId) and
 * falls back to the siteId query, so we send both for robustness.
 */
function aiConfigUrl(): string {
  const cfg = getPlatformHostConfig();
  const platform = String(cfg.platform || '').toLowerCase();
  const pf = ((window as any).__MF_PLATFORM__ || {}) as any;
  const w = window as any;
  const isOqtane = platform === 'oqtane' || !!w.Oqtane || !!w.__OQTANE__ || !!document.querySelector('[data-mf-platform="oqtane"]');
  if (isOqtane) {
    const sid = pf.siteId ?? pf.SiteId ?? pf.portalId ?? 0;
    return '/api/AiAssistant/DefaultConfig?entityid=' + encodeURIComponent(String(sid)) + '&entityname=Site&siteId=' + encodeURIComponent(String(sid));
  }
  const isAspCore = platform === 'aspcore' || platform === 'aspnetcore' || platform === 'web';
  const pid = pf.portalId ?? pf.PortalId ?? 0;
  if (isAspCore) {
    return '/api/AiAssistant/DefaultConfig?portalId=' + encodeURIComponent(String(pid));
  }
  const apiBase = String(cfg.apiBase || (getApiBase() + '/')).replace(/\/?$/, '/');
  return apiBase + 'AiAssistant/DefaultConfig?portalId=' + encodeURIComponent(String(pid));
}

/** Minimal browser→provider connectivity probe (mirrors MF_AI.test()). */
async function aiTestConnection(provider: string, baseUrl: string, model: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    // [B88] Local Claude CLI — baseUrl IS the full endpoint (POST {prompt} →
    // {ok,content,durationMs}); it is server-side + cookie-authed, NOT an
    // OpenAI /chat/completions surface. A quick haiku PONG proves the spawn.
    const isLocalCli = provider === 'claude-cli' || /LocalCliChat/i.test(baseUrl);
    if (isLocalCli) {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...dnnAuthHeaders() },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt: 'Reply with exactly one word and nothing else: PONG', model: 'haiku', timeoutMs: 90000 }),
      });
      const j: any = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) {
        const m = (j && (j.message || j.error)) || (await res.text().catch(() => '')).slice(0, 120);
        return { ok: false, message: 'HTTP ' + res.status + (m ? ' — ' + m : '') };
      }
      const dur = j.durationMs ? ' (' + Math.round(j.durationMs / 100) / 10 + 's)' : '';
      return { ok: true, message: 'Local Claude CLI OK' + dur + ' — replied: ' + String(j.content || '').slice(0, 40) };
    }
    const isAnthropic = provider === 'claude' || /anthropic/i.test(baseUrl);
    if (isAnthropic) {
      const res = await fetch(baseUrl + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
      });
      if (!res.ok) return { ok: false, message: 'HTTP ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 120) };
      return { ok: true, message: 'connection OK' };
    }
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'ping' }] }),
    });
    if (!res.ok) return { ok: false, message: 'HTTP ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 120) };
    return { ok: true, message: 'connection OK' };
  } catch (e: any) {
    return { ok: false, message: (e && e.message) || 'network error' };
  }
}

async function openAiSettings(targetBody?: HTMLElement) {
  if (await guardDemoAction('AI Settings')) return;
  const wrap = div('mf-modal-loading'); wrap.innerHTML = ic('spin', 20) + ' Loading AI settings…';
  const ov = settingsHost(targetBody, 'AI Settings', 'sparkles', wrap, 600);

  let current: any = {};
  try {
    const r = await fetch(aiConfigUrl(), { headers: { ...dnnAuthHeaders(), 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin', cache: 'no-store' });
    current = await parseJsonResponseSafe(r);
    if (!r.ok) throw new Error((current && (current.error || current.message)) || ('HTTP ' + r.status));
  } catch (e: any) {
    (ov.querySelector('.mf-modal-body') as HTMLElement).innerHTML =
      '<div class="mf-modal-err">' + ((e && e.message) || 'Failed to load AI settings.') + '</div>';
    return;
  }

  const c = div('mf-modal-inner mf-settings');
  c.setAttribute('data-dashboard-badge', DASHBOARD_AI_SETTINGS_BADGE);
  c.setAttribute('autocomplete', 'off');
  c.appendChild(infoBox('These AI settings are shared by every admin on this site. The AI chatbot only appears in the Form Builder when "Enable AI Assistant" is on. The API key is stored on the server and returned only to administrators.'));

  // ── Master enable toggle ──────────────────────────────────────────────
  const enableRow = div('mf-ai-enable-row');
  enableRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;margin-bottom:6px;';
  const enableCopy = div();
  enableCopy.innerHTML = '<div style="font-weight:600;font-size:13px;color:#0f172a;">Enable AI Assistant</div><div style="font-size:11px;color:#64748b;margin-top:2px;">Show the AI chatbot in the Form Builder.</div>';
  const enabledNow = !!(current.enabled ?? current.Enabled);
  mk(enableRow, enableCopy, toggle('ai-enabled', enabledNow));
  c.appendChild(enableRow);

  c.appendChild(divider());
  c.appendChild(sectionHead('sparkles', 'AI Provider', 'v20260607-B84'));

  const provSel = select('ai-provider', Object.keys(AI_PROVIDERS).map(k => ({ v: k, l: AI_PROVIDERS[k].label })), String(current.provider || current.Provider || 'openai'));
  const baseInp = input('text', 'ai-base', 'auto from provider', String(current.baseUrl || current.BaseUrl || ''), { autocomplete: 'off', 'data-lpignore': 'true' });
  const modelInp = input('text', 'ai-model', 'auto from provider', String(current.model || current.Model || ''), { autocomplete: 'off', 'data-lpignore': 'true' });
  const keyWrap = pwField('ai-key', 'sk-… / ak-…', undefined, { autocomplete: 'new-password', 'data-lpignore': 'true', 'data-form-type': 'other' });
  const keyInput = keyWrap.querySelector('#ai-key') as HTMLInputElement | null;
  if (keyInput) keyInput.value = String(current.apiKey || current.ApiKey || '');

  c.appendChild(field('Provider', provSel, 'Pick a provider to autofill Base URL + model.'));
  c.appendChild(row2(
    field('Base URL', baseInp, 'Leave blank to use the provider default.'),
    field('Model', modelInp, 'Leave blank to use the provider default.')
  ));
  const keyField = field('API Key', keyWrap);
  const keyHelp = div('mf-field-hint'); keyHelp.id = 'ai-key-help';
  keyField.appendChild(keyHelp);
  c.appendChild(keyField);

  function applyProviderHelp(k: string, autofill: boolean) {
    const p = AI_PROVIDERS[k]; if (!p) return;
    if (autofill) { baseInp.value = p.baseUrl; modelInp.value = p.defaultModel; }
    keyHelp.innerHTML = p.helpUrl
      ? '<a href="' + p.helpUrl + '" target="_blank" rel="noopener" style="color:#4f46e5;">Get ' + p.label + ' API key →</a>'
      : 'Stored on the server (admin-only).';
  }
  provSel.addEventListener('change', () => applyProviderHelp(provSel.value, true));
  applyProviderHelp(provSel.value, false);

  const statusEl = div('mf-ai-status'); statusEl.style.cssText = 'font-size:12px;min-height:16px;margin-top:4px;';
  c.appendChild(statusEl);

  function readBody() {
    return {
      provider: getVal('ai-provider'),
      baseUrl: getVal('ai-base').trim(),
      model: getVal('ai-model').trim(),
      apiKey: getVal('ai-key'),
      enabled: getCheck('ai-enabled'),
    };
  }

  const footer = div('mf-modal-footer');
  const cancelBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm', 'Cancel') as HTMLButtonElement;
  cancelBtn.type = 'button'; cancelBtn.onclick = () => ov.remove();
  const testBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  testBtn.type = 'button'; testBtn.innerHTML = ic('zap', 14) + ' Test';
  testBtn.onclick = async () => {
    const b = readBody();
    if (!b.apiKey) { statusEl.textContent = 'Enter an API key first.'; statusEl.style.color = '#dc2626'; return; }
    const p = AI_PROVIDERS[b.provider] || AI_PROVIDERS.openai;
    const baseUrl = (b.baseUrl || p.baseUrl).replace(/\/+$/, '');
    const model = b.model || p.defaultModel;
    statusEl.textContent = 'Testing…'; statusEl.style.color = '#64748b';
    testBtn.disabled = true;
    try {
      const r = await aiTestConnection(b.provider, baseUrl, model, b.apiKey);
      statusEl.textContent = r.ok ? ('OK · ' + r.message) : ('Failed: ' + r.message);
      statusEl.style.color = r.ok ? '#16a34a' : '#dc2626';
    } finally { testBtn.disabled = false; }
  };
  const saveBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
  saveBtn.type = 'button'; saveBtn.innerHTML = ic('ok', 14) + ' Save AI Settings';
  saveBtn.onclick = async () => {
    saveBtn.disabled = true; saveBtn.innerHTML = ic('spin', 14) + ' Saving…';
    try {
      const r = await fetch(aiConfigUrl(), {
        method: 'POST',
        headers: { ...dnnAuthHeaders(), 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'same-origin',
        body: JSON.stringify(readBody()),
      });
      const res = await parseJsonResponseSafe(r);
      if (r.ok && (res.ok || res.success)) { toast('AI settings saved', 'success'); ov.remove(); }
      else toast(res.error || res.message || ('Save failed (HTTP ' + r.status + ')'), 'error');
    } catch (e: any) {
      toast((e && e.message) ? e.message : 'Network error', 'error');
    } finally {
      saveBtn.disabled = false; saveBtn.innerHTML = ic('ok', 14) + ' Save AI Settings';
    }
  };
  mk(footer, cancelBtn, testBtn, saveBtn);
  c.appendChild(footer);

  const mb = ov.querySelector('.mf-modal-body') as HTMLElement;
  mb.innerHTML = ''; mb.appendChild(c);
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────
function buildSidebar(counts: DashboardData['counts']): HTMLElement {
  const sb = div('mf-sidebar'); sb.setAttribute('data-state','expanded');

  const hd = div('mf-sb-hd');
  const logo = div('mf-sb-logo');
  const li = div('mf-sb-logo-icon'); li.innerHTML=ic('file',18);
  const lc = div('mf-sb-logo-copy');
  lc.innerHTML='<span class="mf-sb-name">MegaForm</span><span class="mf-sb-ver">v2.4.1</span>';
  mk(logo, li, lc); hd.appendChild(logo); sb.appendChild(hd);

  const cnt = div('mf-sb-cnt');

  function group(label: string, items: Array<{title:string;url?:string;icon:string;count?:number;active?:boolean;onClick?:()=>void;demoGuard?:string;fullReload?:boolean}>) {
    const g = div('mf-sb-grp'); g.innerHTML=`<div class="mf-sb-grp-lbl">${label}</div>`;
    const m = div('mf-sb-menu');
    items.forEach(item => {
      let lk: HTMLElement;
      if (item.onClick) {
        lk = el('button',`mf-sb-lk${item.active?' is-active':''}`);
        (lk as HTMLButtonElement).type='button';
        lk.addEventListener('click', item.onClick);
      } else {
        lk = a(`mf-sb-lk${item.active?' is-active':''}`, item.url);
        bindSkinSafeHashLink(lk as HTMLAnchorElement, item.url);
        // [OQIndependentPages v20260502-01] Disable Blazor enhanced-nav for
        // MegaForm shell links so each page (Dashboard/Builder/Submissions/
        // Languages) loads as an independent full-page reload — no shared
        // takeover state, no soft-nav race, no blank-page bug.
        if (item.fullReload) {
          lk.setAttribute('data-enhance-nav', 'false');
        }
      }
      if (item.demoGuard && 'dataset' in lk) {
        const lkEl = lk as HTMLElement;
        lkEl.dataset.demoGuard = item.demoGuard;
        if (readDemoLockAttrSync()) {
          lkEl.classList.add('is-demo-disabled');
          lkEl.setAttribute('aria-disabled', 'true');
          lkEl.title = 'Settings editing is disabled on demo site';
          if (lk instanceof HTMLButtonElement) {
            lk.disabled = false;
            lk.dataset.demoBlocked = '1';
            lk.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              void guardDemoAction(item.title || 'Settings');
            });
          }
          if (lk instanceof HTMLAnchorElement) {
            lk.dataset.demoBlocked = '1';
            lk.href = '#demo-locked';
            lk.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              void guardDemoAction(item.title || 'Settings');
            });
          }
        }
      }
      lk.innerHTML = ic(item.icon,16);
      lk.appendChild(Object.assign(span('mf-sb-lk-lbl'),{textContent:item.title}));
      if (item.count!=null) lk.appendChild(Object.assign(span('mf-sb-lk-cnt'),{textContent:String(item.count)}));
      m.appendChild(lk);
    });
    g.appendChild(m); return g;
  }

  // [OQIndependentPages v20260502-01] MegaForm sidebar links use Oqtane URLs
  // (e.g. /*/37/builder, /*/37/submissions). Blazor's enhanced-nav intercepts
  // these by default → SPA-soft-nav → shared takeover state → blank-page race.
  // We force a full page reload between MegaForm shells so each page is
  // genuinely independent, eliminating the race entirely. Done via the
  // data-enhance-nav="false" attribute applied below to anchors whose URLs
  // hit a MegaForm route.
  // [2026-06-14 nav reorg] Main: form-first. "Dashboard" renamed → "Form Management"
  // and moved to the BOTTOM of Main (it is now the form-admin surface, lower priority
  // than the day-to-day Submissions/My Inbox views per user request).
  cnt.appendChild(group(T('dash.nav_main','Main'),[
    {title:T('dash.nav_form_builder','Form Builder'),url:URLS.builder(),icon:'file',fullReload:true},
    {title:T('dash.nav_submissions','Submissions'),url:URLS.submissions(),icon:'inbox',count:counts?.submissions,fullReload:true},
    {title:T('dash.nav_my_inbox','My Inbox'),url:URLS.myinbox(),icon:'inbox',fullReload:true},
    {title:T('dash.nav_form_management','Form Management'),url:URLS.dashboard(),icon:'dashboard',active:true,fullReload:true},
  ]));
  cnt.appendChild(div('mf-sb-sep'));
  // [2026-06-14 settings consolidation] The 7 separate settings panes are now ONE
  // "Settings" entry → openSettingsPane() (tabs: Database/Payment/Email/Upload/Captcha/
  // AI/Google Sheets). Languages stays a distinct Configuration item.
  const configItems: Array<{title:string;icon:string;onClick?:()=>void;url?:string;demoGuard?:string;fullReload?:boolean}> = [
    {title:T('dash.nav_languages','Languages'),icon:'panel',url:URLS.languages(),fullReload:true},
    {title:T('dash.nav_settings','Settings'),icon:'gear',onClick:()=>openSettingsPane(), demoGuard:'settings'},
  ];
  cnt.appendChild(group(T('dash.nav_config','Configuration'), configItems));
  sb.appendChild(cnt);

  const ft = div('mf-sb-ft');
  const uw = div('mf-sb-uw');
  const ub = div('mf-sb-ub');
  const av = div('mf-sb-av','A');
  const ui = div('mf-sb-ui');
  ui.innerHTML='<span class="mf-sb-uname">Admin</span><span class="mf-sb-urole">Administrator</span>';
  const ch = span('mf-sb-ch'); ch.innerHTML=ic('chevD',14);
  mk(ub, av, ui, ch);
  const dd = div('mf-sb-dd');
  dd.innerHTML = `<a class="mf-sb-dd-item mf-sb-dd-danger" href="${URLS.logout()}">${ic('logout',14)} Log out</a>`;
  mk(uw, ub, dd); ft.appendChild(uw); sb.appendChild(ft);
  ub.addEventListener('click',e=>{e.stopPropagation();dd.classList.toggle('is-open');});
  document.addEventListener('click',()=>dd.classList.remove('is-open'));
  return sb;
}

// ─────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────
function buildHeader(sb: HTMLElement, counts?: DashboardData['counts']): HTMLElement {
  const hd = el('header','mf-hd');
  const tog = el('button','mf-sb-tog'); tog.type='button'; tog.innerHTML=ic('panel',16);
  tog.onclick=()=>{const s=sb.getAttribute('data-state');sb.setAttribute('data-state',s==='expanded'?'collapsed':'expanded');};
  const sep = div('mf-hd-sep');
  const bc = el('nav','mf-bc'); bc.innerHTML='<ol class="mf-bc-list"><li class="mf-bc-page">' + escapeAppHtml(T('dash.nav_form_management','Form Management')) + '</li></ol>';
  // [2026-06-10] Top-header status badges (Admin Console / Live / N forms /
  // N submissions) removed per request — the KPI strip already shows the counts.
  const sp = div('mf-flex1');
  const ac = div('mf-hd-ac');
  const hostCfg = getPlatformHostConfig();
  const closeHref = String(hostCfg.returnUrl || '/').trim() || '/';
  const cb = el('a','mf-btn mf-btn-ghost mf-btn-sm');
  cb.href = closeHref;
  cb.innerHTML = ic('close',14)+' '+T('dash.close','Close');
  const rb = el('button','mf-btn mf-btn-outline mf-btn-sm'); rb.type='button';
  rb.innerHTML=ic('refresh',14)+' '+T('dash.refresh','Refresh'); rb.onclick=()=>location.reload();
  const nb = el('a','mf-btn mf-btn-primary mf-btn-sm');
  nb.innerHTML=ic('plus',14)+' '+T('dash.new_form','New Form');
  // [WizardEntry 2026-06-27] Open the 5-step creation wizard. NO href → a hrefless anchor
  // never navigates (and Blazor enhanced-nav skips it), so the click reliably opens the
  // wizard instead of jumping to the blank builder.
  nb.setAttribute('data-mf-new-form-wizard', '1'); nb.style.cursor = 'pointer';
  nb.onclick = (e) => { e.preventDefault(); openFormCreationWizard(); };
  // [DnnBusinessStarters v20260518-01] Open the App Builder modal — same
  // 3 cards Oqtane Index.razor renders on its "Business Starters" panel.
  // Calls window.MFStarter.launch (DNN shim emitted by dnn-host/index.ts)
  // which POSTs Starter/Launch and redirects.
  const sb2 = el('button','mf-btn mf-btn-outline mf-btn-sm'); sb2.type='button';
  sb2.innerHTML = ic('zap',14) + ' ' + T('dash.business_starters', 'Business Starters');
  sb2.onclick = () => openBusinessStartersModal();
  const aib1 = makeAiCreateBtn();
  mk(ac, cb, rb, sb2, aib1, nb);
  mk(hd, tog, sep, bc, sp, ac);
  return hd;
}

// ─────────────────────────────────────────────────────────────
// [DnnBusinessStarters v20260519-02] Business Starters modal.
// v02 adds:
//   - Live Starter/Status fetch shows installed-state per card
//     (green check, submission count, "Open Board" + "Reseed" CTAs
//     instead of "Launch") so admins do not double-install.
//   - 5th card: Recruitment Pipeline — the first multi-form
//     starter (3 linked forms: Job Posting / Application /
//     Interview Feedback).
// ─────────────────────────────────────────────────────────────
interface StarterStatusItem {
  key: string;
  name: string;
  installed: boolean;
  formId: number;
  formTitle?: string;
  status?: string;
  defaultViewKey?: string;
  submissionCount: number;
  forms?: Array<{ formId: number; title: string; formRole: string; submissionCount: number }>;
}
async function fetchStarterStatus(): Promise<StarterStatusItem[]> {
  const cfg = getPlatformHostConfig();
  const url = String(cfg.apiBase || (getApiBase() + '/')) + 'Starter/Status';
  try {
    const r = await fetch(url, { credentials: 'same-origin', headers: dnnAuthHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j?.items) ? (j.items as StarterStatusItem[]) : [];
  } catch { return []; }
}

async function openBusinessStartersModal(): Promise<void> {
  const platform = (window.__MF_PLATFORM__ || {}) as any;
  const moduleId = Number(platform.moduleId || platform.instanceId || 0);

  const body = div();
  body.style.display = 'grid';
  body.style.gap = '14px';

  const intro = div();
  intro.innerHTML = '<div style="font-size:13px;color:#475569;line-height:1.6">' +
    'Each starter seeds a real form (or set of linked forms), workflow, sample submissions, board views, and role accounts. ' +
    'Already-installed starters show a green check; click <strong>Open Board</strong> to jump in or <strong>Reseed</strong> to wipe + regenerate sample data.' +
    '</div>';
  body.appendChild(intro);

  // Card metadata — UI shape constant. Live install-state comes from Starter/Status.
  type Card = { key: string; title: string; desc: string; icon: string; multiForm?: boolean; formCount?: number };
  const cards: Card[] = [
    { key: 'leave-request',     title: 'Leave Request',       icon: '✈️', desc: 'Employee → Manager → HR approval. Manager + HR boards, register, per-employee card.' },
    { key: 'proposal',          title: 'Proposal',            icon: '📝', desc: 'Requester → Manager → Finance review with workflow inbox + finance board.' },
    { key: 'document-exchange', title: 'Document Exchange',   icon: '📂', desc: 'Cross-team document handoff with revision tracking and approval workflow.' },
    { key: 'purchase-order',    title: 'Purchase Order',      icon: '💼', desc: '5-role / 7-step BPMN sample with conditional CFO branch when amount > 50K.' },
    { key: 'recruitment',       title: 'Recruitment Pipeline', icon: '🧑‍💼', desc: 'Multi-form app: Job Posting → Candidate Application → Interview Feedback. 3 linked forms, shared roles, cross-linked sample data.', multiForm: true, formCount: 3 },
    { key: 'blog',              title: 'Blog Publishing',     icon: '📰', desc: 'Full content app with public views, rich posts, media, readership analytics, comments, SEO/social metadata, legal review, calendar, feed, archive, and lifecycle samples.' },
  ];

  // Loading shell
  const grid = div();
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(260px,1fr))';
  grid.style.gap = '12px';
  body.appendChild(grid);
  modal('Business Starters', 'zap', body, 880);

  // Render once status arrives
  const statusList = await fetchStarterStatus();
  const statusByKey = new Map<string, StarterStatusItem>();
  statusList.forEach(s => statusByKey.set(s.key, s));

  cards.forEach(card => {
    const st = statusByKey.get(card.key);
    const installed = !!(st && st.installed);

    const c = div();
    c.style.padding = '14px';
    c.style.border = installed ? '1px solid #86efac' : '1px solid #e2e8f0';
    c.style.borderRadius = '12px';
    c.style.background = installed
      ? 'linear-gradient(180deg,#f0fdf4 0%,#ffffff 70%)'
      : 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)';
    c.style.display = 'grid';
    c.style.gap = '10px';

    const head = div();
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.gap = '8px';
    let badgeHtml = '';
    if (installed) badgeHtml = '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700">✓ Installed</span>';
    if (card.multiForm) badgeHtml += '<span style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:700;margin-left:6px">' + (card.formCount || 'Multi') + ' forms</span>';
    head.innerHTML = '<span style="font-size:22px">' + card.icon + '</span>' +
      '<strong style="font-size:15px;color:#0f172a">' + card.title + '</strong>' +
      (badgeHtml ? '<span style="margin-left:auto;display:flex;gap:4px">' + badgeHtml + '</span>' : '');
    c.appendChild(head);

    const d = div();
    d.style.fontSize = '12px';
    d.style.color = '#475569';
    d.style.lineHeight = '1.55';
    d.textContent = card.desc;
    c.appendChild(d);

    if (installed && st) {
      const meta = div();
      meta.style.fontSize = '11px';
      meta.style.color = '#166534';
      const formsLabel = (st.forms && st.forms.length > 1)
        ? (st.forms.length + ' forms · ' + st.forms.reduce((sum, f) => sum + (f.submissionCount || 0), 0) + ' submissions')
        : (st.submissionCount + ' submissions · status=' + (st.status || 'Published'));
      meta.textContent = '✓ ' + formsLabel + ' (form #' + st.formId + ')';
      c.appendChild(meta);
    }

    const actions = div();
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.style.flexWrap = 'wrap';

    if (installed && st) {
      // Open Board button
      const openBtn = el('a', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
      const vk = st.defaultViewKey || '';
      const base = window.location.origin + window.location.pathname;
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      openBtn.href = vk ? (base + sep + 'vk=' + encodeURIComponent(vk)) : (base + sep + 'formid=' + st.formId);
      openBtn.innerHTML = ic('externalLink', 14) + ' Open Board';
      actions.appendChild(openBtn);

      // Reseed
      const reseedBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      reseedBtn.type = 'button';
      reseedBtn.innerHTML = ic('refresh', 14) + ' Reseed';
      reseedBtn.title = 'Wipe runtime data and re-seed sample submissions for this starter';
      reseedBtn.onclick = async () => {
        if (!confirm('Reseed will wipe all submissions for this starter and re-create the demo data. Continue?')) return;
        reseedBtn.disabled = true;
        reseedBtn.innerHTML = ic('refresh', 14) + ' Reseeding…';
        try {
          const W = window as any;
          if (!W.MFStarter || typeof W.MFStarter.launch !== 'function') throw new Error('MFStarter shim missing.');
          await W.MFStarter.launch({ starterKey: card.key, moduleId, currentPageUrl: window.location.origin + window.location.pathname, currentUrl: window.location.href });
        } catch (err: any) {
          reseedBtn.disabled = false;
          reseedBtn.innerHTML = ic('refresh', 14) + ' Reseed';
          toast('Reseed failed: ' + (err?.message || String(err)), 'error');
        }
      };
      actions.appendChild(reseedBtn);
    } else {
      // Launch (not installed)
      const launchBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
      launchBtn.type = 'button';
      launchBtn.innerHTML = ic('zap', 14) + ' Launch';
      launchBtn.onclick = async () => {
        launchBtn.disabled = true;
        launchBtn.innerHTML = ic('refresh', 14) + ' Setting up…';
        try {
          const W = window as any;
          if (!W.MFStarter || typeof W.MFStarter.launch !== 'function') throw new Error('MFStarter shim missing.');
          await W.MFStarter.launch({ starterKey: card.key, moduleId, currentPageUrl: window.location.origin + window.location.pathname, currentUrl: window.location.href });
        } catch (err: any) {
          launchBtn.disabled = false;
          launchBtn.innerHTML = ic('zap', 14) + ' Launch';
          toast('Starter setup failed: ' + (err?.message || String(err)), 'error');
        }
      };
      actions.appendChild(launchBtn);
    }
    c.appendChild(actions);
    grid.appendChild(c);
  });

  // [AppBuilderCustomApps v20260519-04] Custom Apps section — anything that
  // isn't one of the 6 built-in starter keys shows here. Admin can create
  // new apps + assign forms + delete via this UI.
  const customSection = div();
  customSection.style.marginTop = '24px';
  customSection.style.paddingTop = '18px';
  customSection.style.borderTop = '1px solid #e2e8f0';
  const customHead = div();
  customHead.style.display = 'flex';
  customHead.style.alignItems = 'center';
  customHead.style.gap = '10px';
  customHead.style.marginBottom = '12px';
  customHead.innerHTML = '<strong style="font-size:15px;color:#0f172a">Custom Apps</strong><span style="font-size:11px;color:#64748b">Define your own app + assign forms to it</span>';
  const createBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  createBtn.type = 'button';
  createBtn.innerHTML = ic('plus',14) + ' New Custom App';
  createBtn.style.marginLeft = 'auto';
  createBtn.onclick = () => openCustomAppEditor(null, body);
  // [B8.A v20260601-01] Starter-kit picker + import-from-zip — round-trip
  // with ExportApp packaging so admins can ship apps between sites.
  const kitsBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  kitsBtn.type = 'button';
  kitsBtn.innerHTML = ic('zap',14) + ' Starter kits';
  kitsBtn.onclick = () => openStarterKitsModal();
  const importBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  importBtn.type = 'button';
  importBtn.innerHTML = ic('upload',14) + ' Import .zip';
  importBtn.onclick = () => openImportAppPicker();
  customHead.appendChild(kitsBtn);
  customHead.appendChild(importBtn);
  customHead.appendChild(createBtn);
  customSection.appendChild(customHead);

  const customGrid = div();
  customGrid.style.display = 'grid';
  customGrid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(260px,1fr))';
  customGrid.style.gap = '12px';
  customGrid.setAttribute('data-role', 'custom-grid');
  customSection.appendChild(customGrid);
  body.appendChild(customSection);
  void refreshCustomAppsGrid(customGrid, body);
}

interface AppDefRow {
  appId: number; appKey: string; appName: string; appScope: string;
  description: string; icon: string; accentColor: string;
  isEnabled: boolean; formCount: number;
}

async function fetchCustomApps(): Promise<AppDefRow[]> {
  const cfg = getPlatformHostConfig();
  const url = String(cfg.apiBase || (getApiBase() + '/')) + 'Phase2/AppDefinitionList';
  try {
    const r = await fetch(url, { credentials: 'same-origin', headers: dnnAuthHeaders() });
    if (!r.ok) return [];
    const j = await r.json();
    // Filter out built-in starter app keys so Custom Apps section shows only user-defined apps
    const builtIn = new Set(['leave-request-starter','proposal-starter','document-exchange-starter','documents-starter','purchase-order-starter','recruitment-starter','blog-starter']);
    return (j.items || []).filter((a: any) => !builtIn.has(a.appKey)) as AppDefRow[];
  } catch { return []; }
}

async function refreshCustomAppsGrid(host: HTMLElement, modalBody: HTMLElement): Promise<void> {
  host.innerHTML = '<div style="font-size:12px;color:#64748b;padding:8px">Loading custom apps…</div>';
  const apps = await fetchCustomApps();
  host.innerHTML = '';
  if (apps.length === 0) {
    const empty = div();
    empty.style.fontSize = '13px';
    empty.style.color = '#94a3b8';
    empty.style.padding = '12px';
    empty.style.border = '1px dashed #e2e8f0';
    empty.style.borderRadius = '10px';
    empty.style.textAlign = 'center';
    empty.textContent = 'No custom apps yet. Click "New Custom App" to define one.';
    host.appendChild(empty);
    return;
  }
  apps.forEach(a => {
    const c = div();
    c.style.padding = '14px';
    c.style.border = '1px solid #e2e8f0';
    c.style.borderRadius = '12px';
    c.style.background = '#ffffff';
    c.style.display = 'grid';
    c.style.gap = '10px';

    const head = div();
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.gap = '8px';
    head.innerHTML = '<span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:' + (a.accentColor || '#6366f1') + '"></span>' +
      '<strong style="font-size:15px;color:#0f172a">' + escapeAppHtml(a.appName) + '</strong>' +
      '<span style="margin-left:auto;display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:700">' + a.formCount + ' form' + (a.formCount === 1 ? '' : 's') + '</span>';
    c.appendChild(head);

    const meta = div();
    meta.style.fontSize = '12px';
    meta.style.color = '#475569';
    meta.style.lineHeight = '1.5';
    meta.innerHTML = (a.description ? escapeAppHtml(a.description) : '<em style="color:#94a3b8">No description</em>') +
      '<div style="margin-top:6px;font-size:11px;color:#64748b">scope: <code>' + escapeAppHtml(a.appScope) + '</code></div>';
    c.appendChild(meta);

    const actions = div();
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    const manageBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
    manageBtn.type = 'button';
    manageBtn.innerHTML = ic('edit',14) + ' Manage';
    manageBtn.onclick = () => openCustomAppEditor(a, modalBody);
    // [B8.A v20260601-01] Export — hits /AiTools/ExportApp and triggers
    // a browser download of the app's manifest .zip.
    const exportBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
    exportBtn.type = 'button';
    exportBtn.innerHTML = ic('download',14) + ' Export';
    exportBtn.onclick = () => exportAppZip(a.appId, a.appName);
    const delBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
    delBtn.type = 'button';
    delBtn.innerHTML = ic('trash',14) + ' Delete';
    delBtn.onclick = async () => {
      if (!confirm('Delete app "' + a.appName + '"? Member forms keep their AppScope (so re-creating restores membership).')) return;
      const cfg = getPlatformHostConfig();
      const url = String(cfg.apiBase || (getApiBase() + '/')) + 'Phase2/AppDefinitionDelete';
      try {
        const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: dnnAuthHeaders(), body: JSON.stringify({ appId: a.appId }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        await refreshCustomAppsGrid(host, modalBody);
      } catch (err: any) { toast('Delete failed: ' + (err?.message || String(err)), 'error'); }
    };
    actions.appendChild(manageBtn);
    actions.appendChild(exportBtn);
    actions.appendChild(delBtn);
    c.appendChild(actions);
    host.appendChild(c);
  });
}

// ──────────────────────────────────────────────────────────────────
//  [B8.A v20260601-01] App package round-trip helpers
//  - exportAppZip → GET /AiTools/ExportApp?appId=N, save .zip blob
//  - openImportAppPicker → file input → POST /AiTools/ImportApp (multipart)
//  - openStarterKitsModal → GET /AiTools/StarterKits → grid → POST
//    /AiTools/InstallStarterKit on click
// ──────────────────────────────────────────────────────────────────
async function exportAppZip(appId: number, appName: string): Promise<void> {
  const cfg = getPlatformHostConfig();
  const url = String(cfg.apiBase || (getApiBase() + '/')) + 'AiTools/ExportApp?appId=' + appId;
  try {
    const r = await fetch(url, { credentials: 'same-origin', headers: dnnAuthHeaders() });
    if (!r.ok) { toast('Export failed: HTTP ' + r.status, 'error'); return; }
    const blob = await r.blob();
    const safeName = String(appName || ('app-' + appId)).replace(/[^\w.\-]+/g, '-').toLowerCase();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'megaform-' + safeName + '.zip';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    toast('Exported ' + safeName + '.zip', 'success');
  } catch (err: any) {
    toast('Export failed: ' + (err?.message || String(err)), 'error');
  }
}

function openImportAppPicker(): void {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.zip,application/zip';
  inp.style.display = 'none';
  inp.onchange = async () => {
    const file = inp.files?.[0]; if (!file) return;
    const cfg = getPlatformHostConfig();
    const url = String(cfg.apiBase || (getApiBase() + '/')) + 'AiTools/ImportApp';
    const fd = new FormData(); fd.append('file', file, file.name);
    try {
      toast('Importing ' + file.name + '…', 'info');
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: dnnAuthHeaders(), body: fd });
      const text = await r.text();
      if (!r.ok) { toast('Import failed: ' + text.slice(0, 160), 'error'); return; }
      const j = JSON.parse(text);
      toast('Imported app "' + (j.appSlug || '?') + '" — ' + (j.forms?.length || 0) + ' forms, ' + (j.tables?.length || 0) + ' tables, ' + (j.kb || 0) + ' KB entries', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (err: any) {
      toast('Import failed: ' + (err?.message || String(err)), 'error');
    }
  };
  document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 30_000);
}

interface StarterKitInfo {
  name: string; slug: string; title: string; color?: string;
  description?: string; formCount: number; tableCount: number; sizeKb: number;
}
async function openStarterKitsModal(): Promise<void> {
  const body = div();
  body.style.display = 'grid';
  body.style.gap = '12px';
  const intro = div();
  intro.innerHTML = '<div style="font-size:13px;color:#475569;line-height:1.6">' +
    'Each kit ships as a manifest .zip. Installing creates the app, its tables, its forms, and any KB entries — safe to re-run (CREATE TABLE is IF NOT EXISTS guarded).' +
    '</div>';
  body.appendChild(intro);
  const grid = div();
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit,minmax(240px,1fr))';
  grid.style.gap = '12px';
  body.appendChild(grid);
  modal('Starter kits', 'zap', body, 820);

  grid.innerHTML = '<div style="font-size:12px;color:#94a3b8;padding:8px">Loading…</div>';
  const cfg = getPlatformHostConfig();
  const url = String(cfg.apiBase || (getApiBase() + '/')) + 'AiTools/StarterKits';
  let kits: StarterKitInfo[] = [];
  try {
    const r = await fetch(url, { credentials: 'same-origin', headers: dnnAuthHeaders() });
    if (r.ok) { const j = await r.json(); kits = Array.isArray(j?.kits) ? j.kits : []; }
  } catch { /* show empty */ }
  grid.innerHTML = '';
  if (!kits.length) {
    grid.innerHTML = '<div style="font-size:13px;color:#94a3b8;padding:12px;border:1px dashed #e2e8f0;border-radius:10px;text-align:center">' +
      'No starter kits found under <code>DesktopModules/MegaForm/starters/</code>. Drop a <code>.zip</code> manifest there to enable.' +
      '</div>';
    return;
  }
  kits.forEach(k => {
    const c = div();
    c.style.padding = '14px';
    c.style.border = '1px solid #e2e8f0';
    c.style.borderRadius = '12px';
    c.style.background = 'linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)';
    c.style.display = 'grid';
    c.style.gap = '8px';
    c.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:' + (k.color || '#6366f1') + '"></span>' +
        '<strong style="font-size:14px;color:#0f172a">' + escapeAppHtml(k.title || k.slug) + '</strong>' +
      '</div>' +
      '<div style="font-size:12px;color:#475569;line-height:1.5">' + escapeAppHtml(k.description || '') + '</div>' +
      '<div style="font-size:11px;color:#64748b">' + k.formCount + ' form' + (k.formCount === 1 ? '' : 's') + ' · ' + k.tableCount + ' table' + (k.tableCount === 1 ? '' : 's') + ' · ' + k.sizeKb + ' KB</div>';
    const installBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
    installBtn.type = 'button';
    installBtn.innerHTML = ic('download',14) + ' Install';
    installBtn.onclick = async () => {
      installBtn.disabled = true; installBtn.innerHTML = '…installing';
      const iUrl = String(cfg.apiBase || (getApiBase() + '/')) + 'AiTools/InstallStarterKit';
      try {
        const r = await fetch(iUrl, { method: 'POST', credentials: 'same-origin', headers: { ...dnnAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: k.name }) });
        const text = await r.text();
        if (!r.ok) throw new Error(text.slice(0, 160));
        const j = JSON.parse(text);
        toast('Installed "' + (j.appSlug || k.slug) + '" — ' + (j.forms?.length || 0) + ' forms, ' + (j.tables?.length || 0) + ' tables', 'success');
        setTimeout(() => location.reload(), 1200);
      } catch (err: any) {
        toast('Install failed: ' + (err?.message || String(err)), 'error');
        installBtn.disabled = false; installBtn.innerHTML = ic('download',14) + ' Install';
      }
    };
    c.appendChild(installBtn);
    grid.appendChild(c);
  });
}

function openCustomAppEditor(existing: AppDefRow | null, parentBody: HTMLElement): void {
  const editorBody = div();
  editorBody.style.display = 'grid';
  editorBody.style.gap = '12px';

  const nameInp = input('text', 'mf-app-name', 'e.g. Recruitment Pipeline', existing?.appName || '');
  const scopeInp = input('text', 'mf-app-scope', 'auto-derived from name', existing?.appScope || '');
  const descInp  = textarea('mf-app-desc', 'What does this app do?', existing?.description || '');
  const iconInp  = input('text', 'mf-app-icon', 'fa-solid fa-...', existing?.icon || '');
  const colorInp = input('color', 'mf-app-color', '', existing?.accentColor || '#6366f1');

  editorBody.appendChild(field('App name', nameInp, 'Display name shown to admins'));
  editorBody.appendChild(field('Scope (key)', scopeInp, 'Forms with this AppScope are members of this app. Blank = auto-derive from name.'));
  editorBody.appendChild(field('Description', descInp, 'Optional, shown on card'));
  editorBody.appendChild(field('Icon (FontAwesome)', iconInp, 'Optional, e.g. fa-solid fa-database'));
  editorBody.appendChild(field('Accent color', colorInp, 'Card swatch'));

  // Form assignment list (only for existing app — needs an appScope to assign against)
  let formsHost: HTMLElement | null = null;
  if (existing) {
    formsHost = div();
    formsHost.style.borderTop = '1px solid #e2e8f0';
    formsHost.style.paddingTop = '12px';
    formsHost.style.marginTop = '4px';
    formsHost.innerHTML = '<strong style="font-size:13px;color:#0f172a;display:block;margin-bottom:8px">Assigned Forms</strong><div style="font-size:12px;color:#64748b">Loading…</div>';
    editorBody.appendChild(formsHost);
  }

  const footer = div();
  footer.style.display = 'flex';
  footer.style.gap = '8px';
  footer.style.marginTop = '6px';
  const saveBtn = el('button','mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
  saveBtn.type = 'button';
  saveBtn.innerHTML = ic('check',14) + ' Save';
  const cancelBtn = el('button','mf-btn mf-btn-ghost mf-btn-sm') as HTMLButtonElement;
  cancelBtn.type = 'button';
  cancelBtn.innerHTML = 'Cancel';

  footer.appendChild(saveBtn);
  footer.appendChild(cancelBtn);
  editorBody.appendChild(footer);

  const editorOverlay = stackedModal(existing ? ('Manage app — ' + existing.appName) : 'New custom app', 'panel', editorBody, 580);

  const refreshParentGrid = async () => {
    const grid = parentBody.querySelector('[data-role="custom-grid"]') as HTMLElement | null;
    if (grid && parentBody.isConnected) await refreshCustomAppsGrid(grid, parentBody);
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    saveBtn.innerHTML = ic('refresh',14) + ' Saving…';
    try {
      const cfg = getPlatformHostConfig();
      const url = String(cfg.apiBase || (getApiBase() + '/')) + 'Phase2/AppDefinitionSave';
      const r = await fetch(url, {
        method: 'POST', credentials: 'same-origin', headers: dnnAuthHeaders(),
        body: JSON.stringify({
          appId: existing?.appId || 0,
          appKey: existing?.appKey || '',
          appName: nameInp.value.trim(),
          appScope: scopeInp.value.trim(),
          description: descInp.value.trim(),
          icon: iconInp.value.trim(),
          accentColor: colorInp.value,
          isEnabled: true,
          sortOrder: 0
        })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('App saved.', 'success');
      editorOverlay.remove();
      await refreshParentGrid();
    } catch (err: any) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = ic('check',14) + ' Save';
      toast('Save error: ' + (err?.message || String(err)), 'error');
    }
  };
  cancelBtn.onclick = () => {
    editorOverlay.remove();
    // Editing an existing app may have toggled form-assignment checkboxes; refresh parent grid so badges update.
    void refreshParentGrid();
  };

  if (existing && formsHost) {
    void renderAssignedForms(existing, formsHost);
  }
}

async function renderAssignedForms(app: AppDefRow, host: HTMLElement): Promise<void> {
  const cfg = getPlatformHostConfig();
  const detailUrl = String(cfg.apiBase || (getApiBase() + '/')) + 'Phase2/AppDefinitionGet?appKey=' + encodeURIComponent(app.appKey);
  // [Form/ListAll-404-fix v20260701] There is no Form/ListAll route; use the
  // scoped Form/List (siteId so ALL site forms are assignable) + Oqtane auth params.
  const _laSite = mfSiteId();
  const _laMod = mfModuleId();
  let allFormsUrl = String(cfg.apiBase || (getApiBase() + '/')) + 'Form/List?siteId=' + _laSite + '&moduleId=' + _laMod;
  if (isOqtanePlatform()) allFormsUrl += _laMod ? '&entityid=' + _laMod + '&entityname=Module' : '&entityid=' + _laSite + '&entityname=Site';
  try {
    const [bundleResp, formsResp] = await Promise.all([
      fetch(detailUrl, { credentials: 'same-origin', headers: dnnAuthHeaders() }),
      fetch(allFormsUrl, { credentials: 'same-origin', headers: dnnAuthHeaders() })
    ]);
    const bundle = await bundleResp.json();
    const all = await formsResp.json();
    const assignedIds = new Set<number>((bundle.forms || []).map((f: any) => f.formId));
    host.innerHTML = '<strong style="font-size:13px;color:#0f172a;display:block;margin-bottom:8px">Assigned Forms (' + assignedIds.size + ')</strong>';

    const list = div();
    list.style.display = 'grid';
    list.style.gap = '4px';
    list.style.maxHeight = '200px';
    list.style.overflowY = 'auto';
    list.style.padding = '6px';
    list.style.border = '1px solid #e2e8f0';
    list.style.borderRadius = '6px';

    (all || []).forEach((f: any) => {
      const formId = f.formId || f.FormId;
      const title = f.title || f.Title;
      const row = div();
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.padding = '4px 6px';
      row.style.fontSize = '12px';
      const cb = document.createElement('input') as HTMLInputElement;
      cb.type = 'checkbox';
      cb.checked = assignedIds.has(formId);
      cb.onchange = async () => {
        const url = String(cfg.apiBase || (getApiBase() + '/')) + 'Phase2/AppDefinitionAssignForm';
        try {
          const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: dnnAuthHeaders(),
            body: JSON.stringify({ formId, appScope: app.appScope, assign: cb.checked }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
        } catch (err: any) {
          toast('Assign error: ' + (err?.message || String(err)), 'error');
          cb.checked = !cb.checked;
        }
      };
      row.appendChild(cb);
      const lbl = document.createElement('span');
      lbl.textContent = '#' + formId + ' ' + title;
      lbl.style.flex = '1';
      row.appendChild(lbl);
      list.appendChild(row);
    });

    host.appendChild(list);
  } catch (err: any) {
    host.innerHTML = '<div style="font-size:12px;color:#dc2626">Error loading forms: ' + escapeAppHtml(String(err?.message || err)) + '</div>';
  }
}

function escapeAppHtml(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────
// STATS
// [DashboardCompactStats v20260507-22] Replaced 4 vertical stat cards
// (~150 px tall, took 1/3 of above-the-fold) with a single horizontal
// pill bar (~46 px). Same icon + label + value, plus the small meta
// hint inline; "live"/"connected" status pulse stays intact. Pillbar
// shape matches the Submissions stats pillbar (v20260507-16) so the
// admin shell feels consistent across both pages.
// ─────────────────────────────────────────────────────────────
// Server-provided KPI strip labels + meta hints arrive as English strings.
// Until a server-side localizer exists, map the known phrases to dash.* keys
// at display time (unknown strings fall through unchanged).
function translateStatText(s: string): string {
  const raw = String(s || '').trim();
  if (!raw || raw === '—') return raw;
  const KEYS: Record<string, string> = {
    'Total Forms': 'dash.stat_total_forms',
    'Submissions': 'dash.stat_submissions',
    'Saved Drafts': 'dash.stat_saved_drafts',
    'Database': 'dash.stat_database',
    'Current Form': 'dash.stat_current_form',
    'Platform': 'dash.stat_platform',
    'No form selected': 'dash.meta_no_form',
    'Shared dashboard shell': 'dash.meta_shared_shell',
    'Recent across this site': 'dash.meta_recent_site',
  };
  if (KEYS[raw]) return T(KEYS[raw], raw);
  // dynamic "N published" meta hint
  const pub = raw.match(/^(\d+)\s+published$/i);
  if (pub) return T('dash.meta_n_published', '{n} published', { n: Number(pub[1]) });
  return raw;
}

function buildStats(stats: DashboardData['stats']): HTMLElement {
  const fb = [
    { label: 'Total Forms', value: '—', meta: '—', icon: 'fa-file' },
    { label: 'Submissions', value: '—', meta: '—', icon: 'fa-message' },
    { label: 'Saved Drafts', value: '—', meta: '—', icon: 'fa-floppy-disk' },
    { label: 'Database',    value: '—', meta: '—', icon: 'fa-database' },
  ];
  // [2026-06-10] Drop the "Platform · <host> · Shared dashboard shell" KPI per
  // request — it exposes internal plumbing, not a user-facing metric.
  const items = (stats.length ? stats : fb).filter(s => {
    const label = String(s.label || '').trim().toLowerCase();
    const meta = String(s.meta || '').trim().toLowerCase();
    return label !== 'platform' && meta !== 'shared dashboard shell';
  });

  const bar = div('mf-stats mf-stats-pillbar');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;'
    + 'border-radius:8px;padding:8px 12px;margin-bottom:10px;align-items:center';
  if (typeof window !== 'undefined') (window as any).__MF_DASHBOARD_COMPACT_STATS_BADGE__ = 'DashboardCompactStats v20260507-22';

  items.forEach((s, i) => {
    const isLive = ['connected', 'online'].includes(String(s.value).toLowerCase());
    const valueColor = isLive ? '#16a34a' : '#0f172a';
    const pill = div('mf-stat-pill');
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;'
      + 'font-size:13px;color:#0f172a;line-height:1.2'
      + (i === 0 ? '' : ';border-left:1px solid #e2e8f0;padding-left:14px;margin-left:2px');

    const iconEl = span(); iconEl.style.cssText = 'color:#64748b;display:inline-flex'; iconEl.innerHTML = ic(siIcon(s.icon), 14);
    const labelEl = span(); labelEl.textContent = translateStatText(s.label); labelEl.style.cssText = 'color:#64748b;font-size:12px';
    const valueEl = span(); valueEl.textContent = String(s.value); valueEl.style.cssText = 'color:' + valueColor + ';font-weight:700';
    pill.appendChild(iconEl); pill.appendChild(labelEl); pill.appendChild(valueEl);

    if (isLive) {
      const dot = span(); dot.className = 'mf-live'; dot.innerHTML = '<span class="mf-lp"></span><span class="mf-lc"></span>';
      pill.appendChild(dot);
    }
    if (s.meta && s.meta !== '—') {
      const metaEl = span(); metaEl.textContent = '· ' + translateStatText(s.meta); metaEl.style.cssText = 'color:#94a3b8;font-size:11px';
      pill.appendChild(metaEl);
    }
    bar.appendChild(pill);
  });
  return bar;
}

// ─────────────────────────────────────────────────────────────
// EMBED CODE MODAL
// ─────────────────────────────────────────────────────────────
function openEmbedModal(formId: number, formTitle: string, viewUrl?: string): void {
  openDashboardEmbedModal({ formId, formTitle, viewUrl });
}


function dashApiBase(): string {
  return document.getElementById('mf-dash-root')?.getAttribute('data-api-base') || API || '/api/MegaForm/';
}

async function deleteDashboardForms(ids: number[]): Promise<void> {
  const apiBase = dashApiBase();
  for (const id of ids) {
    const r = await fetch(`${apiBase}Form/Delete?formId=${id}`, {
      method: 'POST',
      headers: { ...dnnAuthHeaders(), 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ formId: id })
    });
    if (!r.ok) throw new Error(`Delete failed for form ${id}`);
  }
}


// ─────────────────────────────────────────────────────────────
// LOCKED FORMS CARD
// ─────────────────────────────────────────────────────────────
// shared helper — used by buildLockedFormsCard and buildNormalFormsCard
// [NiceTooltips v20260609-B105] One floating, styled tooltip for every dashboard
// button that has a `title` (header actions, app-group buttons, row icons). The
// native title is converted to data-mf-tip (+ aria-label kept for a11y) so the
// slow/ugly browser tooltip is suppressed; the bubble lives on <body> so the
// table's overflow never clips it. Idempotent + re-converts on re-render.
function initNiceTooltips(): void {
  const W = window as any;
  if (W.__mfNiceTips) { W.__mfNiceTips.scan(); return; }
  const SCOPE = '.mf-layout, .mf-card, .mf-modal, .mf-modal-overlay';
  const tip = document.createElement('div');
  tip.className = 'mf-tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let cur: HTMLElement | null = null;

  const convert = (e: Element): void => {
    const t = e.getAttribute('title');
    if (t == null || t === '') return;
    if (!(e as HTMLElement).closest || !(e as HTMLElement).closest(SCOPE)) return;
    e.setAttribute('data-mf-tip', t);
    if (!e.getAttribute('aria-label')) e.setAttribute('aria-label', t);
    e.removeAttribute('title');
  };
  const scan = (rootEl?: ParentNode): void => {
    (rootEl || document).querySelectorAll('[title]').forEach(convert);
  };
  const place = (target: HTMLElement): void => {
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let below = false;
    let top = r.top - th - 9;
    if (top < 6) { top = r.bottom + 9; below = true; }
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    tip.style.top = Math.round(top) + 'px';
    tip.style.left = Math.round(left) + 'px';
    tip.classList.toggle('is-below', below);
    tip.style.setProperty('--tip-arrow', Math.round(r.left + r.width / 2 - left) + 'px');
  };
  const show = (target: HTMLElement): void => {
    const text = target.getAttribute('data-mf-tip');
    if (!text) return;
    cur = target; tip.textContent = text; tip.classList.add('is-visible'); place(target);
  };
  const hide = (): void => { cur = null; tip.classList.remove('is-visible'); };

  document.addEventListener('mouseover', (e) => {
    const t = (e.target as HTMLElement)?.closest?.('[data-mf-tip]') as HTMLElement | null;
    if (t && t !== cur) show(t);
  }, true);
  document.addEventListener('mouseout', (e) => {
    const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
    if (cur && (!related || !related.closest || related.closest('[data-mf-tip]') !== cur)) hide();
  }, true);
  document.addEventListener('click', hide, true);
  window.addEventListener('scroll', () => { if (cur) place(cur); }, true);
  window.addEventListener('resize', hide);

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes' && m.attributeName === 'title') convert(m.target as Element);
      else m.addedNodes.forEach(n => { if (n.nodeType === 1) { convert(n as Element); scan(n as Element); } });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });

  W.__mfNiceTips = { scan };
  scan();
}

function makeIconBtn(title: string, icon: string, cls = 'mf-ic-btn', kind = ''): HTMLButtonElement {
  const btn = el('button', cls) as HTMLButtonElement;
  btn.type = 'button';
  btn.title = title;
  btn.innerHTML = ic(icon, 16);
  if (kind) btn.setAttribute('data-mf-ic-kind', kind);
  return btn;
}

const DASHBOARD_FORMS_PAGE_SIZE = 8;

function buildLockedFormsCard(forms: DashboardData['recentForms']): HTMLElement {
  // ── Same HTML structure as buildNormalFormsCard, amber colors via inline style only ──
  const c = div('mf-card mf-card-locked mf-accordion-card');
  c.style.borderColor = '#fde68a';
  let lockedOpen = false;
  let body: HTMLElement | null = null;

  // Header — identical structure to buildNormalFormsCard
  const ch = div('mf-card-hd');
  ch.style.cssText = 'background:#fef9c3;border-bottom:1px solid #fde68a;';

  const ttlWrap = div('mf-card-ttl-wrap');
  const ct = span('mf-card-ttl');
  ct.style.color = '#92400e';
  ct.innerHTML = ic('shield', 14) + ' ' + T('dash.protected_forms', 'Protected Forms');
  const meta = span('mf-card-meta');
  meta.style.cssText = 'background:#fef3c7;color:#92400e;border-color:#fde68a;';
  meta.textContent = T('dash.n_locked', '{n} locked', { n: forms.length });
  mk(ttlWrap, ct, meta);

  // hdActions — same slot as buildNormalFormsCard, shows a short notice instead of buttons
  const hdActions = div('mf-card-actions');
  const noticeEl = span('');
  noticeEl.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:.8125rem;color:#92400e;';
  noticeEl.innerHTML = ic('lock', 12) + ' ' + T('dash.unlock_hint', 'Unlock a form to edit or delete it.');
  hdActions.appendChild(noticeEl);
  const toggleBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm mf-accordion-toggle') as HTMLButtonElement;
  toggleBtn.type = 'button';
  const updateLockedToggle = () => {
    toggleBtn.innerHTML = ic('chevD', 13) + ' ' + (lockedOpen ? T('dash.hide', 'Hide') : T('dash.show', 'Show'));
    toggleBtn.setAttribute('aria-expanded', lockedOpen ? 'true' : 'false');
    if (body) body.style.display = lockedOpen ? '' : 'none';
    c.classList.toggle('is-open', lockedOpen);
  };
  toggleBtn.addEventListener('click', () => {
    lockedOpen = !lockedOpen;
    updateLockedToggle();
  });
  hdActions.appendChild(toggleBtn);

  mk(ch, ttlWrap, hdActions);
  c.appendChild(ch);

  body = div('mf-card-cnt mf-forms-card-cnt');
  c.appendChild(body);
  updateLockedToggle();

  const state = {
    page: 1,
    pageSize: DASHBOARD_FORMS_PAGE_SIZE,
    forms: (forms || []).slice(),
  };

  function getPagedForms() {
    const items = state.forms.slice();
    const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    return {
      items,
      pageItems: items.slice(start, start + state.pageSize),
      totalPages,
      start,
    };
  }

  function renderTable() {
    const bodyEl = body;
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    meta.textContent = `${state.forms.length} locked`;

    if (!state.forms.length) {
      bodyEl.appendChild(div('mf-empty', 'No protected forms.'));
      return;
    }

    const { items, pageItems, totalPages, start } = getPagedForms();
    const tw = div('mf-tw');
    const t = el('table', 'mf-t');
    const thead = el('thead');
    const hr = el('tr');
    // Identical header columns as buildNormalFormsCard
    ([['Name','mf-th-name'], ['Status','mf-th-status'], ['Submissions','mf-th-fields'], ['Modified','mf-th-modified'], ['Actions','mf-th-actions']] as const).forEach(([h, cls]) => {
      const th = el('th', cls, h);
      hr.appendChild(th);
    });
    thead.appendChild(hr); t.appendChild(thead);

    const tb = el('tbody');
    pageItems.forEach(f => {
      // Use same mf-tr class as normal rows, amber bg via inline style only
      const tr = el('tr', 'mf-tr');
      tr.style.background = '#fffdf5';

      // Name cell — same mf-td-n / mf-td-name as normal, inline amber text color
      const tdN = el('td', 'mf-td-n mf-td-name');
      const nameSpan = span('mf-form-name-link');
      nameSpan.style.cssText = 'color:#78350f;cursor:default;';
      nameSpan.textContent = f.title || `Form #${f.formId}`;
      // Small inline "Protected" pill
      const lockBadge = span('');
      lockBadge.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-left:6px;font-size:10px;font-weight:700;color:#d97706;background:#fef3c7;border:1px solid #fde68a;border-radius:999px;padding:1px 7px;vertical-align:middle;white-space:nowrap;';
      lockBadge.innerHTML = ic('lock', 10) + ' Protected';
      mk(tdN, nameSpan, lockBadge); tr.appendChild(tdN);

      const ts = el('td', 'mf-td-status'); ts.appendChild(badge(f.status || 'draft')); tr.appendChild(ts);
      tr.appendChild(el('td', 'mf-td-m mf-td-fields', String(f.submissions || 0)));
      tr.appendChild(el('td', 'mf-td-m mf-td-modified', f.modified || '—'));

      const ta = el('td', 'mf-td-a mf-td-actions');
      const ag = div('mf-act-grp');

      // View live (always allowed)
      const btnView = makeIconBtn('View live form', 'externalLink');
      btnView.title = f.viewUrl ? `View live: ${f.viewUrl}` : 'View live form';
      btnView.addEventListener('click', () => window.open(getPublicFormUrl(f.formId, false, f.viewUrl), '_blank'));
      ag.appendChild(btnView);

      // View submissions (always allowed)
      const btnSubs = el('a', 'mf-ic-btn') as HTMLAnchorElement;
      btnSubs.title = 'View submissions';
      btnSubs.href = getDashboardShellRoute('submissions', f.formId);
      btnSubs.innerHTML = ic('inboxSm', 13);
      ag.appendChild(btnSubs);

      // Embed code button — always allowed even on demo
      const btnEmbed = makeIconBtn('Get embed & iframe code', 'codeEmbed');
      btnEmbed.addEventListener('click', () => openEmbedModal(f.formId, f.title || `Form #${f.formId}`, f.viewUrl));
      ag.appendChild(btnEmbed);

      // Connect Google Sheet — push each new submission to a sheet as a row.
      const btnGs = makeIconBtn('Connect Google Sheet', 'googleSheet');
      btnGs.addEventListener('click', () => openGoogleSheetConnectForForm(f.formId, f.title || `Form #${f.formId}`));
      ag.appendChild(btnGs);

      // Unlock button — requires confirmation
      const btnUnlock = makeIconBtn('Unlock form (allow edit & delete)', 'unlock', 'mf-ic-btn mf-ic-btn-unlock', 'lock');
      btnUnlock.addEventListener('click', async () => {
        const formTitle = f.title || `Form #${f.formId}`;

        // Block unlock on demo site
        if (await isDemoLocked()) {
          const demoWrap = div('mf-demo-guard-body');
          demoWrap.innerHTML = [
            '<div style="text-align:center;padding:8px 0 16px;">',
              '<div style="width:52px;height:52px;border-radius:14px;background:#fef3c7;display:flex;',
                'align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;">&#128274;</div>',
              '<p style="font-size:15px;font-weight:700;color:var(--fg,#09090b);margin:0 0 8px;">',
                'Unlock disabled on demo site</p>',
              '<p style="font-size:13px;color:var(--muted-fg,#64748b);margin:0;line-height:1.6;">',
                'Form unlock is disabled on the demo site.<br>',
                'Deploy MegaForm on your own server to manage form locks.',
              '</p>',
            '</div>',
            '<div style="display:flex;justify-content:center;margin-top:4px;">',
              '<button type="button" class="mf-btn mf-btn-primary mf-demo-guard-ok">Got it</button>',
            '</div>',
          ].join('');
          const demoOv = modal('Protected Form', 'lock', demoWrap, 420);
          (demoOv.querySelector<HTMLButtonElement>('.mf-demo-guard-ok'))?.addEventListener('click', () => demoOv.remove());
          return;
        }

        // Normal unlock confirmation
        const wrap = div('mf-demo-guard-body');
        wrap.innerHTML = [
          '<div style="text-align:center;padding:8px 0 16px;">',
            '<div style="width:52px;height:52px;border-radius:14px;background:#dcfce7;display:flex;',
              'align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px;">&#128275;</div>',
            '<p style="font-size:15px;font-weight:700;color:var(--fg,#09090b);margin:0 0 8px;">Unlock this form?</p>',
            '<p style="font-size:13px;color:var(--muted-fg,#64748b);margin:0;line-height:1.6;">',
              '<strong>' + formTitle + '</strong> will move back to Recent Forms<br>',
              'where it can be <strong>edited and deleted</strong>.',
            '</p>',
          '</div>',
          '<div style="display:flex;justify-content:center;gap:10px;margin-top:4px;">',
            '<button type="button" class="mf-btn mf-btn-outline mf-btn-sm mf-unlock-cancel-btn">Cancel</button>',
            '<button type="button" class="mf-btn mf-btn-primary mf-btn-sm mf-unlock-confirm-btn">',
              ic('unlock', 13) + ' Yes, Unlock',
            '</button>',
          '</div>',
        ].join('');
        const ov = modal('Unlock Form', 'unlock', wrap, 400);
        (ov.querySelector<HTMLButtonElement>('.mf-unlock-cancel-btn'))?.addEventListener('click', () => ov.remove());
        (ov.querySelector<HTMLButtonElement>('.mf-unlock-confirm-btn'))?.addEventListener('click', async () => {
          ov.remove();
          await unlockForm(f.formId);
          toast(`"${formTitle}" unlocked`, 'success');
          setTimeout(() => location.reload(), 800);
        });
      });
      ag.appendChild(btnUnlock);

      ta.appendChild(ag); tr.appendChild(ta); tb.appendChild(tr);
    });

    t.appendChild(tb); tw.appendChild(t); bodyEl.appendChild(tw);

    if (totalPages > 1) {
      const pager = div('mf-table-pager');
      const pagerMeta = div('mf-table-pager-meta', `Showing <strong>${start + 1}</strong>–<strong>${Math.min(start + pageItems.length, items.length)}</strong> of <strong>${items.length}</strong>`);
      const pagerBtns = div('mf-table-pager-actions');
      const prevBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      prevBtn.type='button'; prevBtn.textContent='Previous'; prevBtn.disabled = state.page <= 1;
      prevBtn.onclick = ()=>{ if(state.page > 1){ state.page--; renderTable(); } };
      const pageBadge = span('mf-page-pill', `Page ${state.page} / ${totalPages}`);
      const nextBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      nextBtn.type='button'; nextBtn.textContent='Next'; nextBtn.disabled = state.page >= totalPages;
      nextBtn.onclick = ()=>{ if(state.page < totalPages){ state.page++; renderTable(); } };
      mk(pagerBtns, prevBtn, pageBadge, nextBtn);
      mk(pager, pagerMeta, pagerBtns);
      bodyEl.appendChild(pager);
    }
  }

  renderTable();
  return c;
}

function sortRecentFormsNewestFirst(forms: DashboardData['recentForms']): DashboardData['recentForms'] {
  return (forms || []).slice().sort((a, b) => {
    const am = Date.parse(a.modified || '') || 0;
    const bm = Date.parse(b.modified || '') || 0;
    if (bm !== am) return bm - am;
    return (b.formId || 0) - (a.formId || 0);
  });
}

function buildForms(forms: DashboardData['recentForms'], appDefinitions: NonNullable<DashboardData['appDefinitions']> = []): HTMLElement {
  const orderedForms = sortRecentFormsNewestFirst(forms);
  // Split locked forms into separate protected section
  const lockedIds = getLockedIds();
  const lockedForms = orderedForms.filter(f => lockedIds.has(f.formId));
  const normalForms = orderedForms.filter(f => !lockedIds.has(f.formId));

  const wrapper = div('mf-forms-wrapper');
  // Locked forms section (rendered first if any exist)
  if (lockedForms.length > 0) {
    wrapper.appendChild(buildLockedFormsCard(lockedForms));
  }
  wrapper.appendChild(buildAppGroupedFormsCard(normalForms, forms.length, appDefinitions));
  return wrapper;
}

type DashboardFormRow = DashboardData['recentForms'][number];
type DashboardAppDefinition = NonNullable<DashboardData['appDefinitions']>[number];
type DashboardAppGroup = { scope: string; app: DashboardAppDefinition | null; forms: DashboardFormRow[] };

function normalizeScope(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function titleizeAppScope(scope: string): string {
  const clean = String(scope || '').replace(/[-_]+/g, ' ').trim();
  if (!clean) return T('dash.standalone_forms','Standalone Forms');
  return clean.replace(/\b\w/g, ch => ch.toUpperCase());
}

function appDefinitionMap(appDefinitions: DashboardAppDefinition[]): Map<string, DashboardAppDefinition> {
  const map = new Map<string, DashboardAppDefinition>();
  (appDefinitions || []).forEach(app => {
    const scope = normalizeScope(app.appScope);
    if (scope && !map.has(scope)) map.set(scope, app);
  });
  return map;
}

function inferFormRole(f: DashboardFormRow): string {
  const explicit = String(f.formRole || '').trim();
  if (explicit) return explicit;
  const title = String(f.title || '').toLowerCase();
  if (title.includes('categor')) return 'Category';
  if (title.includes('comment')) return 'Comments';
  if (title.includes('reader') || title.includes('event')) return 'Events';
  if (title.includes('application')) return 'Application';
  if (title.includes('interview')) return 'Interview';
  if (title.includes('posting') || title.includes('starter') || title.includes('publishing')) return 'Primary';
  return f.isAppPrimary ? 'Primary' : 'Form';
}

function openPrimaryAppForm(forms: DashboardFormRow[]): DashboardFormRow | null {
  if (!forms.length) return null;
  return forms.find(f => /primary/i.test(inferFormRole(f))) || forms.find(f => f.isAppPrimary) || forms.find(f => /starter|publishing|posting|request|proposal|post/i.test(f.title || '')) || forms[0];
}

function openAppAdminPanel(group: DashboardAppGroup): void {
  const primary = openPrimaryAppForm(group.forms);
  const appName = group.app?.appName || group.forms[0]?.appName || titleizeAppScope(group.scope);
  const submissionTotal = group.forms.reduce((sum, f) => sum + (f.submissions || 0), 0);
  const body = div('mf-app-admin-modal');

  const summary = div('mf-app-admin-summary');
  summary.innerHTML = [
    '<div><strong>' + escapeAppHtml(appName) + '</strong><span>Scope: ' + escapeAppHtml(group.scope || 'standalone') + '</span></div>',
    '<div><strong>' + group.forms.length + '</strong><span>forms</span></div>',
    '<div><strong>' + submissionTotal + '</strong><span>submissions</span></div>'
  ].join('');
  body.appendChild(summary);

  const actions = div('mf-app-admin-actions');
  if (primary) {
    const live = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
    live.href = getPublicFormUrl(primary.formId, false, primary.viewUrl);
    live.target = '_blank';
    live.rel = 'noopener';
    live.innerHTML = ic('externalLink', 13) + ' Public View';
    const builder = el('a', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLAnchorElement;
    builder.href = getDashboardShellRoute('builder', primary.formId);
    builder.innerHTML = ic('edit', 13) + ' Edit Primary';
    const subs = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
    subs.href = getDashboardShellRoute('submissions', primary.formId);
    subs.innerHTML = ic('inboxSm', 13) + ' Submissions';
    const theme = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
    theme.href = getDashboardShellRoute('theme', primary.formId);
    theme.innerHTML = ic('gear', 13) + ' Theme';
    mk(actions, live, builder, subs, theme);
  }
  body.appendChild(actions);

  const tableWrap = div('mf-tw');
  const table = el('table', 'mf-t');
  table.innerHTML = '<thead><tr><th class="mf-th-name">Form</th><th class="mf-th-fields">Role</th><th class="mf-th-status">Submissions</th><th class="mf-th-actions">Actions</th></tr></thead>';
  const tb = el('tbody');
  group.forms.forEach(f => {
    const tr = el('tr', 'mf-tr');
    const name = el('td', 'mf-td-n mf-td-name');
    const a = el('a', 'mf-form-name-link', f.title || `Form #${f.formId}`) as HTMLAnchorElement;
    a.href = getDashboardShellRoute('builder', f.formId);
    const id = span('');
    id.style.cssText = 'display:block;margin-top:2px;font-size:11px;color:#94a3b8';
    id.textContent = `#${f.formId}`;
    mk(name, a, id);
    const role = el('td', 'mf-td-m mf-td-fields', inferFormRole(f));
    const subs = el('td', 'mf-td-status', String(f.submissions || 0));
    const act = el('td', 'mf-td-a mf-td-actions');
    act.appendChild(buildFormActions(f));
    mk(tr, name, role, subs, act);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  tableWrap.appendChild(table);
  body.appendChild(tableWrap);

  modal('Manage App', 'settings', body, 760);
}

// [Integration dropdown 2026-06-11] "Push to Custom URL" → open the form's WORKFLOW CANVAS
// so the user adds + configures a Webhook node visually (per user: activate webhook on the
// canvas rather than a blind prompt). The flow tab exposes the Webhook node in the palette.
function openWorkflowCanvasForWebhook(f: DashboardFormRow): void {
  let url = getDashboardShellRoute('builder', f.formId);
  url += (url.includes('?') ? '&' : '?') + 'tab=workflow';
  toast(`Opening the workflow canvas for "${f.title || `Form #${f.formId}`}" — add a Webhook node and set your URL.`, 'success');
  setTimeout(() => { window.location.href = url; }, 300);
}

function buildFormActions(f: DashboardFormRow, onDelete?: (formId: number) => void, onLock?: (formId: number) => void): HTMLElement {
  const ag = div('mf-act-grp');

  const btnView = makeIconBtn(T('dash.view_live_form', 'View live form'), 'externalLink', 'mf-ic-btn', 'view');
  btnView.title = f.viewUrl ? T('dash.view_live_url', 'View live: {url}', { url: f.viewUrl }) : T('dash.view_live_hint', 'View live form (set a custom URL via settings)');
  btnView.addEventListener('click', () => window.open(getPublicFormUrl(f.formId, false, f.viewUrl), '_blank'));
  ag.appendChild(btnView);

  // [Integration dropdown 2026-06-11] Replaces the old "set view URL" action with a
  // submission-destination picker: push new submissions to a Google Sheet OR any custom
  // URL (webhook). Both graft a node onto the form's workflow (Sheets type 25 / Webhook type 3).
  const integ = div('mf-ic-dd'); integ.style.cssText = 'position:relative;display:inline-flex;';
  const integBtn = makeIconBtn(T('dash.send_submissions_to', 'Send submissions to… (Google Sheet / Custom URL)'), 'share', 'mf-ic-btn', 'integration');
  const menu = div('mf-ic-dd-menu');
  // position:fixed + appended to <body> so the menu is NOT clipped by the table wrapper's
  // (.mf-tw) overflow. Coordinates are computed from the trigger button on each open.
  menu.style.cssText = 'position:fixed;z-index:2147483600;min-width:216px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,.16);padding:6px;display:none;';
  const mkItem = (iconKey: string, label: string, sub: string, onClick: () => void): HTMLElement => {
    const it = div('mf-ic-dd-item');
    it.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:8px;cursor:pointer;';
    it.innerHTML = `<span style="color:#4f46e5;flex:none;margin-top:1px">${ic(iconKey,16)}</span><span><span style="display:block;font-size:13px;font-weight:600;color:#0f172a">${label}</span><span style="display:block;font-size:11.5px;color:#64748b">${sub}</span></span>`;
    it.addEventListener('mouseenter', () => { it.style.background = '#f1f5f9'; });
    it.addEventListener('mouseleave', () => { it.style.background = ''; });
    it.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = 'none'; onClick(); });
    return it;
  };
  menu.appendChild(mkItem('googleSheet', T('dash.connect_gsheet', 'Connect to Google Sheet'), T('dash.connect_gsheet_desc', 'Append new submissions to a sheet'), () => openGoogleSheetConnectForForm(f.formId, f.title || `Form #${f.formId}`)));
  menu.appendChild(mkItem('externalLink', T('dash.push_custom_url', 'Push to Custom URL'), T('dash.push_custom_url_desc', 'Open the workflow canvas to add a webhook'), () => openWorkflowCanvasForWebhook(f)));
  document.body.appendChild(menu); // escape the table-wrapper overflow clip
  const positionMenu = (): void => {
    const r = integBtn.getBoundingClientRect();
    const w = menu.offsetWidth || 216;
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)))}px`;
  };
  integBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.style.display === 'block';
    document.querySelectorAll('.mf-ic-dd-menu').forEach(m => { (m as HTMLElement).style.display = 'none'; });
    if (!open) { menu.style.display = 'block'; positionMenu(); }
  });
  // Close on a click OUTSIDE the menu + trigger. Guarded so the opening click itself never
  // self-closes the menu (don't rely on stopPropagation alone).
  document.addEventListener('click', (e) => {
    const t = e.target as Node;
    if (menu.style.display === 'block' && !menu.contains(t) && !integBtn.contains(t) && t !== integBtn) {
      menu.style.display = 'none';
    }
  });
  window.addEventListener('scroll', () => { if (menu.style.display === 'block') menu.style.display = 'none'; }, true);
  mk(integ, integBtn);
  ag.appendChild(integ);

  const btnEdit = el('a', 'mf-ic-btn') as HTMLAnchorElement;
  btnEdit.title = 'Edit in builder';
  btnEdit.href = getDashboardShellRoute('builder', f.formId);
  btnEdit.innerHTML = ic('edit', 16);
  btnEdit.setAttribute('data-mf-ic-kind', 'edit');
  ag.appendChild(btnEdit);

  const btnSubs = el('a', 'mf-ic-btn') as HTMLAnchorElement;
  btnSubs.title = 'View submissions';
  btnSubs.href = getDashboardShellRoute('submissions', f.formId);
  btnSubs.innerHTML = ic('inboxSm', 16);
  btnSubs.setAttribute('data-mf-ic-kind', 'submissions');
  ag.appendChild(btnSubs);

  // [B55 P3 v20260603] Per-form Submission Report popup. Opens a
  // lightweight modal with date range + column picker + CSV export
  // backed by /api/MegaForm/Reports/SubmissionData (which reads the
  // B55 P1 flat MF_SubmissionValues index instead of re-parsing
  // DataJson on every report run).
  //
  // [B59 report-icon-fix] Use the bar-chart glyph (matches the 📊 expectation
  // from the screenshot spec) and prefer window.openSubmissionReport when
  // the dashboard's submission-report module is still warming up.
  const btnReport = makeIconBtn('Open submission report', 'barChart', 'mf-ic-btn', 'report');
  btnReport.addEventListener('click', () => {
    const w = window as any;
    const formTitle = f.title || `Form #${f.formId}`;
    if (typeof w.openSubmissionReport === 'function') {
      try { w.openSubmissionReport(f.formId, formTitle); return; } catch (_e) { /* fall through */ }
    }
    try {
      openSubmissionReport(f.formId, formTitle);
    } catch (_e) {
      alert('Report module loading...');
    }
  });
  ag.appendChild(btnReport);

  // [B86] Portal & row-level access — toggle "private records" mode for this form.
  const btnPortal = makeIconBtn('Portal & access — who can see records', 'users', 'mf-ic-btn', 'portal');
  btnPortal.addEventListener('click', () => openPortalAccess(f.formId, f.title));
  ag.appendChild(btnPortal);

  const btnDel = makeIconBtn('Delete form', 'trash', 'mf-ic-btn mf-ic-btn-danger', 'delete');
  btnDel.addEventListener('click', async () => {
    if (!confirm(`Delete "${f.title || `Form #${f.formId}`}"? This cannot be undone.`)) return;
    try {
      await deleteDashboardForms([f.formId]);
      onDelete?.(f.formId);
      toast('Form deleted', 'success');
    } catch {
      toast('Delete failed — check API', 'error');
    }
  });
  ag.appendChild(btnDel);

  const btnLock = makeIconBtn('Lock this form (protect from edit/delete)', 'lock', 'mf-ic-btn mf-ic-btn-lock', 'lock');
  btnLock.addEventListener('click', async () => {
    if (await guardDemoAction('Form Lock')) return;
    const formTitle = f.title || `Form #${f.formId}`;
    if (!confirm(
      `Lock "${formTitle}"?\n\n` +
      `A locked form is moved to the Protected Forms section.\n` +
      `It cannot be edited or deleted without unlocking first.`
    )) return;
    await lockForm(f.formId);
    onLock?.(f.formId);
    toast(`"${formTitle}" locked`, 'success');
    setTimeout(() => location.reload(), 800);
  });
  ag.appendChild(btnLock);

  return ag;
}

function buildAppGroupedFormsCard(forms: DashboardData['recentForms'], totalAll: number, appDefinitions: DashboardAppDefinition[]): HTMLElement {
  const appMap = appDefinitionMap(appDefinitions);
  const c = div('mf-card');
  const ch = div('mf-card-hd');
  const ttlWrap = div('mf-card-ttl-wrap');
  const ct = span('mf-card-ttl', T('dash.apps_forms', 'Apps & Forms'));
  const meta = span('mf-card-meta', T('dash.n_forms', '{n} forms', { n: forms.length }));
  // [2026-06-10] internal layout-version badge removed from the card title.
  mk(ttlWrap, ct, meta);

  const hdActions = div('mf-card-actions');
  const searchWrap = div('mf-search-wrap');
  const searchInp = input('search', 'mf-recent-forms-search', T('dash.search_forms_ph', 'Search app, form, scope...'));
  searchInp.classList.add('mf-form-search');
  searchInp.setAttribute('aria-label', T('dash.search_forms_aria', 'Search app or form'));
  mk(searchWrap, searchInp);

  const bulkBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  bulkBtn.type = 'button';
  bulkBtn.innerHTML = ic('trash', 13) + ' ' + T('dash.bulk_delete', 'Bulk Delete');
  bulkBtn.title = T('dash.bulk_delete_hint', 'Select forms with the checkboxes, then delete them all at once');
  bulkBtn.disabled = true;

  // [2026-06-17 dedupe-cta] Removed the duplicate "Create with AI" + "New Form"
  // pair from this card toolbar — they already live in the page top-header
  // (buildHeader). Keeping the primary CTAs in only one place (the sticky header,
  // always visible) avoids the doubled buttons the user flagged. This card toolbar
  // now carries only list-specific controls: search + Bulk Delete.
  mk(hdActions, searchWrap, bulkBtn);
  mk(ch, ttlWrap, hdActions);
  c.appendChild(ch);

  const body = div('mf-card-cnt mf-forms-card-cnt');
  c.appendChild(body);

  const state = {
    query: '',
    selected: new Set<number>(),
    forms: (forms || []).slice(),
    busy: false,
  };

  function searchableText(f: DashboardFormRow): string {
    const scope = normalizeScope(f.appScope);
    const app = scope ? appMap.get(scope) : null;
    return [
      f.title,
      f.status,
      f.appScope,
      f.formRole,
      app?.appName,
      app?.appKey,
      app?.description,
    ].join(' ').toLowerCase();
  }

  function filteredForms(): DashboardFormRow[] {
    const q = state.query.trim().toLowerCase();
    if (!q) return state.forms.slice();
    return state.forms.filter(f => searchableText(f).includes(q));
  }

  function groupedForms(): DashboardAppGroup[] {
    const buckets = new Map<string, DashboardFormRow[]>();
    filteredForms().forEach(f => {
      const scope = normalizeScope(f.appScope) || '__standalone__';
      const list = buckets.get(scope) || [];
      list.push(f);
      buckets.set(scope, list);
    });

    return Array.from(buckets.entries()).map(([scope, rows]) => {
      const realScope = scope === '__standalone__' ? '' : scope;
      return { scope: realScope, app: realScope ? (appMap.get(realScope) || null) : null, forms: sortRecentFormsNewestFirst(rows) };
    }).sort((a, b) => {
      if (!a.scope && b.scope) return 1;
      if (a.scope && !b.scope) return -1;
      const as = a.app?.sortOrder ?? 9999;
      const bs = b.app?.sortOrder ?? 9999;
      if (as !== bs) return as - bs;
      return (a.app?.appName || titleizeAppScope(a.scope)).localeCompare(b.app?.appName || titleizeAppScope(b.scope));
    });
  }

  function updateBulkButton(): void {
    const count = state.selected.size;
    bulkBtn.disabled = count === 0 || state.busy;
    bulkBtn.innerHTML = ic('trash', 13) + ' ' + (count ? T('dash.delete_selected', 'Delete Selected ({n})', { n: count }) : T('dash.bulk_delete', 'Bulk Delete'));
  }

  function renderFormTable(groupForms: DashboardFormRow[]): HTMLElement {
    const tw = div('mf-tw');
    const t = el('table', 'mf-t');
    const thead = el('thead');
    const hr = el('tr');

    const thCheck = el('th', 'mf-th-check');
    const checkAll = el('input', 'mf-table-check') as HTMLInputElement;
    checkAll.type = 'checkbox';
    const ids = groupForms.map(f => f.formId);
    checkAll.checked = ids.length > 0 && ids.every(id => state.selected.has(id));
    checkAll.indeterminate = !checkAll.checked && ids.some(id => state.selected.has(id));
    checkAll.addEventListener('change', () => {
      ids.forEach(id => { if (checkAll.checked) state.selected.add(id); else state.selected.delete(id); });
      render();
    });
    thCheck.appendChild(checkAll);
    hr.appendChild(thCheck);
    ([['Form', 'mf-th-name', 'dash.col_form'], ['Role', 'mf-th-fields', 'dash.col_role'], ['Status', 'mf-th-status', 'dash.col_status'], ['Subs', 'mf-th-fields', 'dash.col_subs'], ['Modified', 'mf-th-modified', 'dash.col_modified'], ['Actions', 'mf-th-actions', 'dash.col_actions']] as const).forEach(([h, cls, k]) => { const th = el('th', cls, T(k, h)); if (h === 'Subs') th.title = T('dash.col_subs_title', 'Submissions'); hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);

    const tb = el('tbody');
    groupForms.forEach(f => {
      const tr = el('tr', 'mf-tr');
      if (state.selected.has(f.formId)) tr.classList.add('mf-tr-selected');

      const tdCheck = el('td', 'mf-td-check');
      const rowCheck = el('input', 'mf-table-check') as HTMLInputElement;
      rowCheck.type = 'checkbox';
      rowCheck.checked = state.selected.has(f.formId);
      rowCheck.addEventListener('change', () => {
        if (rowCheck.checked) state.selected.add(f.formId); else state.selected.delete(f.formId);
        render();
      });
      tdCheck.appendChild(rowCheck); tr.appendChild(tdCheck);

      const tdN = el('td', 'mf-td-n mf-td-name');
      const nameLink = el('a', 'mf-form-name-link', f.title || `Form #${f.formId}`);
      nameLink.href = getDashboardShellRoute('builder', f.formId);
      const idHint = span('');
      idHint.style.cssText = 'display:block;margin-top:2px;font-size:11px;color:#94a3b8';
      idHint.textContent = `#${f.formId}`;
      mk(tdN, nameLink, idHint); tr.appendChild(tdN);

      const role = el('td', 'mf-td-m mf-td-fields');
      const rolePill = span('');
      rolePill.style.cssText = 'display:inline-flex;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700;white-space:nowrap';
      const roleVal = inferFormRole(f);
      rolePill.textContent = T('dash.role_' + roleVal.toLowerCase(), roleVal);
      role.appendChild(rolePill); tr.appendChild(role);

      const ts = el('td', 'mf-td-status'); ts.appendChild(badge(f.status || 'draft')); tr.appendChild(ts);
      tr.appendChild(el('td', 'mf-td-m mf-td-fields', String(f.submissions || 0)));
      tr.appendChild(el('td', 'mf-td-m mf-td-modified', f.modified || '—'));

      const ta = el('td', 'mf-td-a mf-td-actions');
      ta.appendChild(buildFormActions(
        f,
        formId => { state.forms = state.forms.filter(x => x.formId !== formId); state.selected.delete(formId); render(); },
        formId => { state.forms = state.forms.filter(x => x.formId !== formId); state.selected.delete(formId); render(); },
      ));
      tr.appendChild(ta);
      tb.appendChild(tr);
    });
    t.appendChild(tb); tw.appendChild(t);
    return tw;
  }

  function renderGroup(group: DashboardAppGroup, index: number): HTMLElement {
    const shell = el('details', 'mf-app-accordion') as HTMLDetailsElement;
    shell.open = !!state.query.trim() || index === 0;
    const head = el('summary', 'mf-app-accordion-summary');

    const accent = String(group.app?.accentColor || group.forms[0]?.appColor || '#2563eb');
    const left = div('mf-app-accordion-left');
    const iconBox = span('mf-app-iconbox');
    iconBox.style.background = accent;
    iconBox.textContent = String(group.app?.icon || group.forms[0]?.appIcon || (group.scope ? titleizeAppScope(group.scope).charAt(0) : 'F')).slice(0, 2).toUpperCase();
    const nameWrap = div('mf-app-namewrap');
    const appName = group.app?.appName || group.forms[0]?.appName || titleizeAppScope(group.scope);
    const desc = group.app?.description || group.forms[0]?.appDescription || (group.scope ? `Scope: ${group.scope}` : T('dash.no_app_assigned', 'Forms not assigned to an app yet.'));
    nameWrap.innerHTML = '<div class="mf-app-title">' + escapeAppHtml(appName) + '</div><div class="mf-app-desc">' + escapeAppHtml(desc) + '</div>';
    mk(left, iconBox, nameWrap);

    const right = div('mf-app-accordion-right');
    const formsBadge = span('mf-card-meta', T('dash.n_forms', '{n} forms', { n: group.forms.length }));
    const submissionTotal = group.forms.reduce((sum, f) => sum + (f.submissions || 0), 0);
    const subsBadge = span('mf-card-meta', Tp('dash.n_submissions', submissionTotal, '{n} submissions'));
    const primary = openPrimaryAppForm(group.forms);
    if (primary) {
      const appActions = div('mf-app-actions');
      appActions.addEventListener('click', ev => ev.stopPropagation());

      const openBtn = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
      openBtn.href = getPublicFormUrl(primary.formId, false, primary.viewUrl);
      openBtn.target = '_blank';
      openBtn.rel = 'noopener';
      openBtn.innerHTML = ic('externalLink', 13) + ' ' + T('dash.open_app', 'Open App');
      openBtn.title = T('dash.open_app_hint', 'Open this app’s live form in a new tab');

      const builderBtn = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
      builderBtn.href = getDashboardShellRoute('builder', primary.formId);
      builderBtn.innerHTML = ic('edit', 13) + ' ' + T('dash.builder', 'Builder');
      builderBtn.title = T('dash.builder_hint', 'Edit this app’s primary form in the builder');

      const subsBtn = el('a', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLAnchorElement;
      // [v20260528-12] App-level Data button scopes the Submission Inbox to
      // every form in this AppScope (e.g. ?mfAppScope=blog). Per-form Data
      // buttons on the form rows below still use ?mfFormId=N. See
      // submission-inbox/runtime.ts:applyScopeFilter().
      subsBtn.href = getDashboardShellRouteScoped('submissions', { appScope: group.scope || '' });
      subsBtn.innerHTML = ic('inboxSm', 13) + ' ' + T('dash.data', 'Data');
      subsBtn.title = T('dash.data_hint', 'View submissions for every form in this app');

      // [v20260528-14] Pin-to-new-page wizard — admin-only one-click that
      // calls Phase2/PinToNewPage to create a new DNN page + MegaForm
      // module + ModuleSettings (FormId / ViewKey / Surface / Inbox scope)
      // so the next visit lands on a clean URL. Only shown when the app
      // has a primary form to pin.
      const pinBtn = el('button', 'mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      pinBtn.type = 'button';
      pinBtn.innerHTML = ic('externalLink', 13) + ' ' + T('dash.pin_to_page', 'Pin to page…');
      pinBtn.title = T('dash.pin_to_page_hint', 'Create a dedicated DNN page (e.g. /Blog/Editorial) pinned to this app');
      pinBtn.addEventListener('click', () => openPinToNewPageModal({
        defaultName: (group.label || group.scope || 'New page'),
        defaultFormId: primary.formId,
        defaultViewKey: '',
        defaultSurface: 'render',
        defaultAppScope: group.scope || '',
      }));

      const manageBtn = el('button', 'mf-btn mf-btn-primary mf-btn-sm') as HTMLButtonElement;
      manageBtn.type = 'button';
      manageBtn.innerHTML = ic('gear', 13) + ' ' + T('dash.manage', 'Manage');
      manageBtn.title = T('dash.manage_hint', 'Manage this app — forms, views, roles & settings');
      manageBtn.addEventListener('click', () => openAppAdminPanel(group));

      // [PinGuard v20260624] "Pin to page" creates a dedicated DNN page via
      // Phase2/PinToNewPage, which has NO Oqtane controller action → clicking
      // it on Oqtane returns 404 ("Create failed: HTTP 404"). Mirror the
      // existing loadPinnedPages() DNN-only guard: only show the button on DNN.
      mk(appActions, openBtn, builderBtn, subsBtn);
      if (String((getPlatformHostConfig().platform || '')).toLowerCase() === 'dnn') mk(appActions, pinBtn);
      mk(appActions, manageBtn);
      right.appendChild(appActions);
    }
    mk(right, formsBadge, subsBadge);
    mk(head, left, right);
    shell.appendChild(head);
    const panel = div('mf-app-accordion-panel');
    panel.appendChild(renderFormTable(group.forms));
    shell.appendChild(panel);
    return shell;
  }

  function render(): void {
    body.innerHTML = '';
    const filtered = filteredForms();
    const groups = groupedForms();
    meta.textContent = T('dash.n_forms', '{n} forms', { n: state.forms.length }) + (state.query.trim() ? ' • ' + T('dash.n_matches', '{n} matches', { n: filtered.length }) : ' • ' + T('dash.n_apps', '{n} apps', { n: groups.filter(g => g.scope).length }));
    updateBulkButton();

    if (!state.forms.length) {
      body.appendChild(div('mf-empty', T('dash.no_forms_yet','No forms yet.')));
      return;
    }
    if (!filtered.length) {
      body.appendChild(div('mf-empty', T('dash.no_match', 'No apps or forms match your search.')));
      return;
    }

    const intro = div('');
    intro.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px;color:#64748b;font-size:12px';
    intro.innerHTML = '<span>' + T('dash.grouped_by', 'Grouped by') + ' <strong>AppScope</strong>. ' + T('dash.grouped_hint', 'Multi-form apps stay together, standalone forms appear at the bottom.') + '</span><span>' + escapeAppHtml(String(totalAll)) + ' ' + T('dash.total_incl_protected', 'total including protected forms') + '</span>';
    body.appendChild(intro);
    groups.forEach((group, index) => body.appendChild(renderGroup(group, index)));
  }

  searchInp.addEventListener('input', () => {
    state.query = searchInp.value || '';
    render();
  });

  bulkBtn.addEventListener('click', async () => {
    if (state.busy || !state.selected.size) return;
    const selectedIds = Array.from(state.selected);
    const selectedForms = state.forms.filter(f => state.selected.has(f.formId));
    const previewNames = selectedForms.slice(0, 3).map(f => `- ${f.title || `Form #${f.formId}`}`).join('\n');
    const extra = selectedForms.length > 3 ? `\n- ...and ${selectedForms.length - 3} more` : '';
    if (!confirm(`Delete ${selectedIds.length} selected form${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.\n\n${previewNames}${extra}`)) return;
    state.busy = true;
    updateBulkButton();
    try {
      await deleteDashboardForms(selectedIds);
      state.forms = state.forms.filter(f => !state.selected.has(f.formId));
      state.selected.clear();
      toast(T('dash.forms_deleted', '{n} form(s) deleted', { n: selectedIds.length }), 'success');
      render();
    } catch {
      toast(T('dash.bulk_delete_failed', 'Bulk delete failed — some forms may remain'), 'error');
    } finally {
      state.busy = false;
      updateBulkButton();
    }
  });

  render();
  // [v20260528-14] Discover pinned pages (one round-trip) so per-form
  // "Open App / Builder / Data" anchors resolve to clean URLs after the
  // first render. The render() above already painted with the legacy
  // querystring routes; once pinned pages load we just re-render.
  void loadPinnedPages().then(() => { try { render(); } catch { /* ignore */ } });
  return c;
}

function buildNormalFormsCard(forms: DashboardData['recentForms'], totalAll: number): HTMLElement {
  const c=div('mf-card');
  const ch=div('mf-card-hd');
  const ttlWrap=div('mf-card-ttl-wrap');
  const ct=span('mf-card-ttl',T('dash.recent_forms','Recent Forms'));
  const meta=span('mf-card-meta',`${forms.length} total`);
  mk(ttlWrap,ct,meta);

  const hdActions=div('mf-card-actions');
  const searchWrap=div('mf-search-wrap');
  // UI FIX: removed searchIcon — the icon overlapped the text making it hard to read
  const searchInp=input('search','mf-recent-forms-search','Search form name...');
  searchInp.classList.add('mf-form-search');
  searchInp.setAttribute('aria-label','Search form name');
  mk(searchWrap,searchInp);

  const bulkBtn=el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
  bulkBtn.type='button';
  bulkBtn.innerHTML=ic('trash',13)+' Bulk Delete';
  bulkBtn.disabled=true;

  const nb=el('a','mf-btn mf-btn-primary mf-btn-sm');
  nb.innerHTML=ic('plus',14)+' New Form';
  nb.setAttribute('data-mf-new-form-wizard', '1'); nb.style.cursor = 'pointer';
  nb.onclick = (e) => { e.preventDefault(); openFormCreationWizard(); };
  const aib3 = makeAiCreateBtn();
  mk(hdActions,searchWrap,bulkBtn,aib3,nb);
  mk(ch,ttlWrap,hdActions); c.appendChild(ch);

  const body=div('mf-card-cnt mf-forms-card-cnt');
  c.appendChild(body);

  const state = {
    page: 1,
    pageSize: DASHBOARD_FORMS_PAGE_SIZE,
    query: '',
    selected: new Set<number>(),
    forms: (forms || []).slice(),
    busy: false,
  };

  function filteredForms() {
    const q = state.query.trim().toLowerCase();
    if (!q) return state.forms.slice();
    return state.forms.filter(f => (f.title || `Form #${f.formId}`).toLowerCase().includes(q));
  }

  function getPagedForms() {
    const items = filteredForms();
    const totalPages = Math.max(1, Math.ceil(items.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    return {
      items,
      pageItems: items.slice(start, start + state.pageSize),
      totalPages,
      start,
    };
  }

  function updateBulkButton() {
    const count = state.selected.size;
    bulkBtn.disabled = count === 0 || state.busy;
    bulkBtn.innerHTML = ic('trash',13) + (count ? ` Delete Selected (${count})` : ' Bulk Delete');
  }



  function renderTable() {
    body.innerHTML='';
    meta.textContent = `${state.forms.length} total` + (state.query.trim() ? ` • ${filteredForms().length} match${filteredForms().length === 1 ? '' : 'es'}` : '');
    updateBulkButton();

    const { items, pageItems, totalPages, start } = getPagedForms();
    if (!state.forms.length) {
      body.appendChild(div('mf-empty',T('dash.no_forms_yet','No forms yet.')));
      return;
    }
    if (!items.length) {
      body.appendChild(div('mf-empty','No forms match your search.'));
      return;
    }

    const tw=div('mf-tw');
    const t=el('table','mf-t');
    const thead=el('thead'); const hr=el('tr');

    const thCheck=el('th','mf-th-check');
    const checkAll=el('input','mf-table-check') as HTMLInputElement;
    checkAll.type='checkbox';
    const pageIds=pageItems.map(f=>f.formId);
    checkAll.checked = pageIds.length > 0 && pageIds.every(id=>state.selected.has(id));
    checkAll.indeterminate = !checkAll.checked && pageIds.some(id=>state.selected.has(id));
    checkAll.addEventListener('change',()=>{
      pageIds.forEach(id=>{ if(checkAll.checked) state.selected.add(id); else state.selected.delete(id); });
      renderTable();
    });
    thCheck.appendChild(checkAll);
    hr.appendChild(thCheck);

    ([['Name','mf-th-name'], ['Status','mf-th-status'], ['Submissions','mf-th-fields'], ['Modified','mf-th-modified'], ['Actions','mf-th-actions']] as const).forEach(([h, cls])=>{ const th=el('th',cls,h); hr.appendChild(th); });
    thead.appendChild(hr); t.appendChild(thead);

    const tb=el('tbody');
    pageItems.forEach(f=>{
      const tr=el('tr','mf-tr');
      if(state.selected.has(f.formId)) tr.classList.add('mf-tr-selected');

      const tdCheck=el('td','mf-td-check');
      const rowCheck=el('input','mf-table-check') as HTMLInputElement;
      rowCheck.type='checkbox';
      rowCheck.checked = state.selected.has(f.formId);
      rowCheck.addEventListener('change',()=>{
        if(rowCheck.checked) state.selected.add(f.formId); else state.selected.delete(f.formId);
        renderTable();
      });
      tdCheck.appendChild(rowCheck); tr.appendChild(tdCheck);

      const tdN=el('td','mf-td-n mf-td-name');
      const nameLink=el('a','mf-form-name-link',f.title||`Form #${f.formId}`);
      nameLink.href=URLS.builder(f.formId);
      tdN.appendChild(nameLink); tr.appendChild(tdN);

      const ts=el('td','mf-td-status'); ts.appendChild(badge(f.status||'draft')); tr.appendChild(ts);
      tr.appendChild(el('td','mf-td-m mf-td-fields',String(f.submissions||0)));
      tr.appendChild(el('td','mf-td-m mf-td-modified',f.modified||'—'));

      const ta=el('td','mf-td-a mf-td-actions');
      const ag=div('mf-act-grp');

      const btnView=makeIconBtn('View live form','externalLink');
      btnView.title = f.viewUrl ? `View live: ${f.viewUrl}` : 'View live form (set a custom URL via ⚙)';
      btnView.addEventListener('click',()=>window.open(getPublicFormUrl(f.formId, false, f.viewUrl),'_blank'));
      ag.appendChild(btnView);

      // "Set View URL" button — DNN/Oqtane only: lets admin configure which page shows this form
      const cfg = getPlatformHostConfig();
      if (cfg.platform === 'dnn' || cfg.platform === 'oqtane') {
        const btnSetUrl = makeIconBtn('Set public view URL for this form', 'settings');
        btnSetUrl.style.cssText = 'opacity:0.6;';
        btnSetUrl.addEventListener('click', () => {
          const existing = f.viewUrl || '';
          const rendererHost = getStoredRendererHostUrl() || normalizeRendererHostUrl(window.location.pathname + (window.location.search || ''));
          const exampleUrl = `${window.location.origin}${rendererHost}${rendererHost.includes('?') ? '&' : '?'}formid=${f.formId}`;
          const entered = window.prompt(
            `Public View URL for "${f.title || `Form #${f.formId}`}"\n\n` +
            `Enter the DNN/Oqtane renderer page URL or a direct view URL for this form.\n` +
            `Example: ${exampleUrl}\n\n` +
            `Leave blank to use the shared renderer host (if configured) or current page fallback.`,
            existing
          );
          if (entered === null) return; // cancelled
          const trimmed = entered.trim();
          saveFormViewUrl(f.formId, trimmed)
            .then(() => {
              f.viewUrl = trimmed || undefined;
              btnView.title = trimmed ? `View live: ${trimmed}` : 'View live form';
              btnSetUrl.style.opacity = trimmed ? '1' : '0.6';
              toast(trimmed ? `View URL saved for "${f.title}"` : 'View URL cleared', 'success');
            })
            .catch((e: Error) => toast(`Save failed: ${e.message}`, 'error'));
        });
        if (f.viewUrl) btnSetUrl.style.opacity = '1';
        ag.appendChild(btnSetUrl);
      }

      const btnEdit=el('a','mf-ic-btn') as HTMLAnchorElement;
      btnEdit.title='Edit in builder';
      btnEdit.href=URLS.builder(f.formId);
      btnEdit.innerHTML=ic('edit',13);
      ag.appendChild(btnEdit);

      const btnSubs=el('a','mf-ic-btn') as HTMLAnchorElement;
      btnSubs.title='View submissions';
      btnSubs.href=URLS.submissions(f.formId);
      btnSubs.innerHTML=ic('inboxSm',13);
      ag.appendChild(btnSubs);

      const btnDel=makeIconBtn('Delete form','trash','mf-ic-btn mf-ic-btn-danger');
      btnDel.addEventListener('click',async ()=>{
        if(state.busy) return;
        if(!confirm(`Delete "${f.title||`Form #${f.formId}`}"? This cannot be undone.`)) return;
        state.busy = true;
        updateBulkButton();
        try {
          await deleteDashboardForms([f.formId]);
          state.forms = state.forms.filter(x=>x.formId!==f.formId);
          state.selected.delete(f.formId);
          toast('Form deleted','success');
          renderTable();
        } catch {
          toast('Delete failed — check API','error');
        } finally {
          state.busy = false;
          updateBulkButton();
        }
      });
      ag.appendChild(btnDel);

      // Lock button — moves form to protected section
      const btnLock = makeIconBtn('Lock this form (protect from edit/delete)', 'lock', 'mf-ic-btn mf-ic-btn-lock', 'lock');
      btnLock.addEventListener('click', async () => {
        if (await guardDemoAction('Form Lock')) return;
        const formTitle = f.title || `Form #${f.formId}`;
        if (!confirm(
          `Lock "${formTitle}"?\n\n` +
          `A locked form is moved to the Protected Forms section.\n` +
          `It cannot be edited or deleted without unlocking first.`
        )) return;
        await lockForm(f.formId);
        toast(`"${formTitle}" locked`, 'success');
        // Reload so the full data reloads fresh from the server
        setTimeout(() => location.reload(), 800);
      });
      ag.appendChild(btnLock);

      ta.appendChild(ag); tr.appendChild(ta); tb.appendChild(tr);
    });

    t.appendChild(tb); tw.appendChild(t); body.appendChild(tw);

    if (totalPages > 1) {
      const pager = div('mf-table-pager');
      const pagerMeta = div('mf-table-pager-meta', `Showing <strong>${start + 1}</strong>–<strong>${Math.min(start + pageItems.length, items.length)}</strong> of <strong>${items.length}</strong>`);
      const pagerBtns = div('mf-table-pager-actions');
      const prevBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      prevBtn.type='button'; prevBtn.textContent='Previous'; prevBtn.disabled = state.page <= 1;
      prevBtn.onclick = ()=>{ if(state.page > 1){ state.page--; renderTable(); } };
      const pageBadge = span('mf-page-pill', `Page ${state.page} / ${totalPages}`);
      const nextBtn = el('button','mf-btn mf-btn-outline mf-btn-sm') as HTMLButtonElement;
      nextBtn.type='button'; nextBtn.textContent='Next'; nextBtn.disabled = state.page >= totalPages;
      nextBtn.onclick = ()=>{ if(state.page < totalPages){ state.page++; renderTable(); } };
      mk(pagerBtns, prevBtn, pageBadge, nextBtn);
      mk(pager, pagerMeta, pagerBtns);
      body.appendChild(pager);
    }
  }

  searchInp.addEventListener('input',()=>{
    state.query = searchInp.value || '';
    state.page = 1;
    renderTable();
  });

  bulkBtn.addEventListener('click',async ()=>{
    if(state.busy || !state.selected.size) return;
    const selectedIds = Array.from(state.selected);
    const selectedForms = state.forms.filter(f=>state.selected.has(f.formId));
    const previewNames = selectedForms.slice(0,3).map(f=>`• ${f.title || `Form #${f.formId}`}`).join('\n');
    const extra = selectedForms.length > 3 ? `\n• ...and ${selectedForms.length - 3} more` : '';
    const ok = confirm(`Delete ${selectedIds.length} selected form${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.\n\n${previewNames}${extra}`);
    if(!ok) return;
    state.busy = true;
    updateBulkButton();
    try {
      await deleteDashboardForms(selectedIds);
      state.forms = state.forms.filter(f=>!state.selected.has(f.formId));
      state.selected.clear();
      toast(`${selectedIds.length} form${selectedIds.length === 1 ? '' : 's'} deleted`,'success');
      renderTable();
    } catch {
      toast('Bulk delete failed — some forms may remain','error');
    } finally {
      state.busy = false;
      updateBulkButton();
    }
  });

  renderTable();
  return c;
}

function buildSubs(submissions: DashboardData['recentSubmissions']): HTMLElement {
  const c=div('mf-card');
  const ch=div('mf-card-hd');
  ch.appendChild(span('mf-card-ttl',T('dash.recent_submissions','Recent Submissions')));
  const allLink=el('a','mf-btn mf-btn-outline mf-btn-sm'); allLink.href=URLS.submissions();
  allLink.innerHTML=ic('externalLink',13)+' All';
  ch.appendChild(allLink);
  c.appendChild(ch);
  const l=div('mf-sub-l');
  if(!submissions.length) l.appendChild(div('mf-empty','No submissions yet.'));
  else submissions.forEach(s=>{
    const it=el('a','mf-sub-it') as HTMLAnchorElement;
    it.href=URLS.submissions(s.formId);
    const lf=div('mf-sub-lf');
    lf.innerHTML=`<p class="mf-sub-n">${s.formTitle||`Form #${s.formId}`}</p><p class="mf-sub-d">${fmtDate(s.submittedOnUtc)}</p>`;
    const rt=div(''); rt.appendChild(badge(s.status||'new'));
    mk(it,lf,rt); l.appendChild(it);
  });
  c.appendChild(l); return c;
}

function normalizeQuickActionHref(title: string, href?: string): string {
  const raw = String(href || '').trim();
  const key = title.toLowerCase();
  if (!raw || raw === '#') {
    if (key.includes('builder')) return URLS.builder();
    if (key.includes('theme')) return URLS.themeDesigner();
    if (key.includes('log')) return URLS.viewLogs();
    if (key.includes('export') || key.includes('submission')) return URLS.submissions();
    if (key.includes('language')) return URLS.languages();
    if (key.includes('captcha')) return '#captcha-settings';
    if (key.includes('setting')) return URLS.dashboard();
    return '#';
  }
  if (raw === '/admin/languages' || raw.startsWith('/admin/languages?')) return URLS.languages();
  if (raw === '/admin/captcha-settings' || raw.startsWith('/admin/captcha-settings?')) return raw;
  if (raw === '#captcha-settings') return raw;
  if (raw.startsWith('/admin') || raw.startsWith('/setup/')) {
    if (key.includes('builder')) return URLS.builder();
    if (key.includes('theme')) return URLS.themeDesigner();
    if (key.includes('log')) return URLS.viewLogs();
    if (key.includes('export') || key.includes('submission')) return URLS.submissions();
    if (key.includes('language')) return URLS.languages();
    if (key.includes('captcha')) return '#captcha-settings';
    if (key.includes('setting')) return URLS.dashboard();
    return raw;
  }
  return raw;
}

function buildQA(actions: DashboardData['quickActions']): HTMLElement {
  const c=div('mf-card');
  const ch=div('mf-card-hd'); ch.appendChild(span('mf-card-ttl','Quick Actions')); c.appendChild(ch);
  const cc=div('mf-card-cnt');
  const g=div('mf-qa-g');
  // UI FIX: Removed 'Settings' from Quick Actions — it links to getPlatformRoute('settings')
  // which on Web resolves to /setup/reset — a destructive reset page. Dangerous on production.
  const fb=[{title:'Form Builder',subtitle:'Create and edit forms',ik:'fedit',href:URLS.builder()},{title:'Languages',subtitle:'Manage widget and control language packs',ik:'panel',href:URLS.languages()},{title:'View Logs',subtitle:'Inspect workflow and runtime logs',ik:'panel',href:URLS.viewLogs()},{title:'Export Data',subtitle:'Download submissions',ik:'dl',href:URLS.submissions()}];
  const rawItems = actions.length ? actions : [];
  const filteredActions = rawItems.filter(qa => !String(qa.title || '').toLowerCase().includes('setting'));
  const items=filteredActions.length?filteredActions.map((qa,i)=>({title:qa.title,subtitle:qa.subtitle||'',ik:['fedit','panel','dl'][i%3],href:normalizeQuickActionHref(qa.title, qa.href)})):fb;
  items.forEach(it=>{
    const btn=el('a','mf-qa-btn'); btn.href=it.href;
    const iw=div('mf-qa-iw'); iw.innerHTML=ic(it.ik,16);
    const cp=div('mf-qa-cp'); cp.innerHTML=`<p class="mf-qa-t">${it.title}</p><p class="mf-qa-s">${it.subtitle}</p>`;
    mk(btn,iw,cp); g.appendChild(btn);
  });
  cc.appendChild(g); c.appendChild(cc); return c;
}

function buildSystem(system: DashboardData['system']): HTMLElement {
  const c=div('mf-card');
  const ch=div('mf-card-hd'); ch.appendChild(span('mf-card-ttl','System')); c.appendChild(ch);
  const cc=div('mf-card-cnt');
  const dl=el('dl','mf-sys-dl');
  const fb=[{key:'Platform',value:'MegaForm Web'},{key:'Version',value:'v1.7'},{key:'Database',value:'SQLite'},{key:'Environment',value:'Production'},{key:'API',value:'v1.0'},{key:'Status',value:'Online'}];
  (system.length?system:fb).forEach(r=>{
    const rw=div('mf-sys-rw');
    const k=el('dt','mf-sys-k',r.key);
    const v=el('dd','mf-sys-v'); v.textContent=r.value;
    if(['online','connected'].includes(r.value.toLowerCase())){const d=div('mf-live');d.innerHTML='<span class="mf-lp"></span><span class="mf-lc"></span>';v.appendChild(d);}
    mk(rw,k,v); dl.appendChild(rw);
  });
  cc.appendChild(dl); c.appendChild(cc); return c;
}

// ─────────────────────────────────────────────────────────────
// RENDER
// ─────────────────────────────────────────────────────────────
function maybeWarnMissingRendererHost(data: DashboardData): void {
  const cfg = getPlatformHostConfig();
  if (cfg.platform !== 'dnn' && cfg.platform !== 'oqtane') return;
  const hasPerFormViewUrl = (data.recentForms || []).some(f => !!String(f.viewUrl || '').trim());
  if (hasPerFormViewUrl || getStoredRendererHostUrl()) return;
  const key = `mf:${cfg.platform}:${cfg.portalId || 0}:renderer-host-warning`;
  try {
    if (window.sessionStorage.getItem(key) === '1') return;
    window.sessionStorage.setItem(key, '1');
  } catch (_error) { }
  toast('Renderer Host is not configured yet. View and embed links will use the current page until you choose a renderer host.', 'info');
}

// [DashClientFormsFetch v20260701] The dashboard normally renders from the
// server-embedded `data-dashboard` blob (BuildDashboardJsonAsync). When that
// blob arrives empty (SSR ran without a resolved site/module context), the
// "Apps & Forms" list, "{n} forms" header and "Total Forms" stat all show 0
// even though forms exist. This client-side fallback fetches the forms itself
// with the correct scope (siteId preferred so ALL site forms show; moduleId as
// a secondary hint) and, on Oqtane, appends entityid/entityname auth params.
function mfSiteId(): number {
  const pf = (window as any).__MF_PLATFORM__ || {};
  const fromCfg = Number(getPlatformHostConfig().portalId || 0) || 0;
  const fromRoot = Number(document.getElementById('mf-dash-root')?.getAttribute('data-site-id') || 0) || 0;
  return Number(pf.siteId ?? pf.portalId ?? 0) || fromCfg || fromRoot || 0;
}
async function fetchDashboardFormsClient(): Promise<DashboardData['recentForms']> {
  try {
    const siteId = mfSiteId();
    const moduleId = mfModuleId();
    if (!siteId && !moduleId) return [];
    let url = dashApiBase() + 'Form/List?siteId=' + siteId + '&moduleId=' + moduleId;
    if (isOqtanePlatform()) {
      url += moduleId
        ? '&entityid=' + moduleId + '&entityname=Module'
        : '&entityid=' + siteId + '&entityname=Site';
    }
    const r = await fetch(url, { credentials: 'same-origin', headers: dnnAuthHeaders(), cache: 'no-store' });
    if (!r.ok) return [];
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return [];
    return arr.map((f: any) => ({
      formId:   Number(f.formId ?? f.FormId ?? 0) || 0,
      title:    String(f.title ?? f.Title ?? '') || ('Form #' + (f.formId ?? f.FormId ?? '')),
      status:   String(f.status ?? f.Status ?? '') || 'Draft',
      modified: String(f.updatedOnUtc ?? f.UpdatedOnUtc ?? f.createdOnUtc ?? f.CreatedOnUtc ?? ''),
    })) as DashboardData['recentForms'];
  } catch { return []; }
}
async function hydrateDashboardFormsIfEmpty(root: HTMLElement, data: DashboardData): Promise<void> {
  if ((data.recentForms || []).length > 0) return;
  const forms = await fetchDashboardFormsClient();
  if (!forms.length) return;
  data.recentForms = forms;
  data.counts = Object.assign({}, data.counts || {}, { forms: forms.length });
  const published = forms.filter(f => String(f.status || '').toLowerCase() === 'published').length;
  const stats = (data.stats && data.stats.length) ? data.stats.slice() : [
    { label: 'Total Forms', value: forms.length, meta: published + ' published', icon: 'file' },
    { label: 'Submissions', value: '—', meta: 'Recent across this site', icon: 'inbox' },
  ];
  const tf = stats.find(s => String(s.label) === 'Total Forms');
  if (tf) { tf.value = forms.length; tf.meta = published + ' published'; }
  data.stats = stats;
  render(root, data);
}

function render(root: HTMLElement, data: DashboardData) {
  // Initialize locked IDs from server data FIRST (cross-device authoritative)
  initServerLockedIds(data.lockedFormIds || []);
  initNiceTooltips();
  // [Integration dropdown 2026-06-11] Purge orphaned per-row dropdown menus appended to
  // <body> by a previous render (their trigger rows are about to be rebuilt below).
  document.querySelectorAll('body > .mf-ic-dd-menu').forEach(m => m.remove());
  root.innerHTML = '';
  document.body.className = 'mf-body';
  const lay = div('mf-layout');
  const sb = buildSidebar(data.counts);
  const inset = div('mf-inset');
  const hd = buildHeader(sb, data.counts);
  const main = el('main','mf-main');
  main.appendChild(buildStats(data.stats||[]));
  const mid = div(''); mid.style.cssText = 'width:100%;display:block;'; mid.appendChild(buildForms(data.recentForms||[], data.appDefinitions||[]));
  main.appendChild(mid);
  // [v20260606] Quick Actions + System cards removed to reduce visual noise
  // const btm = div('mf-g2'); btm.appendChild(buildQA(data.quickActions||[])); btm.appendChild(buildSystem(data.system||[]));
  // main.appendChild(btm);
  mk(inset, hd, main); mk(lay, sb, inset); root.appendChild(lay);
  applyDashboardDemoMode(root);
  // [2026-06-12] Renderer-host info toast removed per user request — not necessary.
  (async () => {
    // [2026-06-14] All settings now live in ONE pane. Cross-surface deep-links (from the
    // Submissions/Languages sidebars) and legacy #x-settings hashes open the pane on the
    // matching tab; #settings opens it on the default (Database) tab.
    const settingsHash: Record<string, string> = {
      '#settings': 'database',
      '#database-settings': 'database',
      '#payment-settings': 'payment',
      '#email-settings': 'email',
      '#upload-settings': 'upload',
      '#captcha-settings': 'captcha',
      '#ai-settings': 'ai',
      '#google-sheets': 'gsheets',
    };
    const tab = settingsHash[location.hash];
    if (tab) openSettingsPane(tab);
  })();
}

// ─────────────────────────────────────────────────────────────
// ENTRY
// ─────────────────────────────────────────────────────────────
(function(){
  'use strict';
  if(!(window as any).MegaForm)(window as any).MegaForm={};
  (window as any).MegaForm.initDashboard = function(root: HTMLElement) {
    API = root.getAttribute('data-api-base') || '/api/MegaForm/';
    // [PAY-2 v20260712] DNN hosts payment endpoints under
    // /DesktopModules/MegaForm/API/payments/* (Web/Oqtane keep the default
    // /api/megaform/payments/). Remap so the dashboard's Stripe/PayPal
    // test buttons hit a real endpoint on DNN.
    if (API.toLowerCase().indexOf('desktopmodules') >= 0) {
      PAY_API = API.replace(/\/?$/, '/') + 'payments/';
    }
    root.id = 'mf-dash-root';  // referenced by delete button
    // [OqtaneSaveFix] Publish the host ids globally so the AI creator (and any
    // other bundle) can resolve module/site context without relying solely on
    // DOM querySelector races after Blazor re-renders.
    try {
      const ds = root.dataset;
      const num = (v: string | undefined) => { const n = parseInt(String(v == null ? '' : v), 10); return isFinite(n) ? n : 0; };
      const plat = String(ds.platform || '').toLowerCase();
      if (plat === 'oqtane') {
        (window as any).__MF_PLATFORM__ = Object.assign({}, (window as any).__MF_PLATFORM__ || {}, {
          platform: 'oqtane',
          apiBase: ds.apiBase || '/api/MegaForm/',
          moduleId: num(ds.moduleId) || ((window as any).__MF_PLATFORM__ || {}).moduleId || 0,
          siteId:   num(ds.siteId)   || num(ds.portalId) || ((window as any).__MF_PLATFORM__ || {}).siteId || 0,
          portalId: num(ds.portalId) || num(ds.siteId)   || ((window as any).__MF_PLATFORM__ || {}).portalId || 0,
          tabId:    num(ds.tabId)    || ((window as any).__MF_PLATFORM__ || {}).tabId || 0,
        });
      }
    } catch { /* non-fatal */ }
    const raw = root.getAttribute('data-dashboard') || '{}';
    const data = parseJson<DashboardData>(raw,{stats:[],recentForms:[],recentSubmissions:[],quickActions:[],system:[],counts:{}});
    // [i18n] Load the page-locale catalog before first paint so wrapped chrome
    // translates (English fallback if it fails). ?mflocale → root culture → detect.
    void (async () => {
      try {
        // detectLocale() resolves ?mflocale → sticky persisted choice → host
        // culture → data-mf-locale → navigator (in that priority), so a user's
        // switcher pick (persisted) correctly wins over the server's en-US default.
        const loc = detectLocale();
        setDir(loc);
        if (loc && loc !== 'en-US') await loadLocale(loc, resolveI18nBase());
      } catch { /* English fallback */ }
      render(root, data);
      // [DashClientFormsFetch v20260701] If the server payload shipped no forms,
      // fetch + re-render them client-side with the correct scope so the list,
      // header count and Total Forms stat populate even when SSR came up empty.
      void hydrateDashboardFormsIfEmpty(root, data);
    })();

    // [P2-#4] Listen for AI app_batch completion in this tab + cross-tab
    // (storage event). The simplest refresh that matches existing
    // dashboard patterns is location.reload(). Debounce by 500ms in case
    // multiple events fire close together.
    let __reloadTimer: any = null;
    function scheduleReload(reason: string) {
      console.log('[dashboard] forms-changed event:', reason, '— scheduling reload');
      if (__reloadTimer) clearTimeout(__reloadTimer);
      __reloadTimer = setTimeout(() => location.reload(), 500);
    }
    window.addEventListener('mfai:forms-changed', (e: any) => scheduleReload('same-tab: ' + JSON.stringify(e?.detail || {})));
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === 'mfai:forms-changed' && e.newValue) scheduleReload('cross-tab: ' + e.newValue);
    });
  };
})();
