using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Resolves Umbraco back-office users/user groups for workflow notifications.
    /// </summary>
    public class UmbracoWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        private readonly IUserService _userService;

        public UmbracoWorkflowPrincipalResolver(IUserService userService)
        {
            _userService = userService;
        }

        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            IUser user = null;
            int userId;
            if (int.TryParse(value, out userId))
            {
                user = _userService.GetUserById(userId);
            }

            if (user == null && value.IndexOf('@') >= 0)
            {
                user = _userService.GetByEmail(value);
            }

            if (user == null)
            {
                user = _userService.GetByUsername(value);
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
                var group = _userService.GetAllUserGroups()
                    .FirstOrDefault(g => g != null &&
                        string.Equals(g.Name, name, StringComparison.OrdinalIgnoreCase));

                if (group == null)
                    return new List<UserPrincipal>();

                var users = _userService.GetAllInGroup(group.Id);
                return (users ?? Enumerable.Empty<IUser>())
                    .Select(ToPrincipal)
                    .Where(p => p != null)
                    .ToList();
            }
            catch
            {
                return new List<UserPrincipal>();
            }
        }

        private static UserPrincipal ToPrincipal(IUser user)
        {
            if (user == null || user.IsLockedOut)
                return null;

            return new UserPrincipal
            {
                UserId = user.Id,
                UserName = user.Username,
                DisplayName = user.Name,
                Email = user.Email
            };
        }
    }
}
