using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// File-based license switch supporting two channels:
    ///   1) Classic: a plain-text license.lic file containing "production".
    ///   2) Domain-based: a megaform-license.json file binding the install to a licensed domain
    ///      (plus wildcard subdomains and up to two dev/test domains). Localhost is always allowed
    ///      for unrestricted local development, mirroring the Umbraco Forms licensing model.
    /// Delete or blank the files to fall back to trial mode.
    /// </summary>
    public static class LicenseService
    {
        public const string Badge = "LicenseService v20260816-01";
        public const string FileName = "license.lic";
        public const string DomainLicenseFileName = "megaform-license.json";

        // [TrialTighten v20260706] Hard caps enforced when NOT production-licensed. Production
        // (license.lic = "production") is unlimited. Trial gets a small form/submission budget +
        // premium templates and AI are locked (server + client). The public form no longer shows a
        // "Trial Mode" footer — the gate is these limits, not a watermark.
        public const int MaxTrialForms = 10;
        public const int MaxTrialSubmissionsPerForm = 25;
        public const string UpgradeUrl = "https://dnndefender.com";

        /// <summary>
        /// Domain-based license document. Hosts can read this from megaform-license.json and
        /// validate the current request host against it.
        /// </summary>
        public class DomainLicense
        {
            /// <summary>Licensed production domain, e.g. example.com.</summary>
            [JsonProperty("domain")]
            public string Domain { get; set; }

            /// <summary>Up to two additional development/testing domains.</summary>
            [JsonProperty("devDomains")]
            public List<string> DevDomains { get; set; } = new List<string>();

            /// <summary>Optional UTC expiry date. Missing or empty means no expiry.</summary>
            [JsonProperty("expires")]
            public DateTime? Expires { get; set; }
        }

        /// <summary>True when the install is running unlicensed (trial). Inverse of IsProductionLicensed.</summary>
        public static bool IsTrial() => !IsProductionLicensed();

        // [OqtaneLicensing v20260723] Optional SECOND license source registered by a host at startup
        // (e.g. the Oqtane host bridges Oqtane Marketplace licensing via Oqtane.Licensing). OR
        // semantics: either the classic license.lic file OR the external probe marks the install
        // production — the file channel stays authoritative for DNN/Umbraco/Web and direct sales.
        // The probe must be cheap, thread-safe and fail-soft; it runs inside the 30s cache below,
        // so it executes at most once per TTL. Probe exceptions are treated as "not licensed".
        private static Func<bool> _externalLicenseProbe;

        /// <summary>Registers an external licensing probe (host startup only). Passing null clears it.</summary>
        public static void RegisterExternalLicenseProbe(Func<bool> probe)
        {
            lock (_licenseCacheLock)
            {
                _externalLicenseProbe = probe;
                // Bust the cache so a probe registered after the first check takes effect now.
                _licenseCacheExpiryUtc = DateTime.MinValue;
            }
        }

        /// <summary>
        /// Clears the short-lived runtime license cache. Hosts call this immediately after
        /// installing or removing a license file so activation does not wait for the TTL.
        /// </summary>
        public static void InvalidateCache()
        {
            lock (_licenseCacheLock)
            {
                _licenseCacheExpiryUtc = DateTime.MinValue;
            }
        }

        private static bool SafeExternalProbe()
        {
            var probe = _externalLicenseProbe;
            if (probe == null) return false;
            try { return probe(); }
            catch { return false; }
        }

        // [PerfFix 2026-07-05 PERF-A1] IsProductionLicensed reads license.lic from disk. It is called on
        // EVERY render (RenderModelResolver.CanonicalizeTrialMode → ResolveProductionMode), i.e. synchronous
        // file I/O on the public form hot path. Cache the result for a short TTL: removes the per-render read
        // and makes the license flag cheap to fold into the render cache key. A license drop takes effect
        // within TTL seconds. Thread-safe double-checked lock.
        private const int LicenseCacheTtlSeconds = 30;
        private static bool _cachedProductionLicensed;
        private static DateTime _licenseCacheExpiryUtc = DateTime.MinValue;
        private static readonly object _licenseCacheLock = new object();

        public static bool IsProductionLicensed()
        {
            var now = DateTime.UtcNow;
            if (now < _licenseCacheExpiryUtc) return _cachedProductionLicensed;
            lock (_licenseCacheLock)
            {
                if (now < _licenseCacheExpiryUtc) return _cachedProductionLicensed;
                string licenseValue;
                string _path;
                var result = (TryReadLicenseValue(out licenseValue, out _path) && IsValidLicenseValue(licenseValue))
                    || SafeExternalProbe();
                _cachedProductionLicensed = result;
                _licenseCacheExpiryUtc = now.AddSeconds(LicenseCacheTtlSeconds);
                return result;
            }
        }

        public static bool TryReadLicenseValue(out string licenseValue, out string resolvedPath)
        {
            foreach (var path in GetCandidatePaths())
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    licenseValue = (File.ReadAllText(path) ?? string.Empty).Trim();
                    resolvedPath = path;
                    return true;
                }
                catch
                {
                    // Ignore inaccessible candidate and continue probing.
                }
            }

            licenseValue = string.Empty;
            resolvedPath = string.Empty;
            return false;
        }

        public static bool IsValidLicenseValue(string licenseValue)
        {
            if (string.IsNullOrWhiteSpace(licenseValue)) return false;

            var normalized = licenseValue.Trim();
            return string.Equals(normalized, "production", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "dnndefender.com:megaform", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Checks whether the supplied HTTP request host is covered by a domain-based license.
        /// Localhost is always considered licensed for unrestricted local development. A valid
        /// megaform-license.json covering the host also returns true.
        /// </summary>
        public static bool IsProductionLicensedForHost(string host)
        {
            if (string.IsNullOrWhiteSpace(host)) return false;
            if (IsLocalHost(host)) return true;

            DomainLicense license;
            string path;
            if (!TryReadDomainLicense(out license, out path) || license == null) return false;

            return IsHostCoveredByDomainLicense(host, license);
        }

        /// <summary>
        /// Validates a parsed domain license against a concrete host. Exposed separately so hosts
        /// can perform the check without re-reading the file.
        /// </summary>
        public static bool IsHostCoveredByDomainLicense(string host, DomainLicense license)
        {
            if (string.IsNullOrWhiteSpace(host) || license == null) return false;
            if (IsLocalHost(host)) return true;
            if (license.Expires.HasValue && license.Expires.Value < DateTime.UtcNow) return false;

            var normalizedHost = host.Trim().ToLowerInvariant();

            if (!string.IsNullOrWhiteSpace(license.Domain))
            {
                var licensedDomain = license.Domain.Trim().ToLowerInvariant();
                if (DomainMatches(normalizedHost, licensedDomain))
                    return true;
            }

            if (license.DevDomains != null)
            {
                foreach (var dev in license.DevDomains)
                {
                    if (string.IsNullOrWhiteSpace(dev)) continue;
                    var licensedDev = dev.Trim().ToLowerInvariant();
                    if (DomainMatches(normalizedHost, licensedDev))
                        return true;
                }
            }

            return false;
        }

        /// <summary>
        /// Reads the first megaform-license.json found in the standard probe locations.
        /// </summary>
        public static bool TryReadDomainLicense(out DomainLicense license, out string resolvedPath)
        {
            foreach (var path in GetDomainLicenseCandidatePaths())
            {
                try
                {
                    if (!File.Exists(path)) continue;
                    var json = File.ReadAllText(path);
                    license = JsonConvert.DeserializeObject<DomainLicense>(json);
                    resolvedPath = path;
                    return license != null;
                }
                catch
                {
                    // Ignore unreadable/malformed candidate and continue probing.
                }
            }

            license = null;
            resolvedPath = string.Empty;
            return false;
        }

        /// <summary>
        /// True for localhost, 127.0.0.1, ::1 and any *.local suffix, matching the
        /// Umbraco Forms unrestricted-local-development rule.
        /// </summary>
        public static bool IsLocalHost(string host)
        {
            if (string.IsNullOrWhiteSpace(host)) return false;
            var normalized = host.Trim().ToLowerInvariant();
            return normalized == "localhost"
                || normalized == "127.0.0.1"
                || normalized == "::1"
                || normalized.EndsWith(".local", StringComparison.Ordinal);
        }

        /// <summary>
        /// Matches a host against a licensed domain, supporting:
        ///   - exact match
        ///   - www. prefix
        ///   - any subdomain (*.domain.com)
        ///   - .local test suffix
        /// </summary>
        public static bool DomainMatches(string host, string licensedDomain)
        {
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(licensedDomain)) return false;

            var normalizedHost = host.Trim().ToLowerInvariant();
            var normalizedLicensed = licensedDomain.Trim().ToLowerInvariant();

            if (normalizedHost == normalizedLicensed) return true;
            if (normalizedHost == "www." + normalizedLicensed) return true;
            if (normalizedHost == normalizedLicensed + ".local") return true;
            if (normalizedHost == "www." + normalizedLicensed + ".local") return true;

            // Subdomain: host must be longer and end with ".licensedDomain"
            if (normalizedHost.Length > normalizedLicensed.Length + 1
                && normalizedHost.EndsWith("." + normalizedLicensed, StringComparison.Ordinal))
                return true;

            // Subdomain with .local suffix: host ends with ".licensedDomain.local"
            var localSuffix = normalizedLicensed + ".local";
            if (normalizedHost.Length > localSuffix.Length + 1
                && normalizedHost.EndsWith("." + localSuffix, StringComparison.Ordinal))
                return true;

            return false;
        }

        private static IEnumerable<string> GetDomainLicenseCandidatePaths()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var root in GetProbeRoots())
            {
                var hasDnnModule = SafeDirectoryExists(Path.Combine(root, "DesktopModules", "MegaForm"));
                var hasOqtaneModule = SafeDirectoryExists(Path.Combine(root, "Modules", "MegaForm"));
                var hasUmbracoModule = SafeDirectoryExists(Path.Combine(root, "App_Plugins", "MegaForm"))
                    || SafeDirectoryExists(Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm"));

                foreach (var path in ExpandDomainLicenseCandidates(root, hasDnnModule, hasOqtaneModule, hasUmbracoModule))
                {
                    if (string.IsNullOrWhiteSpace(path)) continue;

                    string fullPath;
                    try
                    {
                        fullPath = Path.GetFullPath(path);
                    }
                    catch
                    {
                        continue;
                    }

                    if (seen.Add(fullPath))
                        yield return fullPath;
                }
            }
        }

        private static IEnumerable<string> ExpandDomainLicenseCandidates(string root, bool hasDnnModule, bool hasOqtaneModule, bool hasUmbracoModule)
        {
            if (string.IsNullOrWhiteSpace(root)) yield break;

            if (hasDnnModule)
            {
                yield return Path.Combine(root, "DesktopModules", "MegaForm", DomainLicenseFileName);
                yield break;
            }

            if (hasOqtaneModule)
            {
                yield return Path.Combine(root, "Modules", "MegaForm", DomainLicenseFileName);
                yield return Path.Combine(root, "wwwroot", "Modules", "MegaForm", DomainLicenseFileName);
                yield break;
            }

            if (hasUmbracoModule)
            {
                yield return Path.Combine(root, "App_Plugins", "MegaForm", DomainLicenseFileName);
                yield return Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm", DomainLicenseFileName);
                yield break;
            }

            yield return Path.Combine(root, DomainLicenseFileName);
            yield return Path.Combine(root, "Modules", "MegaForm", DomainLicenseFileName);
            yield return Path.Combine(root, "wwwroot", "Modules", "MegaForm", DomainLicenseFileName);
            yield return Path.Combine(root, "App_Plugins", "MegaForm", DomainLicenseFileName);
            yield return Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm", DomainLicenseFileName);
        }

        private static IEnumerable<string> GetCandidatePaths()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var root in GetProbeRoots())
            {
                var hasDnnModule = SafeDirectoryExists(Path.Combine(root, "DesktopModules", "MegaForm"));
                var hasOqtaneModule = SafeDirectoryExists(Path.Combine(root, "Modules", "MegaForm"));
                var hasUmbracoModule = SafeDirectoryExists(Path.Combine(root, "App_Plugins", "MegaForm"))
                    || SafeDirectoryExists(Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm"));

                foreach (var path in ExpandCandidates(root, hasDnnModule, hasOqtaneModule, hasUmbracoModule))
                {
                    if (string.IsNullOrWhiteSpace(path)) continue;

                    string fullPath;
                    try
                    {
                        fullPath = Path.GetFullPath(path);
                    }
                    catch
                    {
                        continue;
                    }

                    if (seen.Add(fullPath))
                        yield return fullPath;
                }
            }
        }

        private static IEnumerable<string> GetProbeRoots()
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var raw in new[]
            {
                AppContext.BaseDirectory,
                AppDomain.CurrentDomain.BaseDirectory,
                Environment.CurrentDirectory,
                SafeGetAssemblyDirectory(Assembly.GetExecutingAssembly()),
                SafeGetAssemblyDirectory(Assembly.GetEntryAssembly())
            })
            {
                if (string.IsNullOrWhiteSpace(raw)) continue;

                string full;
                try
                {
                    full = Path.GetFullPath(raw);
                }
                catch
                {
                    continue;
                }

                var current = full;
                for (var depth = 0; depth < 3 && !string.IsNullOrWhiteSpace(current); depth++)
                {
                    if (seen.Add(current))
                        yield return current;

                    var parent = Directory.GetParent(current);
                    if (parent == null) break;
                    current = parent.FullName;
                }
            }
        }

        private static IEnumerable<string> ExpandCandidates(string root, bool hasDnnModule, bool hasOqtaneModule, bool hasUmbracoModule)
        {
            if (string.IsNullOrWhiteSpace(root)) yield break;

            if (hasDnnModule)
            {
                yield return Path.Combine(root, "DesktopModules", "MegaForm", FileName);
                yield break;
            }

            if (hasOqtaneModule)
            {
                yield return Path.Combine(root, "Modules", "MegaForm", FileName);
                yield return Path.Combine(root, "wwwroot", "Modules", "MegaForm", FileName);
                yield break;
            }

            if (hasUmbracoModule)
            {
                yield return Path.Combine(root, "App_Plugins", "MegaForm", FileName);
                yield return Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm", FileName);
                yield break;
            }

            yield return Path.Combine(root, FileName);
            yield return Path.Combine(root, "Modules", "MegaForm", FileName);
            yield return Path.Combine(root, "wwwroot", "Modules", "MegaForm", FileName);
            yield return Path.Combine(root, "App_Plugins", "MegaForm", FileName);
            yield return Path.Combine(root, "wwwroot", "App_Plugins", "MegaForm", FileName);
        }

        private static bool SafeDirectoryExists(string path)
        {
            try
            {
                return !string.IsNullOrWhiteSpace(path) && Directory.Exists(path);
            }
            catch
            {
                return false;
            }
        }

        private static string SafeGetAssemblyDirectory(Assembly assembly)
        {
            try
            {
                if (assembly == null || string.IsNullOrWhiteSpace(assembly.Location)) return string.Empty;
                return Path.GetDirectoryName(assembly.Location) ?? string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }
    }
}
