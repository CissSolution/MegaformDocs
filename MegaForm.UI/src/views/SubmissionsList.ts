// ============================================================
// Submissions List — main table with pagination + filters
// ============================================================

import { h, clear, esc, $, $$ } from '@shared/dom';
import type { PlatformAdapter, InitContext } from '@core/platform';

interface SubmissionRow {
  submissionId: number;
  submittedOnUtc: string;
  status: string;
  ipAddress: string;
  userId: number;
  dataJson: string;
  isSpam: boolean;
}

interface SubsState {
  formId: number;
  submissions: SubmissionRow[];
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  selected: Set<number>;
  schema: any;
}

const state: SubsState = {
  formId: 0,
  submissions: [],
  pageIndex: 0,
  pageSize: 50,
  totalCount: 0,
  selected: new Set(),
  schema: null,
};

let _adapter: PlatformAdapter;
let _root: HTMLElement;

export function mountSubmissions(root: HTMLElement, adapter: PlatformAdapter, ctx: InitContext): void {
  _adapter = adapter;
  _root = root;
  state.formId = ctx.formId;

  clear(root);
  root.className = 'mf-subs-wrapper';

  if (!state.formId) {
    root.appendChild(h('div', { class: 'mf-subs-empty' }, 'No form selected.'));
    return;
  }

  // Load form schema for field labels
  loadSchema().then(() => {
    renderShell();
    loadSubmissions();
  });
}

async function loadSchema(): Promise<void> {
  try {
    const form = await _adapter.api.getForm(state.formId);
    const schemaStr = (form as any).SchemaJson || (form as any).schemaJson || '{}';
    state.schema = JSON.parse(schemaStr);
  } catch { state.schema = null; }
}

function renderShell(): void {
  clear(_root);

  // Toolbar: search + filters + export
  const toolbar = h('div', { class: 'mf-subs-toolbar' },
    h('input', { type: 'text', class: 'mf-subs-search', id: 'mf-subs-search', placeholder: 'Search submissions...' }),
    h('select', { class: 'mf-subs-filter', id: 'mf-subs-status' },
      h('option', { value: '' }, 'All Status'),
      h('option', { value: 'Submitted' }, 'New'),
      h('option', { value: 'Read' }, 'Read'),
      h('option', { value: 'Starred' }, 'Starred'),
    ),
    h('button', { type: 'button', class: 'mf-subs-btn', onclick: applyFilters },
      h('i', { class: 'fas fa-search' }), ' Filter'),
    h('button', { type: 'button', class: 'mf-subs-btn', onclick: clearFilters },
      h('i', { class: 'fas fa-times' }), ' Clear'),
    h('span', { style: 'flex:1;' }),
    h('button', { type: 'button', class: 'mf-subs-btn mf-subs-btn-export', onclick: () => exportData('csv') },
      h('i', { class: 'fas fa-download' }), ' Export CSV'),
  );

  // Bulk bar
  const bulkBar = h('div', { class: 'mf-subs-bulk', id: 'mf-subs-bulk', style: 'display:none;' },
    h('span', { id: 'mf-subs-bulk-count' }, '0 selected'),
    h('button', { type: 'button', class: 'mf-subs-btn', onclick: () => bulkAction('Read') }, 'Mark Read'),
    h('button', { type: 'button', class: 'mf-subs-btn', onclick: () => bulkAction('Starred') }, 'Star'),
    h('button', { type: 'button', class: 'mf-subs-btn mf-subs-btn-danger', onclick: () => bulkAction('delete') }, 'Delete'),
  );

  // Table
  const table = h('table', { class: 'mf-subs-table' },
    h('thead', null, h('tr', { id: 'mf-subs-thead' })),
    h('tbody', { id: 'mf-subs-tbody' }),
  );

  // Pagination
  const pagination = h('div', { class: 'mf-subs-pagination', id: 'mf-subs-pagination' });

  // Info
  const info = h('div', { class: 'mf-subs-info' },
    h('span', null, 'Showing '),
    h('strong', { id: 'mf-subs-showing' }, '0'),
    h('span', null, ' of '),
    h('strong', { id: 'mf-subs-total' }, '0'),
    h('span', null, ' submissions'),
  );

  // Modal
  const modal = h('div', { class: 'mf-subs-modal', id: 'mf-subs-modal', style: 'display:none;' },
    h('div', { class: 'mf-subs-modal-overlay', onclick: closeModal }),
    h('div', { class: 'mf-subs-modal-box' },
      h('div', { class: 'mf-subs-modal-header' },
        h('h3', { id: 'mf-subs-modal-title' }, 'Submission'),
        h('button', { type: 'button', class: 'mf-subs-modal-close', onclick: closeModal }, '×'),
      ),
      h('div', { class: 'mf-subs-modal-body', id: 'mf-subs-modal-body' }),
    ),
  );

  _root.appendChild(toolbar);
  _root.appendChild(bulkBar);
  _root.appendChild(table);
  _root.appendChild(info);
  _root.appendChild(pagination);
  _root.appendChild(modal);
}

