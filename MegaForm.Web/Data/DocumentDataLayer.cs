using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Web.Data
{
    public class EfDocumentRepository : IDocumentRepository
    {
        private readonly MegaFormDbContext _db;

        public EfDocumentRepository(MegaFormDbContext db)
        {
            _db = db;
        }

        public DocumentInfo GetDocument(int documentId)
        {
            return _db.Documents.AsNoTracking()
                .FirstOrDefault(d => d.DocumentId == documentId);
        }

        public DocumentInfo GetDocumentBySlug(int portalId, string slug, string appScope = null)
        {
            if (string.IsNullOrWhiteSpace(slug))
                return null;

            var normalizedSlug = NormalizeSlug(slug);
            if (string.IsNullOrWhiteSpace(normalizedSlug))
                return null;

            var documents = _db.Documents.AsNoTracking().AsQueryable();
            if (portalId > 0)
                documents = documents.Where(d => d.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope))
                documents = documents.Where(d => d.AppScope == appScope);

            var direct = documents.FirstOrDefault(d => d.Slug == normalizedSlug);
            if (direct != null)
                return direct;

            var aliases = _db.DocumentAliases.AsNoTracking()
                .Where(a => a.IsActive && a.Slug == normalizedSlug);
            if (portalId > 0)
                aliases = aliases.Where(a => a.PortalId == portalId);

            var documentIds = aliases.Select(a => a.DocumentId).Distinct().ToList();
            if (documentIds.Count == 0)
                return null;

            return documents.FirstOrDefault(d => documentIds.Contains(d.DocumentId));
        }

        public (List<DocumentInfo> Items, int TotalCount) ListDocuments(
            int portalId,
            string appScope = null,
            string status = null,
            string search = null,
            int pageIndex = 0,
            int pageSize = 50)
        {
            var query = _db.Documents.AsNoTracking().AsQueryable();
            if (portalId > 0)
                query = query.Where(d => d.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope))
                query = query.Where(d => d.AppScope == appScope);
            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(d => d.Status == status);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(d =>
                    EF.Functions.Like(d.Title ?? string.Empty, $"%{term}%") ||
                    EF.Functions.Like(d.Slug ?? string.Empty, $"%{term}%") ||
                    EF.Functions.Like(d.Summary ?? string.Empty, $"%{term}%"));
            }

            var ordered = query
                .OrderByDescending(d => d.UpdatedOnUtc ?? d.CreatedOnUtc)
                .ThenByDescending(d => d.DocumentId);

            var total = ordered.Count();
            if (pageSize <= 0)
                return (ordered.ToList(), total);

            if (pageIndex < 0)
                pageIndex = 0;
            if (pageSize > 250)
                pageSize = 250;

            return (
                ordered.Skip(pageIndex * pageSize).Take(pageSize).ToList(),
                total
            );
        }

        public int SaveDocument(DocumentInfo document)
        {
            if (document == null)
                throw new ArgumentNullException(nameof(document));

            document.AppScope = document.AppScope ?? string.Empty;
            document.Slug = NormalizeSlug(document.Slug);
            document.Title = document.Title ?? string.Empty;
            document.Summary = document.Summary ?? string.Empty;
            document.Status = string.IsNullOrWhiteSpace(document.Status) ? DocumentStatuses.Draft : document.Status;

            if (document.DocumentId == 0)
            {
                if (document.CreatedOnUtc == default)
                    document.CreatedOnUtc = DateTime.UtcNow;
                _db.Documents.Add(document);
            }
            else
            {
                if (!document.UpdatedOnUtc.HasValue)
                    document.UpdatedOnUtc = DateTime.UtcNow;
                _db.Documents.Update(document);
            }

            _db.SaveChanges();
            return document.DocumentId;
        }

        public DocumentRevisionInfo GetRevision(int revisionId)
        {
            return _db.DocumentRevisions.AsNoTracking()
                .FirstOrDefault(r => r.RevisionId == revisionId);
        }

        public DocumentRevisionInfo GetRevisionBySubmission(int submissionId)
        {
            return _db.DocumentRevisions.AsNoTracking()
                .FirstOrDefault(r => r.SubmissionId == submissionId);
        }

        public DocumentRevisionInfo GetLatestRevision(int documentId)
        {
            return _db.DocumentRevisions.AsNoTracking()
                .Where(r => r.DocumentId == documentId)
                .OrderByDescending(r => r.VersionNumber)
                .ThenByDescending(r => r.RevisionId)
                .FirstOrDefault();
        }

        public DocumentRevisionInfo GetPublishedRevision(int documentId)
        {
            return _db.DocumentRevisions.AsNoTracking()
                .Where(r => r.DocumentId == documentId && r.IsPublished)
                .OrderByDescending(r => r.VersionNumber)
                .ThenByDescending(r => r.RevisionId)
                .FirstOrDefault();
        }

        public List<DocumentRevisionInfo> ListRevisions(int documentId)
        {
            return _db.DocumentRevisions.AsNoTracking()
                .Where(r => r.DocumentId == documentId)
                .OrderByDescending(r => r.VersionNumber)
                .ThenByDescending(r => r.RevisionId)
                .ToList();
        }

        public int SaveRevision(DocumentRevisionInfo revision)
        {
            if (revision == null)
                throw new ArgumentNullException(nameof(revision));

            revision.Status = string.IsNullOrWhiteSpace(revision.Status) ? DocumentStatuses.Draft : revision.Status;
            revision.Title = revision.Title ?? string.Empty;
            revision.Summary = revision.Summary ?? string.Empty;
            revision.Slug = NormalizeSlug(revision.Slug);
            revision.OriginalName = revision.OriginalName ?? string.Empty;
            revision.StoredPath = NormalizePath(revision.StoredPath);
            revision.ContentType = revision.ContentType ?? string.Empty;
            revision.StoredIn = string.IsNullOrWhiteSpace(revision.StoredIn) ? "private" : revision.StoredIn;
            revision.Hash = revision.Hash ?? string.Empty;

            if (revision.RevisionId == 0)
            {
                if (revision.CreatedOnUtc == default)
                    revision.CreatedOnUtc = DateTime.UtcNow;
                _db.DocumentRevisions.Add(revision);
            }
            else
            {
                _db.DocumentRevisions.Update(revision);
            }

            _db.SaveChanges();

            var document = _db.Documents.FirstOrDefault(d => d.DocumentId == revision.DocumentId);
            if (document != null)
            {
                document.LatestRevisionId = revision.RevisionId;
                document.Title = revision.Title ?? document.Title ?? string.Empty;
                document.Summary = revision.Summary ?? document.Summary ?? string.Empty;
                document.Slug = string.IsNullOrWhiteSpace(revision.Slug) ? document.Slug : revision.Slug;
                document.Status = revision.IsPublished ? DocumentStatuses.Published : revision.Status;
                document.UpdatedOnUtc = DateTime.UtcNow;
                if (revision.CreatedByUserId > 0)
                    document.UpdatedByUserId = revision.CreatedByUserId;
                _db.SaveChanges();
            }

            return revision.RevisionId;
        }

        public void PublishRevision(int revisionId, int? publishedByUserId)
        {
            var revision = _db.DocumentRevisions.FirstOrDefault(r => r.RevisionId == revisionId);
            if (revision == null)
                return;

            var now = DateTime.UtcNow;
            var siblings = _db.DocumentRevisions.Where(r => r.DocumentId == revision.DocumentId).ToList();
            foreach (var item in siblings)
            {
                var wasPublished = item.IsPublished;
                item.IsPublished = item.RevisionId == revisionId;
                if (item.RevisionId == revisionId)
                {
                    item.Status = DocumentStatuses.Published;
                    item.PublishedByUserId = publishedByUserId;
                    item.PublishedOnUtc = now;
                }
                else if (wasPublished && item.Status == DocumentStatuses.Published)
                {
                    item.Status = DocumentStatuses.Approved;
                }
            }

            var document = _db.Documents.FirstOrDefault(d => d.DocumentId == revision.DocumentId);
            if (document != null)
            {
                document.PublishedRevisionId = revisionId;
                document.LatestRevisionId = revisionId;
                document.Status = DocumentStatuses.Published;
                document.Title = revision.Title ?? document.Title ?? string.Empty;
                document.Summary = revision.Summary ?? document.Summary ?? string.Empty;
                document.Slug = string.IsNullOrWhiteSpace(revision.Slug) ? document.Slug : revision.Slug;
                document.PublishedByUserId = publishedByUserId;
                document.PublishedOnUtc = now;
                document.UpdatedByUserId = publishedByUserId;
                document.UpdatedOnUtc = now;
            }

            _db.SaveChanges();
        }

        public DocumentMetadataInfo GetMetadata(int documentId)
        {
            return _db.DocumentMetadata.AsNoTracking()
                .FirstOrDefault(m => m.DocumentId == documentId);
        }

        public void SaveMetadata(DocumentMetadataInfo metadata)
        {
            if (metadata == null)
                throw new ArgumentNullException(nameof(metadata));

            metadata.Direction = string.IsNullOrWhiteSpace(metadata.Direction) ? DocumentDirections.Internal : metadata.Direction;
            metadata.DocumentType = metadata.DocumentType ?? string.Empty;
            metadata.RegistryNumber = metadata.RegistryNumber ?? string.Empty;
            metadata.ExternalReference = metadata.ExternalReference ?? string.Empty;
            metadata.Category = metadata.Category ?? string.Empty;
            metadata.Department = metadata.Department ?? string.Empty;
            metadata.OwnerDisplayName = metadata.OwnerDisplayName ?? string.Empty;
            metadata.SenderOrg = metadata.SenderOrg ?? string.Empty;
            metadata.RecipientOrg = metadata.RecipientOrg ?? string.Empty;
            metadata.SignerName = metadata.SignerName ?? string.Empty;
            metadata.SecurityLevel = string.IsNullOrWhiteSpace(metadata.SecurityLevel) ? DocumentSecurityLevels.Internal : metadata.SecurityLevel;
            metadata.UrgencyLevel = string.IsNullOrWhiteSpace(metadata.UrgencyLevel) ? DocumentUrgencyLevels.Normal : metadata.UrgencyLevel;
            metadata.Tags = metadata.Tags ?? string.Empty;
            metadata.Keywords = metadata.Keywords ?? string.Empty;
            metadata.Notes = metadata.Notes ?? string.Empty;
            metadata.UpdatedOnUtc = metadata.UpdatedOnUtc ?? DateTime.UtcNow;

            if (metadata.MetadataId == 0)
            {
                var existing = _db.DocumentMetadata.FirstOrDefault(m => m.DocumentId == metadata.DocumentId);
                if (existing == null)
                {
                    _db.DocumentMetadata.Add(metadata);
                }
                else
                {
                    metadata.MetadataId = existing.MetadataId;
                    _db.Entry(existing).CurrentValues.SetValues(metadata);
                }
            }
            else
            {
                _db.DocumentMetadata.Update(metadata);
            }

            _db.SaveChanges();
        }

        public void SaveAlias(DocumentAliasInfo alias)
        {
            if (alias == null)
                throw new ArgumentNullException(nameof(alias));

            alias.Slug = NormalizeSlug(alias.Slug);

            var existing = alias.AliasId > 0
                ? _db.DocumentAliases.FirstOrDefault(a => a.AliasId == alias.AliasId)
                : _db.DocumentAliases.FirstOrDefault(a =>
                    a.DocumentId == alias.DocumentId &&
                    a.PortalId == alias.PortalId &&
                    a.Slug == alias.Slug);

            if (existing == null)
            {
                if (alias.CreatedOnUtc == default)
                    alias.CreatedOnUtc = DateTime.UtcNow;
                _db.DocumentAliases.Add(alias);
            }
            else
            {
                existing.Slug = alias.Slug;
                existing.IsPrimary = alias.IsPrimary;
                existing.IsActive = alias.IsActive;
                _db.DocumentAliases.Update(existing);
            }

            _db.SaveChanges();
        }

        public List<DocumentAliasInfo> ListAliases(int documentId)
        {
            return _db.DocumentAliases.AsNoTracking()
                .Where(a => a.DocumentId == documentId)
                .OrderByDescending(a => a.IsPrimary)
                .ThenBy(a => a.Slug)
                .ToList();
        }

        public List<DocumentAssignmentInfo> ListAssignments(int documentId)
        {
            return _db.DocumentAssignments.AsNoTracking()
                .Where(a => a.DocumentId == documentId)
                .OrderByDescending(a => a.AssignedOnUtc)
                .ThenByDescending(a => a.AssignmentId)
                .ToList();
        }

        public int SaveAssignment(DocumentAssignmentInfo assignment)
        {
            if (assignment == null)
                throw new ArgumentNullException(nameof(assignment));

            assignment.AssignmentType = string.IsNullOrWhiteSpace(assignment.AssignmentType) ? DocumentAssignmentTypes.Review : assignment.AssignmentType;
            assignment.Status = string.IsNullOrWhiteSpace(assignment.Status) ? DocumentAssignmentStatuses.Pending : assignment.Status;
            assignment.AssignedToUserName = assignment.AssignedToUserName ?? string.Empty;
            assignment.AssignedRole = assignment.AssignedRole ?? string.Empty;
            assignment.AssignedDepartment = assignment.AssignedDepartment ?? string.Empty;
            assignment.AssignedByUserName = assignment.AssignedByUserName ?? string.Empty;
            assignment.Comment = assignment.Comment ?? string.Empty;
            if (assignment.AssignedOnUtc == default)
                assignment.AssignedOnUtc = DateTime.UtcNow;

            if (assignment.AssignmentId == 0)
                _db.DocumentAssignments.Add(assignment);
            else
                _db.DocumentAssignments.Update(assignment);

            _db.SaveChanges();
            return assignment.AssignmentId;
        }

        public List<DocumentCommentInfo> ListComments(int documentId, int? revisionId = null)
        {
            var query = _db.DocumentComments.AsNoTracking()
                .Where(c => c.DocumentId == documentId);
            if (revisionId.HasValue)
                query = query.Where(c => c.RevisionId == revisionId.Value);

            return query
                .OrderBy(c => c.CreatedOnUtc)
                .ThenBy(c => c.CommentId)
                .ToList();
        }

        public int SaveComment(DocumentCommentInfo comment)
        {
            if (comment == null)
                throw new ArgumentNullException(nameof(comment));

            comment.CommentType = string.IsNullOrWhiteSpace(comment.CommentType) ? DocumentCommentTypes.Comment : comment.CommentType;
            comment.Body = comment.Body ?? string.Empty;
            comment.CreatedByUserName = comment.CreatedByUserName ?? string.Empty;
            if (comment.CreatedOnUtc == default)
                comment.CreatedOnUtc = DateTime.UtcNow;

            if (comment.CommentId == 0)
                _db.DocumentComments.Add(comment);
            else
                _db.DocumentComments.Update(comment);

            _db.SaveChanges();
            return comment.CommentId;
        }

        public List<DocumentDirectiveInfo> ListDirectives(int documentId)
        {
            return _db.DocumentDirectives.AsNoTracking()
                .Where(d => d.DocumentId == documentId)
                .OrderByDescending(d => d.IssuedOnUtc)
                .ThenByDescending(d => d.DirectiveId)
                .ToList();
        }

        public int SaveDirective(DocumentDirectiveInfo directive)
        {
            if (directive == null)
                throw new ArgumentNullException(nameof(directive));

            directive.Status = string.IsNullOrWhiteSpace(directive.Status) ? DocumentDirectiveStatuses.Open : directive.Status;
            directive.DirectiveText = directive.DirectiveText ?? string.Empty;
            directive.TargetUserName = directive.TargetUserName ?? string.Empty;
            directive.TargetRole = directive.TargetRole ?? string.Empty;
            directive.IssuedByUserName = directive.IssuedByUserName ?? string.Empty;
            directive.CompletionNote = directive.CompletionNote ?? string.Empty;
            if (directive.IssuedOnUtc == default)
                directive.IssuedOnUtc = DateTime.UtcNow;

            if (directive.DirectiveId == 0)
                _db.DocumentDirectives.Add(directive);
            else
                _db.DocumentDirectives.Update(directive);

            _db.SaveChanges();
            return directive.DirectiveId;
        }

        private static string NormalizeSlug(string slug)
        {
            return (slug ?? string.Empty)
                .Trim()
                .Trim('/')
                .Replace('\\', '/');
        }

        private static string NormalizePath(string path)
        {
            return (path ?? string.Empty)
                .Trim()
                .Replace('\\', '/')
                .TrimStart('/');
        }
    }
}
