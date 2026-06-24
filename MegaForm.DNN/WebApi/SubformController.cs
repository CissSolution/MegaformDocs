using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Web.Api;
using MegaForm.Core.Services.Subform;
using MegaForm.DNN.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// Subform (Master-Detail) widget backend.
    ///
    /// Endpoints (DNN routes resolve via catch-all {controller}/{action}):
    ///   GET  /DesktopModules/MegaForm/API/Subform/Tables?portalId=N
    ///   GET  /DesktopModules/MegaForm/API/Subform/Columns?tableName=Foo&portalId=N
    ///   POST /DesktopModules/MegaForm/API/Subform/Compute   { formula, row, rows }
    ///   POST /DesktopModules/MegaForm/API/Subform/Rows?formId=N&submissionId=M&fieldKey=items
    ///   POST /DesktopModules/MegaForm/API/Subform/Save      { formId, submissionId, fieldKey, rows[], deletedIds[] }
    ///
    /// Connection is fixed to the portal-stored DashboardDatabase alias (per the
    /// user's day-1 scope decision). Server-side compute uses the canonical
    /// MegaForm.Core.Services.Subform.SubformExpressionEvaluator (arithmetic + Sum/Avg
    /// over a quoted row expression). Razor-style full scripting is an opt-in
    /// upgrade for Phase 2.
    ///
    /// Badge: SubformController v20260528-15
    /// </summary>
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class SubformController : DnnApiController
    {
        private int ResolveTargetPortalId()
        {
            var fallback = PortalSettings != null ? PortalSettings.PortalId : 0;
            try
            {
                var query = Request != null && Request.RequestUri != null ? Request.RequestUri.ParseQueryString() : null;
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

        private string GetPortalSetting(string key, string defaultValue = "")
        {
            try
            {
                var fullKey = "MegaForm_" + key;
                return DotNetNuke.Entities.Controllers.HostController.Instance.GetString(fullKey, null) ?? defaultValue;
            }
            catch { return defaultValue; }
        }

        private DbConnection OpenDashboardConnection()
        {
            var registry = new DnnConnectionRegistry(GetPortalSetting);
            var conn = registry.GetConnection("DashboardDatabase");
            conn.Open();
            return conn;
        }

        // [v20260529-07] Apply-generated CREATE TABLE DDL coming from the AI
        // "Create DB Table" wizard. Runs against DashboardDatabase, refuses
        // anything other than a CREATE TABLE statement, and returns the new
        // table name on success so the front-end can refresh its list.
        //
        // Admin-only by virtue of the controller-level [DnnAuthorize] and an
        // explicit caller-role check below.
        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("ApplyDdl")]
        public HttpResponseMessage ApplyDdl(JObject body)
        {
            var caller = UserInfo;
            if (caller == null || !(caller.IsSuperUser || caller.IsInRole("Administrators")))
                return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrator role required." });
            if (body == null) return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Body required." });
            var ddl = (string)body["ddl"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(ddl))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "ddl is required." });

            // Single-statement / single-CREATE-TABLE guard. We strip line-comments
            // and block-comments first so the regex sees only real SQL.
            var clean = StripSqlComments(ddl).Trim().TrimEnd(';');
            var lower = clean.ToLowerInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(lower, @"^\s*create\s+table\b"))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Only a single CREATE TABLE statement is allowed." });
            // Reject anything that smells like multi-statement / destructive.
            var forbidden = new[] { ";\\s*\\w", "\\bdrop\\b", "\\btruncate\\b", "\\bdelete\\b", "\\bupdate\\b", "\\bexec\\b", "\\bexecute\\b", "\\bxp_\\w", "\\bsp_\\w", "\\binsert\\b", "\\balter\\b", "\\bgrant\\b", "\\brevoke\\b" };
            foreach (var rx in forbidden)
            {
                if (System.Text.RegularExpressions.Regex.IsMatch(lower, rx))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "DDL rejected (contains forbidden keyword/pattern: " + rx + ")." });
            }

            // Pull the [schema].[table] target out for the response.
            string targetSchema = "dbo", targetTable = null;
            var m = System.Text.RegularExpressions.Regex.Match(clean,
                @"create\s+table\s+(?:\[?(?<sch>[A-Za-z0-9_]+)\]?\s*\.\s*)?\[?(?<tbl>[A-Za-z0-9_]+)\]?",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            if (m.Success)
            {
                if (m.Groups["sch"].Success && !string.IsNullOrWhiteSpace(m.Groups["sch"].Value)) targetSchema = m.Groups["sch"].Value;
                if (m.Groups["tbl"].Success) targetTable = m.Groups["tbl"].Value;
            }
            if (string.IsNullOrWhiteSpace(targetTable))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Could not parse target table name." });

            try
            {
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = clean;
                    cmd.CommandType = CommandType.Text;
                    cmd.ExecuteNonQuery();
                }
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    ok = true,
                    schemaName = targetSchema,
                    tableName = targetTable,
                    fullName = targetSchema + "." + targetTable,
                    message = "Table " + targetSchema + "." + targetTable + " created successfully."
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "SQL error: " + ex.Message });
            }
        }

        private static string StripSqlComments(string sql)
        {
            if (string.IsNullOrEmpty(sql)) return sql;
            // Remove block comments /* ... */
            sql = System.Text.RegularExpressions.Regex.Replace(sql, @"/\*.*?\*/", string.Empty, System.Text.RegularExpressions.RegexOptions.Singleline);
            // Remove line comments -- ...
            sql = System.Text.RegularExpressions.Regex.Replace(sql, @"--.*?$", string.Empty, System.Text.RegularExpressions.RegexOptions.Multiline);
            return sql;
        }

        [HttpGet]
        [ActionName("Tables")]
        public HttpResponseMessage ListTables(int showAll = 0)
        {
            // [v20260529-01] When showAll=0 (default), filter out DNN / ASP.NET
            // platform tables so the admin's table picker only shows their own
            // application data. The blacklist is conservative — DNN modules
            // accumulate dozens of tables (CoreMessaging_*, ContentWorkflow*,
            // aspnet_*, dnn_* etc.) that would never make sense as form
            // datasources and clutter the picker. Pass ?showAll=1 to bypass.
            try
            {
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    var whereExtra = showAll == 1 ? string.Empty : @"
                          AND TABLE_NAME NOT LIKE 'Anonymous%'
                          AND TABLE_NAME NOT LIKE 'ApiToken%'
                          AND TABLE_NAME NOT LIKE 'Application%'
                          AND TABLE_NAME NOT LIKE 'aspnet[_]%'
                          AND TABLE_NAME NOT LIKE 'Assemblies%'
                          AND TABLE_NAME NOT LIKE 'AuthCookies%'
                          AND TABLE_NAME NOT LIKE 'AuthenticationProvider%'
                          AND TABLE_NAME NOT LIKE 'Banned%'
                          AND TABLE_NAME NOT LIKE 'ClientResource%'
                          AND TABLE_NAME NOT LIKE 'ContentItem%'
                          AND TABLE_NAME NOT LIKE 'ContentType%'
                          AND TABLE_NAME NOT LIKE 'CoreMessaging[_]%'
                          AND TABLE_NAME NOT LIKE 'ContentWorkflow%'
                          AND TABLE_NAME NOT LIKE 'Cookie%'
                          AND TABLE_NAME NOT LIKE 'dnn[_]%'
                          AND TABLE_NAME NOT LIKE 'DNN[_]%'
                          AND TABLE_NAME NOT LIKE 'EventLog%'
                          AND TABLE_NAME NOT LIKE 'EventQueue%'
                          AND TABLE_NAME NOT LIKE 'Folder%'
                          AND TABLE_NAME NOT LIKE 'Host%'
                          AND TABLE_NAME NOT LIKE 'Languages%'
                          AND TABLE_NAME NOT LIKE 'List%'
                          AND TABLE_NAME NOT LIKE 'Log%'
                          AND TABLE_NAME NOT LIKE 'Modul%'
                          AND TABLE_NAME NOT LIKE 'Notification%'
                          AND TABLE_NAME NOT LIKE 'Permission%'
                          AND TABLE_NAME NOT LIKE 'Permissions%'
                          AND TABLE_NAME NOT LIKE 'PersonaBar%'
                          AND TABLE_NAME NOT LIKE 'Portal%'
                          AND TABLE_NAME NOT LIKE 'Profile%'
                          AND TABLE_NAME NOT LIKE 'Relationship%'
                          AND TABLE_NAME NOT LIKE 'Role%'
                          AND TABLE_NAME NOT LIKE 'Schedule%'
                          AND TABLE_NAME NOT LIKE 'SearchDeletedItems'
                          AND TABLE_NAME NOT LIKE 'Search%'
                          AND TABLE_NAME NOT LIKE 'Setting%'
                          AND TABLE_NAME NOT LIKE 'Site%'
                          AND TABLE_NAME NOT LIKE 'Skin%'
                          AND TABLE_NAME NOT LIKE 'Tab%'
                          AND TABLE_NAME NOT LIKE 'Taxonomy_%'
                          AND TABLE_NAME NOT LIKE 'Terms%'
                          AND TABLE_NAME NOT LIKE 'Url%'
                          AND TABLE_NAME NOT LIKE 'Users%'
                          AND TABLE_NAME NOT LIKE 'User[_]%'
                          AND TABLE_NAME NOT LIKE 'Vocabular%'
                          AND TABLE_NAME NOT LIKE 'Webhook[_]%'
                          AND TABLE_NAME NOT LIKE 'Workflow[_]%'
                          AND TABLE_NAME NOT LIKE 'MF[_]%'           -- MegaForm's own tables
                          AND TABLE_NAME NOT IN ('Files','FileVersions','Items','OutputCache','Packages','SecureContent','SiteGroups')";
                    cmd.CommandText = @"
                        SELECT TABLE_SCHEMA, TABLE_NAME
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_TYPE = 'BASE TABLE'
                          AND TABLE_NAME NOT LIKE 'sys%'
                          AND TABLE_NAME NOT LIKE 'MS%'" + whereExtra + @"
                        ORDER BY TABLE_SCHEMA, TABLE_NAME";
                    var list = new List<SubformTableInfo>();
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new SubformTableInfo
                            {
                                Schema = r.GetString(0),
                                Name   = r.GetString(1)
                            });
                        }
                    }
                    return Request.CreateResponse(HttpStatusCode.OK, new { tables = list, showAll = showAll == 1 });
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpGet]
        [ActionName("Columns")]
        public HttpResponseMessage GetColumns(string tableName = null)
        {
            if (string.IsNullOrWhiteSpace(tableName))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "tableName required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "invalid tableName" });
            try
            {
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, ISNULL(c.CHARACTER_MAXIMUM_LENGTH,0)
                        FROM INFORMATION_SCHEMA.COLUMNS c
                        WHERE c.TABLE_NAME = @t
                        ORDER BY c.ORDINAL_POSITION";
                    var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = tableName; cmd.Parameters.Add(p);

                    var cols = new List<SubformDbColumn>();
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            var name = r.GetString(0);
                            var type = r.GetString(1);
                            cols.Add(new SubformDbColumn
                            {
                                Name      = name,
                                DataType  = type,
                                Nullable  = r.GetString(2) == "YES",
                                MaxLength = r.GetInt32(3),
                                UiType    = ClassifyUiType(type)
                            });
                        }
                    }
                    return Request.CreateResponse(HttpStatusCode.OK, new { table = tableName, columns = cols });
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        [HttpPost]
        [ActionName("Compute")]
        [AllowAnonymous]
        public HttpResponseMessage Compute([FromBody] SubformComputeRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Formula))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formula required" });
            try
            {
                var eval = new SubformExpressionEvaluator(
                    req.Row ?? new Dictionary<string, object>(),
                    req.Rows ?? new List<Dictionary<string, object>>());
                var value = eval.Evaluate(req.Formula);
                return Request.CreateResponse(HttpStatusCode.OK, new SubformComputeResult
                {
                    Value     = value,
                    Formatted = value.ToString(System.Globalization.CultureInfo.InvariantCulture)
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.OK, new SubformComputeResult { Error = ex.Message });
            }
        }

        [HttpGet]
        [ActionName("Rows")]
        [AllowAnonymous]
        public HttpResponseMessage GetRows(string tableName = null, string parentKeyColumn = null, long submissionId = 0)
        {
            if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(parentKeyColumn) || submissionId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "tableName, parentKeyColumn, submissionId required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "invalid tableName" });
            if (parentKeyColumn.IndexOfAny(new[] { ';', '\'', '"', '[', ']', ' ' }) >= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "invalid parentKeyColumn" });
            try
            {
                using (var conn = OpenDashboardConnection())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM [" + tableName + "] WHERE [" + parentKeyColumn + "] = @p";
                    var p = cmd.CreateParameter(); p.ParameterName = "@p"; p.Value = submissionId; cmd.Parameters.Add(p);
                    using (var r = cmd.ExecuteReader())
                    {
                        var rows = new List<Dictionary<string, object>>();
                        while (r.Read())
                        {
                            var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                            for (int i = 0; i < r.FieldCount; i++)
                            {
                                row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                            }
                            rows.Add(row);
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, new { rows });
                    }
                }
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError, new { error = ex.Message });
            }
        }

        // Save endpoint deliberately deferred to Phase 2 — Subform inline edit
        // currently writes through the master form's submission DataJson path
        // (rows[] array stored inside parent submission), so no separate detail
        // table mutation is needed for v20260528-15 ship. When connecting to an
        // external detail table on DashboardDatabase, admin will configure
        // tableName + parentKeyColumn and Save will land here in a follow-up.

        private static string ClassifyUiType(string sqlType)
        {
            var t = (sqlType ?? "").ToLowerInvariant();
            if (t.Contains("int") || t == "bigint" || t == "smallint") return "number";
            if (t.Contains("decimal") || t.Contains("numeric") || t.Contains("money") || t.Contains("float") || t.Contains("real")) return "currency";
            if (t.Contains("date") || t.Contains("time")) return "date";
            if (t == "bit") return "checkbox";
            return "text";
        }
    }
}
