using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using BuilderTemplateRecord = MegaForm.Core.Services.BuilderTemplateCatalogStore.BuilderTemplateRecord;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class BuilderTemplatesController : DnnApiController
    {
        private BuilderTemplateCatalogService Catalog => new BuilderTemplateCatalogService();

        [HttpGet]
        public HttpResponseMessage List()
        {
            return Request.CreateResponse(HttpStatusCode.OK, Catalog.List());
        }

        // ══════════════════════════════════════════════════════
        //  REMOTE GALLERY (static HTTPS repo — GitHub Pages)
        //  Parity with Oqtane MegaFormController RemoteGallery/*. Premium templates and
        //  their artwork live outside the package; a licensed install downloads them on
        //  demand. LICENSED feature → trial gets 402 (same contract as the form caps).
        // ══════════════════════════════════════════════════════

        /// <summary>
        /// Host setting "MegaForm_GalleryRepoUrl"; empty falls back to the built-in default.
        /// [PrivateGalleryRepo 2026-07-28] "MegaForm_GalleryRepoToken" is an optional read-only
        /// GitHub token for a PRIVATE gallery repo (served from raw.githubusercontent, which the
        /// jsDelivr CDN cannot do). Read host-side only; the service attaches it exclusively to
        /// GitHub hosts, so re-pointing the URL setting cannot exfiltrate it.
        /// </summary>
        private static MegaForm.Core.Services.GalleryRepo.GalleryInstallService BuildGalleryService()
        {
            string url = null, token = null;
            try { url = DotNetNuke.Entities.Controllers.HostController.Instance.GetString("MegaForm_GalleryRepoUrl", string.Empty); }
            catch { /* fall back to default */ }
            try { token = DotNetNuke.Entities.Controllers.HostController.Instance.GetEncryptedString("MegaForm_GalleryRepoToken", DotNetNuke.Common.Utilities.Config.GetDecryptionkey()); }
            catch { /* no token configured — public repo */ }
            return new MegaForm.Core.Services.GalleryRepo.GalleryInstallService(
                new MegaForm.Core.Services.GalleryRepo.GalleryRepositoryService(url, token));
        }

        /// <summary>
        /// [TrialBrowse 2026-07-24] Gates DOWNLOADING a gallery template, not looking at one.
        ///
        /// Trial installs may LIST and PREVIEW the online catalog — that is the shop window, and
        /// hiding it sold nothing. Only the install writes a paid template into the site, so only
        /// the install is gated. Nothing is given away by showing it either: the gallery repo is a
        /// PUBLIC GitHub repo served over a CDN, so its contents are already world-readable.
        /// Parity with Oqtane MegaFormController.GalleryDownloadTrialGate.
        /// </summary>
        private HttpResponseMessage GalleryDownloadTrialGate()
        {
            if (!MegaForm.Core.Services.LicenseService.IsTrial()) return null;
            return Request.CreateResponse((HttpStatusCode)402, new
            {
                error = "trial_remote_gallery",
                message = "Installing templates from the online gallery is available on a paid license.",
                upgradeUrl = MegaForm.Core.Services.LicenseService.UpgradeUrl
            });
        }

        /// <summary>Module image root — entries are stored as "img/&lt;rel&gt;", so extracting under
        /// .../Assets yields .../Assets/img/&lt;rel&gt;, matching the DNN URLs baked into templates.</summary>
        private static string ResolveImageRoot()
        {
            try { return System.Web.Hosting.HostingEnvironment.MapPath("~/DesktopModules/MegaForm/Assets"); }
            catch { return null; }
        }

        [HttpGet]
        [ActionName("RemoteGalleryList")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> RemoteGalleryList(bool refresh = false)
        {
            // Browsing is open to trial (see GalleryDownloadTrialGate) — `trial` tells the client
            // to show the catalog read-only, with an Upgrade CTA instead of an install action.
            var svc = BuildGalleryService();
            var res = await svc.GetManifestAsync(refresh);
            if (!res.Success || res.Value == null)
                return Request.CreateResponse(HttpStatusCode.ServiceUnavailable,
                    new { error = "gallery_unavailable", message = res.Message });

            var installed = new System.Collections.Generic.HashSet<string>(
                (Catalog.List() ?? (System.Collections.Generic.IReadOnlyList<BuilderTemplateRecord>)new System.Collections.Generic.List<BuilderTemplateRecord>())
                    .Select(t => (t?.Slug ?? string.Empty).Trim()),
                StringComparer.OrdinalIgnoreCase);

            var items = (res.Value.Templates ?? new System.Collections.Generic.List<MegaForm.Core.Services.GalleryRepo.GalleryRepoTemplateInfo>())
                .Where(t => t != null && !string.IsNullOrWhiteSpace(t.Slug))
                .Select(t => new
                {
                    slug = t.Slug,
                    title = t.Title,
                    description = t.Description,
                    category = t.Category,
                    categories = t.Categories,
                    icon = t.Icon,
                    version = t.Version,
                    sizeBytes = t.SizeBytes,
                    assetsSizeBytes = t.AssetsSizeBytes,
                    premium = t.Premium,
                    fieldCount = t.FieldCount,
                    installed = installed.Contains((t.Slug ?? string.Empty).Trim())
                })
                .ToList();

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                repoUrl = svc.RepoBaseUrl,
                offline = res.Offline,
                message = res.Message,
                // Browse-only mode. The client still refuses the install action itself, and the
                // install endpoint re-checks — this flag is UX, never the enforcement.
                trial = MegaForm.Core.Services.LicenseService.IsTrial(),
                templates = items
            });
        }

        /// <summary>
        /// Returns ONE gallery template's verified JSON without installing it, so the gallery
        /// can render a real thumbnail/preview instead of making the user install blind.
        /// Read-only: same download + sha256 + validation path as install, nothing is written.
        /// </summary>
        [HttpGet]
        [ActionName("RemoteGalleryPreview")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> RemoteGalleryPreview(string slug)
        {
            // Open to trial: this is the shop window. Read-only — nothing is written to the
            // template catalog here, so a trial visitor can look but cannot keep.
            var svc = BuildGalleryService();
            var fetch = await svc.FetchTemplateAsync(slug, false);
            if (!fetch.Success)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "preview_failed", message = fetch.Error });

            // Materialise the template's artwork before previewing. A premium template's hero is
            // a background image referenced by absolute URL; until the bundle is extracted those
            // URLs 404 and the preview (and the card thumbnail) show a large empty area instead of
            // the design. Extraction is idempotent and never overwrites, and images are inert
            // static files, so doing it on preview costs nothing and makes "look before you
            // install" actually show the template.
            try { await svc.InstallAssetsAsync(fetch.Info, ResolveImageRoot()); }
            catch { /* preview must still work without artwork */ }

            // Hand back the raw template document; the client turns it into a WizardTemplate
            // with the same helper it uses for an uploaded .json.
            var resp = Request.CreateResponse(HttpStatusCode.OK);
            resp.Content = new StringContent(fetch.Json, System.Text.Encoding.UTF8, "application/json");
            return resp;
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("RemoteGalleryInstall")]
        public async System.Threading.Tasks.Task<HttpResponseMessage> RemoteGalleryInstall(JObject body)
        {
            // THE gate. Listing and previewing are open; writing a paid template into this site
            // is not. Enforced here, server-side — the client's read-only rendering is only UX.
            var gate = GalleryDownloadTrialGate();
            if (gate != null) return gate;

            var slug = body != null ? (string)(body["slug"] ?? body["Slug"]) : null;
            var svc = BuildGalleryService();

            var fetch = await svc.FetchTemplateAsync(slug, false);
            if (!fetch.Success)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "install_failed", message = fetch.Error });

            try
            {
                var record = Catalog.SaveTemplateJson(fetch.FileName, fetch.Json);

                // Artwork is best-effort: the template is already installed and usable, so a
                // failed bundle must not fail the whole install — report it instead.
                var assets = await svc.InstallAssetsAsync(fetch.Info, ResolveImageRoot());

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = true,
                    slug = fetch.Slug,
                    template = record,
                    assetsInstalled = assets.FilesWritten,
                    assetsError = assets.Success ? null : assets.Error
                });
            }
            catch (Exception ex)
            {
                // Never surface ex.Message to the client (SECURITY_CODING_RULES §10).
                DotNetNuke.Instrumentation.LoggerSource.Instance.GetLogger(typeof(BuilderTemplatesController))
                    .Error("MegaForm gallery install failed for slug " + fetch.Slug, ex);
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = "install_failed", message = "Could not save the downloaded template." });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("UploadJson")]
        public HttpResponseMessage UploadJson()
        {
            try
            {
                var httpRequest = HttpContext.Current?.Request;
                if (httpRequest == null)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Request is unavailable" });

                string json = httpRequest.Form["templateJson"];
                string originalName = "uploaded-template.json";
                if (httpRequest.Files.Count > 0)
                {
                    var file = httpRequest.Files[0];
                    if (file != null)
                    {
                        originalName = string.IsNullOrWhiteSpace(file.FileName) ? originalName : Path.GetFileName(file.FileName);
                        var result = Catalog.SaveUploadedTemplate(originalName, file.InputStream, json);
                        if (result.IsArchive)
                        {
                            return Request.CreateResponse(HttpStatusCode.OK, new
                            {
                                success = result.Success,
                                archive = true,
                                message = result.Message,
                                importedTemplateCount = result.ImportedTemplateCount,
                                extractedFileCount = result.ExtractedFileCount,
                                templates = result.Templates
                            });
                        }
                        return Request.CreateResponse(HttpStatusCode.OK, result.Saved ?? (object)result);
                    }
                }

                if (string.IsNullOrWhiteSpace(json))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "Template file or JSON payload is required" });

                var saved = Catalog.SaveTemplateJson(originalName, json);
                return Request.CreateResponse(HttpStatusCode.OK, saved);
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = ex.Message, detail = ex.InnerException?.Message });
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [ActionName("DevBulkCreateForms")]
        public HttpResponseMessage DevBulkCreateForms()
        {
            try
            {
                if (!HasDevLock())
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "dev.lock is required" });

                int moduleId = ActiveModule != null ? ActiveModule.ModuleID : 0;
                int portalId = PortalSettings?.PortalId ?? 0;
                int userId = UserInfo?.UserID ?? 0;
                var templates = Catalog.List() ?? Array.Empty<BuilderTemplateRecord>();
                var existingForms = FormRepository.GetFormsByPortal(portalId) ?? new System.Collections.Generic.List<FormInfo>();

                int created = 0;
                int updated = 0;
                var formIds = new System.Collections.Generic.List<int>();
                var items = new System.Collections.Generic.List<object>();
                var errors = new System.Collections.Generic.List<object>();

                foreach (var template in templates)
                {
                    var sourceFile = string.IsNullOrWhiteSpace(template?.FileName)
                        ? ((template?.Slug ?? "template") + ".json")
                        : template.FileName;

                    try
                    {
                        var form = FindExistingDevBulkForm(existingForms, sourceFile) ?? new FormInfo();
                        bool isNew = form.FormId == 0;

                        ApplyDevBulkTemplateToForm(form, template, sourceFile, moduleId, portalId, userId);
                        int formId = FormRepository.SaveForm(form);
                        form.FormId = formId;

                        if (isNew)
                        {
                            created++;
                            existingForms.Add(form);
                        }
                        else
                        {
                            updated++;
                        }

                        formIds.Add(formId);
                        items.Add(new
                        {
                            formId = formId,
                            sourceFile = sourceFile,
                            title = form.Title,
                            status = isNew ? "created" : "updated"
                        });
                    }
                    catch (Exception templateEx)
                    {
                        errors.Add(new
                        {
                            sourceFile = sourceFile,
                            error = templateEx.Message,
                            detail = templateEx.InnerException?.Message
                        });
                    }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    success = errors.Count == 0,
                    marker = "Dev bulk publish seed v20260410-08",
                    totalTemplates = templates.Count,
                    created,
                    updated,
                    failed = errors.Count,
                    formIds = formIds.Distinct().ToArray(),
                    items,
                    errors
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.BadRequest, new
                {
                    error = ex.Message,
                    detail = ex.InnerException?.Message,
                    marker = "Dev bulk publish seed v20260410-09"
                });
            }
        }

        private bool HasDevLock()
        {
            try
            {
                var portalHome = PortalSettings?.HomeDirectoryMapPath;
                if (!string.IsNullOrWhiteSpace(portalHome) && File.Exists(Path.Combine(portalHome, "dev.lock")))
                    return true;

                var appPath = System.Web.Hosting.HostingEnvironment.MapPath("~/");
                if (!string.IsNullOrWhiteSpace(appPath) && File.Exists(Path.Combine(appPath, "dev.lock")))
                    return true;
            }
            catch { }

            return false;
        }

        private static FormInfo FindExistingDevBulkForm(System.Collections.Generic.IEnumerable<FormInfo> forms, string sourceFile)
        {
            foreach (var form in forms ?? Enumerable.Empty<FormInfo>())
            {
                if (form == null) continue;

                try
                {
                    if (!string.IsNullOrWhiteSpace(form.SettingsJson))
                    {
                        var settings = JObject.Parse(form.SettingsJson);
                        var seed = settings["devBulkSeed"] as JObject;
                        var existingSource = (string)seed?["sourceFile"];
                        if (!string.IsNullOrWhiteSpace(existingSource) && string.Equals(existingSource, sourceFile, StringComparison.OrdinalIgnoreCase))
                            return form;
                    }
                }
                catch
                {
                }

                if (string.Equals(form.Title, sourceFile, StringComparison.OrdinalIgnoreCase))
                    return form;
            }

            return null;
        }

        private static void ApplyDevBulkTemplateToForm(FormInfo form, BuilderTemplateRecord template, string sourceFile, int moduleId, int portalId, int userId)
        {
            if (form == null) return;
            template = template ?? new BuilderTemplateRecord();

            var safeSourceFile = Path.GetFileName(string.IsNullOrWhiteSpace(sourceFile) ? ((template?.Slug ?? "template") + ".json") : sourceFile);
            if (string.IsNullOrWhiteSpace(safeSourceFile)) safeSourceFile = "template.json";
            if (safeSourceFile.Length > 500) safeSourceFile = safeSourceFile.Substring(0, 500);

            var settings = template.Settings != null ? new JObject(template.Settings) : new JObject();
            settings["submitButtonText"] = template.SubmitButtonText ?? "Submit";
            settings["successMessage"] = template.SuccessMessage ?? string.Empty;
            settings["customHtml"] = template.CustomHtml ?? string.Empty;
            settings["customCss"] = template.CustomCss ?? string.Empty;
            settings["rules"] = template.Rules != null ? template.Rules.DeepClone() : new JArray();
            settings["workflowTemplate"] = template.Workflow != null ? template.Workflow.DeepClone() : null;
            settings["devBulkSeed"] = new JObject
            {
                ["sourceFile"] = safeSourceFile,
                ["templateId"] = template.Id ?? string.Empty,
                ["templateSlug"] = template.Slug ?? string.Empty,
                ["locked"] = false,
                ["createdBy"] = "Dev bulk publish seed v20260410-06",
                ["updatedUtc"] = DateTime.UtcNow.ToString("O")
            };

            var schema = new JObject
            {
                ["version"] = "1.0",
                ["fields"] = template.Fields != null ? new JArray(template.Fields.Select(f => f.DeepClone())) : new JArray(),
                ["settings"] = new JObject(settings)
            };

            // [F strip-.json 2026-07-22] Prefer the template's human title; never store the raw ".json" filename as the form Title.
            var cleanTitle = !string.IsNullOrWhiteSpace(template.Title)
                ? template.Title.Trim()
                : Path.GetFileNameWithoutExtension(safeSourceFile);
            if (string.IsNullOrWhiteSpace(cleanTitle)) cleanTitle = Path.GetFileNameWithoutExtension(safeSourceFile);
            if (string.IsNullOrWhiteSpace(cleanTitle)) cleanTitle = "Untitled Form";

            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = cleanTitle;
            form.Description = string.IsNullOrWhiteSpace(template.Description) ? ("DEV bulk form seeded from " + safeSourceFile) : template.Description;
            form.SchemaJson = schema.ToString(Formatting.None);
            form.SettingsJson = settings.ToString(Formatting.None);
            form.ThemeJson = string.IsNullOrWhiteSpace(form.ThemeJson) ? "{}" : form.ThemeJson;
            form.Status = "Published";
            form.SubmitButtonText = template.SubmitButtonText ?? "Submit";
            form.SuccessMessage = template.SuccessMessage ?? string.Empty;
            form.RulesJson = template.Rules != null ? template.Rules.ToString(Formatting.None) : "[]";
            form.WorkflowJson = template.Workflow != null ? template.Workflow.ToString(Formatting.None) : string.Empty;
            form.CreatedByUserId = form.CreatedByUserId > 0 ? form.CreatedByUserId : userId;
            form.UpdatedByUserId = userId;
        }
    }
}
