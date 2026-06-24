import type {
  FormField,
  SubmissionDetailInfo,
  SubmissionFieldSnapshot,
  SubmissionInfo,
} from '@core/types';
import { flattenFields } from './state';

export interface SubmissionDisplayField {
  key: string;
  label: string;
  type: string;
  rawValue: unknown;
  readOnly?: boolean;
  // [DataViewFkFix v20260601-07] True when the field is a Select backed
  // by a SQL options source — Data View renders an FK-resolving dropdown
  // instead of a plain text input.
  isFkSql?: boolean;
}

export const SUBMISSION_PDF_FORM_BADGE = 'SubmissionPdfForm v20260506-08';
if (typeof window !== 'undefined') {
  (window as any).__MF_SUBMISSION_PDF_FORM_BADGE__ = SUBMISSION_PDF_FORM_BADGE;
}

interface PdfFormOption {
  label?: string;
  value?: string;
}

interface PdfFormFieldMeta {
  id?: string;
  name?: string;
  label?: string;
  kind?: string;
  required?: boolean;
  page?: number;
  options?: PdfFormOption[];
}

interface PdfFormFileMeta {
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  tempPath?: string;
  storedIn?: string;
  contentType?: string;
}

interface PdfFormPayload {
  badge?: string;
  version?: string;
  pdfFile?: PdfFormFileMeta;
  values?: Record<string, unknown>;
  fieldMeta?: PdfFormFieldMeta[];
  font?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPdfFormFieldType(type: string | undefined): boolean {
  return String(type || '').trim().toLowerCase() === 'pdfform';
}

function parsePdfFormPayload(rawValue: unknown): PdfFormPayload | null {
  if (rawValue == null || rawValue === '') return null;

  let parsed: unknown = rawValue;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed || trimmed.charAt(0) !== '{') return null;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }

  if (!isRecord(parsed)) return null;
  const values = isRecord(parsed.values) ? parsed.values : {};
  // Old widget (v20260505-xx) wrote "fieldMeta"; new v6 widget (v20260506-xx)
  // writes "fields" with the same shape. Accept either; prefer fieldMeta when
  // both present.
  const rawMeta = Array.isArray(parsed.fieldMeta) && parsed.fieldMeta.length > 0
    ? parsed.fieldMeta
    : (Array.isArray(parsed.fields) ? parsed.fields : []);
  return {
    badge: typeof parsed.badge === 'string' ? parsed.badge : '',
    version: typeof parsed.version === 'string' ? parsed.version : '',
    pdfFile: isRecord(parsed.pdfFile) ? parsed.pdfFile as PdfFormFileMeta : undefined,
    values,
    fieldMeta: rawMeta
      .filter((item): item is Record<string, unknown> => isRecord(item))
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name : '',
        label: typeof item.label === 'string' ? item.label : '',
        kind: typeof item.kind === 'string' ? item.kind : '',
        required: !!item.required,
        page: typeof item.page === 'number' ? item.page : 0,
        options: Array.isArray(item.options)
          ? item.options
            .filter((opt): opt is Record<string, unknown> => isRecord(opt))
            .map((opt) => ({
              label: typeof opt.label === 'string' ? opt.label : '',
              value: typeof opt.value === 'string' ? opt.value : '',
            }))
          : [],
      })),
    font: typeof parsed.font === 'string' ? parsed.font : '',
  };
}

function getPdfPayloadValue(values: Record<string, unknown>, key: string): unknown {
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  const lowerKey = key.toLowerCase();
  const matchedKey = Object.keys(values).find((candidate) => candidate.toLowerCase() === lowerKey);
  return matchedKey ? values[matchedKey] : undefined;
}

/**
 * [SubmissionPdfForm v20260506-08] Resolve a meaningful label for a PDF
 * Form field even when admin didn't set name/label in the designer. Fallback
 * order: explicit label → name → "PDF Field N (kind)" → raw id.
 */
function resolvePdfFieldLabel(meta: PdfFormFieldMeta, fallbackIndex: number): string {
  if (meta.label && meta.label.trim()) return meta.label.trim();
  if (meta.name && meta.name.trim()) return meta.name.trim();
  const kind = (meta.kind || 'field').trim();
  return 'PDF Field ' + (fallbackIndex + 1) + (kind ? ' (' + kind + ')' : '');
}

