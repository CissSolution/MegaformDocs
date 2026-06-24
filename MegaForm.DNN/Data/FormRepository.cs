using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Framework.Providers;
using MegaForm.Core.Models;

using MfFileInfo = MegaForm.Core.Models.FileInfo;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// Data Access Layer — wraps stored procedures for MegaForm.
    /// Uses DNN's built-in data provider abstraction.
    /// </summary>
    public static partial class FormRepository
    {
        private static readonly string ConnectionString = DotNetNuke.Data.DataProvider.Instance().ConnectionString;
        private const string ModuleQualifier = "";  // no prefix needed, our tables already have MF_

        #region Forms

        public static FormInfo GetForm(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_GetById", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", formId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read()) return MapForm(reader);
                }
            }
            return null;
        }

        public static List<FormInfo> GetFormsByModule(int moduleId)
        {
            var list = new List<FormInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_GetByModule", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@ModuleId", moduleId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) list.Add(MapForm(reader));
                }
            }
            return list;
        }

        public static List<FormInfo> ListForms(int portalId, string status = null, string search = null, int pageIndex = 0, int pageSize = 20)
        {
            var list = new List<FormInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_List", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                cmd.Parameters.AddWithValue("@Status", (object)status ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Search", (object)search ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@PageIndex", pageIndex);
                cmd.Parameters.AddWithValue("@PageSize", pageSize);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) list.Add(MapForm(reader));
                }
            }
            return list;
        }

        public static int SaveForm(FormInfo form)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_Upsert", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;

                var pOut = cmd.Parameters.Add("@FormId", SqlDbType.Int);
                pOut.Direction = ParameterDirection.InputOutput;
                pOut.Value = form.FormId;

                cmd.Parameters.AddWithValue("@ModuleId", form.ModuleId);
                cmd.Parameters.AddWithValue("@PortalId", form.PortalId);
                cmd.Parameters.AddWithValue("@Title", form.Title);
                cmd.Parameters.AddWithValue("@Description", (object)form.Description ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@SchemaJson", form.SchemaJson);
                cmd.Parameters.AddWithValue("@SettingsJson", (object)form.SettingsJson ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ThemeJson", (object)form.ThemeJson ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Status", form.Status ?? "Draft");
                cmd.Parameters.AddWithValue("@SubmitButtonText", (object)form.SubmitButtonText ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@SuccessMessage", (object)form.SuccessMessage ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@RedirectUrl", (object)form.RedirectUrl ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@MaxSubmissions", (object)form.MaxSubmissions ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ExpiresOnUtc", (object)form.ExpiresOnUtc ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@RequireAuth", form.RequireAuth);
                cmd.Parameters.AddWithValue("@EnableCaptcha", form.EnableCaptcha);
                cmd.Parameters.AddWithValue("@EnableSaveResume", form.EnableSaveResume);
                cmd.Parameters.AddWithValue("@WebhookUrl", (object)form.WebhookUrl ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@WebhookSecret", (object)form.WebhookSecret ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@WebhookHeaders", (object)form.WebhookHeaders ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@NotifyEmails", (object)form.NotifyEmails ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@NotifyTemplate", (object)form.NotifyTemplate ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@AutoresponderEnabled", form.AutoresponderEnabled);
                cmd.Parameters.AddWithValue("@AutoresponderEmailField", (object)form.AutoresponderEmailField ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@AutoresponderSubject", (object)form.AutoresponderSubject ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@AutoresponderBody", (object)form.AutoresponderBody ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@AppScope", (object)form.AppScope ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@UserId", form.CreatedByUserId);

                conn.Open();
                cmd.ExecuteNonQuery();
                return (int)pOut.Value;
            }
        }

        public static void DeleteForm(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_Delete", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", formId);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        #endregion

        #region Submissions

        public static int InsertSubmission(SubmissionInfo sub)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Submission_Insert", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;

                var pOut = cmd.Parameters.Add("@SubmissionId", SqlDbType.Int);
                pOut.Direction = ParameterDirection.Output;

                cmd.Parameters.AddWithValue("@FormId", sub.FormId);
                cmd.Parameters.AddWithValue("@DataJson", sub.DataJson);
                cmd.Parameters.AddWithValue("@IpAddress", (object)sub.IpAddress ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@UserAgent", (object)sub.UserAgent ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@UserId", (object)sub.UserId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@IsSpam", sub.IsSpam);
                cmd.Parameters.AddWithValue("@SpamScore", (object)sub.SpamScore ?? DBNull.Value);

                conn.Open();
                cmd.ExecuteNonQuery();
                return (int)pOut.Value;
            }
        }

        public static SubmissionInfo GetSubmission(int submissionId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Submission_GetById", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@SubmissionId", submissionId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read()) return MapSubmission(reader);
                }
            }
            return null;
        }

        public static (List<SubmissionInfo> Items, int TotalCount) ListSubmissions(
            int formId, string status = null, string search = null,
            DateTime? dateFrom = null, DateTime? dateTo = null,
            int pageIndex = 0, int pageSize = 50)
        {
            var list = new List<SubmissionInfo>();
            int total = 0;
            pageIndex = Math.Max(0, pageIndex);
            pageSize = pageSize > 0 ? pageSize : 50;

            if (formId > 0)
            {
                using (var conn = new SqlConnection(ConnectionString))
                using (var cmd = new SqlCommand("dbo.usp_MF_Submission_List", conn))
                {
                    cmd.CommandType = CommandType.StoredProcedure;
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@Status", (object)status ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Search", (object)search ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@DateFrom", (object)dateFrom ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@DateTo", (object)dateTo ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@PageIndex", pageIndex);
                    cmd.Parameters.AddWithValue("@PageSize", pageSize);
                    conn.Open();
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read()) list.Add(MapSubmission(reader));
                        if (reader.NextResult() && reader.Read())
                            total = reader.GetInt32(0);
                    }
                }
                return (list, total);
            }

            var where = new List<string> { "1 = 1" };
            var searchTerm = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
            var searchLike = searchTerm != null ? "%" + searchTerm + "%" : null;
            int exactSubmissionId = 0;
            var hasExactSubmissionId = !string.IsNullOrWhiteSpace(searchTerm) && int.TryParse(searchTerm, out exactSubmissionId) && exactSubmissionId > 0;
            var effectiveDateTo = dateTo.HasValue ? dateTo.Value.Date.AddDays(1) : (DateTime?)null;

            if (!string.IsNullOrWhiteSpace(status)) where.Add("s.[Status] = @Status");
            if (dateFrom.HasValue) where.Add("s.SubmittedOnUtc >= @DateFrom");
            if (effectiveDateTo.HasValue) where.Add("s.SubmittedOnUtc < @DateTo");
            if (!string.IsNullOrWhiteSpace(searchTerm))
            {
                where.Add(hasExactSubmissionId
                    ? "(s.SubmissionId = @ExactSubmissionId OR ISNULL(s.IpAddress, '') LIKE @SearchLike OR ISNULL(s.[Status], '') LIKE @SearchLike OR EXISTS (SELECT 1 FROM dbo.MF_SubmissionValues v WHERE v.SubmissionId = s.SubmissionId AND (ISNULL(v.FieldKey, '') LIKE @SearchLike OR ISNULL(v.FieldValue, '') LIKE @SearchLike)))"
                    : "(ISNULL(s.IpAddress, '') LIKE @SearchLike OR ISNULL(s.[Status], '') LIKE @SearchLike OR EXISTS (SELECT 1 FROM dbo.MF_SubmissionValues v WHERE v.SubmissionId = s.SubmissionId AND (ISNULL(v.FieldKey, '') LIKE @SearchLike OR ISNULL(v.FieldValue, '') LIKE @SearchLike)))");
            }

            var whereSql = string.Join(" AND ", where);
            var listSql = @"
