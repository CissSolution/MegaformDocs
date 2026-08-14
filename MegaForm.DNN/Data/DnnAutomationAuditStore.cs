/*
 * MegaForm.DNN/Data/DnnAutomationAuditStore.cs
 *
 * [Automation v2 20260813-01] The audit trail for MegaForm Automation on DNN.
 *
 * Four tables, created on first use — DNN install scripts run once per version and a feature added
 * between releases cannot assume one has run:
 *
 *   MF_AutomationScriptApprovals   who approved which script, for which stage, and its hash
 *   MF_AutomationRuns              one row per stage execution: outcome, duration, abort, actor
 *   MF_AutomationCapabilityCalls   one row per ctx.Actions / ctx.Api call, attached to its run
 *   MF_AutomationOutbox            queued work for the AsyncWorker stage
 *
 * ── Why the capability table is separate from the run table ──────────────────────
 * "Did this submission reach the CRM" and "did the script succeed" are different questions with
 * different answers. A script can end successfully having made an outbound call that returned 500,
 * and a script can fail after writing three rows it did not roll back. Recording only the run
 * outcome answers neither question honestly; recording every call, with its target and status, does.
 *
 * Every write here is fail-soft. Losing an audit row is bad; losing a customer's submission because
 * an audit insert deadlocked is worse. The service also mirrors the same facts into the DNN event
 * log, so a lost row is not a lost record.
 */

using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using MegaForm.Core.Automation;
using MegaForm.Core.Services;

namespace MegaForm.DNN.Data
{
    public sealed class DnnAutomationAuditStore : IAutomationAuditStore
    {
        private static readonly string ConnectionString =
            DotNetNuke.Common.Utilities.Config.GetConnectionString();

        private static readonly object SchemaLock = new object();
        private static bool _schemaReady;

        // ─── schema ───────────────────────────────────────────────────────────────

        private static void EnsureSchema(SqlConnection conn)
        {
            if (_schemaReady) return;
            lock (SchemaLock)
            {
                if (_schemaReady) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
IF OBJECT_ID('dbo.MF_AutomationScriptApprovals','U') IS NULL
CREATE TABLE [dbo].[MF_AutomationScriptApprovals] (
    [ApprovalId]   int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId]       int NOT NULL,
    [Stage]        nvarchar(30) NOT NULL,
    [ScriptHash]   nvarchar(64) NULL,
    [Action]       nvarchar(40) NOT NULL,
    [UserId]       int NOT NULL,
    [UserName]     nvarchar(200) NULL,
    [SourceLength] int NOT NULL DEFAULT(0),
    [ChangedOnUtc] datetime NOT NULL
);

IF OBJECT_ID('dbo.MF_AutomationRuns','U') IS NULL
CREATE TABLE [dbo].[MF_AutomationRuns] (
    [RunId]        bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId]       int NOT NULL,
    [SubmissionId] int NULL,
    [Stage]        nvarchar(30) NOT NULL,
    [ScriptHash]   nvarchar(64) NULL,
    [Success]      bit NOT NULL,
    [Aborted]      bit NOT NULL DEFAULT(0),
    [DurationMs]   int NOT NULL DEFAULT(0),
    [ActorUserId]  int NOT NULL DEFAULT(0),
    [ErrorMessage] nvarchar(2000) NULL,
    [LogText]      nvarchar(max) NULL,
    [RanOnUtc]     datetime NOT NULL
);

IF OBJECT_ID('dbo.MF_AutomationCapabilityCalls','U') IS NULL
CREATE TABLE [dbo].[MF_AutomationCapabilityCalls] (
    [CallId]       bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [RunId]        bigint NOT NULL,
    [FormId]       int NOT NULL,
    [SubmissionId] int NULL,
    [Capability]   nvarchar(30) NOT NULL,
    [Target]       nvarchar(200) NULL,
    [Success]      bit NOT NULL,
    [DurationMs]   int NOT NULL DEFAULT(0),
    [Detail]       nvarchar(1000) NULL,
    [AtUtc]        datetime NOT NULL
);

IF OBJECT_ID('dbo.MF_AutomationOutbox','U') IS NULL
CREATE TABLE [dbo].[MF_AutomationOutbox] (
    [OutboxId]     bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId]       int NOT NULL,
    [SubmissionId] int NULL,
    [Stage]        nvarchar(30) NOT NULL,
    [PayloadJson]  nvarchar(max) NULL,
    [Status]       nvarchar(20) NOT NULL DEFAULT('pending'),
    [Attempts]     int NOT NULL DEFAULT(0),
    [LastError]    nvarchar(2000) NULL,
    [QueuedOnUtc]  datetime NOT NULL,
    [NextRunUtc]   datetime NULL,
    [CompletedUtc] datetime NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_AutomationRuns_Form')
    CREATE INDEX [IX_MF_AutomationRuns_Form] ON [dbo].[MF_AutomationRuns] ([FormId], [RanOnUtc] DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_AutomationCalls_Run')
    CREATE INDEX [IX_MF_AutomationCalls_Run] ON [dbo].[MF_AutomationCapabilityCalls] ([RunId]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_AutomationApprovals_Form')
    CREATE INDEX [IX_MF_AutomationApprovals_Form] ON [dbo].[MF_AutomationScriptApprovals] ([FormId], [ChangedOnUtc] DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_AutomationOutbox_Pending')
    CREATE INDEX [IX_MF_AutomationOutbox_Pending] ON [dbo].[MF_AutomationOutbox] ([Status], [NextRunUtc]);";
                    cmd.ExecuteNonQuery();
                }
                _schemaReady = true;
            }
        }

