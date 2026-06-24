using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MegaForm.Core.SpamProtection
{
    /// <summary>
    /// High-level CAPTCHA orchestration. Hosts register one or more ICaptchaProvider implementations.
    /// </summary>
    public interface ICaptchaService
    {
        Task<IReadOnlyList<string>> GetRegisteredProviderNamesAsync(CancellationToken cancellationToken = default);

        Task<CaptchaVerifyResult> VerifyAsync(
            string providerName,
            CaptchaConnectionSettings settings,
            string token,
            string remoteIp = null,
            CancellationToken cancellationToken = default);

        CaptchaRenderSettings GetRenderSettings(string providerName, CaptchaConnectionSettings settings);
    }
}
