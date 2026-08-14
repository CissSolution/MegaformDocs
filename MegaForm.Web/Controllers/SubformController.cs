using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services.Subform;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// MegaForm Subform/DataGrid widget API for ASP.NET Core hosts.
    /// Mirrors Oqtane/DNN: Tables / Columns / Compute / Rows.
    /// </summary>
    [Route("api/MegaFormPopup/[controller]")]
    [Route("api/MegaForm/[controller]")]
    [Route("DesktopModules/MegaForm/API/[controller]")]
    [IgnoreAntiforgeryToken]
    public class SubformController : ControllerBase
    {
        private readonly IConnectionRegistry _connectionRegistry;
        private readonly IConfiguration _config;
        // [Rule10 2026-07-27] Provider exceptions are logged here, never returned to the caller.
        private readonly Microsoft.Extensions.Logging.ILogger<SubformController> _logger;

        public SubformController(IConnectionRegistry connectionRegistry, IConfiguration config,
            Microsoft.Extensions.Logging.ILogger<SubformController> logger)
        {
            _connectionRegistry = connectionRegistry;
            _config = config;
            _logger = logger;
        }

        private bool IsAdmin => User?.Identity?.IsAuthenticated == true && User.IsInRole("Administrator");
        private static bool IsSqlite(DbConnection conn) => conn.GetType().FullName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) == true;

        private DbConnection OpenDashboardConnection()
        {
            var connStr = _config?["ConnectionStrings:DashboardDatabase"] ?? string.Empty;
            var dbType = (connStr.Contains(".db", StringComparison.OrdinalIgnoreCase) || connStr.Contains("SQLite", StringComparison.OrdinalIgnoreCase)) ? "sqlite" : null;
            var conn = _connectionRegistry.GetConnection("DashboardDatabase", databaseType: dbType);
            conn.Open();
            return conn;
        }

        [HttpGet("Tables")]
        [Authorize(Roles = "Administrator")]
        public IActionResult ListTables([FromQuery] int showAll = 0)
        {
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                // [ShowAllParity v20260813] Twin of the Oqtane/DNN contract: the builder's
                // "Show system tables" checkbox sends ?showAll=1. Default hides the platform's and
                // MegaForm's own tables by EXACT NAME, so a customer table is never eaten by a
                // prefix match. See PlatformSystemTables / MegaFormInternalTables.
                var hideSystem = showAll != 1;
                if (IsSqlite(conn))
                {
                    var sqliteFilter = hideSystem
                        ? " AND name NOT IN (" + PlatformSystemTables.SqlNameList() +
                          ") AND name NOT IN (" + MegaFormInternalTables.SqlNameList() +
                          ") AND name NOT LIKE 'AspNet%'"
                        : string.Empty;
                    cmd.CommandText = @"
                        SELECT 'main' AS TABLE_SCHEMA, name AS TABLE_NAME
                        FROM sqlite_master
                        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'" + sqliteFilter + @"
                        ORDER BY name";
                }
                else
                {
                    var filter = hideSystem
                        ? " AND TABLE_NAME NOT IN (" + PlatformSystemTables.SqlNameList() +
                          ") AND TABLE_NAME NOT IN (" + MegaFormInternalTables.SqlNameList() +
                          ") AND TABLE_NAME NOT LIKE 'AspNet%'"
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
            catch (InvalidOperationException ioe) when (
                ioe.Message.Contains("Connection string", StringComparison.OrdinalIgnoreCase) ||
                ioe.Message.Contains("Dashboard database connection", StringComparison.OrdinalIgnoreCase) ||
                ioe.Message.Contains("connection is not configured", StringComparison.OrdinalIgnoreCase))
            {
                // [Rule10 2026-07-27] Static text — the provider message names the connection.
                return Ok(new { tables = new List<SubformTableInfo>(), warning = "connection is not configured" });
            }
            // [Rule10 2026-07-27] Never echo the provider exception: it leaks the database name and
            // the app-pool identity (e.g. Cannot open database "X" … Login failed for 'IIS APPPOOL\Y').
            catch (Exception ex)
            {
                Microsoft.Extensions.Logging.LoggerExtensions.LogError(_logger, ex, "Subform.Tables failed");
                return StatusCode(500, new { error = "could not list tables" });
            }
        }

        [HttpGet("Columns")]
        [Authorize(Roles = "Administrator")]
        public IActionResult GetColumns([FromQuery] string tableName)
        {
            if (string.IsNullOrWhiteSpace(tableName)) return BadRequest(new { error = "tableName required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid tableName" });
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                // [ColumnsFix v20260813] Twin of the Oqtane fix: Convert.ToBoolean() on
                // INFORMATION_SCHEMA.IS_NULLABLE ('YES'/'NO') threw on every SQL Server table, so this
                // endpoint answered 500 for all of them and the builder's Database tab could never
                // expand a table or insert a DataGrid. Both column shapes are cast in SQL now.
                // IsPrimary/IsIdentity are populated so "+ DataGrid" can drop identity keys.
                if (IsSqlite(conn))
                {
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
                Microsoft.Extensions.Logging.LoggerExtensions.LogError(_logger, ex, "Subform.Columns failed for {Table}", tableName);
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
                var eval = new SubformExpressionEvaluator(req.Row ?? new Dictionary<string, object>(), req.Rows ?? new List<Dictionary<string, object>>());
                var value = eval.Evaluate(req.Formula);
                return Ok(new SubformComputeResult { Value = value, Formatted = value.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            }
            // [Rule10 2026-07-27] The evaluator's own InvalidOperationException describes the
            // *designer's formula* (Unknown function, Mismatched parens, …) and carries no server
            // state, so it stays — it is the only useful feedback while authoring a formula.
            // Anything else is unexpected and must not reach the client (this action is anonymous).
            catch (InvalidOperationException ioe) { return Ok(new SubformComputeResult { Error = ioe.Message }); }
            catch (Exception ex)
            {
                Microsoft.Extensions.Logging.LoggerExtensions.LogError(_logger, ex, "Subform.Compute failed");
                return Ok(new SubformComputeResult { Error = "formula could not be evaluated" });
            }
        }

        [HttpGet("Rows")]
        [Authorize(Roles = "Administrator")]
        public IActionResult GetRows([FromQuery] string tableName, [FromQuery] string parentKeyColumn, [FromQuery] long submissionId)
        {
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
                Microsoft.Extensions.Logging.LoggerExtensions.LogError(_logger, ex, "Subform.Rows failed for {Table}", tableName);
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
