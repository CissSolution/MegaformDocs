using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MegaForm.Core.Models;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Workflow execution engine.
    /// Triggers: on_submit, on_update, on_field_change
    /// Steps: condition, update_field, send_email, webhook, create_record, assign
    /// </summary>
    public class WorkflowEngine
    {
        private readonly IPhase2Repository _repo;
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly EmailNotificationService _emailService;
        private readonly WebhookService _webhookService;
        private readonly ILogService _log;

        public WorkflowEngine(IPhase2Repository repo, IFormRepository formRepo, ISubmissionRepository subRepo, EmailNotificationService emailService, WebhookService webhookService, ILogService log)
        {
            _repo = repo;
            _formRepo = formRepo;
            _subRepo = subRepo;
            _emailService = emailService;
            _webhookService = webhookService;
            _log = log;
        }

        // ============================================================
        // TRIGGER EVALUATION
        // ============================================================

        /// <summary>
        /// Find and execute all matching workflows for a trigger event.
        /// Called from SubmissionController after save.
        /// </summary>
        public async Task<List<WorkflowRunResult>> ProcessTriggersAsync(
            string triggerType,
            int formId,
            int submissionId,
            Dictionary<string, object> formData,
            Dictionary<string, object> oldData = null)
        {
            var results = new List<WorkflowRunResult>();

            // Load workflows for this form
            var workflows = _repo.GetWorkflows(formId);
            if (workflows == null || workflows.Count == 0) return results;

            foreach (var wf in workflows.Where(w => w.IsEnabled && w.TriggerType == triggerType))
            {
                // Check trigger conditions
                if (!EvaluateTrigger(wf, triggerType, formData, oldData))
                    continue;

                // Execute workflow
                var runResult = await ExecuteWorkflowAsync(wf, submissionId, formData);
                results.Add(runResult);
            }

            return results;
        }

        private bool EvaluateTrigger(
            WorkflowInfo wf, string triggerType,
            Dictionary<string, object> formData,
            Dictionary<string, object> oldData)
        {
            if (triggerType == "on_submit") return true; // always fires

            if (triggerType == "on_field_change" && !string.IsNullOrEmpty(wf.TriggerConfig))
            {
                try
                {
                    var cfg = JObject.Parse(wf.TriggerConfig);
                    string watchField = cfg["field"]?.ToString();
                    string fromValue = cfg["from"]?.ToString();
                    string toValue = cfg["to"]?.ToString();

                    if (string.IsNullOrEmpty(watchField)) return false;

                    string newVal = formData.ContainsKey(watchField) ? formData[watchField]?.ToString() : "";
                    string oldVal = oldData != null && oldData.ContainsKey(watchField) ? oldData[watchField]?.ToString() : "";

                    // Check if field actually changed
                    if (newVal == oldVal) return false;
                    if (!string.IsNullOrEmpty(fromValue) && oldVal != fromValue) return false;
                    if (!string.IsNullOrEmpty(toValue) && newVal != toValue) return false;

                    return true;
                }
                catch { return false; }
            }

            if (triggerType == "on_update") return true;

            return false;
        }

        // ============================================================
        // WORKFLOW EXECUTION
        // ============================================================

        public async Task<WorkflowRunResult> ExecuteWorkflowAsync(
            WorkflowInfo workflow,
            int submissionId,
            Dictionary<string, object> formData)
        {
            var runResult = new WorkflowRunResult
            {
                WorkflowId = workflow.WorkflowId,
                WorkflowName = workflow.WorkflowName,
                Status = "running"
            };

            List<WorkflowStep> steps;
            try
            {
                steps = JsonConvert.DeserializeObject<List<WorkflowStep>>(workflow.StepsJson);
            }
            catch (Exception ex)
            {
                runResult.Status = "failed";
                runResult.Error = "Invalid workflow steps: " + ex.Message;
                return runResult;
            }

            if (steps == null || steps.Count == 0)
            {
                runResult.Status = "completed";
                return runResult;
            }

            // Build execution context
            var context = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var kvp in formData)
                context[kvp.Key] = kvp.Value;
            context["_submissionId"] = submissionId;
            context["_formId"] = workflow.FormId;
            context["_now"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");

            // Create run record
            long runId = 0;
            try { runId = _repo.CreateWorkflowRun(workflow.WorkflowId, submissionId); }
            catch { /* logging only */ }

            runResult.RunId = runId;

            // Execute steps sequentially
            var currentStep = steps.FirstOrDefault();
            int maxSteps = 50; // safety limit
            int stepCount = 0;

            while (currentStep != null && stepCount++ < maxSteps)
            {
                var stepResult = await ExecuteStepAsync(currentStep, context, workflow.FormId);

                runResult.StepResults.Add(new StepExecutionResult
                {
                    StepId = currentStep.Id,
                    StepName = currentStep.Name,
                    StepType = currentStep.Type,
                    Status = stepResult.Status,
                    Error = stepResult.Error
                });

                // Log step
                try
                {
                    _repo.LogWorkflowStep(runId, currentStep.Id, currentStep.Type,
                        stepResult.Status,
                        stepResult.Output != null ? JsonConvert.SerializeObject(stepResult.Output) : null,
                        stepResult.Error);
                }
                catch { /* logging only */ }

                if (stepResult.Status == "failed")
                {
                    runResult.Status = "failed";
                    runResult.Error = $"Step '{currentStep.Name}' failed: {stepResult.Error}";
                    break;
                }

                // Determine next step
                string nextId = stepResult.NextStepId ?? currentStep.Next;
                currentStep = nextId != null ? steps.FirstOrDefault(s => s.Id == nextId) : null;
            }

            if (runResult.Status == "running")
                runResult.Status = "completed";

            // Update run record
            try { _repo.CompleteWorkflowRun(runId, runResult.Status, runResult.Error); }
            catch { }

            return runResult;
        }

        // ============================================================
        // STEP EXECUTION
        // ============================================================

        private async Task<StepResult> ExecuteStepAsync(
            WorkflowStep step,
            Dictionary<string, object> context,
            int formId)
        {
            try
            {
                switch (step.Type)
                {
                    case "condition": return EvaluateCondition(step, context);
                    case "update_field": return await UpdateFieldAsync(step, context, formId);
                    case "send_email": return await SendEmailAsync(step, context, formId);
                    case "webhook": return await CallWebhookAsync(step, context);
                    case "create_record": return await CreateRecordAsync(step, context);
                    case "assign_round_robin": return await AssignRoundRobinAsync(step, context, formId);
                    case "calculate": return EvaluateCalculation(step, context);
                    default: return new StepResult { Status = "skipped", Error = $"Unknown step type: {step.Type}" };
                }
            }
            catch (Exception ex)
            {
                return new StepResult { Status = "failed", Error = ex.Message };
            }
        }

        // --- CONDITION ---
        private StepResult EvaluateCondition(WorkflowStep step, Dictionary<string, object> context)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));
            var conditions = cfg["conditions"]?.ToObject<List<WorkflowCondition>>() ?? new List<WorkflowCondition>();
            string logic = cfg["logic"]?.ToString() ?? "and";

            var results = conditions.Select(c =>
            {
                string val = context.ContainsKey(c.Field) ? context[c.Field]?.ToString() ?? "" : "";
                string target = ResolveTemplate(c.Value ?? "", context);

                switch (c.Operator)
                {
                    case "equals": return val.Equals(target, StringComparison.OrdinalIgnoreCase);
                    case "notEquals": return !val.Equals(target, StringComparison.OrdinalIgnoreCase);
                    case "contains": return val.IndexOf(target, StringComparison.OrdinalIgnoreCase) >= 0;
                    case "greaterThan":
                        return double.TryParse(val, out double n1) && double.TryParse(target, out double n2) && n1 > n2;
                    case "lessThan":
                        return double.TryParse(val, out double n3) && double.TryParse(target, out double n4) && n3 < n4;
                    case "isEmpty": return string.IsNullOrWhiteSpace(val);
                    case "isNotEmpty": return !string.IsNullOrWhiteSpace(val);
                    case "in": return target.Split(',').Select(s => s.Trim()).Contains(val, StringComparer.OrdinalIgnoreCase);
                    default: return true;
                }
            }).ToList();

            bool passed = logic == "or" ? results.Any(r => r) : results.All(r => r);

            return new StepResult
            {
                Status = "success",
                NextStepId = passed ? step.OnTrue : step.OnFalse,
                Output = new Dictionary<string, object> { { "result", passed } }
            };
        }

        // --- UPDATE FIELD ---
        private async Task<StepResult> UpdateFieldAsync(
            WorkflowStep step, Dictionary<string, object> context, int formId)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));
            var updates = cfg["updates"]?.ToObject<List<FieldUpdate>>() ?? new List<FieldUpdate>();

            int submissionId = context.ContainsKey("_submissionId") ? Convert.ToInt32(context["_submissionId"]) : 0;
            if (submissionId == 0)
                return new StepResult { Status = "failed", Error = "No submission ID in context" };

            var submission = _subRepo.Get(submissionId);
            if (submission == null)
                return new StepResult { Status = "failed", Error = "Submission not found" };

            var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson ?? "{}");

            foreach (var update in updates)
            {
                string resolvedValue = ResolveTemplate(update.Value ?? "", context);
                data[update.Field] = resolvedValue;
                context[update.Field] = resolvedValue; // update running context too
            }

            // Save back
            submission.DataJson = JsonConvert.SerializeObject(data);
            _subRepo.UpdateData(submissionId, submission.DataJson);

            return new StepResult
            {
                Status = "success",
                Output = new Dictionary<string, object> { { "updatedFields", updates.Count } }
            };
        }

        // --- SEND EMAIL ---
        private async Task<StepResult> SendEmailAsync(
            WorkflowStep step, Dictionary<string, object> context, int formId)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));

            string to = ResolveTemplate(cfg["to"]?.ToString() ?? "", context);
            string cc = ResolveTemplate(cfg["cc"]?.ToString() ?? "", context);
            string subject = ResolveTemplate(cfg["subject"]?.ToString() ?? "", context);
            string body = ResolveTemplate(cfg["body"]?.ToString() ?? "", context);
            string replyTo = ResolveTemplate(cfg["replyTo"]?.ToString() ?? "", context);

            if (string.IsNullOrWhiteSpace(to))
                return new StepResult { Status = "failed", Error = "Email recipient is empty" };

            try
            {
                _emailService.SendWorkflowEmail(to, subject, body, replyTo);
                return new StepResult
                {
                    Status = "success",
                    Output = new Dictionary<string, object> { { "sentTo", to }, { "subject", subject } }
                };
            }
            catch (Exception ex)
            {
                return new StepResult { Status = "failed", Error = $"Email failed: {ex.Message}" };
            }
        }

        // --- WEBHOOK ---
        private async Task<StepResult> CallWebhookAsync(
            WorkflowStep step, Dictionary<string, object> context)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));

            string url = ResolveTemplate(cfg["url"]?.ToString() ?? "", context);
            string method = cfg["method"]?.ToString() ?? "POST";

            if (string.IsNullOrWhiteSpace(url))
                return new StepResult { Status = "failed", Error = "Webhook URL is empty" };

            try
            {
                var bodyTemplate = cfg["body"];
                string bodyJson = bodyTemplate != null
                    ? ResolveTemplate(bodyTemplate.ToString(), context)
                    : JsonConvert.SerializeObject(context);

                var headers = cfg["headers"]?.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>();

                int responseCode = await _webhookService.SendRawWebhookAsync(url, method, bodyJson, headers);

                return new StepResult
                {
                    Status = responseCode >= 200 && responseCode < 300 ? "success" : "failed",
                    Error = responseCode >= 300 ? $"HTTP {responseCode}" : null,
                    Output = new Dictionary<string, object> { { "responseCode", responseCode } }
                };
            }
            catch (Exception ex)
            {
                return new StepResult { Status = "failed", Error = $"Webhook failed: {ex.Message}" };
            }
        }

        // --- CREATE RECORD ---
        private async Task<StepResult> CreateRecordAsync(
            WorkflowStep step, Dictionary<string, object> context)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));
            int targetFormId = cfg["targetFormId"]?.ToObject<int>() ?? 0;
            var mapping = cfg["fieldMapping"]?.ToObject<Dictionary<string, string>>() ?? new Dictionary<string, string>();

            if (targetFormId == 0)
                return new StepResult { Status = "failed", Error = "Target form ID not specified" };

            var newData = new Dictionary<string, object>();
            foreach (var kvp in mapping)
            {
                newData[kvp.Key] = ResolveTemplate(kvp.Value, context);
            }

            string dataJson = JsonConvert.SerializeObject(newData);
            var submission = new SubmissionInfo
            {
                FormId = targetFormId,
                DataJson = dataJson,
                Status = "New",
                IpAddress = "workflow",
                UserAgent = "MegaForm Workflow Engine"
            };

            int newId = _subRepo.Insert(submission);

            return new StepResult
            {
                Status = "success",
                Output = new Dictionary<string, object>
                {
                    { "newSubmissionId", newId },
                    { "targetFormId", targetFormId }
                }
            };
        }

        // --- ROUND ROBIN ASSIGNMENT ---
        private async Task<StepResult> AssignRoundRobinAsync(
            WorkflowStep step, Dictionary<string, object> context, int formId)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));
            string field = cfg["field"]?.ToString() ?? "assigned_to";
            var pool = cfg["pool"]?.ToObject<List<string>>() ?? new List<string>();

            if (pool.Count == 0)
                return new StepResult { Status = "failed", Error = "Assignment pool is empty" };

            // Simple round-robin: use submission ID mod pool size
            int submissionId = context.ContainsKey("_submissionId") ? Convert.ToInt32(context["_submissionId"]) : 0;
            int index = submissionId % pool.Count;
            string assignee = pool[index];

            context[field] = assignee;

            // Also update the submission record
            int subId = Convert.ToInt32(context["_submissionId"]);
            var submission = _subRepo.Get(subId);
            if (submission != null)
            {
                var data = JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson ?? "{}");
                data[field] = assignee;
                _subRepo.UpdateData(subId, JsonConvert.SerializeObject(data));
            }

            return new StepResult
            {
                Status = "success",
                Output = new Dictionary<string, object> { { "assignedTo", assignee } }
            };
        }

        // --- CALCULATE ---
        private StepResult EvaluateCalculation(WorkflowStep step, Dictionary<string, object> context)
        {
            var cfg = JObject.Parse(JsonConvert.SerializeObject(step.Config));
            var updates = cfg["updates"]?.ToObject<List<FieldUpdate>>() ?? new List<FieldUpdate>();

            foreach (var update in updates)
            {
                string formula = ResolveTemplate(update.Formula ?? update.Value ?? "0", context);
                // Simple math evaluation: replace field references, then evaluate
                try
                {
                    // Very basic: just substitute and try to parse
                    double result = EvaluateSimpleMath(formula);
                    context[update.Field] = result;
                }
                catch
                {
                    context[update.Field] = formula;
                }
            }

            return new StepResult { Status = "success" };
        }

        // ============================================================
        // TEMPLATE RESOLUTION ({{field}} → value)
        // ============================================================

        public string ResolveTemplate(string template, Dictionary<string, object> context)
        {
            if (string.IsNullOrEmpty(template)) return template;

            return Regex.Replace(template, @"\{\{(\w+)\}\}", m =>
            {
                string key = m.Groups[1].Value;
                if (context.TryGetValue(key, out var val))
                {
                    if (val is Newtonsoft.Json.Linq.JArray jArr)
                        return string.Join(", ", jArr.Select(j => j.ToString()));
                    return val?.ToString() ?? "";
                }
                return m.Value; // leave unreplaced
            });
        }

        private double EvaluateSimpleMath(string expr)
        {
            // Remove spaces
            expr = expr.Replace(" ", "");
            // Try direct parse
            if (double.TryParse(expr, out double direct)) return direct;
            // Very simple: just return 0 for complex expressions
            // Full math parser would be needed for production
            return 0;
        }

        // ============================================================
        // RESULT MODELS
        // ============================================================

        public class WorkflowRunResult
        {
            public long RunId { get; set; }
            public int WorkflowId { get; set; }
            public string WorkflowName { get; set; }
            public string Status { get; set; }
            public string Error { get; set; }
            public List<StepExecutionResult> StepResults { get; set; } = new List<StepExecutionResult>();
        }

        public class StepExecutionResult
        {
            public string StepId { get; set; }
            public string StepName { get; set; }
            public string StepType { get; set; }
            public string Status { get; set; }
            public string Error { get; set; }
        }

        /// <summary>Internal step execution result.</summary>
        public class StepResult
        {
            public string Status { get; set; }
            public string Error { get; set; }
            public object Output { get; set; }
            public string NextStepId { get; set; }
        }

        public class FieldUpdate
        {
            [JsonProperty("field")]
            public string Field { get; set; }
            [JsonProperty("value")]
            public string Value { get; set; }
            [JsonProperty("formula")]
            public string Formula { get; set; }
        }
    }
}
