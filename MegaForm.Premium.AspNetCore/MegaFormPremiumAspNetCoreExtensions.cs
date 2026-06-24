using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using MegaForm.AspNetCore.Component;
using MegaForm.Core.Services;
using MegaForm.Premium.AspNetCore.Controllers;
using MegaForm.Premium.AspNetCore.Services;
using MegaForm.Web.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;

namespace MegaForm.Premium.AspNetCore
{
    /// <summary>
    /// Runtime feature toggles for the premium add-on.
    /// </summary>
    internal sealed class PremiumMegaFormFeatureToggles : IMegaFormFeatureToggles
    {
        public bool Workflow => true;
        public bool PremiumTemplates => true;
    }

    /// <summary>
    /// Extension methods for registering the MegaForm Premium add-on in an
    /// ASP.NET Core host.
    /// </summary>
    public static class MegaFormPremiumAspNetCoreExtensions
    {
        private const string StaticAssetPrefix = "/megaform/";
        private const string ResourceNamespacePrefix = "MegaForm.Premium.AspNetCore.wwwroot";

        /// <summary>
        /// Registers premium services: workflow engine, premium templates, and
        /// the workflow controller application part.
        /// </summary>
        public static WebApplicationBuilder AddMegaFormPremium(this WebApplicationBuilder builder)
        {
            if (builder == null) throw new ArgumentNullException(nameof(builder));

            // Make sure the premium controller assembly is discovered by MVC.
            builder.Services.AddControllersWithViews()
                .ConfigureApplicationPartManager(apm =>
                {
                    var premiumAssembly = typeof(WorkflowController).Assembly;
                    if (!apm.ApplicationParts.OfType<AssemblyPart>().Any(p => p.Assembly == premiumAssembly))
                    {
                        apm.ApplicationParts.Add(new AssemblyPart(premiumAssembly));
                    }
                });

            // Override free-tier feature flags with premium values.
            builder.Services.AddSingleton<IMegaFormFeatureToggles, PremiumMegaFormFeatureToggles>();

            // Real workflow engine replaces the free no-op implementation.
            builder.Services.AddScoped<MegaForm.Core.Interfaces.IWorkflowEngine, WorkflowEngineV2>();

            // Premium template source for the builder gallery.
            builder.Services.AddSingleton<IPremiumTemplateSource, EmbeddedPremiumTemplateSource>();

            return builder;
        }

        /// <summary>
        /// Adds static-file serving for premium assets (workflow bundles) and
        /// ensures premium content is reachable before the core MegaForm middleware.
        /// </summary>
        public static WebApplication UseMegaFormPremium(this WebApplication app)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));

            app.Use(EmbeddedResourceMiddleware);

            return app;
        }

        private static async Task EmbeddedResourceMiddleware(HttpContext context, RequestDelegate next)
        {
            var path = context.Request.Path.Value ?? string.Empty;
            if (!path.StartsWith(StaticAssetPrefix, StringComparison.OrdinalIgnoreCase))
            {
                await next(context);
                return;
            }

            var assembly = typeof(MegaFormPremiumAspNetCoreExtensions).Assembly;
            var resourceName = ResourceNamespacePrefix + path.Replace('/', '.').TrimEnd('.');
            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
            {
                await next(context);
                return;
            }

            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(path, out var contentType))
                contentType = "application/octet-stream";

            context.Response.ContentType = contentType;
            context.Response.Headers["Cache-Control"] = "public,max-age=86400";
            await stream.CopyToAsync(context.Response.Body);
        }
    }
}
