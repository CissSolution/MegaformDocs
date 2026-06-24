using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Data;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// MF_AI_KB_Templates DAO — many concrete presets/patterns per Knowledge
    /// entry. Same plain-ADO.NET pattern as <see cref="AiKnowledgeRepository"/>.
    /// </summary>
    public static class AiKbTemplatesRepository
    {
        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        public static List<KbTemplate> List(int knowledgeId, string kind, int? portalId)
        {
            var list = new List<KbTemplate>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"
                    SELECT Id, KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags,
                           Score, SortOrder, PortalId, Source, Version,
                           CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_KB_Templates
                    WHERE KnowledgeId = @KId
                      AND (@Kind IS NULL OR Kind = @Kind)
                      AND (@PortalId IS NULL OR PortalId IS NULL OR PortalId = @PortalId)
                    ORDER BY
                      CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END,
                      SortOrder, Score DESC, TemplateKey";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@KId", knowledgeId);
                    cmd.Parameters.AddWithValue("@Kind", (object)kind ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@PortalId", portalId.HasValue ? (object)portalId.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) list.Add(Map(r));
                    }
                }
            }
            return list;
        }

        public static KbTemplate GetById(int id)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    SELECT Id, KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags,
                           Score, SortOrder, PortalId, Source, Version,
                           CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_KB_Templates WHERE Id = @Id", conn))
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

        public static KbTemplate GetByKey(int knowledgeId, string templateKey, int? portalId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand(@"
                    SELECT TOP 1 Id, KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags,
                           Score, SortOrder, PortalId, Source, Version,
                           CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_KB_Templates
                    WHERE KnowledgeId = @KId AND TemplateKey = @TKey
                      AND (PortalId IS NULL OR PortalId = @PortalId)
                    ORDER BY CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END", conn))
                {
                    cmd.Parameters.AddWithValue("@KId", knowledgeId);
                    cmd.Parameters.AddWithValue("@TKey", templateKey ?? string.Empty);
                    cmd.Parameters.AddWithValue("@PortalId", portalId.HasValue ? (object)portalId.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read()) return Map(r);
                    }
                }
            }
            return null;
        }

        public static int Upsert(KbTemplate t, int userId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                if (t.Id == 0)
                {
                    using (var cmd = new SqlCommand(@"
                        INSERT INTO MF_AI_KB_Templates
                          (KnowledgeId, TemplateKey, Kind, Title, Summary, Body, Tags, Score, SortOrder, PortalId, Source, Version, CreatedByUserId, CreatedOnDate)
                        OUTPUT INSERTED.Id
                        VALUES (@KId, @TKey, @Kind, @Title, @Summary, @Body, @Tags, @Score, @Sort, @PortalId, @Source, 1, @UserId, SYSUTCDATETIME())", conn))
                    {
                        Bind(cmd, t, userId);
                        return (int)cmd.ExecuteScalar();
                    }
                }
                using (var upd = new SqlCommand(@"
                    UPDATE MF_AI_KB_Templates SET
                      KnowledgeId = @KId, TemplateKey = @TKey, Kind = @Kind, Title = @Title,
                      Summary = @Summary, Body = @Body, Tags = @Tags, Score = @Score,
                      SortOrder = @Sort, PortalId = @PortalId, Source = @Source,
                      Version = Version + 1, UpdatedByUserId = @UserId, UpdatedOnDate = SYSUTCDATETIME()
                    WHERE Id = @Id", conn))
                {
                    Bind(upd, t, userId);
                    upd.Parameters.AddWithValue("@Id", t.Id);
                    upd.ExecuteNonQuery();
                    return t.Id;
                }
            }
        }

        public static bool Delete(int id)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand("DELETE FROM MF_AI_KB_Templates WHERE Id = @Id", conn))
                {
                    cmd.Parameters.AddWithValue("@Id", id);
                    return cmd.ExecuteNonQuery() > 0;
                }
            }
        }

        private static void Bind(SqlCommand cmd, KbTemplate t, int userId)
        {
            cmd.Parameters.AddWithValue("@KId", t.KnowledgeId);
            cmd.Parameters.AddWithValue("@TKey", (object)t.TemplateKey ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Kind", (object)t.Kind ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Title", (object)t.Title ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Summary", (object)t.Summary ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Body", (object)t.Body ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Tags", (object)t.Tags ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Score", t.Score);
            cmd.Parameters.AddWithValue("@Sort", t.SortOrder == 0 ? 100 : t.SortOrder);
            cmd.Parameters.AddWithValue("@PortalId", t.PortalId.HasValue ? (object)t.PortalId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@Source", (object)(t.Source ?? "customer"));
            cmd.Parameters.AddWithValue("@UserId", userId);
        }

        private static KbTemplate Map(IDataReader r)
        {
            return new KbTemplate
            {
                Id = (int)r["Id"],
                KnowledgeId = (int)r["KnowledgeId"],
                TemplateKey = r["TemplateKey"] as string,
                Kind = r["Kind"] as string,
                Title = r["Title"] as string,
                Summary = r["Summary"] as string,
                Body = r["Body"] as string,
                Tags = r["Tags"] as string,
                Score = (int)r["Score"],
                SortOrder = (int)r["SortOrder"],
                PortalId = r["PortalId"] is DBNull ? (int?)null : (int)r["PortalId"],
                Source = r["Source"] as string,
                Version = (int)r["Version"],
                CreatedByUserId = r["CreatedByUserId"] is DBNull ? (int?)null : (int)r["CreatedByUserId"],
                CreatedOnDate = (DateTime)r["CreatedOnDate"],
                UpdatedByUserId = r["UpdatedByUserId"] is DBNull ? (int?)null : (int)r["UpdatedByUserId"],
                UpdatedOnDate = r["UpdatedOnDate"] is DBNull ? (DateTime?)null : (DateTime)r["UpdatedOnDate"],
            };
        }
    }
}
