using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using MegaForm.Core.i18n;
using Umbraco.Cms.Core.Models.PublishedContent;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco implementation of the MegaForm localization provider.
    /// Resolves locale from Umbraco's variation context first, then query string,
    /// Accept-Language header, and falls back to en-US.
    /// Strings are merged from the built-in package assets (read-only) and user
    /// overrides stored under App_Data/MegaForm/i18n.
    /// </summary>
    public class UmbracoLocalizationProvider : ILocalizationProvider
    {
        private readonly Dictionary<string, string> _strings;
        private readonly DefaultLocalizationProvider _fallback = new DefaultLocalizationProvider();

        public string CurrentLocale { get; }

        public UmbracoLocalizationProvider(
            IHttpContextAccessor http,
            IWebHostEnvironment env,
            IVariationContextAccessor variationContextAccessor = null)
        {
            CurrentLocale = ResolveLocale(http, variationContextAccessor);
            _strings = LoadStrings(env, CurrentLocale);
        }

        public string L(string key, object param = null)
        {
            string str = _strings.TryGetValue(key, out var v) ? v : _fallback.L(key);
            if (param != null)
            {
                foreach (var prop in param.GetType().GetProperties())
                    str = str.Replace("{" + prop.Name + "}", prop.GetValue(param)?.ToString() ?? "");
            }
            return str;
        }

        private static string ResolveLocale(IHttpContextAccessor http, IVariationContextAccessor variationContextAccessor)
        {
            // 1. Use Umbraco's current variation culture when available (most native).
            var variationCulture = variationContextAccessor?.VariationContext?.Culture;
            if (!string.IsNullOrWhiteSpace(variationCulture))
                return variationCulture;

            var ctx = http.HttpContext;
            if (ctx == null) return "en-US";

            // 2. Explicit query string override.
            var qLang = ctx.Request.Query["lang"].ToString();
            if (!string.IsNullOrEmpty(qLang)) return qLang;

            // 3. Browser language preference.
            var accept = ctx.Request.Headers["Accept-Language"].ToString();
            if (!string.IsNullOrEmpty(accept))
            {
                var locale = accept.Split(',')
                    .Select(l => l.Split(';')[0].Trim())
                    .FirstOrDefault(l => l.Length >= 2);
                if (!string.IsNullOrEmpty(locale)) return locale;
            }

            return "en-US";
        }

        private static Dictionary<string, string> LoadStrings(IWebHostEnvironment env, string locale)
        {
            var result = new Dictionary<string, string>();

            // Built-in package assets are read-only and shipped with the RCL.
            var builtInProvider = env.WebRootFileProvider;
            TryLoad(builtInProvider, "App_Plugins/MegaForm/js/i18n", "en-US", result);
            if (!locale.StartsWith("en", StringComparison.OrdinalIgnoreCase))
                TryLoad(builtInProvider, "App_Plugins/MegaForm/js/i18n", locale, result);

            // User overrides live under App_Data and win over built-ins.
            var userBasePath = MegaFormUmbracoPaths.GetI18nPath(env);
            TryLoad(userBasePath, "en-US", result);
            if (!locale.StartsWith("en", StringComparison.OrdinalIgnoreCase))
                TryLoad(userBasePath, locale, result);

            return result;
        }

        private static void TryLoad(IFileProvider provider, string subPath, string locale, Dictionary<string, string> target)
        {
            if (provider == null) return;
            var fileInfo = provider.GetFileInfo($"{subPath}/{locale}.json");
            if (!fileInfo.Exists) return;
            try
            {
                using var stream = fileInfo.CreateReadStream();
                using var reader = new StreamReader(stream, System.Text.Encoding.UTF8);
                var json = reader.ReadToEnd();
                MergeJson(json, target);
            }
            catch { /* ignore malformed files */ }
        }

        private static void TryLoad(string basePath, string locale, Dictionary<string, string> target)
        {
            if (string.IsNullOrWhiteSpace(basePath)) return;
            var candidates = new[]
            {
                Path.Combine(basePath, $"{locale}.json"),
                Path.Combine(basePath, $"{locale.Split('-')[0]}.json"),
            };
            foreach (var path in candidates)
            {
                if (!File.Exists(path)) continue;
                try
                {
                    MergeJson(File.ReadAllText(path), target);
                    return;
                }
                catch { /* ignore malformed files */ }
            }
        }

        private static void MergeJson(string json, Dictionary<string, string> target)
        {
            var data = Newtonsoft.Json.JsonConvert.DeserializeObject<Dictionary<string, string>>(json);
            if (data != null)
            {
                foreach (var kv in data)
                    target[kv.Key] = kv.Value;
            }
        }
    }
}
