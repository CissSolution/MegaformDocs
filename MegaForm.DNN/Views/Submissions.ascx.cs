using System;
using System.IO;
using System.Linq;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Services.Exceptions;
using DotNetNuke.Web.Client.ClientResourceManagement;
using MegaForm.DNN.Data;
using MegaForm.Core.Models;
using MegaForm.DNN.ViewModels;
using Newtonsoft.Json;

namespace MegaForm.DNN.Components
{
    public partial class SubmissionsView : PortalModuleBase
    {
        public SubmissionsListViewModel ViewModel { get; set; }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();

                // Font Awesome
                ClientResourceManager.RegisterStyleSheet(Page,
                    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css", 190);

                // MegaForm renderer + widget CSS (for Form View in modal)
                ClientResourceManager.RegisterStyleSheet(Page,
                    "/DesktopModules/MegaForm/Assets/css/megaform.css?v=10040", 200);
                ClientResourceManager.RegisterStyleSheet(Page,
                    "/DesktopModules/MegaForm/Assets/css/megaform-widgets.css?v=10040", 201);

                // Auto-register plugin CSS
                RegisterPluginResources(105);

                ViewModel = BuildViewModel();
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        private void RegisterPluginResources(int priority)
        {
            try
            {
                string basePath = Server.MapPath("~/DesktopModules/MegaForm/Assets/");
                string cssDir = Path.Combine(basePath, "css", "plugins");
                string baseUrl = "/DesktopModules/MegaForm/Assets/";

                if (Directory.Exists(cssDir))
                {
                    foreach (var file in Directory.GetFiles(cssDir, "*.css").OrderBy(f => f))
                    {
                        ClientResourceManager.RegisterStyleSheet(Page,
                            baseUrl + "css/plugins/" + Path.GetFileName(file) + "?v=10040", 202);
                    }
                }
            }
            catch { /* non-critical */ }
        }

        private SubmissionsListViewModel BuildViewModel()
        {
            var vm = new SubmissionsListViewModel
            {
                PageIndex = 0,
                PageSize = 50
            };

            // Determine form from querystring or first module form
            int formId = 0;
            int.TryParse(Request.QueryString["formId"], out formId);

            var forms = FormRepository.GetFormsByModule(ModuleId);
            vm.FormsJson = JsonConvert.SerializeObject(forms.Select(f => new { formId = f.FormId, title = f.Title, status = f.Status, schemaJson = f.SchemaJson }).ToList());

            if (formId <= 0)
            {
                if (forms.Count > 0)
                    formId = forms.First().FormId;
            }

            if (formId > 0)
            {
                vm.FormId = formId;
                vm.Form = FormRepository.GetForm(formId);

                if (vm.Form != null)
                {
                    try { vm.Schema = JsonConvert.DeserializeObject<FormSchema>(vm.Form.SchemaJson); }
                    catch { }

                    // Load initial count only — JS handles pagination
                    vm.TotalCount = FormRepository.CountSubmissions(formId);
                }
            }

            return vm;
        }
    }
}
