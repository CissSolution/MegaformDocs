// ============================================================
// MegaForm i18n — Lightweight Internationalization Engine
//
// Usage:
//   import { t, setLocale } from '@i18n';
//   setLocale('vi-VN', { ... });
//   t('builder.save');                    // → "Lưu"
//   t('form.required', {field: 'Email'}); // → "Email là bắt buộc"
// ============================================================

// [P0 2026-06-11] SINGLE SOURCE OF TRUTH: build-embed the canonical 941-key
// catalog instead of a hand-maintained inline subset (was 295 keys, drifted).
// Vite inlines this JSON at build time; en-US stays synchronously available for
// fallback-less t() calls. Other locales lazy-load via loadLocale().
import enUSCatalog from '../../public/i18n/en-US.json';

export interface LocaleStrings {
  [key: string]: string;
}

let currentLocale = 'en-US';
const fallbackLocale = 'en-US';
const locales: Record<string, LocaleStrings> = {};

// ── Default English strings — THE single source of truth (see import above) ──
locales['en-US'] = enUSCatalog as LocaleStrings;

/** Set or merge locale strings */
export function setLocale(locale: string, strings: LocaleStrings): void {
  if (!locales[locale]) locales[locale] = {};
  Object.assign(locales[locale], strings);
  currentLocale = locale;
  setDir(locale); // keep text direction in sync with every locale change
}

// ── RTL + BCP-47 locale resolution ──────────────────────────────────────────
// Languages that render right-to-left. ar=Arabic, he=Hebrew, fa=Persian,
// ur=Urdu, yi=Yiddish, dv=Divehi, ps=Pashto, sd=Sindhi.
const RTL_LANGS = /^(ar|he|iw|fa|ur|yi|dv|ps|sd)(-|_|$)/i;

// The locales MegaForm can resolve to (launch set + pre-existing bundles).
// [FullLocaleSet 2026-07-02] MUST include EVERY locale we ship a public/i18n/<loc>.json for,
// otherwise normalizeLocale() falls the code back to en-US and the (now fully-translated) pack
// is never loaded/applied when the user picks it in the Language Manager. This list mirrors the
// 39 shipped locale files.
const KNOWN_LOCALES = [
  'en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE', 'pt-BR', 'pt-PT', 'ar-SA',
  'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'vi-VN', 'it-IT', 'th-TH',
  'nl-NL', 'pl-PL', 'ru-RU', 'tr-TR', 'id-ID', 'hi-IN',
  // [FullLocaleSet 2026-07-02] remaining shipped packs (were missing → fell back to en-US)
  'bg-BG', 'cs-CZ', 'da-DK', 'el-GR', 'et-EE', 'fi-FI', 'hr-HR', 'hu-HU', 'lt-LT',
  'lv-LV', 'nb-NO', 'ro-RO', 'sk-SK', 'sl-SI', 'sr-Latn-RS', 'sv-SE', 'uk-UA',
];
const LANG_DEFAULT: Record<string, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ar: 'ar-SA',
  ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', vi: 'vi-VN', it: 'it-IT', th: 'th-TH',
  nl: 'nl-NL', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', hi: 'hi-IN',
  // [FullLocaleSet 2026-07-02] base-language → default region for the newly-recognized packs
  bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', el: 'el-GR', et: 'et-EE', fi: 'fi-FI', hr: 'hr-HR',
  hu: 'hu-HU', lt: 'lt-LT', lv: 'lv-LV', nb: 'nb-NO', ro: 'ro-RO', sk: 'sk-SK', sl: 'sl-SI',
  sr: 'sr-Latn-RS', sv: 'sv-SE', uk: 'uk-UA',
};

/** True when `locale` (or the current locale) is right-to-left. */
export function isRTL(locale?: string): boolean {
  return RTL_LANGS.test(String(locale ?? currentLocale));
}

/**
 * Normalise an arbitrary BCP-47 code to a locale MegaForm ships.
 * Exact match wins; else fall back to the language's default region; else en-US.
 *   'en' → 'en-US', 'ar' → 'ar-SA', 'zh-Hans' → 'zh-CN', 'pt_BR' → 'pt-BR'.
 */
