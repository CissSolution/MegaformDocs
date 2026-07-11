/**
 * MegaForm View Designer — shared primitives.
 *
 * Foundation used by list-designer.ts, card-designer.ts, and the
 * settings-popup.ts orchestrator. Pure DOM (no React/Vue) so the bundles
 * stay small and any host platform (Oqtane / DNN / Web) can mount them.
 *
 * What lives here:
 *   - DOM helper `h(...)`
 *   - Popup chrome (overlay + dialog + Save/Cancel footer)
 *   - Field palette (draggable list of form fields)
 *   - Drop zones with HTML5 native drag-drop
 *   - Token panel (click to insert {{field:KEY}} / {{submission:date}})
 *   - Code editor (monospace textarea wrapper)
 *   - API client (ModuleConfig GET/POST + Schema field extractor)
 *
 * Keep this file framework-free so the same bundle works under Blazor,
 * MVC, jQuery, or plain static pages.
 *
 * Badge: ViewDesignerShared v20260503-02
 */

export const SHARED_BADGE = 'ViewDesignerShared v20260622-B235';
let authContext: { moduleId?: number; siteId?: number } = {};

// ════════════════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════════════════

export interface FieldDef {
  key: string;
  label: string;
  type: string;
}

// IMPORTANT: Oqtane API returns JSON with camelCase property names (.NET default
// since 5.0). The C# DTOs use PascalCase but System.Text.Json camelCases on the
// wire. POST also accepts camelCase (and PascalCase via PropertyNameCaseInsensitive),
// so we use camelCase end-to-end. DO NOT switch to PascalCase here — `response.Forms`
// will be undefined, .find() throws, the popup hangs on "Loading…" forever.
export interface ModuleConfig {
  moduleId: number;
  formId: number;
  /** Pins the module to an admin surface: '' = ordinary form, 'myinbox', 'dashboard', … */
  moduleRole?: string;
  viewType?: string;
  selectedViewKey?: string;
  viewConfig?: string;
  cssClass?: string;
  moduleConfigured?: boolean;
  displayMode?: string;
  triggerType?: string;
  delaySeconds?: number;
  scrollPercent?: number;
  clickSelector?: string;
  popupSize?: string;
  viewMode?: string;
  listFields?: string;
  listTemplate?: string;
  cardFields?: string;
  cardTemplate?: string;
  // [ListViewRouting v20260507-23] When viewMode='listview' the saved JSON
  // is a ListViewSettings blob (formId, fields, rowTemplate, pageSize, …).
  listViewSettingsJson?: string;
  rendererHostUrl?: string;
  rendererHostPageId?: number;
  rendererHostModuleId?: number;
  currentPageId?: number;
  currentPageUrl?: string;
  useCurrentPageAsRendererHost?: boolean;
  [k: string]: any;
}

export interface FormViewOption {
  viewId?: number;
  formId?: number;
  viewKey: string;
  queryKey?: string;
  viewType: string;
  viewName: string;
  isDefault?: boolean;
  sortOrder?: number;
  configJson?: string;
  customHtml?: string;
  customCss?: string;
  permissionsJson?: string;
}

export interface AppSummaryOption {
  appId: number;
  appKey: string;
  appName: string;
  appScope: string;
}

export interface AppQueryOption {
  queryId: number;
  appId?: number;
  formId?: number;
  queryKey: string;
  queryName: string;
  description?: string;
  queryType?: string;
  isSystem?: boolean;
  sortOrder?: number;
}

export interface FormViewFetchResult {
  ok: boolean;
  status: number;
  views: FormViewOption[];
  app?: AppSummaryOption | null;
  queries?: AppQueryOption[];
  error?: string;
}

export interface SaveFormViewPayload {
  viewId?: number;
  formId: number;
  viewKey: string;
  queryKey?: string;
  viewType: string;
  viewName: string;
  isDefault?: boolean;
  sortOrder?: number;
  configJson?: string;
  customHtml?: string;
  customCss?: string;
  permissionsJson?: string;
}

export interface SaveFormViewResult {
  ok: boolean;
  status: number;
  viewId?: number;
  error?: string;
}

export interface DeleteFormViewResult {
  ok: boolean;
  status: number;
  error?: string;
}

export interface ModuleConfigResponse {
  configured: boolean;
  moduleConfigured: boolean;
  moduleId: number;
  siteId: number;
  forms: { formId: number; title: string; status: string }[];
  rendererHostUrl?: string;
  rendererHostPageId?: number;
  rendererHostModuleId?: number;
  config: ModuleConfig;
}

// What the designers store inside ListTemplate / CardTemplate JSON wrappers.
export interface ListDesignSpec {
  version: 1;
  fields: { key: string; widthPercent: number; align?: 'left' | 'center' | 'right' }[];
  rowTemplate: string;       // raw <tr>... HTML; rebuilt from fields when in Visual mode
  headerHtml?: string;       // optional <thead> override
  emptyHtml?: string;
  pageSize?: number;         // 0 = no pagination
  jsHook?: string;           // function body (rows, root) => void
  css?: string;
}

export interface CardDesignSpec {
  version: 1;
  cells: { key?: string; html?: string; span: number }[];   // 12-col grid; key=field, html=custom
  cardTemplate: string;       // raw <article>... HTML
  cardMinWidth?: number;      // px (responsive)
  gridGap?: number;           // px
  emptyHtml?: string;
  pageSize?: number;
  jsHook?: string;
  css?: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  DOM helper
// ════════════════════════════════════════════════════════════════════════════

type AttrVal = string | number | boolean | null | undefined | EventListener | Record<string, string | number>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrVal> | null | undefined = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  // [HelperHardening v20260508-06] Coerce null/undefined attrs to {} — many
  // call sites pass `null` for childless tags (e.g. `h('br', null)` /
  // `h('hr', null)`), and `Object.entries(null)` throws "Cannot convert
  // undefined or null to object". That single throw was killing the entire
  // settings popup body during rerender (only the first section before the
  // throw made it into the DOM).
  const safeAttrs = (attrs && typeof attrs === 'object') ? attrs : {};
  for (const [k, v] of Object.entries(safeAttrs)) {
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v as Record<string, string | number>)) {
        (el.style as any)[sk] = String(sv);
      }
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

