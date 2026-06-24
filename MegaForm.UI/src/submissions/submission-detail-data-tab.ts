import { h } from '@shared/dom';
import type { PlatformAdapter } from '@core/platform';
import type { FormField } from '@core/types';
import { getSubsState } from './state';
import { isStructuredSubmissionFileValue, renderSubmissionFileLinks } from './file-links';
import {
  getSubmissionSignatureDataUrl,
  renderSubmissionSignatureImage,
} from './signature-data';
import { coerceSubmissionDetail, getDisplayFields, getSubmissionValues, renderStarsHtml } from './submission-detail-utils';

const SUBMISSION_DATA_TAB_PDF_BADGE = 'SubmissionDataTabPdf v20260507-19';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_DATA_TAB_PDF_BADGE__ = SUBMISSION_DATA_TAB_PDF_BADGE;
}

function friendlyTypeLabel(type: string): string {
  const t = String(type || '').toLowerCase();
  switch (t) {
    case '': return '';
    case 'textinput': return 'Text';
    case 'textarea': return 'Text';
    case 'richtext':  return 'Rich';
    case 'datepicker': return 'Date';
    case 'datetimepicker': return 'Date';
    case 'numberinput': return 'Number';
    case 'emailinput': return 'Email';
    case 'phoneinput': return 'Phone';
    case 'singlechoice': return 'Choice';
    case 'multichoice':  return 'Choice';
    case 'dropdown':     return 'Choice';
    case 'pdfform':      return 'PDF';
    default: return type;
  }
}

interface SubmissionDataTabOptions {
  submission: any;
  adapter?: PlatformAdapter;
  fallbackFields: FormField[];
  onSaved?: () => void;
  readOnly?: boolean;
  showTypePills?: boolean;
}

export function renderSubmissionDataTab(options: SubmissionDataTabOptions): HTMLElement {
  const detail = coerceSubmissionDetail(options.submission);
  // [DataViewFkFix v20260601-07] Pin formId for the FK resolver, walking
  // every casing the server might return.
  const subAny = detail?.submission as any;
  fkContext.formId = Number(
    subAny?.formId || subAny?.FormId ||
    (options.submission as any)?.formId || (options.submission as any)?.FormId ||
    (options.submission as any)?.Submission?.FormId || (options.submission as any)?.Submission?.formId ||
    0
  );
  const values = getSubmissionValues(detail);
  const displayFields = getDisplayFields(detail, options.fallbackFields);
  const editFields = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const readOnly = !!options.readOnly;
  const showTypePills = options.showTypePills !== false;
  const root = h('div', { class: 'mf-modal-body' });
  const tbody = h('tbody', null);

  // [SubmissionDetailShell v20260507-19] Each row: label cell shows friendly
  // label + type pill (e.g. "Họ và tên [TEXT]"). Empty values render as a
  // muted "—" instead of blank, so the row still has visual presence.
  displayFields.forEach((field) => {
    const normalizedValue = Array.isArray(field.rawValue) ? (field.rawValue as string[]).join(', ') : field.rawValue;
    const signatureDataUrl = getSubmissionSignatureDataUrl(field.rawValue);
    const labelCell = h('th', null) as HTMLElement;
    labelCell.textContent = field.label;
    const typePill = friendlyTypeLabel(field.type || '');
    if (showTypePills && typePill) {
      const pill = h('span', { class: 'mf-modal-type-pill' }, typePill);
      labelCell.appendChild(pill);
    }
    const row = h('tr', null, labelCell, h('td', null));
    const cell = row.lastElementChild as HTMLElement;
    renderFieldCell(cell, field, normalizedValue, signatureDataUrl, readOnly, editFields);
    if (cell.childElementCount === 0 && !cell.textContent?.trim()) {
      cell.appendChild(h('span', { class: 'mf-modal-empty' }, '—'));
    }
    tbody.appendChild(row);
  });

  root.appendChild(h('table', { class: 'mf-modal-table' }, tbody));
  if (!readOnly) {
    root.appendChild(h('div', { class: 'mf-modal-save-row' },
      h('button', {
        type: 'button',
        class: 'mf-subs-btn mf-subs-btn-primary',
        onclick: async (event: Event) => {
          event.preventDefault();
          const nextData: Record<string, unknown> = { ...values };
          editFields.forEach((input, key) => {
            const value = input.value;
            nextData[key] = Array.isArray(values[key])
              ? value.split(',').map((entry: string) => entry.trim()).filter(Boolean)
              : value;
          });
          try {
            if (options.adapter && typeof options.adapter.api.updateSubmissionData === 'function') {
              await options.adapter.api.updateSubmissionData(detail.submission.submissionId, nextData);
            } else {
              await saveSubmissionData(detail.submission.submissionId, nextData);
            }
            options.adapter?.showToast('Saved!', 'success');
            options.onSaved?.();
          } catch {
            options.adapter?.showToast('Save failed', 'error');
          }
        },
      }, h('i', { class: 'fas fa-save' }), ' Save Changes'),
    ));
  }

  return root;
}

