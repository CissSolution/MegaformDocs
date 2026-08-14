using System.Collections.Generic;
using System.Threading.Tasks;
using Nop.Services.Plugins;
using Nop.Web.Framework.Events;
using Nop.Web.Framework.Menu;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Adds a "MegaForm" menu group to the nopCommerce admin sidebar under "Third party plugins".
    /// </summary>
    public class AdminMenuEventConsumer : BaseAdminMenuCreatedEventConsumer
    {
        public AdminMenuEventConsumer(IPluginManager<IPlugin> pluginManager)
            : base(pluginManager)
        {
        }

        protected override string PluginSystemName => MegaFormNopCommerceDefaults.SystemName;

        /// <summary>
        /// Place the MegaForm menu item just before "Local plugins" in the third-party plugins section.
        /// </summary>
        protected override string BeforeMenuSystemName => "Local plugins";

        protected override async Task<AdminMenuItem> GetAdminMenuItemAsync(IPlugin plugin)
        {
            var root = await base.GetAdminMenuItemAsync(plugin);
            if (root == null)
                return null;

            root.SystemName = "MegaForm";
            root.Title = "MegaForm";
            root.IconClass = "fas fa-wpforms";
            root.Url = "/Admin/MegaForm/Dashboard";
            root.ChildNodes = new List<AdminMenuItem>
            {
                new()
                {
                    SystemName = "MegaForm.Dashboard",
                    Title = "Dashboard",
                    Url = "/Admin/MegaForm/Dashboard",
                    IconClass = "far fa-dot-circle"
                },
                new()
                {
                    SystemName = "MegaForm.Forms",
                    Title = "Forms",
                    Url = "/Admin/MegaForm/Forms",
                    IconClass = "far fa-dot-circle"
                },
                new()
                {
                    SystemName = "MegaForm.Submissions",
                    Title = "Submissions",
                    Url = "/Admin/MegaForm/Submissions",
                    IconClass = "far fa-dot-circle"
                },
                new()
                {
                    SystemName = "MegaForm.Languages",
                    Title = "Languages",
                    Url = "/Admin/MegaForm/Languages",
                    IconClass = "far fa-dot-circle"
                }
            };

            return root;
        }
    }
}
