// ============================================================
// Shared Utilities
// ============================================================

import type { FormField, FieldMeta, FormSchema } from '@core/types';

/** Flatten fields from schema, expanding Row columns into flat list */
export function flattenFields(fields: FormField[]): FormField[] {
  const result: FormField[] = [];
  for (const f of fields) {
    if (f.type === 'Row' && f.columns?.length) {
      for (const col of f.columns) {
        if (col.fields) result.push(...col.fields);
      }
    } else {
      result.push(f);
    }
  }
  return result;
}

/** Get data-entry fields (exclude layout types) */
export function getDataFields(schema: FormSchema): FieldMeta[] {
  const exclude = new Set(['Html', 'Section', 'Hidden', 'Row']);
  return flattenFields(schema.fields)
    .filter(f => !exclude.has(f.type))
    .map(f => ({ key: f.key, label: f.label || f.key, type: f.type }));
}

/** Format ISO date string to locale string */
export function formatDate(isoStr: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleDateString();
}

/** Format ISO date string to locale datetime string */
export function formatDateTime(isoStr: string | null): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? isoStr : d.toLocaleString();
}

/** Truncate string to max length */
export function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen) + '…' : s;
}

/** Strip HTML tags from string */
export function stripHtml(s: string): string {
  const div = document.createElement('div');
  div.innerHTML = s;
  return div.textContent || '';
}

/** Generate a unique ID */
export function uid(): string {
  return 'mf_' + Math.random().toString(36).substring(2, 9);
}

/** Debounce function */
export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

/** Parse JSON safely */
export function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}
