// ============================================================
//  Submission "Live DB rows" modal (Phase 3.1)
//  ─────────────────────────────────────────────────────────
//  When a form is bound to a custom DB table via
//  settings.databaseInsert, this modal lets admins inspect
//  the ACTUAL rows in that table (not the JSON snapshots
//  stored in MF_Submissions). Server endpoint:
//    GET /AiTools/CustomTableRows?formId=N&page=1&pageSize=50
//
//  Phase 3.1 = read-only. Phase 3.2 will add inline edit /
//  delete via UpdateCustomTableRow / DeleteCustomTableRow.
// ============================================================

export const LIVEDB_MODAL_BADGE = 'LiveDbModal v20260531-01';

interface ApiBaseCtx { apiBase: string; }

function api(ctx: ApiBaseCtx): string {
  if (ctx.apiBase) return ctx.apiBase.replace(/\/?$/, '/');
  // [B51] Platform-aware fallback
  const w = window as any;
  const pf = w.__MF_PLATFORM__ || {};
  const platform = String(pf.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}
function antiForgery(): string {
  return (document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null)?.value || '';
}
function esc(v: any): string {
  const s = v == null ? '' : String(v);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(v: any): string {
  if (v == null) return '<em style="color:#94a3b8">NULL</em>';
  if (v instanceof Date) return v.toLocaleString();
  const s = String(v);
  if (s.length > 80) return esc(s.slice(0, 77)) + '…';
  return esc(s);
}

function injectStyle(): void {
  if (document.getElementById('mf-livedb-style')) return;
  const css = `
    .mf-livedb-overlay { position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:2147483640;display:flex;align-items:center;justify-content:center;font-family:-apple-system,system-ui,sans-serif }
    .mf-livedb-modal   { background:#fff;border-radius:14px;width:min(1100px,94vw);height:min(720px,86vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px rgba(2,6,23,.45) }
    .mf-livedb-head    { padding:14px 18px;border-bottom:1px solid #e2e8f0;background:linear-gradient(135deg,#0ea5e9 0%,#3b82f6 100%);color:#fff;display:flex;align-items:center;gap:10px }
    .mf-livedb-title   { font-size:15px;font-weight:700;flex:1 }
    .mf-livedb-chip    { font-size:10px;padding:2px 8px;background:rgba(255,255,255,.18);border-radius:99px;font-weight:600 }
    .mf-livedb-x       { background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px 10px;border-radius:6px }
    .mf-livedb-x:hover { background:rgba(255,255,255,.16) }
    .mf-livedb-meta    { padding:8px 18px;background:#eff6ff;border-bottom:1px solid #dbeafe;color:#1e40af;font-size:12px;display:flex;justify-content:space-between;align-items:center }
    .mf-livedb-body    { flex:1;overflow:auto;background:#fff }
    .mf-livedb-tbl     { width:100%;border-collapse:collapse;font-size:12px }
    .mf-livedb-tbl th  { background:#f1f5f9;padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;position:sticky;top:0;z-index:1 }
    .mf-livedb-tbl td  { padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top }
    .mf-livedb-tbl tr:hover td { background:#f8fafc }
    .mf-livedb-foot    { padding:10px 18px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:12px;background:#fafafa }
    .mf-livedb-pager   { display:flex;gap:6px;align-items:center }
    .mf-livedb-pager button { padding:5px 11px;border:1px solid #cbd5e1;background:#fff;border-radius:5px;cursor:pointer;font-size:12px }
    .mf-livedb-pager button:disabled { opacity:.4;cursor:not-allowed }
    .mf-livedb-err     { padding:18px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;margin:12px;font-size:13px }
    .mf-livedb-empty   { padding:40px;text-align:center;color:#94a3b8;font-style:italic }
    .mf-livedb-loading { padding:40px;text-align:center;color:#64748b }
  `;
  const s = document.createElement('style');
  s.id = 'mf-livedb-style';
  s.textContent = css;
  document.head.appendChild(s);
}

interface RowsResponse {
  tableName?: string;
  schemaName?: string;
  idColumn?: string;
  columns?: { name: string; type: string }[];
  rows?: any[][];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
  hint?: string;
}

async function fetchRows(ctx: ApiBaseCtx, formId: number, page: number, pageSize: number): Promise<RowsResponse> {
  const url = api(ctx) + 'AiTools/CustomTableRows?formId=' + formId + '&page=' + page + '&pageSize=' + pageSize;
  const resp = await fetch(url, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', RequestVerificationToken: antiForgery() },
  });
  const text = await resp.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { error: text }; }
  if (!resp.ok) return { error: payload?.error || ('HTTP ' + resp.status), hint: payload?.hint };
  return payload;
}

