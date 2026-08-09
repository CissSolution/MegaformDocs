using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Keeps typed submission rows in sync with the legacy DataJson blob after
    /// an in-place update (workflow step, admin edit, analytics rollup, etc.).
    /// This is the single shared gate for all typed-row rewrites outside the
    /// initial submit pipeline.
    /// </summary>
    public sealed class TypedSubmissionResyncService
    {
        private readonly ISubmissionDataStore _typedStore;
        private readonly ISubmissionRepository _submissions;
        private readonly IFormRepository _forms;
        private readonly ILogService _log;
        private readonly SubmissionFieldNormalizer _normalizer = new SubmissionFieldNormalizer();

        public TypedSubmissionResyncService(
            ISubmissionDataStore typedStore,
            ISubmissionRepository submissions,
            IFormRepository forms,
            ILogService log = null)
        {
            _typedStore = typedStore;
            _submissions = submissions;
            _forms = forms;
            _log = log;
        }

        /// <summary>
        /// Rebuilds typed rows for a submission from its current DataJson.
        /// No-op when there is no typed store, when DataJson is empty/collapsed,
        /// or when the form/schema cannot be loaded.
        /// Fail-soft: any exception is logged and swallowed so the DataJson
        /// write that triggered the resync remains authoritative.
        /// </summary>
        public void Resync(int submissionId, int formId, string dataJson)
        {
            if (_typedStore == null)
                return;

            if (string.IsNullOrWhiteSpace(dataJson) || IsCollapsedDataJson(dataJson))
                return;

            try
            {
                var schema = LoadSchema(formId);
                if (schema == null)
                    return;

                var data = ParseDataJson(dataJson);
                var fields = _normalizer.Normalize(formId, schema, data);

                if (fields == null || fields.Count == 0)
                {
                    // DataJson has no normalizable fields; clear typed rows so
                    // the two stores stay consistent.
                    _typedStore.DeleteFields(submissionId);
                    return;
                }

                _typedStore.ReplaceFields(submissionId, formId, fields);
            }
            catch (Exception ex)
            {
                _log?.LogWarning(nameof(TypedSubmissionResyncService),
                    $"Typed resync failed for submission {submissionId} (form {formId}); DataJson remains authoritative. {ex.Message}");
            }
        }

        /// <summary>
        /// Convenience overload that reads FormId from the submission row.
        /// </summary>
        public void Resync(SubmissionInfo submission)
        {
            if (submission == null) return;
            Resync(submission.SubmissionId, submission.FormId, submission.DataJson);
        }

        private static bool IsCollapsedDataJson(string dataJson)
        {
            if (string.IsNullOrWhiteSpace(dataJson)) return true;
            var trimmed = dataJson.Trim();
            return trimmed == "{}" || trimmed == "[]";
        }

        private FormSchema LoadSchema(int formId)
        {
            try
            {
                var form = _forms?.GetForm(formId);
                if (form == null || string.IsNullOrWhiteSpace(form.SchemaJson))
                    return null;
                return JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
            }
            catch
            {
                return null;
            }
        }

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
    }
}
