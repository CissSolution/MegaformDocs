using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using DotNetNuke.Data;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// [SourcePickerDNN v20260717-01] DNN's IExternalRowMapStore — anchor ids for ATBE-bound rows.
    ///
    /// Twin of OqtaneExternalRowMapStore: the uniqueness guarantee is the UNIQUE (FormId, RowKeyHash)
    /// index in the database, not a check-then-insert in C# — two admins paging the same table at the
    /// same moment must not mint two anchors for one customer row. Anchors are inserted through the
    /// RAW submission repository (never the ExternalSubmissionRepository decorator), so anchor
    /// creation cannot recurse back into the external read path.
    ///
    /// Table is created on first use, same as DnnExternalBindingStore: DNN's SqlDataProvider scripts
    /// stopped at 01.06.32, so a hot-swapped site has no MF_ExternalRowMap.
    /// </summary>
    public class DnnExternalRowMapStore : IExternalRowMapStore
    {
        private static readonly object SchemaLock = new object();
        private static bool _schemaReady;

        private readonly ISubmissionRepository _submissions;

        public DnnExternalRowMapStore(ISubmissionRepository rawSubmissions)
        {
            _submissions = rawSubmissions ?? throw new ArgumentNullException(nameof(rawSubmissions));
        }

        private static string ConnectionString => DataProvider.Instance().ConnectionString;

        private static void EnsureSchema(SqlConnection conn)
        {
            if (_schemaReady) return;
            lock (SchemaLock)
            {
                if (_schemaReady) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
IF OBJECT_ID(N'[dbo].[MF_ExternalRowMap]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MF_ExternalRowMap] (
        [SubmissionId] int NOT NULL PRIMARY KEY,
        [FormId] int NOT NULL,
        [RowKeyHash] nvarchar(64) NOT NULL,
        [RowKeyJson] nvarchar(max) NOT NULL DEFAULT '',
        [FirstSeenUtc] datetime2 NOT NULL
    );
    CREATE UNIQUE INDEX [IX_MF_ExternalRowMap_Form_Hash]
        ON [dbo].[MF_ExternalRowMap]([FormId], [RowKeyHash]);
END;";
                    cmd.ExecuteNonQuery();
                }
                _schemaReady = true;
            }
        }

        public List<int> GetOrCreateAnchors(int formId, IList<string> rowKeyJson)
        {
            var result = new List<int>(rowKeyJson?.Count ?? 0);
            if (rowKeyJson == null || rowKeyJson.Count == 0) return result;

            var hashes = rowKeyJson.Select(k => Hash(formId, k)).ToList();

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);

                // One round trip for the page's existing anchors.
                var existing = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                using (var cmd = conn.CreateCommand())
                {
                    var names = new List<string>(hashes.Count);
                    for (int i = 0; i < hashes.Count; i++)
                    {
                        var p = "@h" + i;
                        names.Add(p);
                        cmd.Parameters.Add(new SqlParameter(p, SqlDbType.NVarChar, 64) { Value = hashes[i] });
                    }
                    cmd.CommandText = "SELECT RowKeyHash, SubmissionId FROM dbo.MF_ExternalRowMap WHERE FormId = @f AND RowKeyHash IN (" + string.Join(",", names) + ")";
                    cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = formId });
                    using (var r = cmd.ExecuteReader())
                        while (r.Read()) existing[r.GetString(0)] = r.GetInt32(1);
                }

                for (int i = 0; i < rowKeyJson.Count; i++)
                {
                    int anchorId;
                    if (existing.TryGetValue(hashes[i], out anchorId)) { result.Add(anchorId); continue; }

                    // The anchor carries no business data: DataJson stays empty forever — the record
                    // itself lives in the customer's table and is read fresh on every request.
                    anchorId = _submissions.Insert(new SubmissionInfo
                    {
                        FormId = formId,
                        DataJson = "{}",
                        Status = "new",
                        SubmittedOnUtc = DateTime.UtcNow,
                    });

                    try
                    {
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = @"INSERT INTO dbo.MF_ExternalRowMap
                                (SubmissionId, FormId, RowKeyHash, RowKeyJson, FirstSeenUtc)
                                VALUES (@s, @f, @h, @j, @now)";
                            cmd.Parameters.Add(new SqlParameter("@s", SqlDbType.Int) { Value = anchorId });
                            cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = formId });
                            cmd.Parameters.Add(new SqlParameter("@h", SqlDbType.NVarChar, 64) { Value = hashes[i] });
                            cmd.Parameters.Add(new SqlParameter("@j", SqlDbType.NVarChar, -1) { Value = (object)rowKeyJson[i] ?? string.Empty });
                            cmd.Parameters.Add(new SqlParameter("@now", SqlDbType.DateTime2) { Value = DateTime.UtcNow });
                            cmd.ExecuteNonQuery();
                        }
                        existing[hashes[i]] = anchorId;
                    }
                    catch (SqlException ex) when (ex.Number == 2601 || ex.Number == 2627)
                    {
                        // Someone else mapped this row first. Their anchor wins; ours is orphaned
                        // rather than letting one customer record end up with two identities.
                        using (var cmd = conn.CreateCommand())
                        {
                            cmd.CommandText = "SELECT SubmissionId FROM dbo.MF_ExternalRowMap WHERE FormId = @f AND RowKeyHash = @h";
                            cmd.Parameters.Add(new SqlParameter("@f", SqlDbType.Int) { Value = formId });
                            cmd.Parameters.Add(new SqlParameter("@h", SqlDbType.NVarChar, 64) { Value = hashes[i] });
                            var winner = cmd.ExecuteScalar();
                            if (winner == null || winner == DBNull.Value) throw;
                            anchorId = Convert.ToInt32(winner);
                            existing[hashes[i]] = anchorId;
                        }
                    }

                    result.Add(anchorId);
                }
            }

            return result;
        }

        public ExternalRowRef Resolve(int submissionId)
        {
            // Synthetic SQL rows (databaseInsert source) use NEGATIVE ids and never have anchors.
            if (submissionId <= 0) return null;

            using (var conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                EnsureSchema(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT SubmissionId, FormId, RowKeyJson FROM dbo.MF_ExternalRowMap WHERE SubmissionId = @s";
                    cmd.Parameters.Add(new SqlParameter("@s", SqlDbType.Int) { Value = submissionId });
                    using (var r = cmd.ExecuteReader())
                    {
                        if (!r.Read()) return null;
                        return new ExternalRowRef
                        {
                            SubmissionId = r.GetInt32(0),
                            FormId = r.GetInt32(1),
                            RowKeyJson = r.IsDBNull(2) ? string.Empty : r.GetString(2),
                        };
                    }
                }
            }
        }

        internal static string Hash(int formId, string rowKeyJson)
        {
            using (var sha = SHA256.Create())
            {
                var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(formId + "|" + (rowKeyJson ?? string.Empty)));
                var sb = new StringBuilder(64);
                foreach (var b in bytes) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }
    }
}
