using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Linq;
using System.Collections.Concurrent;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    public class DatabaseWorkflowMetadataService : IDatabaseWorkflowMetadataService
    {
        private readonly IConnectionRegistry _registry;
        private static readonly ConcurrentDictionary<string, CacheEntry> _cache = new ConcurrentDictionary<string, CacheEntry>(StringComparer.OrdinalIgnoreCase);
        private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

        private sealed class CacheEntry
        {
            public DateTime ExpiresUtc { get; set; }
            public List<WorkflowNodeUiOption> Value { get; set; }
        }

        public DatabaseWorkflowMetadataService(IConnectionRegistry registry)
        {
            _registry = registry;
        }

        public List<WorkflowNodeUiOption> GetConnections()
        {
            return GetOrAdd("connections", () =>
            {
                var names = new List<string>();
                var provider = _registry as IConnectionNameProvider;
                if (provider != null)
                    names.AddRange(provider.GetConnectionNames() ?? Enumerable.Empty<string>());
                if (!names.Any())
                {
                    try { _registry.GetConnection("DefaultConnection").Dispose(); names.Add("DefaultConnection"); }
                    catch { }
                }
                return ToOptions(names);
            });
        }
        public string GetConnectionStringSample(string databaseType)
        {
            var type = NormalizeDatabaseType(databaseType);
            switch (type)
            {
                case "sqlite": return "Data Source=./App_Data/megaform.db;Cache=Shared";
                case "postgres": return "Host=localhost;Port=5432;Database=megaform;Username=postgres;Password=yourpassword";
                case "mysql": return "Server=localhost;Port=3306;Database=megaform;Uid=root;Pwd=yourpassword;";
                default: return "Server=localhost;Database=MegaForm;Trusted_Connection=True;TrustServerCertificate=True;";
            }
        }

        public DatabaseConnectionTestResult TestConnection(string connectionName, string databaseType = null, string connectionString = null)
        {
            try
            {
                using (var conn = _registry.GetConnection(connectionName, databaseType, connectionString))
                {
                    if (conn.State != ConnectionState.Open) conn.Open();
                    var provider = DetectProvider(conn, databaseType, connectionString);
                    var dbName = string.Empty;
                    try { dbName = conn.Database; } catch { }
                    var version = string.Empty;
                    try { version = conn.ServerVersion; } catch { }
                    return new DatabaseConnectionTestResult
                    {
                        Success = true,
                        Provider = provider,
                        DatabaseName = dbName,
                        ServerVersion = version,
                        Message = string.IsNullOrWhiteSpace(dbName) ? "Connection successful." : ("Connected to " + dbName + "."),
                        SupportsStoredProcedures = !string.Equals(provider, "sqlite", StringComparison.OrdinalIgnoreCase)
                    };
                }
            }
            catch (Exception ex)
            {
                var provider = NormalizeDatabaseType(databaseType);
                var message = ex.Message ?? "Connection failed.";
                if (string.Equals(provider, "sqlserver", StringComparison.OrdinalIgnoreCase) &&
                    message.IndexOf("certificate chain", StringComparison.OrdinalIgnoreCase) >= 0 &&
                    message.IndexOf("not trusted", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    message += " For local/dev SQL Server, try adding TrustServerCertificate=True to the connection string, or install a trusted server certificate for production.";
                }
                return new DatabaseConnectionTestResult
                {
                    Success = false,
                    Provider = provider,
                    Message = message,
                    SupportsStoredProcedures = !string.Equals(provider, "sqlite", StringComparison.OrdinalIgnoreCase)
                };
            }
        }


        public List<WorkflowNodeUiOption> GetTables(string connectionName, string databaseType = null, string connectionString = null)
        {
            if (string.IsNullOrWhiteSpace(connectionName) && string.IsNullOrWhiteSpace(connectionString)) return new List<WorkflowNodeUiOption>();
            var cacheKey = "tables|" + BuildConnKey(connectionName, databaseType, connectionString);
            return GetOrAdd(cacheKey, () => WithConnection(connectionName, databaseType, connectionString, conn =>
            {
                var provider = DetectProvider(conn, databaseType, connectionString);
                if (provider == "sqlite")
                    return QuerySingleColumn(conn, "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name;");

                var names = new List<string>();
                try
                {
                    var schema = conn.GetSchema("Tables");
                    foreach (DataRow row in schema.Rows)
                    {
                        var type = ReadRow(row, "TABLE_TYPE", "table_type");
                        var name = ReadRow(row, "TABLE_NAME", "table_name");
                        if (string.IsNullOrWhiteSpace(name)) continue;
                        if (!string.IsNullOrWhiteSpace(type) && !(type.Equals("BASE TABLE", StringComparison.OrdinalIgnoreCase) || type.Equals("VIEW", StringComparison.OrdinalIgnoreCase) || type.Equals("table", StringComparison.OrdinalIgnoreCase) || type.Equals("view", StringComparison.OrdinalIgnoreCase))) continue;
                        names.Add(name);
                    }
                }
                catch { }
                if (!names.Any() && provider == "sqlserver")
                    names = QuerySingleColumn(conn, "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE IN ('BASE TABLE','VIEW') ORDER BY TABLE_NAME;");
                if (!names.Any() && provider == "postgres")
                    names = QuerySingleColumn(conn, "SELECT table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_name;");
                return names;
            }));
        }

        public List<WorkflowNodeUiOption> GetColumns(string connectionName, string tableName, string databaseType = null, string connectionString = null)
        {
            if ((string.IsNullOrWhiteSpace(connectionName) && string.IsNullOrWhiteSpace(connectionString)) || string.IsNullOrWhiteSpace(tableName)) return new List<WorkflowNodeUiOption>();
            var cacheKey = "columns|" + BuildConnKey(connectionName, databaseType, connectionString) + "|" + tableName;
            return GetOrAdd(cacheKey, () => WithConnection(connectionName, databaseType, connectionString, conn =>
            {
                var provider = DetectProvider(conn, databaseType, connectionString);
                var safe = EscapeSqlLiteral(tableName);
                if (provider == "sqlite")
                    return QuerySingleColumn(conn, "PRAGMA table_info('" + safe + "');", "name");

                var names = new List<string>();
                try
                {
                    var schema = conn.GetSchema("Columns", new[] { null, null, tableName, null });
                    foreach (DataRow row in schema.Rows)
                    {
                        var name = ReadRow(row, "COLUMN_NAME", "column_name");
                        if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
                    }
                }
                catch { }
                if (!names.Any() && provider == "sqlserver")
                    names = QuerySingleColumn(conn, "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '" + safe + "' ORDER BY ORDINAL_POSITION;");
                if (!names.Any() && provider == "postgres")
                    names = QuerySingleColumn(conn, "SELECT column_name FROM information_schema.columns WHERE table_name = '" + safe + "' ORDER BY ordinal_position;");
                return names;
            }));
        }

        public List<WorkflowNodeUiOption> GetProcedures(string connectionName, string databaseType = null, string connectionString = null)
        {
            if (string.IsNullOrWhiteSpace(connectionName) && string.IsNullOrWhiteSpace(connectionString)) return new List<WorkflowNodeUiOption>();
            var cacheKey = "procedures|" + BuildConnKey(connectionName, databaseType, connectionString);
            return GetOrAdd(cacheKey, () => WithConnection(connectionName, databaseType, connectionString, conn =>
            {
                var provider = DetectProvider(conn, databaseType, connectionString);
                if (provider == "sqlite") return new List<string>();
                var names = new List<string>();
                try
                {
                    var schema = conn.GetSchema("Procedures");
                    foreach (DataRow row in schema.Rows)
                    {
                        var name = ReadRow(row, "SPECIFIC_NAME", "ROUTINE_NAME", "PROCEDURE_NAME", "specific_name", "routine_name", "procedure_name");
                        if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
                    }
                }
                catch { }
                if (!names.Any() && provider == "sqlserver")
                    names = QuerySingleColumn(conn, "SELECT ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE' ORDER BY ROUTINE_NAME;");
                if (!names.Any() && provider == "postgres")
                    names = QuerySingleColumn(conn, "SELECT routine_name FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog','information_schema') ORDER BY routine_name;");
                return names;
            }));
        }

        public List<WorkflowNodeUiOption> GetProcedureParameters(string connectionName, string procedureName, string databaseType = null, string connectionString = null)
        {
            if ((string.IsNullOrWhiteSpace(connectionName) && string.IsNullOrWhiteSpace(connectionString)) || string.IsNullOrWhiteSpace(procedureName)) return new List<WorkflowNodeUiOption>();
            var cacheKey = "procparams|" + BuildConnKey(connectionName, databaseType, connectionString) + "|" + procedureName;
            return GetOrAdd(cacheKey, () => WithConnection(connectionName, databaseType, connectionString, conn =>
            {
                var provider = DetectProvider(conn, databaseType, connectionString);
                if (provider == "sqlite") return new List<string>();
                var names = new List<string>();
                try
                {
                    var schema = conn.GetSchema("ProcedureParameters", new[] { null, null, procedureName, null });
                    foreach (DataRow row in schema.Rows)
                    {
                        var name = ReadRow(row, "PARAMETER_NAME", "parameter_name");
                        if (!string.IsNullOrWhiteSpace(name)) names.Add(NormalizeParamName(name));
                    }
                }
                catch { }
                if (!names.Any() && provider == "sqlserver")
                    names = QuerySingleColumn(conn, "SELECT PARAMETER_NAME FROM INFORMATION_SCHEMA.PARAMETERS WHERE SPECIFIC_NAME = '" + EscapeSqlLiteral(procedureName) + "' ORDER BY ORDINAL_POSITION;").Select(NormalizeParamName).ToList();
                if (!names.Any() && provider == "postgres")
                    names = QuerySingleColumn(conn, "SELECT parameter_name FROM information_schema.parameters WHERE specific_name LIKE '" + EscapeSqlLiteral(procedureName) + "%' ORDER BY ordinal_position;").Select(NormalizeParamName).ToList();
                return names;
            }));
        }

        private List<WorkflowNodeUiOption> WithConnection(string connectionName, string databaseType, string connectionString, Func<DbConnection, List<string>> action)
        {
            var conn = _registry.GetConnection(connectionName, databaseType, connectionString);
            try
            {
                if (conn.State != ConnectionState.Open) conn.Open();
                return ToOptions(action(conn));
            }
            finally { conn.Dispose(); }
        }

        private static List<WorkflowNodeUiOption> GetOrAdd(string key, Func<List<WorkflowNodeUiOption>> factory)
        {
            CacheEntry hit;
            if (_cache.TryGetValue(key, out hit) && hit != null && hit.ExpiresUtc > DateTime.UtcNow && hit.Value != null)
                return hit.Value;
            var value = factory() ?? new List<WorkflowNodeUiOption>();
            _cache[key] = new CacheEntry { ExpiresUtc = DateTime.UtcNow.Add(CacheDuration), Value = value };
            return value;
        }

        private static string BuildConnKey(string connectionName, string databaseType, string connectionString)
        {
            if (!string.IsNullOrWhiteSpace(connectionName)) return "named:" + connectionName.Trim();
            if (string.IsNullOrWhiteSpace(connectionString)) return string.Empty;
            return "external:" + (databaseType ?? string.Empty).Trim() + ":" + connectionString.Trim().GetHashCode().ToString();
        }

        private static List<WorkflowNodeUiOption> ToOptions(IEnumerable<string> names)
        {
            return (names ?? Enumerable.Empty<string>())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
                .Select(x => new WorkflowNodeUiOption { Value = x, Label = x })
                .ToList();
        }

        private static string DetectProvider(DbConnection conn, string databaseType, string connectionString = null)
        {
            var forced = NormalizeDatabaseType(databaseType);
            if (!string.IsNullOrWhiteSpace(forced)) return forced;
            var name = (conn == null ? string.Empty : conn.GetType().Name).ToLowerInvariant();
            if (name.Contains("sqlite")) return "sqlite";
            if (name.Contains("mysql")) return "mysql";
            if (name.Contains("npgsql") || name.Contains("postgres")) return "postgres";
            var inferred = InferProviderFromConnectionString(connectionString);
            return string.IsNullOrWhiteSpace(inferred) ? "sqlserver" : inferred;
        }

        private static string NormalizeDatabaseType(string databaseType)
        {
            var forced = string.IsNullOrWhiteSpace(databaseType) ? string.Empty : databaseType.Trim().ToLowerInvariant();
            if (forced == "postgresql" || forced == "postgres") return "postgres";
            if (forced == "sqlite") return "sqlite";
            if (forced == "mysql") return "mysql";
            if (forced == "sqlserver" || forced == "mssql") return "sqlserver";
            return string.Empty;
        }

        private static string InferProviderFromConnectionString(string connectionString)
        {
            var lower = (connectionString ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(lower)) return string.Empty;
            var looksSqlite = (lower.Contains("data source=") || lower.Contains("datasource=") || lower.Contains("filename=") || lower.Contains("mode=memory") || lower.Contains("cache=shared") || lower.Contains(".db") || lower.Contains(".sqlite"))
                && !lower.Contains("initial catalog=") && !lower.Contains("trusted_connection=") && !lower.Contains("integrated security=") && !lower.Contains("network library=");
            if (looksSqlite) return "sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("search path=") || lower.Contains("port=5432"))) return "postgres";
            if ((lower.Contains("server=") || lower.Contains("host=")) && (lower.Contains("uid=") || lower.Contains("user id=") || lower.Contains("port=3306"))) return "mysql";
            return "sqlserver";
        }

        private static string EscapeSqlLiteral(string value) { return string.IsNullOrEmpty(value) ? string.Empty : value.Replace("'", "''"); }
        private static string NormalizeParamName(string value) { return string.IsNullOrWhiteSpace(value) ? string.Empty : (value.StartsWith("@") ? value : "@" + value.Trim()); }

        private static string ReadRow(DataRow row, params string[] names)
        {
            if (row == null || names == null) return null;
            foreach (var name in names)
            {
                if (string.IsNullOrWhiteSpace(name)) continue;
                if (!row.Table.Columns.Contains(name)) continue;
                var value = row[name];
                if (value != null && value != DBNull.Value) return Convert.ToString(value);
            }
            return null;
        }

        private static List<string> QuerySingleColumn(DbConnection conn, string sql, string explicitColumn = null)
        {
            var list = new List<string>();
            var cmd = conn.CreateCommand();
            cmd.CommandText = sql;
            using (cmd)
            using (var rdr = cmd.ExecuteReader())
            {
                while (rdr.Read())
                {
                    object value;
                    if (!string.IsNullOrWhiteSpace(explicitColumn))
                    {
                        try { value = rdr[explicitColumn]; }
                        catch { value = rdr.GetValue(0); }
                    }
                    else value = rdr.GetValue(0);
                    if (value != null && value != DBNull.Value) list.Add(Convert.ToString(value));
                }
            }
            return list;
        }
    }
}
