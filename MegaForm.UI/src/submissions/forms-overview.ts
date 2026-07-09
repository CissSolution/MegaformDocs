// ============================================================
// MegaForm Submissions — Forms Overview (WPForms-style landing)
// ------------------------------------------------------------
// Clicking "Submissions" lands HERE: KPI strip + "Submission Volume"
// area chart + a forms table (Form Name · Status · Created · All Time ·
// Last 7d · Last 30d · Completion · Trend(14d) sparkline · Actions).
// Clicking a form drills into that form's submissions list.
//
// Pixel-ported from the v0 mock (app/submissions/page.tsx): same column
// set, same chart, same sparklines. Data comes from the real backend
// (GET /api/MegaForm/Reports/FormsOverview?days=30&siteId=N). All text is
// i18n (T(key, fallback)) — no hard-coded UI strings.
// Kept OUT of SubmissionsShell.ts to honour the "no giant TS files" rule.
// ============================================================

import { t as i18nT } from '@i18n';

export const FORMS_OVERVIEW_BADGE = 'FormsOverview v20260614-B162';

/** Translate with an English fallback baked in → never blanks. */
function T(key: string, fallback: string, params?: Record<string, string | number>): string {
  try { const o = i18nT(key, params); if (o && o !== key) return o; } catch { /* engine */ }
  let raw = fallback;
  if (params) for (const p in params) raw = raw.replace(new RegExp('\\{' + p + '\\}', 'g'), String(params[p]));
  return raw;
}

// ── Lucide-style inline icons (match the mock 1:1) ────────────
const IC: Record<string, string> = {
  inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
  trendingUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  trendingDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`,
  calendarDays: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`,
  fileText: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
  arrowUpRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
  barChart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16v-5"/><path d="M11 16V7"/><path d="M15 16v-3"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  arrowUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
  arrowDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>`,
  chevronsUpDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
  // [StorageType v20260625] per-form destination icons
  stoDb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
  stoSheet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M3 10h18"/><path d="M8 6v12"/><path d="M16 6v12"/></svg>`,
  stoCsv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
};
function ic(name: string, size = 16): string {
  return `<svg width="${size}" height="${size}" class="mf-fo-ic" ${IC[name] ? IC[name].slice(4) : '></svg>'}`;
}

// [StorageType v20260625] icon + tooltip + colour per submission destination.
const STORAGE_META: Record<string, { icon: string; title: string; color: string; bg: string }> = {
  csv:   { icon: 'stoCsv',   title: 'Stored in MegaForm — export to CSV', color: '#475569', bg: '#f1f5f9' },
  sheet: { icon: 'stoSheet', title: 'Connected to Google Sheet',          color: '#15803d', bg: '#dcfce7' },
  db:    { icon: 'stoDb',    title: 'Connected to a database table',       color: '#1d4ed8', bg: '#dbeafe' },
};

// ── Types ─────────────────────────────────────────────────────
type StorageKind = 'csv' | 'sheet' | 'db';
interface RawForm {
  formId: number; title: string; status: string;
  createdOnUtc: string | null; allTime: number; last7: number; series: number[];
  completion: number | null;
}
interface FormRow {
  formId: number; title: string; status: string; createdLabel: string; createdMs: number;
  allTime: number; last7: number; last30: number;
  trend: 'up' | 'down' | 'flat'; trendPct: number; completion: number | null;
  sparkline: number[]; starred: boolean; storage: StorageKind;
}
type SortKey = 'name' | 'createdAt' | 'allTime' | 'last7' | 'last30';
type SortDir = 'asc' | 'desc';

export interface FormsOverviewCtx {
  apiBase: string;       // e.g. '/api/MegaForm/'
  siteId: number;
  onPickForm: (formId: number, title: string) => void;
  onTotalsLoaded?: (totals: { submissions: number; forms: number }) => void;
}

// ── helpers ───────────────────────────────────────────────────
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);
const fmtN = (n: number) => (n || 0).toLocaleString();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d: Date): string { return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; }
function fmtDayShort(d: Date): string { return `${MONTHS[d.getMonth()]} ${d.getDate()}`; }

function el(tag: string, cls?: string, html?: string): HTMLElement {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e;
}

// ── module state (per mount) ──────────────────────────────────
let _ctx: FormsOverviewCtx;
let _host: HTMLElement;
let _rows: FormRow[] = [];
let _generatedAt = new Date();
let _seriesByForm: Record<number, number[]> = {};
let _storageByForm: Record<number, StorageKind> = {};
let _search = '';
let _statusFilter = 'all';
let _sortKey: SortKey = 'allTime';
let _sortDir: SortDir = 'desc';
let _chartRange = 30; // 7 | 14 | 30

