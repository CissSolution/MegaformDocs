using System;
using System.Linq;
using System.Security.Claims;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Http;

namespace MegaForm.Web.Services
{
    public class WebWorkflowActorAccessor
    {
        private readonly IHttpContextAccessor _http;

        public WebWorkflowActorAccessor(IHttpContextAccessor http)
        {
            _http = http;
        }

        public UserContext GetCurrentUser()
        {
            var http = _http.HttpContext;
            var user = http != null ? http.User : null;

            var ctx = new UserContext
            {
                UserId = ParseUserId(user),
                UserName = user != null ? (user.FindFirstValue(ClaimTypes.Name) ?? "anonymous") : "anonymous",
                DisplayName = user != null
                    ? (user.FindFirstValue("display_name")
                        ?? user.FindFirstValue("name")
                        ?? user.FindFirstValue(ClaimTypes.Name)
                        ?? "anonymous")
                    : "anonymous",
                Email = user != null ? (user.FindFirstValue(ClaimTypes.Email) ?? string.Empty) : string.Empty,
                IsAuthenticated = user != null && user.Identity != null && user.Identity.IsAuthenticated,
                IsAdmin = user != null && user.IsInRole("Administrator"),
                IsSuperUser = false,
                IpAddress = http != null && http.Connection != null && http.Connection.RemoteIpAddress != null
                    ? http.Connection.RemoteIpAddress.ToString()
                    : string.Empty
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
            if (user == null)
                return -1;

            int userId;
            if (int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out userId))
                return userId;
            return -1;
        }
    }
}
