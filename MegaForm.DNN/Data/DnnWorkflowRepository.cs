using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.DNN.Data
{
    public class DnnWorkflowRepository : IWorkflowRepository
    {
        private static readonly string ConnectionString = DotNetNuke.Common.Utilities.Config.GetConnectionString();
        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore
        };

        private static readonly object SchemaLock = new object();
        private static bool _schemaReady;
        private static bool _workflowColumnReady;
        private static bool _workflowTablesUpgradeReady;

        public WorkflowEnvelope GetEnvelope(int formId)
        {
            return WorkflowEnvelope.ParseOrMigrate(ReadWorkflowJson(formId));
        }

        public void SaveDraft(int formId, WorkflowDefinition draft)
        {
            var form = FormRepository.GetForm(formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var envelope = GetEnvelope(formId);
            draft.UpdatedAt = DateTime.UtcNow;
            envelope.DraftWorkflow = draft;
            envelope.DraftUpdatedAt = DateTime.UtcNow;
            envelope.DraftVersion = BumpDraftVersion(envelope.DraftVersion);
            WriteWorkflowJson(formId, JsonConvert.SerializeObject(envelope, JsonSettings));
        }

        public void ApplyDraft(int formId, string appliedBy = "system")
        {
            var form = FormRepository.GetForm(formId);
            if (form == null)
                throw new InvalidOperationException("Form " + formId + " not found.");

            var envelope = GetEnvelope(formId);
            if (envelope.DraftWorkflow == null)
                throw new InvalidOperationException("No draft to apply for form " + formId + ".");

            envelope.AppliedWorkflow = envelope.DraftWorkflow;
            envelope.AppliedAt = DateTime.UtcNow;
            envelope.AppliedBy = string.IsNullOrWhiteSpace(appliedBy) ? "system" : appliedBy;
            envelope.AppliedVersion = ToAppliedVersion(envelope.DraftVersion);
            WriteWorkflowJson(formId, JsonConvert.SerializeObject(envelope, JsonSettings));
        }

        public WorkflowDefinition GetByFormId(int formId)
        {
            return GetEnvelope(formId).AppliedWorkflow;
        }

        public void Save(int formId, WorkflowDefinition definition)
        {
            SaveDraft(formId, definition);
            ApplyDraft(formId, "legacy-save");
        }

        public string SaveExecution(WorkflowExecutionContext ctx)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM [dbo].[MF_WorkflowExecutions] WHERE [ExecutionId] = @ExecutionId)
    UPDATE [dbo].[MF_WorkflowExecutions]
       SET [FormId] = @FormId,
           [SubmissionId] = @SubmissionId,
           [Status] = @Status,
           [StartedAt] = @StartedAt,
           [CompletedAt] = @CompletedAt,
           [CurrentNodeId] = @CurrentNodeId,
           [ContextJson] = @ContextJson,
           [ErrorMessage] = @ErrorMessage
     WHERE [ExecutionId] = @ExecutionId;
ELSE
    INSERT INTO [dbo].[MF_WorkflowExecutions]
        ([ExecutionId], [FormId], [SubmissionId], [Status], [StartedAt], [CompletedAt], [CurrentNodeId], [ContextJson], [ErrorMessage])
    VALUES
        (@ExecutionId, @FormId, @SubmissionId, @Status, @StartedAt, @CompletedAt, @CurrentNodeId, @ContextJson, @ErrorMessage);";

                AddParam(cmd, "@ExecutionId", ctx.ExecutionId);
                AddParam(cmd, "@FormId", ctx.FormId);
                AddParam(cmd, "@SubmissionId", ctx.SubmissionId);
                AddParam(cmd, "@Status", (ctx.Status.ToString() ?? "running").ToLowerInvariant());
                AddParam(cmd, "@StartedAt", ctx.StartedAt);
                AddParam(cmd, "@CompletedAt", (object)ctx.CompletedAt ?? DBNull.Value);
                AddParam(cmd, "@CurrentNodeId", ctx.CurrentNodeId ?? string.Empty);
                AddParam(cmd, "@ContextJson", Serialize(ctx));
                AddParam(cmd, "@ErrorMessage", ctx.ErrorMessage ?? string.Empty);
                cmd.ExecuteNonQuery();
            }

            return ctx.ExecutionId;
        }

        public void UpdateExecution(WorkflowExecutionContext ctx)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
