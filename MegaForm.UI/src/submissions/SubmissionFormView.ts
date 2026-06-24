// ============================================================
// SubmissionFormView — render submission data in form layout
// ============================================================

import { h } from '@shared/dom';
import { flattenFields } from './state';
import { isStructuredSubmissionFileValue, renderSubmissionFileLinks } from './file-links';
import {
  getSubmissionSignatureDataUrl,
  renderSubmissionSignatureImage,
} from './signature-data';
import { expandPdfFormDisplayFields } from './submission-detail-utils';
import type { FormField } from '@core/types';

const SUBMISSION_FORM_VIEW_PDF_BADGE = 'SubmissionFormViewPdf v20260505-01';
const SUBMISSION_FORM_VIEW_R6_BADGE  = 'SubmissionFormView R6.4 v20260531-01';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_FORM_VIEW_PDF_BADGE__ = SUBMISSION_FORM_VIEW_PDF_BADGE;
  (window as any).__MF_SUBMISSION_FORM_VIEW_R6_BADGE__  = SUBMISSION_FORM_VIEW_R6_BADGE;
  // [R6.4 QA hook] Expose renderFormView on the global so headless tests
  // can drive it without going through the full auth + inbox flow.
  (window as any).__MF_RenderFormView = (data: any, fields: any) => renderFormView(data, fields);
}

/** Render a read-only form-style view of submission data */
export function renderFormView(
  data: Record<string, unknown>,
  fields: FormField[],
  formId?: number,
): HTMLElement {
  // [DataViewFkFix v20260601-07] Caller can pass formId explicitly so the
  // FK resolver works even when the dashboard page hasn't pinned a formId
  // via __MF_PLATFORM__. Falls back to the legacy pin lookup if 0.
  const effectiveFormId = (typeof formId === 'number' && formId > 0)
    ? formId
    : getCurrentFormId();
  const flat = flattenFields(fields);
  const wrapper = h('div', { class: 'mf-form-view-wrapper' });

  flat.forEach(f => {
    const t = f.type;
    const k = f.key;
    const label = f.label || k;
    if (t === 'Hidden') return;

    if (t === 'Section') {
      wrapper.appendChild(h('div', { class: 'mf-form-view-section' },
        h('hr', { class: 'mf-form-view-hr' }),
        label ? h('h4', { class: 'mf-form-view-section-title' }, label) : h('span', null),
      ));
      return;
    }

    if (t === 'Html') {
      const div = h('div', { class: 'mf-form-view-html' });
      div.innerHTML = (f.htmlContent as string) || '';
      wrapper.appendChild(div);
      return;
    }

    const rawVal = data[k] ?? '';
    const val = Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal);
    const expandedPdfFields = expandPdfFormDisplayFields({ key: k, label, type: t }, rawVal);

    // [R6.4 v20260531-01] Skip SSR-only widgets — Razor SSR widgets emit
    // display HTML at render-time; we don't capture their value in the
    // submission. Don't show "—" or raw JSON for them — show a clean note.
    if (t === 'Razor' || t === 'razor') {
      const grp = h('div', { class: 'mf-form-view-group' });
      grp.appendChild(h('label', { class: 'mf-form-view-label' }, label));
      grp.appendChild(h('div', { class: 'mf-form-view-empty', style: 'font-style:italic;color:#94a3b8;font-size:12px' },
        '— Display-only Razor widget (rendered on the live form; no submission data) —'));
      wrapper.appendChild(grp);
      return;
    }

    if (expandedPdfFields && expandedPdfFields.length > 0) {
      expandedPdfFields.forEach((pdfField) => {
        const pdfGroup = h('div', { class: 'mf-form-view-group' });
        pdfGroup.appendChild(h('label', { class: 'mf-form-view-label' }, pdfField.label));
        const pdfVal = Array.isArray(pdfField.rawValue) ? pdfField.rawValue.join(', ') : String(pdfField.rawValue ?? '');
        pdfGroup.appendChild(buildValueElement(pdfField.type, pdfVal, pdfField.rawValue));
        wrapper.appendChild(pdfGroup);
      });
      return;
    }

    const group = h('div', { class: 'mf-form-view-group' });
    group.appendChild(h('label', { class: 'mf-form-view-label' }, label));

    // [R6.4 v20260531-01] DataGrid — render rows as a real HTML table with
    // image thumbs for type:image columns. NEVER show raw JSON.
    if (t === 'DataGrid' || t === 'datagrid') {
      group.appendChild(buildDataGridTable(f as any, rawVal));
      wrapper.appendChild(group);
      return;
    }

    // [R6.4 v20260531-01] Select with optionsSql (FK dropdown) — resolve the
    // raw ID to its label asynchronously. Build a placeholder that fetches
    // its own resolution and swaps in the label. Adds a small grey "· id N"
    // suffix so admins can still see the underlying FK.
    if ((t === 'Select' || t === 'select') && hasSqlOptions(f as any) && val) {
      group.appendChild(buildFkLabel(f as any, val, effectiveFormId));
      wrapper.appendChild(group);
      return;
    }

    const valueEl = buildValueElement(t, val, rawVal);
    group.appendChild(valueEl);
    wrapper.appendChild(group);
  });

  if (flat.filter(f => f.type !== 'Html' && f.type !== 'Section' && f.type !== 'Hidden').length === 0) {
    // No schema — fallback to raw key/value
    Object.entries(data).forEach(([key, rawVal]) => {
      if (key.startsWith('__mf_')) return;
      const group = h('div', { class: 'mf-form-view-group' });
      group.appendChild(h('label', { class: 'mf-form-view-label' }, key));
      if (getSubmissionSignatureDataUrl(rawVal)) {
        group.appendChild(renderSubmissionSignatureImage(rawVal, 'mf-form-view-signature'));
      } else if (isStructuredSubmissionFileValue(rawVal)) {
        group.appendChild(h('div', { class: 'mf-form-view-file' },
          renderSubmissionFileLinks(rawVal, { itemClass: 'mf-modal-file-link' })));
      } else {
        group.appendChild(h('div', { class: 'mf-form-view-value' }, String(rawVal ?? '')));
      }
      wrapper.appendChild(group);
    });
  }

  return wrapper;
}

