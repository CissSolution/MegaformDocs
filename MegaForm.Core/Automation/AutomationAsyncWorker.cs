using System;
using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Scripting;
using MegaForm.Core.Services;
using Newtonsoft.Json;

namespace MegaForm.Core.Automation
{
    /// <summary>
    /// Host-neutral executor for a durable AsyncWorker outbox item. DNN/Oqtane/Web own dequeue,
    /// retries and leases; this class owns the security-sensitive reload-and-reapprove behavior.
    /// </summary>
    public sealed class AutomationAsyncWorker
    {
        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly AfterSubmitScriptService _scripts;
        private readonly ILogService _log;

        public AutomationAsyncWorker(IFormRepository forms, ISubmissionRepository submissions,
            AfterSubmitScriptService scripts, ILogService log = null)
        {
            _forms = forms;
            _submissions = submissions;
            _scripts = scripts;
            _log = log;
        }

        public AfterSubmitScriptRunResult Execute(AutomationExecutionRequest request)
        {
            if (request == null) return Failed("Automation queue request is missing.");
            if (_forms == null || _submissions == null || _scripts == null)
                return Failed("Automation worker dependencies are not registered.");

            try
            {
                var form = _forms.GetForm(request.FormId);
                if (form == null) return Failed("Form " + request.FormId + " was not found.");
                var submission = _submissions.Get(request.SubmissionId);
                if (submission == null || submission.FormId != request.FormId)
                    return Failed("Submission " + request.SubmissionId + " was not found for this form.");

                // Reload current settings. A queued copy of source/approval would allow a script
                // revoked after enqueue to run later, which defeats the catalog kill switch.
                var resolved = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson,
                    form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
                var block = resolved?.Schema?.Settings?.Automation?.AsyncWorker;
                if (block == null || !block.Enabled)
                    return Skipped("AsyncWorker automation is no longer enabled on this form.");

                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson ?? "{}")
                           ?? new Dictionary<string, object>();
                var ctx = new SubmissionScriptContext(data)
                {
                    FormId = form.FormId,
                    SubmissionId = submission.SubmissionId,
                    PortalId = form.PortalId,
                    FormTitle = form.Title,
                    UserId = request.UserId,
                    UserName = request.UserName ?? string.Empty,
                    UserEmail = request.UserEmail ?? string.Empty,
                    IpAddress = request.IpAddress ?? submission.IpAddress ?? string.Empty,
                    UtcNow = DateTime.UtcNow
                };

                return _scripts.RunStage(AutomationStage.AsyncWorker, block, ctx);
            }
            catch (Exception ex)
            {
                _log?.LogError(nameof(AutomationAsyncWorker),
                    "AsyncWorker execution failed for form " + request.FormId + " submission " +
                    request.SubmissionId + ": " + ex.Message, ex);
                return Failed(ex.GetType().Name + ": " + ex.Message);
            }
        }

        private static AfterSubmitScriptRunResult Failed(string message)
        {
            return new AfterSubmitScriptRunResult
            {
                Success = false,
                Stage = AutomationStage.AsyncWorker.ToString(),
                ErrorMessage = message
            };
        }

        private static AfterSubmitScriptRunResult Skipped(string reason)
        {
            return new AfterSubmitScriptRunResult
            {
                Success = false,
                Skipped = true,
                Stage = AutomationStage.AsyncWorker.ToString(),
                SkipReason = reason
            };
        }
    }
}
