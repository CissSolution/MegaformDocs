// ============================================================
// MegaForm Submissions Shell — v1 Redesign (2026-06-09)
// Light theme · shadcn/ui-inspired layout · full API integration
// Features: stats cards, draggable columns, sheet detail, form report
// ============================================================

import { h, clear } from '@shared/dom';
import { t as i18nT } from '@i18n';

/** Translate with an English fallback baked in → never blanks (no UI break). */
function T(key: string, fallback: string, params?: Record<string, string | number>): string {
  try { const o = i18nT(key, params); if (o && o !== key) return o; } catch { /* engine */ }
  let raw = fallback;
  if (params) for (const p in params) raw = raw.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]));
  return raw;
}
import {
  getSubsState, setSubmissions, setPage, setPageSize, setFilters, setAvailableForms, setCurrentForm,
  toggleSelect, selectAll, clearSelection, flattenFields,
  type Submission, type SubmissionFormOption,
} from './state';
import { renderFormsOverview } from './forms-overview';
import { showSubmissionModal } from './SubmissionModal';
import { exportClientCsv } from './export';
import { openLiveDbRowsModal } from './submission-livedb-modal';
import type { PlatformAdapter } from '@core/platform';
import { getPlatformRoute, getApiBase, getPlatformHostConfig } from '@shared/platform-host';
import { bindSkinSafeHashLink } from '@shared/hash-nav';

const SUBMISSIONS_SHELL_BADGE = 'SubmissionsShell v20260616-B162rewire';
if (typeof window !== 'undefined') (window as any).__MF_SUBMISSIONS_SHELL_BADGE__ = SUBMISSIONS_SHELL_BADGE;

// [B162] Landing view = WPForms-style forms-overview; 'list' = a single form's submissions
// table. The April-21 revert dropped this wiring (forms-overview.ts survived but was orphaned);
// re-applied 2026-06-16.
let _viewMode: 'overview' | 'list' = 'overview';

const URLS = {
  dashboard: () => getPlatformRoute('dashboard'),
  builder: (formId?: number) => getPlatformRoute('builder', formId),
  submissions: (formId?: number) => getPlatformRoute('submissions', formId),
  myinbox: () => getPlatformRoute('myinbox'),
  settings: () => getPlatformRoute('settings'),
  languages: () => getPlatformRoute('languages'),
  logout: () => getPlatformRoute('logout'),
};

// ── Icons (Lucide-style inline SVG) ─────────────────────────
const I: Record<string, string> = {
  dashboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`,
  file: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  inbox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  panel: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
  gear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  userPlus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
  csv: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
  chevD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`,
  logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  dl: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`,
  filter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  archive: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
  star: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  chevL: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>`,
  chevR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>`,
  sortAsc: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>`,
  sortDesc: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`,
  sortNone: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/><path d="m6 9 6 6 6-6" opacity=".3"/></svg>`,
  alertCircle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  checkCircle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  xCircle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>`,
  archiveIcon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
  inboxIcon: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  fileCheck: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`,
  barChart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 16v-4"/><path d="M11 16V8"/><path d="M15 16v-6"/><path d="M19 16v-2"/></svg>`,
  googleSheet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 10h18"/><path d="M8 6v12"/><path d="M16 6v12"/></svg>`,
  // [Sidebar consistency 2026-06-11] settings icons mirrored from the dashboard so both surfaces match
  db: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  card: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  mail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  files: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/></svg>`,
  shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  sparkles: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  gripVertical: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
  calendarDays: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,
  columns3: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`,
  chevronsUpDown: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  moreHorizontal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  maximize: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  minimize: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>`,
};

function ic(k: string, sz = 16): string {
  const raw = I[k] || '';
  return raw.replace(/width="\d+"/, `width="${sz}"`).replace(/height="\d+"/, `height="${sz}"`);
}
function div(cls?: string, html?: string): HTMLElement { const e = document.createElement('div'); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function span(cls?: string, html?: string): HTMLElement { const e = document.createElement('span'); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function btn(cls: string, html: string, onClick: (e: Event) => void): HTMLButtonElement {
  const b = document.createElement('button') as HTMLButtonElement;
  b.type = 'button'; b.className = cls; b.innerHTML = html;
  b.addEventListener('click', onClick); return b;
}
function a(cls: string, href: string, html: string): HTMLAnchorElement {
  const el = document.createElement('a'); el.className = cls; el.href = href; el.innerHTML = html; return el;
}
function mk(parent: HTMLElement, ...children: (HTMLElement | Node)[]): HTMLElement {
  children.forEach(c => parent.appendChild(c)); return parent;
}

// ── State ─────────────────────────────────────────────────────
let _adapter: PlatformAdapter;
let _container: HTMLElement;
let _rootEl: HTMLElement;
let _embedded = false;
let _loading = false;
let _loadError = '';
let _sortCol = 'date';
let _sortDir: 'asc' | 'desc' = 'desc';
let _formsLoaded = false;
let _searchTimer: number | null = null;

// ── Column model (persisted in localStorage) ──────────────────
// ONE library: fixed DATA columns + CONTEXT-AWARE "response" columns derived
// from the REAL form (schema fields for a single form, or the union of actual
// submission dataJson keys for all-forms). Response column keys are prefixed
// `f:` so they never collide with the data columns. `_columnDefs` holds the
// ACTIVE columns (ordered + draggable + persisted); the rest live in the
// Manage Columns panel as add-able chips. ID + Status are protected (no ✕).
type ColGroup = 'data' | 'response';
interface ColumnDef { key: string; label: string; group: ColGroup; sortable: boolean; removable: boolean; className?: string; width?: number }

// Default column width (px) when the user hasn't resized it. Keeps long values
// (emails, titles) from overflowing into the next column.
function defaultColWidth(col: ColumnDef): number {
  if (col.key === 'id') return 92;
  if (col.key === 'status') return 140;
  if (col.key === 'date') return 168;
  if (col.key === 'form' || col.key === 'name') return 168;
  return 180; // response fields + everything else
}
let _columnDefs: ColumnDef[] = [];        // active columns
let _manageOpen = false;                  // Manage Columns panel toggle
let _dateRange = 'all';                   // date-range filter (client-side, like the mock)
// [PerFormColumns 2026-06-22] Active columns are persisted PER FORM (bucket = `f{formId}`
// for a single form, `all` for the all-forms view) — see getStoredColumns/setStoredColumns.
// Previously they lived under one GLOBAL key, so response (`f:*`) columns added while viewing
// form A stayed active when you opened form B, where their keys don't exist in B's data → the
// grid showed the WRONG form's field columns, all rendering "—". `_columnsFormKey` tracks which
// bucket the live `_columnDefs` belong to so a form switch reloads that form's own layout;
// `_seededRespForBucket` guards the one-time default-field seeding below.
let _columnsFormKey = '';
let _seededRespForBucket = false;

const DATA_COLUMNS: ColumnDef[] = [
  { key: 'id',     label: 'ID',           group: 'data', sortable: true, removable: true },
  { key: 'form',   label: 'Form',         group: 'data', sortable: true, removable: true },
  { key: 'name',   label: 'Submitted By', group: 'data', sortable: true, removable: true },
  { key: 'date',   label: 'Date',         group: 'data', sortable: true, removable: true },
  { key: 'status', label: 'Status',       group: 'data', sortable: true, removable: false },
];
// [DrillinColsDefault 2026-06-16] ID + Form are HIDDEN by default — in a drilled-in
// single-form view the "Form" column is redundant (every row is the same form) and ID
// is noise. Both stay addable via Manage Columns. Default visible = Submitted By / Date /
// Status. (status is non-removable so it is always force-present by syncActiveColumns.)
const DEFAULT_VISIBLE_KEYS = ['name', 'date', 'status'];

const DATE_RANGES: Array<{ value: string; label: string }> = [
  { value: 'all',   label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: '7d',    label: 'Last 7 Days' },
  { value: '30d',   label: 'Last 30 Days' },
  { value: 'year',  label: 'This Year' },
];

function prettifyKey(k: string): string {
  return String(k || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || String(k || '');
}
function isLayoutFieldType(t: string): boolean {
  return ['row', 'column', 'section', 'heading', 'divider', 'htmlblock', 'html', 'image',
    'dynamiclabel', 'datarepeater', 'gridrepeater', 'datagrid', 'spacer', 'paragraph']
    .includes(String(t || '').toLowerCase());
}

// [Perf #9 2026-06-19] Parse each row's dataJson EXACTLY ONCE and cache the
// result on the row object (non-enumerable `__data`), keyed by the raw string so
// a row that gets new JSON re-parses. Previously dataJson was JSON.parsed 4–5×
// per row per render (compareSubmissions / renderCell / buildRow /
// getResponseFieldDefs), which is O(rows × renders) GC churn on large datasets.
// [Perf #9 2026-06-19] min/max via a single reduce loop. `Math.min(...arr)` /
// `Math.max(...arr)` spreads the whole array onto the call stack, which throws
// RangeError ("Maximum call stack size exceeded") once an array reaches ~100k+
// elements — a real crash on large submission sets. reduce is O(n) and unbounded.
function arrMin(arr: number[], seed = Infinity): number { return arr.reduce((m, v) => (v < m ? v : m), seed); }
function arrMax(arr: number[], seed = -Infinity): number { return arr.reduce((m, v) => (v > m ? v : m), seed); }

interface ParsedRowCache { __data?: Record<string, unknown>; __dataRaw?: string }
function rowData(sub: Submission): Record<string, unknown> {
  const cache = sub as unknown as ParsedRowCache;
  const raw = sub.dataJson || '';
  if (cache.__data !== undefined && cache.__dataRaw === raw) return cache.__data as Record<string, unknown>;
  let parsed: Record<string, unknown> = {};
  try { parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) || {} : {}; } catch { parsed = {}; }
  try {
    Object.defineProperty(cache, '__data', { value: parsed, enumerable: false, writable: true, configurable: true });
    Object.defineProperty(cache, '__dataRaw', { value: raw, enumerable: false, writable: true, configurable: true });
  } catch { /* frozen row — fall back to returning the parse without caching */ }
  return parsed;
}

// CONTEXT-AWARE response fields — NOT the mock's hardcoded list.
function getResponseFieldDefs(state: ReturnType<typeof getSubsState>): ColumnDef[] {
  const seen = new Set<string>();
  const out: ColumnDef[] = [];
  const add = (key: string, label?: string) => {
    const k = String(key || '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ key: 'f:' + k, label: label || prettifyKey(k), group: 'response', sortable: true, removable: true });
  };
  const sch = state.config.schema && state.config.schema.fields;
  if (state.config.formId > 0 && Array.isArray(sch) && sch.length) {
    // Single form → real field keys + LABELS from the form schema.
    flattenFields(sch).forEach((f: any) => {
      const type = f && (f.type || f.Type);
      const key = f && (f.key || f.Key);
      if (!key || isLayoutFieldType(type)) return;
      add(String(key), String((f.label || f.Label || prettifyKey(String(key)))));
    });
  } else {
    // All-forms / no schema → union of REAL submission dataJson keys.
    (state.submissions || []).forEach((s) => {
      Object.keys(rowData(s)).forEach((k) => add(k));
    });
  }
  return out;
}
function buildColumnLibrary(state: ReturnType<typeof getSubsState>): ColumnDef[] {
  return [...DATA_COLUMNS, ...getResponseFieldDefs(state)];
}
// [PerFormColumns 2026-06-22] Reconcile the active columns against the CURRENT form's library.
// 1) On a form switch, reload that form's own saved layout (or a fresh default) so columns from a
//    previously-viewed form never leak across. 2) Refresh labels/group from the live library.
// 3) Once the form's response-field library is actually loaded, DROP any active `f:*` column that
//    doesn't belong to this form (the stale cross-form columns that rendered "—"); while the lib is
//    still loading we keep them to avoid first-paint flicker. 4) For a single form opened for the
//    first time (no saved layout yet), SEED a few of its real fields so the submitted data is
//    visible immediately instead of an empty grid. Protected columns are always present.
function syncActiveColumns(state: ReturnType<typeof getSubsState>): void {
  const bucket = state.config.formId > 0 ? ('f' + state.config.formId) : 'all';
  const lib = buildColumnLibrary(state);
  const byKey = new Map(lib.map((c) => [c.key, c]));
  const respLib = lib.filter((c) => c.group === 'response');
  const sch = state.config.schema && state.config.schema.fields;
  const libReady = state.config.formId > 0
    ? Array.isArray(sch) && sch.length > 0
    : (state.submissions || []).length > 0;

  // Form context changed → load this form's own persisted layout (or its default set).
  if (_columnsFormKey !== bucket) {
    const stored = getStoredColumns(bucket);
    _columnDefs = stored ? stored.slice() : DATA_COLUMNS.filter((c) => DEFAULT_VISIBLE_KEYS.includes(c.key));
    _columnsFormKey = bucket;
    _seededRespForBucket = !!stored;       // a saved layout counts as already-seeded
  }

  // Refresh known columns from the live library; drop stale f:* once the library is authoritative.
  // [PerFormColumns 2026-06-22] Refresh label/group from the library but PRESERVE the user's saved
  // `width` — the old `byKey.get(c.key) || c` replaced the stored column wholesale with the library
  // def (which carries no width), so a resized column reset to its default on the very next render
  // and never survived a reload. Keeping c.width here makes per-form column widths persist.
  _columnDefs = _columnDefs
    .map((c) => {
      const lib = byKey.get(c.key);
      if (!lib) return c;                                       // unknown (kept until libReady below)
      return (c.width != null) ? { ...lib, width: c.width } : lib;
    })
    .filter((c) => {
      if (!c.key.startsWith('f:')) return true;   // data columns are never form-specific
      if (byKey.has(c.key)) return true;          // belongs to the current form
      return !libReady;                           // unknown f:* → keep only until lib is known
    });

  // First visit to a single form with no saved layout → show a few of its real fields so data shows.
  if (libReady && !_seededRespForBucket && state.config.formId > 0 && respLib.length
      && !_columnDefs.some((c) => c.key.startsWith('f:'))) {
    _columnDefs = [..._columnDefs, ...respLib.slice(0, 5)];
    _seededRespForBucket = true;
    setStoredColumns(_columnDefs);
  }

  if (!_columnDefs.length) _columnDefs = DATA_COLUMNS.filter((c) => DEFAULT_VISIBLE_KEYS.includes(c.key));
  DATA_COLUMNS.filter((c) => !c.removable).forEach((c) => {
    if (!_columnDefs.some((a) => a.key === c.key)) _columnDefs.unshift(c);
  });
}
function availableColumns(state: ReturnType<typeof getSubsState>): ColumnDef[] {
  const active = new Set(_columnDefs.map((c) => c.key));
  return buildColumnLibrary(state).filter((c) => !active.has(c.key));
}
function addColumn(key: string): void {
  const col = buildColumnLibrary(getSubsState()).find((c) => c.key === key);
  if (!col || _columnDefs.some((c) => c.key === key)) return;
  _columnDefs = [..._columnDefs, col];
  setStoredColumns(_columnDefs);
  render();
}
function removeColumn(key: string): void {
  const col = _columnDefs.find((c) => c.key === key);
  if (!col || col.removable === false) return;
  _columnDefs = _columnDefs.filter((c) => c.key !== key);
  setStoredColumns(_columnDefs);
  render();
}

// [PerFormColumns 2026-06-22] v4 = a MAP of bucket → ColumnDef[], keyed per form, replacing the
// v3 single global array (the cross-form-contamination bug). Old v3 is intentionally ignored so a
// form's layout starts from its own fields instead of whatever the last-viewed form left behind.
const COLUMNS_STORE_KEY = 'mf-subs-columns-v4';
function getStoredColumnsMap(): Record<string, ColumnDef[]> {
  try { const raw = localStorage.getItem(COLUMNS_STORE_KEY); const m = raw ? JSON.parse(raw) : null; return (m && typeof m === 'object') ? m : {}; } catch { return {}; }
}
function getStoredColumns(bucket: string): ColumnDef[] | null {
  const cols = getStoredColumnsMap()[bucket];
  return Array.isArray(cols) && cols.length ? cols : null;
}
function setStoredColumns(cols: ColumnDef[]): void {
  try {
    const m = getStoredColumnsMap();
    m[_columnsFormKey || 'all'] = cols;
    localStorage.setItem(COLUMNS_STORE_KEY, JSON.stringify(m));
  } catch { /* ignore */ }
}

// ── Entry ─────────────────────────────────────────────────────
export function renderSubmissions(container: HTMLElement, adapter: PlatformAdapter, rootEl?: HTMLElement): void {
  _adapter = adapter;
  _rootEl = rootEl || container;
  _embedded = container !== _rootEl || _rootEl.dataset.shellMode === 'embedded';
  _container = _embedded ? container : createPageShell(_rootEl);
  // [PerFormColumns 2026-06-22] Don't pre-load a global column set here — syncActiveColumns()
  // (run on every render) loads the per-form bucket for whatever form is active and seeds its
  // defaults, so reset the trackers and let it populate _columnDefs for the right form.
  _columnsFormKey = '';
  _seededRespForBucket = false;
  _columnDefs = [];
  // [B162] Land on the forms-overview unless a specific form is locked in via host config.
  _viewMode = (getSubsState().config?.formId && getSubsState().config.formId > 0) ? 'list' : 'overview';
  render();
  Promise.resolve()
    .then(() => ensureFormsLoaded())
    .then(() => { if (_viewMode !== 'overview') return loadSubmissions(); })
    .catch((err) => {
      _loadError = err instanceof Error ? err.message : String(err || 'Unknown error');
      _loading = false; render();
    });
}

// ── Forms-overview landing (B162) ─────────────────────────────
// Re-wires the WPForms-style overview (KPI strip + Submission Volume chart + per-form table
// with All-Time/Last-7d/Last-30d + sparkline trend) that the April-21 revert orphaned.
function renderOverview(mountEl: HTMLElement): void {
  const apiBase = String((getSubsState().config.apiBase || (getApiBase() + '/'))).replace(/\/+$/, '') + '/';
  const siteId = Number.parseInt(String(_rootEl?.dataset.mfSiteId || _rootEl?.dataset.siteId || '0'), 10) || 0;
  const host = div('mf-subs-overview-host');
  mountEl.appendChild(host);
  renderFormsOverview(host, {
    apiBase,
    siteId,
    onTotalsLoaded: ({ submissions }) => {
      const count = document.querySelector<HTMLElement>('[data-mf-nav="submissions"] .mf-sb-lk-cnt');
      if (count) count.textContent = String(submissions || 0);
    },
    onPickForm: (formId: number) => {
      _viewMode = 'list';
      switchForm(formId).catch(err => handleLoadError(err, 'Failed to open form'));
    },
  });
}

// "‹ All forms / <form name>" breadcrumb shown above a drilled-in form's submissions list.
function buildBackBar(): HTMLElement {
  const bar = div('mf-subs-backbar');
  bar.style.cssText = 'margin:0 0 12px;display:flex;align-items:center;gap:6px;';
  const a = document.createElement('button');
  a.type = 'button';
  a.className = 'mf-subs-backbar-btn';
  a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;padding:6px 2px;';
  a.innerHTML = ic('chevL', 14);
  const lbl = document.createElement('span'); lbl.textContent = T('subs.all_forms_back', 'All forms');
  a.appendChild(lbl);
  a.addEventListener('click', () => {
    _viewMode = 'overview';
    setCurrentForm(0, undefined, 'All Submissions');
    render();
  });
  bar.appendChild(a);

  // [Breadcrumb 2026-06-16] Append " / <current form name>" so the user sees which
  // form they drilled into (matches the mock: All forms / <form>).
  const st = getSubsState();
  const formTitle = String(st.config.formTitle || (st.config.formId ? `Form #${st.config.formId}` : '')).trim();
  if (formTitle) {
    const sep = document.createElement('span');
    sep.textContent = '/';
    sep.style.cssText = 'color:#94a3b8;font-size:13px;';
    const cur = document.createElement('span');
    cur.className = 'mf-subs-backbar-current';
    cur.textContent = formTitle;
    cur.title = formTitle;
    cur.style.cssText = 'color:#0f172a;font-size:13px;font-weight:600;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    bar.appendChild(sep);
    bar.appendChild(cur);
  }
  return bar;
}

