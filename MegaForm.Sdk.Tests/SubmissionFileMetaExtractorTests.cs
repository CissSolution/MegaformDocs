using System.Collections.Generic;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using Xunit;

namespace MegaForm.Sdk.Tests
{
    /// <summary>
    /// [SDK Files A v20260616] Guards SubmissionFileMetaExtractor — the pure parser that
    /// turns a submission's File/PdfForm field values into MF_Files rows. This is what
    /// makes the SDK Files API return data after a normal form submit (the upload endpoint
    /// only writes disk + returns metadata; the row is created post-submit from that meta).
    /// Mirrors the client reader (file-links.ts) key tolerance.
    /// </summary>
    public class SubmissionFileMetaExtractorTests
    {
        private static FormField FileField(string key, string type = "File") =>
            new FormField { Key = key, Type = type };

        // The canonical shape the renderer stores: JSON.stringify of the upload responses.
        private const string ResumeMetaJson =
            "[{\"fileId\":0,\"fileName\":\"resume.pdf\",\"fileSize\":12345," +
            "\"contentType\":\"application/pdf\"," +
            "\"fileUrl\":\"/api/MegaForm/Files/Download?path=form-7%2Ffield-cv%2Fabc.pdf\"," +
            "\"tempPath\":\"form-7/field-cv/abc.pdf\",\"storedIn\":\"private\"}]";

        [Fact]
        public void Extracts_canonical_stringified_array_meta()
        {
            var fields = new List<FormField> { FileField("cv") };
            var data = new Dictionary<string, object> { ["cv"] = ResumeMetaJson };

            var rows = SubmissionFileMetaExtractor.Extract(fields, data, submissionId: 42);

            var row = Assert.Single(rows);
            Assert.Equal(42, row.SubmissionId);
            Assert.Equal("cv", row.FieldKey);
            Assert.Equal("resume.pdf", row.OriginalName);
            Assert.Equal("form-7/field-cv/abc.pdf", row.StoredPath); // tempPath, NOT the url-encoded fileUrl
            Assert.Equal("application/pdf", row.ContentType);
            Assert.Equal(12345, row.FileSizeBytes);
        }

        [Fact]
        public void Handles_multiple_files_in_one_field()
        {
            var json = "[{\"fileName\":\"a.png\",\"tempPath\":\"f/1/a.png\",\"fileSize\":10}," +
                       "{\"fileName\":\"b.png\",\"tempPath\":\"f/1/b.png\",\"fileSize\":20}]";
            var fields = new List<FormField> { FileField("photos") };
            var data = new Dictionary<string, object> { ["photos"] = json };

            var rows = SubmissionFileMetaExtractor.Extract(fields, data, 5);

            Assert.Equal(2, rows.Count);
            Assert.Equal("a.png", rows[0].OriginalName);
            Assert.Equal("f/1/b.png", rows[1].StoredPath);
        }

        [Fact]
        public void Reads_pascalcase_and_already_deserialized_object()
        {
            // Already-deserialized list-of-dict (not a string) with PascalCase keys.
            var entry = new Dictionary<string, object>
            {
                ["OriginalName"] = "scan.tiff",
                ["StoredPath"] = "form-1/field-doc/x.tiff",
                ["ContentType"] = "image/tiff",
                ["FileSizeBytes"] = 999L,
            };
            var fields = new List<FormField> { FileField("doc", "PdfForm") };
            var data = new Dictionary<string, object> { ["doc"] = new List<object> { entry } };

            var rows = SubmissionFileMetaExtractor.Extract(fields, data, 1);

            var row = Assert.Single(rows);
            Assert.Equal("scan.tiff", row.OriginalName);
            Assert.Equal("form-1/field-doc/x.tiff", row.StoredPath);
            Assert.Equal("image/tiff", row.ContentType);
            Assert.Equal(999, row.FileSizeBytes);
        }