async function loadSubmissions(): Promise<void> {
  const search = ($('#mf-subs-search', _root) as HTMLInputElement)?.value || '';
  const status = ($('#mf-subs-status', _root) as HTMLSelectElement)?.value || '';

  try {
    const result = await _adapter.api.getSubmissions(state.formId, {
      search, status,
      pageIndex: state.pageIndex,
      pageSize: state.pageSize,
    });
    state.submissions = (result.items || []) as any;
    state.totalCount = result.totalCount || 0;
    state.selected.clear();
    renderTable();
    renderPagination();
    updateInfo();
  } catch (err) {
    console.error('Load submissions error:', err);
    const tbody = $('#mf-subs-tbody', _root);
    if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:40px;">Error loading submissions</td></tr>`;
  }
}

function getDisplayFields(): Array<{ key: string; label: string }> {
  const fields: Array<{ key: string; label: string }> = [];
  if (!state.schema?.fields) return fields;

  function flatten(arr: any[]): void {
    (arr || []).forEach((f: any) => {
      if (fields.length >= 4) return;
      const t = f.type || f.Type;
      if (t === 'Html' || t === 'Section' || t === 'Hidden' || t === 'File' || t === 'Row') {
        if (t === 'Row' && f.columns) {
          f.columns.forEach((col: any) => flatten(col.fields || []));
        }
        return;
      }
      fields.push({ key: f.key || f.Key, label: f.label || f.Label || f.key });
    });
  }
  flatten(state.schema.fields || state.schema.Fields || []);
  return fields;
}

function renderTable(): void {
  const thead = $('#mf-subs-thead', _root);
  const tbody = $('#mf-subs-tbody', _root);
  if (!thead || !tbody) return;

  const displayFields = getDisplayFields();

  // Header
  thead.innerHTML = '';
  const headerRow = h('tr', null,
    h('th', { style: 'width:30px;' }, h('input', { type: 'checkbox', onchange: toggleSelectAll })),
    h('th', null, '#'),
    h('th', null, 'Date'),
    ...displayFields.map(f => h('th', null, f.label)),
    h('th', null, 'Status'),
    h('th', { style: 'width:100px;' }, 'Actions'),
  );
  thead.appendChild(headerRow);

  // Body
  tbody.innerHTML = '';
  if (state.submissions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${4 + displayFields.length}" style="text-align:center;color:#94a3b8;padding:40px;">No submissions found</td></tr>`;
    return;
  }

  state.submissions.forEach(sub => {
    const data = parseData(sub);
    const subId = sub.submissionId || (sub as any).SubmissionId;
    const statusVal = sub.status || (sub as any).Status || 'Submitted';

    const cells: (HTMLElement | null)[] = [
      h('td', null, h('input', { type: 'checkbox', class: 'mf-sub-check', 'data-id': String(subId), onchange: updateBulkBar })),
      h('td', null, String(subId)),
      h('td', null, formatDate(sub.submittedOnUtc || (sub as any).SubmittedOnUtc)),
    ];

    displayFields.forEach(dk => {
      let val = data[dk.key] || '';
      if (Array.isArray(val)) val = val.join(', ');
      if (typeof val === 'object') val = JSON.stringify(val);
      val = String(val);
      if (val.length > 50) val = val.substring(0, 50) + '...';
      cells.push(h('td', null, val));
    });

    cells.push(h('td', null, h('span', { class: `mf-badge mf-badge-${statusBadgeClass(statusVal)}` }, statusVal)));
    cells.push(h('td', { class: 'mf-actions-cell' },
      h('button', { type: 'button', class: 'mf-row-btn', title: 'View', onclick: (e: Event) => {
        e.preventDefault(); e.stopPropagation(); viewSubmission(subId);
      }}, h('i', { class: 'fas fa-eye' })),
      h('button', { type: 'button', class: 'mf-row-btn mf-row-btn-danger', title: 'Delete', onclick: (e: Event) => {
        e.preventDefault(); e.stopPropagation();
        if (confirm('Delete this submission?')) deleteSubmission(subId);
      }}, h('i', { class: 'fas fa-trash-alt' })),
    ));

    const tr = h('tr', { class: statusVal === 'Submitted' ? 'mf-unread' : '' }, ...cells);
    if (sub.isSpam) (tr as HTMLElement).style.opacity = '0.5';
    tbody.appendChild(tr);
  });
}

