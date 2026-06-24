// ============================================================
// MegaForm Core — Starter Seed Attachment
// ----------------------------------------------------------------
// Platform-agnostic helper used by Business Starter services
// (LeaveRequest, Proposal, DocumentExchange, PurchaseOrder) to
// generate the small sample PDF files that ship with the seeded
// submissions. Both DNN (net472) and Oqtane (net9.0) compile this
// from MegaForm.Core, so the seed PDF logic exists in exactly one
// place. Adapter (IStarterPlatformAdapter.PersistSeededAttachments)
// is responsible for inserting the FileInfo rows into the database.
// ============================================================

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services.Starters
{
    public sealed class StarterSeedAttachment
    {
        public StarterSeedAttachment(string fieldKey, string fileName, string relativePath, string contentType, long fileSizeBytes)
        {
            FieldKey = fieldKey ?? string.Empty;
            FileName = fileName ?? "Attachment.pdf";
            RelativePath = relativePath ?? string.Empty;
            ContentType = string.IsNullOrWhiteSpace(contentType) ? "application/octet-stream" : contentType;
            FileSizeBytes = Math.Max(0L, fileSizeBytes);
        }

        public string FieldKey { get; }
        public string FileName { get; }
        public string RelativePath { get; }
        public string ContentType { get; }
        public long FileSizeBytes { get; }

        public Dictionary<string, object> ToSubmissionValue()
        {
            return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["fileName"] = FileName,
                ["fileSize"] = FileSizeBytes,
                ["contentType"] = ContentType,
                ["fileUrl"] = "/api/MegaForm/Files/Download?path=" + Uri.EscapeDataString(RelativePath),
                ["tempPath"] = RelativePath,
                ["storedIn"] = "private"
            };
        }

        public MegaForm.Core.Models.FileInfo ToEntity(int submissionId)
        {
            return new MegaForm.Core.Models.FileInfo
            {
                SubmissionId = submissionId,
                FieldKey = FieldKey,
                OriginalName = FileName,
                StoredPath = RelativePath,
                ContentType = ContentType,
                FileSizeBytes = FileSizeBytes,
                UploadedOnUtc = DateTime.UtcNow
            };
        }
    }

    public static class StarterSeedAttachmentFactory
    {
        public static StarterSeedAttachment CreatePdfAttachment(int formId, string fieldKey, string fileName, string title, params string[] bodyLines)
        {
            var safeFieldKey = SanitizePathSegment(fieldKey, "file");
            var safeFileName = SanitizePdfFileName(fileName);
            var folder = Path.Combine(GetPrivateUploadsRoot(), "form-" + formId, "field-" + safeFieldKey);
            Directory.CreateDirectory(folder);

            var fullPath = Path.Combine(folder, safeFileName);
            var pdfBytes = BuildSimplePdf(title, bodyLines ?? new string[0]);
            File.WriteAllBytes(fullPath, pdfBytes);

            var relativePath = "form-" + formId + "/field-" + safeFieldKey + "/" + safeFileName;
            return new StarterSeedAttachment(fieldKey, fileName, relativePath, "application/pdf", pdfBytes.LongLength);
        }

        public static StarterSeedAttachment CreateSvgAttachment(int formId, string fieldKey, string fileName, string title, string backgroundColor, string accentColor)
        {
            var safeFieldKey = SanitizePathSegment(fieldKey, "file");
            var safeFileName = SanitizeSvgFileName(fileName);
            var folder = Path.Combine(GetPrivateUploadsRoot(), "form-" + formId, "field-" + safeFieldKey);
            Directory.CreateDirectory(folder);

            var label = string.IsNullOrWhiteSpace(title) ? "MegaForm Blog" : title.Trim();
            var bg = string.IsNullOrWhiteSpace(backgroundColor) ? "#0f172a" : backgroundColor.Trim();
            var accent = string.IsNullOrWhiteSpace(accentColor) ? "#38bdf8" : accentColor.Trim();
            var svg = BuildSimpleSvg(label, bg, accent);
            var bytes = Encoding.UTF8.GetBytes(svg);
            var fullPath = Path.Combine(folder, safeFileName);
            File.WriteAllBytes(fullPath, bytes);

            var relativePath = "form-" + formId + "/field-" + safeFieldKey + "/" + safeFileName;
            return new StarterSeedAttachment(fieldKey, fileName, relativePath, "image/svg+xml", bytes.LongLength);
        }

        public static void DeleteFieldAttachments(int formId, params string[] fieldKeys)
        {
            if (formId <= 0 || fieldKeys == null || fieldKeys.Length == 0)
                return;

            foreach (var key in fieldKeys.Where(x => !string.IsNullOrWhiteSpace(x)))
            {
                var folder = Path.Combine(GetPrivateUploadsRoot(), "form-" + formId, "field-" + SanitizePathSegment(key, "file"));
                if (!Directory.Exists(folder))
                    continue;

                try
                {
                    Directory.Delete(folder, recursive: true);
                }
                catch
                {
                    // Best-effort cleanup only; starter reseed can overwrite files on the next run.
                }
            }
        }

        private static string GetPrivateUploadsRoot()
        {
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads");
        }

        private static string SanitizePathSegment(string input, string fallback)
        {
            var source = string.IsNullOrWhiteSpace(input) ? fallback : input.Trim();
            var sb = new StringBuilder(source.Length);
            foreach (var ch in source)
            {
                if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_')
                {
                    sb.Append(ch);
                }
                else
                {
                    sb.Append('-');
                }
            }

            var normalized = sb.ToString().Trim('-');
            while (normalized.IndexOf("--", StringComparison.Ordinal) >= 0)
                normalized = normalized.Replace("--", "-");

            return string.IsNullOrWhiteSpace(normalized) ? fallback : normalized;
        }

        private static string SanitizePdfFileName(string fileName)
        {
            var baseName = Path.GetFileNameWithoutExtension(fileName ?? string.Empty);
            var safeBase = SanitizePathSegment(baseName, "attachment");
            return safeBase + ".pdf";
        }

        private static string SanitizeSvgFileName(string fileName)
        {
            var baseName = Path.GetFileNameWithoutExtension(fileName ?? string.Empty);
            var safeBase = SanitizePathSegment(baseName, "image");
            return safeBase + ".svg";
        }

        private static string BuildSimpleSvg(string label, string backgroundColor, string accentColor)
        {
            var safeLabel = EscapeXml(label);
            return "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"675\" viewBox=\"0 0 1200 675\" role=\"img\" aria-label=\"" + safeLabel + "\">"
                + "<defs><linearGradient id=\"g\" x1=\"0\" x2=\"1\" y1=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"" + EscapeXml(backgroundColor) + "\"/><stop offset=\"1\" stop-color=\"" + EscapeXml(accentColor) + "\"/></linearGradient></defs>"
                + "<rect width=\"1200\" height=\"675\" fill=\"url(#g)\"/>"
                + "<circle cx=\"950\" cy=\"120\" r=\"160\" fill=\"#ffffff\" opacity=\"0.16\"/>"
                + "<circle cx=\"180\" cy=\"570\" r=\"220\" fill=\"#ffffff\" opacity=\"0.12\"/>"
                + "<rect x=\"96\" y=\"92\" width=\"1008\" height=\"491\" rx=\"36\" fill=\"#ffffff\" opacity=\"0.9\"/>"
                + "<text x=\"140\" y=\"210\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"26\" font-weight=\"700\" fill=\"#0f172a\" letter-spacing=\"2\">MEGAFORM BLOG</text>"
                + "<text x=\"140\" y=\"322\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"58\" font-weight=\"800\" fill=\"#0f172a\">" + safeLabel + "</text>"
                + "<rect x=\"140\" y=\"392\" width=\"360\" height=\"10\" rx=\"5\" fill=\"" + EscapeXml(accentColor) + "\"/>"
                + "<text x=\"140\" y=\"478\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"28\" fill=\"#334155\">Featured editorial image</text>"
                + "</svg>";
        }

        private static string EscapeXml(string value)
        {
            if (string.IsNullOrEmpty(value))
                return string.Empty;

            return value
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;")
                .Replace("'", "&apos;");
        }

        private static byte[] BuildSimplePdf(string title, IEnumerable<string> bodyLines)
        {
            var lines = new List<string>();
            if (!string.IsNullOrWhiteSpace(title))
                lines.Add(title.Trim());
            if (bodyLines != null)
                lines.AddRange(bodyLines.Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()));
            if (lines.Count == 0)
                lines.Add("MegaForm starter attachment");

            var content = new StringBuilder();
            content.AppendLine("BT");
            content.AppendLine("/F1 18 Tf");
            content.AppendLine("72 742 Td");
            content.AppendLine("(" + EscapePdfText(lines[0]) + ") Tj");
            content.AppendLine("0 -26 Td");
            content.AppendLine("/F1 11 Tf");
            for (var i = 1; i < lines.Count; i++)
            {
                if (i > 1)
                    content.AppendLine("0 -18 Td");
                content.AppendLine("(" + EscapePdfText(lines[i]) + ") Tj");
            }
            content.AppendLine("ET");

            var contentBytes = Encoding.ASCII.GetBytes(content.ToString());
            var objects = new List<string>
            {
                "<< /Type /Catalog /Pages 2 0 R >>",
                "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
                "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
                "<< /Length " + contentBytes.Length + " >>\nstream\n" + content + "endstream"
            };

            var pdf = new StringBuilder();
            pdf.Append("%PDF-1.4\n");
            var offsets = new List<int> { 0 };

            for (var i = 0; i < objects.Count; i++)
            {
                offsets.Add(Encoding.ASCII.GetByteCount(pdf.ToString()));
                pdf.Append(i + 1).Append(" 0 obj\n");
                pdf.Append(objects[i]).Append("\n");
                pdf.Append("endobj\n");
            }

            var xrefOffset = Encoding.ASCII.GetByteCount(pdf.ToString());
            pdf.Append("xref\n");
            pdf.Append("0 ").Append(objects.Count + 1).Append("\n");
            pdf.Append("0000000000 65535 f \n");
            for (var i = 1; i < offsets.Count; i++)
                pdf.Append(offsets[i].ToString("D10")).Append(" 00000 n \n");

            pdf.Append("trailer\n");
            pdf.Append("<< /Size ").Append(objects.Count + 1).Append(" /Root 1 0 R >>\n");
            pdf.Append("startxref\n");
            pdf.Append(xrefOffset).Append("\n");
            pdf.Append("%%EOF");

            return Encoding.ASCII.GetBytes(pdf.ToString());
        }

        private static string EscapePdfText(string value)
        {
            if (string.IsNullOrEmpty(value))
                return string.Empty;

            return value
                .Replace("\\", "\\\\")
                .Replace("(", "\\(")
                .Replace(")", "\\)");
        }
    }
}