function buildValueElement(type: string, val: string, rawVal: unknown): HTMLElement {
  const signatureDataUrl = getSubmissionSignatureDataUrl(rawVal);

  // Signature
  if (type === 'Signature' || signatureDataUrl) {
    if (signatureDataUrl) return renderSubmissionSignatureImage(signatureDataUrl, 'mf-form-view-signature');
    return h('span', { class: 'mf-form-view-empty' }, 'No signature');
  }

  // File
  if (type === 'File' || isStructuredSubmissionFileValue(rawVal)) {
    return h('div', { class: 'mf-form-view-file' },
      renderSubmissionFileLinks(rawVal, { itemClass: 'mf-modal-file-link' }));
  }

  // Rating
  if (type === 'Rating') {
    const stars = parseInt(val) || 0;
    const el = h('div', { class: 'mf-form-view-stars' });
    for (let i = 1; i <= 5; i++) {
      const star = h('i', {
        class: i <= stars ? 'fas fa-star mf-star-filled' : 'far fa-star mf-star-empty',
      });
      el.appendChild(star);
    }
    el.appendChild(h('span', { class: 'mf-form-view-star-count' }, ` ${stars}/5`));
    return el;
  }

  // Textarea
  if (type === 'Textarea' || type === 'RichText') {
    return h('div', { class: 'mf-form-view-textarea' }, val);
  }

  // Checkbox (multi-select)
  if (type === 'Checkbox') {
    const checks = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
    const container = h('div', { class: 'mf-form-view-chips' });
    checks.forEach(c => container.appendChild(h('span', { class: 'mf-form-view-chip' }, c)));
    if (checks.length === 0) container.appendChild(h('span', { class: 'mf-form-view-empty' }, '—'));
    return container;
  }

  // Radio / Select
  if (type === 'Radio' || type === 'Select') {
    return h('div', { class: 'mf-form-view-value mf-form-view-select' },
      h('i', { class: 'fas fa-check-circle', style: 'color:#22c55e;margin-right:5px;' }),
      val || '—',
    );
  }

  // Widget JSON (Calculator results etc)
  if (val && val.charAt(0) === '{') {
    try {
      const wdata = JSON.parse(val) as Record<string, unknown>;
      if (wdata && wdata.results) {
        const container = h('div', { class: 'mf-form-view-widget-results' });
        const results = wdata.results as Record<string, unknown>;
        Object.entries(results).forEach(([rk, rv]) => {
          container.appendChild(h('div', { class: 'mf-form-view-widget-row' },
            h('strong', null, rk + ':'), ` ${rv ?? 'N/A'}`));
        });
        return container;
      } else {
        return buildStructuredValue(wdata);
      }
    } catch { /* fall through */ }
  }

  if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
    return buildStructuredValue(rawVal as Record<string, unknown>);
  }

  // Default text
  return h('div', { class: 'mf-form-view-value' }, val || '—');
}