export function normalizeLocale(raw: string | undefined): string {
  const v = String(raw || '').trim().replace(/_/g, '-');
  if (!v) return fallbackLocale;
  const exact = KNOWN_LOCALES.find((l) => l.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  const lang = v.split('-')[0].toLowerCase();
  const byRegion = KNOWN_LOCALES.find((l) => l.split('-')[0].toLowerCase() === lang);
  return byRegion || LANG_DEFAULT[lang] || fallbackLocale;
}

/**
 * Toggle text direction for MegaForm surfaces only (never hijacks the host
 * page's <html dir>). Sets dir on every MegaForm root + form wrapper, plus a
 * data-mf-dir hook on <html> for global CSS. Idempotent + safe to call often.
 */
export function setDir(locale?: string): void {
  if (typeof document === 'undefined') return;
  const dir = isRTL(locale) ? 'rtl' : 'ltr';
  try {
    document.documentElement.setAttribute('data-mf-dir', dir);
    document.querySelectorAll(
      '#mf-dash-root,#mf-dashboard-root,#mf-builder-root,#mf-submissions-root,#mf-myinbox-root,' +
      '#mf-languages-root,#mf-host-dashboard-root,.mf-form-wrapper,.mf-mi-shell,[id^="mf-form-wrapper"],[data-mf-overlay]',
    ).forEach((el) => (el as HTMLElement).setAttribute('dir', dir));
  } catch { /* DOM not ready / restricted — harmless */ }
}

/** Translate a key with optional params: t('form.min_length', {min: 5}) */
export function t(key: string, params?: Record<string, string | number>): string {
  const hit = locales[currentLocale]?.[key] ?? locales[fallbackLocale]?.[key];
  // Dev-only missing-key logging (enable with window.__MF_I18N_DEBUG__ = true).
  // Production never throws/blanks: missing → en-US → the key itself.
  if (hit === undefined && typeof window !== 'undefined' && (window as any).__MF_I18N_DEBUG__) {
    // eslint-disable-next-line no-console
    console.warn('[MegaForm i18n] missing key "' + key + '" for locale "' + currentLocale + '"');
  }
  let str = hit ?? key;
  if (params) {
    for (const p in params) {
      str = str.replace(new RegExp(`\\{${p}\\}`, 'g'), String(params[p]));
    }
  }
  return str;
}

/** CLDR plural category (one/other + zero/two/few/many for languages that need them).
 *  Uses the platform Intl.PluralRules — correct for ar (6 forms), pl/ru/cs (3 forms),
 *  en/es/fr/de/pt (2 forms) — so we never hand-maintain CLDR rules. */
export function pluralCategory(count: number, locale: string = currentLocale): string {
  try { return new Intl.PluralRules(locale).select(count); } catch { return 'other'; }
}

/** Pluralized translation. Reads sub-keys `<base>.<category>` and falls back to
 *  `<base>.other`, then the flat `<base>` (legacy), filling {count}/{n} with `count`.
 *  Catalog pattern:  "dash.n_submissions.one":"{n} submission", ".other":"{n} submissions".
 *  Languages needing more forms add `.zero/.two/.few/.many`; Intl picks the right one. */
export function tplural(baseKey: string, count: number, params?: Record<string, string | number>): string {
  const cat = pluralCategory(count, currentLocale);
  const store = locales[currentLocale] || {};
  const fb = locales[fallbackLocale] || {};
  const has = (k: string) => store[k] !== undefined || fb[k] !== undefined;
  const key = has(baseKey + '.' + cat) ? baseKey + '.' + cat
    : has(baseKey + '.other') ? baseKey + '.other'
      : baseKey;
  return t(key, { ...(params || {}), count, n: count });
}

/** Get current locale code */
export function getLocale(): string { return currentLocale; }

/** Export a full locale catalog (defaults to the inline en-US source of truth).
 *  Used to regenerate the served en-US.json so the Language Manager lists ALL keys. */
export function exportCatalog(locale: string = 'en-US'): LocaleStrings {
  return { ...(locales[locale] || {}) };
}

/** Number of keys in a locale (en-US = the full inline catalog). */
export function keyCount(locale: string = 'en-US'): number {
  return Object.keys(locales[locale] || {}).length;
}

/** Check if a locale has been loaded */
export function hasLocale(locale: string): boolean { return !!locales[locale]; }

/** Get all keys for a prefix (e.g. 'field.' returns all field.* keys) */
export function getGroup(prefix: string): LocaleStrings {
  const result: LocaleStrings = {};
  const src = locales[currentLocale] || locales[fallbackLocale] || {};
  for (const key in src) {
    if (key.startsWith(prefix)) result[key] = src[key];
  }
  return result;
}


// =========================================================
//  LAZY LOAD — tải file ngôn ngữ từ server
// =========================================================

function resolveLocaleUrl(baseUrl: string | undefined, locale: string): string {
  const raw = String(baseUrl || '/megaform/i18n').replace(/\/$/, '');
  if (/\/API\/i18n$/i.test(raw) || /\/api\/i18n$/i.test(raw) || /\/api\/MegaForm\/i18n$/i.test(raw)) {
    return raw + '/Get?id=' + encodeURIComponent(locale);
  }
  return raw + '/' + encodeURIComponent(locale) + '.json';
}

/**
 * Load file ngôn ngữ từ URL.
 * Mỗi ngôn ngữ là 1 file JSON riêng, chỉ tải khi cần.
 *
 * URL convention:
 *   DNN  : /DesktopModules/MegaForm/i18n/{locale}.json
 *   Web  : /megaform/i18n/{locale}.json
 *   CDN  : https://cdn.example.com/megaform/i18n/{locale}.json
 *
 * Format file JSON:
 *   { "builder.save": "Guardar", "form.submit": "Enviar", ... }
 */
// Bump when the shipped catalog changes so stale localStorage caches are dropped.
// 20260619-4: +18 ref keys, +64 dashboard/subs (Phase 0), +36 builder palette tile labels.
const I18N_CACHE_VERSION = '20260702-1';

export async function loadLocale(locale: string, baseUrl?: string): Promise<boolean> {
  locale = normalizeLocale(locale);
  if (locale === 'en-US' || locale === fallbackLocale) {
    currentLocale = locale;
    setDir(locale);
    return true; // en-US đã bundle sẵn
  }
  if (hasLocale(locale)) {
    currentLocale = locale;
    setDir(locale);
    return true; // đã cache trong RAM
  }
  // localStorage cache (versioned) — survives reloads, avoids a network hit and
  // a one-off fetch failure blanking the UI.
  const cacheKey = 'mf-i18n:' + locale + ':' + I18N_CACHE_VERSION;
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached) { setLocale(locale, JSON.parse(cached)); return true; }
  } catch { /* ignore corrupt cache */ }

  const url = resolveLocaleUrl(baseUrl, locale);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: LocaleStrings = await res.json();
    setLocale(locale, data);
    try {
      if (typeof localStorage !== 'undefined') {
        // prune older versions of this locale, then cache the fresh copy
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.indexOf('mf-i18n:' + locale + ':') === 0 && k !== cacheKey) localStorage.removeItem(k);
        }
        localStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch { /* quota/full — non-fatal */ }
    return true;
  } catch (e) {
    console.warn(`[MegaForm i18n] Failed to load locale "${locale}" from ${url}:`, e);
    currentLocale = fallbackLocale; // graceful fallback về en-US
    setDir(fallbackLocale);
    return false;
  }
}

