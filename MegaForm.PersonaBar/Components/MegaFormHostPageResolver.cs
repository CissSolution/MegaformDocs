// [PersonaBar v20260731-01] Finds a page that already hosts the MegaForm module so the
// Persona Bar panel can hand off to the real builder / submissions screens.
//
// The Persona Bar panel has no module context of its own — it is not a module on a page.
// The MegaForm builder and submissions screens are DNN module controls (ctl=Edit,
// ctl=Submissions) and those need a TabId + ModuleId to render. So the panel asks the
// server which page to jump to; if the portal has no MegaForm module anywhere, the server
// says so and the panel disables the buttons instead of producing a URL that 404s.

using System;
using System.Collections;
using System.Linq;
using DotNetNuke.Common;
using DotNetNuke.Entities.Modules;

namespace MegaForm.PersonaBar.Components
{
    /// <summary>The MegaForm module instance the panel deep-links into, if there is one.</summary>
    internal class MegaFormHostPage
    {
        public int TabId { get; set; }
        public int ModuleId { get; set; }
    }

    internal static class MegaFormHostPageResolver
    {
        private const string ModuleName = "MegaForm";
        private const string SettingKeyModuleMode = "MegaForm_ModuleMode";

        /// <summary>
        /// Prefers a module already configured as the Admin Dashboard — that is the instance
        /// an administrator expects to land on. Falls back to any non-deleted MegaForm module
        /// in the portal. Returns null when the portal has none.
        /// </summary>
        public static MegaFormHostPage Resolve(int portalId)
        {
            try
            {
                var desktopModule = DesktopModuleController.GetDesktopModuleByModuleName(ModuleName, portalId);
                if (desktopModule == null) return null;

                ArrayList modules = ModuleController.Instance.GetModulesByDesktopModuleId(desktopModule.DesktopModuleID);
                if (modules == null) return null;

                var candidates = modules
                    .Cast<ModuleInfo>()
                    .Where(m => m != null && m.PortalID == portalId && !m.IsDeleted && m.TabID > 0)
                    .ToList();

                if (candidates.Count == 0) return null;

                var preferred = candidates.FirstOrDefault(IsAdminDashboard) ?? candidates[0];
                return new MegaFormHostPage { TabId = preferred.TabID, ModuleId = preferred.ModuleID };
            }
            catch
            {
                // A portal without the module installed is a normal state, not an error worth
                // surfacing — the panel simply renders without deep links.
                return null;
            }
        }

        private static bool IsAdminDashboard(ModuleInfo module)
        {
            if (module.ModuleSettings == null) return false;
            var value = module.ModuleSettings[SettingKeyModuleMode] as string;
            if (string.IsNullOrEmpty(value)) return false;
            return value.IndexOf("dashboard", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        /// <summary>Builds ~/Default.aspx?tabid=..&amp;ctl=..&amp;mid=..&amp;formId=.. through DNN's own URL writer.</summary>
        public static string BuildControlUrl(MegaFormHostPage host, string controlKey, int formId)
        {
            if (host == null) return null;

            var parameters = formId > 0
                ? new[] { "mid=" + host.ModuleId, "formId=" + formId }
                : new[] { "mid=" + host.ModuleId };

            return Globals.NavigateURL(host.TabId, controlKey, parameters);
        }

        /// <summary>The plain page URL — used for "open the dashboard".</summary>
        public static string BuildPageUrl(MegaFormHostPage host)
        {
            return host == null ? null : Globals.NavigateURL(host.TabId);
        }
    }
}
