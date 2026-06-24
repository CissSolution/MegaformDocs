using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using DotNetNuke.Data;
using MegaForm.Core.Models;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// Data-access layer for MF_AI_Knowledge + MF_AI_Knowledge_History.
    /// Plain ADO.NET (no sprocs) — schema is fixed, queries are simple, and
    /// keeping it inline avoids a 6-sproc dependency that customers would have
    /// to migrate if they tweaked column shapes.
    /// </summary>
    public static class AiKnowledgeRepository
    {
        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        // ─────────────────────────────────────────────────────────────────
        //  Read
        // ─────────────────────────────────────────────────────────────────

        public static List<AiKnowledgeEntry> List(string kind, string search, int? portalId, int top)
        {
            var list = new List<AiKnowledgeEntry>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"
                    SELECT TOP (@Top) Id, Slug, Kind, Title, Summary, Tags, PortalId, Source, Version, CreatedOnDate, UpdatedOnDate
                    FROM MF_AI_Knowledge
                    WHERE (@Kind IS NULL OR Kind = @Kind)
                      AND (@PortalId IS NULL OR PortalId IS NULL OR PortalId = @PortalId)
                      AND (@Search IS NULL OR @Search = ''
                           OR Title LIKE '%' + @Search + '%'
                           OR Summary LIKE '%' + @Search + '%'
                           OR Tags LIKE '%' + @Search + '%'
                           OR Slug LIKE '%' + @Search + '%')
                    ORDER BY
                      CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END,  -- portal override first
                      Kind, Slug";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Top", top);
                    cmd.Parameters.AddWithValue("@Kind", (object)kind ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Search", (object)search ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@PortalId", portalId.HasValue ? (object)portalId.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            list.Add(MapSummary(r));
                        }
                    }
                }
            }
            return list;
        }

        public static AiKnowledgeEntry GetBySlug(string slug, int? portalId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                // Prefer portal-specific override when it exists.
                var sql = @"
                    SELECT TOP 1 Id, Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version,
                                 CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                    FROM MF_AI_Knowledge
                    WHERE Slug = @Slug
                      AND (PortalId IS NULL OR PortalId = @PortalId)
                    ORDER BY CASE WHEN PortalId = @PortalId THEN 0 ELSE 1 END";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Slug", slug ?? string.Empty);
                    cmd.Parameters.AddWithValue("@PortalId", portalId.HasValue ? (object)portalId.Value : DBNull.Value);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read()) return MapFull(r);
                    }
                }
            }
            return null;
        }

        public static AiKnowledgeEntry GetById(int id)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"SELECT Id, Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version,
                                   CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                            FROM MF_AI_Knowledge WHERE Id = @Id";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Id", id);
                    using (var r = cmd.ExecuteReader())
                    {
                        if (r.Read()) return MapFull(r);
                    }
                }
            }
            return null;
        }

        public static List<string> ListKinds()
        {
            var list = new List<string>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var cmd = new SqlCommand("SELECT DISTINCT Kind FROM MF_AI_Knowledge ORDER BY Kind", conn))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read()) list.Add(r["Kind"].ToString());
                }
            }
            return list;
        }

        // ─────────────────────────────────────────────────────────────────
        //  Write — with history
        // ─────────────────────────────────────────────────────────────────

        public static int Upsert(AiKnowledgeEntry e, int userId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    int id = e.Id;
                    string action;
                    if (id == 0)
                    {
                        action = "create";
                        using (var cmd = new SqlCommand(@"
                            INSERT INTO MF_AI_Knowledge
                              (Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version, CreatedByUserId, CreatedOnDate)
                            OUTPUT INSERTED.Id
                            VALUES (@Slug, @Kind, @Title, @Summary, @Body, @Tags, @Examples, @PortalId, @Source, 1, @UserId, SYSUTCDATETIME())", conn, tx))
                        {
                            BindFull(cmd, e, userId);
                            id = (int)cmd.ExecuteScalar();
                            e.Id = id;
                            e.Version = 1;
                        }
                    }
                    else
                    {
                        action = "update";
                        using (var cmd = new SqlCommand(@"
                            UPDATE MF_AI_Knowledge SET
                              Slug = @Slug, Kind = @Kind, Title = @Title, Summary = @Summary, Body = @Body,
                              Tags = @Tags, Examples = @Examples, PortalId = @PortalId, Source = @Source,
                              Version = Version + 1, UpdatedByUserId = @UserId, UpdatedOnDate = SYSUTCDATETIME()
                            OUTPUT INSERTED.Version
                            WHERE Id = @Id", conn, tx))
                        {
                            BindFull(cmd, e, userId);
                            cmd.Parameters.AddWithValue("@Id", id);
                            e.Version = (int)cmd.ExecuteScalar();
                        }
                    }
                    InsertHistory(conn, tx, id, e, userId, action);
                    tx.Commit();
                    return id;
                }
            }
        }

        public static bool Delete(int id, int userId)
        {
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                using (var tx = conn.BeginTransaction())
                {
                    var current = GetByIdInTx(conn, tx, id);
                    if (current == null) { tx.Rollback(); return false; }
                    InsertHistory(conn, tx, id, current, userId, "delete");
                    using (var cmd = new SqlCommand("DELETE FROM MF_AI_Knowledge WHERE Id = @Id", conn, tx))
                    {
                        cmd.Parameters.AddWithValue("@Id", id);
                        cmd.ExecuteNonQuery();
                    }
                    tx.Commit();
                    return true;
                }
            }
        }

        public static List<AiKnowledgeHistory> ListHistory(int knowledgeId, int top)
        {
            var list = new List<AiKnowledgeHistory>();
            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                var sql = @"SELECT TOP (@Top) HistoryId, KnowledgeId, Slug, Kind, Title, Summary, Body, Tags, Examples,
                                                Source, Version, ChangedByUserId, ChangedOnDate, ChangeAction
                            FROM MF_AI_Knowledge_History
                            WHERE KnowledgeId = @KnowledgeId
                            ORDER BY ChangedOnDate DESC, HistoryId DESC";
                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@Top", top);
                    cmd.Parameters.AddWithValue("@KnowledgeId", knowledgeId);
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read()) list.Add(MapHistory(r));
                    }
                }
            }
            return list;
        }

        // ─────────────────────────────────────────────────────────────────
        //  Internals
        // ─────────────────────────────────────────────────────────────────

        private static void InsertHistory(SqlConnection conn, SqlTransaction tx, int id, AiKnowledgeEntry e, int userId, string action)
        {
            using (var cmd = new SqlCommand(@"
                INSERT INTO MF_AI_Knowledge_History
                  (KnowledgeId, Slug, Kind, Title, Summary, Body, Tags, Examples, Source, Version, ChangedByUserId, ChangeAction)
                VALUES (@KnowledgeId, @Slug, @Kind, @Title, @Summary, @Body, @Tags, @Examples, @Source, @Version, @UserId, @Action)", conn, tx))
            {
                cmd.Parameters.AddWithValue("@KnowledgeId", id);
                cmd.Parameters.AddWithValue("@Slug", (object)e.Slug ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Kind", (object)e.Kind ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Title", (object)e.Title ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Summary", (object)e.Summary ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Body", (object)e.Body ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Tags", (object)e.Tags ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Examples", (object)e.Examples ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@Source", (object)e.Source ?? "customer");
                cmd.Parameters.AddWithValue("@Version", e.Version);
                cmd.Parameters.AddWithValue("@UserId", userId);
                cmd.Parameters.AddWithValue("@Action", action);
                cmd.ExecuteNonQuery();
            }
        }

        private static AiKnowledgeEntry GetByIdInTx(SqlConnection conn, SqlTransaction tx, int id)
        {
            var sql = @"SELECT Id, Slug, Kind, Title, Summary, Body, Tags, Examples, PortalId, Source, Version,
                               CreatedByUserId, CreatedOnDate, UpdatedByUserId, UpdatedOnDate
                        FROM MF_AI_Knowledge WHERE Id = @Id";
            using (var cmd = new SqlCommand(sql, conn, tx))
            {
                cmd.Parameters.AddWithValue("@Id", id);
                using (var r = cmd.ExecuteReader())
                {
                    if (r.Read()) return MapFull(r);
                }
            }
            return null;
        }

        private static void BindFull(SqlCommand cmd, AiKnowledgeEntry e, int userId)
        {
            cmd.Parameters.AddWithValue("@Slug", (object)e.Slug ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Kind", (object)e.Kind ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Title", (object)e.Title ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Summary", (object)e.Summary ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Body", (object)e.Body ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Tags", (object)e.Tags ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@Examples", (object)e.Examples ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@PortalId", e.PortalId.HasValue ? (object)e.PortalId.Value : DBNull.Value);
            cmd.Parameters.AddWithValue("@Source", (object)(e.Source ?? "customer"));
            cmd.Parameters.AddWithValue("@UserId", userId);
        }

        private static AiKnowledgeEntry MapSummary(IDataReader r)
        {
            return new AiKnowledgeEntry
            {
                Id = (int)r["Id"],
                Slug = r["Slug"] as string,
                Kind = r["Kind"] as string,
                Title = r["Title"] as string,
                Summary = r["Summary"] as string,
                Tags = r["Tags"] as string,
                PortalId = r["PortalId"] is DBNull ? (int?)null : (int)r["PortalId"],
                Source = r["Source"] as string,
                Version = (int)r["Version"],
                CreatedOnDate = (DateTime)r["CreatedOnDate"],
                UpdatedOnDate = r["UpdatedOnDate"] is DBNull ? (DateTime?)null : (DateTime)r["UpdatedOnDate"],
            };
        }

        private static AiKnowledgeEntry MapFull(IDataReader r)
        {
            var e = MapSummary(r);
            e.Body = r["Body"] as string;
            e.Examples = r["Examples"] as string;
            e.CreatedByUserId = r["CreatedByUserId"] is DBNull ? (int?)null : (int)r["CreatedByUserId"];
            e.UpdatedByUserId = r["UpdatedByUserId"] is DBNull ? (int?)null : (int)r["UpdatedByUserId"];
            return e;
        }

        private static AiKnowledgeHistory MapHistory(IDataReader r)
        {
            return new AiKnowledgeHistory
            {
                HistoryId = (int)r["HistoryId"],
                KnowledgeId = (int)r["KnowledgeId"],
                Slug = r["Slug"] as string,
                Kind = r["Kind"] as string,
                Title = r["Title"] as string,
                Summary = r["Summary"] as string,
                Body = r["Body"] as string,
                Tags = r["Tags"] as string,
                Examples = r["Examples"] as string,
                Source = r["Source"] as string,
                Version = (int)r["Version"],
                ChangedByUserId = r["ChangedByUserId"] is DBNull ? (int?)null : (int)r["ChangedByUserId"],
                ChangedOnDate = (DateTime)r["ChangedOnDate"],
                ChangeAction = r["ChangeAction"] as string,
            };
        }
    }
}
