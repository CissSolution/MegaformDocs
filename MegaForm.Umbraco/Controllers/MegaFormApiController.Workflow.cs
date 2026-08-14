using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;
using MegaForm.Umbraco.Permissions;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Workflow builder + reusable workflow library endpoints for Umbraco.
    /// Mirrors MegaForm.Oqtane.Server.Controllers.MegaFormController workflow surface.
    /// </summary>
    public partial class MegaFormApiController
    {
        private int ResolvePortalIdForWorkflow(int formId)
        {
            if (formId > 0)
            {
                var form = _formRepo.GetForm(formId);
                if (form != null && form.PortalId > 0) return form.PortalId;
            }
            var portalId = _platform?.PortalId ?? 0;
            return portalId > 0 ? portalId : 0;
        }

        private int? CurrentUserIdOrNull()
        {
            var uid = _platform?.UserId ?? 0;
            return uid > 0 ? uid : (int?)null;
        }

        private static ContentResult JsonOk(object payload)
        {
            var json = JsonConvert.SerializeObject(payload);
            return new ContentResult
            {
                Content = json,
                ContentType = "application/json",
                StatusCode = 200
            };
        }

        // ══════════════════════════════════════════════════════
        //  WORKFLOW BUILDER
        // ══════════════════════════════════════════════════════

        [HttpGet]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter, FormIdParameter = "formId")]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Get")]
        public IActionResult GetWorkflow([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required." });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            return JsonOk(new
            {
                formId,
                hasWorkflow = env.DraftWorkflow != null || env.AppliedWorkflow != null,
                workflow = env.DraftWorkflow ?? env.AppliedWorkflow,
                appliedWorkflow = env.AppliedWorkflow,
                draftUpdatedAt = env.DraftUpdatedAt,
                appliedAt = env.AppliedAt,
                appliedBy = env.AppliedBy,
                draftVersion = env.DraftVersion,
                appliedVersion = env.AppliedVersion
            });
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/NodeSchema")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult GetWorkflowNodeSchema([FromQuery] string nodeType)
        {
            if (string.IsNullOrWhiteSpace(nodeType)) return BadRequest(new { error = "nodeType is required." });
            var schema = _nodeSchemaProvider?.GetSchema(nodeType);
            if (schema == null) return NotFound(new { error = "Schema not found for nodeType='" + nodeType + "'." });
            return JsonOk(schema);
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Webhook/Presets")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult GetWorkflowWebhookPresets()
        {
            var schema = _nodeSchemaProvider?.GetSchema("Webhook");
            return JsonOk(schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Email/Presets")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult GetWorkflowEmailPresets()
        {
            var schema = _nodeSchemaProvider?.GetSchema("SendEmail");
            return JsonOk(schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/SaveDraft")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult SaveDraftWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "draft-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "save-draft", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Draft);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "save-draft")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "draft-blocked", def, null, issues));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            env.DraftWorkflow = def;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = NextDraftVersion(env.AppliedVersion, env.DraftVersion);
            if (env.AppliedWorkflow == null)
            {
                env.AppliedWorkflow = def;
                env.AppliedAt = def.UpdatedAt != default(DateTime) ? def.UpdatedAt : DateTime.UtcNow;
                env.AppliedBy = string.IsNullOrWhiteSpace(env.AppliedBy) ? "migrated" : env.AppliedBy;
                env.AppliedVersion = string.IsNullOrWhiteSpace(env.AppliedVersion) ? StripDraftSuffix(env.DraftVersion) : env.AppliedVersion;
            }
            form.WorkflowJson = JsonConvert.SerializeObject(env);
            _formRepo.SaveForm(form);
            return JsonOk(BuildWorkflowResult(true, "draft-saved", def, env, issues));
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Validate")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult ValidateWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null) return BadRequest(new { error = "workflow is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "validated", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "validate", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "validate")).ToList();
            var env = req.FormId > 0 ? WorkflowEnvelope.ParseOrMigrate(_formRepo.GetForm(req.FormId)?.WorkflowJson) : null;
            return JsonOk(BuildWorkflowResult(!issues.Any(i => i.Severity == "error"), "validated", def, env, issues));
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Apply")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult ApplyWorkflow([FromBody] WorkflowSaveRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception ex)
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "apply-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "apply", Message = "Invalid workflow JSON: " + ex.Message } }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "apply")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "apply-blocked", def, null, issues));

            var form = _formRepo.GetForm(req.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var env = WorkflowEnvelope.ParseOrMigrate(form.WorkflowJson);
            env.DraftWorkflow = def;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = NextDraftVersion(env.AppliedVersion, env.DraftVersion);
            env.AppliedWorkflow = def;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = User?.Identity?.Name ?? "user";
            env.AppliedVersion = StripDraftSuffix(env.DraftVersion) ?? "1.0.0";
            form.WorkflowJson = JsonConvert.SerializeObject(env);
            _formRepo.SaveForm(form);
            return JsonOk(BuildWorkflowResult(true, "applied", def, env, issues));
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Save")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult SaveWorkflowBuilder([FromBody] WorkflowSaveRequest req)
        {
            return ApplyWorkflow(req);
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/TestRun")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult TestRunWorkflow([FromBody] WorkflowTestRunRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            return JsonOk(new
            {
                executionId = Guid.NewGuid().ToString("N"),
                status = "success",
                log = Array.Empty<object>(),
                variables = new { },
                nodeResults = new { },
                errorMessage = (string)null,
                durationMs = 0
            });
        }

        // ══════════════════════════════════════════════════════
        //  REUSABLE WORKFLOW LIBRARY
        // ══════════════════════════════════════════════════════

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/List")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter, FormIdParameter = "formId")]
        public IActionResult ListWorkflowLibrary([FromQuery] int formId)
        {
            var lib = _workflowLibrary;
            if (lib == null) return JsonOk(new { supported = false, templates = new object[0], binding = (object)null });

            var portalId = ResolvePortalIdForWorkflow(formId);
            var templates = lib.ListTemplates(portalId, enabledOnly: false) ?? new List<WorkflowTemplateInfo>();

            var rows = templates.Select(t => new
            {
                templateId = t.WorkflowTemplateId,
                templateKey = t.TemplateKey,
                name = t.Name,
                description = t.Description,
                category = t.Category,
                isEnabled = t.IsEnabled,
                currentVersionId = t.CurrentVersionId,
                updatedOnUtc = t.UpdatedOnUtc ?? t.CreatedOnUtc,
                formsUsing = lib.CountFormsUsingTemplate(t.WorkflowTemplateId)
            }).ToList();

            return JsonOk(new { supported = true, portalId, templates = rows, binding = BuildBindingPayload(lib, formId) });
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/FormBinding")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter, FormIdParameter = "formId")]
        public IActionResult GetWorkflowLibraryBinding([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required." });
            var lib = _workflowLibrary;
            if (lib == null) return JsonOk(new { supported = false, binding = (object)null });
            return JsonOk(new { supported = true, binding = BuildBindingPayload(lib, formId) });
        }

        [HttpGet]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/Get")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult GetWorkflowLibraryTemplate([FromQuery] int templateId, [FromQuery] int versionId = 0)
        {
            if (templateId <= 0) return BadRequest(new { error = "templateId is required." });
            var lib = _workflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            var template = lib.GetTemplate(templateId);
            if (template == null) return NotFound(new { error = "Template not found." });
            if (!TemplateBelongsToCurrentPortal(template)) return NotFound(new { error = "Template not found." });

            var versions = lib.ListVersions(templateId) ?? new List<WorkflowTemplateVersionInfo>();
            var version = versionId > 0
                ? versions.FirstOrDefault(v => v.WorkflowVersionId == versionId)
                : versions.FirstOrDefault(v => v.WorkflowVersionId == (template.CurrentVersionId ?? 0))
                  ?? versions.FirstOrDefault(v => v.IsApplied)
                  ?? versions.FirstOrDefault();

            return JsonOk(new
            {
                templateId = template.WorkflowTemplateId,
                templateKey = template.TemplateKey,
                name = template.Name,
                description = template.Description,
                category = template.Category,
                isEnabled = template.IsEnabled,
                currentVersionId = template.CurrentVersionId,
                versionId = version?.WorkflowVersionId ?? 0,
                version = version?.Version ?? "",
                workflow = version != null && !string.IsNullOrWhiteSpace(version.DefinitionJson)
                    ? (object)new JRaw(version.DefinitionJson)
                    : null,
                versions = versions.Select(v => new
                {
                    versionId = v.WorkflowVersionId,
                    version = v.Version,
                    notes = v.Notes,
                    isApplied = v.IsApplied,
                    createdOnUtc = v.CreatedOnUtc
                }).ToList()
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/SaveCurrent")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult SaveWorkflowToLibrary([FromBody] WorkflowLibrarySaveRequest req)
        {
            if (req == null) return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { error = "name is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            var lib = _workflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch
            {
                return UnprocessableEntity(BuildWorkflowResult(false, "library-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "library-save", Message = "The workflow could not be parsed." } }));
            }
            if (def == null) return BadRequest(new { error = "workflow is required." });

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "library-save")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "library-blocked", def, null, issues));

            var portalId = ResolvePortalIdForWorkflow(req.FormId);
            def.FormId = 0;

            WorkflowTemplateInfo template;
            if (req.TemplateId > 0)
            {
                template = lib.GetTemplate(req.TemplateId);
                if (template == null) return NotFound(new { error = "Template not found." });
                if (!TemplateBelongsToCurrentPortal(template)) return NotFound(new { error = "Template not found." });
                template.Name = req.Name.Trim();
                template.Description = req.Description ?? string.Empty;
                template.Category = req.Category ?? string.Empty;
            }
            else
            {
                var key = MakeTemplateKey(lib, portalId, req.Name);
                template = new WorkflowTemplateInfo
                {
                    PortalId = portalId,
                    TemplateKey = key,
                    Name = req.Name.Trim(),
                    Description = req.Description ?? string.Empty,
                    Category = req.Category ?? string.Empty,
                    IsEnabled = true,
                    CreatedByUserId = CurrentUserIdOrNull()
                };
            }

            var templateId = lib.SaveTemplate(template);

            var existing = lib.ListVersions(templateId) ?? new List<WorkflowTemplateVersionInfo>();
            var newVersion = new WorkflowTemplateVersionInfo
            {
                WorkflowTemplateId = templateId,
                Version = NextLibraryVersion(existing),
                DefinitionJson = JsonConvert.SerializeObject(def),
                Notes = req.VersionNotes ?? string.Empty,
                CreatedByUserId = CurrentUserIdOrNull()
            };
            var versionId = lib.SaveVersion(newVersion);
            lib.ApplyVersion(templateId, versionId, User?.Identity?.Name ?? "user");

            return JsonOk(new
            {
                success = true,
                templateId,
                versionId,
                version = newVersion.Version,
                name = template.Name,
                formsUsing = lib.CountFormsUsingTemplate(templateId)
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/ApplyToForm")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult ApplyWorkflowLibraryToForm([FromBody] WorkflowLibraryApplyRequest req)
        {
            if (req == null || req.TemplateId <= 0) return BadRequest(new { error = "templateId is required." });

            var formIds = (req.FormIds != null && req.FormIds.Length > 0)
                ? req.FormIds.Where(f => f > 0).Distinct().ToArray()
                : (req.FormId > 0 ? new[] { req.FormId } : Array.Empty<int>());
            if (formIds.Length == 0) return BadRequest(new { error = "formId or formIds is required." });

            var lib = _workflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            var template = lib.GetTemplate(req.TemplateId);
            if (template == null) return NotFound(new { error = "Template not found." });
            if (!TemplateBelongsToCurrentPortal(template)) return NotFound(new { error = "Template not found." });

            int? pinnedVersionId = null;
            if (!req.AutoUpdate)
            {
                pinnedVersionId = req.VersionId > 0 ? req.VersionId : template.CurrentVersionId;
                if (pinnedVersionId == null || pinnedVersionId <= 0)
                    return BadRequest(new { error = "Template has no saved version to pin. Save the workflow first." });

                var v = lib.GetVersion(pinnedVersionId.Value);
                if (v == null || v.WorkflowTemplateId != template.WorkflowTemplateId)
                    return BadRequest(new { error = "versionId does not belong to this template." });
            }

            var applied = new List<object>();
            var skipped = new List<object>();

            foreach (var fid in formIds)
            {
                var form = _formRepo.GetForm(fid);
                if (form == null) { skipped.Add(new { formId = fid, reason = "Form not found." }); continue; }

                if (form.PortalId > 0 && template.PortalId > 0 && form.PortalId != template.PortalId)
                { skipped.Add(new { formId = fid, reason = "Form belongs to a different site." }); continue; }

                lib.ApplyToForm(new FormWorkflowMappingInfo
                {
                    FormId = fid,
                    WorkflowTemplateId = template.WorkflowTemplateId,
                    WorkflowVersionId = pinnedVersionId,
                    FieldMappingsJson = SerializeOrDefault(req.FieldMappings, "[]"),
                    VariableOverridesJson = SerializeOrDefault(req.VariableOverrides, "{}"),
                    TriggerType = string.IsNullOrWhiteSpace(req.TriggerType) ? "on_submit" : req.TriggerType.Trim(),
                    AppliedByUserId = CurrentUserIdOrNull(),
                    AppliedBy = User?.Identity?.Name ?? "user"
                });
                applied.Add(new { formId = fid });
            }

            return JsonOk(new
            {
                success = applied.Count > 0,
                templateId = template.WorkflowTemplateId,
                name = template.Name,
                pinnedVersionId,
                autoUpdate = req.AutoUpdate,
                applied,
                skipped
            });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/Unbind")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult UnbindWorkflowLibrary([FromBody] WorkflowLibraryUnbindRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            var lib = _workflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });
            lib.ClearMapping(req.FormId);
            return JsonOk(new { success = true, formId = req.FormId });
        }

        [HttpPost]
        [Route("/umbraco/MegaForm/MegaFormApi/Form/Workflow/Library/Delete")]
        [MegaFormAuthorize(MegaFormPermissionConstants.WorkflowLetter)]
        public IActionResult DeleteWorkflowLibraryTemplate([FromBody] WorkflowLibraryDeleteRequest req)
        {
            if (req == null || req.TemplateId <= 0) return BadRequest(new { error = "templateId is required." });
            var lib = _workflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            var template = lib.GetTemplate(req.TemplateId);
            if (template == null) return NotFound(new { error = "Template not found." });
            if (!TemplateBelongsToCurrentPortal(template)) return NotFound(new { error = "Template not found." });

            var inUse = lib.CountFormsUsingTemplate(req.TemplateId);
            if (inUse > 0 && !req.Force)
                return Conflict(new { error = "Template is applied to " + inUse + " form(s).", formsUsing = inUse });

            lib.DeleteTemplate(req.TemplateId);
            return JsonOk(new { success = true, templateId = req.TemplateId, unbound = inUse });
        }

        // ── helpers ─────────────────────────────────────────────────────────

        private object BuildBindingPayload(IWorkflowLibraryRepository lib, int formId)
        {
            if (formId <= 0) return null;
            var mapping = lib.GetActiveMapping(formId);
            if (mapping == null) return null;

            var template = lib.GetTemplate(mapping.WorkflowTemplateId);
            if (template == null) return null;

            var pinned = mapping.WorkflowVersionId.HasValue ? lib.GetVersion(mapping.WorkflowVersionId.Value) : null;
            var effective = pinned ?? (template.CurrentVersionId.HasValue ? lib.GetVersion(template.CurrentVersionId.Value) : null);

            return new
            {
                templateId = template.WorkflowTemplateId,
                name = template.Name,
                category = template.Category,
                pinnedVersionId = mapping.WorkflowVersionId,
                autoUpdate = !mapping.WorkflowVersionId.HasValue,
                effectiveVersion = effective?.Version ?? "",
                effectiveVersionId = effective?.WorkflowVersionId ?? 0,
                currentVersionId = template.CurrentVersionId,
                outdated = mapping.WorkflowVersionId.HasValue
                           && template.CurrentVersionId.HasValue
                           && mapping.WorkflowVersionId.Value != template.CurrentVersionId.Value,
                triggerType = mapping.TriggerType,
                appliedOnUtc = mapping.AppliedOnUtc,
                appliedBy = mapping.AppliedBy,
                variableOverrides = ParseJsonObjectOrEmpty(mapping.VariableOverridesJson),
                fieldMappings = ParseJsonArrayOrEmpty(mapping.FieldMappingsJson)
            };
        }

        private bool TemplateBelongsToCurrentPortal(WorkflowTemplateInfo template)
        {
            if (template == null) return false;
            var portalId = ResolvePortalIdForWorkflow(0);
            return portalId <= 0 || template.PortalId <= 0 || template.PortalId == portalId;
        }

        private static string SerializeOrDefault(JsonElement value, string fallback)
        {
            if (value.ValueKind == JsonValueKind.Undefined || value.ValueKind == JsonValueKind.Null)
                return fallback;
            var raw = value.GetRawText();
            return string.IsNullOrWhiteSpace(raw) ? fallback : raw;
        }

        private static object ParseJsonObjectOrEmpty(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new JRaw("{}");
            try { JObject.Parse(json); return new JRaw(json); } catch { return new JRaw("{}"); }
        }

        private static object ParseJsonArrayOrEmpty(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new JRaw("[]");
            try { JArray.Parse(json); return new JRaw(json); } catch { return new JRaw("[]"); }
        }

        private static string MakeTemplateKey(IWorkflowLibraryRepository lib, int portalId, string name)
        {
            var slug = new string((name ?? "").Trim().ToLowerInvariant()
                .Select(c => char.IsLetterOrDigit(c) ? c : '-').ToArray());
            while (slug.Contains("--")) slug = slug.Replace("--", "-");
            slug = slug.Trim('-');
            if (slug.Length == 0) slug = "workflow";
            if (slug.Length > 80) slug = slug.Substring(0, 80);

            var candidate = slug;
            var n = 2;
            while (lib.GetTemplateByKey(portalId, candidate) != null)
            {
                candidate = slug + "-" + n;
                n++;
                if (n > 500) { candidate = slug + "-" + Guid.NewGuid().ToString("N").Substring(0, 6); break; }
            }
            return candidate;
        }

        private static string NextLibraryVersion(List<WorkflowTemplateVersionInfo> existing)
        {
            var max = 0;
            foreach (var v in existing)
            {
                var parts = (v.Version ?? "").Split('.');
                if (parts.Length > 0 && int.TryParse(parts[0], out var major) && major > max) max = major;
            }
            return (max + 1) + ".0.0";
        }

        private static WorkflowSaveResult BuildWorkflowResult(bool success, string status, WorkflowDefinition def, WorkflowEnvelope env, List<WorkflowIssue> issues)
        {
            return new WorkflowSaveResult
            {
                Success = success,
                Status = status,
                WorkflowVersion = env != null ? env.DraftVersion : (def != null ? def.Version : null),
                ActiveVersion = env != null ? env.AppliedVersion : null,
                AppliedAt = env != null ? env.AppliedAt : (DateTime?)null,
                AppliedBy = env != null ? env.AppliedBy : null,
                Issues = issues ?? new List<WorkflowIssue>()
            };
        }

        private static string NextDraftVersion(string appliedVersion, string currentDraftVersion)
        {
            var baseVersion = StripDraftSuffix(currentDraftVersion) ?? StripDraftSuffix(appliedVersion) ?? "1.0.0";
            return baseVersion + "-draft";
        }

        private static string StripDraftSuffix(string version)
        {
            if (string.IsNullOrWhiteSpace(version)) return null;
            return version.EndsWith("-draft", StringComparison.OrdinalIgnoreCase)
                ? version.Substring(0, version.Length - 6)
                : version;
        }

        // ── request / response DTOs ─────────────────────────────────────────

        public class WorkflowSaveRequest
        {
            public int FormId { get; set; }
            public JsonElement Workflow { get; set; }
        }

        public class WorkflowTestRunRequest
        {
            public int FormId { get; set; }
            public Dictionary<string, object> FormData { get; set; }
            public bool DryRun { get; set; }
        }

        public class WorkflowLibrarySaveRequest
        {
            public int FormId { get; set; }
            public int TemplateId { get; set; }
            public string Name { get; set; }
            public string Description { get; set; }
            public string Category { get; set; }
            public string VersionNotes { get; set; }
            public JsonElement Workflow { get; set; }
        }

        public class WorkflowLibraryApplyRequest
        {
            public int FormId { get; set; }
            public int[] FormIds { get; set; }
            public int TemplateId { get; set; }
            public int VersionId { get; set; }
            public bool AutoUpdate { get; set; }
            public string TriggerType { get; set; }
            public JsonElement FieldMappings { get; set; }
            public JsonElement VariableOverrides { get; set; }
        }

        public class WorkflowLibraryUnbindRequest
        {
            public int FormId { get; set; }
        }

        public class WorkflowLibraryDeleteRequest
        {
            public int TemplateId { get; set; }
            public bool Force { get; set; }
        }
    }
}
