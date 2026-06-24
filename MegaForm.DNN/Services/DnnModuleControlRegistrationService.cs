using System;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Modules.Definitions;
using DotNetNuke.Security;

namespace MegaForm.DNN.Services
{
    internal static class DnnModuleControlRegistrationService
    {
        private const string ModuleName = "MegaForm";
        private const string ModuleDefinitionName = "MegaForm";
        private const string WorkflowInboxControlKey = "Tasks";
        private const string WorkflowInboxControlTitle = "Workflow Inbox";
        private const string WorkflowInboxControlSrc = "DesktopModules/MegaForm/Views/Tasks.ascx";

        public static bool EnsureWorkflowInboxControl(int portalId)
        {
            try
            {
                var desktopModule = DesktopModuleController.GetDesktopModuleByModuleName(ModuleName, portalId)
                    ?? DesktopModuleController.GetDesktopModuleByFriendlyName(ModuleName);
                if (desktopModule == null || desktopModule.DesktopModuleID <= 0)
                    return false;

                var definition = ModuleDefinitionController.GetModuleDefinitionByFriendlyName(ModuleDefinitionName, desktopModule.DesktopModuleID)
                    ?? ModuleDefinitionController.GetModuleDefinitionByDefinitionName(ModuleDefinitionName, desktopModule.DesktopModuleID);

                if (definition == null)
                {
                    definition = new ModuleDefinitionInfo
                    {
                        DesktopModuleID = desktopModule.DesktopModuleID,
                        FriendlyName = ModuleDefinitionName,
                        DefinitionName = ModuleDefinitionName,
                        DefaultCacheTime = 0
                    };
                    ModuleDefinitionController.SaveModuleDefinition(definition, false, false);
                    definition = ModuleDefinitionController.GetModuleDefinitionByFriendlyName(ModuleDefinitionName, desktopModule.DesktopModuleID)
                        ?? ModuleDefinitionController.GetModuleDefinitionByDefinitionName(ModuleDefinitionName, desktopModule.DesktopModuleID);
                }

                if (definition == null || definition.ModuleDefID <= 0)
                    return false;

                var existing = ModuleControlController.GetModuleControlByControlKey(WorkflowInboxControlKey, definition.ModuleDefID);
                if (existing != null &&
                    string.Equals(existing.ControlSrc ?? string.Empty, WorkflowInboxControlSrc, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }

                var control = existing ?? new ModuleControlInfo();
                control.ModuleDefID = definition.ModuleDefID;
                control.ControlKey = WorkflowInboxControlKey;
                control.ControlTitle = WorkflowInboxControlTitle;
                control.ControlSrc = WorkflowInboxControlSrc;
                control.ControlType = SecurityAccessLevel.View;
                control.ViewOrder = 0;
                control.IconFile = string.Empty;
                control.HelpURL = string.Empty;
                control.SupportsPartialRendering = false;
                control.SupportsPopUps = false;

                if (existing != null && existing.ModuleControlID > 0)
                {
                    control.ModuleControlID = existing.ModuleControlID;
                    ModuleControlController.UpdateModuleControl(control);
                }
                else
                {
                    ModuleControlController.AddModuleControl(control);
                }

                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
