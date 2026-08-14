using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Umbraco.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Private-upload download parity endpoint for Umbraco.
    /// Mirrors MegaForm.Oqtane.Server MegaFormController.DownloadFile ([SecFix P1-8 /
    /// Phase0-2 v20260722]). UmbracoStorageService.GetFileUrl already emits
    /// "/umbraco/api/megaform/files/download?path=..." — this is the endpoint that URL
    /// has always pointed at.
    ///
    /// Path layout on Umbraco (differs from Oqtane's PrivateUploads-only root):
    ///   • Upload/File (public form upload) writes App_Data/MegaForm/TempUploads/{guid}{ext}
    ///     and records the ROOT-RELATIVE path ("App_Data/MegaForm/TempUploads/...").
    ///   • UmbracoStorageService.SaveFileAsync writes App_Data/MegaForm/PrivateUploads/{folder}/{file}
    ///     and records the path relative to PrivateUploads.
    /// Both live under App_Data/MegaForm, so this endpoint roots there and also accepts a
    /// stored path that still carries the "App_Data/MegaForm/" prefix. Canonical-path
    /// containment mirrors UmbracoSubmissionFileBlobReader — a stored path can never escape
    /// the MegaForm data folder.
    /// </summary>
    public partial class MegaFormApiController
    {
        [HttpGet]
        [Authorize]
        [Route("/umbraco/api/megaform/files/download")]
        [Route("/umbraco/MegaForm/MegaFormApi/Files/Download")]
        [Route("/api/MegaForm/Files/Download")]
        public async Task<IActionResult> DownloadFile([FromQuery] string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return NotFound();

            // [SecFix P1-8] Canonical-path containment. GetFullPath resolves any `..` so an
            // escaping path fails the root-prefix check (never string-replace ".." away).
            var contentRoot = Path.GetFullPath(MegaFormUmbracoPaths.GetContentRoot(_env));
            var megaFormRoot = Path.GetFullPath(Path.Combine(
                contentRoot, MegaFormUmbracoPaths.AppDataMegaForm.Replace('/', Path.DirectorySeparatorChar)));

            var rel = (path ?? string.Empty).Replace('\\', '/').TrimStart('/');
            // Tolerate both stored conventions: root-relative ("App_Data/MegaForm/...")
            // and MegaForm-root-relative ("TempUploads/..." / "PrivateUploads/...").
            var prefix = MegaFormUmbracoPaths.AppDataMegaForm + "/";
            if (rel.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                rel = rel.Substring(prefix.Length);

            var fullPath = Path.GetFullPath(Path.Combine(megaFormRoot, rel.Replace('/', Path.DirectorySeparatorChar)));
            var rootWithSep = megaFormRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) || !System.IO.File.Exists(fullPath))
                return NotFound();

            // [SecFix Phase0-2 v20260722] IDOR guard (same (a)/(b)/(c) model as Oqtane):
            //   (a) submission staff of the owning form;
            //   (b) the file is referenced by a submission the caller may view;
            //   (c) the file is referenced by NO submission yet (fresh upload) — keep the
            //       legacy capability-URL behavior (the GUID filename is the secret).
            // Umbraco's flat TempUploads layout has no "form-{id}" segment, so most paths
            // take the (c) fallback — identical to Oqtane's behavior for unparseable paths.
            int fileFormId = TryParseUploadFormId(rel);
            if (fileFormId > 0 && !await CanDownloadPrivateUploadAsync(fileFormId, fullPath))
                return StatusCode(403, new { error = "You do not have permission to download this file." });

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(fullPath, out var contentType))
                contentType = "application/octet-stream";

            // [SecFix P2-4] Never let the browser MIME-sniff a private upload into executable HTML/JS.
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return PhysicalFile(fullPath, contentType, Path.GetFileName(fullPath));
        }

        // [SecFix Phase0-2 v20260722] Parse "form-{id}" from the first path segment
        // (e.g. "form-12/field-avatar/abc123.pdf"). Returns 0 when the path does not
        // follow that layout — DownloadFile keeps the legacy capability-URL behavior.
        private static int TryParseUploadFormId(string relativePath)
        {
            if (string.IsNullOrWhiteSpace(relativePath)) return 0;
            var firstSegment = relativePath.Replace('\\', '/').Split('/')[0];
            if (!firstSegment.StartsWith("form-", StringComparison.OrdinalIgnoreCase)) return 0;
            int formId;
            return int.TryParse(firstSegment.Substring(5), out formId) ? formId : 0;
        }

        // [SecFix Phase0-2 v20260722] See DownloadFile for the (a)/(b)/(c) authorization model.
        private async Task<bool> CanDownloadPrivateUploadAsync(int formId, string fullPath)
        {
            var actor = await BuildUserContextAsync();
            var permissions = MatrixPermissions;

            // (a) staff: admin or a holder of the form's view/manage rule.
            if (CanUseSubmissionManagement(formId, actor, permissions)) return true;

            // Find submissions referencing this file (search matches DataJson and the typed
            // DisplayValue). Newest first; 200 rows bound the scan.
            var fileToken = Path.GetFileNameWithoutExtension(fullPath);
            if (string.IsNullOrWhiteSpace(fileToken)) return false;
            List<SubmissionInfo> referencing;
            try
            {
                referencing = _subRepo.List(formId, null, fileToken, null, null, 0, 200).Items;
            }
            catch
            {
                referencing = null; // fail-closed below for referenced files; see (c)
            }

            // (c) unreferenced upload (not yet submitted) → legacy capability-URL behavior.
            // If the lookup itself failed we cannot prove (c), so treat as referenced and
            // require (b) — fail closed.
            if (referencing != null && referencing.Count == 0) return true;

            // (b) caller may view at least one submission that references the file.
            if (referencing != null)
            {
                foreach (var sub in referencing)
                {
                    if (sub != null && CanViewSubmissionRow(sub, actor, permissions))
                        return true;
                }
            }
            return false;
        }
    }
}
