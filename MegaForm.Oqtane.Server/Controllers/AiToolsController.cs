using System;
using System.IO;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiKnowledge;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// Oqtane parity for the AI tool surface (Kinds / Knowledge / GetKnowledge /
    /// Widgets / Widget / GetWidgetBundle / LogFeedback) consumed by the
    /// MegaForm AI Form Assistant. Same shapes as DNN's AiToolsController.
    ///
    /// Route: /api/AiTools/{action}. Tool calls require Admin or Host role
    /// since the AI assistant is admin-only (gated by dev.lock + admin
    /// surface). LogFeedback uses [IgnoreAntiforgeryToken] because the
    /// dispatcher posts JSON via fetch without an antiforgery cookie.
    /// </summary>
    [Route("api/[controller]")]
    [IgnoreAntiforgeryToken]
    public class AiToolsController : ModuleControllerBase
    {
        private readonly IAiKnowledgeService _svc;
        private readonly MegaForm.Core.Interfaces.IConnectionRegistry _connectionRegistry;
        private readonly MegaForm.Core.Interfaces.IFormRepository _formRepo;
        private readonly IWebHostEnvironment _env;

        public AiToolsController(IAiKnowledgeService svc, MegaForm.Core.Interfaces.IConnectionRegistry connectionRegistry, MegaForm.Core.Interfaces.IFormRepository formRepo, IWebHostEnvironment env, ILogManager logger, IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _svc = svc;
            _connectionRegistry = connectionRegistry;
            _formRepo = formRepo;
            _env = env;
        }

        // [P0-2] Resolve the DashboardDatabase connection the same way SubformController
        // does (honors per-site provider: SQLite/Postgres/MySQL/MSSQL).
        private System.Data.Common.DbConnection OpenDashboardConnection()
        {
            var conn = _connectionRegistry.GetConnection("DashboardDatabase");
            conn.Open();
            return conn;
        }

        private int SiteId => AuthEntityId(EntityNames.Site);
        private bool IsAdmin => User != null && (User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host));
        private int CurrentUserId => int.TryParse(User?.FindFirst("sub")?.Value ?? User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : -1;

        [HttpGet("Kinds")]
        public IActionResult Kinds()
        {
            if (!IsAdmin) return Forbid();
            return Ok(new { kinds = _svc.ListKinds(SiteId) });
        }

        // [P0-2] SQL schema tools — parity with DNN so the AI can read REAL tables/
        // columns before generating SQL-bound forms. Provider-aware via SqlSchemaReader
        // (works on SQLite/Postgres/MySQL/MSSQL). Admin-only.
        [HttpGet("SqlTables")]
        public IActionResult SqlTables(string search = null, int top = 200)
        {
            if (!IsAdmin) return Forbid();
            try
            {
                using var conn = OpenDashboardConnection();
                var all = MegaForm.Core.Services.Subform.SqlSchemaReader.ListTables(conn);
                System.Collections.Generic.IEnumerable<MegaForm.Core.Services.Subform.SubformTableInfo> q = all;
                if (!string.IsNullOrWhiteSpace(search))
                    q = q.Where(t => (t.Name ?? string.Empty).IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0);
                var list = q.Take(Math.Max(1, Math.Min(top, 500)))
                            .Select(t => new { schema = t.Schema, name = t.Name }).ToList();
                return Ok(new { count = list.Count, tables = list });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("SqlColumns")]
        public IActionResult SqlColumns(string table)
        {
            if (!IsAdmin) return Forbid();
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

        // ─────────────────────────────────────────────────────────────────
        //  [TASK A] SQL PROOF tools (parity with DNN, provider-aware) so the AI
        //  can PROVE table/column existence + preview real rows before it ships
        //  a SQL-bound form. Critical for "cheap AI builds correct SQL forms".
        //  Admin-only. The cheap/local model won't function-call these — the
        //  client apply path (ops.ts) calls DryRunValidate deterministically.
        // ─────────────────────────────────────────────────────────────────

        // POST /api/AiTools/PreviewSql  { sql, connectionKey?, page?, pageSize? }
        // SELECT-only live preview (≤200 rows). ExecutePreviewSql pages IN-MEMORY
        // (no MSSQL TOP/FETCH) so it is provider-agnostic on SQLite/PG/MySQL/MSSQL.
        [HttpPost("PreviewSql")]
        public IActionResult PreviewSql([FromBody] System.Text.Json.JsonElement body)
        {
            if (!IsAdmin) return Forbid();
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

        // POST /api/AiTools/DryRunValidate  { sql, connectionKey? }
        // Extracts table refs and checks each against the REAL table list
        // (SqlSchemaReader.ListTables — NOT sys.tables) so it works on every
        // provider. Returns {ok, referenced, missing, suggestions}.
        [HttpPost("DryRunValidate")]
        public IActionResult DryRunValidate([FromBody] System.Text.Json.JsonElement body)
        {
            if (!IsAdmin) return Forbid();
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object) return BadRequest(new { error = "body required" });
            var sql = JStr(body, "sql");
            if (string.IsNullOrWhiteSpace(sql)) return BadRequest(new { error = "sql required" });
            try
            {
                // 1) extract referenced table names (bare name = group 2; schema = group 1)
                var rx = new System.Text.RegularExpressions.Regex(
                    @"\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|ALTER\s+TABLE|MERGE(?:\s+INTO)?|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+(?:[\[""`]?(\w+)[\]""`]?\s*\.\s*)?[\[""`]?(\w+)[\]""`]?",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var referenced = new System.Collections.Generic.List<string>();
                foreach (System.Text.RegularExpressions.Match m in rx.Matches(sql))
                {
                    var table = m.Groups[2].Value;
                    if (string.IsNullOrEmpty(table)) continue;
                    if (!referenced.Contains(table, StringComparer.OrdinalIgnoreCase)) referenced.Add(table);
                }
                if (referenced.Count == 0)
                    return Ok(new { ok = true, referenced = new string[0], missing = new string[0],
                        suggestions = new System.Collections.Generic.Dictionary<string, string>(),
                        message = "No table refs detected (passthrough)." });

                // 2) real tables (provider-aware)
                System.Collections.Generic.List<string> existing;
                using (var conn = OpenDashboardConnection())
                    existing = MegaForm.Core.Services.Subform.SqlSchemaReader.ListTables(conn)
                        .Select(t => t.Name).Where(n => !string.IsNullOrEmpty(n)).ToList();

                // 3) missing + fuzzy suggestions (exact case-fold → contains)
                var missing = new System.Collections.Generic.List<string>();
                var suggestions = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var rt in referenced)
                {
                    if (existing.Contains(rt, StringComparer.OrdinalIgnoreCase)) continue;
                    missing.Add(rt);
                    // Pick the CLOSEST existing table: exact case-fold wins, else the
                    // contains-match with the smallest length difference (so a typo like
                    // "MF_Submission" → "MF_Submissions", not "MF_SubmissionLinks").
                    string suggest = null; int best = int.MaxValue;
                    foreach (var e in existing)
                    {
                        if (string.Equals(e, rt, StringComparison.OrdinalIgnoreCase)) { suggest = e; break; }
                        bool contains = e.IndexOf(rt, StringComparison.OrdinalIgnoreCase) >= 0
                                     || rt.IndexOf(e, StringComparison.OrdinalIgnoreCase) >= 0;
                        if (contains)
                        {
                            int score = Math.Abs(e.Length - rt.Length);
                            if (score < best) { best = score; suggest = e; }
                        }
                    }
                    if (suggest != null) suggestions[rt] = suggest;
                }

                var ok = missing.Count == 0;
                return Ok(new { ok, referenced, missing, suggestions,
                    message = ok ? "All referenced tables exist."
                                 : "Missing table(s) — fix the SQL or create them via ExecuteDdl." });
            }
            catch (Exception ex) { return StatusCode(500, new { ok = false, error = ex.Message }); }
        }

        // GET /api/AiTools/ProposeTableSchema?formId=N&tableName=&schemaName=dbo
        // Builds a provider-correct CREATE TABLE from the form's schema (recurses
        // into Row columns). The DDL runs through ExecuteDdl on the site provider.
        [HttpGet("ProposeTableSchema")]
        public IActionResult ProposeTableSchema(int formId, string tableName = null, string schemaName = "dbo")
        {
            if (!IsAdmin) return Forbid();
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
                return Ok(new {
                    formId, formTitle = form.Title, provider = provider.ToString(),
                    schemaName = res.SchemaName, tableName = res.TableName,
                    columns = res.Columns.Select(c => new { name = c.Name, sqlType = c.SqlType, nullable = c.Nullable, sourceKey = c.SourceKey, sourceType = c.SourceType, label = c.Label }),
                    ddl = res.Ddl,
                    executionHint = "Run via ExecuteDdl (provider-correct, single CREATE TABLE — passes SqlDdlGuard).",
                });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        // [DDL-dialect 2026-06-12] Returns the active DashboardDatabase provider so the AI
        // client can inject the matching CREATE TABLE dialect (SQLite/MySQL/MSSQL/Postgres)
        // into the system prompt — instead of always emitting the MSSQL [dbo]/IDENTITY shape
        // (which 400s on SQLite: "unknown database [dbo]").
        [HttpGet("DbProvider")]
        public IActionResult DbProvider()
        {
            if (!IsAdmin) return Forbid();
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
        public IActionResult ListKnowledge(string kind = null, string search = null, int top = 40, string full = null)
        {
            if (!IsAdmin) return Forbid();
            // [KbFullBind v20260711] chat.ts sends full=1, but ASP.NET Core's bool binder only
            // accepts true/false — "1" failed to bind, `full` stayed false, and every prompt_rule
            // reached the Oqtane AI as summary-only (DNN's Web API binds "1" fine, so only this
            // twin was degraded). Bind as string and accept both spellings.
            bool includeBody = string.Equals(full, "1") ||
                               string.Equals(full, "true", StringComparison.OrdinalIgnoreCase);
            var list = _svc.ListEntries(kind, search, SiteId, Math.Min(top, 80)).ToList();
            return Ok(new
            {
                count = list.Count,
                results = list.Select(e => new
                {
                    slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary,
                    tags = e.Tags?.Split(','),
                    // [QA-20260615b] A1-2: include body when full=1 so the chat.ts
                    // prompt-rule loader (reads e.body||e.summary) gets the full rule
                    // text, not just the summary. Mirrors DNN AiToolsController.
                    body = includeBody ? e.Body : null,
                }),
            });
        }

        [HttpGet("GetKnowledge")]
        public IActionResult GetKnowledge(string slug)
        {
            if (!IsAdmin) return Forbid();
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
            if (!IsAdmin) return Forbid();
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
            if (!IsAdmin) return Forbid();
            var list = _svc.ListEntries("widget", null, SiteId, 80).ToList();
            return Ok(new
            {
                count = list.Count,
                results = list.Select(e => new
                {
                    type = (e.Slug ?? "").Replace("widget-", "").Replace("-", ""),
                    slug = e.Slug, title = e.Title, summary = e.Summary,
                }),
            });
        }

        [HttpGet("Widget")]
        public IActionResult GetWidget(string slug) => GetKnowledge(slug);

        // ── v20260530-13 Bundle + Feedback ──────────────────────────────
        [HttpGet("GetWidgetBundle")]
        public IActionResult GetWidgetBundle(string slug, int recentLessons = 5)
        {
            if (!IsAdmin) return Forbid();
            if (string.IsNullOrWhiteSpace(slug)) return BadRequest(new { error = "slug required" });
            var bundle = _svc.GetWidgetBundle(slug, SiteId, Math.Max(0, Math.Min(recentLessons, 25)));
            if (bundle == null) return NotFound(new { error = "Not found", slug });
            return Ok(new
            {
                entry = new
                {
                    slug = bundle.Entry.Slug, kind = bundle.Entry.Kind, title = bundle.Entry.Title,
                    summary = bundle.Entry.Summary, body = bundle.Entry.Body,
                    tags = bundle.Entry.Tags?.Split(','), examples = bundle.Entry.Examples,
                },
                templates = bundle.Templates.Select(t => new
                {
                    id = t.Id, key = t.TemplateKey, kind = t.Kind, title = t.Title,
                    summary = t.Summary, body = t.Body,
                    tags = t.Tags?.Split(','), score = t.Score, sortOrder = t.SortOrder,
                }),
                rules = bundle.Rules.Select(r => new
                {
                    ruleId = r.RuleId, widgetType = r.WidgetType, title = r.Title,
                    severity = r.Severity, condition = r.Condition,
                    rejectionMessage = r.RejectionMessage, fixHint = r.FixHint,
                }),
                lessons = bundle.RecentLessons.Select(l => new
                {
                    id = l.Id, ruleId = l.RuleId, widgetType = l.WidgetType,
                    attempted = l.AttemptedJson, fixedJson = l.FixedJson,
                    rejection = l.RejectionMessage, reviewedAt = l.ReviewedOnDate,
                }),
            });
        }

        [HttpPost("LogFeedback")]
        public IActionResult LogFeedback([FromBody] JObject body)
        {
            if (!IsAdmin) return Forbid();
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
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  [P1-3 mirror] ExecuteDdl — Oqtane parity for the AI app_batch flow
        //  (execute_sql op). Hardened identically to DNN: the shared,
        //  provider-agnostic SqlDdlGuard enforces EXACTLY ONE statement + an
        //  additive allow-list (CREATE TABLE / CREATE INDEX / ALTER TABLE ADD
        //  / INSERT) and blocks DROP / DELETE-injection / EXEC. Runs in a
        //  transaction (dryRun=true → rollback) on the per-site provider
        //  (SQLite / Postgres / MySQL / MSSQL) and writes an MF_AiDdlAudit row.
        //  Admin-only. Do NOT loosen the guard.
        // ─────────────────────────────────────────────────────────────────
        // [OQ JsonElement bind] Oqtane does NOT call AddNewtonsoftJson(), so a
        // [FromBody] JObject would bind to null — read via JsonElement instead
        // (same pattern as MegaFormController.LockForm).
        [HttpPost("ExecuteDdl")]
        public IActionResult ExecuteDdl([FromBody] System.Text.Json.JsonElement body)
        {
            if (!IsAdmin) return Forbid();
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object) return BadRequest(new { error = "body required" });
            var sql = JStr(body, "sql");
            var dryRun = JBool(body, "dryRun");
            if (string.IsNullOrWhiteSpace(sql)) return BadRequest(new { error = "sql required" });

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var guard = MegaForm.Core.Services.AiAssistant.SqlDdlGuard.Inspect(sql);
            if (!guard.Allowed)
            {
                TryAudit(sql, guard.Verb, allowed: false, blockReason: guard.Reason,
                    success: false, affected: null, dryRun: dryRun, error: null, sw: sw);
                return BadRequest(new {
                    success = false, blocked = true,
                    error = guard.Reason, verb = guard.Verb, statementCount = guard.StatementCount,
                });
            }

            try
            {
                using var conn = OpenDashboardConnection();
                System.Data.Common.DbTransaction tx = null;
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

                    MegaForm.Core.Services.AiAssistant.SqlDdlAudit.TryWrite(conn,
                        BuildAuditEntry(sql, guard.Verb, allowed: true, blockReason: null,
                            success: true, affected: affected, dryRun: dryRun, error: null, sw: sw));

                    return Ok(new {
                        success = true, affected, dryRun, verb = guard.Verb,
                        message = dryRun ? "validated (rolled back, not persisted)" : "executed",
                        alreadyExists = false,
                    });
                }
                catch (Exception exInner)
                {
                    try { if (tx != null) tx.Rollback(); } catch { }
                    // Cross-provider "already exists" soft-catch (SQLite/PG/MySQL/MSSQL all
                    // surface the phrase) so app_batch re-runs are idempotent.
                    bool alreadyExists = (exInner.Message ?? string.Empty)
                        .IndexOf("already exist", StringComparison.OrdinalIgnoreCase) >= 0;
                    MegaForm.Core.Services.AiAssistant.SqlDdlAudit.TryWrite(conn,
                        BuildAuditEntry(sql, guard.Verb, allowed: true, blockReason: null,
                            success: alreadyExists, affected: 0, dryRun: dryRun,
                            error: alreadyExists ? null : exInner.Message, sw: sw));
                    if (alreadyExists)
                        return Ok(new { success = true, affected = 0, alreadyExists = true,
                            message = "object already exists (treated as success)" });
                    return BadRequest(new { success = false, error = exInner.Message });
                }
            }
            catch (Exception ex)
            {
                TryAudit(sql, guard.Verb, allowed: true, blockReason: null,
                    success: false, affected: null, dryRun: dryRun, error: ex.Message, sw: sw);
                return BadRequest(new { success = false, error = ex.Message });
            }
        }

        private MegaForm.Core.Services.AiAssistant.DdlAuditEntry BuildAuditEntry(
            string sql, string verb, bool allowed, string blockReason, bool? success,
            int? affected, bool dryRun, string error, System.Diagnostics.Stopwatch sw)
        {
            return new MegaForm.Core.Services.AiAssistant.DdlAuditEntry
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

        // Blocked / connection-failure path: open a fresh connection just to record the attempt.
        private void TryAudit(string sql, string verb, bool allowed, string blockReason,
            bool success, int? affected, bool dryRun, string error, System.Diagnostics.Stopwatch sw)
        {
            try
            {
                using var conn = OpenDashboardConnection();
                MegaForm.Core.Services.AiAssistant.SqlDdlAudit.TryWrite(conn,
                    BuildAuditEntry(sql, verb, allowed, blockReason, success, affected, dryRun, error, sw));
            }
            catch { /* best-effort */ }
        }

        private static string JStr(System.Text.Json.JsonElement el, string name)
        {
            if (el.ValueKind == System.Text.Json.JsonValueKind.Object &&
                el.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String)
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