// ── Public entry ──────────────────────────────────────────────
export function renderFormsOverview(host: HTMLElement, ctx: FormsOverviewCtx): void {
  _ctx = ctx; _host = host;
  host.innerHTML = `<div class="mf-fo"><div class="mf-fo-loading">${ic('refresh', 16)} ${T('subs.fo_loading', 'Loading forms overview…')}</div></div>`;
  void load();
}

// [StorageType v20260625] Derive a form's submission destination from its settings/workflow.
// db    = settings.databaseInsert.enabled (writes a row to a connected SQL table)
// sheet = a Google Sheets node in the workflow (type 25 / "GoogleSheets")
// csv   = default (stored in MegaForm submissions, exportable to CSV)
function deriveStorage(settingsJson: string, workflowJson: string): StorageKind {
  try {
    const s = settingsJson ? JSON.parse(settingsJson) : {};
    const di = s.databaseInsert || s.DatabaseInsert;
    if (di && (di.enabled === true || di.Enabled === true)) return 'db';
  } catch { /* ignore */ }
  const wf = String(workflowJson || '');
  if (/"type"\s*:\s*("?GoogleSheets"?|25)\b/i.test(wf) || /GoogleSheets/i.test(wf)) return 'sheet';
  return 'csv';
}

async function loadStorageMap(): Promise<void> {
  _storageByForm = {};
  try {
    const url = _ctx.apiBase.replace(/\/+$/, '/') + 'Form/List?siteId=' + (_ctx.siteId || 1);
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    const list = await r.json();
    (list || []).forEach((f: any) => {
      const id = f.formId ?? f.FormId ?? 0;
      if (id > 0) _storageByForm[id] = deriveStorage(f.settingsJson ?? f.SettingsJson ?? '', f.workflowJson ?? f.WorkflowJson ?? '');
    });
  } catch { /* best-effort — falls back to 'csv' */ }
}

async function load(): Promise<void> {
  try {
    await loadStorageMap();
    const url = _ctx.apiBase.replace(/\/+$/, '/') + 'Reports/FormsOverview?days=30&siteId=' + (_ctx.siteId || 1);
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    _generatedAt = data.generatedAtUtc ? new Date(data.generatedAtUtc) : new Date();
    const raw: RawForm[] = (data.forms || data.Forms || []).map((f: any) => ({
      formId: f.formId ?? f.FormId ?? 0,
      title: f.title ?? f.Title ?? '',
      status: (f.status ?? f.Status ?? '').toString(),
      createdOnUtc: f.createdOnUtc ?? f.CreatedOnUtc ?? null,
      allTime: f.allTime ?? f.AllTime ?? 0,
      last7: f.last7 ?? f.Last7 ?? 0,
      series: (f.series ?? f.Series ?? []) as number[],
      completion: (f.completion ?? f.Completion ?? null) as number | null,
    }));
    _seriesByForm = {};
    _rows = raw.map((f) => {
      const s = (f.series || []).map((n) => Number(n) || 0);
      _seriesByForm[f.formId] = s;
      const last7 = sum(s.slice(-7));
      const last30 = sum(s);
      const prev7 = sum(s.slice(-14, -7));
      let trend: FormRow['trend'] = 'flat'; let trendPct = 0;
      if (last7 > prev7) { trend = 'up'; trendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : (last7 > 0 ? 100 : 0); }
      else if (last7 < prev7) { trend = 'down'; trendPct = prev7 > 0 ? Math.round(((prev7 - last7) / prev7) * 100) : 0; }
      const created = f.createdOnUtc ? new Date(f.createdOnUtc) : null;
      return {
        formId: f.formId,
        title: f.title || ('Form #' + f.formId),
        status: normStatus(f.status),
        createdLabel: created && created.getFullYear() > 1 ? fmtDate(created) : '—',
        createdMs: created ? created.getTime() : 0,
        allTime: f.allTime, last7, last30, trend, trendPct,
        completion: f.completion,
        sparkline: s.slice(-14),
        starred: false,
        storage: _storageByForm[f.formId] || 'csv',
      } as FormRow;
    });
    _ctx.onTotalsLoaded?.({
      submissions: sum(_rows.map((row) => row.allTime)),
      forms: _rows.length,
    });
    paint();
  } catch (err) {
    _host.innerHTML = `<div class="mf-fo"><div class="mf-fo-error">${T('subs.fo_error', 'Unable to load the forms overview.')}<br><small>${String(err instanceof Error ? err.message : err)}</small></div></div>`;
  }
}

