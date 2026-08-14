using System;
using MegaForm.Umbraco.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace MegaForm.Umbraco.StartupFilters
{
    /// <summary>
    /// Inserts the MegaForm CORS middleware early in the pipeline so that
    /// public embed/script endpoints work without requiring Umbraco auth.
    /// The middleware is only applied to MegaForm request paths.
    /// </summary>
    public class MegaFormCorsStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                app.UseWhen(
                    context =>
                    {
                        var path = context.Request.Path;
                        return path.StartsWithSegments("/megaform", StringComparison.OrdinalIgnoreCase)
                            || path.StartsWithSegments("/umbraco/MegaForm", StringComparison.OrdinalIgnoreCase)
                            || path.StartsWithSegments("/api/MegaForm", StringComparison.OrdinalIgnoreCase);
                    },
                    branch => branch.UseCors(MegaFormUmbracoCorsExtensions.MegaFormCorsPolicyName));

                next(app);
            };
        }
    }
}
