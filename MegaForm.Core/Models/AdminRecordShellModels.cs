using System;
using System.Collections.Generic;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Models
{
    public class AdminInboxTaskItem
    {
        public WorkflowTaskInstance Task { get; set; }
        public WorkflowCaseInstance WorkflowCase { get; set; }
        public FormInfo Form { get; set; }
        public SubmissionInfo Submission { get; set; }
        public RecordProjectionInfo Projection { get; set; }
        public DocumentInfo Document { get; set; }
        public DocumentMetadataInfo DocumentMetadata { get; set; }
        public string RecordUrl { get; set; }
        public string PublicUrl { get; set; }
        public int AssignmentCount { get; set; }
        public int OpenDirectiveCount { get; set; }

        public AdminInboxTaskItem()
        {
            Projection = new RecordProjectionInfo();
            RecordUrl = string.Empty;
            PublicUrl = string.Empty;
        }
    }

    public class AdminInboxShellResult
    {
        public List<AdminInboxTaskItem> MyTasks { get; set; }
        public List<AdminInboxTaskItem> RoleQueue { get; set; }
        public DateTime GeneratedAt { get; set; }

        public AdminInboxShellResult()
        {
            MyTasks = new List<AdminInboxTaskItem>();
            RoleQueue = new List<AdminInboxTaskItem>();
            GeneratedAt = DateTime.UtcNow;
        }
    }

    public class AdminRecordShellInfo
    {
        public SubmissionDetailResult Detail { get; set; }
        public RecordProjectionInfo Projection { get; set; }
        public WorkflowDefinition WorkflowDefinition { get; set; }
        public WorkflowExecutionContext WorkflowExecution { get; set; }
        public WorkflowCaseInstance WorkflowCase { get; set; }
        public List<WorkflowTaskInstance> WorkflowTasks { get; set; }
        public List<WorkflowTaskAction> WorkflowActions { get; set; }
        public WorkflowTransparencyInfo WorkflowTransparency { get; set; }
        public DocumentInfo Document { get; set; }
        public DocumentRevisionInfo CurrentRevision { get; set; }
        public DocumentRevisionInfo LatestRevision { get; set; }
        public DocumentRevisionInfo PublishedRevision { get; set; }
        public DocumentMetadataInfo DocumentMetadata { get; set; }
        public List<DocumentAssignmentInfo> Assignments { get; set; }
        public List<DocumentCommentInfo> Comments { get; set; }
        public List<DocumentDirectiveInfo> Directives { get; set; }
        public List<DocumentAliasInfo> Aliases { get; set; }
        public string PublicUrl { get; set; }

        public AdminRecordShellInfo()
        {
            Projection = new RecordProjectionInfo();
            WorkflowTasks = new List<WorkflowTaskInstance>();
            WorkflowActions = new List<WorkflowTaskAction>();
            WorkflowTransparency = new WorkflowTransparencyInfo();
            Assignments = new List<DocumentAssignmentInfo>();
            Comments = new List<DocumentCommentInfo>();
            Directives = new List<DocumentDirectiveInfo>();
            Aliases = new List<DocumentAliasInfo>();
            PublicUrl = string.Empty;
        }
    }
}
