using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.SpamProtection
{
    /// <summary>
    /// Platform-agnostic contract for CAPTCHA providers
    /// (reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile).
    /// </summary>
    public interface ICaptchaProvider
    {
        string ProviderName { get; }

        Task<CaptchaVerifyResult> VerifyAsync(CaptchaConnectionSettings settings, string token, string remoteIp = null, CancellationToken cancellationToken = default);

        CaptchaRenderSettings GetRenderSettings(CaptchaConnectionSettings settings);
    }
}