// ── Page Shell (sidebar + header + main) ─────────────────────
function createPageShell(root: HTMLElement): HTMLElement {
  clear(root);
  document.body.className = 'mf-body';
  root.className = '';
  const layout = div('mf-layout');
  const sidebar = buildSidebar();
  const inset = div('mf-inset');
  const hd = buildHeader(sidebar);
  const main = document.createElement('main');
  main.className = 'mf-main';
  main.setAttribute('data-mf-subs-content', 'true');
  mk(inset, hd, main);
  mk(layout, sidebar, inset);
  root.appendChild(layout);
  return main;
}

function readHostCounts(): { forms?: number; submissions?: number } {
  try {
    const host = document.getElementById('mf-dnn-host') as HTMLElement | null;
    const raw = host?.dataset.dashboardJson || '';
    const parsed = raw ? JSON.parse(raw) as { counts?: { forms?: number; submissions?: number } } : null;
    return parsed?.counts || {};
  } catch { return {}; }
}

function buildSidebar(): HTMLElement {
  const state = getSubsState();
  const hostCounts = readHostCounts();
  const formsCount = Number.isFinite(Number(hostCounts.forms)) && Number(hostCounts.forms) > 0
    ? Number(hostCounts.forms)
    : (state.forms || []).length;
  const submissionsCount = Number.isFinite(Number(hostCounts.submissions)) && Number(hostCounts.submissions) >= 0
    ? Number(hostCounts.submissions)
    : (state.totalCount || 0);
  const countForms = String(formsCount || 0);
  const countSubs = String(submissionsCount || 0);

  const sb = div('mf-sidebar'); sb.setAttribute('data-state', 'expanded');
  const sHd = div('mf-sb-hd');
  const logo = div('mf-sb-logo');
  const li = div('mf-sb-logo-icon'); li.innerHTML = ic('file', 18);
  const lc = div('mf-sb-logo-copy'); lc.innerHTML = '<span class="mf-sb-name">MegaForm</span><span class="mf-sb-ver">v2.4.1</span>';
  mk(logo, li, lc); sHd.appendChild(logo); sb.appendChild(sHd);

  const cnt = div('mf-sb-cnt');
  function group(label: string, items: Array<{title:string;url?:string;icon:string;count?:string;active?:boolean;demoArea?:string;navKey?:string}>): HTMLElement {
    const g = div('mf-sb-grp'); g.innerHTML = `<div class="mf-sb-grp-lbl">${label}</div>`;
    const m = div('mf-sb-menu');
    items.forEach(item => {
      const lk = a(`mf-sb-lk${item.active?' is-active':''}`, item.url||'#', '') as HTMLAnchorElement;
      if (item.navKey) lk.dataset.mfNav = item.navKey;
      bindSkinSafeHashLink(lk, item.url);
      lk.innerHTML = ic(item.icon, 16);
      lk.appendChild(Object.assign(span('mf-sb-lk-lbl'), {textContent: item.title}));
      if (item.count != null) lk.appendChild(Object.assign(span('mf-sb-lk-cnt'), {textContent: item.count}));
      m.appendChild(lk);
    });
    g.appendChild(m); return g;
  }

  // [Sidebar consistency 2026-06-17] Mirror the dashboard sidebar EXACTLY (same items,
  // order, grouping, icons) so navigating between surfaces is seamless. The dashboard
  // CONSOLIDATED its 7 separate settings panes into ONE "Settings" entry (tabs:
  // Database/Payment/Email/Upload/Captcha/AI/Google Sheets) — so this surface must match:
  // Main is form-first (Dashboard renamed → "Form Management", moved to the bottom);
  // Configuration is just Languages + a single "Settings" that deep-links to the
  // dashboard's consolidated pane (#settings opens it on the default tab).
  cnt.appendChild(group(T('dash.nav_main','Main'), [
    {title:T('dash.nav_form_builder','Form Builder'), url:URLS.builder(), icon:'file'},
    {title:T('dash.nav_submissions','Submissions'), url:URLS.submissions(), icon:'inbox', count: countSubs, active:true, navKey:'submissions'},
    {title:T('dash.nav_my_inbox','My Inbox'), url:URLS.myinbox(), icon:'inbox'},
    {title:T('dash.nav_form_management','Form Management'), url:URLS.dashboard(), icon:'dashboard'},
  ]));
  cnt.appendChild(div('mf-sb-sep'));
  cnt.appendChild(group(T('dash.nav_config','Configuration'), [
    {title:T('dash.nav_languages','Languages'), url:URLS.languages(), icon:'panel'},
    {title:T('dash.nav_settings','Settings'), url:URLS.dashboard() + '#settings', icon:'gear'},
  ]));
  sb.appendChild(cnt);

  const ft = div('mf-sb-ft');
  const uw = div('mf-sb-uw');
  const ub = div('mf-sb-ub');
  const av = div('mf-sb-av', 'A');
  const ui = div('mf-sb-ui'); ui.innerHTML = '<span class="mf-sb-uname">Admin</span><span class="mf-sb-urole">Administrator</span>';
  const ch = span('mf-sb-ch'); ch.innerHTML = ic('chevD', 14);
  mk(ub, av, ui, ch);
  const dd = div('mf-sb-dd'); dd.innerHTML = `<a class="mf-sb-dd-item mf-sb-dd-danger" href="${URLS.logout()}">${ic('logout',14)} Log out</a>`;
  mk(uw, ub, dd); ft.appendChild(uw); sb.appendChild(ft);
  ub.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('is-open'); });
  document.addEventListener('click', () => dd.classList.remove('is-open'));
  return sb;
}

