using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using MegaForm.Web.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Web host implementation of workflow identity provisioning.
    /// Stores users/roles in custom MegaForm tables (MF_WebUsers / MF_WebRoles / MF_WebUserRoles)
    /// rather than ASP.NET Core Identity so the standalone host stays lightweight.
    /// </summary>
    public class WebWorkflowIdentityProvisioningService : IWorkflowIdentityProvisioningService
    {
        private readonly MegaFormDbContext _db;
        private readonly IEmailSender _emailSender;
        private readonly ILogService _log;

        public WebWorkflowIdentityProvisioningService(
            MegaFormDbContext db,
            IEmailSender emailSender = null,
            ILogService log = null)
        {
            _db = db ?? throw new ArgumentNullException(nameof(db));
            _emailSender = emailSender;
            _log = log;
        }

        public async Task<WorkflowProvisionedRole> EnsureRoleAsync(
            WorkflowRoleProvisionRequest request,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request?.PortalId ?? 0);
            var roleName = (request?.RoleName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");

            var existing = await _db.WebRoles
                .FirstOrDefaultAsync(r => r.PortalId == portalId
                    && r.RoleName.Equals(roleName, StringComparison.OrdinalIgnoreCase), ct)
                .ConfigureAwait(false);

            if (existing != null)
            {
                return new WorkflowProvisionedRole
                {
                    RoleId = existing.RoleId,
                    RoleName = existing.RoleName,
                    Description = existing.Description ?? string.Empty,
                    AlreadyExisted = true
                };
            }

            var created = new WebRoleRow
            {
                PortalId = portalId,
                RoleName = roleName,
                Description = request?.Description ?? string.Empty,
                IsSystem = request?.IsSystemRole ?? false,
                IsAutoAssigned = false,
                CreatedOnUtc = DateTime.UtcNow
            };
            _db.WebRoles.Add(created);
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);

            return new WorkflowProvisionedRole
            {
                RoleId = created.RoleId,
                RoleName = created.RoleName,
                Description = created.Description,
                Created = true
            };
        }

        public async Task<WorkflowProvisionedUser> EnsureUserAsync(
            WorkflowUserProvisionRequest request,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request?.PortalId ?? 0);
            var userName = BuildUserName(request?.UserName, request?.Email);
            var email = BuildEmail(request?.Email, userName);
            var displayName = BuildDisplayName(request, userName);
            var password = BuildPassword(request);
            var actorName = ResolveActor(request?.Actor, userName);
            var ipAddress = ResolveIpAddress(request);
            var now = DateTime.UtcNow;

            var existing = await FindExistingUserAsync(portalId, userName, email, ct).ConfigureAwait(false);
            if (existing != null)
            {
                var updated = false;
                if (request?.UpdateIfExists == true)
                {
                    existing.DisplayName = displayName;
                    existing.Email = email;
                    existing.UpdatedOnUtc = now;
                    existing.UpdatedBy = actorName;
                    existing.LastIpAddress = ipAddress;

                    if (!string.IsNullOrWhiteSpace(password))
                    {
                        existing.PasswordHash = HashPassword(password);
                        existing.SecurityStamp = Guid.NewGuid().ToString("N");
                    }

                    if (request?.ApproveUser == true)
                        existing.IsApproved = true;

                    await _db.SaveChangesAsync(ct).ConfigureAwait(false);
                    updated = true;
                }

                await EnsureAutoAssignedRolesAsync(existing.UserId, portalId, ct).ConfigureAwait(false);

                return new WorkflowProvisionedUser
                {
                    UserId = existing.UserId,
                    UserName = existing.UserName,
                    Email = existing.Email,
                    DisplayName = existing.DisplayName,
                    Password = string.Empty,
                    AlreadyExisted = true,
                    Updated = updated
                };
            }

            var created = new WebUserRow
            {
                PortalId = portalId,
                UserName = userName,
                Email = email,
                DisplayName = displayName,
                PasswordHash = HashPassword(password),
                SecurityStamp = Guid.NewGuid().ToString("N"),
                IsApproved = request?.ApproveUser ?? true,
                LastIpAddress = ipAddress,
                CreatedOnUtc = now,
                CreatedBy = actorName,
                IsDeleted = false
            };
            _db.WebUsers.Add(created);
            await _db.SaveChangesAsync(ct).ConfigureAwait(false);

            await EnsureAutoAssignedRolesAsync(created.UserId, portalId, ct).ConfigureAwait(false);

            var result = new WorkflowProvisionedUser
            {
                UserId = created.UserId,
                UserName = created.UserName,
                Email = created.Email,
                DisplayName = created.DisplayName,
                Password = password,
                Created = true
            };

            TrySendWelcomeEmail(result);
            return result;
        }

        public async Task<WorkflowProvisionedMembership> AddUserToRoleAsync(
            WorkflowUserRoleProvisionRequest request,
            CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var portalId = ResolvePortalId(request?.PortalId ?? 0);
            var roleName = (request?.RoleName ?? string.Empty).Trim();
            var identifier = (request?.UserIdentifier ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");
            if (string.IsNullOrWhiteSpace(identifier))
                throw new InvalidOperationException("UserIdentifier is required.");

            var role = await _db.WebRoles
                .FirstOrDefaultAsync(r => r.PortalId == portalId
                    && r.RoleName.Equals(roleName, StringComparison.OrdinalIgnoreCase), ct)
                .ConfigureAwait(false);

            if (role == null)
            {
                if (request?.AutoCreateRole != true)
                    throw new InvalidOperationException($"Role '{roleName}' was not found.");

                await EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Actor = request.Actor
                }, ct).ConfigureAwait(false);

                role = await _db.WebRoles
                    .FirstOrDefaultAsync(r => r.PortalId == portalId
                        && r.RoleName.Equals(roleName, StringComparison.OrdinalIgnoreCase), ct)
                    .ConfigureAwait(false);
            }

            var user = await FindUserAsync(portalId, identifier, request?.LookupMode ?? WorkflowUserLookupMode.Auto, ct)
                .ConfigureAwait(false);
            if (user == null)
                throw new InvalidOperationException($"User '{identifier}' was not found.");

            var existing = await _db.WebUserRoles
                .FirstOrDefaultAsync(ur => ur.UserId == user.UserId && ur.RoleId == role.RoleId, ct)
                .ConfigureAwait(false);

            if (existing != null)
            {
                var effective = existing.EffectiveDate ?? DateTime.UtcNow;
                var isActive = effective <= DateTime.UtcNow && (existing.ExpiryDate == null || existing.ExpiryDate > DateTime.UtcNow);
                if (isActive)
                {
                    return new WorkflowProvisionedMembership
                    {
                        UserId = user.UserId,
                        RoleId = role.RoleId,
                        UserName = user.UserName,
                        RoleName = role.RoleName,
                        AlreadyInRole = true
                    };
                }

                existing.EffectiveDate = DateTime.UtcNow;
                existing.ExpiryDate = null;
            }
            else
            {
                _db.WebUserRoles.Add(new WebUserRoleRow
                {
                    UserId = user.UserId,
                    RoleId = role.RoleId,
                    EffectiveDate = DateTime.UtcNow,
                    ExpiryDate = null,
                    CreatedOnUtc = DateTime.UtcNow
                });
            }

            await _db.SaveChangesAsync(ct).ConfigureAwait(false);

            return new WorkflowProvisionedMembership
            {
                UserId = user.UserId,
                RoleId = role.RoleId,
                UserName = user.UserName,
                RoleName = role.RoleName,
                Added = true
            };
        }

        // ── helpers ─────────────────────────────────────────────────────────

        private static int ResolvePortalId(int requestedPortalId)
        {
            // Standalone Web host: portal 0 means the default/single site.
            return requestedPortalId <= 0 ? 0 : requestedPortalId;
        }

        private Task<WebUserRow> FindExistingUserAsync(int portalId, string userName, string email, CancellationToken ct)
        {
            var normalizedUserName = (userName ?? string.Empty).Trim();
            var normalizedEmail = (email ?? string.Empty).Trim();

            return _db.WebUsers
                .Where(u => u.PortalId == portalId && !u.IsDeleted)
                .Where(u =>
                    (!string.IsNullOrWhiteSpace(normalizedUserName) && u.UserName.Equals(normalizedUserName, StringComparison.OrdinalIgnoreCase)) ||
                    (!string.IsNullOrWhiteSpace(normalizedEmail) && u.Email.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase)))
                .FirstOrDefaultAsync(ct);
        }

        private async Task<WebUserRow> FindUserAsync(int portalId, string identifier, WorkflowUserLookupMode mode, CancellationToken ct)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var query = _db.WebUsers.Where(u => !u.IsDeleted);
            var portalUsers = await query.Where(u => u.PortalId == portalId).ToListAsync(ct).ConfigureAwait(false);
            if (portalUsers.Count == 0)
                portalUsers = await query.ToListAsync(ct).ConfigureAwait(false);

            if (mode == WorkflowUserLookupMode.UserId && int.TryParse(value, out var userId))
                return portalUsers.FirstOrDefault(u => u.UserId == userId);
            if (mode == WorkflowUserLookupMode.UserName)
                return portalUsers.FirstOrDefault(u => u.UserName.Equals(value, StringComparison.OrdinalIgnoreCase));
            if (mode == WorkflowUserLookupMode.Email)
                return portalUsers.FirstOrDefault(u => u.Email.Equals(value, StringComparison.OrdinalIgnoreCase));

            if (int.TryParse(value, out var parsedUserId))
            {
                var byId = portalUsers.FirstOrDefault(u => u.UserId == parsedUserId);
                if (byId != null) return byId;
            }

            if (value.IndexOf('@') > 0)
            {
                var byEmail = portalUsers.FirstOrDefault(u => u.Email.Equals(value, StringComparison.OrdinalIgnoreCase));
                if (byEmail != null) return byEmail;
            }

            return portalUsers.FirstOrDefault(u => u.UserName.Equals(value, StringComparison.OrdinalIgnoreCase));
        }

        private async Task EnsureAutoAssignedRolesAsync(int userId, int portalId, CancellationToken ct)
        {
            if (userId <= 0)
                return;

            var autoRoles = await _db.WebRoles
                .Where(r => r.PortalId == portalId && r.IsAutoAssigned)
                .ToListAsync(ct)
                .ConfigureAwait(false);

            foreach (var role in autoRoles)
            {
                var existing = await _db.WebUserRoles
                    .FirstOrDefaultAsync(ur => ur.UserId == userId && ur.RoleId == role.RoleId, ct)
                    .ConfigureAwait(false);
                if (existing != null)
                    continue;

                _db.WebUserRoles.Add(new WebUserRoleRow
                {
                    UserId = userId,
                    RoleId = role.RoleId,
                    EffectiveDate = null,
                    ExpiryDate = null,
                    CreatedOnUtc = DateTime.UtcNow
                });
            }

            await _db.SaveChangesAsync(ct).ConfigureAwait(false);
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

            return $"{(userName ?? "user").Trim().ToLowerInvariant()}@megaform.local";
        }

        private static string BuildDisplayName(WorkflowUserProvisionRequest request, string userName)
        {
            var display = (request?.DisplayName ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(display))
                return display;

            var first = (request?.FirstName ?? string.Empty).Trim();
            var last = (request?.LastName ?? string.Empty).Trim();
            var combined = ($"{first} {last}").Trim();
            return string.IsNullOrWhiteSpace(combined) ? userName : combined;
        }

        private static string BuildPassword(WorkflowUserProvisionRequest request)
        {
            var explicitPassword = (request?.Password ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(explicitPassword))
                return explicitPassword;

            if (request?.GeneratePasswordIfEmpty == false)
                return string.Empty;

            return $"MF{Guid.NewGuid().ToString("N").Substring(0, 8)}!";
        }

        private static string HashPassword(string password)
        {
            if (string.IsNullOrWhiteSpace(password))
                return string.Empty;
            return new PasswordHasher<object>().HashPassword(new object(), password);
        }

        private static string ResolveIpAddress(WorkflowUserProvisionRequest request)
        {
            var ip = request?.Actor?.IpAddress ?? string.Empty;
            return string.IsNullOrWhiteSpace(ip) ? "127.0.0.1" : ip.Trim();
        }

        private static string ResolveActor(UserContext actor, string fallbackUserName)
        {
            if (actor != null && !string.IsNullOrWhiteSpace(actor.UserName))
                return actor.UserName;
            if (actor != null && actor.UserId > 0)
                return $"user:{actor.UserId}";
            return string.IsNullOrWhiteSpace(fallbackUserName) ? "system" : fallbackUserName;
        }

        private void TrySendWelcomeEmail(WorkflowProvisionedUser user)
        {
            if (_emailSender == null || string.IsNullOrWhiteSpace(user.Email) || string.IsNullOrWhiteSpace(user.Password))
                return;

            try
            {
                var subject = "Your MegaForm account has been created";
                var body = $@"<p>Hi {System.Net.WebUtility.HtmlEncode(user.DisplayName ?? user.UserName)},</p>
<p>An account has been created for you:</p>
<ul>
  <li>Username: <strong>{System.Net.WebUtility.HtmlEncode(user.UserName)}</strong></li>
  <li>Temporary password: <strong>{System.Net.WebUtility.HtmlEncode(user.Password)}</strong></li>
</ul>
<p>Please sign in and change your password as soon as possible.</p>";

                _emailSender.Send(user.Email, subject, body);
            }
            catch (Exception ex)
            {
                _log?.LogWarning("WebWorkflowIdentityProvisioning", $"Failed to send welcome email to {user.Email}: {ex.Message}");
            }
        }
    }
}
