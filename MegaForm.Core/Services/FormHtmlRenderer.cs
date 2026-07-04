using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
// Disambiguate: a different FieldOption also exists in MegaForm.Core.Services,
// and the namespace member shadows a file-level `FieldOption` alias — use a
// uniquely-named alias so every reference binds to the Models type.
using MfOption = MegaForm.Core.Models.FieldOption;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// [2026-06-13 SSR] Platform-agnostic server-side form HTML renderer — the single
    /// source of the form's STATIC markup, mirroring the structure that the client
    /// renderer (MegaForm.UI/src/renderer/megaform-renderer.ts) produces so the JS can
    /// HYDRATE the server HTML instead of rebuilding it.
    ///
    /// Goal = SEO + fast first paint: field labels, inputs, options, help text, section
    /// headings and customHtml text appear in the initial HTML response (crawler-visible),
    /// while the JS attaches interactivity (validation, conditional logic, widgets, submit).
    ///
    /// This is the "CISS pattern" applied to forms (cf. MenuOrchestrator → MarkupString /
    /// Literal). Oqtane injects the output via @((MarkupString)) during prerender; DNN via a
    /// Literal control. Interactive widget BODIES (signature pad, payment, rating, etc.) are
    /// emitted as a labelled hydration placeholder — the label/help is SEO content, the body
    /// is filled by the JS widget engine on load.
    ///
    /// HTML contract MUST stay in lock-step with megaform-renderer.ts renderInput()/
    /// renderCustomHtml()/renderSingleFieldElement(): .mf-field-group[data-key,data-type,
    /// data-show-if] > label.mf-field-label > input + .mf-field-help + .mf-field-error.
    /// </summary>
    public static class FormHtmlRenderer
    {
        /// <summary>Marker attribute the JS hydrator looks for to skip a client rebuild.</summary>
        public const string SsrMarkerAttr = "data-mf-ssr=\"1\"";

        /// <summary>Widget field types whose label is rendered by the widget itself (self-labeled),
        /// so the server wrapper must NOT add a &lt;label&gt; (matches the TS isWidgetSelfLabeled list).</summary>
        private static readonly HashSet<string> AlwaysLabeledWidgets = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { "Rating", "Signature", "Appointment", "PhoneIntl" };

        /// <summary>Field types the server renders fully (non-widget). Everything else is a widget
        /// → label + hydration placeholder.</summary>
        private static readonly HashSet<string> NativeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Text","Phone","Url","Email","Number","Date","Textarea","Select","Radio","Checkbox",
            "File","Rating","Signature","Section","Html","Hidden","Row","Password","UniqueId","Composite"
        };

        /// <summary>
        /// True if the schema contains a NON-native widget (DataRepeater, Razor, Map, etc.) whose
        /// body is built by the JS widget engine, not by this SSR renderer. Such forms must NOT take
        /// the SSR no-rebuild hydrate path — the hydrate branch only attaches behaviour and never
        /// calls MegaFormWidgets.renderWidget, so the widget body would never appear. Callers skip
        /// SSR for these forms so the JS does a full client rebuild (the DNN path, which works).
        /// </summary>
        public static bool ContainsHydrationWidget(FormSchema schema)
        {
            return schema != null && AnyHydrationWidget(schema.Fields);
        }

        /// <summary>
        /// [SSR hydrate v20260620-B213 / Phase 1] A form is SSR-hydrate-eligible when it is a plain
        /// STANDARD, SINGLE-PAGE, NON-widget form. Custom-HTML, multi-page and hydration-widget forms
        /// fall back to the JS rebuild path (the SSR no-rebuild hydrate branch only attaches behaviour
        /// to flat field-groups). Phase 2 will extend this to multi-page + custom-HTML.
        /// </summary>
        public static bool IsSsrEligible(FormSchema schema)
        {
            if (schema == null) return false;
            var settings = schema.Settings ?? new FormSettings();
            if (!string.IsNullOrWhiteSpace(settings.CustomHtml)) return false;
            if (ContainsHydrationWidget(schema)) return false;
            if (HasMultiplePages(schema)) return false;
            return true;
        }

        /// <summary>True if the schema declares a page break (a Section field with Properties["pageBreak"]==true),
        /// i.e. the JS renderer would split it into multiple mf-page steps.</summary>
        public static bool HasMultiplePages(FormSchema schema)
        {
            if (schema?.Fields == null) return false;
            foreach (var f in schema.Fields)
                if (f != null && IsPageBreak(f)) return true;
            return false;
        }

        private static bool AnyHydrationWidget(List<FormField> fields)
        {
            if (fields == null) return false;
            foreach (var f in fields)
            {
                if (f == null) continue;
                var type = f.Type ?? "Text";
                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (var col in GetRowColumns(f))
                        if (AnyHydrationWidget(col.Fields)) return true;
                    continue;
                }
                if (!NativeTypes.Contains(type)) return true;
            }
            return false;
        }

        /// <summary>
        /// Render the inner HTML of the fields container (#mf-fields-container-{formId}) for the
        /// given schema. Returns customHtml (token-substituted) when present, else standard fields.
        /// </summary>
        public static string RenderFieldsBody(FormSchema schema, int formId, string locale = null,
            string formTitle = null, string formDescription = null, string submitButtonText = null)
        {
            if (schema == null) return string.Empty;
            var settings = schema.Settings ?? new FormSettings();
            var fields = (schema.Fields ?? new List<FormField>())
                .Where(f => f != null)
                .OrderBy(f => f.Order)
                .ToList();

            // [FOUC/SSR-dedup 2026-07-02] Defensive de-dup by field key. A corrupted/legacy schema
            // can carry the same field twice (observed live: a form whose stored SchemaJson had EVERY
            // field duplicated → the SSR body emitted 36 .mf-field-group for an 18-field form). The
            // client renderer already de-dupes by data-key (hydrateSsrFields byKey keeps the first per
            // key), so an un-deduped SSR body paints each field twice → duplicate DOM ids, a visible
            // "double-then-collapse" flash on first paint, and ~2x payload. Match the client: keep the
            // FIRST occurrence per non-empty key. Keyless layout fields (rare) are left untouched.
            if (fields.Count > 1)
            {
                var seenKeys = new HashSet<string>(StringComparer.Ordinal);
                fields = fields.Where(f => string.IsNullOrEmpty(f.Key) || seenKeys.Add(f.Key)).ToList();
            }

            if (!string.IsNullOrWhiteSpace(settings.CustomHtml))
                return RenderCustomHtml(schema, fields, formId, locale, formTitle, formDescription, submitButtonText);

            // [PDF-grid / FlexGrid layout v20260629] Opt-in 2-D grid presentation for standard forms.
            // Fields stay FLAT; each .mf-field-group is wrapped in a .mf-flexgrid-item carrying the
            // same --lg/md/sm CSS vars the existing .mf-flexgrid CSS consumes. SSR is MANDATORY here
            // because the public renderer HYDRATES (does not rebuild) — the client moves these nodes
            // into a .mf-page but preserves the grid wrappers (see hydrateSsrFields flexgrid branch).
            var pages = CalculatePages(fields, settings);
            if (pages.Count > 1)
                return RenderStandardPagedFields(pages, formId, locale);

            if (string.Equals(settings.LayoutMode, "flexgrid", StringComparison.OrdinalIgnoreCase))
                return RenderFlexGridFields(fields, settings, formId, locale);

            return RenderStandardFields(fields, formId, locale);
        }

        public static int GetPageCount(FormSchema schema)
        {
            if (schema == null) return 0;
            var fields = NormalizeFields(schema);
            return CalculatePages(fields, schema.Settings ?? new FormSettings()).Count;
        }

        public static bool IsStandardMultiStep(FormSchema schema)
        {
            if (schema == null) return false;
            var settings = schema.Settings ?? new FormSettings();
            if (!string.IsNullOrWhiteSpace(settings.CustomHtml)) return false;
            return GetPageCount(schema) > 1;
        }

        public static string RenderStepIndicator(FormSchema schema, string locale = null)
        {
            if (!IsStandardMultiStep(schema)) return string.Empty;
            var pages = CalculatePages(NormalizeFields(schema), schema.Settings ?? new FormSettings());
            var labels = new List<string>();
            for (var i = 0; i < pages.Count; i++)
            {
                var section = pages[i].FirstOrDefault(f =>
                    string.Equals(f.Type, "Section", StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(ResolveFieldTranslation(f, locale).Label));
                var raw = section != null ? ResolveFieldTranslation(section, locale).Label : "Step " + (i + 1).ToString(CultureInfo.InvariantCulture);
                var label = Regex.Replace(raw ?? string.Empty, @"^Step\s*\d+[:\s]*", string.Empty, RegexOptions.IgnoreCase).Trim();
                labels.Add(string.IsNullOrEmpty(label) ? "Step " + (i + 1).ToString(CultureInfo.InvariantCulture) : label);
            }

            var sb = new StringBuilder();
            sb.Append("<div class=\"mf-steps\">");
            for (var i = 0; i < pages.Count; i++)
            {
                sb.Append("<div class=\"mf-step").Append(i == 0 ? " active" : string.Empty)
                  .Append("\" data-step=\"").Append(i.ToString(CultureInfo.InvariantCulture)).Append("\">")
                  .Append("<div class=\"mf-step-circle\">").Append((i + 1).ToString(CultureInfo.InvariantCulture)).Append("</div>")
                  .Append("<div class=\"mf-step-label\">").Append(Esc(labels[i])).Append("</div></div>");
                if (i < pages.Count - 1) sb.Append("<div class=\"mf-step-line\"></div>");
            }
            sb.Append("</div>");
            return sb.ToString();
        }

        // ────────────────────────────────────────────────────────────────
        // Custom HTML mode — substitute {{form:*}}, {{content:*}}, {{script:*}}, {{field:key}}
        // ────────────────────────────────────────────────────────────────
        private static string RenderCustomHtml(FormSchema schema, List<FormField> fields, int formId, string locale,
            string formTitle, string formDescription, string submitButtonText)
        {
            var settings = schema.Settings;
            var html = settings.CustomHtml ?? string.Empty;

            // {{form:title|description|submit}}
            var formTr = ResolveFormTranslation(schema, locale, formTitle, formDescription, submitButtonText);
            html = html.Replace("{{form:title}}", Esc(formTr.Title));
            html = html.Replace("{{form:description}}", Esc(formTr.Description));
            html = html.Replace("{{form:submit}}", Esc(formTr.SubmitButtonText));

            // {{content:key}} from customContent map (already authored HTML/text)
            var content = settings.CustomContent ?? new Dictionary<string, string>();
            html = Regex.Replace(html, @"\{\{content:([a-zA-Z0-9_\-]+)\}\}", m =>
            {
                var key = m.Groups[1].Value;
                // [SecFix 2026-07-04 P0-6/P1-7] HTML-encode content-token values by default so a stored
                // value like "<img src=x onerror=...>" cannot become active markup (stored XSS). Shipped
                // CustomContent values are plain text / image URLs; Esc() is attribute-safe (encodes both quotes).
                return content.TryGetValue(key, out var v) ? Esc(v ?? string.Empty) : string.Empty;
            });

            // {{script:key}} → anchor span (JS injects the managed script). Keep SEO-neutral.
            html = Regex.Replace(html, @"\{\{script:([a-zA-Z0-9_\-]+)\}\}", m =>
            {
                var key = Esc(m.Groups[1].Value);
                return "<span class=\"mf-script-anchor\" data-mf-script=\"" + key + "\" data-mf-script-key=\"" + key +
                       "\" data-mf-script-badge=\"FormHtmlRenderer SSR\" style=\"display:none !important;\"></span>";
            });

            // {{field:key}} → field wrapper (label + input)
            var fieldMap = BuildFieldMap(fields);
            html = Regex.Replace(html, @"\{\{field:([a-zA-Z0-9_]+)\}\}", m =>
            {
                var key = m.Groups[1].Value;
                if (!fieldMap.TryGetValue(key, out var field))
                    return "<div style=\"color:#ef4444;font-size:12px;\">Field \"" + Esc(key) + "\" not found</div>";
                return RenderFieldToken(field, formId, locale);
            });

            // {{summary}} → schema-driven review summary (label + value-slot per input field;
            // the JS fills values live). Auto-reflects the schema after edits, unlike hard-coded
            // template summary rows. Parity with MegaForm.UI/src/shared/summary-html.ts.
            if (html.IndexOf("{{summary}}", StringComparison.Ordinal) >= 0)
                html = html.Replace("{{summary}}", BuildSummaryHtml(fields));

            // Trailing hidden fields not referenced by a token (parity with TS)
            var sb = new StringBuilder(html);
            foreach (var f in fields)
            {
                if (string.Equals(f.Type, "Hidden", StringComparison.OrdinalIgnoreCase)
                    && html.IndexOf("{{field:" + f.Key + "}}", StringComparison.Ordinal) == -1)
                {
                    sb.Append("<input type=\"hidden\" name=\"").Append(Esc(f.Key))
                      .Append("\" value=\"").Append(Esc(f.DefaultValue ?? string.Empty)).Append("\">");
                }
            }
            return sb.ToString();
        }

        // ────────────────────────────────────────────────────────────────
        // Standard mode — one field per row, default layout
        // ────────────────────────────────────────────────────────────────
        private static string RenderStandardFields(List<FormField> fields, int formId, string locale)
        {
            var sb = new StringBuilder();
            foreach (var field in fields)
            {
                if (string.Equals(field.Type, "Hidden", StringComparison.OrdinalIgnoreCase))
                {
                    sb.Append("<input type=\"hidden\" name=\"").Append(Esc(field.Key))
                      .Append("\" value=\"").Append(Esc(field.DefaultValue ?? string.Empty)).Append("\">");
                    continue;
                }
                sb.Append(RenderFieldGroup(field, formId, locale));
            }
            return sb.ToString();
        }

        private static string RenderStandardPagedFields(List<List<FormField>> pages, int formId, string locale)
        {
            var sb = new StringBuilder();
            for (var pageIdx = 0; pageIdx < pages.Count; pageIdx++)
            {
                sb.Append("<div class=\"mf-page\" id=\"mf-page-").Append(formId)
                  .Append('-').Append(pageIdx.ToString(CultureInfo.InvariantCulture)).Append("\"");
                if (pageIdx > 0) sb.Append(" style=\"display:none;\"");
                sb.Append(">");
                foreach (var field in pages[pageIdx])
                {
                    if (string.Equals(field.Type, "Hidden", StringComparison.OrdinalIgnoreCase))
                    {
                        sb.Append("<input type=\"hidden\" name=\"").Append(Esc(field.Key))
                          .Append("\" value=\"").Append(Esc(field.DefaultValue ?? string.Empty)).Append("\">");
                        continue;
                    }
                    sb.Append(RenderFieldGroup(field, formId, locale));
                }
                sb.Append("</div>");
            }
            return sb.ToString();
        }

        // ────────────────────────────────────────────────────────────────
        // [PDF-grid / FlexGrid layout v20260629] Standard fields on a responsive 2-D grid.
        // Mirrors MegaForm.UI/src/renderer/inputs.ts renderFlexGridElement (1-based x/y, lg/md/sm).
        // ────────────────────────────────────────────────────────────────
        private static int GridClamp(int v, int min, int max) => Math.Max(min, Math.Min(max, v));

        private static string PlacementVars(string bp, FlexPlacement pl, int cols)
        {
            // 1-based for CSS grid-column / grid-row (parity with the TS renderer's "+ 1").
            int x = GridClamp(pl.X, 0, cols - 1) + 1;
            int y = GridClamp(pl.Y, 0, 999) + 1;
            int w = GridClamp(pl.W, 1, cols);
            int h = GridClamp(pl.H, 1, 12);
            return "--" + bp + "-x:" + x + ";--" + bp + "-y:" + y + ";--" + bp + "-w:" + w + ";--" + bp + "-h:" + h + ";";
        }

        private static string RenderFlexGridFields(List<FormField> fields, FormSettings settings, int formId, string locale)
        {
            var cfg = settings.GridConfig ?? new FlexGridConfig();
            int cols = cfg.Cols > 0 ? GridClamp(cfg.Cols, 1, 24) : 24;
            int rh = GridClamp(cfg.RowHeight, 20, 400);
            int gap = GridClamp(cfg.Gap, 0, 64);

            var sb = new StringBuilder();
            sb.Append("<div class=\"mf-flexgrid\" data-mf-flexgrid=\"1\" style=\"--mf-grid-cols:").Append(cols)
              .Append(";--mf-grid-rh:").Append(rh).Append("px;--mf-grid-gap:").Append(gap).Append("px\">");
            int idx = 0;
            foreach (var field in fields)
            {
                if (string.Equals(field.Type, "Hidden", StringComparison.OrdinalIgnoreCase))
                {
                    // hidden inputs stay bare (no grid cell)
                    sb.Append("<input type=\"hidden\" name=\"").Append(Esc(field.Key))
                      .Append("\" value=\"").Append(Esc(field.DefaultValue ?? string.Empty)).Append("\">");
                    continue;
                }
                var p = field.Placement;
                var lg = p?.Lg ?? new FlexPlacement { X = 0, Y = idx, W = cols, H = 1 };
                var md = p?.Md ?? lg;
                var sm = p?.Sm ?? new FlexPlacement { X = 0, Y = idx, W = cols, H = 1 };
                sb.Append("<div class=\"mf-flexgrid-item\" style=\"")
                  .Append(PlacementVars("lg", lg, cols))
                  .Append(PlacementVars("md", md, cols))
                  .Append(PlacementVars("sm", sm, cols))
                  .Append("\">")
                  .Append(RenderFieldGroup(field, formId, locale))
                  .Append("</div>");
                idx++;
            }
            sb.Append("</div>");
            return sb.ToString();
        }

        // A {{field:key}} token can resolve to a Section/Html/Hidden/Row special-case
        private static string RenderFieldToken(FormField field, int formId, string locale)
        {
            var type = field.Type ?? string.Empty;
            if (string.Equals(type, "Hidden", StringComparison.OrdinalIgnoreCase))
                return "<input type=\"hidden\" name=\"" + Esc(field.Key) + "\" value=\"" + Esc(field.DefaultValue ?? string.Empty) + "\">";
            return RenderFieldGroup(field, formId, locale);
        }

        // Field types that are NOT user input → excluded from the {{summary}} block.
        private static readonly HashSet<string> NonSummaryTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        { "Section", "Hidden", "Html", "ContentSlider", "Map", "QRCode", "QR", "RichText",
          "DataRepeater", "Captcha", "GolfScorecard", "VideoEmbed", "DrawOnImage", "Signature" };

        // [SchemaSummary 2026-06-28] Build the {{summary}} block from the schema: one row per input
        // field (label + empty value slot the JS fills live). MUST stay byte-parity with
        // MegaForm.UI/src/shared/summary-html.ts buildSummaryHtml(). Inline styles (mirrors the JS
        // showReview rows) so it renders correctly without any external/cache-stamped CSS.
        private static string BuildSummaryHtml(List<FormField> fields)
        {
            var sb = new StringBuilder();
            sb.Append("<div class=\"mf-summary\" data-mf-summary=\"1\" role=\"group\" aria-label=\"Summary\">");
            AppendSummaryRows(sb, fields);
            sb.Append("</div>");
            return sb.ToString();
        }

        private static void AppendSummaryRows(StringBuilder sb, List<FormField> fields)
        {
            if (fields == null) return;
            foreach (var f in fields)
            {
                if (f == null) continue;
                var type = f.Type ?? "Text";
                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (var col in GetRowColumns(f))
                        AppendSummaryRows(sb, col.Fields);
                    continue;
                }
                if (NonSummaryTypes.Contains(type)) continue;
                var key = f.Key ?? string.Empty;
                if (string.IsNullOrEmpty(key)) continue;
                var label = string.IsNullOrEmpty(f.Label) ? key : f.Label;
                sb.Append("<div class=\"mf-summary-row\" style=\"display:flex;justify-content:space-between;gap:18px;padding:11px 2px;border-bottom:1px solid rgba(127,127,127,.18)\">")
                  .Append("<span class=\"mf-summary-label\" style=\"font-weight:600;opacity:.66;flex:0 0 40%\">").Append(Esc(label)).Append("</span>")
                  .Append("<span class=\"mf-summary-value\" data-mf-summary-key=\"").Append(Esc(key)).Append("\" style=\"flex:1;text-align:right;word-break:break-word;white-space:pre-wrap\"></span>")
                  .Append("</div>");
            }
        }

        // ────────────────────────────────────────────────────────────────
        // Field group wrapper (matches renderSingleFieldElement / renderCustomHtml)
        // ────────────────────────────────────────────────────────────────
        private static string RenderFieldGroup(FormField field, int formId, string locale)
        {
            var type = field.Type ?? "Text";
            var tr = ResolveFieldTranslation(field, locale);
            var showIfAttr = field.ShowIf != null
                ? " data-show-if=\"" + Esc(SerializeShowIf(field.ShowIf)) + "\""
                : string.Empty;

            // Section
            if (string.Equals(type, "Section", StringComparison.OrdinalIgnoreCase))
            {
                if (IsPageBreak(field))
                    return "<div class=\"mf-field-group\" data-key=\"" + Esc(field.Key) + "\" data-type=\"Section\"" + showIfAttr +
                           "><div class=\"mf-page-anchor\" data-mf-page-break-key=\"" + Esc(field.Key) + "\" hidden></div></div>";
                return "<div class=\"mf-field-group\" data-key=\"" + Esc(field.Key) + "\" data-type=\"Section\"" + showIfAttr +
                       "><div class=\"mf-section-break\"><div class=\"mf-section-title\">" + Esc(tr.Label) + "</div></div></div>";
            }
            // Html
            if (string.Equals(type, "Html", StringComparison.OrdinalIgnoreCase))
                return "<div class=\"mf-field-group\" data-key=\"" + Esc(field.Key) + "\" data-type=\"Html\"" + showIfAttr +
                       "><div class=\"mf-html-block\">" + (tr.HtmlContent ?? field.HtmlContent ?? string.Empty) + "</div></div>";
            // Row
            if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase) && GetRowColumns(field).Count > 0)
                return RenderRow(field, formId, locale, showIfAttr);

            var isWidget = !NativeTypes.Contains(type);
            var selfLabeled = isWidget && !AlwaysLabeledWidgets.Contains(type);

            var sb = new StringBuilder();
            // Per-field width (inline-edit resize) → data-width so the flow CSS sizes the field;
            // omitted at the 100% default. SSR parity with the TS renderer so a resized width
            // survives SSR first paint + hydrate (standard forms hydrate the SSR field DOM).
            var widthAttr = (!string.IsNullOrEmpty(field.Width) && field.Width != "100%")
                ? " data-width=\"" + Esc(field.Width) + "\"" : string.Empty;
            sb.Append("<div class=\"mf-field-group\" data-key=\"").Append(Esc(field.Key))
              .Append("\" data-type=\"").Append(Esc(type)).Append("\"").Append(widthAttr).Append(showIfAttr).Append(">");
            if (!selfLabeled)
            {
                sb.Append("<label class=\"mf-field-label\" for=\"mf-").Append(formId).Append('-').Append(Esc(field.Key)).Append("\">")
                  .Append(Esc(tr.Label));
                if (field.Required) sb.Append(" <span class=\"mf-required\">*</span>");
                sb.Append("</label>");
            }
            sb.Append(RenderInput(field, formId, tr));
            if (!selfLabeled && !string.IsNullOrEmpty(tr.HelpText))
                sb.Append("<div class=\"mf-field-help\">").Append(Esc(tr.HelpText)).Append("</div>");
            sb.Append("<div class=\"mf-field-error\" id=\"mf-err-").Append(Esc(field.Key)).Append("\"></div></div>");
            return sb.ToString();
        }

        private static string RenderRow(FormField field, int formId, string locale, string showIfAttr)
        {
            var columns = GetRowColumns(field);
            var colTpl = string.Join(" ", columns.Select(c => (c.Span <= 0 ? 6 : c.Span) + "fr"));
            var sb = new StringBuilder();
            sb.Append("<div class=\"mf-field-group mf-field-group--row\" data-key=\"").Append(Esc(field.Key))
              .Append("\" data-type=\"Row\"").Append(showIfAttr).Append(">");
            sb.Append("<div class=\"mf-row\" style=\"display:grid;grid-template-columns:").Append(colTpl)
              .Append(";gap:var(--mf-field-gap,20px);margin-bottom:var(--mf-field-gap,20px);width:100%;\">");
            foreach (var col in columns)
            {
                sb.Append("<div class=\"mf-row-column\">");
                foreach (var cf in (col.Fields ?? new List<FormField>()))
                    sb.Append(RenderFieldGroup(cf, formId, locale));
                sb.Append("</div>");
            }
            sb.Append("</div></div>");
            return sb.ToString();
        }

        // ────────────────────────────────────────────────────────────────
        // Input HTML per type (mirrors renderInput)
        // ────────────────────────────────────────────────────────────────
        private static string RenderInput(FormField field, int formId, ResolvedField tr)
        {
            var id = "mf-" + formId + "-" + field.Key;
            var name = field.Key;
            var val = field.DefaultValue ?? string.Empty;
            var ph = tr.Placeholder ?? string.Empty;
            var ro = field.ReadOnly ? " readonly disabled" : string.Empty;
            var req = field.Required ? " required" : string.Empty;
            var type = field.Type ?? "Text";

            switch (type)
            {
                case "Text":
                case "Phone":
                case "Url":
                {
                    var it = type == "Phone" ? "tel" : type == "Url" ? "url" : "text";
                    return Input(it, id, name, val, ph, ro + req);
                }
                case "Password":
                    return Input("password", id, name, val, ph, ro + req);
                case "Email":
                    return Input("email", id, name, val, ph, ro + req);
                case "Number":
                {
                    var v = field.Validation;
                    var minA = v?.Min != null ? " min=\"" + v.Min + "\"" : string.Empty;
                    var maxA = v?.Max != null ? " max=\"" + v.Max + "\"" : string.Empty;
                    return "<input type=\"number\" class=\"mf-input\" id=\"" + id + "\" name=\"" + name + "\" value=\"" + Esc(val)
                        + "\" placeholder=\"" + Esc(ph) + "\"" + minA + maxA + ro + req + ">";
                }
                case "Date":
                    return CalendarDatePicker(field, id, name, val, ph, ro);
                case "Textarea":
                    return "<textarea class=\"mf-textarea\" id=\"" + id + "\" name=\"" + name + "\" placeholder=\"" + Esc(ph) + "\"" + ro + req + ">" + Esc(val) + "</textarea>";
                case "Select":
                {
                    var sb = new StringBuilder();
                    sb.Append("<select class=\"mf-select\" id=\"").Append(id).Append("\" name=\"").Append(name).Append("\"").Append(ro).Append(req).Append(">");
                    sb.Append("<option value=\"\">").Append(Esc(string.IsNullOrEmpty(ph) ? "Select..." : ph)).Append("</option>");
                    foreach (var opt in SafeOptions(field))
                        sb.Append("<option value=\"").Append(Esc(opt.Value)).Append("\"")
                          .Append(val == opt.Value ? " selected" : "").Append(">")
                          .Append(Esc(tr.OptionLabel(opt))).Append("</option>");
                    return sb.Append("</select>").ToString();
                }
                case "Radio":
                {
                    var sb = new StringBuilder("<div class=\"" + OptionGroupClass(field) + "\">");
                    foreach (var opt in SafeOptions(field))
                        sb.Append(OptionItem("radio", name, opt, tr.OptionLabel(opt), val == opt.Value, id, field));
                    return sb.Append("</div>").ToString();
                }
                case "Checkbox":
                {
                    var selected = (val ?? string.Empty).Split(',').Select(s => s.Trim()).ToHashSet();
                    var sb = new StringBuilder("<div class=\"" + OptionGroupClass(field) + "\">");
                    foreach (var opt in SafeOptions(field))
                        sb.Append(OptionItem("checkbox", name, opt, tr.OptionLabel(opt), selected.Contains(opt.Value), id, field));
                    return sb.Append("</div>").ToString();
                }
                // [Chips/Cards 2026-06-28] SSR parity with renderer/inputs.ts: Chips = multi-select
                // (checkbox inputs) forced to the chips skin; Cards = single-select (radio) forced cards.
                case "Chips":
                {
                    var selected = (val ?? string.Empty).Split(',').Select(s => s.Trim()).ToHashSet();
                    var sb = new StringBuilder("<div class=\"" + OptionGroupClass(field, "chips") + "\">");
                    foreach (var opt in SafeOptions(field))
                        sb.Append(OptionItem("checkbox", name, opt, tr.OptionLabel(opt), selected.Contains(opt.Value), id, field, "chips"));
                    return sb.Append("</div>").ToString();
                }
                case "Cards":
                {
                    var sb = new StringBuilder("<div class=\"" + OptionGroupClass(field, "cards") + "\">");
                    foreach (var opt in SafeOptions(field))
                        sb.Append(OptionItem("radio", name, opt, tr.OptionLabel(opt), val == opt.Value, id, field, "cards"));
                    return sb.Append("</div>").ToString();
                }
                case "File":
                {
                    var fs = field.FileSettings ?? new FileFieldSettings();
                    var accept = string.Join(",", fs.AllowedExtensions ?? new List<string>());
                    var multi = (fs.MaxFiles > 1) ? " multiple" : string.Empty;
                    return "<div class=\"mf-file-dropzone\" id=\"" + id + "-zone\">"
                        + "<div class=\"mf-file-icon\"><i class=\"fa fa-cloud-upload-alt\"></i></div>"
                        + "<div class=\"mf-file-text\">Click or drag files here</div>"
                        + "<input type=\"file\" data-field-key=\"" + name + "\" id=\"" + id + "\" style=\"display:none;\""
                        + (string.IsNullOrEmpty(accept) ? "" : " accept=\"" + Esc(accept) + "\"") + multi + ">"
                        + "<input type=\"hidden\" name=\"" + name + "\" id=\"" + id + "-value\" value=\"" + Esc(val) + "\">"
                        + "<div class=\"mf-file-list\" id=\"" + id + "-list\"></div></div>";
                }
                case "Rating":
                {
                    int.TryParse(val, out var rv);
                    // [SSR/client parity fix 2026-07-03] Was: bare <span class="mf-star"> children of the
                    // grid .mf-rating → each star fell on its own grid row (stars stacked VERTICALLY, the
                    // reported bug). Match the client renderer (inputs.ts renderRatingInput): wrap the stars
                    // in the flex .mf-rating-items and use .mf-rating-item so the shared CSS lays them out
                    // horizontally and the active fill toggles via .mf-rating-on/off.
                    var sb = new StringBuilder("<div class=\"mf-rating mf-rating--star\" id=\"" + id + "-rating\" data-name=\"" + name + "\" data-value=\"" + rv + "\" data-style=\"star\">");
                    sb.Append("<div class=\"mf-rating-items\" role=\"radiogroup\" aria-label=\"Rating\">");
                    for (var i = 1; i <= 5; i++)
                        sb.Append("<button type=\"button\" class=\"mf-rating-item mf-star")
                          .Append(i <= rv ? " is-active" : "")
                          .Append("\" data-val=\"").Append(i).Append("\" aria-label=\"").Append(i).Append(" of 5 stars\">")
                          .Append("<span class=\"mf-rating-on\">&#9733;</span><span class=\"mf-rating-off\">&#9734;</span></button>");
                    sb.Append("</div>");
                    sb.Append("<div class=\"mf-rating-value\">").Append(rv > 0 ? rv + " out of 5" : "").Append("</div>");
                    sb.Append("<input type=\"hidden\" name=\"").Append(name).Append("\" value=\"").Append(Esc(val)).Append("\">");
                    return sb.Append("</div>").ToString();
                }
                case "Signature":
                    return "<div class=\"mf-signature-field\" style=\"border:1px solid #d0d5dd;border-radius:6px;padding:8px;background:#fafafa;\">"
                        + "<canvas id=\"" + id + "-canvas\" class=\"mf-signature-canvas\" width=\"400\" height=\"150\" style=\"width:100%;display:block;border:1px solid #e0e0e0;border-radius:4px;cursor:crosshair;\"></canvas>"
                        + "<div class=\"mf-signature-actions\" style=\"margin-top:6px;text-align:right;\"><button type=\"button\" class=\"mf-sig-clear\" data-canvas=\"" + id + "-canvas\" style=\"font-size:12px;border:1px solid #ccc;background:#fff;padding:4px 12px;border-radius:4px;cursor:pointer;\">Clear</button></div>"
                        + "<input type=\"hidden\" name=\"" + name + "\" id=\"" + id + "\"></div>";
                case "Composite":
                    return RenderCompositeInput(field, id, name, val, ph, ro, req);
                default:
                    // Widget — emit a labelled hydration placeholder. The JS widget engine
                    // (MegaFormWidgets.renderWidget) fills the body on load; the label/help
                    // already in the wrapper are the SEO content. data-mf-widget-hydrate flags it.
                    return "<div class=\"mf-widget-host\" data-mf-widget-hydrate=\"" + Esc(type) + "\" data-field-key=\"" + Esc(name)
                        + "\" id=\"" + id + "-host\"><input type=\"hidden\" name=\"" + name + "\" id=\"" + id + "\" value=\"" + Esc(val) + "\"></div>";
            }
        }

        private sealed class CompositePart
        {
            [Newtonsoft.Json.JsonProperty("key")] public string Key { get; set; }
            [Newtonsoft.Json.JsonProperty("placeholder")] public string Placeholder { get; set; }
            [Newtonsoft.Json.JsonProperty("label")] public string Label { get; set; }
            [Newtonsoft.Json.JsonProperty("sublabel")] public string Sublabel { get; set; }
            [Newtonsoft.Json.JsonProperty("width")] public string Width { get; set; }
            [Newtonsoft.Json.JsonProperty("flex")] public double? Flex { get; set; }
            [Newtonsoft.Json.JsonProperty("maxLength")] public int? MaxLength { get; set; }
            [Newtonsoft.Json.JsonProperty("def")] public string Def { get; set; }
            [Newtonsoft.Json.JsonProperty("type")] public string Type { get; set; }
            [Newtonsoft.Json.JsonProperty("options")] public List<CompositeOption> Options { get; set; }
            [Newtonsoft.Json.JsonProperty("row")] public int? Row { get; set; }
            [Newtonsoft.Json.JsonProperty("hidden")] public bool Hidden { get; set; }
            [Newtonsoft.Json.JsonProperty("required")] public bool Required { get; set; }
            [Newtonsoft.Json.JsonProperty("mask")] public string Mask { get; set; }
            [Newtonsoft.Json.JsonProperty("inputMode")] public string InputMode { get; set; }
            [Newtonsoft.Json.JsonProperty("min")] public double? Min { get; set; }
            [Newtonsoft.Json.JsonProperty("max")] public double? Max { get; set; }
            [Newtonsoft.Json.JsonProperty("sep")] public string Sep { get; set; }
            [Newtonsoft.Json.JsonProperty("rows")] public int? Rows { get; set; }
            [Newtonsoft.Json.JsonProperty("valueMode")] public string ValueMode { get; set; }
            [Newtonsoft.Json.JsonProperty("allowed")] public List<string> Allowed { get; set; }
        }

        private sealed class CompositeOption
        {
            [Newtonsoft.Json.JsonProperty("value")] public string Value { get; set; }
            [Newtonsoft.Json.JsonProperty("label")] public string Label { get; set; }
        }

        private sealed class PickerCountry
        {
            public string Iso2 { get; set; }
            public string Name { get; set; }
            public string Dial { get; set; }
        }

        private static string RenderCompositeInput(FormField field, string id, string name, string val, string ph, string ro, string req)
        {
            var preset = CompositePreset(field);
            var parts = ResolveCompositeParts(field, preset);
            if (parts == null || parts.Count == 0)
                return Input("text", id, name, val, ph, ro + req);

            var nav = WidgetStringProp(field, "nav") ?? "roving";
            var orient = WidgetStringProp(field, "orient") ?? (string.Equals(preset, "address", StringComparison.OrdinalIgnoreCase) ? "both" : "horizontal");
            var labelPos = WidgetStringProp(field, "labelPos") ?? "bottom"; // [B268] composite sub-label position (top/bottom/hidden)
            var isScalarSingle = IsScalarCompositePreset(preset) && parts.Count == 1;

            var rowOrder = new List<int>();
            var rowMap = new Dictionary<int, List<string>>();
            var visibleIndex = 0;
            foreach (var part in parts.Where(p => p != null && !p.Hidden && !string.IsNullOrWhiteSpace(p.Key)))
            {
                var row = part.Row ?? 0;
                if (!rowMap.TryGetValue(row, out var rowParts))
                {
                    rowParts = new List<string>();
                    rowMap[row] = rowParts;
                    rowOrder.Add(row);
                }
                rowParts.Add(RenderCompositePart(part, val, nav, visibleIndex, isScalarSingle, ro, labelPos));
                visibleIndex++;
            }

            var rows = new StringBuilder();
            foreach (var row in rowOrder)
            {
                rows.Append("<div class=\"mf-composite-row\" style=\"display:flex;gap:8px;align-items:stretch;\">")
                    .Append(string.Join(string.Empty, rowMap[row]))
                    .Append("</div>");
            }

            return "<div class=\"mf-composite\" role=\"group\" aria-label=\"" + Esc(field.Label ?? name) + "\" data-key=\"" + Esc(name)
                + "\" data-preset=\"" + Esc(preset) + "\" data-mf-nav=\"" + Esc(nav) + "\" data-mf-orient=\"" + Esc(orient)
                + "\" style=\"display:flex;flex-direction:column;gap:8px;\">" + rows
                + "</div><input type=\"hidden\" name=\"" + Esc(name) + "\" id=\"" + Esc(id) + "\" value=\"" + Esc(val) + "\">";
        }

        private static string RenderCompositePart(CompositePart part, string val, string nav, int visibleIndex, bool isScalarSingle, string ro, string labelPos = "bottom")
        {
            var partValue = isScalarSingle
                ? (val ?? string.Empty)
                : (!string.IsNullOrEmpty(part.Def) && string.IsNullOrEmpty(val) ? part.Def : string.Empty);
            var label = CompositePartLabel(part);
            var tabIdx = string.Equals(nav, "roving", StringComparison.OrdinalIgnoreCase) ? " tabindex=\"" + (visibleIndex == 0 ? "0" : "-1") + "\"" : string.Empty;
            var reqAttr = part.Required ? " aria-required=\"true\" data-mf-required=\"1\"" : string.Empty;
            const string partStyle = "width:100%;min-width:0;";
            var type = (part.Type ?? "text").Trim();
            string control;

            if (string.Equals(type, "country", StringComparison.OrdinalIgnoreCase))
            {
                control = RenderCountryPickerControl(part, partValue, label, tabIdx, reqAttr, ro);
            }
            else if (string.Equals(type, "select", StringComparison.OrdinalIgnoreCase))
            {
                var optHtml = new StringBuilder();
                foreach (var option in part.Options ?? new List<CompositeOption>())
                {
                    var ov = option?.Value ?? string.Empty;
                    var ol = option?.Label ?? ov;
                    optHtml.Append("<option value=\"").Append(Esc(ov)).Append("\"")
                        .Append(ov == partValue ? " selected" : string.Empty)
                        .Append(">").Append(Esc(ol)).Append("</option>");
                }
                control = "<select class=\"mf-input mf-composite-part\" data-mf-part=\"" + Esc(part.Key) + "\" aria-label=\"" + Esc(label)
                    + "\"" + tabIdx + reqAttr + ro + " style=\"" + partStyle + "\">" + optHtml + "</select>";
            }
            else if (string.Equals(type, "textarea", StringComparison.OrdinalIgnoreCase))
            {
                var rows = part.Rows.GetValueOrDefault(2);
                control = "<textarea class=\"mf-input mf-composite-part\" data-mf-part=\"" + Esc(part.Key) + "\" aria-label=\"" + Esc(label)
                    + "\"" + tabIdx + reqAttr + " placeholder=\"" + Esc(part.Placeholder ?? part.Label ?? string.Empty) + "\"" + ro
                    + " rows=\"" + rows + "\" style=\"" + partStyle + "\">" + Esc(partValue) + "</textarea>";
            }
            else
            {
                var ml = part.MaxLength.HasValue ? " maxlength=\"" + part.MaxLength.Value + "\"" : string.Empty;
                var maskAttr = string.IsNullOrEmpty(part.Mask) ? string.Empty : " data-mf-mask=\"" + Esc(part.Mask) + "\"";
                var inputMode = !string.IsNullOrEmpty(part.InputMode)
                    ? " inputmode=\"" + Esc(part.InputMode) + "\""
                    : (!string.IsNullOrEmpty(part.Mask) ? " inputmode=\"numeric\"" : string.Empty);
                var numAttr = string.Equals(type, "number", StringComparison.OrdinalIgnoreCase)
                    ? (part.Min.HasValue ? " min=\"" + CssNum(part.Min.Value) + "\"" : string.Empty)
                      + (part.Max.HasValue ? " max=\"" + CssNum(part.Max.Value) + "\"" : string.Empty)
                    : string.Empty;
                control = "<input type=\"" + InputTypeAttr(type) + "\" class=\"mf-input mf-composite-part\" data-mf-part=\"" + Esc(part.Key)
                    + "\" aria-label=\"" + Esc(label) + "\"" + tabIdx + reqAttr
                    + " placeholder=\"" + Esc(part.Placeholder ?? part.Label ?? string.Empty) + "\" value=\"" + Esc(partValue) + "\""
                    + ml + maskAttr + inputMode + numAttr + ro + " style=\"" + partStyle + "\">";
            }

            // [B268] Sub-label position per composite labelPos: top (above box) | bottom (default) | hidden.
            var isTop = string.Equals(labelPos, "top", StringComparison.OrdinalIgnoreCase);
            var isHidden = string.Equals(labelPos, "hidden", StringComparison.OrdinalIgnoreCase);
            // [BUG3 fix 20260701] Fall back to the accessible label (label = CompositePartLabel:
            // label -> sublabel -> known-key map -> placeholder -> humanized key) when the part has
            // no explicit sublabel, so presets like 'name' (First/Last, no sublabels) still render a
            // label above/below EVERY box under labelPos top/bottom (was: empty => no <small>).
            var subText = !string.IsNullOrEmpty(part.Sublabel) ? part.Sublabel : (!isHidden ? label : string.Empty);
            var subHtml = (!isHidden && (!string.IsNullOrEmpty(subText) || part.Required))
                ? "<small class=\"mf-composite-sub mf-composite-sub--" + (isTop ? "top" : "bottom") + "\">" + Esc(subText) + (part.Required ? " <span class=\"mf-composite-req\" aria-hidden=\"true\">*</span>" : string.Empty) + "</small>"
                : string.Empty;
            var sepHtml = !string.IsNullOrEmpty(part.Sep)
                ? "<span class=\"mf-composite-sep\" aria-hidden=\"true\" style=\"align-self:flex-start;display:flex;align-items:center;height:38px;padding:0 2px;color:#64748b;font-weight:700;\">" + Esc(part.Sep) + "</span>"
                : string.Empty;

            var cellInner = isTop ? (subHtml + control) : (control + subHtml);
            return "<div class=\"mf-composite-cell\" style=\"" + CompositeCellStyle(part) + "\">" + cellInner + "</div>" + sepHtml;
        }

        private static string RenderCountryPickerControl(CompositePart part, string value, string ariaLabel, string tabIdx, string reqAttr, string ro)
        {
            var valueMode = string.Equals(part.ValueMode, "iso2", StringComparison.OrdinalIgnoreCase) ? "iso2" : "dial";
            // [B268] Compact flag-only trigger for phone (dial) — hide the redundant "+1" chip; the
            // dial code stays the stored value + is shown in the open list. Address (iso2) keeps its chip.
            var showCode = valueMode == "iso2" ? "iso2" : "none";
            var selected = ResolveCountry(value, valueMode);
            var storedVal = valueMode == "iso2" ? selected.Iso2 : selected.Dial;
            var codeText = showCode == "none" ? string.Empty : (showCode == "iso2" ? selected.Iso2 : selected.Dial);
            var allowedAttr = part.Allowed != null && part.Allowed.Count > 0
                ? " data-mf-ccp-allowed=\"" + Esc(string.Join(",", part.Allowed.Select(s => (s ?? string.Empty).ToUpperInvariant()))) + "\""
                : string.Empty;
            var disabled = ro.IndexOf("disabled", StringComparison.OrdinalIgnoreCase) >= 0 ? " disabled" : string.Empty;

            return "<div class=\"mf-ccp\" data-mf-ccp data-value-mode=\"" + valueMode + "\" data-show-code=\"" + showCode + "\"" + allowedAttr + ">"
                + "<button type=\"button\" class=\"mf-ccp-trigger mf-input mf-composite-part\" data-mf-part=\"" + Esc(part.Key)
                + "\" value=\"" + Esc(storedVal) + "\" aria-haspopup=\"listbox\" aria-expanded=\"false\" aria-label=\"" + Esc(ariaLabel)
                + "\"" + tabIdx + reqAttr + disabled + ">"
                + "<span class=\"mf-ccp-flag\">" + FlagHtml(selected) + "</span>"
                + (showCode == "none" ? string.Empty : "<span class=\"mf-ccp-code\">" + Esc(codeText) + "</span>")
                + "<span class=\"mf-ccp-chev\" aria-hidden=\"true\"></span></button>"
                + "<div class=\"mf-ccp-dropdown\" role=\"listbox\" aria-label=\"" + Esc(ariaLabel) + "\" hidden>"
                + "<div class=\"mf-ccp-search-wrap\"><input type=\"text\" class=\"mf-ccp-search\" placeholder=\"Search country or dial code\" autocomplete=\"off\"></div>"
                + "<div class=\"mf-ccp-list\"></div></div></div>";
        }

        private static string FlagHtml(PickerCountry country)
        {
            var iso = (country?.Iso2 ?? "US").ToLowerInvariant();
            return "<span class=\"mf-ccp-flag-frame\" aria-hidden=\"true\"><span class=\"mf-ccp-flag-fallback\">"
                + Esc(country?.Iso2 ?? "US") + "</span><img class=\"mf-ccp-flag-img\" src=\"/Modules/MegaForm/img/flags/4x3/"
                + Esc(iso) + ".svg\" alt=\"\" loading=\"lazy\" decoding=\"async\" onerror=\"this.style.display=&quot;none&quot;;this.parentNode.className+=&quot; is-missing&quot;\"></span>";
        }

        private static PickerCountry ResolveCountry(string value, string valueMode)
        {
            var v = (value ?? string.Empty).Trim();
            if (!string.IsNullOrEmpty(v))
            {
                if (valueMode == "iso2")
                {
                    var byIso = Countries.FirstOrDefault(c => string.Equals(c.Iso2, v, StringComparison.OrdinalIgnoreCase));
                    if (byIso != null) return byIso;
                }
                else
                {
                    var digits = NormalizeDial(v);
                    var byDial = Countries.FirstOrDefault(c => NormalizeDial(c.Dial) == digits);
                    if (byDial != null) return byDial;
                }
            }
            return Countries.First(c => c.Iso2 == "US");
        }

        private static readonly List<PickerCountry> Countries = new List<PickerCountry>
        {
            new PickerCountry { Iso2 = "US", Name = "United States", Dial = "+1" },
            new PickerCountry { Iso2 = "CA", Name = "Canada", Dial = "+1" },
            new PickerCountry { Iso2 = "GB", Name = "United Kingdom", Dial = "+44" },
            new PickerCountry { Iso2 = "AU", Name = "Australia", Dial = "+61" },
            new PickerCountry { Iso2 = "FR", Name = "France", Dial = "+33" },
            new PickerCountry { Iso2 = "DE", Name = "Germany", Dial = "+49" },
            new PickerCountry { Iso2 = "ES", Name = "Spain", Dial = "+34" },
            new PickerCountry { Iso2 = "IT", Name = "Italy", Dial = "+39" },
            new PickerCountry { Iso2 = "VN", Name = "Vietnam", Dial = "+84" },
            new PickerCountry { Iso2 = "BG", Name = "Bulgaria", Dial = "+359" },
            new PickerCountry { Iso2 = "JP", Name = "Japan", Dial = "+81" },
            new PickerCountry { Iso2 = "KR", Name = "South Korea", Dial = "+82" },
            new PickerCountry { Iso2 = "CN", Name = "China", Dial = "+86" },
            new PickerCountry { Iso2 = "IN", Name = "India", Dial = "+91" },
            new PickerCountry { Iso2 = "SG", Name = "Singapore", Dial = "+65" },
            new PickerCountry { Iso2 = "AE", Name = "United Arab Emirates", Dial = "+971" },
            new PickerCountry { Iso2 = "SA", Name = "Saudi Arabia", Dial = "+966" },
            new PickerCountry { Iso2 = "BR", Name = "Brazil", Dial = "+55" }
        };

        private static string NormalizeDial(string dial)
            => Regex.Replace(dial ?? string.Empty, "[^0-9]", string.Empty);

        private static string CompositePreset(FormField field)
            => WidgetStringProp(field, "preset") ?? FieldStringProp(field, "preset") ?? string.Empty;

        private static List<CompositePart> ResolveCompositeParts(FormField field, string preset)
        {
            var explicitParts = WidgetObjectProp<List<CompositePart>>(field, "parts");
            if (explicitParts != null && explicitParts.Count > 0) return explicitParts;

            var parts = string.Equals(preset, "address", StringComparison.OrdinalIgnoreCase)
                ? AddressParts(WidgetStringProp(field, "addressScheme") ?? "us")
                : BuiltInCompositeParts(preset);

            if (IsScalarCompositePreset(preset) && parts.Count == 1)
            {
                var part = parts[0];
                if (!string.IsNullOrEmpty(field.Placeholder)) part.Placeholder = field.Placeholder;
                if (string.Equals(preset, "number", StringComparison.OrdinalIgnoreCase) && field.Validation != null)
                {
                    part.Min = field.Validation.Min;
                    part.Max = field.Validation.Max;
                }
            }

            return parts;
        }

        private static List<CompositePart> BuiltInCompositeParts(string preset)
        {
            switch ((preset ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "phone":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "country", Width = "116px", Def = "+1", Type = "country" },
                        new CompositePart { Key = "area", Placeholder = "Area", Width = "74px", MaxLength = 4 },
                        new CompositePart { Key = "number", Placeholder = "Phone number", Flex = 1, Type = "tel" },
                        new CompositePart { Key = "ext", Placeholder = "Ext", Width = "74px" }
                    };
                case "name":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "first", Placeholder = "First name", Flex = 1 },
                        new CompositePart { Key = "last", Placeholder = "Last name", Flex = 1 }
                    };
                case "name_plus":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "prefix", Label = "Prefix", Sublabel = "Prefix", Placeholder = "Mr / Ms / Dr", Width = "90px", Type = "select", Options = Options("", "Prefix", "Mr", "Mrs", "Ms", "Dr", "Prof") },
                        new CompositePart { Key = "first", Label = "First name", Sublabel = "First", Placeholder = "First name", Flex = 1, Required = true },
                        new CompositePart { Key = "middle", Label = "Middle name", Sublabel = "Middle", Placeholder = "Middle", Width = "90px" },
                        new CompositePart { Key = "last", Label = "Last name", Sublabel = "Last", Placeholder = "Last name", Flex = 1, Required = true },
                        new CompositePart { Key = "suffix", Label = "Suffix", Sublabel = "Suffix", Placeholder = "Jr / Sr / III", Width = "90px", Type = "select", Options = Options("", "Suffix", "Jr", "Sr", "II", "III") }
                    };
                case "ssn":
                    return new List<CompositePart> { new CompositePart { Key = "ssn", Type = "tel", Mask = "###-##-####", Placeholder = "___-__-____", Label = "Social Security Number", MaxLength = 11, InputMode = "numeric" } };
                case "dob":
                    return DobParts();
                case "time":
                    return TimeParts();
                case "email_confirm":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "email", Label = "Email", Sublabel = "Email", Placeholder = "Email", Flex = 1, Type = "email", Required = true },
                        new CompositePart { Key = "email_confirm", Label = "Confirm Email", Sublabel = "Confirm", Placeholder = "Confirm email", Flex = 1, Type = "email", Required = true }
                    };
                case "password_confirm":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "password", Label = "Password", Sublabel = "Password", Placeholder = "Password", Flex = 1, Type = "password", Required = true },
                        new CompositePart { Key = "password_confirm", Label = "Confirm Password", Sublabel = "Confirm", Placeholder = "Confirm password", Flex = 1, Type = "password", Required = true }
                    };
                case "date_range":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "start", Label = "Start date", Sublabel = "Start", Placeholder = "Start", Flex = 1, Type = "date", Required = true },
                        new CompositePart { Key = "end", Label = "End date", Sublabel = "End", Placeholder = "End", Flex = 1, Type = "date", Required = true }
                    };
                case "money":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "currency", Label = "Currency", Sublabel = "Currency", Placeholder = "Currency", Width = "120px", Type = "select", Def = "USD", Options = Options("USD", "USD", "EUR", "GBP", "JPY", "VND", "AUD", "CAD", "CNY", "INR") },
                        new CompositePart { Key = "amount", Label = "Amount", Sublabel = "Amount", Placeholder = "0.00", Flex = 1, Type = "number", Min = 0, Required = true }
                    };
                case "measurement":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "amount", Label = "Value", Sublabel = "Value", Placeholder = "0", Flex = 1, Type = "number", Required = true },
                        new CompositePart { Key = "unit", Label = "Unit", Sublabel = "Unit", Placeholder = "Unit", Width = "120px", Type = "select", Def = "kg", Options = Options("kg", "kg", "g", "lb", "oz", "m", "cm", "mm", "ft", "in", "L", "ml") }
                    };
                case "price_range":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "min", Label = "Minimum", Sublabel = "Min", Placeholder = "Min", Flex = 1, Type = "number", Min = 0 },
                        new CompositePart { Key = "max", Label = "Maximum", Sublabel = "Max", Placeholder = "Max", Flex = 1, Type = "number", Min = 0 }
                    };
                case "full_contact":
                    return new List<CompositePart>
                    {
                        new CompositePart { Key = "name", Label = "Full name", Sublabel = "Name", Placeholder = "Full name", Flex = 1, Required = true },
                        new CompositePart { Key = "email", Label = "Email", Sublabel = "Email", Placeholder = "Email", Flex = 1, Type = "email", Required = true },
                        new CompositePart { Key = "phone", Label = "Phone", Sublabel = "Phone", Placeholder = "Phone", Flex = 1, Type = "tel" }
                    };
                case "text":
                    return new List<CompositePart> { new CompositePart { Key = "text", Flex = 1 } };
                case "textarea":
                    return new List<CompositePart> { new CompositePart { Key = "text", Flex = 1, Type = "textarea", Rows = 4 } };
                case "email":
                    return new List<CompositePart> { new CompositePart { Key = "email", Flex = 1, Type = "email" } };
                case "number":
                    return new List<CompositePart> { new CompositePart { Key = "number", Flex = 1, Type = "number" } };
                case "url":
                    return new List<CompositePart> { new CompositePart { Key = "url", Flex = 1, Type = "url" } };
                default:
                    return new List<CompositePart>();
            }
        }

        private static List<CompositePart> AddressParts(string scheme)
        {
            var s = (scheme ?? "us").Trim().ToLowerInvariant();
            if (s != "intl" && s != "canada" && s != "uk") s = "us";
            var parts = new List<CompositePart>
            {
                new CompositePart { Key = "street", Label = "Street Address", Placeholder = "Street Address", Flex = 1, Row = 0 },
                new CompositePart { Key = "street2", Label = "Address Line 2", Placeholder = "Apt, suite, unit, etc. (optional)", Flex = 1, Row = 1 },
                new CompositePart { Key = "city", Label = "City", Placeholder = "City", Flex = 2, Row = 2 },
                AddressStatePart(s),
                AddressZipPart(s)
            };
            if (s == "intl" || s == "uk")
                parts.Add(new CompositePart { Key = "country", Label = "Country", Type = "country", ValueMode = "iso2", Flex = 1, Row = 3 });
            return parts;
        }

        private static CompositePart AddressStatePart(string scheme)
        {
            if (scheme == "us") return new CompositePart { Key = "state", Label = "State", Type = "select", Options = WithPlaceholder("State", UsStates), Flex = 1, Row = 2 };
            if (scheme == "canada") return new CompositePart { Key = "state", Label = "Province", Type = "select", Options = WithPlaceholder("Province", CaProvinces), Flex = 1, Row = 2 };
            if (scheme == "uk") return new CompositePart { Key = "state", Label = "County / Region", Placeholder = "County / Region", Flex = 1, Row = 2 };
            return new CompositePart { Key = "state", Label = "State / Province", Placeholder = "State / Province", Flex = 1, Row = 2 };
        }

        private static CompositePart AddressZipPart(string scheme)
        {
            var label = scheme == "us" ? "ZIP Code" : (scheme == "uk" ? "Postcode" : "Postal Code");
            return new CompositePart { Key = "zip", Label = label, Placeholder = label, Flex = 1, Row = 2, MaxLength = 12 };
        }

        private static List<CompositePart> DobParts()
        {
            var year = DateTime.UtcNow.Year;
            var years = new List<CompositeOption> { new CompositeOption { Value = "", Label = "Year" } };
            for (var y = year; y >= year - 120; y--) years.Add(new CompositeOption { Value = y.ToString(CultureInfo.InvariantCulture), Label = y.ToString(CultureInfo.InvariantCulture) });
            var days = new List<CompositeOption> { new CompositeOption { Value = "", Label = "Day" } };
            for (var d = 1; d <= 31; d++) days.Add(new CompositeOption { Value = d.ToString(CultureInfo.InvariantCulture), Label = d.ToString(CultureInfo.InvariantCulture) });
            var months = new List<CompositeOption> { new CompositeOption { Value = "", Label = "Month" } };
            var monthNames = new[] { "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" };
            for (var m = 1; m <= 12; m++) months.Add(new CompositeOption { Value = m.ToString(CultureInfo.InvariantCulture), Label = monthNames[m - 1] });
            return new List<CompositePart>
            {
                new CompositePart { Key = "day", Label = "Day", Sublabel = "Day", Placeholder = "Day", Width = "80px", Type = "select", Options = days, Sep = "/" },
                new CompositePart { Key = "month", Label = "Month", Sublabel = "Month", Placeholder = "Month", Width = "120px", Type = "select", Options = months, Sep = "/" },
                new CompositePart { Key = "year", Label = "Year", Sublabel = "Year", Placeholder = "Year", Width = "100px", Type = "select", Options = years }
            };
        }

        private static List<CompositePart> TimeParts()
        {
            var hours = new List<CompositeOption> { new CompositeOption { Value = "", Label = "Hour" } };
            for (var i = 1; i <= 12; i++) hours.Add(new CompositeOption { Value = i.ToString(CultureInfo.InvariantCulture), Label = i.ToString(CultureInfo.InvariantCulture) });
            var minutes = new List<CompositeOption> { new CompositeOption { Value = "", Label = "Minute" } };
            for (var i = 0; i < 60; i++) minutes.Add(new CompositeOption { Value = i.ToString("00", CultureInfo.InvariantCulture), Label = i.ToString("00", CultureInfo.InvariantCulture) });
            return new List<CompositePart>
            {
                new CompositePart { Key = "hour", Label = "Hour", Sublabel = "Hour", Placeholder = "HH", Width = "80px", Type = "select", Options = hours, Sep = ":" },
                new CompositePart { Key = "minute", Label = "Minute", Sublabel = "Minute", Placeholder = "MM", Width = "80px", Type = "select", Options = minutes },
                new CompositePart { Key = "ampm", Label = "AM/PM", Sublabel = "AM/PM", Placeholder = "AM/PM", Width = "80px", Type = "select", Options = Options("", "AM/PM", "AM", "PM") }
            };
        }

        private static List<CompositeOption> Options(string firstValue, string firstLabel, params string[] values)
        {
            var list = new List<CompositeOption> { new CompositeOption { Value = firstValue, Label = firstLabel } };
            foreach (var v in values) list.Add(new CompositeOption { Value = v, Label = v });
            return list;
        }

        private static List<CompositeOption> WithPlaceholder(string label, List<CompositeOption> options)
        {
            var list = new List<CompositeOption> { new CompositeOption { Value = "", Label = label } };
            list.AddRange(options);
            return list;
        }

        private static readonly List<CompositeOption> UsStates = new List<CompositeOption>
        {
            Opt("AL","Alabama"), Opt("AK","Alaska"), Opt("AZ","Arizona"), Opt("AR","Arkansas"), Opt("CA","California"),
            Opt("CO","Colorado"), Opt("CT","Connecticut"), Opt("DE","Delaware"), Opt("DC","District of Columbia"),
            Opt("FL","Florida"), Opt("GA","Georgia"), Opt("HI","Hawaii"), Opt("ID","Idaho"), Opt("IL","Illinois"),
            Opt("IN","Indiana"), Opt("IA","Iowa"), Opt("KS","Kansas"), Opt("KY","Kentucky"), Opt("LA","Louisiana"),
            Opt("ME","Maine"), Opt("MD","Maryland"), Opt("MA","Massachusetts"), Opt("MI","Michigan"), Opt("MN","Minnesota"),
            Opt("MS","Mississippi"), Opt("MO","Missouri"), Opt("MT","Montana"), Opt("NE","Nebraska"), Opt("NV","Nevada"),
            Opt("NH","New Hampshire"), Opt("NJ","New Jersey"), Opt("NM","New Mexico"), Opt("NY","New York"),
            Opt("NC","North Carolina"), Opt("ND","North Dakota"), Opt("OH","Ohio"), Opt("OK","Oklahoma"), Opt("OR","Oregon"),
            Opt("PA","Pennsylvania"), Opt("RI","Rhode Island"), Opt("SC","South Carolina"), Opt("SD","South Dakota"),
            Opt("TN","Tennessee"), Opt("TX","Texas"), Opt("UT","Utah"), Opt("VT","Vermont"), Opt("VA","Virginia"),
            Opt("WA","Washington"), Opt("WV","West Virginia"), Opt("WI","Wisconsin"), Opt("WY","Wyoming")
        };

        private static readonly List<CompositeOption> CaProvinces = new List<CompositeOption>
        {
            Opt("AB","Alberta"), Opt("BC","British Columbia"), Opt("MB","Manitoba"), Opt("NB","New Brunswick"),
            Opt("NL","Newfoundland and Labrador"), Opt("NS","Nova Scotia"), Opt("NT","Northwest Territories"),
            Opt("NU","Nunavut"), Opt("ON","Ontario"), Opt("PE","Prince Edward Island"), Opt("QC","Quebec"),
            Opt("SK","Saskatchewan"), Opt("YT","Yukon")
        };

        private static CompositeOption Opt(string value, string label)
            => new CompositeOption { Value = value, Label = label };

        private static bool IsScalarCompositePreset(string preset)
        {
            switch ((preset ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "text":
                case "textarea":
                case "email":
                case "number":
                case "url":
                    return true;
                default:
                    return false;
            }
        }

        private static string CompositeCellStyle(CompositePart part)
        {
            if (part?.Flex != null) return "flex:" + CssNum(part.Flex.Value) + " 1 0;min-width:0;";
            var width = (part?.Width ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(width)) return "flex:1 1 0;min-width:0;";
            if (CompositeWidthFractions.TryGetValue(width, out var pct))
                return "flex:0 1 calc(" + CssNum(pct) + "% - 6px);min-width:0;";
            return "flex:0 0 " + Esc(width) + ";width:" + Esc(width) + ";min-width:0;";
        }

        private static readonly Dictionary<string, double> CompositeWidthFractions = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase)
        {
            ["1/6"] = 16.6667, ["1/5"] = 20, ["1/4"] = 25, ["1/3"] = 33.3333, ["2/5"] = 40,
            ["1/2"] = 50, ["3/5"] = 60, ["2/3"] = 66.6667, ["3/4"] = 75, ["4/5"] = 80,
            ["full"] = 100, ["1/1"] = 100
        };

        private static string CompositePartLabel(CompositePart part)
        {
            if (!string.IsNullOrEmpty(part?.Label)) return part.Label;
            if (!string.IsNullOrEmpty(part?.Sublabel)) return part.Sublabel;
            var key = part?.Key ?? string.Empty;
            if (!string.IsNullOrEmpty(key) && CompositePartLabels.TryGetValue(key, out var label)) return label;
            if (!string.IsNullOrEmpty(part?.Placeholder)) return part.Placeholder;
            return !string.IsNullOrEmpty(key) ? char.ToUpperInvariant(key[0]) + key.Substring(1).Replace("_", " ").Replace("-", " ") : "Field";
        }

        private static readonly Dictionary<string, string> CompositePartLabels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["country"] = "Country code", ["area"] = "Area code", ["number"] = "Phone number", ["ext"] = "Extension",
            ["prefix"] = "Prefix", ["first"] = "First name", ["middle"] = "Middle name", ["last"] = "Last name", ["suffix"] = "Suffix",
            ["street"] = "Street address", ["street2"] = "Apartment, suite, etc.", ["city"] = "City",
            ["state"] = "State / Province", ["zip"] = "ZIP / Postal code", ["country_addr"] = "Country",
            ["day"] = "Day", ["month"] = "Month", ["year"] = "Year", ["hour"] = "Hour", ["minute"] = "Minute", ["ampm"] = "AM/PM"
        };

        private static string InputTypeAttr(string type)
        {
            switch ((type ?? string.Empty).Trim().ToLowerInvariant())
            {
                case "email": return "email";
                case "number": return "number";
                case "tel":
                case "phone": return "tel";
                case "date": return "date";
                case "password": return "password";
                case "url": return "url";
                default: return "text";
            }
        }

        private static string WidgetStringProp(FormField field, string key)
            => ObjectString(WidgetProp(field, key));

        private static T WidgetObjectProp<T>(FormField field, string key) where T : class
        {
            var value = WidgetProp(field, key);
            if (value == null) return null;
            if (value is T typed) return typed;
            try
            {
                var json = value is JsonElement el ? el.GetRawText() : Newtonsoft.Json.JsonConvert.SerializeObject(value);
                return Newtonsoft.Json.JsonConvert.DeserializeObject<T>(json);
            }
            catch
            {
                return null;
            }
        }

        private static object WidgetProp(FormField field, string key)
        {
            if (field?.WidgetProps == null) return null;
            if (field.WidgetProps.TryGetValue(key, out var exact)) return exact;
            foreach (var kvp in field.WidgetProps)
                if (string.Equals(kvp.Key, key, StringComparison.OrdinalIgnoreCase))
                    return kvp.Value;
            return null;
        }

        private static string ObjectString(object value)
        {
            if (value == null) return null;
            if (value is string s) return s;
            if (value is JsonElement el)
            {
                if (el.ValueKind == JsonValueKind.String) return el.GetString();
                if (el.ValueKind == JsonValueKind.Number || el.ValueKind == JsonValueKind.True || el.ValueKind == JsonValueKind.False) return el.ToString();
                return null;
            }
            try
            {
                var token = value as Newtonsoft.Json.Linq.JToken;
                if (token != null && token.Type != Newtonsoft.Json.Linq.JTokenType.Object && token.Type != Newtonsoft.Json.Linq.JTokenType.Array)
                    return token.ToString();
            }
            catch { }
            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        private static string CssNum(double value)
            => value.ToString("0.####", CultureInfo.InvariantCulture);

        private static string Input(string inputType, string id, string name, string val, string ph, string flags)
            => "<input type=\"" + inputType + "\" class=\"mf-input\" id=\"" + id + "\" name=\"" + name
               + "\" value=\"" + Esc(val) + "\" placeholder=\"" + Esc(ph) + "\"" + flags + ">";

        // [DatePickerSSRParity v20260628] Server-render the SAME mf-cal calendar shell the client
        // renderer emits (renderer/inputs.ts renderCalendarDatePicker), NOT a native <input type=date>
        // (the old picker). interactive.ts binds [data-mf-cal="1"] and renders the panel on open.
        private static string CalendarDatePicker(FormField field, string id, string name, string val, string ph, string ro)
        {
            string Prop(string key, string fallback)
            {
                var v = FieldStringProp(field, key);
                return string.IsNullOrEmpty(v) ? fallback : v;
            }
            var rawMode = (FieldStringProp(field, "datePickerMode") ?? FieldStringProp(field, "mode") ?? "date-only").ToLowerInvariant();
            var mode = (rawMode == "date-time" || rawMode == "datetime") ? "date-time"
                     : (rawMode == "month-year" || rawMode == "monthyear") ? "month-year"
                     : "date-only";
            var placeholder = !string.IsNullOrEmpty(ph) ? ph
                : mode == "date-time" ? "Select date & time..."
                : mode == "month-year" ? "Select month..." : "Select date...";
            var disabled = string.IsNullOrEmpty(ro) ? "false" : "true";
            var disAttr = string.IsNullOrEmpty(ro) ? string.Empty : " disabled";
            var apply = Prop("applyText", Prop("applyLabel", "Apply"));
            var clear = Prop("clearText", Prop("clearLabel", "Clear"));
            var today = Prop("todayText", Prop("todayLabel", "Today"));
            var prev = Prop("previousMonthText", "Previous month");
            var next = Prop("nextMonthText", "Next month");
            var time = Prop("timeText", "Time:");
            var weekdays = Prop("weekdayLabels", "SU,MO,TU,WE,TH,FR,SA");
            var months = Prop("monthLabels", "January,February,March,April,May,June,July,August,September,October,November,December");
            var ariaLabel = string.IsNullOrEmpty(field.Label) ? "Calendar date picker" : field.Label;
            return "<div class=\"mf-date-input-wrap mf-cal\" id=\"" + id + "-cal\""
                + " data-mf-cal=\"1\" data-mode=\"" + Esc(mode) + "\" data-value=\"" + Esc(val) + "\" data-placeholder=\"" + Esc(placeholder) + "\""
                + " data-disabled=\"" + disabled + "\" data-readonly=\"" + disabled + "\""
                + " data-label-apply=\"" + Esc(apply) + "\" data-label-clear=\"" + Esc(clear) + "\" data-label-today=\"" + Esc(today) + "\""
                + " data-label-prev=\"" + Esc(prev) + "\" data-label-next=\"" + Esc(next) + "\" data-label-time=\"" + Esc(time) + "\""
                + " data-weekdays=\"" + Esc(weekdays) + "\" data-months=\"" + Esc(months) + "\">"
                + "<input type=\"hidden\" class=\"mf-cal-hidden\" id=\"" + id + "\" name=\"" + Esc(name) + "\" value=\"" + Esc(val) + "\">"
                + "<button type=\"button\" class=\"mf-cal-trigger mf-input\" aria-haspopup=\"dialog\" aria-expanded=\"false\"" + disAttr + ">"
                + "<span class=\"mf-cal-value\">" + Esc(placeholder) + "</span>"
                + "<span class=\"mf-date-icon\" aria-hidden=\"true\"><svg viewBox=\"0 0 24 24\"><path d=\"M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z\"/></svg></span>"
                + "</button>"
                + "<div class=\"mf-cal-panel\" role=\"dialog\" aria-label=\"" + Esc(ariaLabel) + "\"></div>"
                + "</div>";
        }

        // [B311] Mirror of TS resolveOptionIconHtml. An option Icon may be a GLYPH (emoji ★🚀, HTML
        // entity &#128188;, inline <i>/<img>) OR a bare icon NAME the AI emitted ("city"/"rocket"/"fa-city").
        // Glyphs render as-is; a bare ASCII token resolves to a FontAwesome icon so the card shows a real
        // glyph instead of the literal word.
        private static string ResolveOptionIcon(FormField field, MfOption opt, string raw)
        {
            var s = (raw ?? string.Empty).Trim();
            if (s.Length == 0) return string.Empty;
            var hasMarkup = s.IndexOf('<') >= 0 || s.IndexOf('&') >= 0;
            var nonAscii = false;
            foreach (var ch in s) { if (ch > 0x7F) { nonAscii = true; break; } }
            if (hasMarkup || nonAscii) return OptionPart(field, opt, s, true);
            string cls;
            if (System.Text.RegularExpressions.Regex.IsMatch(s, @"^(fa-(solid|regular|light|thin|brands|duotone|sharp)|fas|far|fal|fat|fab|fad)\b")) cls = s;
            else if (s.StartsWith("fa-")) cls = "fa-solid " + s;
            else
            {
                var key = System.Text.RegularExpressions.Regex.Replace(s.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
                var aliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["building2"] = "building",
                    ["building-2"] = "building",
                    ["code2"] = "code",
                    ["ticket"] = "ticket-alt",
                    ["megaphone"] = "bullhorn",
                    ["zap"] = "bolt",
                    ["sparkles"] = "wand-magic-sparkles",
                    ["graduationcap"] = "graduation-cap",
                    ["calendar-days"] = "calendar-alt",
                    ["calendardays"] = "calendar-alt",
                    ["map-pin"] = "map-marker-alt",
                    ["mappin"] = "map-marker-alt",
                    ["mail"] = "envelope",
                    ["phone"] = "phone",
                    ["user"] = "user",
                    ["users"] = "users",
                    ["briefcase"] = "briefcase",
                    ["file-text"] = "file-alt",
                    ["filetext"] = "file-alt",
                    ["upload"] = "upload",
                    ["wallet"] = "wallet",
                    ["home"] = "home",
                    ["compass"] = "compass",
                    ["palmtree"] = "umbrella-beach",
                    ["tree-palm"] = "tree",
                    ["treepalm"] = "tree",
                    ["waves"] = "water",
                    ["mountain"] = "mountain",
                    ["snowflake"] = "snowflake",
                    ["heart-handshake"] = "handshake",
                    ["hearthandshake"] = "handshake",
                    ["heart"] = "heart",
                    ["flower2"] = "seedling",
                    ["flower-2"] = "seedling",
                    ["tree-pine"] = "tree",
                    ["treepine"] = "tree",
                    ["party-popper"] = "gift",
                    ["partypopper"] = "gift",
                    ["cake"] = "birthday-cake",
                    ["gift"] = "gift",
                    ["utensils"] = "utensils",
                    ["wine"] = "wine-glass-alt",
                    ["glass-water"] = "glass-water",
                    ["glasswater"] = "glass-water",
                    ["drumstick"] = "drumstick-bite",
                    ["salad"] = "leaf",
                    ["pizza"] = "pizza-slice",
                    ["ice-cream"] = "ice-cream",
                    ["icecream"] = "ice-cream",
                    ["mic2"] = "microphone",
                    ["mic-2"] = "microphone",
                    ["disc3"] = "compact-disc",
                    ["disc-3"] = "compact-disc",
                    ["tent"] = "campground",
                    ["pen-line"] = "pen",
                    ["penline"] = "pen",
                    ["layout-grid"] = "th-large",
                    ["layoutgrid"] = "th-large",
                    ["line-chart"] = "chart-line",
                    ["linechart"] = "chart-line",
                    ["headphones"] = "headphones",
                    ["send"] = "paper-plane",
                    ["clipboard-list"] = "clipboard-list",
                    ["clipboardlist"] = "clipboard-list",
                };
                if (aliases.TryGetValue(key, out var mapped)) key = mapped;
                cls = "fa-solid fa-" + key;
            }
            return "<i class=\"" + Esc(cls) + "\" aria-hidden=\"true\"></i>";
        }

        private static string OptionItem(string inputType, string name, MfOption opt, string translatedLabel, bool selected, string baseId, FormField field, string forcedDisplay = null)
        {
            var value = opt?.Value ?? opt?.Label ?? string.Empty;
            var oid = baseId + "-" + Slug(value);
            var display = forcedDisplay ?? OptionDisplay(field);
            var allowHtml = OptionHtmlEnabled(field, opt);
            var labelSource = opt?.RichHtml ?? opt?.LabelHtml ?? opt?.Html ?? translatedLabel ?? opt?.Label ?? value;
            var classes = new List<string> { "mf-option-item" };
            if (display != "default") classes.Add("mf-option-item--" + display);
            if (selected) classes.Add("is-checked");
            if (allowHtml) classes.Add("mf-option-item--html");
            var icon = string.IsNullOrEmpty(opt?.Icon) ? "" : "<span class=\"mf-option-icon\" aria-hidden=\"true\">" + ResolveOptionIcon(field, opt, opt.Icon) + "</span>";
            var meta = string.IsNullOrEmpty(opt?.Meta) ? "" : "<span class=\"mf-option-meta\">" + OptionPart(field, opt, opt.Meta, true) + "</span>";
            var descText = opt?.Description ?? opt?.Desc ?? opt?.SubLabel;
            var desc = string.IsNullOrEmpty(descText) ? "" : "<span class=\"mf-option-desc\">" + OptionPart(field, opt, descText, true) + "</span>";
            var badge = string.IsNullOrEmpty(opt?.Badge) ? "" : "<span class=\"mf-option-badge\">" + Esc(opt.Badge) + "</span>";
            var check = display == "cards" ? "<span class=\"mf-option-check\" aria-hidden=\"true\">&#10003;</span>" : "";
            return "<label class=\"" + string.Join(" ", classes) + "\"><input class=\"mf-option-control\" type=\"" + inputType + "\" name=\"" + name + "\" value=\"" + Esc(value) + "\" id=\"" + oid + "\""
                + (selected ? " checked" : "") + "><span class=\"mf-option-ui\">" + icon + "<span class=\"mf-option-copy\"><span class=\"mf-option-label\">"
                + OptionPart(field, opt, labelSource, true) + "</span>" + meta + desc + "</span>" + badge + check + "</span></label>";
        }

        private static string OptionGroupClass(FormField field, string forcedDisplay = null)
        {
            var display = forcedDisplay ?? OptionDisplay(field);
            var cols = field.OptionColumns;
            var classes = new List<string> { "mf-option-group" };
            if (display != "default") classes.Add("mf-option-group--" + display);
            if (cols >= 1 && cols <= 4)
            {
                if (cols > 1) classes.Add("mf-option-group--cols");
                classes.Add("mf-cols-" + cols);
                return string.Join(" ", classes);
            }
            var count = field.Options?.Count ?? 0;
            if (display == "cards") return string.Join(" ", classes);
            if (count >= 9) { classes.Add("mf-option-group--cols"); classes.Add("mf-cols-3"); }
            else if (count >= 6) { classes.Add("mf-option-group--cols"); classes.Add("mf-cols-2"); }
            return string.Join(" ", classes);
        }

        private static string OptionDisplay(FormField field)
        {
            var raw = (field?.OptionDisplay ?? FieldStringProp(field, "optionDisplay") ?? FieldStringProp(field, "choiceDisplay") ?? FieldStringProp(field, "optionVariant") ?? "").Trim().ToLowerInvariant();
            if (raw == "chip" || raw == "chips" || raw == "pill" || raw == "pills" || raw == "tags") return "chips";
            if (raw == "card" || raw == "cards" || raw == "rich-card" || raw == "rich-cards" || raw == "richcards") return "cards";
            return "default";
        }

        private static bool OptionHtmlEnabled(FormField field, MfOption opt)
            => field?.AllowOptionHtml == true
               || FieldBoolProp(field, "allowOptionHtml")
               || string.Equals(FieldStringProp(field, "optionLabelMode"), "html", StringComparison.OrdinalIgnoreCase)
               || opt?.AllowHtml == true
               || !string.IsNullOrEmpty(opt?.RichHtml)
               || !string.IsNullOrEmpty(opt?.LabelHtml)
               || !string.IsNullOrEmpty(opt?.Html);

        private static string OptionPart(FormField field, MfOption opt, string value, bool htmlCapable)
            => htmlCapable && OptionHtmlEnabled(field, opt) ? SanitizeOptionHtml(value) : Esc(value);

        private static string FieldStringProp(FormField field, string key)
        {
            if (field?.Properties == null || !field.Properties.TryGetValue(key, out var value) || value == null) return null;
            return Convert.ToString(value);
        }

        private static bool FieldBoolProp(FormField field, string key)
        {
            if (field?.Properties == null || !field.Properties.TryGetValue(key, out var value) || value == null) return false;
            if (value is bool b) return b;
            bool.TryParse(Convert.ToString(value), out var parsed);
            return parsed;
        }

        private static string SanitizeOptionHtml(string html)
        {
            if (string.IsNullOrEmpty(html)) return string.Empty;
            var clean = Regex.Replace(html, @"<\s*(script|style|iframe|object|embed|applet)[^>]*>[\s\S]*?<\s*/\s*\1\s*>", "", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"\s+on\w+\s*=\s*""[^""]*""", "", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"\s+on\w+\s*=\s*'[^']*'", "", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"\s+style\s*=\s*""[^""]*""", "", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"\s+style\s*=\s*'[^']*'", "", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"(href|src)\s*=\s*""\s*javascript:[^""]*""", "$1=\"#\"", RegexOptions.IgnoreCase);
            clean = Regex.Replace(clean, @"</?(?!(?:a|b|br|code|div|em|i|li|ol|p|small|span|strong|sub|sup|u|ul)\b)[a-z][^>]*>", "", RegexOptions.IgnoreCase);
            return clean;
        }

        // ────────────────────────────────────────────────────────────────
        // Translation resolution
        // ────────────────────────────────────────────────────────────────
        private class ResolvedField
        {
            public string Label;
            public string Placeholder;
            public string HelpText;
            public string HtmlContent;
            public Dictionary<string, string> OptionOverrides;
            public string OptionLabel(MfOption opt)
            {
                if (OptionOverrides != null && opt?.Value != null && OptionOverrides.TryGetValue(opt.Value, out var t) && !string.IsNullOrEmpty(t))
                    return t;
                return opt?.Label ?? string.Empty;
            }
        }

        private static ResolvedField ResolveFieldTranslation(FormField field, string locale)
        {
            var r = new ResolvedField
            {
                Label = field.Label,
                Placeholder = field.Placeholder,
                HelpText = field.HelpText,
                HtmlContent = field.HtmlContent
            };
            if (!string.IsNullOrEmpty(locale) && field.Translations != null
                && field.Translations.TryGetValue(locale, out var ft) && ft != null)
            {
                if (!string.IsNullOrEmpty(ft.Label)) r.Label = ft.Label;
                if (!string.IsNullOrEmpty(ft.Placeholder)) r.Placeholder = ft.Placeholder;
                if (!string.IsNullOrEmpty(ft.HelpText)) r.HelpText = ft.HelpText;
                if (!string.IsNullOrEmpty(ft.HtmlContent)) r.HtmlContent = ft.HtmlContent;
                r.OptionOverrides = ft.Options;
            }
            return r;
        }

        private static FormTranslation ResolveFormTranslation(FormSchema schema, string locale,
            string formTitle = null, string formDescription = null, string submitButtonText = null)
        {
            var s = schema.Settings ?? new FormSettings();
            var baseTr = new FormTranslation
            {
                Title = formTitle ?? string.Empty,
                Description = formDescription ?? string.Empty,
                SubmitButtonText = !string.IsNullOrWhiteSpace(submitButtonText)
                    ? submitButtonText
                    : (s.SubmitButtonText ?? "Submit")
            };
            if (!string.IsNullOrEmpty(locale) && schema.Translations != null
                && schema.Translations.TryGetValue(locale, out var t) && t != null)
            {
                if (!string.IsNullOrEmpty(t.Title)) baseTr.Title = t.Title;
                if (!string.IsNullOrEmpty(t.Description)) baseTr.Description = t.Description;
                if (!string.IsNullOrEmpty(t.SubmitButtonText)) baseTr.SubmitButtonText = t.SubmitButtonText;
            }
            return baseTr;
        }

        // ────────────────────────────────────────────────────────────────
        // Helpers
        // ────────────────────────────────────────────────────────────────
        private static Dictionary<string, FormField> BuildFieldMap(List<FormField> fields)
        {
            var map = new Dictionary<string, FormField>(StringComparer.Ordinal);
            void Add(FormField f)
            {
                if (f?.Key == null) return;
                map[f.Key] = f;
                if (string.Equals(f.Type, "Row", StringComparison.OrdinalIgnoreCase))
                    foreach (var col in GetRowColumns(f))
                        foreach (var cf in (col.Fields ?? new List<FormField>()))
                            Add(cf);
            }
            foreach (var f in fields) Add(f);
            return map;
        }

        private static List<RowColumn> GetRowColumns(FormField field)
        {
            var columns = (field?.Columns ?? new List<RowColumn>())
                .Where(c => c != null)
                .ToList();
            if (columns.Count <= 1) return columns;

            // Newtonsoft deserializes legacy payloads that contain both "columns" and "Columns"
            // into the same Columns list, appending the Pascal-case copy. The browser renderer reads
            // only field.columns, so SSR must collapse exact column duplicates to keep first paint
            // byte-parity with the hydrated DOM.
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var deduped = new List<RowColumn>();
            foreach (var col in columns)
            {
                var signature = RowColumnSignature(col);
                if (seen.Add(signature)) deduped.Add(col);
            }
            return deduped;
        }

        private static string RowColumnSignature(RowColumn col)
        {
            var sb = new StringBuilder();
            var span = col == null || col.Span <= 0 ? 6 : col.Span;
            sb.Append(span).Append('|');
            foreach (var field in (col?.Fields ?? new List<FormField>()))
            {
                if (field == null)
                {
                    sb.Append("<null>;");
                    continue;
                }
                sb.Append(field.Key ?? string.Empty).Append('|')
                  .Append(field.Type ?? string.Empty).Append('|')
                  .Append(field.Label ?? string.Empty).Append('|')
                  .Append(field.Placeholder ?? string.Empty).Append('|')
                  .Append(field.Required ? "1" : "0").Append(';');
            }
            return sb.ToString();
        }

        private static List<FormField> NormalizeFields(FormSchema schema)
        {
            var fields = (schema?.Fields ?? new List<FormField>())
                .Where(f => f != null)
                .OrderBy(f => f.Order)
                .ToList();
            if (fields.Count <= 1) return fields;

            var seenKeys = new HashSet<string>(StringComparer.Ordinal);
            return fields.Where(f => string.IsNullOrEmpty(f.Key) || seenKeys.Add(f.Key)).ToList();
        }

        private static List<List<FormField>> CalculatePages(List<FormField> fields, FormSettings settings)
        {
            fields = fields ?? new List<FormField>();
            var pages = new List<List<FormField>> { new List<FormField>() };
            var hasPageBreak = fields.Any(f => string.Equals(f.Type, "Section", StringComparison.OrdinalIgnoreCase) && IsPageBreak(f));
            var hasPageIndex = fields.Any(f => f.PageIndex > 0);

            if (!hasPageBreak && hasPageIndex)
            {
                var indexed = new List<List<FormField>>();
                foreach (var f in fields)
                {
                    var pageIndex = Math.Max(0, f.PageIndex);
                    while (indexed.Count <= pageIndex) indexed.Add(new List<FormField>());
                    indexed[pageIndex].Add(f);
                }
                var nonEmpty = indexed.Where(p => p.Count > 0).ToList();
                return nonEmpty.Count > 0 ? nonEmpty : new List<List<FormField>> { fields.ToList() };
            }

            var multiPage = settings?.MultiPage == true;
            var sectionCount = 0;
            foreach (var f in fields)
            {
                var startsPage = string.Equals(f.Type, "Section", StringComparison.OrdinalIgnoreCase) && IsPageBreak(f);
                if (!hasPageBreak && multiPage && string.Equals(f.Type, "Section", StringComparison.OrdinalIgnoreCase))
                {
                    sectionCount++;
                    startsPage = sectionCount > 1;
                }
                if (startsPage && pages[pages.Count - 1].Count > 0) pages.Add(new List<FormField>());
                pages[pages.Count - 1].Add(f);
            }

            var result = pages.Where(p => p.Count > 0).ToList();
            return result.Count > 0 ? result : new List<List<FormField>> { fields.ToList() };
        }

        private static bool IsPageBreak(FormField field)
        {
            if (field?.Properties == null) return false;
            if (!field.Properties.TryGetValue("pageBreak", out var pb)
                && !field.Properties.TryGetValue("PageBreak", out pb))
                return false;
            if (pb is bool b) return b;
            if (pb is JsonElement je)
            {
                if (je.ValueKind == JsonValueKind.True) return true;
                if (je.ValueKind == JsonValueKind.False) return false;
                if (je.ValueKind == JsonValueKind.String && bool.TryParse(je.GetString(), out var parsedJson)) return parsedJson;
            }
            bool.TryParse(Convert.ToString(pb, CultureInfo.InvariantCulture), out var parsed);
            return parsed;
        }

        private static string SerializeShowIf(ShowIfCondition c)
            => Newtonsoft.Json.JsonConvert.SerializeObject(c, new Newtonsoft.Json.JsonSerializerSettings
            {
                NullValueHandling = Newtonsoft.Json.NullValueHandling.Ignore,
                ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
            });

        private static List<MfOption> SafeOptions(FormField f)
            => f.Options != null ? f.Options : new List<MfOption>();

        private static string Slug(string s)
            => string.IsNullOrEmpty(s) ? "x" : Regex.Replace(s, "[^a-zA-Z0-9_-]", "_");

        /// <summary>HTML-escape matching the TS esc() (& &lt; &gt; " ').</summary>
        public static string Esc(string s)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            var sb = new StringBuilder(s.Length + 16);
            foreach (var ch in s)
            {
                switch (ch)
                {
                    case '&': sb.Append("&amp;"); break;
                    case '<': sb.Append("&lt;"); break;
                    case '>': sb.Append("&gt;"); break;
                    case '"': sb.Append("&quot;"); break;
                    case '\'': sb.Append("&#39;"); break;
                    default: sb.Append(ch); break;
                }
            }
            return sb.ToString();
        }
    }
}
