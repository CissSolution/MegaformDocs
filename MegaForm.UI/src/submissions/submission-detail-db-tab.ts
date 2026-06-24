/*
 * submission-detail-db-tab.ts - R6.5 v20260531-02
 *
 * Read-only database view for a submission. It calls
 * /AiTools/SubmissionDbView?submissionId=N and renders the bound master row
 * plus DataGrid child rows when the form has SQL-backed storage.
 */

import { h } from '@shared/dom';

const BADGE = 'SubmissionDetailDbTab v20260531-R6.5-02';

interface ColumnInfo { name: string; type?: string; }
interface ChildBlock { fieldKey: string; table: string; schema: string; parentKey?: string; columns: ColumnInfo[]; rows: any[]; mapping: string; }
interface MasterBlock { table: string; schema: string; idColumn?: string; columns: ColumnInfo[]; row: any; mapping: string; note?: string; }
interface DbViewResponse { submissionId: number; formId: number; master: MasterBlock | null; children: ChildBlock[]; badge: string; error?: string; }

function apiBase(): string {
  const w = window as any;
  const plat = w.__MF_PLATFORM__ || {};
  if (typeof plat.apiBase === 'string' && plat.apiBase) return String(plat.apiBase).replace(/\/?$/, '/');
  // [B51] Platform-aware fallback
  const platform = String(plat.platform || '').toLowerCase();
  if (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]')) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}

export function renderSubmissionDbTab(submissionId: number): HTMLElement {
  void BADGE;
  const root = h('div', { class: 'mf-subdetail-db-tab' });
  const head = h('div', { class: 'mf-subdetail-db-head' },
    h('div', { class: 'mf-subdetail-db-title' },
      h('i', { class: 'fas fa-database' }),
      h('strong', null, 'Live database view'),
      h('code', null, '#' + submissionId),
    ),
    h('span', { class: 'mf-subdetail-db-badge' }, 'Read-only'),
  );
  const body = h('div', { class: 'mf-subdetail-db-body' });
  root.appendChild(head);
  root.appendChild(body);

  if (!submissionId || submissionId <= 0) {
    body.appendChild(emptyNote('Could not load DB View: submissionId is missing.'));
    return root;
  }

  body.appendChild(h('div', { class: 'mf-subdetail-db-loading' },
    h('i', { class: 'fas fa-circle-notch fa-spin', style: 'margin-right:6px' }),
    'Loading live database rows...'));

  fetch(apiBase() + 'AiTools/SubmissionDbView?submissionId=' + encodeURIComponent(String(submissionId)), { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error('HTTP ' + r.status + ': ' + t.slice(0, 240)); }))
    .then((d: DbViewResponse) => {
      body.innerHTML = '';
      if (!d || (d as any).error) {
        body.appendChild(emptyNote('DB View unavailable: ' + ((d as any)?.error || 'no data')));
        return;
      }
      if (!d.master && (!d.children || d.children.length === 0)) {
        body.appendChild(emptyNote('This form is not bound to any database table. Submissions persist as JSON only.'));
        return;
      }
      if (d.master) body.appendChild(renderMasterBlock(d.master));
      if (Array.isArray(d.children)) d.children.forEach(c => body.appendChild(renderChildBlock(c)));
    })
    .catch(err => {
      body.innerHTML = '';
      body.appendChild(emptyNote('Could not load DB View: ' + (err?.message || String(err))));
    });

  return root;
}

function emptyNote(msg: string): HTMLElement {
  return h('div', { class: 'mf-subdetail-db-empty' }, msg);
}

function renderMasterBlock(m: MasterBlock): HTMLElement {
  const wrap = h('div', { class: 'mf-subdetail-db-section' });
  wrap.appendChild(blockHeader('Master row', m.schema + '.' + m.table, m.mapping));
  if (!m.row) {
    wrap.appendChild(emptyNote('No matching row in ' + m.table + ' (mapping: ' + m.mapping + ')'));
    return wrap;
  }
  const list = h('div', { class: 'mf-subdetail-db-keyvals' });
  m.columns.forEach(c => {
    const v = m.row[c.name];
    list.appendChild(h('div', { class: 'mf-subdetail-db-key' }, c.name));
    list.appendChild(cellValue(c, v));
  });
  wrap.appendChild(list);
  return wrap;
}

function renderChildBlock(c: ChildBlock): HTMLElement {
  const wrap = h('div', { class: 'mf-subdetail-db-section' });
  wrap.appendChild(blockHeader(c.fieldKey || 'Child rows', c.schema + '.' + c.table, c.mapping));
  if (!c.rows || c.rows.length === 0) {
    wrap.appendChild(emptyNote('No rows linked to this submission in ' + c.table + ' (mapping: ' + c.mapping + ')'));
    return wrap;
  }

  const table = h('table', { class: 'mf-subdetail-db-table' });
  const thead = h('thead', null);
  const headRow = h('tr', null);
  c.columns.forEach(col => headRow.appendChild(h('th', null, col.name)));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = h('tbody', null);
  c.rows.forEach(r => {
    const tr = h('tr', null);
    c.columns.forEach(col => {
      const td = h('td', null);
      td.appendChild(cellValue(col, r[col.name]));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  wrap.appendChild(h('div', { class: 'mf-subdetail-db-footnote' },
    String(c.rows.length) + ' row' + (c.rows.length === 1 ? '' : 's') + ' | table: ' + c.table + (c.parentKey ? ' | joined via ' + c.parentKey : '')));
  return wrap;
}

function blockHeader(title: string, fqTable: string, mapping: string): HTMLElement {
  return h('div', { class: 'mf-subdetail-db-block-head' },
    h('strong', null, title),
    h('code', null, fqTable),
    h('span', null, 'mapping: ' + mapping),
  );
}

function cellValue(col: ColumnInfo, val: any): HTMLElement {
  if (val === null || val === undefined || val === '') {
    return h('span', { class: 'mf-subdetail-db-null' }, '-');
  }
  const name = (col.name || '').toLowerCase();
  const type = (col.type || '').toLowerCase();
  if (/image|photo|avatar|thumb|url/.test(name) && typeof val === 'string' && /^https?:|^\//.test(val)) {
    return h('img', { class: 'mf-subdetail-db-thumb', src: String(val), alt: '', loading: 'lazy' } as any);
  }
  if (/date|time/.test(type) || /createdon|updatedon|loggedon/.test(name)) {
    return h('span', { class: 'mf-subdetail-db-date' }, formatDate(val));
  }
  if (/price|amount|total|cost|unit/.test(name)) {
    return h('span', { class: 'mf-subdetail-db-money' }, String(val));
  }
  if (typeof val === 'number') {
    return h('span', { class: 'mf-subdetail-db-number' }, String(val));
  }
  return h('span', { class: 'mf-subdetail-db-text' }, String(val));
}

function formatDate(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toISOString().replace('T', ' ').slice(0, 19);
  }
  return String(v);
}

if (typeof window !== 'undefined') {
  (window as any).__MF_RenderDbView = (submissionId: number) => renderSubmissionDbTab(submissionId);
}
