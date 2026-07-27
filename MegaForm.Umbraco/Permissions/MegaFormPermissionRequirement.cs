using Microsoft.AspNetCore.Authorization;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Authorization requirement that checks a single MegaForm permission letter.
    /// </summary>
    public class MegaFormPermissionRequirement : IAuthorizationRequirement
    {
        /// <summary>
        /// The permission letter to check (see <see cref="MegaFormPermissionConstants"/>).
        /// </summary>
        public string PermissionLetter { get; }

        /// <summary>
        /// Optional name of a route/query parameter that contains the form id.
        /// When set, the handler checks for a granular permission on that form.
        /// </summary>
        public string? FormIdParameterName { get; }

        public MegaFormPermissionRequirement(string permissionLetter, string? formIdParameterName = null)
        {
            PermissionLetter = permissionLetter;
            FormIdParameterName = formIdParameterName;
        }
    }
}