function renderFieldCell(
  cell: HTMLElement,
  field: { key: string; type: string; rawValue: unknown; readOnly?: boolean },
  normalizedValue: unknown,
  signatureDataUrl: string | null,
  readOnly: boolean,
  editFields: Map<string, HTMLInputElement | HTMLTextAreaElement>,
): void {
  const stringValue = String(normalizedValue ?? '');
  const effectiveReadOnly = readOnly || !!field.readOnly;

  if (field.type === 'Signature' || signatureDataUrl) {
    if (signatureDataUrl) {
      cell.appendChild(renderSubmissionSignatureImage(signatureDataUrl, 'mf-modal-signature-img'));
    } else {
      cell.appendChild(h('span', { class: 'mf-form-view-empty' }, 'No signature'));
    }
    return;
  }

  if (field.type === 'Rating') {
    const stars = parseInt(stringValue, 10) || 0;
    cell.innerHTML = renderStarsHtml(stars);
    if (!effectiveReadOnly) {
      const hidden = h('input', { type: 'hidden', value: stringValue }) as HTMLInputElement;
      cell.appendChild(hidden);
      editFields.set(field.key, hidden);
      bindStarClicks(cell, hidden);
    }
    return;
  }

  if (field.type === 'File' || isStructuredSubmissionFileValue(field.rawValue)) {
    cell.appendChild(renderSubmissionFileLinks(field.rawValue, { itemClass: 'mf-modal-file-link' }));
    return;
  }

  if (field.type === 'Textarea' || field.type === 'RichText') {
    if (effectiveReadOnly) {
      cell.appendChild(h('div', { class: 'mf-modal-read-value mf-modal-read-block' }, stringValue || '—'));
    } else {
      const textarea = h('textarea', { class: 'mf-modal-edit', rows: '3' }) as HTMLTextAreaElement;
      textarea.value = stringValue;
      cell.appendChild(textarea);
      editFields.set(field.key, textarea);
    }
    return;
  }

  if (stringValue.charAt(0) === '{') {
    try {
      const widgetData = JSON.parse(stringValue) as Record<string, unknown>;
      if (widgetData.results) {
        const container = h('div', { class: 'mf-modal-widget-results' });
        Object.entries(widgetData.results as Record<string, unknown>).forEach(([key, value]) => {
          container.appendChild(h('div', null, h('strong', null, `${key}:`), ` ${value ?? ''}`));
        });
        cell.appendChild(container);
        return;
      }

      cell.appendChild(buildStructuredReadValue(widgetData));
      return;
    } catch {
      // Fall through to plain value rendering.
    }
  }

  // [DataViewFkFix v20260601-07] Select with sql-backed options — render
  // an actual <select> populated from /Field/Options so the user sees the
  // label not the raw FK id. Pre-selects the current value. The hidden
  // input keeps the id so submit-time edit still works on save.
  if ((field as any).isFkSql && fkContext.formId > 0) {
    renderFkSelect(cell, field, stringValue, effectiveReadOnly, editFields, fkContext.formId);
    return;
  }

  if (effectiveReadOnly) {
    if (field.rawValue && typeof field.rawValue === 'object' && !Array.isArray(field.rawValue)) {
      cell.appendChild(buildStructuredReadValue(field.rawValue as Record<string, unknown>));
    } else {
      cell.appendChild(h('div', { class: 'mf-modal-read-value' }, formatPlainValue(field.rawValue)));
    }
    return;
  }

  const input = h('input', { type: 'text', class: 'mf-modal-edit' }) as HTMLInputElement;
  input.value = stringValue;
  cell.appendChild(input);
  editFields.set(field.key, input);
}

// [DataViewFkFix v20260601-07] Mutable per-render context — set in
// renderSubmissionDataTab so renderFieldCell can reach formId without
// changing every signature in the chain.
const fkContext = { formId: 0 };

function isSelectField(field: { type: string; rawValue: unknown }): boolean {
  const t = String(field.type || '').toLowerCase();
  return t === 'select' || t === 'dropdown';
}

const __mfDataFkCache: Record<string, Array<{ value: string; label: string }>> = {};

