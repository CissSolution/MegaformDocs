using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Reads legacy MF_Submissions.DataJson and writes MF_SubmissionFields + typed value rows.
    /// Idempotent: skips submissions that already have typed rows unless Force = true.
    /// </summary>
    public sealed class LegacySubmissionBackfillService
    {
        private readonly ISubmissionRepository _submissionRepo;
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionDataStore _store;
        private readonly SubmissionFieldNormalizer _normalizer;
        private readonly ILegacySubmissionSource _legacySource;
        private readonly ILogService _log;

        public LegacySubmissionBackfillService(
            ISubmissionRepository submissionRepo,
            IFormRepository formRepo,
            ISubmissionDataStore store,
            SubmissionFieldNormalizer normalizer,
            ILogService log,
            ILegacySubmissionSource legacySource = null)
        {
            _submissionRepo = submissionRepo ?? throw new ArgumentNullException(nameof(submissionRepo));
            _formRepo = formRepo ?? throw new ArgumentNullException(nameof(formRepo));
            _store = store ?? throw new ArgumentNullException(nameof(store));
            _normalizer = normalizer ?? throw new ArgumentNullException(nameof(normalizer));
            _log = log;
            _legacySource = legacySource;
        }

        public BackfillResult Run(BackfillOptions options)
        {
            if (options == null) options = new BackfillOptions();
            if (options.BatchSize <= 0) options.BatchSize = 100;

            var result = new BackfillResult();
            var formsById = new Dictionary<int, FormInfo>();
            var schemasById = new Dictionary<int, FormSchema>();

            int skip = 0;
            int processed = 0;
            while (true)
            {
                var submissions = GetBatch(options, skip);
                if (submissions == null || submissions.Count == 0) break;

                foreach (var submission in submissions)
                {
                    if (options.MaxSubmissions.HasValue && processed >= options.MaxSubmissions.Value)
                        return result;

                    processed++;

                    if (!options.Force && _store.HasFields(submission.SubmissionId))
                    {
                        result.Skipped++;
                        continue;
                    }

                    try
                    {
                        var form = ResolveForm(formsById, submission.FormId);
                        var schema = ResolveSchema(schemasById, submission.FormId, form);

                        var data = ParseDataJson(submission.DataJson);
                        var fields = _normalizer.Normalize(submission.FormId, schema, data);

                        if (!options.Force)
                            _store.DeleteFields(submission.SubmissionId);

                        _store.ReplaceFields(submission.SubmissionId, submission.FormId, fields);
                        result.Processed++;
                        result.FieldRowsWritten += fields.Count;
                    }
                    catch (Exception ex)
                    {
                        result.Failed++;
                        var msg = $"Backfill failed for submission {submission.SubmissionId}: {ex.Message}";
                        result.Errors.Add(msg);
                        _log?.LogError(nameof(LegacySubmissionBackfillService), msg, ex);
                    }
                }

                if (submissions.Count < options.BatchSize) break;
                skip += submissions.Count;
            }

            return result;
        }

        private List<SubmissionInfo> GetBatch(BackfillOptions options, int skip)
        {
            if (_legacySource != null)
                return _legacySource.GetSubmissionsNeedingBackfill(options.FormId, options.BatchSize, skip);

            if (!options.FormId.HasValue)
            {
                throw new NotSupportedException(
                    "Cross-form backfill requires a platform-specific ILegacySubmissionSource. " +
                    "Pass BackfillOptions.FormId or register an ILegacySubmissionSource implementation.");
            }

            var tuple = _submissionRepo.List(
                options.FormId.Value,
                pageIndex: skip / options.BatchSize,
                pageSize: options.BatchSize);

            return tuple.Items ?? new List<SubmissionInfo>();
        }

        private FormInfo ResolveForm(Dictionary<int, FormInfo> cache, int formId)
        {
            if (!cache.TryGetValue(formId, out var form))
            {
                form = _formRepo.GetForm(formId);
                cache[formId] = form;
            }
            return form;
        }

        private FormSchema ResolveSchema(Dictionary<int, FormSchema> cache, int formId, FormInfo form)
        {
            if (!cache.TryGetValue(formId, out var schema))
            {
                schema = TryParseSchema(form?.SchemaJson);
                cache[formId] = schema;
            }
            return schema;
        }

        private static Dictionary<string, object> ParseDataJson(string dataJson)
        {
            if (string.IsNullOrWhiteSpace(dataJson)) return new Dictionary<string, object>();
            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson)
                    ?? new Dictionary<string, object>();
            }
            catch
            {
                return new Dictionary<string, object>();
            }
        }

        private static FormSchema TryParseSchema(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return null;
            try { return JsonConvert.DeserializeObject<FormSchema>(schemaJson); }
            catch { return null; }
        }
    }
}
