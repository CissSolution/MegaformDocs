using System;
using System.IO;
using Microsoft.Extensions.Hosting;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Centralizes physical path resolution for MegaForm on Umbraco.
    /// All runtime-writable data lives under App_Data/MegaForm so that
    /// package static assets under App_Plugins remain read-only.
    /// </summary>
    public static class MegaFormUmbracoPaths
    {
        public const string AppDataMegaForm = "App_Data" + "/" + "MegaForm";
        public const string I18nRelative = AppDataMegaForm + "/" + "i18n";
        public const string UserTemplatesRelative = AppDataMegaForm + "/" + "UserTemplates";
        public const string BuilderTemplatesRelative = AppDataMegaForm + "/" + "Templates";
        public const string PrivateUploadsRelative = AppDataMegaForm + "/" + "PrivateUploads";
        public const string TempUploadsRelative = AppDataMegaForm + "/" + "TempUploads";
        public const string DevLockFileName = "dev.lock";

        /// <summary>
        /// Resolves a virtual path (starting with ~/) against the host content root.
        /// If the input is null/empty, returns the content root itself.
        /// </summary>
        public static string MapContentRoot(IHostEnvironment env, string virtualPath)
        {
            if (env == null) throw new ArgumentNullException(nameof(env));
            var root = env.ContentRootPath ?? AppContext.BaseDirectory;
            if (string.IsNullOrWhiteSpace(virtualPath))
                return root;

            var normalized = virtualPath
                .Replace('~', ' ')
                .Trim()
                .TrimStart('/', '\\')
                .Replace('/', Path.DirectorySeparatorChar);

            return Path.Combine(root, normalized);
        }

        public static string GetContentRoot(IHostEnvironment env)
            => env?.ContentRootPath ?? AppContext.BaseDirectory;

        public static string GetI18nPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), I18nRelative.Replace('/', Path.DirectorySeparatorChar));

        public static string GetUserTemplatesPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), UserTemplatesRelative.Replace('/', Path.DirectorySeparatorChar));

        public static string GetBuilderTemplatesPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), BuilderTemplatesRelative.Replace('/', Path.DirectorySeparatorChar));

        public static string GetPrivateUploadsPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), PrivateUploadsRelative.Replace('/', Path.DirectorySeparatorChar));

        public static string GetTempUploadsPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), TempUploadsRelative.Replace('/', Path.DirectorySeparatorChar));

        public static string GetDevLockPath(IHostEnvironment env)
            => Path.Combine(GetContentRoot(env), DevLockFileName);

        /// <summary>
        /// Builds a relative URL for static package assets under /App_Plugins/MegaForm.
        /// </summary>
        public static string AppPluginsAsset(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath))
                return "/App_Plugins/MegaForm";
            var trimmed = relativePath.TrimStart('/', '\\').Replace('\\', '/');
            return $"/App_Plugins/MegaForm/{trimmed}";
        }
    }
}
