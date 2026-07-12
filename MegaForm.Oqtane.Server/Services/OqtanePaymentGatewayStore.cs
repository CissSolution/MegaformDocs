using System;
using Microsoft.Extensions.Configuration;
using MegaForm.Core.Payments;
using Oqtane.Repository;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [PAY-2 v20260712] Oqtane implementation of the payment credential seam.
    /// Reads the well-known Payment_* keys from the Oqtane Setting table on the
    /// Site entity (written by MegaFormController's ModuleConfig/PaymentSettings
    /// endpoints, secrets flagged IsPrivate) with an appsettings.json
    /// "Payment:Stripe:SecretKey"-style fallback, mirroring how the Web host
    /// resolves the same keys. Before this class Oqtane had NO payment backend
    /// at all — the widget's create-intent call 404'd.
    /// </summary>
    public sealed class OqtanePaymentGatewayStore : IPaymentGatewayStore
    {
        private readonly ISettingRepository _settings;
        private readonly IConfiguration _config;

        public OqtanePaymentGatewayStore(ISettingRepository settings, IConfiguration config)
        {
            _settings = settings;
            _config = config;
        }

        public string Get(int portalId, string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return string.Empty;
            int siteId = portalId > 0 ? portalId : 1;

            try
            {
                var setting = _settings.GetSetting(EntityNames.Site, siteId, key);
                var value = setting != null ? setting.SettingValue : null;
                if (!string.IsNullOrWhiteSpace(value)) return Normalize(value);
            }
            catch
            {
                // Setting table unavailable (install phase) — fall through to config.
            }

            // "Payment_Stripe_SecretKey" → "Payment:Stripe:SecretKey"
            var configPath = key.Replace('_', ':');
            return Normalize(_config != null ? _config[configPath] : null);
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
        }
    }
}
