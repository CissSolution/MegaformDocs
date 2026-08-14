/*
 * MegaForm.Oqtane.Server/Controllers/FormScriptController.cs
 *
 * [AfterSubmitScript v20260813-01] Host-only authoring endpoint for the after-submit C#
 * hook — the Oqtane twin of MegaForm.DNN/WebApi/FormScriptController.cs.
 *
 *   GET  /api/MegaFormPopup/FormScript/Get/{formId}
 *   POST /api/MegaFormPopup/FormScript/Validate
 *   POST /api/MegaFormPopup/FormScript/Save
 *   POST /api/MegaFormPopup/FormScript/TestRun
 *
 * ── Authority ───────────────────────────────────────────────────────────────────
 * [Authorize(Roles = RoleNames.Host)] on the class, and RequireHost() again inside every
 * action against the same rule the DNN twin uses. Admin is deliberately NOT enough: on
 * Oqtane, Admin is a per-site role, while a script runs in the shared server process for
 * every tenant on the installation. Host is the only role whose scope matches the blast
 * radius.
 *
 * Note the deliberate absence of [IgnoreAntiforgeryToken], which most controllers in this
 * folder carry. This one changes server-executable state, so it keeps the token check
 * (CLAUDE.md rule 4).
 */

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
using Oqtane.Infrastructure;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    [Route("api/MegaFormPopup/[controller]")]
    [Authorize(Roles = RoleNames.Host)]
    public class FormScriptController : global::Oqtane.Controllers.ModuleControllerBase
    {
        private const string ScriptDocsUrl = "https://dnndefender.com/MegaFormDocsT?doc=after-submit-script";

        private readonly IFormRepository _forms;
        private readonly AfterSubmitScriptService _service;
        private readonly IConfiguration _config;

        public FormScriptController(
            IFormRepository forms,
            AfterSubmitScriptService service,
            IConfiguration config,
            ILogManager logger,
            IHttpContextAccessor accessor) : base(logger, accessor)
        {
            _forms = forms;
            _service = service;
            _config = config;
        }

        // ─── authority ────────────────────────────────────────────────────────────

        private bool IsHost => User != null && User.IsInRole(RoleNames.Host);

        /// <summary>
        /// appsettings: "MegaForm:AfterSubmitScriptEnabled": true. Off by default, and an
        /// unreadable/absent value stays off.
        /// </summary>
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

        private IActionResult RequireHost()
        {
            if (AfterSubmitScriptGuard.CanAuthor(IsHost, FeatureEnabled())) return null;

            if (!IsHost)
                return StatusCode(403, new
                {
                    error = "host_only",
                    message = "After-submit scripts can only be viewed or changed by a Host account. " +
                              "A script runs in the shared server process for every site on this installation, " +
                              "so a site Administrator is not enough.",
                    docsUrl = ScriptDocsUrl
                });

            return StatusCode(403, new
            {
                error = "feature_disabled",
                message = "Server-side scripting is switched off on this installation. Set " +
                          "\"MegaForm:AfterSubmitScriptEnabled\": true in appsettings.json and restart.",
                settingKey = "MegaForm:AfterSubmitScriptEnabled",
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

        // ─── GET Get/{formId} ─────────────────────────────────────────────────────

        [HttpGet("Get/{formId:int}")]
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

        // ─── POST Validate ────────────────────────────────────────────────────────

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
        public IActionResult Validate([FromBody] ScriptPayload payload)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (_service == null || !_service.IsCompilerAvailable) return CompilerMissing();

            var compile = _service.Validate(payload?.Source, "form" + (payload?.FormId ?? 0) + "-afterSubmit");
            return Ok(new { success = compile.Success, diagnostics = compile.Diagnostics, hash = compile.Hash });
        }

        // ─── POST Save ────────────────────────────────────────────────────────────

        [HttpPost("Save")]
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
                    message = "Script is longer than the " + AfterSubmitScriptGuard.MaxSourceChars + " character limit."
                });

            var userId = ResolveUserId();
            var userName = User?.Identity?.Name ?? ("user-" + userId);

            // Empty editor removes the hook rather than storing an approved empty script.
            if (string.IsNullOrWhiteSpace(source))
            {
                PersistBlock(form, null);
                _service?.RecordApproval(payload.FormId, null, userId, userName, 0, "removed");
                return Ok(new { success = true, removed = true, message = "After-submit script removed." });
            }

            if (_service == null || !_service.IsCompilerAvailable) return CompilerMissing();

            // Compile first: an approval is never written over source that does not build.
            var compile = _service.Validate(source, "form" + payload.FormId + "-afterSubmit");
            if (!compile.Success)
                return BadRequest(new
                {
                    success = false,
                    error = "compile_failed",
                    message = "The script did not compile. Nothing was saved.",
                    diagnostics = compile.Diagnostics
                });

            var block = new FormAfterSubmitScriptSettings
            {
                Enabled = payload.Enabled,
                Language = "csharp",
                Source = source,
                OnFailure = string.Equals(payload.OnFailure, "report", StringComparison.OrdinalIgnoreCase)
                    ? "report" : "continue",
                TimeoutSeconds = payload.TimeoutSeconds
            };
            block.TimeoutSeconds = AfterSubmitScriptGuard.ResolveTimeoutSeconds(block);
            AfterSubmitScriptGuard.Approve(block, userId, userName, DateTime.UtcNow);

            PersistBlock(form, block);
            _service.RecordApproval(payload.FormId, block.ApprovedHash, userId, userName,
                source.Length, payload.Enabled ? "approved-enabled" : "approved-disabled");

            return Ok(new
            {
                success = true,
                hash = block.ApprovedHash,
                approvedBy = block.ApprovedByUserName,
                approvedOnUtc = block.ApprovedOnUtc,
                enabled = block.Enabled,
                timeoutSeconds = block.TimeoutSeconds,
                diagnostics = compile.Diagnostics,
                message = payload.Enabled
                    ? "Script saved and switched on for this form."
                    : "Script saved. It is switched off, so it will not run yet."
            });
        }

        // ─── POST TestRun ─────────────────────────────────────────────────────────

        [HttpPost("TestRun")]
        public IActionResult TestRun([FromBody] ScriptPayload payload)
        {
            var denied = RequireHost();
            if (denied != null) return denied;
            if (_service == null || !_service.IsCompilerAvailable) return CompilerMissing();

            var compile = _service.Validate(payload?.Source, "form" + (payload?.FormId ?? 0) + "-afterSubmit-test");
            if (!compile.Success)
                return Ok(new { success = false, compiled = false, diagnostics = compile.Diagnostics });

            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (payload.SampleData != null)
                foreach (var kv in payload.SampleData) data[kv.Key] = kv.Value;

            var form = payload.FormId > 0 ? _forms.GetForm(payload.FormId) : null;
            var userId = ResolveUserId();

            var ctx = new SubmissionScriptContext(data)
            {
                FormId = payload.FormId,
                SubmissionId = 0,
                PortalId = form?.PortalId ?? 0,
                FormTitle = form?.Title ?? "(test)",
                UserId = userId,
                UserName = User?.Identity?.Name ?? string.Empty,
                UserEmail = string.Empty,
                IpAddress = string.Empty,
                UtcNow = DateTime.UtcNow
            };

            var probe = new FormAfterSubmitScriptSettings { Enabled = true, Source = payload.Source };
            AfterSubmitScriptGuard.Approve(probe, userId, User?.Identity?.Name, DateTime.UtcNow);
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

        // ─── helpers ──────────────────────────────────────────────────────────────

        private void PersistBlock(FormInfo form, FormAfterSubmitScriptSettings block)
        {
            AfterSubmitScriptStore.Write(form.SchemaJson, form.SettingsJson, block,
                out var schemaJson, out var settingsJson);
            form.SchemaJson = schemaJson;
            form.SettingsJson = settingsJson;
            _forms.SaveForm(form);
        }

        /// <summary>
        /// Same claim walk the AI Knowledge controller uses ("sub", then NameIdentifier), so the
        /// audit trail names the user the same way across MegaForm's Oqtane surface.
        /// </summary>
        private int ResolveUserId()
        {
            try
            {
                var raw = User?.FindFirst("sub")?.Value
                          ?? User?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (int.TryParse(raw, out var id)) return id;
            }
            catch { }
            return -1;
        }

        private static List<string> FieldKeys(FormInfo form)
        {
            var keys = new List<string>();
            try
            {
                var schema = Newtonsoft.Json.JsonConvert.DeserializeObject<FormSchema>(form.SchemaJson);
                if (schema?.Fields != null)
                    keys.AddRange(schema.Fields
                        .Where(f => f != null && !string.IsNullOrWhiteSpace(f.Key))
                        .Select(f => f.Key));
            }
            catch { }
            return keys;
        }
    }
}