SELECT s.*
FROM dbo.MF_Submissions s
WHERE " + whereSql + @"
ORDER BY s.SubmittedOnUtc DESC
OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;";

            var countSql = @"
SELECT COUNT(*)
FROM dbo.MF_Submissions s
WHERE " + whereSql + ";";

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var listCmd = new SqlCommand(listSql, conn))
                {
                    listCmd.CommandType = CommandType.Text;
                    listCmd.Parameters.AddWithValue("@Offset", pageIndex * pageSize);
                    listCmd.Parameters.AddWithValue("@PageSize", pageSize);
                    if (!string.IsNullOrWhiteSpace(status)) listCmd.Parameters.AddWithValue("@Status", status);
                    if (dateFrom.HasValue) listCmd.Parameters.AddWithValue("@DateFrom", dateFrom.Value);
                    if (effectiveDateTo.HasValue) listCmd.Parameters.AddWithValue("@DateTo", effectiveDateTo.Value);
                    if (!string.IsNullOrWhiteSpace(searchTerm))
                    {
                        listCmd.Parameters.AddWithValue("@SearchLike", searchLike);
                        if (hasExactSubmissionId) listCmd.Parameters.AddWithValue("@ExactSubmissionId", exactSubmissionId);
                    }
                    using (var reader = listCmd.ExecuteReader())
                    {
                        while (reader.Read()) list.Add(MapSubmission(reader));
                    }
                }

                using (var countCmd = new SqlCommand(countSql, conn))
                {
                    countCmd.CommandType = CommandType.Text;
                    if (!string.IsNullOrWhiteSpace(status)) countCmd.Parameters.AddWithValue("@Status", status);
                    if (dateFrom.HasValue) countCmd.Parameters.AddWithValue("@DateFrom", dateFrom.Value);
                    if (effectiveDateTo.HasValue) countCmd.Parameters.AddWithValue("@DateTo", effectiveDateTo.Value);
                    if (!string.IsNullOrWhiteSpace(searchTerm))
                    {
                        countCmd.Parameters.AddWithValue("@SearchLike", searchLike);
                        if (hasExactSubmissionId) countCmd.Parameters.AddWithValue("@ExactSubmissionId", exactSubmissionId);
                    }
                    total = Convert.ToInt32(countCmd.ExecuteScalar() ?? 0);
                }
            }
            return (list, total);
        }

        public static int CountSubmissions(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand(
                "SELECT COUNT(*) FROM dbo.MF_Submissions WHERE FormId = @FormId", conn))
            {
                cmd.Parameters.AddWithValue("@FormId", formId);
                conn.Open();
                return (int)cmd.ExecuteScalar();
            }
        }

        public static void UpdateSubmissionStatus(int submissionId, string status)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Submission_UpdateStatus", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@SubmissionId", submissionId);
                cmd.Parameters.AddWithValue("@Status", status);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        public static void UpdateSubmissionData(int submissionId, string dataJson)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("UPDATE dbo.MF_Submissions SET DataJson = @DataJson WHERE SubmissionId = @SubmissionId", conn))
            {
                cmd.CommandType = CommandType.Text;
                cmd.Parameters.AddWithValue("@SubmissionId", submissionId);
                cmd.Parameters.AddWithValue("@DataJson", dataJson ?? "{}");
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        public static List<FormInfo> GetFormsByPortal(int portalId)
        {
            var list = new List<FormInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("SELECT * FROM dbo.MF_Forms WHERE PortalId = @PortalId ORDER BY CreatedOnUtc DESC", conn))
            {
                cmd.CommandType = CommandType.Text;
                cmd.Parameters.AddWithValue("@PortalId", portalId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) list.Add(MapForm(reader));
                }
            }
            return list;
        }

        public static void DeleteSubmission(int submissionId)
        {
            DeleteSubmissionWithCount(submissionId);
        }

        // [B33] Return rows affected so BulkDelete can distinguish "actually deleted"
        // (rows > 0) from "ID didn't exist" (rows == 0). The stored proc DELETE is
        // idempotent — without this distinction the bulk endpoint over-reports.
        public static int DeleteSubmissionWithCount(int submissionId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Submission_Delete", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@SubmissionId", submissionId);
                conn.Open();
                return cmd.ExecuteNonQuery();
            }
        }

        public static List<SubmissionInfo> ExportSubmissions(int formId, DateTime? dateFrom = null, DateTime? dateTo = null)
        {
            var list = new List<SubmissionInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Submission_Export", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", formId);
                cmd.Parameters.AddWithValue("@DateFrom", (object)dateFrom ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@DateTo", (object)dateTo ?? DBNull.Value);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read()) list.Add(MapSubmission(reader));
                }
            }
            return list;
        }

        public static FormStatsInfo GetFormStats(int formId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Form_Stats", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", formId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return new FormStatsInfo
                        {
                            TotalSubmissions = reader.IsDBNull(reader.GetOrdinal("TotalSubmissions")) ? 0 : reader.GetInt32(reader.GetOrdinal("TotalSubmissions")),
                            ValidSubmissions = reader.IsDBNull(reader.GetOrdinal("ValidSubmissions")) ? 0 : reader.GetInt32(reader.GetOrdinal("ValidSubmissions")),
                            SpamSubmissions = reader.IsDBNull(reader.GetOrdinal("SpamSubmissions")) ? 0 : reader.GetInt32(reader.GetOrdinal("SpamSubmissions")),
                            ReadSubmissions = reader.IsDBNull(reader.GetOrdinal("ReadSubmissions")) ? 0 : reader.GetInt32(reader.GetOrdinal("ReadSubmissions")),
                            FirstSubmission = reader.IsDBNull(reader.GetOrdinal("FirstSubmission")) ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("FirstSubmission")),
                            LastSubmission = reader.IsDBNull(reader.GetOrdinal("LastSubmission")) ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("LastSubmission")),
                        };
                    }
                }
            }
            return new FormStatsInfo();
        }

        #endregion

        #region Rate Limiting

        public static bool CheckRateLimit(int formId, string ipAddress, int windowMinutes = 5, int maxPerWindow = 3)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_RateLimit_Check", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", formId);
                cmd.Parameters.AddWithValue("@IpAddress", ipAddress);
                cmd.Parameters.AddWithValue("@WindowMinutes", windowMinutes);
                cmd.Parameters.AddWithValue("@MaxPerWindow", maxPerWindow);

                var pOut = cmd.Parameters.Add("@IsAllowed", SqlDbType.Bit);
                pOut.Direction = ParameterDirection.Output;

                conn.Open();
                cmd.ExecuteNonQuery();
                return (bool)pOut.Value;
            }
        }

        #endregion

        #region Webhook Log

        public static void InsertWebhookLog(WebhookLogInfo log)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_WebhookLog_Insert", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@FormId", log.FormId);
                cmd.Parameters.AddWithValue("@SubmissionId", log.SubmissionId);
                cmd.Parameters.AddWithValue("@WebhookUrl", log.WebhookUrl);
                cmd.Parameters.AddWithValue("@RequestBody", (object)log.RequestBody ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ResponseCode", (object)log.ResponseCode ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ResponseBody", (object)log.ResponseBody ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Success", log.Success);
                cmd.Parameters.AddWithValue("@RetryCount", log.RetryCount);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        #endregion

        #region Files

        public static int InsertFile(MfFileInfo file)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_File_Insert", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;

                var pOut = cmd.Parameters.Add("@FileId", SqlDbType.Int);
                pOut.Direction = ParameterDirection.Output;

                cmd.Parameters.AddWithValue("@SubmissionId", file.SubmissionId);
                cmd.Parameters.AddWithValue("@FieldKey", file.FieldKey);
                cmd.Parameters.AddWithValue("@OriginalName", file.OriginalName);
                cmd.Parameters.AddWithValue("@StoredPath", file.StoredPath);
                cmd.Parameters.AddWithValue("@ContentType", (object)file.ContentType ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@FileSizeBytes", file.FileSizeBytes);
                conn.Open();
                cmd.ExecuteNonQuery();
                return (int)pOut.Value;
            }
        }

        public static List<MfFileInfo> GetFilesBySubmission(int submissionId)
        {
            var list = new List<MfFileInfo>();
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_File_GetBySubmission", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@SubmissionId", submissionId);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        list.Add(new MfFileInfo
                        {
                            FileId = reader.GetInt32(reader.GetOrdinal("FileId")),
                            SubmissionId = reader.GetInt32(reader.GetOrdinal("SubmissionId")),
                            FieldKey = reader.GetString(reader.GetOrdinal("FieldKey")),
                            OriginalName = reader.GetString(reader.GetOrdinal("OriginalName")),
                            StoredPath = reader.GetString(reader.GetOrdinal("StoredPath")),
                            ContentType = reader.IsDBNull(reader.GetOrdinal("ContentType")) ? null : reader.GetString(reader.GetOrdinal("ContentType")),
                            FileSizeBytes = reader.GetInt64(reader.GetOrdinal("FileSizeBytes")),
                            UploadedOnUtc = reader.GetDateTime(reader.GetOrdinal("UploadedOnUtc"))
                        });
                    }
                }
            }
            return list;
        }

        #endregion

        #region Save & Continue (Drafts)

        public static int SaveDraft(SavedDraftInfo draft)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Draft_Upsert", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;

                var pOut = cmd.Parameters.Add("@DraftId", SqlDbType.Int);
                pOut.Direction = ParameterDirection.InputOutput;
                pOut.Value = draft.DraftId;

                cmd.Parameters.AddWithValue("@FormId", draft.FormId);
                cmd.Parameters.AddWithValue("@ResumeToken", draft.ResumeToken);
                cmd.Parameters.AddWithValue("@DataJson", draft.DataJson);
                cmd.Parameters.AddWithValue("@Email", (object)draft.Email ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@IpAddress", (object)draft.IpAddress ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@ExpiresOnUtc", draft.ExpiresOnUtc);
                conn.Open();
                cmd.ExecuteNonQuery();
                return (int)pOut.Value;
            }
        }

        public static SavedDraftInfo GetDraft(string resumeToken)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Draft_GetByToken", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@ResumeToken", resumeToken);
                conn.Open();
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        return new SavedDraftInfo
                        {
                            DraftId = reader.GetInt32(reader.GetOrdinal("DraftId")),
                            FormId = reader.GetInt32(reader.GetOrdinal("FormId")),
                            ResumeToken = reader.GetString(reader.GetOrdinal("ResumeToken")),
                            DataJson = reader.GetString(reader.GetOrdinal("DataJson")),
                            Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
                            IpAddress = reader.IsDBNull(reader.GetOrdinal("IpAddress")) ? null : reader.GetString(reader.GetOrdinal("IpAddress")),
                            CreatedOnUtc = reader.GetDateTime(reader.GetOrdinal("CreatedOnUtc")),
                            ExpiresOnUtc = reader.GetDateTime(reader.GetOrdinal("ExpiresOnUtc"))
                        };
                    }
                }
            }
            return null;
        }

        public static void DeleteDraft(string resumeToken)
        {
            using (var conn = new SqlConnection(ConnectionString))
            using (var cmd = new SqlCommand("dbo.usp_MF_Draft_Delete", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                cmd.Parameters.AddWithValue("@ResumeToken", resumeToken);
                conn.Open();
                cmd.ExecuteNonQuery();
            }
        }

        #endregion

        #region Mappers

        private static FormInfo MapForm(SqlDataReader r)
        {
            return new FormInfo
            {
                FormId = r.GetInt32(r.GetOrdinal("FormId")),
                ModuleId = r.GetInt32(r.GetOrdinal("ModuleId")),
                PortalId = r.GetInt32(r.GetOrdinal("PortalId")),
                Title = r.GetString(r.GetOrdinal("Title")),
                Description = r.IsDBNull(r.GetOrdinal("Description")) ? null : r.GetString(r.GetOrdinal("Description")),
                SchemaJson = r.GetString(r.GetOrdinal("SchemaJson")),
                SettingsJson = r.IsDBNull(r.GetOrdinal("SettingsJson")) ? null : r.GetString(r.GetOrdinal("SettingsJson")),
                ThemeJson = r.IsDBNull(r.GetOrdinal("ThemeJson")) ? null : r.GetString(r.GetOrdinal("ThemeJson")),
                Status = r.GetString(r.GetOrdinal("Status")),
                SubmitButtonText = r.IsDBNull(r.GetOrdinal("SubmitButtonText")) ? null : r.GetString(r.GetOrdinal("SubmitButtonText")),
                SuccessMessage = r.IsDBNull(r.GetOrdinal("SuccessMessage")) ? null : r.GetString(r.GetOrdinal("SuccessMessage")),
                RedirectUrl = r.IsDBNull(r.GetOrdinal("RedirectUrl")) ? null : r.GetString(r.GetOrdinal("RedirectUrl")),
                MaxSubmissions = r.IsDBNull(r.GetOrdinal("MaxSubmissions")) ? (int?)null : r.GetInt32(r.GetOrdinal("MaxSubmissions")),
                ExpiresOnUtc = r.IsDBNull(r.GetOrdinal("ExpiresOnUtc")) ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("ExpiresOnUtc")),
                RequireAuth = r.GetBoolean(r.GetOrdinal("RequireAuth")),
                EnableCaptcha = r.GetBoolean(r.GetOrdinal("EnableCaptcha")),
                EnableSaveResume = r.GetBoolean(r.GetOrdinal("EnableSaveResume")),
                WebhookUrl = r.IsDBNull(r.GetOrdinal("WebhookUrl")) ? null : r.GetString(r.GetOrdinal("WebhookUrl")),
                WebhookSecret = r.IsDBNull(r.GetOrdinal("WebhookSecret")) ? null : r.GetString(r.GetOrdinal("WebhookSecret")),
                WebhookHeaders = r.IsDBNull(r.GetOrdinal("WebhookHeaders")) ? null : r.GetString(r.GetOrdinal("WebhookHeaders")),
                NotifyEmails = r.IsDBNull(r.GetOrdinal("NotifyEmails")) ? null : r.GetString(r.GetOrdinal("NotifyEmails")),
                NotifyTemplate = r.IsDBNull(r.GetOrdinal("NotifyTemplate")) ? null : r.GetString(r.GetOrdinal("NotifyTemplate")),
                AutoresponderEnabled = r.GetBoolean(r.GetOrdinal("AutoresponderEnabled")),
                AutoresponderEmailField = r.IsDBNull(r.GetOrdinal("AutoresponderEmailField")) ? null : r.GetString(r.GetOrdinal("AutoresponderEmailField")),
                AutoresponderSubject = r.IsDBNull(r.GetOrdinal("AutoresponderSubject")) ? null : r.GetString(r.GetOrdinal("AutoresponderSubject")),
                AutoresponderBody = r.IsDBNull(r.GetOrdinal("AutoresponderBody")) ? null : r.GetString(r.GetOrdinal("AutoresponderBody")),
                CreatedByUserId = r.GetInt32(r.GetOrdinal("CreatedByUserId")),
                CreatedOnUtc = r.GetDateTime(r.GetOrdinal("CreatedOnUtc")),
                UpdatedByUserId = r.IsDBNull(r.GetOrdinal("UpdatedByUserId")) ? (int?)null : r.GetInt32(r.GetOrdinal("UpdatedByUserId")),
                UpdatedOnUtc = r.IsDBNull(r.GetOrdinal("UpdatedOnUtc")) ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("UpdatedOnUtc")),
                RulesJson = HasColumn(r, "RulesJson") && !r.IsDBNull(r.GetOrdinal("RulesJson")) ? r.GetString(r.GetOrdinal("RulesJson")) : null,
                WorkflowJson = HasColumn(r, "WorkflowJson") && !r.IsDBNull(r.GetOrdinal("WorkflowJson")) ? r.GetString(r.GetOrdinal("WorkflowJson")) : null,
                // SubmissionCount may not always be present
                SubmissionCount = HasColumn(r, "SubmissionCount") ? (r.IsDBNull(r.GetOrdinal("SubmissionCount")) ? 0 : r.GetInt32(r.GetOrdinal("SubmissionCount"))) : 0,
                AppScope = HasColumn(r, "AppScope") && !r.IsDBNull(r.GetOrdinal("AppScope")) ? r.GetString(r.GetOrdinal("AppScope")) : null
            };
        }

        private static SubmissionInfo MapSubmission(SqlDataReader r)
        {
            return new SubmissionInfo
            {
                SubmissionId = r.GetInt32(r.GetOrdinal("SubmissionId")),
                FormId = r.GetInt32(r.GetOrdinal("FormId")),
                DataJson = r.GetString(r.GetOrdinal("DataJson")),
                IpAddress = r.IsDBNull(r.GetOrdinal("IpAddress")) ? null : r.GetString(r.GetOrdinal("IpAddress")),
                UserAgent = r.IsDBNull(r.GetOrdinal("UserAgent")) ? null : r.GetString(r.GetOrdinal("UserAgent")),
                UserId = r.IsDBNull(r.GetOrdinal("UserId")) ? (int?)null : r.GetInt32(r.GetOrdinal("UserId")),
                Status = r.GetString(r.GetOrdinal("Status")),
                IsSpam = r.GetBoolean(r.GetOrdinal("IsSpam")),
                SpamScore = r.IsDBNull(r.GetOrdinal("SpamScore")) ? (decimal?)null : r.GetDecimal(r.GetOrdinal("SpamScore")),
                SubmittedOnUtc = r.GetDateTime(r.GetOrdinal("SubmittedOnUtc")),
                ReadOnUtc = r.IsDBNull(r.GetOrdinal("ReadOnUtc")) ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("ReadOnUtc"))
            };
        }

        private static bool HasColumn(SqlDataReader reader, string columnName)
        {
            for (int i = 0; i < reader.FieldCount; i++)
            {
                if (reader.GetName(i).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
            return false;
        }

        #endregion

        #region UniqueID Counters

        /// <summary>
        /// Atomically increment counter and return new value.
        /// Thread-safe via SQL stored procedure.
        /// </summary>
        public static long IncrementUniqueId(int formId, string fieldKey, long startValue = 1)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "MF_IncrementUniqueId";
                    cmd.CommandType = CommandType.StoredProcedure;
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@FieldKey", fieldKey);
                    cmd.Parameters.AddWithValue("@StartValue", startValue);

                    var result = cmd.ExecuteScalar();
                    return result != null ? Convert.ToInt64(result) : startValue;
                }
            }
        }

        /// <summary>
        /// Get current counter value without incrementing.
        /// </summary>
        public static long GetUniqueIdCounter(int formId, string fieldKey)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT CurrentValue FROM MF_UniqueIdCounters WHERE FormId=@FormId AND FieldKey=@FieldKey";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@FieldKey", fieldKey);
                    var result = cmd.ExecuteScalar();
                    return result != null ? Convert.ToInt64(result) : 0;
                }
            }
        }

        /// <summary>
        /// Reset or set counter to specific value.
        /// </summary>
        public static void SetUniqueIdCounter(int formId, string fieldKey, long value)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        IF EXISTS (SELECT 1 FROM MF_UniqueIdCounters WHERE FormId=@FormId AND FieldKey=@FieldKey)
                            UPDATE MF_UniqueIdCounters SET CurrentValue=@Value WHERE FormId=@FormId AND FieldKey=@FieldKey
                        ELSE
                            INSERT INTO MF_UniqueIdCounters (FormId,FieldKey,CurrentValue) VALUES (@FormId,@FieldKey,@Value)";
                    cmd.Parameters.AddWithValue("@FormId", formId);
                    cmd.Parameters.AddWithValue("@FieldKey", fieldKey);
                    cmd.Parameters.AddWithValue("@Value", value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        #endregion

        // ============================================================
        // MODULE VIEW CONFIGURATION
        // ============================================================
        #region ModuleViewConfig

        private static bool ModuleViewConfigTableExists(SqlConnection conn)
        {
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = "SELECT CASE WHEN OBJECT_ID(N'dbo.MF_ModuleViewConfig', N'U') IS NULL THEN 0 ELSE 1 END";
                var value = cmd.ExecuteScalar();
                return Convert.ToInt32(value ?? 0) == 1;
            }
        }

        public static ModuleViewConfigInfo GetModuleViewConfig(int moduleId)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                if (!ModuleViewConfigTableExists(conn)) return null;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT * FROM [dbo].[MF_ModuleViewConfig] WHERE ModuleId=@ModuleId";
                    cmd.Parameters.AddWithValue("@ModuleId", moduleId);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (!r.Read()) return null;
                        return new ModuleViewConfigInfo
                        {
                            ConfigId = (int)r["ConfigId"],
                            ModuleId = (int)r["ModuleId"],
                            FormId = (int)r["FormId"],
                            ViewType = r["ViewType"]?.ToString() ?? "submit",
                            ViewConfigJson = r["ViewConfigJson"]?.ToString(),
                            CssClass = r["CssClass"]?.ToString(),
                            CacheMinutes = r["CacheMinutes"] != DBNull.Value ? (int)r["CacheMinutes"] : 0,
                            PermissionsJson = r["PermissionsJson"]?.ToString(),
                            CreatedOnUtc = (DateTime)r["CreatedOnUtc"],
                            ModifiedOnUtc = r["ModifiedOnUtc"] != DBNull.Value ? (DateTime?)r["ModifiedOnUtc"] : null
                        };
                    }
                }
            }
        }

        public static void SaveModuleViewConfig(ModuleViewConfigInfo cfg)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                if (!ModuleViewConfigTableExists(conn)) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
                        IF EXISTS (SELECT 1 FROM [dbo].[MF_ModuleViewConfig] WHERE ModuleId=@ModuleId)
                            UPDATE [dbo].[MF_ModuleViewConfig] SET 
                                FormId=@FormId, ViewType=@ViewType, ViewConfigJson=@ViewConfigJson,
                                CssClass=@CssClass, CacheMinutes=@CacheMinutes, PermissionsJson=@PermissionsJson,
                                ModifiedOnUtc=SYSUTCDATETIME()
                            WHERE ModuleId=@ModuleId
                        ELSE
                            INSERT INTO [dbo].[MF_ModuleViewConfig] (ModuleId,FormId,ViewType,ViewConfigJson,CssClass,CacheMinutes,PermissionsJson)
                            VALUES (@ModuleId,@FormId,@ViewType,@ViewConfigJson,@CssClass,@CacheMinutes,@PermissionsJson)";
                    cmd.Parameters.AddWithValue("@ModuleId", cfg.ModuleId);
                    cmd.Parameters.AddWithValue("@FormId", cfg.FormId);
                    cmd.Parameters.AddWithValue("@ViewType", cfg.ViewType ?? "submit");
                    cmd.Parameters.AddWithValue("@ViewConfigJson", (object)cfg.ViewConfigJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@CssClass", (object)cfg.CssClass ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@CacheMinutes", cfg.CacheMinutes);
                    cmd.Parameters.AddWithValue("@PermissionsJson", (object)cfg.PermissionsJson ?? DBNull.Value);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static void DeleteModuleViewConfig(int moduleId)
        {
            using (var conn = GetConnection())
            {
                conn.Open();
                if (!ModuleViewConfigTableExists(conn)) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "DELETE FROM [dbo].[MF_ModuleViewConfig] WHERE ModuleId=@ModuleId";
                    cmd.Parameters.AddWithValue("@ModuleId", moduleId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        #endregion
    }
}
