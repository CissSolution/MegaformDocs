// ============================================================
// Submission Report — Jotform-style analytics  [B101 2026-06-08]
// ============================================================
// Rich per-form report: KPI strip + submissions-over-time chart +
// per-field analytics cards (donut for choices, bars for multi-select,
// stat tiles + histogram for numbers/ratings, response stats for text/date)
// + a raw Table view + CSV export.
//
// Data source: GET /api/MegaForm/Submissions?formId=N&pageSize=2000 — returns
// each row's full `dataJson` (admin sees all rows; RLS bypass for admins).
// We parse dataJson client-side so the report works on ANY submission,
// including seeded demo data that never hit the B55 flat index.
//
// Field schema (labels + types) from /api/MegaForm/Form/Get?formId=N.

const SUBMISSION_REPORT_BADGE = 'SubmissionReport v20260609-B102-DragMaxComplete';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_REPORT_BADGE__ = SUBMISSION_REPORT_BADGE;
}

type FieldRow = { key: string; label: string; type: string; options: string[]; required: boolean };
type Submission = { id: number; submittedOnUtc: string; status: string; data: Record<string, any> };

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#0ea5e9', '#a3e635'];

function apiBase(): string {
  const root = document.getElementById('mf-dash-root');
  return (root && root.getAttribute('data-api-base')) || '/api/MegaForm/';
}
function csrfHeaders(): Record<string, string> {
  const inp = document.querySelector('input[name="__RequestVerificationToken"]') as HTMLInputElement | null;
  return inp && inp.value ? { RequestVerificationToken: inp.value } : {};
}
function dom<T extends HTMLElement>(tag: string, cls?: string, html?: string): T {
  const e = document.createElement(tag) as T;
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function esc(s: any): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Field-type → chart kind ──────────────────────────────────────────────
type Kind = 'choice' | 'multi' | 'number' | 'date' | 'text';
function fieldKind(type: string): Kind {
  const t = String(type || '').toLowerCase();
  if (/^(select|radio|dropdown|imagechoice|boolean|yesno|country)$/.test(t)) return 'choice';
  if (/^(checkbox|multiselect|multicheckbox|multicolumncombobox)$/.test(t)) return 'multi';
  if (/^(number|rating|slider|opinionscale|range|calculator|currency)$/.test(t)) return 'number';
  if (/^(date|datetime|daterange|time|appointment)$/.test(t)) return 'date';
  return 'text';
}

// ── Value helpers ────────────────────────────────────────────────────────
function isEmpty(v: any): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}
function toList(v: any): string[] {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(x => x !== '');
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (s[0] === '[') { try { const a = JSON.parse(s); if (Array.isArray(a)) return a.map(String).filter(x => x !== ''); } catch { /* */ } }
  if (s.indexOf(',') >= 0) return s.split(',').map(x => x.trim()).filter(Boolean);
  return [s];
}
function num(v: any): number | null { const n = parseFloat(String(v)); return isFinite(n) ? n : null; }

// [Perf #9 2026-06-19] min/max via a single reduce loop. `Math.min(...arr)` /
// `Math.max(...arr)` spreads the whole array onto the call stack, which throws
// RangeError ("Maximum call stack size exceeded") once an array reaches ~100k+
// elements — a real crash on large submission sets (this report can pull 2000+
// rows × many fields). reduce is O(n) and never overflows the stack.
function arrMin(arr: number[], seed = Infinity): number { return arr.reduce((m, v) => (v < m ? v : m), seed); }
function arrMax(arr: number[], seed = -Infinity): number { return arr.reduce((m, v) => (v > m ? v : m), seed); }

