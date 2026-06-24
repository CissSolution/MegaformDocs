using System;
using System.Collections.Generic;
using System.Net;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared helper that renders the same QR corner shell used by the QRCode widget plugin,
    /// but without requiring each form schema to include a QR widget field.
    /// Host layers can inject this markup when a module/page setting enables auto QR.
    /// </summary>
    public static class QrCodeCornerHtmlService
    {
        public static string BuildAutoCornerHtml(int formId, string urlOverride, string label = "Scan QR code to open on mobile", string triggerLabel = "QR")
        {
            var props = new Dictionary<string, object>
            {
                ["size"] = 176,
                ["label"] = string.IsNullOrWhiteSpace(label) ? "Scan QR code to open on mobile" : label,
                ["showUrl"] = false,
                ["urlOverride"] = string.IsNullOrWhiteSpace(urlOverride) ? string.Empty : urlOverride.Trim(),
                ["errorLevel"] = "M",
                ["quietZone"] = 4,
                ["darkColor"] = "#111111",
                ["lightColor"] = "#ffffff",
                ["showCopyButton"] = true,
                ["copyButtonLabel"] = "Copy link",
                ["triggerLabel"] = string.IsNullOrWhiteSpace(triggerLabel) ? "QR" : triggerLabel
            };

            var propsJson = WebUtility.HtmlEncode(JsonConvert.SerializeObject(props));
            var uid = "mf-qr-auto-" + Math.Max(0, formId);

            return string.Concat(
                "<div class=\"mf-qr-corner\" id=\"", WebUtility.HtmlEncode(uid),
                "\" data-mf-auto-qr=\"1\" data-formid=\"", Math.Max(0, formId).ToString(),
                "\" data-props=\"", propsJson, "\">",
                    "<button type=\"button\" class=\"mf-qr-corner-trigger\" aria-haspopup=\"true\" aria-expanded=\"false\" title=\"Show QR code\">",
                        "<svg class=\"mf-qr-corner-icon\" viewBox=\"0 0 20 20\" fill=\"currentColor\" aria-hidden=\"true\">",
                            "<rect x=\"1\" y=\"1\" width=\"7\" height=\"7\" rx=\"1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
                            "<rect x=\"3\" y=\"3\" width=\"3\" height=\"3\"/>",
                            "<rect x=\"12\" y=\"1\" width=\"7\" height=\"7\" rx=\"1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
                            "<rect x=\"14\" y=\"3\" width=\"3\" height=\"3\"/>",
                            "<rect x=\"1\" y=\"12\" width=\"7\" height=\"7\" rx=\"1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/>",
                            "<rect x=\"3\" y=\"14\" width=\"3\" height=\"3\"/>",
                            "<rect x=\"12\" y=\"12\" width=\"2\" height=\"2\"/><rect x=\"15\" y=\"12\" width=\"2\" height=\"2\"/>",
                            "<rect x=\"18\" y=\"12\" width=\"2\" height=\"2\"/><rect x=\"12\" y=\"15\" width=\"2\" height=\"2\"/>",
                            "<rect x=\"15\" y=\"15\" width=\"2\" height=\"2\"/><rect x=\"12\" y=\"18\" width=\"2\" height=\"2\"/>",
                            "<rect x=\"15\" y=\"18\" width=\"5\" height=\"2\"/>",
                        "</svg>",
                        "<span class=\"mf-qr-corner-trigger-text\">", WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(triggerLabel) ? "QR" : triggerLabel), "</span>",
                    "</button>",
                    "<div class=\"mf-qr-corner-popup\" role=\"tooltip\" aria-hidden=\"true\">",
                        "<div class=\"mf-qr-corner-canvas-wrap\">",
                            "<canvas class=\"mf-qr-corner-canvas\" width=\"176\" height=\"176\"></canvas>",
                            "<div class=\"mf-qr-corner-boot\"><span class=\"mf-qr-corner-spinner\"></span></div>",
                        "</div>",
                        "<div class=\"mf-qr-corner-label\">", WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(label) ? "Scan QR code to open on mobile" : label), "</div>",
                        "<button type=\"button\" class=\"mf-qr-corner-copy\" data-qr-copy=\"1\">",
                            "<svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">",
                                "<rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/>",
                                "<path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/>",
                            "</svg>Copy link",
                        "</button>",
                    "</div>",
                "</div>");
        }
    }
}