function renderPagination(): void {
  const container = $('#mf-subs-pagination', _root);
  if (!container) return;
  clear(container);

  const totalPages = Math.ceil(state.totalCount / state.pageSize);
  if (totalPages <= 1) return;

  for (let i = 0; i < totalPages; i++) {
    container.appendChild(h('button', {
      type: 'button',
      class: `mf-subs-page-btn${i === state.pageIndex ? ' active' : ''}`,
      onclick: (e: Event) => { e.preventDefault(); e.stopPropagation(); state.pageIndex = i; loadSubmissions(); },
    }, String(i + 1)));
  }
}

function updateInfo(): void {
  const showing = $('#mf-subs-showing', _root);
  const total = $('#mf-subs-total', _root);
  if (showing) showing.textContent = String(state.submissions.length);
  if (total) total.textContent = String(state.totalCount);
}

// ── Detail Modal ──
async function viewSubmission(subId: number): Promise<void> {
  try {
    const sub = await _adapter.api.getSubmission(subId);
    showModal(sub as any);
  } catch (err) {
    _adapter.showToast('Error loading submission', 'error');
  }
}

function showModal(sub: any): void {
  const data = parseData(sub);
  const subId = sub.submissionId || sub.SubmissionId;
  const statusVal = sub.status || sub.Status || 'Submitted';
  const fields = getDisplayFieldsFull();

  const body = $('#mf-subs-modal-body', _root);
  const title = $('#mf-subs-modal-title', _root);
  if (!body) return;
  if (title) title.textContent = `Submission #${subId}`;

  clear(body);

  // Status bar
  const statusSelect = h('select', { class: 'mf-subs-select-sm' },
    h('option', { value: 'Submitted', selected: statusVal === 'Submitted' ? 'true' : undefined }, 'New'),
    h('option', { value: 'Read', selected: statusVal === 'Read' ? 'true' : undefined }, 'Read'),
    h('option', { value: 'Starred', selected: statusVal === 'Starred' ? 'true' : undefined }, 'Starred'),
  ) as HTMLSelectElement;

  body.appendChild(h('div', { class: 'mf-subs-modal-status' },
    h('span', null, 'Status: '),
    statusSelect,
    h('button', { type: 'button', class: 'mf-subs-btn mf-subs-btn-sm', onclick: async (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      await _adapter.api.updateSubmissionStatus(subId, statusSelect.value);
      _adapter.showToast('Status updated', 'success');
      loadSubmissions();
    }}, 'Save Status'),
    h('span', { style: 'flex:1;' }),
    h('span', { style: 'font-size:12px;color:#94a3b8;' }, formatDate(sub.submittedOnUtc || sub.SubmittedOnUtc)),
  ));

  // Metadata
  body.appendChild(h('div', { class: 'mf-subs-modal-meta' },
    h('span', null, `IP: ${sub.ipAddress || sub.IpAddress || 'N/A'}`),
    h('span', null, `User: ${sub.userId || sub.UserId || 'Anonymous'}`),
  ));

  // Field values
  const table = h('table', { class: 'mf-subs-detail-table' });
  const fieldList = fields.length > 0 ? fields : Object.keys(data).filter(k => !k.startsWith('__mf_')).map(k => ({ key: k, label: k, type: 'Text' }));

  fieldList.forEach(f => {
    let val = data[f.key];
    if (val === undefined || val === null) val = '';
    if (Array.isArray(val)) val = val.join(', ');
    const strVal = String(val);

    const tr = h('tr', null,
      h('th', null, f.label),
      h('td', null, renderFieldValue(f.type, strVal)),
    );
    table.appendChild(tr);
  });
  body.appendChild(table);

  // Show modal
  const modal = $('#mf-subs-modal', _root);
  if (modal) modal.style.display = 'flex';
}

