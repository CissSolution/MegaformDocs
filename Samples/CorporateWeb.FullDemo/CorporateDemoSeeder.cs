using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Sdk;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Samples.CorporateWeb.FullDemo;

/// <summary>
/// Seeds two published demo forms and a handful of sample submissions so the
/// list view, card view and dashboard pages have data to display immediately.
/// </summary>
public class CorporateDemoSeeder : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<CorporateDemoSeeder> _logger;

    public CorporateDemoSeeder(IServiceProvider services, IHostEnvironment environment, ILogger<CorporateDemoSeeder> logger)
    {
        _services = services;
        _environment = environment;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken); // let EnsureMegaFormDatabaseReady finish

        using var scope = _services.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IFormRepository>();
        var client = scope.ServiceProvider.GetRequiredService<IMegaFormClient>();
        var scopeDto = new MegaFormScope { PortalId = 0, UserId = 1 };

        var existing = repo.ListForms(portalId: 0, status: null, pageSize: 10).ToList();
        if (existing.Count >= 2)
        {
            _logger.LogInformation("[CorporateWeb.FullDemo] Demo forms already seeded.");
            return;
        }

        var contactFormId = SeedForm(repo, "Contact Us", "ContactFormSchema.json",
            "Corporate contact form for the MegaForm full demo.",
            "Thank you for contacting us. We will get back to you shortly.");

        var eventFormId = SeedForm(repo, "Event Registration", "EventRegistrationSchema.json",
            "Register for our upcoming corporate event.",
            "Your registration has been received. See you at the event!");

        _logger.LogInformation("[CorporateWeb.FullDemo] Seeded demo forms (Contact={ContactFormId}, Event={EventFormId}).", contactFormId, eventFormId);

        // Seed sample submissions programmatically via the SDK.
        await SeedContactSubmissionsAsync(client, contactFormId, scopeDto);
        await SeedEventSubmissionsAsync(client, eventFormId, scopeDto);

        _logger.LogInformation("[CorporateWeb.FullDemo] Seeded sample submissions.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private int SeedForm(IFormRepository repo, string title, string schemaFileName, string description, string successMessage)
    {
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
            SubmitButtonText = "Submit",
            SuccessMessage = successMessage,
            RedirectUrl = "",
            CreatedByUserId = 1,
            CreatedOnUtc = DateTime.UtcNow
        };

        return repo.SaveForm(form);
    }

    private async Task SeedContactSubmissionsAsync(IMegaFormClient client, int formId, MegaFormScope scope)
    {
        var samples = new[]
        {
            new Dictionary<string, object>
            {
                ["full_name"] = "Alice Nguyen",
                ["email"] = "alice@example.com",
                ["phone"] = "+84 90 123 4567",
                ["category"] = "sales",
                ["budget_range"] = "5k_20k",
                ["message"] = "I would like a quote for the enterprise package.",
                ["preferred_contact"] = new[] { "email", "phone" },
                ["newsletter"] = new[] { "true" },
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Bob Tran",
                ["email"] = "bob@example.com",
                ["phone"] = "+84 91 234 5678",
                ["category"] = "support",
                ["priority"] = "high",
                ["message"] = "We are experiencing an issue with form submissions not showing up.",
                ["preferred_contact"] = new[] { "email" },
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Carol Le",
                ["email"] = "carol@example.com",
                ["category"] = "feedback",
                ["message"] = "Great product! The new dashboard is very helpful.",
                ["preferred_contact"] = new[] { "email" },
                ["newsletter"] = new[] { "true" },
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "David Pham",
                ["email"] = "david@example.com",
                ["category"] = "general",
                ["message"] = "Can you help me understand the pricing tiers?",
                ["preferred_contact"] = new[] { "phone" },
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Eva Vo",
                ["email"] = "eva@example.com",
                ["category"] = "other",
                ["other_category_text"] = "Partnership",
                ["message"] = "I would like to discuss a partnership opportunity.",
                ["preferred_contact"] = new[] { "email", "video" },
                ["newsletter"] = new[] { "true" },
                ["terms"] = new[] { "true" }
            }
        };

        foreach (var data in samples)
        {
            await client.Submissions.SubmitAsync(formId, data, scope);
        }
    }

    private async Task SeedEventSubmissionsAsync(IMegaFormClient client, int formId, MegaFormScope scope)
    {
        var samples = new[]
        {
            new Dictionary<string, object>
            {
                ["full_name"] = "Frank Ho",
                ["email"] = "frank@example.com",
                ["company"] = "Acme Corp",
                ["job_title"] = "CTO",
                ["session"] = "ai",
                ["dietary"] = "vegetarian",
                ["comments"] = "Looking forward to the AI session.",
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Grace Dang",
                ["email"] = "grace@example.com",
                ["company"] = "Beta Ltd",
                ["job_title"] = "Product Manager",
                ["session"] = "cloud",
                ["comments"] = "Please send the agenda in advance.",
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Henry Bui",
                ["email"] = "henry@example.com",
                ["company"] = "Gamma Inc",
                ["job_title"] = "Developer",
                ["session"] = "security",
                ["dietary"] = "none",
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Ivy Ngo",
                ["email"] = "ivy@example.com",
                ["company"] = "Delta Co",
                ["job_title"] = "Designer",
                ["session"] = "ai",
                ["comments"] = "Will bring a colleague.",
                ["terms"] = new[] { "true" }
            },
            new Dictionary<string, object>
            {
                ["full_name"] = "Jack Do",
                ["email"] = "jack@example.com",
                ["company"] = "Epsilon LLC",
                ["job_title"] = "Engineering Lead",
                ["session"] = "cloud",
                ["dietary"] = "gluten-free",
                ["terms"] = new[] { "true" }
            }
        };

        foreach (var data in samples)
        {
            await client.Submissions.SubmitAsync(formId, data, scope);
        }
    }
}
