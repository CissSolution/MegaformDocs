/*
 * MegaForm.Core/Scripting/ScriptHttpAndDatabase.cs
 *
 * [AfterSubmitScript v20260813-02] The two capabilities a script actually reaches for, wired to the
 * guards the rest of MegaForm already uses.
 *
 * Neither of these is a restriction. At `full` trust a script may `new HttpClient()` and open its
 * own DbConnection. These exist because the guarded version should be the one that is easier to
 * type — the outbound-URL guard matters most exactly when a URL is assembled from submitted data,
 * and a named connection means a script never carries a credential.
 */

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using Newtonsoft.Json;

namespace MegaForm.Core.Scripting
{
    /// <summary>
    /// HTTP for scripts. One shared HttpClient (a per-call instance exhausts sockets), the same
    /// SsrfGuard the webhook node uses, a hard timeout, and a response cap so a script cannot pull
    /// a 2 GB body into memory. Every call adds a line to the run record.
    /// </summary>
    public sealed class ScriptHttp : IScriptHttp
    {
        private const int MaxResponseChars = 256 * 1024;

        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        private readonly Action<string> _log;

        public ScriptHttp(Action<string> log) { _log = log; }

        public ScriptHttpResult Get(string url, IDictionary<string, string> headers = null)
            => Send("GET", url, null, null, headers);

        public ScriptHttpResult PostJson(string url, object payload, IDictionary<string, string> headers = null)
            => Send("POST", url, payload as string ?? JsonConvert.SerializeObject(payload),
                    "application/json", headers);

        public ScriptHttpResult Send(string method, string url, string body, string contentType,
                                     IDictionary<string, string> headers = null)
        {
            var result = new ScriptHttpResult();
            var sw = Stopwatch.StartNew();

            string reason;
            if (!SsrfGuard.IsUrlAllowed(url, out reason))
            {
                sw.Stop();
                result.Status = 0;
                result.Error = "Blocked URL: " + reason;
                result.DurationMs = sw.ElapsedMilliseconds;
                Log(method + " " + Safe(url) + " → blocked (" + reason + ")");
                return result;
            }

            try
            {
                var request = new HttpRequestMessage(new HttpMethod((method ?? "GET").ToUpperInvariant()), url);
                if (!string.IsNullOrEmpty(body))
                    request.Content = new StringContent(body, Encoding.UTF8,
                        string.IsNullOrWhiteSpace(contentType) ? "application/json" : contentType);
                if (headers != null)
                {
                    foreach (var kv in headers)
                    {
                        if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                        if (!request.Headers.TryAddWithoutValidation(kv.Key, kv.Value) && request.Content != null)
                            request.Content.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                    }
                }

                var response = Http.SendAsync(request).GetAwaiter().GetResult();
                var text = response.Content == null
                    ? string.Empty
                    : response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (text != null && text.Length > MaxResponseChars) text = text.Substring(0, MaxResponseChars);

                sw.Stop();
                result.Status = (int)response.StatusCode;
                result.Body = text;
                result.DurationMs = sw.ElapsedMilliseconds;
                Log(method + " " + Safe(url) + " → " + result.Status + " in " + result.DurationMs + "ms");
                return result;
            }
            catch (Exception ex)
            {
                sw.Stop();
                result.Status = 0;
                // The script author is a host; the real message is useful to them and never reaches
                // a visitor (run records are host-only).
                result.Error = ex.GetType().Name + ": " + ex.Message;
                result.DurationMs = sw.ElapsedMilliseconds;
                Log(method + " " + Safe(url) + " → failed: " + ex.Message);
                return result;
            }
        }

        private void Log(string line) { try { if (_log != null) _log(line); } catch { } }

        /// <summary>Keep a querystring credential out of the run record.</summary>
        private static string Safe(string url)
        {
            if (string.IsNullOrEmpty(url)) return string.Empty;
            var q = url.IndexOf('?');
            return q < 0 ? url : url.Substring(0, q) + "?…";
        }
    }

