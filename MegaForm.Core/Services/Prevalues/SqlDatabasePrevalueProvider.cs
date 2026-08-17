using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models.Prevalues;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Prevalues
{
    /// <summary>
    /// Resolves PrevalueSource options from a SQL SELECT statement against a named connection.
    /// </summary>
    public sealed class SqlDatabasePrevalueProvider : IPrevalueProvider
    {
        public const string ProviderType = "sql";

        public string Type => ProviderType;

        private readonly IConnectionRegistry _registry;
        private static readonly Regex TokenParam = new Regex(@":(\w+)", RegexOptions.Compiled);

        public SqlDatabasePrevalueProvider(IConnectionRegistry registry)
        {
            _registry = registry;
        }

        public Task<List<PrevalueOption>> GetOptionsAsync(PrevalueSource source, PrevalueProviderContext context)
        {
            var result = new List<PrevalueOption>();
            if (source == null) return Task.FromResult(result);

            var settings = source.ReadSettings<SqlSettings>();
            if (settings == null || string.IsNullOrWhiteSpace(settings.ConnectionKey) || string.IsNullOrWhiteSpace(settings.Sql))
                return Task.FromResult(result);

            if (IsDangerousQuery(settings.Sql))
                return Task.FromResult(result);

            try
            {
                using (var conn = _registry.GetConnection(settings.ConnectionKey, settings.DatabaseType, null))
                {
                    conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandType = CommandType.Text;
                        cmd.CommandText = TokenParam.Replace(settings.Sql, "@$1");
                        cmd.CommandTimeout = 10;

                        AddParameters(cmd, settings.Sql, context?.Parameters);

                        using (var reader = cmd.ExecuteReader())
                        {
                            var maxRows = context?.MaxRows ?? 500;
                            while (result.Count < maxRows && reader.Read())
                            {
                                if (reader.FieldCount == 0) continue;
                                var val = reader.GetValue(0);
                                var label = reader.FieldCount > 1 ? reader.GetValue(1) : val;
                                result.Add(new PrevalueOption
                                {
                                    Value = Convert.ToString(val, CultureInfo.InvariantCulture),
                                    Label = Convert.ToString(label, CultureInfo.InvariantCulture)
                                });
                            }
                        }
                    }
                }
            }
            catch { /* fail-soft */ }

            return Task.FromResult(result);
        }

        public Task<string> ValidateAsync(PrevalueSource source)
        {
            var settings = source?.ReadSettings<SqlSettings>();
            if (settings == null) return Task.FromResult("Settings missing.");
            if (string.IsNullOrWhiteSpace(settings.ConnectionKey)) return Task.FromResult("Connection key is required.");
            if (string.IsNullOrWhiteSpace(settings.Sql)) return Task.FromResult("SQL query is required.");
            if (IsDangerousQuery(settings.Sql)) return Task.FromResult("Only SELECT statements are allowed.");
            return Task.FromResult<string>(null);
        }

        private static void AddParameters(DbCommand cmd, string sql, IDictionary<string, object> parameters)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (parameters != null)
            {
                foreach (var kv in parameters)
                {
                    if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                    var name = kv.Key.StartsWith("@", StringComparison.Ordinal) ? kv.Key : "@" + kv.Key;
                    if (!seen.Add(name)) continue;
                    var p = cmd.CreateParameter();
                    p.ParameterName = name;
                    p.Value = kv.Value ?? DBNull.Value;
                    cmd.Parameters.Add(p);
                }
            }

            // Auto-bind missing :tokens as DBNull so the query does not throw when cascading parent is empty.
            foreach (Match m in TokenParam.Matches(sql))
            {
                var name = "@" + m.Groups[1].Value;
                if (!seen.Add(name)) continue;
                var p = cmd.CreateParameter();
                p.ParameterName = name;
                p.Value = DBNull.Value;
                cmd.Parameters.Add(p);
            }
        }

        private static readonly Regex DangerRx = new Regex(
            @"\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|DENY|MERGE|BULK|BACKUP|RESTORE|SHUTDOWN|RECONFIGURE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE)\b|\bxp_",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static bool IsDangerousQuery(string sql)
        {
            if (string.IsNullOrWhiteSpace(sql)) return true;
            var body = sql.Trim().TrimEnd(';');
            if (body.IndexOf(';') >= 0) return true;
            if (body.IndexOf("--", StringComparison.Ordinal) >= 0 || body.IndexOf("/*", StringComparison.Ordinal) >= 0) return true;
            var first = Regex.Match(body, @"^\s*(\w+)").Value;
            if (!string.Equals(first, "SELECT", StringComparison.OrdinalIgnoreCase)) return true;
            return DangerRx.IsMatch(body);
        }

        public class SqlSettings
        {
            [JsonProperty("connectionKey")]
            public string ConnectionKey { get; set; }

            [JsonProperty("databaseType")]
            public string DatabaseType { get; set; }

            /// <summary>
            /// SELECT statement. First column = value, optional second column = label.
            /// Supports :paramName tokens for cascading.
            /// </summary>
            [JsonProperty("sql")]
            public string Sql { get; set; }
        }
    }
}
