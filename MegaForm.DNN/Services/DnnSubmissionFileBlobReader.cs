using System;
using System.IO;
using System.Web.Hosting;
using MegaForm.Core.Integrations.Storage;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// [CloudStorage v20260723-01] Opens a previously uploaded submission file so the
    /// cloud storage mirror (SubmissionCloudStorageUploader) can push it to Drive/S3/Azure.
    /// Same relative → absolute mapping as the DNN upload pipeline and the Files/Download
    /// endpoint: stored paths are relative to ~/App_Data/MegaForm/PrivateUploads (see
    /// MegaFormApiController.UploadFile :3292-3306). Canonical-path containment mirrors
    /// DnnDiskStorageService.ResolveFull, but returns null instead of throwing — the
    /// uploader treats null as "skip this file" (fail-soft by contract).
    /// </summary>
    public sealed class DnnSubmissionFileBlobReader : ISubmissionFileBlobReader
    {
        public Stream OpenRead(string storedPath)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(storedPath)) return null;

                var root = Path.GetFullPath(
                    HostingEnvironment.MapPath("~/App_Data/MegaForm/PrivateUploads")
                    ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "App_Data", "MegaForm", "PrivateUploads"));
                var rel = storedPath.TrimStart('/', '\\').Replace('/', Path.DirectorySeparatorChar);
                var full = Path.GetFullPath(Path.Combine(root, rel));
                var prefix = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;

                return File.Exists(full)
                    ? new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read)
                    : null;
            }
            catch
            {
                return null;
            }
        }
    }
}
