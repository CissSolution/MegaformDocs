using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services.TypedSubmission;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Executes persisted app named queries over typed submission records. This is the shared
    /// application read boundary used by custom DNN Razor modules; legacy DataJson is fallback
    /// only, so callers never need to parse it.
    /// </summary>
    public sealed class AppRecordQueryService
    {
        public const int MaxSourceRecords = 500;
        public const int MaxPageSize = 100;

        private readonly IPhase2Repository _phase2;
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly ISubmissionDataStore _typedStore;
        private readonly SubmissionDataResolver _resolver;

        public AppRecordQueryService(
            IPhase2Repository phase2,
            IFormRepository forms,
            ISubmissionRepository submissions,
            ISubmissionDataStore typedStore)
        {
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _typedStore = typedStore;
            _resolver = new SubmissionDataResolver(typedStore);
        }

        public AppRecordPage Execute(AppRecordQueryRequest request)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));
            var apps = new AppDefinitionService(_phase2, _forms);
            var bundle = apps.Get(request.PortalId, request.AppKey, true);
            if (bundle?.App == null || !bundle.App.IsEnabled)
                throw new InvalidOperationException("App definition was not found or is disabled.");

            var query = (bundle.Queries ?? new List<AppQueryDefinitionInfo>())
                .FirstOrDefault(q => string.Equals(q.QueryKey, request.QueryKey, StringComparison.OrdinalIgnoreCase));
            if (query == null)
                throw new InvalidOperationException("Named query was not found in this app.");

            var form = _forms.GetForm(query.FormId);
            if (form == null || form.PortalId != bundle.App.PortalId)
                throw new InvalidOperationException("Named query form was not found in this app.");

            var definition = ParseObject(query.DefinitionJson);
            var status = StringValue(definition["status"]);
            var tuple = _submissions.List(
                form.FormId,
                // App status is content data (for example draft/published/archived),
                // not the submission transport status (Submitted/Approved/etc.).
                // Fetch the bounded app record set first, resolve typed values, and
                // apply the named-query status below.
                null,
                null, null, null, 0, MaxSourceRecords);

            // [PerfFix 2026-08-07] Batch typed read: the per-record path below costs
            // HasFields + GetData (fields + 6 value tables) PER submission — measured on the
            // live blog (39 posts, ~57 typed fields each) as ~2,300 SQL round trips per named
            // query, ~24s TTFB for /Blogs which fires three queries. When the host store
            // implements ISubmissionDataBatchReader, the whole page resolves in one query per
            // table instead. Fail-soft: any batch error falls back to the per-record path.
            IDictionary<int, SubmissionDataDocument> preloaded = null;
            var batchReader = _typedStore as ISubmissionDataBatchReader;
            if (batchReader != null && tuple.Items != null && tuple.Items.Count > 0)
            {
                try
                {
                    var ids = tuple.Items.Select(s => s.SubmissionId).ToList();
                    preloaded = batchReader.GetDataMany(ids);
                }
                catch
                {
                    preloaded = null;
                }
            }

            IEnumerable<AppRecordInfo> records = (tuple.Items ?? new List<SubmissionInfo>())
                .Where(s => !s.IsSpam)
                .Select(s => ToRecord(s, preloaded));

            if (!string.IsNullOrWhiteSpace(status))
                records = records.Where(r =>
                    string.Equals(r.Status ?? string.Empty, status, StringComparison.OrdinalIgnoreCase));

            var statuses = ReadStrings(definition["statuses"]);
            if (statuses.Count > 0)
                records = records.Where(r => statuses.Contains(r.Status ?? string.Empty, StringComparer.OrdinalIgnoreCase));

            records = ApplyDefinedFilters(records, definition["filters"], request.Parameters);
            records = ApplyParameters(records, request.Parameters);

            if (!string.IsNullOrWhiteSpace(request.Search))
            {
                var term = request.Search.Trim();
                records = records.Where(r => r.Data.Values.Any(v =>
                    Convert.ToString(v, CultureInfo.InvariantCulture)
                        ?.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0));
            }

            records = ApplySort(records, definition["sort"]);
            var materialized = records.ToList();
            var page = Math.Max(1, request.Page);
            var pageSize = Math.Max(1, Math.Min(MaxPageSize, request.PageSize <= 0 ? 20 : request.PageSize));

            return new AppRecordPage
            {
                App = bundle.App,
                Query = query,
                Form = form,
                Items = materialized.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                TotalCount = materialized.Count,
                Page = page,
                PageSize = pageSize,
                IsBounded = tuple.TotalCount > MaxSourceRecords
            };
        }

        public AppRecordInfo GetRecord(int portalId, int submissionId)
        {
            var submission = _submissions.Get(submissionId);
            if (submission == null) return null;
            var form = _forms.GetForm(submission.FormId);
            if (form == null || (portalId > 0 && form.PortalId != portalId)) return null;
            return ToRecord(submission);
        }

        private AppRecordInfo ToRecord(SubmissionInfo submission, IDictionary<int, SubmissionDataDocument> preloaded = null)
        {
            var isTyped = false;
            Dictionary<string, object> data;
            if (preloaded != null)
            {
                // Batch path: zero database round trips here. A missing key means "no typed
                // fields" (the ISubmissionDataBatchReader contract), so the record falls back
                // to its legacy payload exactly like the resolver would after HasFields=false.
                SubmissionDataDocument doc;
                isTyped = preloaded.TryGetValue(submission.SubmissionId, out doc) && doc != null;
                data = isTyped ? DataFromDocument(doc) : null;
                if (data == null) data = ParseDataJson(submission.DataJson);
            }
            else
            {
                try { isTyped = _typedStore != null && _typedStore.HasFields(submission.SubmissionId); }
                catch { }
                data = _resolver.GetTypedFirstData(submission.SubmissionId, submission.DataJson);
            }
            var appStatus = submission.Status;
            if (data != null && data.TryGetValue("status", out var typedStatus))
            {
                var typedStatusText = Convert.ToString(typedStatus, CultureInfo.InvariantCulture);
                if (!string.IsNullOrWhiteSpace(typedStatusText))
                    appStatus = typedStatusText.Trim();
            }
            return new AppRecordInfo
            {
                SubmissionId = submission.SubmissionId,
                FormId = submission.FormId,
                Status = appStatus,
                UserId = submission.UserId,
                SubmittedOnUtc = submission.SubmittedOnUtc,
                Data = data,
                IsTyped = isTyped
            };
        }

        // Mirror of SubmissionDataResolver.GetTypedFirstData's document handling, for the batch
        // path: typed Data wins, a reconstruction is tried next, null means "use legacy DataJson".
        private static Dictionary<string, object> DataFromDocument(SubmissionDataDocument doc)
        {
            if (doc?.Data != null && doc.Data.Count > 0)
                return new Dictionary<string, object>(doc.Data, StringComparer.OrdinalIgnoreCase);

            var reconstructed = new SubmissionDataReconstructor().Reconstruct(doc);
            if (reconstructed != null && reconstructed.Count > 0)
                return new Dictionary<string, object>(reconstructed, StringComparer.OrdinalIgnoreCase);

            return null;
        }

        // Same parse as SubmissionDataResolver's DataJson fallback (kept private there).
        private static Dictionary<string, object> ParseDataJson(string dataJson)
        {
            var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(dataJson)) return result;
            try
            {
                var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson);
                if (parsed != null)
                {
                    foreach (var kv in parsed)
                        result[kv.Key] = kv.Value;
                }
            }
            catch { }
            return result;
        }

        private static IEnumerable<AppRecordInfo> ApplyDefinedFilters(
            IEnumerable<AppRecordInfo> records,
            JToken token,
            IDictionary<string, object> parameters)
        {
            var filters = token as JArray;
            if (filters == null) return records;
            foreach (var filter in filters)
            {
                if (filter.Type == JTokenType.String)
                {
                    var key = StringValue(filter);
                    if (TryGet(parameters, key, out var parameterValue))
                        records = records.Where(r => Matches(r, key, "equals", parameterValue));
                    continue;
                }

                var obj = filter as JObject;
                if (obj == null) continue;
                var field = StringValue(obj["field"]);
                var op = StringValue(obj["op"]);
                var value = obj["value"] is JValue jv ? jv.Value : obj["value"]?.ToString();
                if (!string.IsNullOrWhiteSpace(field))
                    records = records.Where(r => Matches(r, field, op, value));
            }
            return records;
        }

        private static IEnumerable<AppRecordInfo> ApplyParameters(
            IEnumerable<AppRecordInfo> records,
            IDictionary<string, object> parameters)
        {
            if (parameters == null) return records;
            foreach (var pair in parameters)
            {
                if (string.IsNullOrWhiteSpace(pair.Key) || pair.Value == null) continue;
                records = records.Where(r => Matches(r, pair.Key, "equals", pair.Value));
            }
            return records;
        }

        private static bool Matches(AppRecordInfo record, string field, string op, object expected)
        {
            object actual;
            if (string.Equals(field, "status", StringComparison.OrdinalIgnoreCase))
                actual = record.Status;
            else if (!record.Data.TryGetValue(field ?? string.Empty, out actual))
                return false;

            var left = Convert.ToString(actual, CultureInfo.InvariantCulture) ?? string.Empty;
            var right = Convert.ToString(expected, CultureInfo.InvariantCulture) ?? string.Empty;
            switch ((op ?? "equals").Trim().ToLowerInvariant())
            {
                case "contains":
                    return left.IndexOf(right, StringComparison.OrdinalIgnoreCase) >= 0;
                case "not-equals":
                case "notequals":
                case "neq":
                    return !string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
                default:
                    return string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
            }
        }

        private static IEnumerable<AppRecordInfo> ApplySort(IEnumerable<AppRecordInfo> records, JToken token)
        {
            var sorts = token as JArray;
            if (sorts == null || sorts.Count == 0)
                return records.OrderByDescending(r => r.SubmittedOnUtc);

            IOrderedEnumerable<AppRecordInfo> ordered = null;
            foreach (var sort in sorts.OfType<JObject>())
            {
                var field = StringValue(sort["field"]);
                var desc = string.Equals(StringValue(sort["dir"]), "desc", StringComparison.OrdinalIgnoreCase);
                Func<AppRecordInfo, IComparable> key = r => SortValue(r, field);
                ordered = ordered == null
                    ? (desc ? records.OrderByDescending(key) : records.OrderBy(key))
                    : (desc ? ordered.ThenByDescending(key) : ordered.ThenBy(key));
            }
            return ordered ?? records.OrderByDescending(r => r.SubmittedOnUtc);
        }

        private static IComparable SortValue(AppRecordInfo record, string field)
        {
            if (string.Equals(field, "status", StringComparison.OrdinalIgnoreCase)) return record.Status ?? string.Empty;
            if (string.Equals(field, "submittedOnUtc", StringComparison.OrdinalIgnoreCase)) return record.SubmittedOnUtc;
            if (!record.Data.TryGetValue(field ?? string.Empty, out var raw) || raw == null) return string.Empty;
            var text = Convert.ToString(raw, CultureInfo.InvariantCulture) ?? string.Empty;
            if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) return date;
            if (decimal.TryParse(text, NumberStyles.Any, CultureInfo.InvariantCulture, out var number)) return number;
            return text;
        }

        private static JObject ParseObject(string json)
        {
            try { return string.IsNullOrWhiteSpace(json) ? new JObject() : JObject.Parse(json); }
            catch { return new JObject(); }
        }

        private static string StringValue(JToken token) => token == null ? string.Empty : token.ToString().Trim();

        private static List<string> ReadStrings(JToken token) =>
            token is JArray array
                ? array.Values<string>().Where(x => !string.IsNullOrWhiteSpace(x)).ToList()
                : new List<string>();

        private static bool TryGet(IDictionary<string, object> values, string key, out object value)
        {
            value = null;
            if (values == null || string.IsNullOrWhiteSpace(key)) return false;
            if (values.TryGetValue(key, out value)) return true;
            var match = values.FirstOrDefault(x => string.Equals(x.Key, key, StringComparison.OrdinalIgnoreCase));
            value = match.Value;
            return match.Key != null;
        }
    }
}
