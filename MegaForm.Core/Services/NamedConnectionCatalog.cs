using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>One admin-saved named SQL connection (the "CustomerErp" kind).</summary>
    public class NamedConnectionInfo
    {
        public string Name { get; set; }
        /// <summary>Sqlite | SqlServer | MySql | PostgreSql (UI vocabulary, case-insensitive).</summary>
        public string Provider { get; set; }
        public string ConnectionString { get; set; }
    }

    /// <summary>
    /// [NamedConnections v20260717-01] Platform-shared catalog of admin-saved database connections.
    ///
    /// Why Core: the Database Settings popup only managed ONE connection (the DashboardDatabase
    /// override) while the builder's databaseInsert picker listed extra names that could only come
    /// from appsettings.json (e.g. "CustomerErp") — an operator without file access could see a
    /// connection they could never add or manage. This catalog is the single JSON blob every
    /// platform stores in its own settings store (Oqtane Site settings, DNN PortalSettings,
    /// Umbraco/Web key-value settings) under <see cref="SettingKey"/> so validation, reserved-name
    /// rules and secret masking stay identical on all four platforms.
    ///
    /// SECURITY (rules 1/3): the catalog is written ONLY by admin-gated endpoints; connection
    /// strings live server-side and every value echoed to a browser goes through
    /// <see cref="MaskSecrets"/>. Names join the external-table allow-lists, so a saved name is
    /// usable by databaseInsert/ATBE exactly like an appsettings-listed one.
    /// </summary>
    public static class NamedConnectionCatalog
    {
        /// <summary>Full canonical settings key — identical on every platform's settings store.</summary>
        public const string SettingKey = "MegaForm_NamedConnections";

        /// <summary>Names the platforms already resolve specially — a saved entry must never shadow them.</summary>
        public static readonly string[] ReservedNames =
            { "DashboardDatabase", "DefaultConnection", "SiteSqlServer", "DnnDefault", "MegaForm" };

        // A connection name is an identifier, not free text: it is interpolated into pickers,
        // allow-lists and settings blobs on every platform.
        private static readonly Regex NameRe = new Regex("^[A-Za-z][A-Za-z0-9_-]{0,63}$", RegexOptions.Compiled);
        private static readonly Regex SecretRe = new Regex(@"(?i)(password|pwd)\s*=\s*[^;]*", RegexOptions.Compiled);

        public static List<NamedConnectionInfo> Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<NamedConnectionInfo>();
            try
            {
                var list = JsonConvert.DeserializeObject<List<NamedConnectionInfo>>(json) ?? new List<NamedConnectionInfo>();
                return list.Where(c => c != null && !string.IsNullOrWhiteSpace(c.Name)).ToList();
            }
            catch
            {
                // A corrupt blob must never take the whole Database Settings surface down.
                return new List<NamedConnectionInfo>();
            }
        }

        public static string Serialize(List<NamedConnectionInfo> list)
            => JsonConvert.SerializeObject(list ?? new List<NamedConnectionInfo>());

        /// <summary>Null when the name is usable; otherwise a human-readable reason.</summary>
        public static string ValidateName(string name)
        {
            var n = (name ?? string.Empty).Trim();
            if (n.Length == 0) return "Connection name is required.";
            if (!NameRe.IsMatch(n)) return "Connection name must start with a letter and use only letters, digits, '-' or '_' (max 64).";
            if (ReservedNames.Any(r => string.Equals(r, n, StringComparison.OrdinalIgnoreCase)))
                return "'" + n + "' is a reserved connection name.";
            return null;
        }

        public static NamedConnectionInfo Find(string json, string name)
        {
            var n = (name ?? string.Empty).Trim();
            if (n.Length == 0) return null;
            return Parse(json).FirstOrDefault(c => string.Equals(c.Name?.Trim(), n, StringComparison.OrdinalIgnoreCase));
        }

        public static bool Contains(string json, string name) => Find(json, name) != null;

        public static IEnumerable<string> Names(string json)
            => Parse(json).Select(c => c.Name.Trim());

        /// <summary>Add or replace by name (case-insensitive). Returns the new serialized blob.</summary>
        public static string Upsert(string json, NamedConnectionInfo item)
        {
            var list = Parse(json);
            list.RemoveAll(c => string.Equals(c.Name?.Trim(), item.Name?.Trim(), StringComparison.OrdinalIgnoreCase));
            list.Add(new NamedConnectionInfo
            {
                Name = (item.Name ?? string.Empty).Trim(),
                Provider = (item.Provider ?? string.Empty).Trim(),
                ConnectionString = item.ConnectionString ?? string.Empty,
            });
            return Serialize(list.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList());
        }

        /// <summary>Remove by name. Returns the new serialized blob (unchanged when absent).</summary>
        public static string Remove(string json, string name)
        {
            var list = Parse(json);
            list.RemoveAll(c => string.Equals(c.Name?.Trim(), (name ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase));
            return Serialize(list);
        }

        /// <summary>password=/pwd= fragments become *** — never echo plaintext secrets to a browser.</summary>
        public static string MaskSecrets(string connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString)) return string.Empty;
            return SecretRe.Replace(connectionString, "$1=***");
        }

        /// <summary>
        /// [MaskRoundTrip v20260726] Editing a saved connection starts from the MASKED string the
        /// list already shows (everything except password=/pwd=, which comes back as ***). Saving
        /// that back verbatim would persist the literal "***" and break the connection, so an admin
        /// could not fix a typo in the server name without also retyping the password. When the
        /// submitted string still carries the mask, put the STORED secret back; a real edited
        /// password (anything that is not ***) always wins. Secrets never leave the server.
        /// </summary>
        public static string RestoreMaskedSecrets(string submitted, string stored)
        {
            if (string.IsNullOrWhiteSpace(submitted) || string.IsNullOrWhiteSpace(stored)) return submitted;
            if (!MaskedSecretRe.IsMatch(submitted)) return submitted;
            var storedMatch = SecretRe.Match(stored);
            if (!storedMatch.Success) return submitted;
            var storedPair = storedMatch.Value;                       // e.g. "Password=hunter2"
            return MaskedSecretRe.Replace(submitted, m => storedPair);
        }

        private static readonly Regex MaskedSecretRe = new Regex(@"(?i)(password|pwd)\s*=\s*\*{3,}", RegexOptions.Compiled);
    }
}
