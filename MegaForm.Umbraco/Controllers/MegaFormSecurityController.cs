using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Umbraco.Permissions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// [Security 2026-08-18] MegaForm's package permissions, per Umbraco user group.
    ///
    /// Umbraco Forms puts this under Security → a group → "Package Permissions", a plain list of
    /// toggles (Manage Forms, View Entries, Edit Entries…). MegaForm already registers the same
    /// kind of permissions as Umbraco GRANULAR permissions on the user group, so the toggles here
    /// read and write the group itself — no second permission store, and the answer stays true if
    /// someone edits the group in the Users section instead.
    ///
    /// Admin-only: granting rights is not something a form editor may do. The policy on the class
    /// proves backoffice membership; the check inside proves administrator.
    /// </summary>
    [Route("/umbraco/MegaForm/MegaFormApi/Security")]
    [Authorize("MegaFormApi")]
    public class MegaFormSecurityController : UmbracoApiController
    {
        private readonly IUserGroupService _userGroupService;
        private readonly MegaForm.Core.Interfaces.IPlatformContext _platform;

        public MegaFormSecurityController(
            IUserGroupService userGroupService,
            MegaForm.Core.Interfaces.IPlatformContext platform)
        {
            _userGroupService = userGroupService;
            _platform = platform;
        }

        /// <summary>The permissions this package defines, in the order the screen shows them.</summary>
        private static readonly (string Letter, string Name, string Description)[] Catalog = new[]
        {
            (MegaFormPermissionConstants.BrowseLetter,           "Browse forms",      "See the MegaForm section and the list of forms."),
            (MegaFormPermissionConstants.CreateLetter,           "Create forms",      "Create a new form."),
            (MegaFormPermissionConstants.EditLetter,             "Edit forms",        "Open the builder and change a form."),
            (MegaFormPermissionConstants.DeleteLetter,           "Delete forms",      "Remove a form and its submissions."),
            (MegaFormPermissionConstants.ViewSubmissionsLetter,  "View entries",      "Read submitted entries and export them."),
            (MegaFormPermissionConstants.ManageSubmissionsLetter,"Manage entries",    "Edit, reassign or delete submitted entries."),
            (MegaFormPermissionConstants.WorkflowLetter,         "Manage workflows",  "Edit the BPMN workflow attached to a form."),
            (MegaFormPermissionConstants.ReportsLetter,          "Read reports",      "Open analytics and reports."),
            (MegaFormPermissionConstants.LanguagesLetter,        "Manage languages",  "Edit the translation catalogues."),
            (MegaFormPermissionConstants.TemplatesLetter,        "Manage templates",  "Save and install form templates."),
            (MegaFormPermissionConstants.AiLetter,               "Use AI",            "Use the AI designer and assistants."),
        };

        private bool IsAdmin => _platform?.IsAdmin == true;

        [HttpGet("Groups")]
        public async Task<IActionResult> Groups()
        {
            if (!IsAdmin) return Forbid();

            var groups = await _userGroupService.GetAllAsync(0, 500);
            var rows = (groups?.Items ?? Enumerable.Empty<IUserGroup>())
                .Where(g => g != null)
                .Select(g => new
                {
                    key = g.Key,
                    alias = g.Alias,
                    name = g.Name,
                    icon = g.Icon,
                    // A permission is granted when its letter is in the group's permission set.
                    permissions = Catalog
                        .Where(c => g.Permissions != null && g.Permissions.Contains(c.Letter))
                        .Select(c => c.Letter)
                        .ToArray(),
                })
                .OrderBy(g => g.name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var catalog = Catalog.Select(c => new { letter = c.Letter, name = c.Name, description = c.Description }).ToList();
            return Ok(new { catalog, groups = rows });
        }

        public class SaveRequest
        {
            public Guid GroupKey { get; set; }
            public string[] Permissions { get; set; }
        }

        [HttpPost("SaveGroup")]
        public async Task<IActionResult> SaveGroup([FromBody] SaveRequest request)
        {
            if (!IsAdmin) return Forbid();
            if (request == null || request.GroupKey == Guid.Empty) return BadRequest("A user group is required.");

            var group = await _userGroupService.GetAsync(request.GroupKey);
            if (group == null) return NotFound();

            var wanted = new HashSet<string>(request.Permissions ?? Array.Empty<string>(), StringComparer.Ordinal);
            var known = Catalog.Select(c => c.Letter).ToHashSet(StringComparer.Ordinal);

            // Only this package's letters are touched. Everything else the group holds — content
            // rights, media rights, another package's permissions — is copied through untouched;
            // rewriting the whole set from a MegaForm screen would silently revoke them.
            var next = new HashSet<string>(
                (group.Permissions ?? new HashSet<string>()).Where(p => !known.Contains(p)),
                StringComparer.Ordinal);
            foreach (var letter in wanted.Where(known.Contains)) next.Add(letter);

            group.Permissions = next;
            var result = await _userGroupService.UpdateAsync(group, Constants.Security.SuperUserKey);
            if (!result.Success) return BadRequest(result.Status.ToString());

            return Ok(new { success = true, permissions = next.Where(known.Contains).ToArray() });
        }
    }
}
