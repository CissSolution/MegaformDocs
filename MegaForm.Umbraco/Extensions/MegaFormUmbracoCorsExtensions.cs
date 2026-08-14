using System;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MegaForm.Umbraco.Extensions
{
    /// <summary>
    /// CORS configuration for MegaForm public embed/script endpoints on Umbraco.
    /// Mirrors the standalone Web host CORS setup so cross-origin embeds work.
    /// </summary>
    public static class MegaFormUmbracoCorsExtensions
    {
        public const string MegaFormCorsPolicyName = "MegaForm";

        /// <summary>
        /// Adds a named CORS policy for MegaForm public endpoints.
        /// Origins are read from MEGAFORM_CORS_ORIGINS (semicolon/comma separated)
        /// or configuration key "MegaForm:Cors:Origins". When no origins are
        /// configured the policy allows any origin (development default).
        /// </summary>
        public static IServiceCollection AddMegaFormCors(this IServiceCollection services, IConfiguration configuration)
        {
            if (services == null) throw new ArgumentNullException(nameof(services));

            var corsRaw = Environment.GetEnvironmentVariable("MEGAFORM_CORS_ORIGINS")
                ?? configuration?["MegaForm:Cors:Origins"]
                ?? string.Empty;
            var corsOrigins = corsRaw
                .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(o => o.Trim())
                .Where(o => !string.IsNullOrWhiteSpace(o))
                .ToArray();

            services.AddCors(options =>
            {
                options.AddPolicy(MegaFormCorsPolicyName, builder =>
                {
                    if (corsOrigins.Length > 0)
                        builder.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials();
                    else
                        builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
                });
            });

            return services;
        }

        /// <summary>
        /// Adds the MegaForm CORS middleware to the request pipeline.
        /// Call this before UseUmbraco() or immediately after UseRouting().
        /// </summary>
        public static IApplicationBuilder UseMegaFormCors(this IApplicationBuilder app)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));
            app.UseCors(MegaFormCorsPolicyName);
            return app;
        }
    }
}
