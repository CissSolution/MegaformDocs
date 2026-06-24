using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared document/revision orchestration on top of submissions and workflow statuses.
    /// Hosts only provide repository/storage/auth shells around this logic.
    /// </summary>
    public class DocumentRevisionService
    {
        private readonly IDocumentRepository _repo;
        private readonly ILogService _log;
        private readonly AppProfileService _appProfiles;

        public DocumentRevisionService(IDocumentRepository repo, ILogService log = null, AppProfileService appProfiles = null)
        {
            _repo = repo;
            _log = log;
            _appProfiles = appProfiles;
        }

        public DocumentRevisionInfo UpsertFromSubmission(
            FormInfo form,
            SubmissionInfo submission,
            FormSchema schema,
            Dictionary<string, object> formData,
            bool hasAppliedWorkflow)
        {
            if (_repo == null || !IsDocumentScope(form))
                return null;
            if (submission == null || formData == null)
                return null;

            var upload = ExtractFirstUpload(schema, formData);
            if (upload == null || string.IsNullOrWhiteSpace(upload.StoredPath))
                return null;

            var projection = _appProfiles != null
                ? _appProfiles.Project(form, schema, submission, formData)
                : null;

            var title = projection != null ? projection.Title : string.Empty;
            if (string.IsNullOrWhiteSpace(title))
            {
                title = ResolveFirstString(formData, "title", "documentTitle", "document_title", "name");
                if (string.IsNullOrWhiteSpace(title))
                {
                    title = !string.IsNullOrWhiteSpace(upload.OriginalName)
                        ? System.IO.Path.GetFileNameWithoutExtension(upload.OriginalName)
                        : "Untitled Document";
                }
            }

            var slug = projection != null ? projection.Slug : string.Empty;
            if (string.IsNullOrWhiteSpace(slug))
            {
                slug = ResolveFirstString(formData, "slug", "documentSlug", "document_slug", "urlSlug");
                if (string.IsNullOrWhiteSpace(slug))
                    slug = Slugify(title);
            }

            var summary = projection != null ? projection.Summary : string.Empty;
            if (string.IsNullOrWhiteSpace(summary))
                summary = ResolveFirstString(formData, "summary", "description", "documentSummary", "document_summary");
            var revisionStatus = hasAppliedWorkflow ? DocumentStatuses.PendingApproval : DocumentStatuses.Draft;

            var document = _repo.GetDocumentBySlug(form.PortalId, slug, form.AppScope);
            if (document == null)
            {
                document = new DocumentInfo
                {
                    PortalId = form.PortalId,
                    AppScope = form.AppScope ?? string.Empty,
                    Slug = slug,
                    Title = title,
                    Summary = summary ?? string.Empty,
                    Status = revisionStatus,
                    CreatedByUserId = submission.UserId ?? form.CreatedByUserId,
                    UpdatedByUserId = submission.UserId
                };
                document.DocumentId = _repo.SaveDocument(document);
                _repo.SaveAlias(new DocumentAliasInfo
                {
                    DocumentId = document.DocumentId,
                    PortalId = document.PortalId,
                    Slug = slug,
                    IsPrimary = true,
                    IsActive = true
                });
            }

            var revision = _repo.GetRevisionBySubmission(submission.SubmissionId) ?? new DocumentRevisionInfo();
            if (revision.RevisionId == 0)
            {
                var latest = _repo.GetLatestRevision(document.DocumentId);
                revision.VersionNumber = latest != null ? latest.VersionNumber + 1 : 1;
                revision.CreatedByUserId = submission.UserId ?? form.CreatedByUserId;
            }

            revision.DocumentId = document.DocumentId;
            revision.FormId = form.FormId;
            revision.SubmissionId = submission.SubmissionId;
            revision.Status = revisionStatus;
            revision.Title = title;
            revision.Summary = summary ?? string.Empty;
            revision.Slug = slug;
            revision.OriginalName = upload.OriginalName ?? string.Empty;
            revision.StoredPath = upload.StoredPath ?? string.Empty;
            revision.ContentType = upload.ContentType ?? string.Empty;
            revision.FileSizeBytes = upload.FileSizeBytes;
            revision.StoredIn = upload.StoredIn ?? "private";
            revision.Hash = upload.Hash ?? string.Empty;
            revision.IsPublished = false;
            revision.RevisionId = _repo.SaveRevision(revision);
            UpsertMetadataFromSubmission(form, document, submission, formData);
            return revision;
        }

        public void SyncWorkflowStatus(int submissionId, string status, int? actorUserId)
        {
            if (_repo == null || submissionId <= 0 || string.IsNullOrWhiteSpace(status))
                return;

            var revision = _repo.GetRevisionBySubmission(submissionId);
            if (revision == null)
                return;

            var normalized = NormalizeStatus(status);
            if (string.Equals(normalized, DocumentStatuses.Published, StringComparison.OrdinalIgnoreCase))
            {
                _repo.PublishRevision(revision.RevisionId, actorUserId);
                return;
            }

            revision.Status = normalized;
            _repo.SaveRevision(revision);
        }

        private bool IsDocumentScope(FormInfo form)
        {
            if (form == null)
                return false;
            if (_appProfiles != null)
            {
                var resolved = _appProfiles.Resolve(form, null);
                if (resolved != null && resolved.Profile != null && resolved.Profile.EnableDocumentRegistry)
                    return true;
            }
            var scope = (form != null ? form.AppScope : null) ?? string.Empty;
            scope = scope.Trim().ToLowerInvariant();
            return scope == "document" || scope == "documents" || scope == "document-management";
        }

        private static string NormalizeStatus(string status)
        {
            var value = (status ?? string.Empty).Trim().ToLowerInvariant();
            if (value == DocumentStatuses.Published) return DocumentStatuses.Published;
            if (value == DocumentStatuses.Approved) return DocumentStatuses.Approved;
            if (value == DocumentStatuses.Rejected) return DocumentStatuses.Rejected;
            if (value == DocumentStatuses.PendingApproval) return DocumentStatuses.PendingApproval;
            return DocumentStatuses.Draft;
        }

        private static string ResolveFirstString(Dictionary<string, object> formData, params string[] keys)
        {
            if (formData == null || keys == null) return string.Empty;
            foreach (var key in keys)
            {
                if (string.IsNullOrWhiteSpace(key)) continue;
                object raw;
                if (!TryGetValue(formData, key, out raw)) continue;
                var value = ConvertToString(raw);
                if (!string.IsNullOrWhiteSpace(value)) return value;
            }
            return string.Empty;
        }

        private static bool TryGetValue(Dictionary<string, object> formData, string key, out object value)
        {
            value = null;
            if (formData == null || string.IsNullOrWhiteSpace(key)) return false;
            if (formData.TryGetValue(key, out value)) return true;

            var match = formData.FirstOrDefault(kvp => string.Equals(kvp.Key ?? string.Empty, key, StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(match.Key))
            {
                value = match.Value;
                return true;
            }

            return false;
        }

        private static string ConvertToString(object raw)
        {
            if (raw == null) return string.Empty;
            if (raw is string s) return s.Trim();
            if (raw is JValue jv) return (jv.ToString() ?? string.Empty).Trim();
            return Convert.ToString(raw, CultureInfo.InvariantCulture) ?? string.Empty;
        }

        private static UploadedDocumentFile ExtractFirstUpload(FormSchema schema, Dictionary<string, object> formData)
        {
            var fileKeys = new List<string>();
            if (schema != null && schema.Fields != null)
            {
                fileKeys.AddRange(MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f != null && IsFileFieldType(f.Type))
                    .Select(f => f.Key)
                    .Where(k => !string.IsNullOrWhiteSpace(k)));
            }

            foreach (var key in fileKeys)
            {
                object raw;
                if (TryGetValue(formData, key, out raw))
                {
                    var uploaded = ParseUpload(raw);
                    if (uploaded != null) return uploaded;
                }
            }

            foreach (var kvp in formData)
            {
                var uploaded = ParseUpload(kvp.Value);
                if (uploaded != null) return uploaded;
            }

            return null;
        }

        private static bool IsFileFieldType(string type)
        {
            var value = (type ?? string.Empty).Trim().ToLowerInvariant();
            return value == "file" || value == "fileupload";
        }

        private static UploadedDocumentFile ParseUpload(object raw)
        {
            var token = ToToken(raw);
            if (token == null) return null;

            if (token.Type == JTokenType.Array)
            {
                foreach (var item in token.Children())
                {
                    var parsed = ParseUploadToken(item);
                    if (parsed != null) return parsed;
                }
                return null;
            }

            return ParseUploadToken(token);
        }

        private static UploadedDocumentFile ParseUploadToken(JToken token)
        {
            if (token == null || token.Type != JTokenType.Object)
                return null;

            var path = ReadString(token, "tempPath", "filePath", "storedPath", "path");
            if (string.IsNullOrWhiteSpace(path))
                return null;

            return new UploadedDocumentFile
            {
                StoredPath = path.Replace('\\', '/').TrimStart('/'),
                OriginalName = ReadString(token, "fileName", "originalName", "name"),
                ContentType = ReadString(token, "contentType", "mimeType"),
                StoredIn = ReadString(token, "storedIn", "storage"),
                Hash = ReadString(token, "hash", "checksum"),
                FileSizeBytes = ReadLong(token, "fileSize", "size", "length")
            };
        }

        private static JToken ToToken(object raw)
        {
            if (raw == null) return null;
            if (raw is JToken token) return token;
            if (raw is string s)
            {
                s = s.Trim();
                if (string.IsNullOrWhiteSpace(s)) return null;
                if (!s.StartsWith("[", StringComparison.Ordinal) && !s.StartsWith("{", StringComparison.Ordinal))
                    return null;
                try { return JToken.Parse(s); }
                catch { return null; }
            }

            try { return JToken.FromObject(raw); }
            catch { return null; }
        }

        private static string ReadString(JToken token, params string[] keys)
        {
            foreach (var key in keys)
            {
                var value = token[key];
                if (value == null) continue;
                var text = (value.ToString() ?? string.Empty).Trim();
                if (!string.IsNullOrWhiteSpace(text)) return text;
            }
            return string.Empty;
        }

        private static long ReadLong(JToken token, params string[] keys)
        {
            foreach (var key in keys)
            {
                var value = token[key];
                if (value == null) continue;
                long parsed;
                if (long.TryParse(value.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                    return parsed;
            }
            return 0L;
        }

        private static string Slugify(string value)
        {
            var slug = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (slug.Length == 0) slug = "document";
            slug = Regex.Replace(slug, @"[^a-z0-9]+", "-");
            slug = slug.Trim('-');
            return slug.Length > 0 ? slug : "document";
        }

        private void UpsertMetadataFromSubmission(FormInfo form, DocumentInfo document, SubmissionInfo submission, Dictionary<string, object> formData)
        {
            if (document == null || formData == null)
                return;

            var metadata = _repo.GetMetadata(document.DocumentId) ?? new DocumentMetadataInfo
            {
                DocumentId = document.DocumentId,
                PortalId = form != null ? form.PortalId : 0
            };

            metadata.Direction = NormalizeDirection(ResolveFirstString(formData,
                "direction", "documentDirection", "incomingOutgoing", "document_direction"), metadata.Direction);
            metadata.DocumentType = FirstNonEmpty(metadata.DocumentType,
                ResolveFirstString(formData, "documentType", "document_type", "type"));
            metadata.RegistryNumber = FirstNonEmpty(metadata.RegistryNumber,
                ResolveFirstString(formData, "registryNumber", "documentNumber", "documentNo", "referenceNo"));
            metadata.ExternalReference = FirstNonEmpty(metadata.ExternalReference,
                ResolveFirstString(formData, "externalReference", "externalRef", "reference"));
            metadata.Category = FirstNonEmpty(metadata.Category,
                ResolveFirstString(formData, "category", "documentCategory", "document_category"));
            metadata.Department = FirstNonEmpty(metadata.Department,
                ResolveFirstString(formData, "department", "unit", "assignedDepartment"));
            metadata.OwnerUserId = submission != null && submission.UserId.HasValue
                ? submission.UserId.Value
                : metadata.OwnerUserId;
            metadata.OwnerDisplayName = FirstNonEmpty(metadata.OwnerDisplayName,
                ResolveFirstString(formData, "owner", "ownerName", "createdBy", "author"));
            metadata.SenderOrg = FirstNonEmpty(metadata.SenderOrg,
                ResolveFirstString(formData, "senderOrg", "sender", "fromOrg", "issuingOrg"));
            metadata.RecipientOrg = FirstNonEmpty(metadata.RecipientOrg,
                ResolveFirstString(formData, "recipientOrg", "recipient", "toOrg"));
            metadata.SignerName = FirstNonEmpty(metadata.SignerName,
                ResolveFirstString(formData, "signerName", "signer", "signedBy"));
            metadata.SecurityLevel = NormalizeSecurityLevel(ResolveFirstString(formData,
                "securityLevel", "security", "confidentiality"), metadata.SecurityLevel);
            metadata.UrgencyLevel = NormalizeUrgencyLevel(ResolveFirstString(formData,
                "urgencyLevel", "urgency", "priority"), metadata.UrgencyLevel);
            metadata.IssuedOnUtc = FirstDate(metadata.IssuedOnUtc, ResolveFirstDate(formData,
                "issuedOn", "issuedDate", "documentDate"));
            metadata.ReceivedOnUtc = FirstDate(metadata.ReceivedOnUtc, ResolveFirstDate(formData,
                "receivedOn", "receivedDate", "arrivalDate"));
            metadata.EffectiveOnUtc = FirstDate(metadata.EffectiveOnUtc, ResolveFirstDate(formData,
                "effectiveOn", "effectiveDate"));
            metadata.DueOnUtc = FirstDate(metadata.DueOnUtc, ResolveFirstDate(formData,
                "dueOn", "dueDate", "deadline"));
            metadata.Tags = FirstNonEmpty(metadata.Tags,
                ResolveFirstString(formData, "tags", "keywordsCsv"));
            metadata.Keywords = FirstNonEmpty(metadata.Keywords,
                ResolveFirstString(formData, "keywords", "searchKeywords"));
            metadata.Notes = FirstNonEmpty(metadata.Notes,
                ResolveFirstString(formData, "notes", "memo", "registryNotes"));
            metadata.UpdatedByUserId = submission != null ? submission.UserId : metadata.UpdatedByUserId;
            metadata.UpdatedOnUtc = DateTime.UtcNow;

            _repo.SaveMetadata(metadata);
        }

        private static string FirstNonEmpty(string current, string candidate)
        {
            return string.IsNullOrWhiteSpace(candidate) ? (current ?? string.Empty) : candidate;
        }

        private static DateTime? FirstDate(DateTime? current, DateTime? candidate)
        {
            return candidate ?? current;
        }

        private static DateTime? ResolveFirstDate(Dictionary<string, object> formData, params string[] keys)
        {
            if (formData == null || keys == null)
                return null;

            foreach (var key in keys)
            {
                object raw;
                if (!TryGetValue(formData, key, out raw))
                    continue;

                DateTime parsed;
                if (TryConvertToDate(raw, out parsed))
                    return DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
            }

            return null;
        }

        private static bool TryConvertToDate(object raw, out DateTime value)
        {
            value = default;
            if (raw == null)
                return false;

            if (raw is DateTime dt)
            {
                value = dt;
                return true;
            }

            var text = ConvertToString(raw);
            if (string.IsNullOrWhiteSpace(text))
                return false;

            return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value)
                || DateTime.TryParse(text, CultureInfo.CurrentCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out value);
        }

        private static string NormalizeDirection(string raw, string fallback)
        {
            var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
            if (value == DocumentDirections.Incoming || value == "in") return DocumentDirections.Incoming;
            if (value == DocumentDirections.Outgoing || value == "out") return DocumentDirections.Outgoing;
            if (value == DocumentDirections.Internal) return DocumentDirections.Internal;
            return string.IsNullOrWhiteSpace(fallback) ? DocumentDirections.Internal : fallback;
        }

        private static string NormalizeSecurityLevel(string raw, string fallback)
        {
            var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
            if (value == DocumentSecurityLevels.Public) return DocumentSecurityLevels.Public;
            if (value == DocumentSecurityLevels.Internal) return DocumentSecurityLevels.Internal;
            if (value == DocumentSecurityLevels.Confidential) return DocumentSecurityLevels.Confidential;
            if (value == DocumentSecurityLevels.Secret) return DocumentSecurityLevels.Secret;
            return string.IsNullOrWhiteSpace(fallback) ? DocumentSecurityLevels.Internal : fallback;
        }

        private static string NormalizeUrgencyLevel(string raw, string fallback)
        {
            var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
            if (value == DocumentUrgencyLevels.Normal) return DocumentUrgencyLevels.Normal;
            if (value == DocumentUrgencyLevels.Urgent) return DocumentUrgencyLevels.Urgent;
            if (value == DocumentUrgencyLevels.VeryUrgent || value == "very urgent") return DocumentUrgencyLevels.VeryUrgent;
            return string.IsNullOrWhiteSpace(fallback) ? DocumentUrgencyLevels.Normal : fallback;
        }

        private sealed class UploadedDocumentFile
        {
            public string StoredPath { get; set; }
            public string OriginalName { get; set; }
            public string ContentType { get; set; }
            public long FileSizeBytes { get; set; }
            public string StoredIn { get; set; }
            public string Hash { get; set; }
        }
    }
}
