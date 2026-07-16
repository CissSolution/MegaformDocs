using System;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models.ExternalTable;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.ExternalTable
{
    /// <summary>
    /// [SourcePicker v20260715] Lets a form that mirrors its submissions into a SQL table via
    /// settings.databaseInsert be READ like an ATBE-bound form — through the same
    /// ExternalTableQueryService (SQL-side filter/sort/page/count, MaxOffset guard, bounded count)
    /// instead of the ad-hoc CustomTableRows SELECT * this replaces.
    ///
    /// databaseInsert stores no table name: the target is derived from the INSERT INTO text, the
    /// same regex the AiTools CustomTableRows endpoint used. The table is then profiled ON DEMAND
    /// with TableCapabilityProbe (read-only, no behavioural probe, no persistence — this is NOT an
    /// ATBE bind and never writes MF_ExternalBindings) and cached per target, so the probe cost is
    /// paid once per process, not per page.
    ///
    /// Security (SECURITY_CODING_RULES §1/§2): connectionKey + insertSql come from the form's
    /// server-stored settings — never from the request. Identifiers are re-validated here AND by
    /// the probe (IsSafeIdent). The optional allowlist hook mirrors AiTools.OpenAiConnection:
    /// a connection the operator never listed cannot be opened, whatever the settings say.
    /// </summary>
    public class DatabaseInsertBindingResolver
    {
        private static readonly Regex InsertIntoPattern = new Regex(
            @"INSERT\s+INTO\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex SafeIdent = new Regex(@"^\w+$", RegexOptions.Compiled);

        private readonly IConnectionRegistry _registry;
        private readonly IFormRepository _forms;
        private readonly Func<string, bool> _connectionAllowed;

        // Keyed by connectionKey|schema.table — a changed insertSql that targets a new table gets
        // a new key and a fresh probe; re-probing the same table on every page would be waste.
        private static readonly ConcurrentDictionary<string, Resolved> Cache =
            new ConcurrentDictionary<string, Resolved>(StringComparer.OrdinalIgnoreCase);

        public DatabaseInsertBindingResolver(
            IConnectionRegistry registry,
            IFormRepository forms,
            Func<string, bool> connectionAllowed = null)
        {
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _connectionAllowed = connectionAllowed;
        }

        public sealed class Target
        {
            public string ConnectionKey { get; set; }
            public string DatabaseType { get; set; }
            public string Schema { get; set; }
            public string Table { get; set; }
        }

        public sealed class Resolved
        {
            public ExternalBinding Binding { get; set; }
            public CapabilityProfile Profile { get; set; }
        }

        /// <summary>
        /// Parse-only capability check (no DB round trip): does this settings blob carry an enabled
        /// databaseInsert whose INSERT INTO target parses to safe identifiers? Used by controllers
        /// for the cheap "sqlCapable" echo without paying a probe.
        /// </summary>
        public static bool TryParseTarget(string settingsJson, out Target target)
        {
            target = null;
            if (string.IsNullOrWhiteSpace(settingsJson)) return false;
            JObject s;
            try { s = JObject.Parse(settingsJson); }
            catch { return false; }

            var di = s["databaseInsert"] ?? s["DatabaseInsert"];
            if (di == null) return false;
            var enabled = (bool?)(di["enabled"] ?? di["Enabled"]) ?? false;
            if (!enabled) return false;

            var insertSql = (string)(di["insertSql"] ?? di["InsertSql"]);
            if (string.IsNullOrWhiteSpace(insertSql)) return false;

            var m = InsertIntoPattern.Match(insertSql);
            if (!m.Success) return false;
            var schema = m.Groups[2].Success ? m.Groups[1].Value : "dbo";
            var table = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[1].Value;
            if (!SafeIdent.IsMatch(schema) || !SafeIdent.IsMatch(table)) return false;

            target = new Target
            {
                ConnectionKey = ((string)(di["connectionKey"] ?? di["ConnectionKey"]))?.Trim(),
                DatabaseType = ((string)(di["databaseType"] ?? di["DatabaseType"]))?.Trim(),
                Schema = schema,
                Table = table,
            };
            if (string.IsNullOrWhiteSpace(target.ConnectionKey)) target.ConnectionKey = "DashboardDatabase";
            return true;
        }

        /// <summary>
        /// Resolve the form's databaseInsert target into a (binding, profile) pair the external
        /// query service can execute. Returns null when the form has no usable target, the
        /// connection is not allow-listed, or the probe concluded the table is unusable —
        /// callers treat null as fail-CLOSED (empty page), never as "fall back to JSON silently".
        /// </summary>
        public Resolved Resolve(int formId)
        {
            var form = formId > 0 ? _forms.GetForm(formId) : null;
            if (form == null) return null;
            if (!TryParseTarget(form.SettingsJson, out var target)) return null;
            if (_connectionAllowed != null && !_connectionAllowed(target.ConnectionKey)) return null;

            var key = target.ConnectionKey + "|" + target.Schema + "." + target.Table;
            if (Cache.TryGetValue(key, out var cached)) return Rebind(cached, formId);

            CapabilityProfile profile;
            try
            {
                profile = new TableCapabilityProbe(_registry).Probe(new ProbeRequest
                {
                    ConnectionKey = target.ConnectionKey,
                    DatabaseType = target.DatabaseType,
                    Schema = target.Schema,
                    Table = target.Table,
                    AllowBehaviouralProbe = false,
                });
            }
            catch
            {
                // Probe failure (unreachable server, dropped table, bad ident) — not cached, so a
                // fixed connection recovers on the next request without a process restart.
                return null;
            }

            if (profile == null || profile.Object == null || profile.Object.Type == "UNKNOWN")
                return null;

            var resolved = new Resolved
            {
                Profile = profile,
                Binding = new ExternalBinding
                {
                    FormId = formId,
                    ConnectionKey = target.ConnectionKey,
                    DatabaseType = target.DatabaseType,
                    Schema = profile.Object.Schema,
                    Table = profile.Object.Name,
                    ProfileJson = JsonConvert.SerializeObject(profile),
                    ProfileHash = profile.Hash,
                    Mode = "readonly",   // the dashboard READS the mirror; writes stay on the submit hook
                    CreatedOnUtc = DateTime.UtcNow,
                },
            };
            Cache[key] = resolved;
            return Rebind(resolved, formId);
        }

        /// <summary>The cache is keyed by TABLE (two forms may mirror the same table) — hand each
        /// caller a binding stamped with ITS formId rather than whoever probed first.</summary>
        private static Resolved Rebind(Resolved r, int formId)
        {
            if (r?.Binding == null || r.Binding.FormId == formId) return r;
            return new Resolved
            {
                Profile = r.Profile,
                Binding = new ExternalBinding
                {
                    FormId = formId,
                    ConnectionKey = r.Binding.ConnectionKey,
                    DatabaseType = r.Binding.DatabaseType,
                    Schema = r.Binding.Schema,
                    Table = r.Binding.Table,
                    ProfileJson = r.Binding.ProfileJson,
                    ProfileHash = r.Binding.ProfileHash,
                    Mode = r.Binding.Mode,
                    CreatedOnUtc = r.Binding.CreatedOnUtc,
                },
            };
        }
    }
}
