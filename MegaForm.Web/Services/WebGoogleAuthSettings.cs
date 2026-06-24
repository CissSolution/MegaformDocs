using MegaForm.Core.Interfaces;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Web standalone implementation of IGoogleAuthSettings.
    /// Reads from appsettings.json or environment variables.
    /// </summary>
    public class WebGoogleAuthSettings : IGoogleAuthSettings
    {
        private readonly IConfiguration _configuration;

        public WebGoogleAuthSettings(IConfiguration configuration)
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
