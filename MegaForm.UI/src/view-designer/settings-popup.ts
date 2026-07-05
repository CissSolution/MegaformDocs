/**
 * MegaForm Settings popup — unified entry point invoked from any host.
 *
 * Output bundle:  Assets/js/megaform-settings-popup.js
 * Entry:          window.MFSettings.open({ moduleId, currentPageId?, currentPageUrl? })
 *
 * Replaces the in-page Razor settings panel + the Oqtane "Manage Module"
 * tab. Same logic on Web / DNN / Oqtane: load ModuleConfig, edit basics,
 * pick view mode (Form / List / Card), and launch the relevant sub-designer
 * (list-designer.ts or card-designer.ts) for layout work.
 *
 * Sub-designer bundles are loaded lazily via dynamic <script> injection so
 * the initial popup stays small (~6 KB) and admins only pay for the
 * designer they actually open.
 *
 * Badge: SettingsPopup v20260623-B242
 */

// [SecFix 2026-07-05 SEC-B1] Install the same-origin antiforgery header injector as a side effect.
// This bundle POSTs SaveStyle/SaveModuleStyle, which now carry [ValidateAntiForgeryToken] on Oqtane.
// Unlike the dashboard/builder, the settings popup can open on a page that loads ONLY this bundle
// (module ⚙ over a rendered form), so it must install the chokepoint itself or those writes 400.
import '../shared/antiforgery';

import {
  h,
  openPopup,
  htmlEscape,
  deleteFormView,
  getFormViews,
  getModuleConfig,
  saveFormView,
  saveModuleConfig,
  setApiAuthContext,
  fetchSchemaFields,
  getFormThemeLayout,
  saveFormThemeLayout,
  saveFormInheritFlags,
  getModuleStyle,
  saveModuleStyle,
  type FormViewFetchResult,
  type FormViewOption,
  type AppSummaryOption,
  type AppQueryOption,
  type ModuleConfig,
  type SaveFormViewPayload,
  type FieldDef,
} from './shared';
import {
  buildStarterPreset,
  getStarterPresets,
  type ViewStarterMode,
  type ViewStarterPresetPayload,
} from './presets';

const BADGE = 'SettingsPopup v20260626-B281';
if (typeof window !== 'undefined') (window as any).__MF_SETTINGS_POPUP_BADGE__ = BADGE;

// [i18n B280 2026-06-26] Settings pane localization. The popup loads AFTER
// megaform-i18n.js (Index.razor Resource order), so the global engine is present
// and its active-locale catalog is loaded. T(key, english) reads through that
// global — translated when the key exists for the active locale, otherwise the
// baked-in English fallback (never blanks, never bundles a 2nd i18n copy). New
// keys live under the `vd.set.*` namespace in public/i18n/*.json.
function T(key: string, fallback: string, params?: Record<string, string | number>): string {
  try {
    const eng = (window as any).MegaFormI18n;
    if (eng && typeof eng.t === 'function') {
      const o = eng.t(key, params);
      if (o && o !== key) return o;
    }
  } catch { /* engine not ready — fall through to English */ }
  let raw = fallback;
  if (params) for (const p in params) raw = raw.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]));
  return raw;
}

export interface SettingsOpts {
  moduleId: number;
  siteId?: number;
  currentPageId?: number;
  currentPageUrl?: string;
  inline?: boolean;
  inlineHostId?: string;
  inlineHost?: HTMLElement | string;
  onSaved?: (cfg: ModuleConfig) => void;
}

// ─── Theme & Layout presets (form-level, synced with Theme Designer) ──────────
// [ThemeInSettings 2026-06-23] 16 presets mirror the Theme Designer left rail
// (builder/theme-left-rail.ts) 1:1. Selecting one writes the full --mf-* color
// palette into the form's themeCssOverrides + settings.theme=id, so the form
// actually re-themes AND the Theme Designer shows the same selection.
interface MfPreset { id: string; name: string; colors: string[]; badge: string; category: string; }
const MF_PRESETS: MfPreset[] = [
  { id: 'default',  name: 'Default',  colors: ['#3b82f6', '#1e293b', '#f8fafc', '#e2e8f0'], badge: '',    category: 'minimal' },
  { id: 'ocean',    name: 'Ocean',    colors: ['#0ea5e9', '#0c4a6e', '#f0f9ff', '#bae6fd'], badge: '',    category: 'nature'  },
  { id: 'forest',   name: 'Forest',   colors: ['#22c55e', '#14532d', '#f0fdf4', '#bbf7d0'], badge: '',    category: 'nature'  },
  { id: 'sunset',   name: 'Sunset',   colors: ['#f97316', '#7c2d12', '#fff7ed', '#fed7aa'], badge: '',    category: 'warm'    },
  { id: 'lavender', name: 'Lavender', colors: ['#a855f7', '#581c87', '#faf5ff', '#e9d5ff'], badge: '',    category: 'elegant' },
  { id: 'midnight', name: 'Midnight', colors: ['#6366f1', '#1e1b4b', '#eef2ff', '#c7d2fe'], badge: 'Pro', category: 'dark'    },
  { id: 'rose',     name: 'Rose',     colors: ['#ec4899', '#831843', '#fdf2f8', '#fbcfe8'], badge: 'Pro', category: 'elegant' },
  { id: 'amber',    name: 'Amber',    colors: ['#f59e0b', '#78350f', '#fffbeb', '#fde68a'], badge: '',    category: 'warm'    },
  { id: 'slate',    name: 'Slate',    colors: ['#64748b', '#0f172a', '#f8fafc', '#cbd5e1'], badge: '',    category: 'minimal' },
  { id: 'emerald',  name: 'Emerald',  colors: ['#10b981', '#064e3b', '#ecfdf5', '#a7f3d0'], badge: 'Pro', category: 'nature'  },
  { id: 'coral',    name: 'Coral',    colors: ['#fb7185', '#881337', '#fff1f2', '#fecdd3'], badge: 'New', category: 'warm'    },
  { id: 'cyber',    name: 'Cyber',    colors: ['#22d3ee', '#164e63', '#ecfeff', '#a5f3fc'], badge: 'New', category: 'modern'  },
  { id: 'carbon',   name: 'Carbon',   colors: ['#18181b', '#3f3f46', '#27272a', '#52525b'], badge: 'Pro', category: 'dark'    },
  { id: 'arctic',   name: 'Arctic',   colors: ['#0891b2', '#155e75', '#ecfeff', '#cffafe'], badge: '',    category: 'minimal' },
  { id: 'berry',    name: 'Berry',    colors: ['#c026d3', '#701a75', '#fdf4ff', '#f5d0fe'], badge: 'New', category: 'elegant' },
  { id: 'earth',    name: 'Earth',    colors: ['#a16207', '#713f12', '#fefce8', '#fef08a'], badge: '',    category: 'nature'  },
];

// Color var keys a preset owns — so switching presets REPLACES the palette cleanly
// (without leaking stale color vars). Layout vars (--mf-form-*) are intentionally NOT here.
const MF_PRESET_COLOR_VAR_KEYS = [
  '--mf-primary', '--mf-primary-hover', '--mf-primary-light', '--mf-btn-bg', '--mf-btn-bg-hover',
  '--mf-btn-hover-bg', '--mf-input-focus-border', '--mf-check-color', '--mf-progress-fill',
  '--mf-btn-color', '--mf-btn-text', '--mf-color-text-inverse', '--mf-secondary', '--mf-text',
  '--mf-title-color', '--mf-label-color', '--mf-form-bg', '--mf-input-bg', '--mf-page-bg',
  '--mf-border', '--mf-input-border-color',
];

// Map a preset's 4 swatch colors → the full --mf-* palette the runtime renderer consumes.
// c0 primary, c1 ink/text, c2 surface/bg, c3 accent/border.
function mfPresetColorVars(p: MfPreset): Record<string, string> {
  const c0 = p.colors[0] || '#3b82f6';
  const c1 = p.colors[1] || '#1e293b';
  const c2 = p.colors[2] || '#ffffff';
  const c3 = p.colors[3] || c0;
  const white = '#ffffff';
  return {
    '--mf-primary': c0, '--mf-primary-hover': c0, '--mf-primary-light': c0 + '26',
    '--mf-btn-bg': c0, '--mf-btn-bg-hover': c0, '--mf-btn-hover-bg': c0,
    '--mf-input-focus-border': c0, '--mf-check-color': c0, '--mf-progress-fill': c0,
    '--mf-btn-color': white, '--mf-btn-text': white, '--mf-color-text-inverse': white,
    '--mf-secondary': c1, '--mf-text': c1, '--mf-title-color': c1, '--mf-label-color': c1,
    '--mf-form-bg': c2, '--mf-input-bg': c2, '--mf-page-bg': c2,
    '--mf-border': c3, '--mf-input-border-color': c3,
  };
}

