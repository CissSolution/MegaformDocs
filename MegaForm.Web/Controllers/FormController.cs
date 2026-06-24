using System.Linq;
using System.Collections.Generic;
using System.Net;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Utilities;
using MegaForm.Core.Services;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// Public form viewer.
    ///   GET /f/{id}          — standalone hosted page
    ///   GET /f/{id}/embed    — iframe-friendly (no chrome)
    ///   GET /f/{id}/preview  — builder preview (same as embed but with "preview" banner)
    /// </summary>
    public class FormController : Controller
    {
        private readonly IFormRepository _formRepo;
        private readonly IModuleSettingsService _moduleSettings;
        private readonly IConfiguration _cfg;

        public FormController(IFormRepository formRepo, IModuleSettingsService moduleSettings, IConfiguration cfg)
        {
            _formRepo = formRepo;
            _moduleSettings = moduleSettings;
            _cfg = cfg;
        }

        // ── GET /f/{id} ────────────────────────────────────────────────────
        [HttpGet("/f/{id:int}")]
        public IActionResult View(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound("Form not found.");
            if (form.Status == "draft")
                return NotFound("This form is not published yet.");

            var vm = BuildViewModel(form, embedMode: false, previewMode: false);
            return View("~/Views/Form/View.cshtml", vm);
        }

        // ── GET /f/{id}/embed ──────────────────────────────────────────────
        [HttpGet("/f/{id:int}/embed")]
        public IActionResult Embed(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound();
            if (form.Status == "draft") return NotFound();

            var vm = BuildViewModel(form, embedMode: true, previewMode: false);
            return View("~/Views/Form/View.cshtml", vm);
        }

        // ── GET /f/{id}/preview ────────────────────────────────────────────
        // Redirects to Theme Designer for consistent rendering engine
        [HttpGet("/f/{id:int}/preview")]
        public IActionResult Preview(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound("Form not found.");
            // Use Theme Designer — same renderer engine as view form
            return Redirect($"/admin/theme-designer?formId={id}&mode=preview");
        }

        // ── GET /f/{id}/view-preview — legacy preview with banner ──────────
        [HttpGet("/f/{id:int}/view-preview")]
        public IActionResult ViewPreview(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound();
            var vm = BuildViewModel(form, embedMode: true, previewMode: true);
            return View("~/Views/Form/View.cshtml", vm);
        }

        // ── Helpers ────────────────────────────────────────────────────────
        private string GetSetting(string moduleKey, string configKey)
        {
            var fromModule = _moduleSettings?.GetSetting(0, moduleKey, "") ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(fromModule)) return fromModule;
            return _cfg?[configKey] ?? string.Empty;
        }

        private string GetSelectedThemePresetKey(FormInfo form)
        {
            if (_moduleSettings == null || form == null || form.ModuleId <= 0) return string.Empty;
            var preferred = _moduleSettings.GetSetting(form.ModuleId, "MegaForm_SelectedThemePresetKey", string.Empty);
            if (!string.IsNullOrWhiteSpace(preferred)) return preferred;
            return _moduleSettings.GetSetting(form.ModuleId, "SelectedThemePresetKey", string.Empty) ?? string.Empty;
        }

        private bool ResolveAutoQrCodeEnabled(FormInfo form, bool embedMode, bool previewMode)
        {
            try
            {
                if (form == null || form.FormId <= 0) return false;
                if (embedMode || previewMode) return false;

                var raw = _moduleSettings?.GetSetting(form.ModuleId, "MegaForm_EnableAutoQrCode", string.Empty) ?? string.Empty;
                if (string.Equals(raw, "false", System.StringComparison.OrdinalIgnoreCase) || string.Equals(raw, "0", System.StringComparison.OrdinalIgnoreCase))
                    return false;
                if (string.Equals(raw, "true", System.StringComparison.OrdinalIgnoreCase) || string.Equals(raw, "1", System.StringComparison.OrdinalIgnoreCase))
                    return true;

                var cfgValue = _cfg?["MegaForm:EnableAutoQrCode"] ?? _cfg?["MegaForm_EnableAutoQrCode"] ?? string.Empty;
                if (string.Equals(cfgValue, "false", System.StringComparison.OrdinalIgnoreCase) || string.Equals(cfgValue, "0", System.StringComparison.OrdinalIgnoreCase))
                    return false;
                if (string.Equals(cfgValue, "true", System.StringComparison.OrdinalIgnoreCase) || string.Equals(cfgValue, "1", System.StringComparison.OrdinalIgnoreCase))
                    return true;

                return true;
            }
            catch
            {
                return false;
            }
        }

        private string BuildQrCodeTargetUrl(FormInfo form)
        {
            try
            {
                if (form == null || form.FormId <= 0) return string.Empty;
                return BuildAbsoluteFormUrl(form.FormId);
            }
            catch
            {
                return string.Empty;
            }
        }

        private string GetFormDefaultLanguage(FormInfo form)
        {
            try
            {
                var schemaObj = string.IsNullOrWhiteSpace(form?.SchemaJson) ? null : JObject.Parse(form.SchemaJson);
                var schemaSettings = schemaObj?["settings"] as JObject;
                var schemaDefault = schemaSettings?["defaultLanguage"] ?? schemaSettings?["DefaultLanguage"];
                var schemaValue = schemaDefault?.ToString();
                if (!string.IsNullOrWhiteSpace(schemaValue)) return schemaValue;
            }
            catch { }

            try
            {
                var settingsObj = string.IsNullOrWhiteSpace(form?.SettingsJson) ? null : JObject.Parse(form.SettingsJson);
                var settingsDefault = settingsObj?["defaultLanguage"] ?? settingsObj?["DefaultLanguage"];
                var settingsValue = settingsDefault?.ToString();
                if (!string.IsNullOrWhiteSpace(settingsValue)) return settingsValue;
            }
            catch { }

            return "en-US";
        }

        private string ResolveRequestLocale(FormInfo form)
        {
            var qLang = Request?.Query["lang"].ToString();
            if (!string.IsNullOrWhiteSpace(qLang)) return qLang;

            var defaultLanguage = GetFormDefaultLanguage(form);
            if (!string.IsNullOrWhiteSpace(defaultLanguage)) return defaultLanguage;

            var accept = Request?.Headers["Accept-Language"].ToString();
            if (!string.IsNullOrWhiteSpace(accept))
            {
                var locale = accept.Split(',')
                    .Select(l => l.Split(';')[0].Trim())
                    .FirstOrDefault(l => !string.IsNullOrWhiteSpace(l) && l.Length >= 2);
                if (!string.IsNullOrWhiteSpace(locale)) return locale;
            }

            return "en-US";
        }


        private string BuildAbsoluteFormUrl(int formId)
        {
            var scheme = Request?.Scheme ?? "https";
            var host = Request?.Host.HasValue == true ? Request.Host.Value : string.Empty;
            return string.IsNullOrWhiteSpace(host)
                ? $"/f/{formId}"
                : $"{scheme}://{host}/f/{formId}";
        }

        private string ToAbsoluteUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;
            if (url.StartsWith("http://") || url.StartsWith("https://")) return url;
            if (url.StartsWith("//")) return $"{(Request?.Scheme ?? "https")}:{url}";
            if (url.StartsWith("/"))
            {
                var host = Request?.Host.HasValue == true ? Request.Host.Value : string.Empty;
                return string.IsNullOrWhiteSpace(host) ? url : $"{(Request?.Scheme ?? "https")}://{host}{url}";
            }
            return url;
        }

        private Dictionary<string, string> GetCustomContentMap(FormInfo form)
        {
            var result = new Dictionary<string, string>(System.StringComparer.OrdinalIgnoreCase);

            void readTokenMap(JObject settingsObj)
            {
                var content = settingsObj?["customContent"] as JObject ?? settingsObj?["CustomContent"] as JObject;
                if (content == null) return;
                foreach (var prop in content.Properties())
                {
                    var value = prop.Value?.ToString();
                    if (!string.IsNullOrWhiteSpace(value)) result[prop.Name] = value;
                }
            }

            try
            {
                var schemaObj = string.IsNullOrWhiteSpace(form?.SchemaJson) ? null : JObject.Parse(form.SchemaJson);
                readTokenMap(schemaObj?["settings"] as JObject);
            }
            catch { }

            try
            {
                var settingsObj = string.IsNullOrWhiteSpace(form?.SettingsJson) ? null : JObject.Parse(form.SettingsJson);
                readTokenMap(settingsObj);
            }
            catch { }

            return result;
        }

        private string TryResolveFirstContentImage(FormInfo form)
        {
            var customContent = GetCustomContentMap(form);
            foreach (var pair in customContent)
            {
                if (!pair.Key.Contains("image", System.StringComparison.OrdinalIgnoreCase) &&
                    !pair.Key.Contains("photo", System.StringComparison.OrdinalIgnoreCase) &&
                    !pair.Key.Contains("preview", System.StringComparison.OrdinalIgnoreCase) &&
                    !pair.Key.Contains("hero", System.StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }
                var candidate = pair.Value?.Trim();
                if (!string.IsNullOrWhiteSpace(candidate))
                {
                    return ToAbsoluteUrl(candidate);
                }
            }
            return null;
        }

        private string TryResolveFirstHtmlImage(FormInfo form)
        {
            string customHtml = string.Empty;
            try
            {
                var schemaObj = string.IsNullOrWhiteSpace(form?.SchemaJson) ? null : JObject.Parse(form.SchemaJson);
                var schemaSettings = schemaObj?["settings"] as JObject;
                customHtml = (schemaObj?["customHtml"] ?? schemaObj?["CustomHtml"] ?? schemaSettings?["customHtml"] ?? schemaSettings?["CustomHtml"])?.ToString() ?? string.Empty;
            }
            catch { }

            if (string.IsNullOrWhiteSpace(customHtml))
            {
                try
                {
                    var settingsObj = string.IsNullOrWhiteSpace(form?.SettingsJson) ? null : JObject.Parse(form.SettingsJson);
                    customHtml = (settingsObj?["customHtml"] ?? settingsObj?["CustomHtml"])?.ToString() ?? string.Empty;
                }
                catch { }
            }

            if (string.IsNullOrWhiteSpace(customHtml)) return null;

            var customContent = GetCustomContentMap(form);
            customHtml = Regex.Replace(customHtml, @"\{\{content:([^}]+)\}\}", m =>
            {
                var key = m.Groups[1].Value.Trim();
                return customContent.TryGetValue(key, out var value) ? value ?? string.Empty : string.Empty;
            }, RegexOptions.IgnoreCase);

            var imgMatch = Regex.Match(customHtml, "<img[^>]+src=[\'\"](?<src>[^\'\"]+)[\'\"]", RegexOptions.IgnoreCase);
            if (!imgMatch.Success) return null;
            var src = imgMatch.Groups["src"].Value?.Trim();
            return string.IsNullOrWhiteSpace(src) ? null : ToAbsoluteUrl(src);
        }

        private string ResolveSocialImageUrl(FormInfo form)
        {
            var direct = TryResolveFirstContentImage(form) ?? TryResolveFirstHtmlImage(form);
            if (!string.IsNullOrWhiteSpace(direct)) return direct;
            return ToAbsoluteUrl($"/f/{form.FormId}/share-image.svg");
        }

        private string BuildShareImageSvg(FormInfo form)
        {
            var title = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(form?.Title) ? "MegaForm" : form.Title.Trim());
            var description = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(form?.Description) ? "Open this form online." : form.Description.Trim());
            if (description.Length > 220) description = description.Substring(0, 217) + "...";
            var badge = WebUtility.HtmlEncode("MegaForm · SocialShareMeta v20260404-04");
            return $@"<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630' role='img' aria-label='{title}'>
  <defs>
    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#0f172a'/>
      <stop offset='55%' stop-color='#334155'/>
      <stop offset='100%' stop-color='#6366f1'/>
    </linearGradient>
    <linearGradient id='accent' x1='0' y1='0' x2='1' y2='0'>
      <stop offset='0%' stop-color='#8b5cf6'/>
      <stop offset='100%' stop-color='#22c55e'/>
    </linearGradient>
  </defs>
  <rect width='1200' height='630' fill='url(#bg)'/>
  <circle cx='1040' cy='120' r='180' fill='rgba(255,255,255,0.08)'/>
  <circle cx='140' cy='540' r='220' fill='rgba(255,255,255,0.05)'/>
  <rect x='70' y='70' width='1060' height='490' rx='32' fill='rgba(255,255,255,0.92)'/>
  <rect x='70' y='70' width='1060' height='12' rx='6' fill='url(#accent)'/>
  <text x='120' y='160' fill='#6366f1' font-family='Arial, Helvetica, sans-serif' font-size='22' font-weight='700' letter-spacing='1.4'>{badge}</text>
  <text x='120' y='250' fill='#0f172a' font-family='Arial, Helvetica, sans-serif' font-size='58' font-weight='800'>{title}</text>
  <foreignObject x='120' y='290' width='920' height='180'>
    <div xmlns='http://www.w3.org/1999/xhtml' style='font-family:Arial, Helvetica, sans-serif;font-size:30px;line-height:1.45;color:#475569;'>
      {description}
    </div>
  </foreignObject>
  <rect x='120' y='472' width='260' height='56' rx='28' fill='#eef2ff'/>
  <text x='150' y='508' fill='#4338ca' font-family='Arial, Helvetica, sans-serif' font-size='24' font-weight='700'>Open form online</text>
