using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Umbraco.Permissions;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Models.Membership;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace MegaForm.Umbraco.HostedServices
{
    /// <summary>
    /// Automatically grants the MegaForm backoffice section and default permissions
    /// to the built-in Umbraco <c>admin</c> user group the first time the site starts
    /// after package installation.
    /// </summary>
    public class MegaFormSectionAutoGrantHandler : INotificationHandler<UmbracoApplicationStartedNotification>
    {
        private const string AdminGroupAlias = "admin";
        private const string MegaFormSectionAlias = "MegaForm.Section";

        private static readonly string[] DefaultAdminLetters =
        {
            MegaFormPermissionConstants.BrowseLetter,
            MegaFormPermissionConstants.CreateLetter,
            MegaFormPermissionConstants.EditLetter,
            MegaFormPermissionConstants.DeleteLetter,
            MegaFormPermissionConstants.ViewSubmissionsLetter,
            MegaFormPermissionConstants.ManageSubmissionsLetter,
            MegaFormPermissionConstants.WorkflowLetter,
            MegaFormPermissionConstants.AiLetter,
            MegaFormPermissionConstants.AiKnowledgeLetter,
            MegaFormPermissionConstants.ReportsLetter,
            MegaFormPermissionConstants.LanguagesLetter,
            MegaFormPermissionConstants.TemplatesLetter,
            MegaFormPermissionConstants.ManagePermissionsLetter,
        };

        private readonly IUserGroupService _userGroupService;
        private readonly IUserService _userService;
        private readonly ILogger<MegaFormSectionAutoGrantHandler> _logger;

        public MegaFormSectionAutoGrantHandler(
            IUserGroupService userGroupService,
            IUserService userService,
            ILogger<MegaFormSectionAutoGrantHandler> logger)
        {
            _userGroupService = userGroupService ?? throw new ArgumentNullException(nameof(userGroupService));
            _userService = userService ?? throw new ArgumentNullException(nameof(userService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        public void Handle(UmbracoApplicationStartedNotification notification)
        {
            try
            {
                var adminGroup = _userGroupService.GetAsync(AdminGroupAlias).GetAwaiter().GetResult();
                if (adminGroup == null)
                {
                    _logger.LogWarning(
                        "MegaForm could not auto-grant its section: the '{AdminGroup}' user group was not found.",
                        AdminGroupAlias);
                    return;
                }

                var allowed = adminGroup.AllowedSections;
                var hasSection = allowed != null && allowed.Contains(MegaFormSectionAlias, StringComparer.OrdinalIgnoreCase);
                var missingLetters = DefaultAdminLetters
                    .Where(l => !adminGroup.Permissions.Contains(l, StringComparer.OrdinalIgnoreCase))
                    .ToList();

                if (hasSection && missingLetters.Count == 0)
                {
                    _logger.LogDebug("MegaForm section and permissions are already granted to the '{AdminGroup}' user group.", AdminGroupAlias);
                    return;
                }

                // Find an admin user to act as the performer for the update.
                var readOnlyGroup = (IReadOnlyUserGroup)adminGroup;
                var adminUser = _userService.GetAllInGroup(readOnlyGroup.Id).FirstOrDefault();
                if (adminUser == null)
                {
                    _logger.LogWarning(
                        "MegaForm could not auto-grant its section: no user was found in the '{AdminGroup}' group to perform the update.",
                        AdminGroupAlias);
                    return;
                }

                if (!hasSection)
                {
                    adminGroup.AddAllowedSection(MegaFormSectionAlias);
                }

                foreach (var letter in missingLetters)
                {
                    adminGroup.Permissions.Add(letter);
                }

                var result = _userGroupService.UpdateAsync(adminGroup, adminUser.Key).GetAwaiter().GetResult();

                if (result.Success)
                {
                    _logger.LogInformation(
                        "MegaForm section '{SectionAlias}' and {PermissionCount} default permissions were automatically granted to the '{AdminGroup}' user group.",
                        MegaFormSectionAlias,
                        missingLetters.Count,
                        AdminGroupAlias);
                }
                else
                {
                    _logger.LogWarning(
                        "MegaForm section/permissions could not be granted to the '{AdminGroup}' user group. Status: {Status}",
                        AdminGroupAlias,
                        result.Status);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "MegaForm section auto-grant failed.");
            }
        }
    }
}