// Read an integer px value from an overrides map, falling back to a default.
function mfReadPx(overrides: Record<string, string>, key: string, fallback: number): number {
  const raw = overrides[key];
  if (raw == null) return fallback;
  const n = parseInt(String(raw).replace(/[^0-9.-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function enterInlineSettingsMode(inlineHost: HTMLElement | string | undefined): (() => void) | undefined {
  const host = typeof inlineHost === 'string'
    ? document.getElementById(inlineHost)
    : inlineHost;
  if (!host) return undefined;

  const scope = host.parentElement || document.body;
  const scopedSurface = Array.from(scope.querySelectorAll<HTMLElement>('.mf-oq-surface.is-fs'))
    .find((el) => !el.contains(host));
  const surface = scopedSurface || document.querySelector<HTMLElement>('.mf-oq-surface.is-fs');
  if (!surface) return undefined;

  const hadFs = surface.classList.contains('is-fs');
  const hadInline = surface.classList.contains('is-inline');
  const htmlHadDashboardActive = document.documentElement.classList.contains('mf-oq-dashboard-active');
  const bodyHadDashboardActive = document.body.classList.contains('mf-oq-dashboard-active');
  let oldFsPreference: string | null | undefined;
  try {
    oldFsPreference = localStorage.getItem('mf-surface-fs');
    localStorage.setItem('mf-surface-fs', '0');
  } catch {
    oldFsPreference = undefined;
  }

  surface.classList.remove('is-fs');
  surface.classList.add('is-inline');
  surface.setAttribute('data-mf-settings-inline-surface', '1');
  document.documentElement.classList.remove('mf-oq-dashboard-active');
  document.body.classList.remove('mf-oq-dashboard-active');
  try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }

  return () => {
    if (surface.isConnected) {
      surface.classList.toggle('is-fs', hadFs);
      surface.classList.toggle('is-inline', hadInline);
      surface.removeAttribute('data-mf-settings-inline-surface');
    }
    document.documentElement.classList.toggle('mf-oq-dashboard-active', htmlHadDashboardActive);
    document.body.classList.toggle('mf-oq-dashboard-active', bodyHadDashboardActive);
    try {
      if (oldFsPreference === null) localStorage.removeItem('mf-surface-fs');
      else if (typeof oldFsPreference === 'string') localStorage.setItem('mf-surface-fs', oldFsPreference);
    } catch { /* ignore */ }
    try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
  };
}

function getBundleBase(): string {
  const w = window as any;
  if (typeof w.__MF_BUNDLE_BASE__ === 'string' && w.__MF_BUNDLE_BASE__) return w.__MF_BUNDLE_BASE__;
  // Best-effort: derive from this script's own URL
  try {
    const scripts = Array.from(document.scripts);
    const me = scripts.find((s) => s.src && /megaform-settings-popup\.js/i.test(s.src));
    if (me?.src) return me.src.replace(/megaform-settings-popup\.js.*$/, '');
  } catch { /* ignore */ }
  return '/Modules/MegaForm/js/';
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = Array.from(document.scripts).find((s) => s.src === src);
    if (existing) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureDesigner(kind: 'list' | 'card'): Promise<void> {
  const w = window as any;
  if (kind === 'list' && w.MFListDesigner) return;
  if (kind === 'card' && w.MFCardDesigner) return;
  const base = getBundleBase();
  const file = kind === 'list' ? 'megaform-view-designer-list.js' : 'megaform-view-designer-card.js';
  await loadScript(base + file);
}

export async function open(opts: SettingsOpts): Promise<void> {
  if (!opts.moduleId || opts.moduleId <= 0) {
    alert(T('vd.set.module_required', 'MegaForm Settings: moduleId is required.'));
    return;
  }

  const loadingBody = h('div', { style: { padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' } }, T('vd.set.loading', 'Loading module configuration…'));
  const inlineHost = opts.inline ? (opts.inlineHost || opts.inlineHostId) : undefined;
  const restoreInlineSettingsMode = opts.inline ? enterInlineSettingsMode(inlineHost) : undefined;
  const popup = openPopup({
    title: T('vd.set.title', 'MegaForm Settings'),
    // [B281 2026-06-26] Subtitle dropped — it was redundant chrome; the title alone is enough.
    body: loadingBody,
    width: '960px',
    height: 'auto',
    hideSave: true,
    inlineHost,
    onClose: restoreInlineSettingsMode,
  });

  const response = await getModuleConfig(opts.moduleId, opts.siteId);
  if (!response) {
    popup.body.innerHTML = '';
    popup.body.appendChild(h('div', { class: 'mf-vd-error', style: { margin: '24px' } },
      T('vd.set.load_failed', 'Could not load module configuration (module #{id}). Make sure you have edit permission.', { id: opts.moduleId })));
    return;
  }

  let current: ModuleConfig = { ...(response.config || { moduleId: opts.moduleId, formId: 0 }), moduleId: opts.moduleId };
  if (opts.currentPageId) current.currentPageId = opts.currentPageId;
  if (opts.currentPageUrl) current.currentPageUrl = opts.currentPageUrl;
  // [FormOnlySettings v20260621] Match the inline Oqtane settings panel: module
  // settings binds one form and its submit display behavior only. List/Card/ListView
  // are managed by dedicated saved views/surfaces, not this module settings entry.
  current.viewMode = 'form';
  current.viewType = 'submit';
  current.selectedViewKey = '';
  // Carry siteId on the config so list/card designers can save without
  // needing to know about the popup-level siteId hint.
  const resolvedSiteId = (opts.siteId && opts.siteId > 0) ? opts.siteId : (response.siteId > 0 ? response.siteId : 0);
  setApiAuthContext(opts.moduleId, resolvedSiteId);
  if (resolvedSiteId > 0) current.siteId = resolvedSiteId;

  let formFields: FieldDef[] = current.formId ? await fetchSchemaFields(current.formId) : [];
  let formViewsState: FormViewFetchResult = current.formId ? await getFormViews(current.formId) : { ok: true, status: 0, views: [] };
  let formViews: FormViewOption[] = formViewsState.views;
  let currentApp: AppSummaryOption | null = formViewsState.app || null;
  let currentQueries: AppQueryOption[] = formViewsState.queries || [];
  let formTitle = (response.forms || []).find((f) => f.formId === current.formId)?.title || '';
  // [ThemeInSettings 2026-06-23] Working copy of the SELECTED form's theme + layout,
  // loaded from the form and saved back to it (Form/SaveTheme) on "Save module settings".
  let themeFormId = 0;
  let themeState = 'default';
  let themeOverrides: Record<string, string> = {};
  let themeDirty = false;
  // [B274] Page-theme inheritance flags (form-level). Editable here so admins don't need to open
  // the full Theme Designer. Saved to the FORM (saveFormInheritFlags) on "Save module settings".
  let themeInheritType = false;
  let themeInheritColors = false;
  let inheritDirty = false;
  let themeLayoutExpanded = true;
  let themeStatus = '';
  await loadFormTheme(current.formId);
  let moduleBase = captureModuleBaseState(current);
  let draftSavedViewName = '';
  let draftSavedViewKey = '';
  let draftSavedViewQueryKey = '';
  let draftSavedViewIsDefault = false;
  let editingSavedViewId = 0;
  let editingSavedViewOriginalKey = '';
  let savedViewStatus = '';
  let savedViewError = '';
  let namedViewsExpanded = false;
  let basicsExpanded = true;
  let viewModeExpanded = true;
  let modeSettingsExpanded = true;
  let rendererExpanded = false;
  let listViewGeneralExpanded = true;
  let listViewFieldsExpanded = false;
  let listViewTemplatesExpanded = false;
  let listViewAdvancedExpanded = false;

  // ── Build body ───────────────────────────────────────────────────────────
  popup.body.innerHTML = '';

  const wrap = h('div', { class: 'mf-vd-settings-wrap' });
  popup.body.appendChild(wrap);

  // [SettingsPopupResilient v20260508-05] Wrap each section in try/catch so a
  // single throw doesn't strip the rest of the popup (was happening: a runtime
  // error inside buildListViewModePanel killed the whole popup body, leaving
  // only the basics section visible). Failed sections render an inline error
  // banner so admin can see what went wrong + report it.
  function rerender(): void {
    wrap.innerHTML = '';
    appendSafe('Module form',  buildBasicsSection);
    appendSafe('Theme & Layout', buildThemeLayoutSection);
    appendSafe('Current Form settings', buildFormSettingsSection);
    // [SettingsSimplify v20260623-B236] Renderer host + page binding are
    // internal routing concepts now. Keep their builders/helpers available for
    // backward compatibility, but do not expose those accordions in Settings.
  }
  function appendSafe(label: string, builder: () => HTMLElement): void {
    try {
      const el = builder();
      if (el) wrap.appendChild(el);
    } catch (err) {
      const msg = (err && (err as any).message) || String(err);
      console.error('[MegaForm Settings] section "' + label + '" failed:', err);
      const errBlock = h('div', { style: {
        margin: '8px 0', padding: '12px 16px',
        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
        color: '#991b1b', fontSize: '13px',
      } }, '⚠ "' + label + '" section could not render: ' + msg);
      wrap.appendChild(errBlock);
    }
  }

  function buildFormSettingsSection(): HTMLElement {
    current.viewMode = 'form';
    current.viewType = 'submit';
    current.selectedViewKey = '';
    const popupMode = String(current.displayMode || 'fixed').toLowerCase() === 'popup';
    return buildAccordion(
      T('vd.set.form_settings', 'Current Form settings'),
      T('vd.set.form_settings_meta', 'Display mode and popup behavior for submit view.'),
      buildFormModePanel(),
      modeSettingsExpanded,
      (open) => { modeSettingsExpanded = open; },
      accordionAutoStyle(popupMode ? 'clamp(430px, 58vh, 640px)' : '220px')
    );
  }

  function normalizePopupTriggerType(value: any): 'time_delay' | 'scroll_depth' | 'click_trigger' {
    const v = String(value || '').trim().toLowerCase();
    return v === 'scroll_depth' || v === 'click_trigger' ? v : 'time_delay';
  }

  function intInRange(value: any, min: number, max: number, fallback: number): number {
    const n = parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function currentFormIdForSnippet(): number {
    const id = Number(current.formId || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function sampleButtonHtml(): string {
    return `<button type="button" data-mf-open-form="${currentFormIdForSnippet()}" class="mf-open-form-btn">Open form</button>`;
  }

  function sampleStickyLeftHtml(): string {
    return [
      `<button type="button" data-mf-open-form="${currentFormIdForSnippet()}"`,
      '        style="position:fixed;left:0;top:45%;transform:translateY(-50%) rotate(-90deg);',
      '               transform-origin:left center;background:#4f46e5;color:#fff;border:0;',
      '               padding:10px 18px;border-radius:0 0 10px 10px;font-weight:700;cursor:pointer;z-index:9999;">',
      '  Feedback',
      '</button>',
    ].join('\n');
  }

  function sampleStickyRightHtml(): string {
    return [
      `<button type="button" data-mf-open-form="${currentFormIdForSnippet()}"`,
      '        style="position:fixed;right:0;top:45%;transform:translateY(-50%) rotate(90deg);',
      '               transform-origin:right center;background:#0f172a;color:#fff;border:0;',
      '               padding:10px 18px;border-radius:0 0 10px 10px;font-weight:700;cursor:pointer;z-index:9999;">',
      '  Contact us',
      '</button>',
    ].join('\n');
  }

  function buildPopupSnippet(label: string, code: string): HTMLElement {
    let copyTimer: number | undefined;
    const copyBtn = h('button', {
      type: 'button',
      class: 'mf-vd-btn mf-vd-btn-ghost',
      style: {
        padding: '4px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        lineHeight: '1.2',
      },
      onclick: async (e: Event) => {
        e.preventDefault();
        const btn = e.currentTarget as HTMLElement;
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = T('vd.set.copied', 'Copied');
          if (copyTimer) window.clearTimeout(copyTimer);
          copyTimer = window.setTimeout(() => { btn.textContent = T('vd.set.copy', 'Copy'); }, 1100);
        } catch {
          btn.textContent = T('vd.set.select_text', 'Select text');
          if (copyTimer) window.clearTimeout(copyTimer);
          copyTimer = window.setTimeout(() => { btn.textContent = T('vd.set.copy', 'Copy'); }, 1400);
        }
      },
    }, T('vd.set.copy', 'Copy'));

    return h('div', {
      style: {
        display: 'grid',
        gap: '6px',
        padding: '8px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
      },
    },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        },
      },
        h('strong', { style: { fontSize: '12px', color: '#0f172a' } }, label),
        copyBtn,
      ),
      h('pre', {
        style: {
          margin: '0',
          padding: '8px',
          maxHeight: '76px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          background: '#0f172a',
          color: '#e2e8f0',
          borderRadius: '6px',
          fontSize: '11px',
          lineHeight: '1.35',
          fontFamily: 'Cascadia Code, Consolas, monospace',
        },
      }, code),
    );
  }

  function buildPopupTriggerSamples(): HTMLElement {
    return h('div', {
      style: {
        display: 'grid',
        gap: '8px',
        padding: '10px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '10px',
      },
    },
      h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        },
      },
        h('strong', { style: { fontSize: '12px', color: '#0f172a' } }, T('vd.set.sample_triggers', 'Sample HTML triggers')),
        h('code', {
          style: {
            fontSize: '11px',
            color: '#4f46e5',
            background: '#eef2ff',
            padding: '3px 6px',
            borderRadius: '6px',
          },
        }, 'data-mf-open-form'),
      ),
      h('div', { class: 'mf-vd-help', style: { marginTop: '-2px', color: '#64748b' } },
        T('vd.set.sample_triggers_help', 'Paste one snippet into an HTML module or page to open this popup form.')),
      buildPopupSnippet(T('vd.set.sample_button', 'Button'), sampleButtonHtml()),
      buildPopupSnippet(T('vd.set.sample_sticky_left', 'Sticky tab - left edge'), sampleStickyLeftHtml()),
      buildPopupSnippet(T('vd.set.sample_sticky_right', 'Sticky tab - right edge'), sampleStickyRightHtml()),
    );
  }

  function setBodyStyles(target: HTMLElement, styles?: Record<string, string | number>): void {
    if (!styles) return;
    Object.entries(styles).forEach(([k, v]) => { (target.style as any)[k] = String(v); });
  }

  function buildAccordion(
    title: string,
    meta: string,
    content: HTMLElement,
    isOpen: boolean,
    onToggle: (open: boolean) => void,
    bodyStyles?: Record<string, string | number>,
  ): HTMLElement {
    const details = h('details', { class: 'mf-vd-details' }) as HTMLDetailsElement;
    if (isOpen) details.open = true;

    const toggleText = h('span', {
      style: {
        fontSize: '11px',
        fontWeight: '700',
        color: '#6366f1',
        whiteSpace: 'nowrap',
      },
    }, isOpen ? T('vd.set.collapse', 'Collapse') : T('vd.set.expand', 'Expand'));

    const summary = h('summary', {},
      h('div', {
        style: {
          display: 'grid',
          gap: '2px',
          minWidth: '0',
          flex: '1 1 auto',
        },
      },
        h('span', {
          style: {
            fontSize: '13px',
            fontWeight: '700',
            color: '#0f172a',
          },
        }, title),
        meta
          ? h('span', {
            style: {
              fontSize: '11px',
              fontWeight: '500',
              color: '#64748b',
              lineHeight: '1.4',
              whiteSpace: 'normal',
            },
          }, meta)
          : null,
      ),
      toggleText,
    );

    const body = h('div', { class: 'mf-vd-details-body' });
    setBodyStyles(body, bodyStyles);
    body.appendChild(content);
    details.append(summary, body);
    details.addEventListener('toggle', () => {
      toggleText.textContent = details.open ? T('vd.set.collapse', 'Collapse') : T('vd.set.expand', 'Expand');
      onToggle(details.open);
    });
    return details;
  }

  function accordionScrollStyle(height: string, extra?: Record<string, string | number>): Record<string, string | number> {
    return {
      height,
      maxHeight: height,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarGutter: 'stable',
      ...extra,
    };
  }

  function accordionAutoStyle(maxHeight: string, extra?: Record<string, string | number>): Record<string, string | number> {
    return {
      maxHeight,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarGutter: 'stable',
      ...extra,
    };
  }

  function modeLabel(mode: string): string {
    switch (mapSavedViewToMode(mode)) {
      case 'listview': return 'ListView';
      case 'list': return 'List';
      case 'card': return 'Card';
      default: return 'Form';
    }
  }

  function applyStarterPresetStatus(preset: ViewStarterPresetPayload): void {
    savedViewError = '';
    savedViewStatus = `Applied starter preset "${preset.name}". ${preset.source}.`;
  }

  function buildStarterPresetBlock(
    mode: ViewStarterMode,
    onApply: (preset: ViewStarterPresetPayload) => void,
  ): HTMLElement {
    const presets = getStarterPresets(mode);
    if (!presets.length) return h('div');

    let selectedId = presets[0].id;
    const info = h('div', {
      class: 'mf-vd-help',
      style: { fontSize: '11px', lineHeight: '1.55', color: '#475569' },
    });
    const sourceLine = h('div', {
      style: { marginTop: '4px', fontSize: '11px', color: '#64748b' },
    });

    const renderMeta = (): void => {
      const def = presets.find((entry) => entry.id === selectedId) || presets[0];
      info.textContent = def?.description || '';
      sourceLine.textContent = def?.source ? `Source note: ${def.source}` : '';
    };

    const sel = h('select', {
      class: 'mf-vd-input',
      onchange: (e: Event) => {
        selectedId = String((e.target as HTMLSelectElement).value || presets[0].id);
        renderMeta();
      },
    }) as HTMLSelectElement;
    presets.forEach((preset) => {
      sel.appendChild(h('option', { value: preset.id }, preset.name));
    });

    const applyBtn = h('button', {
      type: 'button',
      class: 'mf-vd-btn mf-vd-btn-primary',
      disabled: !formFields.length ? '' : null,
      onclick: () => {
        const preset = buildStarterPreset(mode, selectedId, formFields);
        if (!preset) return;
        onApply(preset);
      },
    }, 'Apply starter preset');

    renderMeta();

    return h('div', {
      style: {
        display: 'grid',
        gap: '10px',
        padding: '12px',
        background: '#ffffff',
        border: '1px solid #dbeafe',
        borderRadius: '12px',
      },
    },
      h('div', { style: { display: 'grid', gap: '6px' } },
        h('label', {}, 'Starter templates'),
        sel,
        info,
        sourceLine,
      ),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        applyBtn,
        h('span', { style: { fontSize: '11px', color: '#64748b' } },
          'Presets fill the current mode with a safe starting layout. You can fine-tune it afterward.')
      ),
    );
  }

  function summarizeCurrentForm(): string {
    if (!current.formId || current.formId <= 0) return T('vd.set.no_form_selected', 'No module form selected yet.');
    const title = formTitle || T('vd.set.form_n', 'Form #{id}', { id: current.formId });
    return `${title} (#${current.formId})`;
  }

  function summarizeViewMode(): string {
    const pieces: string[] = [modeLabel(current.viewMode || current.viewType || 'form')];
    if (current.selectedViewKey) {
      pieces.push(`Pinned: ${current.selectedViewKey}`);
    } else {
      const defaultView = formViews.find((v) => !!v.isDefault && isSupportedSavedView(v.viewType));
      if (defaultView) pieces.push(`Default: ${defaultView.viewName || defaultView.viewKey}`);
    }
    return pieces.join(' · ');
  }

  function summarizeRendererHost(): string {
    const pieces: string[] = [];
    pieces.push(current.useCurrentPageAsRendererHost ? 'Uses current page as renderer host' : 'Renderer host optional');
    if (current.cssClass) pieces.push(`CSS: ${current.cssClass}`);
    return pieces.join(' · ');
  }

  function resetSavedViewDraft(): void {
    draftSavedViewName = '';
    draftSavedViewKey = '';
    draftSavedViewQueryKey = '';
    draftSavedViewIsDefault = false;
    editingSavedViewId = 0;
    editingSavedViewOriginalKey = '';
  }

  function restoreModuleBaseToCurrent(): void {
    current = { ...current, ...cloneModuleBaseState(moduleBase) };
  }

  function syncSavedViewStateAfterCatalogChange(): void {
    if (current.selectedViewKey && !formViews.some((v) => v.viewKey === current.selectedViewKey)) {
      current.selectedViewKey = '';
      modeSettingsExpanded = true;
    }
    if (editingSavedViewId > 0 && !formViews.some((v) => (v.viewId || 0) === editingSavedViewId)) {
      resetSavedViewDraft();
    }
  }

  function parseObjectJson(raw: string | undefined | null): any {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function loadSavedViewIntoEditor(view: FormViewOption): void {
    const mode = mapSavedViewToMode(view.viewType);
    current.viewMode = mode;
    current.viewType = mode === 'form' ? 'submit' : mode;

    const cfg = parseObjectJson(view.configJson || '{}') || {};
    if (mode === 'listview') {
      current.listViewSettingsJson = view.configJson || '{}';
    } else if (mode === 'list') {
      current.listFields = String(cfg.listFields ?? cfg.ListFields ?? current.listFields ?? '');
      current.listTemplate = String(view.customHtml || cfg.listTemplate || cfg.ListTemplate || '');
    } else if (mode === 'card') {
      current.cardFields = String(cfg.cardFields ?? cfg.CardFields ?? current.cardFields ?? '');
      current.cardTemplate = String(view.customHtml || cfg.cardTemplate || cfg.CardTemplate || '');
    }
  }

  function beginEditingSavedView(view: FormViewOption): void {
    loadSavedViewIntoEditor(view);
    namedViewsExpanded = true;
    draftSavedViewName = String(view.viewName || '').trim();
    draftSavedViewKey = String(view.viewKey || '').trim();
    draftSavedViewQueryKey = String(view.queryKey || '').trim();
    draftSavedViewIsDefault = !!view.isDefault;
    editingSavedViewId = view.viewId || 0;
    editingSavedViewOriginalKey = view.viewKey || '';
    savedViewStatus = `Loaded named view "${view.viewName || view.viewKey}" into the editor.`;
    savedViewError = '';
  }

  async function reloadFormViewsForCurrentForm(): Promise<void> {
    formViewsState = current.formId ? await getFormViews(current.formId) : { ok: true, status: 0, views: [] };
    formViews = formViewsState.views;
    currentApp = formViewsState.app || null;
    currentQueries = formViewsState.queries || [];
    syncSavedViewStateAfterCatalogChange();
  }

  // ── Theme & Layout (form-level, synced with Theme Designer) ────────────────
  async function loadFormTheme(formId: number): Promise<void> {
    themeFormId = formId || 0;
    themeState = 'default';
    themeOverrides = {};
    themeDirty = false;
    themeStatus = '';
    themeInheritType = false;
    themeInheritColors = false;
    inheritDirty = false;
    if (!formId || formId <= 0) return;
    // [ModuleStyle v20260624-B262] Load the MODULE's owned CSS for this form (server seeds it from
    // the form's CSS on first open / when the module was bound to a different form). The form-level
    // getFormThemeLayout is kept as a fallback if the module endpoint is unavailable (older host).
    let res = await getModuleStyle(opts.moduleId, formId);
    if (!res.ok && (res.status === 0 || res.status === 404)) res = await getFormThemeLayout(formId);
    if (res.ok) {
      themeState = res.theme || 'default';
      themeOverrides = { ...res.overrides };
    } else if (res.status > 0) {
      themeStatus = `Could not load current theme (HTTP ${res.status}).`;
    }
    // [B274] The inherit flags are FORM-level (not in the module style) — read them from the form.
    const formLayout = await getFormThemeLayout(formId);
    if (formLayout.ok) {
      themeInheritType = !!formLayout.inheritType;
      themeInheritColors = !!formLayout.inheritColors;
    }
  }

  function setLayoutVar(key: string, value: string): void {
    if (value == null || value === '') delete themeOverrides[key];
    else themeOverrides[key] = value;
    themeDirty = true;
  }

  function buildThemeLayoutSection(): HTMLElement {
    if (!current.formId || current.formId <= 0) {
      const hint = h('div', { style: {
        padding: '10px 12px', background: '#fff7ed', border: '1px solid #fdba74',
        borderRadius: '8px', color: '#9a3412', fontSize: '12px',
      } }, T('vd.set.theme_pick_form', 'Select a module form above to edit its theme preset and layout.'));
      return buildAccordion(T('vd.set.theme_layout', 'Theme & Layout'), T('vd.set.pick_form_first', 'Pick a form first.'), hint, false, (open) => { themeLayoutExpanded = open; }, accordionAutoStyle('120px'));
    }

    // [B281 2026-06-26] Clean-state line dropped — "Active preset: …" duplicated the
    // accordion meta ("Preset: …"). Only surface a server status error or the unsaved warning.
    const dirtyNote = h('div', { style: {
      fontSize: '11px', marginTop: '6px',
      color: themeDirty ? '#b45309' : '#64748b',
    } }, themeStatus || (themeDirty
      ? T('vd.set.theme_unsaved', 'Unsaved theme/layout changes — click "Save module settings".')
      : ''));
    const flagDirty = (): void => {
      dirtyNote.textContent = T('vd.set.theme_unsaved', 'Unsaved theme/layout changes — click "Save module settings".');
      dirtyNote.style.color = '#b45309';
    };

    // Preset grid (16, mirrors Theme Designer left rail). Each tile carries an editable
    // per-preset colour palette dropdown (▾): the 4 semantic colours — Primary / Text /
    // Surface / Accent — that mfPresetColorVars expands into the full --mf-* palette. Editing
    // a colour (native picker or a typed hex) re-applies the palette to themeOverrides and
    // flags the form dirty; the Save button persists it (module style) and the render consumes it.
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(94px, 1fr))', gap: '8px', alignItems: 'start' } });
    const tiles: HTMLElement[] = [];
    const panelClosers: Array<() => void> = [];
    const normHex = (v: string): string => {
      if (!v) return '';
      let s = String(v).trim(); if (s[0] !== '#') s = '#' + s;
      if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
      return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : '';
    };
    const setActiveTile = (id: string): void => {
      tiles.forEach((t) => {
        const active = t.getAttribute('data-mf-preset') === id;
        t.style.border = active ? '2px solid #6366f1' : '1px solid #e2e8f0';
        t.style.boxShadow = active ? '0 0 0 2px rgba(99,102,241,.15)' : 'none';
      });
    };
    MF_PRESETS.forEach((p) => {
      const swatchCells = p.colors.slice(0, 4).map((c) => h('div', { style: { flex: '1', background: c } }) as HTMLElement);
      const swatch = h('div', { style: { display: 'flex', height: '20px', borderRadius: '5px', overflow: 'hidden', border: '1px solid rgba(0,0,0,.06)' } }, ...swatchCells);
      const badge = p.badge
        ? h('span', { style: {
            fontSize: '9px', fontWeight: '700', borderRadius: '999px', padding: '0 5px', marginLeft: '4px',
            color: p.badge === 'Pro' ? '#7c3aed' : '#0ea5e9',
            background: p.badge === 'Pro' ? '#f3e8ff' : '#e0f2fe',
          } }, p.badge)
        : null;
      const caret = h('button', { type: 'button', title: T('vd.set.edit_palette', 'Edit palette'),
        style: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '12px', color: '#64748b', padding: '0 3px', lineHeight: '1' } }, '▾') as HTMLButtonElement;

      // Current colours for THIS preset — the edited overrides when it's the active preset, else defaults.
      const curColors = (): string[] => (themeState === p.id)
        ? [themeOverrides['--mf-primary'] || p.colors[0], themeOverrides['--mf-text'] || p.colors[1], themeOverrides['--mf-form-bg'] || p.colors[2], themeOverrides['--mf-border'] || p.colors[3]]
        : [p.colors[0], p.colors[1], p.colors[2], p.colors[3]];

      const applyColors = (colors: string[]): void => {
        MF_PRESET_COLOR_VAR_KEYS.forEach((k) => { delete themeOverrides[k]; });
        Object.assign(themeOverrides, mfPresetColorVars({ ...p, colors }));
        themeState = p.id; themeDirty = true;
        swatchCells.forEach((cell, i) => { if (colors[i]) cell.style.background = colors[i]; });
        setActiveTile(p.id);
        flagDirty();
      };

      // Editable palette (Primary / Text / Surface / Accent) — native colour picker + typed hex, in sync.
      const rowsDef: Array<[string, number]> = [
        [T('vd.set.pal_primary', 'Primary'), 0], [T('vd.set.pal_text', 'Text'), 1],
        [T('vd.set.pal_surface', 'Surface'), 2], [T('vd.set.pal_accent', 'Accent'), 3],
      ];
      const hexInputs: HTMLInputElement[] = [];
      const colorInputs: HTMLInputElement[] = [];
      const commit = (): void => applyColors([0, 1, 2, 3].map((i) => normHex(hexInputs[i].value) || curColors()[i]));
      const palRows = rowsDef.map(([label, idx]) => {
        const c = curColors()[idx];
        const colorIn = h('input', { type: 'color', value: normHex(c) || '#000000',
          style: { width: '30px', height: '24px', padding: '0', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', background: '#fff' } }) as HTMLInputElement;
        const hexIn = h('input', { type: 'text', value: c, spellcheck: 'false', maxlength: '7',
          style: { flex: '1', minWidth: '0', fontSize: '12px', fontFamily: 'monospace', padding: '3px 7px', border: '1px solid #e2e8f0', borderRadius: '4px' } }) as HTMLInputElement;
        colorIn.oninput = () => { hexIn.value = colorIn.value; commit(); };
        hexIn.oninput = () => { const n = normHex(hexIn.value); if (n) { colorIn.value = n; commit(); } };
        colorInputs[idx] = colorIn; hexInputs[idx] = hexIn;
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px' } },
          h('span', { style: { fontSize: '11px', color: '#475569', minWidth: '58px' } }, label), colorIn, hexIn);
      });
      const resetBtn = h('button', { type: 'button',
        style: { marginTop: '2px', fontSize: '11px', border: '1px solid #e2e8f0', background: '#f8fafc', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer', color: '#475569', justifySelf: 'start' },
        onclick: () => { p.colors.forEach((c, i) => { if (hexInputs[i]) { hexInputs[i].value = c; colorInputs[i].value = normHex(c) || '#000000'; } }); applyColors([p.colors[0], p.colors[1], p.colors[2], p.colors[3]]); } },
        T('vd.set.pal_reset', 'Reset to default'));
      const panel = h('div', { style: { display: 'none', gridColumn: '1 / -1', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0' } },
        h('div', { style: { fontSize: '11px', fontWeight: '700', color: '#0f172a' } }, T('vd.set.pal_title', 'Palette — {name}', { name: p.name })),
        ...palRows, resetBtn) as HTMLElement;

      const refreshPanel = (): void => { const c = curColors(); [0, 1, 2, 3].forEach((i) => { if (hexInputs[i]) { hexInputs[i].value = c[i]; colorInputs[i].value = normHex(c[i]) || '#000000'; } }); };
      let open = false;
      const close = (): void => { open = false; panel.style.display = 'none'; wrap.style.gridColumn = ''; caret.textContent = '▾'; };
      panelClosers.push(close);
      caret.onclick = (e: Event) => {
        e.stopPropagation();
        if (open) { close(); return; }
        panelClosers.forEach((fn) => fn());
        open = true; refreshPanel(); panel.style.display = 'grid'; wrap.style.gridColumn = '1 / -1'; caret.textContent = '▴';
      };

      const applyArea = h('div', { style: { display: 'grid', gap: '5px', cursor: 'pointer' }, title: p.name, onclick: () => applyColors(curColors()) },
        swatch,
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          h('span', { style: { fontSize: '11px', fontWeight: '600', color: '#0f172a' } }, p.name),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, badge, caret)));

      const wrap = h('div', { 'data-mf-preset': p.id, style: {
        display: 'grid', gap: '5px', padding: '7px', background: '#fff', borderRadius: '9px', alignSelf: 'start',
        border: themeState === p.id ? '2px solid #6366f1' : '1px solid #e2e8f0',
        boxShadow: themeState === p.id ? '0 0 0 2px rgba(99,102,241,.15)' : 'none',
      } }, applyArea, panel) as HTMLElement;
      tiles.push(wrap);
      grid.appendChild(wrap);
    });

    // Layout controls — wired to the --mf-* vars megaform.css ACTUALLY consumes
    // (so they take real effect), plus the matching Theme-Designer display var.
    const sliderRow = (label: string, key: string, min: number, max: number, fallback: number, alsoKey?: string): HTMLElement => {
      const val = mfReadPx(themeOverrides, key, fallback);
      const valLabel = h('span', { style: { fontSize: '11px', fontWeight: '700', color: '#475569', minWidth: '44px', textAlign: 'right' } }, val + 'px');
      const slider = h('input', {
        type: 'range', min: String(min), max: String(max), value: String(val), style: { flex: '1' },
        oninput: (e: Event) => {
          const v = parseInt((e.target as HTMLInputElement).value, 10);
          valLabel.textContent = v + 'px';
          setLayoutVar(key, v + 'px');
          if (alsoKey) setLayoutVar(alsoKey, v + 'px');
          flagDirty();
        },
      }) as HTMLInputElement;
      return h('div', { style: { display: 'grid', gap: '4px' } },
        h('label', { style: { fontSize: '12px', color: '#334155' } }, label),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, slider, valLabel));
    };

    const curMaxWidth = String(themeOverrides['--mf-form-max-width'] || '960px');

    // [B274b] Compact inline RADIO rows (label + options on ONE line) instead of full-width
    // dropdowns — keeps the Settings pane short. Max width + the two Page-integration source
    // switches all use this.
    const radioRow = (label: string, name: string, options: Array<[string, string]>, current: string, onPick: (v: string) => void): HTMLElement => {
      const row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minHeight: '24px' } },
        h('label', { style: { fontSize: '12px', color: '#334155', minWidth: '104px' } }, label));
      options.forEach(([val, lab], i) => {
        const id = `mfvd-${name}-${i}`;
        const input = h('input', { type: 'radio', name, value: val, id, style: { margin: '0' },
          onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) onPick(val); } }) as HTMLInputElement;
        if (val === current) input.checked = true;
        row.appendChild(h('label', { for: id, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#334155', cursor: 'pointer' } }, input, lab));
      });
      return row;
    };

    const srcOptions: Array<[string, string]> = [['theme', T('vd.set.src_megaform', 'MegaForm')], ['page', T('vd.set.src_page', 'From page')]];
    const content = h('div', { style: { display: 'grid', gap: '14px' } },
      h('div', { style: { display: 'grid', gap: '7px' } },
        h('div', { style: { fontSize: '12px', fontWeight: '700', color: '#0f172a' } }, T('vd.set.theme_preset', 'Theme preset')),
        h('div', { class: 'mf-vd-help', style: { marginTop: '-2px' } }, T('vd.set.theme_preset_help', 'Same presets as the Theme Designer. Picking one recolors the whole form.')),
        grid,
        dirtyNote,
      ),
      h('div', { style: { display: 'grid', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' } },
        h('div', { style: { fontSize: '12px', fontWeight: '700', color: '#0f172a' } }, T('vd.set.layout', 'Layout')),
        radioRow(T('vd.set.max_width', 'Max width'), 'maxw', [['480px', '480'], ['640px', '640'], ['768px', '768'], ['960px', '960'], ['100%', T('vd.set.full', 'Full')]], curMaxWidth, (v) => { setLayoutVar('--mf-form-max-width', v); flagDirty(); }),
        sliderRow(T('vd.set.field_spacing', 'Field spacing'), '--mf-field-gap', 6, 40, 20),
      ),
      h('div', { style: { display: 'grid', gap: '8px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' } },
        h('div', { style: { fontSize: '12px', fontWeight: '700', color: '#0f172a' } }, T('vd.set.page_integration', 'Page integration')),
        h('div', { class: 'mf-vd-help', style: { marginTop: '-4px' } }, T('vd.set.page_integration_help', 'Inline embeds only — borrow the host page font / colour.')),
        radioRow(T('vd.set.typography_source', 'Typography source'), 'inhtype', srcOptions, themeInheritType ? 'page' : 'theme', (v) => { themeInheritType = (v === 'page'); inheritDirty = true; flagDirty(); }),
        radioRow(T('vd.set.color_source', 'Color source'), 'inhcol', srcOptions, themeInheritColors ? 'page' : 'theme', (v) => { themeInheritColors = (v === 'page'); inheritDirty = true; flagDirty(); }),
      ),
    );

    const meta = themeDirty ? T('vd.set.unsaved_changes', 'Unsaved changes') : T('vd.set.preset', 'Preset: {preset}', { preset: themeState });
    return buildAccordion(T('vd.set.theme_layout', 'Theme & Layout'), meta, content, themeLayoutExpanded, (open) => { themeLayoutExpanded = open; }, accordionAutoStyle('clamp(320px, 54vh, 580px)'));
  }

  function buildSavedViewPayloadFromExisting(view: FormViewOption, isDefault: boolean): SaveFormViewPayload | null {
    if (!view.formId || !view.viewKey || !view.viewName) return null;
    return {
      viewId: view.viewId || 0,
      formId: view.formId,
      viewKey: view.viewKey,
      queryKey: view.queryKey || '',
      viewType: view.viewType,
      viewName: view.viewName,
      isDefault,
      sortOrder: view.sortOrder || 0,
      configJson: view.configJson || '{}',
      customHtml: view.customHtml || '',
      customCss: view.customCss || '',
      permissionsJson: view.permissionsJson || '',
    };
  }

  function buildBasicsSection(): HTMLElement {
    const formSel = h('select', { class: 'mf-vd-input', onchange: async (e: Event) => {
      current.formId = parseInt((e.target as HTMLSelectElement).value, 10) || 0;
      formTitle = (response!.forms || []).find((f) => f.formId === current.formId)?.title || '';
      formFields = current.formId ? await fetchSchemaFields(current.formId) : [];
      await loadFormTheme(current.formId);
      namedViewsExpanded = false;
      moduleBase = captureModuleBaseState(current);
      resetSavedViewDraft();
      savedViewStatus = '';
      savedViewError = '';
      rerender();
    } }) as HTMLSelectElement;
    formSel.appendChild(h('option', { value: '0' }, T('vd.set.select_form_opt', '— Select a form —')));
    for (const f of (response!.forms || [])) {
      const opt = h('option', { value: String(f.formId) }, `${f.title} (#${f.formId}, ${f.status})`);
      if (f.formId === current.formId) opt.setAttribute('selected', '');
      formSel.appendChild(opt);
    }

    // [B281 2026-06-26] Inner "Module form" <label> dropped — the accordion header
    // already reads "Module form", so the label just duplicated it. Dropdown + help remain.
    const content = h('div', { class: 'mf-vd-settings-flat' },
      formSel,
      h('div', { class: 'mf-vd-help' }, T('vd.set.module_form_help', 'Pick the published form this module will render.'))
    );
    return buildAccordion(T('vd.set.module_form', 'Module form'), summarizeCurrentForm(), content, basicsExpanded, (open) => { basicsExpanded = open; }, accordionAutoStyle('220px'));
  }

  function buildViewModeSection(): HTMLElement {
    const block = h('div', { class: 'mf-vd-prop-block mf-vd-settings-flat' });
    const sel = h('select', { class: 'mf-vd-input', onchange: (e: Event) => {
      const next = (e.target as HTMLSelectElement).value;
      current.viewMode = next;
      current.selectedViewKey = '';
      // [ListViewRouting v20260507-24] CRITICAL: mirror viewMode → viewType so
      // the server-side persistence (DNN ModuleConfig.Save reads `viewType`)
      // actually stores the new mode. Previously only viewMode was set on the
      // payload, so server fell back to viewType="submit" → routing always
      // returned to form view.
      current.viewType = next === 'form' ? 'submit' : next;
      rerender();
    } }) as HTMLSelectElement;
    // [ListViewRouting v20260507-24] Reordered: ListView (new, working) shown
    // right under Form so admins naturally pick the supported one. Legacy list
    // and card stay available but are clearly tagged.
    for (const opt of [
      { v: 'form',     l: 'Form view — render the input form' },
      { v: 'listview', l: '★ ListView — pick fields + HTML template + filter/search/pagination (recommended)' },
      { v: 'list',     l: 'List view (legacy) — basic row list' },
      { v: 'card',     l: 'Card view (legacy) — submissions as cards' },
    ]) {
      const o = h('option', { value: opt.v }, opt.l);
      if ((current.viewMode || 'form').toLowerCase() === opt.v) o.setAttribute('selected', '');
      sel.appendChild(o);
    }
    block.append(h('label', {}, 'View mode'), sel);
    block.appendChild(h('div', { class: 'mf-vd-help' }, 'Form view = visitors fill the form. List/Card/ListView = visitors browse this form\'s submissions.'));

    const savedViews = formViews
      .filter((v) => isSupportedSavedView(v.viewType))
      .slice()
      .sort((a, b) => {
        if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
        return String(a.viewName || a.viewKey).localeCompare(String(b.viewName || b.viewKey));
      });
    if (current.formId > 0) {
      const savedSel = h('select', { class: 'mf-vd-input', onchange: (e: Event) => {
        const nextKey = String((e.target as HTMLSelectElement).value || '').trim();
        namedViewsExpanded = true;
        resetSavedViewDraft();
        restoreModuleBaseToCurrent();
        current.selectedViewKey = nextKey;
        const hit = savedViews.find((v) => v.viewKey === nextKey);
        if (hit) {
          savedViewStatus = `Pinned module to "${hit.viewName || hit.viewKey}".`;
          savedViewError = '';
        } else {
          savedViewStatus = 'Module will use the generic mode unless a URL or default named view overrides it.';
          savedViewError = '';
        }
        rerender();
      } }) as HTMLSelectElement;
      savedSel.appendChild(h('option', { value: '' }, '— Use the generic mode above —'));
      if (savedViews.length === 0) savedSel.setAttribute('disabled', '');
      savedViews.forEach((v) => {
        const mode = mapSavedViewToMode(v.viewType);
        const label = `${v.viewName || v.viewKey} (${mode}${v.isDefault ? ', default' : ''})`;
        const opt = h('option', { value: v.viewKey }, label);
        if ((current.selectedViewKey || '') === v.viewKey) opt.setAttribute('selected', '');
        savedSel.appendChild(opt);
      });
      block.appendChild(h('div', { class: 'mf-vd-prop-block', style: { marginTop: '12px' } },
        h('label', {}, 'Saved view for this module (optional)'),
        savedSel,
        h('div', { class: 'mf-vd-help' }, 'Pin this module instance to one saved view, or leave it blank to use generic mode/default resolution.'),
      ));
      const pinnedView = savedViews.find((v) => v.viewKey === (current.selectedViewKey || ''));
      if (pinnedView) {
        block.appendChild(h('div', {
          style: {
            marginTop: '10px',
            padding: '10px 12px',
            border: '1px solid #bfdbfe',
            background: '#eff6ff',
            borderRadius: '10px',
            display: 'grid',
            gap: '8px',
          },
        },
          h('div', { style: { fontSize: '12px', color: '#1d4ed8', lineHeight: '1.5' } },
            `Pinned to saved view: ${pinnedView.viewName || pinnedView.viewKey} (${modeLabel(pinnedView.viewType)}). Use Edit pinned view to load its actual template/settings into the editor.`),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button', {
              type: 'button',
              class: 'mf-vd-btn mf-vd-btn-primary',
              onclick: () => {
                beginEditingSavedView(pinnedView);
                rerender();
              },
            }, 'Edit pinned view'),
            h('button', {
              type: 'button',
              class: 'mf-vd-btn',
              onclick: () => {
                current.selectedViewKey = '';
                restoreModuleBaseToCurrent();
                savedViewStatus = 'Removed saved-view pin. Module is back to its generic mode.';
                savedViewError = '';
                rerender();
              },
            }, 'Use generic mode again'),
          ),
        ));
      }
    }

    const savedInfo = h('div', { class: 'mf-vd-prop-block', style: {
      marginTop: '10px',
      padding: '10px 12px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
    } });
    savedInfo.appendChild(h('label', {}, 'Named views'));

    if (!current.formId || current.formId <= 0) {
      savedInfo.appendChild(h('div', { style: {
        marginTop: '8px', padding: '10px 12px',
        background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px',
        color: '#9a3412', fontSize: '12px',
      } }, 'Select a module form above first. Named views are saved per form, so this section unlocks after a form is selected.'));
    } else {
      if (!formViewsState.ok) {
        savedInfo.appendChild(h('div', { style: {
          marginTop: '8px', padding: '10px 12px',
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
          color: '#991b1b', fontSize: '12px',
        } }, `Could not load saved views. Status: ${formViewsState.status || 'network'}${formViewsState.error ? ` - ${formViewsState.error}` : ''}`));
      } else if (savedViews.length === 0) {
        savedInfo.appendChild(h('div', { style: {
          marginTop: '8px', padding: '10px 12px',
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
          color: '#1d4ed8', fontSize: '12px',
        } }, 'No named views exist for this form yet. The settings you edit here are still module-local until you save one as a named view.'));
      } else {
        const defaultView = savedViews.find((v) => !!v.isDefault);
        savedInfo.appendChild(h('div', { style: {
          marginTop: '8px', padding: '10px 12px',
          background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px',
          color: '#334155', fontSize: '12px',
        } }, defaultView
          ? `${savedViews.length} named view(s) loaded. Current default: ${defaultView.viewName || defaultView.viewKey}.`
          : `${savedViews.length} named view(s) loaded. No default named view is set for this form.`));
      }

      const activeNamedMode = mapSavedViewToMode(current.viewMode || current.viewType || 'form');
      const canSaveNamedView = activeNamedMode === 'list' || activeNamedMode === 'card' || activeNamedMode === 'listview';
      const editingView = editingSavedViewId > 0 ? savedViews.find((v) => (v.viewId || 0) === editingSavedViewId) || null : null;
      const nameInput = h('input', {
        class: 'mf-vd-input',
        type: 'text',
        value: draftSavedViewName,
        placeholder: 'e.g. Student requests board',
        oninput: (e: Event) => {
          draftSavedViewName = (e.target as HTMLInputElement).value;
          if (!draftSavedViewKey) draftSavedViewKey = slugifyViewKey(draftSavedViewName);
        },
      }) as HTMLInputElement;
      const keyInput = h('input', {
        class: 'mf-vd-input',
        type: 'text',
        value: draftSavedViewKey,
        placeholder: 'student-requests-board',
        oninput: (e: Event) => {
          draftSavedViewKey = slugifyViewKey((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).value = draftSavedViewKey;
        },
      }) as HTMLInputElement;
      const defaultCb = h('input', { type: 'checkbox', onchange: (e: Event) => { draftSavedViewIsDefault = (e.target as HTMLInputElement).checked; } }) as HTMLInputElement;
      defaultCb.checked = draftSavedViewIsDefault;
      const saveNamedBtn = h('button', {
        type: 'button',
        class: 'mf-vd-btn mf-vd-btn-primary',
        disabled: canSaveNamedView ? null : '',
        onclick: async () => {
          if (!canSaveNamedView) return;
          namedViewsExpanded = true;
          const validation = validateSavedViewDraft(draftSavedViewName, draftSavedViewKey, formViews, editingSavedViewId);
          if (!validation.ok) {
            savedViewStatus = '';
            savedViewError = validation.error;
            rerender();
            return;
          }
          const payload = buildSavedViewPayload(
            current,
            validation.viewName,
            validation.viewKey,
            draftSavedViewQueryKey,
            draftSavedViewIsDefault,
            editingView?.viewId || 0,
            editingView?.sortOrder || 0);
          if (!payload) {
            savedViewStatus = '';
            savedViewError = 'View payload is incomplete.';
            rerender();
            return;
          }
          saveNamedBtn.setAttribute('disabled', '');
          savedViewStatus = 'Saving named viewâ€¦';
          savedViewError = '';
          const result = await saveFormView(payload);
          if (!result.ok) {
            savedViewStatus = '';
            savedViewError = `Save failed (${result.status || 'network'}): ${result.error || 'unknown error'}`;
            rerender();
            return;
          }
          await reloadFormViewsForCurrentForm();
          resetSavedViewDraft();
          restoreModuleBaseToCurrent();
          savedViewError = '';
          savedViewStatus = editingView
            ? `Updated named view "${payload.viewName}".`
            : `Saved named view "${payload.viewName}".`;
          rerender();
        },
      }, editingView ? 'Update saved view' : 'Save current mode as named view');
      const stopEditingBtn = h('button', {
        type: 'button',
        class: 'mf-vd-btn mf-vd-btn-ghost',
        onclick: () => {
          namedViewsExpanded = true;
          resetSavedViewDraft();
          restoreModuleBaseToCurrent();
          savedViewStatus = 'Exited saved-view edit mode.';
          savedViewError = '';
          rerender();
        },
      }, 'Stop editing');

      savedInfo.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px', marginTop: '12px' } },
        h('div', { class: 'mf-vd-prop-block' }, h('label', {}, 'New view name'), nameInput),
        h('div', { class: 'mf-vd-prop-block' }, h('label', {}, 'View key'), keyInput),
      ));
      const querySel = h('select', {
        class: 'mf-vd-input',
        onchange: (e: Event) => { draftSavedViewQueryKey = String((e.target as HTMLSelectElement).value || '').trim(); },
      }) as HTMLSelectElement;
      querySel.appendChild(h('option', { value: '' }, 'No bound query'));
      if (draftSavedViewQueryKey && !currentQueries.some((q) => q.queryKey === draftSavedViewQueryKey)) {
        const missingOpt = h('option', { value: draftSavedViewQueryKey }, `${draftSavedViewQueryKey} (missing from current app)`);
        missingOpt.setAttribute('selected', '');
        querySel.appendChild(missingOpt);
      }
      currentQueries
        .slice()
        .sort((a, b) => String(a.queryName || a.queryKey).localeCompare(String(b.queryName || b.queryKey)))
        .forEach((query) => {
          const label = query.formId && query.formId !== current.formId
            ? `${query.queryName || query.queryKey} (${query.queryKey} · form #${query.formId})`
            : `${query.queryName || query.queryKey} (${query.queryKey})`;
          const opt = h('option', { value: query.queryKey }, label);
          if ((draftSavedViewQueryKey || '') === query.queryKey) opt.setAttribute('selected', '');
          querySel.appendChild(opt);
        });
      if (!currentApp || currentQueries.length === 0) querySel.setAttribute('disabled', '');
      savedInfo.appendChild(h('div', { class: 'mf-vd-prop-block', style: { marginTop: '10px' } },
        h('label', {}, 'Bound query (optional)'),
        querySel,
        h('div', { class: 'mf-vd-help' },
          currentApp
            ? (currentQueries.length > 0
              ? `App: ${currentApp.appName || currentApp.appKey}. Bind this named view to one registered query, or leave it blank to use the generic submission listing.`
              : `App: ${currentApp.appName || currentApp.appKey}. This app does not have any registered queries yet.`)
            : 'This form is not connected to an app definition yet, so query binding is unavailable for this view.'
        ),
      ));
      savedInfo.appendChild(h('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px', color: '#475569' } },
        defaultCb,
        'Mark as default view for this form'
      ));
      savedInfo.appendChild(h('div', { class: 'mf-vd-help' },
        canSaveNamedView
          ? (editingView
            ? `Editing "${editingView.viewName || editingView.viewKey}". Saving now will overwrite that named view with the current ${activeNamedMode} settings.`
            : `Current mode "${activeNamedMode}" can be saved as a reusable named view.`)
          : 'Named view creation is currently wired for List, Card, and ListView. Form mode still renders from the module config directly.'
      ));
      if (savedViewStatus) savedInfo.appendChild(h('div', { style: { marginTop: '8px', fontSize: '12px', color: '#065f46' } }, savedViewStatus));
      if (savedViewError) savedInfo.appendChild(h('div', { style: { marginTop: '8px', fontSize: '12px', color: '#991b1b' } }, savedViewError));
      const actionRow = h('div', { style: { marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' } }, saveNamedBtn);
      if (editingView) actionRow.appendChild(stopEditingBtn);
      savedInfo.appendChild(actionRow);
      if (savedViews.length > 0) {
        const list = h('div', { style: { marginTop: '14px', display: 'grid', gap: '10px' } });
        savedViews.forEach((view) => {
          const mode = mapSavedViewToMode(view.viewType);
          const meta = [
            `key: ${view.viewKey}`,
            `mode: ${mode}`,
            view.queryKey ? `query: ${view.queryKey}` : '',
            view.isDefault ? 'default' : '',
            current.selectedViewKey === view.viewKey ? 'pinned to this module' : '',
          ].filter(Boolean).join(' Â· ');
          const editBtn = h('button', {
            type: 'button',
            class: 'mf-vd-btn mf-vd-btn-ghost',
            'data-mf-view-action': 'edit',
            onclick: () => {
              namedViewsExpanded = true;
              beginEditingSavedView(view);
              rerender();
            },
          }, (editingView && (editingView.viewId || 0) === (view.viewId || 0)) ? 'Editingâ€¦' : 'Edit');
          const pinBtn = h('button', {
            type: 'button',
            class: 'mf-vd-btn mf-vd-btn-ghost',
            'data-mf-view-action': 'pin',
            onclick: () => {
              namedViewsExpanded = true;
              resetSavedViewDraft();
              restoreModuleBaseToCurrent();
              current.selectedViewKey = view.viewKey;
              savedViewStatus = `Pinned module to "${view.viewName || view.viewKey}". Remember to save module settings to persist it.`;
              savedViewError = '';
              rerender();
            },
          }, current.selectedViewKey === view.viewKey ? 'Pinned' : 'Pin to module');
          const defaultBtn = h('button', {
            type: 'button',
            class: 'mf-vd-btn mf-vd-btn-ghost',
            'data-mf-view-action': 'default',
            disabled: view.isDefault ? '' : null,
            onclick: async () => {
              namedViewsExpanded = true;
              const payload = buildSavedViewPayloadFromExisting(view, true);
              if (!payload) return;
              savedViewStatus = `Setting "${view.viewName || view.viewKey}" as defaultâ€¦`;
              savedViewError = '';
              rerender();
              const result = await saveFormView(payload);
              if (!result.ok) {
                savedViewStatus = '';
                savedViewError = `Set default failed (${result.status || 'network'}): ${result.error || 'unknown error'}`;
                rerender();
                return;
              }
              await reloadFormViewsForCurrentForm();
              savedViewStatus = `Default view is now "${view.viewName || view.viewKey}".`;
              savedViewError = '';
              rerender();
            },
          }, view.isDefault ? 'Default' : 'Set default');
          const deleteBtn = h('button', {
            type: 'button',
            class: 'mf-vd-btn mf-vd-btn-ghost',
            'data-mf-view-action': 'delete',
            onclick: async () => {
              namedViewsExpanded = true;
              if (!(view.viewId && view.viewId > 0)) {
                savedViewStatus = '';
                savedViewError = 'Only persisted named views can be deleted.';
                rerender();
                return;
              }
              const ok = window.confirm(`Delete saved view "${view.viewName || view.viewKey}"?`);
              if (!ok) return;
              savedViewStatus = `Deleting "${view.viewName || view.viewKey}"â€¦`;
              savedViewError = '';
              rerender();
              const result = await deleteFormView(view.viewId);
              if (!result.ok) {
                savedViewStatus = '';
                savedViewError = `Delete failed (${result.status || 'network'}): ${result.error || 'unknown error'}`;
                rerender();
                return;
              }
              const deletedWasPinned = current.selectedViewKey === view.viewKey;
              const deletedWasDefault = !!view.isDefault;
              if (deletedWasPinned) current.selectedViewKey = '';
              await reloadFormViewsForCurrentForm();
              if ((editingSavedViewId || 0) === (view.viewId || 0)) {
                resetSavedViewDraft();
                restoreModuleBaseToCurrent();
              }
              savedViewStatus = deletedWasPinned || deletedWasDefault
                ? `Deleted "${view.viewName || view.viewKey}". Save module settings to persist the fallback selection.`
                : `Deleted "${view.viewName || view.viewKey}".`;
              savedViewError = '';
              rerender();
            },
          }, 'Delete');
          list.appendChild(h('div', {
            'data-mf-view-key': view.viewKey || '',
            style: {
            border: '1px solid #dbe4f0',
            borderRadius: '10px',
            padding: '10px 12px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          } },
            h('div', { style: { minWidth: '220px', flex: '1 1 220px' } },
              h('div', { style: { fontSize: '13px', fontWeight: '600', color: '#0f172a' } }, view.viewName || view.viewKey),
              h('div', { style: { fontSize: '12px', color: '#64748b', marginTop: '2px' } }, meta),
            ),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, editBtn, pinBtn, defaultBtn, deleteBtn),
          ));
        });
        savedInfo.appendChild(list);
      }
    }
    const defaultNamedViewSummary = savedViews.find((v) => !!v.isDefault);
    const namedViewsMeta = !current.formId || current.formId <= 0
      ? 'Choose a module form first.'
      : (!formViewsState.ok
        ? `Load failed${formViewsState.status ? ` (HTTP ${formViewsState.status})` : ''}`
        : (savedViews.length === 0
          ? 'No named views yet.'
          : [
            `${savedViews.length} saved`,
            defaultNamedViewSummary ? `default: ${defaultNamedViewSummary.viewName || defaultNamedViewSummary.viewKey}` : 'no default',
            current.selectedViewKey ? `module: ${current.selectedViewKey}` : '',
          ].filter(Boolean).join(' · ')));
    block.appendChild(buildAccordion(
      'Named views',
      namedViewsMeta,
      savedInfo,
      namedViewsExpanded || !!savedViewError,
      (open) => { namedViewsExpanded = open; },
      accordionScrollStyle('clamp(180px, 24vh, 240px)')
    ));

    if (current.selectedViewKey) {
      const hit = savedViews.find((v) => v.viewKey === current.selectedViewKey);
      if (hit) {
        block.appendChild(h('div', { style: {
          marginTop: '12px', padding: '10px 12px',
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
          color: '#1d4ed8', fontSize: '12px',
        } }, `Pinned to saved view: ${hit.viewName || hit.viewKey} (${mapSavedViewToMode(hit.viewType)}). URL overrides can still switch views with ?view=... or ?vk=...`));
      }
    }

    // [SettingsPopupResilient v20260508-05] Per-mode panel can throw (e.g.
    // listview panel hits stale state after schema mismatch). Wrap so the View
    // Mode dropdown itself survives + admin can switch modes.
    const mode = (current.viewMode || 'form').toLowerCase();
    try {
      let modePanel: HTMLElement | null = null;
      if (mode === 'form') modePanel = buildFormModePanel();
      else if (mode === 'list') modePanel = buildListModePanel();
      else if (mode === 'card') modePanel = buildCardModePanel();
      else if (mode === 'listview') modePanel = buildListViewModePanel();
      if (modePanel) {
        const modeMeta = mode === 'listview'
          ? 'Runtime list settings, fields, templates, and advanced notes.'
          : mode === 'form'
            ? 'Display mode and popup behavior for submit view.'
            : 'Designer entry point and quick summary for this mode.';
        block.appendChild(buildAccordion(
          `Current ${modeLabel(mode)} settings`,
          modeMeta,
          modePanel,
          modeSettingsExpanded,
          (open) => { modeSettingsExpanded = open; },
          accordionScrollStyle(mode === 'listview' ? 'clamp(420px, 62vh, 620px)' : 'clamp(220px, 32vh, 320px)')
        ));
      }
    } catch (err) {
      const msg = (err && (err as any).message) || String(err);
      console.error('[MegaForm Settings] "' + mode + '" panel failed:', err);
      block.appendChild(h('div', { style: {
        margin: '12px 0 0', padding: '10px 14px',
        background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '8px',
        color: '#92400e', fontSize: '12px',
      } }, '⚠ ' + mode + ' panel error: ' + msg + ' (try switching to Form view first then back).'));
    }
    return buildAccordion(
      'View mode',
      summarizeViewMode(),
      block,
      viewModeExpanded,
      (open) => { viewModeExpanded = open; },
      accordionScrollStyle('min(82vh, 760px)', { height: 'auto' })
    );
  }

  // [ListViewTabbedPanel v20260508-03] Tabbed inline ListView config — saves
  // popup vertical space (was scrolling 600px+). Sub-tabs:
  //   1. General    — title, page size, empty message, behaviour toggles
  //   2. Fields     — checkbox-per-field of the chosen form
  //   3. Templates  — Row template (table cell) + Detail template (View modal)
  //   4. Advanced   — info / future-use
  // All controls write into the same `lv` blob; outer "Save module settings"
  // is the only commit. No double-save.
  function buildListViewModePanel(): HTMLElement {
    let lv: any = {};
    try { lv = JSON.parse(current.listViewSettingsJson || '{}'); } catch {}
    if (typeof lv !== 'object' || lv == null) lv = {};

    const panel = h('div', { style: {
      marginTop: '0',
      padding: '12px',
      background: '#ecfdf5',
      borderRadius: '10px',
      border: '1px solid #86efac',
      overflow: 'hidden',
      display: 'grid',
      gap: '10px',
      alignContent: 'start',
    } });

    if (!current.formId || current.formId <= 0) {
      panel.appendChild(h('div', { style: { fontSize: '13px', color: '#475569' } },
        '⚠ Pick a Module form above first — ListView shows submissions of the chosen form.'));
      return panel;
    }

    current.viewMode = 'listview';
    current.viewType = 'listview';
    lv.formId = current.formId;

    if (typeof lv.pageSize     !== 'number') lv.pageSize     = 25;
    if (typeof lv.enableSearch !== 'boolean') lv.enableSearch = true;
    if (typeof lv.enableSort   !== 'boolean') lv.enableSort   = true;
    if (typeof lv.title        !== 'string')  lv.title        = '';
    if (typeof lv.emptyMessage !== 'string')  lv.emptyMessage = 'No submissions yet.';
    if (typeof lv.rowTemplate  !== 'string')  lv.rowTemplate  = '';
    if (typeof lv.detailTemplate !== 'string') lv.detailTemplate = '';
    if (typeof lv.showAddButton !== 'boolean') lv.showAddButton = true;
    if (typeof lv.showRowActions !== 'boolean') lv.showRowActions = true;
    if (!Array.isArray(lv.fields)) lv.fields = [];

    function persist(): void {
      lv.formId = current.formId;
      current.listViewSettingsJson = JSON.stringify(lv);
    }
    persist();

    function buildChip(text: string, tone: 'neutral' | 'accent' | 'success' = 'neutral'): HTMLElement {
      const cls = tone === 'accent' ? 'mf-vd-settings-chip is-accent' : tone === 'success' ? 'mf-vd-settings-chip is-success' : 'mf-vd-settings-chip';
      return h('span', { class: cls }, text);
    }

    function wireAutosize(textarea: HTMLTextAreaElement, minPx: number, maxPx: number): void {
      const resize = () => {
        textarea.style.height = 'auto';
        const next = Math.min(maxPx, Math.max(minPx, textarea.scrollHeight + 2));
        textarea.style.height = `${next}px`;
        textarea.style.overflowY = textarea.scrollHeight > maxPx ? 'auto' : 'hidden';
      };
      textarea.style.resize = 'none';
      textarea.style.minHeight = `${minPx}px`;
      textarea.style.maxHeight = `${maxPx}px`;
      textarea.addEventListener('input', resize);
      setTimeout(resize, 0);
    }

    const selectedCount = Array.isArray(lv.fields) && lv.fields.length > 0 ? lv.fields.length : formFields.length;
    panel.appendChild(h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
      buildChip(`Form #${current.formId}`, 'accent'),
      buildChip(`${selectedCount} visible field${selectedCount === 1 ? '' : 's'}`),
      buildChip(`Page size ${lv.pageSize}`),
      buildChip(lv.enableSearch ? 'Search on' : 'Search off', lv.enableSearch ? 'success' : 'neutral'),
      buildChip(lv.enableSort ? 'Sort on' : 'Sort off', lv.enableSort ? 'success' : 'neutral'),
      buildChip(lv.showRowActions ? 'Row actions on' : 'Row actions off', lv.showRowActions ? 'success' : 'neutral')
    ));

    // ── Tab bar ───────────────────────────────────────────────
    const tabs: Array<{ id: string; label: string; icon: string }> = [
      { id: 'general',   label: 'General',   icon: '⚙' },
      { id: 'fields',    label: 'Fields',    icon: '☰' },
      { id: 'templates', label: 'Templates', icon: '⟨/⟩' },
      { id: 'advanced',  label: 'Advanced',  icon: '✦' },
    ];
    let activeTab: string = (typeof lv.__activeTab === 'string' && tabs.some(t => t.id === lv.__activeTab))
      ? lv.__activeTab : 'general';

    const tabBar = h('div', { style: {
      display: 'flex', borderBottom: '1px solid #86efac', background: '#d1fae5',
    } });
    const tabPanels: Record<string, HTMLElement> = {};
    const tabBtns: Record<string, HTMLButtonElement> = {};

    function renderTabActive(): void {
      tabs.forEach((t) => {
        const btn = tabBtns[t.id];
        const pnl = tabPanels[t.id];
        const isActive = t.id === activeTab;
        if (btn) {
          btn.style.background = isActive ? '#fff' : 'transparent';
          btn.style.color      = isActive ? '#065f46' : '#475569';
          btn.style.borderBottom = isActive ? '2px solid #059669' : '2px solid transparent';
          btn.style.fontWeight = isActive ? '700' : '500';
        }
        if (pnl) pnl.style.display = isActive ? 'block' : 'none';
      });
      lv.__activeTab = activeTab; persist();
    }

    tabs.forEach((t) => {
      const btn = h('button', { type: 'button', style: {
        flex: '0 0 auto', padding: '10px 16px', border: '0', cursor: 'pointer',
        fontSize: '13px', fontFamily: 'inherit', background: 'transparent', color: '#475569',
        borderBottom: '2px solid transparent', transition: 'background .12s, color .12s',
      } }, h('span', { style: { marginRight: '6px', fontSize: '12px' } }, t.icon), t.label) as HTMLButtonElement;
      btn.addEventListener('click', () => { activeTab = t.id; renderTabActive(); });
      tabBtns[t.id] = btn;
      tabBar.appendChild(btn);
    });
    panel.appendChild(tabBar);

    const body = h('div', { style: { padding: '14px' } });
    panel.appendChild(body);

    // ── Tab 1: General ────────────────────────────────────────
    const tabGeneral = h('div');
    const titleInp = h('input', {
      class: 'mf-vd-input', type: 'text', value: lv.title,
      placeholder: '(optional) shown above the list',
      oninput: (e: Event) => { lv.title = (e.target as HTMLInputElement).value; persist(); },
    }) as HTMLInputElement;
    tabGeneral.appendChild(h('div', { class: 'mf-vd-prop-block' },
      h('label', {}, 'List title'), titleInp,
    ));

    const pageSizeInp = h('input', {
      class: 'mf-vd-input', type: 'number', min: '5', max: '500',
      value: String(lv.pageSize),
      oninput: (e: Event) => {
        const n = parseInt((e.target as HTMLInputElement).value || '25', 10);
        lv.pageSize = (Number.isFinite(n) && n > 0) ? n : 25; persist();
      },
    }) as HTMLInputElement;
    const emptyMsgInp = h('input', {
      class: 'mf-vd-input', type: 'text', value: lv.emptyMessage,
      oninput: (e: Event) => { lv.emptyMessage = (e.target as HTMLInputElement).value; persist(); },
    }) as HTMLInputElement;
    tabGeneral.appendChild(h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' } },
      h('div', { class: 'mf-vd-prop-block' }, h('label', {}, 'Page size'), pageSizeInp),
      h('div', { class: 'mf-vd-prop-block' }, h('label', {}, 'Empty message'), emptyMsgInp),
    ));

    const mkFlag = (lbl: string, key: 'enableSearch' | 'enableSort' | 'showAddButton' | 'showRowActions'): HTMLElement => {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = !!lv[key];
      cb.addEventListener('change', () => { lv[key] = cb.checked; persist(); });
      return h('label', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' } },
        cb, h('span', {}, lbl));
    };
    tabGeneral.appendChild(h('div', { class: 'mf-vd-prop-block' },
      h('label', {}, 'Behaviour'),
      h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } },
        mkFlag('Show search box',   'enableSearch'),
        mkFlag('Allow column sort', 'enableSort'),
        mkFlag('+ Add new button',  'showAddButton'),
        mkFlag('Row actions (View / Edit / Delete)', 'showRowActions'),
      ),
    ));
    body.appendChild(tabGeneral); tabPanels.general = tabGeneral;

    // ── Tab 2: Fields ─────────────────────────────────────────
    const tabFields = h('div');
    const selectedKeys = new Set((lv.fields as any[]).map((f: any) => String(f && (f.key || f.Key) || '')));
    const fieldsBox = h('div', { style: {
      display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px',
      background: '#fff', border: '1px solid #d1fae5', borderRadius: '8px',
      maxHeight: '260px', overflowY: 'auto'
    } });
    if (formFields.length === 0) {
      fieldsBox.appendChild(h('div', { style: { color: '#94a3b8', fontSize: '12px', padding: '6px' } }, 'No fields found in this form.'));
    } else {
      formFields.forEach((f) => {
        const checked = selectedKeys.size === 0 ? true : selectedKeys.has(f.key);
        const cb = h('input', { type: 'checkbox', 'data-key': f.key }) as HTMLInputElement;
        cb.checked = checked;
        cb.addEventListener('change', () => {
          const picked: any[] = [];
          fieldsBox.querySelectorAll('input[type="checkbox"]').forEach((el) => {
            const c = el as HTMLInputElement;
            if (!c.checked) return;
            const k = c.getAttribute('data-key') || '';
            const def = formFields.find(ff => ff.key === k);
            if (def) picked.push({ key: def.key, label: def.label || def.key, type: def.type || '' });
          });
          lv.fields = picked; persist();
        });
        const row = h('label', { style: {
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '999px', fontSize: '12px', cursor: 'pointer'
        } }, cb,
          h('span', {}, f.label || f.key),
          h('span', { style: { color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.04em' } }, f.type || ''),
        );
        fieldsBox.appendChild(row);
      });
      if (selectedKeys.size === 0) {
        lv.fields = formFields.map(f => ({ key: f.key, label: f.label || f.key, type: f.type || '' }));
        persist();
      }
    }
    tabFields.appendChild(h('div', { class: 'mf-vd-prop-block' },
      h('label', {}, 'Visible fields'),
      h('div', { class: 'mf-vd-help', style: { fontSize: '11px', marginBottom: '6px' } },
        'These fields appear as columns in the list, and as rows in the View detail.'),
      fieldsBox,
    ));
    body.appendChild(tabFields); tabPanels.fields = tabFields;

    // ── Tab 3: Templates ──────────────────────────────────────
    const tabTpl = h('div', { class: 'mf-vd-settings-templates' });
    const tplTokens = '{{field:KEY}}, {{submission:id}}, {{submission:date}}, {{submission:status}}, {{form:id}}, {{module:id}}, {{query:view}}, {{user:isAdmin}}, <mf-repeat each="item in field:KEY">...</mf-repeat>';

    tabTpl.appendChild(buildStarterPresetBlock('listview', (preset) => {
      const next = preset.listViewSettings || {};
      if (Array.isArray(next.fields) && next.fields.length) lv.fields = next.fields;
      if (typeof next.title === 'string') lv.title = next.title;
      if (typeof next.emptyMessage === 'string') lv.emptyMessage = next.emptyMessage;
      if (typeof next.pageSize === 'number') lv.pageSize = next.pageSize;
      if (typeof next.enableSearch === 'boolean') lv.enableSearch = next.enableSearch;
      if (typeof next.enableSort === 'boolean') lv.enableSort = next.enableSort;
      if (typeof next.showAddButton === 'boolean') lv.showAddButton = next.showAddButton;
      if (typeof next.showRowActions === 'boolean') lv.showRowActions = next.showRowActions;
      if (typeof next.rowTemplate === 'string') lv.rowTemplate = next.rowTemplate;
      if (typeof next.detailTemplate === 'string') lv.detailTemplate = next.detailTemplate;
      listViewTemplatesExpanded = true;
      persist();
      applyStarterPresetStatus(preset);
      rerender();
    }));

    const rowTplEl = h('textarea', {
      class: 'mf-vd-input',
      style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: '12px', minHeight: '96px', resize: 'none', whiteSpace: 'pre', overflowY: 'hidden' },
      placeholder: 'Leave blank for the auto <tr><td>{{field:KEY}}</td>...</tr> default.',
      oninput: (e: Event) => { lv.rowTemplate = (e.target as HTMLTextAreaElement).value; persist(); },
    }) as HTMLTextAreaElement;
    rowTplEl.value = lv.rowTemplate;
    wireAutosize(rowTplEl, 96, 220);
    tabTpl.appendChild(h('div', { class: 'mf-vd-prop-block' },
      h('label', {}, 'Row template (table row in list)'),
      rowTplEl,
      h('div', { class: 'mf-vd-help', style: { fontSize: '11px' } }, 'Tokens: ' + tplTokens),
      h('div', { class: 'mf-vd-help', style: { fontSize: '11px' } }, 'Example repeat: <mf-repeat each="file in field:attachments"><span class="tag">{{file:fileName}}</span></mf-repeat>'),
    ));

    // [ListViewDetailTemplate v20260508-03] NEW: detail template — used when
    // the user clicks 👁 View. If blank, the runtime renders an auto two-col
    // field/value table from `Visible fields`.
    const detailTplEl = h('textarea', {
      class: 'mf-vd-input',
      style: { fontFamily: 'Menlo, Consolas, monospace', fontSize: '12px', minHeight: '140px', resize: 'none', whiteSpace: 'pre', overflowY: 'hidden' },
      placeholder: 'Leave blank for the auto field/value table. Or write your own HTML, e.g.:\n\n<article class="my-detail">\n  <h2>{{field:firstName}} {{field:lastName}}</h2>\n  <p>Email: <a href="mailto:{{field:email}}">{{field:email}}</a></p>\n  <p><small>Submitted {{submission:date}}</small></p>\n</article>',
      oninput: (e: Event) => { lv.detailTemplate = (e.target as HTMLTextAreaElement).value; persist(); },
    }) as HTMLTextAreaElement;
    detailTplEl.value = lv.detailTemplate;
    wireAutosize(detailTplEl, 140, 320);
    tabTpl.appendChild(h('div', { class: 'mf-vd-prop-block' },
      h('label', {}, 'Detail template (View modal HTML)'),
      detailTplEl,
      h('div', { class: 'mf-vd-help', style: { fontSize: '11px' } }, 'Tokens: ' + tplTokens),
      h('div', { class: 'mf-vd-help', style: { fontSize: '11px' } }, 'Example: use {{query:view}} to branch copy by URL, or {{user:isAdmin}} to show admin-only hints.'),
    ));
    body.appendChild(tabTpl); tabPanels.templates = tabTpl;

    // ── Tab 4: Advanced ───────────────────────────────────────
    const tabAdv = h('div');
    tabAdv.appendChild(h('div', { class: 'mf-vd-help', style: { fontSize: '12px', color: '#475569', lineHeight: '1.6' } },
      'Renderer Host + CSS class are configured in the sections below the View Mode panel.',
      h('br', null),
      'For HTML templates, available tokens are: ', h('code', null, tplTokens),
      h('br', null),
      'View / Edit / Delete buttons per row + Add new button at the toolbar can be toggled on the General tab.',
    ));
    body.appendChild(tabAdv); tabPanels.advanced = tabAdv;

    tabBar.style.display = 'none';
    body.innerHTML = '';
    body.style.display = 'grid';
    body.style.gap = '10px';

    const templatesWrap = h('div', { style: { display: 'grid', gap: '10px' } },
      h('div', { class: 'mf-vd-settings-note' },
        'Template editors auto-grow until they hit their own local cap, then scroll inside that editor only. This avoids the old triple-scroll problem in the popup.'),
      tabTpl,
    );

    body.appendChild(buildAccordion(
      'General',
      'Title, paging, empty state, and toolbar behaviour.',
      tabGeneral,
      listViewGeneralExpanded,
      (open) => { listViewGeneralExpanded = open; },
      accordionScrollStyle('clamp(170px, 25vh, 230px)')
    ));
    body.appendChild(buildAccordion(
      'Fields',
      `${selectedCount} visible field${selectedCount === 1 ? '' : 's'} in the current layout.`,
      tabFields,
      listViewFieldsExpanded,
      (open) => { listViewFieldsExpanded = open; },
      accordionScrollStyle('clamp(190px, 28vh, 260px)')
    ));
    body.appendChild(buildAccordion(
      'Templates',
      'Row and detail HTML editors with token helpers.',
      templatesWrap,
      listViewTemplatesExpanded,
      (open) => { listViewTemplatesExpanded = open; },
      accordionScrollStyle('clamp(240px, 36vh, 360px)')
    ));
    body.appendChild(buildAccordion(
      'Advanced',
      'Extra guidance and runtime notes.',
      tabAdv,
      listViewAdvancedExpanded,
      (open) => { listViewAdvancedExpanded = open; },
      accordionScrollStyle('clamp(130px, 18vh, 180px)')
    ));

    return panel;
  }

  function buildFormModePanel(): HTMLElement {
    const displaySel = h('select', { class: 'mf-vd-input', onchange: (e: Event) => { current.displayMode = (e.target as HTMLSelectElement).value; rerender(); } }) as HTMLSelectElement;
    for (const opt of [{ v: 'fixed', l: T('vd.set.mode_fixed', 'Fixed form') }, { v: 'popup', l: T('vd.set.mode_popup', 'Popup form') }]) {
      const o = h('option', { value: opt.v }, opt.l);
      if ((current.displayMode || 'fixed').toLowerCase() === opt.v) o.setAttribute('selected', '');
      displaySel.appendChild(o);
    }
    const panel = h('div', { class: 'mf-vd-settings-flat' },
      h('div', { class: 'mf-vd-prop-block' }, h('label', {}, T('vd.set.display_mode', 'Display mode')), displaySel)
    );

    if ((current.displayMode || '').toLowerCase() === 'popup') {
      const triggerType = normalizePopupTriggerType(current.triggerType);
      current.triggerType = triggerType;
      current.delaySeconds = intInRange(current.delaySeconds, 0, 600, 5);
      current.scrollPercent = intInRange(current.scrollPercent, 5, 95, 50);
      current.clickSelector = String(current.clickSelector || '').trim();

      const sizeSel = h('select', { class: 'mf-vd-input', onchange: (e: Event) => { current.popupSize = (e.target as HTMLSelectElement).value; } }) as HTMLSelectElement;
      for (const opt of [{ v: 'small', l: T('vd.set.size_small', 'Small (420px)') }, { v: 'medium', l: T('vd.set.size_medium', 'Medium (640px)') }, { v: 'large', l: T('vd.set.size_large', 'Large (880px)') }, { v: 'fullscreen', l: T('vd.set.size_fullscreen', 'Fullscreen') }]) {
        const o = h('option', { value: opt.v }, opt.l);
        if ((current.popupSize || 'medium').toLowerCase() === opt.v) o.setAttribute('selected', '');
        sizeSel.appendChild(o);
      }

      const triggerSel = h('select', { class: 'mf-vd-input', onchange: (e: Event) => { current.triggerType = (e.target as HTMLSelectElement).value; rerender(); } }) as HTMLSelectElement;
      for (const opt of [{ v: 'time_delay', l: T('vd.set.trig_time', 'Time delay') }, { v: 'scroll_depth', l: T('vd.set.trig_scroll', 'Scroll percentage') }, { v: 'click_trigger', l: T('vd.set.trig_click', 'Click selector') }]) {
        const o = h('option', { value: opt.v }, opt.l);
        if (triggerType === opt.v) o.setAttribute('selected', '');
        triggerSel.appendChild(o);
      }

      const popupGrid = h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '10px',
        },
      },
        h('div', { class: 'mf-vd-prop-block', style: { marginBottom: '0' } }, h('label', {}, T('vd.set.popup_size', 'Popup size')), sizeSel),
        h('div', { class: 'mf-vd-prop-block', style: { marginBottom: '0' } }, h('label', {}, T('vd.set.trigger_type', 'Trigger type')), triggerSel),
      );
      panel.appendChild(popupGrid);

      if (triggerType === 'time_delay') {
        panel.appendChild(h('div', { class: 'mf-vd-prop-block', style: { marginBottom: '0' } },
          h('label', {}, T('vd.set.delay_seconds', 'Delay seconds')),
          h('input', {
            type: 'number',
            min: '0',
            max: '600',
            class: 'mf-vd-input',
            value: String(current.delaySeconds),
            oninput: (e: Event) => { current.delaySeconds = intInRange((e.target as HTMLInputElement).value, 0, 600, 5); },
          })
        ));
      } else if (triggerType === 'scroll_depth') {
        panel.appendChild(h('div', { class: 'mf-vd-prop-block', style: { marginBottom: '0' } },
          h('label', {}, T('vd.set.scroll_percent', 'Scroll percent')),
          h('input', {
            type: 'number',
            min: '5',
            max: '95',
            class: 'mf-vd-input',
            value: String(current.scrollPercent),
            oninput: (e: Event) => { current.scrollPercent = intInRange((e.target as HTMLInputElement).value, 5, 95, 50); },
          })
        ));
      } else if (triggerType === 'click_trigger') {
        panel.appendChild(h('div', { class: 'mf-vd-prop-block', style: { marginBottom: '0' } },
          h('label', {}, T('vd.set.click_selector', 'Click selector')),
          h('input', {
            type: 'text',
            class: 'mf-vd-input',
            placeholder: '.btn-open-form',
            value: String(current.clickSelector || ''),
            oninput: (e: Event) => { current.clickSelector = (e.target as HTMLInputElement).value; },
          }),
          h('div', { class: 'mf-vd-help' }, T('vd.set.click_selector_help', 'The runtime also listens for any element with data-mf-open-form.'))
        ));
      }

      panel.appendChild(buildPopupTriggerSamples());
    }

    return panel;
  }

  function buildListModePanel(): HTMLElement {
    const panel = h('div', { style: { marginTop: '0', padding: '14px', background: '#eef2ff', borderRadius: '10px', border: '1px solid #c7d2fe', display: 'grid', gap: '12px' } },
      h('div', { style: { fontSize: '12px', color: '#475569', marginBottom: '10px' } },
        `Selected: ${formFields.length} fields available · ${(current.listFields || '').split(',').filter(Boolean).length} selected for the list`),
      h('button', {
        class: 'mf-vd-btn mf-vd-btn-primary',
        disabled: !current.formId ? '' : null,
        onclick: async () => {
          if (!current.formId) return;
          try {
            await ensureDesigner('list');
            const w = window as any;
            w.MFListDesigner.open({
              moduleId: opts.moduleId,
              formId: current.formId,
              formTitle,
              fields: formFields,
              current,
              onSaved: (saved: ModuleConfig) => { current = { ...current, ...saved }; rerender(); if (opts.onSaved) opts.onSaved(current); },
            });
          } catch (err) {
            alert('Failed to load List Designer: ' + (err instanceof Error ? err.message : String(err)));
          }
        },
      }, '🛠 Open List Designer (drag-drop columns, HTML, JS)…')
    );
    const presetBlock = buildStarterPresetBlock('list', (preset) => {
      current.listFields = preset.selectedFieldKeys.join(', ');
      current.listTemplate = String(preset.listTemplate || '');
      current.viewMode = 'list';
      current.viewType = 'list';
      modeSettingsExpanded = true;
      applyStarterPresetStatus(preset);
      rerender();
    });
    panel.insertBefore(presetBlock, panel.lastChild);
    return panel;
  }

  function buildCardModePanel(): HTMLElement {
    const panel = h('div', { style: { marginTop: '0', padding: '14px', background: '#fef3c7', borderRadius: '10px', border: '1px solid #fcd34d', display: 'grid', gap: '12px' } },
      h('div', { style: { fontSize: '12px', color: '#475569', marginBottom: '10px' } },
        `Selected: ${formFields.length} fields available · ${(current.cardFields || '').split(',').filter(Boolean).length} selected for the card`),
      h('button', {
        class: 'mf-vd-btn mf-vd-btn-primary',
        disabled: !current.formId ? '' : null,
        onclick: async () => {
          if (!current.formId) return;
          try {
            await ensureDesigner('card');
            const w = window as any;
            w.MFCardDesigner.open({
              moduleId: opts.moduleId,
              formId: current.formId,
              formTitle,
              fields: formFields,
              current,
              onSaved: (saved: ModuleConfig) => { current = { ...current, ...saved }; rerender(); if (opts.onSaved) opts.onSaved(current); },
            });
          } catch (err) {
            alert('Failed to load Card Designer: ' + (err instanceof Error ? err.message : String(err)));
          }
        },
      }, '🛠 Open Card Designer (12-col grid, HTML, JS)…')
    );
    const presetBlock = buildStarterPresetBlock('card', (preset) => {
      current.cardFields = preset.selectedFieldKeys.join(', ');
      current.cardTemplate = String(preset.cardTemplate || '');
      current.viewMode = 'card';
      current.viewType = 'card';
      modeSettingsExpanded = true;
      applyStarterPresetStatus(preset);
      rerender();
    });
    panel.insertBefore(presetBlock, panel.lastChild);
    return panel;
  }

  /**
   * [v20260528-14] Page binding accordion — pin this module instance to a
   * specific page surface (builder / dashboard / submissions / theme /
   * languages / blank=render) AND optionally an Inbox scope (app key or
   * single form id). Persisted into ModuleSettings on Save by the server
   * side of ModuleConfigController.Save (MegaForm_InboxAppScope,
   * MegaForm_InboxFormId, MegaForm_PageSurface). The shell render then
   * exposes them via window.__MF_PLATFORM__.pin so URLs stay clean.
   */
  let pageBindingExpanded = false;
  function summarizePageBinding(): string {
    const cur: any = current;
    const parts: string[] = [];
    const surface = String(cur.pageSurface || '').trim();
    if (surface) parts.push('Surface: ' + surface);
    if (cur.inboxAppScope) parts.push('Inbox: app=' + cur.inboxAppScope);
    else if (cur.inboxFormId && Number(cur.inboxFormId) > 0) parts.push('Inbox: form #' + cur.inboxFormId);
    return parts.length ? parts.join(' · ') : 'Inherits dashboard hash route';
  }
  function buildPageBindingSection(): HTMLElement {
    const cur: any = current;
    const surfaceSelect = h('select', {
      class: 'mf-vd-input',
      onchange: (e: Event) => { cur.pageSurface = (e.target as HTMLSelectElement).value; },
    },
      h('option', { value: '' },            'Auto (read from URL hash)'),
      h('option', { value: 'render' },      'Render (form)'),
      h('option', { value: 'builder' },     'Form Builder'),
      h('option', { value: 'dashboard' },   'Admin Dashboard'),
      h('option', { value: 'submissions' }, 'Submission Inbox'),
      h('option', { value: 'theme' },       'Theme Designer'),
      h('option', { value: 'languages' },   'Languages'),
    );
    try { (surfaceSelect as HTMLSelectElement).value = String(cur.pageSurface || ''); } catch { /* ignore */ }

    const scopeMode = (cur.inboxFormId && Number(cur.inboxFormId) > 0) ? 'form'
                    : (cur.inboxAppScope ? 'app' : 'none');
    const scopeSelect = h('select', {
      class: 'mf-vd-input',
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'none') { cur.inboxAppScope = ''; cur.inboxFormId = 0; }
        else if (v === 'app')  { cur.inboxFormId = 0;  cur.inboxAppScope = cur.inboxAppScope || ''; }
        else if (v === 'form') { cur.inboxAppScope = ''; cur.inboxFormId = Number(cur.inboxFormId || 0); }
        try { (scopeAppRow.style as any).display  = v === 'app'  ? 'block' : 'none'; } catch { /* ignore */ }
        try { (scopeFormRow.style as any).display = v === 'form' ? 'block' : 'none'; } catch { /* ignore */ }
      },
    },
      h('option', { value: 'none' }, 'No scope (cross-form inbox)'),
      h('option', { value: 'app' },  'By App scope (all forms in one AppScope)'),
      h('option', { value: 'form' }, 'By Form (single form only)'),
    );
    try { (scopeSelect as HTMLSelectElement).value = scopeMode; } catch { /* ignore */ }

    const appInput = h('input', {
      class: 'mf-vd-input',
      placeholder: 'e.g. blog',
      value: String(cur.inboxAppScope || ''),
      oninput: (e: Event) => { cur.inboxAppScope = (e.target as HTMLInputElement).value.trim(); },
    });
    const formIdInput = h('input', {
      class: 'mf-vd-input',
      type: 'number', min: '0', step: '1',
      placeholder: 'e.g. 257',
      value: String(cur.inboxFormId || ''),
      oninput: (e: Event) => { cur.inboxFormId = parseInt((e.target as HTMLInputElement).value, 10) || 0; },
    });

    const scopeAppRow = h('div', { class: 'mf-vd-prop-block', style: { marginTop: '8px', display: scopeMode === 'app' ? 'block' : 'none' } },
      h('label', {}, 'App scope key'),
      appInput,
    );
    const scopeFormRow = h('div', { class: 'mf-vd-prop-block', style: { marginTop: '8px', display: scopeMode === 'form' ? 'block' : 'none' } },
      h('label', {}, 'Inbox form ID'),
      formIdInput,
    );

    const content = h('div', { class: 'mf-vd-section-body' },
      h('div', { class: 'mf-vd-prop-block' },
        h('label', {}, 'Page surface — what this page renders by default'),
        surfaceSelect,
        h('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
          'Auto: the SPA hash route (#mf-dashboard, #mf-builder, …) decides. Pin a value here when you want the URL to stay clean (e.g. /megaf/Blog/Inbox always lands on Submissions).'),
      ),
      h('div', { class: 'mf-vd-prop-block', style: { marginTop: '12px' } },
        h('label', {}, 'Inbox scope (only used when page surface = Submission Inbox)'),
        scopeSelect,
        h('div', { style: { fontSize: '11px', color: '#64748b', marginTop: '4px' } },
          'By App: every form whose AppScope matches the key below. By Form: only that single form ID. No scope: cross-form inbox.'),
      ),
      scopeAppRow,
      scopeFormRow,
    );

    return buildAccordion('Page binding', summarizePageBinding(), content, pageBindingExpanded, (open) => { pageBindingExpanded = open; }, accordionAutoStyle('240px'));
  }

  function buildRendererHostSection(): HTMLElement {
    const cb = h('input', {
      type: 'checkbox',
      onchange: (e: Event) => { current.useCurrentPageAsRendererHost = (e.target as HTMLInputElement).checked; },
    }) as HTMLInputElement;
    const content = h('div', { class: 'mf-vd-settings-flat' },
      h('label', {}, 'Renderer Host'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' } },
        cb,
        h('span', { style: { fontSize: '13px' } }, 'Use this page as the Renderer Host for embedded forms')
      ),
      h('div', { class: 'mf-vd-help' }, current.rendererHostUrl ? `Currently: ${htmlEscape(current.rendererHostUrl)}` : 'Renderer Host is not set yet.'),
      h('div', { class: 'mf-vd-prop-block', style: { marginTop: '12px' } },
        h('label', {}, 'CSS class (root <div>)'),
        h('input', {
          class: 'mf-vd-input', value: current.cssClass || '',
          oninput: (e: Event) => { current.cssClass = (e.target as HTMLInputElement).value; },
        })
      ),
    );
    cb.checked = !!current.useCurrentPageAsRendererHost;
    return buildAccordion('Renderer host', summarizeRendererHost(), content, rendererExpanded, (open) => { rendererExpanded = open; }, accordionAutoStyle('190px'));
  }

  // ── Footer Save (replace the default placeholder) ────────────────────────
  popup.footer.innerHTML = '';
  const status = h('div', { class: 'mf-vd-status' }, '');
  const cancelBtn = h('button', { class: 'mf-vd-btn mf-vd-btn-ghost', onclick: () => popup.close() }, T('vd.set.close', 'Close'));
  const saveBtn = h('button', { class: 'mf-vd-btn mf-vd-btn-primary', onclick: async () => {
    saveBtn.setAttribute('disabled', '');
    status.textContent = T('vd.set.saving', 'Saving…');
    // [ThemeInSettings 2026-06-23] Persist the form's theme + layout too, on the SAME
    // button. Patch the FORM (Form/SaveTheme) — same keys the Theme Designer uses — so
    // the two stay in sync. Save this first; abort the module-config save if it fails so
    // the admin doesn't lose unsaved theme edits without notice.
    if (themeDirty && current.formId && current.formId > 0) {
      status.textContent = T('vd.set.saving_theme', 'Saving theme…');
      // [ModuleStyle v20260624-B262] Save the admin's CSS edits to the MODULE (module-setting wins),
      // not the form (the form stays the seed/template). The public render overlays this module CSS.
      const themeRes = await saveModuleStyle(opts.moduleId, current.formId, themeState, themeOverrides);
      if (!themeRes.ok) {
        saveBtn.removeAttribute('disabled');
        status.textContent = T('vd.set.theme_save_failed', 'Theme save failed (HTTP {status}): {body}', { status: themeRes.status, body: themeRes.body || T('vd.set.unknown_error', 'unknown error') });
        return;
      }
      themeDirty = false;
    }
    // [B274] Persist the page-integration flags to the FORM (form-level, separate from module CSS).
    if (inheritDirty && current.formId && current.formId > 0) {
      status.textContent = T('vd.set.saving_page', 'Saving page integration…');
      const inhRes = await saveFormInheritFlags(current.formId, themeInheritType, themeInheritColors);
      if (!inhRes.ok) {
        saveBtn.removeAttribute('disabled');
        status.textContent = T('vd.set.page_save_failed', 'Page-integration save failed (HTTP {status}): {body}', { status: inhRes.status, body: inhRes.body || T('vd.set.unknown_error', 'unknown error') });
        return;
      }
      inheritDirty = false;
    }
    status.textContent = T('vd.set.saving', 'Saving…');
    const payload = editingSavedViewId > 0
      ? ({ ...current, ...cloneModuleBaseState(moduleBase) } as ModuleConfig)
      : current;
    const result = await saveModuleConfig(payload, opts.siteId);
    if (result.ok) {
      // [ViewDesigner v20260503-05] Hard-reload after save: Razor's `_viewMode`
      // and `_listFields/_listTemplate` only read on page load, so without a
      // reload the page keeps mounting the form even after the user picks
      // List/Card view in the popup.
      status.textContent = T('vd.set.saved_reloading', 'Saved · reloading…');
      if (opts.onSaved) opts.onSaved(payload);
      const nextUrl = buildPostSaveNavigationUrl(payload);
      setTimeout(() => {
        try {
          if (nextUrl) window.location.assign(nextUrl);
          else window.location.reload();
        } catch { popup.close(); }
      }, 350);
    } else {
      saveBtn.removeAttribute('disabled');
      status.textContent = T('vd.set.save_failed', 'Save failed (HTTP {status}): {body}', { status: result.status, body: result.body || T('vd.set.unknown_error', 'unknown error') });
    }
  } }, T('vd.set.save', 'Save module settings'));
  popup.footer.append(status, cancelBtn, saveBtn);

  rerender();
}