/**
 * Auto-detect ngôn ngữ từ:
 * 1. data-mf-locale attribute trên <html> hoặc <body>
 * 2. window.MegaFormLocale global variable (set bởi server-side)
 * 3. navigator.language của browser
 * 4. Fallback: 'en-US'
 */
// Sticky locale persistence. The DNN host (dnn-host) rewrites the page URL
// during hash routing, stripping `?mflocale` BEFORE late-booting overlays
// (dashboard/submissions/my-inbox) read it. Each bundle also carries its own
// @i18n instance, so a locale loaded into one doesn't reach another. To bridge
// both: the moment ANY bundle sees an explicit `?mflocale`, persist it; every
// detectLocale() then recovers it. Also lets the Language Manager set a sticky
// choice that survives navigation. localStorage key is shared across bundles.
const LOCALE_PERSIST_KEY = 'mf-locale';
export function persistLocale(loc: string): void {
  try { if (loc && typeof localStorage !== 'undefined') localStorage.setItem(LOCALE_PERSIST_KEY, loc); } catch { /* quota */ }
}
function readPersistedLocale(): string {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(LOCALE_PERSIST_KEY)) || ''; } catch { return ''; }
}
function readUrlLocale(): string {
  try {
    const q = new URLSearchParams(window.location.search).get('mflocale');
    if (q) return q;
    // DNN's friendly-URL provider rewrites `?mflocale=de-DE` into a path segment
    // `/mflocale/de-DE`, so the query is gone before any JS runs. Recover it from
    // the path too (also matches `&mflocale=` that DNN folds into the path).
    const m = String(window.location.pathname || '').match(/\/mflocale\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?)/i);
    if (m) return m[1];
  } catch { /* no url */ }
  return '';
}

export function detectLocale(): string {
  if (typeof window === 'undefined') return 'en-US';
  // Priority: explicit ?mflocale (manual switch + QA) → sticky persisted choice
  // (survives DNN URL rewrites + language-switcher) → Oqtane host culture →
  // legacy globals/attrs → browser language. All BCP-47 fuzzy-normalised.
  const urlLoc = readUrlLocale();
  if (urlLoc) persistLocale(normalizeLocale(urlLoc));
  const pf = (window as any).__MF_PLATFORM__ || {};
  const raw = urlLoc
    || readPersistedLocale()
    || pf.culture
    || (window as any).MegaFormLocale
    || document.documentElement.getAttribute('data-mf-locale')
    || document.body?.getAttribute('data-mf-locale')
    || navigator.language
    || 'en-US';
  return normalizeLocale(String(raw));
}

/**
 * Init i18n — gọi 1 lần khi app khởi động.
 * Tự detect locale rồi load file tương ứng.
 *
 * @param baseUrl  URL thư mục chứa các file .json ngôn ngữ
 * @param locale   Nếu truyền vào thì override auto-detect
 */
