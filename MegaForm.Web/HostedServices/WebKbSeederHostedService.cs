using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.HostedServices
{
    /// <summary>
    /// [WebKbSeeder v20260710] First-run AI Knowledge Base seeder for the
    /// standalone Web host. Imports bundled entries/templates/rules when the
    /// KB table is empty. Mirrors Oqtane's OqtaneKbSeederHostedService.
    /// </summary>
    public class WebKbSeederHostedService : IHostedService
    {
        private const string ResourceName = "MegaForm.Web.Seed.ai-knowledge-seed.json";
        private readonly IServiceProvider _services;
        private readonly ILogger<WebKbSeederHostedService> _logger;

        public WebKbSeederHostedService(IServiceProvider services, ILogger<WebKbSeederHostedService> logger)
        {
            _services = services;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _ = Task.Run(async () =>
            {
                try { await SeedIfEmptyAsync(cancellationToken); }
                catch (Exception ex) { _logger.LogError(ex, "[KbSeeder] Seed failed"); }
            }, cancellationToken);
            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        private async Task SeedIfEmptyAsync(CancellationToken ct)
        {
            await Task.Delay(TimeSpan.FromSeconds(5), ct);
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            try
            {
                if (await db.AiKnowledgeEntries.AsNoTracking().AnyAsync(ct)) return;
                SeedEntries(db, _logger);
            }
            catch (Exception ex)
            {
                _logger.LogInformation("[KbSeeder] startup seed deferred ({Reason})", ex.GetType().Name);
            }
        }

        public static void SeedEntries(MegaFormDbContext ctx, ILogger logger)
        {
            var asm = typeof(WebKbSeederHostedService).Assembly;
            using var stream = asm.GetManifestResourceStream(ResourceName);
            if (stream == null)
            {
                logger?.LogWarning("[KbSeeder] Resource {Resource} not found in assembly", ResourceName);
                return;
            }
            string json;
            using (var reader = new StreamReader(stream)) json = reader.ReadToEnd();
            if (string.IsNullOrWhiteSpace(json))
            {
                logger?.LogWarning("[KbSeeder] Empty seed JSON");
                return;
            }

            JObject root;
            try { root = JObject.Parse(json); }
            catch (Exception ex)
            {
                logger?.LogError(ex, "[KbSeeder] Parse seed JSON failed");
                return;
            }

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
                    Examples = (string)jt["Examples"] ?? string.Empty,
                    PortalId = jt["PortalId"]?.Type == JTokenType.Null ? (int?)null : (int?)jt["PortalId"],
                    Source = (string)jt["Source"] ?? "megaform-builtin",
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
