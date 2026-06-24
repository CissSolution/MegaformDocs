using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Web.Api;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Custom block storage for the Layout Designer.
    ///
    /// Each portal can save its own visual blocks (HTML snippets that admins
    /// drag into the section canvas of the DataRepeater + DynamicLabel
    /// designer). Persisted in MF_DesignerBlocks (schema in 01.06.26
    /// SqlDataProvider).
    ///
    /// Routes:
    ///   GET  /DesktopModules/MegaForm/API/Designer/Blocks?portalId=N
    ///   POST /DesktopModules/MegaForm/API/Designer/SaveBlock
    ///   POST /DesktopModules/MegaForm/API/Designer/DeleteBlock?id=N
    ///
    /// Same multi-portal pattern as Phase2 + Permissions: class-level
    /// DnnAuthorize, ResolveTargetPortalId, no TabId/ModuleId reliance.
    ///
    /// Badge: DesignerController v20260528-15
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class DesignerController : DnnApiController
    {
        private int ResolveTargetPortalId()
        {
            var fallback = PortalSettings != null ? PortalSettings.PortalId : 0;
            try
            {
                var query = Request != null && Request.RequestUri != null
                    ? Request.RequestUri.ParseQueryString()
                    : null;
                if (query == null) return fallback;
                var raw = query["portalId"] ?? query["portalid"] ?? query["PortalId"];
                int pid;
                if (string.IsNullOrEmpty(raw) || !int.TryParse(raw, out pid) || pid < 0) return fallback;
                if (pid == fallback) return fallback;
                var caller = UserInfo;
                var allowed = caller != null && (caller.IsSuperUser || caller.IsInRole("Administrators"));
                return allowed ? pid : fallback;
            }
            catch { return fallback; }
        }

        [HttpGet]
        [ActionName("Blocks")]
        public HttpResponseMessage GetBlocks()
        {
            try
            {
                var portalId = ResolveTargetPortalId();
                var blocks = ListBlocks(portalId);
                return Request.CreateResponse(HttpStatusCode.OK, new { blocks });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ActionName("SaveBlock")]
        public HttpResponseMessage SaveBlock([FromBody] JObject body)
        {
            if (body == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "body is required" });

            try
            {
                var portalId = ResolveTargetPortalId();
                var key = Trimmed(body, "key");
                var name = Trimmed(body, "name");
                var category = Trimmed(body, "category");
                var zone = Trimmed(body, "zone");
                var html = Trimmed(body, "html");
                var help = Trimmed(body, "help");
                if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(html))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "key + html required" });

                var saved = Upsert(portalId, UserInfo != null ? UserInfo.UserID : 0,
                    key, name, category, zone, html, help);
                return Request.CreateResponse(HttpStatusCode.OK, saved);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ActionName("DeleteBlock")]
        public HttpResponseMessage DeleteBlock(int id = 0)
        {
            if (id <= 0) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "id required" });
            try
            {
                var portalId = ResolveTargetPortalId();
                var ok = Delete(portalId, id);
                return Request.CreateResponse(ok ? HttpStatusCode.OK : HttpStatusCode.NotFound, new { ok });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        // ────────────────────────────────────────────────────────────────────
        //  Data access (inline to keep this controller self-contained)
        // ────────────────────────────────────────────────────────────────────

        private static SqlConnection GetConnection()
        {
            return new SqlConnection(Config.GetConnectionString());
        }

        private static List<object> ListBlocks(int portalId)
        {
            var list = new List<object>();
            using (var conn = GetConnection())
            using (var cmd = new SqlCommand(
                "SELECT Id, [Key], Name, Category, Zone, HtmlSnippet, Help " +
                "FROM MF_DesignerBlocks WHERE PortalId=@PortalId ORDER BY Category, Name", conn))
            {
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                conn.Open();
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        list.Add(new
                        {
                            id = r.GetInt32(0),
                            key = r.GetString(1),
                            name = r.IsDBNull(2) ? null : r.GetString(2),
                            category = r.IsDBNull(3) ? "custom" : r.GetString(3),
                            zone = r.IsDBNull(4) ? "any" : r.GetString(4),
                            html = r.IsDBNull(5) ? null : r.GetString(5),
                            help = r.IsDBNull(6) ? null : r.GetString(6),
                        });
                    }
                }
            }
            return list;
        }

        private static object Upsert(int portalId, int userId,
            string key, string name, string category, string zone, string html, string help)
        {
            using (var conn = GetConnection())
            using (var cmd = new SqlCommand(@"
                MERGE MF_DesignerBlocks AS t
                USING (SELECT @PortalId AS PortalId, @Key AS [Key]) AS s
                ON t.PortalId = s.PortalId AND t.[Key] = s.[Key]
                WHEN MATCHED THEN UPDATE SET
                    Name = @Name,
                    Category = @Category,
                    Zone = @Zone,
                    HtmlSnippet = @Html,
                    Help = @Help,
                    LastModifiedByUserId = @UserId,
                    LastModifiedOnDate = SYSUTCDATETIME()
                WHEN NOT MATCHED THEN INSERT
                    (PortalId, [Key], Name, Category, Zone, HtmlSnippet, Help, CreatedByUserId, CreatedOnDate)
                VALUES
                    (@PortalId, @Key, @Name, @Category, @Zone, @Html, @Help, @UserId, SYSUTCDATETIME())
                OUTPUT INSERTED.Id;", conn))
            {
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                cmd.Parameters.AddWithValue("@Key", key);
                cmd.Parameters.AddWithValue("@Name", (object)(name ?? string.Empty));
                cmd.Parameters.AddWithValue("@Category", (object)(category ?? "custom"));
                cmd.Parameters.AddWithValue("@Zone", (object)(zone ?? "any"));
                cmd.Parameters.AddWithValue("@Html", (object)html);
                cmd.Parameters.AddWithValue("@Help", (object)(help ?? string.Empty));
                cmd.Parameters.AddWithValue("@UserId", userId);
                conn.Open();
                var newId = Convert.ToInt32(cmd.ExecuteScalar());
                return new
                {
                    id = newId,
                    key,
                    name,
                    category = category ?? "custom",
                    zone = zone ?? "any",
                    html,
                    help = help ?? string.Empty,
                };
            }
        }

        private static bool Delete(int portalId, int id)
        {
            using (var conn = GetConnection())
            using (var cmd = new SqlCommand(
                "DELETE FROM MF_DesignerBlocks WHERE Id=@Id AND PortalId=@PortalId", conn))
            {
                cmd.Parameters.AddWithValue("@Id", id);
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                conn.Open();
                return cmd.ExecuteNonQuery() > 0;
            }
        }

        private static string Trimmed(JObject body, string key)
        {
            var v = body[key];
            if (v == null || v.Type == JTokenType.Null) return string.Empty;
            return (v.ToString() ?? string.Empty).Trim();
        }
    }
}
