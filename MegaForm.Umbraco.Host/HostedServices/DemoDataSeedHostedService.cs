using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Umbraco.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Umbraco.Host.HostedServices
{
    /// <summary>
    /// Ensures the Umbraco demo site has sample MegaForm data on first run.
    /// Runs once shortly after startup and is a no-op if MF_Forms already has rows.
    /// </summary>
    public class DemoDataSeedHostedService : IHostedService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IHostEnvironment _hostEnvironment;
        private readonly ILogger<DemoDataSeedHostedService> _logger;

        public DemoDataSeedHostedService(
            IServiceProvider serviceProvider,
            IHostEnvironment hostEnvironment,
            ILogger<DemoDataSeedHostedService> logger = null)
        {
            _serviceProvider = serviceProvider;
            _hostEnvironment = hostEnvironment;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    // Wait for Umbraco + MegaForm schema initialization to settle.
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);

                    using var scope = _serviceProvider.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

                    await EnsureLookupDataAsync(db, cancellationToken);
                    await EnsureSqlLookupFormsAsync(db, cancellationToken);
                    await EnsurePremiumTemplateFormsAsync(db, cancellationToken);

                    // Idempotent: keep the small smoke-test forms only for an empty database.
                    var hasForms = await db.Forms.AnyAsync(cancellationToken);
                    if (hasForms)
                    {
                        _logger?.LogInformation("[MegaForm.Umbraco.Host] Demo data already present; skipping seed.");
                        return;
                    }

                    var now = DateTime.UtcNow.ToString("O");
                    const string sql = @"INSERT INTO MF_Forms
                        (FormId, ModuleId, PortalId, Title, Description, SchemaJson, SettingsJson, ThemeJson, Status, SubmitButtonText, SuccessMessage, CreatedByUserId, CreatedOnUtc, RulesJson, WorkflowJson, SubmissionCount, RequireAuth, EnableCaptcha, EnableSaveResume, AutoresponderEnabled)
                        VALUES
                        (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17, @p18, @p19)";

                    var forms = new List<(int id, string title, string desc, string submit, string success, object schema)>
                    {
                        (1, "Contact Us", "General contact form for the corporate demo.", "Send Message", "Thanks! We will be in touch soon.",
                            new
                            {
                                fields = new object[]
                                {
                                    new { key = "name", type = "Text", label = "Full Name", required = true },
                                    new { key = "email", type = "Email", label = "Email Address", required = true },
                                    new { key = "message", type = "TextArea", label = "Message", required = true }
                                },
                                settings = new { multiPage = false, defaultLanguage = "en-US" }
                            }),
                        (2, "Newsletter Subscribe", "Subscribe to our monthly newsletter.", "Subscribe", "Thanks for subscribing!",
                            new
                            {
                                fields = new[] { new { key = "email", type = "Email", label = "Email", required = true } },
                                settings = new { multiPage = false, defaultLanguage = "en-US" }
                            }),
                        (3, "Request a Quote", "Tell us about your project and we will get back to you.", "Request Quote", "We have received your request!",
                            new
                            {
                                fields = new object[]
                                {
                                    new { key = "name", type = "Text", label = "Full Name", required = true },
                                    new { key = "email", type = "Email", label = "Work Email", required = true },
                                    new { key = "company", type = "Text", label = "Company", required = true },
                                    new { key = "budget", type = "Select", label = "Budget Range", required = true,
                                        options = new[] { new { value = "small", label = "<$5k" }, new { value = "medium", label = "$5k-$25k" }, new { value = "large", label = ">$25k" } } },
                                    new { key = "message", type = "TextArea", label = "Project Details", required = false }
                                },
                                settings = new { multiPage = false, defaultLanguage = "en-US" }
                            })
                    };

                    foreach (var f in forms)
                    {
                        var schemaJson = JsonConvert.SerializeObject(f.schema);
                        await db.Database.ExecuteSqlRawAsync(sql,
                            new object[] { f.id, -1, -1, f.title, f.desc, schemaJson, "{}", "{}", "Published", f.submit, f.success, -1, now, "[]", "", 0, 0, 0, 0, 0 },
                            cancellationToken);
                    }

                    _logger?.LogInformation("[MegaForm.Umbraco.Host] Seeded {Count} demo forms.", forms.Count);
                }
                catch (OperationCanceledException)
                {
                    // Shutdown requested before seed completed.
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "[MegaForm.Umbraco.Host] Demo data seed failed.");
                }
            }, cancellationToken);

            return Task.CompletedTask;
        }

        private async Task EnsureLookupDataAsync(MegaFormDbContext db, CancellationToken cancellationToken)
        {
            await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS MF_DemoDepartments (
    Id INTEGER PRIMARY KEY,
    Name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS MF_DemoServices (
    Id INTEGER PRIMARY KEY,
    DepartmentId INTEGER NOT NULL,
    Name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS MF_DemoCountries (
    Code TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    Region TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS MF_DemoTopics (
    Id INTEGER PRIMARY KEY,
    Name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS MF_DemoTicketTypes (
    Code TEXT PRIMARY KEY,
    Name TEXT NOT NULL,
    SortOrder INTEGER NOT NULL
);", cancellationToken);

            var statements = new[]
            {
                "INSERT OR IGNORE INTO MF_DemoDepartments (Id, Name) VALUES (1, 'Digital Strategy'), (2, 'Implementation'), (3, 'Governance')",
                "INSERT OR IGNORE INTO MF_DemoServices (Id, DepartmentId, Name) VALUES (11, 1, 'Discovery Workshop'), (12, 1, 'Journey Mapping'), (21, 2, 'Umbraco Integration'), (22, 2, 'Workflow Automation'), (31, 3, 'Access Review'), (32, 3, 'Compliance Reporting')",
                "INSERT OR IGNORE INTO MF_DemoCountries (Code, Name, Region) VALUES ('AU', 'Australia', 'APAC'), ('VN', 'Vietnam', 'APAC'), ('DE', 'Germany', 'EMEA'), ('NL', 'Netherlands', 'EMEA'), ('US', 'United States', 'AMER'), ('CA', 'Canada', 'AMER')",
                "INSERT OR IGNORE INTO MF_DemoTopics (Id, Name) VALUES (1, 'Product updates'), (2, 'Implementation guides'), (3, 'Security and governance'), (4, 'Customer stories')",
                "INSERT OR IGNORE INTO MF_DemoTicketTypes (Code, Name, SortOrder) VALUES ('standard', 'Standard pass', 1), ('workshop', 'Workshop pass', 2), ('executive', 'Executive briefing', 3)"
            };

            foreach (var sql in statements)
                await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }

        private async Task EnsureSqlLookupFormsAsync(MegaFormDbContext db, CancellationToken cancellationToken)
        {
            var now = DateTime.UtcNow;
            var seeds = new[]
            {
                new SqlLookupSeed(
                    201,
                    "Umbraco SQL Lookup - Service Request",
                    "A front-end Umbraco page using MegaForm SQL-backed select fields, including a cascading service picker.",
                    "Submit request",
                    new
                    {
                        version = "1.0",
                        title = "Request a service consultation",
                        description = "Department and service lists are loaded from the local Umbraco SQLite database.",
                        fields = new object[]
                        {
                            new { key = "full_name", type = "Text", label = "Full name", required = true },
                            new { key = "email", type = "Email", label = "Work email", required = true },
                            new
                            {
                                key = "department",
                                type = "Select",
                                label = "Department",
                                required = true,
                                options = new[] { new { value = "", label = "Loading departments..." } },
                                properties = new
                                {
                                    optionsSource = "sql",
                                    optionsConnectionKey = "DashboardDatabase",
                                    optionsDatabaseType = "sqlite",
                                    optionsSql = "SELECT Id AS value, Name AS label FROM MF_DemoDepartments ORDER BY Name"
                                }
                            },
                            new
                            {
                                key = "service",
                                type = "Select",
                                label = "Service",
                                required = true,
                                options = new[] { new { value = "", label = "Choose a department first" } },
                                properties = new
                                {
                                    optionsSource = "sql",
                                    optionsConnectionKey = "DashboardDatabase",
                                    optionsDatabaseType = "sqlite",
                                    optionsSql = "SELECT Id AS value, Name AS label FROM MF_DemoServices WHERE DepartmentId = :department ORDER BY Name",
                                    optionsDependsOn = new[] { "department" },
                                    optionsReloadOnChange = true
                                }
                            },
                            new { key = "summary", type = "TextArea", label = "Project summary", required = false }
                        },
                        settings = SqlLookupSettings("Thanks. Your service request was captured.")
                    }),
                new SqlLookupSeed(
                    202,
                    "Umbraco SQL Lookup - Newsletter",
                    "Newsletter form whose country and topic options come from SQLite lookup tables.",
                    "Subscribe",
                    new
                    {
                        version = "1.0",
                        title = "Subscribe to corporate insights",
                        description = "Country and topic choices are hydrated from database rows at render time.",
                        fields = new object[]
                        {
                            new { key = "email", type = "Email", label = "Email address", required = true },
                            new
                            {
                                key = "country",
                                type = "Select",
                                label = "Country",
                                required = true,
                                options = new[] { new { value = "", label = "Loading countries..." } },
                                properties = new
                                {
                                    optionsSource = "sql",
                                    optionsConnectionKey = "DashboardDatabase",
                                    optionsDatabaseType = "sqlite",
                                    optionsSql = "SELECT Code AS value, Name || ' (' || Region || ')' AS label FROM MF_DemoCountries ORDER BY Region, Name"
                                }
                            },
                            new
                            {
                                key = "topic",
                                type = "Select",
                                label = "Primary topic",
                                required = true,
                                options = new[] { new { value = "", label = "Loading topics..." } },
                                properties = new
                                {
                                    optionsSource = "sql",
                                    optionsConnectionKey = "DashboardDatabase",
                                    optionsDatabaseType = "sqlite",
                                    optionsSql = "SELECT Id AS value, Name AS label FROM MF_DemoTopics ORDER BY Name"
                                }
                            }
                        },
                        settings = SqlLookupSettings("You are subscribed.")
                    }),
                new SqlLookupSeed(
                    203,
                    "Umbraco SQL Lookup - Event Registration",
                    "Event registration with ticket types pulled from a local database lookup table.",
                    "Register",
                    new
                    {
                        version = "1.0",
                        title = "Register for the enterprise forms briefing",
                        description = "Ticket type options come from MF_DemoTicketTypes in the Umbraco database.",
                        fields = new object[]
                        {
                            new { key = "name", type = "Text", label = "Attendee name", required = true },
                            new { key = "email", type = "Email", label = "Email", required = true },
                            new
                            {
                                key = "ticket_type",
                                type = "Radio",
                                label = "Ticket type",
                                required = true,
                                optionDisplay = "cards",
                                options = new[] { new { value = "", label = "Loading ticket types..." } },
                                properties = new
                                {
                                    optionsSource = "sql",
                                    optionsConnectionKey = "DashboardDatabase",
                                    optionsDatabaseType = "sqlite",
                                    optionsSql = "SELECT Code AS value, Name AS label FROM MF_DemoTicketTypes ORDER BY SortOrder"
                                }
                            },
                            new { key = "notes", type = "TextArea", label = "Notes", required = false }
                        },
                        settings = SqlLookupSettings("Your registration was captured.")
                    })
            };

            foreach (var seed in seeds)
            {
                var schemaJson = JsonConvert.SerializeObject(seed.Schema);
                var form = await db.Forms.FirstOrDefaultAsync(f => f.FormId == seed.FormId, cancellationToken);
                var isNew = form == null;
                if (isNew)
                {
                    form = new FormInfo
                    {
                        FormId = seed.FormId,
                        PortalId = -1,
                        ModuleId = -1,
                        CreatedByUserId = -1,
                        CreatedOnUtc = now,
                        SubmissionCount = 0
                    };
                    db.Forms.Add(form);
                }

                form.Title = seed.Title;
                form.Description = seed.Description;
                form.SchemaJson = schemaJson;
                form.SettingsJson = "{}";
                form.ThemeJson = "{}";
                form.Status = "Published";
                form.SubmitButtonText = seed.SubmitText;
                form.SuccessMessage = "Thank you. Your submission was received.";
                form.RulesJson = "[]";
                form.WorkflowJson = form.WorkflowJson ?? string.Empty;
                form.RequireAuth = false;
                form.EnableCaptcha = false;
                form.EnableSaveResume = false;
                form.AutoresponderEnabled = false;
                form.UpdatedByUserId = -1;
                form.UpdatedOnUtc = now;
            }

            await db.SaveChangesAsync(cancellationToken);
            _logger?.LogInformation("[MegaForm.Umbraco.Host] Ensured SQL lookup demo forms 201-203.");
        }

        private static object SqlLookupSettings(string successMessage)
        {
            return new
            {
                multiPage = false,
                defaultLanguage = "en-US",
                submitButtonText = "Submit",
                successMessage,
                customCss = ".mf-form-wrapper{max-width:720px;margin:0 auto}.mf-field-label{font-weight:700}.mf-form-wrapper select,.mf-form-wrapper input,.mf-form-wrapper textarea{min-height:44px}"
            };
        }

        private async Task EnsurePremiumTemplateFormsAsync(MegaFormDbContext db, CancellationToken cancellationToken)
        {
            var templateRoot = FindTemplateRoot();
            if (string.IsNullOrWhiteSpace(templateRoot))
            {
                _logger?.LogWarning("[MegaForm.Umbraco.Host] Premium template folder was not found; corporate demo pages will keep existing forms.");
                return;
            }

            var seeds = new[]
            {
                new PremiumTemplateSeed(101, "project-intake-onboarding.json", "Corporate Project Intake"),
                new PremiumTemplateSeed(102, "youth-application.json", "EuroYouth 2026 Application"),
                new PremiumTemplateSeed(103, "tabbed-account-setup.json", "Northwind Account Setup"),
                new PremiumTemplateSeed(104, "wellness-patient-intake.json", "Wellness Patient Intake"),
                new PremiumTemplateSeed(105, "outback-station-stay-booking.json", "Outback Station Stay Booking"),
                new PremiumTemplateSeed(106, "contact-map-left-corporate.json", "Corporate Contact with Map")
            };

            var now = DateTime.UtcNow;
            var changed = 0;

            foreach (var seed in seeds)
            {
                var path = Path.Combine(templateRoot, seed.FileName);
                if (!File.Exists(path))
                {
                    _logger?.LogWarning("[MegaForm.Umbraco.Host] Premium template missing: {TemplateFile}", path);
                    continue;
                }

                JObject schema;
                try
                {
                    using var reader = new JsonTextReader(File.OpenText(path))
                    {
                        DateParseHandling = DateParseHandling.None
                    };
                    schema = JObject.Load(reader);
                }
                catch (Exception ex)
                {
                    _logger?.LogWarning(ex, "[MegaForm.Umbraco.Host] Failed to read premium template {TemplateFile}", path);
                    continue;
                }

                var form = await db.Forms.FirstOrDefaultAsync(f => f.FormId == seed.FormId, cancellationToken);
                var isNew = form == null;
                if (isNew)
                {
                    form = new FormInfo
                    {
                        FormId = seed.FormId,
                        PortalId = -1,
                        ModuleId = -1,
                        CreatedByUserId = -1,
                        CreatedOnUtc = now,
                        SubmissionCount = 0
                    };
                    db.Forms.Add(form);
                }

                var title = FirstString(schema, "title", "Title") ?? seed.TitleFallback;
                var description = FirstString(schema, "description", "Description") ?? "Premium MegaForm template for Umbraco corporate QA.";
                var settings = schema["settings"] as JObject ?? schema["Settings"] as JObject;
                var postSubmit = settings?["postSubmitExperience"] as JObject ?? settings?["PostSubmitExperience"] as JObject;

                form.Title = title;
                form.Description = description;
                form.SchemaJson = schema.ToString(Formatting.None);
                form.SettingsJson = settings?.ToString(Formatting.None) ?? "{}";
                form.ThemeJson = (schema["theme"] ?? schema["Theme"])?.ToString(Formatting.None) ?? "{}";
                form.Status = "Published";
                form.SubmitButtonText = FirstString(schema, "submitButtonText", "SubmitButtonText")
                    ?? FirstString(settings, "submitButtonText", "SubmitButtonText")
                    ?? "Submit";
                form.SuccessMessage = FirstString(schema, "successMessage", "SuccessMessage")
                    ?? FirstString(settings, "successMessage", "SuccessMessage")
                    ?? FirstString(postSubmit, "message", "Message")
                    ?? "Thank you. We have received your submission.";
                form.RedirectUrl = FirstString(schema, "redirectUrl", "RedirectUrl")
                    ?? FirstString(settings, "redirectUrl", "RedirectUrl")
                    ?? FirstString(postSubmit, "redirectUrl", "RedirectUrl")
                    ?? string.Empty;
                form.RulesJson = schema["rules"]?.ToString(Formatting.None) ?? schema["Rules"]?.ToString(Formatting.None) ?? "[]";
                form.WorkflowJson = schema["workflow"]?.ToString(Formatting.None) ?? schema["Workflow"]?.ToString(Formatting.None) ?? form.WorkflowJson ?? string.Empty;
                form.RequireAuth = false;
                form.EnableCaptcha = false;
                form.EnableSaveResume = true;
                form.AutoresponderEnabled = false;
                form.UpdatedByUserId = -1;
                form.UpdatedOnUtc = now;

                changed++;
            }

            if (changed > 0)
            {
                await db.SaveChangesAsync(cancellationToken);
                _logger?.LogInformation("[MegaForm.Umbraco.Host] Ensured {Count} premium template forms for corporate QA.", changed);
            }
        }

        private string FindTemplateRoot()
        {
            var current = new DirectoryInfo(_hostEnvironment.ContentRootPath);
            while (current != null)
            {
                var candidate = Path.Combine(current.FullName, "MegaForm.Oqtane.Server", "wwwroot", "Modules", "MegaForm", "Templates");
                if (Directory.Exists(candidate)) return candidate;

                candidate = Path.Combine(current.FullName, "..", "MegaForm.Oqtane.Server", "wwwroot", "Modules", "MegaForm", "Templates");
                candidate = Path.GetFullPath(candidate);
                if (Directory.Exists(candidate)) return candidate;

                current = current.Parent;
            }

            return null;
        }

        private static string FirstString(JToken token, params string[] keys)
        {
            if (token == null) return null;
            foreach (var key in keys)
            {
                var value = token[key]?.ToString();
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            }
            return null;
        }

        private sealed class PremiumTemplateSeed
        {
            public PremiumTemplateSeed(int formId, string fileName, string titleFallback)
            {
                FormId = formId;
                FileName = fileName;
                TitleFallback = titleFallback;
            }

            public int FormId { get; }
            public string FileName { get; }
            public string TitleFallback { get; }
        }

        private sealed class SqlLookupSeed
        {
            public SqlLookupSeed(int formId, string title, string description, string submitText, object schema)
            {
                FormId = formId;
                Title = title;
                Description = description;
                SubmitText = submitText;
                Schema = schema;
            }

            public int FormId { get; }
            public string Title { get; }
            public string Description { get; }
            public string SubmitText { get; }
            public object Schema { get; }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            return Task.CompletedTask;
        }
    }
}
