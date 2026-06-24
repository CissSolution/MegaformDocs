using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using MegaForm.Web.Data;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Linq;
using System.Collections.Generic;
using System.IO;
using MegaForm.Web.Services;

namespace MegaForm.Web.Controllers
{
    [Authorize(AuthenticationSchemes = CookieAuthenticationDefaults.AuthenticationScheme)]
    [Route("admin")]
    public class AdminController : Controller
    {
        // Fallback when no feature-toggle implementation is registered.
        private sealed class FreeFeatureToggles : IMegaFormFeatureToggles
        {
            public bool Workflow => false;
            public bool PremiumTemplates => false;
        }

        private const string ThemeDesignerAssetVersion = "20260401-div01";

        private readonly IWebHostEnvironment _env;
        private readonly MegaFormDbContext   _db;
        private readonly IFormRepository     _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IPlatformContext    _ctx;
        private readonly IRuntimeLogStore     _logStore;
        private readonly IThemeDesignerHostRenderer _themeDesignerHostRenderer;
        private readonly IMegaFormFeatureToggles _features;

        public AdminController(IWebHostEnvironment env, MegaFormDbContext db, IFormRepository formRepo, ISubmissionRepository subRepo, IPlatformContext ctx, IRuntimeLogStore logStore, IThemeDesignerHostRenderer themeDesignerHostRenderer, IMegaFormFeatureToggles features = null)
        {
            _env = env;
            _db  = db;
            _formRepo = formRepo;
            _subRepo = subRepo;
            _ctx = ctx;
            _logStore = logStore;
            _themeDesignerHostRenderer = themeDesignerHostRenderer;
            _features = features ?? new FreeFeatureToggles();
        }

        [HttpGet("")]
        [HttpGet("index")]
        public IActionResult Index()
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            var forms = (_formRepo.ListForms(_ctx.PortalId, pageSize: 0) ?? new List<FormInfo>())
                .OrderByDescending(f => f.UpdatedOnUtc ?? f.CreatedOnUtc)
                .ThenByDescending(f => f.FormId)
                .ToList();
            var formIds = forms.Select(f => f.FormId).ToHashSet();
            var allSubs = _db.Submissions.OrderByDescending(s => s.SubmittedOnUtc).Take(10).ToList();
            var recentSubs = allSubs.Take(6).ToList(); // show all recent, not filtered by paginated forms
            var submissionsTotal = _db.Submissions.Count();
            var draftsTotal = _db.Drafts.Count();
            var formsTotal = _db.Forms.Count();