// ── Chart renderers (inline SVG / divs, no lib) ──────────────────────────
function donutSvg(segs: { label: string; value: number; color: string }[], total: number, size = 132): string {
  const r = 52, cx = size / 2, cy = size / 2, sw = 22, C = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.filter(s => s.value > 0).map(s => {
    const dash = (s.value / total) * C;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${sw}" stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
    off += dash; return el;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:0 0 auto">` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f7" stroke-width="${sw}"/>` + arcs +
    `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="700" fill="#0f172a">${total}</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="#94a3b8">responses</text></svg>`;
}
function barRows(items: { label: string; value: number; color?: string }[], total: number): string {
  const max = arrMax(items.map(i => i.value), 1);
  return '<div style="display:flex;flex-direction:column;gap:7px;width:100%">' + items.map((i, idx) => {
    const pct = total > 0 ? Math.round((i.value / total) * 100) : 0;
    const w = Math.round((i.value / max) * 100);
    const c = i.color || PALETTE[idx % PALETTE.length];
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12px">` +
      `<div style="width:34%;min-width:90px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(i.label)}">${esc(i.label)}</div>` +
      `<div style="flex:1;background:#f1f5f9;border-radius:6px;height:18px;overflow:hidden"><div style="height:100%;width:${w}%;background:${c};border-radius:6px"></div></div>` +
      `<div style="width:78px;text-align:right;color:#475569;font-variant-numeric:tabular-nums"><b style="color:#0f172a">${i.value}</b> · ${pct}%</div></div>`;
  }).join('') + '</div>';
}
function legend(segs: { label: string; value: number; color: string }[], total: number): string {
  return '<div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:0">' + segs.map(s => {
    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:7px;font-size:12px">` +
      `<span style="width:10px;height:10px;border-radius:3px;background:${s.color};flex:0 0 auto"></span>` +
      `<span style="flex:1;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(s.label)}">${esc(s.label)}</span>` +
      `<span style="color:#475569;font-variant-numeric:tabular-nums"><b style="color:#0f172a">${s.value}</b> · ${pct}%</span></div>`;
  }).join('') + '</div>';
}
function statTiles(tiles: { label: string; value: string }[]): string {
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:8px;width:100%">' + tiles.map(t =>
    `<div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;padding:8px 10px;text-align:center">` +
    `<div style="font-size:17px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums">${esc(t.value)}</div>` +
    `<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${esc(t.label)}</div></div>`
  ).join('') + '</div>';
}

