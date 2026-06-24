using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Sdk;
using MegaForm.Umbraco.Data;
using MegaForm.Umbraco.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Umbraco.Composers
{
    /// <summary>
    /// Registers MegaForm services into Umbraco's DI container.
    /// Runs automatically at application startup.
    /// </summary>
    public class MegaFormComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            // Repositories
            builder.Services.AddScoped<IFormRepository, UmbracoFormRepository>();
            builder.Services.AddScoped<ISubmissionRepository, UmbracoSubmissionRepository>();
            builder.Services.AddScoped<IDraftRepository, UmbracoDraftRepository>();
            builder.Services.AddScoped<IFileRepository, UmbracoFileRepository>();
            builder.Services.AddScoped<IPhase2Repository, UmbracoPhase2Repository>();

            // Platform services
            builder.Services.AddScoped<IPlatformContext, UmbracoPlatformContext>();
            builder.Services.AddScoped<IEmailSender, UmbracoEmailSender>();
            builder.Services.AddScoped<ILogService, UmbracoLogService>();
            builder.Services.AddScoped<IStorageService, UmbracoStorageService>();
            builder.Services.AddScoped<IUmbracoModuleConfigService, UmbracoModuleConfigService>();

            // Core business services
            builder.Services.AddScoped<SubmissionProcessor>();

            // MegaForm SDK (IMegaFormClient facade) — resolves the repositories (incl.
            // IFileRepository), IPlatformContext, IStorageService + SubmissionProcessor
            // registered above. Umbraco has the full set, so the SDK Files API works here.
            builder.Services.AddMegaFormSdk();

            // EF DbContext wired to the same database connection Umbraco uses.
            builder.Services.AddDbContext<MegaFormDbContext>((serviceProvider, options) =>
            {
                var configuration = serviceProvider.GetRequiredService<IConfiguration>();
                var connectionString = configuration.GetConnectionString("umbracoDbDSN")
                    ?? configuration["ConnectionStrings:umbracoDbDSN"]
                    ?? configuration["umbracoDbDSN"];

                if (string.IsNullOrWhiteSpace(connectionString))
                {
                    throw new InvalidOperationException("Connection string 'umbracoDbDSN' was not found for MegaForm.Umbraco.");
                }

                options.UseSqlServer(connectionString);
            });
        }
    }
}
