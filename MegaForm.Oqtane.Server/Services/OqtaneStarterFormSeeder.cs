using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [StarterForms 2026-07-29] A fresh Oqtane install used to open on an EMPTY form list:
    /// the package ships templates, but nothing turns one into a usable form, so the only way
    /// in was the New Form wizard. That is a poor first five minutes — especially on a trial,
    /// where the point is to click around something that already works.
    ///
    /// On the first form-list request for a site that has no forms at all, materialise a small
    /// shelf of standard forms from the BUNDLED templates (the same JSON the Template Gallery
    /// reads). The mapping is the twin of the DNN bulk-create path: template fields go to
    /// <c>schema.fields</c>, the template's own settings/customHtml/customCss/rules ride along in
    /// <c>schema.settings</c>, and the form is published so it renders straight away.
    ///
    /// Idempotent and fail-soft: it only ever runs while the site has zero forms, each site is
    /// attempted once per app domain, and any failure leaves the list empty rather than breaking it.
    /// </summary>
    public static class OqtaneStarterFormSeeder
    {
        /// <summary>Bundled templates that make a useful first shelf — one per common job.</summary>
        private static readonly string[] StarterFiles =
        {
            "contact-us-standard.json",
            "support-request-rules.json",
            "appointment-booking-rules.json",
            "consultation-booking.json",
            "service-booking.json",
            "job-application-rules.json",
            "volunteer-signup.json",
            "membership-payment-fl.json",
        };

        private static readonly HashSet<int> Attempted = new HashSet<int>();
        private static readonly object Gate = new object();

        /// <summary>
        /// Seeds the starter shelf for <paramref name="siteId"/> when that site has no forms yet.
        /// Returns how many forms were created (0 when nothing was needed or possible).
        /// </summary>
        public static int SeedIfEmpty(IFormRepository forms, string contentRootPath, int siteId, int moduleId, int userId)
        {
            if (forms == null || siteId <= 0) return 0;

            lock (Gate)
            {
                if (Attempted.Contains(siteId)) return 0;
                Attempted.Add(siteId);
            }

            try
            {
                var existing = forms.ListForms(siteId, null, null, 0, 1);
                if (existing != null && existing.Count > 0) return 0;

                var dir = ResolveTemplatesDir(contentRootPath);
                if (dir == null) return 0;

                var created = 0;
                foreach (var fileName in StarterFiles)
                {
                    var path = Path.Combine(dir, fileName);
                    if (!File.Exists(path)) continue;
                    try
                    {
                        var form = BuildForm(File.ReadAllText(path), fileName, siteId, moduleId, userId);
                        if (form == null) continue;
                        forms.SaveForm(form);
                        created++;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("[MegaForm starter forms] skipped " + fileName + ": " + ex.Message);
                    }
                }

                if (created > 0)
                    Console.WriteLine("[MegaForm starter forms] seeded " + created + " form(s) for site " + siteId);
                return created;
            }
            catch (Exception ex)
            {
                Console.WriteLine("[MegaForm starter forms] skipped: " + ex.Message);
                return 0;
            }
        }

        /// <summary>App_Data holds the live catalog; wwwroot is what the package shipped.</summary>
        private static string ResolveTemplatesDir(string contentRootPath)
        {
            var root = string.IsNullOrWhiteSpace(contentRootPath) ? AppContext.BaseDirectory : contentRootPath;
            var candidates = new[]
            {
                Path.Combine(root, "App_Data", "MegaForm", "Templates"),
                Path.Combine(root, "wwwroot", "Modules", "MegaForm", "Templates"),
            };
            return candidates.FirstOrDefault(c => Directory.Exists(c) && Directory.EnumerateFiles(c, "*.json").Any());
        }

        private static FormInfo BuildForm(string templateJson, string sourceFile, int siteId, int moduleId, int userId)
        {
            var root = JObject.Parse(templateJson);

            var settings = root["settings"] as JObject != null ? new JObject((JObject)root["settings"]) : new JObject();
            var submitText = (string)root["submitButtonText"] ?? "Submit";
            var successMessage = (string)root["successMessage"] ?? string.Empty;
            var rules = root["rules"] as JArray ?? new JArray();
            var workflow = root["workflow"] as JObject;

            settings["submitButtonText"] = submitText;
            settings["successMessage"] = successMessage;
            settings["customHtml"] = (string)root["customHtml"] ?? (string)settings["customHtml"] ?? string.Empty;
            settings["customCss"] = (string)root["customCss"] ?? (string)settings["customCss"] ?? string.Empty;
            settings["rules"] = rules.DeepClone();
            settings["starterSeed"] = new JObject
            {
                ["sourceFile"] = sourceFile,
                ["templateSlug"] = (string)root["slug"] ?? string.Empty,
                ["createdBy"] = "Oqtane starter shelf v20260729",
                ["createdUtc"] = DateTime.UtcNow.ToString("O"),
            };

            var fields = root["fields"] as JArray ?? root["Fields"] as JArray ?? new JArray();
            var schema = new JObject
            {
                ["version"] = (string)root["version"] ?? "1.0",
                ["fields"] = fields.DeepClone(),
                ["settings"] = new JObject(settings),
            };

            var title = (string)root["title"];
            if (string.IsNullOrWhiteSpace(title)) title = Path.GetFileNameWithoutExtension(sourceFile);

            return new FormInfo
            {
                ModuleId = moduleId > 0 ? moduleId : 0,
                PortalId = siteId,
                Title = title.Trim(),
                Description = (string)root["description"] ?? string.Empty,
                SchemaJson = schema.ToString(Formatting.None),
                SettingsJson = settings.ToString(Formatting.None),
                ThemeJson = "{}",
                Status = "Published",
                SubmitButtonText = submitText,
                SuccessMessage = successMessage,
                RulesJson = rules.ToString(Formatting.None),
                WorkflowJson = workflow != null ? workflow.ToString(Formatting.None) : string.Empty,
                CreatedByUserId = userId,
                UpdatedByUserId = userId,
            };
        }
    }
}
