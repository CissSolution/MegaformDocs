using System;
using System.Collections.Generic;
using System.Linq;
using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;
using MegaForm.Core.Interfaces;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// Resolves DNN role members and user emails for workflow notifications.
    /// </summary>
    public class DnnWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            UserInfo user = null;
            int userId;
            if (int.TryParse(value, out userId))
            {
                user = UserController.Instance.GetUser(portalId, userId);
            }

            if (user == null && value.IndexOf('@') >= 0)
            {
                user = UserController.GetUserByEmail(portalId, value);
            }

            if (user == null)
            {
                user = UserController.GetUserByName(portalId, value);
            }

            return ToPrincipal(user);
        }

        public List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId)
        {
            var name = (roleName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name))
                return new List<UserPrincipal>();

            try
            {
                var raw = RoleController.Instance.GetUsersByRole(portalId, name);
                if (raw == null)
                    return new List<UserPrincipal>();

                var principals = new List<UserPrincipal>();
                foreach (var item in raw)
                {
                    var user = item as UserInfo;
                    var principal = ToPrincipal(user);
                    if (principal != null)
                        principals.Add(principal);
                }
                return principals;
            }
            catch
            {
                return new List<UserPrincipal>();
            }
        }

        private static UserPrincipal ToPrincipal(UserInfo user)
        {
            if (user == null || user.IsDeleted || !user.Membership.Approved)
                return null;

            return new UserPrincipal
            {
                UserId = user.UserID,
                UserName = user.Username,
                DisplayName = user.DisplayName,
                Email = user.Email
            };
        }
    }
}