        private static SqlConnection Open()
        {
            var conn = new SqlConnection(ConnectionString);
            conn.Open();
            EnsureSchema(conn);
            return conn;
        }

        // ─── IAfterSubmitScriptAuditStore (v1 shape) ──────────────────────────────

        public void RecordApproval(int formId, string scriptHash, int userId, string userName,
                                   DateTime utcNow, int sourceLength, string action)
        {
            RecordStageApproval(formId, AutomationStage.PostCommit.ToString(), scriptHash, userId,
                                userName, utcNow, sourceLength, action);
        }

        public void RecordRun(int formId, int submissionId, string scriptHash, bool success,
                              long durationMs, string errorMessage, string logText, DateTime utcNow)
        {
            RecordStageRun(formId, submissionId, AutomationStage.PostCommit.ToString(), scriptHash,
                           success, durationMs, errorMessage, logText, false, 0, utcNow);
        }

        // ─── IAutomationAuditStore ────────────────────────────────────────────────

        public void RecordStageApproval(int formId, string stage, string scriptHash, int userId,
                                        string userName, DateTime utcNow, int sourceLength, string action)
        {
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
INSERT INTO [dbo].[MF_AutomationScriptApprovals]
    ([FormId],[Stage],[ScriptHash],[Action],[UserId],[UserName],[SourceLength],[ChangedOnUtc])
VALUES (@FormId,@Stage,@Hash,@Action,@UserId,@UserName,@Len,@On);";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@Stage", stage ?? "PostCommit");
                    cmd.Parameters.AddWithValue("@Hash", (object)scriptHash ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Action", action ?? "approved");
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    cmd.Parameters.AddWithValue("@UserName", (object)userName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Len", sourceLength);
                    cmd.Parameters.AddWithValue("@On", utcNow);
                    cmd.ExecuteNonQuery();
                }
            }
            catch { /* fail-soft: see file header */ }
        }

