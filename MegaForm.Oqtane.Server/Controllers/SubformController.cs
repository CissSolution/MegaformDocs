using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
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

        [HttpGet("Tables")]
        public IActionResult ListTables()
        {
            if (!IsAdmin) return Unauthorized();
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                if (IsSqlite(conn))
                {
                    cmd.CommandText = @"
                        SELECT 'main' AS TABLE_SCHEMA, name AS TABLE_NAME
                        FROM sqlite_master
                        WHERE type = 'table'
                          AND name NOT LIKE 'sqlite_%'
                        ORDER BY name";
                }
                else
                {
                    cmd.CommandText = @"
                        SELECT TABLE_SCHEMA, TABLE_NAME
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_TYPE = 'BASE TABLE'
                          AND TABLE_NAME NOT LIKE 'sys%'
                          AND TABLE_NAME NOT LIKE 'MS%'
                        ORDER BY TABLE_SCHEMA, TABLE_NAME";
                }
                var list = new List<SubformTableInfo>();
                using var r = cmd.ExecuteReader();
                while (r.Read())
                    list.Add(new SubformTableInfo { Schema = r.GetString(0), Name = r.GetString(1) });
                return Ok(new { tables = list });
            }
            catch (InvalidOperationException ioe) when (ioe.Message.Contains("Connection string", StringComparison.OrdinalIgnoreCase))
            {
                // Graceful degrade when DashboardDatabase is not configured
                return Ok(new { tables = new List<SubformTableInfo>(), warning = ioe.Message });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("Columns")]
        public IActionResult GetColumns([FromQuery] string tableName)
        {
            if (!IsAdmin) return Unauthorized();
            if (string.IsNullOrWhiteSpace(tableName)) return BadRequest(new { error = "tableName required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid tableName" });
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                if (IsSqlite(conn))
                {
                    // SQLite PRAGMA cannot be parameterised, but tableName has
                    // already been validated for dangerous chars above.
                    cmd.CommandText = $@"
                        SELECT name, type, NOT notnull, COALESCE(dflt_value,'')
                        FROM pragma_table_info('{tableName.Replace("'", "''")}')
                        ORDER BY cid";
                }
                else
                {
                    cmd.CommandText = @"
                        SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, ISNULL(c.CHARACTER_MAXIMUM_LENGTH,0)
                        FROM INFORMATION_SCHEMA.COLUMNS c
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
                        MaxLength = 0,
                        UiType = ClassifyUiType(type)
                    });
                }
                return Ok(new { table = tableName, columns = cols });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
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
            catch (Exception ex) { return Ok(new SubformComputeResult { Error = ex.Message }); }
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
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
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
            catch (Exception ex)
            {
                return BadRequest(new { error = "SQL error: " + ex.Message });
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
