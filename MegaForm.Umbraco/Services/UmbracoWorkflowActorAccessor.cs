using System;
using System.Linq;
using System.Security.Claims;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Http;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Resolves the current workflow actor from the Umbraco HTTP context.
    /// </summary>
    public class UmbracoWorkflowActorAccessor
    {
        private readonly IHttpContextAccessor _http;

        public UmbracoWorkflowActorAccessor(IHttpContextAccessor http)
        {
            _http = http;
        }

        public UserContext GetCurrentUser()
        {
            var http = _http.HttpContext;
            var user = http?.User;

            var ctx = new UserContext
            {
                UserId = ParseUserId(user),
                UserName = user?.FindFirstValue(ClaimTypes.Name) ?? "anonymous",
                DisplayName = user?.FindFirstValue("display_name")
                    ?? user?.FindFirstValue("name")
                    ?? user?.FindFirstValue(ClaimTypes.Name)
                    ?? "anonymous",
                Email = user?.FindFirstValue(ClaimTypes.Email) ?? string.Empty,
                IsAuthenticated = user?.Identity?.IsAuthenticated ?? false,
                IsAdmin = user?.IsInRole("Administrator") ?? false,
                IsSuperUser = false,
                IpAddress = http?.Connection?.RemoteIpAddress?.ToString() ?? string.Empty
            };

            if (user != null)
            {
                ctx.Roles = user.Claims
                    .Where(c => c.Type == ClaimTypes.Role || c.Type == "role" || c.Type == "roles")
                    .Select(c => c.Value)
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
            }

            return ctx;
        }

        private static int ParseUserId(ClaimsPrincipal user)
        {
            if (user == null) return -1;
            if (int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var userId))
                return userId;
            return -1;
        }
    }
}
