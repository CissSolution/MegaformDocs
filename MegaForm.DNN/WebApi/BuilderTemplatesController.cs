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

            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = safeSourceFile;
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
