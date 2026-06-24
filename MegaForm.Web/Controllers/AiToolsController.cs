using System;
using System.Collections.Generic;
using System.Data.Common;
using System.IO;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// MegaForm AI tool surface for ASP.NET Core hosts.
    /// Mirrors Oqtane/DNN: Kinds, Knowledge, Widgets, GetWidgetBundle, LogFeedback,
    /// SQL schema tools (SqlTables/SqlColumns/PreviewSql/DryRunValidate/ExecuteDdl/DbProvider/ProposeTableSchema).
    /// </summary>
    [Route("api/[controller]")]
    [Route("DesktopModules/MegaForm/API/[controller]")]
    [IgnoreAntiforgeryToken]
    [Authorize(Roles = "Administrator")]
    public class AiToolsController : ControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly IConnectionRegistry _connectionRegistry;
        private readonly IFormRepository _formRepo;
        private readonly IPlatformContext _platform;
        private readonly IWebHostEnvironment _env;

        public AiToolsController(IAiKnowledgeService svc, IConnectionRegistry connectionRegistry, IFormRepository formRepo, IPlatformContext platform, IWebHostEnvironment env)
        {
            _svc = svc;
            _connectionRegistry = connectionRegistry;
            _formRepo = formRepo;
            _platform = platform;
            _env = env;
        }

        private DbConnection OpenDashboardConnection()
        {
            var conn = _connectionRegistry.GetConnection("DashboardDatabase");
            conn.Open();
            return conn;
        }

        private int SiteId => _platform?.PortalId > 0 ? _platform.PortalId : 0;
        private int CurrentUserId => _platform?.UserId > 0 ? _platform.UserId : -1;

        [HttpGet("Kinds")]
        public IActionResult Kinds() => Ok(new { kinds = _svc.ListKinds(SiteId) });

        [HttpGet("SqlTables")]
        public IActionResult SqlTables(string search = null, int top = 200)
        {
            try
            {
                using var conn = OpenDashboardConnection();
                var all = MegaForm.Core.Services.Subform.SqlSchemaReader.ListTables(conn);
                IEnumerable<MegaForm.Core.Services.Subform.SubformTableInfo> q = all;
                if (!string.IsNullOrWhiteSpace(search))
                    q = q.Where(t => (t.Name ?? string.Empty).IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0);
                var list = q.Take(Math.Max(1, Math.Min(top, 500))).Select(t => new { schema = t.Schema, name = t.Name }).ToList();
                return Ok(new { count = list.Count, tables = list });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("SqlColumns")]
        public IActionResult SqlColumns(string table)
        {
            if (string.IsNullOrWhiteSpace(table)) return BadRequest(new { error = "table required" });
            if (table.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid table" });
            try
            {
                using var conn = OpenDashboardConnection();
                var cols = MegaForm.Core.Services.Subform.SqlSchemaReader.ListColumns(conn, table)
                    .Select(c => new { name = c.Name, dataType = c.DataType, nullable = c.Nullable, isPrimary = c.IsPrimary, uiType = c.UiType }).ToList();
                return Ok(new { table, count = cols.Count, columns = cols });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("PreviewSql")]
        public IActionResult PreviewSql([FromBody] System.Text.Json.JsonElement body)
        {
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object) return BadRequest(new { error = "body required" });
            var sql = JStr(body, "sql");
            if (string.IsNullOrWhiteSpace(sql)) return BadRequest(new { error = "sql required" });
            var connectionKey = JStr(body, "connectionKey");
            if (string.IsNullOrWhiteSpace(connectionKey)) connectionKey = "DashboardDatabase";
            int page = JInt(body, "page", 1);
            int pageSize = JInt(body, "pageSize", 25);
            try
            {
                var svc = new MegaForm.Core.Services.DataRepeaterService(_connectionRegistry, _formRepo);
                var result = svc.ExecutePreviewSql(sql, connectionKey, null, page, pageSize, null);
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("DryRunValidate")]
        public IActionResult DryRunValidate([FromBody] System.Text.Json.JsonElement body)
        {
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object) return BadRequest(new { error = "body required" });
            var sql = JStr(body, "sql");
            if (string.IsNullOrWhiteSpace(sql)) return BadRequest(new { error = "sql required" });
            try
            {
                var rx = new System.Text.RegularExpressions.Regex(
                    @"\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|ALTER\s+TABLE|MERGE(?:\s+INTO)?|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+(?:[\[""`]?(\w+)[\]""`]?\s*\.\s*)?[\[""`]?(\w+)[\]""`]?",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var referenced = new List<string>();
                foreach (System.Text.RegularExpressions.Match m in rx.Matches(sql))
                {
                    var table = m.Groups[2].Value;
                    if (string.IsNullOrEmpty(table)) continue;
                    if (!referenced.Contains(table, StringComparer.OrdinalIgnoreCase)) referenced.Add(table);
                }
                if (referenced.Count == 0)
                    return Ok(new { ok = true, referenced = new string[0], missing = new string[0], suggestions = new Dictionary<string, string>(), message = "No table refs detected (passthrough)." });

                List<string> existing;
                using (var conn = OpenDashboardConnection())
                    existing = MegaForm.Core.Services.Subform.SqlSchemaReader.ListTables(conn)
                        .Select(t => t.Name).Where(n => !string.IsNullOrEmpty(n)).ToList();

                var missing = new List<string>();
                var suggestions = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var rt in referenced)
                {
                    if (existing.Contains(rt, StringComparer.OrdinalIgnoreCase)) continue;
                    missing.Add(rt);
                    string suggest = null; int best = int.MaxValue;
                    foreach (var e in existing)
                    {
                        if (string.Equals(e, rt, StringComparison.OrdinalIgnoreCase)) { suggest = e; break; }
                        bool contains = e.IndexOf(rt, StringComparison.OrdinalIgnoreCase) >= 0 || rt.IndexOf(e, StringComparison.OrdinalIgnoreCase) >= 0;
                        if (contains)
                        {
                            int score = Math.Abs(e.Length - rt.Length);
                            if (score < best) { best = score; suggest = e; }
                        }
                    }
                    if (suggest != null) suggestions[rt] = suggest;
                }
                var ok = missing.Count == 0;
                return Ok(new { ok, referenced, missing, suggestions, message = ok ? "All referenced tables exist." : "Missing table(s) — fix the SQL or create them via ExecuteDdl." });
            }
            catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
        }

        [HttpGet("ProposeTableSchema")]
        public IActionResult ProposeTableSchema(int formId, string tableName = null, string schemaName = "dbo")
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found", formId });
            if (string.IsNullOrWhiteSpace(tableName)) tableName = "App_" + Slugify(form.Title ?? ("Form_" + formId));
            try
            {
                MegaForm.Core.Services.Subform.SqlSchemaReader.ProviderKind provider;
                using (var conn = OpenDashboardConnection())
                    provider = MegaForm.Core.Services.Subform.SqlSchemaReader.Detect(conn);
                var res = MegaForm.Core.Services.Subform.FormTableDdlBuilder.Build(form.SchemaJson, tableName, schemaName, provider);
                return Ok(new
                {
                    formId, formTitle = form.Title, provider = provider.ToString(),
                    schemaName = res.SchemaName, tableName = res.TableName,
                    columns = res.Columns.Select(c => new { name = c.Name, sqlType = c.SqlType, nullable = c.Nullable, sourceKey = c.SourceKey, sourceType = c.SourceType, label = c.Label }),
                    ddl = res.Ddl,
                    executionHint = "Run via ExecuteDdl (provider-correct, single CREATE TABLE — passes SqlDdlGuard).",
                });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("DbProvider")]
        public IActionResult DbProvider()
        {
            try
            {
                MegaForm.Core.Services.Subform.SqlSchemaReader.ProviderKind provider;
                using (var conn = OpenDashboardConnection())
                    provider = MegaForm.Core.Services.Subform.SqlSchemaReader.Detect(conn);
                return Ok(new { provider = provider.ToString().ToLowerInvariant() });
            }
            catch (Exception ex) { return Ok(new { provider = "unknown", error = ex.Message }); }
        }

        private static string Slugify(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "Form";
            var sb = new System.Text.StringBuilder();
            bool up = true;
            foreach (var c in s.Trim())
            {
                if (char.IsLetterOrDigit(c)) { sb.Append(up ? char.ToUpperInvariant(c) : c); up = false; }
                else up = true;
            }
            return sb.Length == 0 ? "Form" : sb.ToString();
        }

        private static int JInt(System.Text.Json.JsonElement el, string name, int fallback)
        {
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object && el.TryGetProperty(name, out var v))
            {
                if (v.ValueKind == System.Text.Json.JsonValueKind.Number && v.TryGetInt32(out var n)) return n;
                if (v.ValueKind == System.Text.Json.JsonValueKind.String && int.TryParse(v.GetString(), out var s)) return s;
            }
            return fallback;
        }

        [HttpGet("Knowledge")]
        public IActionResult ListKnowledge(string kind = null, string search = null, int top = 40)
        {
            var list = _svc.ListEntries(kind, search, SiteId, Math.Min(top, 80)).ToList();
            return Ok(new
            {
                count = list.Count,
                results = list.Select(e => new { slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary, tags = e.Tags?.Split(',') }),
            });
        }

        [HttpGet("GetKnowledge")]
        public IActionResult GetKnowledge(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug required" });
            var e = _svc.GetEntryBySlug(slug, SiteId);
            if (e == null) return NotFound(new { error = "Not found", slug });
            var (resolvedBody, sourceFile) = ResolveKnowledgeBody(e.Body);
            return Ok(new
            {
                slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary,
                body = resolvedBody,
                bodySource = sourceFile != null ? "file:" + sourceFile : "inline",
                tags = e.Tags?.Split(','), examples = e.Examples,
            });
        }

        /// <summary>
        /// GET /api/AiTools/GetTemplateGuide?slug=...
        /// Convenience over GetKnowledge for the template_guide kind. Returns
        /// the full design-contract markdown from wwwroot/Modules/MegaForm/Resources/TemplateGuides/.
        /// </summary>
        [HttpGet("GetTemplateGuide")]
        public IActionResult GetTemplateGuide(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug required" });
            var e = _svc.GetEntryBySlug(slug, SiteId);
            if (e == null || !string.Equals(e.Kind, "template_guide", StringComparison.OrdinalIgnoreCase))
                return NotFound(new { error = "Template guide not found", slug });
            var (resolvedBody, sourceFile) = ResolveKnowledgeBody(e.Body);
            return Ok(new
            {
                slug = e.Slug,
                title = e.Title,
                summary = e.Summary,
                body = resolvedBody,
                bodySource = sourceFile != null ? "file:" + sourceFile : "inline",
                tags = e.Tags?.Split(','),
            });
        }

        /// <summary>
        /// Resolves file-linked KB bodies for prompt_recipe (recipe_file) and
        /// template_guide (guide_file). Falls back to the raw body for inline
        /// entries.
        /// </summary>
        private (string body, string sourceFile) ResolveKnowledgeBody(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return (raw, null);
            var trimmed = raw.TrimStart();
            if (!trimmed.StartsWith("{")) return (raw, null);
            try
            {
                var obj = JObject.Parse(trimmed);
                var recipeFile = obj.Value<string>("recipe_file");
                if (!string.IsNullOrWhiteSpace(recipeFile))
                {
                    var safe = System.IO.Path.GetFileName(recipeFile);
                    var path = System.IO.Path.Combine(_env.WebRootPath, "Modules", "MegaForm", "Resources", "PromptRecipes", safe);
                    if (System.IO.File.Exists(path))
                        return (System.IO.File.ReadAllText(path), safe);
                    return ("[recipe_file not found: " + safe + "]", safe);
                }
                var guideFile = obj.Value<string>("guide_file");
                if (!string.IsNullOrWhiteSpace(guideFile))
                {
                    var safe = System.IO.Path.GetFileName(guideFile);
                    var path = System.IO.Path.Combine(_env.WebRootPath, "Modules", "MegaForm", "Resources", "TemplateGuides", safe);
                    if (System.IO.File.Exists(path))
                        return (System.IO.File.ReadAllText(path), safe);
                    return ("[guide_file not found: " + safe + "]", safe);
                }
                return (raw, null);
            }
            catch { return (raw, null); }
        }

        [HttpGet("Widgets")]
        public IActionResult ListWidgets()
        {
            var list = _svc.ListEntries("widget", null, SiteId, 80).ToList();
            return Ok(new
            {
                count = list.Count,
                results = list.Select(e => new { type = (e.Slug ?? "").Replace("widget-", "").Replace("-", ""), slug = e.Slug, title = e.Title, summary = e.Summary }),
            });
        }

        [HttpGet("Widget")]
        public IActionResult GetWidget(string slug) => GetKnowledge(slug);

        [HttpGet("GetWidgetBundle")]
        public IActionResult GetWidgetBundle(string slug, int recentLessons = 5)
        {
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug required" });
            var bundle = _svc.GetWidgetBundle(slug, SiteId, Math.Max(0, Math.Min(recentLessons, 25)));
            if (bundle == null) return NotFound(new { error = "Not found", slug });
            return Ok(new
            {
                entry = new { slug = bundle.Entry.Slug, kind = bundle.Entry.Kind, title = bundle.Entry.Title, summary = bundle.Entry.Summary, body = bundle.Entry.Body, tags = bundle.Entry.Tags?.Split(','), examples = bundle.Entry.Examples },
                templates = bundle.Templates.Select(t => new { id = t.Id, key = t.TemplateKey, kind = t.Kind, title = t.Title, summary = t.Summary, body = t.Body, tags = t.Tags?.Split(','), score = t.Score, sortOrder = t.SortOrder }),
                rules = bundle.Rules.Select(r => new { ruleId = r.RuleId, widgetType = r.WidgetType, title = r.Title, severity = r.Severity, condition = r.Condition, rejectionMessage = r.RejectionMessage, fixHint = r.FixHint }),
                lessons = bundle.RecentLessons.Select(l => new { id = l.Id, ruleId = l.RuleId, widgetType = l.WidgetType, attempted = l.AttemptedJson, fixedJson = l.FixedJson, rejection = l.RejectionMessage, reviewedAt = l.ReviewedOnDate }),
            });
        }

        [HttpPost("LogFeedback")]
        public IActionResult LogFeedback([FromBody] JObject body)
        {
            if (body == null) return BadRequest(new { error = "Body required" });
            try
            {
                var fb = new KbFeedback
                {
                    SessionId = (string)body["sessionId"],
                    RuleId = (string)body["ruleId"],
                    KnowledgeId = body["knowledgeId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["knowledgeId"],
                    WidgetType = (string)body["widgetType"],
                    Op = (string)body["op"],
                    AttemptedJson = body["attemptedJson"]?.ToString() ?? string.Empty,
                    RejectionMessage = (string)body["rejectionMessage"],
                    FixedJson = body["fixedJson"]?.ToString(),
                    Outcome = (string)body["outcome"] ?? "rejected",
                    PortalId = SiteId,
                    FormId = body["formId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["formId"],
                    UserId = CurrentUserId > 0 ? (int?)CurrentUserId : null,
                };
                if (string.IsNullOrEmpty(fb.AttemptedJson)) return BadRequest(new { error = "attemptedJson required" });
                var id = _svc.LogFeedback(fb);
                return Ok(new { id });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("ExecuteDdl")]
        public IActionResult ExecuteDdl([FromBody] System.Text.Json.JsonElement body)
        {
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object) return BadRequest(new { error = "body required" });
            var sql = JStr(body, "sql");
            var dryRun = JBool(body, "dryRun");
            if (string.IsNullOrWhiteSpace(sql)) return BadRequest(new { error = "sql required" });

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var guard = SqlDdlGuard.Inspect(sql);
            if (!guard.Allowed)
            {
                TryAudit(sql, guard.Verb, allowed: false, blockReason: guard.Reason, success: false, affected: null, dryRun: dryRun, error: null, sw: sw);
                return BadRequest(new { success = false, blocked = true, error = guard.Reason, verb = guard.Verb, statementCount = guard.StatementCount });
            }

            try
            {
                using var conn = OpenDashboardConnection();
                DbTransaction tx = null;
                try
                {
                    tx = conn.BeginTransaction();
                    int affected;
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.Transaction = tx;
                        cmd.CommandText = sql;
                        cmd.CommandTimeout = 30;
                        affected = cmd.ExecuteNonQuery();
                    }
                    if (dryRun) tx.Rollback(); else tx.Commit();
                    SqlDdlAudit.TryWrite(conn, BuildAuditEntry(sql, guard.Verb, allowed: true, blockReason: null, success: true, affected: affected, dryRun: dryRun, error: null, sw: sw));
                    return Ok(new { success = true, affected, dryRun, verb = guard.Verb, message = dryRun ? "validated (rolled back, not persisted)" : "executed", alreadyExists = false });
                }
                catch (Exception exInner)
                {
                    try { if (tx != null) tx.Rollback(); } catch { }
                    bool alreadyExists = (exInner.Message ?? string.Empty).IndexOf("already exist", StringComparison.OrdinalIgnoreCase) >= 0;
                    SqlDdlAudit.TryWrite(conn, BuildAuditEntry(sql, guard.Verb, allowed: true, blockReason: null, success: alreadyExists, affected: 0, dryRun: dryRun, error: alreadyExists ? null : exInner.Message, sw: sw));
                    if (alreadyExists)
                        return Ok(new { success = true, affected = 0, alreadyExists = true, message = "object already exists (treated as success)" });
                    return BadRequest(new { success = false, error = exInner.Message });
                }
            }
            catch (Exception ex)
            {
                TryAudit(sql, guard.Verb, allowed: true, blockReason: null, success: false, affected: null, dryRun: dryRun, error: ex.Message, sw: sw);
                return BadRequest(new { success = false, error = ex.Message });
            }
        }

        private DdlAuditEntry BuildAuditEntry(string sql, string verb, bool allowed, string blockReason, bool? success, int? affected, bool dryRun, string error, System.Diagnostics.Stopwatch sw)
        {
            return new DdlAuditEntry
            {
                PortalId = SiteId,
                UserId = CurrentUserId > 0 ? (int?)CurrentUserId : null,
                UserName = User?.Identity?.Name,
                ConnectionKey = "DashboardDatabase",
                Verb = verb,
                Allowed = allowed,
                BlockReason = blockReason,
                Success = success,
                Affected = affected,
                DryRun = dryRun,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Error = error,
                Sql = sql,
            };
        }

        private void TryAudit(string sql, string verb, bool allowed, string blockReason, bool success, int? affected, bool dryRun, string error, System.Diagnostics.Stopwatch sw)
        {
            try
            {
                using var conn = OpenDashboardConnection();
                SqlDdlAudit.TryWrite(conn, BuildAuditEntry(sql, verb, allowed, blockReason, success, affected, dryRun, error, sw));
            }
            catch { /* best-effort */ }
        }

        private static string JStr(System.Text.Json.JsonElement el, string name)
        {
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object && el.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String)
                return v.GetString();
            return null;
        }

        private static bool JBool(System.Text.Json.JsonElement el, string name)
        {
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object && el.TryGetProperty(name, out var v))
            {
                if (v.ValueKind == System.Text.Json.JsonValueKind.True) return true;
                if (v.ValueKind == System.Text.Json.JsonValueKind.False) return false;
            }
            return false;
        }
    }
}
