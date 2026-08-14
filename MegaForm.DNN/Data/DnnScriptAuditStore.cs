/*
 * MegaForm.DNN/Data/DnnScriptAuditStore.cs
 *
 * [AfterSubmitScript v20260813-01] The audit trail for the after-submit C# hook on DNN.
 *
 * Two tables, both created on first use the way DnnWorkflowRepository creates its own —
 * DNN install scripts run once per version and a feature added between releases cannot
 * rely on one having run.
 *
 *   MF_FormScriptAudit  — who approved which script, when, and what it hashed to.
 *   MF_FormScriptRuns   — one row per execution: success, duration, error, log.
 *
 * The approval table is the part that matters after an incident. "Someone put code on the
 * server" is only answerable if the answer was written down at the moment it happened, by
 * the endpoint that did it, from the server's own idea of who the caller was.
 *
 * Every method here is fail-soft: an audit write must never be the reason a submission or
 * a save fails. That is a deliberate trade — losing an audit row is bad, losing a
 * customer's submission is worse — and it is why the service ALSO writes the same facts to
 * the DNN event log through ILogService.
 */

using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using MegaForm.Core.Services;

namespace MegaForm.DNN.Data
{
    public sealed class DnnScriptAuditStore : IAfterSubmitScriptAuditStore
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
IF OBJECT_ID('dbo.MF_FormScriptAudit','U') IS NULL
CREATE TABLE [dbo].[MF_FormScriptAudit] (
    [AuditId]        int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId]         int NOT NULL,
    [ScriptHash]     nvarchar(64) NULL,
    [Action]         nvarchar(40) NOT NULL,
    [UserId]         int NOT NULL,
    [UserName]       nvarchar(200) NULL,
    [SourceLength]   int NOT NULL DEFAULT(0),
    [ChangedOnUtc]   datetime NOT NULL
);

IF OBJECT_ID('dbo.MF_FormScriptRuns','U') IS NULL
CREATE TABLE [dbo].[MF_FormScriptRuns] (
    [RunId]          int IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId]         int NOT NULL,
    [SubmissionId]   int NULL,
    [ScriptHash]     nvarchar(64) NULL,
    [Success]        bit NOT NULL,
    [DurationMs]     int NOT NULL DEFAULT(0),
    [ErrorMessage]   nvarchar(2000) NULL,
    [LogText]        nvarchar(max) NULL,
    [RanOnUtc]       datetime NOT NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_FormScriptRuns_Form')
    CREATE INDEX [IX_MF_FormScriptRuns_Form] ON [dbo].[MF_FormScriptRuns] ([FormId], [RanOnUtc] DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_FormScriptAudit_Form')
    CREATE INDEX [IX_MF_FormScriptAudit_Form] ON [dbo].[MF_FormScriptAudit] ([FormId], [ChangedOnUtc] DESC);";
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

        // ─── writes ───────────────────────────────────────────────────────────────

        public void RecordApproval(int formId, string scriptHash, int userId, string userName,
                                   DateTime utcNow, int sourceLength, string action)
        {
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
INSERT INTO [dbo].[MF_FormScriptAudit]
    ([FormId],[ScriptHash],[Action],[UserId],[UserName],[SourceLength],[ChangedOnUtc])
VALUES (@FormId,@Hash,@Action,@UserId,@UserName,@Len,@On);";
                    cmd.Parameters.AddWithValue("@FormId", formId);
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

        public void RecordRun(int formId, int submissionId, string scriptHash, bool success,
                              long durationMs, string errorMessage, string logText, DateTime utcNow)
        {
            try
            {
                using (var conn = Open())
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
INSERT INTO [dbo].[MF_FormScriptRuns]
    ([FormId],[SubmissionId],[ScriptHash],[Success],[DurationMs],[ErrorMessage],[LogText],[RanOnUtc])
VALUES (@FormId,@SubmissionId,@Hash,@Success,@Duration,@Error,@Log,@On);";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@SubmissionId", submissionId <= 0 ? (object)DBNull.Value : submissionId);
                    cmd.Parameters.AddWithValue("@Hash", (object)scriptHash ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Success", success);
                    cmd.Parameters.AddWithValue("@Duration", (int)Math.Min(int.MaxValue, durationMs));
                    cmd.Parameters.AddWithValue("@Error", (object)Truncate(errorMessage, 2000) ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Log", (object)logText ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@On", utcNow);
                    cmd.ExecuteNonQuery();
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
                    // TOP is pushed into SQL rather than trimmed in memory — bounded-read rule.
                    cmd.CommandText = @"
SELECT TOP (@Take) [RunId],[SubmissionId],[ScriptHash],[Success],[DurationMs],[ErrorMessage],[LogText],[RanOnUtc]
  FROM [dbo].[MF_FormScriptRuns] WHERE [FormId] = @FormId ORDER BY [RanOnUtc] DESC;";
                    cmd.Parameters.AddWithValue("@Take", take);
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new
                            {
                                runId = r.GetInt32(0),
                                submissionId = r.IsDBNull(1) ? (int?)null : r.GetInt32(1),
                                scriptHash = r.IsDBNull(2) ? null : r.GetString(2),
                                success = r.GetBoolean(3),
                                durationMs = r.GetInt32(4),
                                error = r.IsDBNull(5) ? null : r.GetString(5),
                                log = r.IsDBNull(6) ? null : r.GetString(6),
                                ranOnUtc = r.GetDateTime(7)
                            });
                        }
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
SELECT TOP (@Take) [AuditId],[ScriptHash],[Action],[UserId],[UserName],[SourceLength],[ChangedOnUtc]
  FROM [dbo].[MF_FormScriptAudit] WHERE [FormId] = @FormId ORDER BY [ChangedOnUtc] DESC;";
                    cmd.Parameters.AddWithValue("@Take", take);
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(new
                            {
                                auditId = r.GetInt32(0),
                                scriptHash = r.IsDBNull(1) ? null : r.GetString(1),
                                action = r.GetString(2),
                                userId = r.GetInt32(3),
                                userName = r.IsDBNull(4) ? null : r.GetString(4),
                                sourceLength = r.GetInt32(5),
                                changedOnUtc = r.GetDateTime(6)
                            });
                        }
                    }
                }
            }
            catch { }
            return list;
        }

        private static string Truncate(string s, int max)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Length <= max ? s : s.Substring(0, max);
        }
    }
}
