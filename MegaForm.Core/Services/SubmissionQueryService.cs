using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared submission query facade used by Web / DNN / Oqtane.
    /// Sprint 1: unify response shape. Sprint 2: keep JSON-only storage compatible with DNN.
    /// </summary>
    public class SubmissionQueryService
    {
        private readonly ISubmissionRepository _submissions;
        private readonly IFormRepository _forms;
        private readonly IFileRepository _files;

        public SubmissionQueryService(
            ISubmissionRepository submissions,
            IFormRepository forms,
            IFileRepository files = null)
        {
            _submissions = submissions;
            _forms = forms;
            _files = files;
        }

        public SubmissionPagedResult<SubmissionListItem> List(SubmissionListQuery query)
        {
            if (query == null) query = new SubmissionListQuery();
            if (query.PageSize <= 0) query.PageSize = 50;
            if (query.PageSize > 250) query.PageSize = 250;
            if (query.PageIndex < 0) query.PageIndex = 0;

            var tuple = _submissions.List(
                query.FormId,
                query.Status,
                query.Search,
                query.DateFrom,
                query.DateTo,
                query.PageIndex,
                query.PageSize);

            string singleTitle = string.Empty;
            FormSchema singleSchema = null;
            if (query.FormId > 0)
            {
                var form = _forms.GetForm(query.FormId);
                singleTitle = form != null ? form.Title : string.Empty;
                singleSchema = TryParseSchema(form != null ? form.SchemaJson : null);
            }

            // Batch resolve titles + schemas for the distinct FormIds in the
            // result set when no single-form filter is active. Without this,
            // every row falls back to "Deleted form #N" because formTitle stays
            // empty.
            Dictionary<int, string> titlesByFormId = null;
            Dictionary<int, FormSchema> schemasByFormId = null;
            if (query.FormId <= 0 && tuple.Items != null)
            {
                titlesByFormId = new Dictionary<int, string>();
                schemasByFormId = new Dictionary<int, FormSchema>();
                foreach (var formId in tuple.Items.Select(s => s.FormId).Distinct())
                {
                    var form = _forms.GetForm(formId);
                    if (form != null)
                    {
                        titlesByFormId[formId] = form.Title;
                        schemasByFormId[formId] = TryParseSchema(form.SchemaJson);
                    }
                }
            }

            return new SubmissionPagedResult<SubmissionListItem>
            {
                Items = tuple.Items.Select(x => ToListItem(
                    x,
                    query.FormId > 0
                        ? singleTitle
                        : (titlesByFormId != null && titlesByFormId.TryGetValue(x.FormId, out var t) ? t : string.Empty),
                    query.FormId > 0
                        ? singleSchema
                        : (schemasByFormId != null && schemasByFormId.TryGetValue(x.FormId, out var s) ? s : null)
                )).ToList(),
                TotalCount = tuple.TotalCount,
                PageIndex = query.PageIndex,
                PageSize = query.PageSize
            };
        }

        public SubmissionDetailResult GetDetail(int submissionId)
        {
            var submission = _submissions.Get(submissionId);
            if (submission == null) return null;

            var form = _forms.GetForm(submission.FormId);
            var schema = TryParseSchema(form != null ? form.SchemaJson : null);

            var storedValues = _submissions.GetValues(submissionId) ?? new List<SubmissionValueInfo>();
            var fieldSnapshots = storedValues
                .Select(ParseSnapshot)
                .Where(x => x != null)
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.FieldLabel)
                .ToList();

            bool hasSnapshot = fieldSnapshots.Count > 0;
            if (!hasSnapshot && schema != null)
            {
                fieldSnapshots = MegaFormUtils.BuildSubmissionSnapshots(schema, submission.DataJson ?? "{}", true);
            }

            return new SubmissionDetailResult
            {
                Submission = submission,
                Form = form,
                Schema = schema,
                Files = _files != null ? (_files.GetBySubmission(submissionId) ?? new List<FileInfo>()) : new List<FileInfo>(),
                FlattenedValues = schema != null
                    ? MegaFormUtils.FlattenSubmission(schema, submission.DataJson ?? "{}")
                    : BuildFallbackFlatValues(submission.DataJson),
                FieldSnapshots = fieldSnapshots,
                HasSnapshot = hasSnapshot
            };
        }

        public SubmissionListItem ToListItem(SubmissionInfo submission, string formTitle = null, FormSchema schema = null)
        {
            if (submission == null) return null;

            string summary = string.Empty;
            if (schema != null)
            {
                summary = MegaFormUtils.BuildSubmissionSummary(schema, submission.DataJson ?? "{}", 200);
            }
            else if (!string.IsNullOrWhiteSpace(submission.DataJson))
            {
                try
                {
                    var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson) ?? new Dictionary<string, object>();
                    summary = string.Join("; ", data.Take(3).Select(kv => (kv.Key ?? "") + ": " + (kv.Value == null ? "" : kv.Value.ToString())));
                }
                catch
                {
                    summary = string.Empty;
                }
            }

            return new SubmissionListItem
            {
                SubmissionId = submission.SubmissionId,
                FormId = submission.FormId,
                FormTitle = !string.IsNullOrWhiteSpace(formTitle) ? formTitle : $"Deleted form #{submission.FormId}",
                Status = submission.Status,
                IsSpam = submission.IsSpam,
                SpamScore = submission.SpamScore,
                SubmittedOnUtc = submission.SubmittedOnUtc,
                ReadOnUtc = submission.ReadOnUtc,
                UserId = submission.UserId,
                IpAddress = submission.IpAddress,
                SummaryText = summary,
                DataJson = submission.DataJson ?? "{}"
            };
        }

        private static SubmissionFieldSnapshot ParseSnapshot(SubmissionValueInfo value)
        {
            if (value == null || string.IsNullOrWhiteSpace(value.FieldValue)) return null;
            try
            {
                var parsed = JsonConvert.DeserializeObject<SubmissionFieldSnapshot>(value.FieldValue);
                if (parsed == null) return null;
                if (string.IsNullOrWhiteSpace(parsed.FieldKey)) parsed.FieldKey = value.FieldKey;
                return parsed;
            }
            catch
            {
                return null;
            }
        }

        private static List<KeyValuePair<string, string>> BuildFallbackFlatValues(string dataJson)
        {
            var list = new List<KeyValuePair<string, string>>();
            if (string.IsNullOrWhiteSpace(dataJson)) return list;
            try
            {
                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson) ?? new Dictionary<string, object>();
                foreach (var kv in data)
                {
                    var key = kv.Key ?? string.Empty;
                    var value = kv.Value == null ? string.Empty : kv.Value.ToString();
                    list.Add(new KeyValuePair<string, string>(key, value));
                }
            }
            catch
            {
            }
            return list;
        }

        private static FormSchema TryParseSchema(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return null;
            try { return JsonConvert.DeserializeObject<FormSchema>(schemaJson); }
            catch { return null; }
        }
    }
}
