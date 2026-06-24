using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.SpamProtection
{
    public class CaptchaService : ICaptchaService
    {
        private readonly IReadOnlyDictionary<string, ICaptchaProvider> _providers;

        public CaptchaService(IEnumerable<ICaptchaProvider> providers)
        {
            if (providers == null)
                throw new ArgumentNullException(nameof(providers));

            _providers = providers.ToDictionary(p => p.ProviderName, p => p, StringComparer.OrdinalIgnoreCase);
        }

        public Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default)
        {
            return Task.FromResult<IReadOnlyList<string>>(_providers.Keys.ToList());
        }

        public async Task<CaptchaVerifyResult> VerifyAsync(
            string providerName,
            CaptchaConnectionSettings settings,
            string token,
            string remoteIp = null,
            CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(token))
                return CaptchaVerifyResult.Fail("CAPTCHA token is required.");

            if (!_providers.TryGetValue(providerName, out var provider))
                return CaptchaVerifyResult.Fail($"CAPTCHA provider '{providerName}' is not registered.");

            var result = await provider.VerifyAsync(settings, token, remoteIp, cancellationToken).ConfigureAwait(false);

            if (result.Success && settings.MinimumScore > 0 && result.Score.HasValue && result.Score.Value < settings.MinimumScore)
            {
                result.Success = false;
                result.IsBot = true;
                result.Message = $"CAPTCHA score {result.Score.Value} is below minimum {settings.MinimumScore}.";
            }

            return result;
        }

        public CaptchaRenderSettings GetRenderSettings(string providerName, CaptchaConnectionSettings settings)
        {
            if (!_providers.TryGetValue(providerName, out var provider))
                return null;

            return provider.GetRenderSettings(settings);
        }
    }
}
