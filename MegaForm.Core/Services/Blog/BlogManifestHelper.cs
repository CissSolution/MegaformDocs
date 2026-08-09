using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Blog
{
    public static class BlogManifestHelper
    {
        /// <summary>
        /// Blog form ids for an app, with the app's own forms as a fallback source.
        ///
        /// 🔴 WHY THE FALLBACK EXISTS. A seeded blog-starter persists
        /// <c>ManifestJson.Forms = []</c>: the forms are attached to the app through
        /// <c>MF_Forms.AppScope</c> instead, and nothing ever fills the manifest array back in.
        /// <see cref="GetFormIdMap"/> then returns an empty map, and every caller that starts with
        /// "resolve posts + reader-events or return" — the analytics rollup, the scheduled
        /// publisher — returns 0 on its second line. Nothing logs an error, because nothing went
        /// wrong: the service simply had no work it could see. Measured on dnndefender.com
        /// 2026-08-09: 244 reader events recorded, every post still reading "0 reads", the
        /// scheduler reporting success every five minutes.
        ///
        /// The blog MODULE never noticed because its Razor surfaces already resolve the child
        /// forms defensively (by alias, then by schema fingerprint). This gives Core the same
        /// defence so the counters do not depend on a data repair having been run.
        /// </summary>
        public static Dictionary<string, int> ResolveFormIdMap(AppDefinitionInfo app, IFormRepository forms)
        {
            var map = GetFormIdMap(app);
            if (app == null || forms == null)
                return map;

            var wanted = new[] { "posts", "categories", "comments", "reader-events" };
            if (wanted.All(map.ContainsKey))
                return map;

            List<FormInfo> portalForms;
            try
            {
                // An explicit bound rather than the pageSize:0 "no limit" convention — that one is
                // honoured by the EF repositories and clamped by the DNN adapter, but a plain
                // IFormRepository is free to read it as Take(0) and hand back nothing.
                portalForms = forms.ListForms(app.PortalId, pageSize: 1000) ?? new List<FormInfo>();
            }
            catch
            {
                return map;   // never let a form-list failure break the caller's own work
            }

            var scope = (app.AppScope ?? string.Empty).Trim();
            var candidates = string.IsNullOrWhiteSpace(scope)
                ? new List<FormInfo>()
                : portalForms.Where(f => f != null
                        && string.Equals((f.AppScope ?? string.Empty).Trim(), scope, StringComparison.OrdinalIgnoreCase))
                    .ToList();

            // An install that never set AppScope still has the four seeded titles.
            if (candidates.Count == 0)
            {
                candidates = portalForms
                    .Where(f => f != null && (f.Title ?? string.Empty)
                        .IndexOf("blog", StringComparison.OrdinalIgnoreCase) >= 0)
                    .ToList();
            }

            foreach (var form in candidates.OrderBy(f => f.FormId))
            {
                var key = InferKeyFromTitle(form.Title);
                if (key == null || map.ContainsKey(key))
                    continue;                      // an explicit manifest binding always wins
                map[key] = form.FormId;
            }

            return map;
        }

        /// <summary>
        /// Title → blog form key. Order is load-bearing: "Blog Reader Events" and "Blog Comments"
        /// both contain "blog", so the specific child forms must be tested before the catch-all
        /// posts match, or all four would resolve to "posts".
        /// </summary>
        private static string InferKeyFromTitle(string title)
        {
            var text = (title ?? string.Empty).ToLowerInvariant();
            if (text.Length == 0) return null;
            if (text.Contains("reader") || text.Contains("event")) return "reader-events";
            if (text.Contains("comment")) return "comments";
            if (text.Contains("categor")) return "categories";
            if (text.Contains("publishing") || text.Contains("post") || text.Contains("article")
                || text.Contains("blog") || text.Contains("news")) return "posts";
            return null;
        }

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
