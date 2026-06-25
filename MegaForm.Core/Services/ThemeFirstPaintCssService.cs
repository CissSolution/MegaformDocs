using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Server-side port of the renderer's runtime theme application
    /// (renderer/index.ts → applyFormPresentationSettings: collectThemeCssOverrides +
    /// buildPremiumThemeAliasVars + buildScopedThemeVarsCss + applyDisplayStyleClasses).
    ///
    /// PURPOSE: make the SSR FIRST PAINT render the SAME theme the JS renderer applies on
    /// boot. Without this, a form whose authored customCss bakes a premium-template palette
    /// (e.g. a green :root{--mfp-*}) but whose settings select a built-in theme (e.g.
    /// "midnight") paints the customCss palette first, then the client overrides it with a
    /// scoped #mf-form-wrapper-{id}{--mfp-*} block → a visible "preset swap" flash. Emitting
    /// the same scoped block + theme/display classes server-side removes the swap.
    /// </summary>
    public static class ThemeFirstPaintCssService
    {
        public const string Badge = "ThemeFirstPaintCss v20260625-B269-pageinherit";

        // Mirror of KNOWN_PREMIUM_VAR_PREFIXES in renderer/index.ts.
        private static readonly string[] KnownPremiumVarPrefixes =
            { "mfp", "au", "bg", "fr", "it", "aur", "nola", "hw", "ey" };

        private static readonly Regex VarNameRe = new Regex("^--[a-zA-Z0-9_-]+$", RegexOptions.Compiled);
        private static readonly Regex PrefixScanRe = new Regex("--([a-z][a-z0-9]{1,14})-[a-z0-9_-]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex StyleCloseRe = new Regex("</style", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // ─────────────────────────────────────────────────────────────────────────────
        // Public API
        // ─────────────────────────────────────────────────────────────────────────────

        /// <summary>
        /// Resolved theme id, or empty string when the form uses the default theme (or a
        /// "custom" theme with no customCss/customHtml — same B114 guard as the renderer).
        /// Callers prefix "mf-theme-".
        /// </summary>
        public static string ResolveThemeId(JObject settings)
        {
            if (settings == null) return string.Empty;
            var themeId = Str(First(settings, "theme", "Theme")).Trim();
            if (themeId.Length == 0) themeId = "default";
            if (string.Equals(themeId, "custom", StringComparison.Ordinal))
            {
                var customCss = Str(First(settings, "customCss", "CustomCss")).Trim();
                var customHtml = Str(First(settings, "customHtml", "CustomHtml")).Trim();
                if (customCss.Length == 0 && customHtml.Length == 0) themeId = "default";
            }
            return string.Equals(themeId, "default", StringComparison.Ordinal) ? string.Empty : themeId;
        }

        /// <summary>
        /// Space-joined wrapper classes the renderer adds at runtime: display-style
        /// (radius/input/shadow/border/pad), hide-header, and the theme class. Empty when
        /// none apply. Caller appends to the static SSR wrapper class list.
        /// </summary>
        public static string BuildWrapperRuntimeClasses(JObject settings)
        {
            if (settings == null) return string.Empty;
            var classes = new List<string>();

            var ds = First(settings, "displayStyle", "DisplayStyle") as JObject;
            AddDisplayStyle(classes, ds, "radius", "Radius", "mf-style-radius-", new[] { "square", "rounded", "pill" });
            AddDisplayStyle(classes, ds, "inputRadius", "InputRadius", "mf-style-input-", new[] { "square", "rounded", "pill" });
            AddDisplayStyle(classes, ds, "shadow", "Shadow", "mf-style-shadow-", new[] { "none", "soft", "medium", "large" });
            AddDisplayStyle(classes, ds, "border", "Border", "mf-style-border-", new[] { "none", "hairline", "prominent" });
            // pad: "comfortable" is the default and gets no class (matches renderer).
            var pad = NormalizeToken(GetDs(ds, "pad", "Pad"), new[] { "compact", "comfortable", "spacious" });
            if (pad.Length > 0 && !string.Equals(pad, "comfortable", StringComparison.Ordinal))
                classes.Add("mf-style-pad-" + pad);

            if (ReadBool(First(settings, "hideHeader", "HideHeader"))) classes.Add("mf-hide-header");

            var themeId = ResolveThemeId(settings);
            if (themeId.Length > 0) classes.Add("mf-theme-" + themeId);

            // Page-theme typography inheritance (inline embeds only): the form borrows the host
            // skin's font instead of its own --mf-font-family. Robust explicit class — megaform.css
            // .mf-inherit-type forces font-family:inherit!important (icon glyphs excluded). Applies
            // to EVERY form type incl. .mfp premium / AI custom-HTML shells: the opt-in flag is the
            // author's explicit choice, so there is no form on which it is hard-blocked.
            if (ReadBool(First(settings, "inheritPageTypography", "InheritPageTypography")))
                classes.Add("mf-inherit-type");

            return string.Join(" ", classes);
        }

        /// <summary>
        /// Scoped #mf-form-wrapper-{id}{ … } CSS block carrying the theme's css overrides
        /// expanded with premium aliases (mirror of buildScopedThemeVarsCss(formId,
        /// effectiveCssOverrides)). Empty when the form has no theme overrides.
        /// </summary>
        private const string HostPrimaryVar = "var(--bs-primary, var(--primary, var(--theme-primary, #2563eb)))";

        public static string BuildScopedThemeVarsCss(int formId, JObject settings)
        {
            if (settings == null) return string.Empty;
            var overrides = CollectThemeCssOverrides(settings);

            // Page-theme "borrow colours" (inline embeds only): the form blends into the host skin
            // — transparent OUTER panel + the host's primary accent (Bootstrap --bs-primary on
            // Oqtane, skin var on DNN, safe literal fallback last). Available on EVERY form type
            // (incl. .mfp premium / AI custom-HTML shells) — opt-in, reversible, author's choice.
            var borrowColors = ReadBool(First(settings, "inheritPageColors", "InheritPageColors"));
            if (borrowColors)
            {
                // Inject the host primary into the override map BEFORE alias expansion so
                // BuildPremiumThemeAliasVars propagates it to EVERY primary-family alias
                // (--mfp-primary / --au-primary / --primary / --ring / button + per-template
                // prefixes). Without this, .mfp / AI pure-grid shells that read --mfp-* would not
                // recolour. Body text colour is left untouched (readability); the card keeps its
                // own bg (only the outer wrapper goes transparent, applied after aliases below).
                overrides["--mf-primary"] = HostPrimaryVar;
                overrides["--mf-btn-bg"] = HostPrimaryVar;
            }

            if (overrides.Count == 0) return string.Empty;

            var customCss = Str(First(settings, "customCss", "CustomCss"));
            var customHtml = Str(First(settings, "customHtml", "CustomHtml"));
            var aliases = BuildPremiumThemeAliasVars(overrides, customCss + "\n" + customHtml);

            // effective = aliases ∪ overrides, overrides authoritative. BuildPremiumThemeAliasVars
            // already skips keys present in `overrides`, so the union has no collisions.
            var effective = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in aliases) effective[kv.Key] = kv.Value;
            foreach (var kv in overrides) effective[kv.Key] = kv.Value;

            // Outer panel only — applied AFTER aliases so it is not propagated into card-bg
            // derivations (a .mfp card would otherwise go transparent and vanish).
            if (borrowColors) effective["--mf-page-bg"] = "transparent";

            return BuildScopedCss(formId, effective);
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // collectThemeCssOverrides
        // ─────────────────────────────────────────────────────────────────────────────

        private static Dictionary<string, string> CollectThemeCssOverrides(JObject settings)
        {
            var outMap = new Dictionary<string, string>(StringComparer.Ordinal);
            Merge(outMap, First(settings, "cssOverrides", "CssOverrides") as JObject);
            Merge(outMap, First(settings, "themeCssOverrides", "ThemeCssOverrides") as JObject);
            return outMap;
        }

        private static void Merge(Dictionary<string, string> outMap, JObject src)
        {
            if (src == null) return;
            foreach (var prop in src.Properties())
            {
                if (!VarNameRe.IsMatch(prop.Name)) continue;
                var token = prop.Value;
                if (token == null || token.Type == JTokenType.Null) continue;
                outMap[prop.Name] = token.ToString();
            }
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // buildPremiumThemeAliasVars
        // ─────────────────────────────────────────────────────────────────────────────

        private static Dictionary<string, string> BuildPremiumThemeAliasVars(Dictionary<string, string> vars, string templateText)
        {
            var outMap = new Dictionary<string, string>(StringComparer.Ordinal);

            var primary = Pick(vars, "--mf-primary", "--mf-btn-bg", "--primary", "--mfp-primary");
            var primaryHover = Pick(vars, new[] { "--mf-primary-hover", "--mf-btn-hover-bg", "--mf-btn-bg-hover" }, primary);
            var primaryLight = Pick(vars, new[] { "--mf-primary-light", "--mf-accent", "--accent", "--muted" }, primary);
            var pageBg = Pick(vars, "--mf-page-bg", "--background");
            var formBg = Pick(vars, new[] { "--mf-form-bg", "--mf-input-bg", "--card", "--background" }, pageBg);
            var foreground = Pick(vars, "--mf-text", "--mf-color-text", "--foreground", "--mfp-text");
            var mutedText = Pick(vars, new[] { "--mf-color-text-muted", "--mf-help-color", "--mf-label-color", "--muted-foreground" }, foreground);
            var titleText = Pick(vars, new[] { "--mf-title-color", "--mf-section-title", "--mf-text", "--mf-color-text" }, foreground);
            var labelText = Pick(vars, new[] { "--mf-label-color", "--mf-color-text", "--mf-text" }, foreground);
            var border = Pick(vars, "--mf-input-border-color", "--mf-border", "--mf-section-border", "--border", "--mfp-border");
            var inputBg = Pick(vars, new[] { "--mf-input-bg", "--input", "--card" }, formBg);
            var inputText = Pick(vars, new[] { "--mf-input-text", "--mf-text", "--mf-color-text" }, foreground);
            var buttonText = Pick(vars, new[] { "--mf-btn-color", "--mf-btn-text", "--mf-color-text-inverse", "--primary-foreground" }, "#ffffff");
            var formRadius = Pick(vars, "--mf-form-radius", "--radius");
            var inputRadius = Pick(vars, new[] { "--mf-input-radius" }, formRadius);
            var formShadow = Pick(vars, "--mf-form-shadow", "--shadow");
            var transition = Pick(vars, new[] { "--mf-transition-duration" }, "200ms");

            if (IsEmpty(primary) && IsEmpty(formBg) && IsEmpty(foreground) && IsEmpty(border)) return outMap;

            Put(outMap, vars, "--mf-primary", primary);
            Put(outMap, vars, "--mf-primary-hover", primaryHover);
            Put(outMap, vars, "--mf-primary-light", primaryLight);
            Put(outMap, vars, "--mf-form-bg", formBg);
            Put(outMap, vars, "--mf-input-bg", inputBg);
            Put(outMap, vars, "--mf-text", foreground);
            Put(outMap, vars, "--mf-color-text", foreground);
            Put(outMap, vars, "--mf-color-text-muted", mutedText);
            Put(outMap, vars, "--mf-title-color", titleText);
            Put(outMap, vars, "--mf-label-color", labelText);
            Put(outMap, vars, "--mf-input-text", inputText);
            Put(outMap, vars, "--mf-border", border);
            Put(outMap, vars, "--mf-input-border-color", border);
            Put(outMap, vars, "--mf-btn-bg", primary);
            Put(outMap, vars, "--mf-btn-bg-hover", primaryHover);
            Put(outMap, vars, "--mf-btn-hover-bg", primaryHover);
            Put(outMap, vars, "--mf-btn-color", buttonText);
            Put(outMap, vars, "--mf-btn-text", buttonText);
            Put(outMap, vars, "--mf-color-text-inverse", buttonText);

            Put(outMap, vars, "--background", Or(pageBg, formBg));
            Put(outMap, vars, "--foreground", foreground);
            Put(outMap, vars, "--card", Or(formBg, pageBg));
            Put(outMap, vars, "--card-foreground", foreground);
            Put(outMap, vars, "--primary", primary);
            Put(outMap, vars, "--primary-foreground", buttonText);
            Put(outMap, vars, "--secondary", Or(inputBg, formBg));
            Put(outMap, vars, "--secondary-foreground", foreground);
            Put(outMap, vars, "--muted", Or(primaryLight, Or(inputBg, formBg)));
            Put(outMap, vars, "--muted-foreground", mutedText);
            Put(outMap, vars, "--accent", Or(primaryLight, primary));
            Put(outMap, vars, "--accent-foreground", foreground);
            Put(outMap, vars, "--border", border);
            Put(outMap, vars, "--input", Or(inputBg, formBg));
            Put(outMap, vars, "--ring", primary);
            Put(outMap, vars, "--radius", formRadius);

            Put(outMap, vars, "--mfp-primary", primary);
            Put(outMap, vars, "--mfp-primary-dark", primaryHover);
            Put(outMap, vars, "--mfp-accent", Or(primaryLight, primary));
            Put(outMap, vars, "--mfp-bg", Or(pageBg, formBg));
            Put(outMap, vars, "--mfp-card-bg", Or(formBg, pageBg));
            Put(outMap, vars, "--mfp-text", foreground);
            Put(outMap, vars, "--mfp-text-muted", mutedText);
            Put(outMap, vars, "--mfp-border", border);
            Put(outMap, vars, "--mfp-border-focus", primary);
            Put(outMap, vars, "--mfp-section", mutedText);
            Put(outMap, vars, "--mfp-radius", formRadius);
            Put(outMap, vars, "--mfp-input-radius", inputRadius);
            Put(outMap, vars, "--mfp-shadow", formShadow);

            Put(outMap, vars, "--au-primary", primary);
            Put(outMap, vars, "--au-primary-d", primaryHover);
            Put(outMap, vars, "--au-soft", Or(primaryLight, Or(inputBg, formBg)));
            Put(outMap, vars, "--au-ink", foreground);
            Put(outMap, vars, "--au-sub", mutedText);
            Put(outMap, vars, "--au-border", border);
            Put(outMap, vars, "--au-surface", Or(formBg, pageBg));

            Put(outMap, vars, "--ink", foreground);
            Put(outMap, vars, "--paper", Or(formBg, pageBg));
            Put(outMap, vars, "--surface", Or(formBg, pageBg));
            Put(outMap, vars, "--surface-2", Or(inputBg, formBg));
            Put(outMap, vars, "--line", border);
            Put(outMap, vars, "--shadow", formShadow);
            Put(outMap, vars, "--transition", transition);

            foreach (var prefix in DetectPremiumVarPrefixes(templateText))
            {
                var b = "--" + prefix + "-";
                Put(outMap, vars, b + "primary", primary);
                Put(outMap, vars, b + "primary-dark", primaryHover);
                Put(outMap, vars, b + "primary-hover", primaryHover);
                Put(outMap, vars, b + "accent", Or(primaryLight, primary));
                Put(outMap, vars, b + "bg", Or(pageBg, formBg));
                Put(outMap, vars, b + "background", Or(pageBg, formBg));
                Put(outMap, vars, b + "surface", Or(formBg, pageBg));
                Put(outMap, vars, b + "card", Or(formBg, pageBg));
                Put(outMap, vars, b + "card-bg", Or(formBg, pageBg));
                Put(outMap, vars, b + "paper", Or(formBg, pageBg));
                Put(outMap, vars, b + "input-bg", Or(inputBg, formBg));
                Put(outMap, vars, b + "ink", foreground);
                Put(outMap, vars, b + "text", foreground);
                Put(outMap, vars, b + "foreground", foreground);
                Put(outMap, vars, b + "muted", mutedText);
                Put(outMap, vars, b + "sub", mutedText);
                Put(outMap, vars, b + "border", border);
                Put(outMap, vars, b + "line", border);
                Put(outMap, vars, b + "radius", formRadius);
                Put(outMap, vars, b + "input-radius", inputRadius);
                Put(outMap, vars, b + "shadow", formShadow);
            }

            return outMap;
        }

        private static List<string> DetectPremiumVarPrefixes(string templateText)
        {
            var found = new List<string>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in KnownPremiumVarPrefixes) { if (seen.Add(p)) found.Add(p); }

            var text = templateText ?? string.Empty;
            foreach (Match m in PrefixScanRe.Matches(text))
            {
                var prefix = (m.Groups[1].Value ?? string.Empty).ToLowerInvariant();
                if (prefix.Length == 0 || string.Equals(prefix, "mf", StringComparison.Ordinal)) continue;
                if (seen.Add(prefix)) found.Add(prefix);
            }
            return found;
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // buildScopedThemeVarsCss
        // ─────────────────────────────────────────────────────────────────────────────

        private static string BuildScopedCss(int formId, Dictionary<string, string> vars)
        {
            if (vars.Count == 0) return string.Empty;
            var w = "#mf-form-wrapper-" + formId;
            var sb = new StringBuilder(256 + vars.Count * 48);
            sb.Append(w).Append(",\n");
            sb.Append(w).Append(" .mf-form,\n");
            sb.Append(w).Append(" .mf-form-inner,\n");
            sb.Append(w).Append(" .mf-fields-container,\n");
            sb.Append(w).Append(" .mfp,\n");
            sb.Append(w).Append(" .mfp-card,\n");
            sb.Append(w).Append(" .fr-card {\n");
            foreach (var kv in vars)
            {
                sb.Append("  ").Append(kv.Key).Append(": ").Append(CssEscapeValue(kv.Value)).Append(" !important;\n");
            }
            sb.Append("}");
            return sb.ToString();
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // helpers
        // ─────────────────────────────────────────────────────────────────────────────

        private static void Put(Dictionary<string, string> outMap, Dictionary<string, string> source, string name, string value)
        {
            if (string.IsNullOrEmpty(name) || string.IsNullOrEmpty(value)) return;
            if (source.ContainsKey(name) || outMap.ContainsKey(name)) return;
            outMap[name] = value;
        }

        private static string Pick(Dictionary<string, string> vars, params string[] names) => Pick(vars, names, string.Empty);

        private static string Pick(Dictionary<string, string> vars, string[] names, string fallback)
        {
            foreach (var name in names)
            {
                if (vars.TryGetValue(name, out var value) && value != null && value.Trim().Length > 0) return value;
            }
            return fallback;
        }

        private static string Or(string a, string b) => string.IsNullOrEmpty(a) ? b : a;

        private static bool IsEmpty(string s) => string.IsNullOrEmpty(s);

        private static string CssEscapeValue(string value) => StyleCloseRe.Replace(value ?? string.Empty, "<\\/style");

        private static void AddDisplayStyle(List<string> classes, JObject ds, string camel, string pascal, string prefix, string[] allowed)
        {
            var token = NormalizeToken(GetDs(ds, camel, pascal), allowed);
            if (token.Length > 0) classes.Add(prefix + token);
        }

        private static string GetDs(JObject ds, string camel, string pascal)
        {
            if (ds == null) return string.Empty;
            var token = ds[camel] ?? ds[pascal];
            return token == null || token.Type == JTokenType.Null ? string.Empty : token.ToString();
        }

        private static string NormalizeToken(string value, string[] allowed)
        {
            var token = (value ?? string.Empty).Trim().ToLowerInvariant();
            foreach (var a in allowed) if (string.Equals(a, token, StringComparison.Ordinal)) return token;
            return string.Empty;
        }

        private static JToken First(JObject obj, string camel, string pascal)
        {
            if (obj == null) return null;
            return obj[camel] ?? obj[pascal];
        }

        private static string Str(JToken token) => token == null || token.Type == JTokenType.Null ? string.Empty : token.ToString();

        private static bool ReadBool(JToken token)
        {
            if (token == null) return false;
            if (token.Type == JTokenType.Boolean) return token.Value<bool>();
            return bool.TryParse(token.ToString(), out var parsed) && parsed;
        }
    }
}
