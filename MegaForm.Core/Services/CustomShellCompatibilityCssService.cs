using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Bridges premium/custom HTML shells back to the standard builder CSS variables.
    /// </summary>
    public static class CustomShellCompatibilityCssService
    {
        public const string Badge = "CustomShellBuilderCompat v20260624-B264-lowspec";
        private static readonly Regex VarDeclarationRe = new Regex("(?<name>--[a-zA-Z0-9_-]+)\\s*:", RegexOptions.Compiled);

        public static string Build(string scopeSelector)
            => Build(scopeSelector, string.Empty, false);

        public static string Build(string scopeSelector, string authoredTemplateText, bool enableTemplateVarBridge)
        {
            if (string.IsNullOrWhiteSpace(scopeSelector)) return string.Empty;
            var scope = scopeSelector.Trim();
            var authoredVars = CollectAuthoredCssVarDeclarations(authoredTemplateText);
            Func<string, string, string> templateVar = (name, value) =>
                enableTemplateVarBridge || !authoredVars.Contains(name) ? name + ":" + value + ";" : string.Empty;
            var australiaButtonAccent = enableTemplateVarBridge
                ? "var(--mf-btn-bg,var(--mf-primary,var(--au-primary)))"
                : "var(--mf-btn-bg,var(--au-primary))";
            // [CardThuaFix 2026-06-23] Discriminator: only card-style .mfp when it has NO
            // inner .mfp-card/.fr-card. Card-in-child premium templates (pure-grid:
            // .mfp > .mfp-container > .mfp-card) render their own card, so forcing bg+border
            // on .mfp produced a visible double card. Mirror of renderer/index.ts.
            // [StrayShellBorderFix 2026-07-01] Skip the generic .mfp card chrome (bg+border)
            // when the shell nests its OWN card — otherwise the transparent outer .mfp gets a
            // 1px #e2e8f0 edge that reads as a stray line above the shell (e.g. euro-youth on a
            // dark page). .ey-card is the euro-youth per-step content card; templates that paint
            // .mfp directly (australia/festa via their own blocks below) are unaffected.
            const string NOINNER = ":not(:has(.mfp-card)):not(:has(.fr-card)):not(:has(.ey-card))";
            var css = new StringBuilder(4096);

            css.Append("/* ").Append(Badge).Append(" */\n");
            // [LowSpecificityScope 2026-06-24] Wrap the id scope in :where() so the bridge
            // provides theming defaults without drowning out authored customCss. Authors can
            // now override with normal specificity instead of fighting an id-weight !important
            // hammer. The bridge keeps !important so it still wins against Bootstrap/base CSS
            // when no author stylesheet contests the property.
            var scoped = ":where(" + scope + ")";

            css.Append(scoped).Append("[data-mf-has-custom-html] .mfp,\n")
               .Append(scoped).Append(".mf-custom-shell-mode .mfp,\n")
               .Append(scoped).Append(".mf-custom-html-mode .mfp{")
               .Append("box-sizing:border-box!important;")
               .Append("width:100%!important;")
               .Append("max-width:var(--mf-form-max-width,100%)!important;")
               .Append("margin-left:auto!important;")
               .Append("margin-right:auto!important;")
               .Append("}\n");

            css.Append(scoped).Append("[data-mf-has-custom-html]>.mf-form-inner,\n")
               .Append(scoped).Append(".mf-custom-shell-mode>.mf-form-inner,\n")
               .Append(scoped).Append(".mf-custom-html-mode>.mf-form-inner{")
               .Append("width:100%!important;")
               .Append("max-width:none!important;")
               .Append("margin-left:0!important;")
               .Append("margin-right:0!important;")
               .Append("padding-left:0!important;")
               .Append("padding-right:0!important;")
               .Append("}\n");

            css.Append(scoped).Append("[data-mf-has-custom-html] .mf-fields-container,\n")
               .Append(scoped).Append(".mf-custom-shell-mode .mf-fields-container,\n")
               .Append(scoped).Append(".mf-custom-html-mode .mf-fields-container,\n")
               .Append(scoped).Append("[data-mf-has-custom-html] .mf-multistep-frame,\n")
               .Append(scoped).Append(".mf-custom-shell-mode .mf-multistep-frame,\n")
               .Append(scoped).Append(".mf-custom-html-mode .mf-multistep-frame,\n")
               .Append(scoped).Append("[data-mf-has-custom-html] .mf-multistep-body,\n")
               .Append(scoped).Append(".mf-custom-shell-mode .mf-multistep-body,\n")
               .Append(scoped).Append(".mf-custom-html-mode .mf-multistep-body{")
               .Append("width:100%!important;")
               .Append("max-width:none!important;")
               .Append("margin-left:0!important;")
               .Append("margin-right:0!important;")
               .Append("}\n");

            css.Append(scoped).Append(".mf-form-wrapper:has(.mfp-festa-italiana),\n")
               .Append(scoped).Append(".mf-form-wrapper:has(.mfp-festa-italiana)>.mf-form,\n")
               .Append(scoped).Append(".mf-form-wrapper:has(.mfp-festa-italiana) .mf-form,\n")
               .Append(scoped).Append(".mf-form-wrapper:has(.mfp-festa-italiana) .mfp.mfp-festa-italiana,\n")
               .Append(scoped).Append(".mf-custom-shell-mode .mfp.mfp-festa-italiana,\n")
               .Append(scoped).Append(".mf-custom-html-mode .mfp.mfp-festa-italiana{")
               .Append("width:100%!important;")
               .Append("min-width:0!important;")
               .Append("max-width:none!important;")
               .Append("margin-left:0!important;")
               .Append("margin-right:0!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"]{")
               .Append("--background:var(--mf-page-bg,var(--mf-form-bg,var(--background,#ffffff)));")
               .Append("--foreground:var(--mf-text,var(--mf-color-text,var(--foreground,#0f172a)));")
               .Append("--card:var(--mf-form-bg,var(--card,#ffffff));")
               .Append("--card-foreground:var(--mf-text,var(--mf-color-text,var(--card-foreground,#0f172a)));")
               .Append("--primary:var(--mf-primary,var(--primary,#3b82f6));")
               .Append("--primary-foreground:var(--mf-btn-color,var(--mf-btn-text,var(--primary-foreground,#ffffff)));")
               .Append("--muted:var(--mf-primary-light,var(--muted,#f1f5f9));")
               .Append("--muted-foreground:var(--mf-color-text-muted,var(--mf-label-color,var(--muted-foreground,#64748b)));")
               .Append("--accent:var(--mf-primary-light,var(--accent,var(--mf-primary,#3b82f6)));")
               .Append("--border:var(--mf-input-border-color,var(--mf-border,var(--border,#e2e8f0)));")
               .Append("--input:var(--mf-input-bg,var(--input,#ffffff));")
               .Append("--ring:var(--mf-primary,var(--ring,#3b82f6));")
               .Append("--mfp-primary:var(--mf-primary,var(--mfp-primary,var(--primary,#3b82f6)));")
               .Append("--mfp-primary-dark:var(--mf-primary-hover,var(--mf-btn-hover-bg,var(--mfp-primary-dark,var(--mf-primary,#2563eb))));")
               .Append("--mfp-accent:var(--mf-primary-light,var(--mfp-accent,var(--accent,#dbeafe)));")
               .Append("--mfp-bg:var(--mf-page-bg,var(--mf-form-bg,var(--mfp-bg,#ffffff)));")
               .Append("--mfp-card-bg:var(--mf-form-bg,var(--mfp-card-bg,#ffffff));")
               .Append("--mfp-text:var(--mf-text,var(--mf-color-text,var(--mfp-text,#0f172a)));")
               .Append("--mfp-text-muted:var(--mf-color-text-muted,var(--mf-label-color,var(--mfp-text-muted,#64748b)));")
               .Append("--mfp-border:var(--mf-input-border-color,var(--mf-border,var(--mfp-border,#e2e8f0)));")
               .Append("--mfp-border-focus:var(--mf-primary,var(--mfp-border-focus,#3b82f6));")
               .Append("--mfp-radius:var(--mf-form-radius,var(--mfp-radius,8px));")
               .Append("--mfp-shadow:var(--mf-form-shadow,var(--mfp-shadow,none));")
               .Append("--ink:var(--mf-text,var(--mf-color-text,var(--ink,#0f172a)));")
               .Append("--paper:var(--mf-form-bg,var(--paper,#ffffff));")
               .Append("--surface:var(--mf-form-bg,var(--surface,#ffffff));")
               .Append("--line:var(--mf-input-border-color,var(--mf-border,var(--line,#e2e8f0)));")
               .Append("border-color:var(--mf-input-border-color,var(--mf-border,var(--border,#e2e8f0)))!important;")
               .Append("color:var(--mf-text,var(--mf-color-text,var(--foreground,#0f172a)))!important;")
               .Append("font-family:var(--mf-font-family,inherit)!important;")
               .Append("}\n");

            // [CardThuaFix 2026-06-23] Card chrome (bg/border) on .mfp only when no inner card.
            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"]").Append(NOINNER).Append("{")
               .Append("background:var(--mf-form-bg,var(--card,var(--background,#ffffff)))!important;")
               .Append("}\n");

            css.Append(scoped).Append(":not(.mf-style-border-none):not(.mf-style-border-hairline):not(.mf-style-border-prominent) .mfp[class*=\"mfp-\"]").Append(NOINNER).Append("{")
               .Append("--mfp-shell-border:var(--aur-border,var(--au-border,var(--fr-border,var(--bg-border,var(--it-border,var(--nola-border,var(--hw-border,var(--ey-border,var(--mf-input-border-color,var(--mf-border,var(--mfp-border,var(--border,#e2e8f0))))))))))));")
               .Append("border:1px solid var(--mfp-shell-border)!important;")
               .Append("}\n")
               .Append(scoped).Append(":not(.mf-style-radius-square):not(.mf-style-radius-rounded):not(.mf-style-radius-pill) .mfp[class*=\"mfp-\"]{")
               .Append("border-radius:var(--mf-form-radius,var(--mfp-radius,var(--aur-radius,8px)))!important;")
               .Append("background-clip:padding-box!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"],")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.mfp-container{overflow:visible!important;}\n")
               // [DoubleBorderFix 2026-07-05] Was `border:1px solid transparent` — a 0.67px reserved band
               // between the container edge and the inner .mfp-card border. Because the container (and the
               // stripped .mfp/.mf-form shell above it) are transparent, that band reveals the page/host
               // background right next to the card's own border → on a dark-backgrounded host (e.g. the
               // Oqtane home content pane) it reads as a thin second line = a phantom DOUBLE border at the
               // card edge. The card has its own border; the container needs none, so drop it → card flush.
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.mfp-container{")
               .Append("box-sizing:border-box!important;")
               .Append("border:0!important;")
               .Append("}\n")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.mfp-card,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.mfp-container>.mfp-card,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.fr-card,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"]>.mfp-container>.fr-card{")
               .Append("background-clip:padding-box!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp.mfp-australia{")
               .Append(templateVar("--au-primary", "var(--mf-primary,var(--primary,#0bb39b))"))
               .Append(templateVar("--au-primary-d", "var(--mf-primary-hover,var(--mf-btn-hover-bg,var(--mf-primary,#079a85)))"))
               .Append(templateVar("--au-soft", "var(--mf-primary-light,var(--muted,#e2f7f2))"))
               .Append(templateVar("--au-ink", "var(--mf-text,var(--foreground,#06363a))"))
               .Append(templateVar("--au-sub", "var(--mf-label-color,var(--muted-foreground,#5b8a8c))"))
               .Append(templateVar("--au-border", "var(--mf-input-border-color,var(--mf-border,var(--border,#d2ece8)))"))
               .Append(templateVar("--au-surface", "var(--mf-form-bg,var(--card,#ffffff))"))
               .Append(templateVar("--au-band", "linear-gradient(120deg,var(--mf-form-bg,#eafaf7),var(--mf-primary-light,#f3fbff))"))
               .Append("background:var(--au-surface)!important;")
               .Append("border-color:var(--au-border)!important;")
               .Append("border-radius:var(--mf-form-radius,39px)!important;")
               .Append("color:var(--au-ink)!important;")
               .Append("font-family:var(--mf-font-family,'Outfit',system-ui,-apple-system,'Segoe UI',sans-serif)!important;")
               .Append("}\n");

            css.Append(scoped).Append(".mf-style-radius-square .mfp,")
               .Append(scoped).Append(".mf-style-radius-square .mfp-card,")
               .Append(scoped).Append(".mf-style-radius-square .fr-card{border-radius:0!important;}\n")
               .Append(scoped).Append(".mf-style-radius-rounded .mfp,")
               .Append(scoped).Append(".mf-style-radius-rounded .mfp-card,")
               .Append(scoped).Append(".mf-style-radius-rounded .fr-card{border-radius:var(--mf-form-radius,8px)!important;}\n")
               .Append(scoped).Append(".mf-style-radius-pill .mfp,")
               .Append(scoped).Append(".mf-style-radius-pill .mfp-card,")
               .Append(scoped).Append(".mf-style-radius-pill .fr-card{border-radius:16px!important;}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"] h1,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] h2,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] h3,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-form-title,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mfp-form-title,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] [class*=\"title\"]{")
               .Append("color:var(--mf-title-color,var(--mf-text,var(--mf-color-text,var(--foreground,#0f172a))))!important;")
               .Append("font-family:var(--mf-heading-font,var(--mf-font-family,inherit))!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-field-label,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] label{")
               .Append("color:var(--mf-label-color,var(--mf-color-text-muted,var(--foreground,#334155)))!important;")
               .Append("font-family:var(--mf-font-family,inherit)!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp.mfp-australia h1,")
               .Append(scoped).Append(" .mfp.mfp-australia h2,")
               .Append(scoped).Append(" .mfp.mfp-australia h3,")
               .Append(scoped).Append(" .mfp.mfp-australia .au-brand-tx strong,")
               .Append(scoped).Append(" .mfp.mfp-australia .au-section-title{")
               .Append("color:var(--mf-title-color,var(--au-ink))!important;")
               .Append("font-family:var(--mf-heading-font,var(--mf-font-family,'Sora',system-ui,sans-serif))!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp.mfp-australia .mf-field-label,")
               .Append(scoped).Append(" .mfp.mfp-australia label{")
               .Append("color:var(--mf-label-color,var(--au-sub))!important;")
               .Append("font-family:var(--mf-font-family,'Outfit',system-ui,sans-serif)!important;")
               .Append("}\n");

            css.Append(scoped).Append(".mf-style-input-square .mfp input:not([type=\"checkbox\"]):not([type=\"radio\"]),")
               .Append(scoped).Append(".mf-style-input-square .mfp textarea,")
               .Append(scoped).Append(".mf-style-input-square .mfp select,")
               .Append(scoped).Append(".mf-style-input-square .mfp button.mf-input,")
               .Append(scoped).Append(".mf-style-input-square .mfp .mf-cal-trigger{border-radius:0!important;}\n")
               .Append(scoped).Append(".mf-style-input-rounded .mfp input:not([type=\"checkbox\"]):not([type=\"radio\"]),")
               .Append(scoped).Append(".mf-style-input-rounded .mfp textarea,")
               .Append(scoped).Append(".mf-style-input-rounded .mfp select,")
               .Append(scoped).Append(".mf-style-input-rounded .mfp button.mf-input,")
               .Append(scoped).Append(".mf-style-input-rounded .mfp .mf-cal-trigger{border-radius:var(--mf-input-radius,6px)!important;}\n")
               .Append(scoped).Append(".mf-style-input-pill .mfp input:not([type=\"checkbox\"]):not([type=\"radio\"]),")
               .Append(scoped).Append(".mf-style-input-pill .mfp textarea,")
               .Append(scoped).Append(".mf-style-input-pill .mfp select,")
               .Append(scoped).Append(".mf-style-input-pill .mfp button.mf-input,")
               .Append(scoped).Append(".mf-style-input-pill .mfp .mf-cal-trigger{border-radius:999px!important;}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-input,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-textarea,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-select,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] input:not([type=\"checkbox\"]):not([type=\"radio\"]),")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] textarea,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] select,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] button.mf-input,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-cal-trigger{")
               .Append("background-color:var(--mf-input-bg,var(--input,#ffffff))!important;")
               .Append("border-color:var(--mf-input-border-color,var(--mf-border,var(--border,#e2e8f0)))!important;")
               .Append("border-radius:var(--mf-input-radius,var(--mfp-input-radius,6px))!important;")
               .Append("color:var(--mf-input-text,var(--mf-text,var(--mf-color-text,#0f172a)))!important;")
               .Append("font-family:var(--mf-font-family,inherit)!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp.mfp-australia .mf-input,")
               .Append(scoped).Append(" .mfp.mfp-australia .mf-textarea,")
               .Append(scoped).Append(" .mfp.mfp-australia .mf-select,")
               .Append(scoped).Append(" .mfp.mfp-australia input:not([type=\"checkbox\"]):not([type=\"radio\"]),")
               .Append(scoped).Append(" .mfp.mfp-australia textarea,")
               .Append(scoped).Append(" .mfp.mfp-australia select{")
               .Append("background-color:var(--mf-input-bg,#ffffff)!important;")
               .Append("border-color:var(--mf-input-border-color,var(--au-border))!important;")
               .Append("border-radius:var(--mf-input-radius,14px)!important;")
               .Append("color:var(--mf-text,var(--au-ink))!important;")
               .Append("font-family:var(--mf-font-family,'Outfit',system-ui,sans-serif)!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp[class*=\"mfp-\"] button[type=\"submit\"],")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-btn-submit,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mfp-submit,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-submit,")
               .Append(scoped).Append(" .mfp[class*=\"mfp-\"] .mf-btn-primary{")
               .Append("background:var(--mf-btn-bg,var(--mf-primary,var(--primary,#3b82f6)))!important;")
               .Append("border-color:var(--mf-btn-bg,var(--mf-primary,var(--primary,#3b82f6)))!important;")
               .Append("border-radius:var(--mf-btn-radius,var(--mf-input-radius,8px))!important;")
               .Append("box-shadow:var(--mf-btn-shadow,none)!important;")
               .Append("color:var(--mf-btn-color,var(--mf-btn-text,var(--primary-foreground,#ffffff)))!important;")
               .Append("font-family:var(--mf-font-family,inherit)!important;")
               .Append("}\n");

            css.Append(scoped).Append(" .mfp.mfp-australia button[type=\"submit\"],")
               .Append(scoped).Append(" .mfp.mfp-australia .mf-btn-submit,")
               .Append(scoped).Append(" .mfp.mfp-australia .mfp-submit,")
               .Append(scoped).Append(" .mfp.mfp-australia .au-next,")
               .Append(scoped).Append(" .mfp.mfp-australia .au-prev{")
               .Append("background:").Append(australiaButtonAccent).Append("!important;")
               .Append("border-color:").Append(australiaButtonAccent).Append("!important;")
               .Append("border-radius:var(--mf-btn-radius,14px)!important;")
               .Append("color:var(--mf-btn-color,var(--mf-color-text-inverse,#ffffff))!important;")
               .Append("font-family:var(--mf-font-family,'Outfit',system-ui,sans-serif)!important;")
               .Append("}");

            return css.ToString();
        }

        private static HashSet<string> CollectAuthoredCssVarDeclarations(string templateText)
        {
            var found = new HashSet<string>(StringComparer.Ordinal);
            foreach (Match match in VarDeclarationRe.Matches(templateText ?? string.Empty))
            {
                var name = match.Groups["name"].Value;
                if (!string.IsNullOrEmpty(name)) found.Add(name);
            }
            return found;
        }

        public static string AppendTo(string customCss, string scopeSelector)
            => AppendTo(customCss, scopeSelector, string.Empty, false);

        public static string AppendTo(string customCss, string scopeSelector, string authoredTemplateText, bool enableTemplateVarBridge)
        {
            var bridge = Build(scopeSelector, authoredTemplateText, enableTemplateVarBridge);
            if (string.IsNullOrWhiteSpace(bridge)) return customCss ?? string.Empty;
            if (string.IsNullOrWhiteSpace(customCss)) return bridge;
            if ((customCss ?? string.Empty).IndexOf(Badge, StringComparison.OrdinalIgnoreCase) >= 0)
                return customCss ?? string.Empty;
            return (customCss ?? string.Empty).TrimEnd() + "\n\n" + bridge;
        }
    }
}
