using System;
using System.IO;
using DotNetNuke.Services.FileSystem;
using MegaForm.Core.Services;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// Stores form uploads through DNN's Folder Provider abstraction. When the selected/default
    /// DNN folder mapping uses Azure Storage, MegaForm uploads to Azure without loading Azure SDK
    /// assemblies into the module itself.
    /// </summary>
    public static class DnnPortalFolderStorage
    {
        public const string StoredPathPrefix = "dnnfile:";

        public static DnnPortalStoredFile Save(int portalId, string folderPath, string originalName, Stream stream)
        {
            if (portalId < 0) throw new InvalidOperationException("A DNN portal is required for folder-provider storage.");
            if (stream == null) throw new ArgumentNullException(nameof(stream));

            var normalizedFolder = NormalizeFolder(folderPath);
            var folder = FolderManager.Instance.GetFolder(portalId, normalizedFolder)
                ?? FolderManager.Instance.AddFolder(portalId, normalizedFolder);
            if (folder == null) throw new InvalidOperationException("DNN could not create or open the upload folder.");

            var extension = Path.GetExtension(originalName ?? string.Empty);
            var baseName = Path.GetFileNameWithoutExtension(originalName ?? "file");
            baseName = FileUploadSecurityService.SanitizePathSegment(baseName, "file");
            var storedName = baseName + "-" + Guid.NewGuid().ToString("N").Substring(0, 16) + extension;
            var file = FileManager.Instance.AddFile(folder, storedName, stream, true);
            if (file == null) throw new InvalidOperationException("DNN Folder Provider did not return the uploaded file.");

            return new DnnPortalStoredFile
            {
                FileId = file.FileId,
                StoredPath = StoredPathPrefix + file.FileId,
                RelativePath = file.RelativePath,
                Url = FileManager.Instance.GetUrl(file),
                ContentType = file.ContentType,
                Size = file.Size,
                FileName = originalName
            };
        }

        public static IFileInfo GetFile(string storedPath)
        {
            if (!TryGetFileId(storedPath, out var fileId)) return null;
            return FileManager.Instance.GetFile(fileId);
        }

        public static Stream OpenRead(string storedPath)
        {
            var file = GetFile(storedPath);
            return file == null ? null : FileManager.Instance.GetFileContent(file);
        }

        public static bool TryGetFileId(string storedPath, out int fileId)
        {
            fileId = 0;
            var raw = (storedPath ?? string.Empty).Trim();
            if (!raw.StartsWith(StoredPathPrefix, StringComparison.OrdinalIgnoreCase)) return false;
            return int.TryParse(raw.Substring(StoredPathPrefix.Length), out fileId) && fileId > 0;
        }

        private static string NormalizeFolder(string folderPath)
        {
            var raw = string.IsNullOrWhiteSpace(folderPath) ? "MegaForm/Uploads" : folderPath;
            var parts = raw.Replace('\\', '/').Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            for (var i = 0; i < parts.Length; i++)
                parts[i] = FileUploadSecurityService.SanitizePathSegment(parts[i], "uploads");
            return string.Join("/", parts) + "/";
        }
    }

    public sealed class DnnPortalStoredFile
    {
        public int FileId { get; set; }
        public string StoredPath { get; set; }
        public string RelativePath { get; set; }
        public string Url { get; set; }
        public string ContentType { get; set; }
        public long Size { get; set; }
        public string FileName { get; set; }
    }
}
