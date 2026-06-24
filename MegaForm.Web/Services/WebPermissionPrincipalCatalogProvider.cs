using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Http;

namespace MegaForm.Web.Services
{
    public class WebPermissionPrincipalCatalogProvider : IPermissionPrincipalCatalogProvider
    {
        private readonly IHttpContextAccessor _http;

        public WebPermissionPrincipalCatalogProvider(IHttpContextAccessor http)
        {
            _http = http;
        }

        public List<PermissionPrincipalInfo> GetPrincipals(int portalId, UserContext actor)
        {
            var principals = new List<PermissionPrincipalInfo>();
            var roles = actor != null && actor.Roles != null
                ? actor.Roles.Distinct(System.StringComparer.OrdinalIgnoreCase).ToList()
                : new List<string>();

            foreach (var role in roles)
            {
                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "role",
                    PrincipalId = role,
                    RoleName = role,
                    DisplayName = role,
                    Description = "Role from the current host identity.",
                    IsRole = true
                });
            }

            if (actor != null && actor.UserId > 0)
            {
                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "user",
                    PrincipalId = actor.UserId.ToString(),
                    UserId = actor.UserId,
                    DisplayName = !string.IsNullOrWhiteSpace(actor.DisplayName) ? actor.DisplayName : actor.UserName,
                    Description = !string.IsNullOrWhiteSpace(actor.Email) ? actor.Email : "Current signed-in user.",
                    IsUser = true,
                    IsCurrentUser = true
                });
            }

            return principals;
        }
    }
}
