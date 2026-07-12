using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Payments;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace MegaForm.Umbraco.Composers
{
    /// <summary>
    /// [PAY-2 v20260712] Minimal payment-verifier wiring for Umbraco.
    /// SubmissionProcessor now fails CLOSED on payment fields when no verifier
    /// is registered — this keeps Umbraco's submit flow working while the full
    /// Umbraco payment endpoints are deferred (owner's call 2026-07-12).
    /// Separate composer on purpose: MegaFormComposer.cs has concurrent edits
    /// from another session and must not be touched here.
    /// </summary>
    public class MegaFormPaymentComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.Services.AddSingleton<PaymentGatewayClient>();
            builder.Services.AddScoped<IPaymentGatewayStore>(sp =>
            {
                var settings = sp.GetRequiredService<IModuleSettingsService>();
                var config = sp.GetService<IConfiguration>();
                return new ModuleSettingsPaymentGatewayStore(settings, key => config != null ? config[key] : null);
            });
            builder.Services.AddScoped<PaymentSubmissionVerifier>();
        }
    }
}