    /// <summary>
    /// Parameterised SQL for scripts against the administrator's named connections.
    ///
    /// Reads are capped in SQL rather than trimmed afterwards — a script that forgets a WHERE clause
    /// on a large table should return a bounded page, not pull the table into the submit request.
    /// </summary>
    public sealed class ScriptDatabase : IScriptDatabase
    {
        private const int MaxRows = 1000;
        private const int CommandTimeoutSeconds = 20;

        private readonly IConnectionRegistry _registry;
        private readonly IConnectionNameProvider _names;
        private readonly Action<string> _log;

        public ScriptDatabase(IConnectionRegistry registry, IConnectionNameProvider names, Action<string> log)
        {
            _registry = registry;
            _names = names;
            _log = log;
        }

        public IList<string> ConnectionNames()
        {
            var list = new List<string>();
            try { if (_names != null) list.AddRange(_names.GetConnectionNames()); }
            catch { }
            return list;
        }

        public int Execute(string connectionName, string sql, object parameters = null)
        {
            return Run(connectionName, sql, parameters, (cmd) =>
            {
                var affected = cmd.ExecuteNonQuery();
                Log("execute on " + connectionName + " → " + affected + " row(s)");
                return affected;
            });
        }

        public object Scalar(string connectionName, string sql, object parameters = null)
        {
            return Run(connectionName, sql, parameters, (cmd) =>
            {
                var value = cmd.ExecuteScalar();
                Log("scalar on " + connectionName);
                return value == DBNull.Value ? null : value;
            });
        }

        public IList<ScriptRow> Query(string connectionName, string sql, object parameters = null)
        {
            return Run(connectionName, sql, parameters, (cmd) =>
            {
                var rows = new List<ScriptRow>();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read() && rows.Count < MaxRows)
                    {
                        var row = new ScriptRow();
                        for (int i = 0; i < reader.FieldCount; i++)
                            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                        rows.Add(row);
                    }
                }
                Log("query on " + connectionName + " → " + rows.Count + " row(s)" +
                    (rows.Count >= MaxRows ? " (capped at " + MaxRows + ")" : ""));
                return (IList<ScriptRow>)rows;
            });
        }

        private T Run<T>(string connectionName, string sql, object parameters, Func<DbCommand, T> body)
        {
            if (_registry == null)
                throw new InvalidOperationException("No database connections are available to scripts on this host.");
            if (string.IsNullOrWhiteSpace(connectionName))
                throw new ArgumentException("A connection name is required. Available: " +
                                            string.Join(", ", new List<string>(ConnectionNames()).ToArray()),
                                            nameof(connectionName));
            if (string.IsNullOrWhiteSpace(sql))
                throw new ArgumentException("sql is required.", nameof(sql));

            // GetConnection resolves the name against the site's allow-list and throws for anything
            // else — a script naming an unregistered connection gets a clear error, not a probe.
            using (var conn = _registry.GetConnection(connectionName))
            {
                if (conn.State != ConnectionState.Open) conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = sql;
                    cmd.CommandTimeout = CommandTimeoutSeconds;
                    AddParameters(cmd, parameters);
                    return body(cmd);
                }
            }
        }

        /// <summary>
        /// Binds an anonymous object (or a dictionary) as real DbParameters. Values are NEVER
        /// concatenated into the statement — that is the whole point of taking them separately.
        /// </summary>
        private static void AddParameters(DbCommand cmd, object parameters)
        {
            if (parameters == null) return;

            var map = parameters as IDictionary<string, object>;
            if (map == null)
            {
                map = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in parameters.GetType().GetProperties())
                {
                    if (!p.CanRead) continue;
                    map[p.Name] = p.GetValue(parameters, null);
                }
            }

            foreach (var kv in map)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = kv.Key.StartsWith("@", StringComparison.Ordinal) ? kv.Key : "@" + kv.Key;
                p.Value = kv.Value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }
        }

        private void Log(string line) { try { if (_log != null) _log(line); } catch { } }
    }
}
