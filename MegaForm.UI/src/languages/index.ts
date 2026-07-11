import { initI18n, t, detectLocale } from '@i18n';
import { getPlatformHostConfig, getPlatformRoute } from '@shared/platform-host';

type LocaleEntries = Record<string, string>;

type TabDef = { id: string; label: string; matcher: (key: string) => boolean };

const BADGE = 'LanguageDash v20260612-03';
const COMMON_LANGS = ['en-US','es-ES','fr-FR','de-DE','pt-BR','it-IT','nl-NL','pl-PL','ru-RU','tr-TR','ar-SA','vi-VN','th-TH','id-ID','hi-IN','ja-JP','ko-KR','zh-CN','zh-TW'];

// [LangPicker 2026-06-12] Metadata for the compact all-language Display-language
// picker. native = endonym (PRIMARY label; Windows-safe — flag emojis render as
// 2-letter codes on Windows so we never rely on them). english = subtitle/search.
// region is used ONLY to ORDER the flat grid (EU → AS → ME), never to fragment it.
type LangMeta = { native: string; english: string; rtl?: boolean; region: 'eu' | 'as' | 'me' };
const LANG_META: Record<string, LangMeta> = {
  'en-US': { native: 'English',           english: 'English',                region: 'eu' },
  'es-ES': { native: 'Español',           english: 'Spanish',                region: 'eu' },
  'fr-FR': { native: 'Français',          english: 'French',                 region: 'eu' },
  'de-DE': { native: 'Deutsch',           english: 'German',                 region: 'eu' },
  'pt-BR': { native: 'Português',         english: 'Portuguese (BR)',        region: 'eu' },
  'it-IT': { native: 'Italiano',          english: 'Italian',                region: 'eu' },
  'nl-NL': { native: 'Nederlands',        english: 'Dutch',                  region: 'eu' },
  'pl-PL': { native: 'Polski',            english: 'Polish',                 region: 'eu' },
  'ru-RU': { native: 'Русский',           english: 'Russian',                region: 'eu' },
  'tr-TR': { native: 'Türkçe',            english: 'Turkish',                region: 'eu' },
  'ar-SA': { native: 'العربية',           english: 'Arabic',      rtl: true, region: 'me' },
  'vi-VN': { native: 'Tiếng Việt',        english: 'Vietnamese',             region: 'as' },
  'th-TH': { native: 'ไทย',               english: 'Thai',                   region: 'as' },
  'id-ID': { native: 'Bahasa Indonesia',  english: 'Indonesian',             region: 'as' },
  'hi-IN': { native: 'हिन्दी',              english: 'Hindi',                  region: 'as' },
  'ja-JP': { native: '日本語',             english: 'Japanese',               region: 'as' },
  'ko-KR': { native: '한국어',             english: 'Korean',                 region: 'as' },
  'zh-CN': { native: '简体中文',           english: 'Chinese (Simplified)',   region: 'as' },
  'zh-TW': { native: '繁體中文',           english: 'Chinese (Traditional)',  region: 'as' },
};

// [LangRedesign 2026-06-12] Sidebar icons mirrored from the Form Dashboard so the
// Languages screen shares the exact same shell + design language.
const IC: Record<string, string> = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  inbox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  panel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
  db: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  mail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  files: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/></svg>`,
  shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  sparkles: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  googleSheet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 10h18"/><path d="M8 6v12"/><path d="M16 6v12"/></svg>`,
  globe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
};
function navUrl(panel: string): string { try { return getPlatformRoute(panel as any); } catch { return '/'; } }

// Category tabs for the "copy-from-English → translate" editor. Each tab groups
// catalog keys by namespace so an admin translates Dashboard / Widgets / Controls
// etc. separately. Aligned with the src/i18n/keys/*.ts namespace split.
const TABS: TabDef[] = [
  { id: 'general', label: 'General', matcher: k => k.startsWith('general.') || k.startsWith('common.') || k.startsWith('sub.') || k.startsWith('live.') || k.startsWith('style.') },
  { id: 'dashboard', label: 'Dashboard', matcher: k => k.startsWith('dash.') },
  { id: 'controls', label: 'Controls', matcher: k => k.startsWith('field.') || k.startsWith('prop.') || k.startsWith('category.') || k.startsWith('canvas.') },
  { id: 'widgets', label: 'Widgets', matcher: k => k.startsWith('widget.') },
  { id: 'builder', label: 'Builder', matcher: k => k.startsWith('builder.') },
  { id: 'navigation', label: 'Navigation', matcher: k => k.startsWith('form.') && /(submit|next|previous|page_of|save_draft|draft_saved|submitting|success|error)/.test(k) },
  { id: 'validation', label: 'Validation', matcher: k => k.startsWith('form.') && /(required|invalid|min_|max_|file_|captcha|rate_)/.test(k) },
  { id: 'server', label: 'Server', matcher: k => k.startsWith('server.') }
];

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

function isApiI18nBase(base: string): boolean {
  return /\/API\/i18n\/?$/i.test(base) || /\/api\/i18n\/?$/i.test(base) || /\/api\/MegaForm\/i18n\/?$/i.test(base);
}

function buildLocaleFetchUrl(base: string, locale: string): string {
  const normalized = String(base || '').replace(/\/?$/, '/');
  if (isApiI18nBase(normalized)) {
    // [i18nFetchFix 2026-06-13] The server exposes the per-locale pack as
    // `i18n/Get?id={locale}` (see MegaFormController [HttpGet("i18n/Get")]), NOT a
    // path-style `i18n/{locale}` route — the latter 404'd and the Languages admin
    // rendered "404 Not Found". Use the querystring form for the API base.
    return normalized + 'Get?id=' + encodeURIComponent(locale);
  }
  return normalized.replace(/\/$/, '') + '/' + encodeURIComponent(locale) + '.json';
}

function buildLocaleListUrl(base: string): string {
  const normalized = String(base || '').replace(/\/?$/, '/');
  return isApiI18nBase(normalized) ? normalized + 'list' : normalized + 'index.json';
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const text = await r.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.error || data?.detail || text || `${r.status} ${r.statusText}`);
  return data as T;
}

function getI18nApiBase(root: HTMLElement): string {
  const platformBase = getPlatformHostConfig().apiBase;
  const raw = root.dataset.apiBase || platformBase || '/api/MegaForm/';
  const base = String(raw || '/api/MegaForm/').replace(/\/?$/, '/');
  return /i18n\/?$/i.test(base) ? base.replace(/\/?$/, '/') : base + 'i18n/';
}

function buildLocaleWriteUrl(base: string, action: 'create' | 'save' | 'import'): string {
  return String(base || '').replace(/\/?$/, '/') + action;
}

