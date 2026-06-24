using System;
using MegaForm.Core.Interfaces;
using Microsoft.Extensions.Configuration;
using Oqtane.Infrastructure;
using Oqtane.Repository;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// Oqtane implementation of IGoogleAuthSettings.
    /// Reads the Service Account JSON from (in priority order):
    /// 1. The current site's setting <c>MegaForm_Google_ServiceAccountJson</c>
    ///    (saved at runtime from the dashboard "Google Sheets" settings page —
    ///    no restart needed). Resolved per request via the tenant alias.
    /// 2. appsettings.json → <c>MegaForm:Google:ServiceAccountJson</c>
    /// 3. Environment variable → <c>MEGAFORM_GOOGLE_SERVICE_ACCOUNT_JSON</c>
    /// </summary>
    public class OqtaneGoogleAuthSettings : IGoogleAuthSettings
    {
        // Keep in sync with the settings controller (GoogleSheetsSettingKeys).
        public const string ServiceAccountJsonKey = "MegaForm_Google_ServiceAccountJson";

        private readonly IConfiguration _configuration;
        private readonly ISettingRepository _settings;
        private readonly ITenantManager _tenantManager;

        public OqtaneGoogleAuthSettings(
            IConfiguration configuration,
            ISettingRepository settings,
            ITenantManager tenantManager)
        {
            _configuration = configuration;
            _settings = settings;
            _tenantManager = tenantManager;
        }

        public string GetServiceAccountJson()
        {
            var fromSite = ReadSiteSetting(ServiceAccountJsonKey);
            if (!string.IsNullOrWhiteSpace(fromSite))
                return fromSite;

            var fromConfig = _configuration != null ? _configuration["MegaForm:Google:ServiceAccountJson"] : null;
            if (!string.IsNullOrWhiteSpace(fromConfig))
                return fromConfig;

            return Environment.GetEnvironmentVariable("MEGAFORM_GOOGLE_SERVICE_ACCOUNT_JSON") ?? string.Empty;
        }

        private string ReadSiteSetting(string key)
        {
            try
            {
                if (_settings == null) return null;
                // Primary: the current tenant's real SiteId (from the request alias).
                var alias = _tenantManager != null ? _tenantManager.GetAlias() : null;
                var siteId = alias != null ? alias.SiteId : 0;
                if (siteId > 0)
                {
                    var s = _settings.GetSetting(EntityNames.Site, siteId, key);
                    if (s != null && !string.IsNullOrWhiteSpace(s.SettingValue)) return s.SettingValue;
                }
                // Fallback: the settings controller resolves the site via AuthEntityId(Site),
                // which on some Oqtane tenants returns -1 → the JSON is stored under
                // (Site, -1). Read that scope too so the runtime push works regardless of
                // which site id the save landed under. (Also covers background execution where
                // GetAlias() is unavailable.)
                var hostSetting = _settings.GetSetting(EntityNames.Site, -1, key);
                return hostSetting != null && !string.IsNullOrWhiteSpace(hostSetting.SettingValue)
                    ? hostSetting.SettingValue : null;
            }
            catch
            {
                return null;
            }
        }
    }
}
