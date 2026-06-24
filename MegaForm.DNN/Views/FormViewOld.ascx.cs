using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Entities.Modules.Actions;
using DotNetNuke.Security;
using DotNetNuke.Services.Exceptions;
using DotNetNuke.Web.Client.ClientResourceManagement;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MegaForm.DNN.ViewModels;
using Newtonsoft.Json;

namespace MegaForm.DNN.Components
{
    public partial class FormView : PortalModuleBase, IActionable
    {
        public FormRenderViewModel ViewModel { get; set; }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                // Register CSS in <head> so DNN skin cannot override
                ClientResourceManager.RegisterStyleSheet(Page, "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css", 190);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform.css?v=10041", 200);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-builder.css?v=10041", 201);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-builder-ts.css?v=10041", 202);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?v=10041", 203);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-widgets.css?v=10041", 204);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-views.css?v=10041", 204);
                ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css?v=10041", 205);

                // Enable DNN ServicesFramework for API auth (anti-forgery token)
                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();

                // Register JS
                // i18n engine (must load first)
                ClientResourceManager.RegisterScript(Page, "/DesktopModules/MegaForm/Assets/js/megaform-i18n.js?v=10041", 95);
                RegisterLocaleScript(96);

                ClientResourceManager.RegisterScript(Page, "/DesktopModules/MegaForm/Assets/js/megaform-widgets.js?v=10041", 100);

                // Auto-discover and register plugin files (between widgets and renderer)
                RegisterPluginResources(105);

                ClientResourceManager.RegisterScript(Page, "/DesktopModules/MegaForm/Assets/js/megaform-renderer.js?v=10041", 110);
                ClientResourceManager.RegisterScript(Page, "/DesktopModules/MegaForm/Assets/js/megaform-views.js?v=10041", 115);

                ViewModel = BuildRenderViewModel();

                // Admin Live Style Editor — only load for admins
                if (UserInfo.IsInRole("Administrators") || UserInfo.IsSuperUser)
                {
                    ClientResourceManager.RegisterStyleSheet(Page, "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap", 295);
                    ClientResourceManager.RegisterStyleSheet(Page, "/DesktopModules/MegaForm/Assets/css/megaform-admin-live.css?v=10041", 299);
                    ClientResourceManager.RegisterScript(Page, "/DesktopModules/MegaForm/Assets/js/megaform-admin-live.js?v=10041", 299);
                }
            }
            catch (Exception ex)
            {
                if (ViewModel == null) ViewModel = new FormRenderViewModel();
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        private FormRenderViewModel BuildRenderViewModel()
        {
            var vm = new FormRenderViewModel();

            // Check ModuleViewConfig first (new system)
            var moduleConfig = FormRepository.GetModuleViewConfig(ModuleId);

            // Get form associated with this module
            int selectedFormId = 0;
            if (moduleConfig != null)
            {
                selectedFormId = moduleConfig.FormId;
            }
            else if (Settings.Contains("MegaForm_FormId"))
            {
                int.TryParse(Settings["MegaForm_FormId"].ToString(), out selectedFormId);
            }

            var forms = FormRepository.GetFormsByModule(ModuleId);
            FormInfo form = null;

            if (selectedFormId > 0)
            {
                form = forms.FirstOrDefault(f => f.FormId == selectedFormId);
                // Template-created forms may have a different ModuleId — try direct lookup
                if (form == null)
                {
                    form = FormRepository.GetForm(selectedFormId);
                    // Update the form's ModuleId so it shows up in future lookups
                    if (form != null && form.ModuleId != ModuleId)
                    {
                        form.ModuleId = ModuleId;
                        try { FormRepository.SaveForm(form); } catch { /* best effort */ }
                    }
                }
            }

            if (form == null)
            {
                form = forms.FirstOrDefault(f => f.Status == "Published") ?? forms.FirstOrDefault();
            }

            // Config panel properties — set BEFORE early return so panel works even with no form
            vm.IsAdmin = UserInfo.IsInRole("Administrators") || UserInfo.IsSuperUser;
            vm.ModuleId = ModuleId;
            vm.TabId = TabId;
            vm.ApiBaseUrl = "/DesktopModules/MegaForm/API/";

            bool forceConfig = Request.QueryString["configure"] == "1";
            vm.ShowConfigPanel = vm.IsAdmin && (moduleConfig == null || forceConfig);

            if (vm.ShowConfigPanel)
            {
                vm.FormsJson = JsonConvert.SerializeObject(forms.Select(f => new {
                    f.FormId, f.Title, f.Status,
                    fieldCount = 0
                }));
                if (moduleConfig != null)
                {
                    vm.ModuleConfigJson = JsonConvert.SerializeObject(new {
                        moduleConfig.FormId, moduleConfig.ViewType,
                        moduleConfig.ViewConfigJson, moduleConfig.CssClass,
                        moduleConfig.CacheMinutes, moduleConfig.PermissionsJson
                    });
                }
            }

            if (form == null) return vm;

            FormSchema schema = null;
            try { schema = JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson); }
            catch { /* invalid schema */ }

            vm.FormId = form.FormId;
            vm.Title = form.Title;
            vm.Description = form.Description;
            vm.Schema = schema;
            vm.SubmitButtonText = form.SubmitButtonText ?? "Submit";
            vm.EnableCaptcha = form.EnableCaptcha;
            vm.EnableSaveResume = form.EnableSaveResume;
            vm.RequireAuth = form.RequireAuth;
            vm.IsAuthenticated = UserInfo.UserID > 0;

            // Load saved theme/style overrides from module settings
            vm.ThemeClass = Settings.Contains("MegaForm_ThemeClass") ? Settings["MegaForm_ThemeClass"].ToString() : "";
            vm.CssOverride = Settings.Contains("MegaForm_CssOverride") ? Settings["MegaForm_CssOverride"].ToString() : "";
            vm.ThemeJson = form.ThemeJson;
            vm.ApiBaseUrl = "/DesktopModules/MegaForm/API/";
            vm.HoneypotFieldName = schema?.Settings?.HoneypotFieldName ?? "__mf_hp";
            vm.FormLoadTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

            // Check for resume token in query string
            string token = Request.QueryString["resume"];
            if (!string.IsNullOrEmpty(token))
            {
                var draft = FormRepository.GetDraft(token);
                if (draft != null && draft.FormId == form.FormId)
                {
                    vm.ResumeToken = token;
                    vm.PrefilledDataJson = draft.DataJson;
                }
            }

            // Check for query-string prefill
            if (schema?.Fields != null)
            {
                var prefillData = new Dictionary<string, string>();
                foreach (var field in MegaFormUtils.FlattenFields(schema.Fields).Where(f => f != null && !string.IsNullOrEmpty(f.PrefillParam)))
                {
                    string val = Request.QueryString[field.PrefillParam];
                    if (!string.IsNullOrEmpty(val) && !string.IsNullOrEmpty(field.Key))
                        prefillData[field.Key] = val;
                }
                if (prefillData.Count > 0 && string.IsNullOrEmpty(vm.PrefilledDataJson))
                    vm.PrefilledDataJson = JsonConvert.SerializeObject(prefillData);
            }

            // Auto-scan plugin files
            ScanPluginFiles(vm);

            // ── Multi-View Routing ──
            string viewParam = Request.QueryString["view"];

            // If no view param, use ModuleViewConfig
            if (string.IsNullOrEmpty(viewParam) && moduleConfig != null && !string.IsNullOrEmpty(moduleConfig.ViewType) && moduleConfig.ViewType != "submit")
            {
                viewParam = moduleConfig.ViewType;
                // Store view config from module config
                if (!string.IsNullOrEmpty(moduleConfig.ViewConfigJson))
                    vm.ActiveViewConfigJson = moduleConfig.ViewConfigJson;
            }
            // Fallback to legacy module settings
            else if (string.IsNullOrEmpty(viewParam) && Settings.Contains("MegaForm_DefaultView"))
            {
                string defaultView = Settings["MegaForm_DefaultView"].ToString();
                if (!string.IsNullOrEmpty(defaultView) && defaultView != "edit")
                {
                    viewParam = defaultView;

                    // Also check for custom view key
                    if (Settings.Contains("MegaForm_CustomViewKey"))
                    {
                        string customVk = Settings["MegaForm_CustomViewKey"].ToString();
                        if (!string.IsNullOrEmpty(customVk))
                        {
                            // Redirect to include view params in URL for consistent behavior
                            // But only set it in ViewModel — no redirect to avoid loop
                        }
                    }
                }
            }

            if (!string.IsNullOrEmpty(viewParam) && viewParam != "edit")
            {
                vm.ActiveViewType = viewParam.ToLower(); // list, detail, card, edit

                // Record ID for detail/edit views
                string idParam = Request.QueryString["id"];
                int recordId = 0;
                if (!string.IsNullOrEmpty(idParam))
                    int.TryParse(idParam, out recordId);
                vm.ActiveRecordId = recordId;

                // Load view config from DB if a named view exists
                try
                {
                    string viewKey = Request.QueryString["vk"]; // optional: ?vk=my-custom-view
                    FormViewInfo viewInfo = null;

                    if (!string.IsNullOrEmpty(viewKey))
                    {
                        viewInfo = FormRepository.GetFormView(form.FormId, viewKey);
                    }
                    else
                    {
                        // Find default view matching the requested type
                        var allViews = FormRepository.GetFormViews(form.FormId);
                        viewInfo = allViews.FirstOrDefault(v => v.ViewType == vm.ActiveViewType && v.IsDefault)
                                ?? allViews.FirstOrDefault(v => v.ViewType == vm.ActiveViewType);
                    }

                    if (viewInfo != null)
                    {
                        vm.ActiveViewConfigJson = viewInfo.ConfigJson ?? "{}";

                        // Check view-level permissions
                        if (!string.IsNullOrEmpty(viewInfo.PermissionsJson))
                        {
                            var user = new UserContext
                            {
                                UserId = UserInfo.UserID,
                                UserName = UserInfo.Username,
                                IsAuthenticated = Request.IsAuthenticated,
                                IsAdmin = UserInfo.IsInRole("Administrators"),
                                IsSuperUser = UserInfo.IsSuperUser,
                                Roles = UserInfo.Roles?.ToList() ?? new List<string>()
                            };
                            // TODO: check view-level permissions via PermissionService.CanView
                            // For now, admins and super users always have access
                            if (!user.IsAdmin && !user.IsSuperUser)
                            {
                                // No permission — fall back to edit view (form submission)
                                vm.ActiveViewType = null;
                                vm.ActiveViewConfigJson = null;
                            }
                        }
                    }
                    else
                    {
                        vm.ActiveViewConfigJson = "{}"; // No saved config, use defaults
                    }
                }
                catch
                {
                    vm.ActiveViewConfigJson = "{}";
                }
            }

            // ── AppScope & Inter-Instance Communication ──
            vm.AppScope = Settings.Contains("MegaForm_AppScope")
                ? Settings["MegaForm_AppScope"].ToString() : "";
            vm.BusChannel = Settings.Contains("MegaForm_BusChannel")
                ? Settings["MegaForm_BusChannel"].ToString() : vm.AppScope;
            vm.DetailModuleId = Settings.Contains("MegaForm_DetailModuleId")
                ? Settings["MegaForm_DetailModuleId"].ToString() : "";

            // If BusChannel empty, default to AppScope
            if (string.IsNullOrEmpty(vm.BusChannel))
                vm.BusChannel = vm.AppScope;

            return vm;
        }

        private void ScanPluginFiles(FormRenderViewModel vm)
        {
            try
            {
                string basePath = Server.MapPath("~/DesktopModules/MegaForm/Assets/");
                string jsDir = Path.Combine(basePath, "js", "plugins");
                string cssDir = Path.Combine(basePath, "css", "plugins");
                string baseUrl = "/DesktopModules/MegaForm/Assets/";

                if (Directory.Exists(jsDir))
                {
                    foreach (var file in Directory.GetFiles(jsDir, "*.js").OrderBy(f => f))
                    {
                        vm.PluginScripts.Add(baseUrl + "js/plugins/" + Path.GetFileName(file));
                    }
                }
                if (Directory.Exists(cssDir))
                {
                    foreach (var file in Directory.GetFiles(cssDir, "*.css").OrderBy(f => f))
                    {
                        vm.PluginStyles.Add(baseUrl + "css/plugins/" + Path.GetFileName(file));
                    }
                }
            }
            catch { /* folder doesn't exist yet — no plugins, that's fine */ }
        }

        /// <summary>
        /// Scan /plugins/ folders and register via ClientResourceManager.
        /// </summary>
        private void RegisterPluginResources(int basePriority)
        {
            try
            {
                string basePath = Server.MapPath("~/DesktopModules/MegaForm/Assets/");
                string jsDir = Path.Combine(basePath, "js", "plugins");
                string cssDir = Path.Combine(basePath, "css", "plugins");
                string baseUrl = "/DesktopModules/MegaForm/Assets/";
                int p = basePriority;

                if (Directory.Exists(cssDir))
                {
                    foreach (var file in Directory.GetFiles(cssDir, "*.css").OrderBy(f => f))
                        ClientResourceManager.RegisterStyleSheet(Page,
                            baseUrl + "css/plugins/" + Path.GetFileName(file) + "?v=10041", p++);
                }
                if (Directory.Exists(jsDir))
                {
                    foreach (var file in Directory.GetFiles(jsDir, "*.js").OrderBy(f => f))
                        ClientResourceManager.RegisterScript(Page,
                            baseUrl + "js/plugins/" + Path.GetFileName(file) + "?v=10041", p++);
                }
            }
            catch { }
        }

        /// <summary>
        /// Kept for backward compatibility — returns empty since plugins now load via ClientResourceManager.
        /// </summary>
        protected string RenderPluginTags()
        {
            return string.Empty;
        }

        private void RegisterLocaleScript(int priority)
        {
            try
            {
                string locale = System.Threading.Thread.CurrentThread.CurrentCulture.Name;
                if (string.IsNullOrEmpty(locale)) locale = "en-US";
                string localeFile = Server.MapPath("~/DesktopModules/MegaForm/Assets/js/locales/" + locale + ".js");
                if (System.IO.File.Exists(localeFile))
                {
                    ClientResourceManager.RegisterScript(Page,
                        "/DesktopModules/MegaForm/Assets/js/locales/" + locale + ".js?v=10041", priority);
                }
            }
            catch { }
        }

        #region IActionable

        public ModuleActionCollection ModuleActions
        {
            get
            {
                var actions = new ModuleActionCollection();
                actions.Add(
                    GetNextActionID(),
                    "My Forms",
                    ModuleActionType.EditContent,
                    "", "edit.gif",
                    EditUrl("FormList"),
                    false,
                    SecurityAccessLevel.Edit,
                    true, false
                );
                actions.Add(
                    GetNextActionID(),
                    "Manage Form",
                    ModuleActionType.EditContent,
                    "", "edit.gif",
                    EditUrl("Edit"),
                    false,
                    SecurityAccessLevel.Edit,
                    true, false
                );
                actions.Add(
                    GetNextActionID(),
                    "View Submissions",
                    ModuleActionType.ContentOptions,
                    "", "icon_unknown_16px.gif",
                    EditUrl("Submissions"),
                    false,
                    SecurityAccessLevel.Edit,
                    true, false
                );
                return actions;
            }
        }

        #endregion
    }
}
