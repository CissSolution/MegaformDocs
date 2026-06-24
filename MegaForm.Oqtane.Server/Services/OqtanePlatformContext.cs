using System.Linq;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MegaForm.Core.Interfaces;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [SDK Platform B v20260616] Oqtane implementation of <see cref="IPlatformContext"/>.
    ///
    /// Lets the MegaForm SDK (<c>IMegaFormClient</c>) resolve the ambient tenant/user from
    /// the current request WITHOUT the caller passing an explicit <c>MegaFormScope</c>. Before
    /// this, the SDK factory got <c>null</c> for IPlatformContext, so every scope-less call
    /// threw "No portal context available" (<c>MegaFormClient.ResolvePortalId</c>).
    ///
    /// LOW BLAST RADIUS: an explicit <c>MegaFormScope</c> still wins (ResolvePortalId checks
    /// scope first), so existing callers that pass a scope (e.g. SdkDemoView) are unaffected.
    /// Nothing else in the Oqtane server consumes IPlatformContext today.
    ///
    /// Resolution mirrors the controller's own helpers:
    ///   - PortalId  → the Oqtane site id from the <c>X-OQTANE-SITEID</c> request header
    ///     (set by Oqtane's HttpClient on every API call; same source as
    ///     MegaFormController.ResolvePortalId's fallback).
    ///   - UserId    → the <c>sub</c> / NameIdentifier claim (same as ParseClaimsUserId).
    /// </summary>
    public sealed class OqtanePlatformContext : IPlatformContext
    {
        private readonly IHttpContextAccessor _http;
        public OqtanePlatformContext(IHttpContextAccessor http) { _http = http; }

        private HttpContext Ctx => _http?.HttpContext;
        private ClaimsPrincipal User => Ctx?.User;

        private static int ParsePositiveInt(string s) => int.TryParse(s, out var v) && v > 0 ? v : 0;
        private string Header(string name) => Ctx?.Request?.Headers[name].FirstOrDefault();

        public int PortalId => ParsePositiveInt(Header("X-OQTANE-SITEID"));

        public int ModuleId => ParsePositiveInt(Header("X-OQTANE-MODULEID"));

        // Oqtane stores the user id in the "sub" claim (fallback NameIdentifier) — identical
        // to MegaFormController.ParseClaimsUserId. -1 when anonymous/unresolvable.
        public int UserId =>
            int.TryParse(User?.FindFirst("sub")?.Value ?? User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var v)
                ? v : -1;

        public string UserName => User?.FindFirst(ClaimTypes.Name)?.Value ?? User?.Identity?.Name ?? "anonymous";
        public string UserEmail => User?.FindFirst(ClaimTypes.Email)?.Value ?? string.Empty;
        public bool IsAuthenticated => User?.Identity?.IsAuthenticated ?? false;

        public bool IsAdmin =>
            User != null && (User.IsInRole("Host") || User.IsInRole("Administrators") || User.IsInRole("Admin"));

        public bool HasPermission(string permissionKey) => IsAdmin; // fine-grained perms handled elsewhere

        // The SDK never calls these (they exist for full host adapters). Safe no-ops on Oqtane.
        public string MapPath(string virtualPath) => virtualPath;
        public string GetSetting(string key) => string.Empty;
        public string GetConnectionString() => string.Empty;
    }
}
