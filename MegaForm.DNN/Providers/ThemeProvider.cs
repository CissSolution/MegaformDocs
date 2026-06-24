using System.Collections.Generic;
using Newtonsoft.Json;

namespace MegaForm.DNN.Providers
{
    /// <summary>
    /// Pre-built theme definitions.
    /// Themes are stored as ThemeJson in MF_Forms — the CSS class name is applied
    /// to .mf-form-wrapper, and optional variable overrides live in ThemeJson for
    /// custom themes created in the builder.
    /// </summary>
    public static class ThemeProvider
    {
        /// <summary>
        /// Returns all built-in themes available in the form builder.
        /// </summary>
        public static List<ThemeDefinition> GetBuiltInThemes()
        {
            return new List<ThemeDefinition>
            {
                new ThemeDefinition
                {
                    Id = "default",
                    Name = "Default",
                    Description = "Clean professional look with blue accents",
                    Category = "Standard",
                    CssClass = "mf-theme-default",
                    Preview = new ThemePreviewColors { Primary = "#4a90d9", FormBg = "#ffffff", PageBg = "#f5f5f5", Text = "#333333" },
                    FontFamily = "Inter, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "minimal",
                    Name = "Minimal",
                    Description = "Ultra-clean design with borderless inputs and underline focus",
                    Category = "Standard",
                    CssClass = "mf-theme-minimal",
                    Preview = new ThemePreviewColors { Primary = "#1a1a1a", FormBg = "#ffffff", PageBg = "#ffffff", Text = "#1a1a1a" },
                    FontFamily = "Inter, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "modern-blue",
                    Name = "Modern Blue",
                    Description = "Bold corporate design with gradient background and rounded cards",
                    Category = "Professional",
                    CssClass = "mf-theme-modern-blue",
                    Preview = new ThemePreviewColors { Primary = "#667eea", FormBg = "#ffffff", PageBg = "#667eea", Text = "#2d3748" },
                    FontFamily = "Inter, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "warm-sunset",
                    Name = "Warm Sunset",
                    Description = "Friendly orange tones — great for community & non-profit forms",
                    Category = "Colorful",
                    CssClass = "mf-theme-warm-sunset",
                    Preview = new ThemePreviewColors { Primary = "#ff6b35", FormBg = "#ffffff", PageBg = "#fff8f0", Text = "#2d1b0e" },
                    FontFamily = "Nunito, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "dark-elegance",
                    Name = "Dark Elegance",
                    Description = "Modern dark mode with red accents — sleek and dramatic",
                    Category = "Dark",
                    CssClass = "mf-theme-dark-elegance",
                    Preview = new ThemePreviewColors { Primary = "#e94560", FormBg = "#1a1a2e", PageBg = "#0f0f0f", Text = "#e0e0e0" },
                    FontFamily = "Inter, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "nature-green",
                    Name = "Nature Green",
                    Description = "Eco-friendly design with green tones and pill-shaped buttons",
                    Category = "Colorful",
                    CssClass = "mf-theme-nature-green",
                    Preview = new ThemePreviewColors { Primary = "#2d8a4e", FormBg = "#ffffff", PageBg = "#f0f7f0", Text = "#1b5e20" },
                    FontFamily = "Nunito, serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "flat-material",
                    Name = "Flat Material",
                    Description = "Google Material Design-inspired with filled inputs and underline focus",
                    Category = "Standard",
                    CssClass = "mf-theme-flat-material",
                    Preview = new ThemePreviewColors { Primary = "#1976d2", FormBg = "#ffffff", PageBg = "#fafafa", Text = "#212121" },
                    FontFamily = "Roboto, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "classic-formal",
                    Name = "Classic Formal",
                    Description = "Traditional serif typography — perfect for legal, government, or academic forms",
                    Category = "Professional",
                    CssClass = "mf-theme-classic-formal",
                    Preview = new ThemePreviewColors { Primary = "#8b4513", FormBg = "#ffffff", PageBg = "#f8f4ef", Text = "#3e2723" },
                    FontFamily = "Georgia, serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "playful",
                    Name = "Playful",
                    Description = "Rounded, colorful, and friendly — great for events, surveys, and schools",
                    Category = "Colorful",
                    CssClass = "mf-theme-playful",
                    Preview = new ThemePreviewColors { Primary = "#ff6b6b", FormBg = "#ffffff", PageBg = "#ffecd2", Text = "#333333" },
                    FontFamily = "Nunito, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "healthcare",
                    Name = "Healthcare",
                    Description = "Clean and trustworthy — designed for medical and health intake forms",
                    Category = "Industry",
                    CssClass = "mf-theme-healthcare",
                    Preview = new ThemePreviewColors { Primary = "#0077b6", FormBg = "#ffffff", PageBg = "#f0f8ff", Text = "#003f5c" },
                    FontFamily = "Open Sans, sans-serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "executive",
                    Name = "Executive",
                    Description = "Premium dark theme with gold accents — luxury and high-end feel",
                    Category = "Dark",
                    CssClass = "mf-theme-executive",
                    Preview = new ThemePreviewColors { Primary = "#c9a84c", FormBg = "#2a2a2a", PageBg = "#1c1c1c", Text = "#e8e0d0" },
                    FontFamily = "Playfair Display, serif",
                    IsBuiltIn = true
                },
                new ThemeDefinition
                {
                    Id = "tech-startup",
                    Name = "Tech Startup",
                    Description = "Cyberpunk-inspired dark theme with neon green — for tech and SaaS products",
                    Category = "Dark",
                    CssClass = "mf-theme-tech-startup",
                    Preview = new ThemePreviewColors { Primary = "#38ef7d", FormBg = "#141432", PageBg = "#0a0a23", Text = "#d0d0e0" },
                    FontFamily = "JetBrains Mono, monospace",
                    IsBuiltIn = true
                }
            };
        }

        /// <summary>
        /// Build a ThemeJson string for storing a selected built-in theme.
        /// </summary>
        public static string BuildThemeJson(string themeId)
        {
            var themes = GetBuiltInThemes();
            var theme = themes.Find(t => t.Id == themeId);
            if (theme == null) return null;

            return JsonConvert.SerializeObject(new
            {
                themeId = theme.Id,
                cssClass = theme.CssClass,
                fontFamily = theme.FontFamily,
                isBuiltIn = true
            });
        }

        /// <summary>
        /// Build a ThemeJson string for a fully custom theme (from builder designer).
        /// </summary>
        public static string BuildCustomThemeJson(Dictionary<string, string> cssVariables, string customCss = null)
        {
            return JsonConvert.SerializeObject(new
            {
                themeId = "custom",
                cssClass = "",
                isBuiltIn = false,
                variables = cssVariables,
                customCss = customCss
            });
        }
    }

    public class ThemeDefinition
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("category")]
        public string Category { get; set; }   // Standard, Professional, Colorful, Dark, Industry

        [JsonProperty("cssClass")]
        public string CssClass { get; set; }   // applied to .mf-form-wrapper

        [JsonProperty("preview")]
        public ThemePreviewColors Preview { get; set; }

        [JsonProperty("fontFamily")]
        public string FontFamily { get; set; }

        [JsonProperty("isBuiltIn")]
        public bool IsBuiltIn { get; set; }
    }

    public class ThemePreviewColors
    {
        [JsonProperty("primary")]
        public string Primary { get; set; }

        [JsonProperty("formBg")]
        public string FormBg { get; set; }

        [JsonProperty("pageBg")]
        public string PageBg { get; set; }

        [JsonProperty("text")]
        public string Text { get; set; }
    }
}
