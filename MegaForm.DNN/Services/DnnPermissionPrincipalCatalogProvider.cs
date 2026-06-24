using System.Collections.Generic;
using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;

namespace MegaForm.DNN.Services
{
    public class DnnPermissionPrincipalCatalogProvider : IPermissionPrincipalCatalogProvider
    {
        private readonly int _portalId;

        public DnnPermissionPrincipalCatalogProvider(int portalId)
        {
            _portalId = portalId;
        }

        public List<PermissionPrincipalInfo> GetPrincipals(int portalId, UserContext actor)
        {
            var principals = new List<PermissionPrincipalInfo>();
            var effectivePortalId = portalId > 0 ? portalId : _portalId;

            foreach (RoleInfo role in RoleController.Instance.GetRoles(effectivePortalId))
            {
                if (role == null || string.IsNullOrWhiteSpace(role.RoleName)) continue;

                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "role",
                    PrincipalId = role.RoleName,
                    RoleName = role.RoleName,
                    DisplayName = role.RoleName,
                    Description = role.Description ?? string.Empty,
                    IsRole = true
                });
            }

            int totalRecords = 0;
            var users = UserController.GetUsers(effectivePortalId, 0, 250, ref totalRecords, false, false);
            foreach (UserInfo user in users)
            {
                if (user == null || user.IsDeleted) continue;

                principals.Add(new PermissionPrincipalInfo
                {
                    PrincipalType = "user",
                    PrincipalId = user.UserID.ToString(),
                    UserId = user.UserID,
                    DisplayName = !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : user.Username,
                    Description = !string.IsNullOrWhiteSpace(user.Email) ? user.Email : user.Username,
                    IsUser = true
                });
            }

            return principals;
        }
    }
}
