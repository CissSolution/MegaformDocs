using System;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using Oqtane.Models;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// [PAY-2 v20260712] Payment Settings endpoints for Oqtane — same dashboard
    /// contract as Web (api/MegaForm/ModuleConfig/PaymentSettings) and DNN.
    /// Before this file Oqtane had NO way to store gateway keys, which is why
    /// it had no payment backend. Keys live in the Oqtane Setting table on the
    /// Site entity; secrets are IsPrivate and returned masked.
    /// Auth: [Authorize] + explicit Admin/Host gate — a plain authorized user
    /// must not be able to read or replace the site's Stripe keys.
    /// </summary>
    public partial class MegaFormController
    {
        [HttpGet("ModuleConfig/PaymentSettings")]
        [Authorize]
        public IActionResult GetPaymentSettings()
        {
            if (!IsPaymentSettingsAdmin()) return Forbid();
            int siteId = ResolvePaymentSiteId();

            string Mask(string v) => string.IsNullOrWhiteSpace(v) ? "" : (v.Length > 8 ? v.Substring(0, 8) + "…" : "****");
            string Get(string key)
            {
                try { return _settings.GetSetting(EntityNames.Site, siteId, key)?.SettingValue ?? string.Empty; }
                catch { return string.Empty; }
            }

            var sk = Get("Payment_Stripe_SecretKey");
            var ppC = Get("Payment_PayPal_ClientId");
            var ppS = Get("Payment_PayPal_ClientSecret");
            var mode = Get("Payment_PayPal_Mode");
            return Ok(new
            {
                stripeEnabled = Get("Payment_Stripe_Enabled") == "1",
                stripePublishableKey = Get("Payment_Stripe_PublishableKey"),
                stripeSecretKeyMasked = Mask(sk),
                stripeSecretKeySaved = !string.IsNullOrWhiteSpace(sk),
                paypalEnabled = Get("Payment_PayPal_Enabled") == "1",
                paypalMode = string.IsNullOrWhiteSpace(mode) ? "sandbox" : mode,
                paypalClientId = ppC,
                paypalClientSecretMasked = Mask(ppS),
                paypalClientSecretSaved = !string.IsNullOrWhiteSpace(ppS),
            });
        }

        [HttpPost("ModuleConfig/PaymentSettings")]
        [Authorize]
        public IActionResult SavePaymentSettings([FromBody] JsonElement bodyElement)
        {
            if (!IsPaymentSettingsAdmin()) return Forbid();
            // STJ cannot bind a Newtonsoft JObject on Oqtane (no AddNewtonsoftJson)
            // — a JObject parameter would arrive null and every save would 400.
            JObject body = null;
            if (bodyElement.ValueKind != JsonValueKind.Undefined && bodyElement.ValueKind != JsonValueKind.Null)
            {
                var raw = bodyElement.GetRawText();
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    try { body = JObject.Parse(raw); } catch { body = null; }
                }
            }
            if (body == null) return BadRequest(new { error = "Request body is empty or not valid JSON." });
            int siteId = ResolvePaymentSiteId();

            void Save(string key, string value, bool isPrivate)
            {
                var existing = _settings.GetSetting(EntityNames.Site, siteId, key);
                if (existing == null)
                {
                    _settings.AddSetting(new Setting
                    {
                        EntityName = EntityNames.Site,
                        EntityId = siteId,
                        SettingName = key,
                        SettingValue = value ?? string.Empty,
                        IsPrivate = isPrivate
                    });
                }
                else
                {
                    existing.SettingValue = value ?? string.Empty;
                    existing.IsPrivate = isPrivate;
                    _settings.UpdateSetting(existing);
                }
            }
            void SaveIfSet(string key, string jsonKey, bool isPrivate)
            {
                var v = body.Value<string>(jsonKey);
                if (v != null) Save(key, v.Trim(), isPrivate);
            }
            void SaveBool(string key, string jsonKey)
            {
                var v = body[jsonKey];
                if (v != null && v.Type == JTokenType.Boolean) Save(key, v.Value<bool>() ? "1" : "0", false);
            }

            SaveBool("Payment_Stripe_Enabled", "stripeEnabled");
            SaveIfSet("Payment_Stripe_PublishableKey", "stripePublishableKey", false);
            // Masked round-trips ("sk_live_a…") must not overwrite the stored secret.
            var sk = body.Value<string>("stripeSecretKey");
            if (!string.IsNullOrWhiteSpace(sk) && !sk.Contains("…")) Save("Payment_Stripe_SecretKey", sk.Trim(), true);
            var wh = body.Value<string>("stripeWebhookSecret");
            if (!string.IsNullOrWhiteSpace(wh) && !wh.Contains("…")) Save("Payment_Stripe_WebhookSecret", wh.Trim(), true);

            SaveBool("Payment_PayPal_Enabled", "paypalEnabled");
            SaveIfSet("Payment_PayPal_Mode", "paypalMode", false);
            SaveIfSet("Payment_PayPal_ClientId", "paypalClientId", false);
            var ppS = body.Value<string>("paypalClientSecret");
            if (!string.IsNullOrWhiteSpace(ppS) && !ppS.Contains("…")) Save("Payment_PayPal_ClientSecret", ppS.Trim(), true);
            var ppW = body.Value<string>("paypalWebhookId");
            if (!string.IsNullOrWhiteSpace(ppW)) Save("Payment_PayPal_WebhookId", ppW.Trim(), true);

            return Ok(new { success = true, message = "Payment settings saved." });
        }

        private bool IsPaymentSettingsAdmin()
        {
            return User.IsInRole(RoleNames.Admin) || User.IsInRole(RoleNames.Host);
        }

        /// <summary>AI settings' site resolution pattern: AuthEntityId when the
        /// caller passes entityid&amp;entityname=Site, else siteId query, else alias.</summary>
        private int ResolvePaymentSiteId()
        {
            var sid = AuthEntityId(EntityNames.Site);
            if (sid > 0) return sid;
            try
            {
                int q;
                if (int.TryParse(Request.Query["siteId"], out q) && q > 0) return q;
                var alias = _tenantManager != null ? _tenantManager.GetAlias() : null;
                if (alias != null && alias.SiteId > 0) return alias.SiteId;
            }
            catch { }
            return 1;
        }
    }
}
