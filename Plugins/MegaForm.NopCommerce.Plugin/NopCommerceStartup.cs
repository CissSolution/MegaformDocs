using System;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using MegaForm.AspNetCore.Component;
using Nop.Core.Infrastructure;
using Nop.Data;

namespace MegaForm.NopCommerce.Plugin
{
    /// <summary>
    /// nopCommerce startup wiring for MegaForm services, controller discovery, and static assets.
    /// </summary>
    public class NopCommerceStartup : INopStartup
    {
        public int Order => 1;

        public void ConfigureServices(IServiceCollection services, IConfiguration configuration)
        {
            var settings = configuration.GetSection("MegaForm").Get<MegaFormNopCommerceSettings>()
                           ?? new MegaFormNopCommerceSettings();

            // Fall back to nopCommerce's own database so the plugin works out of the box.
            var nopData = DataSettingsManager.LoadSettings(reload: false);
            if (string.IsNullOrWhiteSpace(settings.ConnectionString) && nopData != null)
            {
                settings.ConnectionString = nopData.ConnectionString;
                settings.DatabaseProvider = MapNopProvider(nopData.DataProvider);
            }

            services.AddSingleton(settings);

            // Wire MegaForm shared services + EF database. We intentionally disable the
            // standalone Web host's auth, CORS, Swagger, and setup wizard — nopCommerce owns those.
            services.AddMegaForm(options =>
            {
                options.ConnectionString = settings.ConnectionString;
                options.DatabaseProvider = settings.DatabaseProvider ?? "SqlServer";
                options.UseMegaFormAuthentication = false;
                options.UseCors = false;
                options.UseSwagger = false;
                options.UseSetupWizard = false;
            });

            // The AspNetCore.Component registers MegaForm.Web controllers as an application part.
            // They are designed for the standalone Web host (different routes + views), so remove
            // that part and add this plugin's controllers instead.
            services.AddControllersWithViews()
                .ConfigureApplicationPartManager(apm =>
                {
                    var webPart = apm.ApplicationParts
                        .OfType<AssemblyPart>()
                        .FirstOrDefault(p => p.Assembly == typeof(MegaForm.Web.Controllers.MegaFormController).Assembly);
                    if (webPart != null)
                        apm.ApplicationParts.Remove(webPart);

                    if (!apm.ApplicationParts.OfType<AssemblyPart>().Any(p => p.Assembly == typeof(NopCommerceStartup).Assembly))
                        apm.ApplicationParts.Add(new AssemblyPart(typeof(NopCommerceStartup).Assembly));
                });

            // Override Web-host platform services with nopCommerce-specific implementations.
            services.AddScoped<MegaForm.Core.Interfaces.IPlatformContext, Services.NopCommercePlatformContext>();
            services.AddScoped<MegaForm.Core.Interfaces.IModuleSettingsService, Services.NopCommerceModuleSettingsService>();
            services.AddScoped<MegaForm.Core.Interfaces.IStorageService, Services.NopCommerceStorageService>();
            services.AddScoped<MegaForm.Core.i18n.ILocalizationProvider, Services.NopCommerceLocalizationProvider>();
            services.AddScoped<MegaForm.Core.Interfaces.IEmailSender, Services.NopCommerceEmailSender>();
            services.AddSingleton<MegaForm.Core.Interfaces.ILogService, Services.NopCommerceLogService>();
            services.AddScoped<MegaForm.Core.Interfaces.IWorkflowPrincipalResolver, Services.NopCommerceWorkflowPrincipalResolver>();
        }

        public void Configure(IApplicationBuilder application)
        {
            var env = application.ApplicationServices.GetRequiredService<IWebHostEnvironment>();
            var assetsPath = Path.Combine(env.ContentRootPath, "Plugins", "MegaForm.NopCommerce.Plugin", "Assets");

            if (Directory.Exists(assetsPath))
            {
                // Serve MegaForm static assets (JS, CSS, fonts, images) from the plugin folder at /megaform-assets.
                // This prefix is deliberately different from /megaform (used by the API/form routes) to avoid routing conflicts.
                application.UseStaticFiles(new StaticFileOptions
                {
                    FileProvider = new PhysicalFileProvider(assetsPath),
                    RequestPath = "/megaform-assets"
                });
            }
        }

        private static string MapNopProvider(Nop.Data.DataProviderType provider)
        {
            return provider switch
            {
                Nop.Data.DataProviderType.SqlServer => "SqlServer",
                Nop.Data.DataProviderType.MySql => "MySql",
                Nop.Data.DataProviderType.PostgreSQL => "PostgreSql",
                Nop.Data.DataProviderType.Unknown => "SqlServer",
                _ => "SqlServer"
            };
        }
    }
}
