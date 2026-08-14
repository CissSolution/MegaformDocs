using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MfFileInfo = MegaForm.Core.Models.FileInfo;

namespace MegaForm.Umbraco.Data
{
    public class UmbracoDraftRepository : IDraftRepository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoDraftRepository(MegaFormDbContext db) { _db = db; }

        public int SaveDraft(SavedDraftInfo d)
        {
            if (d.DraftId == 0) _db.Drafts.Add(d);
            else _db.Drafts.Update(d);
            _db.SaveChanges();
            return d.DraftId;
        }

        public SavedDraftInfo GetDraft(string token)
            => _db.Drafts.FirstOrDefault(d => d.ResumeToken == token);

        public void DeleteDraft(string token)
        {
            var d = _db.Drafts.FirstOrDefault(x => x.ResumeToken == token);
            if (d != null) { _db.Drafts.Remove(d); _db.SaveChanges(); }
        }

        public void CleanExpiredDrafts()
        {
            _db.Drafts.RemoveRange(_db.Drafts.Where(d => d.ExpiresOnUtc < DateTime.UtcNow));
            _db.SaveChanges();
        }
    }

    public class UmbracoFileRepository : IFileRepository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoFileRepository(MegaFormDbContext db) { _db = db; }

        public int InsertFile(MfFileInfo file)
        {
            if (file.UploadedOnUtc == default)
                file.UploadedOnUtc = DateTime.UtcNow;

            file.FieldKey = file.FieldKey ?? string.Empty;
            file.OriginalName = file.OriginalName ?? string.Empty;
            file.StoredPath = file.StoredPath ?? string.Empty;
            file.ContentType = file.ContentType ?? string.Empty;

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

    public class UmbracoPhase2Repository : IPhase2Repository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoPhase2Repository(MegaFormDbContext db) { _db = db; }

        // Views
        public List<FormViewInfo> GetFormViews(int formId)
            => _db.FormViews.Where(v => v.FormId == formId).OrderBy(v => v.SortOrder).ToList();

        public int SaveFormView(FormViewInfo v)
        {
            if (v.ViewId == 0) _db.FormViews.Add(v);
            else _db.FormViews.Update(v);
            _db.SaveChanges();
            return v.ViewId;
        }

        public void DeleteFormView(int viewId)
        {
            var v = _db.FormViews.Find(viewId);
            if (v != null) { _db.FormViews.Remove(v); _db.SaveChanges(); }
        }

        // Templates
        public List<TemplateInfo> ListTemplates(int portalId, string category = null)
        {
            var q = _db.Templates.Where(t => t.PortalId == portalId || t.PortalId == -1);
            if (!string.IsNullOrEmpty(category)) q = q.Where(t => t.Category == category);
            return q.ToList();
        }

        public int SaveTemplate(TemplateInfo t)
        {
            if (t.TemplateId == 0) _db.Templates.Add(t);
            else _db.Templates.Update(t);
            _db.SaveChanges();
            return t.TemplateId;
        }

        public void DeleteTemplate(int portalId, string slug)
        {
            var t = _db.Templates.FirstOrDefault(x => x.PortalId == portalId && x.Slug == slug);
            if (t != null) { _db.Templates.Remove(t); _db.SaveChanges(); }
        }

        // Permissions
        public List<FormPermissionInfo> GetFormPermissions(int formId)
            => _db.FormPermissions.Where(p => p.FormId == formId).ToList();

        public void SaveFormPermissions(int formId, List<FormPermissionInfo> perms)
        {
            _db.FormPermissions.RemoveRange(_db.FormPermissions.Where(p => p.FormId == formId));
            foreach (var p in perms) { p.FormId = formId; _db.FormPermissions.Add(p); }
            _db.SaveChanges();
        }

        // Workflows
        public List<WorkflowInfo> GetWorkflows(int formId)
            => _db.Workflows.Where(w => w.FormId == formId).ToList();

        public int SaveWorkflow(WorkflowInfo w)
        {
            if (w.WorkflowId == 0) _db.Workflows.Add(w);
            else _db.Workflows.Update(w);
            _db.SaveChanges();
            return w.WorkflowId;
        }

        public void DeleteWorkflow(int workflowId)
        {
            var w = _db.Workflows.Find(workflowId);
            if (w != null) { _db.Workflows.Remove(w); _db.SaveChanges(); }
        }

        public long CreateWorkflowRun(int workflowId, int submissionId)
        {
            var log = new AuditLogInfo
            {
                Action = "WorkflowRun",
                EntityType = "Workflow",
                EntityId = workflowId,
                Details = $"sub={submissionId} status=running",
                Timestamp = DateTime.UtcNow,
            };
            _db.AuditLogs.Add(log); _db.SaveChanges();
            return log.LogId;
        }

        public void CompleteWorkflowRun(long runId, string status, string error)
        {
            var log = _db.AuditLogs.Find(runId);
            if (log != null) { log.Result = status; log.Details += $" err={error}"; _db.SaveChanges(); }
        }

        public void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error)
        {
            _db.AuditLogs.Add(new AuditLogInfo
            {
                Action = "WorkflowStep",
                EntityType = "WorkflowStep",
                Details = $"run={runId} step={stepId} type={stepType} out={output} err={error}",
                Result = status,
                Timestamp = DateTime.UtcNow,
            });
            _db.SaveChanges();
        }

        // Audit
        public void InsertAuditLog(AuditLogInfo log)
        {
            log.Timestamp = DateTime.UtcNow;
            _db.AuditLogs.Add(log); _db.SaveChanges();
        }

        // UniqueId
        public long IncrementUniqueId(int formId, string fieldKey, long startValue)
        {
            var row = _db.UniqueIdCounters.FirstOrDefault(x => x.FormId == formId && x.FieldKey == fieldKey);
            if (row == null)
            {
                row = new UniqueIdCounterRow { FormId = formId, FieldKey = fieldKey, Counter = startValue };
                _db.UniqueIdCounters.Add(row);
            }
            else row.Counter++;
            _db.SaveChanges();
            return row.Counter;
        }

        public long GetUniqueIdCounter(int formId, string fieldKey)
        {
            var row = _db.UniqueIdCounters.FirstOrDefault(x => x.FormId == formId && x.FieldKey == fieldKey);
            return row?.Counter ?? 0;
        }

        // Webhook log
        public void InsertWebhookLog(WebhookLogInfo log)
        {
            _db.WebhookLogs.Add(log); _db.SaveChanges();
        }

        // Rate limit
        public int GetRecentSubmissionCount(string ip, int windowMinutes)
        {
            var since = DateTime.UtcNow.AddMinutes(-windowMinutes);
            return _db.RateLimits.Count(r => r.IpAddress == ip && r.CreatedUtc >= since);
        }

        public void InsertRateLimitEntry(string ip, int formId)
        {
            _db.RateLimits.Add(new RateLimitRow { IpAddress = ip, FormId = formId, CreatedUtc = DateTime.UtcNow });
            _db.SaveChanges();
        }

        // App foundation
        public List<string> GetAppScopes(int portalId)
        {
            return _db.AppDefinitions
                .Where(a => a.PortalId == portalId || portalId == 0)
                .Select(a => a.AppScope)
                .Where(s => !string.IsNullOrEmpty(s))
                .Distinct()
                .ToList();
        }

        public List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null)
        {
            var q = _db.AppDefinitions.AsQueryable();
            if (portalId > 0) q = q.Where(a => a.PortalId == portalId);
            if (!string.IsNullOrEmpty(appScope)) q = q.Where(a => a.AppScope == appScope);
            return q.OrderBy(a => a.SortOrder).ThenBy(a => a.AppName).ToList();
        }

        public AppDefinitionInfo GetAppDefinition(int portalId, string appKey)
        {
            return _db.AppDefinitions
                .FirstOrDefault(a => a.PortalId == portalId && a.AppKey == appKey)
                ?? _db.AppDefinitions.FirstOrDefault(a => a.AppKey == appKey);
        }

        public int SaveAppDefinition(AppDefinitionInfo app)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));
            if (app.AppId == 0) { app.CreatedOnUtc = DateTime.UtcNow; _db.AppDefinitions.Add(app); }
            else { app.ModifiedOnUtc = DateTime.UtcNow; _db.AppDefinitions.Update(app); }
            _db.SaveChanges();
            return app.AppId;
        }

        public void DeleteAppDefinition(int appId)
        {
            var a = _db.AppDefinitions.Find(appId);
            if (a != null)
            {
                var queries = _db.AppQueries.Where(q => q.AppId == appId);
                _db.AppQueries.RemoveRange(queries);
                _db.AppDefinitions.Remove(a);
                _db.SaveChanges();
            }
        }

        public List<AppQueryDefinitionInfo> ListAppQueries(int appId)
        {
            return _db.AppQueries.Where(q => q.AppId == appId).OrderBy(q => q.SortOrder).ThenBy(q => q.QueryName).ToList();
        }

        public AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey)
        {
            return _db.AppQueries.FirstOrDefault(q => q.AppId == appId && q.QueryKey == queryKey);
        }

        public int SaveAppQuery(AppQueryDefinitionInfo query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));
            if (query.QueryId == 0) { query.CreatedOnUtc = DateTime.UtcNow; _db.AppQueries.Add(query); }
            else { query.ModifiedOnUtc = DateTime.UtcNow; _db.AppQueries.Update(query); }
            _db.SaveChanges();
            return query.QueryId;
        }

        public void DeleteAppQuery(int queryId)
        {
            var q = _db.AppQueries.Find(queryId);
            if (q != null) { _db.AppQueries.Remove(q); _db.SaveChanges(); }
        }

        // Relations
        public List<FormRelationInfo> GetFormRelations(int formId)
        {
            return _db.FormRelations.Where(r => r.ParentFormId == formId || r.ChildFormId == formId).ToList();
        }

        public int SaveFormRelation(FormRelationInfo relation)
        {
            if (relation == null) throw new ArgumentNullException(nameof(relation));
            if (relation.RelationId == 0) _db.FormRelations.Add(relation);
            else _db.FormRelations.Update(relation);
            _db.SaveChanges();
            return relation.RelationId;
        }

        public void DeleteFormRelation(int relationId)
        {
            var r = _db.FormRelations.Find(relationId);
            if (r != null)
            {
                _db.SubmissionLinks.RemoveRange(_db.SubmissionLinks.Where(l => l.RelationId == relationId));
                _db.FormRelations.Remove(r);
                _db.SaveChanges();
            }
        }

        public void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId)
        {
            var exists = _db.SubmissionLinks.Any(l =>
                l.RelationId == relationId &&
                l.ParentSubmissionId == parentSubmissionId &&
                l.ChildSubmissionId == childSubmissionId);
            if (!exists)
            {
                _db.SubmissionLinks.Add(new SubmissionLinkInfo
                {
                    RelationId = relationId,
                    ParentSubmissionId = parentSubmissionId,
                    ChildSubmissionId = childSubmissionId,
                    CreatedOnUtc = DateTime.UtcNow
                });
                _db.SaveChanges();
            }
        }

        public (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50)
        {
            var q = _db.SubmissionLinks.Where(l => l.ParentSubmissionId == parentSubmissionId);
            if (relationId.HasValue) q = q.Where(l => l.RelationId == relationId.Value);
            var childIds = q.Select(l => l.ChildSubmissionId).Distinct().ToList();
            var items = _db.Submissions.AsNoTracking()
                .Where(s => childIds.Contains(s.SubmissionId))
                .OrderByDescending(s => s.SubmissionId)
                .Skip((page - 1) * pageSize).Take(pageSize)
                .ToList();
            return (items, childIds.Count);
        }
    }

    public class UmbracoDocumentRepository : IDocumentRepository
    {
        private readonly MegaFormDbContext _db;
        public UmbracoDocumentRepository(MegaFormDbContext db) { _db = db; }

        public DocumentInfo GetDocument(int documentId)
            => _db.Documents.AsNoTracking().FirstOrDefault(d => d.DocumentId == documentId);

        public DocumentInfo GetDocumentBySlug(int portalId, string slug, string appScope = null)
        {
            if (string.IsNullOrWhiteSpace(slug)) return null;
            var normalizedSlug = NormalizeSlug(slug);
            if (string.IsNullOrWhiteSpace(normalizedSlug)) return null;

            var documents = _db.Documents.AsNoTracking().AsQueryable();
            if (portalId > 0) documents = documents.Where(d => d.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope)) documents = documents.Where(d => d.AppScope == appScope);

            var direct = documents.FirstOrDefault(d => d.Slug == normalizedSlug);
            if (direct != null) return direct;

            var aliases = _db.DocumentAliases.AsNoTracking()
                .Where(a => a.IsActive && a.Slug == normalizedSlug);
            if (portalId > 0) aliases = aliases.Where(a => a.PortalId == portalId);

            var documentIds = aliases.Select(a => a.DocumentId).Distinct().ToList();
            if (documentIds.Count == 0) return null;

            return documents.FirstOrDefault(d => documentIds.Contains(d.DocumentId));
        }

        public (List<DocumentInfo> Items, int TotalCount) ListDocuments(
            int portalId, string appScope = null, string status = null, string search = null,
            int pageIndex = 0, int pageSize = 50)
        {
            var query = _db.Documents.AsNoTracking().AsQueryable();
            if (portalId > 0) query = query.Where(d => d.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope)) query = query.Where(d => d.AppScope == appScope);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(d => d.Status == status);
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
            if (pageSize <= 0) return (ordered.ToList(), total);
            if (pageIndex < 0) pageIndex = 0;
            if (pageSize > 250) pageSize = 250;

            return (ordered.Skip(pageIndex * pageSize).Take(pageSize).ToList(), total);
        }

        public int SaveDocument(DocumentInfo document)
        {
            if (document == null) throw new ArgumentNullException(nameof(document));
            document.AppScope = document.AppScope ?? string.Empty;
            document.Slug = NormalizeSlug(document.Slug);
            document.Title = document.Title ?? string.Empty;
            document.Summary = document.Summary ?? string.Empty;
            document.Status = string.IsNullOrWhiteSpace(document.Status) ? DocumentStatuses.Draft : document.Status;

            if (document.DocumentId == 0)
            {
                if (document.CreatedOnUtc == default) document.CreatedOnUtc = DateTime.UtcNow;
                _db.Documents.Add(document);
            }
            else
            {
                if (!document.UpdatedOnUtc.HasValue) document.UpdatedOnUtc = DateTime.UtcNow;
                _db.Documents.Update(document);
            }
            _db.SaveChanges();
            return document.DocumentId;
        }

        public DocumentRevisionInfo GetRevision(int revisionId)
            => _db.DocumentRevisions.AsNoTracking().FirstOrDefault(r => r.RevisionId == revisionId);

        public DocumentRevisionInfo GetRevisionBySubmission(int submissionId)
            => _db.DocumentRevisions.AsNoTracking().FirstOrDefault(r => r.SubmissionId == submissionId);

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
            if (revision == null) throw new ArgumentNullException(nameof(revision));
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
                if (revision.CreatedOnUtc == default) revision.CreatedOnUtc = DateTime.UtcNow;
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
                if (revision.CreatedByUserId > 0) document.UpdatedByUserId = revision.CreatedByUserId;
                _db.SaveChanges();
            }
            return revision.RevisionId;
        }

        public void PublishRevision(int revisionId, int? publishedByUserId)
        {
            var revision = _db.DocumentRevisions.FirstOrDefault(r => r.RevisionId == revisionId);
            if (revision == null) return;

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
            => _db.DocumentMetadata.AsNoTracking().FirstOrDefault(m => m.DocumentId == documentId);

        public void SaveMetadata(DocumentMetadataInfo metadata)
        {
            if (metadata == null) throw new ArgumentNullException(nameof(metadata));
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
            if (alias == null) throw new ArgumentNullException(nameof(alias));
            alias.Slug = NormalizeSlug(alias.Slug);

            var existing = alias.AliasId > 0
                ? _db.DocumentAliases.FirstOrDefault(a => a.AliasId == alias.AliasId)
                : _db.DocumentAliases.FirstOrDefault(a =>
                    a.DocumentId == alias.DocumentId &&
                    a.PortalId == alias.PortalId &&
                    a.Slug == alias.Slug);

            if (existing == null)
            {
                if (alias.CreatedOnUtc == default) alias.CreatedOnUtc = DateTime.UtcNow;
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
            if (assignment == null) throw new ArgumentNullException(nameof(assignment));
            assignment.AssignmentType = string.IsNullOrWhiteSpace(assignment.AssignmentType) ? DocumentAssignmentTypes.Review : assignment.AssignmentType;
            assignment.Status = string.IsNullOrWhiteSpace(assignment.Status) ? DocumentAssignmentStatuses.Pending : assignment.Status;
            assignment.AssignedToUserName = assignment.AssignedToUserName ?? string.Empty;
            assignment.AssignedRole = assignment.AssignedRole ?? string.Empty;
            assignment.AssignedDepartment = assignment.AssignedDepartment ?? string.Empty;
            assignment.AssignedByUserName = assignment.AssignedByUserName ?? string.Empty;
            assignment.Comment = assignment.Comment ?? string.Empty;
            if (assignment.AssignedOnUtc == default) assignment.AssignedOnUtc = DateTime.UtcNow;

            if (assignment.AssignmentId == 0) _db.DocumentAssignments.Add(assignment);
            else _db.DocumentAssignments.Update(assignment);
            _db.SaveChanges();
            return assignment.AssignmentId;
        }

        public List<DocumentCommentInfo> ListComments(int documentId, int? revisionId = null)
        {
            var query = _db.DocumentComments.AsNoTracking().Where(c => c.DocumentId == documentId);
            if (revisionId.HasValue) query = query.Where(c => c.RevisionId == revisionId.Value);
            return query.OrderBy(c => c.CreatedOnUtc).ThenBy(c => c.CommentId).ToList();
        }

        public int SaveComment(DocumentCommentInfo comment)
        {
            if (comment == null) throw new ArgumentNullException(nameof(comment));
            comment.CommentType = string.IsNullOrWhiteSpace(comment.CommentType) ? DocumentCommentTypes.Comment : comment.CommentType;
            comment.Body = comment.Body ?? string.Empty;
            comment.CreatedByUserName = comment.CreatedByUserName ?? string.Empty;
            if (comment.CreatedOnUtc == default) comment.CreatedOnUtc = DateTime.UtcNow;

            if (comment.CommentId == 0) _db.DocumentComments.Add(comment);
            else _db.DocumentComments.Update(comment);
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
            if (directive == null) throw new ArgumentNullException(nameof(directive));
            directive.Status = string.IsNullOrWhiteSpace(directive.Status) ? DocumentDirectiveStatuses.Open : directive.Status;
            directive.DirectiveText = directive.DirectiveText ?? string.Empty;
            directive.TargetUserName = directive.TargetUserName ?? string.Empty;
            directive.TargetRole = directive.TargetRole ?? string.Empty;
            directive.IssuedByUserName = directive.IssuedByUserName ?? string.Empty;
            directive.CompletionNote = directive.CompletionNote ?? string.Empty;
            if (directive.IssuedOnUtc == default) directive.IssuedOnUtc = DateTime.UtcNow;

            if (directive.DirectiveId == 0) _db.DocumentDirectives.Add(directive);
            else _db.DocumentDirectives.Update(directive);
            _db.SaveChanges();
            return directive.DirectiveId;
        }

        private static string NormalizeSlug(string slug)
        {
            return (slug ?? string.Empty).Trim().Trim('/').Replace('\\', '/');
        }

        private static string NormalizePath(string path)
        {
            return (path ?? string.Empty).Trim().Replace('\\', '/').TrimStart('/');
        }
    }
}
