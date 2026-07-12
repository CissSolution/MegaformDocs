using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Oqtane.Models;
using Oqtane.Repository;

namespace MegaForm.Oqtane.Server.Services
{
    public class OqtanePermissionPrincipalCatalogProvider : IPermissionPrincipalCatalogProvider
    {
        private readonly IUserRepository _users;
        private readonly IRoleRepository _roles;

        public OqtanePermissionPrincipalCatalogProvider(IUserRepository users, IRoleRepository roles)
        {
            _users = users;
            _roles = roles;
        }

        public List<PermissionPrincipalInfo> GetPrincipals(int portalId, UserContext actor)
        {
            var principals = new List<PermissionPrincipalInfo>();
            var siteId = portalId > 0 ? portalId : 0;

            foreach (var role in _roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
            {
                if (role == null || string.IsNullOrWhiteSpace(role.Name)) continue;

                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "role",
                    PrincipalId = role.Name,
                    RoleName = role.Name,
                    DisplayName = role.Name,
                    Description = role.Description ?? string.Empty,
                    IsRole = true
                });
            }

            foreach (var user in _users.GetUsers() ?? Enumerable.Empty<User>())
            {
                if (user == null || user.IsDeleted) continue;
                if (siteId > 0 && user.SiteId > 0 && user.SiteId != siteId) continue;

                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "user",
                    PrincipalId = user.UserId.ToString(),
                    UserId = user.UserId,
                    UserName = user.Username ?? string.Empty,
                    DisplayName = !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : user.Username,
                    Description = !string.IsNullOrWhiteSpace(user.Email) ? user.Email : user.Username,
                    IsUser = true
                });
            }

            return principals;
        }
    }
}
