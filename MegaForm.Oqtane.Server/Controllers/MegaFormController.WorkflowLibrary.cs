using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

// ══════════════════════════════════════════════════════════════════════════════
//  Reusable Workflow Library — HTTP surface (Oqtane)
//
//  The storage layer (MF_WorkflowTemplates / MF_WorkflowTemplateVersions /
//  MF_FormWorkflows), the repository and WorkflowEngineV2's resolution order all
//  shipped earlier; no platform ever exposed an endpoint for them, so the tables
//  stayed empty and the feature looked dead. This partial is that missing surface.
//
//  Version semantics (deliberate):
//    - Saving a template creates a NEW version row and marks it current.
//    - Applying a template to a form PINS the form to a concrete version by default.
//      Editing the template afterwards therefore does NOT silently change the
//      behaviour of forms already running in production.
//    - autoUpdate:true stores WorkflowVersionId = null, which makes the form follow
//      the template's CurrentVersionId. Opt-in only.
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Oqtane.Server.Controllers
{
    public partial class MegaFormController
    {
        private IWorkflowLibraryRepository WorkflowLibrary =>
            HttpContext?.RequestServices?.GetService(typeof(IWorkflowLibraryRepository)) as IWorkflowLibraryRepository;

        // ── List templates for the portal + what the form is currently bound to ──
        [HttpGet("Form/Workflow/Library/List")]
        [Authorize(Policy = "EditModule")]
        public IActionResult ListWorkflowLibrary([FromQuery] int formId)
        {
            var lib = WorkflowLibrary;
            if (lib == null) return JsonOk(new { supported = false, templates = new object[0], binding = (object)null });

            var portalId = ResolvePortalId(formId);
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

        // ── What workflow is bound to this form? Drives the builder badge. ──
        [HttpGet("Form/Workflow/Library/FormBinding")]
        [Authorize(Policy = "EditModule")]
        public IActionResult GetWorkflowLibraryBinding([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required." });
            var lib = WorkflowLibrary;
            if (lib == null) return JsonOk(new { supported = false, binding = (object)null });
            return JsonOk(new { supported = true, binding = BuildBindingPayload(lib, formId) });
        }

        // ── Load one template (header + versions + the definition to open) ──
        [HttpGet("Form/Workflow/Library/Get")]
        [Authorize(Policy = "EditModule")]
        public IActionResult GetWorkflowLibraryTemplate([FromQuery] int templateId, [FromQuery] int versionId = 0)
        {
            if (templateId <= 0) return BadRequest(new { error = "templateId is required." });
            var lib = WorkflowLibrary;
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
                // JRaw so the stored definition is embedded as JSON, not as an escaped string.
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

        // ── Save the workflow currently open in the designer into the library ──
        [HttpPost("Form/Workflow/Library/SaveCurrent")]
        [Authorize(Policy = "EditModule")]
        public IActionResult SaveWorkflowToLibrary([FromBody] WorkflowLibrarySaveRequest req)
        {
            if (req == null) return BadRequest(new { error = "Request body is required." });
            if (string.IsNullOrWhiteSpace(req.Name)) return BadRequest(new { error = "name is required." });
            if (req.Workflow.ValueKind == JsonValueKind.Undefined || req.Workflow.ValueKind == JsonValueKind.Null)
                return BadRequest(new { error = "workflow is required." });

            var lib = WorkflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            // Parse + validate the definition the same way Apply does, so we can never
            // store a template that would fail at runtime on the forms that adopt it.
            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(req.Workflow.GetRawText()); }
            catch (Exception)
            {
                // SECURITY_CODING_RULES §10 — never surface ex.Message to the client.
                return UnprocessableEntity(BuildWorkflowResult(false, "library-blocked", null, null,
                    new List<WorkflowIssue> { new WorkflowIssue { Id = "parse", Severity = "error", Source = "library-save", Message = "The workflow could not be parsed." } }));
            }
            if (def == null) return BadRequest(new { error = "workflow is required." });

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "library-save")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return UnprocessableEntity(BuildWorkflowResult(false, "library-blocked", def, null, issues));

            var portalId = ResolvePortalId(req.FormId);

            // A template is portal-scoped. Detaching it from the authoring form keeps the
            // stored definition neutral — the repository re-stamps FormId per form on load.
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

        // ── Bind one or many forms to a library template ──
        [HttpPost("Form/Workflow/Library/ApplyToForm")]
        [Authorize(Policy = "EditModule")]
        public IActionResult ApplyWorkflowLibraryToForm([FromBody] WorkflowLibraryApplyRequest req)
        {
            if (req == null || req.TemplateId <= 0) return BadRequest(new { error = "templateId is required." });

            var formIds = (req.FormIds != null && req.FormIds.Length > 0)
                ? req.FormIds.Where(f => f > 0).Distinct().ToArray()
                : (req.FormId > 0 ? new[] { req.FormId } : Array.Empty<int>());
            if (formIds.Length == 0) return BadRequest(new { error = "formId or formIds is required." });

            var lib = WorkflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });

            var template = lib.GetTemplate(req.TemplateId);
            if (template == null) return NotFound(new { error = "Template not found." });
            if (!TemplateBelongsToCurrentPortal(template)) return NotFound(new { error = "Template not found." });

            // Pin by default. Only an explicit autoUpdate makes the form follow the
            // template's current version, because that changes production behaviour
            // the moment somebody edits the template.
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

                // Cross-portal binding would let a template authored in one site (possibly
                // carrying a Database node with a connectionKey) execute against another.
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

        // ── Detach a form from the library (reverts to its own WorkflowJson) ──
        [HttpPost("Form/Workflow/Library/Unbind")]
        [Authorize(Policy = "EditModule")]
        public IActionResult UnbindWorkflowLibrary([FromBody] WorkflowLibraryUnbindRequest req)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId is required." });
            var lib = WorkflowLibrary;
            if (lib == null) return NotFound(new { error = "Workflow library is not available on this host." });
            lib.ClearMapping(req.FormId);
            return JsonOk(new { success = true, formId = req.FormId });
        }

        // ── Delete a template (unbinds its forms first) ──
        [HttpPost("Form/Workflow/Library/Delete")]
        [Authorize(Policy = "EditModule")]
        public IActionResult DeleteWorkflowLibraryTemplate([FromBody] WorkflowLibraryDeleteRequest req)
        {
            if (req == null || req.TemplateId <= 0) return BadRequest(new { error = "templateId is required." });
            var lib = WorkflowLibrary;
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

        // ── helpers ─────────────────────────────────────────────────────────────

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
                // true when the template moved on but this form is pinned behind it
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
            var portalId = ResolvePortalId(0);
            // portalId 0 means we could not resolve a site from auth/headers — do not guess.
            return portalId <= 0 || template.PortalId <= 0 || template.PortalId == portalId;
        }

        private int? CurrentUserIdOrNull()
        {
            var uid = GetCurrentUserContext()?.UserId ?? 0;
            return uid > 0 ? uid : (int?)null;
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

        public class WorkflowLibraryUnbindRequest { public int FormId { get; set; } }

        public class WorkflowLibraryDeleteRequest
        {
            public int TemplateId { get; set; }
            public bool Force { get; set; }
        }
    }
}
