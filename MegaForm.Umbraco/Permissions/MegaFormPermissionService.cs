using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Models.Membership.Permissions;
using Umbraco.Cms.Core.Security;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Umbraco-native implementation of <see cref="IMegaFormPermissionService"/>.
    /// Evaluates the current backoffice user against their groups' default and
    /// granular permissions in the <see cref="MegaFormPermissionConstants.GranularContext"/> context.
    /// </summary>
    public class MegaFormPermissionService : IMegaFormPermissionService
    {
        private readonly IBackOfficeSecurityAccessor _backOfficeSecurityAccessor;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public MegaFormPermissionService(
            IBackOfficeSecurityAccessor backOfficeSecurityAccessor,
            IHttpContextAccessor httpContextAccessor)
        {
            _backOfficeSecurityAccessor = backOfficeSecurityAccessor;
            _httpContextAccessor = httpContextAccessor;
        }

        /// <inheritdoc />
        public bool HasSectionAccess()
        {
            var user = GetCurrentUser();
            if (user == null) return false;

            return user.AllowedSections.Contains(MegaFormPermissionConstants.SectionAlias, StringComparer.OrdinalIgnoreCase);
        }

        /// <inheritdoc />
        public bool HasPermission(string permissionLetter)
        {
            if (!HasSectionAccess()) return false;

            var user = GetCurrentUser();
            if (IsAdmin(user)) return true;

            return user!.Groups.Any(g => g.Permissions.Contains(permissionLetter, StringComparer.OrdinalIgnoreCase));
        }

        /// <inheritdoc />
        public bool HasPermission(string permissionLetter, int formId)
        {
            var key = MegaFormGranularPermission.GetEntityKey(formId);
            return HasPermission(permissionLetter, key);
        }

        /// <inheritdoc />
        public bool HasPermission(string permissionLetter, Guid entityKey)
        {
            if (!HasSectionAccess()) return false;

            var user = GetCurrentUser();
            if (IsAdmin(user)) return true;

            foreach (var group in user!.Groups)
            {
                // Default permission grants access to every entity unless a granular
                // permission is present that removes it. For now we treat default as
                // "allow all entities" and granular as optional extra restriction.
                if (group.Permissions.Contains(permissionLetter, StringComparer.OrdinalIgnoreCase))
                {
                    return true;
                }

                // Explicit granular permission on this entity.
                if (group.GranularPermissions.Any(gp =>
                    MatchesContext(gp) &&
                    gp.Key == entityKey &&
                    string.Equals(gp.Permission, permissionLetter, StringComparison.OrdinalIgnoreCase)))
                {
                    return true;
                }
            }

            return false;
        }

        /// <inheritdoc />
        public MegaFormPermissionSet GetPermissions()
        {
            var user = GetCurrentUser();
            var set = new MegaFormPermissionSet
            {
                HasSectionAccess = HasSectionAccess(),
                IsAdmin = IsAdmin(user)
            };

            if (user == null) return set;

            foreach (var group in user.Groups)
            {
                foreach (var letter in group.Permissions)
                {
                    set.GlobalPermissions.Add(letter);
                }

                foreach (var gp in group.GranularPermissions.Where(MatchesContext))
                {
                    var key = gp.Key?.ToString("D") ?? string.Empty;
                    if (string.IsNullOrEmpty(key)) continue;

                    if (!set.GranularPermissions.TryGetValue(key, out var perms))
                    {
                        perms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        set.GranularPermissions[key] = perms;
                    }

                    perms.Add(gp.Permission);
                }
            }

            return set;
        }

        /// <inheritdoc />
        public MegaFormPermissionSet GetPermissionsForForm(int formId)
        {
            var set = GetPermissions();
            var key = MegaFormGranularPermission.GetEntityKey(formId).ToString("D");

            // For client convenience, also surface the form-specific effective permissions
            // under the form's derived key.
            if (!set.GranularPermissions.ContainsKey(key))
            {
                set.GranularPermissions[key] = new HashSet<string>(set.GlobalPermissions, StringComparer.OrdinalIgnoreCase);
            }
            else
            {
                foreach (var letter in set.GlobalPermissions)
                {
                    set.GranularPermissions[key].Add(letter);
                }
            }

            return set;
        }

        private IUser? GetCurrentUser()
        {
            // Prefer the Umbraco backoffice security accessor, which works for both
            // cookie and OpenIddict bearer authenticated requests.
            var security = _backOfficeSecurityAccessor.BackOfficeSecurity;
            var user = security?.CurrentUser;
            if (user != null) return user;

            // Fallback to the HTTP context identity (useful in edge cases / unit tests).
            var httpUser = _httpContextAccessor.HttpContext?.User;
            if (httpUser?.Identity?.IsAuthenticated != true) return null;

            // We cannot reconstruct an IUser from claims, but we can still allow
            // callers to fall back to the HTTP context if needed. Returning null
            // keeps the permission service conservative.
            return null;
        }

        private static bool IsAdmin(IUser? user)
        {
            if (user == null) return false;

            // The built-in Umbraco administrator group is aliased "admin".
            return user.Groups.Any(g =>
                string.Equals(g.Alias, "admin", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(g.Alias, "administrators", StringComparison.OrdinalIgnoreCase));
        }

        private static bool MatchesContext(IGranularPermission permission)
            => string.Equals(permission.Context, MegaFormPermissionConstants.GranularContext, StringComparison.OrdinalIgnoreCase);
    }
}
