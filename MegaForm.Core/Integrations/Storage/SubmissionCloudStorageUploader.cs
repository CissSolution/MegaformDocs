using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Utilities;
using MfFileInfo = MegaForm.Core.Models.FileInfo;

namespace MegaForm.Core.Integrations.Storage
{
    /// <summary>
    /// [CloudStorage v20260723-01] Pushes a submission's uploaded files to the cloud storage
    /// providers configured in schema.settings.cloudStorage (Builder → Settings → Cloud Storage).
    ///
    /// Called by <see cref="SubmissionProcessor"/> right after the submission row is inserted
    /// (the id is needed for OrganizeBySubmission folders). FAIL-SOFT by contract: every failure
    /// (unknown connection, unreadable file, provider error) is logged and skipped — a cloud
    /// outage must never break, delay-fail or roll back a user submission. The local MF_Files
    /// copy remains the source of truth; cloud upload is a best-effort mirror.
    ///
    /// Files are re-read from disk via the host's <see cref="ISubmissionFileBlobReader"/> because
    /// the browser uploads files in a SEPARATE request before submit — by submit time only the
    /// stored-path metadata travels inside the File field value (SubmissionFileMetaExtractor).
    /// </summary>
    public class SubmissionCloudStorageUploader
    {
        private readonly IStorageIntegrationService _storage;
        private readonly ICloudStorageConnectionProvider _connections;
        private readonly ISubmissionFileBlobReader _blobReader;
        private readonly ILogService _log;

        public SubmissionCloudStorageUploader(
            IStorageIntegrationService storage,
            ICloudStorageConnectionProvider connections,
            ISubmissionFileBlobReader blobReader,
            ILogService log = null)
        {
            _storage = storage;
            _connections = connections;
            _blobReader = blobReader;
            _log = log;
        }

        /// <summary>
        /// Runs all enabled cloud storage mappings for the submission. Never throws for
        /// configuration/provider problems; only a catastrophic bug in this method itself
        /// would surface (the processor wraps the call anyway).
        /// </summary>
        public async Task UploadFailSoftAsync(
            int formId,
            FormSchema schema,
            IDictionary<string, object> formData,
            int submissionId)
        {
            if (_storage == null || _connections == null || _blobReader == null)
                return;

            var settings = schema?.Settings?.CloudStorage;
            if (settings == null || !settings.Enabled)
                return;

            var mappings = (settings.Mappings ?? new List<StorageIntegrationMapping>())
                .Where(m => m != null && !string.IsNullOrWhiteSpace(m.ProviderName))
                .ToList();
            if (mappings.Count == 0)
                return;

            List<MfFileInfo> files;
            try
            {
                var flatFields = MegaFormUtils.FlattenFields(schema?.Fields);
                files = SubmissionFileMetaExtractor.Extract(flatFields, formData, submissionId)
                    .Where(f => !string.IsNullOrWhiteSpace(f.StoredPath))
                    .ToList();
            }
            catch (Exception ex)
            {
                Log("Cloud storage upload: failed to extract file metadata for submission " + submissionId + ": " + ex.Message);
                return;
            }
            if (files.Count == 0)
                return;

            foreach (var mapping in mappings)
            {
                try
                {
                    await UploadOneMappingAsync(formId, submissionId, mapping, files).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    // Per-mapping isolation: one failing provider must not block the others.
                    Log("Cloud storage upload to '" + mapping.ProviderName + "' failed for submission " + submissionId + ": " + ex.Message);
                }
            }
        }

        private async Task UploadOneMappingAsync(int formId, int submissionId, StorageIntegrationMapping mapping, List<MfFileInfo> files)
        {
            var selected = mapping.UploadFieldKeys != null && mapping.UploadFieldKeys.Count > 0
                ? files.Where(f => mapping.UploadFieldKeys.Any(k => string.Equals(k, f.FieldKey, StringComparison.OrdinalIgnoreCase))).ToList()
                : files;
            if (selected.Count == 0)
                return;

            var connection = _connections.GetConnection(mapping.ConnectionSettingsId);
            if (connection == null)
            {
                Log("Cloud storage upload: connection '" + (mapping.ConnectionSettingsId ?? "") + "' not found; submission " + submissionId + " skipped for provider '" + mapping.ProviderName + "'.");
                return;
            }
            // The catalog entry decides the credentials, but the MAPPING decides the provider —
            // an admin may point the same-named connection at a different provider over time.
            connection.ProviderName = mapping.ProviderName;

            var streams = new Dictionary<string, Stream>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var file in selected)
                {
                    Stream stream = null;
                    try
                    {
                        stream = _blobReader.OpenRead(file.StoredPath);
                    }
                    catch (Exception ex)
                    {
                        Log("Cloud storage upload: cannot read '" + file.StoredPath + "' for submission " + submissionId + ": " + ex.Message);
                    }
                    if (stream == null)
                        continue;

                    streams[UniqueName(streams, string.IsNullOrWhiteSpace(file.OriginalName) ? "file" : file.OriginalName)] = stream;
                }
                if (streams.Count == 0)
                    return;

                var result = await _storage.UploadSubmissionFilesAsync(mapping, connection, submissionId, streams).ConfigureAwait(false);
                if (result != null && !result.Success)
                    Log("Cloud storage upload to '" + mapping.ProviderName + "' reported failure for submission " + submissionId + ": " + result.Message);
            }
            finally
            {
                foreach (var stream in streams.Values)
                {
                    try { stream.Dispose(); } catch { }
                }
            }
        }

        private static string UniqueName(IDictionary<string, Stream> streams, string name)
        {
            if (!streams.ContainsKey(name))
                return name;

            var stem = Path.GetFileNameWithoutExtension(name);
            var ext = Path.GetExtension(name);
            for (var i = 2; ; i++)
            {
                var candidate = stem + "-" + i + ext;
                if (!streams.ContainsKey(candidate))
                    return candidate;
            }
        }

        private void Log(string message)
        {
            _log?.LogWarning(nameof(SubmissionCloudStorageUploader), message);
        }
    }
}