function buildHeader(sb: HTMLElement): HTMLElement {
  const hd = document.createElement('header'); hd.className = 'mf-hd';
  const tog = btn('mf-sb-tog', ic('panel', 16), () => {
    const s = sb.getAttribute('data-state');
    sb.setAttribute('data-state', s === 'expanded' ? 'collapsed' : 'expanded');
  });
  const sep = div('mf-hd-sep');
  const bc = document.createElement('nav'); bc.className = 'mf-bc';
  bc.innerHTML = '<ol class="mf-bc-list"><li class="mf-bc-item"><a class="mf-bc-link" href="'+URLS.dashboard()+'">'+T('dash.nav_dashboard','Dashboard')+'</a></li><li class="mf-bc-sep">/</li><li class="mf-bc-page">'+T('dash.nav_submissions','Submissions')+'</li></ol>';
  const sp = div('mf-flex1');
  const ac = div('mf-hd-ac');
  // [Sidebar/header consistency 2026-06-11] Close button mirrors the dashboard header so the
  // Submissions surface can be exited the same way (returns to the host page / dashboard).
  const closeHref = (() => { try { return String(getPlatformHostConfig().returnUrl || '').trim() || URLS.dashboard(); } catch { return URLS.dashboard(); } })();
  const closeBtn = a('mf-btn mf-btn-ghost mf-btn-sm', closeHref, '') as HTMLAnchorElement;
  bindSkinSafeHashLink(closeBtn, closeHref);
  closeBtn.innerHTML = `${ic('close',14)} <span class="mf-btn-lbl">${T('dash.close','Close')}</span>`;
  const rbBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('refresh',14)} <span class="mf-btn-lbl">${T('dash.refresh','Refresh')}</span>`, () => loadSubmissions());
  const gsBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('googleSheet',14)} <span class="mf-btn-lbl">${T('subs.connect_gsheet', 'Connect Google Sheet')}</span>`, () => openGoogleSheetConnectModal());
  gsBtn.title = 'Auto-create a workflow that pushes new submissions to Google Sheets';
  const reportBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('barChart',14)} <span class="mf-btn-lbl">${T('subs.reports', 'Reports')}</span>`, () => openReportDialog());
  const csvBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('dl',14)} <span class="mf-btn-lbl">${T('subs.export','Export')}</span>`, () => exportClientCsv());
  mk(ac, closeBtn, rbBtn, gsBtn, reportBtn, csvBtn);
  mk(hd, tog, sep, bc, sp, ac);
  return hd;
}

// ── Main render ───────────────────────────────────────────────
function render(): void {
  const mountEl = _embedded ? _container : (_container as HTMLElement);

  // [B162] Forms-overview landing — mount ONCE; repeated renders in overview mode are no-ops
  // (the overview owns its own data + internal re-renders), so we never wipe/refetch it here.
  if (_viewMode === 'overview' && !_loadError) {
    if (!mountEl.querySelector('.mf-subs-overview-host')) {
      clear(mountEl);
      renderOverview(mountEl);
      updateHostChrome();
    }
    return;
  }

  clear(mountEl);

  if (_loadError) {
    mountEl.appendChild(h('div', { class: 'mf-sub-error', style: 'margin:1.5rem;padding:1rem;background:#fef2f2;border:1px solid #fecaca;border-radius:0.625rem;color:#dc2626;font-size:0.875rem;' },
      h('strong', null, 'Unable to load submissions.'), h('div', { style: 'margin-top:6px' }, _loadError)
    ));
    return;
  }

  const state = getSubsState();
  syncActiveColumns(state);

  // [Count consistency 2026-06-11] The sidebar is built once BEFORE submissions load, so its
  // Submissions badge captured 0. Keep it in sync with the loaded total on every render so it
  // matches the "Total N" stat + the dashboard's badge.
  try { const cntEl = document.querySelector('[data-mf-nav="submissions"] .mf-sb-lk-cnt'); if (cntEl) cntEl.textContent = String(state.totalCount || 0); } catch { /* non-critical */ }

  // [B162] Back to the forms-overview landing (this list is a drill-in)
  mountEl.appendChild(buildBackBar());

  // Stats cards
  mountEl.appendChild(buildStats(state));

  // Main card
  const card = div('mf-card mf-subs-card');
  const cardHd = div('mf-card-hd mf-subs-card-hd');

  // Card header top row
  const cardHdTop = div('mf-subs-hd-top');
  const cardTitle = span('mf-card-ttl', T('subs.all_submissions', 'All Submissions'));

  // Filters row
  const filtersRow = div('mf-subs-filters');
  const searchWrap = div('mf-subs-search-wrap');
  const searchIcon = span('mf-subs-search-icon'); searchIcon.innerHTML = ic('search', 14);
  const searchInp = document.createElement('input') as HTMLInputElement;
  searchInp.type = 'text'; searchInp.className = 'mf-input mf-subs-search'; searchInp.placeholder = T('subs.search_ph', 'Search submissions…'); searchInp.value = state.filters.search;
  searchInp.style.paddingLeft = '2.5rem';
  searchInp.style.textIndent = '0';
  searchIcon.style.left = '0.75rem';
  mk(searchWrap, searchIcon, searchInp);

  const selWrap = div('mf-subs-sel-group');
  const statusSel = buildStatusSelect(state.filters.status) as HTMLSelectElement;
  // [MockParity v20260610-B122] Live filtering like the mock — no Filter/Clear
  // buttons. Status applies on change; search debounces (below); the form select
  // switches the active form. Resetting = pick "All Status" / clear the search.
  statusSel.addEventListener('change', () => { setFilters({ status: statusSel.value }); loadSubmissions(); });
  const formSel = buildFormSelect(state);
  mk(selWrap, statusSel, formSel);

  mk(filtersRow, searchWrap, selWrap);
  mk(cardHdTop, cardTitle, filtersRow);
  cardHd.appendChild(cardHdTop);
  cardHd.appendChild(buildManageToolbar(state));
  if (_manageOpen) cardHd.appendChild(buildManagePanel(state));
  card.appendChild(cardHd);

  // Bulk action bar
  if (state.selected.size > 0) card.appendChild(buildBulkBar(state.selected.size));

  // Table area
  const tableWrap = div('mf-subs-table-wrap');
  if (_loading) {
    tableWrap.innerHTML = `<div class="mf-subs-loading">${ic('refresh',16)} Loading submissions…</div>`;
  } else {
    tableWrap.appendChild(buildTable(state));
  }
  card.appendChild(tableWrap);

  // Pagination
  card.appendChild(buildPagination(state));
  mountEl.appendChild(card);

  updateHostChrome();

  searchInp.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); setFilters({ search: searchInp.value }); loadSubmissions(); }
  });
  searchInp.addEventListener('input', () => {
    if (_searchTimer) window.clearTimeout(_searchTimer);
    _searchTimer = window.setTimeout(() => {
      setFilters({ search: searchInp.value });
      loadSubmissions();
    }, 350);
  });
}

// ── Date-range + Manage Columns toolbar (mock parity) ─────────
let _manageTab: ColGroup = 'response';

function buildManageToolbar(state: ReturnType<typeof getSubsState>): HTMLElement {
  const row = div('mf-subs-manage-toolbar');

  // Date-range filter — native <select> styled like the mock's shadcn Select.
  const dateWrap = div('mf-subs-daterange');
  const dIc = span('mf-subs-daterange-ic'); dIc.innerHTML = ic('calendarDays', 16);
  const sel = document.createElement('select');
  sel.className = 'mf-subs-daterange-sel';
  DATE_RANGES.forEach((r) => {
    const o = document.createElement('option');
    o.value = r.value; o.textContent = T('subs.range_' + r.value, r.label); if (r.value === _dateRange) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => { _dateRange = sel.value; render(); });
  mk(dateWrap, dIc, sel);

  const manageBtn = btn(
    'mf-btn mf-btn-sm mf-subs-manage-btn ' + (_manageOpen ? 'mf-btn-secondary' : 'mf-btn-outline'),
    `${ic('columns3', 16)} <span>${T('subs.manage_columns', 'Manage Columns')}</span> ${ic('chevronsUpDown', 14)}`,
    () => { _manageOpen = !_manageOpen; render(); },
  );
  manageBtn.setAttribute('aria-expanded', String(_manageOpen));

  const count = span('mf-subs-cols-count', T('subs.columns_shown', '{n} columns shown', { n: _columnDefs.length }));

  mk(row, dateWrap, manageBtn, count);
  return row;
}

function buildManagePanel(state: ReturnType<typeof getSubsState>): HTMLElement {
  const panel = div('mf-subs-manage-panel');

  const hd = div('mf-subs-manage-panel-hd');
  hd.appendChild(Object.assign(document.createElement('p'), {
    className: 'mf-subs-manage-hint',
    textContent: T('subs.manage_hint', 'Drag fields to add new columns to the table below, or click to add.'),
  }));
  const closeB = btn('mf-ic-btn mf-subs-manage-close', ic('close', 16), () => { _manageOpen = false; render(); });
  closeB.setAttribute('aria-label', T('subs.manage_close', 'Close manage columns'));
  hd.appendChild(closeB);
  panel.appendChild(hd);

  const tabs = div('mf-subs-tabs');
  (['response', 'data'] as ColGroup[]).forEach((g) => {
    const t = btn('mf-subs-tab' + (_manageTab === g ? ' is-active' : ''),
      g === 'response' ? T('subs.response_fields', 'Response Fields') : T('subs.data_fields', 'Data Fields'),
      () => { _manageTab = g; render(); });
    tabs.appendChild(t);
  });
  panel.appendChild(tabs);

  const avail = availableColumns(state).filter((c) => c.group === _manageTab);
  const body = div('mf-subs-chips');
  if (!avail.length) {
    body.appendChild(Object.assign(document.createElement('p'), {
      className: 'mf-subs-chips-empty',
      textContent: _manageTab === 'response' && state.config.formId <= 0
        ? 'Open a single form to see its response fields, or all fields are already added.'
        : 'No fields available — all added to the table.',
    }));
  } else {
    avail.forEach((field) => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'mf-subs-chip'; chip.draggable = true;
      chip.title = field.label;
      chip.innerHTML = `<span class="mf-subs-chip-grip">${ic('gripVertical', 14)}</span>`;
      chip.appendChild(Object.assign(span('mf-subs-chip-lbl'), { textContent: field.label }));
      chip.insertAdjacentHTML('beforeend', `<span class="mf-subs-chip-plus">${ic('plus', 14)}</span>`);
      chip.addEventListener('click', () => addColumn(field.key));
      chip.addEventListener('dragstart', (e) => {
        (e.dataTransfer as DataTransfer).setData('text/field-key', field.key);
        (e.dataTransfer as DataTransfer).effectAllowed = 'copy';
      });
      body.appendChild(chip);
    });
  }
  panel.appendChild(body);
  return panel;
}

// ── Stats cards ───────────────────────────────────────────────
function buildStats(state: ReturnType<typeof getSubsState>): HTMLElement {
  const total = state.totalCount;
  const subs = state.submissions;
  // [SubsFix 2026-06-12] "New" = Submitted OR any unprocessed row whose status is
  // empty/unrecognised (DB null) — matches the blue "New" badge in statusBadge().
  // Without this the KPI read "New 0" while every row showed an Unknown→New pill.
  const isNewStatus = (st: string) => st === 'Submitted' || !['Read', 'Starred', 'Archived'].includes(st || '');
  const newCount = subs.filter(s => !s.isSpam && isNewStatus(s.status)).length;
  const processedCount = subs.filter(s => s.status === 'Read').length;
  const starredCount = subs.filter(s => s.status === 'Starred').length;

  const bar = div('mf-stats-pillbar');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px;align-items:center';
  const items = [
    { label: T('subs.stat_total', 'Total'), value: String(total), iconKey: 'inboxIcon', color: '#475569' },
    { label: T('subs.stat_new', 'New'), value: String(newCount), iconKey: 'alertCircle', color: '#2563eb' },
    { label: T('subs.stat_processed', 'Processed'), value: String(processedCount), iconKey: 'fileCheck', color: '#16a34a' },
    { label: T('subs.stat_pending', 'Pending'), value: String(starredCount), iconKey: 'clock', color: '#d97706' },
  ];
  items.forEach((it, i) => {
    const pill = div('mf-stats-pill');
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:13px;color:#0f172a;line-height:1.2'
      + (i === 0 ? '' : ';border-left:1px solid #e2e8f0;padding-left:14px;margin-left:2px');
    pill.innerHTML = '<span style="color:' + it.color + ';display:inline-flex">' + ic(it.iconKey, 14) + '</span>'
      + '<span style="color:#64748b;font-size:12px">' + it.label + '</span>'
      + '<strong style="color:' + it.color + ';font-weight:700">' + it.value + '</strong>';
    bar.appendChild(pill);
  });
  return bar;
}