UPDATE [dbo].[MF_WorkflowExecutions]
   SET [Status] = @Status,
       [CompletedAt] = @CompletedAt,
       [CurrentNodeId] = @CurrentNodeId,
       [ContextJson] = @ContextJson,
       [ErrorMessage] = @ErrorMessage
 WHERE [ExecutionId] = @ExecutionId;";
                AddParam(cmd, "@ExecutionId", ctx.ExecutionId);
                AddParam(cmd, "@Status", (ctx.Status.ToString() ?? "running").ToLowerInvariant());
                AddParam(cmd, "@CompletedAt", (object)ctx.CompletedAt ?? DBNull.Value);
                AddParam(cmd, "@CurrentNodeId", ctx.CurrentNodeId ?? string.Empty);
                AddParam(cmd, "@ContextJson", Serialize(ctx));
                AddParam(cmd, "@ErrorMessage", ctx.ErrorMessage ?? string.Empty);
                cmd.ExecuteNonQuery();
            }
        }

        public WorkflowExecutionContext GetExecution(string executionId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT [ContextJson] FROM [dbo].[MF_WorkflowExecutions] WHERE [ExecutionId] = @ExecutionId";
                AddParam(cmd, "@ExecutionId", executionId);
                var json = cmd.ExecuteScalar() as string;
                if (string.IsNullOrWhiteSpace(json))
                    return null;

                try { return JsonConvert.DeserializeObject<WorkflowExecutionContext>(json, JsonSettings); }
                catch { return null; }
            }
        }

        public List<WorkflowExecutionSummary> ListExecutions(int formId, int pageIndex = 0, int pageSize = 20)
        {
            var items = new List<WorkflowExecutionSummary>();
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT [ExecutionId], [FormId], [SubmissionId], [Status], [CurrentNodeId], [ErrorMessage], [StartedAt], [CompletedAt]
  FROM [dbo].[MF_WorkflowExecutions]
 WHERE [FormId] = @FormId
 ORDER BY [StartedAt] DESC";
                AddParam(cmd, "@FormId", formId);

                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        var startedAt = GetDateTime(reader, "StartedAt");
                        var completedAt = GetNullableDateTime(reader, "CompletedAt");
                        items.Add(new WorkflowExecutionSummary
                        {
                            ExecutionId = GetString(reader, "ExecutionId"),
                            FormId = GetInt(reader, "FormId"),
                            SubmissionId = GetInt(reader, "SubmissionId"),
                            Status = GetString(reader, "Status"),
                            CurrentNodeId = GetString(reader, "CurrentNodeId"),
                            ErrorMessage = GetString(reader, "ErrorMessage"),
                            StartedAt = startedAt,
                            CompletedAt = completedAt,
                            DurationMs = completedAt.HasValue ? (long)(completedAt.Value - startedAt).TotalMilliseconds : 0
                        });
                    }
                }
            }

            return ApplyPaging(items, pageIndex, pageSize);
        }

        public WorkflowCaseInstance GetCase(string caseId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT * FROM [dbo].[MF_WorkflowCases] WHERE [CaseId] = @CaseId";
                AddParam(cmd, "@CaseId", caseId);
                using (var reader = cmd.ExecuteReader())
                {
                    return reader.Read() ? MapCase(reader) : null;
                }
            }
        }

        public WorkflowCaseInstance GetCaseByExecution(string executionId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT * FROM [dbo].[MF_WorkflowCases] WHERE [ExecutionId] = @ExecutionId";
                AddParam(cmd, "@ExecutionId", executionId);
                using (var reader = cmd.ExecuteReader())
                {
                    return reader.Read() ? MapCase(reader) : null;
                }
            }
        }

        public void SaveCase(WorkflowCaseInstance workflowCase)
        {
            if (workflowCase == null || string.IsNullOrWhiteSpace(workflowCase.CaseId))
                return;

            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM [dbo].[MF_WorkflowCases] WHERE [CaseId] = @CaseId)
    UPDATE [dbo].[MF_WorkflowCases]
       SET [ExecutionId] = @ExecutionId,
           [FormId] = @FormId,
           [SubmissionId] = @SubmissionId,
           [WorkflowId] = @WorkflowId,
           [CurrentNodeId] = @CurrentNodeId,
           [Status] = @Status,
           [StartedByUserId] = @StartedByUserId,
           [StartedByUserName] = @StartedByUserName,
           [ActiveTaskId] = @ActiveTaskId,
           [Outcome] = @Outcome,
           [LastComment] = @LastComment,
           [CreatedAt] = @CreatedAt,
           [CompletedAt] = @CompletedAt
     WHERE [CaseId] = @CaseId;
