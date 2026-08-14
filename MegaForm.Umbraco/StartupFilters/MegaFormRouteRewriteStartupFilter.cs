using System;
using MegaForm.Umbraco.Middleware;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Umbraco.StartupFilters
{
    /// <summary>
    /// Inserts the MegaForm API route rewrite middleware at the start of the pipeline
    /// so shared UI calls to /api/MegaForm/ are handled before Umbraco's routing.
    /// </summary>
    public class MegaFormRouteRewriteStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                app.UseMiddleware<MegaFormApiRouteRewriteMiddleware>();
                next(app);
            };
        }
    }
}
