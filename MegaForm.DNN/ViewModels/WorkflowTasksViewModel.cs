using System.Collections.Generic;

namespace MegaForm.DNN.ViewModels
{
    public class WorkflowTasksViewModel
    {
        public int ModuleId { get; set; }
        public int PortalId { get; set; }
        public int TabId { get; set; }
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public string ApiBaseUrl { get; set; }
        public string SubmissionsApiBaseUrl { get; set; }
        public string TasksUrl { get; set; }
        public string SubmissionsUrl { get; set; }
        public string BuilderUrl { get; set; }
        public string ManageUrl { get; set; }
        public string InitialTaskId { get; set; }
        public bool IsAuthenticated { get; set; }
        public bool IsEditable { get; set; }
        public bool IsAdmin { get; set; }
        public bool ShowSampleBanner { get; set; }
        public string CurrentUserName { get; set; }
        public string CurrentDisplayName { get; set; }
        public List<string> CurrentRoles { get; set; }

        public WorkflowTasksViewModel()
        {
            FormTitle = string.Empty;
            ApiBaseUrl = "/DesktopModules/MegaForm/API/Workflow/";
            SubmissionsApiBaseUrl = "/DesktopModules/MegaForm/API/";
            TasksUrl = string.Empty;
            SubmissionsUrl = string.Empty;
            BuilderUrl = string.Empty;
            ManageUrl = string.Empty;
            InitialTaskId = string.Empty;
            CurrentUserName = string.Empty;
            CurrentDisplayName = string.Empty;
            CurrentRoles = new List<string>();
        }
    }
}
