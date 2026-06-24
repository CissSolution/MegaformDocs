using System;
using System.Collections.Generic;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Pure, host-agnostic extractor that turns a submission's File/PdfForm field
    /// values into <see cref="FileInfo"/> rows for the <c>MF_Files</c> table.
    ///
    /// WHY: the upload endpoint (Oqtane <c>UploadFile</c> / DNN <c>UploadFileController</c>)
    /// writes the file to disk and returns a metadata object, but the SUBMISSION itself
    /// doesn't exist yet at upload time, so no <c>MF_Files</c> row can be created. The
    /// client renderer stores the upload metadata as <c>JSON.stringify(filesMeta)</c> in
    /// the File field's value (see <c>megaform-renderer.ts</c> setHiddenValue), so once
    /// the submission is persisted we can parse those values back into rows and link them
    /// to the new SubmissionId. This is what makes the SDK Files API
    /// (<c>IMegaFormClient.Files.GetBySubmission</c>) return data.
    ///
    /// The key-name tolerance mirrors the client reader (<c>file-links.ts</c>): the meta
    /// may use camelCase or PascalCase and the path may live under tempPath/filePath/
    /// storedPath/path. Author-custom shapes that carry only a filename still produce a
    /// row (StoredPath empty → the file simply isn't downloadable, but it's recorded).
    ///
    /// Pure: no I/O, no platform deps — unit-tested in MegaForm.Sdk.Tests.
    /// </summary>
    public static class SubmissionFileMetaExtractor
    {
        // Field types whose value carries uploaded-file metadata. Mirrors the
        // UploadFile field-type whitelist (File + PdfForm).
        private static readonly HashSet<string> FileFieldTypes =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "File", "PdfForm" };

        private static readonly string[] NameKeys =
            { "fileName", "FileName", "originalName", "OriginalName", "name", "Name" };
        private static readonly string[] PathKeys =
            { "tempPath", "filePath", "storedPath", "StoredPath", "TempPath", "FilePath", "path", "Path" };
        private static readonly string[] ContentTypeKeys =
            { "contentType", "ContentType" };
        private static readonly string[] SizeKeys =
            { "fileSize", "FileSize", "fileSizeBytes", "FileSizeBytes", "sizeBytes", "SizeBytes" };

        /// <summary>
        /// Extract <see cref="FileInfo"/> rows from a submission's data, for the
        /// File/PdfForm fields present in <paramref name="flattenedFields"/>.
        /// </summary>
        /// <param name="flattenedFields">
        /// The form's fields, already flattened (Row columns descended). Only File/PdfForm
        /// fields are inspected. Null is treated as empty.
        /// </param>
        /// <param name="data">The submitted values (fieldKey → value). Null → no rows.</param>
        /// <param name="submissionId">Set on every returned row (the new submission id).</param>
        public static List<FileInfo> Extract(
            IEnumerable<FormField> flattenedFields,
            IDictionary<string, object> data,
            int submissionId = 0)
        {
            var rows = new List<FileInfo>();
            if (flattenedFields == null || data == null) return rows;

            foreach (var field in flattenedFields)
            {
                if (field == null || string.IsNullOrWhiteSpace(field.Key)) continue;
                if (!FileFieldTypes.Contains(field.Type ?? string.Empty)) continue;
                if (!data.TryGetValue(field.Key, out var raw) || raw == null) continue;

                var token = ToToken(raw);
                if (token == null) continue;

                foreach (var entry in Enumerate(token))
                {
                    var row = ToFileInfo(entry, field.Key, submissionId);
                    if (row != null) rows.Add(row);
                }
            }

            return rows;
        }

        // Convert an arbitrary submitted value into a JToken we can inspect.
        // The renderer stores JSON.stringify(filesMeta) → a string holding a JSON array;
        // some hosts may already deserialize it into a list/dict (Submit normalizes
        // JsonElement → CLR types). A bare non-JSON string is treated as a filename.
        private static JToken ToToken(object raw)
        {
            if (raw is string s)
            {
                var trimmed = s.Trim();
                if (trimmed.Length == 0) return null;
                // A leading bracket signals structured JSON (the renderer stores
                // JSON.stringify(filesMeta)). If it then fails to parse it's corrupt →
                // return null (skip) rather than recording the garbage as a filename.
                if (trimmed[0] == '[' || trimmed[0] == '{')
                {
                    try { return JToken.Parse(trimmed); }
                    catch { return null; }
                }
                // Plain string → a filename with no stored path (not downloadable).
                return new JValue(trimmed);
            }

            try { return JToken.FromObject(raw); }
            catch { return null; }
        }

        private static IEnumerable<JToken> Enumerate(JToken token)
        {
            if (token is JArray arr)
            {
                foreach (var item in arr)
                    if (item != null && item.Type != JTokenType.Null) yield return item;
            }
            else
            {
                yield return token;
            }
        }

        private static FileInfo ToFileInfo(JToken entry, string fieldKey, int submissionId)
        {
            string name, path, contentType;
            long size;

            if (entry is JObject obj)
            {
                // A PdfForm field stores a composite payload ({pdfFile, values, fields, …}) where
                // the uploaded-PDF metadata is NESTED under "pdfFile" — NOT at the top level (see
                // pdf-form-builder/index.ts + MegaFormUtils.PdfFormSubmissionPayload [JsonProperty
                // "pdfFile"]). Descend into it so PdfForm uploads are recorded, not dropped.
                if ((obj["pdfFile"] ?? obj["PdfFile"]) is JObject pdfObj)
                    obj = pdfObj;

                name = ReadString(obj, NameKeys);
                path = NormalizePath(ReadString(obj, PathKeys));
                contentType = ReadString(obj, ContentTypeKeys);
                size = ReadLong(obj, SizeKeys);
                if (string.IsNullOrEmpty(name)) name = GuessNameFromPath(path);
            }
            else if (entry is JValue val && val.Type != JTokenType.Null)
            {
                // Bare filename string.
                name = (val.ToString() ?? string.Empty).Trim();
                path = string.Empty;
                contentType = string.Empty;
                size = 0;
            }
            else
            {
                return null;
            }

            if (string.IsNullOrEmpty(name) && string.IsNullOrEmpty(path)) return null;

            return new FileInfo
            {
                SubmissionId = submissionId,
                FieldKey = fieldKey ?? string.Empty,
                OriginalName = string.IsNullOrEmpty(name) ? GuessNameFromPath(path) : name,
                StoredPath = path ?? string.Empty,
                ContentType = contentType ?? string.Empty,
                FileSizeBytes = size,
                UploadedOnUtc = DateTime.UtcNow
            };
        }

        private static string ReadString(JObject obj, string[] keys)
        {
            foreach (var key in keys)
            {
                var t = obj[key];
                if (t == null || t.Type == JTokenType.Null) continue;
                var v = t.Type == JTokenType.String ? t.Value<string>() : t.ToString();
                if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
            }
            return string.Empty;
        }

        private static long ReadLong(JObject obj, string[] keys)
        {
            foreach (var key in keys)
            {
                var t = obj[key];
                if (t == null || t.Type == JTokenType.Null) continue;
                if (t.Type == JTokenType.Integer || t.Type == JTokenType.Float)
                {
                    try { return (long)t.Value<double>(); } catch { }
                }
                if (long.TryParse(t.ToString(), out var parsed)) return parsed;
            }
            return 0;
        }

        // Mirrors file-links.ts normalizeStoredPath: backslash → slash, trim leading
        // slashes. The stored tempPath is already a clean relative path, but be defensive.
        private static string NormalizePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return string.Empty;
            var p = path.Replace('\\', '/').Trim();
            return p.TrimStart('/');
        }

        private static string GuessNameFromPath(string path)
        {
            if (string.IsNullOrEmpty(path)) return string.Empty;
            var normalized = path.Replace('\\', '/').TrimEnd('/');
            var idx = normalized.LastIndexOf('/');
            return idx >= 0 ? normalized.Substring(idx + 1) : normalized;
        }
    }
}
