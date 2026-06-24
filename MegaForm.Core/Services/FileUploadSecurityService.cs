using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace MegaForm.Core.Services
{
    public static class FileUploadSecurityService
    {
        public const string Badge = "DNNUploadSecurity v20260419-11";

        public static string GetDefaultAllowedExtensionsCsv()
            => ".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt,.csv";

        public static string GetDefaultBlockedExtensionsCsv()
            => ".exe,.bat,.cmd,.com,.dll,.msi,.ps1,.sh,.php,.phtml,.aspx,.asp,.jsp,.js";

        public static HashSet<string> ParseExtensions(IEnumerable<string> values)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (values == null) return set;
            foreach (var raw in values)
            {
                var value = (raw ?? string.Empty).Trim().ToLowerInvariant();
                if (string.IsNullOrWhiteSpace(value)) continue;
                if (!value.StartsWith(".")) value = "." + value;
                set.Add(value);
            }
            return set;
        }

        public static HashSet<string> ParseExtensions(string csv)
        {
            return ParseExtensions((csv ?? string.Empty).Split(new[] { ',', '\n', '\r', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries));
        }

        public static string NormalizeExtensionsCsv(string csv, string fallback)
        {
            var set = ParseExtensions(string.IsNullOrWhiteSpace(csv) ? fallback : csv);
            return string.Join(",", set.OrderBy(x => x));
        }

        public static string SanitizePathSegment(string value, string fallback)
        {
            var text = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
            var invalid = Path.GetInvalidFileNameChars();
            var sb = new StringBuilder();
            foreach (var ch in text)
            {
                if (ch == '/' || ch == '\\' || invalid.Contains(ch)) sb.Append('-');
                else sb.Append(ch);
            }
            var result = sb.ToString().Trim().Trim('.');
            return string.IsNullOrWhiteSpace(result) ? fallback : result;
        }

        public static bool ValidateContentByExtension(Stream stream, string extension)
        {
            if (stream == null || !stream.CanRead) return false;
            var ext = (extension ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(ext)) return false;

            var canSeek = stream.CanSeek;
            long pos = 0;
            if (canSeek) pos = stream.Position;
            try
            {
                if (canSeek) stream.Position = 0;
                var header = new byte[560];
                var read = stream.Read(header, 0, header.Length);
                if (read <= 0) return false;

                switch (ext)
                {
                    case ".jpg":
                    case ".jpeg":
                        return read >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF;
                    case ".png":
                        return read >= 8 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47 && header[4] == 0x0D && header[5] == 0x0A && header[6] == 0x1A && header[7] == 0x0A;
                    case ".gif":
                        return read >= 6 && header[0] == (byte)'G' && header[1] == (byte)'I' && header[2] == (byte)'F' && header[3] == (byte)'8' && (header[4] == (byte)'7' || header[4] == (byte)'9') && header[5] == (byte)'a';
                    case ".webp":
                        return read >= 12 && header[0] == (byte)'R' && header[1] == (byte)'I' && header[2] == (byte)'F' && header[3] == (byte)'F' && header[8] == (byte)'W' && header[9] == (byte)'E' && header[10] == (byte)'B' && header[11] == (byte)'P';
                    case ".pdf":
                        return read >= 4 && header[0] == (byte)'%' && header[1] == (byte)'P' && header[2] == (byte)'D' && header[3] == (byte)'F';
                    case ".doc":
                    case ".xls":
                    case ".ppt":
                        return read >= 4 && header[0] == 0xD0 && header[1] == 0xCF && header[2] == 0x11 && header[3] == 0xE0;
                    case ".docx":
                    case ".xlsx":
                    case ".pptx":
                    case ".zip":
                        return read >= 4 && header[0] == 0x50 && header[1] == 0x4B && (header[2] == 0x03 || header[2] == 0x05 || header[2] == 0x07) && (header[3] == 0x04 || header[3] == 0x06 || header[3] == 0x08);
                    case ".txt":
                    case ".csv":
                        return IsLikelyText(header, read);
                    default:
                        return true;
                }
            }
            finally
            {
                if (canSeek) stream.Position = pos;
            }
        }

        private static bool IsLikelyText(byte[] buffer, int count)
        {
            if (buffer == null || count <= 0) return false;
            var suspicious = 0;
            for (var i = 0; i < count; i++)
            {
                var b = buffer[i];
                if (b == 0) return false;
                if (b < 0x09) suspicious++;
                else if (b > 0x0D && b < 0x20) suspicious++;
            }
            return suspicious <= Math.Max(8, count / 20);
        }
    }
}
