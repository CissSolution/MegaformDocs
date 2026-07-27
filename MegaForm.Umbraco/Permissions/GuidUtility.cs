using System;
using System.Security.Cryptography;
using System.Text;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Helper for creating deterministic <see cref="Guid"/> values from string seeds.
    /// </summary>
    internal static class GuidUtility
    {
        /// <summary>
        /// Derives a deterministic GUID from a namespace and a name using SHA-1.
        /// The result follows the UUIDv5 layout (RFC 4122).
        /// </summary>
        internal static Guid Derive(string nameSpace, string name)
        {
            var namespaceBytes = Encoding.UTF8.GetBytes(nameSpace);
            var nameBytes = Encoding.UTF8.GetBytes(name);

            var combined = new byte[namespaceBytes.Length + nameBytes.Length];
            Buffer.BlockCopy(namespaceBytes, 0, combined, 0, namespaceBytes.Length);
            Buffer.BlockCopy(nameBytes, 0, combined, namespaceBytes.Length, nameBytes.Length);

            var hash = SHA1.HashData(combined);

            // RFC 4122 variant: set the version bits (5) and variant bits (10xx).
            hash[6] = (byte)((hash[6] & 0x0F) | 0x50);
            hash[8] = (byte)((hash[8] & 0x3F) | 0x80);

            return new Guid(hash[..16]);
        }
    }
}
