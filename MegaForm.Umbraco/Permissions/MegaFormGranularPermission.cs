using System;
using Umbraco.Cms.Core.Models.Membership.Permissions;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// A granular permission entry for a single MegaForm entity (typically a form).
    /// Stored in <see cref="IUserGroup.GranularPermissions"/> and keyed by a stable
    /// <see cref="Guid"/> derived from the MegaForm entity id.
    /// </summary>
    public class MegaFormGranularPermission : IGranularPermission
    {
        /// <inheritdoc />
        public string Context => MegaFormPermissionConstants.GranularContext;

        /// <inheritdoc />
        public Guid? Key { get; set; }

        /// <inheritdoc />
        public string Permission { get; set; } = string.Empty;

        /// <summary>
        /// Creates a global (non-entity-bound) MegaForm permission entry.
        /// </summary>
        public static MegaFormGranularPermission Global(string permissionLetter)
            => new() { Key = null, Permission = permissionLetter };

        /// <summary>
        /// Creates an entity-bound MegaForm permission entry.
        /// </summary>
        public static MegaFormGranularPermission ForEntity(Guid key, string permissionLetter)
            => new() { Key = key, Permission = permissionLetter };

        /// <summary>
        /// Creates a stable <see cref="Guid"/> for a MegaForm integer id.
        /// This avoids adding a Guid column to shared Core entities.
        /// </summary>
        public static Guid GetEntityKey(int entityId)
        {
            // Deterministic GUID from a well-known namespace + entity id.
            // Same algorithm as UUIDv5 but using .NET's built-in derivation.
            return GuidUtility.Derive(MegaFormPermissionConstants.GranularContext, entityId.ToString());
        }
    }
}
