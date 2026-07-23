using System;
using System.IO;

namespace MegaForm.Core.Integrations.Storage
{
    /// <summary>
    /// Resolves a named cloud storage connection (from the platform settings blob stored under
    /// <see cref="CloudStorageConnectionCatalog.SettingKey"/>) to provider-facing settings.
    /// Implemented per host, where the settings store lives. Returns null when the name is unknown.
    /// </summary>
    public interface ICloudStorageConnectionProvider
    {
        StorageConnectionSettings GetConnection(string name);
    }

    /// <summary>
    /// Stock implementation: resolves connections from the shared JSON catalog blob, which the
    /// host reads from its own settings store via <paramref name="getBlobJson"/>.
    /// </summary>
    public sealed class DelegateCloudStorageConnectionProvider : ICloudStorageConnectionProvider
    {
        private readonly Func<string> _getBlobJson;

        public DelegateCloudStorageConnectionProvider(Func<string> getBlobJson)
        {
            _getBlobJson = getBlobJson ?? throw new ArgumentNullException(nameof(getBlobJson));
        }

        public StorageConnectionSettings GetConnection(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return null;
            string blob;
            try
            {
                blob = _getBlobJson();
            }
            catch
            {
                return null;
            }
            return CloudStorageConnectionCatalog.ToConnectionSettings(CloudStorageConnectionCatalog.Find(blob, name));
        }
    }

    /// <summary>
    /// Opens a previously uploaded submission file for reading, given the relative stored path
    /// recorded in MF_Files / the upload metadata. Implemented per host, where the
    /// relative → absolute path mapping lives (same mapping the Files/Download endpoint uses).
    /// Returns null when the file cannot be opened (caller treats it as "skip this file").
    /// </summary>
    public interface ISubmissionFileBlobReader
    {
        Stream OpenRead(string storedPath);
    }
}