// ── Status badge ──────────────────────────────────────────────
function statusBadge(status: string, isSpam?: boolean): HTMLElement {
  const b = span('mf-badge');
  if (isSpam) {
    b.classList.add('mf-badge-red');
    b.innerHTML = ic('xCircle', 12) + ' ' + T('subs.status_spam', 'Spam');
    return b;
  }
  switch (status) {
    case 'Submitted': b.classList.add('mf-badge-blue'); b.innerHTML = ic('alertCircle',12) + ' ' + T('subs.status_new', 'New'); break;
    case 'Read':      b.classList.add('mf-badge-green'); b.innerHTML = ic('checkCircle',12) + ' ' + T('subs.status_processed', 'Processed'); break;
    case 'Starred':   b.classList.add('mf-badge-amber'); b.innerHTML = ic('star',12) + ' ' + T('subs.status_starred', 'Starred'); break;
    case 'Archived':  b.classList.add('mf-badge-gray'); b.innerHTML = ic('archiveIcon',12) + ' ' + T('subs.status_archived', 'Archived'); break;
    // [SubsFix 2026-06-12] A freshly-submitted row carries an empty/unrecognised
    // status (DB null) — that is a NEW submission, not "Unknown". Render it as a
    // blue "New" badge (matches statusLabel()'s default and the redesign mock),
    // so the table never shows a meaningless grey "Unknown" pill.
    default:          b.classList.add('mf-badge-blue'); b.innerHTML = ic('alertCircle',12) + ' ' + T('subs.status_new', 'New');
  }
  return b;
}

// ── Draggable Columns Table ───────────────────────────────────
function applyDateRange(subs: Submission[]): Submission[] {
  if (_dateRange === 'all') return subs;
  const now = new Date();
  return subs.filter((s) => {
    const d = new Date(s.submittedOnUtc);
    if (isNaN(d.getTime())) return true;
    const diffDays = (now.getTime() - d.getTime()) / 86400000;
    if (_dateRange === 'today') return diffDays < 1;
    if (_dateRange === '7d') return diffDays <= 7;
    if (_dateRange === '30d') return diffDays <= 30;
    if (_dateRange === 'year') return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function buildTable(state: ReturnType<typeof getSubsState>): HTMLElement {
  const isAllForms = state.config.formId <= 0;
  const subs = applyDateRange(state.submissions);   // [mock] client-side date-range filter
  const sorted = [...subs].sort(compareSubmissions);

  const table = document.createElement('table'); table.className = 'mf-t mf-subs-t';
  // [ColumnResize v20260610-B122] Fixed layout so explicit column widths are
  // honored (and long values truncate instead of overlapping the next column).
  table.style.tableLayout = 'fixed';
  // [TableFill 2026-06-16] Span the full card width so few columns don't leave a
  // dead band on the right — the flexible content column(s) below absorb the slack.
  table.style.width = '100%';
  // Drop a Manage-Columns field chip anywhere on the table to add it as a column.
  table.addEventListener('dragover', (e) => {
    if (Array.from((e.dataTransfer as DataTransfer).types || []).indexOf('text/field-key') >= 0) {
      e.preventDefault(); table.classList.add('mf-subs-t-droptarget');
    }
  });
  table.addEventListener('dragleave', () => table.classList.remove('mf-subs-t-droptarget'));
  table.addEventListener('drop', (e) => {
    const key = (e.dataTransfer as DataTransfer).getData('text/field-key');
    table.classList.remove('mf-subs-t-droptarget');
    if (key) { e.preventDefault(); addColumn(key); }
  });
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');

  // Checkbox th — width comes from the .mf-th-check class (44px) so the header
  // and body (.mf-td-check) checkbox columns line up. [SubsFix 2026-06-12: the
  // inline 40px here disagreed with the body cell, drifting the column.]
  const thCheck = document.createElement('th'); thCheck.className = 'mf-th-check';
  const chkAll = document.createElement('input') as HTMLInputElement;
  chkAll.type = 'checkbox'; chkAll.className = 'mf-checkbox';
  chkAll.checked = subs.length > 0 && state.selected.size === subs.length;
  chkAll.addEventListener('change', () => {
    if (chkAll.checked) selectAll(subs.map(s => s.submissionId));
    else clearSelection();
    syncSelectionUi(getSubsState());   // [Perf #9] incremental, not full render
  });
  thCheck.appendChild(chkAll); hrow.appendChild(thCheck);

  // Dynamic columns
  _columnDefs.forEach((col) => {
    const th = document.createElement('th');
    th.className = 'mf-th-sortable' + (col.removable ? ' mf-th-removable' : '');
    th.draggable = true;
    th.dataset.colKey = col.key;
    // [TableFill 2026-06-16] Content columns (Submitted By + response fields) stay
    // flexible (no explicit width unless the user resized) so they absorb the slack
    // and the table fills the card; id/date/status/form keep their fixed widths.
    const isFlexCol = col.key === 'name' || col.group === 'response';
    if (col.width) th.style.width = col.width + 'px';
    else if (!isFlexCol) th.style.width = defaultColWidth(col) + 'px';
    const isActive = _sortCol === col.key;
    const iconKey = isActive ? (_sortDir === 'asc' ? 'sortAsc' : 'sortDesc') : 'sortNone';
    const dragSpan = span('mf-th-drag'); dragSpan.innerHTML = ic('gripVertical', 12);
    const lblSpan = span('mf-th-label'); lblSpan.textContent = col.group === 'data' ? T('subs.col_' + col.key, col.label) : col.label;  // data cols translated; response = user field labels
    th.appendChild(dragSpan); th.appendChild(lblSpan);
    if (col.sortable) { const s = span('mf-sort-ic'); s.innerHTML = ic(iconKey, 10); th.appendChild(s); }
    if (col.removable) {
      const rm = btn('mf-th-remove', ic('close', 11), (e) => { e.stopPropagation(); removeColumn(col.key); });
      rm.title = 'Remove column'; rm.tabIndex = -1; rm.draggable = false;
      th.appendChild(rm);
    }
    if (isActive) th.classList.add('is-active');
    if (col.sortable) {
      th.addEventListener('click', () => {
        if (_sortCol === col.key) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        else { _sortCol = col.key; _sortDir = 'asc'; }
        render();
      });
    }
    // Drag handlers
    th.addEventListener('dragstart', (e) => {
      th.classList.add('is-dragging');
      (e.dataTransfer as DataTransfer).effectAllowed = 'move';
      (e.dataTransfer as DataTransfer).setData('text/plain', col.key);
    });
    th.addEventListener('dragend', () => {
      th.classList.remove('is-dragging');
      document.querySelectorAll('.mf-th-sortable').forEach(el => el.classList.remove('is-drag-over'));
    });
    th.addEventListener('dragover', (e) => {
      e.preventDefault();
      th.classList.add('is-drag-over');
    });
    th.addEventListener('dragleave', () => {
      th.classList.remove('is-drag-over');
    });
    th.addEventListener('drop', (e) => {
      e.preventDefault();
      th.classList.remove('is-drag-over');
      const sourceKey = (e.dataTransfer as DataTransfer).getData('text/plain');
      if (!sourceKey || sourceKey === col.key) return;
      const fromIdx = _columnDefs.findIndex(c => c.key === sourceKey);
      const toIdx = _columnDefs.findIndex(c => c.key === col.key);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [..._columnDefs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      _columnDefs = next;
      setStoredColumns(_columnDefs);
      render();
    });
    // Resize handle — drag the right edge to widen/narrow this column. Grows the
    // table width by the same delta so neighbours keep their widths (no overlap).
    const rh = document.createElement('div');
    rh.className = 'mf-th-resize';
    rh.draggable = false;
    rh.addEventListener('pointerdown', (ev: PointerEvent) => {
      ev.preventDefault(); ev.stopPropagation();
      const prevDraggable = th.draggable; th.draggable = false;
      const startX = ev.clientX;
      const startW = th.getBoundingClientRect().width;
      const startTableW = table.getBoundingClientRect().width;
      try { rh.setPointerCapture(ev.pointerId); } catch { /* older browsers */ }
      rh.classList.add('is-resizing'); document.body.style.cursor = 'col-resize';
      const onMove = (m: PointerEvent) => {
        const w = Math.max(60, Math.round(startW + (m.clientX - startX)));
        col.width = w; th.style.width = w + 'px';
        table.style.width = Math.round(startTableW + (w - startW)) + 'px';
      };
      const onUp = () => {
        rh.classList.remove('is-resizing'); document.body.style.cursor = '';
        rh.removeEventListener('pointermove', onMove);
        rh.removeEventListener('pointerup', onUp);
        th.draggable = prevDraggable;
        setStoredColumns(_columnDefs);   // persist the new width
      };
      rh.addEventListener('pointermove', onMove);
      rh.addEventListener('pointerup', onUp);
    });
    th.appendChild(rh);
    hrow.appendChild(th);
  });

  // Actions th
  const thAct = document.createElement('th'); thAct.className = 'mf-th-act'; thAct.style.width = '56px'; hrow.appendChild(thAct);
  thead.appendChild(hrow); table.appendChild(thead);
  // Deterministic total as the MIN width so the fixed layout honours each column and
  // the wrap scrolls horizontally when columns exceed the card; but keep width:100% so
  // that when there are FEW columns (total < card) the flexible columns (name/response)
  // absorb the slack instead of leaving a dead band on the right. [FewColsFill 2026-06-19]
  const _totalColPx = 40 + 56 + _columnDefs.reduce((a, c) => a + (c.width || defaultColWidth(c)), 0);
  table.style.minWidth = _totalColPx + 'px';
  table.style.width = '100%';

  const tbody = document.createElement('tbody');
  if (!sorted.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = _columnDefs.length + 2;
    td.className = 'mf-subs-empty-cell';
    td.innerHTML = `<div class="mf-subs-empty">${ic('inboxIcon',28)}<p>${T('subs.no_submissions', 'No submissions found')}</p></div>`;
    tr.appendChild(td); tbody.appendChild(tr);
  } else {
    sorted.forEach(sub => tbody.appendChild(buildRow(sub, isAllForms)));
  }
  table.appendChild(tbody);
  return table;
}

function buildRow(sub: Submission, isAllForms: boolean): HTMLTableRowElement {
  const data = rowData(sub);   // [Perf #9] parsed once + cached on the row
  const state = getSubsState();
  const isSelected = state.selected.has(sub.submissionId);

  const tr = document.createElement('tr');
  tr.className = `mf-tr${sub.status === 'Submitted' ? ' mf-tr-unread' : ''}${isSelected ? ' mf-tr-selected' : ''}`;
  tr.dataset.submissionId = String(sub.submissionId);   // [Perf #9] lets syncSelectionUi target this row without a full render
  if (sub.isSpam) tr.style.opacity = '0.55';

  // Checkbox — .mf-td-check mirrors the header .mf-th-check width/padding so the
  // row checkboxes sit directly under the select-all checkbox (no column drift).
  const tdCheck = document.createElement('td'); tdCheck.className = 'mf-td-check';
  const chk = document.createElement('input') as HTMLInputElement;
  chk.type = 'checkbox'; chk.className = 'mf-checkbox'; chk.checked = isSelected;
  chk.addEventListener('change', () => { toggleSelect(sub.submissionId); syncSelectionUi(getSubsState()); });  // [Perf #9] incremental, not full render
  tdCheck.appendChild(chk); tr.appendChild(tdCheck);

  // Dynamic cells
  _columnDefs.forEach((col) => {
    const td = document.createElement('td');
    td.appendChild(renderCell(sub, data, col.key, isAllForms));
    // Cells truncate with ellipsis (fixed layout) — expose the full value on hover.
    const full = (td.textContent || '').trim();
    if (full) td.title = full;
    tr.appendChild(td);
  });

  // Actions
  const tdAct = document.createElement('td'); tdAct.className = 'mf-td-act';
  const actBar = div('mf-subs-act-bar');
  actBar.style.cssText = 'display:inline-flex;gap:4px;align-items:center';

  const viewBtn = btn('mf-ic-btn', ic('eye', 14), (e) => { e.stopPropagation(); openDetailSheet(sub); });
  viewBtn.title = 'View details';
  const delBtn = btn('mf-ic-btn mf-ic-btn-danger', ic('trash', 14), (e) => {
    e.stopPropagation();
    if (confirm('Delete this submission? This cannot be undone.')) deleteSubmission(sub.submissionId);
  });
  delBtn.title = 'Delete';
  delBtn.style.cssText = (delBtn.style.cssText || '') + ';color:#dc2626';

  mk(actBar, viewBtn, delBtn);
  tdAct.appendChild(actBar); tr.appendChild(tdAct);

  tr.style.cursor = 'pointer';
  tr.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input,button,a,.mf-subs-act-bar,.mf-td-act')) return;
    openDetailSheet(sub);
  });

  return tr;
}

function renderCell(sub: Submission, data: Record<string, unknown>, key: string, isAllForms: boolean): HTMLElement {
  switch (key) {
    case 'id': {
      const el = span('mf-td-mono');
      el.textContent = `#${sub.submissionId}`;
      return el;
    }
    case 'form': {
      const label = sub.formTitle || `Form #${sub.formId}`;
      const el = btn('mf-td-formlink', label, (e) => { e.stopPropagation(); void openReportDialog(sub.formId, label); });
      el.title = `View report for ${label}`;
      el.style.cssText = 'background:none;border:0;padding:0;font:inherit;color:#4f46e5;font-weight:600;cursor:pointer;text-align:left';
      return el;
    }
    case 'name': {
      const wrap = div();
      const nameVal = String(data['name'] || data['full_name'] || data['first_name'] || data['fullName'] || '—');
      const emailVal = String(data['email'] || data['work_email'] || '');
      wrap.innerHTML = `<div class="mf-td-name">${nameVal}</div>${emailVal ? `<div class="mf-td-email">${emailVal}</div>` : ''}`;
      return wrap;
    }
    case 'date': {
      const el = span('mf-td-muted mf-td-date');
      el.textContent = formatDate(sub.submittedOnUtc);
      return el;
    }
    case 'status': {
      return statusBadge(sub.status, sub.isSpam);
    }
    default: {
      // Context-aware response-field column: read the REAL submission value.
      if (key.indexOf('f:') === 0) {
        const raw = (data as Record<string, unknown>)[key.slice(2)];
        const txt = (raw == null || raw === '') ? '—' : String(unwrapValue(raw));
        const el = span('mf-td-muted mf-td-field');
        el.textContent = txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
        el.title = txt;
        return el;
      }
      const el = span();
      el.textContent = '—';
      return el;
    }
  }
}

// ── Sorting ───────────────────────────────────────────────────
function compareSubmissions(a: Submission, b: Submission): number {
  let va: unknown; let vb: unknown;
  if (_sortCol === 'date') { va = a.submittedOnUtc; vb = b.submittedOnUtc; }
  else if (_sortCol === 'id') { va = a.submissionId; vb = b.submissionId; }
  else if (_sortCol === 'form') { va = a.formTitle || `Form #${a.formId}`; vb = b.formTitle || `Form #${b.formId}`; }
  else {
    const dk = _sortCol.indexOf('f:') === 0 ? _sortCol.slice(2) : _sortCol;
    va = unwrapValue((rowData(a) as any)[dk]) ?? '';   // [Perf #9] cached parse
    vb = unwrapValue((rowData(b) as any)[dk]) ?? '';
  }
  const cmp = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
  return _sortDir === 'asc' ? cmp : -cmp;
}
function unwrapValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.join(', ');
  if (v && typeof v === 'object') {
    const o = v as any;
    return o.displayValue ?? o.value ?? String(v);
  }
  return v ?? '';
}

// ── Bulk action bar ───────────────────────────────────────────
function buildBulkBar(count: number): HTMLElement {
  const bar = div('mf-subs-bulk');
  const info = span('mf-subs-bulk-info', `${count} selected`);
  const markBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('check',13)} Mark Processed`, (e) => { e.preventDefault(); bulkUpdateStatus('Read'); });
  const archBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('archive',13)} Archive`, (e) => { e.preventDefault(); bulkUpdateStatus('Archived'); });
  // [SendToInbox v20260625] Route the selected submission(s) to a chosen user's My Inbox.
  const inboxBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('send',13)} <span class="mf-btn-lbl">${T('subs.send_to_inbox','Send to Inbox')}</span>`, (e) => {
    e.preventDefault();
    openSendToInboxModal(Array.from(getSubsState().selected));
  });
  const delBtn = btn('mf-btn mf-btn-outline mf-btn-sm mf-btn-danger-outline', `${ic('trash',13)} Delete`, (e) => {
    e.preventDefault();
    if (confirm(`Delete ${count} submissions? This cannot be undone.`)) bulkDelete();
  });
  mk(bar, info, markBtn, archBtn, inboxBtn, delBtn);
  return bar;
}

// [Perf #9 2026-06-19] Incremental selection UI: on a checkbox / select-all
// toggle, mutate ONLY the affected <tr> class + checkbox and refresh the bulk bar
// in place — instead of a full table render() (which re-parses + re-sorts +
// rebuilds every <tr>, O(rows) work for a single click). The visible result is
// identical to what render() would have produced for the selection change.
function syncSelectionUi(state: ReturnType<typeof getSubsState>): void {
  const card = _container.querySelector('.mf-subs-card');
  if (!card) { render(); return; }   // structure missing → fall back to full render
  const selected = state.selected;

  // Per-row class + checkbox
  let visibleCount = 0, selectedVisible = 0;
  card.querySelectorAll('tr.mf-tr[data-submission-id]').forEach((trEl) => {
    const tr = trEl as HTMLTableRowElement;
    const id = Number(tr.dataset.submissionId);
    const isSel = selected.has(id);
    visibleCount++; if (isSel) selectedVisible++;
    tr.classList.toggle('mf-tr-selected', isSel);
    const cb = tr.querySelector('.mf-td-check .mf-checkbox') as HTMLInputElement | null;
    if (cb) cb.checked = isSel;
  });

  // Select-all header checkbox
  const chkAll = card.querySelector('.mf-th-check .mf-checkbox') as HTMLInputElement | null;
  if (chkAll) chkAll.checked = visibleCount > 0 && selectedVisible === visibleCount;

  // Bulk action bar: show / hide / refresh count in place
  const existingBar = card.querySelector('.mf-subs-bulk') as HTMLElement | null;
  const count = selected.size;
  const cardHd = card.querySelector('.mf-card-hd');
  const tableWrap = card.querySelector('.mf-subs-table-wrap');
  if (count > 0) {
    const bar = buildBulkBar(count);
    if (existingBar) existingBar.replaceWith(bar);
    else if (tableWrap) card.insertBefore(bar, tableWrap);
    else if (cardHd && cardHd.nextSibling) card.insertBefore(bar, cardHd.nextSibling);
    else card.appendChild(bar);
  } else if (existingBar) {
    existingBar.remove();
  }
}

// ── Pagination ────────────────────────────────────────────────
function buildPagination(state: ReturnType<typeof getSubsState>): HTMLElement {
  const wrap = div('mf-subs-pagination');
  const totalPages = Math.max(1, Math.ceil(state.totalCount / state.pageSize));
  const start = state.totalCount === 0 ? 0 : (state.pageIndex * state.pageSize) + 1;
  const end = state.totalCount === 0 ? 0 : Math.min(state.totalCount, start + state.submissions.length - 1);
  const info = span('mf-subs-pag-info', T('subs.pag_info', 'Showing {start}-{end} of {total} submissions', { start: String(start), end: String(end), total: String(state.totalCount) }));
  wrap.appendChild(info);

  const nav = div('mf-subs-pag-nav');
  const prevBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('chevL',14)} ${T('form.previous','Previous')}`, (e) => {
    e.preventDefault(); if (state.pageIndex > 0) { setPage(state.pageIndex - 1); loadSubmissions(); }
  });
  if (state.pageIndex === 0) prevBtn.disabled = true;
  nav.appendChild(prevBtn);

  getVisiblePages(state.pageIndex, totalPages).forEach((pageNo) => {
    const pageBtn = btn(`mf-btn mf-btn-sm ${pageNo - 1 === state.pageIndex ? 'mf-btn-primary' : 'mf-btn-outline'}`, String(pageNo), (e) => {
      e.preventDefault();
      if (pageNo - 1 !== state.pageIndex) { setPage(pageNo - 1); loadSubmissions(); }
    });
    nav.appendChild(pageBtn);
  });

  const nextBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${T('form.next','Next')} ${ic('chevR',14)}`, (e) => {
    e.preventDefault(); if (state.pageIndex < totalPages - 1) { setPage(state.pageIndex + 1); loadSubmissions(); }
  });
  if (state.pageIndex >= totalPages - 1) nextBtn.disabled = true;
  nav.appendChild(nextBtn);
  wrap.appendChild(nav);
  return wrap;
}

function getVisiblePages(pageIndex: number, totalPages: number): number[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const current = pageIndex + 1;
  const start = Math.max(1, Math.min(current - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

// ── Filter controls ───────────────────────────────────────────
function buildStatusSelect(current: string): HTMLSelectElement {
  const sel = document.createElement('select') as HTMLSelectElement;
  sel.className = 'mf-input mf-subs-sel';
  const opts = [
    { v: '', l: T('subs.status_all', 'All Status') },
    { v: 'Submitted', l: T('subs.status_new', 'New') },
    { v: 'Read', l: T('subs.status_processed', 'Processed') },
    { v: 'Starred', l: T('subs.status_starred', 'Starred') },
    { v: 'Archived', l: T('subs.status_archived', 'Archived') },
  ];
  opts.forEach(o => {
    const opt = document.createElement('option') as HTMLOptionElement;
    opt.value = o.v; opt.textContent = o.l;
    if (o.v === current) opt.selected = true;
    sel.appendChild(opt);
  });
  return sel;
}

function buildFormSelect(state: ReturnType<typeof getSubsState>): HTMLSelectElement {
  const forms = state.forms || [];
  const sel = document.createElement('select') as HTMLSelectElement;
  sel.className = 'mf-input mf-subs-sel mf-subs-form-sel';
  const allOpt = document.createElement('option') as HTMLOptionElement;
  allOpt.value = '0'; allOpt.textContent = T('subs.all_forms', 'All forms');
  if (state.config.formId <= 0) allOpt.selected = true;
  sel.appendChild(allOpt);
  forms.forEach(f => {
    const opt = document.createElement('option') as HTMLOptionElement;
    opt.value = String(f.formId);
    opt.textContent = f.title || `Form #${f.formId}`;
    if (f.formId === state.config.formId) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    const nextId = parseInt(sel.value || '0', 10);
    if (nextId !== state.config.formId) switchForm(nextId).catch(err => handleLoadError(err, 'Failed to switch form'));
  });
  return sel;
}

