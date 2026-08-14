using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Oqtane.Controllers;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Models;
using Oqtane.Repository;
using Oqtane.Shared;
using MegaForm.Core.Services.Subform;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// Oqtane parity surface for the Subform/DataGrid widget.
    /// Mirrors the DNN SubformController contract (Tables / Columns / Compute / Rows)
    /// but resolves the DashboardDatabase connection from Oqtane Site settings.
    ///
    /// Route prefix: /api/MegaFormPopup/Subform
    /// (joins the existing MegaFormPopup catch-all so the same client URL works.)
    ///
    /// Badge: OqtaneSubformController v20260528-15
    /// </summary>
    [Route("api/MegaFormPopup/[controller]")]
    [IgnoreAntiforgeryToken]
    public class SubformController : ModuleControllerBase
    {
        private readonly ISettingRepository _settings;
        private readonly MegaForm.Core.Interfaces.IConnectionRegistry _connectionRegistry;
        private readonly Microsoft.Extensions.Configuration.IConfiguration _config;

        public SubformController(
            ISettingRepository settings,
            MegaForm.Core.Interfaces.IConnectionRegistry connectionRegistry,
            Microsoft.Extensions.Configuration.IConfiguration config,
            ILogManager logger,
            IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _settings = settings;
            _connectionRegistry = connectionRegistry;
            _config = config;
        }

        private int SiteId => AuthEntityId(EntityNames.Site);
        private bool IsAdmin => User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host);

        private static bool IsSqlite(DbConnection conn)
            => conn.GetType().FullName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true;

        private DbConnection OpenDashboardConnection()
        {
            // Detect SQLite from the raw connection string so we can pass the
            // correct databaseType to the registry (otherwise it defaults to
            // SqlClient which cannot parse a SQLite connection string).
            var connStr = _config?["ConnectionStrings:DashboardDatabase"] ?? string.Empty;
            var dbType = (connStr.Contains(".db", StringComparison.OrdinalIgnoreCase) || connStr.Contains("SQLite", StringComparison.OrdinalIgnoreCase))
                ? "sqlite" : null;
            var conn = _connectionRegistry.GetConnection("DashboardDatabase", databaseType: dbType);
            conn.Open();
            return conn;
        }

        // ── [DbTabConnPicker v20260722-01] Per-form connection picker support ──
        // The builder DB tab may now read tables from a chosen named connection, not just
        // DashboardDatabase. SECURITY (CLAUDE.md #1/#11): the client-sent connectionKey is
        // NEVER trusted — it is gated against the SAME admin allow-list ExternalTableController
        // uses (appsettings AllowedConnections ∪ admin-saved catalog names, always incl.
        // DashboardDatabase). A key the operator never listed can never be opened.
        private List<string> AllowedConnections()
        {
            var configured = _config?.GetSection("MegaForm:ExternalTables:AllowedConnections").Get<string[]>();
            var list = configured != null && configured.Length > 0
                ? configured.Where(k => !string.IsNullOrWhiteSpace(k)).ToList()
                : new List<string> { "DashboardDatabase" };
            if (!list.Any(k => string.Equals(k, "DashboardDatabase", StringComparison.OrdinalIgnoreCase)))
                list.Add("DashboardDatabase");
            foreach (var name in SavedConnectionNames())
                if (!list.Any(k => string.Equals(k, name, StringComparison.OrdinalIgnoreCase)))
                    list.Add(name);
            return list;
        }

        private IEnumerable<string> SavedConnectionNames()
        {
            try
            {
                if (_settings == null) return Enumerable.Empty<string>();
                var siteId = SiteId;
                if (siteId <= 0)
                {
                    // AuthEntityId(Site)=-1 trap: resolve via the tenant alias — the same seam the
                    // runtime registry reads the catalog with, so reader and writer never disagree.
                    var tenants = HttpContext?.RequestServices?.GetService(typeof(ITenantManager)) as ITenantManager;
                    var alias = tenants?.GetAlias();
                    if (alias != null && alias.SiteId > 0) siteId = alias.SiteId;
                }
                if (siteId <= 0) return Enumerable.Empty<string>();
                var all = _settings.GetSettings(EntityNames.Site, siteId);
                var json = all?.FirstOrDefault(s => string.Equals(s.SettingName,
                    MegaForm.Core.Services.NamedConnectionCatalog.SettingKey, StringComparison.OrdinalIgnoreCase))?.SettingValue;
                return MegaForm.Core.Services.NamedConnectionCatalog.Names(json).ToList();
            }
            catch { return Enumerable.Empty<string>(); }
        }

        private bool IsAllowed(string key)
            => !string.IsNullOrWhiteSpace(key)
               && AllowedConnections().Any(k => string.Equals(k, key, StringComparison.OrdinalIgnoreCase));

        private string DbTypeFor(string key)
        {
            var cs = _config?["ConnectionStrings:" + key] ?? string.Empty;
            return (cs.IndexOf(".db", StringComparison.OrdinalIgnoreCase) >= 0
                    || cs.IndexOf("sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                ? "sqlite" : null;
        }

        /// <summary>Open a GATED connection for the schema-browsing endpoints. null/empty defaults to
        /// "DashboardDatabase" so unmodified clients behave exactly as before. Caller must have already
        /// checked IsAllowed(connectionKey).</summary>
        private DbConnection OpenSubformConnection(string connectionKey)
        {
            var key = string.IsNullOrWhiteSpace(connectionKey) ? "DashboardDatabase" : connectionKey.Trim();
            var conn = _connectionRegistry.GetConnection(key, databaseType: DbTypeFor(key));
            conn.Open();
            return conn;
        }

        [HttpGet("Tables")]
        public IActionResult ListTables([FromQuery] string connectionKey = null, [FromQuery] int showAll = 0)
        {
            if (!IsAdmin) return Unauthorized();
            var connKey = string.IsNullOrWhiteSpace(connectionKey) ? "DashboardDatabase" : connectionKey.Trim();
            if (!IsAllowed(connKey)) return BadRequest(new { error = "connection not allowed" });
            try
            {
                using var conn = OpenSubformConnection(connKey);
                using var cmd = conn.CreateCommand();
                // [ShowAllParity v20260813] The builder's Database tab has always drawn a "Show
                // system tables" checkbox and always sent ?showAll=1 when it was ticked — this
                // endpoint just never read it, so on Oqtane the checkbox was inert and the tab
                // listed every base table on the connection (74 on a stock 10.1 site, none of them
                // the customer's). Default now hides the platform's and MegaForm's own tables, the
                // same contract the DNN twin has had since v20260529-01; tick the box to see them.
                // Both lists are EXACT NAMES, so a customer table is never eaten by a prefix.
                var hideSystem = showAll != 1;
                if (IsSqlite(conn))
                {
                    var sqliteFilter = hideSystem
                        ? "\n                          AND name NOT IN (" + PlatformSystemTables.SqlNameList() +
                          ")\n                          AND name NOT IN (" + MegaFormInternalTables.SqlNameList() +
                          ")\n                          AND name NOT LIKE 'AspNet%'"
                        : string.Empty;
                    cmd.CommandText = @"
                        SELECT 'main' AS TABLE_SCHEMA, name AS TABLE_NAME
                        FROM sqlite_master
                        WHERE type = 'table'
                          AND name NOT LIKE 'sqlite_%'" + sqliteFilter + @"
                        ORDER BY name";
                }
                else
                {
                    var filter = hideSystem
                        ? "\n                          AND TABLE_NAME NOT IN (" + PlatformSystemTables.SqlNameList() +
                          ")\n                          AND TABLE_NAME NOT IN (" + MegaFormInternalTables.SqlNameList() +
                          ")\n                          AND TABLE_NAME NOT LIKE 'AspNet%'"
                        : string.Empty;
                    cmd.CommandText = @"
                        SELECT TABLE_SCHEMA, TABLE_NAME
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_TYPE = 'BASE TABLE'
                          AND TABLE_NAME NOT LIKE 'sys%'
                          AND TABLE_NAME NOT LIKE 'MS%'" + filter + @"
                        ORDER BY TABLE_SCHEMA, TABLE_NAME";
                }
                var list = new List<SubformTableInfo>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                    list.Add(new SubformTableInfo { Schema = r.GetString(0), Name = r.GetString(1) });
                return Ok(new { tables = list, showAll = showAll == 1 });
            }
            catch (InvalidOperationException ioe) when (ioe.Message.Contains("Connection string", StringComparison.OrdinalIgnoreCase))
            {
                // Graceful degrade when DashboardDatabase is not configured.
                // [Rule10 2026-07-27] Static text — the provider message names the connection.
                return Ok(new { tables = new List<SubformTableInfo>(), warning = "connection is not configured" });
            }
            // [Rule10 2026-07-27] Never echo the provider exception: it leaks the database name and
            // the app-pool identity (e.g. Cannot open database "X" … Login failed for 'IIS APPPOOL\Y').
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "Subform.Tables failed for {Key}", connKey);
                return StatusCode(500, new { error = "could not list tables" });
            }
        }

        [HttpGet("Columns")]
        public IActionResult GetColumns([FromQuery] string tableName, [FromQuery] string connectionKey = null)
        {
            if (!IsAdmin) return Unauthorized();
            if (string.IsNullOrWhiteSpace(tableName)) return BadRequest(new { error = "tableName required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid tableName" });
            var connKey = string.IsNullOrWhiteSpace(connectionKey) ? "DashboardDatabase" : connectionKey.Trim();
            if (!IsAllowed(connKey)) return BadRequest(new { error = "connection not allowed" });
            try
            {
                using var conn = OpenSubformConnection(connKey);
                using var cmd = conn.CreateCommand();
                // [ColumnsFix v20260813] This endpoint returned 500 for EVERY table on SQL Server.
                // INFORMATION_SCHEMA.IS_NULLABLE is the string 'YES'/'NO', and Convert.ToBoolean("YES")
                // throws FormatException — which the catch below turned into "could not read columns".
                // Consequence: on Oqtane the Database tab could list tables but never expand one, and
                // "+ DataGrid" (which loads columns first) failed too. The DNN twin reads
                // `GetString(2) == "YES"` and has always worked. Both column shapes are now cast in
                // SQL so one reader loop is correct for SQL Server and SQLite alike.
                // Verified against :5131 (Oqtane 10.1 / SQL Express), 2026-08-13.
                //
                // IsPrimary/IsIdentity have existed on SubformDbColumn since it was written and were
                // never populated by any platform. They are filled here because "+ DataGrid" drops
                // identity columns (`cols.filter(c => !c.isIdentity)`) — without the flag every
                // generated Subform offered the IDENTITY key as an editable column.
                if (IsSqlite(conn))
                {
                    // SQLite PRAGMA cannot be parameterised, but tableName has
                    // already been validated for dangerous chars above.
                    cmd.CommandText = $@"
                        SELECT name,
                               type,
                               NOT notnull,
                               0,
                               0,
                               CASE WHEN pk > 0 THEN 1 ELSE 0 END
                        FROM pragma_table_info('{tableName.Replace("'", "''")}')
                        ORDER BY cid";
                }
                else
                {
                    cmd.CommandText = @"
                        SELECT c.COLUMN_NAME,
                               c.DATA_TYPE,
                               CAST(CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS bit),
                               ISNULL(c.CHARACTER_MAXIMUM_LENGTH, 0),
                               CAST(ISNULL(COLUMNPROPERTY(
                                   OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)),
                                   c.COLUMN_NAME, 'IsIdentity'), 0) AS bit),
                               CAST(CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS bit)
                        FROM INFORMATION_SCHEMA.COLUMNS c
                        LEFT JOIN (
                            SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                              ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                             AND tc.TABLE_SCHEMA    = ku.TABLE_SCHEMA
                            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                        ) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
                            AND pk.TABLE_NAME   = c.TABLE_NAME
                            AND pk.COLUMN_NAME  = c.COLUMN_NAME
                        WHERE c.TABLE_NAME = @t
                        ORDER BY c.ORDINAL_POSITION";
                    var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = tableName; cmd.Parameters.Add(p);
                }

                var cols = new List<SubformDbColumn>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                {
                    var type = r.GetString(1);
                    cols.Add(new SubformDbColumn
                    {
                        Name = r.GetString(0),
                        DataType = type,
                        Nullable = Convert.ToBoolean(r.GetValue(2)),
                        MaxLength = Convert.ToInt32(r.GetValue(3)),
                        IsIdentity = Convert.ToBoolean(r.GetValue(4)),
                        IsPrimary = Convert.ToBoolean(r.GetValue(5)),
                        UiType = ClassifyUiType(type)
                    });
                }
                return Ok(new { table = tableName, columns = cols });
            }
            // [Rule10 2026-07-27] see GetTables — provider messages leak DB name + app-pool identity.
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "Subform.Columns failed for {Table}", tableName);
                return StatusCode(500, new { error = "could not read columns" });
            }
        }

        [HttpPost("Compute")]
        [AllowAnonymous]
        public IActionResult Compute([FromBody] SubformComputeRequest req)
        {
            if (req == null || string.IsNullOrWhiteSpace(req.Formula))
                return BadRequest(new { error = "formula required" });
            try
            {
                var eval = new SubformExpressionEvaluator(
                    req.Row ?? new Dictionary<string, object>(),
                    req.Rows ?? new List<Dictionary<string, object>>());
                var value = eval.Evaluate(req.Formula);
                return Ok(new SubformComputeResult
                {
                    Value = value,
                    Formatted = value.ToString(System.Globalization.CultureInfo.InvariantCulture)
                });
            }
            // [Rule10 2026-07-27] The evaluator's own InvalidOperationException describes the
            // *designer's formula* (Unknown function, Mismatched parens, …) and carries no server
            // state, so it stays — it is the only useful feedback while authoring a formula.
            // Anything else is unexpected and must not reach the client (this action is anonymous).
            catch (InvalidOperationException ioe) { return Ok(new SubformComputeResult { Error = ioe.Message }); }
            catch (Exception) { return Ok(new SubformComputeResult { Error = "formula could not be evaluated" }); }
        }

        [HttpGet("Rows")]
        public IActionResult GetRows([FromQuery] string tableName, [FromQuery] string parentKeyColumn, [FromQuery] long submissionId)
        {
            if (!IsAdmin) return Unauthorized();
            if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(parentKeyColumn) || submissionId <= 0)
                return BadRequest(new { error = "tableName, parentKeyColumn, submissionId required" });
            if (!IsSafeIdentifier(tableName)) return BadRequest(new { error = "invalid tableName" });
            if (!IsSafeIdentifier(parentKeyColumn)) return BadRequest(new { error = "invalid parentKeyColumn" });
            try
            {
                using var conn = OpenDashboardConnection();
                if (!TableColumnExists(conn, tableName, parentKeyColumn))
                    return BadRequest(new { error = "unknown table or parentKeyColumn" });
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM " + QuoteIdentifier(tableName) + " WHERE " + QuoteIdentifier(parentKeyColumn) + " = @p";
                var p = cmd.CreateParameter(); p.ParameterName = "@p"; p.Value = submissionId; cmd.Parameters.Add(p);
                using var r = cmd.ExecuteReader();
                var rows = new List<Dictionary<string, object>>();
                while (r.Read())
                {
                    var row = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < r.FieldCount; i++)
                        row[r.GetName(i)] = r.IsDBNull(i) ? null : r.GetValue(i);
                    rows.Add(row);
                }
                return Ok(new { rows });
            }
            // [Rule10 2026-07-27] see GetTables — provider messages leak DB name + app-pool identity.
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Read, ex, "Subform.Rows failed for {Table}", tableName);
                return StatusCode(500, new { error = "could not read rows" });
            }
        }

        private static bool IsSafeIdentifier(string value)
            => !string.IsNullOrWhiteSpace(value)
               && System.Text.RegularExpressions.Regex.IsMatch(value, @"^[A-Za-z_][A-Za-z0-9_]*$");

        private static string QuoteIdentifier(string identifier) => "[" + identifier.Replace("]", "]]") + "]";

        private static bool TableColumnExists(DbConnection conn, string tableName, string columnName)
        {
            using var cmd = conn.CreateCommand();
            if (IsSqlite(conn))
            {
                cmd.CommandText = "SELECT 1 FROM pragma_table_info(" + QuoteStringLiteral(tableName) + ") WHERE name = @column LIMIT 1";
                var column = cmd.CreateParameter(); column.ParameterName = "@column"; column.Value = columnName; cmd.Parameters.Add(column);
                return cmd.ExecuteScalar() != null;
            }

            cmd.CommandText = @"
                SELECT 1
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @tableName
                  AND COLUMN_NAME = @columnName";
            var table = cmd.CreateParameter(); table.ParameterName = "@tableName"; table.Value = tableName; cmd.Parameters.Add(table);
            var col = cmd.CreateParameter(); col.ParameterName = "@columnName"; col.Value = columnName; cmd.Parameters.Add(col);
            return cmd.ExecuteScalar() != null;
        }

        private static string QuoteStringLiteral(string value) => "'" + (value ?? string.Empty).Replace("'", "''") + "'";

        // [ApplyDdl v20260624] Oqtane parity for the AI "Create DB Table" wizard.
        // Ported from MegaForm.DNN/WebApi/SubformController.cs:ApplyDdl. Without this
        // action the Oqtane builder AI chat POST /api/MegaFormPopup/Subform/ApplyDdl
        // 404'd ("Apply failed: HTTP 404"). Runs a SINGLE CREATE TABLE against
        // DashboardDatabase, rejects anything else, and returns the new table name
        // so the client can refresh its table list.
        [HttpPost("ApplyDdl")]
        public IActionResult ApplyDdl([FromBody] System.Text.Json.JsonElement body)
        {
            if (!IsAdmin) return Unauthorized();
            string ddl = body.ValueKind == System.Text.Json.JsonValueKind.Object
                && body.TryGetProperty("ddl", out var d) && d.ValueKind == System.Text.Json.JsonValueKind.String
                ? d.GetString() : null;
            if (string.IsNullOrWhiteSpace(ddl))
                return BadRequest(new { error = "ddl is required." });

            // Single-statement / single-CREATE-TABLE guard (comments stripped first).
            var clean = StripSqlComments(ddl).Trim().TrimEnd(';');
            var lower = clean.ToLowerInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(lower, @"^\s*create\s+table\b"))
                return BadRequest(new { error = "Only a single CREATE TABLE statement is allowed." });
            var forbidden = new[] { @";\s*\w", @"\bdrop\b", @"\btruncate\b", @"\bdelete\b", @"\bupdate\b", @"\bexec\b", @"\bexecute\b", @"\bxp_\w", @"\bsp_\w", @"\binsert\b", @"\balter\b", @"\bgrant\b", @"\brevoke\b" };
            foreach (var rx in forbidden)
                if (System.Text.RegularExpressions.Regex.IsMatch(lower, rx))
                    return BadRequest(new { error = "DDL rejected (contains forbidden keyword/pattern: " + rx + ")." });

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
                return BadRequest(new { error = "Could not parse target table name." });

            try
            {
                using var conn = OpenDashboardConnection();
                var sqlite = IsSqlite(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = clean;
                    cmd.CommandType = CommandType.Text;
                    cmd.ExecuteNonQuery();
                }
                var fullName = sqlite ? targetTable : targetSchema + "." + targetTable;
                return Ok(new
                {
                    ok = true,
                    schemaName = sqlite ? "main" : targetSchema,
                    tableName = targetTable,
                    fullName,
                    message = "Table " + fullName + " created successfully."
                });
            }
            // [Rule10 2026-07-27] Admin-only, but the provider message still names the database and
            // the app-pool login on a connection failure. Log it; tell the caller only that the
            // statement was rejected by the database.
            catch (Exception ex)
            {
                _logger.Log(LogLevel.Error, this, LogFunction.Create, ex, "Subform.ApplyDdl failed for {Table}", targetTable);
                return BadRequest(new { error = "the database rejected this CREATE TABLE statement" });
            }
        }

        private static string StripSqlComments(string sql)
        {
            if (string.IsNullOrEmpty(sql)) return sql;
            sql = System.Text.RegularExpressions.Regex.Replace(sql, @"/\*.*?\*/", string.Empty, System.Text.RegularExpressions.RegexOptions.Singleline);
            sql = System.Text.RegularExpressions.Regex.Replace(sql, @"--.*?$", string.Empty, System.Text.RegularExpressions.RegexOptions.Multiline);
            return sql;
        }

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
