using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MegaForm.Core.Interfaces;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// ASP.NET Core implementation của IPlatformContext.
    /// DNN dùng PortalSettings/UserInfo — Web dùng HttpContext + JWT claims.
    /// </summary>
    public class WebPlatformContext : IPlatformContext
    {
        private readonly IHttpContextAccessor _http;
        private readonly IModuleSettingsService _settings;

        public WebPlatformContext(IHttpContextAccessor http, IModuleSettingsService settings)
        {
            _http = http;
            _settings = settings;
        }

        private ClaimsPrincipal User => _http.HttpContext?.User;

        // JWT claim "portalId" hoặc default 0
        public int PortalId => int.TryParse(User?.FindFirstValue("portalId"), out var v) ? v : 0;

        // ModuleId từ request header X-Module-Id (set bởi JS frontend)
        public int ModuleId
        {
            get
            {
                var h = _http.HttpContext?.Request.Headers["X-Module-Id"].ToString();
                return int.TryParse(h, out var v) ? v : 0;
            }
        }

        // JWT sub claim là userId
        public int UserId => int.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? User?.FindFirstValue("sub"), out var v) ? v : -1;
        public string UserName  => User?.FindFirstValue(ClaimTypes.Name) ?? "anonymous";
        public string UserEmail => User?.FindFirstValue(ClaimTypes.Email) ?? "";
        public bool IsAuthenticated => User?.Identity?.IsAuthenticated ?? false;
        public bool IsAdmin => User?.IsInRole("Administrator") ?? false;
        public bool HasPermission(string key) => IsAdmin; // TODO: fine-grained permissions

        public string MapPath(string virtualPath) => virtualPath; // Web không cần map path
        public string GetSetting(string key) => _settings.GetSetting(ModuleId, key);
        public string GetConnectionString() => ""; // Handled by EF DI
    }
}