(function bootstrap() {
  const w = window as any;
  w.MFSettings = { open, badge: BADGE };
})();

function mapSavedViewToMode(viewType: string): string {
  const v = String(viewType || '').trim().toLowerCase();
  if (!v || v === 'submit' || v === 'edit' || v === 'form') return 'form';
  return v;
}

function isSupportedSavedView(viewType: string): boolean {
  const mode = mapSavedViewToMode(viewType);
  return mode === 'list' || mode === 'card' || mode === 'listview';
}

function slugifyViewKey(input: string): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function buildPostSaveNavigationUrl(cfg: ModuleConfig): string {
  try {
    const raw = String(cfg.currentPageUrl || window.location.href || window.location.pathname || '/').trim();
    const next = new URL(raw, window.location.origin);
    next.searchParams.delete('vk');
    next.searchParams.delete('view');
    next.searchParams.delete('mfpanel');

    const selectedViewKey = String(cfg.selectedViewKey || '').trim();
    if (selectedViewKey) {
      next.searchParams.set('vk', selectedViewKey);
    } else {
      const mode = String(cfg.viewMode || cfg.viewType || 'form').trim().toLowerCase();
      if (mode === 'form' || mode === 'list' || mode === 'card' || mode === 'listview') {
        next.searchParams.set('view', mode);
      }
    }

    return next.pathname + (next.search || '') + (next.hash || '');
  } catch {
    return '';
  }
}

