using System;
using System.IO;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// Canonical gate that decides whether the MegaForm AI Form Assistant is
    /// available on the current install.
    ///
    /// [ProductionUnlocksAi v20260726] PRODUCT RULE (owner, 2026-07-26):
    /// **a PRODUCTION-licensed install runs AI; a TRIAL never does.** AI is part of
    /// what a license buys, so a paying install must not need a hidden marker file
    /// to switch it on — a fresh production install answering
    /// "AI assistant disabled (no dev.lock)" was the bug, not the feature.
    ///
    /// `dev.lock` survives ONLY as the escape hatch for an UNLICENSED developer
    /// machine (building from source, no license.lic). It can never unlock a
    /// customer trial, because a trial package ships no dev.lock and the trial
    /// path also withholds the API key server-side.
    ///
    /// Call <see cref="IsAvailable"/> for the gate. <see cref="IsEnabled"/> is the
    /// raw dev.lock file probe and stays public only for diagnostics.
    ///
    /// dev.lock search order:
    ///   1. Explicit candidate paths passed by the caller (portal home dir,
    ///      site home dir) — DNN passes PortalSettings.HomeDirectoryMapPath,
    ///      Oqtane passes the site PhysicalPath. First match wins.
    ///   2. AppDomain.CurrentDomain.BaseDirectory (app root).
    ///   3. BaseDirectory/App_Data.
    ///   4. BaseDirectory/DesktopModules/MegaForm (DNN install path).
    /// </summary>
    public static class AiFeatureGate
    {
        private const string LockFileName = "dev.lock";

        /// <summary>
        /// The gate every AI surface (controllers, boot scripts, Razor views) must call.
        /// Production licence ⇒ allowed. Otherwise only an unlicensed DEV machine carrying
        /// dev.lock is allowed; a trial install is refused.
        /// </summary>
        public static bool IsAvailable(params string[] extraCandidatePaths)
        {
            try
            {
                if (LicenseService.IsProductionLicensed()) return true;
            }
            catch
            {
                // Licence probe failure must not hand AI to an unlicensed install —
                // fall through to the dev.lock check, which is the safe default.
            }
            return IsEnabled(extraCandidatePaths);
        }

        public static bool IsEnabled(params string[] extraCandidatePaths)
        {
            try
            {
                if (extraCandidatePaths != null)
                {
                    foreach (var dir in extraCandidatePaths)
                    {
                        if (string.IsNullOrWhiteSpace(dir)) continue;
                        if (File.Exists(Path.Combine(dir, LockFileName))) return true;
                    }
                }

                var baseDir = AppDomain.CurrentDomain.BaseDirectory ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(baseDir))
                {
                    if (File.Exists(Path.Combine(baseDir, LockFileName))) return true;
                    if (File.Exists(Path.Combine(baseDir, "App_Data", LockFileName))) return true;
                    if (File.Exists(Path.Combine(baseDir, "DesktopModules", "MegaForm", LockFileName))) return true;
                }
            }
            catch
            {
                // I/O failures fall through to disabled; that's the safe default.
            }
            return false;
        }

        /// <summary>Resolved path of the dev.lock file that enabled the gate, or empty.</summary>
        public static string ResolveActiveLockPath(params string[] extraCandidatePaths)
        {
            try
            {
                if (extraCandidatePaths != null)
                {
                    foreach (var dir in extraCandidatePaths)
                    {
                        if (string.IsNullOrWhiteSpace(dir)) continue;
                        var p = Path.Combine(dir, LockFileName);
                        if (File.Exists(p)) return p;
                    }
                }
                var baseDir = AppDomain.CurrentDomain.BaseDirectory ?? string.Empty;
                if (!string.IsNullOrWhiteSpace(baseDir))
                {
                    var candidates = new[]
                    {
                        Path.Combine(baseDir, LockFileName),
                        Path.Combine(baseDir, "App_Data", LockFileName),
                        Path.Combine(baseDir, "DesktopModules", "MegaForm", LockFileName),
                    };
                    foreach (var p in candidates) if (File.Exists(p)) return p;
                }
            }
            catch { }
            return string.Empty;
        }
    }
}
