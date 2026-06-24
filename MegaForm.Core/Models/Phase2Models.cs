using System;
using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    // ============================================================
    // TEMPLATE PACKAGE
    // ============================================================
    public class TemplateInfo
    {
        public int TemplateId { get; set; }
        public int PortalId { get; set; }
        public string Slug { get; set; }
        public string Name { get; set; }
        public string Description { get; set; }
        public string Category { get; set; }
        public string Icon { get; set; }
        public string Version { get; set; }
        public string Author { get; set; }
        public int FieldCount { get; set; }
        public bool HasCustomHtml { get; set; }
        public bool HasCustomJs { get; set; }
        public string ThumbnailPath { get; set; }
        public string FolderPath { get; set; }
        public string MetadataJson { get; set; }
        public string JsScanResult { get; set; }
        public bool IsEnabled { get; set; }
        public DateTime InstallDate { get; set; }
        public int InstalledBy { get; set; }
    }

    public class JsScanResult
    {
        public bool Passed { get; set; }
        public List<JsScanViolation> Violations { get; set; } = new List<JsScanViolation>();
    }

    public class JsScanViolation
    {
        public int Line { get; set; }
        public string Pattern { get; set; }
        public string Category { get; set; }  // network, storage, dom_injection, external, backlink, iframe
        public string Severity { get; set; }  // critical, warning
        public string Snippet { get; set; }
    }

    // ============================================================
    // FORM VIEWS
    // ============================================================
    public class FormViewInfo
    {
        public int ViewId { get; set; }
        public int FormId { get; set; }
        public string ViewKey { get; set; }
        public string QueryKey { get; set; }
        public string ViewType { get; set; }  // edit, list, detail, card, kanban, calendar
        public string ViewName { get; set; }
        public bool IsDefault { get; set; }
        public int SortOrder { get; set; }
        public string ConfigJson { get; set; }
        public string CustomHtml { get; set; }
        public string CustomCss { get; set; }
        public string PermissionsJson { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    public class FormViewDeleteRequest
    {
        public int ViewId { get; set; }
    }

    public class ViewConfig
    {
        // List view
        public List<string> Columns { get; set; }
        public string SortBy { get; set; }
        public string SortDir { get; set; } = "desc";
        public int PageSize { get; set; } = 20;
        public List<string> SearchFields { get; set; }
        public List<ViewFilter> Filters { get; set; }
        public List<string> Actions { get; set; } // view, edit, delete

        // Card view
        public int CardColumns { get; set; } = 3;
        public string ImageField { get; set; }
        public string TitleField { get; set; }
        public string ExcerptField { get; set; }
        public int ExcerptLength { get; set; } = 150;
        public string DateField { get; set; }
        public string CategoryField { get; set; }
        public string LinkToView { get; set; }

        // Detail view
        public List<string> Fields { get; set; }
        public string RelatedView { get; set; }

        // Edit view
        public List<string> VisibleFields { get; set; }
        public Dictionary<string, string> Prefill { get; set; }
    }

    public class ViewFilter
    {
        public string Field { get; set; }
        public string Operator { get; set; }  // equals, notEquals, contains, greaterThan, lessThan, isEmpty, isNotEmpty
        public string Value { get; set; }
    }

    public class ViewPermissions
    {
        public bool Anonymous { get; set; }
        public List<string> Roles { get; set; } = new List<string>();
        public List<int> Users { get; set; } = new List<int>();
    }

    // ============================================================
    // PERMISSIONS
    // ============================================================
    public class FormPermissionInfo
    {
        public int PermissionId { get; set; }
        public int FormId { get; set; }
        public string PermissionType { get; set; }  // view, edit, delete, export, approve
        public string PrincipalType { get; set; }    // role, user
        public string PrincipalId { get; set; }
        public string RoleName { get; set; }
        public int? UserId { get; set; }
        public string Scope { get; set; }            // all, own, team
        public bool IsGranted { get; set; }
        public string FieldRestrictions { get; set; } // JSON: fields this role can/cannot see
    }

    public class AuditLogInfo
    {
        public long LogId { get; set; }
        public DateTime Timestamp { get; set; }
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string IpAddress { get; set; }
        public string Action { get; set; }
        public string EntityType { get; set; }
        public int? EntityId { get; set; }
        public int? FormId { get; set; }
        public string Details { get; set; }
        public string Result { get; set; }
    }

    // ============================================================
    // WORKFLOWS
    // ============================================================
    public class WorkflowInfo
    {
        public int WorkflowId { get; set; }
        public int FormId { get; set; }
        public string WorkflowName { get; set; }
        public string Description { get; set; }
        public string TriggerType { get; set; }
        public string TriggerConfig { get; set; }
        public string StepsJson { get; set; }
        public bool IsEnabled { get; set; }
        public int Version { get; set; }
        public int CreatedByUserId { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? ModifiedOnUtc { get; set; }
    }

    public class WorkflowRunInfo
    {
        public long RunId { get; set; }
        public int WorkflowId { get; set; }
        public int? SubmissionId { get; set; }
        public string Status { get; set; }
        public string CurrentStepId { get; set; }
        public DateTime StartedOnUtc { get; set; }
        public DateTime? CompletedOnUtc { get; set; }
        public string ContextJson { get; set; }
        public string ErrorMessage { get; set; }
    }

    public class WorkflowStep
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Type { get; set; }  // condition, update_field, send_email, notify, create_record, webhook, wait, assign
        public Dictionary<string, object> Config { get; set; } = new Dictionary<string, object>();
        public string Next { get; set; }
        public string OnTrue { get; set; }
        public string OnFalse { get; set; }
    }

    public class WorkflowCondition
    {
        public string Field { get; set; }
        public string Operator { get; set; }
        public string Value { get; set; }
    }

    public class StepResult
    {
        public string Status { get; set; } // success, failed, skipped, waiting
        public string NextStepId { get; set; }
        public string Error { get; set; }
        public Dictionary<string, object> Output { get; set; }
    }
}