function buildStructuredValue(data: Record<string, unknown>): HTMLElement {
  const display = firstNonEmpty(data, 'display', 'Display', 'displayValue', 'DisplayValue', 'formatted', 'Formatted', 'value', 'Value', 'nationalNumber', 'NationalNumber', 'email', 'Email', 'name', 'Name');
  const wrap = h('div', { class: 'mf-form-view-structured' });
  if (display) wrap.appendChild(h('div', { class: 'mf-form-view-structured-main' }, display));

  const entries = Object.entries(data)
    .filter(([key, value]) => !key.startsWith('__') && value != null && value !== '' && typeof value !== 'object')
    .slice(0, 8);
  if (entries.length) {
    const grid = h('div', { class: 'mf-form-view-structured-grid' });
    entries.forEach(([key, value]) => {
      grid.appendChild(h('span', { class: 'mf-form-view-structured-key' }, humanLabel(key)));
      grid.appendChild(h('span', { class: 'mf-form-view-structured-val' }, String(value)));
    });
    wrap.appendChild(grid);
  }

  const details = h('details', { class: 'mf-form-view-raw-details' });
  details.appendChild(h('summary', null, 'Raw data'));
  const pre = h('pre', { class: 'mf-form-view-json' }) as HTMLPreElement;
  pre.textContent = JSON.stringify(data, null, 2);
  details.appendChild(pre);
  wrap.appendChild(details);
  return wrap;
}

function firstNonEmpty(data: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (value != null && value !== '' && typeof value !== 'object') return String(value);
  }
  return '';
}

