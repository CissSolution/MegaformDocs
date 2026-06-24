using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// First-run KB seeder. Imports the canonical entries + templates + rules from
    /// the bundled <c>Seed/ai-knowledge-seed.json</c> embedded resource into
    /// MF_AI_Knowledge when it is empty.
    ///
    /// IMPORTANT (Oqtane): <see cref="MegaFormDbContext"/> derives from Oqtane's
    /// <c>DBContextBase</c>, whose provider/connection is resolved PER-REQUEST from
    /// <c>IDBContextDependencies</c> (the active tenant). At host startup there is no
    /// request scope, so a DbContext created here has NO provider and any query throws
    /// "No database provider has been configured". That is why the startup probe below
    /// almost always no-ops on Oqtane. The ACTUAL seed path is the LAZY call from
    /// <c>OqtaneAiKnowledgeService.EnsureSeeded()</c>, which runs <see cref="SeedEntries"/>
    /// on the first KB request — inside a real request scope where the tenant connection
    /// IS resolved. The static method is shared so both paths use identical import logic.
    /// </summary>
    public class OqtaneKbSeederHostedService : IHostedService
    {
        private const string ResourceName = "MegaForm.Oqtane.Server.Seed.ai-knowledge-seed.json";
        private readonly IServiceProvider _services;
        private readonly ILogger<OqtaneKbSeederHostedService> _logger;

        public OqtaneKbSeederHostedService(IServiceProvider services, ILogger<OqtaneKbSeederHostedService> logger)
        {
            _services = services;
            _logger = logger;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            // Run as a Task so a failure here never crashes the Oqtane host.
            _ = Task.Run(async () =>
            {
                try { await SeedIfEmptyAsync(cancellationToken); }
                catch (Exception ex) { _logger.LogError(ex, "[KbSeeder] Seed failed"); }
            }, cancellationToken);
            await Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        private async Task SeedIfEmptyAsync(CancellationToken ct)
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            using var scope = _services.CreateScope();
            var factory = scope.ServiceProvider.GetService<IDbContextFactory<MegaFormDbContext>>();
            if (factory == null) { _logger.LogWarning("[KbSeeder] No DbContextFactory; skipping seed"); return; }
            using var ctx = factory.CreateDbContext();
            try
            {
                // On Oqtane this query usually throws (no tenant provider at startup) — that's
                // expected; the lazy seed in OqtaneAiKnowledgeService handles it on first request.
                if (await ctx.AiKnowledgeEntries.AsNoTracking().AnyAsync(ct)) return;
                SeedEntries(ctx, _logger);
            }
            catch (Exception ex)
            {
                _logger.LogInformation("[KbSeeder] startup seed deferred ({Reason}); the lazy seed will run on the first KB request", ex.GetType().Name);
            }
        }

        /// <summary>
        /// Imports the bundled seed JSON into the given context. The caller MUST pass a
        /// ctx with a resolved provider (i.e. created inside a request scope on Oqtane)
        /// and is responsible for the "is the table already populated?" check.
        /// </summary>
        public static void SeedEntries(MegaFormDbContext ctx, ILogger logger)
        {
            var asm = typeof(OqtaneKbSeederHostedService).Assembly;
            using var stream = asm.GetManifestResourceStream(ResourceName);
            if (stream == null) { logger?.LogWarning("[KbSeeder] Resource {Resource} not found in assembly", ResourceName); return; }
            string json;
            using (var reader = new StreamReader(stream)) json = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(json)) { logger?.LogWarning("[KbSeeder] Empty seed JSON"); return; }

            JObject root;
            try { root = JObject.Parse(json); }
            catch (Exception ex) { logger?.LogError(ex, "[KbSeeder] Parse seed JSON failed"); return; }

            var slugToId = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var entryCount = 0;
            foreach (var jt in (root["entries"] as JArray) ?? new JArray())
            {
                ctx.AiKnowledgeEntries.Add(new AiKnowledgeEntry
                {
                    Slug = (string)jt["Slug"],
                    Kind = (string)jt["Kind"],
                    Title = (string)jt["Title"] ?? string.Empty,
                    Summary = (string)jt["Summary"] ?? string.Empty,
                    Body = (string)jt["Body"] ?? string.Empty,
                    Tags = (string)jt["Tags"] ?? string.Empty,
                    // SQLite (model-created) table has these as NOT NULL even though the
                    // migration marks them nullable — coalesce so 109 examples-less rows seed.
                    Examples = (string)jt["Examples"] ?? string.Empty,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    // B53 widget-scoped columns — NOT NULL in the model-created table; the seed
                    // JSON predates them so default to empty (entries are global, not widget-scoped).
                    WidgetType = (string)jt["WidgetType"] ?? string.Empty,
                    Surface = (string)jt["Surface"] ?? string.Empty,
                    Version = (int?)jt["Version"] ?? 1,
                    CreatedOnDate = DateTime.UtcNow,
                });
                entryCount++;
            }
            ctx.SaveChanges();

            foreach (var e in ctx.AiKnowledgeEntries.AsNoTracking().Where(x => x.Source == "megaform-builtin"))
                slugToId[e.Slug] = e.Id;

            var templateCount = 0;
            foreach (var jt in (root["templates"] as JArray) ?? new JArray())
            {
                var slug = (string)jt["KnowledgeSlug"];
                if (string.IsNullOrEmpty(slug) || !slugToId.TryGetValue(slug, out var kid)) continue;
                ctx.KbTemplates.Add(new KbTemplate
                {
                    KnowledgeId = kid,
                    TemplateKey = (string)jt["TemplateKey"],
                    Kind = (string)jt["Kind"],
                    Title = (string)jt["Title"] ?? string.Empty,
                    Summary = (string)jt["Summary"] ?? string.Empty,
                    Body = (string)jt["Body"] ?? string.Empty,
                    Tags = (string)jt["Tags"] ?? string.Empty,
                    Score = (int?)jt["Score"] ?? 0,
                    SortOrder = (int?)jt["SortOrder"] ?? 100,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    Version = (int?)jt["Version"] ?? 1,
                    CreatedOnDate = DateTime.UtcNow,
                });
                templateCount++;
            }

            var ruleCount = 0;
            foreach (var jt in (root["rules"] as JArray) ?? new JArray())
            {
                var slug = (string)jt["KnowledgeSlug"];
                int? kid = !string.IsNullOrEmpty(slug) && slugToId.TryGetValue(slug, out var k) ? (int?)k : null;
                ctx.KbRules.Add(new KbRule
                {
                    RuleId = (string)jt["RuleId"],
                    KnowledgeId = kid,
                    WidgetType = (string)jt["WidgetType"] ?? string.Empty,
                    Title = (string)jt["Title"] ?? string.Empty,
                    Severity = (string)jt["Severity"] ?? string.Empty,
                    Condition = (string)jt["Condition"] ?? string.Empty,
                    RegexPattern = (string)jt["RegexPattern"] ?? string.Empty,
                    RejectionMessage = (string)jt["RejectionMessage"] ?? string.Empty,
                    FixHint = (string)jt["FixHint"] ?? string.Empty,
                    Source = (string)jt["Source"] ?? "megaform-builtin",
                    Version = (int?)jt["Version"] ?? 1,
                    Enabled = jt["Enabled"]?.Type == JTokenType.Boolean ? (bool)jt["Enabled"] : true,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    CreatedOnDate = DateTime.UtcNow,
                });
                ruleCount++;
            }
            ctx.SaveChanges();
            logger?.LogInformation("[KbSeeder] Imported {EntryCount} entries, {TemplateCount} templates, {RuleCount} rules", entryCount, templateCount, ruleCount);
        }
    }
}
