using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace MegaForm.Core.Integrations.Storage
{
    /// <summary>One admin-saved named cloud storage connection (the "CompanyDrive" kind).</summary>
    public class CloudStorageConnectionInfo
    {
        public string Name { get; set; }

        /// <summary>GoogleDrive | AmazonS3 | AzureBlob (matches IStorageProvider.ProviderName, case-insensitive).</summary>
        public string Provider { get; set; }

        /// <summary>OAuth access token (Google Drive). Secret.</summary>
        public string AccessToken { get; set; }

        /// <summary>OAuth refresh token (Google Drive). Secret. Refresh flow is host-managed.</summary>
        public string RefreshToken { get; set; }

        /// <summary>Client id / AWS access key id / Azure account name (provider-specific, not secret).</summary>
        public string ClientId { get; set; }

        /// <summary>Client secret / AWS secret access key / Azure account key or connection string. Secret.</summary>
        public string ClientSecret { get; set; }

        /// <summary>Drive base folder path / S3 bucket / Azure container name.</summary>
        public string BaseFolder { get; set; }

        /// <summary>Optional custom endpoint (S3-compatible service URL, Azure blob service URL).</summary>
        public string BaseUrl { get; set; }

        /// <summary>Provider-specific extras, e.g. Extra["Region"]="eu-west-1" for S3.</summary>
        public Dictionary<string, string> Extra { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// [CloudStorage v20260723-01] Platform-shared catalog of admin-saved cloud storage connections.
    /// Mirror of <see cref="MegaForm.Core.Services.NamedConnectionCatalog"/> (database connections):
    /// a single JSON blob every platform stores in its own settings store (Oqtane Site settings,
    /// DNN PortalSettings, Umbraco/Web key-value settings) under <see cref="SettingKey"/> so
    /// validation and secret masking stay identical on all four platforms.
    ///
    /// SECURITY: the catalog is written ONLY by admin-gated endpoints; credentials live server-side
    /// and every entry echoed to a browser goes through <see cref="MaskSecrets"/>. Form schemas
    /// reference a connection by NAME only (StorageIntegrationMapping.ConnectionSettingsId).
    /// </summary>
    public static class CloudStorageConnectionCatalog
    {
        /// <summary>Full canonical settings key — identical on every platform's settings store.</summary>
        public const string SettingKey = "MegaForm_CloudStorageConnections";

        // A connection name is an identifier, not free text: it is interpolated into pickers and
        // settings blobs on every platform.
        private static readonly Regex NameRe = new Regex("^[A-Za-z][A-Za-z0-9_-]{0,63}$", RegexOptions.Compiled);

        public static List<CloudStorageConnectionInfo> Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<CloudStorageConnectionInfo>();
            try
            {
                var list = JsonConvert.DeserializeObject<List<CloudStorageConnectionInfo>>(json) ?? new List<CloudStorageConnectionInfo>();
                return list.Where(c => c != null && !string.IsNullOrWhiteSpace(c.Name)).ToList();
            }
            catch
            {
                // A corrupt blob must never take the whole settings surface down.
                return new List<CloudStorageConnectionInfo>();
            }
        }

        public static string Serialize(List<CloudStorageConnectionInfo> list)
            => JsonConvert.SerializeObject(list ?? new List<CloudStorageConnectionInfo>());

        /// <summary>Null when the name is usable; otherwise a human-readable reason.</summary>
        public static string ValidateName(string name)
        {
            var n = (name ?? string.Empty).Trim();
            if (n.Length == 0) return "Connection name is required.";
            if (!NameRe.IsMatch(n)) return "Connection name must start with a letter and use only letters, digits, '-' or '_' (max 64).";
            return null;
        }

        public static CloudStorageConnectionInfo Find(string json, string name)
        {
            var n = (name ?? string.Empty).Trim();
            if (n.Length == 0) return null;
            return Parse(json).FirstOrDefault(c => string.Equals(c.Name?.Trim(), n, StringComparison.OrdinalIgnoreCase));
        }

        public static bool Contains(string json, string name) => Find(json, name) != null;

        public static IEnumerable<string> Names(string json)
            => Parse(json).Select(c => c.Name.Trim());

        /// <summary>Add or replace by name (case-insensitive). Returns the new serialized blob.</summary>
        public static string Upsert(string json, CloudStorageConnectionInfo item)
        {
            var list = Parse(json);
            list.RemoveAll(c => string.Equals(c.Name?.Trim(), item.Name?.Trim(), StringComparison.OrdinalIgnoreCase));
            item.Name = (item.Name ?? string.Empty).Trim();
            item.Provider = (item.Provider ?? string.Empty).Trim();
            list.Add(item);
            return Serialize(list.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList());
        }

        /// <summary>Remove by name. Returns the new serialized blob (unchanged when absent).</summary>
        public static string Remove(string json, string name)
        {
            var list = Parse(json);
            list.RemoveAll(c => string.Equals(c.Name?.Trim(), (name ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase));
            return Serialize(list);
        }

        /// <summary>
        /// Returns a copy safe to echo to a browser: every non-empty secret becomes "***".
        /// An admin UI that receives "***" on edit must keep the stored value unless the user
        /// types a replacement (same convention as database connection passwords).
        /// </summary>
        public static CloudStorageConnectionInfo MaskSecrets(CloudStorageConnectionInfo entry)
        {
            if (entry == null) return null;
            return new CloudStorageConnectionInfo
            {
                Name = entry.Name,
                Provider = entry.Provider,
                AccessToken = Mask(entry.AccessToken),
                RefreshToken = Mask(entry.RefreshToken),
                ClientId = entry.ClientId,
                ClientSecret = Mask(entry.ClientSecret),
                BaseFolder = entry.BaseFolder,
                BaseUrl = entry.BaseUrl,
                Extra = entry.Extra != null
                    ? new Dictionary<string, string>(entry.Extra, StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            };
        }

        /// <summary>Map a catalog entry to the provider-facing settings contract.</summary>
        public static StorageConnectionSettings ToConnectionSettings(CloudStorageConnectionInfo entry)
        {
            if (entry == null) return null;
            return new StorageConnectionSettings
            {
                ProviderName = entry.Provider,
                AccessToken = entry.AccessToken,
                RefreshToken = entry.RefreshToken,
                ClientId = entry.ClientId,
                ClientSecret = entry.ClientSecret,
                BaseFolder = entry.BaseFolder,
                BaseUrl = entry.BaseUrl,
                Extra = entry.Extra != null
                    ? new Dictionary<string, string>(entry.Extra, StringComparer.OrdinalIgnoreCase)
                    : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            };
        }

        private static string Mask(string secret)
            => string.IsNullOrEmpty(secret) ? string.Empty : "***";
    }
}
