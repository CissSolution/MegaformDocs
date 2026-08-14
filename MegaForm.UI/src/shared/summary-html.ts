// ============================================================
// Schema-driven review summary — v20260628-01
// File: src/shared/summary-html.ts
//
// Generates a review/summary block from the SCHEMA (one row per input field:
// a label + an empty value slot the renderer fills live). Replaces the old
// per-template HARD-CODED summary rows (which didn't auto-update when fields
// were added/removed and were populated by an injected script the premium→native
// migration strips). Exposed to authored custom HTML via the {{summary}} token.
//
// ⭐ MUST stay byte-parity with MegaForm.Core/Services/FormHtmlRenderer.cs
//    BuildSummaryHtml(...) (SSR). Inline styles (mirrors showReview) so the block
//    renders correctly without depending on any external/cache-stamped CSS.
// ============================================================

// Field types that are NOT user input → excluded from the summary.
const NON_SUMMARY_TYPES: Record<string, boolean> = {
  section: true, hidden: true, html: true, contentslider: true, map: true,
  qrcode: true, qr: true, richtext: true, datarepeater: true, captcha: true,
  golfscorecard: true, videoembed: true, drawonimage: true, signature: true,
};

function sEsc(v: any): string {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One `<div class="mf-summary-row">` per input field (recurses Row columns). */
export function buildSummaryRowsHtml(fields: any[]): string {
  const rows: string[] = [];
  (function walk(arr: any[]): void {
    (arr || []).forEach((f: any) => {
      if (!f) return;
      const type = String(f.type || f.Type || 'Text');
      if (type.toLowerCase() === 'row') {
        const cols = f.columns || f.Columns;
        if (Array.isArray(cols)) cols.forEach((c: any) => walk((c && (c.fields || c.Fields)) || []));
        return;
      }
      if (NON_SUMMARY_TYPES[type.toLowerCase()]) return;
      const key = String(f.key || f.Key || '');
      if (!key) return;
      const label = String(f.label || f.Label || key);
      rows.push(
        '<div class="mf-summary-row" style="display:flex;justify-content:space-between;gap:18px;padding:11px 2px;border-bottom:1px solid rgba(127,127,127,.18)">' +
          '<span class="mf-summary-label" style="font-weight:600;opacity:.66;flex:0 0 40%">' + sEsc(label) + '</span>' +
          '<span class="mf-summary-value" data-mf-summary-key="' + sEsc(key) + '" style="flex:1;text-align:right;word-break:break-word;white-space:pre-wrap"></span>' +
        '</div>'
      );
    });
  })(fields);
  return rows.join('');
}

/** The full `{{summary}}` replacement: a self-contained, schema-driven summary block. */
export function buildSummaryHtml(fields: any[]): string {
  return '<div class="mf-summary" data-mf-summary="1" role="group" aria-label="Summary">' +
    buildSummaryRowsHtml(fields) + '</div>';
}

export const SUMMARY_HTML_BADGE = 'SchemaSummary v20260628-01';