        public long RecordStageRun(int formId, int submissionId, string stage, string scriptHash,
                                   bool success, long durationMs, string errorMessage, string logText,
                                   bool aborted, int actorUserId, DateTime utcNow)
        {
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
INSERT INTO [dbo].[MF_AutomationRuns]
    ([FormId],[SubmissionId],[Stage],[ScriptHash],[Success],[Aborted],[DurationMs],[ActorUserId],[ErrorMessage],[LogText],[RanOnUtc])
VALUES (@FormId,@SubmissionId,@Stage,@Hash,@Success,@Aborted,@Duration,@Actor,@Error,@Log,@On);
SELECT CAST(SCOPE_IDENTITY() AS bigint);";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@SubmissionId", submissionId <= 0 ? (object)DBNull.Value : submissionId);
                    cmd.Parameters.AddWithValue("@Stage", stage ?? "PostCommit");
                    cmd.Parameters.AddWithValue("@Hash", (object)scriptHash ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Success", success);
                    cmd.Parameters.AddWithValue("@Aborted", aborted);
                    cmd.Parameters.AddWithValue("@Duration", (int)Math.Min(int.MaxValue, durationMs));
                    cmd.Parameters.AddWithValue("@Actor", actorUserId);
                    cmd.Parameters.AddWithValue("@Error", (object)Truncate(errorMessage, 2000) ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Log", (object)logText ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@On", utcNow);
                    var id = cmd.ExecuteScalar();
                    return id == null || id == DBNull.Value ? 0L : Convert.ToInt64(id);
                }
            }
            catch { return 0L; }
        }

        public void RecordCapabilityCalls(long runId, int formId, int submissionId,
                                          IEnumerable<AutomationCapabilityCall> calls)
        {
            if (calls == null) return;
            try
            {
                using (var conn = Open())
                {
                    foreach (var call in calls)
                    {
                        if (call == null) continue;
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = @"
INSERT INTO [dbo].[MF_AutomationCapabilityCalls]
    ([RunId],[FormId],[SubmissionId],[Capability],[Target],[Success],[DurationMs],[Detail],[AtUtc])
VALUES (@RunId,@FormId,@SubmissionId,@Cap,@Target,@Success,@Duration,@Detail,@At);";
                            cmd.Parameters.AddWithValue("@RunId", runId);
                            cmd.Parameters.AddWithValue("@FormId", formId);
                            cmd.Parameters.AddWithValue("@SubmissionId", submissionId <= 0 ? (object)DBNull.Value : submissionId);
                            cmd.Parameters.AddWithValue("@Cap", call.Capability ?? "?");
                            cmd.Parameters.AddWithValue("@Target", (object)Truncate(call.Target, 200) ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@Success", call.Success);
                            cmd.Parameters.AddWithValue("@Duration", (int)Math.Min(int.MaxValue, call.DurationMs));
                            cmd.Parameters.AddWithValue("@Detail", (object)Truncate(call.Detail, 1000) ?? DBNull.Value);
                            cmd.Parameters.AddWithValue("@At", call.AtUtc == default(DateTime) ? DateTime.UtcNow : call.AtUtc);
                            cmd.ExecuteNonQuery();
                        }
                    }
                }
            }
            catch { /* fail-soft */ }
        }

        // ─── reads (host-only endpoint) ───────────────────────────────────────────

        public static List<object> ListRuns(int formId, int take)
        {
            var list = new List<object>();
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    // TOP pushed into SQL — bounded-read rule; never materialise then trim.
                    cmd.CommandText = @"
SELECT TOP (@Take) r.[RunId],r.[SubmissionId],r.[Stage],r.[ScriptHash],r.[Success],r.[Aborted],
       r.[DurationMs],r.[ErrorMessage],r.[LogText],r.[RanOnUtc],
       (SELECT COUNT(*) FROM [dbo].[MF_AutomationCapabilityCalls] c WHERE c.[RunId] = r.[RunId]) AS CallCount
  FROM [dbo].[MF_AutomationRuns] r
 WHERE r.[FormId] = @FormId
 ORDER BY r.[RanOnUtc] DESC;";
                    cmd.Parameters.AddWithValue("@Take", take);
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new
                            {
                                runId = r.GetInt64(0),
                                submissionId = r.IsDBNull(1) ? (int?)null : r.GetInt32(1),
                                stage = r.GetString(2),
                                scriptHash = r.IsDBNull(3) ? null : r.GetString(3),
                                success = r.GetBoolean(4),
                                aborted = r.GetBoolean(5),
                                durationMs = r.GetInt32(6),
                                error = r.IsDBNull(7) ? null : r.GetString(7),
                                log = r.IsDBNull(8) ? null : r.GetString(8),
                                ranOnUtc = r.GetDateTime(9),
                                capabilityCalls = r.GetInt32(10)
                            });
                        }
                    }
                }
            }
            catch { }
            return list;
        }

        public static List<object> ListCapabilityCalls(long runId, int take)
        {
            var list = new List<object>();
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
SELECT TOP (@Take) [Capability],[Target],[Success],[DurationMs],[Detail],[AtUtc]
  FROM [dbo].[MF_AutomationCapabilityCalls] WHERE [RunId] = @RunId ORDER BY [CallId];";
                    cmd.Parameters.AddWithValue("@Take", take);
                    cmd.Parameters.AddWithValue("@RunId", runId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                            list.Add(new
                            {
                                capability = r.GetString(0),
                                target = r.IsDBNull(1) ? null : r.GetString(1),
                                success = r.GetBoolean(2),
                                durationMs = r.GetInt32(3),
                                detail = r.IsDBNull(4) ? null : r.GetString(4),
                                atUtc = r.GetDateTime(5)
                            });
                    }
                }
            }
            catch { }
            return list;
        }

        public static List<object> ListApprovals(int formId, int take)
        {
            var list = new List<object>();
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
SELECT TOP (@Take) [ApprovalId],[Stage],[ScriptHash],[Action],[UserId],[UserName],[SourceLength],[ChangedOnUtc]
  FROM [dbo].[MF_AutomationScriptApprovals] WHERE [FormId] = @FormId ORDER BY [ChangedOnUtc] DESC;";
                    cmd.Parameters.AddWithValue("@Take", take);
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                            list.Add(new
                            {
                                approvalId = r.GetInt32(0),
                                stage = r.GetString(1),
                                scriptHash = r.IsDBNull(2) ? null : r.GetString(2),
                                action = r.GetString(3),
                                userId = r.GetInt32(4),
                                userName = r.IsDBNull(5) ? null : r.GetString(5),
                                sourceLength = r.GetInt32(6),
                                changedOnUtc = r.GetDateTime(7)
                            });
                    }
                }
            }
            catch { }
            return list;
        }

        /// <summary>
        /// Records that a host edited the catalog. The catalog is the list of things every script
        /// on the site may do, so a change to it is at least as significant as approving one script,
        /// and it is the first thing to look at when "a form started writing somewhere new".
        /// </summary>
        public static void RecordCatalogChange(int portalId, int userId, string userName,
                                               int dbActionCount, int endpointCount)
        {
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
INSERT INTO [dbo].[MF_AutomationScriptApprovals]
    ([FormId],[Stage],[ScriptHash],[Action],[UserId],[UserName],[SourceLength],[ChangedOnUtc])
VALUES (0,'Catalog',NULL,@Action,@UserId,@UserName,0,@On);";
                    cmd.Parameters.AddWithValue("@Action",
                        "catalog-saved:" + dbActionCount + "actions/" + endpointCount + "endpoints");
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    cmd.Parameters.AddWithValue("@UserName", (object)userName ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@On", DateTime.UtcNow);
                    cmd.ExecuteNonQuery();
                }
            }
            catch { /* fail-soft */ }
        }

        private static string Truncate(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}
