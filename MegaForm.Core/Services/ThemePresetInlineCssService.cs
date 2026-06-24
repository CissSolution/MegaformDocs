using System;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Builds first-paint scoped CSS for standardized template theme presets.
    /// Hosts should render the returned CSS inside a &lt;style&gt; tag before the renderer JS runs.
    /// </summary>
    public static class ThemePresetInlineCssService
    {
        public const string Badge = "ThemePresetInlineCss v20260622-B231";

        public static string Build(string settingsJson, string selectedThemeKey, string scopeSelector)
        {
            if (string.IsNullOrWhiteSpace(settingsJson) || string.IsNullOrWhiteSpace(scopeSelector)) return string.Empty;

            try
            {
                var settings = JObject.Parse(settingsJson);
                return Build(settings, selectedThemeKey, scopeSelector);
            }
            catch
            {
                return string.Empty;
            }
        }

        public static string Build(JObject settings, string selectedThemeKey, string scopeSelector)
        {
            if (settings == null || string.IsNullOrWhiteSpace(scopeSelector)) return string.Empty;

            var selectorMeta = settings["themeSelector"] as JObject ?? settings["ThemeSelector"] as JObject;
            if (selectorMeta == null) return string.Empty;

            var enabled = ReadBool(selectorMeta, "enabled", "Enabled", true);
            if (!enabled) return string.Empty;

            var presets = selectorMeta["presets"] as JObject ?? selectorMeta["Presets"] as JObject;
            if (presets == null || !presets.HasValues) return string.Empty;

            var resolvedKey = FirstNonEmpty(
                selectedThemeKey,
                selectorMeta["selectedThemeKey"], selectorMeta["SelectedThemeKey"],
                selectorMeta["defaultThemeKey"], selectorMeta["DefaultThemeKey"],
                settings["theme"], settings["Theme"]
            );
            if (string.IsNullOrWhiteSpace(resolvedKey)) return string.Empty;

            var preset = presets[resolvedKey] as JObject;
            if (preset == null)
            {
                foreach (var prop in presets.Properties())
                {
                    var candidate = prop.Value as JObject;
                    var id = FirstNonEmpty(candidate != null ? candidate["id"] : null, candidate != null ? candidate["Id"] : null, prop.Name);
                    if (string.Equals(id, resolvedKey, StringComparison.OrdinalIgnoreCase))
                    {
                        preset = candidate;
                        break;
                    }
                }
            }
            if (preset == null) return string.Empty;

            var background = CssValue(preset, new[] { "background", "Background", "bg", "Bg" });
            var foreground = CssValue(preset, new[] { "foreground", "Foreground", "fg", "Fg", "text", "Text" });
            var card = CssValue(preset, new[] { "card", "Card", "cardBackground", "CardBackground" }, background);
            var primary = CssValue(preset, new[] { "primary", "Primary", "p", "P" }, foreground);
            var primaryForeground = CssValue(preset, new[] { "primaryForeground", "PrimaryForeground", "primaryFg", "PrimaryFg" }, foreground);
            var secondary = CssValue(preset, new[] { "secondary", "Secondary" }, background);
            var muted = CssValue(preset, new[] { "muted", "Muted" }, background);
            var mutedForeground = CssValue(preset, new[] { "mutedForeground", "MutedForeground", "mfg", "Mfg", "mutedText", "MutedText" }, foreground);
            var accent = CssValue(preset, new[] { "accent", "Accent", "s", "S" }, primary);
            var border = CssValue(preset, new[] { "border", "Border", "b", "B" }, accent);

            if (string.IsNullOrWhiteSpace(background) && string.IsNullOrWhiteSpace(primary) && string.IsNullOrWhiteSpace(foreground))
                return string.Empty;

            var selectors = NormalizeSelectors(scopeSelector);
            if (selectors.Count == 0) return string.Empty;

            var css = new StringBuilder();
            css.Append("/* ").Append(Badge).Append(" */");
            css.Append(string.Join(",", selectors.ToArray()));
            css.Append('{');
            AppendVar(css, "--background", background);
            AppendVar(css, "--foreground", foreground);
            AppendVar(css, "--card", card);
            AppendVar(css, "--card-foreground", foreground);
            AppendVar(css, "--primary", primary);
            AppendVar(css, "--primary-foreground", primaryForeground);
            AppendVar(css, "--secondary", secondary);
            AppendVar(css, "--secondary-foreground", foreground);
            AppendVar(css, "--muted", muted);
            AppendVar(css, "--muted-foreground", mutedForeground);
            AppendVar(css, "--accent", accent);
            AppendVar(css, "--accent-foreground", foreground);
            AppendVar(css, "--border", border);
            AppendVar(css, "--input", muted);
            AppendVar(css, "--ring", primary);
            AppendVar(css, "--mf-primary", primary);
            AppendVar(css, "--mf-primary-hover", primary);
            AppendVar(css, "--mf-primary-light", accent);
            AppendVar(css, "--mf-secondary", secondary);
            AppendVar(css, "--mf-form-bg", card);
            AppendVar(css, "--mf-input-bg", card);
            AppendVar(css, "--mf-text", foreground);
            AppendVar(css, "--mf-label-color", foreground);
            AppendVar(css, "--mf-title-color", foreground);
            AppendVar(css, "--mf-border", border);
            AppendVar(css, "--mf-input-border-color", border);
            AppendVar(css, "--mf-btn-bg", primary);
            AppendVar(css, "--mf-btn-bg-hover", primary);
            AppendVar(css, "--mf-btn-hover-bg", primary);
            AppendVar(css, "--mf-btn-color", primaryForeground);
            AppendVar(css, "--mf-btn-text", primaryForeground);
            AppendVar(css, "--mf-color-text-inverse", primaryForeground);
            AppendVar(css, "--mfp-primary", primary);
            AppendVar(css, "--mfp-primary-dark", primary);
            AppendVar(css, "--mfp-accent", accent);
            AppendVar(css, "--mfp-bg", background);
            AppendVar(css, "--mfp-card-bg", card);
            AppendVar(css, "--mfp-text", foreground);
            AppendVar(css, "--mfp-text-muted", mutedForeground);
            AppendVar(css, "--mfp-border", border);
            AppendVar(css, "--mfp-border-focus", accent);
            AppendVar(css, "--mfp-section", mutedForeground);
            AppendPremiumAliasVars(css, background, foreground, card, primary, primaryForeground, primary, accent, secondary, mutedForeground, border);
            css.Append('}');
            return css.ToString();
        }

        private static string CssValue(JObject preset, string[] names, string fallback)
        {
            var value = CssValue(preset, names);
            return !string.IsNullOrWhiteSpace(value) ? value : fallback;
        }

        private static string CssValue(JObject preset, string[] names)
        {
            if (preset == null || names == null) return string.Empty;
            for (var i = 0; i < names.Length; i++)
            {
                var token = preset[names[i]];
                var raw = token == null ? string.Empty : token.ToString();
                var safe = SanitizeCssValue(raw);
                if (!string.IsNullOrWhiteSpace(safe)) return safe;
            }
            return string.Empty;
        }

        private static void AppendVar(StringBuilder css, string name, string value)
        {
            if (css == null || string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(value)) return;
            css.Append(name).Append(':').Append(value).Append(';');
        }

        private static void AppendPremiumAliasVars(
            StringBuilder css,
            string background,
            string foreground,
            string card,
            string primary,
            string primaryForeground,
            string primaryHover,
            string accent,
            string inputBackground,
            string mutedForeground,
            string border)
        {
            AppendVar(css, "--mf-page-bg", background);
            AppendVar(css, "--mf-color-text", foreground);
            AppendVar(css, "--mf-color-text-muted", mutedForeground);
            AppendVar(css, "--mf-accent", accent);

            AppendVar(css, "--ink", foreground);
            AppendVar(css, "--paper", card);
            AppendVar(css, "--surface", card);
            AppendVar(css, "--surface-2", inputBackground);
            AppendVar(css, "--line", border);
            AppendVar(css, "--transition", "200ms");

            AppendVar(css, "--au-primary", primary);
            AppendVar(css, "--au-primary-d", primaryHover);
            AppendVar(css, "--au-soft", accent);
            AppendVar(css, "--au-ink", foreground);
            AppendVar(css, "--au-sub", mutedForeground);
            AppendVar(css, "--au-border", border);
            AppendVar(css, "--au-surface", card);

            var prefixes = new[] { "bg", "fr", "it", "aur", "nola", "hw", "ey" };
            for (var i = 0; i < prefixes.Length; i++)
            {
                var p = "--" + prefixes[i] + "-";
                AppendVar(css, p + "primary", primary);
                AppendVar(css, p + "primary-dark", primaryHover);
                AppendVar(css, p + "primary-hover", primaryHover);
                AppendVar(css, p + "accent", accent);
                AppendVar(css, p + "bg", background);
                AppendVar(css, p + "background", background);
                AppendVar(css, p + "surface", card);
                AppendVar(css, p + "card", card);
                AppendVar(css, p + "card-bg", card);
                AppendVar(css, p + "paper", card);
                AppendVar(css, p + "input-bg", inputBackground);
                AppendVar(css, p + "ink", foreground);
                AppendVar(css, p + "text", foreground);
                AppendVar(css, p + "foreground", foreground);
                AppendVar(css, p + "muted", mutedForeground);
                AppendVar(css, p + "sub", mutedForeground);
                AppendVar(css, p + "border", border);
                AppendVar(css, p + "line", border);
            }
        }

        private static string SanitizeCssValue(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            var trimmed = value.Trim();
            if (trimmed.Length > 160) trimmed = trimmed.Substring(0, 160);
            for (var i = 0; i < trimmed.Length; i++)
            {
                var ch = trimmed[i];
                var ok = char.IsLetterOrDigit(ch)
                    || ch == '#'
                    || ch == '.'
                    || ch == ','
                    || ch == '%'
                    || ch == '(' || ch == ')'
                    || ch == '-' || ch == '+'
                    || ch == '/' || ch == ':'
                    || ch == ' ';
                if (!ok) return string.Empty;
            }
            return trimmed;
        }

        private static List<string> NormalizeSelectors(string scopeSelector)
        {
            var result = new List<string>();
            if (string.IsNullOrWhiteSpace(scopeSelector)) return result;

            var parts = scopeSelector.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            for (var i = 0; i < parts.Length; i++)
            {
                var selector = parts[i] == null ? string.Empty : parts[i].Trim();
                if (string.IsNullOrWhiteSpace(selector)) continue;
                if (!result.Contains(selector)) result.Add(selector);
            }
            return result;
        }

        private static string FirstNonEmpty(params object[] values)
        {
            if (values == null) return string.Empty;
            for (var i = 0; i < values.Length; i++)
            {
                var value = values[i];
                var text = value == null ? string.Empty : value.ToString();
                if (!string.IsNullOrWhiteSpace(text)) return text.Trim();
            }
            return string.Empty;
        }

        private static bool ReadBool(JObject source, string camel, string pascal, bool defaultValue)
        {
            if (source == null) return defaultValue;
            var token = source[camel] ?? source[pascal];
            if (token == null) return defaultValue;
            bool parsed;
            return bool.TryParse(token.ToString(), out parsed) ? parsed : defaultValue;
        }
    }
}
