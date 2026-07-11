using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Minimal file-based license switch.
    /// Valid license file content:
    ///   production
    /// Backward-compatible accepted token:
    ///   dnndefender.com:megaform
    /// Delete or blank the file to fall back to trial mode.
    /// </summary>
    public static class LicenseService
    {
        public const string Badge = "LicenseService v20260419-09";
        public const string FileName = "license.lic";

        // [TrialTighten v20260706] Hard caps enforced when NOT production-licensed. Production
        // (license.lic = "production") is unlimited. Trial gets a small form/submission budget +
        // premium templates and AI are locked (server + client). The public form no longer shows a
        // "Trial Mode" footer — the gate is these limits, not a watermark.
        public const int MaxTrialForms = 10;
        public const int MaxTrialSubmissionsPerForm = 25;
        public const string UpgradeUrl = "https://dnndefender.com";

        /// <summary>True when the install is running unlicensed (trial). Inverse of IsProductionLicensed.</summary>
        public static bool IsTrial() => !IsProductionLicensed();

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
                var result = TryReadLicenseValue(out licenseValue, out _path) && IsValidLicenseValue(licenseValue);
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