function esc(input: any): string {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function groupKeys(keys: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  TABS.forEach(tab => { out[tab.id] = []; });
  keys.forEach(key => {
    const match = TABS.find(tab => tab.matcher(key));
    (out[match ? match.id : 'general'] ||= []).push(key);
  });
  Object.keys(out).forEach(k => out[k].sort((a, b) => a.localeCompare(b)));
  return out;
}

function toast(msg: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const el = document.createElement('div');
  el.className = `mf-loc-toast mf-loc-toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  window.setTimeout(() => {
    el.classList.remove('is-visible');
    window.setTimeout(() => el.remove(), 240);
  }, 2600);
}

// ─── AI Engine bootstrap (Translate button) ───────────────────────────────
// Like the dashboard, this bundle deliberately omits the ~160KB AI provider
// bundle (megaform-ai-form-assistant.js → window.MF_AI). The Translate button
// injects it on demand + applies the SHARED server AI Settings the admin
// configured (Dashboard → AI Settings, via AiAssistant/DefaultConfig) so the
// translation honors the chosen provider (e.g. claude-cli). This mirrors
// dashboard/ai-form-creator.ts:ensureMfAi — kept self-contained here to avoid
// pulling the whole dashboard bundle into the languages page.
let __mfAiBootPromise: Promise<void> | null = null;

function mfPlatform(): any {
  return (window as any).__MF_PLATFORM__ || {};
}
function isOqtaneRt(): boolean {
  const pf = mfPlatform();
  if (String(pf.platform || '').toLowerCase() === 'oqtane') return true;
  return !!document.querySelector('[data-platform="oqtane"]') || !!(window as any).Oqtane;
}
function aiApiBase(): string {
  const explicit = String(mfPlatform().aiApiBase || (window as any).__MF_AI_API_BASE__ || '');
  if (explicit) return explicit.charAt(explicit.length - 1) === '/' ? explicit : explicit + '/';
  return isOqtaneRt() ? '/api/' : '/DesktopModules/MegaForm/API/';
}
function aiBundleUrl(): string {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[];
  const src = scripts.map(s => s.src).find(u => /megaform-languages\.js/i.test(u))
           || scripts.map(s => s.src).find(u => /megaform-(dashboard|builder-loader)\.js/i.test(u));
  if (src) return src.replace(/megaform-[a-z-]+\.js/i, 'megaform-ai-form-assistant.js');
  return (isOqtaneRt() ? '/Modules/MegaForm/js/' : '/DesktopModules/MegaForm/Assets/js/') + 'megaform-ai-form-assistant.js';
}
function aiDefaultConfigQuery(): string {
  const pf = mfPlatform();
  if (isOqtaneRt()) {
    const sid = pf.siteId ?? pf.SiteId ?? pf.portalId ?? 1;
    return '?entityid=' + encodeURIComponent(String(sid)) + '&entityname=Site&siteId=' + encodeURIComponent(String(sid));
  }
  const pid = pf.portalId ?? pf.PortalId ?? 0;
  return '?portalId=' + encodeURIComponent(String(pid));
}
async function applySharedAiConfig(api: any): Promise<void> {
  const ok = (c: any) => c && (c.apiKey || c.provider === 'claude-cli' || c.provider === 'megaform-local');
  try {
    const r = await fetch(aiApiBase() + 'AiAssistant/DefaultConfig' + aiDefaultConfigQuery(), { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) {
      const def = await r.json();
      if (ok(def) && typeof api.setConfig === 'function') { api.setConfig(def); return; }
    }
  } catch { /* the bundle's own loadServerDefault() is the fallback */ }
  const start = Date.now();
  while (Date.now() - start < 5000) {
    try { if (ok(api.getConfig && api.getConfig())) return; } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 120));
  }
}
async function ensureMfAi(): Promise<any> {
  const w = window as any;
  const ready = () => w.MF_AI && typeof w.MF_AI.chat === 'function';
  if (!ready()) {
    if (!__mfAiBootPromise) {
      __mfAiBootPromise = new Promise<void>((resolve, reject) => {
        try {
          if (document.querySelector('script[data-mf-ai-bundle]')) { resolve(); return; }
          const s = document.createElement('script');
          s.src = aiBundleUrl();
          s.async = true;
          s.setAttribute('data-mf-ai-bundle', '1');
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Could not load the AI provider bundle.'));
          document.head.appendChild(s);
        } catch (e) { reject(e as any); }
      });
    }
    await __mfAiBootPromise;
    const start = Date.now();
    while (!ready()) {
      if (Date.now() - start > 8000) throw new Error('AI provider bundle loaded but MF_AI is unavailable.');
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  await applySharedAiConfig(w.MF_AI);
  return w.MF_AI;
}

// Extract a JSON object from a model reply (tolerates code fences / stray prose).
function parseJsonObject(text: string): Record<string, string> | null {
  if (!text) return null;
  let s = text.trim();
  // strip ```json … ``` fences if present
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fence && fence[1]) s = fence[1].trim();
  try { const o = JSON.parse(s); if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, string>; } catch { /* fall through */ }
  const first = s.indexOf('{'); const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { const o = JSON.parse(s.slice(first, last + 1)); if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, string>; } catch { /* give up */ }
  }
  return null;
}

class LanguageDashboard {
  private root: HTMLElement;
  private apiBase: string;
  private adminLocale: string;
  private locales: string[] = [];
  private english: LocaleEntries = {};
  private currentLocale = 'en-US';
  private currentEntries: LocaleEntries = {};
  private activeTab = 'general';
  private groupedKeys: Record<string, string[]> = {};
  private search = '';
  // [LangPicker] body-appended popover state (persists across render() re-runs).
  private langPanel: HTMLElement | null = null;
  private langKbdIndex = -1;
  private _langScrollHandler: (() => void) | null = null;
  private _langDocClick: ((e: Event) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.apiBase = getI18nApiBase(root);
    this.adminLocale = root.dataset.adminLocale || 'en-US';
  }

  async init(): Promise<void> {
    // [LangPicker fix 2026-06-12] Respect the picker's sticky choice / ?mflocale
    // (detectLocale: ?mflocale → localStorage('mf-locale') → platform culture → …)
    // instead of forcing the server admin culture. Passing a truthy adminLocale
    // short-circuited detectLocale(), so the Languages panel was stuck in en-US
    // chrome even after the admin switched the display language. Fall back to the
    // server hint only when detection yields nothing.
    await initI18n(this.apiBase.replace(/\/?$/, ''), detectLocale() || this.adminLocale);
    this.injectStyles();
    await this.loadLocales();
    await this.loadEnglish();
    this.groupedKeys = groupKeys(Object.keys(this.english));
    await this.loadCurrent(this.currentLocale);
    this.render();
  }

  private async loadLocales(): Promise<void> {
    this.locales = await getJson<string[]>(buildLocaleListUrl(this.apiBase));
    if (!this.locales.includes('en-US')) this.locales.unshift('en-US');
    this.currentLocale = this.locales[0] || 'en-US';
  }

  private async loadEnglish(): Promise<void> {
    this.english = await getJson<LocaleEntries>(buildLocaleFetchUrl(this.apiBase, 'en-US'));
    this.ensureSeedKeys(this.english);
  }

  private ensureSeedKeys(entries: LocaleEntries): void {
    const seed: LocaleEntries = {
      'widget.appointment.select_date': 'Select date',
      'widget.appointment.choose_date': 'Choose a date',
      'widget.appointment.choose_date_prompt': 'Choose a date to see available times.',
      'widget.appointment.select_date_time': 'Select date and time',
      'widget.appointment.choose_time': 'Choose an available time',
      'widget.appointment.open_calendar': 'Open calendar',
      'widget.appointment.change': 'Change',
      'widget.appointment.no_slots': 'No time slots available for this day.',
      'widget.appointment.selected': 'Selected appointment',
      'widget.appointment.date': 'Date',
      'widget.appointment.time': 'Time',
      'widget.appointment.timezone': 'Timezone',
      'widget.rating.value': 'Selected rating: {value}',
      'widget.rating.question_nps': 'How likely are you to recommend us?',
      'widget.file.uploading': 'Uploading…',
      'widget.file.drop_here': 'Click or drag files here',
      'widget.signature.sign_here': 'Sign here',
      'widget.signature.clear': 'Clear',
      'builder.language.default': 'Default language',
      'builder.language.supported': 'Supported languages',
      'builder.language.action': 'Language'
    };
    Object.keys(seed).forEach(key => {
      if (!entries[key]) entries[key] = seed[key];
    });
  }

  private async loadCurrent(locale: string): Promise<void> {
    this.currentLocale = locale;
    try {
      this.currentEntries = await getJson<LocaleEntries>(buildLocaleFetchUrl(this.apiBase, locale));
    } catch {
      this.currentEntries = {};
    }
    this.ensureSeedKeys(this.currentEntries);
  }

  private injectStyles(): void {
    if (document.getElementById('mf-languages-style')) return;
    const style = document.createElement('style');
    style.id = 'mf-languages-style';
    style.textContent = `
      .mf-loc-shell{min-height:100vh;background:#f8fafc;color:#0f172a;font-family:Inter,sans-serif}
      .mf-loc-wrap{max-width:1400px;margin:0 auto;padding:24px}
      .mf-loc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:20px}
      .mf-loc-title{font-size:28px;font-weight:800;margin:0 0 6px}
      .mf-loc-sub{color:#64748b;font-size:14px;margin:0}
      .mf-loc-badge{display:inline-flex;align-items:center;gap:8px;border:1px solid #cbd5e1;background:#fff;padding:8px 12px;border-radius:999px;font-size:12px;color:#334155;font-weight:700}
      .mf-loc-head-right{display:flex;align-items:center;gap:10px;flex-shrink:0}
      .mf-loc-close{display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff;color:#334155;padding:8px 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:.15s}
      .mf-loc-close:hover{background:#0f172a;color:#fff;border-color:#0f172a}
      .mf-loc-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:20px}
      .mf-loc-main-area{max-width:1320px;margin:0 auto;width:100%;color:#0f172a;font-family:Inter,system-ui,sans-serif}
      .mf-loc-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
      .mf-loc-side{padding:18px;display:grid;gap:16px;align-content:start}
      .mf-loc-main{padding:18px}
      .mf-loc-field label{display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:8px}
      .mf-loc-field select,.mf-loc-field input,.mf-loc-field textarea{width:100%;border:1px solid #dbe4f0;border-radius:14px;padding:11px 12px;font:inherit;background:#fff}
      .mf-loc-field textarea{min-height:120px;resize:vertical}
      .mf-loc-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .mf-loc-btn{border:none;border-radius:9px;padding:10px 14px;font-weight:600;cursor:pointer;background:#0f172a;color:#fff}
      .mf-loc-btn.alt{background:#eef2ff;color:#312e81}
      .mf-loc-btn.ghost{background:#fff;color:#0f172a;border:1px solid #dbe4f0}
      .mf-loc-btn.warn{background:#eff6ff;color:#1d4ed8}
      .mf-loc-hint{margin:2px 0 0;font-size:11.5px;line-height:1.55;color:#64748b}
      .mf-loc-hint strong{color:#334155}
      .mf-loc-tabs{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
      .mf-loc-tab{border:none;background:#f1f5f9;color:#334155;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer}
      .mf-loc-tab.active{background:#0f172a;color:#fff}
      .mf-loc-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px}
      .mf-loc-count{font-size:12px;color:#64748b}
      .mf-loc-rows{display:grid;gap:12px;max-height:70vh;overflow:auto;padding-right:6px}
      .mf-loc-row{border:1px solid #e2e8f0;border-radius:16px;padding:14px;background:#fff}
      .mf-loc-key{font-size:12px;font-weight:800;color:#0f172a;margin-bottom:8px;word-break:break-all}
      .mf-loc-base{font-size:12px;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:9px 10px;margin-bottom:10px;white-space:pre-wrap}
      .mf-loc-row textarea{width:100%;min-height:76px;border:1px solid #dbe4f0;border-radius:12px;padding:10px 12px;font:inherit}
      .mf-loc-empty{padding:40px 16px;text-align:center;color:#94a3b8}
      .mf-loc-toast{position:fixed;right:20px;bottom:20px;padding:12px 16px;border-radius:12px;background:#0f172a;color:#fff;opacity:0;transform:translateY(8px);transition:.18s;z-index:9999}
      .mf-loc-toast.is-visible{opacity:1;transform:none}
      .mf-loc-toast-success{background:#166534}.mf-loc-toast-error{background:#b91c1c}
      .mf-loc-switcher{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:12px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:16px}
      .mf-loc-switcher-label{font-weight:800;color:#0c4a6e;font-size:13px;margin-right:4px}
      .mf-loc-lang{border:1px solid #bae6fd;background:#fff;color:#0c4a6e;border-radius:999px;padding:7px 14px;font-weight:700;font-size:13px;cursor:pointer;transition:.15s}
      .mf-loc-lang:hover{border-color:#0284c7;transform:translateY(-1px)}
      .mf-loc-lang.active{background:#0284c7;color:#fff;border-color:#0284c7;box-shadow:0 2px 6px rgba(2,132,199,.3)}
      .mf-loc-switcher-hint{font-size:11px;color:#0369a1;flex-basis:100%}
      .mf-loc-searchbar{position:relative;display:flex;align-items:center;margin-bottom:14px}
      .mf-loc-search-ic{position:absolute;left:14px;font-size:15px;pointer-events:none;opacity:.7}
      .mf-loc-search{flex:1;border:1.5px solid #cbd5e1;border-radius:14px;padding:12px 38px 12px 40px;font:inherit;font-size:14px;background:#fff;outline:none;transition:.15s}
      .mf-loc-search:focus{border-color:#0284c7;box-shadow:0 0 0 3px rgba(2,132,199,.15)}
      .mf-loc-search::-webkit-search-cancel-button{display:none}
      .mf-loc-search-clear{position:absolute;right:10px;width:26px;height:26px;border:none;border-radius:8px;background:#f1f5f9;color:#475569;cursor:pointer;font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center}
      .mf-loc-search-clear:hover{background:#e2e8f0;color:#0f172a}
      .mf-loc-tabs[data-dim="1"]{opacity:.45}
      .mf-loc-cat-badge{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:10.5px;font-weight:700;cursor:pointer;vertical-align:middle;border:1px solid #c7d2fe}
      .mf-loc-cat-badge:hover{background:#3730a3;color:#fff}
      .mf-loc-hl{background:#fde68a;color:#78350f;border-radius:3px;padding:0 1px;font-weight:700}
      /* ── Compact all-language Display-language picker [LangPicker 2026-06-12] ──
         Namespaced .mf-langpick-* ; mirrors the .mfc-* MultiColumnCombo + the
         .mf-loc-* sky palette. Trigger is compact; panel is body-appended+fixed. */
      .mf-langpick{position:relative;display:inline-block;font-family:Inter,system-ui,sans-serif}
      .mf-langpick-trigger{display:inline-flex;align-items:center;gap:8px;max-width:240px;border:1px solid #bae6fd;background:#fff;color:#0c4a6e;border-radius:999px;padding:7px 12px;font-weight:700;font-size:13px;cursor:pointer;transition:.15s}
      .mf-langpick-trigger:hover{border-color:#0284c7;box-shadow:0 1px 3px rgba(2,132,199,.2)}
      .mf-langpick-trigger:focus-visible{outline:none;border-color:#0284c7;box-shadow:0 0 0 3px rgba(2,132,199,.15)}
      .mf-langpick-trigger[aria-expanded="true"]{background:#0284c7;color:#fff;border-color:#0284c7;box-shadow:0 2px 6px rgba(2,132,199,.3)}
      .mf-langpick-globe{display:inline-flex;width:16px;height:16px}
      .mf-langpick-globe svg{width:16px;height:16px}
      .mf-langpick-current{font-weight:700;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mf-langpick-code{font-size:11px;font-family:'Monaco','Menlo',monospace;opacity:.7;letter-spacing:-.3px}
      .mf-langpick-caret{font-size:11px;opacity:.7;transition:transform .2s;margin-left:1px}
      .mf-langpick-trigger[aria-expanded="true"] .mf-langpick-caret{transform:rotate(180deg)}
      .mf-langpick-panel{position:fixed;z-index:10010;display:flex;flex-direction:column;width:min(560px,calc(100vw - 24px));max-height:min(520px,calc(100vh - 24px));background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.18);overflow:hidden}
      .mf-langpick-panel[hidden]{display:none}
      .mf-langpick-search-wrap{position:relative;display:flex;align-items:center;padding:12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0}
      .mf-langpick-search-ic{position:absolute;left:24px;font-size:13px;opacity:.55;pointer-events:none}
      .mf-langpick-search{flex:1;border:1.5px solid #cbd5e1;border-radius:10px;padding:9px 12px 9px 34px;font:inherit;font-size:13px;background:#fff;color:#0f172a;outline:none;transition:.15s}
      .mf-langpick-search:focus{border-color:#0284c7;box-shadow:0 0 0 2px rgba(2,132,199,.12)}
      .mf-langpick-search::placeholder{color:#94a3b8}
      .mf-langpick-search::-webkit-search-cancel-button{display:none}
      .mf-langpick-grid{list-style:none;margin:0;padding:8px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;overflow-y:auto;flex:1}
      .mf-langpick-grid::-webkit-scrollbar{width:8px}
      .mf-langpick-grid::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}
      .mf-langpick-grid::-webkit-scrollbar-thumb:hover{background:#94a3b8}
      .mf-langpick-cell{display:flex;flex-direction:column;gap:4px;padding:9px 10px;border:1.5px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;transition:.12s;text-align:left;min-width:0}
      .mf-langpick-cell:hover{border-color:#bae6fd;background:#f0f9ff}
      .mf-langpick-cell.is-kbd{border-color:#bae6fd;background:#f0f9ff;box-shadow:0 0 0 2px rgba(2,132,199,.12)}
      .mf-langpick-cell[aria-selected="true"]{border-color:#0284c7;background:#f0f9ff;box-shadow:0 1px 4px rgba(2,132,199,.2)}
      .mf-langpick-cell[aria-selected="true"] .mf-langpick-native{color:#0c4a6e}
      .mf-langpick-cell[hidden]{display:none}
      .mf-langpick-native{font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mf-langpick-native[dir="rtl"]{text-align:right;direction:rtl;unicode-bidi:isolate}
      .mf-langpick-sub{display:flex;align-items:center;gap:6px;min-width:0}
      .mf-langpick-chip{flex-shrink:0;padding:1px 6px;border-radius:4px;background:#f1f5f9;color:#475569;font-size:10px;font-weight:700;font-family:'Monaco','Menlo',monospace;letter-spacing:-.3px;direction:ltr;unicode-bidi:isolate}
      .mf-langpick-en{font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mf-langpick-empty{padding:28px 16px;text-align:center;color:#94a3b8;font-size:13px}
      .mf-langpick-empty[hidden]{display:none}
      [dir="rtl"] .mf-langpick-trigger{flex-direction:row-reverse}
      [dir="rtl"] .mf-langpick-search-ic{left:auto;right:24px}
      [dir="rtl"] .mf-langpick-search{padding:9px 34px 9px 12px}
      [dir="rtl"] .mf-langpick-cell{text-align:right}
      [dir="rtl"] .mf-langpick-chip{direction:ltr}
      @media (max-width:640px){.mf-langpick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mf-langpick-panel{width:calc(100vw - 16px)}}
      @media (max-width:380px){.mf-langpick-grid{grid-template-columns:1fr}}
      @media (max-width: 980px){.mf-loc-grid{grid-template-columns:1fr}.mf-loc-actions{grid-template-columns:1fr}.mf-loc-toolbar{flex-direction:column;align-items:flex-start}}
    `;
    document.head.appendChild(style);
  }

  // [LangRedesign 2026-06-12] The exact Form-Dashboard sidebar (uses the shared
  // megaform-admin-shell.css .mf-sidebar/.mf-sb-* classes already loaded on the page),
  // with "Languages" active + t()-localised labels so it matches every other surface.
  private renderShellSidebar(): string {
    const dash = navUrl('dashboard');
    const lk = (href: string, icon: string, label: string, active = false): string =>
      `<a class="mf-sb-lk${active ? ' is-active' : ''}" href="${esc(href)}">${IC[icon] || IC.panel}<span class="mf-sb-lk-lbl">${esc(label)}</span></a>`;
    return `<aside class="mf-sidebar" data-state="expanded">
      <div class="mf-sb-hd"><div class="mf-sb-logo"><div class="mf-sb-logo-icon">${IC.file}</div><div class="mf-sb-logo-copy"><span class="mf-sb-name">MegaForm</span><span class="mf-sb-ver">v2.4.1</span></div></div></div>
      <div class="mf-sb-cnt">
        <div class="mf-sb-grp"><div class="mf-sb-grp-lbl">${esc(t('dash.nav_main', 'Main'))}</div><div class="mf-sb-menu">
          ${lk(dash, 'dashboard', t('dash.nav_dashboard', 'Dashboard'))}
          ${lk(navUrl('builder'), 'file', t('dash.nav_form_builder', 'Form Builder'))}
          ${lk(navUrl('submissions'), 'inbox', t('dash.nav_submissions', 'Submissions'))}
          ${lk(navUrl('myinbox'), 'inbox', t('dash.nav_my_inbox', 'My Inbox'))}
        </div></div>
        <div class="mf-sb-sep"></div>
        <div class="mf-sb-grp"><div class="mf-sb-grp-lbl">${esc(t('dash.nav_config', 'Configuration'))}</div><div class="mf-sb-menu">
          ${lk(navUrl('languages'), 'globe', t('dash.nav_languages', 'Languages'), true)}
          ${lk(dash + '#database-settings', 'db', t('dash.nav_database', 'Database Settings'))}
          ${lk(dash + '#payment-settings', 'card', t('dash.nav_payment', 'Payment Settings'))}
          ${lk(dash + '#email-settings', 'mail', t('dash.nav_email', 'Email Settings'))}
          ${lk(dash + '#upload-settings', 'files', t('dash.nav_upload', 'Upload Settings'))}
          ${lk(dash + '#captcha-settings', 'shield', t('dash.nav_captcha', 'Captcha Settings'))}
          ${lk(dash + '#ai-settings', 'sparkles', t('dash.nav_ai', 'AI Settings'))}
          ${lk(dash + '#google-sheets', 'googleSheet', t('dash.nav_gsheets', 'Google Sheets'))}
        </div></div>
      </div>
      <div class="mf-sb-ft"><div class="mf-sb-uw"><div class="mf-sb-ub"><div class="mf-sb-av">A</div><div class="mf-sb-ui"><span class="mf-sb-uname">Admin</span><span class="mf-sb-urole">Administrator</span></div></div></div></div>
    </aside>`;
  }

  private renderShellHeader(): string {
    return `<header class="mf-hd">
      <button type="button" class="mf-sb-tog" id="mf-loc-sb-tog" title="Toggle sidebar">${IC.panel}</button>
      <div class="mf-hd-sep"></div>
      <nav class="mf-bc"><ol class="mf-bc-list"><li class="mf-bc-item"><a class="mf-bc-link" href="${esc(navUrl('dashboard'))}">${esc(t('dash.nav_dashboard', 'Dashboard'))}</a></li><li class="mf-bc-sep">/</li><li class="mf-bc-page">${esc(t('dash.nav_languages', 'Languages'))}</li></ol></nav>
      <div class="mf-flex1"></div>
      <div class="mf-hd-ac">
        <button type="button" id="mf-loc-close" class="mf-btn mf-btn-ghost mf-btn-sm" title="${esc(t('dash.close', 'Close'))}">${IC.close} <span class="mf-btn-lbl">${esc(t('dash.close', 'Close'))}</span></button>
      </div>
    </header>`;
  }

  private render(): void {
    const localeOptions = this.locales.map(l => `<option value="${esc(l)}"${l === this.currentLocale ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const commonOptions = COMMON_LANGS.filter(l => !this.locales.includes(l)).map(l => `<option value="${esc(l)}"></option>`).join('');
    try { document.body.classList.add('mf-body'); } catch { /* host CSP */ }
    this.root.innerHTML = `
      <div class="mf-layout mf-loc-layout">
        ${this.renderShellSidebar()}
        <div class="mf-inset">
          ${this.renderShellHeader()}
          <main class="mf-main mf-loc-main-area">
          <div class="mf-loc-switcher">
            <span class="mf-loc-switcher-label">🌍 ${esc(t('dash.lang.display', 'Display language'))}</span>
            ${this.renderLangTrigger()}
            <span class="mf-loc-switcher-hint">${esc(t('dash.lang.hint', 'Applies the chosen language to the whole admin UI & forms for your browser (sticky). Choose English to reset.'))}</span>
          </div>
          <div class="mf-loc-grid">
            <div class="mf-loc-card mf-loc-side">
              <div class="mf-loc-field">
                <label for="mf-loc-current">Language</label>
                <select id="mf-loc-current">${localeOptions}</select>
              </div>
              <div class="mf-loc-field">
                <label for="mf-loc-new">Create language</label>
                <input id="mf-loc-new" list="mf-loc-list" placeholder="fr-FR / de-DE / th-TH" />
                <datalist id="mf-loc-list">${commonOptions}</datalist>
              </div>
              <div class="mf-loc-actions">
                <button class="mf-loc-btn" id="mf-loc-create" title="Create a new language pack (copied from English)">Create</button>
                <button class="mf-loc-btn ghost" id="mf-loc-download" title="Download this language as a JSON file to edit offline">Download JSON</button>
                <button class="mf-loc-btn ghost" id="mf-loc-upload" title="Upload an edited JSON file to replace this language">Upload JSON</button>
                <button class="mf-loc-btn warn" id="mf-loc-ai" title="Auto-translate the untranslated strings with the site AI engine">Translate (AI)</button>
                <button class="mf-loc-btn" id="mf-loc-save" style="grid-column:1 / -1" title="Save your inline edits to this language">Save</button>
              </div>
              <input type="file" id="mf-loc-upload-file" accept=".json,application/json" style="display:none" />
              <p class="mf-loc-hint">Edit strings on the right, then <strong>Save</strong>. To bulk-edit offline: <strong>Download JSON</strong> → edit → <strong>Upload JSON</strong> to replace. <strong>Translate (AI)</strong> fills the empty strings for you.</p>
            </div>
            <div class="mf-loc-card mf-loc-main">
              <div class="mf-loc-searchbar">
                <span class="mf-loc-search-ic">🔎</span>
                <input id="mf-loc-search" class="mf-loc-search" type="search" autocomplete="off" spellcheck="false"
                       placeholder="Search any string, key, widget or control… (e.g. Delete, widget.file, Submit)" value="${esc(this.search)}" />
                <button id="mf-loc-search-clear" class="mf-loc-search-clear" type="button" title="Clear search"${this.search ? '' : ' style="display:none"'}>✕</button>
              </div>
              <div class="mf-loc-tabs"${this.search.trim() ? ' data-dim="1"' : ''}>${TABS.map(tab => `<button class="mf-loc-tab${tab.id === this.activeTab ? ' active' : ''}" data-tab="${tab.id}">${esc(tab.label)}</button>`).join('')}</div>
              <div class="mf-loc-toolbar">
                <div class="mf-loc-count" id="mf-loc-count">${this.countLabel()}</div>
                <div class="mf-loc-count">English baseline is always the fallback.</div>
              </div>
              <div id="mf-loc-rows" class="mf-loc-rows">${this.renderRows()}</div>
            </div>
          </div>
          </main>
        </div>
      </div>`;
    this.bind();
  }

  private activeDisplayLocale(): string {
    try {
      const ls = localStorage.getItem('mf-locale');
      if (ls) return ls;
      const I = (window as any).MegaFormI18n;
      if (I && typeof I.getLocale === 'function') { const v = I.getLocale(); if (v) return v; }
    } catch { /* no storage */ }
    return 'en-US';
  }

  // ─── Compact all-language picker [LangPicker 2026-06-12] ───────────────────
  // Replaces the old 6-pill row. A small trigger when closed; a searchable,
  // body-appended, 3-column popover listing EVERY installed language when open.
  // Mirrors the MultiColumnCombo widget model (trigger[aria-expanded] / panel
  // [hidden] / substring filter / outside-click / keyboard). Preserves the exact
  // persist-to-mf-locale + reload behavior of the old pills.
  private langNative(code: string): string { return LANG_META[code]?.native || code; }
  private langEnglish(code: string): string { return LANG_META[code]?.english || code; }
  private langRtl(code: string): boolean { return !!LANG_META[code]?.rtl; }

  // Flat grid order: en-US pinned first, then region (EU→AS→ME), then English
  // name. Only installed locales appear (this.locales); zh-TW etc. show only if a
  // pack exists. Unknown codes degrade gracefully (code used as its own label).
  private langOrder(): string[] {
    const rank = (c: string): number => ({ eu: 0, as: 1, me: 2 } as Record<string, number>)[LANG_META[c]?.region ?? 'eu'] ?? 0;
    const codes = Array.from(new Set<string>(['en-US', ...this.locales])).filter(Boolean);
    return codes.sort((a, b) =>
      a === 'en-US' ? -1 : b === 'en-US' ? 1 :
        (rank(a) - rank(b)) || this.langEnglish(a).localeCompare(this.langEnglish(b)));
  }

  private langTriggerEl(): HTMLButtonElement | null {
    return this.root.querySelector<HTMLButtonElement>('#mf-langpick-trigger');
  }

  private renderLangTrigger(): string {
    const active = this.activeDisplayLocale();
    return `<div class="mf-langpick" id="mf-langpick">
      <button type="button" class="mf-langpick-trigger" id="mf-langpick-trigger"
              aria-haspopup="listbox" aria-expanded="false" aria-controls="mf-langpick-panel"
              title="${esc(t('dash.lang.change', 'Change display language'))}">
        <span class="mf-langpick-globe" aria-hidden="true">${IC.globe}</span>
        <span class="mf-langpick-current">${esc(this.langNative(active))}</span>
        <span class="mf-langpick-code">${esc(active)}</span>
        <span class="mf-langpick-caret" aria-hidden="true">▾</span>
      </button>
    </div>`;
  }

  private langCellHtml(code: string): string {
    const active = code === this.activeDisplayLocale();
    const native = this.langNative(code), english = this.langEnglish(code);
    const search = `${native} ${english} ${code}`.toLowerCase();
    return `<li class="mf-langpick-cell" role="option" tabindex="-1" data-set-lang="${esc(code)}" data-search="${esc(search)}"${active ? ' aria-selected="true"' : ''}>
      <span class="mf-langpick-native"${this.langRtl(code) ? ' dir="rtl"' : ''}>${esc(native)}</span>
      <span class="mf-langpick-sub"><span class="mf-langpick-chip">${esc(code)}</span><span class="mf-langpick-en">${esc(english)}</span></span>
    </li>`;
  }

  // Built lazily on first open + appended to <body> (NOT this.root) so no ancestor
  // overflow / border-radius / transform can clip it. Persists across render()
  // re-runs; the cell grid is rebuilt on each ensure to reflect the active locale.
  private ensureLangPanel(): HTMLElement {
    if (this.langPanel && document.body.contains(this.langPanel)) {
      const grid = this.langPanel.querySelector<HTMLElement>('#mf-langpick-grid');
      if (grid) grid.innerHTML = this.langOrder().map(c => this.langCellHtml(c)).join('');
      return this.langPanel;
    }
    const panel = document.createElement('div');
    panel.className = 'mf-langpick-panel';
    panel.id = 'mf-langpick-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', t('dash.lang.select', 'Select display language'));
    panel.hidden = true;
    panel.innerHTML = `
      <div class="mf-langpick-search-wrap">
        <span class="mf-langpick-search-ic" aria-hidden="true">🔎</span>
        <input type="text" class="mf-langpick-search" id="mf-langpick-search" autocomplete="off" spellcheck="false"
               aria-autocomplete="list" aria-controls="mf-langpick-grid"
               placeholder="${esc(t('dash.lang.search', 'Search… (Español, العربية, 한국어, fr…)'))}" />
      </div>
      <ul class="mf-langpick-grid" id="mf-langpick-grid" role="presentation">${this.langOrder().map(c => this.langCellHtml(c)).join('')}</ul>
      <div class="mf-langpick-empty" id="mf-langpick-empty" hidden>${esc(t('dash.lang.empty', 'No languages match your search.'))}</div>`;
    document.body.appendChild(panel);
    this.langPanel = panel;
    this.bindLangPanel(panel);
    return panel;
  }

  // Column count mirrors the @media breakpoints so keyboard up/down jumps a row.
  private langCols(): number {
    try {
      if (window.matchMedia('(max-width:380px)').matches) return 1;
      if (window.matchMedia('(max-width:640px)').matches) return 2;
    } catch { /* no matchMedia */ }
    return 3;
  }
  private langVisibleCells(panel: HTMLElement): HTMLElement[] {
    return Array.from(panel.querySelectorAll<HTMLElement>('.mf-langpick-cell')).filter(li => !li.hidden);
  }
  private setLangKbd(panel: HTMLElement, idx: number): void {
    const cells = this.langVisibleCells(panel);
    panel.querySelectorAll('.mf-langpick-cell.is-kbd').forEach(el => el.classList.remove('is-kbd'));
    if (!cells.length) { this.langKbdIndex = -1; return; }
    const i = Math.max(0, Math.min(idx, cells.length - 1));
    this.langKbdIndex = i;
    cells[i].classList.add('is-kbd');
    try { cells[i].scrollIntoView({ block: 'nearest' }); } catch { /* */ }
  }

  // position:fixed + viewport-relative coords on a body-appended node ⇒ no
  // ancestor can clip it; flip above / clamp to edges so it always fits.
  private positionLangPanel(panel: HTMLElement): void {
    const trigger = this.langTriggerEl();
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    panel.style.visibility = 'hidden';
    panel.hidden = false;
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const rtl = document.documentElement.dir === 'rtl' || document.body.dir === 'rtl';
    let left = rtl ? Math.max(12, r.right - pw) : r.left;
    let top = r.bottom + 6;
    if (left + pw > vw - 12) left = Math.max(12, vw - 12 - pw);
    if (left < 12) left = 12;
    if (top + ph > vh - 12) { const above = r.top - 6 - ph; top = above > 12 ? above : Math.max(12, vh - 12 - ph); }
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.visibility = '';
  }

  private openLangPanel(): void {
    const panel = this.ensureLangPanel();
    const trigger = this.langTriggerEl();
    this.positionLangPanel(panel);
    panel.hidden = false;
    trigger?.setAttribute('aria-expanded', 'true');
    const search = panel.querySelector<HTMLInputElement>('#mf-langpick-search');
    if (search) search.value = '';
    this.filterLang(panel, '');
    const cells = this.langVisibleCells(panel);
    const activeIdx = cells.findIndex(c => c.getAttribute('aria-selected') === 'true');
    this.setLangKbd(panel, activeIdx >= 0 ? activeIdx : 0);
    try { search?.focus(); } catch { /* */ }
    this._langScrollHandler = () => {
      const tr = this.langTriggerEl();
      if (!tr) { this.closeLangPanel(); return; }
      const rr = tr.getBoundingClientRect();
      if (rr.bottom < 0 || rr.top > window.innerHeight) { this.closeLangPanel(); return; }
      this.positionLangPanel(panel);
    };
    window.addEventListener('scroll', this._langScrollHandler, true);
    window.addEventListener('resize', this._langScrollHandler);
    this._langDocClick = (e: Event) => {
      const tgt = e.target as Node;
      if (panel.contains(tgt)) return;
      if (this.root.querySelector('#mf-langpick')?.contains(tgt)) return;
      this.closeLangPanel();
    };
    document.addEventListener('click', this._langDocClick, true);
  }

  private closeLangPanel(focusTrigger = false): void {
    if (this.langPanel) {
      this.langPanel.hidden = true;
      this.langPanel.querySelectorAll('.mf-langpick-cell.is-kbd').forEach(el => el.classList.remove('is-kbd'));
    }
    this.langKbdIndex = -1;
    const trigger = this.langTriggerEl();
    trigger?.setAttribute('aria-expanded', 'false');
    if (this._langScrollHandler) {
      window.removeEventListener('scroll', this._langScrollHandler, true);
      window.removeEventListener('resize', this._langScrollHandler);
      this._langScrollHandler = null;
    }
    if (this._langDocClick) { document.removeEventListener('click', this._langDocClick, true); this._langDocClick = null; }
    if (focusTrigger) { try { trigger?.focus(); } catch { /* */ } }
  }

  private toggleLangPanel(): void {
    if (this.langPanel && !this.langPanel.hidden) this.closeLangPanel(true);
    else this.openLangPanel();
  }

  private filterLang(panel: HTMLElement, q: string): void {
    const term = q.trim().toLowerCase();
    let shown = 0;
    panel.querySelectorAll<HTMLElement>('.mf-langpick-cell').forEach(li => {
      const hit = !term || (li.dataset.search || '').indexOf(term) >= 0;
      li.hidden = !hit;
      if (hit) shown++;
    });
    const empty = panel.querySelector<HTMLElement>('#mf-langpick-empty');
    if (empty) empty.hidden = shown > 0;
    this.setLangKbd(panel, 0);
  }

  // VERBATIM the old pill handler — keep the en-US reset + MegaFormI18n.persistLocale
  // sticky path (survives DNN URL rewrites) + toast + 250ms reload.
  private selectLang(code: string): void {
    const loc = code || 'en-US';
    try {
      const I = (window as any).MegaFormI18n;
      if (loc === 'en-US') { try { localStorage.removeItem('mf-locale'); } catch { /* */ } }
      else if (I && typeof I.persistLocale === 'function') I.persistLocale(loc);
      else localStorage.setItem('mf-locale', loc);
    } catch { /* no storage */ }
    toast(t('dash.lang.switching', 'Switching to {loc}…').replace('{loc}', loc), 'success');
    setTimeout(() => { try { location.reload(); } catch { /* */ } }, 250);
  }

  private bindLangPanel(panel: HTMLElement): void {
    if (panel.dataset.bound === '1') return;
    panel.dataset.bound = '1';
    const search = panel.querySelector<HTMLInputElement>('#mf-langpick-search');
    search?.addEventListener('input', () => this.filterLang(panel, search.value));
    panel.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.mf-langpick-cell');
      if (cell && panel.contains(cell)) this.selectLang(cell.dataset.setLang || 'en-US');
    });
    panel.addEventListener('keydown', (e) => {
      const key = e.key;
      if (key === 'Escape') { e.preventDefault(); this.closeLangPanel(true); return; }
      const cells = this.langVisibleCells(panel);
      if (key === 'Enter') {
        e.preventDefault();
        const cur = cells[this.langKbdIndex];
        if (cur) this.selectLang(cur.dataset.setLang || 'en-US');
        return;
      }
      if (!cells.length) return;
      const cols = this.langCols();
      let idx = this.langKbdIndex < 0 ? 0 : this.langKbdIndex;
      if (key === 'ArrowDown') idx += cols;
      else if (key === 'ArrowUp') idx -= cols;
      else if (key === 'ArrowRight') idx += 1;
      else if (key === 'ArrowLeft') idx -= 1;
      else if (key === 'Home') idx = 0;
      else if (key === 'End') idx = cells.length - 1;
      else return;
      e.preventDefault();
      this.setLangKbd(panel, idx);
    });
  }

  // Search across EVERY catalog key (all categories), matching the key name, the
  // English baseline, OR the current translation — so an admin can type a visible
  // string ("Delete") and instantly find the widget/control keys behind it.
  private searchMatches(): string[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return [];
    return Object.keys(this.english).filter(k =>
      k.toLowerCase().includes(q) ||
      String(this.english[k] || '').toLowerCase().includes(q) ||
      String(this.currentEntries[k] || '').toLowerCase().includes(q)
    ).sort((a, b) => a.localeCompare(b));
  }

  private countLabel(): string {
    if (this.search.trim()) {
      const n = this.searchMatches().length;
      return `<strong>${n}</strong> match${n === 1 ? '' : 'es'} for “${esc(this.search.trim())}” across all categories`;
    }
    return `Editing <strong>${esc(this.currentLocale)}</strong> • ${Object.keys(this.currentEntries).length} keys loaded`;
  }

  // Escape, then wrap the matched query in <mark> so the hit is obvious.
  private highlight(text: string): string {
    const safe = esc(text);
    const q = this.search.trim();
    if (!q) return safe;
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      return safe.replace(re, '<mark class="mf-loc-hl">$1</mark>');
    } catch { return safe; }
  }

  private categoryOf(key: string): TabDef | undefined {
    return TABS.find(t => t.matcher(key));
  }

  private renderRows(): string {
    const searching = !!this.search.trim();
    const keys = searching ? this.searchMatches() : (this.groupedKeys[this.activeTab] || []);
    if (!keys.length) {
      return `<div class="mf-loc-empty">${searching ? 'No strings match your search. Try a shorter term or a key fragment (e.g. widget. / prop. / dash.).' : 'No keys in this tab yet.'}</div>`;
    }
    return keys.map(key => {
      const cat = searching ? this.categoryOf(key) : undefined;
      const badge = cat ? `<span class="mf-loc-cat-badge" data-jump="${esc(cat.id)}" title="Open the ${esc(cat.label)} category">${esc(cat.label)}</span>` : '';
      return `
      <div class="mf-loc-row" data-key="${esc(key)}">
        <div class="mf-loc-key">${searching ? this.highlight(key) : esc(key)}${badge}</div>
        <div class="mf-loc-base">${this.highlight(this.english[key] || '')}</div>
        <textarea data-loc-key="${esc(key)}" spellcheck="false">${esc(this.currentEntries[key] || '')}</textarea>
      </div>`;
    }).join('');
  }

  // Re-render ONLY the rows + count (not the whole shell) so the search box keeps
  // focus + caret as the admin types. Re-binds the row textareas each time.
  private updateRowsView(): void {
    const rowsEl = this.root.querySelector('#mf-loc-rows');
    if (rowsEl) rowsEl.innerHTML = this.renderRows();
    const countEl = this.root.querySelector('#mf-loc-count');
    if (countEl) countEl.innerHTML = this.countLabel();
    const clearBtn = this.root.querySelector<HTMLElement>('#mf-loc-search-clear');
    if (clearBtn) clearBtn.style.display = this.search.trim() ? '' : 'none';
    const tabsWrap = this.root.querySelector<HTMLElement>('.mf-loc-tabs');
    if (tabsWrap) { if (this.search.trim()) tabsWrap.setAttribute('data-dim', '1'); else tabsWrap.removeAttribute('data-dim'); }
    this.bindRows();
  }

  // Live-persist edits to this.currentEntries so switching tab/search never loses
  // them, + wire the category badges (jump to that tab, clearing the search).
  private bindRows(): void {
    this.root.querySelectorAll<HTMLTextAreaElement>('textarea[data-loc-key]').forEach(el => {
      el.addEventListener('input', () => { const k = el.dataset.locKey || ''; if (k) this.currentEntries[k] = el.value || ''; });
    });
    this.root.querySelectorAll<HTMLElement>('.mf-loc-cat-badge[data-jump]').forEach(b => {
      b.addEventListener('click', () => { this.activeTab = b.dataset.jump || 'general'; this.search = ''; this.render(); });
    });
  }

  private bind(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.mf-loc-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab || 'general';
        this.search = ''; // switching category clears an active search
        this.render();
      });
    });

    // Cross-category string search. Updates only the rows + count so the input
    // keeps focus; the catalog is small enough that filtering on every keystroke
    // is instant.
    const searchInput = this.root.querySelector<HTMLInputElement>('#mf-loc-search');
    searchInput?.addEventListener('input', () => {
      this.search = searchInput.value || '';
      this.updateRowsView();
    });
    this.root.querySelector<HTMLButtonElement>('#mf-loc-search-clear')?.addEventListener('click', () => {
      this.search = '';
      if (searchInput) searchInput.value = '';
      this.updateRowsView();
      searchInput?.focus();
    });

    // Close → back to the dashboard (host return URL if provided, else the
    // platform dashboard route).
    this.root.querySelector<HTMLButtonElement>('#mf-loc-close')?.addEventListener('click', () => {
      let href = '';
      try { href = String(getPlatformHostConfig().returnUrl || '').trim(); } catch { /* no host cfg */ }
      if (!href) { try { href = getPlatformRoute('dashboard'); } catch { href = '/'; } }
      try { location.href = href || '/'; } catch { /* navigation blocked */ }
    });

    // Live-persist row edits + wire category badges for the initial render.
    this.bindRows();

    // Display-language picker: compact trigger → searchable multi-column popover.
    // The persist-choice-then-reload logic lives in selectLang()/bindLangPanel()
    // (panel cells carry data-set-lang and are body-appended, not in this.root).
    // bind() re-runs on each render(), so we only (re)wire the freshly-rendered
    // trigger here; the body panel + its listeners persist (guarded, idempotent).
    const langTrigger = this.langTriggerEl();
    if (langTrigger) {
      langTrigger.addEventListener('click', () => this.toggleLangPanel());
      langTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.openLangPanel(); }
        else if (e.key === 'Escape') { this.closeLangPanel(true); }
      });
    }
    const currentSel = this.root.querySelector<HTMLSelectElement>('#mf-loc-current');
    currentSel?.addEventListener('change', async () => {
      await this.loadCurrent(currentSel.value || 'en-US');
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>('#mf-loc-create')?.addEventListener('click', () => this.onCreate());
    this.root.querySelector<HTMLButtonElement>('#mf-loc-save')?.addEventListener('click', () => this.onSave());
    this.root.querySelector<HTMLButtonElement>('#mf-loc-download')?.addEventListener('click', () => this.onDownload());
    this.root.querySelector<HTMLButtonElement>('#mf-loc-ai')?.addEventListener('click', () => this.onTranslateAI());

    // Upload JSON: the button just opens the hidden file picker; the picker's
    // change event reads the file + replaces the current locale (onUploadFile).
    const fileInput = this.root.querySelector<HTMLInputElement>('#mf-loc-upload-file');
    this.root.querySelector<HTMLButtonElement>('#mf-loc-upload')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) this.onUploadFile(file);
      fileInput.value = ''; // allow re-uploading the same filename
    });
  }

  private collectEntriesFromDom(): LocaleEntries {
    // Seed from the CURRENT translations (falling back to English only for keys
    // with no translation yet) so a filtered/searched view never wipes the
    // hidden keys back to English on Save. The visible textareas then override.
    const next: LocaleEntries = {};
    Object.keys(this.english).forEach(key => {
      next[key] = (this.currentEntries[key] != null) ? this.currentEntries[key] : (this.english[key] || '');
    });
    this.root.querySelectorAll<HTMLTextAreaElement>('textarea[data-loc-key]').forEach(el => {
      const key = el.dataset.locKey || '';
      if (!key) return;
      next[key] = el.value || '';
    });
    return next;
  }

  private async refreshLocales(target?: string): Promise<void> {
    await this.loadLocales();
    if (target) this.currentLocale = target;
    await this.loadCurrent(this.currentLocale);
    this.render();
  }

  private async onCreate(): Promise<void> {
    const input = this.root.querySelector<HTMLInputElement>('#mf-loc-new');
    const locale = (input?.value || '').trim();
    if (!locale) { toast('Enter a locale code first.', 'error'); return; }
    await postJson(buildLocaleWriteUrl(this.apiBase, 'create'), { locale, copyFrom: 'en-US' });
    this.clearRuntimeLocaleCache(locale);
    toast(`Created ${locale}`, 'success');
    await this.refreshLocales(locale);
  }

  private async onSave(): Promise<void> {
    const entries = this.collectEntriesFromDom();
    await postJson(buildLocaleWriteUrl(this.apiBase, 'save'), { locale: this.currentLocale, entries });
    this.clearRuntimeLocaleCache(this.currentLocale);
    this.currentEntries = entries;
    toast(`Saved ${this.currentLocale}`, 'success');
  }

  /** Upload an edited JSON file → REPLACE the current locale. The download →
   *  edit offline → upload-replace round-trip (single file, no paste box). Reuses
   *  the same i18n/import endpoint + cache-invalidation as the old paste flow. */
  private async onUploadFile(file: File): Promise<void> {
    let jsonText = '';
    try { jsonText = await file.text(); } catch { toast('Could not read that file.', 'error'); return; }
    if (!jsonText.trim()) { toast('That file is empty.', 'error'); return; }
    try { JSON.parse(jsonText); } catch { toast('That file is not valid JSON.', 'error'); return; }
    try {
      await postJson(buildLocaleWriteUrl(this.apiBase, 'import'), { locale: this.currentLocale, jsonText });
    } catch (e: any) {
      toast('Upload failed: ' + (e && e.message ? e.message : e), 'error');
      return;
    }
    this.clearRuntimeLocaleCache(this.currentLocale);
    toast(`Uploaded — replaced ${this.currentLocale} (${file.name})`, 'success');
    await this.loadCurrent(this.currentLocale);
    this.render();
  }

  /** [CacheInvalidation 2026-06-11] Drop the RUNTIME i18n localStorage cache for a locale
   *  after it is imported/saved/created. The engine caches each locale under
   *  `mf-i18n:<locale>:<I18N_CACHE_VERSION>` and that key survives an admin import — so a
   *  freshly-uploaded translation would NOT appear (the runtime keeps serving the cached
   *  copy) until a code deploy bumps the global version. Clearing it here makes the new
   *  upload take effect on the very next page load (localStorage is per-origin, so this
   *  also covers the separate form/test page in the same browser). */
  private clearRuntimeLocaleCache(locale: string): void {
    try {
      const prefix = 'mf-i18n:' + String(locale || '').trim() + ':';
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) localStorage.removeItem(k);
      }
    } catch { /* storage unavailable — non-fatal */ }
  }

  private onDownload(): void {
    window.location.href = `/api/MegaForm/i18n/export/${encodeURIComponent(this.currentLocale)}`;
  }

  /** [Translate-AI 2026-06-11] Auto-translate with the SITE AI engine.
   *  Flow (per the product decisions):
   *   1. Ask which target language to translate INTO (prompt).
   *   2. Use the provider configured in Dashboard → AI Settings (claude-cli /
   *      OpenAI / etc.), bootstrapped on demand like the dashboard does.
   *   3. Translate ONLY the untranslated keys (empty OR still identical to
   *      English) so human edits are never overwritten.
   *   4. Fill the editor with the results; the admin reviews + clicks Save. */
  private async onTranslateAI(): Promise<void> {
    const suggested = (this.currentLocale && this.currentLocale !== 'en-US') ? this.currentLocale : '';
    const target = (window.prompt(
      'Dịch sang ngôn ngữ nào? / Translate into which language?\n' +
      'Nhập tên hoặc mã ngôn ngữ — ví dụ: Tiếng Việt, Vietnamese, vi-VN, Français, fr-FR.',
      suggested
    ) || '').trim();
    if (!target) return;

    // Only the strings that still need translation (empty or English-identical).
    const current = this.collectEntriesFromDom();
    const todo: LocaleEntries = {};
    Object.keys(this.english).forEach(key => {
      const v = String(current[key] == null ? '' : current[key]).trim();
      const en = String(this.english[key] == null ? '' : this.english[key]).trim();
      if (!v || v === en) todo[key] = this.english[key] || '';
    });
    const keys = Object.keys(todo);
    if (!keys.length) { toast('Mọi chuỗi đã được dịch — không có gì để dịch.', 'info'); return; }

    let api: any;
    try {
      api = await ensureMfAi();
    } catch (e: any) {
      toast('AI chưa sẵn sàng. Mở Dashboard → AI Settings để cấu hình. (' + (e && e.message ? e.message : e) + ')', 'error');
      return;
    }

    const btn = this.root.querySelector<HTMLButtonElement>('#mf-loc-ai');
    const restore = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; }

    // Chunk so a large catalog never exceeds the model's context / token budget.
    const CHUNK = 60;
    let done = 0, failed = 0;
    try {
      for (let i = 0; i < keys.length; i += CHUNK) {
        const slice = keys.slice(i, i + CHUNK);
        if (btn) btn.textContent = `Translating ${Math.min(i + slice.length, keys.length)}/${keys.length}…`;
        const payload: LocaleEntries = {};
        slice.forEach(k => { payload[k] = todo[k]; });
        let translated: LocaleEntries | null = null;
        try {
          translated = await this.translateChunk(api, target, payload);
        } catch (e) {
          translated = null;
        }
        if (!translated) { failed += slice.length; continue; }
        slice.forEach(k => {
          const val = translated && translated[k];
          if (typeof val === 'string' && val.trim()) { this.currentEntries[k] = val; done++; }
          else { failed++; }
        });
        // Reflect progress live so the admin sees translations appear.
        this.updateRowsView();
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = restore || 'Translate (AI)'; }
    }

    this.render();
    if (done && !failed) toast(`Đã dịch ${done} chuỗi sang ${target}. Kiểm tra rồi bấm Save.`, 'success');
    else if (done) toast(`Đã dịch ${done} chuỗi (bỏ qua ${failed}). Kiểm tra rồi bấm Save.`, 'success');
    else toast('AI không trả về bản dịch hợp lệ. Thử lại hoặc kiểm tra AI Settings.', 'error');
  }

  /** One AI call: translate {key:english} → {key:translated}. Returns the parsed
   *  object or null if the model returned no usable JSON. */
  private async translateChunk(api: any, target: string, payload: LocaleEntries): Promise<LocaleEntries | null> {
    const system = [
      'You are a professional software-localization engine for a form-builder admin UI.',
      'Translate the VALUES of the given JSON object into the target language: ' + target + '.',
      'STRICT RULES:',
      '- Return ONLY a JSON object — no prose, no code fences.',
      '- Keep every KEY exactly as given; translate only the values.',
      '- Preserve placeholders verbatim: tokens in {curly braces} like {min}, {max}, {n}, {value}, {current}, {total}, {field}.',
      '- Preserve HTML tags, &entities;, leading/trailing spaces, and trailing punctuation/ellipsis (…).',
      '- Do NOT translate brand/tech tokens (e.g. MegaForm, JSON, CSV, URL, ID, API, SQL, PDF, OK).',
      '- Use natural, concise UI wording a native speaker expects on buttons/labels.',
      '- Output UTF-8 characters directly (no \\u escapes).'
    ].join('\n');
    const user = 'Translate the values of this JSON to ' + target + '. Return JSON only:\n' + JSON.stringify(payload);
    const raw = await api.chat({ system, user, jsonMode: true, temperature: 0.2, maxTokens: 4000 });
    return parseJsonObject(String(raw || ''));
  }
}

export function initLanguages(root?: HTMLElement | null): void {
  const target = root || document.getElementById('mf-languages-root');
  if (!target) return;
  const app = new LanguageDashboard(target as HTMLElement);
  app.init().catch(err => {
    (target as HTMLElement).innerHTML = `<div style="padding:24px;color:#b91c1c">${esc(err && (err as Error).message || err)}</div>`;
  });
}

const MegaForm = (window as any).MegaForm || ((window as any).MegaForm = {});
MegaForm.initLanguages = initLanguages;
(window as any).__MF_LANG_DASH_BADGE__ = BADGE;

// [i18n GĐ1] Self-mount #mf-languages-root (the comment in Index.razor promised
// this but it was never implemented → the Languages page never rendered on
// Oqtane). Mirrors the submissions / my-inbox auto-mount pattern.
if (typeof window !== 'undefined') {
  const autoMount = (): void => {
    document.querySelectorAll<HTMLElement>('#mf-languages-root').forEach((root) => {
      if (root.dataset.mfMounted) return;
      root.dataset.mfMounted = '1';
      try { initLanguages(root); } catch (e) { console.error('initLanguages failed', e); }
    });
  };
  const start = (): void => {
    autoMount();
    try {
      const obs = new MutationObserver(() => autoMount());
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => obs.disconnect(), 15000);
    } catch { /* observer optional */ }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
