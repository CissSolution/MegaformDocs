using System;
using MegaForm.Core.Interfaces;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// [PAY-2 v20260712] IPaymentGatewayStore over the platform's
    /// IModuleSettingsService — the storage the Web and Umbraco hosts already
    /// use for the dashboard's Payment Settings (global scope, moduleId 0),
    /// with an optional configuration fallback ("Payment_Stripe_SecretKey" →
    /// "Payment:Stripe:SecretKey") mirroring the Web PaymentController's
    /// historical DB-then-appsettings resolution order.
    /// </summary>
    public sealed class ModuleSettingsPaymentGatewayStore : IPaymentGatewayStore
    {
        private readonly IModuleSettingsService _settings;
        private readonly Func<string, string> _configLookup;

        public ModuleSettingsPaymentGatewayStore(IModuleSettingsService settings, Func<string, string> configLookup = null)
        {
            _settings = settings;
            _configLookup = configLookup;
        }

        public string Get(int portalId, string key)
        {
            if (string.IsNullOrWhiteSpace(key)) return string.Empty;
            try
            {
                var value = _settings != null ? _settings.GetSetting(0, key) : null;
                if (!string.IsNullOrWhiteSpace(value)) return Normalize(value);
            }
            catch { }

            if (_configLookup != null)
            {
                try { return Normalize(_configLookup(key.Replace('_', ':'))); }
                catch { }
            }
            return string.Empty;
        }

        private static string Normalize(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return string.Empty;
            return value.Replace("\r", string.Empty).Replace("\n", string.Empty).Trim();
        }
    }
}
