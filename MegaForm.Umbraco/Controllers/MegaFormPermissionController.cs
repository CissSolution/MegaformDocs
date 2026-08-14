using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Umbraco.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Models.Membership.Permissions;
using Umbraco.Cms.Core.Security;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Exposes the current user's MegaForm permissions and management endpoints
    /// for per-form granular permission assignments.
    /// </summary>
    [Route("umbraco/MegaForm/MegaFormApi/[action]")]
    [Authorize(Policy = "MegaFormBackOffice")]
    public class MegaFormPermissionController : UmbracoApiController
    {
        private readonly IMegaFormPermissionService _permissionService;
        private readonly IUserGroupService _userGroupService;
        private readonly IBackOfficeSecurityAccessor _backOfficeSecurityAccessor;

        /// <summary>
        /// Permission identifiers that make sense to assign per form.
        /// </summary>
        private static readonly string[] FormAssignablePermissions =
        {
            MegaFormPermissionConstants.BrowseLetter,
            MegaFormPermissionConstants.EditLetter,
            MegaFormPermissionConstants.DeleteLetter,
            MegaFormPermissionConstants.ViewSubmissionsLetter,
            MegaFormPermissionConstants.ManageSubmissionsLetter,
            MegaFormPermissionConstants.WorkflowLetter,
        };

        public MegaFormPermissionController(
            IMegaFormPermissionService permissionService,
            IUserGroupService userGroupService,
            IBackOfficeSecurityAccessor backOfficeSecurityAccessor)
        {
            _permissionService = permissionService;
            _userGroupService = userGroupService;
            _backOfficeSecurityAccessor = backOfficeSecurityAccessor;
        }

        /// <summary>
        /// GET /umbraco/MegaForm/MegaFormApi/CurrentPermissions
        /// Returns the current user's effective MegaForm permissions.
        /// </summary>
        [HttpGet]
        public IActionResult CurrentPermissions()
        {
            return Ok(_permissionService.GetPermissions());
        }

        /// <summary>
        /// GET /umbraco/MegaForm/MegaFormApi/PermissionsForForm?formId=123
        /// Returns the current user's effective MegaForm permissions for a specific form.
        /// </summary>
        [HttpGet]
        public IActionResult PermissionsForForm(int formId)
        {
            return Ok(_permissionService.GetPermissionsForForm(formId));
        }

        /// <summary>
        /// GET /umbraco/MegaForm/MegaFormApi/HasPermission?letter=E&formId=123
        /// Quick check endpoint used by front-end conditions.
        /// </summary>
        [HttpGet]
        public IActionResult HasPermission(string letter, int? formId)
        {
            var allowed = formId.HasValue
                ? _permissionService.HasPermission(letter, formId.Value)
                : _permissionService.HasPermission(letter);

            return Ok(new { letter, formId, allowed });
        }

        /// <summary>
        /// GET /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments?formId=123
        /// Returns every user group and the MegaForm permissions currently assigned
        /// to it for the specified form.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> FormPermissionAssignments(int formId)
        {
            if (!_permissionService.HasPermission(MegaFormPermissionConstants.ManagePermissionsLetter, formId))
            {
                return Forbid();
            }

            var entityKey = MegaFormGranularPermission.GetEntityKey(formId);
            var groups = await _userGroupService.GetAllAsync(0, int.MaxValue);
            var assignments = new List<FormPermissionAssignmentDto>();

            foreach (var group in groups.Items)
            {
                var permissions = group.GranularPermissions
                    .Where(gp =>
                        string.Equals(gp.Context, MegaFormPermissionConstants.GranularContext, StringComparison.OrdinalIgnoreCase) &&
                        gp.Key == entityKey)
                    .Select(gp => gp.Permission)
                    .Where(p => FormAssignablePermissions.Contains(p, StringComparer.OrdinalIgnoreCase))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                // Always include the global default permissions as implicit grants.
                foreach (var letter in group.Permissions)
                {
                    if (FormAssignablePermissions.Contains(letter, StringComparer.OrdinalIgnoreCase))
                    {
                        permissions.Add(letter);
                    }
                }

                assignments.Add(new FormPermissionAssignmentDto
                {
                    GroupKey = group.Key,
                    GroupAlias = group.Alias,
                    GroupName = group.Name ?? group.Alias,
                    Permissions = permissions,
                });
            }

            return Ok(new
            {
                formId,
                entityKey = entityKey.ToString("D"),
                assignablePermissions = FormAssignablePermissions,
                assignments,
            });
        }

        /// <summary>
        /// POST /umbraco/MegaForm/MegaFormApi/FormPermissionAssignments
        /// Saves per-form granular permission assignments for the specified form.
        /// Only groups listed in the request are updated.
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> FormPermissionAssignments([FromBody] SaveFormPermissionAssignmentsRequest request)
        {
            if (request == null || request.FormId <= 0)
            {
                return BadRequest(new SaveFormPermissionAssignmentsResult
                {
                    Success = false,
                    Error = "A valid formId is required."
                });
            }

            if (!_permissionService.HasPermission(MegaFormPermissionConstants.ManagePermissionsLetter, request.FormId))
            {
                return Forbid();
            }

            var currentUser = _backOfficeSecurityAccessor.BackOfficeSecurity?.CurrentUser;
            if (currentUser == null)
            {
                return Unauthorized(new SaveFormPermissionAssignmentsResult
                {
                    Success = false,
                    Error = "Current user could not be determined."
                });
            }

            var entityKey = MegaFormGranularPermission.GetEntityKey(request.FormId);
            var updatedCount = 0;

            foreach (var assignment in request.Assignments)
            {
                var group = await _userGroupService.GetAsync(assignment.GroupKey);
                if (group == null) continue;

                // Remove existing MegaForm granular permissions for this form key.
                var toRemove = group.GranularPermissions
                    .Where(gp =>
                        string.Equals(gp.Context, MegaFormPermissionConstants.GranularContext, StringComparison.OrdinalIgnoreCase) &&
                        gp.Key == entityKey)
                    .ToList();

                foreach (var gp in toRemove)
                {
                    group.GranularPermissions.Remove(gp);
                }

                // Add the requested permissions.
                foreach (var permission in assignment.Permissions ?? Enumerable.Empty<string>())
                {
                    if (!FormAssignablePermissions.Contains(permission, StringComparer.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    group.GranularPermissions.Add(MegaFormGranularPermission.ForEntity(entityKey, permission));
                }

                var result = await _userGroupService.UpdateAsync(group, currentUser.Key);
                if (result.Success)
                {
                    updatedCount++;
                }
                else
                {
                    return StatusCode(500, new SaveFormPermissionAssignmentsResult
                    {
                        Success = false,
                        Error = $"Failed to update group '{group.Alias}'. Status: {result.Status}"
                    });
                }
            }

            return Ok(new SaveFormPermissionAssignmentsResult
            {
                Success = true,
                UpdatedGroups = updatedCount,
            });
        }
    }
}