// ── Per-field analysis → card body HTML ──────────────────────────────────
function analyzeField(f: FieldRow, subs: Submission[]): string {
  const kind = fieldKind(f.type);
  const vals = subs.map(s => s.data[f.key]);
  const answered = vals.filter(v => !isEmpty(v)).length;
  const head = `<div style="font-size:11px;color:#94a3b8;margin-bottom:8px">${answered} of ${subs.length} answered</div>`;

  if (answered === 0) return head + '<div style="color:#cbd5e1;font-size:12px;padding:8px 0">No responses yet.</div>';

  if (kind === 'choice') {
    const counts: Record<string, number> = {};
    vals.forEach(v => { if (isEmpty(v)) return; const k = String(v); counts[k] = (counts[k] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const segs = entries.map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
    if (entries.length <= 8) {
      return head + `<div style="display:flex;gap:14px;align-items:center">${donutSvg(segs, answered)}${legend(segs, answered)}</div>`;
    }
    return head + barRows(segs.slice(0, 12), answered);
  }

  if (kind === 'multi') {
    const counts: Record<string, number> = {};
    vals.forEach(v => toList(v).forEach(opt => { counts[opt] = (counts[opt] || 0) + 1; }));
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    return head + barRows(entries.slice(0, 12), answered);
  }

  if (kind === 'number') {
    const nums = vals.map(num).filter((n): n is number => n != null);
    if (nums.length === 0) return head + '<div style="color:#cbd5e1;font-size:12px">No numeric responses.</div>';
    const sum = nums.reduce((a, b) => a + b, 0);
    const avg = sum / nums.length, min = arrMin(nums), max = arrMax(nums);
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    const tiles = statTiles([
      { label: 'Avg', value: fmt(avg) }, { label: 'Min', value: fmt(min) },
      { label: 'Max', value: fmt(max) }, { label: 'Sum', value: fmt(sum) },
    ]);
    // histogram of distinct values (if few) else 6 buckets
    const distinct = Array.from(new Set(nums)).sort((a, b) => a - b);
    let bars = '';
    if (distinct.length <= 10) {
      const counts: Record<number, number> = {};
      nums.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
      bars = barRows(distinct.map(d => ({ label: fmt(d), value: counts[d] })), nums.length);
    } else {
      const span = (max - min) || 1, nb = 6;
      const buckets = new Array(nb).fill(0);
      nums.forEach(n => { let b = Math.floor(((n - min) / span) * nb); if (b >= nb) b = nb - 1; buckets[b]++; });
      bars = barRows(buckets.map((c, i) => ({ label: fmt(min + (span / nb) * i) + '–' + fmt(min + (span / nb) * (i + 1)), value: c })), nums.length);
    }
    return head + tiles + '<div style="margin-top:10px">' + bars + '</div>';
  }

  if (kind === 'date') {
    const dates = vals.map(v => (isEmpty(v) ? null : new Date(String(v)))).filter((d): d is Date => !!d && !isNaN(d.getTime()));
    if (dates.length === 0) return head + '<div style="color:#cbd5e1;font-size:12px">No valid dates.</div>';
    const min = new Date(arrMin(dates.map(d => +d))), max = new Date(arrMax(dates.map(d => +d)));
    return head + statTiles([
      { label: 'Responses', value: String(dates.length) },
      { label: 'Earliest', value: min.toLocaleDateString() },
      { label: 'Latest', value: max.toLocaleDateString() },
    ]);
  }

  // text: response count + top values (if reasonably categorical) else samples
  const nonEmpty = vals.filter(v => !isEmpty(v)).map(v => String(v).trim());
  const counts: Record<string, number> = {};
  nonEmpty.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const uniq = Object.keys(counts).length;
  const tiles = statTiles([{ label: 'Responses', value: String(answered) }, { label: 'Unique', value: String(uniq) }]);
  if (uniq <= Math.max(8, answered * 0.6)) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
    return head + tiles + '<div style="margin-top:10px">' + barRows(entries, answered) + '</div>';
  }
  const samples = nonEmpty.slice(0, 4).map(s => `<div style="font-size:12px;color:#475569;padding:6px 8px;background:#f8fafc;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.slice(0, 80))}</div>`).join('');
  return head + tiles + '<div style="display:flex;flex-direction:column;gap:5px;margin-top:10px">' + samples + '</div>';
}

// ── Time-series (submissions per day) ────────────────────────────────────
function timeChart(subs: Submission[]): string {
  if (subs.length === 0) return '';
  const days: Record<string, number> = {};
  let min = Infinity, max = -Infinity;
  subs.forEach(s => { const d = new Date(s.submittedOnUtc); if (isNaN(d.getTime())) return; const key = d.toISOString().slice(0, 10); days[key] = (days[key] || 0) + 1; min = Math.min(min, +new Date(key)); max = Math.max(max, +new Date(key)); });
  if (!isFinite(min)) return '';
  const buckets: { key: string; count: number }[] = [];
  for (let t = min; t <= max; t += 86400000) { const key = new Date(t).toISOString().slice(0, 10); buckets.push({ key, count: days[key] || 0 }); }
  const list = buckets.length > 90 ? buckets.slice(-90) : buckets;
  const maxC = arrMax(list.map(b => b.count), 1);
  const total = list.reduce((a, b) => a + b.count, 0);
  // Each bar is a full-height (100%) flex column whose inner fill is a % of the
  // column — the wrapper MUST be height:100% or the inner %-height collapses to 0.
  const bars = list.map(b => {
    const h = b.count > 0 ? Math.max(4, Math.round((b.count / maxC) * 100)) : 0;
    return `<div title="${b.key}: ${b.count} submission(s)" style="flex:1 1 0;min-width:2px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center">` +
      `<div style="width:80%;max-width:24px;height:${h}%;background:linear-gradient(180deg,#818cf8,#6366f1);border-radius:3px 3px 0 0;transition:height .2s"></div></div>`;
  }).join('');
  const first = list[0].key, last = list[list.length - 1].key;
  return `<div style="border:1px solid #eef2f7;border-radius:12px;padding:14px 16px;background:#fff">` +
    `<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px">` +
    `<div style="font-size:13px;font-weight:600;color:#0f172a">Submissions over time</div>` +
    `<div style="font-size:11px;color:#94a3b8">${total} total · peak ${maxC}/day</div></div>` +
    `<div style="position:relative;height:120px;border-bottom:1px solid #eef2f7">` +
    `<div style="position:absolute;top:0;left:0;font-size:9px;color:#cbd5e1">${maxC}</div>` +
    `<div style="display:flex;align-items:flex-end;gap:2px;height:100%;width:100%">${bars}</div></div>` +
    `<div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;margin-top:6px"><span>${first}</span><span>${last}</span></div></div>`;
}

// ── Modal shell (draggable + maximizable) ────────────────────────────────
const BOX_NORMAL_CSS = 'background:#f8fafc;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.3);max-width:1120px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;position:relative;';
const BOX_MAX_CSS = 'background:#f8fafc;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,.35);max-width:none;width:98vw;height:96vh;max-height:96vh;display:flex;flex-direction:column;overflow:hidden;position:relative;';

function buildModalShell(title: string): { ov: HTMLElement; body: HTMLElement } {
  document.getElementById('mf-submission-report-overlay')?.remove();
  const ov = dom<HTMLDivElement>('div');
  ov.id = 'mf-submission-report-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:200010;display:flex;align-items:center;justify-content:center;padding:24px;';
  const box = dom<HTMLDivElement>('div');
  box.style.cssText = BOX_NORMAL_CSS;

  // drag state (transform translate, reset on maximize)
  let tx = 0, ty = 0, maximized = false;
  const applyTransform = () => { box.style.transform = `translate(${tx}px, ${ty}px)`; };

  const hd = dom<HTMLDivElement>('div');
  hd.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px 12px 20px;border-bottom:1px solid #e2e8f0;background:#fff;flex:0 0 auto;cursor:move;user-select:none;';
  const titleEl = dom('div', '', `<span style="margin-right:6px">📊</span>${esc(title)}`);
  titleEl.style.cssText = 'font-size:15px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  hd.appendChild(titleEl);

  const ctrls = dom('div'); ctrls.style.cssText = 'display:flex;align-items:center;gap:4px;flex:0 0 auto;';
  const mkIcon = (html: string, tip: string) => { const b = dom<HTMLButtonElement>('button'); b.type = 'button'; b.title = tip; b.innerHTML = html; b.style.cssText = 'background:transparent;border:0;width:30px;height:30px;border-radius:7px;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;'; b.addEventListener('mouseenter', () => b.style.background = '#f1f5f9'); b.addEventListener('mouseleave', () => b.style.background = 'transparent'); b.addEventListener('pointerdown', e => e.stopPropagation()); return b; };

  const maxBtn = mkIcon('⛶', 'Maximize / Restore');
  const reset = mkIcon('⤢', 'Reset position');
  reset.style.display = 'none';
  const close = mkIcon('✕', 'Close');
  close.style.fontSize = '14px';

  maxBtn.addEventListener('click', () => {
    maximized = !maximized;
    tx = 0; ty = 0; applyTransform();
    box.style.cssText = (maximized ? BOX_MAX_CSS : BOX_NORMAL_CSS);
    box.style.transform = 'translate(0px, 0px)';
    maxBtn.innerHTML = maximized ? '🗗' : '⛶';
  });
  reset.addEventListener('click', () => { tx = 0; ty = 0; applyTransform(); reset.style.display = 'none'; });
  close.addEventListener('click', () => ov.remove());
  ctrls.appendChild(reset); ctrls.appendChild(maxBtn); ctrls.appendChild(close);
  hd.appendChild(ctrls);

  // drag by header (pointer events; ignores the control buttons via stopPropagation above)
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  hd.addEventListener('pointerdown', (e: PointerEvent) => {
    dragging = true; sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
    hd.setPointerCapture(e.pointerId);
  });
  hd.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    tx = ox + (e.clientX - sx); ty = oy + (e.clientY - sy);
    applyTransform();
    if (tx !== 0 || ty !== 0) reset.style.display = '';
  });
  const endDrag = (e: PointerEvent) => { if (dragging) { dragging = false; try { hd.releasePointerCapture(e.pointerId); } catch { /* */ } } };
  hd.addEventListener('pointerup', endDrag);
  hd.addEventListener('pointercancel', endDrag);

  const body = dom<HTMLDivElement>('div');
  body.style.cssText = 'padding:16px 20px;overflow:auto;display:flex;flex-direction:column;gap:14px;flex:1 1 auto;';
  box.appendChild(hd); box.appendChild(body); ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.addEventListener('keydown', function esc2(ev) { if (ev.key === 'Escape' && document.getElementById('mf-submission-report-overlay')) { ov.remove(); document.removeEventListener('keydown', esc2); } });
  return { ov, body };
}

