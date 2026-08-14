/*
 * MegaForm.Core/Automation/AutomationCapabilityImpl.cs
 *
 * [Automation v2 20260813-01] MVP implementations of the Db and Http capabilities, plus the
 * "declared but not wired yet" stubs for the rest.
 *
 * Both implementations follow the same three steps, in this order, and the order is the design:
 *   1. resolve the NAME against the site catalog — an unknown or disabled name fails here, before
 *      anything is opened, with a message listing what the site does define;
 *   2. bind the script's parameters against what the catalog entry declares — an undeclared
 *      parameter is an error, not a silently-ignored typo;
 *   3. run under the catalog's timeout, and record the call.
 *
 * Step 3 is not optional decoration. "Which submission caused this row / this outbound request" is
 * the question every support ticket about automation turns into, and it can only be answered if the
 * answer was written down while it happened.
 */

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using Newtonsoft.Json;

namespace MegaForm.Core.Automation
{
    /// <summary>One capability call, as recorded. See MF_AutomationCapabilityCalls.</summary>
    public sealed class AutomationCapabilityCall
    {
        public string Capability { get; set; }     // "db" | "http" | "notify" | …
        public string Target { get; set; }         // the NAME that was resolved
        public bool Success { get; set; }
        public long DurationMs { get; set; }
        public string Detail { get; set; }         // rows affected / HTTP status / error, never a secret
        public DateTime AtUtc { get; set; }
    }

    /// <summary>Where a capability writes what it just did. Fail-soft in every implementation.</summary>
    public interface IAutomationCallRecorder
    {
        void Record(AutomationCapabilityCall call);
    }

    // ─────────────────────────────────────────────────────────────────────────────

    public sealed class AutomationDbCapability : IAutomationDbCapability
    {
        private readonly IAutomationCatalogProvider _catalog;
        private readonly IConnectionRegistry _connections;
        private readonly IAutomationCallRecorder _recorder;
        private readonly Action<string> _log;

        public AutomationDbCapability(IAutomationCatalogProvider catalog, IConnectionRegistry connections,
                                      IAutomationCallRecorder recorder, Action<string> log)
        {
            _catalog = catalog;
            _connections = connections;
            _recorder = recorder;
            _log = log;
        }

        public IList<string> ActionNames()
        {
            var names = new List<string>();
            var cat = _catalog == null ? null : _catalog.GetCatalog();
            if (cat != null && cat.DbActions != null)
                foreach (var a in cat.DbActions)
                    if (a != null && a.Enabled && !string.IsNullOrWhiteSpace(a.Name)) names.Add(a.Name);
            return names;
        }

        public Task<AutomationDbResult> ExecuteNamedActionAsync(
            string actionName, object parameters = null, CancellationToken ct = default(CancellationToken))
        {
            // Deliberately synchronous work presented as a Task. ADO.NET's async path buys nothing
            // for the short statements a named action is meant to be, and pretending otherwise would
            // add a thread hop per call. The signature stays async so the capability can become
            // genuinely async later without breaking a single script.
            //
            // Failures go INTO the Task rather than out of the call, so `await` and `.Result`
            // behave the way a caller expects from an async API — a method that sometimes throws
            // before returning its Task is the kind of asymmetry that makes error handling
            // conditional on how the failure happened.
            try { return Task.FromResult(Run(actionName, parameters, ct)); }
            catch (Exception ex) { return FromException(ex); }
        }

        private static Task<AutomationDbResult> FromException(Exception ex)
        {
            var tcs = new TaskCompletionSource<AutomationDbResult>();
            tcs.SetException(ex);
            return tcs.Task;
        }