function renderFkSelect(
  cell: HTMLElement,
  field: { key: string; type: string; rawValue: unknown },
  currentValue: string,
  readOnly: boolean,
  editFields: Map<string, HTMLInputElement | HTMLTextAreaElement>,
  formId: number,
): void {
  // Loading placeholder
  const wrap = h('div', { class: 'mf-modal-fk-select-wrap' });
  const spinner = h('i', { class: 'fas fa-circle-notch fa-spin', style: 'color:#94a3b8;margin-right:6px;font-size:11px' });
  const placeholder = h('span', { 'data-fk-placeholder': '1' }, currentValue || '—');
  const suffix = h('span', { style: 'color:#94a3b8;font-size:11px;margin-left:6px' }, currentValue ? '· id ' + currentValue : '');
  wrap.appendChild(spinner);
  wrap.appendChild(placeholder);
  wrap.appendChild(suffix);
  cell.appendChild(wrap);

  // Hidden input keeps the FK id so editFields still works for save
  const hidden = h('input', { type: 'hidden', class: 'mf-modal-edit' }) as HTMLInputElement;
  hidden.value = currentValue;
  cell.appendChild(hidden);
  editFields.set(field.key, hidden);

  const cacheKey = formId + '|' + field.key;
  const apply = (options: Array<{ value: string; label: string }>) => {
    const matched = options.find(o => String(o.value) === String(currentValue));
    if (matched) {
      spinner.outerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:5px;font-size:11px" data-fk-label="1"></i>';
      placeholder.textContent = matched.label;
    } else {
      spinner.outerHTML = '<i class="fas fa-info-circle" style="color:#f59e0b;margin-right:5px;font-size:11px"></i>';
      placeholder.textContent = currentValue || '—';
    }
    if (!readOnly) {
      // Replace static label with an editable <select>
      const sel = document.createElement('select');
      sel.className = 'mf-modal-edit';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = ''; emptyOpt.textContent = '— Select —';
      sel.appendChild(emptyOpt);
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = String(o.value); opt.textContent = o.label;
        if (String(o.value) === String(currentValue)) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => { hidden.value = sel.value; });
      cell.appendChild(sel);
    }
  };

  if (__mfDataFkCache[cacheKey]) {
    apply(__mfDataFkCache[cacheKey]);
    return;
  }
  // [B51] Platform-aware base
  let apiBase: string;
  if (typeof window !== 'undefined') {
    const _w = window as any;
    const _pf = _w.__MF_PLATFORM__ || {};
    if (_pf.apiBase) {
      apiBase = String(_pf.apiBase).replace(/\/?$/, '/');
    } else {
      const _platform = String(_pf.platform || '').toLowerCase();
      const _isOq = _platform === 'oqtane' || _w.Oqtane || _w.__OQTANE__ || document.querySelector('[data-mf-platform="oqtane"]');
      apiBase = _isOq ? '/api/MegaForm/' : '/DesktopModules/MegaForm/API/';
    }
  } else {
    apiBase = '/api/MegaForm/';
  }
  fetch(apiBase + 'Field/Options?formId=' + formId + '&fieldKey=' + encodeURIComponent(field.key), { credentials: 'same-origin' })
    .then(r => r.ok ? r.json() : [])
    .then((rows: any) => {
      if (!Array.isArray(rows)) rows = [];
      const opts = rows.map((o: any) => ({
        value: String((o.value != null ? o.value : o.Value) || ''),
        label: String((o.label != null ? o.label : o.Label) || ''),
      }));
      __mfDataFkCache[cacheKey] = opts;
      apply(opts);
    })
    .catch(() => apply([]));
}

function buildStructuredReadValue(data: Record<string, unknown>): HTMLElement {
  const display = firstNonEmpty(data, 'display', 'Display', 'displayValue', 'DisplayValue', 'formatted', 'Formatted', 'value', 'Value', 'nationalNumber', 'NationalNumber');
  const wrap = h('div', { class: 'mf-modal-structured' });
  if (display) wrap.appendChild(h('div', { class: 'mf-modal-structured-main' }, display));

  const entries = Object.entries(data)
    .filter(([key, value]) => !key.startsWith('__') && value != null && value !== '' && typeof value !== 'object')
    .slice(0, 8);
  if (entries.length) {
    const grid = h('div', { class: 'mf-modal-structured-grid' });
    entries.forEach(([key, value]) => {
      grid.appendChild(h('span', { class: 'mf-modal-structured-key' }, humanLabel(key)));
      grid.appendChild(h('span', { class: 'mf-modal-structured-val' }, String(value)));
    });
    wrap.appendChild(grid);
  }

  const details = h('details', { class: 'mf-modal-raw-details' });
  details.appendChild(h('summary', null, 'Raw data'));
  const pre = h('pre', { class: 'mf-modal-json' }) as HTMLPreElement;
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

function formatPlainValue(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    return value.map((item) => formatPlainValue(item)).filter(Boolean).join(', ') || '—';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  const textValue = String(value);
  return textValue.trim() || '—';
}

function bindStarClicks(cell: HTMLElement, hidden: HTMLInputElement): void {
  cell.querySelectorAll('[data-star]').forEach((star) => {
    star.addEventListener('click', () => {
      const value = star.getAttribute('data-star') || '0';
      hidden.value = value;
      cell.innerHTML = renderStarsHtml(parseInt(value, 10));
      cell.appendChild(hidden);
      bindStarClicks(cell, hidden);
    });
  });
}

async function saveSubmissionData(submissionId: number, data: Record<string, unknown>): Promise<void> {
  const state = getSubsState();
  const url = `${state.config.apiBase}Submissions/UpdateData?submissionId=${submissionId}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  try {
    const jqueryRef = (window as any).jQuery;
    if (typeof jqueryRef !== 'undefined' && jqueryRef.ServicesFramework) {
      const services = jqueryRef.ServicesFramework(state.config.moduleId);
      headers.RequestVerificationToken = services.getAntiForgeryValue();
      headers.TabId = services.getTabId();
      headers.ModuleId = services.getModuleId();
    }
  } catch {
    // Ignore platform-specific auth helper failures and let the request fail naturally.
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}
