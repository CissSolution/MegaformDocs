using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using MegaForm.Oqtane.Server.Data;
using Oqtane.Models;
using Oqtane.Repository;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Services
{
    public class OqtaneWorkflowIdentityProvisioningService : IWorkflowIdentityProvisioningService
    {
        private readonly IUserRepository _users;
        private readonly IRoleRepository _roles;
        private readonly IUserRoleRepository _userRoles;
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        public OqtaneWorkflowIdentityProvisioningService(
            IUserRepository users,
            IRoleRepository roles,
            IUserRoleRepository userRoles,
            IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _users = users ?? throw new ArgumentNullException(nameof(users));
            _roles = roles ?? throw new ArgumentNullException(nameof(roles));
            _userRoles = userRoles ?? throw new ArgumentNullException(nameof(userRoles));
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
        }

        public Task<WorkflowProvisionedRole> EnsureRoleAsync(WorkflowRoleProvisionRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var siteId = ResolveSiteId(request != null ? request.PortalId : 0);
            var roleName = ((request != null ? request.RoleName : null) ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");

            var existing = (_roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
                .FirstOrDefault(role => role != null
                    && role.SiteId == siteId
                    && string.Equals(role.Name, roleName, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                return Task.FromResult(new WorkflowProvisionedRole
                {
                    RoleId = existing.RoleId,
                    RoleName = existing.Name,
                    Description = existing.Description ?? string.Empty,
                    AlreadyExisted = true
                });
            }

            var created = _roles.AddRole(new Role
            {
                SiteId = siteId,
                Name = roleName,
                Description = request != null ? (request.Description ?? string.Empty) : string.Empty,
                IsAutoAssigned = false,
                IsSystem = request != null && request.IsSystemRole
            });

            return Task.FromResult(new WorkflowProvisionedRole
            {
                RoleId = created != null ? (int?)created.RoleId : null,
                RoleName = created != null ? created.Name : roleName,
                Description = created != null ? (created.Description ?? string.Empty) : string.Empty,
                Created = true
            });
        }

        public Task<WorkflowProvisionedUser> EnsureUserAsync(WorkflowUserProvisionRequest request, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();

            var siteId = ResolveSiteId(request != null ? request.PortalId : 0);
            var userName = BuildUserName(request != null ? request.UserName : null, request != null ? request.Email : null);
            var email = BuildEmail(request != null ? request.Email : null, userName);
            var existing = FindExistingUser(siteId, userName, email);
            var generatedPassword = BuildPassword(request);

            if (existing != null)
            {
                var updated = false;
                if (request != null && request.UpdateIfExists)
                {
                    updated = UpdateUserRecords(existing, request, email, generatedPassword);
                }
                EnsureAutoAssignedRoles(existing.UserId, siteId);

                return Task.FromResult(new WorkflowProvisionedUser
                {
                    UserId = existing.UserId,
                    UserName = existing.Username,
                    Email = existing.Email,
                    DisplayName = existing.DisplayName,
                    Password = string.Empty,
                    AlreadyExisted = true,
                    Updated = updated
                });
            }

            var created = InsertUserRecords(siteId, userName, BuildDisplayName(request, userName), email, generatedPassword, request);
            EnsureAutoAssignedRoles(created.UserId, siteId);

            return Task.FromResult(new WorkflowProvisionedUser
            {
                UserId = created.UserId,
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

            var siteId = ResolveSiteId(request != null ? request.PortalId : 0);
            var roleName = ((request != null ? request.RoleName : null) ?? string.Empty).Trim();
            var identifier = ((request != null ? request.UserIdentifier : null) ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(roleName))
                throw new InvalidOperationException("RoleName is required.");
            if (string.IsNullOrWhiteSpace(identifier))
                throw new InvalidOperationException("UserIdentifier is required.");

            var role = (_roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
                .FirstOrDefault(r => r != null
                    && r.SiteId == siteId
                    && string.Equals(r.Name, roleName, StringComparison.OrdinalIgnoreCase));
            if (role == null)
            {
                if (request == null || !request.AutoCreateRole)
                    throw new InvalidOperationException("Role '" + roleName + "' was not found.");

                await EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = siteId,
                    RoleName = roleName,
                    Actor = request.Actor
                }, ct).ConfigureAwait(false);

                role = (_roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
                    .FirstOrDefault(r => r != null
                        && r.SiteId == siteId
                        && string.Equals(r.Name, roleName, StringComparison.OrdinalIgnoreCase));
            }

            var user = FindUser(siteId, identifier, request != null ? request.LookupMode : WorkflowUserLookupMode.Auto);
            if (user == null)
                throw new InvalidOperationException("User '" + identifier + "' was not found.");

            var existingMembership = _userRoles.GetUserRole(user.UserId, role.RoleId, tracking: false);
            if (existingMembership != null)
            {
                if (Utilities.IsEffectiveAndNotExpired(existingMembership.EffectiveDate, existingMembership.ExpiryDate))
                {
                    return new WorkflowProvisionedMembership
                    {
                        UserId = user.UserId,
                        RoleId = role.RoleId,
                        UserName = user.Username,
                        RoleName = role.Name,
                        AlreadyInRole = true
                    };
                }

                existingMembership.EffectiveDate = DateTime.UtcNow;
                existingMembership.ExpiryDate = null;
                existingMembership.ModifiedBy = ResolveAuditActor(request != null ? request.Actor : null, user.Username);
                existingMembership.ModifiedOn = DateTime.UtcNow;
                _userRoles.UpdateUserRole(existingMembership);
            }
            else
            {
                _userRoles.AddUserRole(new UserRole
                {
                    UserId = user.UserId,
                    RoleId = role.RoleId,
                    EffectiveDate = DateTime.UtcNow,
                    ExpiryDate = null
                });
            }

            return new WorkflowProvisionedMembership
            {
                UserId = user.UserId,
                RoleId = role.RoleId,
                UserName = user.Username,
                RoleName = role.Name,
                Added = true
            };
        }

        private int ResolveSiteId(int requestedSiteId)
        {
            if (requestedSiteId <= 0)
                throw new InvalidOperationException("A valid Oqtane siteId is required.");
            return requestedSiteId;
        }

        private User FindExistingUser(int siteId, string userName, string email)
        {
            var users = _users.GetUsers() ?? Enumerable.Empty<User>();
            var siteMatch = users.FirstOrDefault(u => u != null && u.SiteId == siteId &&
                (string.Equals(u.Username, userName, StringComparison.OrdinalIgnoreCase)
                 || string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)));
            if (siteMatch != null)
                return siteMatch;

            return users.FirstOrDefault(u => u != null &&
                (string.Equals(u.Username, userName, StringComparison.OrdinalIgnoreCase)
                 || string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)));
        }

        private User FindUser(int siteId, string identifier, WorkflowUserLookupMode lookupMode)
        {
            var value = (identifier ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value))
                return null;

            var allUsers = (_users.GetUsers() ?? Enumerable.Empty<User>()).Where(u => u != null).ToList();
            var users = allUsers.Where(u => u.SiteId == siteId).ToList();
            if (users.Count == 0)
                users = allUsers;
            if (lookupMode == WorkflowUserLookupMode.UserId && int.TryParse(value, out var userId))
                return users.FirstOrDefault(u => u.UserId == userId);
            if (lookupMode == WorkflowUserLookupMode.UserName)
                return users.FirstOrDefault(u => string.Equals(u.Username, value, StringComparison.OrdinalIgnoreCase));
            if (lookupMode == WorkflowUserLookupMode.Email)
                return users.FirstOrDefault(u => string.Equals(u.Email, value, StringComparison.OrdinalIgnoreCase));

            if (int.TryParse(value, out var parsedUserId))
            {
                var byId = users.FirstOrDefault(u => u.UserId == parsedUserId);
                if (byId != null) return byId;
            }

            if (value.IndexOf('@') > 0)
            {
                var byEmail = users.FirstOrDefault(u => string.Equals(u.Email, value, StringComparison.OrdinalIgnoreCase));
                if (byEmail != null) return byEmail;
            }

            return users.FirstOrDefault(u => string.Equals(u.Username, value, StringComparison.OrdinalIgnoreCase));
        }

        private User InsertUserRecords(int siteId, string userName, string displayName, string email, string password, WorkflowUserProvisionRequest request)
        {
            using var db = _dbContextFactory.CreateDbContext();
            using var connection = db.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
                connection.Open();

            var userInsertSql = BuildUserInsertSql(connection);
            using var transaction = connection.BeginTransaction();
            try
            {
                var now = DateTime.UtcNow;
                var actorName = ResolveAuditActor(request != null ? request.Actor : null, userName);
                var ipAddress = ResolveIpAddress(request);
                var aspNetId = Guid.NewGuid().ToString();
                var passwordHash = new PasswordHasher<object>().HashPassword(new object(), password);

                ExecuteNonQuery(connection, transaction, @"
INSERT INTO AspNetUsers
    (Id, UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed, PasswordHash, SecurityStamp, ConcurrencyStamp, PhoneNumber, PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnd, LockoutEnabled, AccessFailedCount)
VALUES
    (@Id, @UserName, @NormalizedUserName, @Email, @NormalizedEmail, @EmailConfirmed, @PasswordHash, @SecurityStamp, @ConcurrencyStamp, @PhoneNumber, @PhoneNumberConfirmed, @TwoFactorEnabled, @LockoutEnd, @LockoutEnabled, @AccessFailedCount);",
                    ("@Id", aspNetId),
                    ("@UserName", userName),
                    ("@NormalizedUserName", userName.ToUpperInvariant()),
                    ("@Email", email),
                    ("@NormalizedEmail", email.ToUpperInvariant()),
                    ("@EmailConfirmed", true),
                    ("@PasswordHash", passwordHash),
                    ("@SecurityStamp", Guid.NewGuid().ToString("N")),
                    ("@ConcurrencyStamp", Guid.NewGuid().ToString()),
                    ("@PhoneNumber", DBNull.Value),
                    ("@PhoneNumberConfirmed", false),
                    ("@TwoFactorEnabled", false),
                    ("@LockoutEnd", DBNull.Value),
                    ("@LockoutEnabled", false),
                    ("@AccessFailedCount", 0));

                var userId = Convert.ToInt32(ExecuteScalar(connection, transaction, userInsertSql, 
                    ("@Username", userName),
                    ("@DisplayName", displayName),
                    ("@Email", email),
                    ("@LastIpAddress", ipAddress),
                    ("@CreatedBy", actorName),
                    ("@CreatedOn", now),
                    ("@ModifiedBy", actorName),
                    ("@ModifiedOn", now),
                    ("@IsDeleted", false),
                    ("@TwoFactorRequired", false),
                    ("@TwoFactorCode", DBNull.Value),
                    ("@TwoFactorExpiry", DBNull.Value),
                    ("@TimeZoneId", DBNull.Value),
                    ("@CultureCode", DBNull.Value)));

                transaction.Commit();

                return new User
                {
                    UserId = userId,
                    SiteId = siteId,
                    Username = userName,
                    DisplayName = displayName,
                    Email = email
                };
            }
            catch
            {
                try { transaction.Rollback(); } catch { }
                throw;
            }
        }

        private bool UpdateUserRecords(User existing, WorkflowUserProvisionRequest request, string email, string password)
        {
            if (existing == null)
                return false;

            var displayName = BuildDisplayName(request, existing.Username);
            var ipAddress = ResolveIpAddress(request);
            var actorName = ResolveAuditActor(request != null ? request.Actor : null, existing.Username);
            var now = DateTime.UtcNow;
            var passwordHash = new PasswordHasher<object>().HashPassword(new object(), password);

            using var db = _dbContextFactory.CreateDbContext();
            using var connection = db.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
                connection.Open();
            using var transaction = connection.BeginTransaction();

            try
            {
                ExecuteNonQuery(connection, transaction, @"
UPDATE AspNetUsers
SET UserName = @UserName,
    NormalizedUserName = @NormalizedUserName,
    Email = @Email,
    NormalizedEmail = @NormalizedEmail,
    EmailConfirmed = @EmailConfirmed,
    PasswordHash = @PasswordHash,
    AccessFailedCount = @AccessFailedCount,
    LockoutEnd = @LockoutEnd
WHERE UPPER(UserName) = @LookupUserName OR UPPER(Email) = @LookupEmail;",
                    ("@UserName", existing.Username),
                    ("@NormalizedUserName", existing.Username.ToUpperInvariant()),
                    ("@Email", email),
                    ("@NormalizedEmail", email.ToUpperInvariant()),
                    ("@EmailConfirmed", true),
                    ("@PasswordHash", passwordHash),
                    ("@AccessFailedCount", 0),
                    ("@LockoutEnd", DBNull.Value),
                    ("@LookupUserName", existing.Username.ToUpperInvariant()),
                    ("@LookupEmail", (existing.Email ?? string.Empty).ToUpperInvariant()));

                ExecuteNonQuery(connection, transaction, @"
UPDATE [User]
SET DisplayName = @DisplayName,
    Email = @Email,
    LastIpAddress = @LastIpAddress,
    ModifiedBy = @ModifiedBy,
    ModifiedOn = @ModifiedOn,
    IsDeleted = @IsDeleted,
    TwoFactorRequired = @TwoFactorRequired
WHERE UserId = @UserId;",
                    ("@DisplayName", displayName),
                    ("@Email", email),
                    ("@LastIpAddress", ipAddress),
                    ("@ModifiedBy", actorName),
                    ("@ModifiedOn", now),
                    ("@IsDeleted", false),
                    ("@TwoFactorRequired", false),
                    ("@UserId", existing.UserId));

                transaction.Commit();
                existing.DisplayName = displayName;
                existing.Email = email;
                return true;
            }
            catch
            {
                try { transaction.Rollback(); } catch { }
                throw;
            }
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

            return request == null || request.GeneratePasswordIfEmpty
                ? "MegaForm!2026"
                : "MegaForm!2026";
        }

        private void EnsureAutoAssignedRoles(int userId, int siteId)
        {
            if (userId <= 0 || siteId <= 0)
                return;

            var roles = (_roles.GetRoles(siteId, true) ?? Enumerable.Empty<Role>())
                .Where(role => role != null && role.SiteId == siteId && role.IsAutoAssigned)
                .ToList();
            foreach (var role in roles)
            {
                if (_userRoles.GetUserRole(userId, role.RoleId, tracking: false) != null)
                    continue;

                _userRoles.AddUserRole(new UserRole
                {
                    UserId = userId,
                    RoleId = role.RoleId,
                    EffectiveDate = null,
                    ExpiryDate = null,
                    IgnoreSecurityStamp = true
                });
            }
        }

        private static string BuildUserInsertSql(IDbConnection connection)
        {
            var provider = connection.GetType().FullName ?? string.Empty;
            var columns = new List<string>
            {
                "Username",
                "DisplayName",
                "Email",
                "LastIpAddress",
                "CreatedBy",
                "CreatedOn",
                "ModifiedBy",
                "ModifiedOn",
                "IsDeleted",
                "TwoFactorRequired",
                "TwoFactorCode",
                "TwoFactorExpiry"
            };

            var existingColumns = GetUserTableColumns(connection);
            if (existingColumns.Contains("TimeZoneId"))
                columns.Add("TimeZoneId");
            if (existingColumns.Contains("CultureCode"))
                columns.Add("CultureCode");

            var tableName = QuoteIdentifier("User", provider);
            var columnList = string.Join(", ", columns.Select(column => QuoteIdentifier(column, provider)));
            var valueList = string.Join(", ", columns.Select(column => "@" + column));
            var returning = BuildIdentitySelect(provider);

            return "INSERT INTO " + tableName + "\r\n    (" + columnList + ")\r\nVALUES\r\n    (" + valueList + ")" + returning;
        }

        private static HashSet<string> GetUserTableColumns(IDbConnection connection)
        {
            var provider = connection.GetType().FullName ?? string.Empty;
            var columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            try
            {
                string sql;
                if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                    sql = "PRAGMA table_info(\"User\")";
                else if (provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                    sql = "SELECT column_name FROM information_schema.columns WHERE table_name = 'User'";
                else if (provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                    sql = "SHOW COLUMNS FROM `User`";
                else
                    sql = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'User'";

                using var command = connection.CreateCommand();
                command.CommandText = sql;
                using var reader = command.ExecuteReader();
                while (reader.Read())
                {
                    var value = provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0
                        ? reader["name"]
                        : reader.GetValue(0);
                    var name = Convert.ToString(value);
                    if (!string.IsNullOrWhiteSpace(name))
                        columns.Add(name);
                }
            }
            catch
            {
                // Use the minimum Oqtane user columns when schema discovery is not available.
            }

            return columns;
        }

        private static string QuoteIdentifier(string identifier, string provider)
        {
            if ((provider ?? string.Empty).IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                return "\"" + identifier + "\"";
            if ((provider ?? string.Empty).IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                return "`" + identifier + "`";
            return "[" + identifier + "]";
        }

        private static string BuildIdentitySelect(string provider)
        {
            provider = provider ?? string.Empty;
            if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                return ";\r\nSELECT last_insert_rowid();";
            if (provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                return "\r\nRETURNING \"UserId\";";
            if (provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                return ";\r\nSELECT LAST_INSERT_ID();";
            return ";\r\nSELECT CAST(SCOPE_IDENTITY() AS int);";
        }

        private static int ExecuteNonQuery(IDbConnection connection, IDbTransaction transaction, string sql, params (string Name, object Value)[] parameters)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = sql;
            AddParameters(command, parameters);
            return command.ExecuteNonQuery();
        }

        private static object ExecuteScalar(IDbConnection connection, IDbTransaction transaction, string sql, params (string Name, object Value)[] parameters)
        {
            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = sql;
            AddParameters(command, parameters);
            return command.ExecuteScalar();
        }

        private static void AddParameters(IDbCommand command, params (string Name, object Value)[] parameters)
        {
            foreach (var parameter in parameters)
            {
                var dbParameter = command.CreateParameter();
                dbParameter.ParameterName = parameter.Name;
                dbParameter.Value = parameter.Value ?? DBNull.Value;
                command.Parameters.Add(dbParameter);
            }
        }

        private static string ResolveIpAddress(WorkflowUserProvisionRequest request)
        {
            var ip = request != null && request.Actor != null ? (request.Actor.IpAddress ?? string.Empty).Trim() : string.Empty;
            return string.IsNullOrWhiteSpace(ip) ? "127.0.0.1" : ip;
        }

        private static string ResolveAuditActor(MegaForm.Core.Services.UserContext actor, string fallbackUserName)
        {
            if (actor != null && !string.IsNullOrWhiteSpace(actor.UserName))
                return actor.UserName;
            if (actor != null && actor.UserId > 0)
                return "user:" + actor.UserId;
            return string.IsNullOrWhiteSpace(fallbackUserName) ? "system" : fallbackUserName;
        }
    }
}
