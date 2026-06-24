using System;
using System.IO;
using System.Linq;
using DotNetNuke.Common;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Services.Exceptions;
using DotNetNuke.Web.Client.ClientResourceManagement;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.DNN.ViewModels;
using Newtonsoft.Json;

namespace MegaForm.DNN.Components
{
    public partial class FormEdit : PortalModuleBase
    {
        public FormBuilderViewModel ViewModel { get; set; }

        public bool HasDevLock { get; private set; }
        public bool HasDemoLock { get; private set; }

        /// <summary>
        /// DNN tab URL used as the "back" / "cancel" destination in the builder.
        /// </summary>
        public string ReturnUrl { get; private set; }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();

                // ── Return URL: back to current DNN tab ──────────────────
                ReturnUrl = Globals.NavigateURL();
                HasDevLock = HasLockFile("dev.lock");
                HasDemoLock = HasLockFile("demo.lock");

                // ── CSS (registered in <head> via ClientResourceManager) ──
                const string V = "?v=227";
                const string ASSETS = "/DesktopModules/MegaForm/Assets/";

                ClientResourceManager.RegisterStyleSheet(Page,
                    "https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap", 188);
                ClientResourceManager.RegisterStyleSheet(Page,
                    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css", 189);
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform.css?v=20260422-01" + V, 199); // BuilderPreviewCss v20260422-01
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform-builder-shell.css?v=224" + V, 200);
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform-builder.css" + V, 201);
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform-builder-ts.css" + V, 202);
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform-themes.css" + V, 203);
                ClientResourceManager.RegisterStyleSheet(Page,
                    ASSETS + "css/megaform-widgets.css" + V, 204);

                // Plugin CSS
                RegisterPluginStyles(210);

                // ── JS: load in correct order ─────────────────────────────
                // SortableJS — local copy, no CDN dependency
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/Sortable.min.js", 100);

                // Widgets registry (must be before bundle)
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/megaform-widgets.js" + V, 101);

                // Plugin scripts (register into MegaFormWidgets before bundle)
                RegisterPluginScripts(110);

                // Renderer + front-end rule engine
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/megaform-renderer.js" + V, 130);
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/megaform-rule-engine.js" + V, 131);

                // ── VITE BUNDLE — replaces all megaform-builder-*.js ──────
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/bundles/megaform-builder.js?v=20260501-01", 140);
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/megaform-template-gallery-search.js" + V, 141);

                // Workflow ReactFlow — heavy optional, loads last
                ClientResourceManager.RegisterScript(Page,
                    ASSETS + "js/builder/megaform-workflow-reactflow.js" + V, 150);

                // ── Build ViewModel ───────────────────────────────────────
                ViewModel = BuildViewModel();
            }
            catch (Exception ex)
            {
                if (ViewModel == null)
                {
                    ViewModel = new FormBuilderViewModel
                    {
                        ModuleId   = ModuleId,
                        PortalId   = PortalSettings.PortalId,
                        TabId      = TabId,
                        ApiBaseUrl = "/DesktopModules/MegaForm/API/"
                    };
                }
                ReturnUrl = ReturnUrl ?? Globals.NavigateURL();
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        private FormBuilderViewModel BuildViewModel()
        {
            var vm = new FormBuilderViewModel
            {
                ModuleId   = ModuleId,
                PortalId   = PortalSettings.PortalId,
                TabId      = TabId,
                ApiBaseUrl = "/DesktopModules/MegaForm/API/"
            };

            int.TryParse(Request.QueryString["formId"], out int formId);
            bool isNew = Request.QueryString["new"] == "1";

            if (formId > 0)
            {
                vm.Form = FormRepository.GetForm(formId);
                if (vm.Form != null)
                {
                    try { vm.Schema = JsonConvert.DeserializeObject<FormSchema>(vm.Form.SchemaJson); } catch { }
                    vm.Stats = FormRepository.GetFormStats(formId);
                }
            }
            else if (!isNew)
            {
                var existing = FormRepository.GetFormsByModule(ModuleId);
                if (existing.Count > 0)
                {
                    vm.Form = existing.First();
                    try { vm.Schema = JsonConvert.DeserializeObject<FormSchema>(vm.Form.SchemaJson); } catch { }
                    vm.Stats = FormRepository.GetFormStats(vm.Form.FormId);
                }
            }

            return vm;
        }

        private bool HasLockFile(string fileName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fileName)) return false;

                var portalHome = PortalSettings?.HomeDirectoryMapPath;
                if (!string.IsNullOrWhiteSpace(portalHome) && File.Exists(Path.Combine(portalHome, fileName)))
                    return true;

                var appPath = System.Web.Hosting.HostingEnvironment.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath) && File.Exists(Path.Combine(appPath, fileName)))
                    return true;
            }
            catch { }

            return false;
        }

        private void RegisterPluginStyles(int basePriority)
        {
            try
            {
                string dir = Server.MapPath("~/DesktopModules/MegaForm/Assets/css/plugins");
                if (!Directory.Exists(dir)) return;
                int p = basePriority;
                foreach (var f in Directory.GetFiles(dir, "*.css").OrderBy(x => x))
                    ClientResourceManager.RegisterStyleSheet(Page,
                        "/DesktopModules/MegaForm/Assets/css/plugins/" + Path.GetFileName(f) + "?v=216", p++);
            }
            catch { }
        }

        private void RegisterPluginScripts(int basePriority)
        {
            try
            {
                string dir = Server.MapPath("~/DesktopModules/MegaForm/Assets/js/plugins");
                if (!Directory.Exists(dir)) return;
                int p = basePriority;
                foreach (var f in Directory.GetFiles(dir, "*.js").OrderBy(x => x))
                {
                    var fileName = Path.GetFileName(f);
                    if (fileName.Equals("megaform-widget-payment.js", StringComparison.OrdinalIgnoreCase) || fileName.Equals("widget-payment.js", StringComparison.OrdinalIgnoreCase)) continue;
                    ClientResourceManager.RegisterScript(Page,
                        "/DesktopModules/MegaForm/Assets/js/plugins/" + fileName + "?v=216", p++);
                }
            }
            catch { }
        }

        /// <summary>Kept for backward compat — no longer used.</summary>
        protected string RenderPluginTags() => string.Empty;
    }
}
