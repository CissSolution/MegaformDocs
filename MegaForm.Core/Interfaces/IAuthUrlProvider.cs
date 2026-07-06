namespace MegaForm.Core.Interfaces
{
    /// <summary>
    /// Well-known external auth provider keys (case-insensitive by convention). Platform adapters
    /// map these to the host's configured scheme/provider. Kept as plain strings so templates and
    /// the client can reference them without a Core dependency.
    /// </summary>
    public static class AuthProviders
    {
        public const string Google = "Google";
        public const string GitHub = "GitHub";
        public const string Microsoft = "Microsoft";
        public const string Facebook = "Facebook";
    }

    /// <summary>
    /// [AuthUrl v20260706] Platform-agnostic seam for building the HOST's authentication URLs so a
    /// single MegaForm template (login prompt / social sign-up) works unchanged across Oqtane, DNN,
    /// Umbraco and the standalone Web host.
    ///
    /// MegaForm never authenticates users itself — these URLs hand off to the host's login /
    /// external-login flow, which owns user creation, provider secrets and the session cookie
    /// (see CLAUDE_HANDOFF_20260706_MEGAFORM_AUTH_AUDIT.md). Each platform provides an
    /// implementation; the resolved URLs are surfaced to the browser via
    /// <c>window.__MF_PLATFORM__.auth</c> and consumed in template customHtml through the
    /// <c>[data-mf-auth="google|github|login|register"]</c> convention.
    ///
    /// Return URLs are HOST-relative (start with '/') so they are safe to embed and platform-neutral.
    /// </summary>
    public interface IAuthUrlProvider
    {
        /// <summary>True when the current request/user is already signed in on the host.</summary>
        bool IsAuthenticated { get; }

        /// <summary>Host local login page. <paramref name="returnUrl"/> = where to send the user after sign-in.</summary>
        string LoginUrl(string returnUrl = null);

        /// <summary>Host self-service registration page (may equal <see cref="LoginUrl"/> on hosts without a separate one).</summary>
        string RegisterUrl(string returnUrl = null);

        /// <summary>
        /// Host external/social login challenge for a provider (see <see cref="AuthProviders"/>).
        /// On hosts that support a single site-wide external provider (e.g. Oqtane) the
        /// <paramref name="provider"/> argument is a hint and every provider resolves to the same
        /// challenge URL; multi-provider hosts route per provider. Returns null/empty when external
        /// login is unavailable on the platform.
        /// </summary>
        string ExternalLoginUrl(string provider, string returnUrl = null);
    }
}
