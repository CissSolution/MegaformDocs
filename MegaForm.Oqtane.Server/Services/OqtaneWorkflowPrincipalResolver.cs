using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using Oqtane.Models;
using Oqtane.Repository;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// Resolves Oqtane role members and user emails for workflow notifications.
    /// </summary>
    public class OqtaneWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        private readonly IUserRepository _users;
        private readonly IRoleRepository _roles;
        private readonly IUserRoleRepository _userRoles;

        public OqtaneWorkflowPrincipalResolver(
            IUserRepository users,
            IRoleRepository roles,
            IUserRoleRepository userRoles)
        {
            _users = users;
            _roles = roles;
            _userRoles = userRoles;
        }

        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            User user = null;
            int userId;
            if (int.TryParse(value, out userId))
            {
                user = _users.GetUser(userId);
            }

            if (user == null)
            {
                user = _users.GetUser(value); // by username
            }

            if (user == null && value.IndexOf('@') >= 0)
            {
                var all = _users.GetUsers() ?? Enumerable.Empty<User>();
                user = all.FirstOrDefault(u => u != null && !u.IsDeleted &&
                    string.Equals(u.Email, value, StringComparison.OrdinalIgnoreCase));
            }

            return ToPrincipal(user);
        }

        public List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId)
        {
            var name = (roleName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(name))
                return new List<UserPrincipal>();

            var siteId = portalId > 0 ? portalId : 0;
            var role = (_roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
                .FirstOrDefault(r => r != null &&
                    string.Equals(r.Name, name, StringComparison.OrdinalIgnoreCase));

            if (role == null)
                return new List<UserPrincipal>();

            var memberships = _userRoles.GetUserRoles(siteId) ?? Enumerable.Empty<UserRole>();
            var userIds = memberships
                .Where(m => m.RoleId == role.RoleId)
                .Select(m => m.UserId)
                .Distinct()
                .ToList();

            var principals = new List<UserPrincipal>();
            foreach (var uid in userIds)
            {
                var user = _users.GetUser(uid);
                var principal = ToPrincipal(user);
                if (principal != null)
                    principals.Add(principal);
            }
            return principals;
        }

        private static UserPrincipal ToPrincipal(User user)
        {
            if (user == null || user.IsDeleted)
                return null;

            return new UserPrincipal
            {
                UserId = user.UserId,
                UserName = user.Username,
                DisplayName = !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : user.Username,
                Email = user.Email
            };
        }
    }
}
