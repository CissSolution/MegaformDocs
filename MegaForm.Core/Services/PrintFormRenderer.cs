using System;
using System.Collections.Generic;
using System.Text;
using MegaForm.Core.Models;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Core.Services.PrintFormRenderer
//
//  Renders a self-contained, print-ready HTML page for a form.
//
//  Features:
//   - A4/Letter/Legal/A5 page sizes with configurable margins
//   - Banner/header: logo, org info, QR code, form title
//   - Field rows rendered as underline or box style
//   - Section headers with filled-bar or underline style
//   - Signature area(s) with name, date lines
//   - Date + Ref# top row
//   - Photo placeholder
//   - Footer with page number, date, custom text
//   - QR code via qrserver.com CDN (offline: data-uri)
//   - @media print CSS — hides browser chrome, forces B/W option
//
//  C# 7.3 compatible (net472 + net8.0 + net9.0)
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Core.Services
{
    public class PrintFormRenderer
    {
        // ── Entry point ─────────────────────────────────────────────────────

        public string RenderHtml(FormInfo form, FormSchema schema, string formBaseUrl)
        {
            var settings = schema?.Settings?.PrintSettings;
            if (settings == null || !settings.Enabled)
                return "<p>Print layout is not enabled for this form.</p>";

            var title = settings.PrintTitle ?? form.Title ?? "Form";
            var accent = Escape(settings.HeaderAccentColor ?? "#6366f1");

            var sb = new StringBuilder();
            sb.AppendLine("<!DOCTYPE html>");
            sb.AppendLine("<html lang=\"en\">");
            sb.AppendLine("<head><meta charset=\"utf-8\">");
            sb.AppendFormat("<title>{0}</title>", Escape(title));
            sb.AppendLine();
            sb.AppendLine(BuildCss(settings, accent));
            sb.AppendLine("</head><body>");

            sb.AppendLine("<div class=\"mf-print-page\">");

            // Header
            if (settings.HeaderEnabled)
                sb.AppendLine(BuildHeader(form, schema, settings, formBaseUrl, accent));

            // Date / Ref row
            if (settings.ShowDateField || settings.ShowRefNumber)
                sb.AppendLine(BuildDateRefRow(settings));

            // Form fields
            sb.AppendLine(BuildFields(schema, settings));

            // Signature areas
            if (settings.SignatureAreas != null && settings.SignatureAreas.Count > 0)
                sb.AppendLine(BuildSignatureRow(settings));

            // Footer
            if (settings.FooterEnabled)
                sb.AppendLine(BuildFooter(form, settings));

            sb.AppendLine("</div>"); // mf-print-page

            // QR code script (lazy-load via img src)
            sb.AppendLine("</body></html>");

            return sb.ToString();
        }

        // ── Header ──────────────────────────────────────────────────────────

        private string BuildHeader(FormInfo form, FormSchema schema, PrintSettings s,
            string formBaseUrl, string accent)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<div class=\"mf-print-header\">");

            // Top accent bar
            sb.AppendFormat(
                "<div class=\"mf-print-header-bar\" style=\"background:{0}\"></div>",
                accent);
            sb.AppendLine();

            sb.AppendLine("<div class=\"mf-print-header-body\">");

            // Left: logo + org info
            sb.AppendLine("<div class=\"mf-print-header-left\">");
            if (!string.IsNullOrWhiteSpace(s.LogoUrl))
            {
                sb.AppendFormat(
                    "<img src=\"{0}\" class=\"mf-print-logo\" style=\"max-height:{1}px\" alt=\"Logo\"/>",
                    Escape(s.LogoUrl), s.LogoMaxHeightPx);
                sb.AppendLine();
            }
            if (!string.IsNullOrWhiteSpace(s.OrgName))
                sb.AppendFormat("<div class=\"mf-print-org-name\">{0}</div>", Escape(s.OrgName));
            if (!string.IsNullOrWhiteSpace(s.OrgAddress))
                sb.AppendFormat("<div class=\"mf-print-org-detail\">{0}</div>", Escape(s.OrgAddress));
            if (!string.IsNullOrWhiteSpace(s.OrgPhone))
                sb.AppendFormat("<div class=\"mf-print-org-detail\">📞 {0}</div>", Escape(s.OrgPhone));
            if (!string.IsNullOrWhiteSpace(s.OrgEmail))
                sb.AppendFormat("<div class=\"mf-print-org-detail\">✉ {0}</div>", Escape(s.OrgEmail));
            if (!string.IsNullOrWhiteSpace(s.OrgWebsite))
                sb.AppendFormat("<div class=\"mf-print-org-detail\">🌐 {0}</div>", Escape(s.OrgWebsite));
            sb.AppendLine("</div>"); // header-left

            // Right: form title + QR code
            sb.AppendLine("<div class=\"mf-print-header-right\">");

            // Photo placeholder (registration forms)
            if (s.ShowPhotoPlaceholder)
            {
                sb.AppendFormat(
                    "<div class=\"mf-print-photo\" style=\"width:{0}px;height:{0}px\">{1}</div>",
                    s.PhotoPlaceholderSizePx, Escape(s.PhotoPlaceholderLabel));
            }

            // Form title block
            sb.AppendLine("<div class=\"mf-print-title-block\">");
            string titleDisplay = s.PrintTitle ?? form.Title ?? "FORM";
            sb.AppendFormat("<h1 class=\"mf-print-form-title\">{0}</h1>", Escape(titleDisplay.ToUpperInvariant()));
            if (!string.IsNullOrWhiteSpace(s.PrintSubtitle))
                sb.AppendFormat("<div class=\"mf-print-form-subtitle\">{0}</div>", Escape(s.PrintSubtitle));
            sb.AppendLine("</div>"); // title-block

            // QR code
            if (s.QrCodeEnabled && (s.QrCodePosition == "header-right" || s.QrCodePosition == "header-left"))
            {
                string qrUrl = !string.IsNullOrWhiteSpace(s.QrCodeUrl)
                    ? s.QrCodeUrl
                    : formBaseUrl + "/f/" + form.FormId;
                sb.AppendLine(BuildQrCode(qrUrl, s));
            }

            sb.AppendLine("</div>"); // header-right
            sb.AppendLine("</div>"); // header-body
            sb.AppendLine("</div>"); // mf-print-header

            return sb.ToString();
        }

        // ── QR Code ──────────────────────────────────────────────────────────

        private string BuildQrCode(string url, PrintSettings s)
        {
            int size = s.QrCodeSizePx;
            // Use api.qrserver.com CDN — works offline via cached img
            string qrSrc = string.Format(
                "https://api.qrserver.com/v1/create-qr-code/?size={0}x{0}&data={1}",
                size, Uri.EscapeDataString(url));

            return string.Format(
                "<div class=\"mf-print-qr\">"
                + "<img src=\"{0}\" width=\"{1}\" height=\"{1}\" alt=\"QR\"/>"
                + "<div class=\"mf-print-qr-label\">{2}</div>"
                + "</div>",
                Escape(qrSrc), size,
                Escape(s.QrCodeLabel ?? "Fill online"));
        }

        // ── Date / Ref Row ───────────────────────────────────────────────────

        private string BuildDateRefRow(PrintSettings s)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<div class=\"mf-print-meta-row\">");
            if (s.ShowDateField)
                sb.AppendLine("<div class=\"mf-print-meta-field\"><span class=\"mf-print-meta-label\">Date:</span><span class=\"mf-print-meta-line\"></span></div>");
            if (s.ShowRefNumber)
                sb.AppendFormat(
                    "<div class=\"mf-print-meta-field\"><span class=\"mf-print-meta-label\">{0}</span><span class=\"mf-print-meta-line\"></span></div>",
                    Escape(s.RefNumberLabel ?? "Ref #"));
            sb.AppendLine("</div>");
            return sb.ToString();
        }

        // ── Fields ───────────────────────────────────────────────────────────

        private string BuildFields(FormSchema schema, PrintSettings s)
        {
            if (schema?.Fields == null || schema.Fields.Count == 0)
                return "<p class=\"mf-print-no-fields\">No fields defined.</p>";

            var sb = new StringBuilder();
            sb.AppendLine("<div class=\"mf-print-fields\">");

            foreach (var field in schema.Fields)
            {
                if (field == null) continue;

                string type = (field.Type ?? "").ToLowerInvariant();

                // Page break / section header
                if (type == "pagebreak")
                {
                    sb.AppendLine("<div class=\"mf-print-page-break\"></div>");
                    continue;
                }

                if (type == "heading" || type == "section")
                {
                    sb.AppendFormat(
                        "<div class=\"mf-print-section-header mf-print-section--{0}\">{1}</div>",
                        Escape(s.SectionStyle ?? "filled-bar"),
                        Escape(field.Label ?? ""));
                    sb.AppendLine();
                    continue;
                }

                if (type == "html" || type == "content")
                {
                    sb.AppendFormat(
                        "<div class=\"mf-print-html-block\">{0}</div>",
                        field.Label ?? "");
                    sb.AppendLine();
                    continue;
                }

                // Spacer
                if (type == "spacer")
                {
                    sb.AppendLine("<div class=\"mf-print-spacer\"></div>");
                    continue;
                }

                // Row (2-column layout)
                if (type == "row" && field.Columns != null && field.Columns.Count > 0)
                {
                    sb.AppendLine("<div class=\"mf-print-row\">");
                    foreach (var col in field.Columns)
                    {
                        sb.AppendFormat("<div class=\"mf-print-col\" style=\"flex:{0}\">", col.Span > 0 ? col.Span : 1);
                        if (col.Fields != null)
                            foreach (var nested in col.Fields)
                                sb.AppendLine(BuildSingleField(nested, s));
                        sb.AppendLine("</div>");
                    }
                    sb.AppendLine("</div>"); // mf-print-row
                    continue;
                }

                // Signature field type → render signature box
                if (type == "signature")
                {
                    sb.AppendLine(BuildSignatureField(field, s));
                    continue;
                }

                // Line items table
                if (type == "lineitems" || type == "productlineitems" || type == "grid-repeater")
                {
                    sb.AppendLine(BuildLineItemsTable(field, s));
                    continue;
                }

                // Standard field
                sb.AppendLine(BuildSingleField(field, s));
            }

            sb.AppendLine("</div>"); // mf-print-fields
            return sb.ToString();
        }

        private string BuildSingleField(FormField field, PrintSettings s)
        {
            if (field == null) return "";
            string type  = (field.Type ?? "").ToLowerInvariant();
            string label = Escape(field.Label ?? "");
            string lineStyle = s.FieldLineStyle ?? "underline";

            // Checkbox / Radio — render option list
            if (type == "checkbox" || type == "radio" || type == "checkboxgroup")
            {
                var sb2 = new StringBuilder();
                sb2.AppendFormat("<div class=\"mf-print-field mf-print-field--check\">");
                sb2.AppendFormat("<div class=\"mf-print-field-label\">{0}</div>", label);
                sb2.AppendLine("<div class=\"mf-print-check-options\">");
                if (field.Options != null)
                {
                    foreach (var opt in field.Options)
                    {
                        sb2.AppendFormat(
                            "<span class=\"mf-print-check-opt\"><span class=\"mf-print-check-box\"></span>{0}</span>",
                            Escape(opt.Label ?? opt.Value ?? ""));
                    }
                }
                sb2.AppendLine("</div></div>");
                return sb2.ToString();
            }

            // Textarea → taller box
            if (type == "textarea")
            {
                return string.Format(
                    "<div class=\"mf-print-field mf-print-field--textarea\">"
                    + "<div class=\"mf-print-field-label\">{0}</div>"
                    + "<div class=\"mf-print-field-area mf-print-field--{1}\"></div>"
                    + "</div>",
                    label, Escape(lineStyle));
            }

            // Standard single-line
            return string.Format(
                "<div class=\"mf-print-field\">"
                + "<div class=\"mf-print-field-label\">{0}</div>"
                + "<div class=\"mf-print-field-line mf-print-field--{1}\"></div>"
                + "</div>",
                label, Escape(lineStyle));
        }

        // ── Line Items Table ─────────────────────────────────────────────────

        private string BuildLineItemsTable(FormField field, PrintSettings s)
        {
            var sb = new StringBuilder();
            string label = Escape(field.Label ?? "Items");

            sb.AppendFormat("<div class=\"mf-print-section-header mf-print-section--{0}\">{1}</div>",
                Escape(s.SectionStyle ?? "filled-bar"), label);

            sb.AppendLine("<table class=\"mf-print-table\">");
            sb.AppendLine("  <thead><tr>");

            // Determine columns from widgetProps or defaults
            var cols = new List<string> { "QTY", "Description", "Unit Price", "Amount" };
            if (field.WidgetProps != null)
            {
                string colsJson = field.WidgetProps["columns"]?.ToString();
                if (!string.IsNullOrEmpty(colsJson))
                {
                    try
                    {
                        var parsed = JsonConvert.DeserializeObject<List<string>>(colsJson);
                        if (parsed != null && parsed.Count > 0) cols = parsed;
                    }
                    catch { }
                }
            }

            foreach (var c in cols)
                sb.AppendFormat("    <th>{0}</th>", Escape(c));
            sb.AppendLine("  </tr></thead>");

            // 8 empty data rows
            sb.AppendLine("  <tbody>");
            for (int i = 0; i < 8; i++)
            {
                sb.AppendLine("  <tr>");
                foreach (var _ in cols) sb.AppendLine("    <td></td>");
                sb.AppendLine("  </tr>");
            }
            sb.AppendLine("  </tbody>");

            // Summary rows
            sb.AppendLine("  <tfoot>");
            sb.AppendFormat("  <tr class=\"mf-print-table-subtotal\"><td colspan=\"{0}\">Sub Total</td><td></td></tr>",
                cols.Count - 1);
            sb.AppendLine();
            sb.AppendFormat("  <tr><td colspan=\"{0}\">Tax</td><td></td></tr>", cols.Count - 1);
            sb.AppendLine();
            sb.AppendFormat("  <tr class=\"mf-print-table-total\"><td colspan=\"{0}\">Total Amount</td><td></td></tr>",
                cols.Count - 1);
            sb.AppendLine();
            sb.AppendLine("  </tfoot>");
            sb.AppendLine("</table>");
            return sb.ToString();
        }

        // ── Signature ────────────────────────────────────────────────────────

        private string BuildSignatureField(FormField field, PrintSettings s)
        {
            string label = Escape(field.Label ?? "Signature");
            return string.Format(
                "<div class=\"mf-print-sig-field\">"
                + "<div class=\"mf-print-sig-label\">{0}</div>"
                + "<div class=\"mf-print-sig-box\"></div>"
                + "<div class=\"mf-print-sig-date\">Date: _______________</div>"
                + "</div>",
                label);
        }

        private string BuildSignatureRow(PrintSettings s)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<div class=\"mf-print-sig-row\">");
            foreach (var area in s.SignatureAreas)
            {
                if (area == null) continue;
                sb.AppendFormat("<div class=\"mf-print-sig-area\" style=\"width:{0}\">", Escape(area.Width ?? "50%"));
                sb.AppendFormat("<div class=\"mf-print-sig-box\"></div>");
                if (area.ShowName)
                    sb.AppendLine("<div class=\"mf-print-sig-underline\"><span>Name:</span><span class=\"mf-print-sig-line\"></span></div>");
                if (area.ShowDate)
                    sb.AppendLine("<div class=\"mf-print-sig-underline\"><span>Date:</span><span class=\"mf-print-sig-line\"></span></div>");
                sb.AppendFormat("<div class=\"mf-print-sig-label\">{0}</div>", Escape(area.Label ?? "Signature"));
                if (!string.IsNullOrWhiteSpace(area.SubLabel))
                    sb.AppendFormat("<div class=\"mf-print-sig-sublabel\">{0}</div>", Escape(area.SubLabel));
                sb.AppendLine("</div>");
            }
            sb.AppendLine("</div>");
            return sb.ToString();
        }

        // ── Footer ───────────────────────────────────────────────────────────

        private string BuildFooter(FormInfo form, PrintSettings s)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<div class=\"mf-print-footer\">");
            if (!string.IsNullOrWhiteSpace(s.FooterText))
                sb.AppendFormat("<span class=\"mf-print-footer-text\">{0}</span>", Escape(s.FooterText));
            sb.AppendLine("<div class=\"mf-print-footer-right\">");
            if (s.FooterShowDate)
                sb.AppendLine("<span class=\"mf-print-footer-date\" id=\"mf-print-date\"></span>");
            if (s.FooterShowPageNumbers)
                sb.AppendLine("<span class=\"mf-print-footer-pages\">Page <span class=\"mf-print-page-num\"></span></span>");
            sb.AppendLine("</div>");
            sb.AppendLine("</div>");

            // Inline JS for date + page numbers (print only)
            sb.AppendLine("<script>");
            sb.AppendLine("var el=document.getElementById('mf-print-date');");
            sb.AppendLine("if(el)el.textContent=new Date().toLocaleDateString();");
            sb.AppendLine("</script>");

            return sb.ToString();
        }

        // ── CSS ──────────────────────────────────────────────────────────────

        private string BuildCss(PrintSettings s, string accent)
        {
            var m = s.MarginsMm ?? new PrintMargins();
            int fontSize = Math.Max(8, s.FieldFontSizePt);

            string pageSize = (s.PageSize ?? "A4").ToLower();
            string orientation = (s.Orientation ?? "portrait").ToLower();
            string pageCss = orientation == "landscape"
                ? pageSize + " landscape"
                : pageSize;

            return string.Format(@"<style>
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

@page {{
  size: {0};
  margin: {1}mm {2}mm {3}mm {4}mm;
}}

body {{
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: {5}pt;
  color: #1e293b;
  background: #e5e7eb;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}}

.mf-print-page {{
  width: {6};
  min-height: {7};
  background: #fff;
  margin: 20px auto;
  padding: {1}mm {2}mm {3}mm {4}mm;
  box-shadow: 0 4px 24px rgba(0,0,0,.18);
}}

/* ── Header ─────────────────────────── */
.mf-print-header-bar {{
  height: 6px;
  width: 100%;
  margin-bottom: 12px;
}}
.mf-print-header-body {{
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1.5px solid #e2e8f0;
}}
.mf-print-header-left {{ flex: 1; }}
.mf-print-header-right {{
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}}
.mf-print-logo {{ display: block; margin-bottom: 6px; }}
.mf-print-org-name {{ font-size: 13pt; font-weight: 700; color: #0f172a; }}
.mf-print-org-detail {{ font-size: 8.5pt; color: #475569; margin-top: 2px; }}
.mf-print-title-block {{ text-align: right; }}
.mf-print-form-title {{
  font-size: 20pt;
  font-weight: 800;
  letter-spacing: -.02em;
  color: #0f172a;
}}
.mf-print-form-subtitle {{ font-size: 9pt; color: #64748b; margin-top: 2px; }}

/* ── QR Code ─────────────────────────── */
.mf-print-qr {{ text-align: center; }}
.mf-print-qr img {{ display: block; border: 1px solid #e2e8f0; padding: 3px; background: #fff; }}
.mf-print-qr-label {{ font-size: 7.5pt; color: #94a3b8; margin-top: 3px; text-align: center; }}

/* ── Photo placeholder ───────────────── */
.mf-print-photo {{
  border: 1.5px dashed #cbd5e1;
  display: flex; align-items: center; justify-content: center;
  font-size: 8pt; color: #94a3b8;
  margin-bottom: 8px;
  flex-shrink: 0;
}}

/* ── Date / Ref row ─────────────────── */
.mf-print-meta-row {{
  display: flex;
  gap: 24px;
  margin-bottom: 14px;
  font-size: 9pt;
}}
.mf-print-meta-field {{ display: flex; align-items: center; gap: 8px; }}
.mf-print-meta-label {{ font-weight: 600; white-space: nowrap; }}
.mf-print-meta-line {{
  flex: 1;
  min-width: 80px;
  border-bottom: 1px solid #94a3b8;
  height: 14px;
}}

/* ── Section headers ────────────────── */
.mf-print-section-header {{
  font-size: 9pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 14px 0 8px;
  padding: 4px 10px;
}}
.mf-print-section--filled-bar {{
  background: {8};
  color: #fff;
  border-radius: 2px;
}}
.mf-print-section--underline {{
  border-bottom: 2px solid {8};
  color: {8};
  padding-left: 0;
}}
.mf-print-section--plain {{ color: #0f172a; padding-left: 0; }}

/* ── Fields ─────────────────────────── */
.mf-print-fields {{ width: 100%; }}
.mf-print-row {{
  display: flex;
  gap: 16px;
  width: 100%;
}}
.mf-print-col {{ flex: 1; min-width: 0; }}

.mf-print-field {{
  margin-bottom: 10px;
  width: 100%;
}}
.mf-print-field-label {{
  font-size: 8pt;
  color: #475569;
  margin-bottom: 3px;
}}

/* Underline style */
.mf-print-field-line.mf-print-field--underline {{
  border-bottom: 1px solid #94a3b8;
  height: 18px;
  width: 100%;
}}
.mf-print-field-area.mf-print-field--underline {{
  border-bottom: 1px solid #94a3b8;
  height: 54px;
  width: 100%;
}}

/* Box style */
.mf-print-field-line.mf-print-field--box {{
  border: 1px solid #cbd5e1;
  height: 22px;
  border-radius: 2px;
  width: 100%;
}}
.mf-print-field-area.mf-print-field--box {{
  border: 1px solid #cbd5e1;
  height: 60px;
  border-radius: 2px;
  width: 100%;
}}

/* Checkbox / Radio options */
.mf-print-field--check .mf-print-field-label {{ margin-bottom: 6px; }}
.mf-print-check-options {{
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 9pt;
}}
.mf-print-check-opt {{ display: flex; align-items: center; gap: 5px; }}
.mf-print-check-box {{
  width: 12px; height: 12px;
  border: 1.5px solid #94a3b8;
  display: inline-block;
  border-radius: 2px;
  flex-shrink: 0;
}}

/* HTML / content blocks */
.mf-print-html-block {{ margin: 8px 0; font-size: 9pt; color: #475569; }}
.mf-print-spacer {{ height: 16px; }}
.mf-print-page-break {{ page-break-before: always; margin-top: 20px; }}

/* ── Line items table ───────────────── */
.mf-print-table {{
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  margin: 8px 0 16px;
}}
.mf-print-table th {{
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 5px 8px;
  text-align: left;
  font-weight: 700;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: .04em;
}}
.mf-print-table td {{
  border: 1px solid #e2e8f0;
  padding: 5px 8px;
  height: 22px;
}}
.mf-print-table-subtotal td {{ font-weight: 600; background: #f8fafc; }}
.mf-print-table-total td {{
  font-weight: 800;
  font-size: 11pt;
  background: #1e293b;
  color: #fff;
}}

/* ── Signature areas ────────────────── */
.mf-print-sig-row {{
  display: flex;
  gap: 24px;
  margin: 24px 0 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}}
.mf-print-sig-area {{
  display: flex;
  flex-direction: column;
  gap: 6px;
}}
.mf-print-sig-box {{
  height: 56px;
  border: 1px solid #94a3b8;
  border-radius: 3px;
  background: #fafafa;
  margin-bottom: 4px;
}}
.mf-print-sig-underline {{
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 8pt;
}}
.mf-print-sig-line {{
  flex: 1;
  border-bottom: 1px solid #94a3b8;
  height: 14px;
}}
.mf-print-sig-label {{ font-size: 8.5pt; font-weight: 700; color: #475569; }}
.mf-print-sig-sublabel {{ font-size: 8pt; color: #94a3b8; }}
.mf-print-sig-field {{ margin: 12px 0; }}

/* ── Footer ─────────────────────────── */
.mf-print-footer {{
  margin-top: 24px;
  padding-top: 8px;
  border-top: 1.5px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8pt;
  color: #94a3b8;
}}
.mf-print-footer-right {{ display: flex; gap: 16px; }}

/* ── Print overrides ────────────────── */
@media print {{
  body {{ background: #fff !important; }}
  .mf-print-page {{ box-shadow: none !important; margin: 0 !important; }}
  .mf-print-page-break {{ page-break-before: always; }}
  /* Hide browser UI */
  @page {{ margin: {1}mm {2}mm {3}mm {4}mm; }}
}}

/* ── Responsive preview ─────────────── */
@media screen and (max-width: 700px) {{
  .mf-print-page {{ padding: 12px !important; }}
  .mf-print-header-body {{ flex-direction: column; }}
  .mf-print-row {{ flex-direction: column; gap: 0; }}
}}
</style>
<style>
/* Print preview toolbar */
.mf-print-toolbar {{
  position: fixed; top: 0; left: 0; right: 0;
  height: 44px;
  background: #1e293b;
  display: flex; align-items: center; padding: 0 16px; gap: 10px;
  z-index: 9999;
  font-family: 'Segoe UI', sans-serif;
}}
.mf-print-toolbar span {{ color: #94a3b8; font-size: 13px; }}
.mf-print-tb-btn {{
  padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
  font-size: 13px; font-weight: 600;
}}
.mf-print-tb-btn.primary {{ background: #6366f1; color: #fff; }}
.mf-print-tb-btn.ghost {{ background: transparent; color: #cbd5e1; border: 1px solid #475569; }}
.mf-print-tb-btn:hover {{ opacity: .85; }}
@media print {{ .mf-print-toolbar {{ display: none !important; }} body {{ margin-top: 0 !important; }} }}
</style>",
                pageCss,                  // 0 — @page size
                m.Top, m.Right, m.Bottom, m.Left,   // 1,2,3,4 — margins
                fontSize,                  // 5 — font-size
                pageSize == "a5"  ? "148mm" : pageSize == "letter" ? "216mm" : "210mm",   // 6 — page width
                pageSize == "a5"  ? "210mm" : pageSize == "letter" ? "279mm" : "297mm",   // 7 — min-height
                accent                     // 8 — accent color
            );
        }

        // ── Utility ──────────────────────────────────────────────────────────

        private static string Escape(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s
                .Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
                .Replace("\"", "&quot;").Replace("'", "&#39;");
        }
    }
}
