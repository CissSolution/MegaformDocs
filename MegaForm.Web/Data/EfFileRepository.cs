using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MfFileInfo = MegaForm.Core.Models.FileInfo;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Web.Data
{
    /// <summary>
    /// EF-backed MF_Files repository for the standalone ASP.NET Core Web host.
    /// Enables the MegaForm SDK Files API (IMegaFormClient.Files.*) when running
    /// outside of DNN/Oqtane/Umbraco.
    /// </summary>
    public class EfFileRepository : IFileRepository
    {
        private readonly MegaFormDbContext _db;

        public EfFileRepository(MegaFormDbContext db)
        {
            _db = db;
        }

        public int InsertFile(MfFileInfo file)
        {
            if (file.UploadedOnUtc == default)
                file.UploadedOnUtc = DateTime.UtcNow;

            // Guard NOT NULL columns (mirrors other Web repositories).
            file.FieldKey      = file.FieldKey      ?? string.Empty;
            file.OriginalName  = file.OriginalName  ?? string.Empty;
            file.StoredPath    = file.StoredPath    ?? string.Empty;
            file.ContentType   = file.ContentType   ?? string.Empty;

            _db.Files.Add(file);
            _db.SaveChanges();
            return file.FileId;
        }

        public List<MfFileInfo> GetBySubmission(int submissionId)
        {
            return _db.Files
                .AsNoTracking()
                .Where(f => f.SubmissionId == submissionId)
                .OrderBy(f => f.FileId)
                .ToList();
        }

        public void DeleteBySubmission(int submissionId)
        {
            var rows = _db.Files.Where(f => f.SubmissionId == submissionId);
            _db.Files.RemoveRange(rows);
            _db.SaveChanges();
        }
    }
}
