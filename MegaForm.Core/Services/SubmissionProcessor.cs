using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.i18n;
using MegaForm.Core.Models;
using MegaForm.Core.Rendering;
using MegaForm.Core.Utilities;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Orchestrates the full submission pipeline:
    /// Validate → Anti-spam → Save → Notifications → Webhook.
    /// Platform-agnostic: all platform calls go through interfaces.
    /// </summary>
    public class SubmissionProcessor
    {
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IDraftRepository _draftRepo;
        private readonly IPhase2Repository _phase2Repo;
        private readonly EmailNotificationService _emailService;
        private readonly WebhookService _webhookService;
        private readonly UniqueIdService _uniqueIdService;
        private readonly ILogService _log;
        private readonly ILocalizationProvider _loc;
        private readonly IWorkflowEngine _workflowEngine;
        private readonly DocumentRevisionService _documentRevisionService;
        // [B55 v20260603] Optional flat-index writer for MF_SubmissionValues.
        // Null when the host platform has not registered an indexer (older
        // installs that haven't run the B55 migration yet) — in that case
        // the snapshot block below silently falls back to the legacy JSON
        // snapshot rows only.
        private readonly SubmissionIndexerService _reportingIndexer;

        public SubmissionProcessor(
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IDraftRepository draftRepo,
            IPhase2Repository phase2Repo,
            EmailNotificationService emailService,
            WebhookService webhookService,
            UniqueIdService uniqueIdService,
            ILogService log,
            IWorkflowEngine workflowEngine,
            ILocalizationProvider loc = null,
            DocumentRevisionService documentRevisionService = null,
            SubmissionIndexerService reportingIndexer = null)
        {
            _formRepo = formRepo ?? throw new ArgumentNullException(nameof(formRepo));
            _subRepo = subRepo ?? throw new ArgumentNullException(nameof(subRepo));
            _draftRepo = draftRepo;
            _phase2Repo = phase2Repo;
            _emailService = emailService;
            _webhookService = webhookService;
            _uniqueIdService = uniqueIdService;
            _log = log;
            _loc = loc ?? new DefaultLocalizationProvider();
            _workflowEngine = workflowEngine;
            _documentRevisionService = documentRevisionService;
            _reportingIndexer = reportingIndexer;
        }

        public SubmissionProcessor(
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IDraftRepository draftRepo,
            IPhase2Repository phase2Repo,
            EmailNotificationService emailService,
            WebhookService webhookService,
            UniqueIdService uniqueIdService,
            ILogService log,
            ILocalizationProvider loc = null,
            DocumentRevisionService documentRevisionService = null)
            : this(formRepo, subRepo, draftRepo, phase2Repo, emailService, webhookService, uniqueIdService, log, null, loc, documentRevisionService)
        {
        }

        public async Task<SubmissionResult> ProcessAsync(
            int formId,
            Dictionary<string, object> formData,
            string ipAddress,
            string userAgent,
            int? userId,
            double submissionTimeSeconds = 0)
        {
            var result = new SubmissionResult();

            // 1. Load form
            var form = _formRepo.GetForm(formId);
            if (form == null)
            {
                result.Success = false;
                result.ErrorMessage = _loc.L("form.not_found");
                return result;
            }

            // 2. [B267] Form-status (draft/published) gate REMOVED — every form is submittable.
            //    Access is now gated only by the orthogonal "locked" concept + per-form permissions
            //    (RequireAuth) + expiration below.

            // 3. Check expiration
            if (form.ExpiresOnUtc.HasValue && form.ExpiresOnUtc.Value < DateTime.UtcNow)
            {
                result.Success = false;
                result.ErrorMessage = _loc.L("form.expired");
                return result;
            }

            // 4. Check max submissions
            if (form.MaxSubmissions.HasValue)
            {
                var stats = _formRepo.GetFormStats(formId);
                if (stats.ValidSubmissions >= form.MaxSubmissions.Value)
                {
                    result.Success = false;
                    result.ErrorMessage = _loc.L("form.max_submissions");
                    return result;
                }
            }

            // 5. Auth requirement
            if (form.RequireAuth && !userId.HasValue)
            {
                result.Success = false;
                result.ErrorMessage = _loc.L("form.login_required");
                return result;
            }

            // 6. Parse schema
            FormSchema schema;
            ResolvedRenderModel resolvedRenderModel;
            try
            {
                resolvedRenderModel = RenderModelResolver.Resolve(form.SchemaJson, form.SettingsJson, form.SubmitButtonText, form.SuccessMessage, form.RedirectUrl);
                schema = resolvedRenderModel.Schema ?? new FormSchema();
            }
            catch
            {
                result.Success = false;
                result.ErrorMessage = _loc.L("form.invalid_config");
                return result;
            }

            // 7. Server-side validation (localized when a platform/translated provider is wired;
            // the inline en-US default returns the verbatim English fallbacks — zero regression)
            var validation = FormValidationService.Validate(schema, formData, _loc);
            if (!validation.IsValid)
            {
                result.Success = false;
                result.ErrorMessage = _loc.L("form.validation_failed");
                result.ValidationErrors = validation.Errors;
                return result;
            }

            // 8. Anti-spam
            var spamCheck = AntiSpamService.CheckSubmission(
                form, schema, formData, ipAddress, userAgent, submissionTimeSeconds);
            if (form.RequireAuth && userId.HasValue)
            {
                spamCheck = AntiSpamService.CheckSubmission(
                    form,
                    schema,
                    formData,
                    ipAddress,
                    userAgent,
                    submissionTimeSeconds,
                    trustedAuthenticatedUser: true);
            }

            // 9. Remove honeypot
            string hpField = schema?.Settings?.HoneypotFieldName ?? "__mf_hp";
            formData.Remove(hpField);

            // 9b. Remove internal fields
            formData.Remove("__mf_ts");
            // [Composite server-validate v20260616] Raw composite parts are sent ONLY so the
            // validator (step 7) can re-check per-part rules; never persist them — DataJson keeps
            // the combined values exactly as before.
            formData.Remove("__mf_parts");

            // 9c. Strip Captcha values (client-side only, no need to store)
            if (schema?.Fields != null)
            {
                foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
                {
                    if (field?.Type == "Captcha")
                        formData.Remove(field.Key);
                }
            }

            // 10. Process special field types
            if (schema?.Fields != null)
            {
                foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
                {
                    if (field == null) continue;

                    // UniqueId generation
                    if (field.Type == "UniqueId" && _uniqueIdService != null)
                    {
                        var props = field.WidgetProps;
                        string prefix = GetProp(props, "prefix", "");
                        int padding = int.Parse(GetProp(props, "padding", "5"));
                        long startValue = long.Parse(GetProp(props, "startValue", "1"));
                        string suffixType = GetProp(props, "suffixType", "none");
                        formData[field.Key] = _uniqueIdService.GenerateNext(formId, field.Key, prefix, padding, startValue, suffixType);
                    }

                    // RichText sanitisation
                    if (field.Type == "RichText" && formData.ContainsKey(field.Key))
                    {
                        formData[field.Key] = SanitiseRichTextHtml(formData[field.Key]?.ToString() ?? "");
                    }
                }
            }

            // 11. Save submission
            string dataJson = JsonConvert.SerializeObject(formData);
            var submission = new SubmissionInfo
            {
                FormId = formId,
                DataJson = dataJson,
                IpAddress = ipAddress,
                UserAgent = userAgent,
                UserId = userId,
                IsSpam = spamCheck.IsSpam,
                SpamScore = (decimal)spamCheck.SpamScore
            };

            int submissionId = _subRepo.Insert(submission);
            submission.SubmissionId = submissionId;
            submission.SubmittedOnUtc = DateTime.UtcNow;

            TryAutoLinkSubmission(formId, submissionId, formData);

            try
            {
                var snapshots = MegaFormUtils.BuildSubmissionSnapshots(schema, formData);
                if (snapshots != null && snapshots.Count > 0)
                {
                    var values = snapshots.Select(s => new SubmissionValueInfo
                    {
                        FormId = formId,
                        FieldKey = s.FieldKey,
                        FieldValue = JsonConvert.SerializeObject(s)
                    }).ToList();
                    _subRepo.InsertValues(submissionId, values);
                }
            }
            catch (Exception ex)
            {
                _log?.LogWarning(nameof(SubmissionProcessor), "Failed to persist submission snapshot: " + ex.Message);
            }

            // [B55 v20260603] Flat per-field index for the Reporting System.
            // Runs after the legacy snapshot block so a failure here cannot
            // roll back the primary submission insert. Wrapped in its own
            // try/catch — index outages must not break user submissions.
            if (_reportingIndexer != null)
            {
                try
                {
                    var flatFields = MegaFormUtils.FlattenFields(schema?.Fields);
                    _reportingIndexer.IndexSubmission(submissionId, formId, formData, flatFields);
                }
                catch (Exception ex)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        "Reporting indexer failed for submission " + submissionId + ": " + ex.Message);
                }
            }

            var canonicalSuccessMessage = !string.IsNullOrWhiteSpace(resolvedRenderModel?.SuccessMessage)
                ? resolvedRenderModel.SuccessMessage
                : (!string.IsNullOrWhiteSpace(form.SuccessMessage) ? form.SuccessMessage : _loc.L("form.success"));
            var canonicalRedirectUrl = !string.IsNullOrWhiteSpace(resolvedRenderModel?.RedirectUrl)
                ? resolvedRenderModel.RedirectUrl
                : (form.RedirectUrl ?? string.Empty);

            result.Success = true;
            result.SubmissionId = submissionId;
            result.IsSpam = spamCheck.IsSpam;
            result.SpamScore = spamCheck.SpamScore;
            result.SuccessMessage = canonicalSuccessMessage;
            result.RedirectUrl = canonicalRedirectUrl;

            // 12. Post-submission tasks
            var workflowState = GetWorkflowState(form.WorkflowJson);

            if (spamCheck.IsSpam)
            {
                _log?.LogWarning(nameof(SubmissionProcessor),
                    "Submission " + submissionId + " for form " + formId +
                    " marked as spam (score=" + spamCheck.SpamScore.ToString("0.##") + "). Workflow and notifications skipped.");
            }
            else
            {
                try
                {
                    _documentRevisionService?.UpsertFromSubmission(form, submission, schema, formData, workflowState.HasAppliedWorkflow);
                }
                catch (Exception ex)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor), "Document revision sync failed: " + ex.Message);
                }

                if (workflowState.HasDraftWorkflow && !workflowState.HasAppliedWorkflow)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        "Form " + formId +
                        " has a workflow draft but no applied workflow. Submission " + submissionId +
                        " will use legacy post-submit actions until the workflow is applied.");
                }

                bool canRunWorkflow = workflowState.HasAppliedWorkflow && _workflowEngine != null;

                if (!canRunWorkflow)
                {
                    _log?.LogInfo(nameof(SubmissionProcessor),
                        "Submission " + submissionId + " for form " + formId +
                        " will use legacy post-submit actions. hasAppliedWorkflow=" + workflowState.HasAppliedWorkflow +
                        ", workflowEngineRegistered=" + (_workflowEngine != null));

                    try
                    {
                        _emailService?.SendAdminNotification(form, submission, schema);
                    }
                    catch (Exception ex)
                    {
                        _log?.LogError(nameof(SubmissionProcessor), "Admin notification failed: " + ex.Message, ex);
                    }

                    try
                    {
                        _emailService?.SendAutoresponder(form, submission, schema);
                    }
                    catch (Exception ex)
                    {
                        _log?.LogError(nameof(SubmissionProcessor), "Autoresponder failed: " + ex.Message, ex);
                    }

                    if (!string.IsNullOrWhiteSpace(form.WebhookUrl) && _webhookService != null)
                    {
                        try
                        {
                            await _webhookService.SendWebhookAsync(form, submission);
                        }
                        catch (Exception ex)
                        {
                            _log?.LogError(nameof(SubmissionProcessor), "Legacy webhook failed: " + ex.Message, ex);
                        }
                    }
                }
                else
                {
                    try
                    {
                        var workflowData = new Dictionary<string, object>(formData, StringComparer.OrdinalIgnoreCase);
                        workflowData["__portalId"] = form.PortalId;
                        workflowData["__actorUserId"] = userId.HasValue ? userId.Value : 0;
                        workflowData["__actorUserName"] = userId.HasValue ? ("user-" + userId.Value) : "anonymous";
                        workflowData["__actorDisplayName"] = userId.HasValue ? ("user-" + userId.Value) : "anonymous";
                        workflowData["__actorEmail"] = string.Empty;

                        _log?.LogInfo(nameof(SubmissionProcessor),
                            "Starting applied workflow for form " + formId + " submission " + submissionId + ".");

                        using (var cts = new System.Threading.CancellationTokenSource(
                            System.TimeSpan.FromSeconds(300)))
                        {
                            var ctx = await _workflowEngine.ExecuteAsync(formId, submissionId, workflowData, cts.Token);
                            _log?.LogInfo(nameof(SubmissionProcessor),
                                "Workflow finished for form " + formId + " submission " + submissionId +
                                ". ExecutionId=" + (ctx?.ExecutionId ?? "") +
                                ", Status=" + (ctx != null ? ctx.Status.ToString() : "unknown") +
                                ", Error=" + (ctx?.ErrorMessage ?? ""));
                        }
                    }
                    catch (Exception ex)
                    {
                        _log?.LogError(nameof(SubmissionProcessor),
                            "Workflow execution failed for form " + formId + " submission " + submissionId + ": " + ex.Message, ex);
                    }
                }
            }

            // 13. Delete draft if Save & Continue was used
            if (_draftRepo != null && formData.ContainsKey("__mf_resume_token"))
            {
                string token = formData["__mf_resume_token"]?.ToString();
                if (!string.IsNullOrEmpty(token))
                    try { _draftRepo.DeleteDraft(token); } catch { }
            }

            return result;
        }

        private void TryAutoLinkSubmission(int formId, int submissionId, Dictionary<string, object> formData)
        {
            if (_phase2Repo == null || formId <= 0 || submissionId <= 0 || formData == null || formData.Count == 0)
                return;

            try
            {
                var relations = _phase2Repo.GetFormRelations(formId) ?? new List<FormRelationInfo>();
                foreach (var relation in relations.Where(r => r != null && r.ChildFormId == formId))
                {
                    var foreignKey = (relation.ForeignKey ?? string.Empty).Trim();
                    if (string.IsNullOrWhiteSpace(foreignKey))
                        continue;
                    if (!TryGetFormValue(formData, foreignKey, out var rawForeignValue))
                        continue;

                    var foreignValue = Convert.ToString(rawForeignValue)?.Trim() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(foreignValue))
                        continue;

                    var parentSubmissionId = ResolveParentSubmissionId(relation, foreignValue);
                    if (parentSubmissionId > 0)
                        _phase2Repo.LinkSubmissions(relation.RelationId, parentSubmissionId, submissionId);
                }
            }
            catch (Exception ex)
            {
                _log?.LogWarning(nameof(SubmissionProcessor), "Failed to auto-link child submission " + submissionId + ": " + ex.Message);
            }
        }

        private int ResolveParentSubmissionId(FormRelationInfo relation, string foreignValue)
        {
            if (relation == null || relation.ParentFormId <= 0 || string.IsNullOrWhiteSpace(foreignValue))
                return 0;

            var parentKey = (relation.ParentKey ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(parentKey) ||
                string.Equals(parentKey, "SubmissionId", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(parentKey, "submission:id", StringComparison.OrdinalIgnoreCase))
            {
                return int.TryParse(foreignValue, out var id) && id > 0 ? id : 0;
            }

            var page = _subRepo.List(relation.ParentFormId, pageIndex: 0, pageSize: 2000);
            foreach (var parent in page.Items ?? new List<SubmissionInfo>())
            {
                if (parent == null || string.IsNullOrWhiteSpace(parent.DataJson))
                    continue;

                try
                {
                    var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(parent.DataJson);
                    if (data == null || !TryGetFormValue(data, parentKey, out var parentRaw))
                        continue;

                    var parentValue = Convert.ToString(parentRaw)?.Trim() ?? string.Empty;
                    if (string.Equals(parentValue, foreignValue, StringComparison.OrdinalIgnoreCase))
                        return parent.SubmissionId;
                }
                catch { }
            }

            return 0;
        }

        private static bool TryGetFormValue(Dictionary<string, object> data, string key, out object value)
        {
            value = null;
            if (data == null || string.IsNullOrWhiteSpace(key))
                return false;
            if (data.TryGetValue(key, out value))
                return true;

            foreach (var pair in data)
            {
                if (string.Equals(pair.Key, key, StringComparison.OrdinalIgnoreCase))
                {
                    value = pair.Value;
                    return true;
                }
            }

            return false;
        }

        private static SubmissionWorkflowState GetWorkflowState(string workflowJson)
        {
            if (string.IsNullOrWhiteSpace(workflowJson))
                return new SubmissionWorkflowState();

            try
            {
                var env = WorkflowEnvelope.ParseOrMigrate(workflowJson);
                return new SubmissionWorkflowState
                {
                    HasDraftWorkflow = env != null && env.DraftWorkflow != null,
                    HasAppliedWorkflow = env != null && env.AppliedWorkflow != null
                };
            }
            catch
            {
                return new SubmissionWorkflowState();
            }
        }

        private static string GetProp(Dictionary<string, object> props, string key, string defaultVal)
        {
            if (props != null && props.ContainsKey(key))
                return props[key]?.ToString() ?? defaultVal;
            return defaultVal;
        }

        private static string SanitiseRichTextHtml(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return html;
            html = Regex.Replace(html, @"<script[\s\S]*?</script>", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<iframe[\s\S]*?</iframe>", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<iframe[\s\S]*?/>", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<(object|embed|applet)[\s\S]*?</(object|embed|applet)>", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"\s+on\w+\s*=\s*""[^""]*""", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"\s+on\w+\s*=\s*'[^']*'", "", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"(href|src)\s*=\s*""javascript:[^""]*""", "$1=\"#\"", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"src\s*=\s*""data:(?!image/)[^""]*""", "src=\"\"", RegexOptions.IgnoreCase);
            html = Regex.Replace(html, @"<style[^>]*>[\s\S]*?(expression|@import|javascript:)[\s\S]*?</style>", "", RegexOptions.IgnoreCase);
            return html;
        }
    }

    internal sealed class SubmissionWorkflowState
    {
        public bool HasDraftWorkflow { get; set; }
        public bool HasAppliedWorkflow { get; set; }
    }

    /// <summary>Result of submission processing.</summary>
    public class SubmissionResult
    {
        public bool Success { get; set; }
        public int SubmissionId { get; set; }
        public string ErrorMessage { get; set; }
        public string SuccessMessage { get; set; }
        public string RedirectUrl { get; set; }
        public bool IsSpam { get; set; }
        public double SpamScore { get; set; }
        public Dictionary<string, string> ValidationErrors { get; set; }
    }
}
