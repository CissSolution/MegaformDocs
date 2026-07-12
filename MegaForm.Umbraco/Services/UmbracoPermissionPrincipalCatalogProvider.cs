using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Http;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco implementation of IPermissionPrincipalCatalogProvider.
    /// Phase 1: returns principals from the current HTTP context claims.
    /// Phase 2/3: can be extended to query Umbraco users/groups.
    /// </summary>
    public class UmbracoPermissionPrincipalCatalogProvider : IPermissionPrincipalCatalogProvider
    {
        private readonly IHttpContextAccessor _http;

        public UmbracoPermissionPrincipalCatalogProvider(IHttpContextAccessor http)
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
                    UserName = actor.UserName ?? string.Empty,
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