function normStatus(s: string): string {
  const v = (s || '').toLowerCase();
  if (v === 'published' || v === 'active' || v === '1' || v === 'true') return 'active';
  if (v === 'paused' || v === 'draft' || v === 'unpublished' || v === '0') return 'paused';
  if (v === 'archived' || v === 'deleted') return 'archived';
  return v || 'active';
}

// ── KPI + chart aggregates ────────────────────────────────────
function dailyTotals(range: number): number[] {
  const out = new Array(30).fill(0);
  for (const fid in _seriesByForm) {
    const s = _seriesByForm[fid];
    for (let i = 0; i < s.length && i < 30; i++) out[i] += s[i];
  }
  return out.slice(-range);
}

// ── Render ────────────────────────────────────────────────────
function paint(): void {
  const wrap = el('div', 'mf-fo');

  // KPI strip
  const totalAll = sum(_rows.map((r) => r.allTime));
  const totalL7 = sum(_rows.map((r) => r.last7));
  const totalL30 = sum(_rows.map((r) => r.last30));
  const activeForms = _rows.filter((r) => r.status === 'active').length;
  const kpis = [
    { label: T('subs.kpi_total', 'Total Submissions'), value: fmtN(totalAll), sub: T('subs.kpi_all_time', 'All time'), icon: 'inbox', color: 'blue' },
    { label: T('subs.kpi_last7', 'Last 7 Days'), value: fmtN(totalL7), sub: T('subs.kpi_recent', 'Recent activity'), icon: 'trendingUp', color: 'emerald' },
    { label: T('subs.kpi_last30', 'Last 30 Days'), value: fmtN(totalL30), sub: T('subs.kpi_this_month', 'This month'), icon: 'calendarDays', color: 'violet' },
    { label: T('subs.kpi_active_forms', 'Active Forms'), value: String(activeForms), sub: T('subs.kpi_of_total', 'of {n} total', { n: _rows.length }), icon: 'fileText', color: 'amber' },
  ];
  const kpiGrid = el('div', 'mf-fo-kpis');
  kpis.forEach((k) => {
    const c = el('div', 'mf-fo-kpi');
    c.innerHTML =
      `<div class="mf-fo-kpi-top"><div class="mf-fo-kpi-ic mf-fo-${k.color}">${ic(k.icon, 16)}</div>${ic('arrowUpRight', 14).replace('mf-fo-ic', 'mf-fo-ic mf-fo-kpi-arrow')}</div>` +
      `<p class="mf-fo-kpi-val">${k.value}</p>` +
      `<p class="mf-fo-kpi-lbl">${k.label}</p>` +
      `<p class="mf-fo-kpi-sub">${k.sub}</p>`;
    kpiGrid.appendChild(c);
  });
  wrap.appendChild(kpiGrid);

  // Chart card
  wrap.appendChild(buildChartCard());

  // Forms table card
  wrap.appendChild(buildTableCard());

  _host.innerHTML = '';
  _host.appendChild(wrap);
}

function buildChartCard(): HTMLElement {
  const card = el('div', 'mf-fo-card');
  const hd = el('div', 'mf-fo-chart-hd');
  const titleWrap = el('div');
  titleWrap.innerHTML = `<div class="mf-fo-card-ttl">${T('subs.chart_title', 'Submission Volume')}</div><p class="mf-fo-card-sub">${T('subs.chart_sub', 'All forms combined — daily totals')}</p>`;
  const toggle = el('div', 'mf-fo-toggle');
  ([[7, '7D'], [14, '14D'], [30, '30D']] as Array<[number, string]>).forEach(([v, l]) => {
    const b = el('button', 'mf-fo-toggle-btn' + (_chartRange === v ? ' is-active' : ''), l) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => { _chartRange = v; paint(); });
    toggle.appendChild(b);
  });
  hd.appendChild(titleWrap); hd.appendChild(toggle);
  card.appendChild(hd);

  const body = el('div', 'mf-fo-chart-body');
  body.appendChild(buildAreaChart(dailyTotals(_chartRange), _chartRange));
  card.appendChild(body);
  return card;
}

