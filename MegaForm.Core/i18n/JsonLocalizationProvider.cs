using System;
using System.Collections.Generic;
using System.IO;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

namespace MegaForm.Core.i18n
{
    /// <summary>
    /// Load locale từ file JSON — dùng cho MegaForm.Web và Oqtane.
    ///
    /// File convention:
    ///   {basePath}/en-US.json  (fallback)
    ///   {basePath}/es-ES.json
    ///   {basePath}/ja-JP.json
    ///   {basePath}/ko-KR.json
    ///   {basePath}/vi-VN.json
    ///   {basePath}/zh-CN.json
    ///
    /// Lấy locale từ:
    ///   1. Request header Accept-Language (set bởi WebLocalizationProvider)
    ///   2. Constructor param
    ///   3. Fallback: en-US
    /// </summary>
    public class JsonLocalizationProvider : ILocalizationProvider
    {
        private readonly Dictionary<string, string> _strings;
        private readonly DefaultLocalizationProvider _fallback = new DefaultLocalizationProvider();

        public string CurrentLocale { get; }

        public JsonLocalizationProvider(string basePath, string locale)
        {
            CurrentLocale = locale;
            _strings = LoadStrings(basePath, locale);
        }

        private static Dictionary<string, string> LoadStrings(string basePath, string locale)
        {
            var result = new Dictionary<string, string>();

            // Load en-US làm base
            TryLoad(basePath, "en-US", result);

            // Nếu locale khác en-US, load overlay lên trên
            if (!locale.StartsWith("en"))
                TryLoad(basePath, locale, result);

            return result;
        }

        private static void TryLoad(string basePath, string locale, Dictionary<string, string> target)
        {
            // Thử exact match trước, rồi thử language code (vd: "ja" cho "ja-JP")
            var candidates = new[] {
                Path.Combine(basePath, $"{locale}.json"),
                Path.Combine(basePath, $"{locale.Split('-')[0]}.json"),
            };
            foreach (var path in candidates)
            {
                if (!File.Exists(path)) continue;
                try
                {
                    var json = File.ReadAllText(path);
                    var data = JsonConvert.DeserializeObject<Dictionary<string, string>>(json);
                    if (data != null)
                        foreach (var kv in data) target[kv.Key] = kv.Value;
                    return;
                }
                catch { /* ignore malformed files */ }
            }
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
    }
}