// ── Detail Sheet (slide-in panel) ─────────────────────────────
function openDetailSheet(sub: Submission): void {
  const existing = document.querySelector('.mf-sheet-overlay');
  existing?.remove();

  const overlay = div('mf-sheet-overlay');
  // The shell renders inside a high-stacking Oqtane panel; the CSS z-index:1000
  // paints the sheet BEHIND it. Force it above (matches the report modal).
  overlay.style.zIndex = '200030';
  const panel = div('mf-sheet-panel');

  // Header
  const head = div('mf-sheet-head');
  const title = div('mf-sheet-title', `Submission #${sub.submissionId}`);
  const actions = div('mf-sheet-head-actions');
  const expandBtn = btn('mf-sheet-fs', ic('maximize', 14), () => {
    panel.classList.toggle('is-expanded');
    expandBtn.innerHTML = panel.classList.contains('is-expanded') ? ic('minimize', 14) : ic('maximize', 14);
  });
  const closeBtn = btn('mf-sheet-close', ic('close', 14), () => overlay.remove());
  mk(actions, expandBtn, closeBtn);
  mk(head, title, actions);

  // Body: use submission-detail-shell for tabs (Data / Form / Flow / Activity)
  const body = div('mf-sheet-body');

  // Load detail via API
  viewSubmissionDetail(sub.submissionId, body, overlay);

  panel.appendChild(head);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => panel.classList.add('is-visible'));
}

function sheetCsrfHeaders(): Record<string, string> {
  try {
    const mid = getSubsState().config.moduleId || 0;
    const sf = (window as any).jQuery?.ServicesFramework?.(mid);
    const t = sf?.getAntiForgeryValue?.();
    if (t) return { RequestVerificationToken: String(t) };
  } catch { /* not on DNN */ }
  const inp = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
  return inp && inp.value ? { RequestVerificationToken: inp.value } : {};
}

