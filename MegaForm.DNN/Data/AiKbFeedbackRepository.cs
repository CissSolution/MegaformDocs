using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Data;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// MF_AI_KB_Feedback DAO — one row per dispatcher rejection (or AI-self-
    /// reported failure). Admin reviews + promotes good rows into Templates.
    /// </summary>
    public static class AiKbFeedbackRepository
    {
        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        public static long Log(KbFeedback f)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    INSERT INTO MF_AI_KB_Feedback
                      (SessionId, RuleId, KnowledgeId, WidgetType, Op, AttemptedJson,
                       RejectionMessage, FixedJson, Outcome, Promoted, PromotedTemplateId,
                       PortalId, FormId, UserId, CreatedOnDate)
                    OUTPUT INSERTED.Id
                    VALUES (@SessionId, @RuleId, @KId, @Widget, @Op, @Attempted,
                            @Reject, @Fixed, @Outcome, @Promoted, @PromotedTpl,
                            @PortalId, @FormId, @UserId, SYSUTCDATETIME())", conn))
                {
                    cmd.Parameters.AddWithValue("@SessionId", (object)f.SessionId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@RuleId", (object)f.RuleId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@KId", f.KnowledgeId.HasValue ? (object)f.KnowledgeId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@Widget", (object)f.WidgetType ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Op", (object)f.Op ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Attempted", (object)f.AttemptedJson ?? string.Empty);
                    cmd.Parameters.AddWithValue("@Reject", (object)f.RejectionMessage ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Fixed", (object)f.FixedJson ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Outcome", (object)(f.Outcome ?? "rejected"));
                    cmd.Parameters.AddWithValue("@Promoted", f.Promoted);
                    cmd.Parameters.AddWithValue("@PromotedTpl", f.PromotedTemplateId.HasValue ? (object)f.PromotedTemplateId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@PortalId", f.PortalId.HasValue ? (object)f.PortalId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@FormId", f.FormId.HasValue ? (object)f.FormId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@UserId", f.UserId.HasValue ? (object)f.UserId.Value : DBNull.Value);
                    return (long)cmd.ExecuteScalar();
                }
            }
        }

        public static List<KbFeedback> List(string widgetType, string outcome, bool? promoted, int top)
        {
            var list = new List<KbFeedback>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"
                    SELECT TOP (@Top) Id, SessionId, RuleId, KnowledgeId, WidgetType, Op,
                           AttemptedJson, RejectionMessage, FixedJson, Outcome,
                           Promoted, PromotedTemplateId, PortalId, FormId, UserId,
                           CreatedOnDate, ReviewedByUserId, ReviewedOnDate, ReviewNotes
                    FROM MF_AI_KB_Feedback
                    WHERE (@Widget IS NULL OR @Widget = '' OR WidgetType = @Widget)
                      AND (@Outcome IS NULL OR @Outcome = '' OR Outcome = @Outcome)
                      AND (@Promoted IS NULL OR Promoted = @Promoted)
                    ORDER BY CreatedOnDate DESC, Id DESC";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Top", top);
                    cmd.Parameters.AddWithValue("@Widget", (object)widgetType ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Outcome", (object)outcome ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Promoted", promoted.HasValue ? (object)promoted.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) list.Add(Map(r));
                    }
                }
            }
            return list;
        }

        public static KbFeedback GetById(long id)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    SELECT Id, SessionId, RuleId, KnowledgeId, WidgetType, Op,
                           AttemptedJson, RejectionMessage, FixedJson, Outcome,
                           Promoted, PromotedTemplateId, PortalId, FormId, UserId,
                           CreatedOnDate, ReviewedByUserId, ReviewedOnDate, ReviewNotes
                    FROM MF_AI_KB_Feedback WHERE Id = @Id", conn))
                {
                    cmd.Parameters.AddWithValue("@Id", id);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read()) return Map(r);
                    }
                }
            }
            return null;
        }

        public static void MarkPromoted(long feedbackId, int templateId, int reviewedByUserId, string notes)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    UPDATE MF_AI_KB_Feedback SET
                        Promoted = 1, PromotedTemplateId = @TplId,
                        ReviewedByUserId = @ByUser, ReviewedOnDate = SYSUTCDATETIME(),
                        ReviewNotes = @Notes
                    WHERE Id = @Id", conn))
                {
                    cmd.Parameters.AddWithValue("@TplId", templateId);
                    cmd.Parameters.AddWithValue("@ByUser", reviewedByUserId);
                    cmd.Parameters.AddWithValue("@Notes", (object)notes ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Id", feedbackId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static void MarkReviewed(long feedbackId, int reviewedByUserId, string notes)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    UPDATE MF_AI_KB_Feedback SET
                        ReviewedByUserId = @ByUser, ReviewedOnDate = SYSUTCDATETIME(),
                        ReviewNotes = @Notes
                    WHERE Id = @Id", conn))
                {
                    cmd.Parameters.AddWithValue("@ByUser", reviewedByUserId);
                    cmd.Parameters.AddWithValue("@Notes", (object)notes ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Id", feedbackId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        private static KbFeedback Map(IDataReader r)
        {
            return new KbFeedback
            {
                Id = (long)r["Id"],
                SessionId = r["SessionId"] as string,
                RuleId = r["RuleId"] as string,
                KnowledgeId = r["KnowledgeId"] is DBNull ? (int?)null : (int)r["KnowledgeId"],
                WidgetType = r["WidgetType"] as string,
                Op = r["Op"] as string,
                AttemptedJson = r["AttemptedJson"] as string,
                RejectionMessage = r["RejectionMessage"] as string,
                FixedJson = r["FixedJson"] as string,
                Outcome = r["Outcome"] as string,
                Promoted = (bool)r["Promoted"],
                PromotedTemplateId = r["PromotedTemplateId"] is DBNull ? (int?)null : (int)r["PromotedTemplateId"],
                PortalId = r["PortalId"] is DBNull ? (int?)null : (int)r["PortalId"],
                FormId = r["FormId"] is DBNull ? (int?)null : (int)r["FormId"],
                UserId = r["UserId"] is DBNull ? (int?)null : (int)r["UserId"],
                CreatedOnDate = (DateTime)r["CreatedOnDate"],
                ReviewedByUserId = r["ReviewedByUserId"] is DBNull ? (int?)null : (int)r["ReviewedByUserId"],
                ReviewedOnDate = r["ReviewedOnDate"] is DBNull ? (DateTime?)null : (DateTime)r["ReviewedOnDate"],
                ReviewNotes = r["ReviewNotes"] as string,
            };
        }
    }
}