// Inline SVG area chart (responsive via viewBox) — grey, matching the mock.
function buildAreaChart(data: number[], range: number): SVGElement {
  const W = 900, H = 180, padL = 36, padR = 8, padT = 10, padB = 22;
  const n = data.length;
  const max = Math.max(...data, 1);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - v / max) * innerH;
  const linePts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${(padT + innerH).toFixed(1)} ` + linePts + ` ${(padL + innerW).toFixed(1)},${(padT + innerH).toFixed(1)}`;
  // gridlines (4) + y labels
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => padT + f * innerH);
  const yVals = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * (1 - f)));
  // x labels (date) — show ~6
  const step = range === 7 ? 1 : range === 14 ? 2 : 5;
  const today = _generatedAt;
  const labelFor = (i: number) => { const d = new Date(today); d.setDate(d.getDate() - (n - 1 - i)); return fmtDayShort(d); };

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'mf-fo-chart-svg'); svg.setAttribute('preserveAspectRatio', 'none');
  let inner = `<defs><linearGradient id="mfFoFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stop-color="#64748b" stop-opacity="0.22"/><stop offset="95%" stop-color="#64748b" stop-opacity="0.01"/></linearGradient></defs>`;
  gridYs.forEach((gy, idx) => {
    inner += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#e4e4e7" stroke-width="1" stroke-dasharray="3 3"/>`;
    inner += `<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" class="mf-fo-axis">${fmtN(yVals[idx])}</text>`;
  });
  inner += `<polygon points="${areaPts}" fill="url(#mfFoFill)" stroke="none"/>`;
  inner += `<polyline points="${linePts}" fill="none" stroke="#64748b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (let i = 0; i < n; i += step) {
    inner += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="mf-fo-axis">${labelFor(i)}</text>`;
  }
  svg.innerHTML = inner;
  return svg as unknown as SVGElement;
}

function buildTableCard(): HTMLElement {
  const card = el('div', 'mf-fo-card');

  // header: "Forms (n)" + search + status filter
  const hd = el('div', 'mf-fo-table-hd');
  const ttl = el('div', 'mf-fo-card-ttl', `${T('subs.forms', 'Forms')} <span class="mf-fo-count">${visibleRows().length}</span>`);
  const tools = el('div', 'mf-fo-table-tools');
  // search
  const sWrap = el('div', 'mf-fo-search-wrap');
  sWrap.innerHTML = `<span class="mf-fo-search-ic">${ic('search', 14)}</span>`;
  const sInp = document.createElement('input');
  sInp.type = 'text'; sInp.className = 'mf-fo-search'; sInp.placeholder = T('subs.search_forms', 'Search forms…'); sInp.value = _search;
  sInp.addEventListener('input', () => { _search = sInp.value; rerenderTable(card); });
  sWrap.appendChild(sInp);
  // status filter
  const stSel = document.createElement('select');
  stSel.className = 'mf-fo-select';
  [['all', T('subs.all_status', 'All Status')], ['active', T('subs.status_active', 'Active')], ['paused', T('subs.status_paused', 'Paused')], ['archived', T('subs.status_archived', 'Archived')]].forEach(([v, l]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = l; if (v === _statusFilter) o.selected = true; stSel.appendChild(o);
  });
  stSel.addEventListener('change', () => { _statusFilter = stSel.value; rerenderTable(card); });
  tools.appendChild(sWrap); tools.appendChild(stSel);
  hd.appendChild(ttl); hd.appendChild(tools);
  card.appendChild(hd);

  const tableWrap = el('div', 'mf-fo-table-wrap');
  tableWrap.appendChild(buildTable());
  card.appendChild(tableWrap);

  // footer
  const ft = el('div', 'mf-fo-table-ft');
  const total = sum(_rows.map((r) => r.allTime));
  ft.innerHTML =
    `<span>${T('subs.fo_showing', 'Showing {a} of {b} forms', { a: visibleRows().length, b: _rows.length })}</span>` +
    `<span>${T('subs.fo_total_all', '{n} total submissions across all forms', { n: fmtN(total) })}</span>`;
  card.appendChild(ft);
  return card;
}

function rerenderTable(card: HTMLElement): void {
  const wrap = card.querySelector('.mf-fo-table-wrap');
  if (wrap) { wrap.innerHTML = ''; wrap.appendChild(buildTable()); }
  const cnt = card.querySelector('.mf-fo-count'); if (cnt) cnt.textContent = String(visibleRows().length);
  const ft = card.querySelector('.mf-fo-table-ft');
  if (ft) {
    const total = sum(_rows.map((r) => r.allTime));
    ft.innerHTML = `<span>${T('subs.fo_showing', 'Showing {a} of {b} forms', { a: visibleRows().length, b: _rows.length })}</span><span>${T('subs.fo_total_all', '{n} total submissions across all forms', { n: fmtN(total) })}</span>`;
  }
}

