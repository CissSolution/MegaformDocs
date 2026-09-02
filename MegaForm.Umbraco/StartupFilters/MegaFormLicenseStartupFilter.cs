using System;
using MegaForm.Core.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Umbraco.Services;

namespace MegaForm.Umbraco.StartupFilters
{
    /// <summary>
    /// Registers the Umbraco license probe once the application pipeline is built.
    /// Local development remains unrestricted. Public domains can be activated by uploading
    /// license.lic in MegaForm Settings; Oqtane Marketplace licensing is not used here.
    /// </summary>
    public class MegaFormLicenseStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                var httpContextAccessor = app.ApplicationServices.GetService<IHttpContextAccessor>();
                var licenseFiles = app.ApplicationServices.GetService<UmbracoLicenseFileService>();
                if (httpContextAccessor != null && licenseFiles != null)
                {
                    LicenseService.RegisterExternalLicenseProbe(() =>
                    {
                        try
                        {
                            var host = httpContextAccessor.HttpContext?.Request?.Host.Host;
                            return (!string.IsNullOrWhiteSpace(host) && LicenseService.IsLocalHost(host))
                                || licenseFiles.IsLicensed();
                        }
                        catch
                        {
                            return false;
                        }
                    });
                }

                next(app);
            };
        }
    }
}
