using System;
using Microsoft.AspNetCore.Http;
using MegaForm.Core.Interfaces;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [AuthUrl v20260706] Oqtane implementation of <see cref="IAuthUrlProvider"/>.
    ///
    /// Oqtane owns login + external login. Verified routes (Oqtane 10.1.0):
    ///   /login?returnurl=...           local login (200)
    ///   /register?returnurl=...        self-service registration (200)
    ///   /pages/external?returnurl=...  external/social login challenge (403 until an External
    ///                                  Login provider is configured under Admin -> User Management)
    ///
    /// ⚠️ Oqtane supports ONE site-wide external provider (site setting: providerType OAuth2|OIDC +
    /// providerName + client id/secret/authority). So <see cref="ExternalLoginUrl"/> ignores the
    /// provider argument and returns the single challenge URL — the provider is carried only as a
    /// hint (query) for multi-provider hosts / future use. To make BOTH Google and GitHub live at
    /// once you must configure Oqtane's provider (config-only per the audit's Path 1); the button a
    /// visitor clicks challenges whichever provider the site has configured.
    /// </summary>
    public sealed class OqtaneAuthUrlProvider : IAuthUrlProvider
    {
        private readonly IHttpContextAccessor _http;
        public OqtaneAuthUrlProvider(IHttpContextAccessor http) { _http = http; }

        public bool IsAuthenticated => _http?.HttpContext?.User?.Identity?.IsAuthenticated ?? false;

        public string LoginUrl(string returnUrl = null) => "/login" + Return(returnUrl);

        public string RegisterUrl(string returnUrl = null) => "/register" + Return(returnUrl);

        public string ExternalLoginUrl(string provider, string returnUrl = null)
        {
            var url = "/pages/external" + Return(returnUrl);
            // Provider is a hint only on Oqtane (single site-wide provider). Passed through so a
            // multi-provider adapter / future Oqtane can route per provider without a template change.
            if (!string.IsNullOrWhiteSpace(provider))
                url += (url.Contains("?") ? "&" : "?") + "provider=" + Uri.EscapeDataString(provider);
            return url;
        }

        private static string Return(string returnUrl)
        {
            if (string.IsNullOrWhiteSpace(returnUrl)) return string.Empty;
            // Only host-relative return URLs are allowed (open-redirect guard); anything else -> home.
            var safe = returnUrl.StartsWith("/") && !returnUrl.StartsWith("//") ? returnUrl : "/";
            return "?returnurl=" + Uri.EscapeDataString(safe);
        }
    }
}
