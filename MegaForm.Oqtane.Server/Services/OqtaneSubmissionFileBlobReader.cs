using System;
using System.IO;
using MegaForm.Core.Integrations.Storage;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [CloudStorage v20260723-01] Opens a previously uploaded submission file for the
    /// post-submit cloud mirror (SubmissionCloudStorageUploader). Maps the relative StoredPath
    /// (e.g. "form-12/field-upload/abcd1234efgh5678.pdf") to the SAME absolute location
    /// UploadFile writes (MegaFormController.cs ~:1812) and Files/Download reads (~:2034):
    /// {ContentRoot}/App_Data/MegaForm/PrivateUploads/. Canonical-path containment is copied
    /// from DownloadFile ([SecFix P1-8]) — traversal attempts and missing files return null
    /// (the uploader treats null as "skip this file").
    /// </summary>
    public sealed class OqtaneSubmissionFileBlobReader : ISubmissionFileBlobReader
    {
        private readonly IWebHostEnvironment _env;

        public OqtaneSubmissionFileBlobReader(IWebHostEnvironment env)
        {
            _env = env;
        }

        public Stream OpenRead(string storedPath)
        {
            if (string.IsNullOrWhiteSpace(storedPath)) return null;
            try
            {
                var appDataRoot = Path.GetFullPath(Path.Combine(_env.ContentRootPath ?? AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads"));
                var rel = storedPath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
                var fullPath = Path.GetFullPath(Path.Combine(appDataRoot, rel));
                var rootWithSep = appDataRoot.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!fullPath.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                    return null;
                return new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
            }
            catch
            {
                return null;
            }
        }
    }
}
