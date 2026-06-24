using System;
using System.Collections.Generic;
using System.Data.Common;

namespace MegaForm.Core.Services.Subform
{
    /// <summary>
    /// [P0-2 20260609] Provider-aware SQL metadata reader. Oqtane runs on
    /// SQLite / PostgreSQL / MySQL / SQL Server — INFORMATION_SCHEMA does NOT
    /// exist on SQLite (and ISNULL is MSSQL-only), which is why the old
    /// INFORMATION_SCHEMA queries 500'd on the SQLite host. This helper detects
    /// the provider from the live DbConnection and dialect-switches the metadata
    /// query, so SubformController + the AiTools SQL endpoints work on every DB.
    /// </summary>
    public static class SqlSchemaReader
    {
        public enum ProviderKind { SqlServer, Sqlite, PostgreSql, MySql, Unknown }

        public static ProviderKind Detect(DbConnection conn)
        {
            var n = (conn?.GetType().Name ?? string.Empty).ToLowerInvariant();
            if (n.Contains("sqlite")) return ProviderKind.Sqlite;
            if (n.Contains("npgsql") || n.Contains("postgres")) return ProviderKind.PostgreSql;
            if (n.Contains("mysql") || n.Contains("mariadb")) return ProviderKind.MySql;
            if (n.Contains("sqlconnection")) return ProviderKind.SqlServer;
            return ProviderKind.Unknown;
        }

        public static List<SubformTableInfo> ListTables(DbConnection conn)
        {
            var list = new List<SubformTableInfo>();
            using (var cmd = conn.CreateCommand())
            {
                switch (Detect(conn))
                {
                    case ProviderKind.Sqlite:
                        cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
                        using (var r = cmd.ExecuteReader()) while (r.Read()) list.Add(new SubformTableInfo { Schema = string.Empty, Name = r.GetString(0) });
                        break;
                    case ProviderKind.PostgreSql:
                        cmd.CommandText = "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name";
                        using (var r = cmd.ExecuteReader()) while (r.Read()) list.Add(new SubformTableInfo { Schema = Str(r, 0), Name = Str(r, 1) });
                        break;
                    case ProviderKind.MySql:
                        cmd.CommandText = "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema = DATABASE() ORDER BY table_name";
                        using (var r = cmd.ExecuteReader()) while (r.Read()) list.Add(new SubformTableInfo { Schema = Str(r, 0), Name = Str(r, 1) });
                        break;
                    default: // SQL Server (+ best-effort Unknown)
                        cmd.CommandText = "SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME NOT LIKE 'sys%' AND TABLE_NAME NOT LIKE 'MS%' ORDER BY TABLE_SCHEMA, TABLE_NAME";
                        using (var r = cmd.ExecuteReader()) while (r.Read()) list.Add(new SubformTableInfo { Schema = Str(r, 0), Name = Str(r, 1) });
                        break;
                }
            }
            return list;
        }

        /// <summary>Caller MUST validate <paramref name="table"/> (no quotes/semicolons) — the
        /// SQLite PRAGMA path cannot be parameterised.</summary>
        public static List<SubformDbColumn> ListColumns(DbConnection conn, string table)
        {
            var cols = new List<SubformDbColumn>();
            using (var cmd = conn.CreateCommand())
            {
                if (Detect(conn) == ProviderKind.Sqlite)
                {
                    cmd.CommandText = "PRAGMA table_info(\"" + (table ?? string.Empty).Replace("\"", string.Empty) + "\")";
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) // cid(0) name(1) type(2) notnull(3) dflt_value(4) pk(5)
                        {
                            var type = r.IsDBNull(2) ? string.Empty : r.GetString(2);
                            cols.Add(new SubformDbColumn
                            {
                                Name = r.GetString(1),
                                DataType = type,
                                Nullable = r.GetInt32(3) == 0,
                                IsPrimary = !r.IsDBNull(5) && Convert.ToInt32(r.GetValue(5)) > 0,
                                MaxLength = 0,
                                UiType = ClassifyUiType(type),
                            });
                        }
                    }
                    return cols;
                }
                // INFORMATION_SCHEMA path (PostgreSQL / MySQL / SQL Server). COALESCE works on all three.
                cmd.CommandText = "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COALESCE(CHARACTER_MAXIMUM_LENGTH,0) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION";
                var p = cmd.CreateParameter(); p.ParameterName = "@t"; p.Value = table ?? string.Empty; cmd.Parameters.Add(p);
                using (var rr = cmd.ExecuteReader())
                {
                    while (rr.Read())
                    {
                        var type = rr.IsDBNull(1) ? string.Empty : rr.GetString(1);
                        long ml = 0; try { ml = rr.IsDBNull(3) ? 0 : Convert.ToInt64(rr.GetValue(3)); } catch { /* TEXT/max → leave 0 */ }
                        cols.Add(new SubformDbColumn
                        {
                            Name = rr.GetString(0),
                            DataType = type,
                            Nullable = (rr.IsDBNull(2) ? "YES" : rr.GetString(2)).Equals("YES", StringComparison.OrdinalIgnoreCase),
                            MaxLength = ml > int.MaxValue ? int.MaxValue : (int)ml,
                            UiType = ClassifyUiType(type),
                        });
                    }
                }
            }
            return cols;
        }

        private static string Str(DbDataReader r, int i) => r.IsDBNull(i) ? string.Empty : Convert.ToString(r.GetValue(i));

        /// <summary>Cross-provider UI classification (SQLite INTEGER/TEXT/REAL · PG integer/character
        /// varying · MySQL int/varchar · MSSQL int/nvarchar/bit...).</summary>
        public static string ClassifyUiType(string sqlType)
        {
            var t = (sqlType ?? string.Empty).ToLowerInvariant();
            if (t == "bit" || t.Contains("bool")) return "boolean";
            if (t.Contains("date") || t.Contains("time")) return "date";
            if (t.Contains("int") || t.Contains("serial") || t.Contains("numeric") || t.Contains("decimal")
                || t.Contains("real") || t.Contains("float") || t.Contains("double") || t.Contains("money")) return "number";
            return "text"; // char/varchar/text/nvarchar/clob/uuid/json/...
        }
    }
}