async function loadFieldSchema(formId: number): Promise<{ title: string; fields: FieldRow[] }> {
  try {
    const r = await fetch(apiBase() + 'Form/Get?formId=' + formId, { credentials: 'same-origin', headers: csrfHeaders() });
    if (!r.ok) return { title: '', fields: [] };
    const data: any = await r.json();
    const schemaJson: string = data?.schemaJson || data?.SchemaJson || '';
    let schema: any = {}; try { schema = JSON.parse(schemaJson || '{}'); } catch { /* */ }
    const out: FieldRow[] = [];
    const walk = (list: any[]) => (list || []).forEach((f: any) => {
      if (!f) return;
      if (f.type === 'Row' && Array.isArray(f.columns)) { f.columns.forEach((c: any) => walk(c?.fields || [])); return; }
      const key = String(f.key || '').trim();
      if (!key || /Section|Html|Captcha|Hidden|Signature|File|Button/i.test(String(f.type || ''))) return;
      const required = !!(f.required ?? f.isRequired ?? f.validation?.required ?? (Array.isArray(f.validators) && f.validators.some((v: any) => /required/i.test(String(v?.type || v)))));
      out.push({ key, label: f.label || key, type: f.type || 'Text', options: (f.options || []).map((o: any) => String(o.value ?? o.label ?? '')), required });
    });
    walk(schema?.fields || []);
    return { title: data?.title || data?.Title || '', fields: out };
  } catch { return { title: '', fields: [] }; }
}

