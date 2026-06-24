using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.DNN.Services
{
    public class DnnWorkflowIdentityProvisioningService : IWorkflowIdentityProvisioningService
    {
        private readonly int _defaultPortalId;

        public DnnWorkflowIdentityProvisioningService(int defaultPortalId)
        {
            _defaultPortalId = defaultPortalId;
        }

        public Task<WorkflowProvisionedRole> EnsureRoleAsync(WorkflowRoleProvisionRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request != null ? request.PortalId : 0);
            var roleName = (request != null ? request.RoleName : string.Empty) ?? string.Empty;
            roleName = roleName.Trim();
            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");

            var existing = RoleController.Instance.GetRoleByName(portalId, roleName);
            if (existing != null)
            {
                return Task.FromResult(new WorkflowProvisionedRole
                {
                    RoleId = existing.RoleID,
                    RoleName = existing.RoleName,
                    Description = existing.Description ?? string.Empty,
                    AlreadyExisted = true
                });
            }

            var role = new RoleInfo
            {
                PortalID = portalId,
                RoleName = roleName,
                Description = request != null ? (request.Description ?? string.Empty) : string.Empty,
                RoleGroupID = -1,
                Status = RoleStatus.Approved,
                IsSystemRole = request != null && request.IsSystemRole,
                IsPublic = false,
                AutoAssignment = false
            };

            var roleId = RoleController.Instance.AddRole(role);
            var created = RoleController.Instance.GetRoleByName(portalId, roleName) ?? role;

            return Task.FromResult(new WorkflowProvisionedRole
            {
                RoleId = created.RoleID > 0 ? (int?)created.RoleID : roleId,
                RoleName = created.RoleName,
                Description = created.Description ?? string.Empty,
                Created = true
            });
        }

        public Task<WorkflowProvisionedUser> EnsureUserAsync(WorkflowUserProvisionRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request != null ? request.PortalId : 0);
            var userName = BuildUserName(request != null ? request.UserName : null, request != null ? request.Email : null);
            var email = BuildEmail(request != null ? request.Email : null, userName);
            var existing = FindExistingUser(portalId, userName, email);
            var generatedPassword = BuildPassword(request);

            if (existing != null)
            {
                var updated = false;
                if (request != null && request.UpdateIfExists)
                {
                    updated = ApplyUserChanges(existing, request, email);
                    if (updated)
                        UserController.UpdateUser(portalId, existing, false, false);
                }

                return Task.FromResult(new WorkflowProvisionedUser
                {
                    UserId = existing.UserID,
                    UserName = existing.Username,
                    Email = existing.Email,
                    DisplayName = existing.DisplayName,
                    Password = string.Empty,
                    AlreadyExisted = true,
                    Updated = updated
                });
            }

            var user = new UserInfo
            {
                PortalID = portalId,
                Username = userName,
                Email = email,
                FirstName = request != null ? (request.FirstName ?? string.Empty) : string.Empty,
                LastName = request != null ? (request.LastName ?? string.Empty) : string.Empty,
                DisplayName = BuildDisplayName(request, userName),
                Membership = new UserMembership
                {
                    Approved = request == null || request.ApproveUser,
                    Password = generatedPassword,
                    PasswordConfirm = generatedPassword,
                    UpdatePassword = false,
                    CreatedDate = DateTime.UtcNow
                }
            };

            var status = UserController.CreateUser(ref user, false);
            if (!string.Equals(status.ToString(), "Success", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("DNN CreateUser failed: " + status);

            var created = UserController.GetUserByName(portalId, user.Username) ?? user;
            return Task.FromResult(new WorkflowProvisionedUser
            {
                UserId = created.UserID,
                UserName = created.Username,
                Email = created.Email,
                DisplayName = created.DisplayName,
                Password = generatedPassword,
                Created = true
            });
        }

        public async Task<WorkflowProvisionedMembership> AddUserToRoleAsync(WorkflowUserRoleProvisionRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request != null ? request.PortalId : 0);
            var roleName = ((request != null ? request.RoleName : null) ?? string.Empty).Trim();
            var identifier = ((request != null ? request.UserIdentifier : null) ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");
            if (string.IsNullOrWhiteSpace(identifier))
                throw new InvalidOperationException("UserIdentifier is required.");

            var role = RoleController.Instance.GetRoleByName(portalId, roleName);
            if (role == null)
            {
                if (request == null || !request.AutoCreateRole)
                    throw new InvalidOperationException("Role '" + roleName + "' was not found.");

                var createdRole = await EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Actor = request.Actor
                }, ct).ConfigureAwait(false);

                role = RoleController.Instance.GetRoleByName(portalId, createdRole.RoleName);
            }

            var user = FindUser(portalId, identifier, request != null ? request.LookupMode : WorkflowUserLookupMode.Auto);
            if (user == null)
                throw new InvalidOperationException("User '" + identifier + "' was not found.");

            if (user.Roles != null && user.Roles.Any(r => string.Equals(r, role.RoleName, StringComparison.OrdinalIgnoreCase)))
            {
                return new WorkflowProvisionedMembership
                {
                    UserId = user.UserID,
                    RoleId = role.RoleID,
                    UserName = user.Username,
                    RoleName = role.RoleName,
                    AlreadyInRole = true
                };
            }

            RoleController.Instance.AddUserRole(
                portalId,
                user.UserID,
                role.RoleID,
                RoleStatus.Approved,
                false,
                DateTime.UtcNow,
                DateTime.MaxValue);
            return new WorkflowProvisionedMembership
            {
                UserId = user.UserID,
                RoleId = role.RoleID,
                UserName = user.Username,
                RoleName = role.RoleName,
                Added = true
            };
        }

        private int ResolvePortalId(int requestedPortalId)
        {
            return requestedPortalId > 0 ? requestedPortalId : (_defaultPortalId > 0 ? _defaultPortalId : 0);
        }

        private static string BuildUserName(string requestedUserName, string email)
        {
            var value = (requestedUserName ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(value))
                return value;

            var emailValue = (email ?? string.Empty).Trim();
            var at = emailValue.IndexOf('@');
            if (at > 0)
                return emailValue.Substring(0, at);

            throw new InvalidOperationException("UserName or Email is required.");
        }

        private static string BuildEmail(string requestedEmail, string userName)
        {
            var value = (requestedEmail ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(value))
                return value;
            return (userName ?? "user").Trim().ToLowerInvariant() + "@megaform.local";
        }

        private static string BuildDisplayName(WorkflowUserProvisionRequest request, string userName)
        {
            var display = request != null ? (request.DisplayName ?? string.Empty).Trim() : string.Empty;
            if (!string.IsNullOrWhiteSpace(display))
                return display;

            var first = request != null ? (request.FirstName ?? string.Empty).Trim() : string.Empty;
            var last = request != null ? (request.LastName ?? string.Empty).Trim() : string.Empty;
            var combined = (first + " " + last).Trim();
            return string.IsNullOrWhiteSpace(combined) ? userName : combined;
        }

        private static string BuildPassword(WorkflowUserProvisionRequest request)
        {
            var explicitPassword = request != null ? (request.Password ?? string.Empty).Trim() : string.Empty;
            if (!string.IsNullOrWhiteSpace(explicitPassword))
                return explicitPassword;

            if (request == null || request.GeneratePasswordIfEmpty)
                return UserController.GeneratePassword(12);

            return "MegaForm!2026";
        }

        private static bool ApplyUserChanges(UserInfo existing, WorkflowUserProvisionRequest request, string email)
        {
            var changed = false;
            var displayName = BuildDisplayName(request, existing.Username);
            var firstName = request != null ? (request.FirstName ?? string.Empty) : string.Empty;
            var lastName = request != null ? (request.LastName ?? string.Empty) : string.Empty;

            if (!string.IsNullOrWhiteSpace(email) && !string.Equals(existing.Email, email, StringComparison.OrdinalIgnoreCase))
            {
                existing.Email = email;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(displayName) && !string.Equals(existing.DisplayName, displayName, StringComparison.Ordinal))
            {
                existing.DisplayName = displayName;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(firstName) && !string.Equals(existing.FirstName, firstName, StringComparison.Ordinal))
            {
                existing.FirstName = firstName;
                changed = true;
            }
            if (!string.IsNullOrWhiteSpace(lastName) && !string.Equals(existing.LastName, lastName, StringComparison.Ordinal))
            {
                existing.LastName = lastName;
                changed = true;
            }
            if (request != null && request.ApproveUser && existing.Membership != null && !existing.Membership.Approved)
            {
                existing.Membership.Approved = true;
                changed = true;
            }

            return changed;
        }

        private static UserInfo FindExistingUser(int portalId, string userName, string email)
        {
            var byUserName = UserController.GetUserByName(portalId, userName);
            if (byUserName != null)
                return byUserName;

            return FindByEmail(portalId, email);
        }

        private static UserInfo FindUser(int portalId, string identifier, WorkflowUserLookupMode lookupMode)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            if (lookupMode == WorkflowUserLookupMode.UserId)
            {
                int userId;
                return int.TryParse(value, out userId) ? UserController.Instance.GetUser(portalId, userId) : null;
            }

            if (lookupMode == WorkflowUserLookupMode.UserName)
                return UserController.GetUserByName(portalId, value);

            if (lookupMode == WorkflowUserLookupMode.Email)
                return FindByEmail(portalId, value);

            int parsedUserId;
            if (int.TryParse(value, out parsedUserId))
            {
                var byId = UserController.Instance.GetUser(portalId, parsedUserId);
                if (byId != null)
                    return byId;
            }

            if (value.IndexOf('@') > 0)
            {
                var byEmail = FindByEmail(portalId, value);
                if (byEmail != null)
                    return byEmail;
            }

            var byName = UserController.GetUserByName(portalId, value);
            return byName ?? FindByEmail(portalId, value);
        }

        private static UserInfo FindByEmail(int portalId, string email)
        {
            var value = (email ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var user = UserController.GetUserByEmail(portalId, value);
            if (user != null)
                return user;

            int total = 0;
            var matches = UserController.GetUsersByEmail(portalId, value, 0, 1, ref total, false, false);
            return matches != null && matches.Count > 0 ? matches[0] as UserInfo : null;
        }
    }
}