        [Fact]
        public void Single_object_not_wrapped_in_array()
        {
            var json = "{\"fileName\":\"solo.docx\",\"tempPath\":\"f/2/solo.docx\"}";
            var fields = new List<FormField> { FileField("attach") };
            var data = new Dictionary<string, object> { ["attach"] = json };

            var row = Assert.Single(SubmissionFileMetaExtractor.Extract(fields, data, 3));
            Assert.Equal("solo.docx", row.OriginalName);
            Assert.Equal("f/2/solo.docx", row.StoredPath);
        }

        [Fact]
        public void Derives_name_from_path_when_name_missing()
        {
            var json = "[{\"tempPath\":\"form-9/field-up/zzz.bin\"}]";
            var fields = new List<FormField> { FileField("up") };
            var data = new Dictionary<string, object> { ["up"] = json };

            var row = Assert.Single(SubmissionFileMetaExtractor.Extract(fields, data, 1));
            Assert.Equal("zzz.bin", row.OriginalName);
            Assert.Equal("form-9/field-up/zzz.bin", row.StoredPath);
        }

        [Fact]
        public void Ignores_non_file_fields_and_empty_or_garbage_values()
        {
            var fields = new List<FormField>
            {
                FileField("cv"),
                new FormField { Key = "name", Type = "Text" }, // not a file field
            };
            var data = new Dictionary<string, object>
            {
                ["cv"] = "",                       // empty → no row
                ["name"] = ResumeMetaJson,         // file-shaped but Text type → ignored
            };

            Assert.Empty(SubmissionFileMetaExtractor.Extract(fields, data, 1));

            // Malformed JSON → fail-soft, no row, no throw.
            var bad = new Dictionary<string, object> { ["cv"] = "[{not json" };
            Assert.Empty(SubmissionFileMetaExtractor.Extract(fields, bad, 1));
        }

        [Fact]
        public void Bare_filename_string_records_name_only_no_path()
        {
            var fields = new List<FormField> { FileField("cv") };
            var data = new Dictionary<string, object> { ["cv"] = "legacy-value.pdf" };

            var row = Assert.Single(SubmissionFileMetaExtractor.Extract(fields, data, 1));
            Assert.Equal("legacy-value.pdf", row.OriginalName);
            Assert.Equal(string.Empty, row.StoredPath);
        }

        [Fact]
        public void PdfForm_payload_descends_into_nested_pdfFile()
        {
            // PdfForm stores a composite payload; the uploaded PDF metadata is nested under "pdfFile".
            var payload =
                "{\"badge\":\"pdfform\",\"values\":{\"a\":\"1\"},\"fields\":[]," +
                "\"pdfFile\":{\"fileName\":\"contract.pdf\",\"fileSize\":55555," +
                "\"contentType\":\"application/pdf\",\"tempPath\":\"form-3/field-pdf/zzz.pdf\",\"storedIn\":\"private\"}}";
            var fields = new List<FormField> { FileField("pdf", "PdfForm") };
            var data = new Dictionary<string, object> { ["pdf"] = payload };

            var row = Assert.Single(SubmissionFileMetaExtractor.Extract(fields, data, 9));
            Assert.Equal("contract.pdf", row.OriginalName);
            Assert.Equal("form-3/field-pdf/zzz.pdf", row.StoredPath);
            Assert.Equal("application/pdf", row.ContentType);
            Assert.Equal(55555, row.FileSizeBytes);
        }

        [Fact]
        public void PdfForm_payload_with_no_uploaded_pdf_records_nothing()
        {
            // No pdfFile child (PDF not uploaded) → no top-level name/path → no garbage row.
            var payload = "{\"badge\":\"pdfform\",\"values\":{\"a\":\"1\"},\"fields\":[]}";
            var fields = new List<FormField> { FileField("pdf", "PdfForm") };
            var data = new Dictionary<string, object> { ["pdf"] = payload };

            Assert.Empty(SubmissionFileMetaExtractor.Extract(fields, data, 9));
        }

        [Fact]
        public void Null_inputs_return_empty_never_throw()
        {
            Assert.Empty(SubmissionFileMetaExtractor.Extract(null, new Dictionary<string, object>(), 1));
            Assert.Empty(SubmissionFileMetaExtractor.Extract(new List<FormField>(), null, 1));
        }
    }
}
