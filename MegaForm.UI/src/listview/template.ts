// ============================================================
// MegaForm ListView — Template + Tokens
// Reuses the existing applyTemplate / readField helpers from
// `submission-views/shared.ts` so the same {{field:KEY}} +
// {{submission:id|date|status}} tokens work here. Adds a few
// list-specific helpers (defaults, escape, formatters).
// ============================================================

import { applyTemplate as sharedApplyTemplate, htmlEscape, type TemplateContext } from '../submission-views/shared';

export const LISTVIEW_TEMPLATE_BADGE = 'ListViewTemplate v20260507-21';
if (typeof window !== 'undefined') (window as any).__MF_LISTVIEW_TEMPLATE_BADGE__ = LISTVIEW_TEMPLATE_BADGE;

export interface ListViewSchemaField {
  key: string;
  label: string;
  type?: string;
}

export function escapeHtml(value: unknown): string { return htmlEscape(value); }

/**
 * Default ROW template when admin hasn't supplied one.
 * Renders one <tr> per submission, one <td> per visible field, plus a
 * trailing <td> with the submitted-on date.
 */
export function defaultRowTemplate(visibleFields: ListViewSchemaField[]): string {
  const cells = visibleFields.map(f =>
    '<td class="mflv-cell mflv-cell-' + cssSafe(f.key) + '">{{field:' + f.key + '}}</td>'
  ).join('');
  return '<tr class="mflv-row" data-mf-sub-id="{{submission:id}}">' +
    cells +
    '<td class="mflv-cell mflv-cell-date">{{submission:date}}</td>' +
  '</tr>';
}

/**
 * Default WRAPPER template. The runtime injects the rendered rows in place
 * of {{rows}}. Header is auto-built from the visible fields.
 */
export function defaultWrapperTemplate(visibleFields: ListViewSchemaField[]): string {
  const headerCells = visibleFields.map(f =>
    '<th class="mflv-th mflv-th-' + cssSafe(f.key) + '" data-mflv-sort="' + escapeHtml(f.key) + '">' +
      escapeHtml(f.label || f.key) +
    '</th>'
  ).join('');
  return '<table class="mflv-table">' +
    '<thead class="mflv-thead"><tr>' + headerCells + '<th class="mflv-th mflv-th-date" data-mflv-sort="submittedOnUtc">Submitted</th></tr></thead>' +
    '<tbody class="mflv-tbody">{{rows}}</tbody>' +
  '</table>';
}

/** Apply admin's row template (or default) to one submission row. */
export function applyRowTemplate(rowTpl: string, submission: any, context?: TemplateContext): string {
  return sharedApplyTemplate(rowTpl, submission, context);
}

function cssSafe(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}