// ════════════════════════════════════════════════════════════════════════════
//  Popup chrome (one-time CSS injection)
// ════════════════════════════════════════════════════════════════════════════

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
.mf-vd-overlay { position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;animation:mfvd-fade .15s ease-out }
.mf-vd-dialog { background:#fff;border-radius:14px;width:96vw;max-width:1280px;height:92vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(15,23,42,.45);overflow:hidden }
.mf-vd-overlay.mf-vd-inline { position:relative;inset:auto;background:transparent;z-index:auto;display:block;animation:none;width:100%;font-family:'Segoe UI',system-ui,-apple-system,sans-serif }
.mf-vd-overlay.mf-vd-inline .mf-vd-dialog { width:100%;max-width:1280px;height:auto;min-height:0;max-height:none;border:1px solid #dbe4f0;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.07) }
.mf-vd-overlay.mf-vd-inline .mf-vd-body { overflow:visible;display:block;min-height:0 }
.mf-vd-header { padding:16px 22px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;flex-shrink:0 }
.mf-vd-overlay.mf-vd-inline .mf-vd-header { padding:12px 18px }
.mf-vd-header h2 { margin:0;font-size:16px;font-weight:600;flex:1;line-height:1.3 }
.mf-vd-header .mf-vd-sub { font-size:11px;opacity:.85;font-weight:400;margin-top:2px;display:block }
.mf-vd-close { background:rgba(255,255,255,.12);border:0;color:#fff;font-size:18px;cursor:pointer;padding:6px 14px;border-radius:8px;line-height:1 }
.mf-vd-close:hover { background:rgba(255,255,255,.25) }
/* [SettingsPopupSticky v20260507-28] min-height:0 is the flexbox fix that
   forces the body to stay inside its parent's height — without it, tall
   content pushes the footer (Save button) off-screen on shorter viewports. */
.mf-vd-body { flex:1;min-height:0;overflow:hidden;display:flex;background:#fff }
.mf-vd-footer { padding:12px 22px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;align-items:center;gap:10px;background:#f8fafc;flex-shrink:0 }
.mf-vd-footer .mf-vd-status { margin-right:auto;font-size:12px;color:#64748b }
.mf-vd-btn { padding:8px 18px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:13px;font-weight:500;color:#1f2a44;transition:all .12s }
.mf-vd-btn:hover { background:#f1f5f9;border-color:#94a3b8 }
.mf-vd-btn-primary { background:#6366f1;color:#fff;border-color:#6366f1 }
.mf-vd-btn-primary:hover { background:#4f46e5;border-color:#4f46e5 }
.mf-vd-btn-ghost { border-color:transparent;color:#64748b;background:transparent }
.mf-vd-btn-ghost:hover { background:#f1f5f9 }
.mf-vd-btn:disabled { opacity:.5;cursor:not-allowed }

.mf-vd-grid { display:grid;grid-template-columns:240px 1fr 280px;width:100%;height:100% }
.mf-vd-pane { overflow:auto;padding:14px 16px }
.mf-vd-pane.mf-vd-pal { background:#f8fafc;border-right:1px solid #e2e8f0 }
.mf-vd-pane.mf-vd-canvas { background:#fff;padding:0 }
.mf-vd-pane.mf-vd-props { background:#fafafa;border-left:1px solid #e2e8f0 }

.mf-vd-pane h3 { margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#64748b;font-weight:700 }
.mf-vd-pal-empty { color:#94a3b8;font-style:italic;font-size:12px;padding:10px }

.mf-vd-pal-item { padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:5px;cursor:grab;background:#fff;font-size:13px;display:flex;align-items:center;gap:8px;transition:all .12s;user-select:none }
.mf-vd-pal-item:hover { border-color:#6366f1;background:#fafbff }
.mf-vd-pal-item:active { cursor:grabbing }
.mf-vd-pal-item.is-selected { border-color:#6366f1;background:#eef2ff }
.mf-vd-pal-item .mf-vd-pal-cb { width:16px;height:16px;margin:0;cursor:pointer;accent-color:#6366f1;flex-shrink:0 }
.mf-vd-pal-item .mf-vd-pal-label { flex:1;font-weight:500;color:#1f2a44;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.mf-vd-pal-item .mf-vd-pal-type { font-size:9px;color:#94a3b8;background:#f1f5f9;border-radius:4px;padding:2px 6px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0 }
.mf-vd-pal-item.is-selected .mf-vd-pal-type { background:#dbeafe;color:#3730a3 }

.mf-vd-tabs { display:flex;border-bottom:1px solid #e2e8f0;background:#fafbfd;padding:0 18px;flex-shrink:0 }
.mf-vd-tab { padding:10px 14px;border:0;background:transparent;border-bottom:2px solid transparent;cursor:pointer;font-size:13px;color:#64748b;font-weight:500 }
.mf-vd-tab:hover { color:#1f2a44 }
.mf-vd-tab.active { border-bottom-color:#6366f1;color:#1f2a44;font-weight:600 }
.mf-vd-tab-body { padding:18px;overflow:auto;flex:1 }

.mf-vd-canvas-inner { display:flex;flex-direction:column;height:100% }

.mf-vd-drop { border:2px dashed #cbd5e1;border-radius:10px;padding:14px;min-height:80px;background:#fff;transition:all .12s }
.mf-vd-drop.mf-vd-over { border-color:#6366f1;background:#eef2ff }
.mf-vd-drop.mf-vd-empty:before { content:attr(data-placeholder);color:#94a3b8;font-size:12px;font-style:italic;display:block;text-align:center;padding:18px }

.mf-vd-row { display:flex;flex-wrap:nowrap;gap:6px;align-items:stretch;width:100% }
.mf-vd-cell { border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc;font-size:12px;display:flex;flex-direction:column;gap:4px;min-height:46px;cursor:move;position:relative;flex:1 1 0 }
.mf-vd-cell.selected { border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 2px rgba(99,102,241,.18) }
.mf-vd-cell.mf-vd-cell-drop-target { border-color:#10b981;background:#ecfdf5;box-shadow:0 0 0 2px rgba(16,185,129,.25) }
.mf-vd-cell-drag { cursor:grab;color:#94a3b8;font-weight:700;letter-spacing:-2px;font-size:14px;line-height:1;padding-right:2px;flex-shrink:0 }
.mf-vd-cell-drag:active { cursor:grabbing;color:#6366f1 }
.mf-vd-cell-head { display:flex;align-items:center;gap:6px }
.mf-vd-cell-label { flex:1;font-weight:600;color:#1f2a44;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.mf-vd-cell-token { color:#64748b;font-family:'Cascadia Code','Consolas',monospace;font-size:10px;background:#fff;padding:2px 5px;border-radius:4px;border:1px solid #e2e8f0;display:inline-block }
.mf-vd-cell-del { position:absolute;top:4px;right:4px;background:transparent;border:0;color:#ef4444;cursor:pointer;font-size:16px;line-height:1;padding:2px 6px;border-radius:4px;opacity:.6 }
.mf-vd-cell-del:hover { background:#fee2e2;opacity:1 }

.mf-vd-grid12 { display:grid;grid-template-columns:repeat(12,1fr);gap:8px }
.mf-vd-grid12 .mf-vd-cell.col-1 { grid-column:span 1 } .mf-vd-grid12 .mf-vd-cell.col-2 { grid-column:span 2 } .mf-vd-grid12 .mf-vd-cell.col-3 { grid-column:span 3 } .mf-vd-grid12 .mf-vd-cell.col-4 { grid-column:span 4 } .mf-vd-grid12 .mf-vd-cell.col-5 { grid-column:span 5 } .mf-vd-grid12 .mf-vd-cell.col-6 { grid-column:span 6 } .mf-vd-grid12 .mf-vd-cell.col-7 { grid-column:span 7 } .mf-vd-grid12 .mf-vd-cell.col-8 { grid-column:span 8 } .mf-vd-grid12 .mf-vd-cell.col-9 { grid-column:span 9 } .mf-vd-grid12 .mf-vd-cell.col-10 { grid-column:span 10 } .mf-vd-grid12 .mf-vd-cell.col-11 { grid-column:span 11 } .mf-vd-grid12 .mf-vd-cell.col-12 { grid-column:span 12 }

.mf-vd-prop-block { margin-bottom:14px }
.mf-vd-prop-block label { display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em }
.mf-vd-input { width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;background:#fff;color:#1f2a44 }
.mf-vd-input:focus { outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15) }
.mf-vd-textarea { width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12px;background:#fff;color:#1f2a44;font-family:'Cascadia Code','Consolas',monospace;line-height:1.5;resize:vertical }
.mf-vd-textarea:focus { outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15) }
.mf-vd-settings-wrap { padding:10px 12px;overflow:auto;flex:1;display:grid;gap:6px;align-content:start }
.mf-vd-settings-wrap > .mf-vd-prop-block { margin-bottom:0 }
.mf-vd-settings-wrap .mf-vd-prop-block { margin-bottom:8px }
.mf-vd-settings-card { padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;box-shadow:0 1px 0 rgba(15,23,42,.03) }
.mf-vd-settings-flat { display:grid;gap:8px }
.mf-vd-settings-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px }
.mf-vd-settings-inline { display:flex;align-items:center;gap:8px;flex-wrap:wrap }
.mf-vd-settings-inline-check { display:flex;align-items:center;gap:8px;font-size:12px;color:#334155;line-height:1.4 }
.mf-vd-settings-chips { display:flex;flex-wrap:wrap;gap:6px;margin-top:6px }
.mf-vd-settings-chip { display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;border:1px solid #dbe4f0;background:#f8fafc;color:#475569;font-size:11px;font-weight:600;line-height:1 }
.mf-vd-settings-chip.is-accent { background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8 }
.mf-vd-settings-chip.is-success { background:#ecfdf5;border-color:#86efac;color:#166534 }
.mf-vd-details { margin-top:0;border:1px solid #dbe4f0;border-radius:10px;background:#fff;overflow:hidden }
.mf-vd-details > summary { list-style:none;cursor:pointer;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f8fafc;color:#0f172a;font-size:12px;font-weight:700 }
.mf-vd-settings-wrap .mf-vd-details { border-radius:8px }
.mf-vd-settings-wrap .mf-vd-details > summary { padding:8px 10px }
.mf-vd-details > summary::-webkit-details-marker { display:none }
.mf-vd-details[open] > summary { border-bottom:1px solid #e2e8f0 }
.mf-vd-details-body { padding:12px;display:grid;gap:10px;min-height:0;align-content:start }
.mf-vd-settings-wrap .mf-vd-details-body { padding:10px;gap:8px }
.mf-vd-details-body > .mf-vd-settings-flat,
.mf-vd-details-body > .mf-vd-prop-block { margin:0 }
.mf-vd-view-list { display:grid;gap:8px;max-height:230px;overflow:auto;padding-right:2px }
.mf-vd-view-row { border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;align-items:center }
.mf-vd-view-row-main { min-width:0 }
.mf-vd-view-row-title { font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.mf-vd-view-row-meta { font-size:11px;color:#64748b;margin-top:2px;line-height:1.35 }
.mf-vd-view-actions { display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end }
.mf-vd-view-actions .mf-vd-btn { padding:6px 10px;font-size:12px;border-radius:7px }
.mf-vd-settings-templates { display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px }
.mf-vd-settings-templates textarea { min-height:84px !important }
.mf-vd-settings-note { font-size:11px;color:#64748b;line-height:1.45 }

.mf-vd-tokens { display:flex;flex-wrap:wrap;gap:6px }
.mf-vd-token { background:#1f2a44;color:#a7f3d0;font-family:'Cascadia Code','Consolas',monospace;font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer;border:0;line-height:1.4 }
.mf-vd-token:hover { background:#0f172a }

.mf-vd-toolbar { padding:12px 18px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f5f9;background:#fcfcfd;flex-shrink:0 }
.mf-vd-toolbar .mf-vd-spacer { flex:1 }
.mf-vd-pill { font-size:11px;color:#64748b;background:#f1f5f9;border-radius:999px;padding:3px 10px;font-weight:500 }

.mf-vd-help { font-size:11px;color:#94a3b8;margin-top:4px;line-height:1.35 }
.mf-vd-error { color:#dc2626;font-size:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 10px;margin:6px 0 }

@media (max-width: 760px) {
  .mf-vd-settings-wrap { padding:12px;gap:8px }
  .mf-vd-view-row { grid-template-columns:1fr }
  .mf-vd-view-actions { justify-content:flex-start }
  .mf-vd-settings-grid,
  .mf-vd-settings-templates { grid-template-columns:1fr }
}

@keyframes mfvd-fade { from { opacity:0 } to { opacity:1 } }
`;
  document.head.appendChild(h('style', { id: 'mf-view-designer-styles', html: css }));
}

export interface PopupOpts {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  width?: string;
  height?: string;
  onSave?: () => Promise<boolean> | boolean;   // return false to keep popup open
  saveLabel?: string;
  onClose?: () => void;
  hideSave?: boolean;
  reloadOnSave?: boolean;                      // hard-reload page after a successful save
  inlineHost?: HTMLElement | string;            // mount into page flow instead of a fixed overlay
}

export interface PopupHandle {
  root: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  status: (msg: string, kind?: 'info' | 'error' | 'ok') => void;
  close: () => void;
}

export function openPopup(opts: PopupOpts): PopupHandle {
  injectStyles();
  const prevOverflow = document.body.style.overflow;
  const inlineHost = typeof opts.inlineHost === 'string'
    ? document.getElementById(opts.inlineHost)
    : opts.inlineHost;
  const inlineMode = !!inlineHost;
  let escListener: ((e: KeyboardEvent) => void) | null = null;

  const close = (): void => {
    overlay.remove();
    if (!inlineMode) document.body.style.overflow = prevOverflow;
    if (escListener) document.removeEventListener('keydown', escListener);
    if (opts.onClose) opts.onClose();
  };

  const headerCloseBtn = h('button', { class: 'mf-vd-close', title: 'Close (Esc)', onclick: close }, '×');
  const headerTitle = h('h2', {}, opts.title);
  if (opts.subtitle) headerTitle.appendChild(h('span', { class: 'mf-vd-sub' }, opts.subtitle));
  const header = h('div', { class: 'mf-vd-header' }, headerTitle, headerCloseBtn);

  const body = h('div', { class: 'mf-vd-body' }, opts.body);

  const statusEl = h('div', { class: 'mf-vd-status' }, '');
  const cancelBtn = h('button', { class: 'mf-vd-btn mf-vd-btn-ghost', onclick: close }, 'Cancel');
  const saveBtn = h('button', { class: 'mf-vd-btn mf-vd-btn-primary', onclick: async () => {
    if (!opts.onSave) { close(); return; }
    saveBtn.setAttribute('disabled', '');
    statusEl.textContent = 'Saving…';
    try {
      const ok = await Promise.resolve(opts.onSave());
      if (ok !== false) {
        statusEl.textContent = opts.reloadOnSave ? 'Saved · reloading…' : 'Saved';
        if (opts.reloadOnSave) {
          setTimeout(() => { try { window.location.reload(); } catch { close(); } }, 350);
        } else {
          setTimeout(close, 350);
        }
      } else {
        saveBtn.removeAttribute('disabled');
        statusEl.textContent = 'Could not save (see designer for errors).';
      }
    } catch (err) {
      saveBtn.removeAttribute('disabled');
      statusEl.textContent = 'Save failed: ' + (err instanceof Error ? err.message : String(err));
    }
  } }, opts.saveLabel || 'Save');

  const footer = h('div', { class: 'mf-vd-footer' }, statusEl, cancelBtn);
  if (!opts.hideSave) footer.appendChild(saveBtn);

  const dialog = h('div', { class: 'mf-vd-dialog' }, header, body, footer);
  if (opts.width) dialog.style.maxWidth = opts.width;
  if (opts.height) dialog.style.height = opts.height;

  // [PopupOverlayBuilderFix v20260504-08] Mark with data-mf-overlay="1" so the
  // Builder's fullscreen takeover CSS (loader/index.ts → ensureFullscreenStyle)
  // doesn't hide us. The takeover does
  //   body.mf-builder-open > *:not(#mf-builder-root):not([data-mf-overlay])
  //   { display:none !important; visibility:hidden !important; ... }
  // so any popup appended to <body> without that attribute is invisible.
  // Z-index 2147483647 sits one above the takeover's 2147483000.
  const overlay = h('div', {
    class: inlineMode ? 'mf-vd-overlay mf-vd-inline' : 'mf-vd-overlay',
    'data-mf-overlay': '1',
  }, dialog);
  if (!inlineMode) {
    overlay.addEventListener('click', (e: MouseEvent) => { if (e.target === overlay) close(); });
  }

  if (inlineMode && inlineHost) {
    inlineHost.innerHTML = '';
    inlineHost.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', escListener);
  }

  const status: PopupHandle['status'] = (msg, kind) => {
    statusEl.textContent = msg;
    statusEl.style.color = kind === 'error' ? '#dc2626' : kind === 'ok' ? '#15803d' : '#64748b';
  };

  return { root: overlay, body, footer, status, close };
}

// ════════════════════════════════════════════════════════════════════════════
//  Field palette (checkbox + drag)
// ════════════════════════════════════════════════════════════════════════════
//
// Two ways to add a field to the layout:
//   1. Tick the checkbox — adds it once at the end (or removes all instances
//      when unchecked). Quickest path; impossible to create duplicates.
//   2. Drag onto the canvas — same dedupe rules apply; if the field is already
//      in the layout, the drop is a no-op (visual flash, no extra cell).
//
// `refresh()` is exposed so the designer can re-render checkboxes after the
// user reorders/deletes cells from the canvas.

export const DRAG_MIME = 'text/x-mf-field';

export interface FieldPaletteOpts {
  fields: FieldDef[];
  isSelected: (key: string) => boolean;
  onAdd: (f: FieldDef) => void;
  onRemoveAll: (key: string) => void;
}

export interface FieldPaletteHandle {
  el: HTMLElement;
  refresh: () => void;
}

export function createFieldPalette(opts: FieldPaletteOpts): FieldPaletteHandle {
  const list = h('div', {});
  const root = h('div', { class: 'mf-vd-pane mf-vd-pal' },
    h('h3', {}, 'Fields'),
    h('div', { class: 'mf-vd-help', style: { marginBottom: '8px', marginTop: '-4px' } },
      'Tick to add · drag to insert at a specific spot · drag cells in the canvas to reorder.'),
    list
  );

  function refresh(): void {
    list.innerHTML = '';
    if (!opts.fields.length) {
      list.appendChild(h('div', { class: 'mf-vd-pal-empty' }, 'No fields. Pick a form first.'));
      return;
    }
    for (const f of opts.fields) {
      const checked = opts.isSelected(f.key);
      const cb = h('input', {
        type: 'checkbox',
        class: 'mf-vd-pal-cb',
        title: checked ? 'Untick to remove from the layout' : 'Tick to add at end',
      }) as HTMLInputElement;
      cb.checked = checked;
      cb.addEventListener('change', (e: Event) => {
        e.stopPropagation();
        if (cb.checked) opts.onAdd(f);
        else opts.onRemoveAll(f.key);
        refresh();
      });

      const item = h('label', {
        class: 'mf-vd-pal-item' + (checked ? ' is-selected' : ''),
        draggable: 'true',
        title: checked ? 'Already in layout — drag to add another spot, or untick to remove' : 'Tick or drag to add',
        ondragstart: (e: DragEvent) => {
          e.dataTransfer!.setData(DRAG_MIME, JSON.stringify(f));
          e.dataTransfer!.effectAllowed = 'copy';
        },
      },
        cb,
        h('span', { class: 'mf-vd-pal-label' }, f.label),
        h('span', { class: 'mf-vd-pal-type' }, f.type)
      );
      list.appendChild(item);
    }
  }

  refresh();
  return { el: root, refresh };
}

// ════════════════════════════════════════════════════════════════════════════
//  Drop zone helpers
// ════════════════════════════════════════════════════════════════════════════

export function makeDropZone(el: HTMLElement, onDrop: (data: any, e: DragEvent) => void): void {
  el.addEventListener('dragover', (e: DragEvent) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('mf-vd-over');
  });
  el.addEventListener('dragleave', (e: DragEvent) => {
    if (e.target === el) el.classList.remove('mf-vd-over');
  });
  el.addEventListener('drop', (e: DragEvent) => {
    el.classList.remove('mf-vd-over');
    const raw = e.dataTransfer?.getData(DRAG_MIME);
    if (!raw) return;
    e.preventDefault();
    try { onDrop(JSON.parse(raw), e); } catch { /* ignore malformed */ }
  });
}

// ════════════════════════════════════════════════════════════════════════════
//  Token panel + code editor
// ════════════════════════════════════════════════════════════════════════════

export interface TokenDef { token: string; label: string; }

export function defaultTokens(fields: FieldDef[]): TokenDef[] {
  const t: TokenDef[] = [
    { token: '{{submission:id}}', label: 'Submission ID' },
    { token: '{{submission:date}}', label: 'Submission date' },
    { token: '{{submission:status}}', label: 'Submission status' },
    { token: '{{submission:user}}', label: 'Submission user' },
    { token: '{{form:id}}', label: 'Form ID' },
    { token: '{{module:id}}', label: 'Module ID' },
    { token: '{{query:view}}', label: 'URL query param "view"' },
    { token: '{{user:isAdmin}}', label: 'Current user admin flag' },
    { token: '<mf-repeat each="item in field:KEY">{{item}}</mf-repeat>', label: 'Repeat over array field' },
  ];
  for (const f of fields) t.push({ token: `{{field:${f.key}}}`, label: `Field ${f.label}` });
  return t;
}

export function createTokenPanel(tokens: TokenDef[], onInsert: (token: string) => void): HTMLElement {
  const grid = h('div', { class: 'mf-vd-tokens' });
  for (const t of tokens) {
    grid.appendChild(h('button', {
      class: 'mf-vd-token',
      title: t.label,
      onclick: () => onInsert(t.token),
    }, t.token));
  }
  return grid;
}

export function insertAtCursor(textarea: HTMLTextAreaElement, value: string): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.slice(0, start) + value + textarea.value.slice(end);
  textarea.focus();
  const pos = start + value.length;
  textarea.setSelectionRange(pos, pos);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// ════════════════════════════════════════════════════════════════════════════
//  API client
// ════════════════════════════════════════════════════════════════════════════

function getApiBase(): string {
  const w = window as any;
  if (typeof w.__MF_API_BASE__ === 'string' && w.__MF_API_BASE__) return w.__MF_API_BASE__;
  return '/api/MegaForm';
}

function getPlatform(): any {
  const w = window as any;
  return (w && w.__MF_PLATFORM__) || {};
}

function getPhase2ApiBase(): string {
  const platform = getPlatform();
  const isOqtane = String(platform.platform || '').trim().toLowerCase() === 'oqtane';
  return isOqtane ? '/api/MegaFormPopup/Phase2' : `${getApiBase()}/Phase2`;
}

export function setApiAuthContext(moduleId?: number, siteId?: number): void {
  authContext = {
    moduleId: Number.isFinite(Number(moduleId)) && Number(moduleId) > 0 ? Number(moduleId) : 0,
    siteId: Number.isFinite(Number(siteId)) && Number(siteId) > 0 ? Number(siteId) : 0,
  };
}

function withPlatformAuth(url: string): string {
  try {
    const platform = getPlatform();
    const resolved = new URL(url, window.location.origin);
    const moduleId = authContext.moduleId || platform.moduleId || 0;
    const siteId = authContext.siteId || platform.siteId || 0;
    if (moduleId && !resolved.searchParams.has('authmoduleid')) {
      resolved.searchParams.set('authmoduleid', String(moduleId));
    }
    if (siteId && !resolved.searchParams.has('authsiteid')) {
      resolved.searchParams.set('authsiteid', String(siteId));
    }
    return resolved.toString();
  } catch {
    return url;
  }
}

function getPlatformHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const platform = getPlatform();
  const moduleId = authContext.moduleId || platform.moduleId || 0;
  const siteId = authContext.siteId || platform.siteId || 0;
  const aliasId = platform.aliasId || 0;
  const headers: Record<string, string> = { 'X-Requested-With': 'XMLHttpRequest', ...extra };
  if (moduleId) headers['X-OQTANE-MODULEID'] = String(moduleId);
  if (siteId) headers['X-OQTANE-SITEID'] = String(siteId);
  if (aliasId) headers['X-OQTANE-ALIASID'] = String(aliasId);
  return headers;
}

function parseJson<T>(text: string): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

function parseApiError(text: string, fallbackStatus: number): string {
  const parsed = parseJson<any>(text || '');
  const fromJson = parsed && (parsed.error || parsed.Error || parsed.message || parsed.Message);
  const normalized = String(fromJson || text || '').trim();
  return normalized || `HTTP ${fallbackStatus}`;
}

function toPosInt(value: any, fallback = 0): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toBool(value: string | null | undefined, fallback = false): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function normalizeFormOptions(raw: any): { formId: number; title: string; status: string }[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw && (raw.forms || raw.Forms)) || [];
  if (!Array.isArray(list)) return [];
  return list.map((item: any) => {
    const formId = toPosInt(item?.formId ?? item?.FormId ?? 0, 0);
    return {
      formId,
      title: String(item?.title ?? item?.Title ?? (formId > 0 ? `Form #${formId}` : 'Untitled Form')),
      status: String(item?.status ?? item?.Status ?? ''),
    };
  }).filter((item) => item.formId > 0);
}

function normalizeModuleConfigResponse(raw: any, moduleId: number, siteId?: number): ModuleConfigResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = raw.config || raw.Config;
  if (!cfg || typeof cfg !== 'object') return null;

  const forms = normalizeFormOptions(raw.forms || raw.Forms);
  const resolvedModuleId = toPosInt(raw.moduleId ?? raw.ModuleId ?? cfg.moduleId ?? cfg.ModuleId ?? moduleId, moduleId);
  const resolvedSiteId = toPosInt(raw.siteId ?? raw.SiteId ?? siteId ?? 0, 0);
  const rendererHostUrl = String(raw.rendererHostUrl ?? raw.RendererHostUrl ?? cfg.rendererHostUrl ?? cfg.RendererHostUrl ?? '');
  const rendererHostPageId = toPosInt(raw.rendererHostPageId ?? raw.RendererHostPageId ?? cfg.rendererHostPageId ?? cfg.RendererHostPageId ?? 0, 0);
  const rendererHostModuleId = toPosInt(raw.rendererHostModuleId ?? raw.RendererHostModuleId ?? cfg.rendererHostModuleId ?? cfg.RendererHostModuleId ?? 0, 0);
  const formId = toPosInt(cfg.formId ?? cfg.FormId ?? 0, 0);
  const viewMode = String(cfg.viewMode ?? cfg.ViewMode ?? 'form');

  return {
    configured: !!(raw.configured ?? raw.Configured ?? (formId > 0)),
    moduleConfigured: !!(raw.moduleConfigured ?? raw.ModuleConfigured ?? cfg.moduleConfigured ?? cfg.ModuleConfigured ?? (formId > 0)),
    moduleId: resolvedModuleId,
    siteId: resolvedSiteId,
    forms,
    rendererHostUrl,
    rendererHostPageId,
    rendererHostModuleId,
    config: {
      moduleId: resolvedModuleId,
      formId,
      viewType: String(cfg.viewType ?? cfg.ViewType ?? (viewMode === 'form' ? 'submit' : viewMode)),
      selectedViewKey: String(cfg.selectedViewKey ?? cfg.SelectedViewKey ?? ''),
      viewConfig: String(cfg.viewConfig ?? cfg.ViewConfig ?? '{}'),
      cssClass: String(cfg.cssClass ?? cfg.CssClass ?? ''),
      moduleConfigured: !!(cfg.moduleConfigured ?? cfg.ModuleConfigured ?? (formId > 0)),
      moduleRole: String(cfg.moduleRole ?? cfg.ModuleRole ?? ''),
      displayMode: String(cfg.displayMode ?? cfg.DisplayMode ?? 'fixed'),
      triggerType: String(cfg.triggerType ?? cfg.TriggerType ?? 'time_delay'),
      delaySeconds: toPosInt(cfg.delaySeconds ?? cfg.DelaySeconds ?? 5, 5),
      scrollPercent: toPosInt(cfg.scrollPercent ?? cfg.ScrollPercent ?? 50, 50),
      clickSelector: String(cfg.clickSelector ?? cfg.ClickSelector ?? ''),
      popupSize: String(cfg.popupSize ?? cfg.PopupSize ?? 'medium'),
      viewMode,
      listFields: String(cfg.listFields ?? cfg.ListFields ?? ''),
      listTemplate: String(cfg.listTemplate ?? cfg.ListTemplate ?? ''),
      cardFields: String(cfg.cardFields ?? cfg.CardFields ?? ''),
      cardTemplate: String(cfg.cardTemplate ?? cfg.CardTemplate ?? ''),
      listViewSettingsJson: String(cfg.listViewSettingsJson ?? cfg.ListViewSettingsJson ?? '{}'),
      rendererHostUrl,
      rendererHostPageId,
      rendererHostModuleId,
      currentPageId: toPosInt(cfg.currentPageId ?? cfg.CurrentPageId ?? 0, 0),
      currentPageUrl: String(cfg.currentPageUrl ?? cfg.CurrentPageUrl ?? ''),
      useCurrentPageAsRendererHost: !!(cfg.useCurrentPageAsRendererHost ?? cfg.UseCurrentPageAsRendererHost ?? false),
      showOncePerSession: !!(cfg.showOncePerSession ?? cfg.ShowOncePerSession ?? true),
      closeOnOverlay: !!(cfg.closeOnOverlay ?? cfg.CloseOnOverlay ?? true),
      startAt: String(cfg.startAt ?? cfg.StartAt ?? ''),
      endAt: String(cfg.endAt ?? cfg.EndAt ?? ''),
    },
  };
}

async function fetchFormOptions(siteId?: number, moduleId?: number): Promise<{ formId: number; title: string; status: string }[]> {
  const resolvedSiteId = toPosInt(siteId ?? getPlatform().siteId ?? 0, 0);
  const resolvedModuleId = toPosInt(moduleId ?? getPlatform().moduleId ?? 0, 0);
  const qs: string[] = [];
  if (resolvedSiteId > 0) qs.push(`siteId=${encodeURIComponent(String(resolvedSiteId))}`);
  if (resolvedModuleId > 0) qs.push(`moduleId=${encodeURIComponent(String(resolvedModuleId))}`);
  try {
    const suffix = qs.length ? `?${qs.join('&')}` : '';
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Form/List${suffix}`), { credentials: 'same-origin', headers: getPlatformHeaders() });
    if (!r.ok) return [];
    const text = await r.text().catch(() => '');
    return normalizeFormOptions(parseJson<any>(text));
  } catch {
    return [];
  }
}

function findModuleElement(moduleId: number, selector: string): HTMLElement | null {
  if (!moduleId || moduleId <= 0) return null;
  const escaped = String(moduleId).replace(/"/g, '\\"');
  return document.querySelector(`${selector}[data-module-id="${escaped}"], ${selector}[data-mf-module-id="${escaped}"]`) as HTMLElement | null;
}

function inferModuleConfigFromDom(moduleId: number): Partial<ModuleConfig> {
  const fallback: Partial<ModuleConfig> = {
    moduleId,
    formId: 0,
    viewType: 'submit',
    viewMode: 'form',
    selectedViewKey: '',
    viewConfig: '{}',
    cssClass: '',
    moduleConfigured: false,
    displayMode: 'fixed',
    popupSize: 'medium',
    listFields: '',
    listTemplate: '',
    cardFields: '',
    cardTemplate: '',
    listViewSettingsJson: '{}',
    rendererHostUrl: '',
    rendererHostPageId: 0,
    rendererHostModuleId: 0,
  };

  const listViewEl = findModuleElement(moduleId, '[data-mf-listview="1"]');
  if (listViewEl) {
    const formId = toPosInt(listViewEl.getAttribute('data-mf-form-id'), 0);
    const fields = parseJson<any[]>(listViewEl.getAttribute('data-mf-fields-json') || '[]') || [];
    const listViewSettings = {
      formId,
      fields,
      rowTemplate: listViewEl.getAttribute('data-mf-row-template') || '',
      detailTemplate: listViewEl.getAttribute('data-mf-detail-template') || '',
      wrapperTemplate: listViewEl.getAttribute('data-mf-wrapper-template') || '',
      pageSize: toPosInt(listViewEl.getAttribute('data-mf-page-size'), 25),
      enableSearch: toBool(listViewEl.getAttribute('data-mf-search'), true),
      enableSort: toBool(listViewEl.getAttribute('data-mf-sort'), true),
      showAddButton: toBool(listViewEl.getAttribute('data-mf-show-add'), true),
      showRowActions: toBool(listViewEl.getAttribute('data-mf-show-actions'), true),
      title: listViewEl.getAttribute('data-mf-title') || '',
      emptyMessage: listViewEl.getAttribute('data-mf-empty-message') || 'No submissions yet.',
    };
    const root = listViewEl.closest('.megaform-module') as HTMLElement | null;
    return {
      ...fallback,
      formId,
      viewType: 'listview',
      viewMode: 'listview',
      moduleConfigured: formId > 0,
      cssClass: root?.className.replace(/\bmegaform-module\b/g, '').trim() || '',
      rendererHostUrl: listViewEl.getAttribute('data-mf-renderer-host-url') || '',
      listViewSettingsJson: JSON.stringify(listViewSettings),
    };
  }

  const legacyListEl = findModuleElement(moduleId, '[data-mf-view="list"]');
  if (legacyListEl) {
    const formId = toPosInt(legacyListEl.getAttribute('data-mf-form-id') || legacyListEl.getAttribute('data-form-id'), 0);
    const root = legacyListEl.closest('.megaform-module') as HTMLElement | null;
    return {
      ...fallback,
      formId,
      viewType: 'list',
      viewMode: 'list',
      moduleConfigured: formId > 0,
      cssClass: root?.className.replace(/\bmegaform-module\b/g, '').trim() || '',
      listFields: legacyListEl.getAttribute('data-mf-fields') || '',
      listTemplate: legacyListEl.getAttribute('data-mf-template') || '',
    };
  }

  const legacyCardEl = findModuleElement(moduleId, '[data-mf-view="card"]');
  if (legacyCardEl) {
    const formId = toPosInt(legacyCardEl.getAttribute('data-mf-form-id') || legacyCardEl.getAttribute('data-form-id'), 0);
    const root = legacyCardEl.closest('.megaform-module') as HTMLElement | null;
    return {
      ...fallback,
      formId,
      viewType: 'card',
      viewMode: 'card',
      moduleConfigured: formId > 0,
      cssClass: root?.className.replace(/\bmegaform-module\b/g, '').trim() || '',
      cardFields: legacyCardEl.getAttribute('data-mf-fields') || '',
      cardTemplate: legacyCardEl.getAttribute('data-mf-template') || '',
    };
  }

  const formEl = findModuleElement(moduleId, '[data-form-id], [data-mf-form-id]');
  if (formEl) {
    const formId = toPosInt(formEl.getAttribute('data-form-id') || formEl.getAttribute('data-mf-form-id'), 0);
    const root = formEl.closest('.megaform-module') as HTMLElement | null;
    return {
      ...fallback,
      formId,
      moduleConfigured: formId > 0,
      cssClass: root?.className.replace(/\bmegaform-module\b/g, '').trim() || '',
    };
  }

  return fallback;
}

async function buildOqtaneFallbackModuleConfig(moduleId: number, siteId?: number): Promise<ModuleConfigResponse> {
  const platform = getPlatform();
  const resolvedSiteId = toPosInt(siteId ?? platform.siteId ?? 0, 0);
  const forms = await fetchFormOptions(resolvedSiteId, moduleId);
  const inferred = inferModuleConfigFromDom(moduleId);
  const formId = toPosInt(inferred.formId, 0);
  const viewMode = String(inferred.viewMode || 'form').trim().toLowerCase() || 'form';
  const viewType = String(inferred.viewType || (viewMode === 'form' ? 'submit' : viewMode));
  return {
    configured: formId > 0,
    moduleConfigured: !!(inferred.moduleConfigured ?? (formId > 0)),
    moduleId,
    siteId: resolvedSiteId,
    forms,
    rendererHostUrl: String(inferred.rendererHostUrl || ''),
    rendererHostPageId: toPosInt(inferred.rendererHostPageId, 0),
    rendererHostModuleId: toPosInt(inferred.rendererHostModuleId, 0),
    config: {
      moduleId,
      formId,
      viewType,
      selectedViewKey: String(inferred.selectedViewKey || ''),
      viewConfig: String(inferred.viewConfig || '{}'),
      cssClass: String(inferred.cssClass || ''),
      moduleConfigured: !!(inferred.moduleConfigured ?? (formId > 0)),
      displayMode: String(inferred.displayMode || 'fixed'),
      popupSize: String(inferred.popupSize || 'medium'),
      viewMode,
      listFields: String(inferred.listFields || ''),
      listTemplate: String(inferred.listTemplate || ''),
      cardFields: String(inferred.cardFields || ''),
      cardTemplate: String(inferred.cardTemplate || ''),
      listViewSettingsJson: String(inferred.listViewSettingsJson || '{}'),
      rendererHostUrl: String(inferred.rendererHostUrl || ''),
      rendererHostPageId: toPosInt(inferred.rendererHostPageId, 0),
      rendererHostModuleId: toPosInt(inferred.rendererHostModuleId, 0),
      currentPageId: toPosInt(platform.pageId, 0),
      currentPageUrl: `${window.location.pathname}${window.location.search || ''}`,
      useCurrentPageAsRendererHost: false,
    },
  };
}

// `siteId` is appended to compensate for the server's inability to resolve
// site context from a plain `/api/...` URL (no `/{alias}` prefix). The
// MegaFormController honors `?siteId=NN` as a fallback when AuthEntityId
// returns -1. Without this, the Forms list comes back empty even when forms
// exist for the user's site.
export async function getModuleConfig(moduleId: number, siteId?: number): Promise<ModuleConfigResponse | null> {
  const platform = getPlatform();
  const isOqtane = String(platform.platform || '').toLowerCase() === 'oqtane';
  try {
    const qs = siteId && siteId > 0 ? `?siteId=${siteId}` : '';
    const r = await fetch(withPlatformAuth(`${getApiBase()}/ModuleConfig/${moduleId}${qs}`), { credentials: 'same-origin', headers: getPlatformHeaders() });
    const text = await r.text().catch(() => '');
    if (r.ok) {
      const parsed = parseJson<any>(text);
      const normalized = normalizeModuleConfigResponse(parsed, moduleId, siteId);
      if (normalized) {
        if (!normalized.forms.length) {
          normalized.forms = await fetchFormOptions(normalized.siteId || siteId, moduleId);
        }
        return normalized;
      }
    }
    if (isOqtane) return await buildOqtaneFallbackModuleConfig(moduleId, siteId);
    return null;
  } catch {
    if (isOqtane) return await buildOqtaneFallbackModuleConfig(moduleId, siteId);
    return null;
  }
}

export async function saveModuleConfig(cfg: ModuleConfig, siteId?: number): Promise<{ ok: boolean; status: number; body?: string }> {
  try {
    if (siteId && siteId > 0) cfg.siteId = siteId;       // body fallback
    const qs = siteId && siteId > 0 ? `?siteId=${siteId}` : '';
    const r = await fetch(withPlatformAuth(`${getApiBase()}/ModuleConfig${qs}`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(cfg),
    });
    let body: string | undefined;
    try { body = await r.text(); } catch { /* swallow */ }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// ── Form theme + layout (synced with Theme Designer) ──────────────────────────
// [ThemeInSettings 2026-06-23] The module Settings popup exposes the form's theme
// preset + layout so admins can tune them in one place. These read/write the SAME
// keys the Theme Designer uses — settings.theme (preset id) + settings.themeCssOverrides
// (a --mf-* var map) — so the two stay in sync (single source of truth = the form's
// settings). Load via GET Form/{id}; save via the dedicated POST Form/SaveTheme patch
// endpoint (preserves schema/fields/title/status — only touches theme/overrides).
export interface FormThemeLayoutState {
  ok: boolean;
  status: number;
  theme: string;
  overrides: Record<string, string>;
  // [B274] page-theme inheritance flags (form-level), surfaced so the Settings popup can show them.
  inheritType?: boolean;
  inheritColors?: boolean;
  // [HideHeader v20260705] form-level "hide form header" toggle, surfaced in the Settings popup.
  hideHeader?: boolean;
}

function sanitizeVarMap(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach((k) => {
      if (/^--[a-zA-Z0-9_-]+$/.test(k) && raw[k] != null && String(raw[k]).trim() !== '') {
        out[k] = String(raw[k]);
      }
    });
  }
  return out;
}

export async function getFormThemeLayout(formId: number): Promise<FormThemeLayoutState> {
  const empty = (status: number): FormThemeLayoutState => ({ ok: false, status, theme: 'default', overrides: {} });
  if (!formId || formId <= 0) return empty(0);
  try {
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Form/${encodeURIComponent(String(formId))}`), {
      credentials: 'same-origin',
      headers: getPlatformHeaders(),
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) return empty(r.status);
    const dto = parseJson<any>(text) || {};
    const settingsRaw = dto.settingsJson ?? dto.SettingsJson ?? dto.resolvedSettingsJson ?? dto.ResolvedSettingsJson ?? '{}';
    const settings = typeof settingsRaw === 'string' ? (parseJson<any>(settingsRaw) || {}) : (settingsRaw || {});
    const theme = String(settings.theme ?? settings.Theme ?? 'default').trim() || 'default';
    const overrides = sanitizeVarMap(
      settings.themeCssOverrides ?? settings.ThemeCssOverrides ?? settings.cssOverrides ?? settings.CssOverrides ?? {});
    const inheritType = (settings.inheritPageTypography ?? settings.InheritPageTypography) === true;
    const inheritColors = (settings.inheritPageColors ?? settings.InheritPageColors) === true;
    const hideHeader = (settings.hideHeader ?? settings.HideHeader) === true;
    return { ok: true, status: r.status, theme, overrides, inheritType, inheritColors, hideHeader };
  } catch {
    return empty(0);
  }
}

export async function saveFormThemeLayout(
  formId: number,
  theme: string,
  overrides: Record<string, string>,
): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!formId || formId <= 0) return { ok: false, status: 0, body: 'formId required' };
  try {
    const cleanOverrides = sanitizeVarMap(overrides);
    const themeId = String(theme || 'default').trim() || 'default';
    const payload = {
      FormId: formId,
      ThemeId: themeId,
      ThemeJson: JSON.stringify({ _kind: 'MegaFormThemePatch', theme: themeId, cssOverrides: cleanOverrides }),
      CssOverrides: cleanOverrides,
    };
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Form/SaveTheme`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    let body: string | undefined;
    try { body = await r.text(); } catch { /* swallow */ }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// [B274] Persist ONLY the page-theme inheritance flags to the FORM. Form/SaveTheme is a partial
// patch — it leaves theme/customCss/themeCssOverrides untouched when those fields are absent — so
// sending just the flags does not disturb the module-wins CSS. Same form-level storage the builder
// Theme Designer "Page integration" switches use (settings.inheritPageTypography / -Colors).
export async function saveFormInheritFlags(
  formId: number,
  inheritType: boolean,
  inheritColors: boolean,
): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!formId || formId <= 0) return { ok: false, status: 0, body: 'formId required' };
  try {
    const payload = { FormId: formId, InheritPageTypography: !!inheritType, InheritPageColors: !!inheritColors };
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Form/SaveTheme`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    let body: string | undefined;
    try { body = await r.text(); } catch { /* swallow */ }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// [HideHeader v20260705] Persist ONLY the "hide form header" toggle to the FORM. Same partial-patch
// Form/SaveTheme endpoint the inherit flags use — sending just HideHeader leaves theme/css/inherit
// untouched. Mirrors settings.hideHeader written by the builder's Hide-Form-Header checkbox.
export async function saveFormHideHeader(
  formId: number,
  hideHeader: boolean,
): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!formId || formId <= 0) return { ok: false, status: 0, body: 'formId required' };
  try {
    const payload = { FormId: formId, HideHeader: !!hideHeader };
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Form/SaveTheme`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    let body: string | undefined;
    try { body = await r.text(); } catch { /* swallow */ }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

// [ModuleStyle v20260624-B262] Per-module CSS source (module-setting wins). getModuleStyle GETs
// the module's owned style for the current form — the server SEEDS it from the form's CSS on the
// first call (or when the module was bound to a different form). saveModuleStyle persists the
// admin's edits to the module (NOT the form; the form stays the seed/template). Mirrors the
// getFormThemeLayout/saveFormThemeLayout shapes so the Settings popup can swap to these.
export async function getModuleStyle(moduleId: number, formId: number): Promise<FormThemeLayoutState> {
  const empty = (status: number): FormThemeLayoutState => ({ ok: false, status, theme: 'default', overrides: {} });
  if (!moduleId || moduleId <= 0 || !formId || formId <= 0) return empty(0);
  try {
    const r = await fetch(withPlatformAuth(`${getApiBase()}/ModuleConfig/ModuleStyle?moduleId=${encodeURIComponent(String(moduleId))}&formId=${encodeURIComponent(String(formId))}`), {
      credentials: 'same-origin',
      headers: getPlatformHeaders(),
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) return empty(r.status);
    const body = parseJson<any>(text) || {};
    const style = body.style ?? body.Style ?? {};
    const theme = String(style.theme ?? style.Theme ?? 'default').trim() || 'default';
    const overrides = sanitizeVarMap(
      style.themeCssOverrides ?? style.ThemeCssOverrides ?? style.cssOverrides ?? style.CssOverrides ?? {});
    return { ok: true, status: r.status, theme, overrides };
  } catch {
    return empty(0);
  }
}

export async function saveModuleStyle(
  moduleId: number,
  formId: number,
  theme: string,
  overrides: Record<string, string>,
): Promise<{ ok: boolean; status: number; body?: string }> {
  if (!moduleId || moduleId <= 0 || !formId || formId <= 0) return { ok: false, status: 0, body: 'moduleId and formId required' };
  try {
    const cleanOverrides = sanitizeVarMap(overrides);
    const themeId = String(theme || 'default').trim() || 'default';
    const payload = { moduleId, formId, theme: themeId, themeCssOverrides: cleanOverrides };
    const r = await fetch(withPlatformAuth(`${getApiBase()}/ModuleConfig/SaveModuleStyle`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    let body: string | undefined;
    try { body = await r.text(); } catch { /* swallow */ }
    return { ok: r.ok, status: r.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: String(err) };
  }
}

export async function getFormViews(formId: number): Promise<FormViewFetchResult> {
  if (!formId || formId <= 0) return { ok: true, status: 0, views: [] };
  try {
    const r = await fetch(withPlatformAuth(`${getPhase2ApiBase()}/GetViewConfigs?formId=${encodeURIComponent(String(formId))}`), { credentials: 'same-origin', headers: getPlatformHeaders() });
    if (!r.ok) {
      const error = parseApiError(await r.text().catch(() => ''), r.status);
      return { ok: false, status: r.status, views: [], error };
    }
    const text = await r.text().catch(() => '');
    const body = parseJson<any>(text);
    if (!body || typeof body !== 'object') {
      return {
        ok: false,
        status: r.status,
        views: [],
        app: null,
        queries: [],
        error: text && text.trim() ? 'Invalid JSON response from the view catalog endpoint.' : 'Empty response body from the view catalog endpoint.',
      };
    }
    const views = (body && (body.views || body.Views)) || [];
    const rawApp = body && (body.app || body.App);
    const app = rawApp && typeof rawApp === 'object'
      ? {
          appId: toPosInt(rawApp.appId ?? rawApp.AppId ?? 0, 0),
          appKey: String(rawApp.appKey ?? rawApp.AppKey ?? ''),
          appName: String(rawApp.appName ?? rawApp.AppName ?? rawApp.appKey ?? rawApp.AppKey ?? ''),
          appScope: String(rawApp.appScope ?? rawApp.AppScope ?? ''),
        } as AppSummaryOption
      : null;
    const queries = ((body && (body.queries || body.Queries)) || []) as any[];
    return {
      ok: true,
      status: r.status,
      app,
      queries: Array.isArray(queries) ? queries.map((q: any) => ({
        queryId: toPosInt(q.queryId ?? q.QueryId ?? 0, 0),
        appId: toPosInt(q.appId ?? q.AppId ?? 0, 0),
        formId: toPosInt(q.formId ?? q.FormId ?? 0, 0),
        queryKey: String(q.queryKey ?? q.QueryKey ?? ''),
        queryName: String(q.queryName ?? q.QueryName ?? q.queryKey ?? q.QueryKey ?? ''),
        description: String(q.description ?? q.Description ?? ''),
        queryType: String(q.queryType ?? q.QueryType ?? ''),
        isSystem: !!(q.isSystem ?? q.IsSystem),
        sortOrder: toPosInt(q.sortOrder ?? q.SortOrder ?? 0, 0),
      })).filter((q: AppQueryOption) => !!q.queryKey) : [],
      views: Array.isArray(views) ? views.map((v: any) => ({
        viewId: v.viewId ?? v.ViewId ?? 0,
        formId: v.formId ?? v.FormId ?? formId,
        viewKey: String(v.viewKey ?? v.ViewKey ?? ''),
        queryKey: String(v.queryKey ?? v.QueryKey ?? ''),
        viewType: String(v.viewType ?? v.ViewType ?? ''),
        viewName: String(v.viewName ?? v.ViewName ?? v.viewKey ?? v.ViewKey ?? ''),
        isDefault: !!(v.isDefault ?? v.IsDefault),
        sortOrder: v.sortOrder ?? v.SortOrder ?? 0,
        configJson: String(v.configJson ?? v.ConfigJson ?? '{}'),
        customHtml: String(v.customHtml ?? v.CustomHtml ?? ''),
        customCss: String(v.customCss ?? v.CustomCss ?? ''),
        permissionsJson: String(v.permissionsJson ?? v.PermissionsJson ?? ''),
      })).filter((v: FormViewOption) => !!v.viewKey) : [],
    };
  } catch (err) {
    return { ok: false, status: 0, views: [], error: String(err) };
  }
}

export async function saveFormView(view: SaveFormViewPayload): Promise<SaveFormViewResult> {
  try {
    const r = await fetch(withPlatformAuth(`${getPhase2ApiBase()}/SaveViewConfig`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(view),
    });
    if (!r.ok) {
      const error = parseApiError(await r.text().catch(() => ''), r.status);
      return { ok: false, status: r.status, error };
    }
    const body = await r.json().catch(() => null) as any;
    return { ok: true, status: r.status, viewId: body?.viewId ?? body?.ViewId ?? 0 };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

export async function deleteFormView(viewId: number): Promise<DeleteFormViewResult> {
  if (!viewId || viewId <= 0) return { ok: false, status: 0, error: 'viewId is required.' };
  try {
    const r = await fetch(withPlatformAuth(`${getPhase2ApiBase()}/DeleteViewConfig?viewId=${encodeURIComponent(String(viewId))}`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: getPlatformHeaders(),
    });
    if (!r.ok) {
      const error = parseApiError(await r.text().catch(() => ''), r.status);
      return { ok: false, status: r.status, error };
    }
    return { ok: true, status: r.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

export async function fetchSchemaFields(formId: number): Promise<FieldDef[]> {
  if (!formId || formId <= 0) return [];
  try {
    const r = await fetch(withPlatformAuth(`${getApiBase()}/Schema/${formId}`), { credentials: 'same-origin', headers: getPlatformHeaders() });
    if (!r.ok) return [];
    const data = await r.json();
    const schemaJson = data?.Schema || data?.schema || '';
    if (!schemaJson) return [];
    const schema = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;
    return extractFieldsFromSchema(schema);
  } catch { return []; }
}

// Walks form schema recursively pulling out anything that looks like a field.
// Schema shapes vary across builder versions — be permissive.
export function extractFieldsFromSchema(schema: any): FieldDef[] {
  const out: FieldDef[] = [];
  const seen = new Set<string>();
  const visit = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (typeof node !== 'object') return;
    const key = String(node.key || node.id || node.name || '').trim();
    const type = String(node.type || node.fieldType || '').trim().toLowerCase();
    const isFieldShape = key && type && type !== 'section' && type !== 'page' && type !== 'group' && type !== 'row' && type !== 'column';
    if (isFieldShape && !seen.has(key)) {
      seen.add(key);
      out.push({ key, label: String(node.label || node.title || key), type });
    }
    for (const child of ['fields', 'children', 'pages', 'sections', 'columns', 'rows', 'items']) {
      if (node[child]) visit(node[child]);
    }
  };
  visit(schema);
  return out;
}

// ════════════════════════════════════════════════════════════════════════════
//  Misc utilities
// ════════════════════════════════════════════════════════════════════════════

export function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function parseDesignSpec<T>(template: string, fallback: T): T {
  if (!template) return fallback;
  const trimmed = template.trim();
  if (!trimmed.startsWith('{')) return fallback;   // legacy raw HTML — not a spec
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object' && obj.version) return obj as T;
  } catch { /* not JSON */ }
  return fallback;
}

export function serializeDesignSpec(spec: any): string {
  return JSON.stringify(spec);
}

// Render a list of FieldDefs into a tab-separated config — used to populate
// the legacy ListFields / CardFields settings (comma-separated keys).
export function fieldsCsv(fields: { key: string }[]): string {
  return fields.map((f) => f.key).join(', ');
}