// Role-aware BPMN action controller for the detail sheet — POSTs to
// Workflow/Tasks/{endpoint} so Approve/Reject/Claim/Forward fire from the new
// submissions surface (preserving the Workflow Action Center). [decision 2]
function buildSheetWorkflowController(id: number, body: HTMLElement, overlay: HTMLElement): any {
  const apiBase = getSubsState().config.apiBase || '/api/MegaForm/';
  return {
    onAction: async (req: any): Promise<{ ok: boolean; message?: string }> => {
      const endpoint = req.action === 'claim' ? 'Claim'
        : req.action === 'approve' ? 'Approve'
        : req.action === 'reject' ? 'Reject' : 'Forward';
      const payload: Record<string, unknown> = { taskId: req.taskId, comment: req.comment, data: req.data };
      if (req.action === 'forward') payload.targetUser = req.targetUser || '';
      try {
        const r = await fetch(apiBase + 'Workflow/Tasks/' + endpoint, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...sheetCsrfHeaders() },
          body: JSON.stringify(payload),
        });
        if (!r.ok) { let m = 'HTTP ' + r.status; try { const j = await r.json(); m = (j && (j.message || j.error)) || m; } catch { /* */ } return { ok: false, message: m }; }
        return { ok: true, message: 'Workflow action completed.' };
      } catch (e: any) { return { ok: false, message: String(e?.message || e || 'Workflow action failed.') }; }
    },
    onActionCompleted: async (): Promise<void> => {
      await viewSubmissionDetail(id, body, overlay); // re-render sheet with new state
      try { await loadSubmissions(); } catch { /* refresh list */ }
    },
  };
}

async function viewSubmissionDetail(id: number, body: HTMLElement, overlay: HTMLElement): Promise<void> {
  body.innerHTML = `<div class="mf-subs-loading">${ic('refresh',16)} Loading…</div>`;
  // [Re-applied 3b-C 2026-06-16 — LOST in the April revert] Clicking a submission
  // row now opens the SAME polished My-Inbox detail panel (avatar + FORM RESPONSES
  // rich 2-col render + Details/History/Workflow tabs + action bar) as the SINGLE
  // SOURCE OF TRUTH, instead of the old Data/Form/DB/Flow/Activity sheet. The host
  // (my-inbox/standalone-detail.ts mountTaskDetail) loads its own task+detail and
  // wires actions to the workflow API with the Forward-audit refetch. Falls back to
  // the legacy renderSubmissionDetailShell if the inbox host can't mount.
  try {
    const sub: any = typeof _adapter.api.getSubmissionDetail === 'function'
      ? await _adapter.api.getSubmissionDetail(id)
      : await _adapter.api.getSubmission(id);
    const st = getSubsState();
    const formId = Number(sub?.formId) || st.config.formId || 0;
    const formTitle = String(sub?.formTitle || st.config.formTitle || (formId ? `Form #${formId}` : 'Submission'));
    const apiRaw = String(st.config.apiBase || '/api/MegaForm/').replace(/\/+$/, '');
    const { mountTaskDetail } = await import('../my-inbox/standalone-detail');
    body.innerHTML = '';
    mountTaskDetail(body, {
      config: {
        moduleId: st.config.moduleId || 0,
        tabId: 0,
        apiBase: apiRaw + '/Workflow/',
        submissionsApiBase: apiRaw + '/',
        formId,
        initialTaskId: '',
      },
      submissionId: id,
      formId,
      formTitle,
      onChanged: () => { try { void loadSubmissions(); } catch { /* ignore */ } },
    });
  } catch (err) {
    // Fallback: the legacy Data/Form/DB/Flow/Activity sheet.
    try {
      const sub = typeof _adapter.api.getSubmissionDetail === 'function'
        ? await _adapter.api.getSubmissionDetail(id)
        : await _adapter.api.getSubmission(id);
      const { renderSubmissionDetailShell } = await import('./submission-detail-shell');
      const panel = body.closest('.mf-sheet-panel') as HTMLElement | null;
      const shell = renderSubmissionDetailShell({
        submission: sub,
        mode: 'embedded',
        initialTab: 'data',
        workflowActions: buildSheetWorkflowController(id, body, overlay),
        onTabChange: (tab) => {
          if (tab === 'flow' && panel && !panel.classList.contains('is-expanded')) {
            panel.classList.add('is-expanded');
            const fsBtn = panel.querySelector('.mf-sheet-fs') as HTMLElement | null;
            if (fsBtn) fsBtn.innerHTML = ic('minimize', 14);
          }
        },
      });
      body.innerHTML = '';
      body.appendChild(shell.root);
    } catch {
      body.innerHTML = '<div style="padding:2rem;color:#dc2626">Failed to load submission detail.</div>';
    }
  }
}

// ── Report Dialog (mock layout, REAL data) ────────────────────
const REPORT_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];

function reportEsc(s: any): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function reportDonut(segs: { label: string; value: number; color: string }[], total: number, size = 150): string {
  const r = 56, cx = size / 2, cy = size / 2, sw = 22, C = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.filter(s => s.value > 0).map(s => {
    const dash = (s.value / total) * C;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += dash; return el;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f7" stroke-width="${sw}"/>${arcs}` +
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="24" font-weight="800" fill="#0f172a">${total}</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="#94a3b8">responses</text></svg>`;
}
function reportHBars(items: { label: string; value: number; suffix?: string }[], max: number): string {
  return '<div style="display:flex;flex-direction:column;gap:8px">' + items.map((i, idx) => {
    const w = max > 0 ? Math.round((i.value / max) * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:10px;font-size:12px">` +
      `<div style="width:90px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${reportEsc(i.label)}">${reportEsc(i.label)}</div>` +
      `<div style="flex:1;background:#f1f5f9;border-radius:6px;height:16px;overflow:hidden"><div style="height:100%;width:${w}%;background:${REPORT_PALETTE[idx % REPORT_PALETTE.length]};border-radius:6px"></div></div>` +
      `<div style="width:54px;text-align:right;color:#0f172a;font-weight:600">${i.value}${i.suffix || ''}</div></div>`;
  }).join('') + '</div>';
}
function reportTimeBars(subs: { submittedOnUtc: string }[]): string {
  const days: Record<string, number> = {};
  let min = Infinity, max = -Infinity;
  subs.forEach(s => { const d = new Date(s.submittedOnUtc); if (isNaN(d.getTime())) return; const k = d.toISOString().slice(0, 10); days[k] = (days[k] || 0) + 1; min = Math.min(min, +new Date(k)); max = Math.max(max, +new Date(k)); });
  if (!isFinite(min)) return '<div style="color:#cbd5e1;font-size:12px;padding:12px">No dated submissions.</div>';
  const buckets: { k: string; c: number }[] = [];
  for (let t = min; t <= max; t += 86400000) { const k = new Date(t).toISOString().slice(0, 10); buckets.push({ k, c: days[k] || 0 }); }
  const list = buckets.length > 60 ? buckets.slice(-60) : buckets;
  const mx = arrMax(list.map(b => b.c), 1);
  const bars = list.map(b => {
    const h = b.c > 0 ? Math.max(4, Math.round((b.c / mx) * 100)) : 0;
    return `<div title="${b.k}: ${b.c}" style="flex:1 1 0;min-width:2px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center"><div style="width:80%;max-width:22px;height:${h}%;background:linear-gradient(180deg,#818cf8,#6366f1);border-radius:3px 3px 0 0"></div></div>`;
  }).join('');
  return `<div style="display:flex;align-items:flex-end;gap:2px;height:140px;border-bottom:1px solid #eef2f7">${bars}</div>` +
    `<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:6px"><span>${list[0].k}</span><span>peak ${mx}/day</span><span>${list[list.length - 1].k}</span></div>`;
}