export async function initI18n(baseUrl?: string, locale?: string): Promise<void> {
  const target = locale || detectLocale();
  await loadLocale(target, baseUrl || resolveI18nBase());
}

/** Resolve the i18n API/static base for the current platform (no trailing slash). */
export function resolveI18nBase(): string {
  try {
    const pf = (typeof window !== 'undefined' && (window as any).__MF_PLATFORM__) || {};
    let api = String(pf.apiBase || '').trim();
    if (!api && typeof document !== 'undefined') {
      const root = document.querySelector('[data-api-base]') as HTMLElement | null;
      api = (root && root.getAttribute('data-api-base')) || '';
    }
    if (!api) {
      const w = window as any;
      // Positive DNN evidence ONLY — otherwise assume Oqtane (the primary target).
      // Oqtane markers (window.Oqtane / [data-platform=oqtane]) can boot late, so the
      // old `else -> DNN` default made the builder/theme-designer resolve the DNN static
      // path on Oqtane -> /DesktopModules/MegaForm/Assets/js/builder/i18n/<loc>.json = 404.
      // Oqtane serves builder i18n via /api/MegaForm/i18n/Get; only the DNN static path
      // 404s on Oqtane, so never fall back to it without real DNN evidence. DNN keeps
      // working: it supplies an explicit /DesktopModules apiBase or matches isDnn below.
      const isDnn =
        (typeof document !== 'undefined' && !!document.querySelector('[data-platform="dnn"]')) ||
        (typeof location !== 'undefined' && /\/DesktopModules\//i.test(location.pathname)) ||
        (typeof window !== 'undefined' && !!w.dnn && !w.Oqtane && !w.__OQTANE__);
      api = isDnn ? '/DesktopModules/MegaForm/API/' : '/api/MegaForm/';
    }
    api = String(api).replace(/\/+$/, '');
    // DNN has NO i18n API route — the locale JSON ships as static assets under
    // the module's Assets/js/builder/i18n folder (verified 200). Oqtane serves
    // them through the /api/MegaForm/i18n endpoint. Branch per platform so the
    // fetch resolves on both. (DNN apiBase = /DesktopModules/MegaForm/API)
    if (/\/DesktopModules\/MegaForm\/API$/i.test(api)) {
      return api.replace(/\/API$/i, '/Assets/js/builder/i18n');
    }
    return api + '/i18n';
  } catch (_e) {
    return '/api/MegaForm/i18n';
  }
}

// Cập nhật global expose
if (typeof window !== 'undefined') {
  // EARLY capture: persist ?mflocale at module-load time (megaform-i18n.js is the
  // first MegaForm script on every page) so the DNN host's later URL rewrite
  // can't lose it before the dashboard/submissions overlays boot. Runs once per
  // bundle load; persistLocale is idempotent.
  try { const _u = readUrlLocale(); if (_u) persistLocale(normalizeLocale(_u)); } catch { /* no url */ }

  (window as any).MegaFormI18n = { setLocale, t, tplural, pluralCategory, getLocale, hasLocale, getGroup, loadLocale, detectLocale, initI18n, isRTL, setDir, normalizeLocale, exportCatalog, keyCount, resolveI18nBase, persistLocale };

  // ── Universal auto-activation ──────────────────────────────────────────────
  // The runtime form page server-renders its HTML and only loads bundles for
  // behaviour (init() is not called there), so each surface can't be relied on
  // to load the locale. On DOM-ready we detect the page locale and load its
  // catalog so EVERY already-wrapped string (widgets, form chrome, etc.) can
  // translate. en-US is a no-op; cached in localStorage so repeat loads are
  // instant. Surfaces that render after `MegaFormI18nReady` (or call loadLocale
  // themselves, like My Inbox) get a fully-loaded catalog before first paint.
  const _autoBoot = function (): Promise<boolean> {
    try {
      const loc = detectLocale();
      setDir(loc);
      if (!loc || loc === 'en-US' || loc === fallbackLocale) return Promise.resolve(true);
      return loadLocale(loc, resolveI18nBase()).then(function () { return true; }).catch(function () { return false; });
    } catch (_e) { return Promise.resolve(false); }
  };
  // Each bundle embeds its own copy of this engine with independent state, and
  // window.MegaFormI18n points to whichever loaded LAST. So every bundle must
  // auto-boot its own copy (catalog cached in localStorage → only the first
  // fetch hits the network) — that guarantees the active global is loaded.
  (window as any).MegaFormI18nReady = (typeof document !== 'undefined' && document.readyState === 'loading')
    ? new Promise<boolean>(function (res) { document.addEventListener('DOMContentLoaded', function () { _autoBoot().then(res as any); }, { once: true }); })
    : _autoBoot();
}

