using System;
using System.Linq;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Services.Exceptions;
using MegaForm.DNN.Data;
using MegaForm.DNN.ViewModels;

namespace MegaForm.DNN.Components
{
    public partial class FormList : PortalModuleBase
    {
        public FormListViewModel ViewModel { get; set; }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();

                ViewModel = new FormListViewModel
                {
                    ModuleId = ModuleId,
                    PortalId = PortalSettings.PortalId,
                    TabId = TabId,
                    ApiBaseUrl = "/DesktopModules/MegaForm/API/"
                };

                ViewModel.Forms = FormRepository.GetFormsByPortal(PortalSettings.PortalId);
                foreach (var f in ViewModel.Forms)
                {
                    var stats = FormRepository.GetFormStats(f.FormId);
                    if (stats != null) ViewModel.Stats[f.FormId] = stats;
                }
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        protected string GetEditUrl(int formId)
        {
            return EditUrl("formId", formId.ToString(), "Edit");
        }

        protected string GetSubmissionsUrl(int formId)
        {
            return EditUrl("formId", formId.ToString(), "Submissions");
        }

        protected string GetCreateUrl()
        {
            return EditUrl("new", "1", "Edit");
        }
    }
}