function visibleRows(): FormRow[] {
  let rows = _rows.filter((r) => {
    if (_search && !r.title.toLowerCase().includes(_search.toLowerCase())) return false;
    if (_statusFilter !== 'all' && r.status !== _statusFilter) return false;
    return true;
  });
  rows = rows.slice().sort((a, b) => {
    let av: number | string = 0, bv: number | string = 0;
    if (_sortKey === 'name') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    else if (_sortKey === 'createdAt') { av = a.createdMs; bv = b.createdMs; }
    else if (_sortKey === 'allTime') { av = a.allTime; bv = b.allTime; }
    else if (_sortKey === 'last7') { av = a.last7; bv = b.last7; }
    else if (_sortKey === 'last30') { av = a.last30; bv = b.last30; }
    if (typeof av === 'string') return _sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
    return _sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
  return [...rows.filter((r) => r.starred), ...rows.filter((r) => !r.starred)];
}

function sortIcon(k: SortKey): string {
  if (_sortKey !== k) return `<span class="mf-fo-sort">${ic('chevronsUpDown', 13)}</span>`;
  return `<span class="mf-fo-sort is-active">${ic(_sortDir === 'asc' ? 'arrowUp' : 'arrowDown', 13)}</span>`;
}

function buildTable(): HTMLElement {
  const rows = visibleRows();
  const table = el('table', 'mf-fo-t');
  const STATUS_LBL: Record<string, string> = {
    active: T('subs.status_active', 'Active'), paused: T('subs.status_paused', 'Paused'), archived: T('subs.status_archived', 'Archived'),
  };

  const thead = el('thead');
  const htr = el('tr');
  const sortableTh = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const th = el('th', 'mf-fo-th mf-fo-th-' + align);
    const b = el('button', 'mf-fo-th-btn', `${label} ${sortIcon(key)}`) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => { if (_sortKey === key) _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; else { _sortKey = key; _sortDir = 'desc'; } repaintTableOnly(); });
    th.appendChild(b); return th;
  };
  htr.appendChild(el('th', 'mf-fo-th mf-fo-th-star'));
  htr.appendChild(sortableTh('name', T('subs.col_form_name', 'Form Name')));
  htr.appendChild(el('th', 'mf-fo-th mf-fo-th-left', T('subs.col_status', 'Status')));
  htr.appendChild(sortableTh('createdAt', T('subs.col_created', 'Created')));
  htr.appendChild(sortableTh('allTime', T('subs.col_all_time', 'All Time'), 'right'));
  htr.appendChild(sortableTh('last7', T('subs.col_last7', 'Last 7d'), 'right'));
  htr.appendChild(sortableTh('last30', T('subs.col_last30', 'Last 30d'), 'right'));
  htr.appendChild(el('th', 'mf-fo-th mf-fo-th-right', T('subs.col_completion', 'Completion')));
  htr.appendChild(el('th', 'mf-fo-th mf-fo-th-left', T('subs.col_trend', 'Trend (14d)')));
  htr.appendChild(el('th', 'mf-fo-th mf-fo-th-right', T('subs.col_actions', 'Actions')));
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = el('tbody');
  if (rows.length === 0) {
    const tr = el('tr'); const td = el('td', 'mf-fo-empty'); td.setAttribute('colspan', '10');
    td.textContent = T('subs.fo_no_forms', 'No forms match your filters.');
    tr.appendChild(td); tbody.appendChild(tr);
  }
  rows.forEach((row) => {
    const tr = el('tr', 'mf-fo-tr');

    // star
    const tdStar = el('td', 'mf-fo-td mf-fo-td-star');
    const starBtn = el('button', 'mf-fo-star' + (row.starred ? ' is-on' : ''), ic('star', 14)) as HTMLButtonElement;
    starBtn.type = 'button'; starBtn.title = row.starred ? T('subs.unstar', 'Unstar') : T('subs.star', 'Star');
    starBtn.addEventListener('click', (e) => { e.stopPropagation(); row.starred = !row.starred; repaintTableOnly(); });
    tdStar.appendChild(starBtn); tr.appendChild(tdStar);

    // form name (clickable → drill in) + storage-destination chip
    const tdName = el('td', 'mf-fo-td mf-fo-td-name');
    const sto = STORAGE_META[row.storage];
    const stoChip = el('span', `mf-fo-storage mf-fo-storage-${row.storage}`, ic(sto.icon, 13));
    stoChip.title = sto.title;
    stoChip.setAttribute('aria-label', sto.title);
    stoChip.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;flex:0 0 auto;color:${sto.color};background:${sto.bg};margin-right:8px`;
    const nameWrap = el('span', 'mf-fo-name-wrap');
    nameWrap.style.cssText = 'display:inline-flex;align-items:center;gap:0';
    const link = el('a', 'mf-fo-form-link', `${row.title} ${ic('chevronRight', 14)}`) as HTMLAnchorElement;
    link.href = '#';
    link.addEventListener('click', (e) => { e.preventDefault(); _ctx.onPickForm(row.formId, row.title); });
    nameWrap.appendChild(stoChip);
    nameWrap.appendChild(link);
    tdName.appendChild(nameWrap);
    tdName.appendChild(el('span', 'mf-fo-form-sub', `#${row.formId}`));
    tr.appendChild(tdName);

    // status
    const tdStatus = el('td', 'mf-fo-td');
    tdStatus.innerHTML = `<span class="mf-fo-badge mf-fo-badge-${row.status}">${STATUS_LBL[row.status] || row.status}</span>`;
    tr.appendChild(tdStatus);

    // created
    tr.appendChild(el('td', 'mf-fo-td mf-fo-td-muted', row.createdLabel));

    // all time
    tr.appendChild(el('td', 'mf-fo-td mf-fo-td-right mf-fo-td-strong', fmtN(row.allTime)));
    // last7
    tr.appendChild(el('td', 'mf-fo-td mf-fo-td-right mf-fo-td-muted', fmtN(row.last7)));
    // last30
    tr.appendChild(el('td', 'mf-fo-td mf-fo-td-right mf-fo-td-muted', fmtN(row.last30)));

    // completion
    const tdC = el('td', 'mf-fo-td mf-fo-td-right');
    if (row.completion == null) {
      tdC.innerHTML = `<span class="mf-fo-td-muted">—</span>`;
    } else {
      const tone = row.completion >= 80 ? 'good' : row.completion >= 60 ? 'mid' : 'low';
      tdC.innerHTML = `<div class="mf-fo-comp"><span class="mf-fo-comp-pct mf-fo-comp-${tone}">${row.completion}%</span><div class="mf-fo-comp-track"><div class="mf-fo-comp-bar mf-fo-comp-${tone}" style="width:${row.completion}%"></div></div></div>`;
    }
    tr.appendChild(tdC);

    // trend sparkline
    const tdT = el('td', 'mf-fo-td');
    const trendCls = row.trend === 'up' ? 'up' : row.trend === 'down' ? 'down' : 'flat';
    const trendIc = row.trend === 'up' ? 'trendingUp' : row.trend === 'down' ? 'trendingDown' : 'minus';
    tdT.innerHTML = `<div class="mf-fo-trend">${sparkline(row.sparkline, row.trend)}<span class="mf-fo-trend-pct mf-fo-trend-${trendCls}">${ic(trendIc, 12)}${row.trendPct > 0 ? row.trendPct + '%' : ''}</span></div>`;
    tr.appendChild(tdT);

    // actions
    const tdA = el('td', 'mf-fo-td mf-fo-td-right');
    const viewBtn = el('button', 'mf-fo-act', ic('eye', 14)) as HTMLButtonElement;
    viewBtn.type = 'button'; viewBtn.title = T('subs.view_submissions', 'View Submissions');
    viewBtn.addEventListener('click', (e) => { e.stopPropagation(); _ctx.onPickForm(row.formId, row.title); });
    tdA.appendChild(viewBtn);
    tr.appendChild(tdA);

    tr.addEventListener('click', () => _ctx.onPickForm(row.formId, row.title));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

// re-render only the table portion (keeps scroll/focus on sort/star/filter)
function repaintTableOnly(): void {
  const card = _host.querySelector('.mf-fo-card:last-child') as HTMLElement | null;
  if (card) rerenderTable(card);
}

function sparkline(data: number[], trend: 'up' | 'down' | 'flat'): string {
  if (!data || data.length === 0) return `<span class="mf-fo-td-muted">—</span>`;
  const W = 80, H = 28, pad = 2;
  const max = Math.max(...data, 1), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / (max - min || 1)) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#94a3b8';
  return `<svg width="${W}" height="${H}" class="mf-fo-spark" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
