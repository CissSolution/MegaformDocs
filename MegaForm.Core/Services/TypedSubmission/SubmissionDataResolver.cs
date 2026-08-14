using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.TypedSubmission
{
    /// <summary>
    /// Central facade for reading the canonical submission data dictionary.
    /// On hosts that have collapsed DataJson (SupportsDataJsonCollapse=true), typed
    /// rows are reconstructed first and DataJson is only a fallback. On all other
    /// hosts DataJson remains the runtime source of truth and typed rows are treated
    /// as an auxiliary index that may lag behind — this keeps reads safe even when
    /// typed tables are missing or out of sync.
    /// </summary>
    public sealed class SubmissionDataResolver
    {
        private readonly ISubmissionDataStore _typedStore;

        public SubmissionDataResolver(ISubmissionDataStore typedStore)
        {
            _typedStore = typedStore;
        }

        /// <summary>
        /// Gets the submission data dictionary. Prefer typed rows only on hosts where
        /// typed storage is the source of truth; otherwise use DataJson directly.
        /// Fail-soft: any typed-store error falls back to DataJson.
        /// </summary>
        public Dictionary<string, object> GetData(int submissionId, string dataJsonFallback)
        {
            if (_typedStore != null)
            {
                try
                {
                    if (_typedStore.HasFields(submissionId))
                    {
                        var document = _typedStore.GetData(submissionId);
                        if (document?.Data != null && document.Data.Count > 0)
                            return document.Data;

                        var reconstructed = new SubmissionDataReconstructor().Reconstruct(document);
                        if (reconstructed != null && reconstructed.Count > 0)
                            return reconstructed;
                    }
                }
                catch
                {
                    // Fail-soft: typed store unavailable/missing schema → fall through to DataJson.
                }
            }

            return ParseDataJson(dataJsonFallback);
        }

        /// <summary>
        /// Typed-first read for new application APIs. Unlike <see cref="GetData"/>, this method
        /// does not require the host to have collapsed DataJson: it uses typed rows whenever a
        /// complete typed record exists and falls back to the legacy payload only when it does not.
        /// Existing host renderers keep their compatibility behavior through <see cref="GetData"/>.
        /// </summary>
        public Dictionary<string, object> GetTypedFirstData(int submissionId, string dataJsonFallback)
        {
            if (_typedStore != null)
            {
                try
                {
                    if (_typedStore.HasFields(submissionId))
                    {
                        var document = _typedStore.GetData(submissionId);
                        if (document?.Data != null && document.Data.Count > 0)
                            return new Dictionary<string, object>(document.Data, StringComparer.OrdinalIgnoreCase);

                        var reconstructed = new SubmissionDataReconstructor().Reconstruct(document);
                        if (reconstructed != null && reconstructed.Count > 0)
                            return new Dictionary<string, object>(reconstructed, StringComparer.OrdinalIgnoreCase);
                    }
                }
                catch
                {
                    // New APIs must remain able to read pre-migration rows during rolling upgrades.
                }
            }

            return ParseDataJson(dataJsonFallback);
        }

        /// <summary>
        /// True when typed rows exist for this submission AND typed storage is the
        /// source of truth on this host.
        /// </summary>
        public bool HasTypedData(int submissionId)
        {
            if (_typedStore == null)
                return false;

            try
            {
                return _typedStore.HasFields(submissionId);
            }
            catch
            {
                return false;
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