const RESERVED_VIEW_KEYS = new Set(['form', 'list', 'card', 'listview']);

function validateSavedViewDraft(name: string, key: string, views: FormViewOption[], editingViewId = 0): { ok: true; viewName: string; viewKey: string } | { ok: false; error: string } {
  const viewName = String(name || '').trim();
  const viewKey = slugifyViewKey(key || name);
  if (!viewName) return { ok: false, error: 'View name is required.' };
  if (!viewKey) return { ok: false, error: 'View key is required.' };
  if (RESERVED_VIEW_KEYS.has(viewKey)) return { ok: false, error: 'View key is reserved. Use another slug.' };
  const duplicate = views.some((v) => v.viewKey === viewKey && (v.viewId || 0) !== editingViewId);
  if (duplicate) return { ok: false, error: `View key "${viewKey}" already exists for this form.` };
  return { ok: true, viewName, viewKey };
}

function buildSavedViewPayload(current: ModuleConfig, name: string, key: string, queryKey: string, isDefault: boolean, viewId = 0, sortOrder = 0): SaveFormViewPayload | null {
  const viewName = String(name || '').trim();
  const viewKey = slugifyViewKey(key || name);
  if (!current.formId || !viewName || !viewKey) return null;

  const mode = mapSavedViewToMode(current.viewMode || current.viewType || 'form');
  const payload: SaveFormViewPayload = {
    viewId: viewId > 0 ? viewId : 0,
    formId: current.formId,
    viewKey,
    queryKey: String(queryKey || '').trim(),
    viewType: mode === 'form' ? 'submit' : mode,
    viewName,
    isDefault,
    sortOrder,
    configJson: '{}',
    customHtml: '',
    customCss: '',
    permissionsJson: '',
  };

  if (mode === 'listview') {
    payload.configJson = current.listViewSettingsJson || '{}';
  } else if (mode === 'list') {
    payload.configJson = JSON.stringify({
      viewMode: 'list',
      listFields: current.listFields || '',
      listTemplate: current.listTemplate || '',
    });
    payload.customHtml = current.listTemplate || '';
  } else if (mode === 'card') {
    payload.configJson = JSON.stringify({
      viewMode: 'card',
      cardFields: current.cardFields || '',
      cardTemplate: current.cardTemplate || '',
    });
    payload.customHtml = current.cardTemplate || '';
  } else {
    payload.configJson = JSON.stringify({ viewMode: 'form' });
  }

  return payload;
}

function cloneModuleBaseState<T extends Record<string, any>>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value || {})) as T;
  } catch {
    return { ...(value || {}) } as T;
  }
}

function captureModuleBaseState(current: ModuleConfig): Partial<ModuleConfig> {
  const mode = mapSavedViewToMode(current.viewMode || current.viewType || 'form');
  return {
    formId: current.formId,
    viewMode: mode,
    viewType: mode === 'form' ? 'submit' : mode,
    displayMode: current.displayMode || 'fixed',
    triggerType: current.triggerType || '',
    popupSize: current.popupSize || 'medium',
    listFields: current.listFields || '',
    listTemplate: current.listTemplate || '',
    cardFields: current.cardFields || '',
    cardTemplate: current.cardTemplate || '',
    listViewSettingsJson: current.listViewSettingsJson || '{}',
  };
}

export const badge = BADGE;
