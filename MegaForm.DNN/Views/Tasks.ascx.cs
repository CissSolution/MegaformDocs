using System;
using System.Collections.Generic;
using System.Linq;
using DotNetNuke.Common;
using DotNetNuke.Entities.Modules;
using DotNetNuke.Services.Exceptions;
using DotNetNuke.Web.Client.ClientResourceManagement;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using MegaForm.DNN.ViewModels;

namespace MegaForm.DNN.Components
{
    public partial class TasksView : PortalModuleBase
    {
        private const string SettingKeyFormId = "MegaForm_FormId";

        public WorkflowTasksViewModel ViewModel { get; set; }

        protected void Page_Load(object sender, EventArgs e)
        {
            try
            {
                DnnModuleControlRegistrationService.EnsureWorkflowInboxControl(PortalId);
                DotNetNuke.Framework.ServicesFramework.Instance.RequestAjaxAntiForgerySupport();

                ClientResourceManager.RegisterStyleSheet(Page,
                    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css", 190);

                ViewModel = BuildViewModel();
            }
            catch (Exception ex)
            {
                Exceptions.ProcessModuleLoadException(this, ex);
            }
        }

        private WorkflowTasksViewModel BuildViewModel()
        {
            var canEdit = IsEditable;
            var formId = ParsePositiveInt(Request.QueryString["formId"]);
            if (formId <= 0)
                formId = ReadDefaultFormId();

            var formTitle = string.Empty;
            if (formId > 0)
            {
                var form = FormRepository.GetForm(formId);
                if (form != null)
                    formTitle = form.Title ?? string.Empty;
            }

            return new WorkflowTasksViewModel
            {
                ModuleId = ModuleId,
                PortalId = PortalId,
                TabId = TabId,
                FormId = formId,
                FormTitle = formTitle,
                ApiBaseUrl = "/DesktopModules/MegaForm/API/Workflow/",
                SubmissionsApiBaseUrl = "/DesktopModules/MegaForm/API/",
                TasksUrl = BuildModuleUrl("Tasks", BuildOptionalParameter("formId", formId), BuildOptionalParameter("sample", IsSampleRequest() ? 1 : 0)),
                SubmissionsUrl = formId > 0 && canEdit ? BuildModuleUrl("Submissions", BuildOptionalParameter("formId", formId)) : string.Empty,
                BuilderUrl = formId > 0 && canEdit ? BuildModuleUrl("Edit", BuildOptionalParameter("formId", formId)) : string.Empty,
                ManageUrl = canEdit ? BuildModuleUrl("ManageModule") : string.Empty,
                InitialTaskId = (Request.QueryString["taskId"] ?? string.Empty).Trim(),
                IsAuthenticated = UserInfo != null && UserInfo.UserID > 0,
                IsEditable = canEdit,
                IsAdmin = UserInfo != null && (UserInfo.IsSuperUser || UserInfo.IsInRole("Administrators")),
                ShowSampleBanner = IsSampleRequest(),
                CurrentUserName = UserInfo != null ? (UserInfo.Username ?? string.Empty) : string.Empty,
                CurrentDisplayName = UserInfo != null ? (UserInfo.DisplayName ?? string.Empty) : string.Empty,
                CurrentRoles = UserInfo != null && UserInfo.Roles != null
                    ? UserInfo.Roles.Where(r => !string.IsNullOrWhiteSpace(r)).ToList()
                    : new List<string>()
            };
        }

        private int ReadDefaultFormId()
        {
            var raw = Settings[SettingKeyFormId] != null ? Convert.ToString(Settings[SettingKeyFormId]) : string.Empty;
            var formId = ParsePositiveInt(raw);
            if (formId > 0)
                return formId;

            var forms = FormRepository.GetFormsByModule(ModuleId);
            var first = forms.FirstOrDefault();
            return first != null ? first.FormId : 0;
        }

        private bool IsSampleRequest()
        {
            return string.Equals(Request.QueryString["sample"], "1", StringComparison.OrdinalIgnoreCase);
        }

        private string BuildModuleUrl(string controlKey, params string[] extraParameters)
        {
            var parameters = new List<string>
            {
                "mid=" + ModuleId,
                "ctl=" + controlKey
            };

            if (extraParameters != null)
            {
                for (var i = 0; i < extraParameters.Length; i++)
                {
                    if (!string.IsNullOrWhiteSpace(extraParameters[i]))
                        parameters.Add(extraParameters[i]);
                }
            }

            return Globals.NavigateURL(TabId, string.Empty, parameters.ToArray());
        }

        private static string BuildOptionalParameter(string key, int value)
        {
            return value > 0 ? key + "=" + value : string.Empty;
        }

        private static int ParsePositiveInt(string value)
        {
            int parsed;
            return int.TryParse((value ?? string.Empty).Trim(), out parsed) && parsed > 0 ? parsed : 0;
        }
    }
}
