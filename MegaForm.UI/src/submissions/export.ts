// ============================================================
// Submissions Export — CSV / JSON download
// ============================================================

import { getSubsState } from './state';
import type { PlatformAdapter } from '@core/platform';

/** Export via API endpoint (opens URL) */
export function exportViaApi(adapter: PlatformAdapter, format: 'csv' | 'json'): void {
  const state = getSubsState();
  const { filters } = state;
  const base = state.config.apiBase;
  const formId = state.config.formId;

  let url = `${base}Submissions/Export?formId=${formId}&format=${format}`;
  if (filters.dateFrom) url += `&dateFrom=${encodeURIComponent(filters.dateFrom)}`;
  if (filters.dateTo) url += `&dateTo=${encodeURIComponent(filters.dateTo)}`;

  // Open in new tab / trigger download
  window.open(url, '_blank');
}

/** Export client-side from already-loaded submissions as CSV */
export function exportClientCsv(): void {
  const state = getSubsState();
  const subs = state.submissions;
  if (subs.length === 0) return;

  const fields = state.config.schema?.fields || [];
  const flat = flatFields(fields);
  const dataFields = flat.filter(f => !['Html', 'Section', 'Row'].includes(f.type));

  const headers = ['#', 'Date', 'Status', ...dataFields.map(f => f.label || f.key)];
  const rows = subs.map(sub => {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(sub.dataJson || '{}'); } catch {}

    return [
      String(sub.submissionId),
      formatDateCsv(sub.submittedOnUtc),
      sub.status,
      ...dataFields.map(f => {
        let v = data[f.key] ?? '';
        if (Array.isArray(v)) v = v.join('; ');
        return csvEscape(String(v));
      }),
    ];
  });

  const csv = [headers.map(csvEscape).join(','), ...rows.map(r => r.join(','))].join('\r\n');
  downloadBlob(csv, `submissions-${state.config.formId}.csv`, 'text/csv;charset=utf-8;');
}

/** Export client-side as JSON */
export function exportClientJson(): void {
  const state = getSubsState();
  const subs = state.submissions.map(sub => {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(sub.dataJson || '{}'); } catch {}
    return {
      id: sub.submissionId,
      date: sub.submittedOnUtc,
      status: sub.status,
      ipAddress: sub.ipAddress,
      data,
    };
  });
  const json = JSON.stringify(subs, null, 2);
  downloadBlob(json, `submissions-${state.config.formId}.json`, 'application/json');
}

// ── Helpers ──

function flatFields(fields: Array<{ type: string; key: string; label: string; columns?: Array<{ fields: Array<{ type: string; key: string; label: string }> }> }>): typeof fields {
  const flat: typeof fields = [];
  (fields || []).forEach(f => {
    if (f.type === 'Row' && f.columns) {
      f.columns.forEach(col => (col.fields || []).forEach(cf => flat.push(cf)));
    } else {
      flat.push(f);
    }
  });
  return flat;
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

function formatDateCsv(d: string): string {
  if (!d) return '';
  try { return new Date(d).toISOString(); } catch { return d; }
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
