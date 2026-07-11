using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Models.ExternalTable;

namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>[ATBE P1] EF rows for the external-table binding and the anchor map.</summary>
    public class ExternalBindingRow
    {
        public int FormId { get; set; }
        public string ConnectionKey { get; set; }
        public string DatabaseType { get; set; }
        public string SchemaName { get; set; }
        public string TableName { get; set; }
        public string ProfileJson { get; set; }
        public string ProfileHash { get; set; }
        public string Mode { get; set; }
        public bool TimeColumnConfirmed { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    /// <summary>
    /// One row per customer record we have ever addressed. SubmissionId is the id of an ANCHOR row in
    /// MF_Submissions — MegaForm issues it, so it can never collide with a real submission id, and the
    /// detail/status routes (which carry only a submission id) keep resolving correctly.
    /// </summary>
    public class ExternalRowMapRow
    {
        public int SubmissionId { get; set; }
        public int FormId { get; set; }
        /// <summary>SHA-256 of FormId + the key JSON. Unique per form, so a repeated page view reuses
        /// the same anchor instead of minting a new one.</summary>
        public string RowKeyHash { get; set; }
        public string RowKeyJson { get; set; }
        public DateTime FirstSeenUtc { get; set; }
    }

    public class OqtaneExternalBindingStore : IExternalBindingStore
    {
        private readonly IDbContextFactory<MegaFormDbContext> _factory;
        public OqtaneExternalBindingStore(IDbContextFactory<MegaFormDbContext> factory) { _factory = factory; }

        public ExternalBinding GetByForm(int formId)
        {
            using var db = _factory.CreateDbContext();
            var r = db.ExternalBindings.AsNoTracking().FirstOrDefault(x => x.FormId == formId);
            return r == null ? null : Map(r);
        }

        public void Save(ExternalBinding b)
        {
            using var db = _factory.CreateDbContext();
            var r = db.ExternalBindings.FirstOrDefault(x => x.FormId == b.FormId);
            if (r == null)
            {
                r = new ExternalBindingRow { FormId = b.FormId, CreatedOnUtc = DateTime.UtcNow };
                db.ExternalBindings.Add(r);
            }
            r.ConnectionKey = b.ConnectionKey;
            r.DatabaseType = b.DatabaseType;
            r.SchemaName = b.Schema;
            r.TableName = b.Table;
            r.ProfileJson = b.ProfileJson;
            r.ProfileHash = b.ProfileHash;
            r.Mode = b.Mode;
            r.TimeColumnConfirmed = b.TimeColumnConfirmed;
            db.SaveChanges();
        }

        public void Delete(int formId)
        {
            using var db = _factory.CreateDbContext();
            var r = db.ExternalBindings.FirstOrDefault(x => x.FormId == formId);
            if (r == null) return;
            db.ExternalBindings.Remove(r);
            db.SaveChanges();
        }

        public List<int> BoundFormIds()
        {
            using var db = _factory.CreateDbContext();
            return db.ExternalBindings.AsNoTracking().Select(x => x.FormId).ToList();
        }

        private static ExternalBinding Map(ExternalBindingRow r) => new ExternalBinding
        {
            FormId = r.FormId,
            ConnectionKey = r.ConnectionKey,
            DatabaseType = r.DatabaseType,
            Schema = r.SchemaName,
            Table = r.TableName,
            ProfileJson = r.ProfileJson,
            ProfileHash = r.ProfileHash,
            Mode = r.Mode,
            TimeColumnConfirmed = r.TimeColumnConfirmed,
            CreatedOnUtc = r.CreatedOnUtc,
        };
    }

    /// <summary>
    /// Hands out anchor ids for customer rows, and never hands out two for the same row.
    ///
    /// The uniqueness guarantee is the (FormId, RowKeyHash) index in the database, not a check-then-
    /// insert in C#: two admins paging the same 500k table at the same moment would otherwise mint
    /// duplicate anchors for the same ticket, and the detail view would show one of them at random.
    /// </summary>
    public class OqtaneExternalRowMapStore : IExternalRowMapStore
    {
        private readonly IDbContextFactory<MegaFormDbContext> _factory;
        private readonly ISubmissionRepository _submissions;

        public OqtaneExternalRowMapStore(IDbContextFactory<MegaFormDbContext> factory, EfSubmissionRepository submissions)
        {
            _factory = factory;
            _submissions = submissions;   // the REAL repository: an anchor must not route back through the decorator
        }

        public List<int> GetOrCreateAnchors(int formId, IList<string> rowKeyJson)
        {
            var result = new List<int>(rowKeyJson.Count);
            if (rowKeyJson.Count == 0) return result;

            var hashes = rowKeyJson.Select(k => Hash(formId, k)).ToList();

            using var db = _factory.CreateDbContext();
            var existing = db.ExternalRowMap.AsNoTracking()
                .Where(x => x.FormId == formId && hashes.Contains(x.RowKeyHash))
                .ToDictionary(x => x.RowKeyHash, x => x.SubmissionId);

            for (int i = 0; i < rowKeyJson.Count; i++)
            {
                int anchorId;
                if (existing.TryGetValue(hashes[i], out anchorId)) { result.Add(anchorId); continue; }

                // The anchor carries no business data: DataJson stays empty forever, because the record
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
                    db.ExternalRowMap.Add(new ExternalRowMapRow
                    {
                        SubmissionId = anchorId,
                        FormId = formId,
                        RowKeyHash = hashes[i],
                        RowKeyJson = rowKeyJson[i],
                        FirstSeenUtc = DateTime.UtcNow,
                    });
                    db.SaveChanges();
                    existing[hashes[i]] = anchorId;
                }
                catch (DbUpdateException)
                {
                    // Someone else mapped this row first. Their anchor wins; ours is orphaned rather
                    // than letting one customer record end up with two identities.
                    db.ChangeTracker.Clear();
                    var winner = db.ExternalRowMap.AsNoTracking()
                        .FirstOrDefault(x => x.FormId == formId && x.RowKeyHash == hashes[i]);
                    if (winner == null) throw;
                    anchorId = winner.SubmissionId;
                    existing[hashes[i]] = anchorId;
                }

                result.Add(anchorId);
            }

            return result;
        }

        public ExternalRowRef Resolve(int submissionId)
        {
            using var db = _factory.CreateDbContext();
            var r = db.ExternalRowMap.AsNoTracking().FirstOrDefault(x => x.SubmissionId == submissionId);
            return r == null ? null : new ExternalRowRef
            {
                SubmissionId = r.SubmissionId,
                FormId = r.FormId,
                RowKeyJson = r.RowKeyJson,
            };
        }

        internal static string Hash(int formId, string rowKeyJson)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(formId + "|" + (rowKeyJson ?? string.Empty)));
            var sb = new StringBuilder(64);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }
    }
}
