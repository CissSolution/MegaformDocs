using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Data;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Services.AiAssistant;
using MegaForm.DNN.Data;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// CRUD for the AI Knowledge Base used by the MegaForm AI Form Assistant.
    /// Tool-use loop reads via AiToolsController; this controller is for the
    /// admin UI (Dashboard "AI Knowledge" panel) — list / get / upsert / delete /
    /// history.
    ///
    /// Route prefix: /DesktopModules/MegaForm/API/AiKnowledge/{action}
    /// All endpoints require Administrators role.
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class AiKnowledgeController : DnnApiController
    {
        private int CurrentPortalId => PortalSettings?.PortalId ?? 0;
        private int CurrentUserId => UserInfo?.UserID ?? 0;

        private HttpResponseMessage RejectIfDisabled()
        {
            var enabled = AiFeatureGate.IsEnabled(PortalSettings?.HomeDirectoryMapPath);
            if (enabled) return null;
            return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "AI knowledge disabled (no dev.lock)" });
        }

        // ── List ──────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("List")]
        public HttpResponseMessage List(string kind = null, string search = null, int top = 200)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            top = Math.Max(1, Math.Min(top, 500));
            var list = AiKnowledgeRepository.List(kind, search, CurrentPortalId, top);
            var payload = list.Select(e => new
            {
                id = e.Id,
                slug = e.Slug,
                kind = e.Kind,
                title = e.Title,
                summary = e.Summary,
                tags = SplitTags(e.Tags),
                portalId = e.PortalId,
                source = e.Source,
                version = e.Version,
                updatedOnDate = e.UpdatedOnDate ?? e.CreatedOnDate,
            });
            return Request.CreateResponse(HttpStatusCode.OK, payload);
        }

        // ── Kinds ─────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("Kinds")]
        public HttpResponseMessage Kinds()
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            return Request.CreateResponse(HttpStatusCode.OK, AiKnowledgeRepository.ListKinds());
        }

        // ── SearchScoped — widget+surface-aware KB lookup (B53) ───────────
        // POST body: { widgetType: string, surface: string, query?: string, limit?: int }
        // Returns: { results: [{ id, slug, kind, title, summary, tags, widgetType, surface }] }
        //
        // [B53 fix Bug D + E] Powers the Unified Designer slide-out AI drawer.
        // KB-only by default (no LLM billing). If the new WidgetType / Surface
        // columns are missing (pre-migration sites), falls back to a Tags-CSV
        // match against ('widget:<widgetType>' / 'surface:<surface>') so the
        // drawer is never completely empty.
        //
        // [ValidateAntiForgeryToken] kept off so the Builder's drawer can hit
        // it even when the page-level token expires mid-session. The Builder
        // gates the drawer by Admin role via the [DnnAuthorize] class attr.
        [HttpPost]
        [ActionName("SearchScoped")]
        public HttpResponseMessage SearchScoped(JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });

            var widgetType = ((string)body["widgetType"] ?? string.Empty).Trim();
            var surface = ((string)body["surface"] ?? string.Empty).Trim();
            var query = ((string)body["query"] ?? string.Empty).Trim();
            var limit = (int?)body["limit"] ?? 5;
            limit = Math.Max(1, Math.Min(limit, 25));

            var results = new List<object>();
            var warning = (string)null;

            try
            {
                using (var conn = new SqlConnection(DataProvider.Instance().ConnectionString))
                {
                    conn.Open();

                    // Detect column existence — pre-B53 sites won't have WidgetType / Surface yet.
                    var hasWidgetType = ColumnExists(conn, "MF_AI_Knowledge", "WidgetType");
                    var hasSurface = ColumnExists(conn, "MF_AI_Knowledge", "Surface");

                    string sql;
                    if (hasWidgetType && hasSurface)
                    {
                        sql = @"
                            SELECT TOP (@Top) Id, Slug, Kind, Title, Summary, Tags,
                                              ISNULL(WidgetType, '') AS WidgetType,
                                              ISNULL(Surface, '')    AS Surface
                            FROM MF_AI_Knowledge
                            WHERE (@WidgetType = '' OR WidgetType = @WidgetType OR WidgetType IS NULL)
                              AND (@Surface = '' OR Surface = @Surface OR Surface IS NULL)
                              AND (PortalId IS NULL OR PortalId = @PortalId)
                              AND (@Q = ''
                                   OR Title LIKE '%' + @Q + '%'
                                   OR Summary LIKE '%' + @Q + '%'
                                   OR Body LIKE '%' + @Q + '%'
                                   OR Tags LIKE '%' + @Q + '%'
                                   OR Slug LIKE '%' + @Q + '%')
                            ORDER BY
                              CASE WHEN WidgetType = @WidgetType THEN 0 ELSE 1 END,
                              CASE WHEN Surface = @Surface THEN 0 ELSE 1 END,
                              CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END,
                              Kind, Slug";
                    }
                    else
                    {
                        warning = "WidgetType / Surface columns missing — fell back to Tags CSV match. Apply B53 migration to get precise scoping.";
                        sql = @"
                            SELECT TOP (@Top) Id, Slug, Kind, Title, Summary, Tags,
                                              '' AS WidgetType,
                                              '' AS Surface
                            FROM MF_AI_Knowledge
                            WHERE (PortalId IS NULL OR PortalId = @PortalId)
                              AND (@WidgetType = '' OR Tags LIKE '%widget:' + @WidgetType + '%')
                              AND (@Surface = ''    OR Tags LIKE '%surface:' + @Surface + '%')
                              AND (@Q = ''
                                   OR Title LIKE '%' + @Q + '%'
                                   OR Summary LIKE '%' + @Q + '%'
                                   OR Body LIKE '%' + @Q + '%'
                                   OR Tags LIKE '%' + @Q + '%'
                                   OR Slug LIKE '%' + @Q + '%')
                            ORDER BY
                              CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END,
                              Kind, Slug";
                    }

                    using (var cmd = new SqlCommand(sql, conn))
                    {
                        cmd.Parameters.AddWithValue("@Top", limit);
                        cmd.Parameters.AddWithValue("@WidgetType", widgetType ?? string.Empty);
                        cmd.Parameters.AddWithValue("@Surface", surface ?? string.Empty);
                        cmd.Parameters.AddWithValue("@Q", query ?? string.Empty);
                        cmd.Parameters.AddWithValue("@PortalId", CurrentPortalId);
                        using (var r = cmd.ExecuteReader())
                        {
                            while (r.Read())
                            {
                                results.Add(new
                                {
                                    id = r.GetInt32(0),
                                    slug = r.IsDBNull(1) ? null : r.GetString(1),
                                    kind = r.IsDBNull(2) ? null : r.GetString(2),
                                    title = r.IsDBNull(3) ? null : r.GetString(3),
                                    summary = r.IsDBNull(4) ? null : r.GetString(4),
                                    tags = SplitTags(r.IsDBNull(5) ? null : r.GetString(5)),
                                    widgetType = r.IsDBNull(6) ? null : r.GetString(6),
                                    surface = r.IsDBNull(7) ? null : r.GetString(7),
                                });
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    results = Array.Empty<object>(),
                    warning = "KB SearchScoped failed: " + ex.Message
                });
            }

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                results,
                warning,
                widgetType,
                surface,
                query,
                count = results.Count
            });
        }

        private static bool ColumnExists(SqlConnection conn, string table, string column)
        {
            using (var cmd = new SqlCommand(
                "SELECT COUNT(1) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t AND COLUMN_NAME=@c", conn))
            {
                cmd.Parameters.AddWithValue("@t", table);
                cmd.Parameters.AddWithValue("@c", column);
                var n = Convert.ToInt32(cmd.ExecuteScalar());
                return n > 0;
            }
        }

        // ── Get by slug or id ─────────────────────────────────────────────
        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(string slug = null, int id = 0)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            AiKnowledgeEntry e = null;
            if (id > 0) e = AiKnowledgeRepository.GetById(id);
            else if (!string.IsNullOrWhiteSpace(slug)) e = AiKnowledgeRepository.GetBySlug(slug, CurrentPortalId);
            if (e == null) return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Not found" });
            return Request.CreateResponse(HttpStatusCode.OK, ToFullPayload(e));
        }

        // ── Upsert ────────────────────────────────────────────────────────
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Upsert")]
        public HttpResponseMessage Upsert(JObject body)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required" });

            var slug = (string)body["slug"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(slug))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "slug is required" });

            // Determine if this is overriding a built-in entry → flip source.
            var existing = AiKnowledgeRepository.GetBySlug(slug, CurrentPortalId);
            string source = (string)body["source"];
            if (string.IsNullOrWhiteSpace(source))
            {
                source = (existing != null && existing.Source == "megaform-builtin") ? "customer-overridden" : "customer";
            }

            var entry = new AiKnowledgeEntry
            {
                Id = (int?)body["id"] ?? (existing?.Id ?? 0),
                Slug = slug,
                Kind = (string)body["kind"] ?? "system_arch",
                Title = (string)body["title"] ?? slug,
                Summary = (string)body["summary"],
                Body = (string)body["body"],
                Tags = JoinTags(body["tags"]),
                Examples = body["examples"]?.ToString(),
                PortalId = body["portalId"]?.Type == JTokenType.Null ? (int?)null : (int?)body["portalId"],
                Source = source,
            };
            var id = AiKnowledgeRepository.Upsert(entry, CurrentUserId);
            entry = AiKnowledgeRepository.GetById(id);
            return Request.CreateResponse(HttpStatusCode.OK, ToFullPayload(entry));
        }

        // ── Delete ────────────────────────────────────────────────────────
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("Delete")]
        public HttpResponseMessage Delete([FromUri] int id)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            if (id <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });
            var ok = AiKnowledgeRepository.Delete(id, CurrentUserId);
            return Request.CreateResponse(HttpStatusCode.OK, new { ok });
        }

        // ── History ───────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("History")]
        public HttpResponseMessage History(int id, int top = 50)
        {
            var gate = RejectIfDisabled(); if (gate != null) return gate;
            var list = AiKnowledgeRepository.ListHistory(id, Math.Max(1, Math.Min(top, 200)));
            return Request.CreateResponse(HttpStatusCode.OK, list.Select(h => new
            {
                historyId = h.HistoryId,
                knowledgeId = h.KnowledgeId,
                slug = h.Slug,
                title = h.Title,
                action = h.ChangeAction,
                version = h.Version,
                changedOnDate = h.ChangedOnDate,
                changedByUserId = h.ChangedByUserId,
            }));
        }

        // ─────────────────────────────────────────────────────────────────
        private static object ToFullPayload(AiKnowledgeEntry e)
        {
            return new
            {
                id = e.Id,
                slug = e.Slug,
                kind = e.Kind,
                title = e.Title,
                summary = e.Summary,
                body = e.Body,
                tags = SplitTags(e.Tags),
                examples = e.Examples,
                portalId = e.PortalId,
                source = e.Source,
                version = e.Version,
                createdOnDate = e.CreatedOnDate,
                updatedOnDate = e.UpdatedOnDate,
            };
        }

        private static string[] SplitTags(string csv)
        {
            return string.IsNullOrWhiteSpace(csv)
                ? Array.Empty<string>()
                : csv.Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToArray();
        }

        private static string JoinTags(JToken token)
        {
            if (token == null) return null;
            if (token.Type == JTokenType.String) return (string)token;
            if (token is JArray arr) return string.Join(",", arr.Select(t => (string)t).Where(s => !string.IsNullOrWhiteSpace(s)));
            return null;
        }
    }
}