ELSE
    INSERT INTO [dbo].[MF_WorkflowCases]
        ([CaseId], [ExecutionId], [FormId], [SubmissionId], [WorkflowId], [CurrentNodeId], [Status], [StartedByUserId], [StartedByUserName], [ActiveTaskId], [Outcome], [LastComment], [CreatedAt], [CompletedAt])
    VALUES
        (@CaseId, @ExecutionId, @FormId, @SubmissionId, @WorkflowId, @CurrentNodeId, @Status, @StartedByUserId, @StartedByUserName, @ActiveTaskId, @Outcome, @LastComment, @CreatedAt, @CompletedAt);";

                AddCaseParams(cmd, workflowCase);
                cmd.ExecuteNonQuery();
            }
        }

        public WorkflowTaskInstance GetTask(string taskId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT * FROM [dbo].[MF_WorkflowTasks] WHERE [TaskId] = @TaskId";
                AddParam(cmd, "@TaskId", taskId);
                using (var reader = cmd.ExecuteReader())
                {
                    return reader.Read() ? MapTask(reader) : null;
                }
            }
        }

        public WorkflowTaskInstance GetActiveTask(string executionId, string nodeId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT TOP 1 *
  FROM [dbo].[MF_WorkflowTasks]
 WHERE [ExecutionId] = @ExecutionId
   AND [NodeId] = @NodeId
   AND ([Status] = 'pending' OR [Status] = 'claimed')
 ORDER BY [CreatedAt] DESC";
                AddParam(cmd, "@ExecutionId", executionId);
                AddParam(cmd, "@NodeId", nodeId);
                using (var reader = cmd.ExecuteReader())
                {
                    return reader.Read() ? MapTask(reader) : null;
                }
            }
        }

        public List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query)
        {
            query = query ?? new WorkflowTaskQuery();
            var sql = @"
SELECT *
  FROM [dbo].[MF_WorkflowTasks]
 WHERE 1 = 1";

            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                if (query.FormId.HasValue)
                {
                    sql += " AND [FormId] = @FormId";
                    AddParam(cmd, "@FormId", query.FormId.Value);
                }
                if (query.SubmissionId.HasValue)
                {
                    sql += " AND [SubmissionId] = @SubmissionId";
                    AddParam(cmd, "@SubmissionId", query.SubmissionId.Value);
                }
                if (!string.IsNullOrWhiteSpace(query.CaseId))
                {
                    sql += " AND [CaseId] = @CaseId";
                    AddParam(cmd, "@CaseId", query.CaseId);
                }
                if (!string.IsNullOrWhiteSpace(query.ExecutionId))
                {
                    sql += " AND [ExecutionId] = @ExecutionId";
                    AddParam(cmd, "@ExecutionId", query.ExecutionId);
                }
                if (query.OpenOnly)
                    sql += " AND ([Status] = 'pending' OR [Status] = 'claimed')";

                sql += " ORDER BY [CreatedAt] DESC";
                cmd.CommandText = sql;

                var items = new List<WorkflowTaskInstance>();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                        items.Add(MapTask(reader));
                }

                return ApplyPaging(items, query.PageIndex, query.PageSize > 0 ? query.PageSize : 50);
            }
        }

        public void SaveTask(WorkflowTaskInstance task)
        {
            if (task == null || string.IsNullOrWhiteSpace(task.TaskId))
                return;

            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
IF EXISTS (SELECT 1 FROM [dbo].[MF_WorkflowTasks] WHERE [TaskId] = @TaskId)
    UPDATE [dbo].[MF_WorkflowTasks]
       SET [CaseId] = @CaseId,
           [ExecutionId] = @ExecutionId,
           [FormId] = @FormId,
           [SubmissionId] = @SubmissionId,
           [NodeId] = @NodeId,
           [NodeLabel] = @NodeLabel,
           [Status] = @Status,
           [CandidateRolesJson] = @CandidateRolesJson,
           [CandidateUsersJson] = @CandidateUsersJson,
           [AssignedUserId] = @AssignedUserId,
           [AssignedUserName] = @AssignedUserName,
           [AssignedDisplayName] = @AssignedDisplayName,
           [AllowClaim] = @AllowClaim,
           [AllowForward] = @AllowForward,
           [AllowReassign] = @AllowReassign,
           [CommentRequiredOnReject] = @CommentRequiredOnReject,
           [PendingSubmissionStatus] = @PendingSubmissionStatus,
           [ApprovedSubmissionStatus] = @ApprovedSubmissionStatus,
           [RejectedSubmissionStatus] = @RejectedSubmissionStatus,
           [Outcome] = @Outcome,
           [Comment] = @Comment,
           [CreatedAt] = @CreatedAt,
           [ClaimedAt] = @ClaimedAt,
           [DueAt] = @DueAt,
           [CompletedAt] = @CompletedAt
     WHERE [TaskId] = @TaskId;
ELSE
    INSERT INTO [dbo].[MF_WorkflowTasks]
        ([TaskId], [CaseId], [ExecutionId], [FormId], [SubmissionId], [NodeId], [NodeLabel], [Status], [CandidateRolesJson], [CandidateUsersJson], [AssignedUserId], [AssignedUserName], [AssignedDisplayName], [AllowClaim], [AllowForward], [AllowReassign], [CommentRequiredOnReject], [PendingSubmissionStatus], [ApprovedSubmissionStatus], [RejectedSubmissionStatus], [Outcome], [Comment], [CreatedAt], [ClaimedAt], [DueAt], [CompletedAt])
    VALUES
        (@TaskId, @CaseId, @ExecutionId, @FormId, @SubmissionId, @NodeId, @NodeLabel, @Status, @CandidateRolesJson, @CandidateUsersJson, @AssignedUserId, @AssignedUserName, @AssignedDisplayName, @AllowClaim, @AllowForward, @AllowReassign, @CommentRequiredOnReject, @PendingSubmissionStatus, @ApprovedSubmissionStatus, @RejectedSubmissionStatus, @Outcome, @Comment, @CreatedAt, @ClaimedAt, @DueAt, @CompletedAt);";

                AddTaskParams(cmd, task);
                cmd.ExecuteNonQuery();
            }
        }

        public void AddTaskAction(WorkflowTaskAction action)
        {
            if (action == null || string.IsNullOrWhiteSpace(action.ActionId))
                return;

            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
IF NOT EXISTS (SELECT 1 FROM [dbo].[MF_WorkflowTaskActions] WHERE [ActionId] = @ActionId)
    INSERT INTO [dbo].[MF_WorkflowTaskActions]
        ([ActionId], [TaskId], [CaseId], [ExecutionId], [FormId], [SubmissionId], [ActionType], [ActorUserId], [ActorUserName], [ActorDisplayName], [TargetUser], [Outcome], [Comment], [CreatedAt])
    VALUES
        (@ActionId, @TaskId, @CaseId, @ExecutionId, @FormId, @SubmissionId, @ActionType, @ActorUserId, @ActorUserName, @ActorDisplayName, @TargetUser, @Outcome, @Comment, @CreatedAt);";

                AddParam(cmd, "@ActionId", action.ActionId);
                AddParam(cmd, "@TaskId", action.TaskId ?? string.Empty);
                AddParam(cmd, "@CaseId", action.CaseId ?? string.Empty);
                AddParam(cmd, "@ExecutionId", action.ExecutionId ?? string.Empty);
                AddParam(cmd, "@FormId", action.FormId);
                AddParam(cmd, "@SubmissionId", action.SubmissionId);
                AddParam(cmd, "@ActionType", (action.ActionType.ToString() ?? string.Empty).ToLowerInvariant());
                AddParam(cmd, "@ActorUserId", (object)action.ActorUserId ?? DBNull.Value);
                AddParam(cmd, "@ActorUserName", action.ActorUserName ?? string.Empty);
                AddParam(cmd, "@ActorDisplayName", action.ActorDisplayName ?? string.Empty);
                AddParam(cmd, "@TargetUser", action.TargetUser ?? string.Empty);
                AddParam(cmd, "@Outcome", action.Outcome ?? string.Empty);
                AddParam(cmd, "@Comment", action.Comment ?? string.Empty);
                AddParam(cmd, "@CreatedAt", action.CreatedAt);
                cmd.ExecuteNonQuery();
            }
        }

        public List<WorkflowTaskAction> ListTaskActions(string taskId)
        {
            var items = new List<WorkflowTaskAction>();
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT *
  FROM [dbo].[MF_WorkflowTaskActions]
 WHERE [TaskId] = @TaskId
 ORDER BY [CreatedAt]";
                AddParam(cmd, "@TaskId", taskId);
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                        items.Add(MapAction(reader));
                }
            }
            return items;
        }

        private static SqlConnection OpenConnection()
        {
            var conn = new SqlConnection(ConnectionString);
            conn.Open();
            EnsureSchema(conn);
            return conn;
        }

        private static void EnsureSchema(SqlConnection conn)
        {
            EnsureWorkflowJsonColumn(conn);
            EnsureWorkflowTableColumns(conn);

            if (_schemaReady)
                return;

            lock (SchemaLock)
            {
                if (_schemaReady)
                    return;

                Execute(conn, @"
IF OBJECT_ID(N'[dbo].[MF_WorkflowExecutions]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_WorkflowExecutions] (
        [ExecutionId] nvarchar(64) NOT NULL PRIMARY KEY,
        [FormId] int NOT NULL DEFAULT 0,
        [SubmissionId] int NOT NULL DEFAULT 0,
        [Status] nvarchar(32) NOT NULL DEFAULT 'running',
        [StartedAt] datetime2 NOT NULL,
        [CompletedAt] datetime2 NULL,
        [CurrentNodeId] nvarchar(200) NOT NULL DEFAULT '',
        [ContextJson] nvarchar(max) NOT NULL DEFAULT '',
        [ErrorMessage] nvarchar(max) NOT NULL DEFAULT ''
    );
    CREATE INDEX [IX_MF_WorkflowExecutions_FormStarted] ON [dbo].[MF_WorkflowExecutions]([FormId], [StartedAt]);
END;

IF OBJECT_ID(N'[dbo].[MF_WorkflowCases]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_WorkflowCases] (
        [CaseId] nvarchar(64) NOT NULL PRIMARY KEY,
        [ExecutionId] nvarchar(64) NOT NULL DEFAULT '',
        [FormId] int NOT NULL DEFAULT 0,
        [SubmissionId] int NOT NULL DEFAULT 0,
        [WorkflowId] nvarchar(64) NOT NULL DEFAULT '',
        [CurrentNodeId] nvarchar(200) NOT NULL DEFAULT '',
        [Status] nvarchar(32) NOT NULL DEFAULT 'running',
        [StartedByUserId] int NULL,
        [StartedByUserName] nvarchar(256) NOT NULL DEFAULT '',
        [ActiveTaskId] nvarchar(64) NOT NULL DEFAULT '',
        [Outcome] nvarchar(64) NOT NULL DEFAULT '',
        [LastComment] nvarchar(max) NOT NULL DEFAULT '',
        [CreatedAt] datetime2 NOT NULL,
        [CompletedAt] datetime2 NULL
    );
    CREATE UNIQUE INDEX [IX_MF_WorkflowCases_ExecutionId] ON [dbo].[MF_WorkflowCases]([ExecutionId]);
    CREATE INDEX [IX_MF_WorkflowCases_FormSubmissionStatus] ON [dbo].[MF_WorkflowCases]([FormId], [SubmissionId], [Status]);
END;

IF OBJECT_ID(N'[dbo].[MF_WorkflowTasks]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_WorkflowTasks] (
        [TaskId] nvarchar(64) NOT NULL PRIMARY KEY,
        [CaseId] nvarchar(64) NOT NULL DEFAULT '',
        [ExecutionId] nvarchar(64) NOT NULL DEFAULT '',
        [FormId] int NOT NULL DEFAULT 0,
        [SubmissionId] int NOT NULL DEFAULT 0,
        [NodeId] nvarchar(200) NOT NULL DEFAULT '',
        [NodeLabel] nvarchar(256) NOT NULL DEFAULT '',
        [Status] nvarchar(32) NOT NULL DEFAULT 'pending',
        [CandidateRolesJson] nvarchar(max) NOT NULL DEFAULT '[]',
        [CandidateUsersJson] nvarchar(max) NOT NULL DEFAULT '[]',
        [AssignedUserId] int NULL,
        [AssignedUserName] nvarchar(256) NOT NULL DEFAULT '',
        [AssignedDisplayName] nvarchar(256) NOT NULL DEFAULT '',
        [AllowClaim] bit NOT NULL DEFAULT 1,
        [AllowForward] bit NOT NULL DEFAULT 1,
        [AllowReassign] bit NOT NULL DEFAULT 1,
        [CommentRequiredOnReject] bit NOT NULL DEFAULT 0,
        [PendingSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'pending_approval',
        [ApprovedSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'approved',
        [RejectedSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'rejected',
        [Outcome] nvarchar(64) NOT NULL DEFAULT '',
        [Comment] nvarchar(max) NOT NULL DEFAULT '',
        [CreatedAt] datetime2 NOT NULL,
        [ClaimedAt] datetime2 NULL,
        [DueAt] datetime2 NULL,
        [CompletedAt] datetime2 NULL
    );
    CREATE INDEX [IX_MF_WorkflowTasks_CaseStatus] ON [dbo].[MF_WorkflowTasks]([CaseId], [Status]);
    CREATE INDEX [IX_MF_WorkflowTasks_ExecutionNodeStatus] ON [dbo].[MF_WorkflowTasks]([ExecutionId], [NodeId], [Status]);
    CREATE INDEX [IX_MF_WorkflowTasks_FormSubmissionStatus] ON [dbo].[MF_WorkflowTasks]([FormId], [SubmissionId], [Status]);
END;

IF OBJECT_ID(N'[dbo].[MF_WorkflowTaskActions]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_WorkflowTaskActions] (
        [ActionId] nvarchar(64) NOT NULL PRIMARY KEY,
        [TaskId] nvarchar(64) NOT NULL DEFAULT '',
        [CaseId] nvarchar(64) NOT NULL DEFAULT '',
        [ExecutionId] nvarchar(64) NOT NULL DEFAULT '',
        [FormId] int NOT NULL DEFAULT 0,
        [SubmissionId] int NOT NULL DEFAULT 0,
        [ActionType] nvarchar(32) NOT NULL DEFAULT '',
        [ActorUserId] int NULL,
        [ActorUserName] nvarchar(256) NOT NULL DEFAULT '',
        [ActorDisplayName] nvarchar(256) NOT NULL DEFAULT '',
        [TargetUser] nvarchar(256) NOT NULL DEFAULT '',
        [Outcome] nvarchar(64) NOT NULL DEFAULT '',
        [Comment] nvarchar(max) NOT NULL DEFAULT '',
        [CreatedAt] datetime2 NOT NULL
    );
    CREATE INDEX [IX_MF_WorkflowTaskActions_TaskCreatedAt] ON [dbo].[MF_WorkflowTaskActions]([TaskId], [CreatedAt]);
    CREATE INDEX [IX_MF_WorkflowTaskActions_CaseCreatedAt] ON [dbo].[MF_WorkflowTaskActions]([CaseId], [CreatedAt]);
END;");

                _schemaReady = true;
            }
        }

        private static void EnsureWorkflowTableColumns(SqlConnection conn)
        {
            if (_workflowTablesUpgradeReady)
                return;

            lock (SchemaLock)
            {
                if (_workflowTablesUpgradeReady)
                    return;

                Execute(conn, @"
IF OBJECT_ID(N'[dbo].[MF_WorkflowCases]', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'WorkflowId') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [WorkflowId] nvarchar(64) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'StartedByUserId') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [StartedByUserId] int NULL;
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'StartedByUserName') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [StartedByUserName] nvarchar(256) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'ActiveTaskId') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [ActiveTaskId] nvarchar(64) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'Outcome') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [Outcome] nvarchar(64) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowCases', 'LastComment') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowCases] ADD [LastComment] nvarchar(max) NOT NULL DEFAULT '';
END;

IF OBJECT_ID(N'[dbo].[MF_WorkflowTasks]', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'CandidateRolesJson') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [CandidateRolesJson] nvarchar(max) NOT NULL DEFAULT '[]';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'CandidateUsersJson') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [CandidateUsersJson] nvarchar(max) NOT NULL DEFAULT '[]';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'AssignedDisplayName') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [AssignedDisplayName] nvarchar(256) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'AllowClaim') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [AllowClaim] bit NOT NULL DEFAULT 1;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'AllowForward') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [AllowForward] bit NOT NULL DEFAULT 1;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'AllowReassign') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [AllowReassign] bit NOT NULL DEFAULT 1;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'CommentRequiredOnReject') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [CommentRequiredOnReject] bit NOT NULL DEFAULT 0;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'PendingSubmissionStatus') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [PendingSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'pending_approval';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'ApprovedSubmissionStatus') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [ApprovedSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'approved';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'RejectedSubmissionStatus') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [RejectedSubmissionStatus] nvarchar(64) NOT NULL DEFAULT 'rejected';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'Outcome') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [Outcome] nvarchar(64) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'Comment') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [Comment] nvarchar(max) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'ClaimedAt') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [ClaimedAt] datetime2 NULL;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'DueAt') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [DueAt] datetime2 NULL;
    IF COL_LENGTH('dbo.MF_WorkflowTasks', 'CompletedAt') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [CompletedAt] datetime2 NULL;
