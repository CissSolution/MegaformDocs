using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.SpamProtection
{
    public abstract class HttpCaptchaProviderBase : ICaptchaProvider
    {
        protected HttpClient HttpClient { get; }

        protected HttpCaptchaProviderBase(HttpClient httpClient)
        {
            HttpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        }

        public abstract string ProviderName { get; }
        protected abstract string VerificationUrl { get; }
        protected abstract string ScriptUrl { get; }

        public virtual async Task<CaptchaVerifyResult> VerifyAsync(CaptchaConnectionSettings settings, string token, string remoteIp = null, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(token))
                return CaptchaVerifyResult.Fail("CAPTCHA token is required.");

            try
            {
                var parameters = new Dictionary<string, string>
                {
                    ["secret"] = settings.SecretKey,
                    ["response"] = token
                };

                if (!string.IsNullOrWhiteSpace(remoteIp))
                    parameters["remoteip"] = remoteIp;

                var response = await HttpClient.PostAsync(VerificationUrl, new FormUrlEncodedContent(parameters), cancellationToken).ConfigureAwait(false);
                var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

                if (!response.IsSuccessStatusCode)
                    return CaptchaVerifyResult.Fail($"CAPTCHA verification failed: {(int)response.StatusCode} {body}");

                return ParseResponse(body);
            }
            catch (Exception ex)
            {
                return CaptchaVerifyResult.Fail("CAPTCHA verification error.", ex);
            }
        }

        public virtual CaptchaRenderSettings GetRenderSettings(CaptchaConnectionSettings settings)
        {
            return new CaptchaRenderSettings
            {
                ProviderName = ProviderName,
                SiteKey = settings.SiteKey,
                ScriptUrl = ScriptUrl,
                Theme = settings.Theme,
                Size = settings.Size,
                Action = settings.Action,
                MinimumScore = settings.MinimumScore
            };
        }

        protected abstract CaptchaVerifyResult ParseResponse(string responseBody);
    }
}
