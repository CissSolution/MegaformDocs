using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using MegaForm.Umbraco.Permissions;
using Umbraco.Cms.Web.Common.Controllers;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Umbraco twin of the Oqtane/DNN FormScriptController. Hosts authoring endpoints
    /// for the after-submit C# script feature inside the builder's "After Submit" tab.
    /// </summary>
    [Route("umbraco/MegaForm/MegaFormApi/[controller]")]
    [Authorize(Policy = "MegaFormApi")]
    public class FormScriptController : UmbracoApiController
    {
        private const string ScriptDocsUrl = "https://dnndefender.com/MegaFormDocsT?doc=after-submit-script";

        private readonly IFormRepository _forms;
        private readonly AfterSubmitScriptService _service;
        private readonly IConfiguration _config;

        public FormScriptController(
            IFormRepository forms,
            AfterSubmitScriptService service,
            IConfiguration config)
        {
            _forms = forms;
            _service = service;
            _config = config;
        }

        private bool FeatureEnabled()
        {
            try
            {
                var raw = _config?[AfterSubmitScriptGuard.EnabledSettingKey];
                return !string.IsNullOrWhiteSpace(raw) &&
                       raw.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        private bool IsBackOfficeUser => User?.Identity?.IsAuthenticated == true;

        private IActionResult RequireHost()
        {
            if (AfterSubmitScriptGuard.CanAuthor(IsBackOfficeUser, FeatureEnabled())) return null;

            if (!IsBackOfficeUser)
                return StatusCode(403, new
                {
                    error = "host_only",
                    message = "After-submit scripts can only be viewed or changed by a backoffice user. " +
                              "A script runs in the shared server process, so an unauthenticated caller is not allowed.",
                    docsUrl = ScriptDocsUrl
                });

            // [UmbracoScriptDisabled 2026-08-17] Return 200 with a disabled flag instead of 403 so
            // the builder panel can show a friendly message without a red console error.
            return Ok(new
            {
                disabled = true,
                error = "feature_disabled",
                message = "Server-side scripting is switched off on this installation. Set " +
                          "\"MegaForm:AfterSubmitScriptEnabled\": true in appsettings.json and restart.",
                settingKey = AfterSubmitScriptGuard.EnabledSettingKey,
                docsUrl = ScriptDocsUrl
            });
        }

        private IActionResult CompilerMissing()
        {
            return StatusCode(503, new
            {
                error = "compiler_missing",
                message = "MegaForm.Scripting.dll is not deployed with this site, so scripts cannot be " +
                          "compiled or run. Install the MegaForm Scripting add-on.",
                docsUrl = ScriptDocsUrl
            });
        }

        [HttpGet("Get")]
        [HttpGet("Get/{formId:int}")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter, FormIdParameter = "formId")]
        public IActionResult Get(int formId)
        {
            var denied = RequireHost();
            if (denied != null) return denied;

            var form = _forms.GetForm(formId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var block = AfterSubmitScriptStore.Read(form.SchemaJson, form.SettingsJson)
                        ?? new FormAfterSubmitScriptSettings();

            var runnable = AfterSubmitScriptGuard.IsRunnable(block, out var runnableReason);

            return Ok(new
            {
                formId,
                formTitle = form.Title,
                block.Enabled,
                block.Source,
                block.OnFailure,
                timeoutSeconds = AfterSubmitScriptGuard.ResolveTimeoutSeconds(block),
                approvedBy = block.ApprovedByUserName,
                approvedOnUtc = block.ApprovedOnUtc,
                runnable,
                runnableReason,
                compilerAvailable = _service != null && _service.IsCompilerAvailable,
                fieldKeys = FieldKeys(form),
                maxSourceChars = AfterSubmitScriptGuard.MaxSourceChars,
                docsUrl = ScriptDocsUrl
            });
        }

        public class ScriptPayload
        {
            public int FormId { get; set; }
            public string Source { get; set; }
            public bool Enabled { get; set; }
            public string OnFailure { get; set; }
            public int TimeoutSeconds { get; set; }
            public Dictionary<string, object> SampleData { get; set; }
        }

        [HttpPost("Validate")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult Validate([FromBody] ScriptPayload payload)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (_service == null || !_service.IsCompilerAvailable) return CompilerMissing();

            var compile = _service.Validate(payload?.Source, "form" + (payload?.FormId ?? 0) + "-afterSubmit");
            return Ok(new { success = compile.Success, diagnostics = compile.Diagnostics, hash = compile.Hash });
        }

        [HttpPost("Save")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult Save([FromBody] ScriptPayload payload)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (payload == null || payload.FormId <= 0)
                return BadRequest(new { error = "formId is required." });

            var form = _forms.GetForm(payload.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var source = payload.Source ?? string.Empty;
            if (source.Length > AfterSubmitScriptGuard.MaxSourceChars)
                return BadRequest(new
                {
                    error = "too_long",
                    message = "Source exceeds the maximum length of " + AfterSubmitScriptGuard.MaxSourceChars + " characters.",
                    maxSourceChars = AfterSubmitScriptGuard.MaxSourceChars
                });

            var block = new FormAfterSubmitScriptSettings
            {
                Enabled = payload.Enabled,
                Source = source,
                OnFailure = payload.OnFailure ?? "fail",
                TimeoutSeconds = Math.Clamp(payload.TimeoutSeconds, 1, AfterSubmitScriptGuard.MaxTimeoutSeconds),
                ApprovedByUserName = User?.Identity?.Name ?? "umbraco-admin",
                ApprovedOnUtc = DateTime.UtcNow
            };

            AfterSubmitScriptStore.Write(form.SchemaJson, form.SettingsJson, block,
                out var newSchemaJson, out var newSettingsJson);
            form.SchemaJson = newSchemaJson;
            form.SettingsJson = newSettingsJson;
            _forms.SaveForm(form);

            return Ok(new { success = true, message = "Script saved." });
        }

        [HttpPost("TestRun")]
        [MegaFormAuthorize(MegaFormPermissionConstants.EditLetter)]
        public IActionResult TestRun([FromBody] ScriptPayload payload)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (_service == null || !_service.IsCompilerAvailable) return CompilerMissing();
            if (payload == null || payload.FormId <= 0)
                return BadRequest(new { error = "formId is required." });

            var compile = _service.Validate(payload.Source, "form" + payload.FormId + "-afterSubmit-test");
            if (!compile.Success)
                return Ok(new { success = false, compiled = false, diagnostics = compile.Diagnostics });

            var form = _forms.GetForm(payload.FormId);
            if (form == null) return NotFound(new { error = "Form not found." });

            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (payload.SampleData != null)
                foreach (var kv in payload.SampleData) data[kv.Key] = kv.Value;

            var ctx = new SubmissionScriptContext(data)
            {
                FormId = payload.FormId,
                SubmissionId = 0,
                PortalId = form.PortalId,
                FormTitle = form.Title ?? "(test)",
                UserName = User?.Identity?.Name ?? string.Empty,
                UserEmail = string.Empty,
                IpAddress = string.Empty,
                UtcNow = DateTime.UtcNow
            };

            var probe = new FormAfterSubmitScriptSettings { Enabled = true, Source = payload.Source };
            var run = _service.Run(probe, ctx);

            return Ok(new
            {
                success = run.Success,
                compiled = true,
                skipped = run.Skipped,
                skipReason = run.SkipReason,
                error = run.ErrorMessage,
                durationMs = run.DurationMs,
                log = run.Log,
                variables = run.Variables,
                diagnostics = compile.Diagnostics
            });
        }

        private static List<string> FieldKeys(FormInfo form)
        {
            return AfterSubmitScriptStore.LeafFieldKeys(form?.SchemaJson);
        }
    }
}
