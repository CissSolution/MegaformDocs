using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Blog
{
    public static class BlogManifestHelper
    {
        public static Dictionary<string, int> GetFormIdMap(AppDefinitionInfo app)
        {
            var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            if (app == null || string.IsNullOrWhiteSpace(app.ManifestJson))
                return map;

            try
            {
                var manifest = JsonConvert.DeserializeObject<AppManifestDefinition>(app.ManifestJson);
                if (manifest?.Forms != null)
                {
                    foreach (var formRef in manifest.Forms.Where(f => f != null && f.FormId > 0))
                    {
                        var key = ResolveKey(formRef);
                        if (!string.IsNullOrWhiteSpace(key))
                            map[key] = formRef.FormId;
                    }
                }
            }
            catch
            {
                // ignore parse errors
            }

            return map;
        }

        public static int? GetFormIdByKey(AppDefinitionInfo app, string key)
        {
            var map = GetFormIdMap(app);
            return map.TryGetValue(key, out var formId) ? formId : (int?)null;
        }

        private static string ResolveKey(AppManifestFormRef formRef)
        {
            var alias = (formRef.Alias ?? string.Empty).Trim().ToLowerInvariant();

            // Exact alias match for known blog keys
            if (alias == "posts" || alias == "categories" || alias == "comments" || alias == "reader-events")
                return alias;

            // Infer from title / role
            var title = (formRef.Title ?? string.Empty).ToLowerInvariant();
            if (formRef.IsPrimary || formRef.Role == "primary" || title.Contains("post") || title.Contains("publishing"))
                return "posts";
            if (title.Contains("category"))
                return "categories";
            if (title.Contains("comment"))
                return "comments";
            if (title.Contains("reader") || title.Contains("event"))
                return "reader-events";

            // If alias looks like a known key variant, normalize it
            if (alias.Contains("post") || alias.Contains("publishing"))
                return "posts";
            if (alias.Contains("category"))
                return "categories";
            if (alias.Contains("comment"))
                return "comments";
            if (alias.Contains("reader") || alias.Contains("event"))
                return "reader-events";

            return null;
        }
    }
}
