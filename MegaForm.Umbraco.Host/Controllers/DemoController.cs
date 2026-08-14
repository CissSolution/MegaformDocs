using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MegaForm.Umbraco.Data;
using MegaForm.Umbraco.ViewModels;
using Newtonsoft.Json;

namespace MegaForm.Umbraco.Host.Controllers
{
    [Route("demo/[action]")]
    public class DemoController : Controller
    {
        private readonly MegaFormDbContext _db;
        private static readonly IReadOnlyDictionary<string, CorporateNewsArticle> NewsArticles =
            new Dictionary<string, CorporateNewsArticle>(StringComparer.OrdinalIgnoreCase)
            {
                ["enterprise-form-journeys"] = new CorporateNewsArticle(
                    "Enterprise form journeys are moving into Umbraco",
                    "A practical look at multi-step project intake, onboarding and internal workflow capture inside a corporate CMS.",
                    101,
                    "Project Intake Onboarding"),
                ["euro-youth-campaign"] = new CorporateNewsArticle(
                    "Campaign teams need polished application flows",
                    "How programme, event and scholarship teams can publish branded application journeys without sending users to a generic builder surface.",
                    102,
                    "EuroYouth 2026 Application"),
                ["workspace-onboarding"] = new CorporateNewsArticle(
                    "Tabbed onboarding keeps setup pages compact",
                    "A tabbed account setup flow embedded in a normal Umbraco page, with theme-aware rendering for real backoffice QA.",
                    103,
                    "Tabbed Account Setup"),
                ["healthcare-intake"] = new CorporateNewsArticle(
                    "Patient intake belongs inside the content journey",
                    "A premium wellness intake template rendered directly in a news article page for long-form layout and scroll testing.",
                    104,
                    "Wellness Patient Intake")
            };

        private static readonly IReadOnlyDictionary<string, CorporateNewsArticle> DatabaseForms =
            new Dictionary<string, CorporateNewsArticle>(StringComparer.OrdinalIgnoreCase)
            {
                ["service-request"] = new CorporateNewsArticle(
                    "SQL-backed service request",
                    "Department and service dropdowns are populated from local SQLite tables, with service cascading from department.",
                    201,
                    "SQL cascade"),
                ["newsletter"] = new CorporateNewsArticle(
                    "SQL-backed newsletter signup",
                    "Country and topic lists are hydrated from reusable lookup tables in the Umbraco database.",
                    202,
                    "SQL options"),
                ["event-registration"] = new CorporateNewsArticle(
                    "SQL-backed event registration",
                    "Ticket choices come from a database lookup table and render as rich radio cards.",
                    203,
                    "SQL radio cards")
            };

        public DemoController(MegaFormDbContext db)
        {
            _db = db;
        }

        private MegaFormViewModel FormModel(int formId, int contentId = 0) => new MegaFormViewModel
        {
            ContentId = contentId > 0 ? contentId : formId,
            FormId = formId,
            ViewType = "submit",
            IsAdmin = false
        };

        [HttpGet("/demo")]
        public IActionResult Index()
        {
            ViewBag.Title = "Corporate Demo";
            return View();
        }

        public IActionResult News()
        {
            ViewBag.Title = "News & Insights";
            ViewBag.Articles = NewsArticles;
            ViewBag.DatabaseForms = DatabaseForms;
            return View();
        }

        [HttpGet("/demo/news/{slug}")]
        public IActionResult NewsArticle(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug) || !NewsArticles.TryGetValue(slug, out var article))
                return RedirectToAction(nameof(News));

            ViewBag.Title = article.Title;
            ViewBag.Article = article;
            return View();
        }

        [HttpGet("/demo/db-lookup/{slug}")]
        public IActionResult DatabaseForm(string slug)
        {
            if (string.IsNullOrWhiteSpace(slug) || !DatabaseForms.TryGetValue(slug, out var article))
                return RedirectToAction(nameof(News));

            ViewBag.Title = article.Title;
            ViewBag.Article = article;
            return View();
        }

        public IActionResult Services()
        {
            ViewBag.Title = "Our Services";
            return View();
        }

        public IActionResult Contact()
        {
            ViewBag.Title = "Contact Us";
            return View();
        }

        /// <summary>
        /// Demo page that embeds a MegaForm using the Umbraco-style RenderMegaForm view component.
        /// </summary>
        public IActionResult FormPage()
        {
            ViewBag.Title = "MegaForm Picker Demo";
            return View();
        }

        public IActionResult MultiStep()
        {
            ViewBag.Title = "Multi-Step Form Demo";
            return View();
        }

        public IActionResult FileUpload()
        {
            ViewBag.Title = "File Upload Demo";
            return View();
        }

        [HttpGet]
        public IActionResult Seed()
        {
            var now = DateTime.UtcNow.ToString("O");

            var forms = new List<(int formId, string title, string desc, string submit, string success, object schema)>
            {
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
                    }),
                (4, "Event Registration", "Register for our upcoming corporate event.", "Register", "You are registered!",
                    new
                    {
                        fields = new object[]
                        {
                            new { key = "name", type = "Text", label = "Attendee Name", required = true },
                            new { key = "email", type = "Email", label = "Email", required = true },
                            new { key = "ticket", type = "Select", label = "Ticket Type", required = true,
                                options = new[] { new { value = "general", label = "General Admission" }, new { value = "vip", label = "VIP" }, new { value = "student", label = "Student" } } },
                            new { key = "dietary", type = "Text", label = "Dietary Requirements", required = false }
                        },
                        settings = new { multiPage = false, defaultLanguage = "en-US" }
                    })
            };

            var created = new List<int>();
            const string sql = @"INSERT OR IGNORE INTO MF_Forms
                (FormId, ModuleId, PortalId, Title, Description, SchemaJson, SettingsJson, ThemeJson, Status, SubmitButtonText, SuccessMessage, CreatedByUserId, CreatedOnUtc, RulesJson, WorkflowJson, SubmissionCount)
                VALUES
                (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15)";

            foreach (var f in forms)
            {
                var schemaJson = JsonConvert.SerializeObject(f.schema);
                try
                {
                    var rows = _db.Database.ExecuteSqlRaw(sql,
                        f.formId, -1, -1, f.title, f.desc, schemaJson, "{}", "{}", "Published", f.submit, f.success, -1, now, "[]", "", 0);
                    if (rows > 0) created.Add(f.formId);
                }
                catch (Exception ex)
                {
                    return Json(new { ok = false, error = ex.Message, formId = f.formId });
                }
            }

            return Json(new { ok = true, created, message = "Demo forms seeded." });
        }

        public sealed class CorporateNewsArticle
        {
            public CorporateNewsArticle(string title, string summary, int formId, string formLabel)
            {
                Title = title;
                Summary = summary;
                FormId = formId;
                FormLabel = formLabel;
            }

            public string Title { get; }
            public string Summary { get; }
            public int FormId { get; }
            public string FormLabel { get; }
        }
    }
}
