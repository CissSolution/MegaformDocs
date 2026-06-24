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

        public SubformController(IConnectionRegistry connectionRegistry, IConfiguration config)
        {
            _connectionRegistry = connectionRegistry;
            _config = config;
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
        public IActionResult ListTables()
        {
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                if (IsSqlite(conn))
                {
                    cmd.CommandText = @"
                        SELECT 'main' AS TABLE_SCHEMA, name AS TABLE_NAME
                        FROM sqlite_master
                        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
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
                return Ok(new { tables = new List<SubformTableInfo>(), warning = ioe.Message });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
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
                if (IsSqlite(conn))
                {
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
                var eval = new SubformExpressionEvaluator(req.Row ?? new Dictionary<string, object>(), req.Rows ?? new List<Dictionary<string, object>>());
                var value = eval.Evaluate(req.Formula);
                return Ok(new SubformComputeResult { Value = value, Formatted = value.ToString(System.Globalization.CultureInfo.InvariantCulture) });
            }
            catch (Exception ex) { return Ok(new SubformComputeResult { Error = ex.Message }); }
        }

        [HttpGet("Rows")]
        [AllowAnonymous]
        public IActionResult GetRows([FromQuery] string tableName, [FromQuery] string parentKeyColumn, [FromQuery] long submissionId)
        {
            if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(parentKeyColumn) || submissionId <= 0)
                return BadRequest(new { error = "tableName, parentKeyColumn, submissionId required" });
            if (tableName.IndexOfAny(new[] { ';', '\'', '"', '[', ']' }) >= 0) return BadRequest(new { error = "invalid tableName" });
            if (parentKeyColumn.IndexOfAny(new[] { ';', '\'', '"', '[', ']', ' ' }) >= 0) return BadRequest(new { error = "invalid parentKeyColumn" });
            try
            {
                using var conn = OpenDashboardConnection();
                using var cmd = conn.CreateCommand();
                cmd.CommandText = "SELECT * FROM [" + tableName + "] WHERE [" + parentKeyColumn + "] = @p";
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
