// MegaForm Razor Widget — stub service implementations
// ──────────────────────────────────────────────────────────────────────
// Server-render endpoint is stateless: each render request carries its own
// formData/user/site context in the body, so injected services proxy from
// request state instead of holding their own state.
using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;

namespace MegaForm.Web.Services
{
    public class StubFormContext : IMfFormContext
    {
        private readonly Dictionary<string, object> _fields = new();
        public IReadOnlyDictionary<string, string> UrlQuery { get; } = new Dictionary<string, string>();
        public MfSubmissionInfo Submission { get; } = null;
        public MfFormInfo Form { get; } = new MfFormInfo { FormId = 0, Title = "", Theme = "default" };

        public void SetField(string key, object value) => _fields[key] = value;

        public object GetField(string key)
            => _fields.TryGetValue(key, out var v) ? v : null;

        public T GetField<T>(string key)
            => TryGetField<T>(key, out var v) ? v : default;

        public bool TryGetField<T>(string key, out T value)
        {
            value = default;
            if (!_fields.TryGetValue(key, out var raw) || raw == null) return false;
            try
            {
                if (raw is T t) { value = t; return true; }
                var underlying = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
                value = (T)Convert.ChangeType(raw, underlying);
                return true;
            }
            catch { return false; }
        }

        public IReadOnlyDictionary<string, object> GetAllFields() => _fields;
    }

    public class StubUserContext : IMfUserContext
    {
        public int Id { get; set; }
        public string Email { get; set; } = "";
        public string DisplayName { get; set; } = "";
        public IReadOnlyList<string> Roles { get; set; } = Array.Empty<string>();
        public bool IsAuthenticated { get; set; }
        public bool IsHost { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsInRole(string roleName) => Roles.Contains(roleName);
    }

    public class StubSiteContext : IMfSiteContext
    {
        public int PortalId { get; set; }
        public int SiteId { get; set; }
        public string Locale { get; set; } = "en";
        private readonly Dictionary<string, string> _settings = new();
        public string GetSetting(string key, string defaultValue = "")
            => _settings.TryGetValue(key, out var v) ? v : defaultValue;
    }

    // ─────────────────────────────────────────────────────────────────
    //  Real SQL executor — wraps IConnectionRegistry + raw ADO. Used by
    //  the /Action endpoint when CRUD templates POST insert / update /
    //  delete. The display render path still pre-fetches via the
    //  DataRepeater pipeline; this executor only runs when an action
    //  needs to mutate.
    // ─────────────────────────────────────────────────────────────────
    public class RegistrySqlExecutor : IMfSqlExecutor
    {
        private readonly IConnectionRegistry _registry;
        private static readonly Regex _paramRx =
            new(@":([A-Za-z_][A-Za-z0-9_]*)", RegexOptions.Compiled);

        public RegistrySqlExecutor(IConnectionRegistry registry) { _registry = registry; }

        public Task<IEnumerable<dynamic>> QueryAsync(string sql, object parameters = null, string connectionKey = "DashboardDatabase")
            => Task.Run<IEnumerable<dynamic>>(() => Execute(sql, parameters, connectionKey, isScalar: false, out _));

        public Task<T> ExecuteScalarAsync<T>(string sql, object parameters = null, string connectionKey = "DashboardDatabase")
            => Task.Run(() =>
            {
                Execute(sql, parameters, connectionKey, isScalar: true, out var scalar);
                if (scalar == null || scalar is DBNull) return default(T);
                if (scalar is T t) return t;
                try { return (T)Convert.ChangeType(scalar, Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T)); }
                catch { return default(T); }
            });

        public Task<IEnumerable<dynamic>> StoredProcAsync(string name, object parameters = null, string connectionKey = "DashboardDatabase")
            => QueryAsync("EXEC " + name, parameters, connectionKey);

        private IEnumerable<dynamic> Execute(string sql, object parameters, string connectionKey, bool isScalar, out object scalar)
        {
            scalar = null;
            if (_registry == null || string.IsNullOrWhiteSpace(sql))
                return Array.Empty<dynamic>();

            var rows = new List<dynamic>();
            using var conn = _registry.GetConnection(connectionKey ?? "DashboardDatabase", null, null);
            conn.Open();
            using var cmd = conn.CreateCommand();
            cmd.CommandText = _paramRx.Replace(sql, "@$1");
            cmd.CommandTimeout = 20;

            var paramDict = ParametersToDictionary(parameters);
            foreach (Match m in _paramRx.Matches(sql))
            {
                var key = m.Groups[1].Value;
                if (cmd.Parameters.Contains("@" + key)) continue;
                var p = cmd.CreateParameter();
                p.ParameterName = "@" + key;
                p.Value = paramDict != null && paramDict.TryGetValue(key, out var v) && v != null ? v : DBNull.Value;
                cmd.Parameters.Add(p);
            }

            if (isScalar)
            {
                scalar = cmd.ExecuteScalar();
                return Array.Empty<dynamic>();
            }

            using var reader = cmd.ExecuteReader();
            var colNames = new string[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++) colNames[i] = reader.GetName(i);
            while (reader.Read())
            {
                var dict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++)
                    dict[colNames[i]] = reader.IsDBNull(i) ? null : reader.GetValue(i);
                rows.Add(dict);
            }
            return rows;
        }

        private static Dictionary<string, object> ParametersToDictionary(object parameters)
        {
            if (parameters == null) return null;
            if (parameters is IDictionary<string, object> d)
                return new Dictionary<string, object>(d, StringComparer.OrdinalIgnoreCase);
            var bag = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in parameters.GetType().GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
                bag[prop.Name] = prop.GetValue(parameters);
            return bag;
        }
    }

    // Legacy alias retained for the existing DI registration so we can
    // flip to the registry-backed impl without touching every consumer.
    public class StubSqlExecutor : RegistrySqlExecutor
    {
        public StubSqlExecutor(IConnectionRegistry registry) : base(registry) { }
    }

    public class StubEmitter : IMfRazorEmitter
    {
        // Phase 0: emitter is a no-op since the server-render is one-shot.
        // The actual emit happens client-side via JS bridge inside the
        // rendered HTML. Phase 1 will buffer emit calls into the Render
        // response so the TS plugin can dispatch them.
        public Task EmitValueAsync(object value)            => Task.CompletedTask;
        public Task DispatchEventAsync(string n, object p)  => Task.CompletedTask;
        public Task RefreshFieldAsync(string fieldKey)      => Task.CompletedTask;
    }
}