// [SourcePicker v20260716] source='sql' reads the live SQL table the form mirrors (same unified
// Submissions endpoint as the dashboard — the server routes and echoes what actually answered).
// The echo fields drive the report's own source toggle; trust only them, never the request.
async function loadSubmissions(formId: number, source?: string): Promise<{
  subs: Submission[]; sqlCapable: boolean; appliedSource: string; sqlTable: string;
}> {
  const src = source === 'sql' ? '&source=sql' : '';
  const r = await fetch(apiBase() + 'Submissions?formId=' + formId + '&pageSize=2000' + src, { credentials: 'same-origin', headers: csrfHeaders(), cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j: any = await r.json();
  const items = j.items || j.Items || [];
  const subs = items.map((it: any) => {
    let data: Record<string, any> = {};
    const raw = it.dataJson || it.DataJson;
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    return { id: it.submissionId || it.SubmissionId, submittedOnUtc: it.submittedOnUtc || it.SubmittedOnUtc, status: it.status || it.Status || '', data };
  });
  return {
    subs,
    sqlCapable: (j.sqlCapable ?? j.SqlCapable) === true,
    appliedSource: j.source ?? j.Source ?? '',
    sqlTable: j.sqlTable ?? j.SqlTable ?? '',
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────
function downloadCsv(filename: string, fields: FieldRow[], subs: Submission[]): void {
  const escc = (v: any) => { if (v == null) return ''; const s = (Array.isArray(v) ? v.join('; ') : String(v)).replace(/"/g, '""'); return /[",\n]/.test(s) ? '"' + s + '"' : s; };
  const headers = ['Submitted'].concat(fields.map(f => f.label));
  const lines = [headers.map(escc).join(',')];
  subs.forEach(s => lines.push([new Date(s.submittedOnUtc).toLocaleString()].concat(fields.map(f => escc(s.data[f.key]))).join(',')));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 50);
}

export async function openSubmissionReport(formId: number, formName: string): Promise<void> {
  const { ov, body } = buildModalShell('Report — ' + (formName || 'Form #' + formId));
  body.innerHTML = '<div style="color:#64748b;font-size:13px;padding:40px;text-align:center">Loading report…</div>';

  let schema: { title: string; fields: FieldRow[] };
  let allSubs: Submission[];
  let sqlCapable = false;
  try {
    const [sch, first] = await Promise.all([loadFieldSchema(formId), loadSubmissions(formId)]);
    schema = sch; allSubs = first.subs; sqlCapable = first.sqlCapable;
  } catch (e: any) {
    body.innerHTML = '<div style="color:#dc2626;font-size:13px;padding:30px;text-align:center">Failed to load: ' + esc(e?.message || 'error') + '</div>';
    return;
  }
  // [SourcePicker v20260716] In SQL mode the row keys are the table's COLUMN NAMES, not the form's
  // field keys — the analysed fields are derived from the data itself so the cards aren't empty.
  const schemaFields = schema.fields;
  let fields = schemaFields;
  let source: 'submissions' | 'sql' = 'submissions';
  function deriveSqlFields(subs: Submission[]): FieldRow[] {
    const keys = new Set<string>();
    subs.forEach(s => Object.keys(s.data || {}).forEach(k => keys.add(k)));
    return Array.from(keys).slice(0, 24).map(k => ({ key: k, label: k, type: 'Text', options: [], required: false }));
  }
  body.innerHTML = '';

  // ── Controls bar ──
  const bar = dom<HTMLDivElement>('div');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:#fff;border:1px solid #eef2f7;border-radius:12px;padding:12px 14px;';
  const mkDate = (ph: string) => { const i = dom<HTMLInputElement>('input'); i.type = 'date'; i.style.cssText = 'padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;'; i.title = ph; return i; };
  const fromInp = mkDate('From'), toInp = mkDate('To');
  const lbl = (t: string, el: HTMLElement) => { const w = dom('div'); w.style.cssText = 'display:flex;flex-direction:column;gap:3px'; const l = dom('label'); l.textContent = t; l.style.cssText = 'font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em'; w.appendChild(l); w.appendChild(el); return w; };
  bar.appendChild(lbl('From', fromInp)); bar.appendChild(lbl('To', toInp));
  // [SourcePicker v20260716] Source toggle — only when the server said this form HAS a SQL source.
  if (sqlCapable) {
    const srcSel = dom<HTMLSelectElement>('select');
    srcSel.style.cssText = 'padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;background:#fff';
    srcSel.innerHTML = '<option value="submissions">Submissions</option><option value="sql">SQL table</option>';
    srcSel.addEventListener('change', async () => {
      const want = srcSel.value === 'sql' ? 'sql' : 'submissions';
      content.innerHTML = '<div style="color:#64748b;font-size:13px;padding:40px;text-align:center">Loading…</div>';
      try {
        const r = await loadSubmissions(formId, want === 'sql' ? 'sql' : undefined);
        if (want === 'sql' && r.appliedSource !== 'sql') throw new Error('SQL source unavailable');
        source = want;
        allSubs = r.subs;
        fields = source === 'sql' ? deriveSqlFields(allSubs) : schemaFields;
      } catch {
        // Honest fallback — never render JSON rows under a "SQL table" label.
        source = 'submissions'; srcSel.value = 'submissions';
        try { const r2 = await loadSubmissions(formId); allSubs = r2.subs; } catch { allSubs = []; }
        fields = schemaFields;
      }
      rerender();
    });
    bar.appendChild(lbl('Source', srcSel));
  }
  const spacer = dom('div'); spacer.style.cssText = 'flex:1'; bar.appendChild(spacer);
  const toggle = dom<HTMLDivElement>('div'); toggle.style.cssText = 'display:inline-flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden';
  const tabSummary = dom<HTMLButtonElement>('button'); tabSummary.textContent = 'Summary'; tabSummary.type = 'button';
  const tabTable = dom<HTMLButtonElement>('button'); tabTable.textContent = 'Table'; tabTable.type = 'button';
  [tabSummary, tabTable].forEach(b => b.style.cssText = 'border:0;background:#fff;color:#475569;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer');
  toggle.appendChild(tabSummary); toggle.appendChild(tabTable); bar.appendChild(toggle);
  const csvBtn = dom<HTMLButtonElement>('button'); csvBtn.type = 'button'; csvBtn.innerHTML = '⤓ CSV';
  csvBtn.style.cssText = 'border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer';
  bar.appendChild(csvBtn);
  body.appendChild(bar);

  const content = dom<HTMLDivElement>('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:14px';
  body.appendChild(content);

  let view: 'summary' | 'table' = 'summary';
  function setActiveTab() {
    tabSummary.style.background = view === 'summary' ? '#4f46e5' : '#fff';
    tabSummary.style.color = view === 'summary' ? '#fff' : '#475569';
    tabTable.style.background = view === 'table' ? '#4f46e5' : '#fff';
    tabTable.style.color = view === 'table' ? '#fff' : '#475569';
  }

  function filtered(): Submission[] {
    const f = fromInp.value ? new Date(fromInp.value + 'T00:00:00') : null;
    const t = toInp.value ? new Date(toInp.value + 'T23:59:59') : null;
    return allSubs.filter(s => { const d = new Date(s.submittedOnUtc); if (f && d < f) return false; if (t && d > t) return false; return true; });
  }

  function renderSummary(subs: Submission[]) {
    content.innerHTML = '';
    if (subs.length === 0) { content.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:14px">No submissions in this range.</div>'; return; }
    const dates = subs.map(s => new Date(s.submittedOnUtc)).filter(d => !isNaN(d.getTime()));
    const minD = dates.length ? new Date(arrMin(dates.map(d => +d))) : null;
    const maxD = dates.length ? new Date(arrMax(dates.map(d => +d))) : null;
    const spanDays = minD && maxD ? Math.max(1, Math.round((+maxD - +minD) / 86400000) + 1) : 1;
    const last7 = subs.filter(s => +new Date(s.submittedOnUtc) >= Date.now() - 7 * 86400000).length;
    // Completeness mechanism: measure fill-rate against REQUIRED fields when the
    // form declares any (a submission is "complete" only if its required answers
    // are present); fall back to all analysed fields when none are marked required.
    const reqFields = fields.filter(f => f.required);
    const basis = reqFields.length ? reqFields : fields;
    // [Perf #9 2026-06-19] Single O(subs × basis) pass for BOTH completeness
    // (avg fill-rate) and fullyComplete (every basis field answered) — previously
    // this scanned `subs` twice (reduce + filter), each re-scanning `basis`.
    // Values are identical to the prior two-pass form.
    let completeness = 0, fullyComplete = subs.length;
    if (basis.length) {
      let fillSum = 0, fullCount = 0;
      for (const s of subs) {
        let answered = 0;
        for (const f of basis) if (!isEmpty(s.data[f.key])) answered++;
        fillSum += answered / basis.length;
        if (answered === basis.length) fullCount++;
      }
      completeness = Math.round(fillSum / subs.length * 100);
      fullyComplete = fullCount;
    }
    const complTip = (reqFields.length
      ? `Avg fill-rate across the ${reqFields.length} required field(s). ${fullyComplete}/${subs.length} submissions have every required field answered.`
      : `No fields are marked required, so this is the avg fill-rate across all ${fields.length} analysed fields. ${fullyComplete}/${subs.length} submissions are fully filled.`);

    // KPI strip
    const kpis = [
      { v: String(subs.length), l: 'Total responses', c: '#6366f1', t: 'Submissions in the selected date range.' },
      { v: (subs.length / spanDays).toFixed(1), l: 'Avg / day', c: '#22c55e', t: `${subs.length} submissions over ${spanDays} day(s).` },
      { v: String(last7), l: 'Last 7 days', c: '#f59e0b', t: 'Submissions received in the last 7 days.' },
      { v: completeness + '%', l: reqFields.length ? 'Avg completeness (required)' : 'Avg completeness', c: '#06b6d4', t: complTip },
      { v: minD ? minD.toLocaleDateString() : '—', l: 'First response', c: '#8b5cf6', t: minD ? minD.toLocaleString() : '' },
      { v: maxD ? maxD.toLocaleDateString() : '—', l: 'Latest response', c: '#ec4899', t: maxD ? maxD.toLocaleString() : '' },
    ];
    const kpiWrap = dom('div'); kpiWrap.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px';
    kpiWrap.innerHTML = kpis.map(k =>
      `<div title="${esc(k.t)}" style="background:#fff;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px;border-left:3px solid ${k.c};cursor:default">` +
      `<div style="font-size:24px;font-weight:800;color:#0f172a;font-variant-numeric:tabular-nums">${esc(k.v)}</div>` +
      `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${esc(k.l)}</div></div>`).join('');
    content.appendChild(kpiWrap);

    // time chart
    const tc = dom('div'); tc.innerHTML = timeChart(subs); if (tc.firstChild) content.appendChild(tc);

    // per-field cards
    if (fields.length) {
      const grid = dom('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px';
      fields.forEach(f => {
        const card = dom('div'); card.style.cssText = 'background:#fff;border:1px solid #eef2f7;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column';
        const kindLabel = fieldKind(f.type);
        card.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;gap:8px">` +
          `<div style="font-size:13px;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(f.label)}${f.required ? ' (required)' : ''}">${esc(f.label)}${f.required ? '<span style="color:#ef4444;margin-left:3px" title="Required">*</span>' : ''}</div>` +
          `<span style="font-size:10px;color:#94a3b8;background:#f1f5f9;border-radius:999px;padding:2px 8px;text-transform:capitalize;flex:0 0 auto">${esc(kindLabel)}</span></div>` +
          analyzeField(f, subs);
        grid.appendChild(card);
      });
      content.appendChild(grid);
    }
  }

  function renderTable(subs: Submission[]) {
    content.innerHTML = '';
    const wrap = dom('div'); wrap.style.cssText = 'background:#fff;border:1px solid #eef2f7;border-radius:12px;overflow:auto;max-height:62vh';
    if (subs.length === 0) { wrap.innerHTML = '<div style="padding:36px;text-align:center;color:#94a3b8">No submissions.</div>'; content.appendChild(wrap); return; }
    const cols = fields.slice(0, 12);
    // [Perf #9 2026-06-19] Cap the rendered <tr> count so the Table tab never
    // builds 100k DOM rows at once (that froze the tab / crashed the browser).
    // Aggregates (Summary tab + CSV export) still run over ALL rows; only this
    // raw table preview is windowed. With <= the cap this is byte-identical to
    // before (no note shown).
    const TABLE_RENDER_CAP = 200;
    const shown = subs.length > TABLE_RENDER_CAP ? subs.slice(0, TABLE_RENDER_CAP) : subs;
    const th = (h: string) => `<th style="padding:9px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #eef2f7;position:sticky;top:0;color:#475569;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${esc(h)}</th>`;
    const td = (v: any) => { const s = Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v)); return `<td style="padding:7px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:12.5px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s)}">${esc(s)}</td>`; };
    wrap.innerHTML = '<table style="width:100%;border-collapse:collapse"><thead><tr>' +
      th('Submitted') + cols.map(c => th(c.label)).join('') + '</tr></thead><tbody>' +
      shown.map(s => '<tr>' + td(new Date(s.submittedOnUtc).toLocaleString()) + cols.map(c => td(s.data[c.key])).join('') + '</tr>').join('') +
      '</tbody></table>';
    content.appendChild(wrap);
    if (subs.length > TABLE_RENDER_CAP) {
      const note = dom('div');
      note.style.cssText = 'padding:8px 4px 0;font-size:11px;color:#94a3b8;text-align:center';
      note.textContent = `Showing first ${TABLE_RENDER_CAP} of ${subs.length} rows. Use CSV export or the date filter to see the rest.`;
      content.appendChild(note);
    }
  }

  function rerender() { const subs = filtered(); if (view === 'summary') renderSummary(subs); else renderTable(subs); }

  tabSummary.addEventListener('click', () => { view = 'summary'; setActiveTab(); rerender(); });
  tabTable.addEventListener('click', () => { view = 'table'; setActiveTab(); rerender(); });
  fromInp.addEventListener('change', rerender);
  toInp.addEventListener('change', rerender);
  csvBtn.addEventListener('click', () => downloadCsv('report-' + formId + '-' + new Date().toISOString().slice(0, 10) + '.csv', fields, filtered()));

  setActiveTab();
  rerender();
}