        private AutomationDbResult Run(string actionName, object parameters, CancellationToken ct)
        {
            var sw = Stopwatch.StartNew();
            var action = _catalog == null ? null : _catalog.GetCatalog().FindDbAction(actionName);

            if (action == null || !action.Enabled)
            {
                sw.Stop();
                Record("db", actionName, false, sw.ElapsedMilliseconds,
                       action == null ? "no such action" : "action disabled");
                throw new InvalidOperationException(
                    "No enabled database action named '" + actionName + "' on this site. Available: " +
                    (ActionNames().Count == 0 ? "(none)" : string.Join(", ", ToArray(ActionNames()))));
            }
            if (_connections == null)
                throw new InvalidOperationException("This host has no connection registry, so database actions cannot run.");

            var bound = BindParameters(action, parameters);
            var result = new AutomationDbResult();

            try
            {
                using (var conn = _connections.GetConnection(action.ConnectionName))
                {
                    if (conn.State != ConnectionState.Open) conn.Open();
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = action.Sql;
                        cmd.CommandTimeout = action.TimeoutSeconds > 0 ? action.TimeoutSeconds : 20;
                        foreach (var kv in bound)
                        {
                            var p = cmd.CreateParameter();
                            p.ParameterName = kv.Key.StartsWith("@", StringComparison.Ordinal) ? kv.Key : "@" + kv.Key;
                            p.Value = kv.Value ?? DBNull.Value;
                            cmd.Parameters.Add(p);
                        }

                        var kind = (action.Kind ?? AutomationDbActionKinds.Execute).Trim().ToLowerInvariant();
                        if (kind == AutomationDbActionKinds.Scalar)
                        {
                            var value = cmd.ExecuteScalar();
                            result.ScalarValue = value == DBNull.Value ? null : value;
                        }
                        else if (kind == AutomationDbActionKinds.Query)
                        {
                            ReadRows(cmd, action.MaxRows > 0 ? action.MaxRows : 500, result);
                        }
                        else
                        {
                            result.RowsAffected = cmd.ExecuteNonQuery();
                        }
                    }
                }

                sw.Stop();
                result.DurationMs = sw.ElapsedMilliseconds;
                var detail = "rows=" + result.RowsAffected + " read=" + (result.Rows == null ? 0 : result.Rows.Count);
                Record("db", action.Name, true, result.DurationMs, detail);
                Log("db action '" + action.Name + "' on " + action.ConnectionName + " → " + detail +
                    " in " + result.DurationMs + "ms");
                return result;
            }
            catch (Exception ex)
            {
                sw.Stop();
                Record("db", action.Name, false, sw.ElapsedMilliseconds, ex.GetType().Name + ": " + ex.Message);
                Log("db action '" + action.Name + "' failed: " + ex.Message);
                throw;
            }
        }

        private static void ReadRows(DbCommand cmd, int maxRows, AutomationDbResult result)
        {
            using (var reader = cmd.ExecuteReader())
            {
                while (reader.Read() && result.Rows.Count < maxRows)
                {
                    var row = new AutomationRow();
                    for (int i = 0; i < reader.FieldCount; i++)
                        row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                    result.Rows.Add(row);
                }
            }
        }

        /// <summary>
        /// Turns the script's anonymous object into named values, and refuses anything the catalog
        /// entry did not declare. A rejected typo is worth more than a tolerated one: the silent
        /// version of this writes NULL into a column and looks like it worked.
        /// </summary>
        private static Dictionary<string, object> BindParameters(NamedDbAction action, object parameters)
        {
            var supplied = ToMap(parameters);
            if (action.Parameters == null || action.Parameters.Count == 0) return supplied;

            var declared = new HashSet<string>(action.Parameters, StringComparer.OrdinalIgnoreCase);
            foreach (var key in supplied.Keys)
            {
                if (!declared.Contains(key.TrimStart('@')))
                    throw new ArgumentException(
                        "Database action '" + action.Name + "' does not accept a parameter named '" + key +
                        "'. It accepts: " + string.Join(", ", ToArray(action.Parameters)) + ".");
            }
            return supplied;
        }

