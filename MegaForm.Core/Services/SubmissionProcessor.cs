using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.i18n;
using MegaForm.Core.Integrations.Storage;
using MegaForm.Core.Models;
using MegaForm.Core.Payments;
using MegaForm.Core.Rendering;
using MegaForm.Core.Services.TypedSubmission;
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
        // [SecFix 2026-07-12 PAY-1] Submit-time payment gate. Optional at the
        // ctor for DI compatibility, but NOT optional at runtime: a form that
        // contains a payment field is REJECTED when no verifier is registered —
        // the alternative is the original bypass (client-claimed "paid" saved
        // verbatim). All four platforms register/construct one.
        private readonly PaymentSubmissionVerifier _paymentVerifier;
        // [TypedStorage 2026-07-17] Optional parallel writer for the Umbraco Forms-style
        // typed submission tables (MF_SubmissionFields + six typed value tables). Null when
        // the host has not registered an ISubmissionDataStore — only Oqtane does so far —
        // in which case only DataJson + the legacy snapshot/index are written. Fail-soft at
        // runtime: a typed-store error must never break the user submission, because DataJson
        // remains the runtime source of truth during migration (Phase 1 = write-only).
        private readonly ISubmissionDataStore _typedStore;
        private readonly SubmissionFieldNormalizer _typedFieldNormalizer = new SubmissionFieldNormalizer();
        // [CloudStorage 2026-07-23] Optional fail-soft mirror of uploaded files to cloud
        // storage (Google Drive / S3 / Azure Blob) per schema.settings.cloudStorage. Null when
        // the host has not registered the storage stack — submissions then stay local-only.
        private readonly SubmissionCloudStorageUploader _cloudStorageUploader;
        // [CloudReady A1 v20260804] Optional async execution decoupling. Both must be
        // registered AND the mode provider must return Queued for the submit pipeline to
        // enqueue instead of executing inline; any null stays on the byte-for-byte sync
        // path below (DNN / Umbraco / unconfigured hosts never register these).
        private readonly IWorkflowExecutionQueue _workflowQueue;
        private readonly IWorkflowExecutionModeProvider _workflowModeProvider;
        // [AfterSubmitScript v20260813-01] Optional host-authored C# hook. Null on any host
        // that has not registered it, and null-safe everywhere below, so a site that never
        // turns the feature on runs byte-for-byte the pipeline it ran before.
        private readonly AfterSubmitScriptService _afterSubmitScript;
        private readonly MegaForm.Core.Automation.IAutomationExecutionQueue _automationQueue;

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
            SubmissionIndexerService reportingIndexer = null,
            PaymentSubmissionVerifier paymentVerifier = null,
            ISubmissionDataStore typedStore = null,
            SubmissionCloudStorageUploader cloudStorageUploader = null,
            IWorkflowExecutionQueue workflowQueue = null,
            IWorkflowExecutionModeProvider workflowModeProvider = null,
            AfterSubmitScriptService afterSubmitScript = null,
            MegaForm.Core.Automation.IAutomationExecutionQueue automationQueue = null)
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
            _paymentVerifier = paymentVerifier;
            _typedStore = typedStore;
            _cloudStorageUploader = cloudStorageUploader;
            _workflowQueue = workflowQueue;
            _workflowModeProvider = workflowModeProvider;
            _afterSubmitScript = afterSubmitScript;
            _automationQueue = automationQueue;
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
            return await ProcessAsync(formId, formData, ipAddress, userAgent, userId, submissionTimeSeconds, null, null);
        }

        public async Task<SubmissionResult> ProcessAsync(
            int formId,
            Dictionary<string, object> formData,
            string ipAddress,
            string userAgent,
            int? userId,
            double submissionTimeSeconds,
            UserContext actor,
            IDictionary<string, string> query = null)
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
            ServerSidePermissionEnforcementResult enforcement;
            try
            {
                var actorContext = BuildSubmissionActor(actor, userId, ipAddress);
                var permissionRules = _phase2Repo != null
                    ? _phase2Repo.GetFormPermissions(formId)
                    : new List<FormPermissionInfo>();
                enforcement = ServerSidePermissionEnforcementService.EnforceSubmit(
                    form,
                    schema,
                    formData,
                    actorContext,
                    permissionRules,
                    query);
            }
            catch (Exception ex)
            {
                _log?.LogError(nameof(SubmissionProcessor), "Server-side permission enforcement failed.", ex);
                result.Success = false;
                result.ErrorMessage = "Permission check failed.";
                return result;
            }

            if (!enforcement.Allowed)
            {
                result.Success = false;
                result.ErrorMessage = enforcement.ErrorMessage ?? "You do not have permission to submit this form.";
                return result;
            }

            formData = enforcement.Data ?? new Dictionary<string, object>();

            // [Automation v2] PRE-VALIDATE runs after permission enforcement has produced the
            // authoritative input dictionary, but before normal field validation. It is the rail
            // for blacklist/fraud/eligibility checks and may normalise values that validators then
            // inspect. A failure here is a real veto: no submission row exists yet.
            var preValidate = RunAutomationStage(
                MegaForm.Core.Automation.AutomationStage.PreValidate,
                schema, form, 0, formData, ipAddress, userId, actor, result);

            if (preValidate != null && preValidate.Aborted)
            {
                result.Success = false;
                result.ErrorMessage = string.IsNullOrWhiteSpace(preValidate.ErrorMessage)
                    ? _loc.L("form.validation_failed")
                    : preValidate.ErrorMessage;
                _log?.LogInfo(nameof(SubmissionProcessor),
                    "Pre-validate automation aborted the submission for form " + formId + ": " + result.ErrorMessage);
                return result;
            }

            var validation = FormValidationService.Validate(schema, formData, _loc, enforcement.RuleContext);
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

            // 9d. [SecFix 2026-07-12 PAY-1] Payment verification. The hidden payment
            // input is client-controlled; before this gate, POSTing {"status":"paid"}
            // submitted a paid-only form without paying. The verifier asks the
            // gateway whether the money moved, checks amount/currency against the
            // server-resolved price, blocks transactionId replay, and rewrites the
            // stored value with the gateway-confirmed numbers. Runs BEFORE the save
            // so an unpaid submission never reaches MF_Submissions. Fails CLOSED —
            // including when the host forgot to register a verifier.
            if (PaymentSubmissionVerifier.HasPaymentFields(schema))
            {
                if (_paymentVerifier == null)
                {
                    _log?.LogError(nameof(SubmissionProcessor),
                        "Form " + formId + " contains a payment field but no PaymentSubmissionVerifier is registered on this host. Rejecting submission (fail closed).");
                    result.Success = false;
                    result.ErrorMessage = "Payment verification is not available. Please contact the site administrator.";
                    return result;
                }

                PaymentVerificationOutcome paymentOutcome;
                try
                {
                    paymentOutcome = await _paymentVerifier.VerifyAsync(form, schema, formData);
                }
                catch (Exception ex)
                {
                    _log?.LogError(nameof(SubmissionProcessor),
                        "Payment verification threw for form " + formId + ": " + ex.Message, ex);
                    result.Success = false;
                    result.ErrorMessage = "Payment could not be verified right now. Please try again.";
                    return result;
                }

                if (!paymentOutcome.Allowed)
                {
                    result.Success = false;
                    result.ErrorMessage = paymentOutcome.ErrorMessage ?? "Payment could not be verified.";
                    result.ValidationErrors = paymentOutcome.FieldErrors;
                    return result;
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

            // [Automation v2 20260813-01] PRE-INSERT stage. The last point at which refusing costs
            // nothing: no row exists, so an abort here is a real veto rather than a note about one.
            //
            // It also runs BEFORE dataJson is serialised, which is what lets this stage do the job
            // it exists for — normalising, encrypting or deriving a value and having the stored row
            // carry the changed version. A post-commit script mutating formData would change
            // nothing that anyone reads.
            var preInsert = RunAutomationStage(
                MegaForm.Core.Automation.AutomationStage.PreInsert,
                schema, form, 0, formData, ipAddress, userId, actor, result);

            if (preInsert != null && preInsert.Aborted)
            {
                result.Success = false;
                result.ErrorMessage = string.IsNullOrWhiteSpace(preInsert.ErrorMessage)
                    ? _loc.L("form.invalid_config")
                    : preInsert.ErrorMessage;
                _log?.LogInfo(nameof(SubmissionProcessor),
                    "Pre-insert automation aborted the submission for form " + formId + ": " + result.ErrorMessage);
                return result;
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

            // [TypedStorage 2026-07-17] Parallel typed-row write — MF_SubmissionFields + the
            // six typed value tables, Umbraco Forms-style. Runs after the reporting indexer so
            // a failure here cannot roll back the submission insert. Only active when a host has
            // registered an ISubmissionDataStore (Oqtane today). DataJson remains the runtime
            // source of truth during migration; this is additive (Phase 1 = write-only).
            if (_typedStore != null)
            {
                try
                {
                    var typedFields = _typedFieldNormalizer.Normalize(formId, schema, formData);
                    _typedStore.ReplaceFields(submissionId, formId, typedFields);

                    // [TypedStorage 2026-07-17] Collapse the legacy DataJson payload ONLY on hosts that
                    // reconstruct it from typed rows on read (SupportsDataJsonCollapse). On those hosts
                    // (Oqtane) typed rows become the source of truth and readers reconstruct on demand.
                    // Hosts that still read DataJson directly (DNN today) write typed rows in PARALLEL
                    // and keep the full DataJson — flipping the collapse there would break every reader.
                    // CRITICAL ORDERING: this runs ONLY after ReplaceFields succeeds, so if the typed
                    // write throws, the real DataJson stays intact as a fail-soft safety net (no data
                    // loss window). "{}" (not null) keeps the NOT NULL column valid and reads as "empty
                    // → reconstruct".
                    if (_typedStore.SupportsDataJsonCollapse)
                        _subRepo.UpdateData(submissionId, "{}");
                }
                catch (Exception ex)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        "Typed submission storage write failed for submission " + submissionId + ": " + ex.Message);
                }
            }

            // [CloudStorage 2026-07-23] Optional cloud file push — Google Drive / S3 / Azure Blob,
            // configured per form in schema.settings.cloudStorage. Runs after the submission row
            // exists because OrganizeBySubmission folders use the id. Fail-soft: the uploader
            // swallows configuration/provider errors itself, and this guard is the belt to its
            // braces — a cloud outage must never break the user submission.
            if (_cloudStorageUploader != null && !spamCheck.IsSpam)
            {
                try
                {
                    await _cloudStorageUploader.UploadFailSoftAsync(formId, schema, formData, submissionId).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        "Cloud storage upload failed for submission " + submissionId + ": " + ex.Message);
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
                // [2026-07-10] A form gets its workflow from one of two places:
                //   1. MF_Forms.WorkflowJson  — legacy, authored per-form
                //   2. MF_FormWorkflows       — a mapping onto a reusable library template
                // The gate used to inspect only (1), so a form bound solely to a library
                // template silently fell through to the legacy post-submit actions and the
                // workflow never fired. Ask the engine instead: it owns the resolution
                // order (library wins, legacy applied is the fallback) and it excludes
                // drafts. Hosts without a library repository return false, so the three
                // non-Oqtane platforms keep today's behaviour exactly.
                bool hasLibraryWorkflow = !workflowState.HasAppliedWorkflow
                    && _workflowEngine != null
                    && _workflowEngine.HasExecutableWorkflow(formId);

                bool canRunWorkflow = _workflowEngine != null
                    && (workflowState.HasAppliedWorkflow || hasLibraryWorkflow);

                try
                {
                    _documentRevisionService?.UpsertFromSubmission(form, submission, schema, formData, canRunWorkflow);
                }
                catch (Exception ex)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor), "Document revision sync failed: " + ex.Message);
                }

                if (workflowState.HasDraftWorkflow && !canRunWorkflow)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        "Form " + formId +
                        " has a workflow draft but no applied workflow. Submission " + submissionId +
                        " will use legacy post-submit actions until the workflow is applied.");
                }

                if (!canRunWorkflow)
                {
                    _log?.LogInfo(nameof(SubmissionProcessor),
                        "Submission " + submissionId + " for form " + formId +
                        " will use legacy post-submit actions. hasAppliedWorkflow=" + workflowState.HasAppliedWorkflow +
                        ", hasLibraryWorkflow=" + hasLibraryWorkflow +
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
                        // [Submitter fix 2026-07-12] The real actor was already in scope
                        // (controllers pass a full UserContext) but these keys stamped a
                        // "user-<id>" placeholder — which is why approval tasks showed the
                        // submitter as "Unknown". Use the actor; keep the placeholder only
                        // as the last resort.
                        workflowData["__actorUserName"] = !string.IsNullOrWhiteSpace(actor?.UserName)
                            ? actor.UserName
                            : (userId.HasValue ? ("user-" + userId.Value) : "anonymous");
                        workflowData["__actorDisplayName"] = !string.IsNullOrWhiteSpace(actor?.DisplayName)
                            ? actor.DisplayName
                            : (!string.IsNullOrWhiteSpace(actor?.UserName)
                                ? actor.UserName
                                : (userId.HasValue ? ("user-" + userId.Value) : "anonymous"));
                        workflowData["__actorEmail"] = actor?.Email ?? string.Empty;

                        _log?.LogInfo(nameof(SubmissionProcessor),
                            "Starting applied workflow for form " + formId + " submission " + submissionId + ".");

                        // [CloudReady A1 v20260804] Queued mode: persist the exact
                        // ExecuteAsync arguments (formId, submissionId, workflowData —
                        // which already carries __portalId/__actor*) and return; the
                        // background worker calls IWorkflowEngine.ExecuteAsync with
                        // them. Anything else (both deps null, or mode Sync) keeps the
                        // original inline path, 300s CTS included.
                        var executionMode = _workflowModeProvider != null
                            ? _workflowModeProvider.GetMode(form.PortalId)
                            : WorkflowExecutionMode.Sync;

                        if (_workflowQueue != null && executionMode == WorkflowExecutionMode.Queued)
                        {
                            var queueId = _workflowQueue.Enqueue(new WorkflowExecutionRequest
                            {
                                FormId         = formId,
                                SubmissionId   = submissionId,
                                FormData       = workflowData,
                                EnqueuedAtUtc  = DateTime.UtcNow
                            });
                            _log?.LogInfo(nameof(SubmissionProcessor),
                                "Workflow queued for form " + formId + " submission " + submissionId +
                                ". QueueId=" + (queueId ?? ""));
                        }
                        else
                        {
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
                    }
                    catch (Exception ex)
                    {
                        _log?.LogError(nameof(SubmissionProcessor),
                            "Workflow execution failed for form " + formId + " submission " + submissionId + ": " + ex.Message, ex);
                    }
                }

                // [AfterSubmitScript v20260813-01] The host-authored C# hook. Runs LAST, after
                // the workflow, so a script can read what the workflow already wrote and cannot
                // change what it saw. It runs on the non-spam path only, alongside every other
                // post-submit action — a submission the spam filter rejected must not execute
                // server code, which is exactly the shape of hole an attacker would look for.
                //
                // Fail-soft by construction: the row is committed, the visitor is owed a
                // thank-you, and RunAfterSubmitScript never throws.
                // [Automation v2] PostCommit stage. Reads settings.automation.postCommit, falling
                // back to settings.afterSubmitScript for forms configured before the stages existed.
                var postCommit = RunAutomationStage(
                    MegaForm.Core.Automation.AutomationStage.PostCommit,
                    schema, form, submissionId, formData, ipAddress, userId, actor, result);

                // An abort here is impossible by construction (CanAbort is false post-commit), so a
                // failure only reaches the visitor when the hook asked for it.
                if (postCommit != null && !postCommit.Skipped && !postCommit.Success)
                {
                    var block = schema?.Settings?.Automation?.PostCommit ?? schema?.Settings?.AfterSubmitScript;
                    if (AfterSubmitScriptGuard.ShouldReportFailure(block))
                        result.ScriptError = postCommit.ErrorMessage;
                }

                // AsyncWorker never runs inline: doing so would put slow CRM/document/job work
                // back on the visitor request and make the stage name a lie. The queue stores only
                // identifiers; its worker reloads the current script and approval before running.
                TryEnqueueAsyncAutomation(schema, form, submissionId, ipAddress, userId, actor);
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

        private void TryEnqueueAsyncAutomation(FormSchema schema, FormInfo form, int submissionId,
            string ipAddress, int? userId, UserContext actor)
        {
            var block = schema?.Settings?.Automation?.AsyncWorker;
            if (block == null || !block.Enabled) return;

            string reason;
            if (!AfterSubmitScriptGuard.IsRunnable(block, out reason))
            {
                _log?.LogWarning(nameof(SubmissionProcessor),
                    "AsyncWorker automation for form " + form.FormId + " was not queued: " + reason);
                return;
            }
            if (_automationQueue == null)
            {
                _log?.LogWarning(nameof(SubmissionProcessor),
                    "AsyncWorker automation is enabled for form " + form.FormId +
                    " but this host has no durable automation queue registered.");
                return;
            }

            try
            {
                var queueId = _automationQueue.Enqueue(new MegaForm.Core.Automation.AutomationExecutionRequest
                {
                    FormId = form.FormId,
                    SubmissionId = submissionId,
                    PortalId = form.PortalId,
                    UserId = userId.HasValue ? userId.Value : 0,
                    UserName = actor?.UserName ?? string.Empty,
                    UserEmail = actor?.Email ?? string.Empty,
                    IpAddress = ipAddress ?? string.Empty,
                    EnqueuedAtUtc = DateTime.UtcNow
                });
                _log?.LogInfo(nameof(SubmissionProcessor),
                    "AsyncWorker automation queued for form " + form.FormId + " submission " +
                    submissionId + ". QueueId=" + (queueId ?? string.Empty));
            }
            catch (Exception ex)
            {
                // The submission is already committed. Queue failure belongs in operations/audit,
                // not as a false claim that the visitor's saved row disappeared.
                _log?.LogError(nameof(SubmissionProcessor),
                    "AsyncWorker automation enqueue failed for form " + form.FormId +
                    " submission " + submissionId + ": " + ex.Message, ex);
            }
        }

        private static UserContext BuildSubmissionActor(UserContext actor, int? userId, string ipAddress)
        {
            var source = actor ?? new UserContext();
            var next = new UserContext
            {
                UserId = source.UserId > 0 ? source.UserId : (userId.HasValue ? userId.Value : 0),
                UserName = source.UserName,
                DisplayName = source.DisplayName,
                Email = source.Email,
                IsAuthenticated = source.IsAuthenticated || userId.HasValue,
                IsAdmin = source.IsAdmin,
                IsSuperUser = source.IsSuperUser,
                Roles = source.Roles != null
                    ? source.Roles.Where(r => !string.IsNullOrWhiteSpace(r)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                    : new List<string>(),
                IpAddress = !string.IsNullOrWhiteSpace(source.IpAddress) ? source.IpAddress : (ipAddress ?? string.Empty)
            };
            return next;
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

        /// <summary>
        /// [Automation v2 20260813-01] Run one automation stage.
        ///
        /// Returns null when there is nothing to run — no service, no config, or a stage this form
        /// does not use — so the caller can treat "nothing configured" and "ran fine" identically
        /// without a second flag.
        ///
        /// Never throws. A broken script is a script problem; turning it into a 500 on a public
        /// form would make it everyone's problem.
        /// </summary>
        private AfterSubmitScriptRunResult RunAutomationStage(
            MegaForm.Core.Automation.AutomationStage stage,
            FormSchema schema,
            FormInfo form,
            int submissionId,
            Dictionary<string, object> formData,
            string ipAddress,
            int? userId,
            UserContext actor,
            SubmissionResult result)
        {
            if (_afterSubmitScript == null) return null;

            var settings = schema?.Settings;
            if (settings == null) return null;

            // settings.automation.<stage> is the v2 home. settings.afterSubmitScript is where a form
            // configured before the stages existed keeps its post-commit script, so it is read as
            // the PostCommit alias — silently dropping those would break every form already using
            // the feature.
            var block = settings.Automation != null ? settings.Automation.ForStage(stage) : null;
            if (block == null && stage == MegaForm.Core.Automation.AutomationStage.PostCommit)
                block = settings.AfterSubmitScript;
            if (block == null || !block.Enabled) return null;

            try
            {
                var ctx = new Scripting.SubmissionScriptContext(formData)
                {
                    FormId       = form.FormId,
                    SubmissionId = submissionId,
                    PortalId     = form.PortalId,
                    FormTitle    = form.Title,
                    UserId       = userId.HasValue ? userId.Value : 0,
                    UserName     = actor?.UserName ?? string.Empty,
                    UserEmail    = actor?.Email ?? string.Empty,
                    IpAddress    = ipAddress ?? string.Empty,
                    UtcNow       = DateTime.UtcNow
                };

                var run = _afterSubmitScript.RunStage(stage, block, ctx);

                if (run.Skipped)
                {
                    _log?.LogWarning(nameof(SubmissionProcessor),
                        stage + " automation for form " + form.FormId + " did not run: " + run.SkipReason);
                    return run;
                }

                // Apply value changes a pre-commit stage made, so the row that gets written is the
                // one the script produced.
                if (ctx.CanAbort && ctx.PendingChanges.Count > 0 && formData != null)
                {
                    foreach (var kv in ctx.PendingChanges) formData[kv.Key] = kv.Value;
                    _log?.LogInfo(nameof(SubmissionProcessor),
                        stage + " automation for form " + form.FormId + " changed " +
                        ctx.PendingChanges.Count + " field value(s) before the row was written.");
                }

                // A script's message beats the form's configured one for this submission only.
                if (!string.IsNullOrWhiteSpace(run.ResponseSuccessMessage))
                    result.SuccessMessage = run.ResponseSuccessMessage;
                if (!string.IsNullOrWhiteSpace(run.ResponseRedirectUrl))
                    result.RedirectUrl = run.ResponseRedirectUrl;

                if (run.Success)
                {
                    _log?.LogInfo(nameof(SubmissionProcessor),
                        stage + " automation ran for form " + form.FormId + " submission " + submissionId +
                        " in " + run.DurationMs + "ms.");
                }
                else
                {
                    _log?.LogError(nameof(SubmissionProcessor),
                        stage + " automation failed for form " + form.FormId + " submission " +
                        submissionId + ": " + run.ErrorMessage, null);
                }
                return run;
            }
            catch (Exception ex)
            {
                _log?.LogError(nameof(SubmissionProcessor),
                    stage + " automation host failed for form " + form.FormId + ": " + ex.Message, ex);
                return null;
            }
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

        /// <summary>
        /// [AfterSubmitScript v20260813-01] Set only when the form's C# hook failed AND the
        /// hook is configured onFailure="report". Success stays true and the submission stays
        /// saved — this is a note for the caller, not a submit failure. Callers that surface it
        /// to an anonymous visitor should show the configured message, not this string, which
        /// is written by a host and can name internal systems.
        /// </summary>
        public string ScriptError { get; set; }
    }
}
