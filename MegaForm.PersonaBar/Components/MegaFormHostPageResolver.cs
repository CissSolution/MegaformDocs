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

        /// <summary>
        /// True when this instance is configured as the admin dashboard surface
        /// (MegaForm_ModuleMode = admin_dashboard). Decides whether landing on the plain
        /// page URL shows a dashboard or an unconfigured form - see BuildDashboardUrl.
        /// </summary>
        public bool IsAdminDashboardMode { get; set; }
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

                var dashboardInstance = candidates.FirstOrDefault(IsAdminDashboard);
                var preferred = dashboardInstance ?? candidates[0];
                return new MegaFormHostPage
                {
                    TabId = preferred.TabID,
                    ModuleId = preferred.ModuleID,
                    IsAdminDashboardMode = dashboardInstance != null,
                };
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

        /// <summary>
        /// Where "New form" must go.
        ///
        /// [PbNewFormUrl v20260810] It used to be BuildControlUrl(host, "Edit", 0), which is
        /// ~/Default.aspx?ctl=Edit&amp;mid=.. with no formId - and FormEdit.ascx.cs treats "no
        /// formId and no new=1" as "edit whatever this module already renders"
        /// (GetFormsByModule(ModuleId).First()). So "New form" opened the CURRENT form's builder,
        /// which is what the owner reported. The builder already has the right switch: new=1
        /// starts blank. Nothing else needed changing.
        /// </summary>
        public static string BuildNewFormUrl(MegaFormHostPage host)
        {
            if (host == null) return null;

            // [PbNewFormWizard v20260810] ctl=Edit&new=1 does start a NEW form, but it starts it on
            // the legacy "Create a New Form" template chooser - not the 5-step wizard the dashboard's
            // own New Form button opens. Send the admin to the dashboard with #mf-new-form, which
            // MegaForm.UI/src/dashboard/index.ts turns into openFormCreationWizard().
            var dashboard = BuildDashboardUrl(host);
            if (string.IsNullOrEmpty(dashboard))
            {
                return Globals.NavigateURL(host.TabId, "Edit", "mid=" + host.ModuleId, "new=1");
            }
            return dashboard + "#mf-new-form";
        }

        /// <summary>The plain page URL.</summary>
        public static string BuildPageUrl(MegaFormHostPage host)
        {
            return host == null ? null : Globals.NavigateURL(host.TabId);
        }

        /// <summary>
        /// Where "Open dashboard" should actually go.
        ///
        /// [PbDashboardUrl v20260801] It used to be BuildPageUrl — the bare page URL — which
        /// only works when the module sitting on that page happens to be in admin_dashboard
        /// mode. Resolve() falls back to ANY MegaForm instance, so on a portal whose only
        /// instance renders a form (the default mode) and has no form assigned yet, the button
        /// landed the administrator on "No form has been configured for this module."
        /// FormView.ascx renders the dashboard shell only for IsAdminDashboardMode, and there
        /// is no query-string override for the mode, so a plain page URL cannot ask for it.
        ///
        /// The FormList control is a real dashboard (portal-wide form list + stats) that does
        /// not depend on the module's own formId, and it is registered controlType="Edit", so
        /// DNN gates it on edit permission exactly like the builder link next to it.
        /// </summary>
        public static string BuildDashboardUrl(MegaFormHostPage host)
        {
            if (host == null) return null;
            return host.IsAdminDashboardMode
                ? Globals.NavigateURL(host.TabId)
                : BuildControlUrl(host, "FormList", 0);
        }

        /// <summary>
        /// Where the per-form "Submissions" link should go: the submission dashboard's
        /// Submissions view, filtered to that form.
        ///
        /// [PbSubmissionsUrl v20260807] It used to be BuildControlUrl(host, "Submissions", formId),
        /// i.e. ~/Default.aspx?ctl=Submissions&amp;mid=..&amp;formId=... That control IS registered
        /// (DesktopModules/MegaForm/Views/Submissions.ascx) so the link was not bogus — it rendered
        /// and then sat on "Loading submissions…" forever. The dashboard SPA is the surface that
        /// actually lists submissions, and it addresses a form the way its own navigation does:
        /// &lt;dashboard&gt;?mfFormId=&lt;id&gt;#mf-submissions (MegaForm.UI/src/dashboard/index.ts).
        /// Verified on megaclean008: that URL lands on "All forms / Form #55" with the rows loaded.
        ///
        /// Reuses BuildDashboardUrl so the admin_dashboard-vs-FormList decision lives in exactly
        /// one place — a portal whose only MegaForm instance is not a dashboard still degrades the
        /// same way "Open dashboard" does, instead of growing a second rule.
        /// </summary>
        public static string BuildSubmissionsUrl(MegaFormHostPage host, int formId)
        {
            var url = BuildDashboardUrl(host);
            if (string.IsNullOrEmpty(url) || formId <= 0) return url;

            // Friendly URLs render the control route as path segments (no '?'), the raw writer
            // keeps a query string — handle both rather than assuming one.
            var separator = url.IndexOf('?') >= 0 ? "&" : "?";
            return url + separator + "mfFormId=" + formId + "#mf-submissions";
        }
    }
}