export function openLiveDbRowsModal(opts: { ctx: ApiBaseCtx; formId: number; formTitle?: string; }): void {
  injectStyle();
  const existing = document.getElementById('mf-livedb-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mf-livedb-overlay';
  overlay.className = 'mf-livedb-overlay';
  overlay.innerHTML = `
    <div class="mf-livedb-modal" role="dialog" aria-modal="true">
      <div class="mf-livedb-head">
        <span class="mf-livedb-title">Live DB rows — ${esc(opts.formTitle || ('Form ' + opts.formId))}</span>
        <span class="mf-livedb-chip">${LIVEDB_MODAL_BADGE}</span>
        <button class="mf-livedb-x" aria-label="Close">&times;</button>
      </div>
      <div class="mf-livedb-meta" id="mf-livedb-meta">Loading metadata…</div>
      <div class="mf-livedb-body" id="mf-livedb-body"><div class="mf-livedb-loading">Loading rows…</div></div>
      <div class="mf-livedb-foot">
        <span id="mf-livedb-count">—</span>
        <div class="mf-livedb-pager">
          <button id="mf-livedb-prev">&lsaquo; Prev</button>
          <span id="mf-livedb-page">page 1</span>
          <button id="mf-livedb-next">Next &rsaquo;</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  (overlay.querySelector('.mf-livedb-x') as HTMLElement).addEventListener('click', () => overlay.remove());

  const meta  = overlay.querySelector('#mf-livedb-meta')  as HTMLElement;
  const body  = overlay.querySelector('#mf-livedb-body')  as HTMLElement;
  const count = overlay.querySelector('#mf-livedb-count') as HTMLElement;
  const pageL = overlay.querySelector('#mf-livedb-page')  as HTMLElement;
  const prevB = overlay.querySelector('#mf-livedb-prev')  as HTMLButtonElement;
  const nextB = overlay.querySelector('#mf-livedb-next')  as HTMLButtonElement;

  let page = 1;
  const pageSize = 50;

  async function load() {
    body.innerHTML = '<div class="mf-livedb-loading">Loading rows…</div>';
    const r = await fetchRows(opts.ctx, opts.formId, page, pageSize);
    if (r.error) {
      meta.textContent = 'Error';
      body.innerHTML = '<div class="mf-livedb-err"><strong>Could not load live DB rows.</strong><br/>' + esc(r.error) + (r.hint ? '<br/><span style="color:#64748b">Hint: ' + esc(r.hint) + '</span>' : '') + '</div>';
      count.textContent = '';
      pageL.textContent = '';
      prevB.disabled = true; nextB.disabled = true;
      return;
    }
    meta.innerHTML = '<span><strong>[' + esc(r.schemaName || 'dbo') + '].[' + esc(r.tableName || '') + ']</strong> · idColumn=<code>' + esc(r.idColumn || 'Id') + '</code> · live SELECT (read-only Phase 3.1)</span>'
                   + '<span>' + (r.total || 0) + ' total rows</span>';
    const cols = r.columns || [];
    const rows = r.rows || [];
    if (!rows.length) {
      body.innerHTML = '<div class="mf-livedb-empty">No rows in this table yet.</div>';
    } else {
      let html = '<table class="mf-livedb-tbl"><thead><tr>';
      cols.forEach(c => { html += '<th title="' + esc(c.type) + '">' + esc(c.name) + '</th>'; });
      html += '</tr></thead><tbody>';
      rows.forEach(rrow => {
        html += '<tr>';
        for (let i = 0; i < cols.length; i++) html += '<td>' + fmt(rrow[i]) + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      body.innerHTML = html;
    }
    const total = r.total || 0;
    const start = (page - 1) * pageSize + 1;
    const end   = Math.min(page * pageSize, total);
    count.textContent = rows.length ? (start + '–' + end + ' of ' + total) : '0 rows';
    pageL.textContent = 'page ' + page;
    prevB.disabled = page <= 1;
    nextB.disabled = end >= total;
  }
  prevB.addEventListener('click', () => { if (page > 1) { page--; load(); } });
  nextB.addEventListener('click', () => { page++; load(); });
  load();
}

if (typeof window !== 'undefined') {
  (window as any).MFLiveDbModal = { open: openLiveDbRowsModal, badge: LIVEDB_MODAL_BADGE };
}