function renderFieldValue(type: string, val: string): HTMLElement {
  if (type === 'Signature' && val.startsWith('data:image')) {
    return h('img', { src: val, style: 'max-width:300px;border:1px solid #e2e8f0;border-radius:6px;' });
  }
  if (type === 'Rating') {
    const stars = parseInt(val) || 0;
    const span = h('span', { style: 'font-size:18px;' });
    for (let i = 1; i <= 5; i++) {
      span.appendChild(h('i', { class: i <= stars ? 'fas fa-star' : 'far fa-star', style: `color:${i <= stars ? '#f59e0b' : '#d1d5db'};margin-right:2px;` }));
    }
    return span;
  }
  return h('span', null, val || '—');
}

function closeModal(): void {
  const modal = $('#mf-subs-modal', _root);
  if (modal) modal.style.display = 'none';
}

// ── Filters ──
function applyFilters(e?: Event): void {
  e?.preventDefault(); e?.stopPropagation();
  state.pageIndex = 0;
  loadSubmissions();
}

function clearFilters(e?: Event): void {
  e?.preventDefault(); e?.stopPropagation();
  const search = $('#mf-subs-search', _root) as HTMLInputElement;
  const status = $('#mf-subs-status', _root) as HTMLSelectElement;
  if (search) search.value = '';
  if (status) status.value = '';
  state.pageIndex = 0;
  loadSubmissions();
}

// ── Bulk Actions ──
function toggleSelectAll(e: Event): void {
  const checked = (e.target as HTMLInputElement).checked;
  $$('.mf-sub-check', _root).forEach(cb => {
    (cb as HTMLInputElement).checked = checked;
  });
  updateBulkBar();
}

function updateBulkBar(): void {
  state.selected.clear();
  $$('.mf-sub-check:checked', _root).forEach(cb => {
    state.selected.add(parseInt((cb as HTMLElement).getAttribute('data-id') || '0'));
  });
  const bar = $('#mf-subs-bulk', _root);
  const count = $('#mf-subs-bulk-count', _root);
  if (bar) bar.style.display = state.selected.size > 0 ? 'flex' : 'none';
  if (count) count.textContent = `${state.selected.size} selected`;
}

async function bulkAction(action: string): Promise<void> {
  if (state.selected.size === 0) return;
  if (action === 'delete' && !confirm(`Delete ${state.selected.size} submissions?`)) return;

  for (const id of state.selected) {
    try {
      if (action === 'delete') await _adapter.api.deleteSubmission(id);
      else await _adapter.api.updateSubmissionStatus(id, action);
    } catch { /* continue */ }
  }
  _adapter.showToast(`${state.selected.size} submissions updated`, 'success');
  loadSubmissions();
}

// ── Export ──
async function exportData(format: string): Promise<void> {
  try {
    const blob = await _adapter.api.exportSubmissions(state.formId, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submissions-${state.formId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    _adapter.showToast('Export failed', 'error');
  }
}

// ── Delete ──
async function deleteSubmission(id: number): Promise<void> {
  try {
    await _adapter.api.deleteSubmission(id);
    _adapter.showToast('Deleted', 'success');
    loadSubmissions();
  } catch { _adapter.showToast('Delete failed', 'error'); }
}

// ── Helpers ──
function parseData(sub: any): Record<string, any> {
  try { return JSON.parse(sub.dataJson || sub.DataJson || '{}'); } catch { return {}; }
}

function getDisplayFieldsFull(): Array<{ key: string; label: string; type: string }> {
  const fields: Array<{ key: string; label: string; type: string }> = [];
  if (!state.schema?.fields) return fields;
  function flatten(arr: any[]): void {
    (arr || []).forEach((f: any) => {
      const t = f.type || f.Type;
      if (t === 'Html' || t === 'Section' || t === 'Hidden') return;
      if (t === 'Row' && f.columns) {
        f.columns.forEach((col: any) => flatten(col.fields || []));
        return;
      }
      fields.push({ key: f.key || f.Key, label: f.label || f.Label || f.key, type: t });
    });
  }
  flatten(state.schema.fields || []);
  return fields;
}

function statusBadgeClass(s: string): string {
  switch (s) {
    case 'Read': return 'success';
    case 'Starred': return 'warning';
    case 'Submitted': return 'primary';
    default: return 'secondary';
  }
}

function formatDate(d: string): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}
