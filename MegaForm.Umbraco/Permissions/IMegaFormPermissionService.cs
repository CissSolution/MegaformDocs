using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Evaluates MegaForm backoffice permissions for the current Umbraco user.
    /// </summary>
    public interface IMegaFormPermissionService
    {
        /// <summary>
        /// Returns true if the current user has access to the MegaForm section.
        /// </summary>
        bool HasSectionAccess();

        /// <summary>
        /// Returns true if the current user has a default (coarse) MegaForm permission letter.
        /// </summary>
        bool HasPermission(string permissionLetter);

        /// <summary>
        /// Returns true if the current user has the given permission for the specified form.
        /// Falls back to the default permission if no granular permission exists.
        /// </summary>
        bool HasPermission(string permissionLetter, int formId);

        /// <summary>
        /// Returns true if the current user has the given permission for the specified entity key.
        /// Falls back to the default permission if no granular permission exists.
        /// </summary>
        bool HasPermission(string permissionLetter, Guid entityKey);

        /// <summary>
        /// Gets the effective permission set for the current user.
        /// </summary>
        MegaFormPermissionSet GetPermissions();

        /// <summary>
        /// Gets the effective permission set for a specific form.
        /// </summary>
        MegaFormPermissionSet GetPermissionsForForm(int formId);
    }

    /// <summary>
    /// Serializable permission set returned to the Bellissima front-end.
    /// </summary>
    public class MegaFormPermissionSet
    {
        public bool HasSectionAccess { get; set; }
        public bool IsAdmin { get; set; }
        public ISet<string> GlobalPermissions { get; set; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        public IDictionary<string, ISet<string>> GranularPermissions { get; set; } = new Dictionary<string, ISet<string>>(StringComparer.OrdinalIgnoreCase);

        public bool Has(string permissionLetter)
            => GlobalPermissions.Contains(permissionLetter);

        public bool HasForEntity(Guid entityKey, string permissionLetter)
            => GranularPermissions.TryGetValue(entityKey.ToString("D"), out var perms)
                && perms.Contains(permissionLetter);
    }
}
