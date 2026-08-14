using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Templates;
using MegaForm.Sdk;
using MegaForm.Web.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace MegaForm.Samples.SdkWebDemo.HostedServices
{
    /// <summary>
    /// Seeds a sample contact form on first run so the demo is immediately usable.
    /// </summary>
    public class SampleDataSeeder : IHostedService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<SampleDataSeeder> _logger;

        public SampleDataSeeder(IServiceProvider services, ILogger<SampleDataSeeder> logger)
        {
            _services = services;
            _logger = logger;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            using var scope = _services.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<IMegaFormClient>();
            var settings = scope.ServiceProvider.GetRequiredService<IModuleSettingsService>();
            var catalog = scope.ServiceProvider.GetRequiredService<IFormTemplateCatalogService>();
            var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
            var scopeCtx = new MegaFormScope { PortalId = 0, UserId = 1 };

            try
            {
                // Mark setup as complete so the admin login page is reachable.
                var lockPath = Path.Combine(env.ContentRootPath, "setup.lock");
                if (!File.Exists(lockPath))
                {
                    File.WriteAllText(lockPath, DateTime.UtcNow.ToString("O"));
                    _logger.LogInformation("setup.lock created; demo admin login is enabled.");
                }

                // Seed a demo admin account if one does not exist yet.
                EnsureDemoAdmin(settings);

                // Seed built-in templates so the builder gallery is not empty.
                await SeedTemplatesAsync(catalog, cancellationToken);

                // Seed a sample form if the database is empty.
                var existing = await client.Forms.ListFormsAsync(
                    new FormQuery { Page = 0, PageSize = 10 }, scopeCtx);

                if (existing.TotalCount > 0)
                {
                    _logger.LogInformation("Sample seeder skipped: {count} form(s) already exist.", existing.TotalCount);
                    return;
                }

                var form = await client.Forms.CreateFormAsync(new CreateFormRequest
                {
                    Title = "Event Registration",
                    Description = "A polished multi-step registration form demonstrating MegaForm's builder, conditional logic, multi-page layouts, file upload and rich themes.",
                    Status = "published",
                    SchemaJson = DemoSchemas.EventRegistration,
                    ThemeJson = DemoSchemas.EventTheme,
                    SettingsJson = DemoSchemas.EventSettings,
                    RequireAuth = false
                }, scopeCtx);

                _logger.LogInformation("Sample form created with id {formId}.", form.FormId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to seed sample data.");
            }
        }

        private async Task SeedTemplatesAsync(IFormTemplateCatalogService catalog, CancellationToken cancellationToken)
        {
            var count = await catalog.GetBuiltInCountAsync(cancellationToken);
            if (count > 0) return;

            await catalog.ImportFromJsonAsync("Contact Us", DemoSchemas.ContactForm, cancellationToken);
            await catalog.ImportFromJsonAsync("Event Registration", DemoSchemas.EventRegistration, cancellationToken);
            await catalog.ImportFromJsonAsync("Job Application", DemoSchemas.JobApplication, cancellationToken);
            _logger.LogInformation("Seeded {count} built-in form templates.", 3);
        }

        private void EnsureDemoAdmin(IModuleSettingsService settings)
        {
            var username = settings.GetSetting(0, "Admin_Username", "");
            if (!string.IsNullOrWhiteSpace(username))
                return;

            var salt = new byte[16];
            using (var rng = RandomNumberGenerator.Create())
                rng.GetBytes(salt);
            var saltB64 = Convert.ToBase64String(salt);

            using var pbkdf2 = new Rfc2898DeriveBytes("admin123", salt, 100_000, HashAlgorithmName.SHA256);
            var hash = Convert.ToBase64String(pbkdf2.GetBytes(32));

            settings.SetSetting(0, "Admin_Username", "admin");
            settings.SetSetting(0, "Admin_Email", "admin@example.com");
            settings.SetSetting(0, "Admin_Salt", saltB64);
            settings.SetSetting(0, "Admin_Hash", hash);

            _logger.LogInformation("Demo admin seeded (username: admin, password: admin123).");
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