/**
 * Resolve the value: try meta.name first, then meta.id (runtime stores
 * fillValues keyed by field.id even when admin set a friendly name).
 */
function resolvePdfFieldValue(values: Record<string, unknown>, meta: PdfFormFieldMeta): unknown {
  const candidates = [meta.name, meta.id]
    .filter((k): k is string => !!k && k.trim().length > 0);
  for (const k of candidates) {
    const v = getPdfPayloadValue(values, k);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function mapPdfKindToFieldType(kind: string | undefined): string {
  switch (String(kind || '').trim().toLowerCase()) {
    case 'textarea': return 'Textarea';
    case 'checkbox': return 'Checkbox';
    case 'dropdown': return 'Select';
    case 'radio': return 'Radio';
    case 'number': return 'Number';
    case 'date': return 'Date';
    default: return 'Text';
  }
}

function mapPdfFieldValue(meta: PdfFormFieldMeta, rawValue: unknown): unknown {
  const kind = String(meta.kind || '').trim().toLowerCase();
  if (kind === 'checkbox') {
    return rawValue === true || String(rawValue || '').trim().toLowerCase() === 'true'
      ? 'Checked'
      : '';
  }

  if ((kind === 'dropdown' || kind === 'radio') && Array.isArray(meta.options) && meta.options.length > 0) {
    const rawText = String(rawValue ?? '');
    const match = meta.options.find((option) => String(option.value ?? '') === rawText);
    return match?.label || rawText;
  }

  return rawValue;
}

export function parseSubmissionDataJson(dataJson: string): Record<string, unknown> {
  if (!dataJson) return {};
  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function coerceSubmissionDetail(source: SubmissionDetailInfo | SubmissionInfo): SubmissionDetailInfo {
  if ('submission' in source) {
    // [SubmissionDetailData v20260518-10] Server returns TWO different shapes
    // under different keys:
    //   - `values` = FlattenedValues = [{Key:label, Value:displayValue}, ...]
    //     for the activity timeline / read-only listings.
    //   - `data`   = parsed DataJson dictionary keyed by FIELD KEY for the
    //     editable Data View tab.
    // Old clients only saw `values` (a Dictionary back then). Newer server
    // controllers return both; prefer the keyed `data`, then `values` if it
    // is already a dictionary, then parse the raw dataJson string.
    const sourceAny = source as unknown as Record<string, unknown>;
    const resolvedValues = pickFieldKeyedValues(
      sourceAny.data,
      sourceAny.Data,
      sourceAny.values,
      sourceAny.Values,
    ) || parseSubmissionDataJson(source.submission.dataJson);

    return {
      submission: source.submission,
      form: source.form || null,
      schema: source.schema || null,
      files: source.files || [],
      values: resolvedValues,
      fieldSnapshots: source.fieldSnapshots || [],
      hasSnapshot: !!source.hasSnapshot,
      workflowDetail: source.workflowDetail || null,
    };
  }

  return {
    submission: source,
    form: null,
    schema: null,
    files: [],
    values: parseSubmissionDataJson(source.dataJson),
    fieldSnapshots: [],
    hasSnapshot: false,
    workflowDetail: null,
  };
}

/**
 * Return the first arg that is a non-empty Dictionary<string,unknown>.
 * Skips arrays (which server uses for FlattenedValues — label/displayValue
 * tuples — and which would break field-keyed lookups in the Data tab).
 */
function pickFieldKeyedValues(...candidates: unknown[]): Record<string, unknown> | null {
  for (const c of candidates) {
    if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c as object).length > 0) {
      return c as Record<string, unknown>;
    }
  }
  return null;
}

export function getSubmissionValues(detail: SubmissionDetailInfo): Record<string, unknown> {
  return detail.values || parseSubmissionDataJson(detail.submission.dataJson);
}

export function getSubmissionFields(detail: SubmissionDetailInfo, fallbackFields: FormField[]): FormField[] {
  const detailFields = detail.schema?.fields || [];
  const sourceFields = detailFields.length > 0 ? detailFields : fallbackFields;
  return flattenFields(sourceFields || []);
}

export function expandPdfFormDisplayFields(
  field: Pick<FormField, 'key' | 'label' | 'type'>,
  rawValue: unknown,
): SubmissionDisplayField[] | null {
  if (!isPdfFormFieldType(field.type)) return null;
  const payload = parsePdfFormPayload(rawValue);
  if (!payload) return null;

  const expanded: SubmissionDisplayField[] = [];
  if (payload.pdfFile) {
    expanded.push({
      key: `${field.key}__pdf`,
      label: `${field.label || field.key} PDF`,
      type: 'File',
      rawValue: payload.pdfFile,
      readOnly: true,
    });
  }

  const seen = new Set<string>();
  (payload.fieldMeta || []).forEach((meta, index) => {
    const kind = String(meta.kind || '').trim().toLowerCase();
    if (kind === 'label' || kind === 'whiteout') return;

    // Stable display key: prefer explicit name, fall back to id, then index.
    const stableKey = String(meta.name || meta.id || `pdf_field_${index}`);
    if (!stableKey || seen.has(stableKey)) return;
    seen.add(stableKey);

    expanded.push({
      key: `${field.key}__${stableKey}`,
      label: resolvePdfFieldLabel(meta, index),
      type: mapPdfKindToFieldType(kind),
      rawValue: mapPdfFieldValue(meta, resolvePdfFieldValue(payload.values || {}, meta)),
      readOnly: true,
    });
  });

  if (typeof window !== 'undefined') {
    (window as any).__MF_SUBMISSION_PDF_FORM_BADGE__ = SUBMISSION_PDF_FORM_BADGE;
  }
  return expanded.length > 0 ? expanded : null;
}

export function buildSchemaDisplayFields(
  fields: FormField[],
  values: Record<string, unknown>,
): SubmissionDisplayField[] {
  return fields
    .filter((field) => !['Html', 'Section', 'Hidden'].includes(field.type))
    .flatMap((field) => {
      const expanded = expandPdfFormDisplayFields(field, values[field.key]);
      if (expanded && expanded.length > 0) return expanded;

      // [DataViewFkFix v20260601-07] Detect FK-by-SQL flag from the field's
      // properties so the Data View renderer can swap a text input for a
      // resolving dropdown.
      const p = (field as any).properties || {};
      const isFkSql = p.optionsSource === 'sql' || !!p.optionsSql
                   || (field as any).optionsSource === 'sql' || !!(field as any).optionsSql;
      return [{
        key: field.key,
        label: field.label || field.key,
        type: field.type || '',
        rawValue: values[field.key],
        isFkSql,
      }];
    });
}

function mapFieldSnapshot(snapshot: SubmissionFieldSnapshot, values: Record<string, unknown>): SubmissionDisplayField {
  const extended = snapshot as SubmissionFieldSnapshot & { rawValue?: unknown; displayValue?: unknown };
  return {
    key: snapshot.key || String(snapshot.label || ''),
    label: snapshot.label || snapshot.key || 'Field',
    type: snapshot.type || '',
    rawValue: snapshot.value !== undefined
      ? snapshot.value
      : (extended.rawValue ?? extended.displayValue ?? values[snapshot.key]),
  };
}

export function getDisplayFields(detail: SubmissionDetailInfo, fallbackFields: FormField[]): SubmissionDisplayField[] {
  const values = getSubmissionValues(detail);
  const fields = getSubmissionFields(detail, fallbackFields);

  if (fields.length > 0) {
    return buildSchemaDisplayFields(fields, values);
  }

  if (detail.fieldSnapshots.length > 0) {
    return detail.fieldSnapshots
      .filter((snapshot) => (snapshot.key || snapshot.label))
      .map((snapshot) => mapFieldSnapshot(snapshot, values));
  }

  return Object.entries(values)
    .filter(([key]) => !key.startsWith('__mf_'))
    .map(([key, rawValue]) => ({
      key,
      label: key,
      type: '',
      rawValue,
    }));
}

export function formatSubmissionDate(value?: string | null): string {
  if (!value) return '';
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return value;
  }
}

export function renderStarsHtml(count: number): string {
  let html = '';
  for (let i = 1; i <= 5; i += 1) {
    const filled = i <= count;
    html += `<i class="${filled ? 'fas' : 'far'} fa-star" data-star="${i}" style="color:${filled ? '#f59e0b' : '#d1d5db'};cursor:pointer;font-size:18px;margin-right:2px;"></i>`;
  }
  return `${html} <span style="font-size:13px;color:#64748b;">${count}/5</span>`;
}
