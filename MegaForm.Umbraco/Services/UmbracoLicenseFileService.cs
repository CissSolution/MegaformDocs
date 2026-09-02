using System;
using System.IO;
using System.Text;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco-owned license.lic storage. Runtime-writable files live under App_Data,
    /// outside static web assets and independently from the Oqtane Marketplace bridge.
    /// </summary>
    public sealed class UmbracoLicenseFileService
    {
        public const int MaximumLicenseBytes = 64 * 1024;

        private readonly string _licensePath;

        public UmbracoLicenseFileService(IWebHostEnvironment environment)
        {
            var contentRoot = MegaFormUmbracoPaths.GetContentRoot(environment);
            _licensePath = Path.Combine(contentRoot, "App_Data", "MegaForm", LicenseService.FileName);
        }

        public string LicensePath => _licensePath;

        public UmbracoLicenseStatus GetStatus()
        {
            try
            {
                if (!File.Exists(_licensePath))
                {
                    return new UmbracoLicenseStatus
                    {
                        Installed = false,
                        Active = false,
                        State = "not-installed",
                        Message = "No license.lic file is installed. MegaForm is running in trial mode on public domains."
                    };
                }

                var value = (File.ReadAllText(_licensePath, Encoding.UTF8) ?? string.Empty).Trim();
                var active = LicenseService.IsValidLicenseValue(value);
                return new UmbracoLicenseStatus
                {
                    Installed = true,
                    Active = active,
                    State = active ? "active" : "invalid",
                    Message = active
                        ? "MegaForm is activated for this Umbraco installation."
                        : "The installed license.lic file is not valid."
                };
            }
            catch (Exception ex)
            {
                return new UmbracoLicenseStatus
                {
                    Installed = File.Exists(_licensePath),
                    Active = false,
                    State = "error",
                    Message = "The license file could not be read: " + ex.Message
                };
            }
        }

        public UmbracoLicenseStatus Install(byte[] content)
        {
            if (content == null || content.Length == 0)
                throw new InvalidOperationException("Choose a license.lic file to upload.");
            if (content.Length > MaximumLicenseBytes)
                throw new InvalidOperationException("The license file is too large.");

            var value = Encoding.UTF8.GetString(content).Trim().TrimStart('\uFEFF');
            if (!LicenseService.IsValidLicenseValue(value))
                throw new InvalidOperationException("This license.lic file is not valid for MegaForm.");

            var directory = Path.GetDirectoryName(_licensePath);
            Directory.CreateDirectory(directory);
            var tempPath = Path.Combine(directory, ".license-" + Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                File.WriteAllText(tempPath, value, new UTF8Encoding(false));
                File.Move(tempPath, _licensePath, true);
            }
            finally
            {
                if (File.Exists(tempPath)) File.Delete(tempPath);
            }

            LicenseService.InvalidateCache();
            return GetStatus();
        }

        public UmbracoLicenseStatus Remove()
        {
            if (File.Exists(_licensePath)) File.Delete(_licensePath);
            LicenseService.InvalidateCache();
            return GetStatus();
        }

        public bool IsLicensed()
        {
            try
            {
                if (!File.Exists(_licensePath)) return false;
                return LicenseService.IsValidLicenseValue(File.ReadAllText(_licensePath, Encoding.UTF8));
            }
            catch
            {
                return false;
            }
        }
    }

    public sealed class UmbracoLicenseStatus
    {
        public bool Installed { get; set; }
        public bool Active { get; set; }
        public string State { get; set; }
        public string Message { get; set; }
    }
}