</svg>";
        }

        [HttpGet("/f/{id:int}/share-image.svg")]
        public IActionResult ShareImage(int id)
        {
            var form = _formRepo.GetForm(id);
            if (form == null) return NotFound();
            if (form.Status == "draft") return NotFound();
            Response.Headers["Cache-Control"] = "public,max-age=3600";
            return Content(BuildShareImageSvg(form), "image/svg+xml; charset=utf-8");
        }

        private FormViewModel BuildViewModel(FormInfo form, bool embedMode, bool previewMode)
        {
            var defaultLanguage = GetFormDefaultLanguage(form);
            var locale = ResolveRequestLocale(form);
            var canonicalUrl = BuildAbsoluteFormUrl(form.FormId);
            var socialImageUrl = ResolveSocialImageUrl(form);
            var resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
            var selectedPresetThemeKey = GetSelectedThemePresetKey(form);
            var assetManifest = BuildAssetManifest(resolvedRenderModel.SchemaJson ?? "{}");
            var autoQrCodeEnabled = ResolveAutoQrCodeEnabled(form, embedMode, previewMode);
            if (autoQrCodeEnabled && assetManifest.ScriptFiles != null && !assetManifest.ScriptFiles.Any(x =>
                !string.IsNullOrWhiteSpace(x) && string.Equals(Path.GetFileName(x), "megaform-widget-qrcode.js", System.StringComparison.OrdinalIgnoreCase)))
            {
                assetManifest.ScriptFiles.Add("megaform-widget-qrcode.js");
            }
            return new FormViewModel
            {
                FormId          = form.FormId,
                Title           = form.Title ?? "Untitled Form",
                Description     = form.Description ?? "",
                SchemaJson      = resolvedRenderModel.SchemaJson,
                SettingsJson    = resolvedRenderModel.SettingsJson,
                ThemeJson       = form.ThemeJson ?? "{}",
                RulesJson       = form.RulesJson ?? "[]",
                Status          = form.Status ?? "draft",
                SubmitButtonText = resolvedRenderModel.SubmitButtonText,
                SuccessMessage  = resolvedRenderModel.SuccessMessage,
                EnableCaptcha   = form.EnableCaptcha,
                RequireAuth     = form.RequireAuth,
                EmbedMode       = embedMode,
                PreviewMode     = previewMode,
                Locale          = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale,
                DefaultLanguage = string.IsNullOrWhiteSpace(defaultLanguage) ? "en-US" : defaultLanguage,
                CaptchaBadgeVersion = "CaptchaVerify v20260402-08",
                ReCaptchaSiteKey = GetSetting("Captcha_ReCaptcha_SiteKey", "Captcha:ReCaptcha:SiteKey"),
                HCaptchaSiteKey = GetSetting("Captcha_HCaptcha_SiteKey", "Captcha:HCaptcha:SiteKey"),
                CanonicalUrl    = canonicalUrl,
                SocialImageUrl  = socialImageUrl,
                SocialImageWidth = 1200,
                SocialImageHeight = 630,
                SocialShareBadge = "SocialShareMeta v20260404-04",
                AssetSelectionBadge = assetManifest.Badge,
                InitialInlineCss = ThemePresetInlineCssService.Build(resolvedRenderModel.SettingsJson, selectedPresetThemeKey, "#mf-form-wrapper-" + form.FormId),
                PluginScripts = assetManifest.ScriptFiles,
                PluginStyles = assetManifest.StyleFiles,
                AutoQrCodeEnabled = autoQrCodeEnabled,
                AutoQrCodeHtml = autoQrCodeEnabled
                    ? QrCodeCornerHtmlService.BuildAutoCornerHtml(form.FormId, BuildQrCodeTargetUrl(form), "Scan QR code to open on mobile", "QR")
                    : string.Empty,
                AutoQrCodeBadge = "WebAutoQr v20260422-03",
            };
        }

        private static LocalAssetManifest BuildAssetManifest(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };

            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(schemaJson) ?? new FormSchema();
                return BuildAssetManifest(schema);
            }
            catch
            {
                return new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            }
        }

        private static LocalAssetManifest BuildAssetManifest(FormSchema schema)
        {
            var manifest = new LocalAssetManifest { Badge = "CoreAssetManifest v20260505-06" };
            if (schema?.Fields == null || schema.Fields.Count == 0)
                return manifest;

            var scripts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var styles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var flatFields = MegaFormUtils.FlattenFields(schema.Fields);

            foreach (var field in flatFields)
            {
                var type = (field?.Type ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(type))
                    continue;

                switch (type.ToLowerInvariant())
                {
                    case "repeater":
                        AddAsset(scripts, styles, "megaform-widget-repeater.js", "megaform-widget-repeater.css");
                        break;
                    case "signature":
                        AddAsset(scripts, styles, "megaform-widget-signature.js", "megaform-widget-signature.css");
                        break;
                    case "calculator":
                        AddAsset(scripts, styles, "megaform-widget-calculator.js", "megaform-widget-calculator.css");
                        break;
                    case "rating":
                    case "likert":
                    case "nps":
                    case "opinionscale":
                    case "ranking":
                        AddAsset(scripts, styles, "megaform-widget-rating-suite.js", "megaform-widget-rating-suite.css");
                        break;
                    case "imagechoice":
                        AddScript(scripts, "megaform-widget-image-choice.js");
                        break;
                    case "advancedfile":
                        AddAsset(scripts, styles, "megaform-widget-advanced-file.js", "megaform-widget-advanced-file.css");
                        break;
                    case "richtext":
                        AddAsset(scripts, styles, "megaform-widget-rich-text.js", "megaform-widget-rich-text.css");
                        break;
                    case "payment":
                    case "paymentsummary":
                    case "paypal":
                    case "stripe":
                    case "square":
                        AddPaymentAssets(field, scripts, styles);
                        break;
                    case "appointment":
                        AddScript(scripts, "megaform-widget-appointment.js");
                        break;
                    case "geolocation":
                        AddScript(scripts, "megaform-widget-geolocation.js");
                        break;
                    case "infinitelist":
                        AddAsset(scripts, styles, "megaform-widget-infinite-list.js", "megaform-widget-infinite-list.css");
                        break;
                    case "productlineitems":
                        AddAsset(scripts, styles, "megaform-widget-product-line-items.js", "megaform-widget-product-line-items.css");
                        break;
                    case "drawonimage":
                        AddAsset(scripts, styles, "megaform-widget-draw-on-image.js", "megaform-widget-draw-on-image.css");
                        break;
                    case "videoembed":
                        AddAsset(scripts, styles, "megaform-widget-video-embed.js", "megaform-widget-video-embed.css");
                        break;
                    case "gridrepeater":
                        AddAsset(scripts, styles, "megaform-widget-grid-repeater.js", "megaform-widget-grid-repeater.css");
                        break;
                    case "pdfform":
                        AddAsset(scripts, styles, "megaform-widget-pdf-form.js", "megaform-widget-pdf-form.css");
                        break;
                    case "phonenumberpro":
                        AddAsset(scripts, styles, "megaform-widget-phone-pro.js", "megaform-widget-phone-pro.css");
                        break;
                    case "captcha":
                        AddScript(scripts, "megaform-widget-captcha.js");
                        break;
                    case "qrcode":
                    case "qr":
                        AddScript(scripts, "megaform-widget-qrcode.js");
                        break;
                }
            }

            manifest.ScriptFiles = scripts.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            manifest.StyleFiles = styles.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
            return manifest;
        }

        private static void AddPaymentAssets(FormField field, HashSet<string> scripts, HashSet<string> styles)
        {
            AddStyle(styles, "megaform-widget-payment.css");
            AddScript(scripts, "megaform-widget-payment-unified.js");

            var provider = GetWidgetProp(field, "provider");
            provider = string.IsNullOrWhiteSpace(provider) ? "both" : provider.Trim().ToLowerInvariant();
            var loadStripe = provider == "both" || provider == "stripe" || provider == "card" || provider == "all";
            var loadPaypal = provider == "both" || provider == "paypal" || provider == "all";

            if (loadStripe)
                AddAsset(scripts, styles, "megaform-widget-stripe.js", "megaform-widget-stripe.css");
            if (loadPaypal)
                AddAsset(scripts, styles, "megaform-widget-paypal.js", "megaform-widget-paypal.css");
        }

        private static string GetWidgetProp(FormField field, string key)
        {
            if (field?.WidgetProps == null || string.IsNullOrWhiteSpace(key))
                return null;

            foreach (var kv in field.WidgetProps)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                    return kv.Value?.ToString();
            }
            return null;
        }

        private static void AddAsset(HashSet<string> scripts, HashSet<string> styles, string scriptFile, string styleFile)
        {
            AddScript(scripts, scriptFile);
            AddStyle(styles, styleFile);
        }

        private static void AddScript(HashSet<string> scripts, string scriptFile)
        {
            if (!string.IsNullOrWhiteSpace(scriptFile))
                scripts.Add(scriptFile);
        }

        private static void AddStyle(HashSet<string> styles, string styleFile)
        {
            if (!string.IsNullOrWhiteSpace(styleFile))
                styles.Add(styleFile);
        }


        private sealed class LocalAssetManifest
        {
            public string Badge { get; set; }
            public List<string> ScriptFiles { get; set; } = new List<string>();
            public List<string> StyleFiles { get; set; } = new List<string>();
        }

    }

    /// <summary>View model passed to Form/View.cshtml</summary>
    public class FormViewModel
    {
        public int    FormId          { get; set; }
        public string Title           { get; set; }
        public string Description     { get; set; }
        public string SchemaJson      { get; set; }
        public string SettingsJson    { get; set; }
        public string ThemeJson       { get; set; }
        public string RulesJson       { get; set; }
        public string Status          { get; set; }
        public string SubmitButtonText{ get; set; }
        public string SuccessMessage  { get; set; }
        public bool   EnableCaptcha   { get; set; }
        public bool   RequireAuth     { get; set; }
        public bool   EmbedMode       { get; set; }
        public bool   PreviewMode     { get; set; }
        public string Locale          { get; set; } = "en-US";
        public string DefaultLanguage { get; set; } = "en-US";
        public string CaptchaBadgeVersion { get; set; }
        public string ReCaptchaSiteKey { get; set; }
        public string HCaptchaSiteKey { get; set; }
        public string CanonicalUrl { get; set; }
        public string SocialImageUrl { get; set; }
        public int SocialImageWidth { get; set; } = 1200;
        public int SocialImageHeight { get; set; } = 630;
        public string SocialShareBadge { get; set; }
        public string AssetSelectionBadge { get; set; }
        public string InitialInlineCss { get; set; }
        public List<string> PluginScripts { get; set; } = new List<string>();
        public List<string> PluginStyles { get; set; } = new List<string>();
        public bool AutoQrCodeEnabled { get; set; }
        public string AutoQrCodeHtml { get; set; }
        public string AutoQrCodeBadge { get; set; }
    }
}
