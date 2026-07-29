using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Web.Hosting;
using MegaForm.Core.Services.AiKnowledge;
using Newtonsoft.Json.Linq;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// [KbSeedParity 2026-07-29] First-use KB seeder for DNN.
    ///
    /// Before this, DNN was the only platform whose knowledge base came from the
    /// <c>SqlScripts\01.06.*.SqlDataProvider</c> inserts — a frozen subset — while
    /// Oqtane / Web / Umbraco all import the canonical <c>ai-knowledge-seed.json</c>
    /// through their own first-run seeders. A clean DNN install therefore came up with
    /// 64 entries / 40 rules / 17 templates against the seed's 329 / 61 / 34, and nothing
    /// ever topped it up at runtime (verified on the 2026-07-28 clean-install QA).
    ///
    /// The seed file now ships inside the module package at
    /// <c>DesktopModules/MegaForm/Seed/ai-knowledge-seed.json</c> and is merged in on the
    /// first KB read through the shared <see cref="AiKnowledgeSeedMerger"/> — the same
    /// import logic the gallery sync channel uses, so built-in rows are UPSERTED (keyed on
    /// slug / (knowledgeId,templateKey) / ruleId) and running it twice is idempotent.
    ///
    /// Fail-soft by design: any problem here must never break a KB read, so every failure
    /// is swallowed and the seeder simply does not run again in this app domain.
    /// </summary>
    internal static class DnnKbSeeder
    {
        private const string SeedRelativePath = "~/DesktopModules/MegaForm/Seed/ai-knowledge-seed.json";

        private static int _attempted;

        /// <summary>Merges the bundled seed once per app domain when the store is behind it.</summary>
        internal static void EnsureSeeded(IAiKnowledgeService svc)
        {
            if (svc == null) return;
            if (Interlocked.CompareExchange(ref _attempted, 1, 0) != 0) return;

            try
            {
                var path = ResolveSeedPath();
                if (path == null) return;

                var json = File.ReadAllText(path);
                var seedEntryCount = CountSeedEntries(json);
                if (seedEntryCount <= 0) return;

                // Cheap catch-up test: only merge while the store is behind the shipped seed.
                // Bounded read — never materialise the whole KB just to count it.
                var existing = svc.ListEntries(null, null, null, seedEntryCount).Count();
                if (existing >= seedEntryCount) return;

                var result = AiKnowledgeSeedMerger.Merge(json, svc, null);
                DotNetNuke.Services.Exceptions.Exceptions.LogException(
                    new ApplicationException("[MegaForm KbSeed] " + result.Summary
                        + " (store had " + existing + " of " + seedEntryCount + " entries)"));
            }
            catch (Exception ex)
            {
                try { DotNetNuke.Services.Exceptions.Exceptions.LogException(ex); } catch { /* ignore */ }
            }
        }

        private static string ResolveSeedPath()
        {
            try
            {
                var mapped = HostingEnvironment.MapPath(SeedRelativePath);
                return !string.IsNullOrEmpty(mapped) && File.Exists(mapped) ? mapped : null;
            }
            catch
            {
                return null;
            }
        }

        private static int CountSeedEntries(string json)
        {
            try
            {
                var arr = JObject.Parse(json)["entries"] as JArray;
                return arr?.Count ?? 0;
            }
            catch
            {
                return 0;
            }
        }
    }
}
