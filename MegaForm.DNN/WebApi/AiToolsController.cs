using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Web;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Tool surface exposed to the MegaForm AI Form Assistant.
    /// AI calls these via OpenAI function-calling — see UI tools.ts for the
    /// JSON schema definitions the model receives.
    ///
    /// Read-only by design — every tool returns a small, compact payload so
    /// AI can fetch what it needs without bloating its context window.
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiTools/{action}
    ///
    /// Tools:
    ///   list_kinds                 GET  /Kinds
    ///   list_knowledge             GET  /Knowledge?kind=&search=
    ///   get_knowledge              GET  /Knowledge/{slug}
    ///   list_widgets               GET  /Widgets
    ///   get_widget                 GET  /Widget/{slug}
    ///   list_forms                 GET  /Forms?search=
    ///   get_current_form           GET  /Form/{formId}
    ///   list_sql_tables            GET  /SqlTables?search=
    ///   get_table_columns          GET  /SqlColumns?table=
    ///   list_designers             GET  /Designers
    ///   get_designer               GET  /Designer/{slug}
    ///   find_cascade_pattern       GET  /Cascade?parentColumn=&childTable=
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class AiToolsController : DnnApiController
    {
        private int CurrentPortalId => PortalSettings?.PortalId ?? 0;

        private HttpResponseMessage RejectIfDisabled()
        {
            var enabled = AiFeatureGate.IsEnabled(PortalSettings?.HomeDirectoryMapPath);
            if (enabled) return null;
            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI tools disabled (no dev.lock)" });
        }

        // Mirrors SubformController.GetPortalSetting — DnnConnectionRegistry
        // reads connection strings from MegaForm_<key> host settings.
        private static string GetHostSetting(string key, string defaultValue)
        {
            try
            {
                var fullKey = "MegaForm_" + key;
                return DotNetNuke.Entities.Controllers.HostController.Instance.GetString(fullKey, null) ?? defaultValue;
            }
            catch { return defaultValue; }
        }

        // [B8.A v20260601-01] Param helper — DbParameterCollection has no AddWithValue.
        private static void AddParam(System.Data.Common.DbCommand cmd, string name, object value)
        {
            var p = cmd.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            cmd.Parameters.Add(p);
        }

        // ─────────────────────────────────────────────────────────────────
        //  Knowledge tools
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Kinds")]
        public HttpResponseMessage Kinds()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            return Request.CreateResponse(HttpStatusCode.OK, new { kinds = AiKnowledgeRepository.ListKinds() });
        }

        [HttpGet]
        [ActionName("Knowledge")]
        public HttpResponseMessage ListKnowledge(string kind = null, string search = null, int top = 40, bool full = false)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var list = AiKnowledgeRepository.List(kind, search, CurrentPortalId, Math.Min(top, 80));
            // [v20260531-KbRules] When full=1, return full Body for each row
            // (used by the chat client to load all `prompt_rule` entries in
            // ONE call instead of N round-trips through GetKnowledge).
            if (full)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    count = list.Count,
                    results = list.Select(e => new {
                        slug = e.Slug, kind = e.Kind, title = e.Title,
                        summary = e.Summary, body = e.Body,
                        tags = e.Tags?.Split(',')
                    })
                });
            }
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                count = list.Count,
                results = list.Select(e => new { slug = e.Slug, kind = e.Kind, title = e.Title, summary = e.Summary, tags = e.Tags?.Split(',') })
            });
        }

        [HttpGet]
        [ActionName("GetKnowledge")]
        public HttpResponseMessage GetKnowledge(string slug)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug required" });
            var e = AiKnowledgeRepository.GetBySlug(slug, CurrentPortalId);
            if (e == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found", slug });
            var (resolvedBody, recipeFile) = ResolveKnowledgeBody(e.Body);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                slug = e.Slug,
                kind = e.Kind,
                title = e.Title,
                summary = e.Summary,
                body = resolvedBody,
                bodySource = recipeFile != null ? "file:" + recipeFile : "inline",
                tags = e.Tags?.Split(','),
                examples = e.Examples,
            });
        }

        /// <summary>
        /// [B34] Hybrid body resolver — if Body is a JSON object with key
        /// "recipe_file" or "guide_file", load that file from the matching
        /// Resources subfolder. Else return Body verbatim. Lets KB rows stay
        /// slim while the long markdown lives on disk for easy editing and
        /// version control.
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
                    var safe = Path.GetFileName(recipeFile); // strip any path traversal
                    var path = HttpContext.Current?.Server.MapPath("~/DesktopModules/MegaForm/Resources/PromptRecipes/" + safe);
                    if (path != null && File.Exists(path))
                        return (File.ReadAllText(path), safe);
                    return ("[recipe_file not found: " + safe + "]", safe);
                }
                var guideFile = obj.Value<string>("guide_file");
                if (!string.IsNullOrWhiteSpace(guideFile))
                {
                    var safe = Path.GetFileName(guideFile);
                    var path = HttpContext.Current?.Server.MapPath("~/DesktopModules/MegaForm/Resources/TemplateGuides/" + safe);
                    if (path != null && File.Exists(path))
                        return (File.ReadAllText(path), safe);
                    return ("[guide_file not found: " + safe + "]", safe);
                }
                return (raw, null);
            }
            catch { return (raw, null); }
        }

        // ─────────────────────────────────────────────────────────────────
        //  [B38] Ad-hoc SQL preview for the Unified Widget Designer's Data tab
        // ─────────────────────────────────────────────────────────────────

        public class PreviewSqlRequest
        {
            public string Sql { get; set; }
            public string ConnectionKey { get; set; }
            public string DatabaseType { get; set; }
            public int Page { get; set; }
            public int PageSize { get; set; }
            public Dictionary<string, object> Parameters { get; set; }
        }

        /// <summary>
        /// POST /AiTools/PreviewSql — runs an ad-hoc SELECT against the chosen
        /// connection key, returns columns + rows + executionMs. Designed for
        /// the Unified Widget Designer's Data tab live preview. SELECT-only,
        /// pageSize capped at 200, no widget config lookup.
        /// </summary>
        [HttpPost]
        [ActionName("PreviewSql")]
        public HttpResponseMessage PreviewSql([System.Web.Http.FromBody] PreviewSqlRequest req)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (req == null || string.IsNullOrWhiteSpace(req.Sql))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "sql is required" });
            // DnnConnectionRegistry expects host-level MegaForm-prefixed settings
            // (Database_ConnectionString, Database_Provider, Database_ConnectionAlias).
            // Mirror DataRepeaterApiController.GetPortalSetting exactly.
            var registry = new MegaForm.WebApi.DnnConnectionRegistry((key, def) =>
            {
                try
                {
                    var fullKey = "MegaForm_" + key;
                    var val = DotNetNuke.Entities.Controllers.HostController.Instance.GetString(fullKey, null);
                    return val ?? def;
                }
                catch { return def; }
            });
            var formRepo = MegaForm.DNN.Services.DnnServiceLocator.Instance.FormRepo;
            var svc = new MegaForm.Core.Services.DataRepeaterService(registry, formRepo);
            var page = req.Page > 0 ? req.Page : 1;
            var pageSize = req.PageSize > 0 ? req.PageSize : 25;
            var result = svc.ExecutePreviewSql(req.Sql, req.ConnectionKey, req.DatabaseType, page, pageSize, req.Parameters);
            return Request.CreateResponse(HttpStatusCode.OK, result);
        }

        /// <summary>
        /// GET /AiTools/GetPromptRecipe?slug=...
        /// Convenience over GetKnowledge for the prompt_recipe kind. Same
        /// resolver applies — the body in the response is the full markdown
        /// fetched from Resources/PromptRecipes/&lt;file&gt;.md.
        /// </summary>
        [HttpGet]
        [ActionName("GetPromptRecipe")]
        public HttpResponseMessage GetPromptRecipe(string slug)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug required" });
            var e = AiKnowledgeRepository.GetBySlug(slug, CurrentPortalId);
            if (e == null || !string.Equals(e.Kind, "prompt_recipe", StringComparison.OrdinalIgnoreCase))
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Prompt recipe not found", slug });
            var (resolvedBody, sourceFile) = ResolveKnowledgeBody(e.Body);
            return Request.CreateResponse(HttpStatusCode.OK, new
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
        /// GET /AiTools/GetTemplateGuide?slug=...
        /// Convenience over GetKnowledge for the template_guide kind. Returns
        /// the full design-contract markdown from Resources/TemplateGuides/.
        /// </summary>
        [HttpGet]
        [ActionName("GetTemplateGuide")]
        public HttpResponseMessage GetTemplateGuide(string slug)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug required" });
            var e = AiKnowledgeRepository.GetBySlug(slug, CurrentPortalId);
            if (e == null || !string.Equals(e.Kind, "template_guide", StringComparison.OrdinalIgnoreCase))
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Template guide not found", slug });
            var (resolvedBody, sourceFile) = ResolveKnowledgeBody(e.Body);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                slug = e.Slug,
                title = e.Title,
                summary = e.Summary,
                body = resolvedBody,
                bodySource = sourceFile != null ? "file:" + sourceFile : "inline",
                tags = e.Tags?.Split(','),
            });
        }

        // ─────────────────────────────────────────────────────────────────
        //  Widget tools — shortcut over Knowledge filtered by Kind=widget
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Widgets")]
        public HttpResponseMessage ListWidgets()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var list = AiKnowledgeRepository.List("widget", null, CurrentPortalId, 80);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                count = list.Count,
                results = list.Select(e => new
                {
                    type = (e.Slug ?? "").Replace("widget-", "").Replace("-", ""), // 'widget-datarepeater' -> 'datarepeater'
                    slug = e.Slug,
                    title = e.Title,
                    summary = e.Summary,
                })
            });
        }

        [HttpGet]
        [ActionName("Widget")]
        public HttpResponseMessage GetWidget(string slug)
        {
            return GetKnowledge(slug);
        }

        // ─────────────────────────────────────────────────────────────────
        //  v20260530-13 — Bundle + Feedback (Templates / Rules / Lessons)
        // ─────────────────────────────────────────────────────────────────

        /// <summary>
        /// One-shot fetch for AI: entry + templates + rules + recent
        /// admin-promoted feedback. Avoids the 3-call round-trip the model
        /// used to need (Knowledge / Examples / "what failed last time?").
        /// </summary>
        [HttpGet]
        [ActionName("GetWidgetBundle")]
        public HttpResponseMessage GetWidgetBundle(string slug, int recentLessons = 5)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug required" });
            var svc = new MegaForm.DNN.Services.DnnAiKnowledgeService();
            var bundle = svc.GetWidgetBundle(slug, CurrentPortalId, Math.Max(0, Math.Min(recentLessons, 25)));
            if (bundle == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found", slug });
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                entry = new
                {
                    slug = bundle.Entry.Slug,
                    kind = bundle.Entry.Kind,
                    title = bundle.Entry.Title,
                    summary = bundle.Entry.Summary,
                    body = bundle.Entry.Body,
                    tags = bundle.Entry.Tags?.Split(','),
                    examples = bundle.Entry.Examples,
                },
                templates = bundle.Templates.Select(t => new
                {
                    id = t.Id, key = t.TemplateKey, kind = t.Kind,
                    title = t.Title, summary = t.Summary, body = t.Body,
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

        /// <summary>
        /// Dispatcher posts here whenever an op was rejected (or AI self-
        /// corrected). Body: { sessionId?, ruleId?, knowledgeId?, widgetType?,
        /// op, attemptedJson, rejectionMessage?, fixedJson?, outcome }.
        /// Returns the new feedback Id so the client can attach later
        /// "fixedJson" updates by Id.
        /// </summary>
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("LogFeedback")]
        public HttpResponseMessage LogFeedback(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });
            try
            {
                var fb = new MegaForm.Core.Models.KbFeedback
                {
                    SessionId = (string)body["sessionId"],
                    RuleId = (string)body["ruleId"],
                    KnowledgeId = body["knowledgeId"]?.Type == Newtonsoft.Json.Linq.JTokenType.Null ? (int?)null : (int?)body["knowledgeId"],
                    WidgetType = (string)body["widgetType"],
                    Op = (string)body["op"],
                    AttemptedJson = body["attemptedJson"]?.ToString() ?? string.Empty,
                    RejectionMessage = (string)body["rejectionMessage"],
                    FixedJson = body["fixedJson"]?.ToString(),
                    Outcome = (string)body["outcome"] ?? "rejected",
                    PortalId = CurrentPortalId,
                    FormId = body["formId"]?.Type == Newtonsoft.Json.Linq.JTokenType.Null ? (int?)null : (int?)body["formId"],
                    UserId = UserInfo?.UserID,
                };
                if (string.IsNullOrEmpty(fb.AttemptedJson))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "attemptedJson required" });
                var svc = new MegaForm.DNN.Services.DnnAiKnowledgeService();
                var id = svc.LogFeedback(fb);
                return Request.CreateResponse(HttpStatusCode.OK, new { id });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  Form introspection
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Forms")]
        public HttpResponseMessage ListForms(string search = null, int top = 50)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var forms = FormRepository.GetFormsByPortal(CurrentPortalId) ?? new List<FormInfo>();
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                forms = forms.Where(f => (f.Title ?? "").IndexOf(s, StringComparison.OrdinalIgnoreCase) >= 0
                                       || (f.Description ?? "").IndexOf(s, StringComparison.OrdinalIgnoreCase) >= 0).ToList();
            }
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                count = forms.Count,
                results = forms.Take(top).Select(f => new
                {
                    formId = f.FormId,
                    title = f.Title,
                    description = f.Description,
                    status = f.Status,
                    moduleId = f.ModuleId,
                })
            });
        }

        [HttpGet]
        [ActionName("Form")]
        public HttpResponseMessage GetForm(int formId)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
            // Strip down to AI-friendly view: fields list with key/type/label only.
            object schemaSummary = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(form.SchemaJson))
                {
                    var jo = Newtonsoft.Json.Linq.JObject.Parse(form.SchemaJson);
                    var fields = jo["fields"] as Newtonsoft.Json.Linq.JArray;
                    schemaSummary = fields?.Select(f => new
                    {
                        key = (string)f["key"],
                        type = (string)f["type"],
                        label = (string)f["label"],
                        required = (bool?)f["required"] ?? false,
                    });
                }
            }
            catch { /* leave null */ }
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId = form.FormId,
                title = form.Title,
                description = form.Description,
                status = form.Status,
                fields = schemaSummary,
            });
        }

        // ─────────────────────────────────────────────────────────────────
        //  SQL introspection (DashboardDatabase)
        // ─────────────────────────────────────────────────────────────────

        private DbConnection OpenDashboardConnection()
        {
            string GetSetting(string key, string defaultValue = "")
            {
                try
                {
                    var fullKey = "MegaForm_" + key;
                    return DotNetNuke.Entities.Controllers.HostController.Instance.GetString(fullKey, null) ?? defaultValue;
                }
                catch { return defaultValue; }
            }
            var registry = new DnnConnectionRegistry(GetSetting);
            var conn = registry.GetConnection("DashboardDatabase");
            conn.Open();
            return conn;
        }

        [HttpGet]
        [ActionName("SqlTables")]
        public HttpResponseMessage SqlTables(string search = null, int top = 80)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            try
            {
                var list = new List<object>();
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT TOP (" + Math.Max(1, Math.Min(top, 200)) + @") TABLE_SCHEMA, TABLE_NAME
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_TYPE = 'BASE TABLE'
                          AND TABLE_NAME NOT LIKE 'sys%'" +
                          (!string.IsNullOrWhiteSpace(search) ? " AND (TABLE_NAME LIKE @s)" : "") +
                        " ORDER BY TABLE_SCHEMA, TABLE_NAME";
                    if (!string.IsNullOrWhiteSpace(search))
                    {
                        var p = cmd.CreateParameter(); p.ParameterName = "@s"; p.Value = "%" + search + "%"; cmd.Parameters.Add(p);
                    }
                    using (var r = cmd.ExecuteReader())
                        while (r.Read())
                            list.Add(new { schema = (string)r["TABLE_SCHEMA"], name = (string)r["TABLE_NAME"] });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { count = list.Count, results = list });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new { count = 0, results = new object[0], error = ex.Message });
            }
        }

        [HttpGet]
        [ActionName("SqlColumns")]
        public HttpResponseMessage SqlColumns(string table)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(table))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "table required" });
            try
            {
                var list = new List<object>();
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_NAME = @t
                        ORDER BY ORDINAL_POSITION";
                    var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = table; cmd.Parameters.Add(p);
                    using (var r = cmd.ExecuteReader())
                        while (r.Read())
                            list.Add(new
                            {
                                name = (string)r["COLUMN_NAME"],
                                type = (string)r["DATA_TYPE"],
                                nullable = (string)r["IS_NULLABLE"] == "YES",
                                maxLength = r["CHARACTER_MAXIMUM_LENGTH"] is DBNull ? (int?)null : Convert.ToInt32(r["CHARACTER_MAXIMUM_LENGTH"]),
                            });
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { table, count = list.Count, columns = list });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new { table, count = 0, columns = new object[0], error = ex.Message });
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  Designer tools — shortcut over Knowledge filtered by Kind=designer
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Designers")]
        public HttpResponseMessage ListDesigners()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var list = AiKnowledgeRepository.List("designer", null, CurrentPortalId, 40);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                count = list.Count,
                results = list.Select(e => new { slug = e.Slug, title = e.Title, summary = e.Summary })
            });
        }

        [HttpGet]
        [ActionName("Designer")]
        public HttpResponseMessage GetDesigner(string slug)
        {
            return GetKnowledge(slug);
        }

        // ─────────────────────────────────────────────────────────────────
        //  Cascade — heuristic
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("Cascade")]
        public HttpResponseMessage FindCascadePattern(string parentColumn = null, string childTable = null)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            // Pull canonical cascade entries from KB; AI gets a template to adapt.
            var list = AiKnowledgeRepository.List("cascade_pattern", null, CurrentPortalId, 10);
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                parentColumn,
                childTable,
                patterns = list.Select(e => new { slug = e.Slug, title = e.Title, summary = e.Summary, body = e.Body })
            });
        }

        // ─────────────────────────────────────────────────────────────────
        //  Propose CREATE TABLE DDL from a form's schema
        // ─────────────────────────────────────────────────────────────────

        [HttpGet]
        [ActionName("ProposeTableSchema")]
        public HttpResponseMessage ProposeTableSchema(int formId, string tableName = null, string schemaName = "dbo")
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (formId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Form not found" });

            // Slugify the form title into a SQL-safe table name when caller hasn't provided one.
            if (string.IsNullOrWhiteSpace(tableName))
            {
                tableName = "App_" + Slugify(form.Title ?? ("Form_" + formId));
            }
            tableName = SanitizeIdentifier(tableName);
            schemaName = SanitizeIdentifier(string.IsNullOrWhiteSpace(schemaName) ? "dbo" : schemaName);

            var columns = new System.Collections.Generic.List<object>();
            var ddlLines = new System.Collections.Generic.List<string>
            {
                "Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY",
            };

            try
            {
                if (!string.IsNullOrWhiteSpace(form.SchemaJson))
                {
                    var jo = Newtonsoft.Json.Linq.JObject.Parse(form.SchemaJson);
                    var fields = jo["fields"] as Newtonsoft.Json.Linq.JArray;
                    if (fields != null)
                    {
                        foreach (var f in fields)
                        {
                            var key = (string)f["key"];
                            var type = (string)f["type"];
                            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(type)) continue;
                            if (IsLayoutOrSkippableType(type)) continue;

                            var sqlType = MapFormTypeToSql(type, f);
                            if (sqlType == null) continue;

                            var safeKey = SanitizeIdentifier(key);
                            var nullable = !(bool?)f["required"] ?? true;
                            ddlLines.Add("[" + safeKey + "] " + sqlType + (nullable ? " NULL" : " NOT NULL"));
                            columns.Add(new { name = safeKey, sqlType, nullable, sourceField = new { key, type, label = (string)f["label"] } });
                        }
                    }
                }
            }
            catch { /* if schema fails to parse, return base DDL */ }

            ddlLines.Add("CreatedOnUtc DATETIME2 NOT NULL CONSTRAINT DF_" + tableName + "_CreatedOn DEFAULT SYSUTCDATETIME()");
            ddlLines.Add("CreatedByUserId INT NULL");

            var ddl = "-- Proposed by MegaForm AI for form #" + formId + " (\"" + (form.Title ?? "") + "\")\n" +
                      "CREATE TABLE [" + schemaName + "].[" + tableName + "] (\n  " +
                      string.Join(",\n  ", ddlLines) + "\n);";

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                formId,
                formTitle = form.Title,
                schemaName,
                tableName,
                columns,
                ddl,
                executionHint = "AI: emit chat_message with this DDL; the admin reviews then runs it via SSMS or the host's SQL surface. Do NOT execute automatically."
            });
        }

        // ─────────────────────────────────────────────────────────────────
        //  Internals
        // ─────────────────────────────────────────────────────────────────

        private static string Slugify(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "Form";
            var sb = new System.Text.StringBuilder();
            bool nextUpper = true;
            foreach (var c in s.Trim())
            {
                if (char.IsLetterOrDigit(c)) { sb.Append(nextUpper ? char.ToUpper(c) : c); nextUpper = false; }
                else nextUpper = true;
            }
            return sb.Length == 0 ? "Form" : sb.ToString();
        }

        private static string SanitizeIdentifier(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return "_";
            var sb = new System.Text.StringBuilder();
            foreach (var c in s)
            {
                if (char.IsLetterOrDigit(c) || c == '_') sb.Append(c);
            }
            var clean = sb.ToString();
            if (clean.Length == 0) clean = "_";
            if (char.IsDigit(clean[0])) clean = "_" + clean;
            return clean.Length > 120 ? clean.Substring(0, 120) : clean;
        }

        private static bool IsLayoutOrSkippableType(string type)
        {
            var t = (type ?? "").Trim();
            return t.Equals("Row", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("Column", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("Heading", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("Divider", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("HtmlBlock", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("Image", System.StringComparison.OrdinalIgnoreCase)
                || t.Equals("DynamicLabel", System.StringComparison.OrdinalIgnoreCase)   // display-only
                || t.Equals("DataRepeater", System.StringComparison.OrdinalIgnoreCase)   // SQL display
                || t.Equals("GridRepeater", System.StringComparison.OrdinalIgnoreCase)   // SQL display
                || t.Equals("DataGrid", System.StringComparison.OrdinalIgnoreCase)       // separate table
                || t.Equals("FileUpload", System.StringComparison.OrdinalIgnoreCase);    // separate files table
        }

        private static string MapFormTypeToSql(string type, Newtonsoft.Json.Linq.JToken field)
        {
            switch ((type ?? "").Trim().ToLowerInvariant())
            {
                case "text":
                case "phone":
                case "url":
                case "color":
                    return "NVARCHAR(250)";
                case "email":     return "NVARCHAR(254)";
                case "password":  return "NVARCHAR(250)";
                case "phonepro":  return "NVARCHAR(40)";
                case "longtext":
                case "richtext":
                case "signature": return "NVARCHAR(MAX)";
                case "number":
                case "slider":
                case "rating":    return "DECIMAL(18, 6)";
                case "date":      return "DATE";
                case "time":      return "TIME";
                case "datetime":  return "DATETIME2";
                case "checkbox":
                case "switch":    return "BIT";
                case "radio":
                case "select":    return "NVARCHAR(120)";
                case "multiselect": return "NVARCHAR(MAX)";  // CSV / JSON
                case "hidden":    return "NVARCHAR(120)";
                default:          return "NVARCHAR(500)";
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  ExecuteDdl — Host/Admin-only DDL/DML runner backing the AI's
        //  app-batch flow. The AI emits CREATE TABLE / ALTER / INSERT INTO
        //  via the `execute_sql` op, the dispatcher forwards here, server
        //  runs through the existing IConnectionRegistry. Reuses the same
        //  connection alias (DashboardDatabase by default) so the new
        //  tables sit alongside the customer's existing data.
        //
        //  Sandboxing: this is intentionally NOT a general-purpose SQL
        //  shell. It's gated by [DnnAuthorize(StaticRoles="Administrators")]
        //  at the controller level AND by AiFeatureGate (dev.lock).
        //
        //  [P1-3 / 2026-06-09] Hardened: the payload now passes through the
        //  shared, provider-agnostic SqlDdlGuard (MegaForm.Core) which
        //  enforces EXACTLY ONE statement + a strict additive allow-list
        //  (CREATE TABLE / CREATE INDEX / ALTER TABLE ADD / INSERT) and
        //  blocks DROP / DELETE-injection / EXEC xp_*. The statement runs in
        //  a transaction (dryRun=true → rollback instead of commit) and every
        //  attempt — allowed or blocked — writes a row to MF_AiDdlAudit.
        //  Do NOT loosen the guard. See Docs/HANDOFF_20260609_AI_FORM_BUILDER_AUDIT_FIXES.md.
        // ─────────────────────────────────────────────────────────────────
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("ExecuteDdl")]
        public HttpResponseMessage ExecuteDdl(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            var sql           = (string)body["sql"];
            var connectionKey = (string)body["connectionKey"];
            var dryRun        = (bool?)body["dryRun"] ?? false;
            if (string.IsNullOrWhiteSpace(sql))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "sql required" });
            if (string.IsNullOrWhiteSpace(connectionKey)) connectionKey = "DashboardDatabase";

            var sw = System.Diagnostics.Stopwatch.StartNew();

            // [P1-3] Mandatory static guard (parse-only) BEFORE we ever open a
            // connection. Rejects multi-statement payloads + non-additive verbs.
            var guard = MegaForm.Core.Services.AiAssistant.SqlDdlGuard.Inspect(sql);
            if (!guard.Allowed)
            {
                TryWriteDdlAudit(connectionKey, sql, guard.Verb ?? "?", allowed: false,
                    blockReason: guard.Reason, success: false, affected: null, dryRun: dryRun, sw: sw);
                return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                    success = false, blocked = true,
                    error = guard.Reason,
                    verb = guard.Verb,
                    statementCount = guard.StatementCount,
                });
            }

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(connectionKey, null, null))
                {
                    conn.Open();
                    EnsureDdlAuditTable(conn);   // best-effort, idempotent

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
                        // dryRun → prove it would run, then discard.
                        if (dryRun) tx.Rollback(); else tx.Commit();

                        WriteDdlAuditRow(conn, connectionKey, sql, guard.Verb, allowed: true, blockReason: null,
                            success: true, affected: affected, dryRun: dryRun, error: null, sw: sw);

                        return Request.CreateResponse(HttpStatusCode.OK, new {
                            success = true, affected, dryRun,
                            verb = guard.Verb,
                            message = dryRun ? "validated (rolled back, not persisted)" : "executed",
                            alreadyExists = false,
                        });
                    }
                    catch (System.Data.SqlClient.SqlException sqlEx)
                    {
                        try { if (tx != null) tx.Rollback(); } catch { }
                        // [P2-#2] Soft-catch "object already exists" — SQL error 2714 —
                        // so the app_batch flow can re-run safely against a database
                        // that already contains some of the requested tables. The
                        // FK / constraint dupes (1779, 2705, 2729) also count as
                        // already-exists for our purposes.
                        var alreadyExists = sqlEx.Number == 2714  // 'There is already an object named …'
                                          || sqlEx.Number == 1779  // 'Table … already has a primary key …'
                                          || sqlEx.Number == 2705  // 'Column names must be unique …'
                                          || sqlEx.Number == 2729  // 'Object … already exists'
                                          || sqlEx.Number == 4925; // 'cannot alter table … already exists'
                        WriteDdlAuditRow(conn, connectionKey, sql, guard.Verb, allowed: true, blockReason: null,
                            success: alreadyExists, affected: 0, dryRun: dryRun,
                            error: alreadyExists ? null : sqlEx.Message, sw: sw);
                        if (alreadyExists)
                        {
                            return Request.CreateResponse(HttpStatusCode.OK, new {
                                success = true, affected = 0, alreadyExists = true,
                                message = "object already exists (treated as success)",
                                sqlNumber = sqlEx.Number,
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                            success = false, error = sqlEx.Message, sqlNumber = sqlEx.Number,
                        });
                    }
                    catch (Exception exInner)
                    {
                        try { if (tx != null) tx.Rollback(); } catch { }
                        WriteDdlAuditRow(conn, connectionKey, sql, guard.Verb, allowed: true, blockReason: null,
                            success: false, affected: null, dryRun: dryRun, error: exInner.Message, sw: sw);
                        return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                            success = false, error = exInner.Message
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                // Connection / registry failure — audit best-effort on a fresh conn.
                TryWriteDdlAudit(connectionKey, sql, guard.Verb, allowed: true,
                    blockReason: null, success: false, affected: null, dryRun: dryRun, sw: sw, error: ex.Message);
                return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                    success = false, error = ex.Message
                });
            }
        }

        // ─────────────────────────────────────────────────────────────────
        //  [P1-3] MF_AiDdlAudit — every ExecuteDdl attempt (allowed/blocked,
        //  success/fail) is recorded: who, when, the SQL, the verdict + result.
        //  MSSQL DDL (DNN is always SQL Server). When ExecuteDdl is mirrored
        //  to Oqtane, port a provider-aware ensure/insert there.
        // ─────────────────────────────────────────────────────────────────
        private static bool _ddlAuditEnsured;

        private static void EnsureDdlAuditTable(System.Data.Common.DbConnection conn)
        {
            if (_ddlAuditEnsured) return;
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MF_AiDdlAudit') " +
                        "CREATE TABLE [dbo].[MF_AiDdlAudit]( " +
                        "  [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY, " +
                        "  [CreatedOnUtc] DATETIME2 NOT NULL CONSTRAINT DF_MF_AiDdlAudit_Created DEFAULT SYSUTCDATETIME(), " +
                        "  [PortalId] INT NULL, [UserId] INT NULL, [UserName] NVARCHAR(256) NULL, " +
                        "  [ConnectionKey] NVARCHAR(128) NULL, [Verb] NVARCHAR(64) NULL, " +
                        "  [Allowed] BIT NOT NULL, [BlockReason] NVARCHAR(512) NULL, " +
                        "  [Success] BIT NULL, [Affected] INT NULL, [DryRun] BIT NULL, " +
                        "  [DurationMs] INT NULL, [Error] NVARCHAR(1024) NULL, [Sql] NVARCHAR(MAX) NULL);";
                    cmd.CommandTimeout = 15;
                    cmd.ExecuteNonQuery();
                }
                _ddlAuditEnsured = true;
            }
            catch { /* audit is best-effort — never block the real operation */ }
        }

        private void WriteDdlAuditRow(System.Data.Common.DbConnection conn, string connectionKey, string sql, string verb,
            bool allowed, string blockReason, bool? success, int? affected, bool dryRun, string error,
            System.Diagnostics.Stopwatch sw)
        {
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "INSERT INTO [dbo].[MF_AiDdlAudit] " +
                        "([PortalId],[UserId],[UserName],[ConnectionKey],[Verb],[Allowed],[BlockReason],[Success],[Affected],[DryRun],[DurationMs],[Error],[Sql]) " +
                        "VALUES (@p,@u,@un,@ck,@v,@a,@br,@s,@af,@dr,@d,@e,@sql);";
                    cmd.CommandTimeout = 15;
                    AddParam(cmd, "@p",  CurrentPortalId);
                    AddParam(cmd, "@u",  UserInfo != null ? (object)UserInfo.UserID : DBNull.Value);
                    AddParam(cmd, "@un", UserInfo != null ? (object)UserInfo.Username : DBNull.Value);
                    AddParam(cmd, "@ck", (object)connectionKey ?? DBNull.Value);
                    AddParam(cmd, "@v",  (object)verb ?? DBNull.Value);
                    AddParam(cmd, "@a",  allowed);
                    AddParam(cmd, "@br", (object)blockReason ?? DBNull.Value);
                    AddParam(cmd, "@s",  success.HasValue ? (object)success.Value : DBNull.Value);
                    AddParam(cmd, "@af", affected.HasValue ? (object)affected.Value : DBNull.Value);
                    AddParam(cmd, "@dr", dryRun);
                    AddParam(cmd, "@d",  (int)sw.ElapsedMilliseconds);
                    AddParam(cmd, "@e",  (object)error ?? DBNull.Value);
                    AddParam(cmd, "@sql", (object)(sql ?? "") );
                    cmd.ExecuteNonQuery();
                }
            }
            catch { /* best-effort */ }
        }

        // Blocked / connection-failure path: open a fresh connection just to
        // record the attempt (the main connection was never opened or failed).
        private void TryWriteDdlAudit(string connectionKey, string sql, string verb,
            bool allowed, string blockReason, bool success, int? affected, bool dryRun,
            System.Diagnostics.Stopwatch sw, string error = null)
        {
            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(connectionKey, null, null))
                {
                    conn.Open();
                    EnsureDdlAuditTable(conn);
                    WriteDdlAuditRow(conn, connectionKey, sql, verb, allowed, blockReason, success, affected, dryRun, error, sw);
                }
            }
            catch { /* best-effort */ }
        }

        // ─────────────────────────────────────────────────────────────────
        //  [v20260531-DryRunValidate] DryRunValidate — pre-flight check for
        //  any SQL the AI is about to ship into a widgetProps.masterQuery,
        //  insertSql or DataGrid.column.optionsSql. Parses table references
        //  (FROM / INSERT INTO / UPDATE / ALTER TABLE / JOIN), checks each
        //  one against sys.tables, and returns the missing list so the AI
        //  can self-correct before the runtime form silently breaks.
        //
        //  Body shape:
        //    POST { sql: "...", connectionKey: "DashboardDatabase" }
        //  Response:
        //    {
        //      ok:           true | false,
        //      referenced:   ["dbo.Products", "dbo.Suppliers"],
        //      missing:      ["dbo.Customers"],
        //      suggestions:  { "dbo.Customers": "dbo.Customer" },
        //      message:      "..."
        //    }
        //
        //  Coupled with KB prompt-rule-check-table-exists (critical) — the
        //  AI MUST call this before any SQL hits the form.
        // ─────────────────────────────────────────────────────────────────
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("DryRunValidate")]
        public HttpResponseMessage DryRunValidate(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            var sql           = (string)body["sql"];
            var connectionKey = (string)body["connectionKey"];
            if (string.IsNullOrWhiteSpace(sql))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "sql required" });
            if (string.IsNullOrWhiteSpace(connectionKey)) connectionKey = "DashboardDatabase";

            try
            {
                // 1) Extract table refs via regex. Patterns matched (case-insensitive):
                //      FROM [schema].[table] | FROM table
                //      JOIN [schema].[table]
                //      INSERT INTO [schema].[table]
                //      UPDATE [schema].[table]
                //      ALTER TABLE [schema].[table]
                //      MERGE INTO [schema].[table]
                //      DELETE FROM [schema].[table]
                var rx = new System.Text.RegularExpressions.Regex(
                    @"\b(?:FROM|JOIN|INSERT\s+INTO|UPDATE|ALTER\s+TABLE|MERGE(?:\s+INTO)?|DELETE\s+FROM|TRUNCATE\s+TABLE)\s+(?:\[?(\w+)\]?\s*\.\s*)?\[?(\w+)\]?",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var matches = rx.Matches(sql);
                var referenced = new System.Collections.Generic.List<string>();
                foreach (System.Text.RegularExpressions.Match m in matches)
                {
                    var schema = string.IsNullOrEmpty(m.Groups[1].Value) ? "dbo" : m.Groups[1].Value;
                    var table  = m.Groups[2].Value;
                    if (string.IsNullOrEmpty(table)) continue;
                    var fq = schema + "." + table;
                    if (!referenced.Contains(fq, StringComparer.OrdinalIgnoreCase))
                        referenced.Add(fq);
                }

                if (referenced.Count == 0)
                {
                    return Request.CreateResponse(HttpStatusCode.OK, new {
                        ok = true, referenced = new string[0], missing = new string[0],
                        suggestions = new System.Collections.Generic.Dictionary<string, string>(),
                        message = "No table refs detected (passthrough).",
                    });
                }

                // 2) Pull all real tables from sys.tables for fuzzy-suggestion.
                var existing = new System.Collections.Generic.List<string>();
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(connectionKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "SELECT s.name + '.' + t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id ORDER BY s.name, t.name";
                        cmd.CommandTimeout = 10;
                        using (var rdr = cmd.ExecuteReader())
                        {
                            while (rdr.Read()) existing.Add(rdr.GetString(0));
                        }
                    }
                }

                // 3) Compute missing + suggestions (Levenshtein-1 / case fold / contains).
                var missing = new System.Collections.Generic.List<string>();
                var suggestions = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var fq in referenced)
                {
                    if (existing.Contains(fq, StringComparer.OrdinalIgnoreCase)) continue;
                    missing.Add(fq);
                    // Pick the closest existing table (case-insensitive contains, then prefix, then any).
                    var bareTable = fq.Substring(fq.IndexOf('.') + 1);
                    string suggest = null;
                    foreach (var e in existing)
                    {
                        var bareE = e.Substring(e.IndexOf('.') + 1);
                        if (string.Equals(bareE, bareTable, StringComparison.OrdinalIgnoreCase)) { suggest = e; break; }
                        if (bareE.IndexOf(bareTable, StringComparison.OrdinalIgnoreCase) >= 0
                            || bareTable.IndexOf(bareE, StringComparison.OrdinalIgnoreCase) >= 0)
                        { if (suggest == null) suggest = e; }
                    }
                    if (suggest != null) suggestions[fq] = suggest;
                }

                var ok = missing.Count == 0;
                return Request.CreateResponse(HttpStatusCode.OK, new {
                    ok,
                    referenced,
                    missing,
                    suggestions,
                    message = ok
                        ? "All referenced tables exist."
                        : "Missing table(s) — fix the SQL or run ExecuteDdl to create them.",
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                    ok = false, error = ex.Message
                });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [P3-#1] CustomTableRows — read live rows from the custom DB
        //  table a form is bound to (via settings.databaseInsert.insertSql).
        //
        //  Background: when a form has Save-to-custom-DB enabled, each
        //  submission INSERTs a row into the customer's table. The default
        //  submission dashboard reads MF_Submissions JSON, NOT the custom
        //  table — so admins see a denormalized JSON snapshot rather than
        //  the actual table rows. This endpoint exposes the live table so
        //  the dashboard can show real rows + (Phase 3.2) edit / delete.
        //
        //  Body shape:
        //    GET /AiTools/CustomTableRows?formId=N&page=1&pageSize=50
        //  Response:
        //    {tableName, schemaName, idColumn, columns:[{name,type}],
        //     rows:[[…]], total, page, pageSize}
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("CustomTableRows")]
        public HttpResponseMessage CustomTableRows(int formId, int page = 1, int pageSize = 50)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (formId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });

            var form = FormRepository.GetForm(formId);
            if (form == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "form not found" });

            // Pull databaseInsert.insertSql from settings.json
            var insertSql     = (string)null;
            var connectionKey = "DashboardDatabase";
            try
            {
                if (!string.IsNullOrWhiteSpace(form.SettingsJson))
                {
                    var s = Newtonsoft.Json.Linq.JObject.Parse(form.SettingsJson);
                    var di = s["databaseInsert"] ?? s["DatabaseInsert"];
                    if (di != null)
                    {
                        var enabled = (bool?)(di["enabled"] ?? di["Enabled"]) ?? false;
                        if (!enabled) return Request.CreateResponse(HttpStatusCode.NotFound,
                            new { error = "form has no database INSERT enabled — JSON submissions only", hint = "Enable Settings → Database section" });
                        insertSql     = (string)(di["insertSql"] ?? di["InsertSql"]);
                        connectionKey = (string)(di["connectionKey"] ?? di["ConnectionKey"]) ?? connectionKey;
                    }
                }
            }
            catch (Exception parseEx)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "settings.json parse failed", detail = parseEx.Message });
            }
            if (string.IsNullOrWhiteSpace(insertSql))
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "form is not bound to a custom DB table" });

            // Parse "INSERT INTO [schema].[Table]" → table identity
            var m = System.Text.RegularExpressions.Regex.Match(insertSql,
                @"INSERT\s+INTO\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!m.Success)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "could not parse table from insertSql", insertSql });
            var schemaName = m.Groups[2].Success ? m.Groups[1].Value : "dbo";
            var tableName  = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[1].Value;
            // Sanitize — only word chars allowed in identifiers we splice into SQL
            if (!System.Text.RegularExpressions.Regex.IsMatch(schemaName, @"^\w+$") ||
                !System.Text.RegularExpressions.Regex.IsMatch(tableName,  @"^\w+$"))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "invalid identifier" });

            page     = Math.Max(1, page);
            pageSize = Math.Max(1, Math.Min(pageSize, 500));

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(connectionKey, null, null))
                {
                    conn.Open();
                    // total count
                    int total = 0;
                    using (var c = conn.CreateCommand())
                    {
                        c.CommandText = "SELECT COUNT(*) FROM [" + schemaName + "].[" + tableName + "]";
                        c.CommandTimeout = 15;
                        var o = c.ExecuteScalar();
                        total = o == null || o == DBNull.Value ? 0 : Convert.ToInt32(o);
                    }
                    // Page rows — guess Id column = first IDENTITY column; for simplicity ORDER BY 1 DESC
                    using (var c = conn.CreateCommand())
                    {
                        c.CommandText = "SELECT * FROM [" + schemaName + "].[" + tableName + "] ORDER BY 1 DESC OFFSET " + ((page - 1) * pageSize) + " ROWS FETCH NEXT " + pageSize + " ROWS ONLY";
                        c.CommandTimeout = 30;
                        using (var r = c.ExecuteReader())
                        {
                            var cols = new System.Collections.Generic.List<object>();
                            for (int i = 0; i < r.FieldCount; i++)
                                cols.Add(new { name = r.GetName(i), type = r.GetDataTypeName(i) });
                            var rows = new System.Collections.Generic.List<object[]>();
                            while (r.Read())
                            {
                                var row = new object[r.FieldCount];
                                for (int i = 0; i < r.FieldCount; i++)
                                    row[i] = r.IsDBNull(i) ? null : r.GetValue(i);
                                rows.Add(row);
                            }
                            return Request.CreateResponse(HttpStatusCode.OK, new {
                                tableName, schemaName,
                                idColumn = r.FieldCount > 0 ? r.GetName(0) : "Id",
                                columns = cols, rows, total, page, pageSize,
                                source = "custom-db-live",
                                hint = "These are LIVE rows from [" + schemaName + "].[" + tableName + "]. Edits via /DeleteCustomTableRow + /UpdateCustomTableRow (Phase 3.2)",
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message, table = schemaName + "." + tableName });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [R1.4 v20260531-01] DataGridPrefs — get / save per-user column
        //  ordering, widths, sort chains, and named filter views for a
        //  specific DataGrid widget instance.
        //
        //  GET  /AiTools/DataGridPrefs?formId=N&fieldKey=K          → all rows for current user
        //  POST /AiTools/DataGridPrefs                              → upsert
        //    body: { formId, fieldKey, viewName?, configJson, isDefault? }
        //  POST /AiTools/DataGridPrefs/Delete                       → delete by viewName
        //    body: { formId, fieldKey, viewName }
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("DataGridPrefs")]
        public HttpResponseMessage DataGridPrefsGet(int formId, string fieldKey)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and fieldKey required" });
            try
            {
                var userId = UserInfo?.UserID > 0 ? UserInfo.UserID : -1;
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
SELECT Id, ViewName, ConfigJson, IsDefault, UpdatedOnUtc
FROM dbo.MF_DataGridUserPrefs
WHERE FormId = @fid AND FieldKey = @fk AND UserId = @uid
ORDER BY IsDefault DESC, ViewName";
                        cmd.CommandTimeout = 8;
                        var p1 = cmd.CreateParameter(); p1.ParameterName = "@fid"; p1.Value = formId;  cmd.Parameters.Add(p1);
                        var p2 = cmd.CreateParameter(); p2.ParameterName = "@fk";  p2.Value = fieldKey; cmd.Parameters.Add(p2);
                        var p3 = cmd.CreateParameter(); p3.ParameterName = "@uid"; p3.Value = userId;  cmd.Parameters.Add(p3);
                        var views = new System.Collections.Generic.List<object>();
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                views.Add(new {
                                    id = r.GetInt32(0),
                                    viewName = r.IsDBNull(1) ? null : r.GetString(1),
                                    configJson = r.IsDBNull(2) ? "{}" : r.GetString(2),
                                    isDefault = !r.IsDBNull(3) && r.GetBoolean(3),
                                    updatedOnUtc = r.IsDBNull(4) ? (System.DateTime?)null : r.GetDateTime(4),
                                });
                            }
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { formId, fieldKey, userId, views, badge = "DataGridPrefs v20260531-R1.4" });
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("DataGridPrefs")]
        public HttpResponseMessage DataGridPrefsSave(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });
            int formId = (int?)body["formId"] ?? 0;
            var fieldKey = (string)body["fieldKey"];
            var viewName = (string)body["viewName"];
            var configJson = body["configJson"];
            bool isDefault = (bool?)body["isDefault"] ?? false;
            if (formId <= 0 || string.IsNullOrWhiteSpace(fieldKey))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId and fieldKey required" });
            if (configJson == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "configJson required" });
            var configStr = configJson.Type == Newtonsoft.Json.Linq.JTokenType.String
                ? (string)configJson
                : configJson.ToString(Newtonsoft.Json.Formatting.None);
            try
            {
                var userId = UserInfo?.UserID > 0 ? UserInfo.UserID : -1;
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
MERGE dbo.MF_DataGridUserPrefs AS T
USING (SELECT @fid AS FormId, @fk AS FieldKey, @uid AS UserId, @vn AS ViewName) AS S
   ON T.FormId = S.FormId AND T.FieldKey = S.FieldKey AND T.UserId = S.UserId AND ISNULL(T.ViewName, N'') = ISNULL(S.ViewName, N'')
WHEN MATCHED THEN
    UPDATE SET ConfigJson = @cfg, IsDefault = @def, UpdatedOnUtc = SYSUTCDATETIME()
WHEN NOT MATCHED THEN
    INSERT (PortalId, FormId, FieldKey, UserId, ViewName, ConfigJson, IsDefault, CreatedOnUtc)
    VALUES (NULL, @fid, @fk, @uid, @vn, @cfg, @def, SYSUTCDATETIME());";
                        cmd.CommandTimeout = 8;
                        var p1 = cmd.CreateParameter(); p1.ParameterName = "@fid"; p1.Value = formId;  cmd.Parameters.Add(p1);
                        var p2 = cmd.CreateParameter(); p2.ParameterName = "@fk";  p2.Value = fieldKey; cmd.Parameters.Add(p2);
                        var p3 = cmd.CreateParameter(); p3.ParameterName = "@uid"; p3.Value = userId;  cmd.Parameters.Add(p3);
                        var p4 = cmd.CreateParameter(); p4.ParameterName = "@vn";  p4.Value = string.IsNullOrWhiteSpace(viewName) ? (object)DBNull.Value : viewName; cmd.Parameters.Add(p4);
                        var p5 = cmd.CreateParameter(); p5.ParameterName = "@cfg"; p5.Value = configStr; cmd.Parameters.Add(p5);
                        var p6 = cmd.CreateParameter(); p6.ParameterName = "@def"; p6.Value = isDefault; cmd.Parameters.Add(p6);
                        cmd.ExecuteNonQuery();
                        return Request.CreateResponse(HttpStatusCode.OK, new { success = true, formId, fieldKey, viewName, userId });
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [R4 v20260531-01] AppEndpoint — generic dispatcher for
        //  per-app HTTP endpoints registered in MF_AppEndpoints.
        //
        //  Route: GET /DesktopModules/MegaForm/API/AiTools/AppEndpoint?app=<slug>&endpoint=<slug>
        //  (POST + DELETE follow same query-string contract; HttpVerb match.)
        //
        //  v1: SQL mode only. The endpoint's SqlOrSource is executed against
        //  ConnectionKey with :token parameters bound from the query string.
        //  Future: razor mode (HookRuntime enum already provides for this).
        //
        //  Security:
        //   - Endpoint.AllowAnonymous + Endpoint.AllowedRoles enforced here.
        //   - Endpoint must be Enabled = 1.
        //   - SqlOrSource is sanitized via the existing IsDangerousVerb guard.
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [AllowAnonymous]
        [ActionName("AppEndpoint")]
        public HttpResponseMessage AppEndpoint(string app, string endpoint)
        {
            if (string.IsNullOrWhiteSpace(app) || string.IsNullOrWhiteSpace(endpoint))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "app and endpoint required" });

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                int appId; string connKey, sqlText, allowedRoles, endpointMode = "sql"; bool allowAnon, enabled;
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
SELECT TOP 1 e.AppId, e.ConnectionKey, e.SqlOrSource, e.AllowedRoles, e.AllowAnonymous, e.Enabled, e.Mode
FROM dbo.MF_AppEndpoints e
JOIN dbo.MF_Apps a ON a.Id = e.AppId
WHERE a.Slug = @app AND e.Slug = @endpoint AND e.HttpVerb = 'GET'";
                        cmd.CommandTimeout = 8;
                        var p1 = cmd.CreateParameter(); p1.ParameterName = "@app";      p1.Value = app;      cmd.Parameters.Add(p1);
                        var p2 = cmd.CreateParameter(); p2.ParameterName = "@endpoint"; p2.Value = endpoint; cmd.Parameters.Add(p2);
                        using (var rdr = cmd.ExecuteReader())
                        {
                            if (!rdr.Read())
                                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "endpoint not found" });
                            appId         = Convert.ToInt32(rdr["AppId"]);
                            connKey       = Convert.ToString(rdr["ConnectionKey"]);
                            sqlText       = Convert.ToString(rdr["SqlOrSource"]);
                            allowedRoles  = Convert.ToString(rdr["AllowedRoles"]);
                            allowAnon     = Convert.ToBoolean(rdr["AllowAnonymous"]);
                            enabled       = Convert.ToBoolean(rdr["Enabled"]);
                            endpointMode  = Convert.ToString(rdr["Mode"]);
                        }
                    }
                }
                if (!enabled)
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "endpoint disabled" });
                if (!allowAnon)
                {
                    var user = UserInfo;
                    if (user == null || user.UserID <= 0)
                        return Request.CreateResponse(HttpStatusCode.Unauthorized, new { error = "authentication required" });
                    var requiredRoles = (allowedRoles ?? string.Empty).Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).ToArray();
                    if (requiredRoles.Length > 0)
                    {
                        bool inAnyRole = requiredRoles.Any(rn => user.IsInRole(rn));
                        if (!inAnyRole)
                            return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "role not permitted", required = requiredRoles });
                    }
                }
                if (string.IsNullOrWhiteSpace(sqlText))
                    return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "endpoint has no source" });

                // [R4 v20260531-razor-01] Razor JIT mode — endpoint source is a
                // tiny C# snippet evaluated by the dynamic compiler. The host
                // surface exposes `query` (IDictionary<string,string> of the
                // request's query-string), and the snippet must return any
                // serializable object (an array, dictionary, or anonymous
                // type). Use cases: simple transforms, format conversions,
                // composed multi-SQL responses. Not for SQL writes — use
                // app_batch / ExecuteDdl for that.
                if (string.Equals(endpointMode, "razor", StringComparison.OrdinalIgnoreCase))
                {
                    var queryDict = Request.GetQueryNameValuePairs().ToDictionary(p => p.Key, p => p.Value, StringComparer.OrdinalIgnoreCase);
                    var razorRunner = MegaForm.Core.Services.AppEndpointRazorRunner.Default;
                    var razorResult = razorRunner.Run(sqlText, queryDict);
                    if (!razorResult.Success)
                        return Request.CreateResponse(HttpStatusCode.BadRequest, new {
                            error = "razor handler failed",
                            detail = razorResult.ErrorMessage,
                            badge = "AppEndpoint v20260531-R4-razor"
                        });
                    return Request.CreateResponse(HttpStatusCode.OK, new {
                        app, endpoint,
                        mode = "razor",
                        result = razorResult.Value,
                        badge = "AppEndpoint v20260531-R4-razor"
                    });
                }

                // SQL mode (default) — destructive-verb guard + SELECT/WITH only.
                var up = sqlText.ToUpperInvariant();
                if (up.Contains("DROP DATABASE") || up.Contains("TRUNCATE TABLE") || up.Contains("XP_CMDSHELL") || up.Contains("SHUTDOWN"))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "destructive verb rejected" });
                var firstWord = up.TrimStart().Split(new[] { ' ', '\t', '\r', '\n' }, 2)[0];
                if (firstWord != "SELECT" && firstWord != "WITH")
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "endpoint SQL must be SELECT (or WITH/CTE)" });
                // [SecFix 2026-07-03 P0-7] A leading SELECT/WITH is NOT enough: "WITH cte AS (...) DELETE
                // FROM Users" passes the first-word check yet mutates data. This is a read-only display
                // endpoint, so reject any DML/DDL/exec keyword appearing ANYWHERE (word-boundary), which
                // closes the CTE-hidden-write bypass. False positives (the word in a string literal) are
                // acceptable for an admin-authored read endpoint.
                if (System.Text.RegularExpressions.Regex.IsMatch(up,
                        @"\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|RENAME|EXEC|EXECUTE|GRANT|REVOKE|DENY|BACKUP|RESTORE|RECONFIGURE|OPENROWSET|OPENQUERY|OPENDATASOURCE|WAITFOR)\b|\bXP_|\bSP_",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "endpoint SQL must be read-only (no DML/DDL, even inside a CTE)" });

                // Bind query-string params as :token => value (or @token).
                using (var conn = registry.GetConnection(string.IsNullOrWhiteSpace(connKey) ? "DashboardDatabase" : connKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        // Normalize :name → @name for SqlClient.
                        var sql = System.Text.RegularExpressions.Regex.Replace(sqlText, @":([a-zA-Z_][a-zA-Z0-9_]*)", "@$1");
                        cmd.CommandText = sql;
                        cmd.CommandTimeout = 20;
                        // Extract @tokens
                        var tokens = System.Text.RegularExpressions.Regex.Matches(sql, @"@([a-zA-Z_][a-zA-Z0-9_]*)")
                            .Cast<System.Text.RegularExpressions.Match>().Select(m => m.Groups[1].Value).Distinct().ToList();
                        var query = Request.GetQueryNameValuePairs().ToDictionary(p => p.Key, p => p.Value, StringComparer.OrdinalIgnoreCase);
                        foreach (var t in tokens)
                        {
                            // Skip the routing tokens themselves.
                            if (string.Equals(t, "app", StringComparison.OrdinalIgnoreCase) || string.Equals(t, "endpoint", StringComparison.OrdinalIgnoreCase)) continue;
                            var p = cmd.CreateParameter(); p.ParameterName = "@" + t;
                            p.Value = query.TryGetValue(t, out var v) ? (object)v : DBNull.Value;
                            cmd.Parameters.Add(p);
                        }
                        var cols = new System.Collections.Generic.List<object>();
                        var rows = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
                        using (var rdr = cmd.ExecuteReader())
                        {
                            for (int i = 0; i < rdr.FieldCount; i++)
                                cols.Add(new { name = rdr.GetName(i), type = rdr.GetDataTypeName(i) });
                            while (rdr.Read())
                            {
                                var d = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                                for (int i = 0; i < rdr.FieldCount; i++)
                                    d[rdr.GetName(i)] = rdr.IsDBNull(i) ? null : rdr.GetValue(i);
                                rows.Add(d);
                            }
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new {
                            app, endpoint, rowCount = rows.Count, columns = cols, rows,
                            badge = "AppEndpoint v20260531-R4-01"
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [B8.A v20260601-01] ExportApp — package a whole app into a .zip
        //  manifest the customer can re-install on another DNN/Oqtane site.
        //
        //  GET /AiTools/ExportApp?appId=N  -> application/zip
        //
        //  Manifest contents:
        //    manifest.json     — {appSlug, title, color, version, forms:[], tables:[], kb:[]}
        //    forms/<id>.json   — each form's full SchemaJson + SettingsJson
        //    ddl/<table>.sql   — CREATE TABLE captured by inspecting sys.columns
        //    kb/index.json     — KB entries tagged with the app's slug
        //    README.md         — install instructions
        //
        //  The .zip is the foundation for starter-kit installs.
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("ExportApp")]
        public HttpResponseMessage ExportApp(int appId)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (appId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "appId required" });

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                string appSlug = null, appTitle = null, appColor = null, appDescription = null;
                var forms = new System.Collections.Generic.List<(int Id, string Title, string SchemaJson, string SettingsJson)>();
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "SELECT Slug, Title, Color, Description FROM dbo.MF_Apps WHERE Id = @aid";
                        cmd.CommandTimeout = 8;
                        var p1 = cmd.CreateParameter(); p1.ParameterName = "@aid"; p1.Value = appId; cmd.Parameters.Add(p1);
                        using (var r = cmd.ExecuteReader())
                        {
                            if (!r.Read()) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "app not found" });
                            appSlug = (string)r["Slug"];
                            appTitle = (string)r["Title"];
                            appColor = r["Color"] == DBNull.Value ? null : (string)r["Color"];
                            appDescription = r["Description"] == DBNull.Value ? null : (string)r["Description"];
                        }
                    }
                    using (var cmd2 = conn.CreateCommand())
                    {
                        cmd2.CommandText = "SELECT FormId, Title, SchemaJson, SettingsJson FROM dbo.MF_Forms WHERE AppId = @aid ORDER BY FormId";
                        var p2 = cmd2.CreateParameter(); p2.ParameterName = "@aid"; p2.Value = appId; cmd2.Parameters.Add(p2);
                        using (var r = cmd2.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                forms.Add((Convert.ToInt32(r["FormId"]),
                                           Convert.ToString(r["Title"]),
                                           r["SchemaJson"] == DBNull.Value ? null : Convert.ToString(r["SchemaJson"]),
                                           r["SettingsJson"] == DBNull.Value ? null : Convert.ToString(r["SettingsJson"])));
                            }
                        }
                    }
                }

                // Discover the unique set of bound tables across all forms' databaseInsert.insertSql.
                var tableSet = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var insertRx = new System.Text.RegularExpressions.Regex(@"INSERT\s+INTO\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                foreach (var f in forms)
                {
                    if (string.IsNullOrWhiteSpace(f.SettingsJson)) continue;
                    try
                    {
                        var s = Newtonsoft.Json.Linq.JObject.Parse(f.SettingsJson);
                        var sql = (string)(s["databaseInsert"]?["insertSql"] ?? s["DatabaseInsert"]?["InsertSql"]);
                        if (string.IsNullOrWhiteSpace(sql)) continue;
                        var m = insertRx.Match(sql);
                        if (!m.Success) continue;
                        var table = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[1].Value;
                        if (System.Text.RegularExpressions.Regex.IsMatch(table, @"^\w+$")) tableSet.Add(table);
                    } catch { /* ignore parse failures */ }
                }
                // Also pull DataGrid widgetProps.tableName references from each schema.
                foreach (var f in forms)
                {
                    if (string.IsNullOrWhiteSpace(f.SchemaJson)) continue;
                    try
                    {
                        var s = Newtonsoft.Json.Linq.JObject.Parse(f.SchemaJson);
                        void Walk(Newtonsoft.Json.Linq.JArray arr) {
                            if (arr == null) return;
                            foreach (var t in arr)
                            {
                                if (!(t is Newtonsoft.Json.Linq.JObject o)) continue;
                                var wp = o["widgetProps"] as Newtonsoft.Json.Linq.JObject;
                                var tn = (string)(wp?["tableName"]);
                                if (!string.IsNullOrWhiteSpace(tn) && System.Text.RegularExpressions.Regex.IsMatch(tn, @"^\w+$")) tableSet.Add(tn);
                                if (o["columns"] is Newtonsoft.Json.Linq.JArray cols)
                                    foreach (var c in cols)
                                        if (c is Newtonsoft.Json.Linq.JObject co && co["fields"] is Newtonsoft.Json.Linq.JArray inner)
                                            Walk(inner);
                            }
                        }
                        Walk(s["fields"] as Newtonsoft.Json.Linq.JArray);
                    } catch { /* ignore */ }
                }

                // Capture sys.columns for each referenced table → CREATE TABLE blueprint.
                var ddlByTable = new System.Collections.Generic.Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                if (tableSet.Count > 0)
                {
                    using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                    {
                        conn.Open();
                        foreach (var t in tableSet)
                        {
                            using (var cmd = conn.CreateCommand())
                            {
                                cmd.CommandText = @"
SELECT c.name, ty.name AS type_name, c.max_length, c.is_nullable, c.is_identity,
       CAST(CASE WHEN EXISTS (SELECT 1 FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id WHERE i.object_id=c.object_id AND i.is_primary_key=1 AND ic.column_id=c.column_id) THEN 1 ELSE 0 END AS BIT) AS is_pk
FROM sys.columns c
JOIN sys.types  ty ON c.user_type_id = ty.user_type_id
WHERE c.object_id = OBJECT_ID(@t)
ORDER BY c.column_id";
                                var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = "dbo." + t; cmd.Parameters.Add(p);
                                var sb = new System.Text.StringBuilder();
                                sb.AppendLine("IF OBJECT_ID('[dbo].[" + t + "]', 'U') IS NULL");
                                sb.AppendLine("BEGIN");
                                sb.AppendLine("    CREATE TABLE [dbo].[" + t + "] (");
                                var pkCols = new System.Collections.Generic.List<string>();
                                var colDefs = new System.Collections.Generic.List<string>();
                                using (var r = cmd.ExecuteReader())
                                {
                                    while (r.Read())
                                    {
                                        var cn = (string)r["name"];
                                        var tn = (string)r["type_name"];
                                        var ml = Convert.ToInt32(r["max_length"]);
                                        var nullable = Convert.ToBoolean(r["is_nullable"]);
                                        var ident = Convert.ToBoolean(r["is_identity"]);
                                        var pk = Convert.ToBoolean(r["is_pk"]);
                                        var typeStr = tn;
                                        if (tn == "nvarchar" || tn == "nchar") typeStr += ml < 0 ? "(MAX)" : "(" + (ml / 2) + ")";
                                        else if (tn == "varchar" || tn == "char") typeStr += ml < 0 ? "(MAX)" : "(" + ml + ")";
                                        var line = "        [" + cn + "] " + typeStr.ToUpperInvariant();
                                        if (ident) line += " IDENTITY(1,1)";
                                        line += nullable ? " NULL" : " NOT NULL";
                                        colDefs.Add(line);
                                        if (pk) pkCols.Add("[" + cn + "]");
                                    }
                                }
                                if (colDefs.Count == 0) continue;
                                if (pkCols.Count > 0)
                                    colDefs.Add("        CONSTRAINT PK_" + t + " PRIMARY KEY (" + string.Join(", ", pkCols) + ")");
                                sb.AppendLine(string.Join(","+System.Environment.NewLine, colDefs));
                                sb.AppendLine("    );");
                                sb.AppendLine("END;");
                                ddlByTable[t] = sb.ToString();
                            }
                        }
                    }
                }

                // Pull KB entries tagged with the app slug.
                var kbEntries = new System.Collections.Generic.List<object>();
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "SELECT Slug, Kind, Title, Summary, Body, Tags FROM dbo.MF_AI_Knowledge WHERE Tags LIKE @tag";
                        var p = cmd.CreateParameter(); p.ParameterName = "@tag"; p.Value = "%starter-" + appSlug + "%"; cmd.Parameters.Add(p);
                        cmd.CommandTimeout = 6;
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                                kbEntries.Add(new {
                                    slug    = (string)r["Slug"],
                                    kind    = (string)r["Kind"],
                                    title   = (string)r["Title"],
                                    summary = r["Summary"] == DBNull.Value ? null : (string)r["Summary"],
                                    body    = r["Body"] == DBNull.Value ? null : (string)r["Body"],
                                    tags    = r["Tags"] == DBNull.Value ? null : (string)r["Tags"],
                                });
                        }
                    }
                }

                // Build the manifest object.
                var manifest = new {
                    schemaVersion = "1.0",
                    exportedOnUtc = DateTime.UtcNow.ToString("o"),
                    app = new { slug = appSlug, title = appTitle, color = appColor, description = appDescription },
                    forms = forms.Select(f => new { id = f.Id, title = f.Title, file = "forms/" + f.Id + ".json" }).ToList(),
                    tables = tableSet.Select(t => new { name = t, file = "ddl/" + t + ".sql" }).ToList(),
                    kb = new { count = kbEntries.Count, file = "kb/index.json" },
                };

                // Stream a ZIP back.
                var ms = new System.IO.MemoryStream();
                using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Create, true))
                {
                    void Write(string entryName, string body)
                    {
                        var e = zip.CreateEntry(entryName, System.IO.Compression.CompressionLevel.Optimal);
                        using (var w = new System.IO.StreamWriter(e.Open(), new System.Text.UTF8Encoding(false))) w.Write(body);
                    }
                    Write("manifest.json", Newtonsoft.Json.JsonConvert.SerializeObject(manifest, Newtonsoft.Json.Formatting.Indented));
                    foreach (var f in forms)
                    {
                        var bundle = new {
                            id = f.Id, title = f.Title,
                            schemaJson = f.SchemaJson,
                            settingsJson = f.SettingsJson,
                        };
                        Write("forms/" + f.Id + ".json", Newtonsoft.Json.JsonConvert.SerializeObject(bundle, Newtonsoft.Json.Formatting.Indented));
                    }
                    foreach (var kv in ddlByTable) Write("ddl/" + kv.Key + ".sql", kv.Value);
                    Write("kb/index.json", Newtonsoft.Json.JsonConvert.SerializeObject(kbEntries, Newtonsoft.Json.Formatting.Indented));
                    Write("README.md",
                        "# MegaForm app package — " + appTitle + "\n\n" +
                        "Slug: `" + appSlug + "`  ·  Forms: " + forms.Count + "  ·  Tables: " + tableSet.Count + "  ·  KB entries: " + kbEntries.Count + "\n\n" +
                        "## Install\n\n" +
                        "POST this zip to `/AiTools/ImportApp` on the target site (admin auth + ValidateAntiForgeryToken required).\n\n" +
                        "The dispatcher will:\n" +
                        "1. Create the app row in `MF_Apps` if missing.\n" +
                        "2. Run every `ddl/*.sql` (IF NOT EXISTS guarded — safe to re-run).\n" +
                        "3. Create each form (or reuse if a form with the same title already exists in the app).\n" +
                        "4. Upsert every KB entry from `kb/index.json`.\n\n" +
                        "Exported on " + DateTime.UtcNow.ToString("o") + ".\n");
                }
                ms.Position = 0;

                var resp = new HttpResponseMessage(HttpStatusCode.OK);
                resp.Content = new System.Net.Http.ByteArrayContent(ms.ToArray());
                resp.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/zip");
                resp.Content.Headers.ContentDisposition = new System.Net.Http.Headers.ContentDispositionHeaderValue("attachment") {
                    FileName = "megaform-app-" + appSlug + ".zip"
                };
                return resp;
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [B8.A v20260601-01] ImportApp — consume a .zip produced by
        //  ExportApp (or a built-in starter kit) and install it on this
        //  site. The dispatcher:
        //    1. Reads manifest.json
        //    2. Upserts an MF_Apps row (slug must be unique per site)
        //    3. Runs every ddl/*.sql (each file is IF-OBJECT_ID guarded)
        //    4. Creates each forms/<n>.json into MF_Forms (or links into
        //       an existing matching Title if -overwrite=true is sent)
        //    5. Upserts every entry from kb/index.json into MF_AI_Knowledge
        //
        //  POST /AiTools/ImportApp        multipart/form-data: file=zip
        //  Returns: {ok:true, appId, appSlug, forms:[{oldId,newId,title}], tables:[name,...], kb:N}
        // ═════════════════════════════════════════════════════════════════
        [HttpPost]
        [ActionName("ImportApp")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> ImportApp()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (!Request.Content.IsMimeMultipartContent())
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "multipart required" });

            byte[] zipBytes = null;
            try
            {
                var provider = new System.Net.Http.MultipartMemoryStreamProvider();
                await Request.Content.ReadAsMultipartAsync(provider);
                foreach (var part in provider.Contents)
                {
                    var name = part.Headers.ContentDisposition?.Name?.Trim('"');
                    if (string.Equals(name, "file", StringComparison.OrdinalIgnoreCase))
                    {
                        zipBytes = await part.ReadAsByteArrayAsync();
                        break;
                    }
                }
                if (zipBytes == null || zipBytes.Length == 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "no file part" });

                return DoImportApp(zipBytes);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [B8.B v20260601-01] InstallStarterKit — install a built-in starter
        //  kit by name (Purchase Order, Recruitment, Blog). The kit zips are
        //  stored under DesktopModules/MegaForm/starters/<name>.zip and are
        //  installed via the same DoImportApp pipeline as user uploads.
        //
        //  POST /AiTools/InstallStarterKit  { name: 'purchase-order' }
        // ═════════════════════════════════════════════════════════════════
        public class InstallStarterRequest { public string name { get; set; } }

        [HttpPost]
        [ActionName("InstallStarterKit")]
        public HttpResponseMessage InstallStarterKit([FromBody] InstallStarterRequest req)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (req == null || string.IsNullOrWhiteSpace(req.name))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "name required" });
            if (!System.Text.RegularExpressions.Regex.IsMatch(req.name, @"^[a-z][a-z0-9\-]{2,40}$"))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "invalid name" });
            try
            {
                var path = System.Web.Hosting.HostingEnvironment.MapPath(
                    "~/DesktopModules/MegaForm/starters/" + req.name + ".zip");
                if (path == null || !System.IO.File.Exists(path))
                    return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "kit not found: " + req.name });
                var bytes = System.IO.File.ReadAllBytes(path);
                return DoImportApp(bytes);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        [HttpGet]
        [ActionName("StarterKits")]
        public HttpResponseMessage StarterKits()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            try
            {
                var dir = System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm/starters/");
                var list = new System.Collections.Generic.List<object>();
                if (dir != null && System.IO.Directory.Exists(dir))
                {
                    foreach (var f in System.IO.Directory.GetFiles(dir, "*.zip"))
                    {
                        try
                        {
                            using (var fs = System.IO.File.OpenRead(f))
                            using (var zip = new System.IO.Compression.ZipArchive(fs, System.IO.Compression.ZipArchiveMode.Read))
                            {
                                var entry = zip.GetEntry("manifest.json");
                                if (entry == null) continue;
                                using (var sr = new System.IO.StreamReader(entry.Open()))
                                {
                                    var mf = Newtonsoft.Json.Linq.JObject.Parse(sr.ReadToEnd());
                                    var app = mf["app"] as Newtonsoft.Json.Linq.JObject;
                                    list.Add(new {
                                        name = System.IO.Path.GetFileNameWithoutExtension(f),
                                        slug = (string)app?["slug"],
                                        title = (string)app?["title"],
                                        color = (string)app?["color"],
                                        description = (string)app?["description"],
                                        formCount = ((Newtonsoft.Json.Linq.JArray)mf["forms"])?.Count ?? 0,
                                        tableCount = ((Newtonsoft.Json.Linq.JArray)mf["tables"])?.Count ?? 0,
                                        sizeKb = (int)Math.Round(new System.IO.FileInfo(f).Length / 1024.0),
                                    });
                                }
                            }
                        }
                        catch { /* skip bad zip */ }
                    }
                }
                return Request.CreateResponse(HttpStatusCode.OK, new { kits = list });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ─── Shared zip → install pipeline used by both ImportApp and InstallStarterKit ───
        private HttpResponseMessage DoImportApp(byte[] zipBytes)
        {
            using (var ms = new System.IO.MemoryStream(zipBytes))
            using (var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Read))
            {
                var manifestEntry = zip.GetEntry("manifest.json");
                if (manifestEntry == null)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "manifest.json missing" });
                Newtonsoft.Json.Linq.JObject manifest;
                using (var sr = new System.IO.StreamReader(manifestEntry.Open()))
                    manifest = Newtonsoft.Json.Linq.JObject.Parse(sr.ReadToEnd());

                var appNode = manifest["app"] as Newtonsoft.Json.Linq.JObject ?? throw new Exception("manifest.app missing");
                var appSlug = (string)appNode["slug"]; if (string.IsNullOrWhiteSpace(appSlug)) throw new Exception("manifest.app.slug missing");
                if (!System.Text.RegularExpressions.Regex.IsMatch(appSlug, @"^[a-z][a-z0-9\-]{1,40}$"))
                    throw new Exception("manifest.app.slug invalid");
                var appTitle = (string)appNode["title"] ?? appSlug;
                var appColor = (string)appNode["color"];
                var appDescription = (string)appNode["description"];

                var registry = new DnnConnectionRegistry(GetHostSetting);
                int appId;
                var formsResult = new System.Collections.Generic.List<object>();
                var tablesRun = new System.Collections.Generic.List<string>();
                int kbCount = 0;

                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();

                    // 1) Upsert app
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM dbo.MF_Apps WHERE Slug = @slug)
    UPDATE dbo.MF_Apps SET Title=@title, Description=@desc, Color=@color WHERE Slug=@slug;