        internal static Dictionary<string, object> ToMap(object parameters)
        {
            var map = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (parameters == null) return map;

            var dict = parameters as IDictionary<string, object>;
            if (dict != null)
            {
                foreach (var kv in dict) map[kv.Key] = kv.Value;
                return map;
            }
            // Reflection over the ANONYMOUS OBJECT is done here, in MegaForm's code, precisely so a
            // script never needs System.Reflection to pass named arguments.
            foreach (var p in parameters.GetType().GetProperties())
                if (p.CanRead) map[p.Name] = p.GetValue(parameters, null);
            return map;
        }

        private static string[] ToArray(IList<string> list)
        {
            var arr = new string[list.Count];
            list.CopyTo(arr, 0);
            return arr;
        }

        private void Record(string cap, string target, bool ok, long ms, string detail)
        {
            try
            {
                if (_recorder == null) return;
                _recorder.Record(new AutomationCapabilityCall
                {
                    Capability = cap, Target = target, Success = ok,
                    DurationMs = ms, Detail = detail, AtUtc = DateTime.UtcNow
                });
            }
            catch { }
        }

        private void Log(string line) { try { if (_log != null) _log(line); } catch { } }
    }

    // ─────────────────────────────────────────────────────────────────────────────

    public sealed class AutomationHttpCapability : IAutomationHttpCapability
    {
        private const int MaxResponseChars = 256 * 1024;
        private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };

        private readonly IAutomationCatalogProvider _catalog;
        private readonly IAutomationCallRecorder _recorder;
        private readonly Action<string> _log;

        public AutomationHttpCapability(IAutomationCatalogProvider catalog,
                                        IAutomationCallRecorder recorder, Action<string> log)
        {
            _catalog = catalog;
            _recorder = recorder;
            _log = log;
        }

        public IList<string> EndpointNames()
        {
            var names = new List<string>();
            var cat = _catalog == null ? null : _catalog.GetCatalog();
            if (cat != null && cat.Endpoints != null)
                foreach (var e in cat.Endpoints)
                    if (e != null && e.Enabled && !string.IsNullOrWhiteSpace(e.Name)) names.Add(e.Name);
            return names;
        }

        public Task<AutomationHttpResult> PostJsonAsync(
            string endpointName, object payload, CancellationToken ct = default(CancellationToken))
        {
            var body = payload as string ?? JsonConvert.SerializeObject(payload);
            return SendAsync(endpointName, body, "application/json", null, ct);
        }

        public async Task<AutomationHttpResult> SendAsync(
            string endpointName, string body, string contentType = null,
            IDictionary<string, string> extraHeaders = null,
            CancellationToken ct = default(CancellationToken))
        {
            var sw = Stopwatch.StartNew();
            var endpoint = _catalog == null ? null : _catalog.GetCatalog().FindEndpoint(endpointName);

            if (endpoint == null || !endpoint.Enabled)
            {
                sw.Stop();
                Record("http", endpointName, false, sw.ElapsedMilliseconds,
                       endpoint == null ? "no such endpoint" : "endpoint disabled");
                throw new InvalidOperationException(
                    "No enabled HTTP endpoint named '" + endpointName + "' on this site. Available: " +
                    (EndpointNames().Count == 0 ? "(none)" : string.Join(", ", ToArray(EndpointNames()))));
            }

            // The catalog is an administrator's intent, not an exemption. A URL that resolves to a
            // loopback or metadata address is refused even when an admin typed it, because the
            // failure it prevents (a form reaching the server's own network) does not care who
            // configured the target.
            string ssrfReason;
            if (!SsrfGuard.IsUrlAllowed(endpoint.Url, out ssrfReason))
            {
                sw.Stop();
                Record("http", endpoint.Name, false, sw.ElapsedMilliseconds, "blocked: " + ssrfReason);
                Log("endpoint '" + endpoint.Name + "' blocked: " + ssrfReason);
                return new AutomationHttpResult
                {
                    Status = 0,
                    Error = "Blocked URL: " + ssrfReason,
                    DurationMs = sw.ElapsedMilliseconds,
                    Attempts = 0
                };
            }

            var attempts = Math.Max(1, endpoint.MaxAttempts);
            AutomationHttpResult result = null;

            for (int attempt = 1; attempt <= attempts; attempt++)
            {
                result = await SendOnceAsync(endpoint, body, contentType, extraHeaders, ct).ConfigureAwait(false);
                result.Attempts = attempt;
                if (result.Ok || result.Status == 0 && attempt == attempts) break;
                if (result.Status >= 400 && result.Status < 500) break;   // client error: retrying repeats it
                if (attempt < attempts && endpoint.RetryDelaySeconds > 0)
                    await Task.Delay(TimeSpan.FromSeconds(endpoint.RetryDelaySeconds), ct).ConfigureAwait(false);
            }

            sw.Stop();
            result.DurationMs = sw.ElapsedMilliseconds;
            Record("http", endpoint.Name, result.Ok, result.DurationMs,
                   "status=" + result.Status + " attempts=" + result.Attempts +
                   (result.Error == null ? "" : " error=" + result.Error));
            Log("endpoint '" + endpoint.Name + "' → " + (result.Status == 0 ? "failed" : result.Status.ToString()) +
                " in " + result.DurationMs + "ms" + (result.Attempts > 1 ? " (" + result.Attempts + " attempts)" : ""));
            return result;
        }

        private async Task<AutomationHttpResult> SendOnceAsync(
            NamedHttpEndpoint endpoint, string body, string contentType,
            IDictionary<string, string> extraHeaders, CancellationToken ct)
        {
            var result = new AutomationHttpResult();
            try
            {
                var method = new HttpMethod(string.IsNullOrWhiteSpace(endpoint.Method) ? "POST" : endpoint.Method.ToUpperInvariant());
                var request = new HttpRequestMessage(method, endpoint.Url);

                if (!string.IsNullOrEmpty(body))
                    request.Content = new StringContent(body, Encoding.UTF8,
                        string.IsNullOrWhiteSpace(contentType) ? "application/json" : contentType);

                if (endpoint.Headers != null)
                    foreach (var kv in endpoint.Headers) AddHeader(request, kv.Key, kv.Value);
                if (extraHeaders != null)
                    foreach (var kv in extraHeaders) AddHeader(request, kv.Key, kv.Value);

                // The secret is attached HERE, on the way out, from the catalog. It is never in the
                // script, never in the run record, and never in anything the client is shown.
                ApplyAuth(request, endpoint);

                using (var timeout = new CancellationTokenSource(
                           TimeSpan.FromSeconds(endpoint.TimeoutSeconds > 0 ? endpoint.TimeoutSeconds : 20)))
                using (var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token))
                {
                    var response = await Http.SendAsync(request, linked.Token).ConfigureAwait(false);
                    var text = response.Content == null
                        ? string.Empty
                        : await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (text != null && text.Length > MaxResponseChars) text = text.Substring(0, MaxResponseChars);

                    result.Status = (int)response.StatusCode;
                    result.Body = text;
                    return result;
                }
            }
            catch (Exception ex)
            {
                result.Status = 0;
                result.Error = ex.GetType().Name + ": " + ex.Message;
                return result;
            }
        }

        private static void AddHeader(HttpRequestMessage request, string name, string value)
        {
            if (string.IsNullOrWhiteSpace(name)) return;
            if (!request.Headers.TryAddWithoutValidation(name, value) && request.Content != null)
                request.Content.Headers.TryAddWithoutValidation(name, value);
        }

        private static void ApplyAuth(HttpRequestMessage request, NamedHttpEndpoint endpoint)
        {
            var type = (endpoint.AuthType ?? "none").Trim().ToLowerInvariant();
            if (type == "none" || string.IsNullOrEmpty(endpoint.AuthValue)) return;

            if (type == "bearer")
                request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + endpoint.AuthValue);
            else if (type == "basic")
                request.Headers.TryAddWithoutValidation("Authorization", "Basic " + endpoint.AuthValue);
            else if (type == "header")
                request.Headers.TryAddWithoutValidation(
                    string.IsNullOrWhiteSpace(endpoint.AuthHeaderName) ? "X-Api-Key" : endpoint.AuthHeaderName,
                    endpoint.AuthValue);
        }

        private static string[] ToArray(IList<string> list)
        {
            var arr = new string[list.Count];
            list.CopyTo(arr, 0);
            return arr;
        }

        private void Record(string cap, string target, bool ok, long ms, string detail)
        {
            try
            {
                if (_recorder == null) return;
                _recorder.Record(new AutomationCapabilityCall
                {
                    Capability = cap, Target = target, Success = ok,
                    DurationMs = ms, Detail = detail, AtUtc = DateTime.UtcNow
                });
            }
            catch { }
        }

        private void Log(string line) { try { if (_log != null) _log(line); } catch { } }
    }

    // ─────────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Stand-ins for the capabilities that are designed but not wired yet.
    ///
    /// They throw a sentence that names the capability and says it is not available on this
    /// installation. That beats leaving the property null: a script that reaches for ctx.Notify
    /// then fails with NullReferenceException tells a host nothing, and this codebase has spent
    /// whole sessions chasing exactly that shape of silence.
    /// </summary>
    public static class UnavailableCapabilities
    {
        public sealed class NotWiredException : NotSupportedException
        {
            public NotWiredException(string capability)
                : base("ctx." + capability + " is not available on this installation yet. " +
                       "See the MegaForm Automation roadmap for which capabilities are wired.") { }
        }

        private sealed class NotifyStub : IAutomationNotifyCapability
        {
            public Task EmailAsync(string t, string to, object m, CancellationToken ct) { throw new NotWiredException("Notify"); }
            public Task SmsAsync(string t, string to, object m, CancellationToken ct) { throw new NotWiredException("Notify"); }
            public Task PushAsync(string c, string t, string to, object m, CancellationToken ct) { throw new NotWiredException("Notify"); }
        }

        private sealed class IdentityStub : IAutomationIdentityCapability
        {
            public Task<AutomationUserResult> CreateUserAsync(string e, string u, IEnumerable<string> r, CancellationToken ct) { throw new NotWiredException("Identity"); }
            public Task AddRoleAsync(int userId, string role, CancellationToken ct) { throw new NotWiredException("Identity"); }
            public Task<int> FindUserIdByEmailAsync(string email, CancellationToken ct) { throw new NotWiredException("Identity"); }
        }

        private sealed class DocumentStub : IAutomationDocumentCapability
        {
            public Task<AutomationDocumentResult> CreatePdfAsync(string t, object m, CancellationToken ct) { throw new NotWiredException("Documents"); }
            public Task<AutomationDocumentResult> CreateFromTemplateAsync(string t, string f, object m, CancellationToken ct) { throw new NotWiredException("Documents"); }
        }

        private sealed class FileStub : IAutomationFileCapability
        {
            public Task<AutomationDocumentResult> MoveUploadAsync(string k, string f, CancellationToken ct) { throw new NotWiredException("Files"); }
            public IList<string> FolderNames() { return new List<string>(); }
        }

        private sealed class QueueStub : IAutomationQueueCapability
        {
            public Task PublishAsync(string topic, object payload, CancellationToken ct) { throw new NotWiredException("Queue"); }
            public IList<string> TopicNames() { return new List<string>(); }
        }

        private sealed class JobStub : IAutomationJobCapability
        {
            public Task<AutomationJobResult> RunCommandPresetAsync(string p, object a, CancellationToken ct) { throw new NotWiredException("Jobs"); }
            public IList<string> PresetNames() { return new List<string>(); }
        }

        public static IAutomationNotifyCapability Notify() { return new NotifyStub(); }
        public static IAutomationIdentityCapability Identity() { return new IdentityStub(); }
        public static IAutomationDocumentCapability Documents() { return new DocumentStub(); }
        public static IAutomationFileCapability Files() { return new FileStub(); }
        public static IAutomationQueueCapability Queue() { return new QueueStub(); }
        public static IAutomationJobCapability Jobs() { return new JobStub(); }
    }
}
