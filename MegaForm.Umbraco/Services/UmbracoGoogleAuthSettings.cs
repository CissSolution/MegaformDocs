using MegaForm.Core.Interfaces;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco implementation of IGoogleAuthSettings.
    /// Reads Google service-account JSON from configuration or environment variables.
    /// </summary>
    public class UmbracoGoogleAuthSettings : IGoogleAuthSettings
    {
        private readonly IConfiguration _configuration;

        public UmbracoGoogleAuthSettings(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public string GetServiceAccountJson()
        {
            return _configuration["MegaForm:Google:ServiceAccountJson"]
                ?? System.Environment.GetEnvironmentVariable("MEGAFORM_GOOGLE_SERVICE_ACCOUNT_JSON")
                ?? string.Empty;
        }
    }
}
