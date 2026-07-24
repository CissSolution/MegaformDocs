using System;
using Microsoft.Extensions.DependencyInjection;
using Oqtane.Infrastructure;
using Oqtane.Licensing.Manager;
using Oqtane.Licensing.Models;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [OqtaneLicensing v20260723] Bridge between Oqtane Marketplace licensing
    /// (Oqtane.Licensing) and MegaForm's single source of truth, LicenseService.
    ///
    /// Model: MegaForm keeps TWO independent license channels —
    ///   1. license.lic file = "production" (classic, all 4 hosts, direct sales), and
    ///   2. a valid Oqtane Marketplace key for package "MegaForm.Oqtane" (this bridge).
    /// Either one flips the install out of trial (OR semantics inside LicenseService).
    /// Trial behaviour (10 forms / 25 submissions per form / AI locked) is unchanged
    /// when NEITHER channel is licensed.
    ///
    /// How validation works (Oqtane.Licensing.Server): the key lives at
    /// {host bin}\MegaForm.Oqtane.lic and is validated OFFLINE (expiry date encoded in
    /// key segments 8-9 + MD5-seeded KeyByte checksum) — no marketplace round-trip on
    /// reads. PackageRegistryUrl MUST be set from the host config exactly like
    /// Oqtane's own LicensingController does, because the checksum uses a different
    /// KeyByteSet for keys issued by the production registry (https://www.oqtane.net)
    /// vs sandbox/custom registries.
    ///
    /// Deliberate mismatch to be aware of: the CLIENT LicenseView component always
    /// reports "licensed" on localhost (Oqtane design, for dev convenience), while
    /// this server probe does NOT special-case localhost — trial caps still apply on
    /// dev machines unless a key is activated (use ?licensing=testmode to exercise
    /// the unlicensed UI flow). This matches MegaForm's existing file-based model.
    /// </summary>
    public static class OqtaneLicenseBridge
    {
        /// <summary>Must match ModuleInfo.PackageName and the Marketplace product name.</summary>
        public const string PackageName = "MegaForm.Oqtane";

        private const int CacheTtlSeconds = 60;
        private static readonly object _lock = new object();
        private static IConfigManager _configManager;
        private static bool _cachedValid;
        private static DateTime _cacheExpiryUtc = DateTime.MinValue;

        /// <summary>
        /// Registers the Oqtane licensing probe with LicenseService. Call once from
        /// IServerStartup.Configure. Fail-soft: if IConfigManager cannot be resolved,
        /// the probe simply reports "not licensed" and the file channel decides.
        /// </summary>
        public static void Register(IServiceProvider services)
        {
            IConfigManager configManager = null;
            try { configManager = services?.GetService<IConfigManager>(); } catch { /* resolved lazily never */ }
            _configManager = configManager;
            MegaForm.Core.Services.LicenseService.RegisterExternalLicenseProbe(Probe);
        }

        private static bool Probe()
        {
            var now = DateTime.UtcNow;
            if (now < _cacheExpiryUtc) return _cachedValid;
            lock (_lock)
            {
                if (now < _cacheExpiryUtc) return _cachedValid;
                _cachedValid = Evaluate();
                _cacheExpiryUtc = now.AddSeconds(CacheTtlSeconds);
                return _cachedValid;
            }
        }

        private static bool Evaluate()
        {
            try
            {
                var configManager = _configManager;
                if (configManager == null) return false;

                var license = new License(PackageName)
                {
                    InstallationId = configManager.GetInstallationId(),
                    // Critical: the key checksum picks its KeyByteSet from this URL —
                    // production registry keys only validate with the production URL.
                    PackageRegistryUrl = configManager.GetSetting<string>("PackageRegistryUrl", "https://www.oqtane.net")
                };
                // GetLicense is synchronous file I/O + crypto wrapped in Task.FromResult —
                // GetAwaiter().GetResult() cannot deadlock here (no async I/O on this path).
                var result = new LicenseServer().GetLicense(license).GetAwaiter().GetResult();
                return result != null && result.IsValid;
            }
            catch
            {
                // Fail-soft: licensing problems must never take down form rendering —
                // worst case the install stays in trial until the file channel or a
                // fixed probe says otherwise.
                return false;
            }
        }
    }
}
