using System;
using System.IO;
using MegaForm.Core.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace MegaForm.Web.Controllers
{
    [AllowAnonymous]
    [Route("documents")]
    public class DocumentsController : Controller
    {
        private readonly IDocumentRepository _documents;
        private readonly IStorageService _storage;
        private readonly IPlatformContext _platform;

        public DocumentsController(
            IDocumentRepository documents,
            IStorageService storage,
            IPlatformContext platform)
        {
            _documents = documents;
            _storage = storage;
            _platform = platform;
        }

        [HttpGet("{**slug}")]
        public IActionResult GetPublishedDocument(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug))
                return NotFound();

            var document = _documents.GetDocumentBySlug(_platform.PortalId, slug, "documents")
                ?? _documents.GetDocumentBySlug(_platform.PortalId, slug, "document")
                ?? _documents.GetDocumentBySlug(_platform.PortalId, slug, "document-management")
                ?? _documents.GetDocumentBySlug(_platform.PortalId, slug);
            if (document == null)
                return NotFound();

            var revision = document.PublishedRevisionId.HasValue
                ? _documents.GetRevision(document.PublishedRevisionId.Value)
                : _documents.GetPublishedRevision(document.DocumentId);
            if (revision == null || string.IsNullOrWhiteSpace(revision.StoredPath))
                return NotFound();

            var stream = _storage.GetFile(revision.StoredPath);
            if (stream == null)
                return NotFound();

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(revision.OriginalName ?? revision.StoredPath, out var contentType))
                contentType = !string.IsNullOrWhiteSpace(revision.ContentType)
                    ? revision.ContentType
                    : "application/octet-stream";

            var fileName = string.IsNullOrWhiteSpace(revision.OriginalName)
                ? Path.GetFileName(revision.StoredPath)
                : revision.OriginalName;
            Response.Headers["Content-Disposition"] =
                "inline; filename*=UTF-8''" + Uri.EscapeDataString(fileName ?? "document");

            return File(stream, contentType, enableRangeProcessing: true);
        }
    }
}
