using System;
using System.IO;
using System.Net;
using System.Reflection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    public class ThemeDesignerHostRenderer : IThemeDesignerHostRenderer
    {
        private const string ResourceName = "MegaForm.Core.Templates.ThemeDesignerHost.html";
        private static string _templateCache;
        private static readonly object SyncRoot = new object();

        public string Render(ThemeDesignerHostOptions options)
        {
            if (options == null)
                options = new ThemeDesignerHostOptions();

            var template = GetTemplate();
            return template
                .Replace("{{FORM_ID}}", options.FormId.ToString())
                .Replace("{{API_BASE_URL}}", Encode(options.ApiBaseUrl))
                .Replace("{{RETURN_URL}}", Encode(options.ReturnUrl))
                .Replace("{{CSS_URL}}", Encode(options.CssUrl))
                .Replace("{{JS_URL}}", Encode(options.JsUrl))
                .Replace("{{INSPECTOR_JS_URL}}", Encode(options.InspectorJsUrl));
        }

        private static string GetTemplate()
        {
            if (!string.IsNullOrEmpty(_templateCache))
                return _templateCache;

            lock (SyncRoot)
            {
                if (!string.IsNullOrEmpty(_templateCache))
                    return _templateCache;

                var assembly = typeof(ThemeDesignerHostRenderer).GetTypeInfo().Assembly;
                using (var stream = assembly.GetManifestResourceStream(ResourceName))
                {
                    if (stream == null)
                        throw new InvalidOperationException("Missing embedded resource: " + ResourceName);

                    using (var reader = new StreamReader(stream))
                    {
                        _templateCache = reader.ReadToEnd();
                    }
                }

                return _templateCache;
            }
        }

        private static string Encode(string value)
        {
            return WebUtility.HtmlEncode(value ?? string.Empty);
        }
    }
}
