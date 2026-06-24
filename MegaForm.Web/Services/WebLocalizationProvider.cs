using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using MegaForm.Core.i18n;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// ASP.NET Core implementation — lấy locale từ:
    ///   1. Query param ?lang=ja-JP  (override tường minh)
    ///   2. HTTP header Accept-Language
    ///   3. Fallback: en-US
    ///
    /// File JSON đặt tại:  wwwroot/megaform/i18n/{locale}.json
    /// Có thể thay bằng CDN hoặc embedded resources.
    /// </summary>
    public class WebLocalizationProvider : JsonLocalizationProvider
    {
        private static string ResolveLocale(IHttpContextAccessor http)
        {
            var ctx = http.HttpContext;
            if (ctx == null) return "en-US";

            // Query param override
            var qLang = ctx.Request.Query["lang"].ToString();
            if (!string.IsNullOrEmpty(qLang)) return qLang;

            // Accept-Language header — lấy locale có q cao nhất
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

        private static string GetI18nPath(IWebHostEnvironment env)
        {
            return Path.Combine(env.WebRootPath ?? "", "megaform", "i18n");
        }

        public WebLocalizationProvider(IHttpContextAccessor http, IWebHostEnvironment env)
            : base(GetI18nPath(env), ResolveLocale(http)) { }
    }
}
