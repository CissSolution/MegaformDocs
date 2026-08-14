using System;
using System.Collections.Generic;
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
    /// Fail-soft by design: any problem here must never break a KB read. But fail-soft is not
    /// the same as fail-SILENT — see <see cref="LastRun"/>: every outcome, including the boring
    /// ones, is recorded so an admin can be told why the KB looks the way it does.
    /// </summary>
    internal static class DnnKbSeeder
    {
        private const string SeedRelativePath = "~/DesktopModules/MegaForm/Seed/ai-knowledge-seed.json";

        /// <summary>Hard ceiling on the catch-up read. The shipped seed is ~330 rows and a site
        /// that has pulled template knowledge from the gallery adds one or two per template, so
        /// this is far above any real store while still refusing to materialise an unbounded one.</summary>
        private const int MaxCatchUpRead = 5000;

        /// <summary>
        /// [KbSeedRetry v20260812] Attempts made in this app domain. This used to be a one-shot
        /// flag SET BEFORE any work, so a seed that failed for a transient reason (database not
        /// reachable yet on a cold start, file still being written by the installer) was never
        /// retried — the site simply ran without knowledge until someone recycled the app pool.
        /// A failed attempt may now be retried, a successful one never is.
        /// </summary>
        private static int _attempts;
        private const int MaxAttempts = 3;

        /// <summary>
        /// [KbSeedVisibility v20260812] What the last (and only) seed attempt did, in this app
        /// domain. Read by the KB status endpoint so "the AI has no knowledge" stops being a
        /// mystery an admin can only diagnose by reading the DNN event log.
        /// </summary>
        internal sealed class SeedOutcome
        {
            public bool Ran;
            public bool Succeeded;
            public int Merged;
            public int MissingBefore;
            public int SeedTotal;
            public string Message;
        }

        private static volatile SeedOutcome _lastRun =
            new SeedOutcome { Message = "The knowledge seeder has not run yet in this application." };

        internal static SeedOutcome LastRun => _lastRun;

        /// <summary>Merges the bundled seed once per app domain, for whatever it is MISSING.</summary>
        internal static void EnsureSeeded(IAiKnowledgeService svc)
        {
            if (svc == null) return;
            // A run that reached a definite answer — merged, or found nothing missing — is final.
            var last = _lastRun;
            if (last.Ran && last.Succeeded) return;
            // Two threads can still enter together on a cold start; the merger upserts by slug, so
            // the worst case is duplicated work, never duplicated rows.
            if (Interlocked.Increment(ref _attempts) > MaxAttempts) return;

            try
            {
                var path = ResolveSeedPath();
                if (path == null)
                {
                    Record(false, 0, 0, 0, "The bundled seed file is not installed at "
                        + SeedRelativePath + " — the KB has only what the SQL scripts created.");
                    return;
                }

                var json = File.ReadAllText(path);
                var seedSlugs = ReadSeedSlugs(json);
                if (seedSlugs.Count == 0)
                {
                    Record(false, 0, 0, 0, "The bundled seed file carries no entries.");
                    return;
                }

                // [KbSeedGate v20260812] This used to compare COUNTS: "store has >= seed count →
                // nothing to do". That gate is wrong in both directions, and the second one is
                // silent and permanent:
                //   - knowledge now also arrives PER TEMPLATE from the gallery, so a site can hold
                //     more rows than the seed while still missing seeded rows entirely;
                //   - the shipped seed got SMALLER when template knowledge moved to the gallery,
                //     so any site above the new total would skip the seeder for good and never
                //     receive a single new widget/rule from any future upgrade.
                // Compare by SLUG instead: merge whenever the store is missing something the
                // package ships, regardless of how many other rows it has.
                var existing = new HashSet<string>(
                    svc.ListEntries(null, null, null, MaxCatchUpRead)
                       .Select(e => (e?.Slug ?? string.Empty).Trim())
                       .Where(s => s.Length > 0),
                    StringComparer.OrdinalIgnoreCase);

                var missing = seedSlugs.Count(s => !existing.Contains(s));
                if (missing == 0)
                {
                    Record(true, 0, 0, seedSlugs.Count,
                        "Up to date — all " + seedSlugs.Count + " bundled knowledge entries are already installed.");
                    return;
                }

                var result = AiKnowledgeSeedMerger.Merge(json, svc, null);

                // A merge that wrote nothing while rows were missing is a FAILURE. The merger
                // collects per-row errors instead of throwing, so without this test a completely
                // failed import would still look like a successful run.
                var ok = result.Entries > 0;
                Record(ok, result.Entries, missing, seedSlugs.Count,
                    ok ? result.Summary + " (" + missing + " of " + seedSlugs.Count + " entries were missing)"
                       : "Could not write any of the " + missing + " missing knowledge entries"
                         + (result.Errors.Count > 0 ? " (" + result.Errors.Count + " row error(s))" : string.Empty) + ".");

                DotNetNuke.Services.Exceptions.Exceptions.LogException(
                    new ApplicationException("[MegaForm KbSeed] " + _lastRun.Message));
            }
            catch (Exception ex)
            {
                // The reason never reaches the client (SECURITY_CODING_RULES §10) — the status
                // surface gets a generic line, the event log gets the exception.
                Record(false, 0, 0, 0, "The knowledge seeder failed; see the DNN event log for details.");
                try { DotNetNuke.Services.Exceptions.Exceptions.LogException(ex); } catch { /* ignore */ }
            }
        }

        private static void Record(bool ok, int merged, int missing, int total, string message)
        {
            _lastRun = new SeedOutcome
            {
                Ran = true,
                Succeeded = ok,
                Merged = merged,
                MissingBefore = missing,
                SeedTotal = total,
                Message = message,
            };
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

        /// <summary>Slugs the bundled seed claims to install. Empty on any parse problem — the
        /// caller then reports "no entries" rather than merging a file it could not read.</summary>
        private static System.Collections.Generic.List<string> ReadSeedSlugs(string json)
        {
            var slugs = new System.Collections.Generic.List<string>();
            try
            {
                var arr = JObject.Parse(json)["entries"] as JArray;
                if (arr == null) return slugs;
                foreach (var jt in arr)
                {
                    var slug = ((string)jt["Slug"] ?? string.Empty).Trim();
                    if (slug.Length > 0) slugs.Add(slug);
                }
            }
            catch
            {
                slugs.Clear();
            }
            return slugs;
        }
    }
}
