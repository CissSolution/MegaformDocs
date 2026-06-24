using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Resolves the minimal widget plugin asset list required to render a form.
    /// Shared by Web, DNN and Oqtane.
    /// </summary>
    public class FormAssetManifestService
    {
        public const string Badge = "CoreAssetManifest v20260505-06";

        public FormAssetManifest Build(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson))
                return new FormAssetManifest { Badge = Badge };

            try
            {
                var schema = JsonConvert.DeserializeObject<FormSchema>(schemaJson) ?? new FormSchema();
                return Build(schema);
            }
            catch
            {
                return new FormAssetManifest { Badge = Badge };
            }
        }

        public FormAssetManifest Build(FormSchema schema)
        {
            var manifest = new FormAssetManifest { Badge = Badge };
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
                        Add(scripts, styles, "megaform-widget-repeater.js", "megaform-widget-repeater.css");
                        break;
                    case "signature":
                        Add(scripts, styles, "megaform-widget-signature.js", "megaform-widget-signature.css");
                        break;
                    case "calculator":
                        Add(scripts, styles, "megaform-widget-calculator.js", "megaform-widget-calculator.css");
                        break;
                    case "rating":
                    case "opinionscale":
                    case "ranking":
                        Add(scripts, styles, "megaform-widget-rating-suite.js", "megaform-widget-rating-suite.css");
                        break;
                    case "dynamiclabel":
                        Add(scripts, styles, "megaform-widget-dynamic-label.js", "megaform-widget-dynamic-label.css");
                        break;
                    case "razor":
                        Add(scripts, styles, "megaform-widget-razor.js", "megaform-widget-razor.css");
                        break;
                    case "imagechoice":
                        AddScript(scripts, "megaform-widget-image-choice.js");
                        break;
                    case "advancedfile":
                        Add(scripts, styles, "megaform-widget-advanced-file.js", "megaform-widget-advanced-file.css");
                        break;
                    case "richtext":
                        Add(scripts, styles, "megaform-widget-rich-text.js", "megaform-widget-rich-text.css");
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
                        Add(scripts, styles, "megaform-widget-infinite-list.js", "megaform-widget-infinite-list.css");
                        break;
                    case "productlineitems":
                        Add(scripts, styles, "megaform-widget-product-line-items.js", "megaform-widget-product-line-items.css");
                        break;
                    case "drawonimage":
                        Add(scripts, styles, "megaform-widget-draw-on-image.js", "megaform-widget-draw-on-image.css");
                        break;
                    case "videoembed":
                        Add(scripts, styles, "megaform-widget-video-embed.js", "megaform-widget-video-embed.css");
                        break;
                    case "gridrepeater":
                        Add(scripts, styles, "megaform-widget-grid-repeater.js", "megaform-widget-grid-repeater.css");
                        break;
                    case "phonenumberpro":
                        Add(scripts, styles, "megaform-widget-phone-pro.js", "megaform-widget-phone-pro.css");
                        break;
                    case "pdfform":
                        Add(scripts, styles, "megaform-widget-pdf-form.js", "megaform-widget-pdf-form.css");
                        break;
                    case "contentslider":
                        AddScript(scripts, "megaform-widget-content-slider.js");
                        break;
                    case "captcha":
                        AddScript(scripts, "megaform-widget-captcha.js");
                        break;
                    case "qrcode":
                    case "qr":
                    case "qr code":
                    case "qr_code":
                    case "qr-code":
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
            Add(scripts, styles, "megaform-widget-payment.js", "megaform-widget-payment.css");
            AddScript(scripts, "megaform-widget-payment-unified.js");

            var provider = GetWidgetProp(field, "provider")?.Trim().ToLowerInvariant() ?? "both";
            var loadStripe = provider == "both" || provider == "stripe" || provider == "card" || provider == "all";
            var loadPaypal = provider == "both" || provider == "paypal" || provider == "all";

            if (loadStripe)
                Add(scripts, styles, "megaform-widget-stripe.js", "megaform-widget-stripe.css");
            if (loadPaypal)
                Add(scripts, styles, "megaform-widget-paypal.js", "megaform-widget-paypal.css");
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

        private static void Add(HashSet<string> scripts, HashSet<string> styles, string scriptFile, string styleFile)
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
    }
}
