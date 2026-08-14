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
/// Seeds additional published sample forms (Newsletter and Support Ticket)
/// so the corporate website can demonstrate embedding different forms into
/// different pages (landing, support, contact, etc.).
/// </summary>
public class SampleFormsSeeder : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<SampleFormsSeeder> _logger;

    public SampleFormsSeeder(IServiceProvider services, IHostEnvironment environment, ILogger<SampleFormsSeeder> logger)
    {
        _services = services;
        _environment = environment;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IFormRepository>();

        EnsureForm(repo,
            title: "Newsletter Signup",
            description: "Simple newsletter signup form for the landing page sample.",
            schemaFileName: "NewsletterFormSchema.json",
            submitText: "Subscribe",
            successMessage: "Thank you for subscribing to our newsletter!");

        EnsureForm(repo,
            title: "Support Ticket",
            description: "Support ticket form for the support page sample.",
            schemaFileName: "SupportTicketFormSchema.json",
            submitText: "Open Ticket",
            successMessage: "Your support ticket has been created. We will respond shortly.");

        return Task.CompletedTask;
    }

    private void EnsureForm(IFormRepository repo, string title, string description,
        string schemaFileName, string submitText, string successMessage)
    {
        var existing = repo.ListForms(portalId: 0, status: null, search: title, pageSize: 10)
                           .FirstOrDefault(f => f.Title.Equals(title, StringComparison.OrdinalIgnoreCase));

        if (existing != null)
        {
            _logger.LogInformation("[CorporateWeb] Sample form already exists (Title={Title}, FormId={FormId}).", title, existing.FormId);
            return;
        }

        var schemaPath = Path.Combine(_environment.ContentRootPath, schemaFileName);
        var schemaJson = File.Exists(schemaPath)
            ? File.ReadAllText(schemaPath)
            : "{\"version\":\"1.0\",\"fields\":[]}";

        var form = new FormInfo
        {
            Title = title,
            Description = description,
            Status = "published",
            PortalId = 0,
            ModuleId = 0,
            SchemaJson = schemaJson,
            SettingsJson = "{}",
            ThemeJson = "{}",
            SubmitButtonText = submitText,
            SuccessMessage = successMessage,
            RedirectUrl = "",
            CreatedByUserId = 1,
            CreatedOnUtc = DateTime.UtcNow
        };

        var formId = repo.SaveForm(form);
        _logger.LogInformation("[CorporateWeb] Seeded sample form (Title={Title}, FormId={FormId}).", title, formId);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
