using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Web.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MegaForm.Web.Controllers
{
    [Authorize(AuthenticationSchemes = CookieAuthenticationDefaults.AuthenticationScheme)]
    [Route("api/MegaForm/Documents")]
    public class DocumentAdminController : Controller
    {
        private readonly IDocumentRepository _documents;
        private readonly IPlatformContext _platform;
        private readonly WebWorkflowActorAccessor _actorAccessor;

        public DocumentAdminController(
            IDocumentRepository documents,
            IPlatformContext platform,
            WebWorkflowActorAccessor actorAccessor)
        {
            _documents = documents;
            _platform = platform;
            _actorAccessor = actorAccessor;
        }

        [HttpGet("List")]
        public IActionResult List(
            string appScope = "documents",
            string status = null,
            string search = null,
            int pageIndex = 0,
            int pageSize = 20)
        {
            var result = _documents.ListDocuments(_platform.PortalId, appScope, status, search, pageIndex, pageSize);
            return Ok(new
            {
                items = result.Items.Select(d => new
                {
                    d.DocumentId,
                    d.PortalId,
                    d.AppScope,
                    d.Slug,
                    d.Title,
                    d.Summary,
                    d.Status,
                    d.PublishedRevisionId,
                    d.LatestRevisionId,
                    d.CreatedOnUtc,
                    d.UpdatedOnUtc,
                    metadata = _documents.GetMetadata(d.DocumentId),
                    publicUrl = "/documents/" + d.Slug
                }),
                totalCount = result.TotalCount
            });
        }

        [HttpGet("{id:int}")]
        public IActionResult GetDetail(int id)
        {
            var document = _documents.GetDocument(id);
            if (document == null || (_platform.PortalId > 0 && document.PortalId != _platform.PortalId))
                return NotFound();

            return Ok(new
            {
                document,
                metadata = _documents.GetMetadata(id),
                aliases = _documents.ListAliases(id),
                revisions = _documents.ListRevisions(id),
                assignments = _documents.ListAssignments(id),
                comments = _documents.ListComments(id),
                directives = _documents.ListDirectives(id)
            });
        }

        [HttpPost("PublishRevision")]
        public IActionResult PublishRevision(int revisionId)
        {
            if (revisionId <= 0)
                return BadRequest(new { error = "revisionId is required." });

            _documents.PublishRevision(revisionId, _actorAccessor.GetCurrentUser().UserId);
            return Ok(new { success = true, revisionId, status = DocumentStatuses.Published });
        }

        [HttpPost("Metadata/Save")]
        public IActionResult SaveMetadata([FromBody] DocumentMetadataInfo metadata)
        {
            if (metadata == null || metadata.DocumentId <= 0)
                return BadRequest(new { error = "documentId is required." });

            var document = _documents.GetDocument(metadata.DocumentId);
            if (document == null || (_platform.PortalId > 0 && document.PortalId != _platform.PortalId))
                return NotFound();

            metadata.PortalId = document.PortalId;
            metadata.UpdatedByUserId = _actorAccessor.GetCurrentUser().UserId;
            metadata.UpdatedOnUtc = System.DateTime.UtcNow;
            _documents.SaveMetadata(metadata);
            return Ok(new { success = true, metadata = _documents.GetMetadata(metadata.DocumentId) });
        }

        [HttpPost("Assignments/Save")]
        public IActionResult SaveAssignment([FromBody] DocumentAssignmentInfo assignment)
        {
            if (assignment == null || assignment.DocumentId <= 0)
                return BadRequest(new { error = "documentId is required." });

            var document = _documents.GetDocument(assignment.DocumentId);
            if (document == null || (_platform.PortalId > 0 && document.PortalId != _platform.PortalId))
                return NotFound();

            var actor = _actorAccessor.GetCurrentUser();
            assignment.AssignedByUserId = actor.UserId;
            if (string.IsNullOrWhiteSpace(assignment.AssignedByUserName))
                assignment.AssignedByUserName = actor.DisplayName ?? actor.UserName ?? string.Empty;
            _documents.SaveAssignment(assignment);
            return Ok(new { success = true, assignments = _documents.ListAssignments(assignment.DocumentId) });
        }

        [HttpPost("Comments/Save")]
        public IActionResult SaveComment([FromBody] DocumentCommentInfo comment)
        {
            if (comment == null || comment.DocumentId <= 0 || string.IsNullOrWhiteSpace(comment.Body))
                return BadRequest(new { error = "documentId and body are required." });

            var document = _documents.GetDocument(comment.DocumentId);
            if (document == null || (_platform.PortalId > 0 && document.PortalId != _platform.PortalId))
                return NotFound();

            var actor = _actorAccessor.GetCurrentUser();
            comment.CreatedByUserId = actor.UserId;
            if (string.IsNullOrWhiteSpace(comment.CreatedByUserName))
                comment.CreatedByUserName = actor.DisplayName ?? actor.UserName ?? string.Empty;
            _documents.SaveComment(comment);
            return Ok(new { success = true, comments = _documents.ListComments(comment.DocumentId, comment.RevisionId) });
        }

        [HttpPost("Directives/Save")]
        public IActionResult SaveDirective([FromBody] DocumentDirectiveInfo directive)
        {
            if (directive == null || directive.DocumentId <= 0 || string.IsNullOrWhiteSpace(directive.DirectiveText))
                return BadRequest(new { error = "documentId and directiveText are required." });

            var document = _documents.GetDocument(directive.DocumentId);
            if (document == null || (_platform.PortalId > 0 && document.PortalId != _platform.PortalId))
                return NotFound();

            var actor = _actorAccessor.GetCurrentUser();
            directive.IssuedByUserId = actor.UserId;
            if (string.IsNullOrWhiteSpace(directive.IssuedByUserName))
                directive.IssuedByUserName = actor.DisplayName ?? actor.UserName ?? string.Empty;
            _documents.SaveDirective(directive);
            return Ok(new { success = true, directives = _documents.ListDirectives(directive.DocumentId) });
        }
    }
}
