using System;
using System.IO;

namespace MegaForm.Core.Services.AiAssistant
{
    /// <summary>
    /// Canonical gate that decides whether the MegaForm AI Form Assistant is
    /// available on the current install. The product policy (set by the
    /// project owner 2026-05-27) is that AI features ship dark and only
    /// activate when a developer drops a `dev.lock` marker file at a
    /// well-known location — same convention MegaForm already uses for the
    /// builder's HasDevLock / HasDemoLock toggles.
    ///
    /// Both DNN (FormView.ascx.cs + AiAssistantController) and Oqtane
    /// (Index.razor + AiAssistantController) MUST call IsEnabled() before
    /// rendering UI or returning data, so the gate stays consistent.
    ///
    /// Search order:
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
