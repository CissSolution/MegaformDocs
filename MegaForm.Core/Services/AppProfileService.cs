using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared app-profile and record-projection resolver.
    /// Keeps Web / DNN / Oqtane on the same canonical interpretation of form intent.
    /// </summary>
    public class AppProfileService
    {
        public AppProjectionDefinition Resolve(FormInfo form, FormSchema schema = null)
        {
            var scope = NormalizeScope(form != null ? form.AppScope : null);
            var projection = BuildDefaults(scope, schema, form);
            var settings = ParseObject(form != null ? form.SettingsJson : null);

            OverlayProfile(projection.Profile, FirstObject(settings, "appProfile", "AppProfile"));
            OverlayProjection(projection, FirstObject(settings, "appProjection", "AppProjection", "recordProjection", "RecordProjection"));
            projection.Profile.Scope = NormalizeScope(projection.Profile.Scope);

            if (string.IsNullOrWhiteSpace(projection.Profile.DisplayName))
                projection.Profile.DisplayName = BuildDisplayName(projection.Profile.Scope);
            if (string.IsNullOrWhiteSpace(projection.Profile.EntitySingular))
                projection.Profile.EntitySingular = "Record";
            if (string.IsNullOrWhiteSpace(projection.Profile.EntityPlural))
                projection.Profile.EntityPlural = projection.Profile.EntitySingular + "s";

            projection.TitleField = PickField(schema, projection.TitleField, "title", "documentTitle", "document_title", "name", "subject");
            projection.SummaryField = PickField(schema, projection.SummaryField, "summary", "description", "documentSummary", "reason");
            projection.OwnerField = PickField(schema, projection.OwnerField, "owner", "requester", "employeeId", "ownerId");
            projection.OwnerDisplayField = PickField(schema, projection.OwnerDisplayField, "ownerName", "owner", "requesterName", "employeeName", "fullName", "createdBy", "author");
            projection.DepartmentField = PickField(schema, projection.DepartmentField, "department", "unit", "team");
            projection.DueDateField = PickField(schema, projection.DueDateField, "dueOn", "dueDate", "deadline", "approverDueOn");
            projection.StatusField = PickField(schema, projection.StatusField, "status", "requestStatus");
            projection.CategoryField = PickField(schema, projection.CategoryField, "category", "type", "documentType", "leaveType");
            projection.KeywordsField = PickField(schema, projection.KeywordsField, "keywords", "tags");
            projection.SlugField = PickField(schema, projection.SlugField, "slug", "documentSlug", "document_slug", "urlSlug");
            projection.RegistryNumberField = PickField(schema, projection.RegistryNumberField, "registryNumber", "documentNumber", "documentNo", "referenceNo");
            projection.DirectionField = PickField(schema, projection.DirectionField, "direction", "documentDirection", "incomingOutgoing", "document_direction");
            projection.DocumentTypeField = PickField(schema, projection.DocumentTypeField, "documentType", "document_type", "type");
            return projection;
        }

        public RecordProjectionInfo Project(FormInfo form, FormSchema schema, SubmissionInfo submission, IDictionary<string, object> formData)
        {
            var definition = Resolve(form, schema);
            var result = new RecordProjectionInfo
            {
                SubmissionId = submission != null ? submission.SubmissionId : 0,
                FormId = form != null ? form.FormId : 0,
                Profile = definition.Profile,
                Definition = definition
            };

            result.Title = FirstNonEmpty(
                RenderTemplate(definition.TitleTemplate, formData),
                ReadValue(formData, definition.TitleField),
                ReadValue(formData, "title"),
                ReadValue(formData, "name"),
                ReadValue(formData, "subject"));

            result.Summary = FirstNonEmpty(
                RenderTemplate(definition.SummaryTemplate, formData),
                ReadValue(formData, definition.SummaryField),
                ReadValue(formData, "summary"),
                ReadValue(formData, "description"),
                ReadValue(formData, "reason"));

            result.Owner = FirstNonEmpty(
                ReadValue(formData, definition.OwnerDisplayField),
                ReadValue(formData, definition.OwnerField),
                ReadValue(formData, "owner"),
                ReadValue(formData, "requester"),
                ReadValue(formData, "employeeName"),
                ReadValue(formData, "createdBy"));

            result.Department = FirstNonEmpty(
                ReadValue(formData, definition.DepartmentField),
                ReadValue(formData, "department"),
                ReadValue(formData, "unit"));

            result.Status = FirstNonEmpty(
                ReadValue(formData, definition.StatusField),
                submission != null ? submission.Status : null,
                "submitted");

            result.Category = FirstNonEmpty(
                ReadValue(formData, definition.CategoryField),
                ReadValue(formData, "category"),
                ReadValue(formData, "type"));

            result.Keywords = FirstNonEmpty(
                ReadValue(formData, definition.KeywordsField),
                ReadValue(formData, "keywords"),
                ReadValue(formData, "tags"));

            result.Slug = FirstNonEmpty(
                ReadValue(formData, definition.SlugField),
                ReadValue(formData, "slug"),
                ReadValue(formData, "urlSlug"));

            result.RegistryNumber = FirstNonEmpty(
                ReadValue(formData, definition.RegistryNumberField),
                ReadValue(formData, "registryNumber"));

            result.Direction = FirstNonEmpty(
                ReadValue(formData, definition.DirectionField),
                ReadValue(formData, "direction"),
                definition.Profile.EnableDocumentRegistry ? DocumentDirections.Internal : string.Empty);

            result.DocumentType = FirstNonEmpty(
                ReadValue(formData, definition.DocumentTypeField),
                ReadValue(formData, "documentType"),
                ReadValue(formData, "type"));

            result.DueOnUtc = FirstDate(
                ReadDate(formData, definition.DueDateField),
                ReadDate(formData, "dueOn"),
                ReadDate(formData, "dueDate"),
                ReadDate(formData, "deadline"));

            if (string.IsNullOrWhiteSpace(result.Title))
            {
                var baseTitle = form != null && !string.IsNullOrWhiteSpace(form.Title)
                    ? form.Title
                    : result.Profile.EntitySingular;
                result.Title = baseTitle + " #" + (submission != null ? submission.SubmissionId.ToString(CultureInfo.InvariantCulture) : "0");
            }

            if (string.IsNullOrWhiteSpace(result.Summary) && !string.IsNullOrWhiteSpace(result.Category))
                result.Summary = result.Category;

            return result;
        }

        private static AppProjectionDefinition BuildDefaults(string scope, FormSchema schema, FormInfo form)
        {
            var projection = new AppProjectionDefinition();
            projection.Profile.Scope = scope;

            if (scope == AppProfileScopes.Documents)
            {
                projection.Profile.DisplayName = "Documents";
                projection.Profile.EntitySingular = "Document";
                projection.Profile.EntityPlural = "Documents";
                projection.Profile.EnableDirectives = true;
                projection.Profile.EnableDocumentRegistry = true;
                projection.Profile.EnableStablePublicUrl = true;
                projection.TitleField = PickField(schema, null, "title", "documentTitle", "document_title", "name");
                projection.SummaryField = PickField(schema, null, "summary", "description", "documentSummary", "document_summary");
                projection.OwnerDisplayField = PickField(schema, null, "ownerName", "owner", "createdBy", "author");
                projection.DepartmentField = PickField(schema, null, "department", "unit", "assignedDepartment");
                projection.DueDateField = PickField(schema, null, "dueOn", "dueDate", "deadline");
                projection.CategoryField = PickField(schema, null, "category", "documentCategory", "document_category");
                projection.SlugField = PickField(schema, null, "slug", "documentSlug", "document_slug", "urlSlug");
                projection.RegistryNumberField = PickField(schema, null, "registryNumber", "documentNumber", "documentNo", "referenceNo");
                projection.DirectionField = PickField(schema, null, "direction", "documentDirection", "incomingOutgoing", "document_direction");
                projection.DocumentTypeField = PickField(schema, null, "documentType", "document_type", "type");
                return projection;
            }

            if (scope == AppProfileScopes.LeaveRequest)
            {
                projection.Profile.DisplayName = "Leave Requests";
                projection.Profile.EntitySingular = "Leave Request";
                projection.Profile.EntityPlural = "Leave Requests";
                projection.TitleTemplate = "{{employeeName}} {{requesterName}} {{fullName}}";
                projection.SummaryTemplate = "{{leaveType}} {{fromDate}} {{toDate}}";
                projection.OwnerDisplayField = PickField(schema, null, "employeeName", "requesterName", "fullName", "ownerName");
                projection.DepartmentField = PickField(schema, null, "department", "team", "unit");
                projection.DueDateField = PickField(schema, null, "approverDueOn", "dueOn", "dueDate");
                projection.CategoryField = PickField(schema, null, "leaveType", "type", "category");
                return projection;
            }

            if (scope == AppProfileScopes.Proposal)
            {
                projection.Profile.DisplayName = "Proposals";
                projection.Profile.EntitySingular = "Proposal";
                projection.Profile.EntityPlural = "Proposals";
                projection.TitleField = PickField(schema, null, "proposal_title", "proposalTitle", "title", "subject", "name");
                projection.SummaryField = PickField(schema, null, "executive_summary", "summary", "description", "expected_outcome");
                projection.OwnerDisplayField = PickField(schema, null, "requester_name", "ownerName", "owner", "fullName");
                projection.DepartmentField = PickField(schema, null, "department", "business_unit", "unit");
                projection.DueDateField = PickField(schema, null, "target_close_date", "dueOn", "dueDate", "deadline");
                projection.CategoryField = PickField(schema, null, "proposal_type", "type", "category");
                return projection;
            }

            if (scope == AppProfileScopes.Blog)
            {
                projection.Profile.DisplayName = "Blogs";
                projection.Profile.EntitySingular = "Post";
                projection.Profile.EntityPlural = "Posts";
                projection.Profile.EnableStablePublicUrl = true;
                projection.TitleField = PickField(schema, null, "title", "post_title", "subject", "name");
                projection.SummaryField = PickField(schema, null, "excerpt", "summary", "seo_description", "description");
                projection.OwnerDisplayField = PickField(schema, null, "author_name", "authorName", "ownerName", "owner");
                projection.DueDateField = PickField(schema, null, "publish_date", "publishDate", "scheduledOn", "dueDate");
                projection.CategoryField = PickField(schema, null, "category", "topic", "section");
                projection.KeywordsField = PickField(schema, null, "tags", "keywords");
                projection.SlugField = PickField(schema, null, "slug", "urlSlug", "canonicalUrl");
                return projection;
            }

            projection.Profile.DisplayName = BuildDisplayName(scope, form != null ? form.AppScope : null);
            projection.Profile.EntitySingular = "Record";
            projection.Profile.EntityPlural = "Records";
            projection.TitleField = PickField(schema, null, "title", "name", "subject");
            projection.SummaryField = PickField(schema, null, "summary", "description", "reason");
            projection.OwnerDisplayField = PickField(schema, null, "ownerName", "owner", "requesterName", "employeeName", "fullName");
            projection.DepartmentField = PickField(schema, null, "department", "unit");
            projection.DueDateField = PickField(schema, null, "dueOn", "dueDate", "deadline");
            projection.CategoryField = PickField(schema, null, "category", "type");
            projection.KeywordsField = PickField(schema, null, "keywords", "tags");
            projection.SlugField = PickField(schema, null, "slug", "urlSlug");
            return projection;
        }

        private static JObject ParseObject(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;
            try { return JObject.Parse(json); }
            catch { return null; }
        }

        private static JObject FirstObject(JObject parent, params string[] keys)
        {
            if (parent == null || keys == null)
                return null;

            foreach (var key in keys)
            {
                var token = parent[key];
                if (token is JObject obj)
                    return obj;
            }

            return null;
        }

        private static void OverlayProfile(AppProfileDefinition profile, JObject token)
        {
            if (profile == null || token == null)
                return;

            profile.Scope = FirstNonEmpty(ReadString(token, "scope", "key", "name"), profile.Scope);
            profile.DisplayName = FirstNonEmpty(ReadString(token, "displayName", "title", "label"), profile.DisplayName);
            profile.EntitySingular = FirstNonEmpty(ReadString(token, "entitySingular", "entityLabel", "recordLabel"), profile.EntitySingular);
            profile.EntityPlural = FirstNonEmpty(ReadString(token, "entityPlural", "recordPluralLabel"), profile.EntityPlural);
            profile.EnableWorkflowInbox = ReadBool(token, profile.EnableWorkflowInbox, "enableWorkflowInbox", "workflowInbox");
            profile.EnableAssignments = ReadBool(token, profile.EnableAssignments, "enableAssignments", "assignments");
            profile.EnableComments = ReadBool(token, profile.EnableComments, "enableComments", "comments");
            profile.EnableDirectives = ReadBool(token, profile.EnableDirectives, "enableDirectives", "directives");
            profile.EnableDocumentRegistry = ReadBool(token, profile.EnableDocumentRegistry, "enableDocumentRegistry", "documentRegistry");
            profile.EnableStablePublicUrl = ReadBool(token, profile.EnableStablePublicUrl, "enableStablePublicUrl", "stablePublicUrl");
        }

        private static void OverlayProjection(AppProjectionDefinition projection, JObject token)
        {
            if (projection == null || token == null)
                return;

            projection.TitleField = FirstNonEmpty(ReadString(token, "titleField"), projection.TitleField);
            projection.TitleTemplate = FirstNonEmpty(ReadString(token, "titleTemplate"), projection.TitleTemplate);
            projection.SummaryField = FirstNonEmpty(ReadString(token, "summaryField"), projection.SummaryField);
            projection.SummaryTemplate = FirstNonEmpty(ReadString(token, "summaryTemplate"), projection.SummaryTemplate);
            projection.OwnerField = FirstNonEmpty(ReadString(token, "ownerField"), projection.OwnerField);
            projection.OwnerDisplayField = FirstNonEmpty(ReadString(token, "ownerDisplayField", "ownerNameField"), projection.OwnerDisplayField);
            projection.DepartmentField = FirstNonEmpty(ReadString(token, "departmentField"), projection.DepartmentField);
            projection.DueDateField = FirstNonEmpty(ReadString(token, "dueDateField"), projection.DueDateField);
            projection.StatusField = FirstNonEmpty(ReadString(token, "statusField"), projection.StatusField);
            projection.CategoryField = FirstNonEmpty(ReadString(token, "categoryField"), projection.CategoryField);
            projection.KeywordsField = FirstNonEmpty(ReadString(token, "keywordsField"), projection.KeywordsField);
            projection.SlugField = FirstNonEmpty(ReadString(token, "slugField"), projection.SlugField);
            projection.RegistryNumberField = FirstNonEmpty(ReadString(token, "registryNumberField"), projection.RegistryNumberField);
            projection.DirectionField = FirstNonEmpty(ReadString(token, "directionField"), projection.DirectionField);
            projection.DocumentTypeField = FirstNonEmpty(ReadString(token, "documentTypeField"), projection.DocumentTypeField);
        }

        private static string PickField(FormSchema schema, string current, params string[] candidates)
        {
            if (!string.IsNullOrWhiteSpace(current))
                return current;
            if (candidates == null || candidates.Length == 0)
                return string.Empty;

            if (schema != null && schema.Fields != null)
            {
                var fields = MegaFormUtils.FlattenFields(schema.Fields)
                    .Where(f => f != null && !string.IsNullOrWhiteSpace(f.Key))
                    .Select(f => f.Key)
                    .ToList();

                foreach (var candidate in candidates)
                {
                    var actual = fields.FirstOrDefault(f => string.Equals(f, candidate, StringComparison.OrdinalIgnoreCase));
                    if (!string.IsNullOrWhiteSpace(actual))
                        return actual;
                }
            }

            return candidates.FirstOrDefault() ?? string.Empty;
        }

        private static string NormalizeScope(string raw)
        {
            var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
            if (value == "document" || value == "documents" || value == "document-management")
                return AppProfileScopes.Documents;
            if (value == "leave" || value == "leave-request" || value == "leave_request")
                return AppProfileScopes.LeaveRequest;
            if (value == "proposal" || value == "proposals" || value == "proposal-review")
                return AppProfileScopes.Proposal;
            if (value == "blog" || value == "blogs" || value == "content" || value == "publishing")
                return AppProfileScopes.Blog;
            return string.IsNullOrWhiteSpace(value) ? AppProfileScopes.Generic : value;
        }

        private static string BuildDisplayName(string scope, string originalScope = null)
        {
            if (scope == AppProfileScopes.Documents) return "Documents";
            if (scope == AppProfileScopes.LeaveRequest) return "Leave Requests";
            if (scope == AppProfileScopes.Proposal) return "Proposals";
            if (scope == AppProfileScopes.Blog) return "Blogs";

            var raw = !string.IsNullOrWhiteSpace(originalScope) ? originalScope : scope;
            raw = (raw ?? string.Empty).Trim();
            if (raw.Length == 0 || raw.Equals(AppProfileScopes.Generic, StringComparison.OrdinalIgnoreCase))
                return "Apps";

            var title = raw.Replace("-", " ").Replace("_", " ");
            return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(title);
        }

        private static string ReadString(JObject token, params string[] keys)
        {
            if (token == null || keys == null)
                return string.Empty;

            foreach (var key in keys)
            {
                var value = token[key];
                if (value == null)
                    continue;
                var text = (value.ToString() ?? string.Empty).Trim();
                if (!string.IsNullOrWhiteSpace(text))
                    return text;
            }

            return string.Empty;
        }

        private static bool ReadBool(JObject token, bool fallback, params string[] keys)
        {
            if (token == null || keys == null)
                return fallback;

            foreach (var key in keys)
            {
                var value = token[key];
                if (value == null)
                    continue;
                bool parsed;
                if (bool.TryParse(value.ToString(), out parsed))
                    return parsed;
            }

            return fallback;
        }

        private static string ReadValue(IDictionary<string, object> formData, string key)
        {
            if (formData == null || string.IsNullOrWhiteSpace(key))
                return string.Empty;

            object raw;
            if (formData.TryGetValue(key, out raw))
                return ConvertToString(raw);

            foreach (var entry in formData)
            {
                if (string.Equals(entry.Key ?? string.Empty, key, StringComparison.OrdinalIgnoreCase))
                    return ConvertToString(entry.Value);
            }

            return string.Empty;
        }

        private static string ConvertToString(object raw)
        {
            if (raw == null) return string.Empty;
            if (raw is string text) return text.Trim();
            if (raw is JValue jValue) return (jValue.ToString() ?? string.Empty).Trim();

            try
            {
                var token = JToken.FromObject(raw);
                if (token.Type == JTokenType.String)
                    return (token.ToString() ?? string.Empty).Trim();
                if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float || token.Type == JTokenType.Boolean)
                    return token.ToString();
            }
            catch
            {
            }

            return Convert.ToString(raw, CultureInfo.InvariantCulture) ?? string.Empty;
        }

        private static DateTime? ReadDate(IDictionary<string, object> formData, string key)
        {
            var raw = ReadValue(formData, key);
            if (string.IsNullOrWhiteSpace(raw))
                return null;

            DateTime parsed;
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed))
                return parsed;
            if (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out parsed))
                return parsed;
            return null;
        }

        private static string RenderTemplate(string template, IDictionary<string, object> formData)
        {
            if (string.IsNullOrWhiteSpace(template) || formData == null)
                return string.Empty;

            var rendered = Regex.Replace(template, "\\{\\{\\s*([A-Za-z0-9_\\-\\.]+)\\s*\\}\\}", match =>
            {
                var key = match.Groups[1].Value;
                return ReadValue(formData, key);
            });

            rendered = Regex.Replace(rendered, "\\s+", " ").Trim();
            return rendered;
        }

        private static DateTime? FirstDate(params DateTime?[] values)
        {
            if (values == null)
                return null;
            foreach (var value in values)
            {
                if (value.HasValue)
                    return value;
            }
            return null;
        }

        private static string FirstNonEmpty(params string[] values)
        {
            if (values == null)
                return string.Empty;
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }
            return string.Empty;
        }
    }
}
