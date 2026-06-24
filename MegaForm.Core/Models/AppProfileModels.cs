using System;

namespace MegaForm.Core.Models
{
    public static class AppProfileScopes
    {
        public const string Generic = "generic";
        public const string Documents = "documents";
        public const string LeaveRequest = "leave-request";
        public const string Proposal = "proposal";
        public const string Blog = "blog";
    }

    public class AppProfileDefinition
    {
        public string Scope { get; set; }
        public string DisplayName { get; set; }
        public string EntitySingular { get; set; }
        public string EntityPlural { get; set; }
        public bool EnableWorkflowInbox { get; set; }
        public bool EnableAssignments { get; set; }
        public bool EnableComments { get; set; }
        public bool EnableDirectives { get; set; }
        public bool EnableDocumentRegistry { get; set; }
        public bool EnableStablePublicUrl { get; set; }

        public AppProfileDefinition()
        {
            Scope = AppProfileScopes.Generic;
            DisplayName = "Apps";
            EntitySingular = "Record";
            EntityPlural = "Records";
            EnableWorkflowInbox = true;
            EnableAssignments = true;
            EnableComments = true;
            EnableDirectives = false;
            EnableDocumentRegistry = false;
            EnableStablePublicUrl = false;
        }
    }

    public class AppProjectionDefinition
    {
        public AppProfileDefinition Profile { get; set; }
        public string TitleField { get; set; }
        public string TitleTemplate { get; set; }
        public string SummaryField { get; set; }
        public string SummaryTemplate { get; set; }
        public string OwnerField { get; set; }
        public string OwnerDisplayField { get; set; }
        public string DepartmentField { get; set; }
        public string DueDateField { get; set; }
        public string StatusField { get; set; }
        public string CategoryField { get; set; }
        public string KeywordsField { get; set; }
        public string SlugField { get; set; }
        public string RegistryNumberField { get; set; }
        public string DirectionField { get; set; }
        public string DocumentTypeField { get; set; }

        public AppProjectionDefinition()
        {
            Profile = new AppProfileDefinition();
            TitleField = string.Empty;
            TitleTemplate = string.Empty;
            SummaryField = string.Empty;
            SummaryTemplate = string.Empty;
            OwnerField = string.Empty;
            OwnerDisplayField = string.Empty;
            DepartmentField = string.Empty;
            DueDateField = string.Empty;
            StatusField = string.Empty;
            CategoryField = string.Empty;
            KeywordsField = string.Empty;
            SlugField = string.Empty;
            RegistryNumberField = string.Empty;
            DirectionField = string.Empty;
            DocumentTypeField = string.Empty;
        }
    }

    public class RecordProjectionInfo
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        public AppProfileDefinition Profile { get; set; }
        public AppProjectionDefinition Definition { get; set; }
        public string Title { get; set; }
        public string Summary { get; set; }
        public string Owner { get; set; }
        public string Department { get; set; }
        public string Status { get; set; }
        public string Category { get; set; }
        public string Keywords { get; set; }
        public string Slug { get; set; }
        public string RegistryNumber { get; set; }
        public string Direction { get; set; }
        public string DocumentType { get; set; }
        public DateTime? DueOnUtc { get; set; }

        public RecordProjectionInfo()
        {
            Profile = new AppProfileDefinition();
            Definition = new AppProjectionDefinition();
            Title = string.Empty;
            Summary = string.Empty;
            Owner = string.Empty;
            Department = string.Empty;
            Status = string.Empty;
            Category = string.Empty;
            Keywords = string.Empty;
            Slug = string.Empty;
            RegistryNumber = string.Empty;
            Direction = string.Empty;
            DocumentType = string.Empty;
        }
    }
}
