using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using MegaForm.Core.Utilities;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Shared submission query facade used by Web / DNN / Oqtane.
    /// Typed-capable repositories execute field predicates before count and paging.
    /// </summary>
    public class SubmissionQueryService
    {
        private readonly ISubmissionRepository _submissions;
        private readonly IFormRepository _forms;
        private readonly IFileRepository _files;
        private readonly ISubmissionDataStore _typedStore;
        private readonly SubmissionDataResolver _dataResolver;

        public SubmissionQueryService(
            ISubmissionRepository submissions,
            IFormRepository forms,
            IFileRepository files = null)
            : this(submissions, forms, files, null)
        {
        }

        public SubmissionQueryService(
            ISubmissionRepository submissions,
            IFormRepository forms,
            IFileRepository files,
            ISubmissionDataStore typedStore)
        {
            _submissions = submissions;
            _forms = forms;
            _files = files;
            _typedStore = typedStore;
            _dataResolver = new SubmissionDataResolver(typedStore);
        }

        /// <summary>[QueryKey250Fix v20260717-01] Ceiling for a server-trusted fetch (bound-query
        /// pre-filter, admin report). Still a bounded SQL page — never "read the whole table".</summary>
        public const int TrustedMaxPageSize = 5000;

        public SubmissionPagedResult<SubmissionListItem> List(SubmissionListQuery query)
        {
            if (query == null) query = new SubmissionListQuery();
            if (query.PageSize <= 0) query.PageSize = 50;
            var maxPageSize = query.TrustedFetch ? TrustedMaxPageSize : 250;
            if (query.PageSize > maxPageSize) query.PageSize = maxPageSize;
            if (query.PageIndex < 0) query.PageIndex = 0;

            ValidateTypedFilters(query.FieldFilters);

            bool ownerFilterRequested = query.UserId.HasValue && query.UserId.Value > 0;
            bool typedFiltersRequested = query.FieldFilters != null && query.FieldFilters.Count > 0;
            bool typedRepositoryAvailable = _submissions is ISubmissionTypedQueryRepository;
            if (typedFiltersRequested && !typedRepositoryAvailable)
                throw new NotSupportedException("This submission repository does not support typed field filters.");

            bool typedQueryRequested = !string.IsNullOrWhiteSpace(query.Search) || typedFiltersRequested;
            bool typedQueryInSql = typedQueryRequested && typedRepositoryAvailable;
            bool ownerFilterInSql = ownerFilterRequested && _submissions is ISubmissionOwnerFilterableRepository;
            var tuple = typedQueryInSql
                ? ((ISubmissionTypedQueryRepository)_submissions).ListTyped(query)
                : ownerFilterInSql
                // [OwnerRlsSql v20260722-01] SQL-level owner filter — TotalCount/paging stay exact.
                ? ((ISubmissionOwnerFilterableRepository)_submissions).ListOwnedBy(
                    query.FormId,
                    query.UserId.Value,
                    query.Status,
                    query.Search,
                    query.DateFrom,
                    query.DateTo,
                    query.PageIndex,
                    query.PageSize)
                : _submissions.List(
                    query.FormId,
                    query.Status,
                    query.Search,
                    query.DateFrom,
                    query.DateTo,
                    query.PageIndex,
                    query.PageSize);

            // [OwnerRlsSql v20260722-01] Fallback for platform repos that do not implement
            // ISubmissionOwnerFilterableRepository yet: filter the fetched page in memory.
            // TotalCount then remains the UNFILTERED total (same trade-off the Oqtane
            // controller had before this change) — implement the capability interface on the
            // platform repo to get exact counts. Never triggers on Oqtane (EfSubmissionRepository
            // implements it); no current caller sets UserId on DNN/Web.
            if (ownerFilterRequested && !ownerFilterInSql && !typedQueryInSql)
            {
                tuple = (tuple.Items.Where(s => s.UserId == query.UserId.Value).ToList(), tuple.TotalCount);
            }

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

            IDictionary<int, SubmissionDataDocument> typedDocuments = null;
            var batchReader = _typedStore as ISubmissionDataBatchReader;
            if (batchReader != null && tuple.Items != null && tuple.Items.Count > 0)
            {
                typedDocuments = batchReader.GetDataMany(
                    tuple.Items.Select(item => item.SubmissionId).Distinct().ToList());
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
                        : (schemasByFormId != null && schemasByFormId.TryGetValue(x.FormId, out var s) ? s : null),
                    typedDocuments != null && typedDocuments.TryGetValue(x.SubmissionId, out var document)
                        ? document.Data
                        : null
                )).ToList(),
                TotalCount = tuple.TotalCount,
                PageIndex = query.PageIndex,
                PageSize = query.PageSize
            };
        }

        private static void ValidateTypedFilters(IEnumerable<SubmissionFieldFilter> filters)
        {
            if (filters == null) return;
            foreach (var filter in filters)
            {
                if (filter == null)
                    throw new ArgumentException("FieldFilters cannot contain null entries.", nameof(filters));
                if (string.IsNullOrWhiteSpace(filter.FieldKey))
                    throw new ArgumentException("Every typed field filter requires FieldKey.", nameof(filters));

                var dataType = filter.DataType
                    ?? (filter.NumberValue.HasValue ? SubmissionDataType.Number
                    : filter.DateValue.HasValue ? SubmissionDataType.Date
                    : filter.BooleanValue.HasValue ? SubmissionDataType.Boolean
                    : SubmissionDataType.String);

                if (dataType == SubmissionDataType.Json
                    && filter.Operator != SubmissionFieldFilterOperator.IsEmpty
                    && filter.Operator != SubmissionFieldFilterOperator.IsNotEmpty)
                    throw new NotSupportedException("JSON field filters support only IsEmpty and IsNotEmpty. Query a normalized typed field for value comparisons.");

                if (filter.Operator != SubmissionFieldFilterOperator.IsEmpty
                    && filter.Operator != SubmissionFieldFilterOperator.IsNotEmpty)
                {
                    bool supported = dataType == SubmissionDataType.String || dataType == SubmissionDataType.LongText
                        ? filter.Operator == SubmissionFieldFilterOperator.Equals
                            || filter.Operator == SubmissionFieldFilterOperator.NotEquals
                            || filter.Operator == SubmissionFieldFilterOperator.Contains
                            || filter.Operator == SubmissionFieldFilterOperator.StartsWith
                            || filter.Operator == SubmissionFieldFilterOperator.EndsWith
                        : dataType == SubmissionDataType.Number || dataType == SubmissionDataType.Date
                            ? filter.Operator == SubmissionFieldFilterOperator.Equals
                                || filter.Operator == SubmissionFieldFilterOperator.NotEquals
                                || filter.Operator == SubmissionFieldFilterOperator.GreaterThan
                                || filter.Operator == SubmissionFieldFilterOperator.GreaterThanOrEqual
                                || filter.Operator == SubmissionFieldFilterOperator.LessThan
                                || filter.Operator == SubmissionFieldFilterOperator.LessThanOrEqual
                            : dataType == SubmissionDataType.Boolean
                                && (filter.Operator == SubmissionFieldFilterOperator.Equals
                                    || filter.Operator == SubmissionFieldFilterOperator.NotEquals);
                    if (!supported)
                        throw new NotSupportedException("The selected operator is not valid for the field DataType.");
                }

                if ((dataType == SubmissionDataType.Number && !filter.NumberValue.HasValue)
                    || (dataType == SubmissionDataType.Date && !filter.DateValue.HasValue)
                    || (dataType == SubmissionDataType.Boolean && !filter.BooleanValue.HasValue))
                {
                    if (filter.Operator != SubmissionFieldFilterOperator.IsEmpty
                        && filter.Operator != SubmissionFieldFilterOperator.IsNotEmpty)
                        throw new ArgumentException("The selected field DataType requires its matching typed value.", nameof(filters));
                }
            }
        }

        public SubmissionDetailResult GetDetail(int submissionId)
        {
            var submission = _submissions.Get(submissionId);
            if (submission == null) return null;

            var form = _forms.GetForm(submission.FormId);
            var schema = TryParseSchema(form != null ? form.SchemaJson : null);

            bool hasTypedData = _dataResolver.HasTypedData(submissionId);
            var data = _dataResolver.GetData(submissionId, submission.DataJson);
            var dataJson = data.Count > 0 ? JsonConvert.SerializeObject(data) : (submission.DataJson ?? "{}");

            var fieldSnapshots = hasTypedData
                ? BuildSnapshotsFromTypedRows(submissionId, data)
                : BuildSnapshotsFromStoredValues(submissionId, schema, dataJson);

            bool hasSnapshot = fieldSnapshots.Count > 0;
            if (!hasSnapshot && schema != null)
            {
                fieldSnapshots = MegaFormUtils.BuildSubmissionSnapshots(schema, dataJson, true);
                hasSnapshot = fieldSnapshots.Count > 0;
            }

            return new SubmissionDetailResult
            {
                Submission = submission,
                Form = form,
                Schema = schema,
                Files = _files != null ? (_files.GetBySubmission(submissionId) ?? new List<FileInfo>()) : new List<FileInfo>(),
                Data = data,
                FlattenedValues = schema != null
                    ? MegaFormUtils.FlattenSubmission(schema, dataJson)
                    : BuildFallbackFlatValuesFromDictionary(data),
                FieldSnapshots = fieldSnapshots,
                HasSnapshot = hasSnapshot
            };
        }

        private List<SubmissionFieldSnapshot> BuildSnapshotsFromTypedRows(int submissionId, Dictionary<string, object> data)
        {
            var fields = _typedStore.GetFields(submissionId);
            var list = new List<SubmissionFieldSnapshot>(fields.Count);
            foreach (var f in fields)
            {
                if (f == null) continue;
                list.Add(new SubmissionFieldSnapshot
                {
                    FieldKey = f.FieldKey,
                    FieldLabel = f.LabelSnapshot,
                    FieldType = f.FieldType,
                    RawValue = data.TryGetValue(f.FieldKey, out var raw) ? raw?.ToString() : null,
                    DisplayValue = f.DisplayValue,
                    SortOrder = f.FieldOrder ?? 0
                });
            }
            return list
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.FieldLabel)
                .ToList();
        }

        private List<SubmissionFieldSnapshot> BuildSnapshotsFromStoredValues(int submissionId, FormSchema schema, string dataJson)
        {
            var storedValues = _submissions.GetValues(submissionId) ?? new List<SubmissionValueInfo>();
            return storedValues
                .Select(ParseSnapshot)
                .Where(x => x != null)
                .OrderBy(x => x.SortOrder)
                .ThenBy(x => x.FieldLabel)
                .ToList();
        }

        /// <summary>
        /// OBSOLETE — <see cref="GetDetail(int)"/> now uses typed rows by default when available.
        /// Kept for binary compatibility with existing callers.
        /// </summary>
        [Obsolete("GetDetail now reads typed rows automatically. Use GetDetail instead.", false)]
        public SubmissionDetailResult GetDetailTyped(int submissionId)
        {
            return GetDetail(submissionId);
        }

        private static List<KeyValuePair<string, string>> BuildFallbackFlatValuesFromDictionary(Dictionary<string, object> data)
        {
            var list = new List<KeyValuePair<string, string>>();
            if (data == null) return list;
            foreach (var kv in data)
            {
                list.Add(new KeyValuePair<string, string>(kv.Key ?? string.Empty, kv.Value?.ToString() ?? string.Empty));
            }
            return list;
        }

        public SubmissionListItem ToListItem(SubmissionInfo submission, string formTitle = null, FormSchema schema = null)
        {
            return ToListItem(submission, formTitle, schema, null);
        }

        private SubmissionListItem ToListItem(
            SubmissionInfo submission,
            string formTitle,
            FormSchema schema,
            Dictionary<string, object> resolvedData)
        {
            if (submission == null) return null;

            string summary = string.Empty;
            var data = resolvedData ?? _dataResolver.GetData(submission.SubmissionId, submission.DataJson);
            if (schema != null)
            {
                summary = MegaFormUtils.BuildSubmissionSummary(schema, JsonConvert.SerializeObject(data), 200);
            }
            else
            {
                summary = string.Join("; ", data.Take(3).Select(kv => (kv.Key ?? "") + ": " + (kv.Value == null ? "" : kv.Value.ToString())));
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
                Data = data
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
