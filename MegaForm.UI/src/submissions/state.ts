// ============================================================
// Submissions — State Management
// ============================================================

import type { FormField } from '@core/types';

export interface Submission {
  submissionId: number;
  formId: number;
  status: string;
  submittedOnUtc: string;
  ipAddress?: string;
  userId?: number;
  dataJson: string;
  isSpam?: boolean;
  readOnUtc?: string;
  spamScore?: number;
  formTitle?: string;
  summaryText?: string;
}

export interface SubmissionFormOption {
  formId: number;
  title: string;
  status?: string;
  schemaJson?: string;
  submissionCount?: number;
}

export interface SubsConfig {
  formId: number;
  moduleId: number;
  apiBase: string;
  schema?: { fields: FormField[] };
  formTitle?: string;
  forms?: SubmissionFormOption[];
  hideHostChrome?: boolean;
}

export interface SubsState {
  config: SubsConfig;
  submissions: Submission[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  selected: Set<number>;
  filters: { search: string; status: string; dateFrom: string; dateTo: string };
  forms: SubmissionFormOption[];
}

let _state: SubsState;
const _listeners: Array<() => void> = [];

export function initSubsState(config: SubsConfig): void {
  _state = {
    config,
    submissions: [],
    totalCount: 0,
    pageIndex: 0,
    pageSize: 50,
    selected: new Set(),
    filters: { search: '', status: '', dateFrom: '', dateTo: '' },
    forms: config.forms || [],
  };
}

export function getSubsState(): SubsState { return _state; }

export function tryGetSubsState(): SubsState | null {
  return typeof _state === 'undefined' || !_state ? null : _state;
}

export function setSubmissions(subs: Submission[], total: number): void {
  _state.submissions = subs;
  _state.totalCount = total;
  _state.selected.clear();
  notify();
}

export function setAvailableForms(forms: SubmissionFormOption[]): void {
  _state.forms = forms || [];
  notify();
}

export function setCurrentForm(formId: number, schema?: { fields: FormField[] }, formTitle?: string): void {
  _state.config.formId = formId;
  _state.config.schema = schema;
  _state.config.formTitle = formTitle || _state.config.formTitle;
  _state.pageIndex = 0;
  _state.selected.clear();
  notify();
}

export function setPage(page: number): void {
  _state.pageIndex = page;
  notify();
}

export function setPageSize(pageSize: number): void {
  _state.pageSize = pageSize > 0 ? pageSize : _state.pageSize;
  _state.pageIndex = 0;
  _state.selected.clear();
  notify();
}

export function setFilters(f: Partial<SubsState['filters']>): void {
  Object.assign(_state.filters, f);
  _state.pageIndex = 0;
  notify();
}

export function toggleSelect(id: number): void {
  if (_state.selected.has(id)) _state.selected.delete(id);
  else _state.selected.add(id);
  notify();
}

export function selectAll(ids: number[]): void {
  ids.forEach(id => _state.selected.add(id));
  notify();
}

export function clearSelection(): void {
  _state.selected.clear();
  notify();
}

export function subscribeSubs(fn: () => void): void { _listeners.push(fn); }

function notify(): void { _listeners.forEach(fn => fn()); }

/** Flatten schema fields including Row columns and legacy shapes */
export function flattenFields(fields: FormField[]): FormField[] {
  const flat: FormField[] = [];
  (fields || []).forEach((f: any) => {
    const type = f?.type || f?.Type;
    const columns = f?.columns || f?.Columns;
    if (type === 'Row' && Array.isArray(columns)) {
      columns.forEach((col: any) => {
        const childFields = col?.fields || col?.Fields || [];
        (childFields || []).forEach((cf: any) => flat.push(cf));
      });
    } else {
      flat.push(f);
    }
  });
  return flat;
}