            string provider = _db.Database.ProviderName ?? "Database";
            string dbLabel = provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) ? "SQLite"
                : provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) ? "PostgreSQL"
                : provider.Contains("SqlServer", StringComparison.OrdinalIgnoreCase) ? "SQL Server"
                : provider;

            var dashboard = new
            {
                counts = new { forms = formsTotal, submissions = submissionsTotal },
                stats = new object[]
                {
                    new { label = "Total Forms", value = formsTotal, meta = $"{forms.Count(f => string.Equals(f.Status, "Published", StringComparison.OrdinalIgnoreCase))} published", icon = "fa-regular fa-file-lines" },
                    new { label = "Submissions", value = submissionsTotal, meta = $"{recentSubs.Count} recent", icon = "fa-regular fa-message" },
                    new { label = "Saved Drafts", value = draftsTotal, meta = draftsTotal > 0 ? "In progress" : "No active drafts", icon = "fa-regular fa-floppy-disk" },
                    new { label = "Database", value = dbLabel, meta = "Online", icon = "fa-solid fa-database" },
                },
                recentForms = forms.Select(f => new
                {
                    formId = f.FormId,
                    title = f.Title ?? $"Form #{f.FormId}",
                    status = f.Status ?? "Draft",
                    fields = CountFields(f.SchemaJson),
                    modified = (f.UpdatedOnUtc ?? f.CreatedOnUtc).ToString("yyyy-MM-dd HH:mm")
                }).ToArray(),
                lockedFormIds = GetLockedFormIds(),
                recentSubmissions = recentSubs.Select(s => new
                {
                    submissionId = s.SubmissionId,
                    formId = s.FormId,
                    formTitle = forms.FirstOrDefault(f => f.FormId == s.FormId)?.Title ?? _db.Forms.Where(f => f.FormId == s.FormId).Select(f => f.Title).FirstOrDefault() ?? $"Form #{s.FormId}",
                    submittedOnUtc = s.SubmittedOnUtc,
                    status = s.Status ?? "Submitted"
                }).ToArray(),
                quickActions = new object[]
                {
                    new { title = "Form Builder", subtitle = "Create and update forms", icon = "fa-solid fa-pen-ruler", href = "/admin/builder" },
                    new { title = "Theme Designer", subtitle = "Open the Vite/TS theme editor", icon = "fa-solid fa-palette", href = forms.Count > 0 ? $"/admin/theme-designer?formId={forms[0].FormId}" : "/admin/theme-designer" },
                    new { title = "View Logs", subtitle = "Inspect email, payment, and workflow logs", icon = "fa-solid fa-file-waveform", href = "/admin/viewlogs" },
                    new { title = "Languages", subtitle = "Manage widget and control language packs", icon = "fa-solid fa-language", href = "/admin/languages" },
                    new { title = "Export", subtitle = "Download submissions as CSV or JSON", icon = "fa-solid fa-download", href = "/admin/submissions" },
                    new { title = "Settings", subtitle = "Payment, email, and setup", icon = "fa-solid fa-sliders", href = "/setup/reset" },
                },
                system = new object[]
                {
                    new { key = "Platform", value = "ASP.NET Core" },
                    new { key = "Version", value = "MegaForm v1.7" },
                    new { key = "Database", value = dbLabel },
                    new { key = "Environment", value = _env.EnvironmentName ?? "Production" },
                    new { key = "API", value = "Online" },
                }
            };

            ViewBag.DashboardJson = JsonConvert.SerializeObject(dashboard);
            ViewBag.HasDevLock = HasDevLock();
            ViewBag.HasDemoLock = HasDemoLock();
            ViewBag.Features = _features;
            return View("~/Views/Admin/Index.cshtml");
        }

        [HttpGet("submissions")]
        public IActionResult Submissions(int formId = 0)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            var forms = _formRepo.ListForms(_ctx.PortalId, pageSize: 200) ?? new List<FormInfo>();
            FormInfo form = null;

            if (formId > 0)
                form = _formRepo.GetForm(formId);

            var totalCount = formId > 0
                ? _subRepo.List(formId, pageSize: 1).TotalCount
                : _db.Submissions.AsNoTracking().Count();

            ViewBag.FormId = formId;
            ViewBag.Form = form;
            ViewBag.TotalCount = totalCount;
            ViewBag.ApiBaseUrl = "/api/MegaForm/";
            ViewBag.SchemaJson = form?.SchemaJson ?? "{}";
            ViewBag.FormsCount = forms.Count;
            ViewBag.SubmissionsCount = _db.Submissions.Count();
            ViewBag.FormsJson = JsonConvert.SerializeObject(forms.ConvertAll(f => new { formId = f.FormId, title = f.Title, status = f.Status, schemaJson = f.SchemaJson ?? "{}" }));
            ViewBag.HasDevLock = HasDevLock();
            ViewBag.HasDemoLock = HasDemoLock();
            return View("~/Views/Admin/Submissions.cshtml");
        }

        [HttpGet("builder")]
        public IActionResult Builder(int formId = 0)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");
            ViewBag.FormId = formId;
            ViewBag.ApiBaseUrl = "/api/MegaForm/";
            ViewBag.HasDevLock = HasDevLock();
            ViewBag.HasDemoLock = HasDemoLock();
            ViewBag.Features = _features;
            // THEME-FIX: pass ThemeJson so builder can preserve TD customizations on save
            if (formId > 0)
            {
                var form = _formRepo.GetForm(formId);
                ViewBag.ThemeJson = form?.ThemeJson ?? "{}";
            }
            else
            {
                ViewBag.ThemeJson = "{}";
            }
            return View("~/Views/Admin/Builder.cshtml");
        }

        private List<int> GetLockedFormIds()
        {
            try
            {
                var path = Path.Combine(_env.ContentRootPath, "App_Data", "MegaForm", "locked-forms.json");
                if (!System.IO.File.Exists(path)) return new List<int>();
                var json = System.IO.File.ReadAllText(path);
                return Newtonsoft.Json.JsonConvert.DeserializeObject<List<int>>(json) ?? new List<int>();
            }
            catch { return new List<int>(); }
        }

        private bool HasDevLock() => HasLockFile("dev.lock");

        private bool HasDemoLock() => HasLockFile("demo.lock");

        private bool HasLockFile(string fileName)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fileName)) return false;
                var candidates = new[]
                {
                    string.IsNullOrWhiteSpace(_env?.WebRootPath) ? null : Path.Combine(_env.WebRootPath, fileName),
                    string.IsNullOrWhiteSpace(_env?.ContentRootPath) ? null : Path.Combine(_env.ContentRootPath, "wwwroot", fileName),
                    Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", fileName),
                };
                return candidates.Any(path => !string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path));
            }
            catch
            {
                return false;
            }
        }

        private static int CountFields(string schemaJson)
        {
            if (string.IsNullOrWhiteSpace(schemaJson)) return 0;
            try
            {
                var token = JToken.Parse(schemaJson);
                var fields = token["fields"] ?? token["Fields"];
                if (fields is JArray arr) return CountFieldsRecursive(arr);
                var pages = token["pages"] ?? token["Pages"];
                if (pages is JArray pagesArr)
                {
                    int total = 0;
                    foreach (var page in pagesArr)
                    {
                        var pf = page?["fields"] ?? page?["Fields"];
                        if (pf is JArray pfArr) total += CountFieldsRecursive(pfArr);
                    }
                    return total;
                }
            }
            catch { }
            return 0;
        }

        private static int CountFieldsRecursive(JArray arr)
        {
            int total = 0;
            foreach (var item in arr)
            {
                var type = (string)(item?["type"] ?? item?["Type"]) ?? string.Empty;
                if (string.Equals(type, "Row", StringComparison.OrdinalIgnoreCase))
                {
                    var cols = item?["columns"] ?? item?["Columns"];
                    if (cols is JArray colsArr)
                    {
                        foreach (var col in colsArr)
                        {
                            var child = col?["fields"] ?? col?["Fields"];
                            if (child is JArray childArr) total += CountFieldsRecursive(childArr);
                        }
                    }
                    continue;
                }

                if (string.Equals(type, "Section", StringComparison.OrdinalIgnoreCase) || string.Equals(type, "Html", StringComparison.OrdinalIgnoreCase))
                    continue;

                total++;
            }
            return total;
        }


        [HttpGet("languages")]
        public IActionResult Languages(string locale = null)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            ViewBag.ApiBaseUrl = "/api/MegaForm/";
            ViewBag.AdminLocale = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale;
            ViewBag.HasDevLock = HasDevLock();
            ViewBag.HasDemoLock = HasDemoLock();
            return View("~/Views/Admin/Languages.cshtml");
        }

        [HttpGet("viewlogs")]
        public IActionResult ViewLogs(string category = null, string logName = null, string search = null, int take = 50, int skip = 0)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            var result = _logStore.Query(category, logName, search, take <= 0 ? 50 : take, skip < 0 ? 0 : skip, level: null, source: null, cancellationToken: default);
            ViewBag.LogQuery = result;
            ViewBag.LogCategory = category ?? string.Empty;
            ViewBag.LogName = logName ?? string.Empty;
            ViewBag.LogSearch = search ?? string.Empty;
            ViewBag.HasDevLock = HasDevLock();
            ViewBag.HasDemoLock = HasDemoLock();
            return View("~/Views/Admin/ViewLogs.cshtml");
        }

        [HttpPost("viewlogs/clear")]
        [ValidateAntiForgeryToken]
        public IActionResult ClearLogs(string category = null, string logName = null)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            _logStore.Clear(category, logName, default);
            return RedirectToAction(nameof(ViewLogs), new { category, logName });
        }

        [HttpGet("theme-designer")]
        public IActionResult ThemeDesigner(int formId = 0)
        {
            if (!SetupController.IsSetupComplete(_env))
                return Redirect("/setup");

            var html = _themeDesignerHostRenderer.Render(new ThemeDesignerHostOptions
            {
                FormId = formId,
                ApiBaseUrl = "/api/MegaForm/",
                ReturnUrl = "/admin",
                CssUrl = $"/megaform/css/megaform-theme-designer.css?v={ThemeDesignerAssetVersion}",
                JsUrl = $"/megaform/js/megaform-theme-designer.js?v={ThemeDesignerAssetVersion}",
                InspectorJsUrl = $"/megaform/js/megaform-theme-inspector.js?v={ThemeDesignerAssetVersion}"
            });

            return Content(html, "text/html; charset=utf-8");
        }
    }
}
