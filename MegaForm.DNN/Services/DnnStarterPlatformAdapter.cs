// ============================================================
// [DnnStarterPlatformAdapter v20260518-01]
// DNN-side implementation of IStarterPlatformAdapter (Core).
// Lets the Business Starter services (now hosted in MegaForm.Core
// .Services.Starters so DNN can construct them) talk to the DNN
// database via raw ADO.NET. Mirrors the EF behaviour that
// OqtaneStarterPlatformAdapter provides on the Oqtane side.
// ============================================================

using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using DotNetNuke.Entities.Users;
using MegaForm.Core.Services.Starters;

namespace MegaForm.DNN.Services
{
    public sealed class DnnStarterPlatformAdapter : IStarterPlatformAdapter
    {
        public const string Badge = "DnnStarterPlatformAdapter v20260518-01";

        private static string ConnectionString
            => DotNetNuke.Data.DataProvider.Instance().ConnectionString;

        public int ResolveUserIdByNameOrEmail(string userName, string email)
        {
            // Prefer the DotNetNuke API path (cache + portal awareness) before
            // falling back to raw SQL against [Users]. The DNN UserController
            // returns the same UserId we'd find in the table — it just keeps
            // the lookup behind the standard DNN data layer cache.
            var normalizedUserName = (userName ?? string.Empty).Trim();
            var normalizedEmail    = (email    ?? string.Empty).Trim();

            if (!string.IsNullOrWhiteSpace(normalizedUserName))
            {
                try
                {
                    var portalId = ResolveCurrentPortalId();
                    var user = UserController.GetUserByName(portalId, normalizedUserName);
                    if (user != null && user.UserID > 0)
                        return user.UserID;
                }
                catch { /* fall through to SQL */ }
            }

            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
SELECT TOP 1 UserID
FROM dbo.Users
WHERE UPPER(Username) = @UserName OR UPPER(Email) = @Email
ORDER BY CASE WHEN UPPER(Username) = @UserName THEN 0 ELSE 1 END, UserID DESC;";
                cmd.Parameters.Add(new SqlParameter("@UserName", SqlDbType.NVarChar, 256) { Value = normalizedUserName.ToUpperInvariant() });
                cmd.Parameters.Add(new SqlParameter("@Email",    SqlDbType.NVarChar, 256) { Value = normalizedEmail.ToUpperInvariant() });

                conn.Open();
                var scalar = cmd.ExecuteScalar();
                if (scalar == null || scalar == DBNull.Value) return 0;
                try { return Convert.ToInt32(scalar); } catch { return 0; }
            }
        }

        public void ResetFormRuntimeData(int formId)
        {
            if (formId <= 0) return;

            // Order matters: leaves first, parents last, so FK-less deletes
            // stay consistent. MegaForm doesn't enforce FK constraints between
            // these tables but readers (workflow inbox / submission detail)
            // could race a partial reset, so we wrap everything in one
            // transaction.
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    ExecuteScoped(conn, tx, "DELETE FROM dbo.MF_WorkflowTaskActions WHERE FormId = @FormId", formId);
                    ExecuteScoped(conn, tx, "DELETE FROM dbo.MF_WorkflowTasks       WHERE FormId = @FormId", formId);
                    ExecuteScoped(conn, tx, "DELETE FROM dbo.MF_WorkflowCases       WHERE FormId = @FormId", formId);
                    ExecuteScoped(conn, tx, "DELETE FROM dbo.MF_WorkflowExecutions  WHERE FormId = @FormId", formId);
                    ExecuteScoped(conn, tx,
                        @"DELETE v FROM dbo.MF_SubmissionValues v
                          INNER JOIN dbo.MF_Submissions s ON s.SubmissionId = v.SubmissionId
                          WHERE s.FormId = @FormId", formId);
                    ExecuteScoped(conn, tx,
                        @"DELETE f FROM dbo.MF_Files f
                          INNER JOIN dbo.MF_Submissions s ON s.SubmissionId = f.SubmissionId
                          WHERE s.FormId = @FormId", formId);
                    ExecuteScoped(conn, tx,
                        @"DELETE sl FROM dbo.MF_SubmissionLinks sl
                          WHERE EXISTS (SELECT 1 FROM dbo.MF_Submissions s WHERE s.SubmissionId = sl.ParentSubmissionId AND s.FormId = @FormId)
                             OR EXISTS (SELECT 1 FROM dbo.MF_Submissions s WHERE s.SubmissionId = sl.ChildSubmissionId AND s.FormId = @FormId)", formId);
                    ExecuteScoped(conn, tx, "DELETE FROM dbo.MF_Submissions WHERE FormId = @FormId", formId);
                    tx.Commit();
                }
            }
        }

        public void PersistSeededAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? Enumerable.Empty<StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    foreach (var att in list)
                    {
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.Transaction = tx;
                            cmd.CommandText = @"
INSERT INTO dbo.MF_Files (SubmissionId, FieldKey, OriginalName, StoredPath, ContentType, FileSizeBytes, UploadedOnUtc)
VALUES (@SubmissionId, @FieldKey, @OriginalName, @StoredPath, @ContentType, @FileSizeBytes, @UploadedOnUtc);";
                            cmd.Parameters.Add(new SqlParameter("@SubmissionId",  SqlDbType.Int)        { Value = submissionId });
                            cmd.Parameters.Add(new SqlParameter("@FieldKey",      SqlDbType.NVarChar, 200) { Value = (object)att.FieldKey     ?? string.Empty });
                            cmd.Parameters.Add(new SqlParameter("@OriginalName",  SqlDbType.NVarChar, 400) { Value = (object)att.FileName     ?? string.Empty });
                            cmd.Parameters.Add(new SqlParameter("@StoredPath",    SqlDbType.NVarChar, 800) { Value = (object)att.RelativePath ?? string.Empty });
                            cmd.Parameters.Add(new SqlParameter("@ContentType",   SqlDbType.NVarChar, 200) { Value = (object)att.ContentType  ?? string.Empty });
                            cmd.Parameters.Add(new SqlParameter("@FileSizeBytes", SqlDbType.BigInt)        { Value = att.FileSizeBytes });
                            cmd.Parameters.Add(new SqlParameter("@UploadedOnUtc", SqlDbType.DateTime2)     { Value = DateTime.UtcNow });
                            cmd.ExecuteNonQuery();
                        }
                    }
                    tx.Commit();
                }
            }
        }

        private static void ExecuteScoped(SqlConnection conn, SqlTransaction tx, string sql, int formId)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.Transaction = tx;
                cmd.CommandText = sql;
                cmd.Parameters.Add(new SqlParameter("@FormId", SqlDbType.Int) { Value = formId });
                cmd.ExecuteNonQuery();
            }
        }

        private static int ResolveCurrentPortalId()
        {
            try
            {
                var current = DotNetNuke.Entities.Portals.PortalSettings.Current;
                if (current != null && current.PortalId >= 0) return current.PortalId;
            }
            catch { }
            return 0;
        }
    }
}