async function openReportDialog(reportFormId?: number, reportFormName?: string): Promise<void> {
  document.querySelector('.mf-report-overlay')?.remove();
  const overlay = div('mf-report-overlay');
  overlay.style.zIndex = '200040';
  const card = div('mf-report-card');
  const state = getSubsState();
  const apiBase = state.config.apiBase || '/api/MegaForm/';
  const fid = reportFormId || state.config.formId || 0;
  const allForms = fid <= 0;
  const name = reportFormName || (allForms ? 'All Forms' : (state.config.formTitle || (state.forms || []).find(f => f.formId === fid)?.title || `Form #${fid}`));

  const head = div('mf-report-head');
  head.innerHTML = `<div><h3>${reportEsc(name)} — Report</h3><p>Performance analytics and submission insights</p></div>`;
  const exportBtn = btn('mf-btn mf-btn-outline mf-btn-sm', `${ic('dl', 13)} <span>Export</span>`, () => { try { window.print(); } catch {} });
  exportBtn.style.cssText = 'margin-right:36px';
  const closeBtn = btn('mf-report-close', ic('close', 14), () => overlay.remove());
  head.appendChild(exportBtn); head.appendChild(closeBtn);
  const body = div('mf-report-body');
  body.innerHTML = `<div class="mf-subs-loading" style="padding:40px;text-align:center;color:#64748b">${ic('refresh', 16)} Loading report…</div>`;
  card.appendChild(head); card.appendChild(body); overlay.appendChild(card); document.body.appendChild(overlay);

  try {
    // gather submissions (per form, or aggregate all forms) + schema for field completion
    const forms = allForms ? (state.forms || []).filter(f => f.formId > 0).slice(0, 50) : [{ formId: fid, title: name } as SubmissionFormOption];
    const fetchForm = async (id: number) => {
      const r = await fetch(apiBase + 'Submissions?formId=' + id + '&pageSize=2000', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return [] as any[];
      const j: any = await r.json();
      return (j.items || j.Items || []).map((it: any) => {
        let data: Record<string, any> = {}; const rawd = it.dataJson || it.DataJson; try { data = rawd ? JSON.parse(rawd) : {}; } catch { /* */ }
        return { submittedOnUtc: it.submittedOnUtc || it.SubmittedOnUtc, status: it.status || it.Status || '', data };
      });
    };
    const rows = (await Promise.all(forms.map(f => fetchForm(f.formId).catch(() => [])))).flat();

    // schema (single-form only — field completion needs one schema)
    let fields: { key: string; label: string; required: boolean }[] = [];
    if (!allForms) {
      try {
        const r = await fetch(apiBase + 'Form/Get?formId=' + fid, { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) { const d: any = await r.json(); let sc: any = {}; try { sc = JSON.parse(d.schemaJson || d.SchemaJson || '{}'); } catch { /* */ }
          const walk = (l: any[]) => (l || []).forEach((f: any) => { if (!f) return; if (f.type === 'Row' && Array.isArray(f.columns)) { f.columns.forEach((c: any) => walk(c?.fields || [])); return; } const k = String(f.key || '').trim(); if (!k || /Section|Html|Captcha|Hidden|Button/i.test(String(f.type || ''))) return; fields.push({ key: k, label: f.label || k, required: !!(f.required ?? f.validation?.required) }); });
          walk(sc.fields || []);
        }
      } catch { /* */ }
    }

    // ── compute ──
    const total = rows.length;
    const dates = rows.map(r => new Date(r.submittedOnUtc)).filter(d => !isNaN(d.getTime()));
    const minD = dates.length ? new Date(arrMin(dates.map(d => +d))) : null;
    const maxD = dates.length ? new Date(arrMax(dates.map(d => +d))) : null;
    const spanDays = minD && maxD ? Math.max(1, Math.round((+maxD - +minD) / 86400000) + 1) : 1;
    const last7 = rows.filter(r => +new Date(r.submittedOnUtc) >= Date.now() - 7 * 86400000).length;
    const basis = fields.filter(f => f.required).length ? fields.filter(f => f.required) : fields;
    const isEmpty = (v: any) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
    const completion = basis.length ? Math.round(rows.reduce((a, r) => a + basis.filter(f => !isEmpty(r.data[f.key])).length / basis.length, 0) / Math.max(1, total) * 100) : 0;

    const summary = [
      { v: String(total), l: 'Total Submissions', c: '#6366f1' },
      { v: String(last7), l: 'Last 7 Days', c: '#8b5cf6' },
      { v: (total / spanDays).toFixed(1), l: 'Avg / Day', c: '#22c55e' },
      { v: allForms ? '—' : completion + '%', l: 'Avg Completion', c: '#f59e0b' },
    ];

    // status breakdown
    const statusCounts: Record<string, number> = {};
    rows.forEach(r => { const s = r.status || 'unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
    const statusSegs = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: REPORT_PALETTE[i % REPORT_PALETTE.length] }));

    // field completion (single-form)
    // [Perf #9 2026-06-19] Single O(rows × shownFields) pass — was up to 8 separate
    // `rows.filter` scans of the whole row set. Identical per-field percentages.
    const fcFields = fields.slice(0, 8);
    const fcAnswered = new Array(fcFields.length).fill(0);
    for (const r of rows) {
      for (let i = 0; i < fcFields.length; i++) {
        if (!isEmpty(r.data[fcFields[i].key])) fcAnswered[i]++;
      }
    }
    const fieldRates = fcFields.map((f, i) => ({ label: f.label, value: total ? Math.round(fcAnswered[i] / total * 100) : 0, suffix: '%' }));

    // ── render mock layout ──
    body.innerHTML = '';
    const statsGrid = div('mf-report-stats');
    statsGrid.innerHTML = summary.map(s =>
      `<div class="mf-report-stat" style="border-left:3px solid ${s.c}"><div class="mf-report-stat-value">${reportEsc(s.v)}</div><div class="mf-report-stat-label">${reportEsc(s.l)}</div></div>`).join('');
    body.appendChild(statsGrid);

    // time chart + status donut row
    const row2 = div(); row2.style.cssText = 'display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-top:16px';
    const timeCard = div('mf-report-chart'); timeCard.innerHTML = `<h4>Submissions Over Time</h4>` + reportTimeBars(rows);
    const statusCard = div('mf-report-chart');
    statusCard.innerHTML = `<h4>Status Breakdown</h4><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">` +
      `<div style="flex:0 0 auto">${reportDonut(statusSegs, total)}</div>` +
      `<div style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:5px">` +
      statusSegs.map(s => `<div style="display:flex;align-items:center;gap:7px;font-size:12px"><span style="width:10px;height:10px;border-radius:3px;background:${s.color}"></span><span style="flex:1;color:#334155">${reportEsc(s.label)}</span><b style="color:#0f172a">${s.value}</b></div>`).join('') +
      `</div></div>`;
    row2.appendChild(timeCard); row2.appendChild(statusCard);
    body.appendChild(row2);

    // field completion
    if (fieldRates.length) {
      const fcCard = div('mf-report-chart'); fcCard.style.marginTop = '16px';
      fcCard.innerHTML = `<h4>Field Completion Rates</h4>`;
      const host = div(); host.innerHTML = reportHBars(fieldRates, 100); fcCard.appendChild(host);
      body.appendChild(fcCard);
    } else if (allForms) {
      const note = div(); note.style.cssText = 'margin-top:16px;font-size:12px;color:#94a3b8'; note.textContent = 'Field completion is available when a single form is selected.';
      body.appendChild(note);
    }
  } catch (err) {
    body.innerHTML = '<div style="padding:30px;text-align:center;color:#dc2626">Failed to build report.</div>';
  }
}

// ── API calls ─────────────────────────────────────────────────
async function ensureFormsLoaded(): Promise<void> {
  if (_formsLoaded) return;
  const state = getSubsState();
  const existingForms = state.forms || [];
  const hasSchemaData = existingForms.length > 0 && existingForms.every((f) => !!(f && f.schemaJson));
  if (hasSchemaData) {
    _formsLoaded = true;
    if (state.config.formId > 0) {
      const activeForm = existingForms.find(f => f.formId === state.config.formId);
      if (activeForm?.schemaJson) {
        try { setCurrentForm(activeForm.formId, JSON.parse(activeForm.schemaJson), activeForm.title || `Form #${activeForm.formId}`); } catch {}
      }
    }
    render();
    return;
  }
  let raw = await _adapter.api.listForms(state.config.moduleId || undefined);
  // [SiteWideForms v20260609-B103] The submissions root carries data-mf-site-id /
  // data-mf-module-id, but readContext reads data-module-id/-instance-id, so the
  // adapter ends up with moduleId=0 and no siteId → Form/List returns []. Fetch
  // site-wide forms directly using the siteId the host rendered on the root.
  if (!raw || raw.length === 0) {
    const siteId = Number.parseInt(String(_rootEl?.dataset.mfSiteId || _rootEl?.dataset.siteId || '0'), 10) || 0;
    if (siteId > 0) {
      try {
        const apiBase = state.config.apiBase || '/api/MegaForm/';
        const r = await fetch(apiBase + 'Form/List?siteId=' + siteId + '&moduleId=0', { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) raw = await r.json();
      } catch { /* keep raw as-is */ }
    }
  }
  const forms: SubmissionFormOption[] = (raw || []).map((f: any) => ({
    formId: f.formId ?? f.FormId ?? 0, title: f.title ?? f.Title ?? '',
    status: f.status ?? f.Status ?? '', schemaJson: f.schemaJson ?? f.SchemaJson ?? '', submissionCount: f.submissionCount ?? f.SubmissionCount ?? f.totalSubmissions ?? f.TotalSubmissions ?? 0
  })).filter((f: SubmissionFormOption) => f.formId > 0);
  if (forms.length) {
    setAvailableForms(forms);
    if (state.config.formId > 0) {
      const activeForm = forms.find(f => f.formId === state.config.formId);
      if (activeForm?.schemaJson) {
        try { setCurrentForm(activeForm.formId, JSON.parse(activeForm.schemaJson), activeForm.title || `Form #${activeForm.formId}`); } catch {}
      }
    }
  }
  _formsLoaded = true; render();
}

async function switchForm(formId: number, preferred?: SubmissionFormOption, rerender = true): Promise<void> {
  const state = getSubsState();
  if (formId <= 0) {
    setCurrentForm(0, undefined, 'All Submissions');
    setSubmissions([], 0);
    _loading = true; _loadError = '';
    if (rerender) render();
    await loadSubmissions();
    return;
  }
  let form = preferred || (state.forms || []).find(f => f.formId === formId);
  if (!form || !form.schemaJson) {
    const loaded = await _adapter.api.getForm(formId) as any;
    form = { formId: loaded.formId ?? loaded.FormId ?? formId, title: loaded.title ?? loaded.Title ?? `Form #${formId}`, status: loaded.status ?? loaded.Status ?? '', schemaJson: loaded.schemaJson ?? loaded.SchemaJson ?? '', submissionCount: loaded.submissionCount ?? loaded.SubmissionCount ?? loaded.totalSubmissions ?? loaded.TotalSubmissions ?? 0 };
  }
  let schema: any = undefined;
  if (form?.schemaJson) { try { schema = JSON.parse(form.schemaJson); } catch {} }
  setCurrentForm(formId, schema, form?.title || `Form #${formId}`);
  setSubmissions([], 0);
  _loading = true; _loadError = '';
  if (rerender) render();
  await loadSubmissions();
}

async function loadSubmissions(): Promise<void> {
  const state = getSubsState();
  _loading = true; _loadError = ''; render();
  try {
    const fid = state.config.formId || 0;
    if (fid > 0) {
      const result = await _adapter.api.getSubmissions(fid, {
        search: state.filters.search || undefined,
        status: state.filters.status || undefined,
        pageIndex: state.pageIndex,
        pageSize: state.pageSize,
      });
      setSubmissions(result.items || (result as any).data || [], result.totalCount || 0);
    } else {
      // [AllFormsAggregate v20260609-B103] "All Forms" view: the Oqtane API
      // requires a formId (getSubmissions(0) → 400 "formId is required"), so we
      // fan out one call per form and merge + sort + client-paginate here.
      const forms = (state.forms || []).filter(f => f.formId > 0).slice(0, 50);
      if (!forms.length) {
        setSubmissions([], 0);
      } else {
        const per = await Promise.all(forms.map(f =>
          _adapter.api.getSubmissions(f.formId, {
            search: state.filters.search || undefined,
            status: state.filters.status || undefined,
            pageIndex: 0,
            pageSize: 500,
          })
            .then(r => (r.items || []).map((s: any) => ({ ...s, formTitle: s.formTitle || f.title || `Form #${f.formId}` })))
            .catch(() => [] as any[])
        ));
        const merged = per.flat();
        merged.sort((a: any, b: any) =>
          new Date(b.submittedOnUtc || b.SubmittedOnUtc || 0).getTime() -
          new Date(a.submittedOnUtc || a.SubmittedOnUtc || 0).getTime());
        const start = state.pageIndex * state.pageSize;
        setSubmissions(merged.slice(start, start + state.pageSize), merged.length);
      }
    }
    _loading = false; updateHostChrome(); render();
  } catch (err) { handleLoadError(err, 'Failed to load submissions'); }
}

async function deleteSubmission(id: number): Promise<void> {
  try { await _adapter.api.deleteSubmission(id); toast('Deleted', 'success'); await loadSubmissions(); }
  catch (err) { handleLoadError(err, 'Delete failed'); }
}

async function bulkUpdateStatus(status: string): Promise<void> {
  const ids = Array.from(getSubsState().selected);
  for (const id of ids) { try { await _adapter.api.updateSubmissionStatus(id, status); } catch {} }
  toast(`${ids.length} marked as ${statusLabel(status)}`, 'success');
  await loadSubmissions();
}

async function bulkDelete(): Promise<void> {
  const ids = Array.from(getSubsState().selected);
  try {
    if (typeof (_adapter.api as any).bulkDeleteSubmissions === 'function') await (_adapter.api as any).bulkDeleteSubmissions(ids);
    else for (const id of ids) { try { await _adapter.api.deleteSubmission(id); } catch {} }
    toast(`${ids.length} deleted`, 'success');
    await loadSubmissions();
  } catch (err) { handleLoadError(err, 'Bulk delete failed'); }
}

function handleLoadError(err: unknown, msg: string): void {
  console.error(msg, err);
  _loading = false;
  _loadError = err instanceof Error ? err.message : String(err || msg);
  try { _adapter.showToast(msg, 'error'); } catch {}
  render();
}

function updateHostChrome(): void {
  const state = getSubsState();
  const formTitle = state.config.formId > 0
    ? (state.config.formTitle || (state.forms || []).find(f => f.formId === state.config.formId)?.title || '')
    : 'All Submissions';
  document.querySelectorAll('[data-mf-role="form-title"]').forEach(el => { el.textContent = formTitle || 'Submissions'; });
  document.querySelectorAll('[data-mf-role="form-total"]').forEach(el => { el.textContent = String(state.totalCount || 0); });
  document.querySelectorAll('[data-mf-role="form-subtitle"]').forEach(el => { el.textContent = `${formTitle || 'Submissions'} · ${state.totalCount || 0} total`; });
  if (_rootEl) _rootEl.dataset.total = String(state.totalCount || 0);
}

function formatDate(d: string): string {
  if (!d) return '—';
  try { const dt = new Date(d); return dt.toLocaleDateString(undefined, {month:'short',day:'numeric',year:'numeric'}) + ', ' + dt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
  catch { return d; }
}

function statusLabel(s: string): string {
  switch (s) { case 'Submitted': return 'New'; case 'Read': return 'Processed'; case 'Starred': return 'Starred'; case 'Archived': return 'Archived'; default: return s || 'New'; }
}

function toast(msg: string, type: 'success'|'error'|'info' = 'info') {
  const t = div(`mf-toast mf-toast-${type}`, msg);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-visible'));
  setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Google Sheets One-Click Connect ───────────────────────────
function openGoogleSheetConnectModal(): void {
  const state = getSubsState();
  const fid = state.config.formId;
  if (!fid) {
    toast('Pick a specific form first — Google Sheet connect needs to know which form to wire.', 'info');
    return;
  }
  const overlay = div('mf-gs-modal-overlay');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100010;padding:16px';
  const box = div('mf-gs-modal-box');
  box.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 20px 40px rgba(15,23,42,.18);width:100%;max-width:460px;padding:24px';
  const title = document.createElement('h3');
  title.textContent = 'Connect Google Sheet';
  title.style.cssText = 'margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a';
  const subtitle = document.createElement('p');
  subtitle.textContent = `Form: ${state.config.formTitle || `Form #${fid}`}`;
  subtitle.style.cssText = 'margin:0 0 16px;font-size:13px;color:#64748b';
  const idWrap = div(); idWrap.style.cssText = 'margin-bottom:12px';
  const idLbl = document.createElement('label'); idLbl.textContent = 'Spreadsheet ID *'; idLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:4px';
  const idInp = document.createElement('input') as HTMLInputElement;
  idInp.type = 'text'; idInp.className = 'mf-input'; idInp.placeholder = '1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890AbCd';
  idInp.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px';
  mk(idWrap, idLbl, idInp);
  const rangeWrap = div(); rangeWrap.style.cssText = 'margin-bottom:16px';
  const rangeLbl = document.createElement('label'); rangeLbl.textContent = 'Sheet / Range *'; rangeLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:4px';
  const rangeInp = document.createElement('input') as HTMLInputElement;
  rangeInp.type = 'text'; rangeInp.className = 'mf-input'; rangeInp.value = 'Sheet1!A:Z';
  rangeInp.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px';
  mk(rangeWrap, rangeLbl, rangeInp);
  const note = document.createElement('p');
  note.innerHTML = `${ic('alertCircle', 12)} This will create (or update) the form\u2019s workflow so <strong>every new submission</strong> is appended to the sheet as a row.`;
  note.style.cssText = 'margin:0 0 16px;font-size:12px;color:#64748b;line-height:1.5';
  const btns = div(); btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const cancelBtn = btn('mf-btn mf-btn-outline mf-btn-sm', 'Cancel', (e) => { e.preventDefault(); overlay.remove(); });
  const connectBtn = btn('mf-btn mf-btn-primary mf-btn-sm', `${ic('googleSheet', 13)} Connect`, async (e) => {
    e.preventDefault();
    const spreadsheetId = idInp.value.trim();
    const range = rangeInp.value.trim();
    if (!spreadsheetId) { toast('Spreadsheet ID is required.', 'error'); return; }
    if (!range) { toast('Sheet / Range is required.', 'error'); return; }
    connectBtn.disabled = true; connectBtn.innerHTML = 'Connecting…';
    try {
      const existing = await fetchWorkflowDef(fid);
      const workflow = buildGoogleSheetWorkflow(fid, existing, spreadsheetId, range, googleSheetFieldMappings(state.config.schema));
      await saveWorkflowDef(fid, workflow);
      toast('Google Sheet connected successfully.', 'success');
      overlay.remove();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Connect failed', 'error');
      connectBtn.disabled = false; connectBtn.innerHTML = `${ic('googleSheet', 13)} Connect`;
    }
  });
  mk(btns, cancelBtn, connectBtn);
  mk(box, title, subtitle, idWrap, rangeWrap, note, btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  idInp.focus();
}

// [SendToInbox v20260625] Route selected submission(s) to a chosen user's My Inbox.
// Creates an ad-hoc review task per submission (POST Workflow/Tasks/SendSubmission), assigned
// to the picked user. User list comes from Workflow/Directory (same source as the inbox Forward
// picker); a free-text username field is offered as a fallback for sites with no custom roles.
function subsApiBase(): string {
  return String((getSubsState().config.apiBase || (getApiBase() + '/'))).replace(/\/+$/, '') + '/';
}
async function openSendToInboxModal(submissionIds: number[]): Promise<void> {
  if (!submissionIds || submissionIds.length === 0) { toast('Select at least one submission first.', 'info'); return; }
  const base = subsApiBase();
  // resolve formId per submission (per-form view → config.formId; else from the row)
  const subFormId = (sid: number): number => {
    const s = ((getSubsState().submissions as any[]) || []).find((x: any) => (x.submissionId ?? x.SubmissionId) === sid);
    return (s && (s.formId ?? s.FormId)) || getSubsState().config.formId || 0;
  };

  const overlay = div('mf-sti-overlay');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100010;padding:16px';
  const box = div();
  box.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 20px 40px rgba(15,23,42,.18);width:100%;max-width:460px;padding:24px';
  const title = document.createElement('h3');
  title.innerHTML = `${ic('send', 16)} ${T('subs.send_to_inbox', 'Send to Inbox')}`;
  title.style.cssText = 'margin:0 0 4px;font-size:18px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px';
  const subtitle = document.createElement('p');
  subtitle.textContent = `${submissionIds.length} submission${submissionIds.length > 1 ? 's' : ''} → a teammate's inbox`;
  subtitle.style.cssText = 'margin:0 0 16px;font-size:13px;color:#64748b';

  // user picker (directory) + free-text fallback
  const selWrap = div(); selWrap.style.cssText = 'margin-bottom:12px';
  const selLbl = document.createElement('label'); selLbl.textContent = T('subs.assign_to', 'Assign to user'); selLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:4px';
  const sel = document.createElement('select'); sel.className = 'mf-input';
  sel.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;background:#fff';
  sel.innerHTML = `<option value="">${T('subs.loading_users', 'Loading users…')}</option>`;
  mk(selWrap, selLbl, sel);

  const txtWrap = div(); txtWrap.style.cssText = 'margin-bottom:12px';
  const txtLbl = document.createElement('label'); txtLbl.textContent = T('subs.or_username', 'or type a username'); txtLbl.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#64748b;margin-bottom:4px';
  const txt = document.createElement('input') as HTMLInputElement;
  txt.type = 'text'; txt.className = 'mf-input'; txt.placeholder = 'e.g. host';
  txt.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px';
  mk(txtWrap, txtLbl, txt);

  const noteWrap = div(); noteWrap.style.cssText = 'margin-bottom:16px';
  const noteLbl = document.createElement('label'); noteLbl.textContent = T('subs.note_optional', 'Note (optional)'); noteLbl.style.cssText = 'display:block;font-size:13px;font-weight:600;color:#334155;margin-bottom:4px';
  const noteInp = document.createElement('textarea'); noteInp.className = 'mf-input'; noteInp.rows = 2;
  noteInp.style.cssText = 'width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;resize:vertical';
  mk(noteWrap, noteLbl, noteInp);

  const btns = div(); btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const cancelBtn = btn('mf-btn mf-btn-outline mf-btn-sm', T('dash.cancel', 'Cancel'), (e) => { e.preventDefault(); overlay.remove(); });
  const sendBtn = btn('mf-btn mf-btn-primary mf-btn-sm', `${ic('send', 13)} ${T('subs.send', 'Send')}`, async (e) => {
    e.preventDefault();
    const targetUser = (txt.value.trim() || sel.value || '').trim();
    if (!targetUser) { toast(T('subs.pick_user', 'Pick a user or type a username.'), 'error'); return; }
    sendBtn.disabled = true; sendBtn.innerHTML = T('subs.sending', 'Sending…');
    try {
      let ok = 0;
      for (const sid of submissionIds) {
        const res = await fetch(base + 'Workflow/Tasks/SendSubmission', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formId: subFormId(sid), submissionId: sid, targetUser, title: 'Review submission', comment: noteInp.value.trim() }),
        });
        if (res.ok) ok++;
      }
      toast(T('subs.sent_to_inbox', 'Sent {n} to {u}’s inbox.', { n: String(ok), u: targetUser }), ok > 0 ? 'success' : 'error');
      overlay.remove();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Send failed', 'error');
      sendBtn.disabled = false; sendBtn.innerHTML = `${ic('send', 13)} ${T('subs.send', 'Send')}`;
    }
  });
  mk(btns, cancelBtn, sendBtn);
  mk(box, title, subtitle, selWrap, txtWrap, noteWrap, btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  // populate the directory
  try {
    const res = await fetch(base + 'Workflow/Directory', { credentials: 'include', headers: { Accept: 'application/json' } });
    const data = res.ok ? await res.json() : null;
    const groups = (data && (data.groups || data.Groups)) || [];
    if (!groups.length) {
      sel.innerHTML = `<option value="">${T('subs.no_dir_users', '(no directory users — type a username)')}</option>`;
    } else {
      sel.innerHTML = `<option value="">${T('subs.choose_user', '— choose —')}</option>`;
      groups.forEach((g: any) => {
        const og = document.createElement('optgroup'); og.label = g.name || g.Name || 'Users';
        ((g.users || g.Users) || []).forEach((u: any) => {
          const o = document.createElement('option');
          o.value = u.userName || u.UserName || '';
          o.textContent = (u.displayName || u.DisplayName || u.userName || u.UserName || '') + (u.email || u.Email ? ` · ${u.email || u.Email}` : '');
          og.appendChild(o);
        });
        if (og.children.length) sel.appendChild(og);
      });
    }
  } catch {
    sel.innerHTML = `<option value="">${T('subs.no_dir_users', '(no directory users — type a username)')}</option>`;
  }
}

async function fetchWorkflowDef(formId: number): Promise<any> {
  const base = String((getSubsState().config.apiBase || (getApiBase() + '/'))).replace(/\/+$/, '') + '/';
  const platform = _adapter.platform;
  const getPath = platform === 'oqtane' ? `Form/Workflow/Get?formId=${formId}` : `Workflow/Get?formId=${formId}`;
  const url = base + getPath;
  const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!res.ok) { if (res.status === 404 || res.status === 400) return null; throw new Error(`Failed to fetch workflow: ${res.status}`); }
  const data = await res.json();
  return data && (data.workflow || data.Workflow) ? data : null;
}

// Build Google Sheets column mappings from the form schema so each submission's
// field values land in columns (without this the node would append empty rows).
// A leading Submitted-At column is added for readability.
function googleSheetFieldMappings(schema: any): Array<{ Column: string; Source: string; Value?: string }> {
  const sch = schema && (schema.fields || schema.Fields || schema);
  const out: Array<{ Column: string; Source: string; Value?: string }> = [
    { Column: 'Submitted At', Source: '', Value: '{{submission.submittedOn}}' },
  ];
  try {
    flattenFields(Array.isArray(sch) ? sch : []).forEach((f: any) => {
      const type = f && (f.type || f.Type);
      const key = f && (f.key || f.Key);
      if (!key || isLayoutFieldType(type)) return;
      out.push({ Column: String(f.label || f.Label || prettifyKey(String(key))), Source: String(key) });
    });
  } catch { /* mappings stay minimal */ }
  return out.slice(0, 12); // executor caps at 12 columns
}

function buildGoogleSheetWorkflow(formId: number, existing: any, spreadsheetId: string, range: string, columnMappings?: Array<{ Column: string; Source: string; Value?: string }>): any {
  const now = new Date().toISOString();
  const gsNodeId = existing?.nodes?.find((n: any) => n.type === 25 || n.type === 'GoogleSheets')?.id || newGuid();
  const endNodeId = existing?.nodes?.find((n: any) => n.type === 5 || n.type === 'End')?.id || newGuid();
  const gsNode = {
    id: gsNodeId, type: 25, label: 'Google Sheets', zoneType: 2,
    position: { x: 200, y: 200 },
    config: { SpreadsheetId: spreadsheetId, Range: range, SheetName: range, Operation: 'append', ValueInputOption: 'USER_ENTERED', InsertDataOption: 'INSERT_ROWS', ColumnMappings: columnMappings || [] },
    legacyRules: [], isDisabled: false,
  };
  const endNode = {
    id: endNodeId, type: 5, label: 'End', zoneType: 2,
    position: { x: 200, y: 400 },
    config: { endType: 1, message: 'Submission synced to Google Sheets.' },
    legacyRules: [], isDisabled: false,
  };
  let nodes: any[] = []; let edges: any[] = [];
  if (existing && existing.nodes && existing.nodes.length > 0) {
    nodes = (existing.nodes || []).map((n: any) => ({ ...n }));
    edges = (existing.edges || []).map((e: any) => ({ ...e }));
    const gsIdx = nodes.findIndex((n: any) => n.id === gsNodeId);
    if (gsIdx >= 0) nodes[gsIdx] = gsNode; else nodes.push(gsNode);
    const endIdx = nodes.findIndex((n: any) => n.id === endNodeId);
    if (endIdx >= 0) nodes[endIdx] = endNode; else nodes.push(endNode);
    const outgoing = new Set(edges.map((e: any) => e.sourceNodeId || e.SourceNodeId));
    const leafIds = nodes.map((n: any) => n.id).filter((id: string) => !outgoing.has(id) && id !== endNodeId);
    edges = edges.filter((e: any) => (e.targetNodeId || e.TargetNodeId) !== endNodeId);
    edges = edges.filter((e: any) => (e.sourceNodeId || e.SourceNodeId) !== gsNodeId);
    leafIds.forEach((leafId: string) => edges.push({ id: newGuid(), sourceNodeId: leafId, targetNodeId: gsNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }));
    if (!edges.some((e: any) => (e.targetNodeId || e.TargetNodeId) === gsNodeId)) {
      const first = nodes[0]?.id;
      if (first && first !== gsNodeId) edges.push({ id: newGuid(), sourceNodeId: first, targetNodeId: gsNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
    }
    edges.push({ id: newGuid(), sourceNodeId: gsNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 });
  } else {
    nodes = [gsNode, endNode];
    edges = [{ id: newGuid(), sourceNodeId: gsNodeId, targetNodeId: endNodeId, sourceHandle: 'default', targetHandle: 'input', edgeType: 1 }];
  }
  return { id: existing?.id || newGuid(), formId, name: existing?.name || 'Form Workflow', version: bumpVersion(existing?.version), startNodeId: existing?.startNodeId || gsNodeId, nodes, edges, variables: existing?.variables || [], settings: existing?.settings || { executionTimeoutSeconds: 300, dryRun: false, enableExecutionLog: true }, createdAt: existing?.createdAt || now, updatedAt: now, migratedFromRules: existing?.migratedFromRules || false };
}

async function saveWorkflowDef(formId: number, workflow: any): Promise<void> {
  const base = String((getSubsState().config.apiBase || (getApiBase() + '/'))).replace(/\/+$/, '') + '/';
  const platform = _adapter.platform;
  const savePath = platform === 'oqtane' ? 'Form/Workflow/Save' : 'Workflow/Save';
  const url = base + savePath;
  const res = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ formId, workflow }) });
  if (!res.ok) { let msg = `Save failed: ${res.status}`; try { const d = await res.json(); if (d.error || d.message) msg = d.error || d.message; } catch {} throw new Error(msg); }
}

function newGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function bumpVersion(v?: string): string {
  const parts = String(v || '0.0.0').split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10) + 1;
  return `${major}.${minor}.${patch}`;
}
