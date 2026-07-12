using System;

namespace MegaForm.Core.Payments
{
    /// <summary>
    /// Platform seam for payment gateway credentials. Each platform maps these
    /// well-known keys onto its own settings store (Web/Umbraco: MF settings via
    /// IModuleSettingsService, DNN: PortalSettings, Oqtane: Setting table on the
    /// Site entity) with an appsettings.json "Payment:*" fallback where the host
    /// has one. Key names match the dashboard Payment Settings contract that Web
    /// and DNN already persist, so existing saved keys keep working unchanged.
    /// </summary>
    public interface IPaymentGatewayStore
    {
        /// <param name="portalId">Site/portal the form belongs to (0 or -1 = global/single-site host).</param>
        /// <param name="key">One of <see cref="PaymentSettingKeys"/>.</param>
        string Get(int portalId, string key);
    }

    public static class PaymentSettingKeys
    {
        public const string StripeSecretKey      = "Payment_Stripe_SecretKey";
        public const string StripePublishableKey = "Payment_Stripe_PublishableKey";
        public const string StripeWebhookSecret  = "Payment_Stripe_WebhookSecret";
        public const string PayPalClientId       = "Payment_PayPal_ClientId";
        public const string PayPalClientSecret   = "Payment_PayPal_ClientSecret";
        public const string PayPalMode           = "Payment_PayPal_Mode";
        // PayPal webhooks are verified by webhook ID (PayPal calls back and we ask
        // PayPal to confirm the signature), not by a shared secret like Stripe.
        public const string PayPalWebhookId      = "Payment_PayPal_WebhookId";
    }

    /// <summary>Shared helpers for the two gateways' currency wire formats.</summary>
    public static class PaymentCurrency
    {
        // Stripe zero-decimal currencies: the amount is sent in whole units, not
        // hundredths. Multiplying VND by 100 (what a naive cents conversion does)
        // charges the customer one hundred times the displayed price.
        private static readonly string[] ZeroDecimal = new[]
        {
            "BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"
        };

        public static bool IsZeroDecimal(string currency)
        {
            if (string.IsNullOrWhiteSpace(currency)) return false;
            var c = currency.Trim().ToUpperInvariant();
            for (int i = 0; i < ZeroDecimal.Length; i++)
            {
                if (ZeroDecimal[i] == c) return true;
            }
            return false;
        }

        /// <summary>Convert a decimal amount to Stripe's smallest-unit integer for the currency.</summary>
        public static long ToStripeMinorUnits(decimal amount, string currency)
        {
            return IsZeroDecimal(currency)
                ? (long)Math.Round(amount, MidpointRounding.AwayFromZero)
                : (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
        }

        /// <summary>Convert Stripe's smallest-unit integer back to a decimal amount.</summary>
        public static decimal FromStripeMinorUnits(long minorUnits, string currency)
        {
            return IsZeroDecimal(currency) ? minorUnits : minorUnits / 100m;
        }

        /// <summary>PayPal decimal string ("10.00"; whole units for currencies PayPal treats as decimal-less).</summary>
        public static string ToPayPalValue(decimal amount, string currency)
        {
            var c = (currency ?? string.Empty).Trim().ToUpperInvariant();
            if (c == "HUF" || c == "JPY" || c == "TWD")
                return Math.Round(amount, MidpointRounding.AwayFromZero).ToString("0", System.Globalization.CultureInfo.InvariantCulture);
            return amount.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
