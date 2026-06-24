using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Data;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// MF_AI_KB_Rules DAO — dispatcher rules indexed by stable RuleId
    /// ('DL-001', 'DG-002'…). ops.ts looks rules up by id before rejecting
    /// so the rejection text is one canonical string.
    /// </summary>
    public static class AiKbRulesRepository
    {
        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        public static List<KbRule> List(string widgetType, int? knowledgeId, bool? enabled)
        {
            var list = new List<KbRule>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"
                    SELECT RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern,
                           RejectionMessage, FixHint, Source, Version, Enabled, PortalId,
                           CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_KB_Rules
                    WHERE (@Widget IS NULL OR @Widget = '' OR WidgetType = @Widget)
                      AND (@KId IS NULL OR KnowledgeId = @KId)
                      AND (@Enabled IS NULL OR Enabled = @Enabled)
                    ORDER BY WidgetType, RuleId";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Widget", (object)widgetType ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@KId", knowledgeId.HasValue ? (object)knowledgeId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@Enabled", enabled.HasValue ? (object)enabled.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) list.Add(Map(r));
                    }
                }
            }
            return list;
        }

        public static KbRule Get(string ruleId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    SELECT RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern,
                           RejectionMessage, FixHint, Source, Version, Enabled, PortalId,
                           CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_KB_Rules WHERE RuleId = @RuleId", conn))
                {
                    cmd.Parameters.AddWithValue("@RuleId", ruleId ?? string.Empty);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read()) return Map(r);
                    }
                }
            }
            return null;
        }

        public static void Upsert(KbRule rule, int userId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    MERGE MF_AI_KB_Rules AS target
                    USING (SELECT @RuleId AS RuleId) AS source ON (target.RuleId = source.RuleId)
                    WHEN MATCHED THEN UPDATE SET
                        KnowledgeId = @KId, WidgetType = @Widget, Title = @Title, Severity = @Sev,
                        Condition = @Cond, RegexPattern = @Rx, RejectionMessage = @Rej, FixHint = @Fix,
                        Source = @Source, Version = Version + 1, Enabled = @Enabled,
                        PortalId = @PortalId, UpdatedByUserId = @UserId, UpdatedOnDate = SYSUTCDATETIME()
                    WHEN NOT MATCHED THEN INSERT
                        (RuleId, KnowledgeId, WidgetType, Title, Severity, Condition, RegexPattern,
                         RejectionMessage, FixHint, Source, Version, Enabled, PortalId, CreatedByUserId)
                        VALUES (@RuleId, @KId, @Widget, @Title, @Sev, @Cond, @Rx, @Rej, @Fix, @Source, 1, @Enabled, @PortalId, @UserId);", conn))
                {
                    cmd.Parameters.AddWithValue("@RuleId", (object)rule.RuleId ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@KId", rule.KnowledgeId.HasValue ? (object)rule.KnowledgeId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@Widget", (object)rule.WidgetType ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Title", (object)rule.Title ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Sev", (object)(rule.Severity ?? "hard_reject"));
                    cmd.Parameters.AddWithValue("@Cond", (object)rule.Condition ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Rx", (object)rule.RegexPattern ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Rej", (object)rule.RejectionMessage ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Fix", (object)rule.FixHint ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Source", (object)(rule.Source ?? "customer"));
                    cmd.Parameters.AddWithValue("@Enabled", rule.Enabled);
                    cmd.Parameters.AddWithValue("@PortalId", rule.PortalId.HasValue ? (object)rule.PortalId.Value : DBNull.Value);
                    cmd.Parameters.AddWithValue("@UserId", userId);
                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static bool Delete(string ruleId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand("DELETE FROM MF_AI_KB_Rules WHERE RuleId = @RuleId", conn))
                {
                    cmd.Parameters.AddWithValue("@RuleId", ruleId ?? string.Empty);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        private static KbRule Map(IDataReader r)
        {
            return new KbRule
            {
                RuleId = r["RuleId"] as string,
                KnowledgeId = r["KnowledgeId"] is DBNull ? (int?)null : (int)r["KnowledgeId"],
                WidgetType = r["WidgetType"] as string,
                Title = r["Title"] as string,
                Severity = r["Severity"] as string,
                Condition = r["Condition"] as string,
                RegexPattern = r["RegexPattern"] as string,
                RejectionMessage = r["RejectionMessage"] as string,
                FixHint = r["FixHint"] as string,
                Source = r["Source"] as string,
                Version = (int)r["Version"],
                Enabled = (bool)r["Enabled"],
                PortalId = r["PortalId"] is DBNull ? (int?)null : (int)r["PortalId"],
                CreatedByUserId = r["CreatedByUserId"] is DBNull ? (int?)null : (int)r["CreatedByUserId"],
                CreatedOnDate = (DateTime)r["CreatedOnDate"],
                UpdatedByUserId = r["UpdatedByUserId"] is DBNull ? (int?)null : (int)r["UpdatedByUserId"],
                UpdatedOnDate = r["UpdatedOnDate"] is DBNull ? (DateTime?)null : (DateTime)r["UpdatedOnDate"],
            };
        }
    }
}
