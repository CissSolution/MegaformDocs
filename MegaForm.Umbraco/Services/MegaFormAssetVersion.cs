using System;
using System.IO;
using System.Reflection;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Cache-busting token appended to every MegaForm script and stylesheet URL.
    ///
    /// Why it has to exist: the builder loader derives the version it puts on
    /// megaform-builder.js from its OWN <c>?v=</c>. The Umbraco views referenced the loader
    /// with no query at all, so that lookup fell through to a constant compiled into the
    /// loader — meaning the bundle was always requested at the same URL. The responses carry
    /// only ETag/Last-Modified, so a browser is free to reuse its copy without asking, and it
    /// does: a builder fix shipped today reached a browser that had opened the builder before
    /// only after a manual hard reload. Measured on this host — the Reorder button was present
    /// in the file being served and absent in an open tab.
    ///
    /// The value is the build time of this assembly, which ships alongside wwwroot, so every
    /// real deployment changes it exactly once.
    /// </summary>
    public static class MegaFormAssetVersion
    {
        private static readonly Lazy<string> _value = new Lazy<string>(Compute);
        private static Microsoft.Extensions.FileProviders.IFileProvider _files;

        /// <summary>
        /// Hands over the web root file provider so the token can follow the ASSETS.
        /// The assembly timestamp alone is not enough: a JS/CSS-only deploy (rebuild the
        /// bundle, sync it into wwwroot) leaves MegaForm.Umbraco.dll untouched, so the token
        /// would not move and browsers would keep the previous file. Measured exactly that —
        /// DLL 20:59, megaform-builder-ts.css 21:53, and the fixed CSS never reached a browser
        /// that had already loaded the page once.
        /// </summary>
        public static void UseFileProvider(Microsoft.Extensions.FileProviders.IFileProvider files)
        {
            _files = files;
        }

        /// <summary>Assets whose change must bust the cache; paths are relative to the web root.</summary>
        private static readonly string[] TrackedAssets =
        {
            "App_Plugins/MegaForm/js/bundles/megaform-builder.js",
            "App_Plugins/MegaForm/js/megaform-builder-loader.js",
            "App_Plugins/MegaForm/css/megaform-builder-ts.css",
            "App_Plugins/MegaForm/css/megaform-builder-shell.css",
        };

        public static string Value => _value.Value;

        private static string Compute()
        {
            var newest = DateTimeOffset.MinValue;

            try
            {
                if (_files != null)
                {
                    foreach (var path in TrackedAssets)
                    {
                        var info = _files.GetFileInfo(path);
                        if (info != null && info.Exists && info.LastModified > newest)
                            newest = info.LastModified;
                    }
                }
            }
            catch
            {
                // Fall through to the assembly timestamp below.
            }

            if (newest > DateTimeOffset.MinValue)
                return newest.UtcDateTime.ToString("yyyyMMddHHmmss");

            try
            {
                var assembly = typeof(MegaFormAssetVersion).Assembly;

                // Assembly.Location is empty for assemblies loaded from a byte[] — that is how
                // Oqtane loads modules, and the same code is shared, so never assume a path.
                var location = assembly.Location;
                if (!string.IsNullOrEmpty(location) && File.Exists(location))
                    return File.GetLastWriteTimeUtc(location).ToString("yyyyMMddHHmmss");

                var informational = assembly
                    .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
                if (!string.IsNullOrWhiteSpace(informational))
                    return Sanitize(informational);

                var version = assembly.GetName().Version;
                if (version != null) return Sanitize(version.ToString());
            }
            catch
            {
                // A cache-bust token is never worth failing a page render over.
            }

            return "0";
        }

        private static string Sanitize(string raw)
        {
            var chars = raw.ToCharArray();
            for (var i = 0; i < chars.Length; i++)
            {
                if (!char.IsLetterOrDigit(chars[i]) && chars[i] != '.' && chars[i] != '-')
                    chars[i] = '-';
            }
            return new string(chars);
        }
    }
}