ELSE
    INSERT INTO dbo.MF_Apps (Slug, Title, Description, Color, SortOrder)
      VALUES (@slug, @title, @desc, @color,
              ISNULL((SELECT MAX(SortOrder) FROM dbo.MF_Apps), 0) + 10);
SELECT Id FROM dbo.MF_Apps WHERE Slug=@slug;";
                        cmd.CommandTimeout = 8;
                        AddParam(cmd, "@slug", appSlug);
                        AddParam(cmd, "@title", appTitle);
                        AddParam(cmd, "@desc", appDescription);
                        AddParam(cmd, "@color", appColor);
                        appId = Convert.ToInt32(cmd.ExecuteScalar());
                    }

                    // 2) Run DDL files (IF NOT EXISTS guarded inside each).
                    // PowerShell Compress-Archive uses backslashes in entry names; normalize.
                    // Files are run sorted by name — author files like "010_Parent.sql",
                    // "020_Child.sql" to guarantee FK references resolve in order.
                    var ddlEntries = zip.Entries
                        .Where(e2 => {
                            var p = e2.FullName.Replace('\\', '/');
                            return p.StartsWith("ddl/", StringComparison.OrdinalIgnoreCase)
                                && p.EndsWith(".sql", StringComparison.OrdinalIgnoreCase);
                        })
                        .OrderBy(e2 => e2.FullName.Replace('\\', '/'), StringComparer.OrdinalIgnoreCase)
                        .ToList();
                    foreach (var e in ddlEntries)
                    {
                        var path = e.FullName.Replace('\\', '/');
                        string sql; using (var sr = new System.IO.StreamReader(e.Open())) sql = sr.ReadToEnd();
                        if (string.IsNullOrWhiteSpace(sql)) continue;
                        // Sanity: only allow CREATE TABLE / IF OBJECT_ID / IF NOT EXISTS within the block.
                        if (!System.Text.RegularExpressions.Regex.IsMatch(sql, @"IF\s+OBJECT_ID|IF\s+NOT\s+EXISTS|CREATE\s+TABLE", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                            continue;
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = sql;
                            cmd.CommandTimeout = 30;
                            cmd.ExecuteNonQuery();
                        }
                        tablesRun.Add(System.IO.Path.GetFileNameWithoutExtension(e.Name));
                    }

                    // 3) Create or update forms.
                    foreach (var e in zip.Entries)
                    {
                        var path = e.FullName.Replace('\\', '/');
                        if (!path.StartsWith("forms/", StringComparison.OrdinalIgnoreCase)) continue;
                        if (!path.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) continue;
                        string body; using (var sr = new System.IO.StreamReader(e.Open())) body = sr.ReadToEnd();
                        var bundle = Newtonsoft.Json.Linq.JObject.Parse(body);
                        var fTitle = (string)bundle["title"] ?? "Untitled";
                        var fSchemaJson = (string)bundle["schemaJson"];
                        var fSettingsJson = (string)bundle["settingsJson"];
                        var fOldId = (int?)bundle["id"] ?? 0;

                        int newFormId;
                        using (var cmd = conn.CreateCommand())
                        {
                            // Match by (AppId, Title); update if exists, else insert.
                            // CreatedOnUtc has a DEFAULT constraint so we don't pass it.
                            cmd.CommandText = @"
DECLARE @existingId INT = (SELECT TOP 1 FormId FROM dbo.MF_Forms WHERE AppId=@app AND Title=@title);
IF @existingId IS NOT NULL
BEGIN
    UPDATE dbo.MF_Forms SET SchemaJson=@schema, SettingsJson=@settings, UpdatedOnUtc=SYSUTCDATETIME()
      WHERE FormId=@existingId;
    SELECT @existingId;
END
ELSE
BEGIN
    INSERT INTO dbo.MF_Forms (ModuleId, PortalId, AppId, Title, SchemaJson, SettingsJson, [Status], CreatedByUserId)
      VALUES (0, 0, @app, @title, @schema, @settings, 'Active', -1);
    SELECT CAST(SCOPE_IDENTITY() AS INT);
END";
                            cmd.CommandTimeout = 8;
                            AddParam(cmd, "@app", appId);
                            AddParam(cmd, "@title", fTitle);
                            AddParam(cmd, "@schema", fSchemaJson);
                            AddParam(cmd, "@settings", fSettingsJson);
                            newFormId = Convert.ToInt32(cmd.ExecuteScalar());
                        }
                        formsResult.Add(new { oldId = fOldId, newId = newFormId, title = fTitle });
                    }

                    // 4) Upsert KB entries.  Try both separator variants.
                    var kbEntry = zip.GetEntry("kb/index.json") ?? zip.GetEntry("kb\\index.json");
                    if (kbEntry != null)
                    {
                        string body; using (var sr = new System.IO.StreamReader(kbEntry.Open())) body = sr.ReadToEnd();
                        var arr = Newtonsoft.Json.Linq.JArray.Parse(body);
                        foreach (var item in arr.OfType<Newtonsoft.Json.Linq.JObject>())
                        {
                            using (var cmd = conn.CreateCommand())
                            {
                                cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM dbo.MF_AI_Knowledge WHERE Slug=@slug AND PortalId IS NULL)
    UPDATE dbo.MF_AI_Knowledge SET Kind=@kind, Title=@title, Summary=@summary, Body=@body, Tags=@tags,
        UpdatedOnDate=SYSUTCDATETIME(), Version=Version+1
      WHERE Slug=@slug AND PortalId IS NULL;
ELSE
    INSERT INTO dbo.MF_AI_Knowledge (Slug, Kind, Title, Summary, Body, Tags, PortalId, Source, Version, CreatedOnDate)
      VALUES (@slug, @kind, @title, @summary, @body, @tags, NULL, 'starter-kit', 1, SYSUTCDATETIME());";
                                cmd.CommandTimeout = 6;
                                AddParam(cmd, "@slug", (string)item["slug"]);
                                AddParam(cmd, "@kind", (string)item["kind"]);
                                AddParam(cmd, "@title", (string)item["title"]);
                                AddParam(cmd, "@summary", (string)item["summary"]);
                                AddParam(cmd, "@body", (string)item["body"]);
                                AddParam(cmd, "@tags", (string)item["tags"]);
                                cmd.ExecuteNonQuery();
                                kbCount++;
                            }
                        }
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new {
                    ok = true,
                    appId,
                    appSlug,
                    forms = formsResult,
                    tables = tablesRun,
                    kb = kbCount
                });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [R6.6 v20260531-01] AppsList — returns the apps catalog with each
        //  app's forms and per-form submission counts. Powers the new
        //  accordion sidebar in the Submissions dashboard:
        //
        //    ▾ Orders (4)
        //        Đơn hàng (Razor SSR — hoa quả) · 1
        //        Đơn hàng (DataGrid — hoa quả) · 3
        //    ▸ Suppliers & Products (2)
        //    ▸ Customers (0)
        //    ▸ Uncategorized (11)
        //
        //  Response:
        //    [{slug,title,description,color,formCount,submissionCount,forms:[
        //       {formId,title,status,submissionCount}
        //    ]}]
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("AppsList")]
        public HttpResponseMessage AppsList()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection("DashboardDatabase", null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
SELECT
    a.Id, a.Slug, a.Title, a.Description, a.Color, a.SortOrder,
    f.FormId, f.Title AS FormTitle, f.Status,
    (SELECT COUNT(*) FROM dbo.MF_Submissions s WHERE s.FormId = f.FormId) AS FormSubCount
FROM dbo.MF_Apps a
LEFT JOIN dbo.MF_Forms f ON f.AppId = a.Id
ORDER BY a.SortOrder, a.Slug, f.FormId;";
                        cmd.CommandTimeout = 10;
                        using (var r = cmd.ExecuteReader())
                        {
                            // Strongly-typed bag (dynamic on net472 needs Microsoft.CSharp ref).
                            var bags = new System.Collections.Generic.Dictionary<int, _AppsListBag>();
                            var order = new System.Collections.Generic.List<int>();
                            while (r.Read())
                            {
                                var appId = Convert.ToInt32(r["Id"]);
                                if (!bags.TryGetValue(appId, out var bag))
                                {
                                    bag = new _AppsListBag {
                                        Id = appId,
                                        Slug = Convert.ToString(r["Slug"]),
                                        Title = Convert.ToString(r["Title"]),
                                        Description = r["Description"] == DBNull.Value ? null : Convert.ToString(r["Description"]),
                                        Color = r["Color"] == DBNull.Value ? null : Convert.ToString(r["Color"]),
                                        SortOrder = Convert.ToInt32(r["SortOrder"]),
                                        Forms = new System.Collections.Generic.List<_AppsListFormBag>(),
                                    };
                                    bags[appId] = bag;
                                    order.Add(appId);
                                }
                                if (r["FormId"] != DBNull.Value)
                                {
                                    bag.Forms.Add(new _AppsListFormBag {
                                        FormId = Convert.ToInt32(r["FormId"]),
                                        Title  = Convert.ToString(r["FormTitle"]),
                                        Status = r["Status"] == DBNull.Value ? null : Convert.ToString(r["Status"]),
                                        SubmissionCount = r["FormSubCount"] == DBNull.Value ? 0 : Convert.ToInt32(r["FormSubCount"]),
                                    });
                                }
                            }
                            var output = new System.Collections.Generic.List<object>();
                            foreach (var id in order)
                            {
                                var bag = bags[id];
                                int subCount = 0;
                                foreach (var f in bag.Forms) subCount += f.SubmissionCount;
                                var formsProjected = bag.Forms.Select(f => new {
                                    formId = f.FormId,
                                    title = f.Title,
                                    status = f.Status,
                                    submissionCount = f.SubmissionCount,
                                }).ToList();
                                output.Add(new {
                                    id = bag.Id, slug = bag.Slug, title = bag.Title,
                                    description = bag.Description, color = bag.Color, sortOrder = bag.SortOrder,
                                    formCount = bag.Forms.Count, submissionCount = subCount,
                                    forms = formsProjected,
                                });
                            }
                            return Request.CreateResponse(HttpStatusCode.OK, new {
                                apps = output,
                                badge = "AppsList v20260531-R6.6",
                            });
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [R6.5 v20260531-01] SubmissionDbView — given a submission ID,
        //  return BOTH the master row written to the form's bound table AND
        //  every DataGrid child-table rows the submission produced. Used by
        //  the new "DB View" tab in the submission detail modal.
        //
        //  Response shape:
        //    {
        //      submissionId,
        //      formId,
        //      master: {                                     // may be null
        //        table, schema, idColumn, columns:[…], row:{…}, mapping:'submission_id'|'fallback-recent'
        //      },
        //      children: [                                   // one per DataGrid with tableName
        //        { fieldKey, table, schema, parentKey, columns, rows, mapping }
        //      ]
        //    }
        //
        //  Mapping strategy:
        //    1) Prefer joining on a "SubmissionId" or "submission_id" column
        //       (created when admin includes :_submissionId in the audit
        //       auto-fill — the canonical pattern from R2).
        //    2) Fall back to "row with max Id (latest row by IDENTITY)" if
        //       no submission-id column is found — surfaces ANY data so the
        //       view is never empty.
        // ═════════════════════════════════════════════════════════════════
        [HttpGet]
        [ActionName("SubmissionDbView")]
        public HttpResponseMessage SubmissionDbView(int submissionId)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (submissionId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "submissionId required" });

            int formId = 0;
            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var c = registry.GetConnection("DashboardDatabase", null, null))
                {
                    c.Open();
                    using (var cmd = c.CreateCommand())
                    {
                        cmd.CommandText = "SELECT FormId FROM MF_Submissions WHERE SubmissionId = @sid";
                        cmd.CommandTimeout = 10;
                        var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = submissionId; cmd.Parameters.Add(p);
                        var o = cmd.ExecuteScalar();
                        if (o == null || o == DBNull.Value)
                            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "submission not found" });
                        formId = Convert.ToInt32(o);
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "submission lookup failed", detail = ex.Message });
            }

            var form = FormRepository.GetForm(formId);
            if (form == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "form not found", formId });

            // Parse schema + settings.
            Newtonsoft.Json.Linq.JObject schemaObj = null;
            Newtonsoft.Json.Linq.JObject settingsObj = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(form.SchemaJson))   schemaObj   = Newtonsoft.Json.Linq.JObject.Parse(form.SchemaJson);
                if (!string.IsNullOrWhiteSpace(form.SettingsJson)) settingsObj = Newtonsoft.Json.Linq.JObject.Parse(form.SettingsJson);
            }
            catch (Exception parseEx)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = "schema parse failed", detail = parseEx.Message });
            }

            // Master binding from settings.databaseInsert.
            var di = settingsObj?["databaseInsert"] ?? settingsObj?["DatabaseInsert"]
                  ?? schemaObj?["settings"]?["databaseInsert"] ?? schemaObj?["settings"]?["DatabaseInsert"];
            string masterTable = null, masterSchema = "dbo", masterConn = "DashboardDatabase";
            bool masterEnabled = false;
            if (di != null)
            {
                masterEnabled = (bool?)(di["enabled"] ?? di["Enabled"]) ?? false;
                if (masterEnabled)
                {
                    masterConn = (string)(di["connectionKey"] ?? di["ConnectionKey"]) ?? masterConn;
                    var sql = (string)(di["insertSql"] ?? di["InsertSql"]);
                    if (!string.IsNullOrWhiteSpace(sql))
                    {
                        var m = System.Text.RegularExpressions.Regex.Match(sql,
                            @"INSERT\s+INTO\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?",
                            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                        if (m.Success)
                        {
                            masterSchema = m.Groups[2].Success ? m.Groups[1].Value : "dbo";
                            masterTable  = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[1].Value;
                        }
                    }
                }
            }

            // DataGrid children from schema.fields[*].widgetProps where tableName set.
            var children = new System.Collections.Generic.List<object>();
            var fields = schemaObj?["fields"] as Newtonsoft.Json.Linq.JArray;
            var flatFields = new System.Collections.Generic.List<Newtonsoft.Json.Linq.JObject>();
            void Flatten(Newtonsoft.Json.Linq.JArray arr)
            {
                if (arr == null) return;
                foreach (var t in arr)
                {
                    if (!(t is Newtonsoft.Json.Linq.JObject o)) continue;
                    flatFields.Add(o);
                    if (o["columns"] is Newtonsoft.Json.Linq.JArray cols)
                    {
                        foreach (var col in cols)
                        {
                            if (col is Newtonsoft.Json.Linq.JObject co && co["fields"] is Newtonsoft.Json.Linq.JArray inner)
                                Flatten(inner);
                        }
                    }
                }
            }
            Flatten(fields);

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);

                object masterPayload = null;
                if (!string.IsNullOrWhiteSpace(masterTable))
                {
                    masterPayload = FetchSubmissionRow(registry, masterConn, masterSchema, masterTable, submissionId);
                }

                foreach (var f in flatFields)
                {
                    var type = (string)f["type"];
                    if (!string.Equals(type, "DataGrid", StringComparison.OrdinalIgnoreCase)) continue;
                    var wp = f["widgetProps"] as Newtonsoft.Json.Linq.JObject;
                    if (wp == null) continue;
                    var tname = (string)(wp["tableName"] ?? wp["TableName"]);
                    if (string.IsNullOrWhiteSpace(tname)) continue;
                    if (!System.Text.RegularExpressions.Regex.IsMatch(tname, @"^\w+$")) continue;
                    var connKey = (string)(wp["connectionKey"] ?? wp["ConnectionKey"]) ?? "DashboardDatabase";
                    var fieldKey = (string)f["key"];
                    var parentKey = (string)(wp["parentKeyColumn"] ?? wp["ParentKeyColumn"]);
                    var rowsBlock = FetchSubmissionChildRows(registry, connKey, "dbo", tname, submissionId, fieldKey, parentKey);
                    if (rowsBlock != null) children.Add(rowsBlock);
                }

                return Request.CreateResponse(HttpStatusCode.OK, new {
                    submissionId,
                    formId,
                    master = masterPayload,
                    children,
                    badge = "SubmissionDbView v20260531-R6.5",
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message });
            }
        }

        private object FetchSubmissionRow(MegaForm.Core.Interfaces.IConnectionRegistry registry, string connKey, string schema, string table, int submissionId)
        {
            using (var conn = registry.GetConnection(connKey, null, null))
            {
                conn.Open();
                var columns = QueryTableColumns(schema, table, connKey);
                var subCol = columns.FirstOrDefault(c => string.Equals(c, "SubmissionId", StringComparison.OrdinalIgnoreCase)
                                                      || string.Equals(c, "submission_id", StringComparison.OrdinalIgnoreCase));
                using (var cmd = conn.CreateCommand())
                {
                    if (subCol != null)
                    {
                        cmd.CommandText = "SELECT TOP 1 * FROM [" + schema + "].[" + table + "] WHERE [" + subCol + "] = @sid";
                        var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = submissionId; cmd.Parameters.Add(p);
                    }
                    else
                    {
                        cmd.CommandText = "SELECT TOP 1 * FROM [" + schema + "].[" + table + "] ORDER BY 1 DESC";
                    }
                    cmd.CommandTimeout = 15;
                    using (var r = cmd.ExecuteReader())
                    {
                        if (!r.Read())
                            return new { table, schema, idColumn = (string)null, columns = new object[0], row = (object)null, mapping = subCol != null ? "submission_id" : "fallback-recent", note = "no matching row" };
                        var colsList = new System.Collections.Generic.List<object>();
                        var rowDict = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                        for (int i = 0; i < r.FieldCount; i++)
                        {
                            colsList.Add(new { name = r.GetName(i), type = r.GetDataTypeName(i) });
                            rowDict[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                        }
                        return new { table, schema, idColumn = r.FieldCount > 0 ? r.GetName(0) : "Id", columns = colsList, row = rowDict, mapping = subCol != null ? "submission_id" : "fallback-recent" };
                    }
                }
            }
        }

        private object FetchSubmissionChildRows(MegaForm.Core.Interfaces.IConnectionRegistry registry, string connKey, string schema, string table, int submissionId, string fieldKey, string parentKey)
        {
            using (var conn = registry.GetConnection(connKey, null, null))
            {
                conn.Open();
                var columns = QueryTableColumns(schema, table, connKey);
                if (columns.Count == 0) return null;
                // Prefer SubmissionId join, then the parentKeyColumn from widgetProps.
                var subCol = columns.FirstOrDefault(c => string.Equals(c, "SubmissionId", StringComparison.OrdinalIgnoreCase)
                                                      || string.Equals(c, "submission_id", StringComparison.OrdinalIgnoreCase));
                var fkCol = (subCol == null && !string.IsNullOrWhiteSpace(parentKey) && System.Text.RegularExpressions.Regex.IsMatch(parentKey, @"^\w+$")
                                                && columns.Any(c => string.Equals(c, parentKey, StringComparison.OrdinalIgnoreCase)))
                             ? columns.First(c => string.Equals(c, parentKey, StringComparison.OrdinalIgnoreCase))
                             : null;
                using (var cmd = conn.CreateCommand())
                {
                    if (subCol != null)
                    {
                        cmd.CommandText = "SELECT TOP 500 * FROM [" + schema + "].[" + table + "] WHERE [" + subCol + "] = @sid ORDER BY 1 DESC";
                        var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = submissionId; cmd.Parameters.Add(p);
                    }
                    else if (fkCol != null)
                    {
                        cmd.CommandText = "SELECT TOP 500 * FROM [" + schema + "].[" + table + "] WHERE [" + fkCol + "] = @sid ORDER BY 1 DESC";
                        var p = cmd.CreateParameter(); p.ParameterName = "@sid"; p.Value = submissionId; cmd.Parameters.Add(p);
                    }
                    else
                    {
                        cmd.CommandText = "SELECT TOP 50 * FROM [" + schema + "].[" + table + "] ORDER BY 1 DESC";
                    }
                    cmd.CommandTimeout = 15;
                    using (var r = cmd.ExecuteReader())
                    {
                        var colsList = new System.Collections.Generic.List<object>();
                        for (int i = 0; i < r.FieldCount; i++)
                            colsList.Add(new { name = r.GetName(i), type = r.GetDataTypeName(i) });
                        var rows = new System.Collections.Generic.List<System.Collections.Generic.Dictionary<string, object>>();
                        while (r.Read())
                        {
                            var d = new System.Collections.Generic.Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                            for (int i = 0; i < r.FieldCount; i++)
                                d[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                            rows.Add(d);
                        }
                        return new { fieldKey, table, schema, parentKey = subCol ?? fkCol, columns = colsList, rows, mapping = subCol != null ? "submission_id" : (fkCol != null ? "parent_key" : "fallback-recent") };
                    }
                }
            }
        }

        // ═════════════════════════════════════════════════════════════════
        //  [P3.2] UpdateCustomTableRow / DeleteCustomTableRow
        //  Inline edit + delete on the form's bound custom table from the
        //  Live DB rows modal. Both endpoints:
        //    - Parse form.SettingsJson.databaseInsert.insertSql for the
        //      target [schema].[Table]
        //    - Validate every value-column name exists in sys.columns
        //      (prevents SQL injection via column name)
        //    - Run parameterized SQL via DnnConnectionRegistry
        //    - Return rowsAffected + a same-shape row payload after update
        // ═════════════════════════════════════════════════════════════════
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("UpdateCustomTableRow")]
        public HttpResponseMessage UpdateCustomTableRow(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            var formId = (int?)body["formId"] ?? 0;
            if (formId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
            var idValue = body["id"];
            if (idValue == null || idValue.Type == Newtonsoft.Json.Linq.JTokenType.Null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });
            var values = body["values"] as Newtonsoft.Json.Linq.JObject;
            if (values == null || !values.Properties().Any())
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "values required (object of column → newValue)" });

            var binding = ResolveFormTableBinding(formId);
            if (binding.error != null) return Request.CreateResponse(binding.status, new { error = binding.error });

            // Whitelist the requested column names against the actual table.
            var tableCols = QueryTableColumns(binding.schemaName, binding.tableName, binding.connectionKey);
            if (tableCols.Count == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "could not inspect target table" });

            var safeUpdates = new System.Collections.Generic.List<(string col, object val)>();
            foreach (var p in values.Properties())
            {
                var col = p.Name;
                if (!System.Text.RegularExpressions.Regex.IsMatch(col, @"^\w+$")) continue;
                if (!tableCols.Any(c => string.Equals(c, col, StringComparison.OrdinalIgnoreCase))) continue;
                if (string.Equals(col, binding.idColumn, StringComparison.OrdinalIgnoreCase)) continue; // never UPDATE PK
                safeUpdates.Add((col, ((Newtonsoft.Json.Linq.JValue)p.Value).Value));
            }
            if (safeUpdates.Count == 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "no valid columns to update (all unknown / blocked)" });

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(binding.connectionKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        var setSql = string.Join(", ", safeUpdates.Select(u => "[" + u.col + "] = @v_" + u.col));
                        cmd.CommandText = "UPDATE [" + binding.schemaName + "].[" + binding.tableName + "] SET " + setSql
                            + " WHERE [" + binding.idColumn + "] = @id";
                        cmd.CommandTimeout = 20;
                        foreach (var u in safeUpdates)
                        {
                            var p = cmd.CreateParameter(); p.ParameterName = "@v_" + u.col;
                            p.Value = u.val == null ? (object)DBNull.Value : u.val;
                            cmd.Parameters.Add(p);
                        }
                        var pid = cmd.CreateParameter(); pid.ParameterName = "@id";
                        pid.Value = ((Newtonsoft.Json.Linq.JValue)idValue).Value;
                        cmd.Parameters.Add(pid);
                        var affected = cmd.ExecuteNonQuery();
                        return Request.CreateResponse(HttpStatusCode.OK, new {
                            success = true, affected, table = binding.schemaName + "." + binding.tableName,
                            idColumn = binding.idColumn, id = ((Newtonsoft.Json.Linq.JValue)idValue).Value,
                            columnsUpdated = safeUpdates.Select(u => u.col).ToArray(),
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, error = ex.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("DeleteCustomTableRow")]
        public HttpResponseMessage DeleteCustomTableRow(Newtonsoft.Json.Linq.JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body required" });

            var formId = (int?)body["formId"] ?? 0;
            if (formId <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId required" });
            var idValue = body["id"];
            if (idValue == null || idValue.Type == Newtonsoft.Json.Linq.JTokenType.Null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });

            var binding = ResolveFormTableBinding(formId);
            if (binding.error != null) return Request.CreateResponse(binding.status, new { error = binding.error });

            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(binding.connectionKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "DELETE FROM [" + binding.schemaName + "].[" + binding.tableName + "] WHERE [" + binding.idColumn + "] = @id";
                        cmd.CommandTimeout = 20;
                        var pid = cmd.CreateParameter(); pid.ParameterName = "@id";
                        pid.Value = ((Newtonsoft.Json.Linq.JValue)idValue).Value;
                        cmd.Parameters.Add(pid);
                        var affected = cmd.ExecuteNonQuery();
                        return Request.CreateResponse(HttpStatusCode.OK, new {
                            success = true, affected,
                            table = binding.schemaName + "." + binding.tableName,
                            id = ((Newtonsoft.Json.Linq.JValue)idValue).Value,
                        });
                    }
                }
            }
            catch (System.Data.SqlClient.SqlException sqlEx)
            {
                // 547 = FK constraint conflict — child rows reference this row
                if (sqlEx.Number == 547)
                {
                    return Request.CreateResponse(HttpStatusCode.Conflict, new {
                        success = false, fkConflict = true, error = "Cannot delete — other rows reference this one. " +
                          "Delete the dependent rows first, or alter the FK to ON DELETE CASCADE / SET NULL.",
                        sqlNumber = sqlEx.Number,
                    });
                }
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, error = sqlEx.Message, sqlNumber = sqlEx.Number });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { success = false, error = ex.Message });
            }
        }

        // ─── Helpers used by P3.1/P3.2 endpoints ─────────────────────────
        // [R6.6] AppsList projection bags (avoid `dynamic` to keep Microsoft.CSharp off the dep list).
        private class _AppsListBag
        {
            public int Id; public string Slug; public string Title; public string Description; public string Color;
            public int SortOrder;
            public System.Collections.Generic.List<_AppsListFormBag> Forms;
        }
        private class _AppsListFormBag
        {
            public int FormId; public string Title; public string Status; public int SubmissionCount;
        }

        private class _FormTableBinding
        {
            public string schemaName;
            public string tableName;
            public string idColumn;
            public string connectionKey;
            public string error;
            public HttpStatusCode status;
        }
        private _FormTableBinding ResolveFormTableBinding(int formId)
        {
            var r = new _FormTableBinding { connectionKey = "DashboardDatabase", idColumn = "Id", schemaName = "dbo", status = HttpStatusCode.NotFound };
            var form = FormRepository.GetForm(formId);
            if (form == null) { r.error = "form not found"; return r; }

            string insertSql = null;
            try
            {
                if (!string.IsNullOrWhiteSpace(form.SettingsJson))
                {
                    var s  = Newtonsoft.Json.Linq.JObject.Parse(form.SettingsJson);
                    var di = s["databaseInsert"] ?? s["DatabaseInsert"];
                    if (di != null)
                    {
                        var enabled = (bool?)(di["enabled"] ?? di["Enabled"]) ?? false;
                        if (!enabled) { r.error = "form has no database INSERT enabled"; return r; }
                        insertSql       = (string)(di["insertSql"]     ?? di["InsertSql"]);
                        r.connectionKey = (string)(di["connectionKey"] ?? di["ConnectionKey"]) ?? "DashboardDatabase";
                    }
                }
            }
            catch (Exception ex) { r.error = "settings.json parse failed: " + ex.Message; r.status = HttpStatusCode.InternalServerError; return r; }

            if (string.IsNullOrWhiteSpace(insertSql)) { r.error = "form is not bound to a custom DB table"; return r; }

            var m = System.Text.RegularExpressions.Regex.Match(insertSql,
                @"INSERT\s+INTO\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (!m.Success) { r.error = "could not parse table from insertSql"; r.status = HttpStatusCode.BadRequest; return r; }
            r.schemaName = m.Groups[2].Success ? m.Groups[1].Value : "dbo";
            r.tableName  = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[1].Value;
            if (!System.Text.RegularExpressions.Regex.IsMatch(r.schemaName, @"^\w+$") ||
                !System.Text.RegularExpressions.Regex.IsMatch(r.tableName, @"^\w+$"))
            { r.error = "invalid identifier"; r.status = HttpStatusCode.BadRequest; return r; }

            // Try to find the IDENTITY column (best guess for "Id"). Fall back to "Id".
            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(r.connectionKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "SELECT TOP 1 c.name FROM sys.columns c JOIN sys.tables t ON c.object_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = @s AND t.name = @t AND c.is_identity = 1";
                        cmd.CommandTimeout = 10;
                        var ps = cmd.CreateParameter(); ps.ParameterName = "@s"; ps.Value = r.schemaName; cmd.Parameters.Add(ps);
                        var pt = cmd.CreateParameter(); pt.ParameterName = "@t"; pt.Value = r.tableName;  cmd.Parameters.Add(pt);
                        var o = cmd.ExecuteScalar();
                        if (o != null && o != DBNull.Value) r.idColumn = Convert.ToString(o);
                    }
                }
            }
            catch { /* fall back to "Id" */ }

            r.error = null;
            r.status = HttpStatusCode.OK;
            return r;
        }
        private System.Collections.Generic.List<string> QueryTableColumns(string schemaName, string tableName, string connectionKey)
        {
            var list = new System.Collections.Generic.List<string>();
            try
            {
                var registry = new DnnConnectionRegistry(GetHostSetting);
                using (var conn = registry.GetConnection(connectionKey, null, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = "SELECT c.name FROM sys.columns c JOIN sys.tables t ON c.object_id = t.object_id JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = @s AND t.name = @t ORDER BY c.column_id";
                        cmd.CommandTimeout = 10;
                        var ps = cmd.CreateParameter(); ps.ParameterName = "@s"; ps.Value = schemaName; cmd.Parameters.Add(ps);
                        var pt = cmd.CreateParameter(); pt.ParameterName = "@t"; pt.Value = tableName;  cmd.Parameters.Add(pt);
                        using (var r = cmd.ExecuteReader())
                            while (r.Read()) list.Add(r.GetString(0));
                    }
                }
            }
            catch { /* return empty */ }
            return list;
        }

        // ─────────────────────────────────────────────────────────────────
        //  Razor template source — proxy to Oqtane companion (Phase 1)
        //  The DNN side never compiles .razor in-process; the companion
        //  service ships the source file via this endpoint so the AI tool
        //  `get_razor_template_source` can read it.
        // ─────────────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("RazorTemplateSource")]
        public HttpResponseMessage RazorTemplateSource(string name)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (string.IsNullOrWhiteSpace(name))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "name required" });

            // Same default + portal-setting key the proxy controller uses.
            const string defaultUrl = "http://localhost:5050";
            const string settingKey = "MegaForm_RazorWidget_OqtaneUrl";
            var baseUrl = DotNetNuke.Entities.Portals.PortalController
                .GetPortalSetting(settingKey, CurrentPortalId, defaultUrl).TrimEnd('/');
            var url = baseUrl + "/api/MegaFormPopup/RazorWidget/Source?name=" + System.Net.WebUtility.UrlEncode(name);
            try
            {
                using (var client = new System.Net.Http.HttpClient { Timeout = TimeSpan.FromSeconds(10) })
                {
                    var resp = client.GetAsync(url).GetAwaiter().GetResult();
                    var json = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    var msg = Request.CreateResponse(resp.StatusCode);
                    msg.Content = new StringContent(json ?? string.Empty, System.Text.Encoding.UTF8, "application/json");
                    return msg;
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.ServiceUnavailable,
                    new { error = "Razor companion unreachable", detail = ex.Message, companionUrl = baseUrl });
            }
        }
    }
}
