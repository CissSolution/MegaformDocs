using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Umbraco.Services;

namespace MegaForm.Umbraco.StartupFilters
{
    /// <summary>
    /// Points <see cref="MegaFormAssetVersion"/> at the web root file provider at startup, so the
    /// cache-busting token on every MegaForm script and stylesheet follows the ASSET files rather
    /// than the assembly. A bundle rebuild that never touches the DLL still has to reach browsers.
    /// </summary>
    public class MegaFormAssetVersionStartupFilter : IStartupFilter
    {
        private readonly IWebHostEnvironment _environment;

        public MegaFormAssetVersionStartupFilter(IWebHostEnvironment environment)
        {
            _environment = environment;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                try
                {
                    if (_environment?.WebRootFileProvider != null)
                        MegaFormAssetVersion.UseFileProvider(_environment.WebRootFileProvider);
                }
                catch
                {
                    // A cache-bust token is never worth failing startup over; the assembly
                    // timestamp fallback still applies.
                }

                next(app);
            };
        }
    }
}
