using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Samples.CorporateWeb;

/// <summary>
/// Ensures a published "Contact Us" form exists so the contact page can
/// embed it immediately without manual setup.
/// </summary>
public class ContactFormSeeder : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<ContactFormSeeder> _logger;

    public ContactFormSeeder(IServiceProvider services, IHostEnvironment environment, ILogger<ContactFormSeeder> logger)
    {
        _services = services;
        _environment = environment;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IFormRepository>();

        var existing = repo.ListForms(portalId: 0, status: "published", pageSize: 1).FirstOrDefault();
        if (existing != null)
        {
            _logger.LogInformation("[CorporateWeb] Published form already exists (FormId={FormId}).", existing.FormId);
            return Task.CompletedTask;
        }

        var schemaPath = Path.Combine(_environment.ContentRootPath, "ContactFormSchema.json");
        var schemaJson = File.Exists(schemaPath)
            ? File.ReadAllText(schemaPath)
            : "{\"version\":\"1.0\",\"fields\":[]}";

        var form = new FormInfo
        {
            Title = "Contact Us",
            Description = "Corporate contact form for the MegaForm corporate website sample.",
            Status = "published",
            PortalId = 0,
            ModuleId = 0,
            SchemaJson = schemaJson,
            SettingsJson = "{}",
            ThemeJson = "{}",
            SubmitButtonText = "Send Message",
            SuccessMessage = "Thank you for contacting us. We will get back to you shortly.",
            RedirectUrl = "",
            CreatedByUserId = 1,
            CreatedOnUtc = DateTime.UtcNow
        };

        var formId = repo.SaveForm(form);
        _logger.LogInformation("[CorporateWeb] Seeded contact form (FormId={FormId}).", formId);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