END;

IF OBJECT_ID(N'[dbo].[MF_WorkflowTaskActions]', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.MF_WorkflowTaskActions', 'TargetUser') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTaskActions] ADD [TargetUser] nvarchar(256) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowTaskActions', 'Outcome') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTaskActions] ADD [Outcome] nvarchar(64) NOT NULL DEFAULT '';
    IF COL_LENGTH('dbo.MF_WorkflowTaskActions', 'Comment') IS NULL
        ALTER TABLE [dbo].[MF_WorkflowTaskActions] ADD [Comment] nvarchar(max) NOT NULL DEFAULT '';
END;");

                _workflowTablesUpgradeReady = true;
            }
        }

        private static void EnsureWorkflowJsonColumn(SqlConnection conn)
        {
            if (_workflowColumnReady)
                return;

            lock (SchemaLock)
            {
                if (_workflowColumnReady)
                    return;

                Execute(conn, @"
IF COL_LENGTH('dbo.MF_Forms', 'WorkflowJson') IS NULL
    ALTER TABLE [dbo].[MF_Forms] ADD [WorkflowJson] nvarchar(max) NULL;");
                _workflowColumnReady = true;
            }
        }

        private static void Execute(SqlConnection conn, string sql)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = sql;
                cmd.ExecuteNonQuery();
            }
        }

        private static string ReadWorkflowJson(int formId)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT [WorkflowJson] FROM [dbo].[MF_Forms] WHERE [FormId] = @FormId";
                AddParam(cmd, "@FormId", formId);
                var value = cmd.ExecuteScalar();
                return value == null || value == DBNull.Value ? null : value.ToString();
            }
        }

        private static void WriteWorkflowJson(int formId, string json)
        {
            using (var conn = OpenConnection())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "UPDATE [dbo].[MF_Forms] SET [WorkflowJson] = @Json WHERE [FormId] = @FormId";
                AddParam(cmd, "@Json", (object)json ?? DBNull.Value);
                AddParam(cmd, "@FormId", formId);
                if (cmd.ExecuteNonQuery() == 0)
                    throw new InvalidOperationException("Form " + formId + " not found.");
            }
        }

        private static void AddCaseParams(SqlCommand cmd, WorkflowCaseInstance workflowCase)
        {
            AddParam(cmd, "@CaseId", workflowCase.CaseId);
            AddParam(cmd, "@ExecutionId", workflowCase.ExecutionId ?? string.Empty);
            AddParam(cmd, "@FormId", workflowCase.FormId);
            AddParam(cmd, "@SubmissionId", workflowCase.SubmissionId);
            AddParam(cmd, "@WorkflowId", workflowCase.WorkflowId ?? string.Empty);
            AddParam(cmd, "@CurrentNodeId", workflowCase.CurrentNodeId ?? string.Empty);
            AddParam(cmd, "@Status", (workflowCase.Status.ToString() ?? "running").ToLowerInvariant());
            AddParam(cmd, "@StartedByUserId", (object)workflowCase.StartedByUserId ?? DBNull.Value);
            AddParam(cmd, "@StartedByUserName", workflowCase.StartedByUserName ?? string.Empty);
            AddParam(cmd, "@ActiveTaskId", workflowCase.ActiveTaskId ?? string.Empty);
            AddParam(cmd, "@Outcome", workflowCase.Outcome ?? string.Empty);
            AddParam(cmd, "@LastComment", workflowCase.LastComment ?? string.Empty);
            AddParam(cmd, "@CreatedAt", workflowCase.CreatedAt);
            AddParam(cmd, "@CompletedAt", (object)workflowCase.CompletedAt ?? DBNull.Value);
        }

        private static void AddTaskParams(SqlCommand cmd, WorkflowTaskInstance task)
        {
            AddParam(cmd, "@TaskId", task.TaskId);
            AddParam(cmd, "@CaseId", task.CaseId ?? string.Empty);
            AddParam(cmd, "@ExecutionId", task.ExecutionId ?? string.Empty);
            AddParam(cmd, "@FormId", task.FormId);
            AddParam(cmd, "@SubmissionId", task.SubmissionId);
            AddParam(cmd, "@NodeId", task.NodeId ?? string.Empty);
            AddParam(cmd, "@NodeLabel", task.NodeLabel ?? string.Empty);
            AddParam(cmd, "@Status", (task.Status.ToString() ?? "pending").ToLowerInvariant());
            AddParam(cmd, "@CandidateRolesJson", SerializeList(task.CandidateRoles));
            AddParam(cmd, "@CandidateUsersJson", SerializeList(task.CandidateUsers));
            AddParam(cmd, "@AssignedUserId", (object)task.AssignedUserId ?? DBNull.Value);
            AddParam(cmd, "@AssignedUserName", task.AssignedUserName ?? string.Empty);
            AddParam(cmd, "@AssignedDisplayName", task.AssignedDisplayName ?? string.Empty);
            AddParam(cmd, "@AllowClaim", task.AllowClaim);
            AddParam(cmd, "@AllowForward", task.AllowForward);
            AddParam(cmd, "@AllowReassign", task.AllowReassign);
            AddParam(cmd, "@CommentRequiredOnReject", task.CommentRequiredOnReject);
            AddParam(cmd, "@PendingSubmissionStatus", task.PendingSubmissionStatus ?? "pending_approval");
            AddParam(cmd, "@ApprovedSubmissionStatus", task.ApprovedSubmissionStatus ?? "approved");
            AddParam(cmd, "@RejectedSubmissionStatus", task.RejectedSubmissionStatus ?? "rejected");
            AddParam(cmd, "@Outcome", task.Outcome ?? string.Empty);
            AddParam(cmd, "@Comment", task.Comment ?? string.Empty);
            AddParam(cmd, "@CreatedAt", task.CreatedAt);
            AddParam(cmd, "@ClaimedAt", (object)task.ClaimedAt ?? DBNull.Value);
            AddParam(cmd, "@DueAt", (object)task.DueAt ?? DBNull.Value);
            AddParam(cmd, "@CompletedAt", (object)task.CompletedAt ?? DBNull.Value);
        }

        private static void AddParam(SqlCommand cmd, string name, object value)
        {
            var parameter = cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            if (value is string && value == null)
                parameter.Value = DBNull.Value;
        }

        private static string Serialize(WorkflowExecutionContext ctx)
        {
            try { return JsonConvert.SerializeObject(ctx, JsonSettings); }
            catch { return "{}"; }
        }

        private static string SerializeList(List<string> values)
        {
            try { return JsonConvert.SerializeObject(values ?? new List<string>()); }
            catch { return "[]"; }
        }

        private static List<string> DeserializeList(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new List<string>();
            try { return JsonConvert.DeserializeObject<List<string>>(json) ?? new List<string>(); }
            catch { return new List<string>(); }
        }

        private static string BumpDraftVersion(string current)
        {
            if (string.IsNullOrEmpty(current))
                return "1.0.1-draft";

            var baseVersion = current.Replace("-draft", "");
            var parts = baseVersion.Split('.');
            int patch;
            if (parts.Length >= 3 && int.TryParse(parts[2], out patch))
                parts[2] = (patch + 1).ToString();
            return string.Join(".", parts) + "-draft";
        }

        private static string ToAppliedVersion(string draftVersion)
        {
            return string.IsNullOrEmpty(draftVersion) ? "1.0.0" : draftVersion.Replace("-draft", "");
        }

        private static List<T> ApplyPaging<T>(List<T> source, int pageIndex, int pageSize)
        {
            if (source == null)
                return new List<T>();
            if (pageSize <= 0)
                pageSize = 20;
            if (pageSize > 500)
                pageSize = 500;
            if (pageIndex < 0)
                pageIndex = 0;
            return source.Skip(pageIndex * pageSize).Take(pageSize).ToList();
        }

        private static WorkflowCaseInstance MapCase(IDataRecord row)
        {
            WorkflowCaseStatus status;
            if (!Enum.TryParse(GetString(row, "Status"), true, out status))
                status = WorkflowCaseStatus.Running;

            return new WorkflowCaseInstance
            {
                CaseId = GetString(row, "CaseId"),
                ExecutionId = GetString(row, "ExecutionId"),
                FormId = GetInt(row, "FormId"),
                SubmissionId = GetInt(row, "SubmissionId"),
                WorkflowId = GetString(row, "WorkflowId"),
                CurrentNodeId = GetString(row, "CurrentNodeId"),
                Status = status,
                StartedByUserId = GetNullableInt(row, "StartedByUserId"),
                StartedByUserName = GetString(row, "StartedByUserName"),
                ActiveTaskId = GetString(row, "ActiveTaskId"),
                Outcome = GetString(row, "Outcome"),
                LastComment = GetString(row, "LastComment"),
                CreatedAt = GetDateTime(row, "CreatedAt"),
                CompletedAt = GetNullableDateTime(row, "CompletedAt")
            };
        }

        private static WorkflowTaskInstance MapTask(IDataRecord row)
        {
            WorkflowTaskStatus status;
            if (!Enum.TryParse(GetString(row, "Status"), true, out status))
                status = WorkflowTaskStatus.Pending;

            return new WorkflowTaskInstance
            {
                TaskId = GetString(row, "TaskId"),
                CaseId = GetString(row, "CaseId"),
                ExecutionId = GetString(row, "ExecutionId"),
                FormId = GetInt(row, "FormId"),
                SubmissionId = GetInt(row, "SubmissionId"),
                NodeId = GetString(row, "NodeId"),
                NodeLabel = GetString(row, "NodeLabel"),
                Status = status,
                CandidateRoles = DeserializeList(GetString(row, "CandidateRolesJson")),
                CandidateUsers = DeserializeList(GetString(row, "CandidateUsersJson")),
                AssignedUserId = GetNullableInt(row, "AssignedUserId"),
                AssignedUserName = GetString(row, "AssignedUserName"),
                AssignedDisplayName = GetString(row, "AssignedDisplayName"),
                AllowClaim = GetBool(row, "AllowClaim"),
                AllowForward = GetBool(row, "AllowForward"),
                AllowReassign = GetBool(row, "AllowReassign"),
                CommentRequiredOnReject = GetBool(row, "CommentRequiredOnReject"),
                PendingSubmissionStatus = GetString(row, "PendingSubmissionStatus"),
                ApprovedSubmissionStatus = GetString(row, "ApprovedSubmissionStatus"),
                RejectedSubmissionStatus = GetString(row, "RejectedSubmissionStatus"),
                Outcome = GetString(row, "Outcome"),
                Comment = GetString(row, "Comment"),
                CreatedAt = GetDateTime(row, "CreatedAt"),
                ClaimedAt = GetNullableDateTime(row, "ClaimedAt"),
                DueAt = GetNullableDateTime(row, "DueAt"),
                CompletedAt = GetNullableDateTime(row, "CompletedAt")
            };
        }

        private static WorkflowTaskAction MapAction(IDataRecord row)
        {
            WorkflowTaskActionType actionType;
            if (!Enum.TryParse(GetString(row, "ActionType"), true, out actionType))
                actionType = WorkflowTaskActionType.Commented;

            return new WorkflowTaskAction
            {
                ActionId = GetString(row, "ActionId"),
                TaskId = GetString(row, "TaskId"),
                CaseId = GetString(row, "CaseId"),
                ExecutionId = GetString(row, "ExecutionId"),
                FormId = GetInt(row, "FormId"),
                SubmissionId = GetInt(row, "SubmissionId"),
                ActionType = actionType,
                ActorUserId = GetNullableInt(row, "ActorUserId"),
                ActorUserName = GetString(row, "ActorUserName"),
                ActorDisplayName = GetString(row, "ActorDisplayName"),
                TargetUser = GetString(row, "TargetUser"),
                Outcome = GetString(row, "Outcome"),
                Comment = GetString(row, "Comment"),
                CreatedAt = GetDateTime(row, "CreatedAt")
            };
        }

        private static string GetString(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return row.IsDBNull(ordinal) ? string.Empty : Convert.ToString(row.GetValue(ordinal)) ?? string.Empty;
        }

        private static int GetInt(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return row.IsDBNull(ordinal) ? 0 : Convert.ToInt32(row.GetValue(ordinal));
        }

        private static int? GetNullableInt(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return row.IsDBNull(ordinal) ? (int?)null : Convert.ToInt32(row.GetValue(ordinal));
        }

        private static bool GetBool(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return !row.IsDBNull(ordinal) && Convert.ToBoolean(row.GetValue(ordinal));
        }

        private static DateTime GetDateTime(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return row.IsDBNull(ordinal) ? DateTime.UtcNow : Convert.ToDateTime(row.GetValue(ordinal));
        }

        private static DateTime? GetNullableDateTime(IDataRecord row, string column)
        {
            var ordinal = row.GetOrdinal(column);
            return row.IsDBNull(ordinal) ? (DateTime?)null : Convert.ToDateTime(row.GetValue(ordinal));
        }
    }
}
