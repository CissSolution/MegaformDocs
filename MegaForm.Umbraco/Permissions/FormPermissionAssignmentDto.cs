using System;
using System.Collections.Generic;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Permission assignment for a single user group on a single MegaForm form.
    /// </summary>
    public class FormPermissionAssignmentDto
    {
        /// <summary>
        /// User group key.
        /// </summary>
        public Guid GroupKey { get; set; }

        /// <summary>
        /// User group alias.
        /// </summary>
        public string GroupAlias { get; set; } = string.Empty;

        /// <summary>
        /// User group display name.
        /// </summary>
        public string GroupName { get; set; } = string.Empty;

        /// <summary>
        /// Permission identifiers assigned to this group for the form
        /// (e.g. "MegaForm.Form.Edit", "MegaForm.Submission.Read").
        /// </summary>
        public ISet<string> Permissions { get; set; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Request body for saving per-form permission assignments.
    /// </summary>
    public class SaveFormPermissionAssignmentsRequest
    {
        public int FormId { get; set; }

        public List<FormPermissionAssignmentDto> Assignments { get; set; } = new List<FormPermissionAssignmentDto>();
    }

    /// <summary>
    /// Result of a save operation for per-form permission assignments.
    /// </summary>
    public class SaveFormPermissionAssignmentsResult
    {
        public bool Success { get; set; }
        public string? Error { get; set; }
        public int UpdatedGroups { get; set; }
    }
}
