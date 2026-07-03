using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// SINGLE server-side CSS composer for a MegaForm form/module. Produces the FULL,
    /// final CSS string that a host emits into exactly ONE &lt;style&gt; block at first paint —
    /// so the public renderer JS never has to inject or rebuild theme CSS (it early-returns
    /// when the wrapper carries data-mf-ssr="1").
    ///
    /// It consolidates the four previously-separate server CSS sources into one deterministic
    /// string, in the SAME source order they had as separate blocks (so cascade resolution is
    /// unchanged vs the proven-correct current output):
    ///   [1] preset vars  — ThemePresetInlineCssService (was a separate &lt;style id=mf-inline-preset&gt;, emitted FIRST)
    ///   [2] scoped vars  — ThemeFirstPaintCssService.BuildScopedThemeVarsCss (!important)
    ///   [3] authored customCss (settings.customCss verbatim)
    ///   [4] custom-shell compat — CustomShellCompatibilityCssService (WIDENED predicate, see below)
    ///   [5] module CSS override — appended LAST so the per-module edit wins (module-setting authority)
    ///
    /// WIDENED custom-shell predicate (fixes the premium-form gap the client had but the server
    /// did not): the renderer adds compat when `customHtml || /mfp/.test(customCss)` (index.ts
    /// hasCustomShell), whereas the old SSR added it only when `hasCustomHtml`. A premium template
    /// pasted into the CSS box (.mfp markup in customCss, no customHtml field) therefore lost the
    /// compat bridge at first paint. This composer mirrors the client predicate so such forms keep
    /// their var bridging when the client is neutralised.
    ///
    /// Badge: ModuleCssComposer v20260624-B264
    /// </summary>
    public static class ModuleCssComposer
    {
        public const string Badge = "ModuleCssComposer v20260624-B264";

        /// <summary>
        /// Compose the full CSS for a form. <paramref name="selectedPresetKey"/> is the resolved
        /// per-module theme-preset key (module authority over preset choice; pass null/empty when
        /// none). <paramref name="moduleCssOverride"/> is the per-module raw CSS edit, appended last
        /// (module wins); pass null/empty on hosts that have no module override.
        /// </summary>
        public static string BuildModuleCss(int formId, JObject settings, string selectedPresetKey, string moduleCssOverride)
        {
            // Resolve the preset segment from the form's themeSelector + the module's chosen key,
            // then compose. Hosts that already have the controller-computed preset CSS string
            // (e.g. Oqtane Index.razor's _initialInlineCss = FormDto.InitialInlineCss) should call
            // Compose(...) directly to avoid recomputing it.
            var presetCss = settings != null
                ? ThemePresetInlineCssService.Build(settings, selectedPresetKey, "#mf-form-wrapper-" + formId)
                : string.Empty;
            return Compose(formId, settings, presetCss, moduleCssOverride);
        }

        /// <summary>
        /// Compose the single CSS string from an ALREADY-RESOLVED preset segment + the form's
        /// settings + an optional module override. Deterministic order [preset, scoped,
        /// customCss+compat, moduleOverride] — identical source order to the previous two
        /// server blocks (mf-inline-preset then mf-custom-css), so cascade resolution is unchanged.
        /// </summary>
        public static string Compose(int formId, JObject settings, string presetCss, string moduleCssOverride)
        {
            var scope = "#mf-form-wrapper-" + formId;
            var segments = new List<string>(4);

            // [1] preset — FIRST (was the separate mf-inline-preset block, emitted before mf-custom-css).
            if (!string.IsNullOrWhiteSpace(presetCss)) segments.Add(presetCss);

            if (settings != null)
            {
                // [2] scoped theme vars (!important).
                var scoped = ThemeFirstPaintCssService.BuildScopedThemeVarsCss(formId, settings);
                if (!string.IsNullOrWhiteSpace(scoped)) segments.Add(scoped);

                // [3] authored customCss  +  [4] custom-shell compat (WIDENED predicate vs old
                // hasCustomHtml-only gate — see class doc).
                var customCss = Str(First(settings, "customCss", "CustomCss"));
                var customHtml = Str(First(settings, "customHtml", "CustomHtml"));
                var enableTemplateVarBridge = !string.IsNullOrWhiteSpace(presetCss) || HasThemeOverrides(settings);
                var customCssPlusCompat = HasCustomShell(customHtml, customCss)
                    ? CustomShellCompatibilityCssService.AppendTo(customCss, scope, customCss + "\n" + customHtml, enableTemplateVarBridge)
                    : customCss;
                if (!string.IsNullOrWhiteSpace(customCssPlusCompat)) segments.Add(customCssPlusCompat);
            }

            // [5] module CSS override — LAST, so the per-module edit wins (module-setting authority).
            if (!string.IsNullOrWhiteSpace(moduleCssOverride)) segments.Add(moduleCssOverride.Trim());

            // [SecFix 2026-07-03 P0-6] This string is emitted verbatim inside ONE <style> element.
            // Authored customCss / moduleCssOverride could contain "</style><script>…" to break out of
            // the style context (stored XSS). Neutralise the only breakout token — "</" — by escaping
            // the solidus (CSS reads "<\/" as "/", the HTML rawtext scanner no longer sees "</style").
            // Server-generated preset/scoped/compat segments never contain "</", so this is inert for them.
            return NeutralizeStyleBreakout(string.Join("\n\n", segments));
        }

        /// <summary>Escape the "&lt;/" token so authored CSS can't close the &lt;style&gt; element early.</summary>
        private static string NeutralizeStyleBreakout(string css)
            => string.IsNullOrEmpty(css) ? css : css.Replace("</", "<\\/");

        /// <summary>
        /// The form's wrapper runtime classes (mf-theme-*, mf-style-*, mf-hide-header) the host
        /// appends to the wrapper class list. Thin pass-through to keep one entry point.
        /// </summary>
        public static string BuildWrapperRuntimeClasses(JObject settings)
            => ThemeFirstPaintCssService.BuildWrapperRuntimeClasses(settings);

        /// <summary>
        /// Whether this form needs the custom-shell compat bridge. Mirrors renderer
        /// index.ts hasCustomShell: a customHtml field OR `.mfp` markup baked into customCss.
        /// </summary>
        public static bool HasCustomShell(string customHtml, string customCss)
        {
            if (!string.IsNullOrWhiteSpace(customHtml)) return true;
            if (!string.IsNullOrEmpty(customCss) && customCss.IndexOf("mfp", StringComparison.OrdinalIgnoreCase) >= 0) return true;
            return false;
        }

        private static bool HasThemeOverrides(JObject settings)
        {
            return HasVars(First(settings, "cssOverrides", "CssOverrides") as JObject) ||
                   HasVars(First(settings, "themeCssOverrides", "ThemeCssOverrides") as JObject);
        }

        private static bool HasVars(JObject vars)
        {
            if (vars == null) return false;
            foreach (var prop in vars.Properties())
            {
                if (prop.Name != null && prop.Name.StartsWith("--", StringComparison.Ordinal) && prop.Value != null)
                    return true;
            }
            return false;
        }

        private static JToken First(JObject obj, string camel, string pascal)
            => obj == null ? null : (obj[camel] ?? obj[pascal]);

        private static string Str(JToken token)
            => token == null || token.Type == JTokenType.Null ? string.Empty : token.ToString();
    }
}
