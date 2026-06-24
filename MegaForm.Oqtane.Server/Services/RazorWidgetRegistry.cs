// MegaForm Razor Widget — registry
// ──────────────────────────────────────────────────────────────────────
// Scans the loaded assemblies for types annotated with [RazorTemplate(...)]
// (the .razor files under RazorWidgets/) and exposes metadata to:
//   - the Builder right-panel template picker
//   - the AI tool `list_razor_templates`
//   - the Render endpoint (resolve template name → Type)
//
// Phase 0 implementation: built-in templates only (compiled into the
// Server assembly). Phase 1 will add customer overrides via Roslyn JIT
// keyed on (templateName + sourceHash) → emit dynamic Type → register here.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Components;

namespace MegaForm.Oqtane.Server.Services
{
    public class RazorWidgetMetadata
    {
        public string  Name              { get; set; }
        public string  Category          { get; set; }
        public string  Description       { get; set; }
        public bool    EmitsValue        { get; set; }
        public string  ValueShape        { get; set; }
        public bool    SupportsSql       { get; set; }
        public bool    RequiresInteractive { get; set; }
        // [v20260601-recipe] Recipe-tier metadata
        public string  Icon              { get; set; }
        public bool    IsRecipe          { get; set; } = true;
        public string  WhenToUse         { get; set; }
        public Type    ComponentType     { get; set; }
        public List<RazorParameterInfo> Parameters { get; set; } = new();
    }

    public class RazorParameterInfo
    {
        public string Name          { get; set; }
        public string TypeName      { get; set; }
        public bool   IsRequired    { get; set; }
        public object DefaultValue  { get; set; }
        public string Description   { get; set; }
        // [v20260601-recipe] Enrichment from [RazorParam]
        public string Label         { get; set; }
        public string Hint          { get; set; }
        public string Group         { get; set; }
        public string Widget        { get; set; }   // text|number|textarea|select|sql-column|sql|color|bool
        public string Options       { get; set; }
        public string Placeholder   { get; set; }
        public int    Order         { get; set; }
    }

    public class RazorWidgetRegistry
    {
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, RazorWidgetMetadata> _templates;

        public RazorWidgetRegistry()
        {
            _templates = new System.Collections.Concurrent.ConcurrentDictionary<string, RazorWidgetMetadata>(
                ScanAssemblies(), StringComparer.OrdinalIgnoreCase);
        }

        public IReadOnlyList<RazorWidgetMetadata> List()
            => _templates.Values.OrderBy(t => t.Category).ThenBy(t => t.Name).ToList();

        public RazorWidgetMetadata Get(string name)
            => _templates.TryGetValue(name, out var t) ? t : null;

        /// <summary>
        /// Replace (or add) a template at runtime — used by
        /// RazorCompilationService after a customer Override compiles.
        /// </summary>
        public void Override(RazorWidgetMetadata meta)
        {
            if (meta == null || string.IsNullOrEmpty(meta.Name)) return;
            _templates[meta.Name] = meta;
        }

        // Exposed so RazorCompilationService can build the same parameter
        // shape the built-in scan produces.
        public static List<RazorParameterInfo> ExtractParametersPublic(Type t) => ExtractParameters(t);

        private Dictionary<string, RazorWidgetMetadata> ScanAssemblies()
        {
            var map = new Dictionary<string, RazorWidgetMetadata>(StringComparer.OrdinalIgnoreCase);
            // Scan all loaded assemblies for [RazorTemplate(...)] attributed types.
            // The .razor compiler emits these as IComponent classes at build time.
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = asm.GetTypes(); }
                catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
                catch { continue; }

                foreach (var t in types)
                {
                    if (t == null) continue;
                    if (!typeof(IComponent).IsAssignableFrom(t)) continue;
                    var attr = t.GetCustomAttribute<RazorTemplateAttribute>(inherit: false);
                    if (attr == null) continue;

                    var meta = new RazorWidgetMetadata
                    {
                        Name                = attr.Name,
                        Category            = attr.Category,
                        Description         = attr.Description,
                        EmitsValue          = attr.EmitsValue,
                        ValueShape          = attr.ValueShape,
                        SupportsSql         = attr.SupportsSql,
                        RequiresInteractive = attr.RequiresInteractive,
                        Icon                = attr.Icon,
                        IsRecipe            = attr.IsRecipe,
                        WhenToUse           = attr.WhenToUse,
                        ComponentType       = t,
                        Parameters          = ExtractParameters(t),
                    };
                    map[attr.Name] = meta;
                }
            }
            return map;
        }

        private static List<RazorParameterInfo> ExtractParameters(Type t)
        {
            var list = new List<RazorParameterInfo>();
            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance))
            {
                var paramAttr = p.GetCustomAttribute<ParameterAttribute>();
                if (paramAttr == null) continue;
                // Skip framework-injected parameters declared on the base class
                if (p.Name is "SqlRows" or "SqlQueries" or "WidgetKey" or "ExtraParameters") continue;

                // [v20260601-recipe] read [RazorParam] enrichment if present
                var rp = p.GetCustomAttribute<RazorParamAttribute>();
                list.Add(new RazorParameterInfo
                {
                    Name         = p.Name,
                    TypeName     = p.PropertyType.Name,
                    IsRequired   = rp?.Required ?? false,
                    DefaultValue = null,
                    Description  = rp?.Hint ?? "",
                    Label        = rp?.Label ?? p.Name,
                    Hint         = rp?.Hint ?? "",
                    Group        = rp?.Group ?? "General",
                    Widget       = rp?.Widget ?? GuessWidget(p.PropertyType),
                    Options      = rp?.Options ?? "",
                    Placeholder  = rp?.Placeholder ?? "",
                    Order        = rp?.Order ?? 100,
                });
            }
            // Stable order: Group first, then Order ascending, then Name
            list.Sort((a, b) =>
            {
                int g = string.Compare(a.Group ?? "", b.Group ?? "", StringComparison.OrdinalIgnoreCase);
                if (g != 0) return g;
                if (a.Order != b.Order) return a.Order - b.Order;
                return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
            });
            return list;
        }

        private static string GuessWidget(Type t)
        {
            var underlying = Nullable.GetUnderlyingType(t) ?? t;
            if (underlying == typeof(bool))    return "bool";
            if (underlying == typeof(int) || underlying == typeof(long) ||
                underlying == typeof(decimal) || underlying == typeof(double) ||
                underlying == typeof(float))   return "number";
            return "text";
        }
    }
}