function humanLabel(key: string): string {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ───────────────────────────────────────────────────────────────────────
//  [R6.4 v20260531-01] Helpers: FK label resolver + DataGrid table render
// ───────────────────────────────────────────────────────────────────────

function hasSqlOptions(field: any): boolean {
  if (!field) return false;
  const p = field.properties || {};
  if (p.optionsSource === 'sql' || p.optionsSql) return true;
  if (field.optionsSource === 'sql' || field.optionsSql) return true;
  return false;
}

function getApiBase(): string {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  const plat = (w && w.__MF_PLATFORM__) || {};
  if (typeof plat.apiBase === 'string' && plat.apiBase) return String(plat.apiBase).replace(/\/?$/, '/');
  // [B51] Platform-aware fallback
  const platform = String(plat.platform || '').toLowerCase();
  if (w && (platform === 'oqtane' || w.Oqtane || w.__OQTANE__ || (w.document && w.document.querySelector && w.document.querySelector('[data-mf-platform="oqtane"]')))) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}

function getCurrentFormId(): number {
  const plat = (typeof window !== 'undefined' ? (window as any).__MF_PLATFORM__ : null) || {};
  const pin = plat.pin || {};
  if (typeof pin.formId === 'number' && pin.formId > 0) return pin.formId;
  return 0;
}

const __mfFkCache: Record<string, string> = {};

function buildFkLabel(field: any, valStr: string, formIdOverride?: number): HTMLElement {
  const fieldKey = field.key;
  const formId = (typeof formIdOverride === 'number' && formIdOverride > 0)
    ? formIdOverride
    : getCurrentFormId();
  const wrap = h('div', { class: 'mf-form-view-value mf-form-view-select' },
    h('i', { class: 'fas fa-circle-notch fa-spin', style: 'color:#94a3b8;margin-right:6px;font-size:11px' }),
    h('span', { 'data-fk-label': '1' } as any, valStr),
    h('span', { style: 'color:#94a3b8;font-size:11px;margin-left:6px' } as any, '· id ' + valStr));
  const cacheKey = formId + '|' + fieldKey + '|' + valStr;
  if (__mfFkCache[cacheKey]) {
    paint(__mfFkCache[cacheKey]);
    return wrap;
  }
  if (!formId || !fieldKey) {
    return h('div', { class: 'mf-form-view-value' }, valStr);
  }
  const url = getApiBase() + 'Field/Options?formId=' + formId + '&fieldKey=' + encodeURIComponent(fieldKey);
  fetch(url, { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : [])
    .then((rows: any) => {
      if (!Array.isArray(rows)) rows = [];
      let label = valStr;
      for (const o of rows) {
        const v = String((o.value != null ? o.value : o.Value) || '');
        if (v === String(valStr)) {
          label = String((o.label != null ? o.label : o.Label) || v);
          break;
        }
      }
      __mfFkCache[cacheKey] = label;
      paint(label);
    })
    .catch(() => { paint(valStr); });
  return wrap;

  function paint(label: string) {
    const spinner = wrap.querySelector('i.fa-spin');
    if (spinner) {
      const ok = h('i', { class: 'fas fa-check-circle', style: 'color:#22c55e;margin-right:5px;font-size:11px' });
      spinner.replaceWith(ok);
    }
    const lblNode = wrap.querySelector('[data-fk-label]');
    if (lblNode) lblNode.textContent = label;
  }
}

function buildDataGridTable(field: any, rawVal: unknown): HTMLElement {
  const wp = field.widgetProps || {};
  const cols = Array.isArray(wp.columns) ? wp.columns : [];
  let rows: any[] = [];
  if (Array.isArray(rawVal)) {
    rows = rawVal;
  } else if (typeof rawVal === 'string' && rawVal) {
    try { rows = JSON.parse(rawVal); } catch { rows = []; }
  }
  if (!Array.isArray(rows)) rows = [];

  if (cols.length === 0) {
    if (rows.length === 0) {
      return h('div', { class: 'mf-form-view-empty', style: 'font-style:italic;color:#94a3b8;font-size:12px' },
        '— No rows —');
    }
    // Auto-derive columns from the first row keys
    cols.push(...Object.keys(rows[0] || {}).map(k => ({ key: k, label: k, type: 'text' })));
  }
  if (rows.length === 0) {
    return h('div', { class: 'mf-form-view-empty', style: 'font-style:italic;color:#94a3b8;font-size:12px;padding:8px 0' },
      '— No rows —');
  }

  const table = h('table', { class: 'mf-form-view-dgrid-table', style: 'width:100%;border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden' });
  const thead = h('thead', null);
  const headRow = h('tr', { style: 'background:#f8fafc' });
  cols.forEach((c: any) => {
    headRow.appendChild(h('th', { style: 'padding:8px 10px;text-align:left;color:#475569;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.03em;border-bottom:1px solid #e2e8f0' }, c.label || c.key));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = h('tbody', null);
  rows.forEach((r: any) => {
    const tr = h('tr', { style: 'border-bottom:1px solid #f1f5f9' });
    cols.forEach((c: any) => {
      const cellVal = r && (r[c.key] != null ? r[c.key] : '');
      const td = h('td', { style: 'padding:8px 10px;color:#0f172a;font-size:12px' });
      if (c.type === 'image' && cellVal) {
        td.appendChild(h('img', { src: String(cellVal), alt: '', loading: 'lazy', style: 'width:48px;height:48px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0' } as any));
      } else if (c.type === 'currency') {
        td.style.textAlign = 'right';
        td.style.color = '#16a34a';
        td.style.fontWeight = '600';
        td.textContent = String(cellVal);
      } else if (c.type === 'number') {
        td.style.textAlign = 'right';
        td.textContent = String(cellVal);
      } else {
        td.textContent = String(cellVal);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // Footer: row count + tableName if set
  const footer = h('div', { style: 'font-size:11px;color:#64748b;margin-top:6px;padding:0 4px' },
    String(rows.length) + ' row' + (rows.length === 1 ? '' : 's') + (wp.tableName ? ' · table: ' + wp.tableName : ''));

  const wrap = h('div', { class: 'mf-form-view-dgrid' });
  wrap.appendChild(table);
  wrap.appendChild(footer);
  return wrap;
}
