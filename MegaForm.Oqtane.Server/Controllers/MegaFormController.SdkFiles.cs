using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Oqtane.Enums;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;

namespace MegaForm.Oqtane.Server.Controllers
{
    /// <summary>
    /// [SDK Files A+C v20260616] SDK Files API plumbing for Oqtane:
    ///   - PersistSubmissionFilesFailSoft: after a successful submit, parse the File/PdfForm
    ///     field metadata out of the submission data and insert MF_Files rows linked to the
    ///     new SubmissionId (the upload endpoint can't — the submission doesn't exist yet).
    ///     This is what makes IMegaFormClient.Files.GetBySubmission return data. Fail-soft:
    ///     a parsing/DB error is logged and swallowed, NEVER failing the submission.
    ///   - SdkDemoDownload: the GET endpoint the SdkDemoView (and OqtaneStorageService.GetFileUrl)
    ///     point at. Streams an uploaded file either via the public SDK Files API
    ///     (submissionId+fileId — the end-to-end demo path) or directly by relative path.
    /// </summary>
    public partial class MegaFormController
    {
        /// <summary>
        /// Insert MF_Files rows for a just-saved submission from its File/PdfForm field values.
        /// Called from Submit() inside the success branch; mirrors the DatabaseInsert fail-soft
        /// pattern right above it. Oqtane-isolated (does not touch the Core submission pipeline,
        /// so DNN behaviour is unchanged).
        /// </summary>
        private void PersistSubmissionFilesFailSoft(int formId, int submissionId, Dictionary<string, object> data)
        {
            if (submissionId <= 0 || data == null || data.Count == 0) return;
            try
            {
                var form = _formRepo.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson)) return;

                // RenderModelResolver is the canonical fail-soft parse (legacy-alias normalized,
                // empty schema on malformed JSON) — same call the DatabaseInsert block uses.
                var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson);
                var fields = resolved?.Schema?.Fields;
                if (fields == null || fields.Count == 0) return;

                var flat = MegaFormUtils.FlattenFields(fields) ?? new List<FormField>();
                var rows = SubmissionFileMetaExtractor.Extract(flat, data, submissionId);
                if (rows.Count == 0) return;

                // Optional service — registration is additive, so resolve fail-soft.
                if (!(HttpContext?.RequestServices?.GetService(typeof(IFileRepository)) is IFileRepository fileRepo))
                    return;

                foreach (var row in rows)
                    fileRepo.InsertFile(row);
            }
            catch (Exception ex)
            {
                try
                {
                    _logger.Log(global::Oqtane.Shared.LogLevel.Warning, this, LogFunction.Other,
                        "MegaForm SDK Files persist failed for submission {SubmissionId}: {Message}", submissionId, ex.Message);
                }
                catch { /* logging must never throw out of a fail-soft path */ }
            }
        }

        /// <summary>
        /// Download an uploaded submission file. Two call shapes are supported:
        ///   • <c>?submissionId=&amp;fileId=</c> — resolved through the PUBLIC SDK Files API
        ///     (<c>IMegaFormClient.Files.OpenAsync</c>), exactly as an external consumer would.
        ///   • <c>?path=</c> — served directly from App_Data/MegaForm/PrivateUploads (the shape
        ///     <c>OqtaneStorageService.GetFileUrl</c> produces), same security as Files/Download.
        /// [Authorize] matches the existing Files/Download endpoint (private uploads).
        /// </summary>
        [HttpGet("SdkDemo/Download")]
        [Authorize]
        public async Task<IActionResult> SdkDemoDownload([FromQuery] int submissionId, [FromQuery] int fileId, [FromQuery] string path)
        {
            if (!string.IsNullOrWhiteSpace(path))
                return ServePrivateUploadByPath(path);

            if (submissionId <= 0 || fileId <= 0) return NotFound();

            // [IDOR guard v20260617] Unlike the ?path= form (which needs an unguessable GUID
            // filename — a capability token), submissionId+fileId are small enumerable integers.
            // So verify the caller may actually see this submission, mirroring the GetSubmission
            // endpoint's model: submission admins, or the submission's own owner. Anyone else gets
            // 404 (not 403) so submission ids can't be enumerated for existence. IFileRepository
            // is portal-agnostic, so this is the only tenant/owner boundary on this branch.
            var sub = _subRepo.Get(submissionId);
            if (sub == null) return NotFound();
            var actor = GetCurrentUserContext();
            var isOwner = sub.UserId.HasValue && sub.UserId.Value > 0 && sub.UserId.Value == actor.UserId;
            if (!IsSubmissionAdmin(actor) && !isOwner) return NotFound();

            // End-to-end SDK path: resolve through the public facade. OpenAsync reads MF_Files
            // (via IFileRepository) + streams from IStorageService — both registered in Startup.
            var sdk = HttpContext?.RequestServices?.GetService(typeof(MegaForm.Sdk.IMegaFormClient)) as MegaForm.Sdk.IMegaFormClient;
            if (sdk == null)
                return ServeFileBySubmissionFallback(submissionId, fileId);

            // OpenAsync does not use scope (it filters by submission+fileId), so null is fine.
            var content = await sdk.Files.OpenAsync(submissionId, fileId);
            if (content == null || content.Content == null)
                return ServeFileBySubmissionFallback(submissionId, fileId);

            var ct = string.IsNullOrWhiteSpace(content.ContentType) ? "application/octet-stream" : content.ContentType;
            return File(content.Content, ct, string.IsNullOrWhiteSpace(content.FileName) ? ("file-" + fileId) : content.FileName);
        }

        // Serve a file by its relative StoredPath under PrivateUploads. Mirrors DownloadFile's
        // path-traversal guard exactly.
        private IActionResult ServePrivateUploadByPath(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return NotFound();

            var safePath = relativePath.Replace("..", string.Empty).TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
            var appDataRoot = Path.GetFullPath(Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads"));
            var fullPath = Path.GetFullPath(Path.Combine(appDataRoot, safePath));
            // Compare against the root WITH a trailing separator so a sibling dir whose name is a
            // prefix of the root (…/PrivateUploads_x) can't pass the StartsWith containment check.
            var rootWithSep = appDataRoot.EndsWith(Path.DirectorySeparatorChar) ? appDataRoot : appDataRoot + Path.DirectorySeparatorChar;
            if (!fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(fullPath))
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
                contentType = "application/octet-stream";

            return PhysicalFile(fullPath, contentType, Path.GetFileName(fullPath));
        }

        // Fallback when the SDK client isn't resolvable: look up the MF_Files row directly and
        // stream by its StoredPath. Keeps the endpoint working even if AddMegaFormSdk is absent.
        private IActionResult ServeFileBySubmissionFallback(int submissionId, int fileId)
        {
            var fileRepo = HttpContext?.RequestServices?.GetService(typeof(IFileRepository)) as IFileRepository;
            var row = fileRepo?.GetBySubmission(submissionId)?.FirstOrDefault(f => f.FileId == fileId);
            if (row == null || string.IsNullOrWhiteSpace(row.StoredPath)) return NotFound();
            return ServePrivateUploadByPath(row.StoredPath);
        }
    }
}
