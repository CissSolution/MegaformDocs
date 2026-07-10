using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Core.Services.WorkflowEngineV2
//
//  Implementation of IWorkflowEngine.
//  Registered as: services.AddScoped<IWorkflowEngine, WorkflowEngineV2>()
//
//  Execution strategy:
//  - Sequential by default: walk graph from StartNodeId following edges
//  - Condition nodes: "handle::true" or "handle::false" → resolve edge
//  - Fork nodes (V1.5): Task.WhenAll for parallel branches
//  - End nodes: NextNodeId = null → stop
//  - Safety: max 100 steps, 300s timeout
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Core.Services
{
    public class WorkflowEngineV2 : IWorkflowEngine
    {
        private readonly IWorkflowRepository             _repo;
        private readonly IWorkflowLibraryRepository      _libraryRepo;
        private readonly IWorkflowEvaluator              _evaluator;
        private readonly IEnumerable<INodeExecutor>      _executors;
        private readonly ILogService                      _log;

        // Safety limits
        private const int MaxSteps          = 100;
        private const int DefaultTimeoutSec = 300;

        public WorkflowEngineV2(
            IWorkflowRepository        repo,
            IWorkflowEvaluator         evaluator,
            IEnumerable<INodeExecutor> executors,
            ILogService                log = null)
            : this(repo, evaluator, executors, null, log)
        {
        }

        public WorkflowEngineV2(
            IWorkflowRepository        repo,
            IWorkflowEvaluator         evaluator,
            IEnumerable<INodeExecutor> executors,
            IWorkflowLibraryRepository libraryRepo,
            ILogService                log = null)
        {
            _repo        = repo;
            _libraryRepo = libraryRepo;
            _evaluator   = evaluator;
            _executors   = executors;
            _log         = log;
        }

        // ─── ExecuteAsync ─────────────────────────────────────────────────────

        public async Task<WorkflowExecutionContext> ExecuteAsync(
            int formId,
            int submissionId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            // Load WorkflowDefinition. Reusable library mappings win; legacy per-form
            // WorkflowJson remains the fallback so existing forms continue unchanged.
            var runtime = ResolveWorkflowForForm(formId);
            var definition = runtime != null ? runtime.Definition : null;
            if (definition == null)
            {
                _log?.LogInfo("MegaForm.Workflow", "No applied workflow found for form " + formId + ".");
                // No workflow → return empty completed context (not an error)
                return new WorkflowExecutionContext
                {
                    FormId       = formId,
                    SubmissionId = submissionId,
                    Status       = WorkflowExecutionStatus.Completed,
                    CompletedAt  = DateTime.UtcNow,
                };
            }

            // Build execution context
            var ctx = BuildContext(definition, formId, submissionId, ApplyFieldMappings(formData, runtime), runtime);
            StampRuntimeMetadata(ctx, runtime);
            _log?.LogInfo("MegaForm.Workflow", "Starting workflow execution " + ctx.ExecutionId + " for form " + formId + " submission " + submissionId + ".");

            // Apply DryRun from definition settings
            if (definition.Settings?.DryRun == true)
                ctx.IsDryRun = true;

            // Persist (status=running)
            try { _repo.SaveExecution(ctx); }
            catch (Exception ex) { _log?.LogError("MegaForm.Workflow", "Failed to save workflow execution " + ctx.ExecutionId + ": " + ex.Message, ex); }

            // Setup timeout
            int timeoutSec = definition.Settings?.ExecutionTimeoutSeconds > 0
                ? definition.Settings.ExecutionTimeoutSeconds
                : DefaultTimeoutSec;

            using (var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec)))
            using (var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token))
            {
                try
                {
                    await WalkGraphAsync(definition, ctx, definition.StartNodeId, linked.Token);
                }
                catch (OperationCanceledException)
                {
                    if (timeoutCts.IsCancellationRequested)
                    {
                        ctx.Status       = WorkflowExecutionStatus.Failed;
                        ctx.ErrorMessage = "Workflow execution timed out after " + timeoutSec + "s.";
                    }
                    else
                    {
                        ctx.Status       = WorkflowExecutionStatus.Cancelled;
                        ctx.ErrorMessage = "Execution cancelled.";
                    }
                }
                catch (Exception ex)
                {
                    ctx.Status       = WorkflowExecutionStatus.Failed;
                    ctx.ErrorMessage = "Unhandled error: " + ex.Message;
                    _log?.LogError("MegaForm.Workflow", "Unhandled workflow error for execution " + ctx.ExecutionId + ": " + ex.Message, ex);
                }
            }

            if (ctx.Status == WorkflowExecutionStatus.Running)
                ctx.Status = WorkflowExecutionStatus.Completed;

            ctx.CompletedAt = DateTime.UtcNow;

            // Persist final state
            try { _repo.UpdateExecution(ctx); }
            catch (Exception ex) { _log?.LogError("MegaForm.Workflow", "Failed to update workflow execution " + ctx.ExecutionId + ": " + ex.Message, ex); }

            _log?.LogInfo("MegaForm.Workflow", "Workflow execution " + ctx.ExecutionId + " finished with status=" + ctx.Status + ", currentNode=" + (ctx.CurrentNodeId ?? "") + ", error=" + (ctx.ErrorMessage ?? "") + ".");

            return ctx;
        }

        // ─── ResumeAsync [Recovered June-15 from DLL] ─────────────────────────
        // Resume a Waiting execution after a human-task outcome (approval/forward).
        public async Task<WorkflowExecutionContext> ResumeAsync(
            string executionId,
            string outcomeHandle,
            Dictionary<string, object> resumeData,
            CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(executionId))
                throw new ArgumentException("executionId is required.", nameof(executionId));

            var ctx = _repo.GetExecution(executionId);
            if (ctx == null)
                throw new InvalidOperationException("Workflow execution not found.");

            var runtime = ResolveWorkflowForForm(ctx.FormId);
            var definition = runtime != null ? runtime.Definition : null;
            if (definition == null)
            {
                _log?.LogInfo("MegaForm.Workflow", "Resume: no applied workflow for form " + ctx.FormId + " — completing case.");
                ctx.Status = WorkflowExecutionStatus.Completed;
                ctx.ErrorMessage = null;
                ctx.PendingTaskId = string.Empty;
                ctx.CompletedAt = DateTime.UtcNow;
                _repo.UpdateExecution(ctx);
                return ctx;
            }

            var node = FindNode(definition, ctx.CurrentNodeId);
            if (node == null)
                throw new InvalidOperationException("Current workflow node '" + ctx.CurrentNodeId + "' was not found.");

            if (resumeData != null)
            {
                if (ctx.Variables == null)
                    ctx.Variables = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                foreach (var kv in resumeData)
                    ctx.Variables[kv.Key] = kv.Value;
            }

            ctx.Status = WorkflowExecutionStatus.Running;
            ctx.ErrorMessage = null;
            ctx.PendingTaskId = string.Empty;
            ctx.CompletedAt = null;

            string next = ResolveNextFromEdge(definition, node.Id,
                string.IsNullOrWhiteSpace(outcomeHandle) ? "default" : outcomeHandle);
            if (string.IsNullOrWhiteSpace(next))
            {
                ctx.Status = WorkflowExecutionStatus.Completed;
                ctx.CompletedAt = DateTime.UtcNow;
                _repo.UpdateExecution(ctx);
                return ctx;
            }

            var settings = definition.Settings;
            int timeoutSec = (settings != null && settings.ExecutionTimeoutSeconds > 0)
                ? definition.Settings.ExecutionTimeoutSeconds : 300;
            using (var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec)))
            using (var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token))
            {
                try
                {
                    await WalkGraphAsync(definition, ctx, next, linked.Token);
                }
                catch (OperationCanceledException)
                {
                    if (timeoutCts.IsCancellationRequested)
                    {
                        ctx.Status = WorkflowExecutionStatus.Failed;
                        ctx.ErrorMessage = "Workflow execution timed out after " + timeoutSec + "s.";
                    }
                    else
                    {
                        ctx.Status = WorkflowExecutionStatus.Cancelled;
                        ctx.ErrorMessage = "Execution cancelled.";
                    }
                }
                catch (Exception ex)
                {
                    ctx.Status = WorkflowExecutionStatus.Failed;
                    ctx.ErrorMessage = "Unhandled error: " + ex.Message;
                    _log?.LogError("MegaForm.Workflow", "Unhandled workflow resume error for execution " + ctx.ExecutionId + ": " + ex.Message, ex);
                }
            }

            if (ctx.Status == WorkflowExecutionStatus.Running)
                ctx.Status = WorkflowExecutionStatus.Completed;
            if (ctx.Status != WorkflowExecutionStatus.Waiting)
                ctx.CompletedAt = DateTime.UtcNow;
            _repo.UpdateExecution(ctx);
            return ctx;
        }

        // ─── WalkGraphAsync ───────────────────────────────────────────────────

        private async Task WalkGraphAsync(
            WorkflowDefinition definition,
            WorkflowExecutionContext ctx,
            string startNodeId,
            CancellationToken ct)
        {
            string currentId = startNodeId;
            int steps = 0;

            while (!string.IsNullOrEmpty(currentId) && steps++ < MaxSteps)
            {
                ct.ThrowIfCancellationRequested();

                var node = FindNode(definition, currentId);
                if (node == null)
                {
                    ctx.Status       = WorkflowExecutionStatus.Failed;
                    ctx.ErrorMessage = "Node '" + currentId + "' not found in definition.";
                    return;
                }

                ctx.CurrentNodeId = currentId;

                // Execute node
                var sw = Stopwatch.StartNew();
                WorkflowNodeResult nodeResult = await ExecuteNodeAsync(node, ctx, ct);
                sw.Stop();
                nodeResult.DurationMs = sw.ElapsedMilliseconds;

                // Log
                if (definition.Settings?.EnableExecutionLog != false)
                    AppendLog(ctx, node, nodeResult);

                _log?.LogInfo("MegaForm.Workflow",
                    "Execution " + ctx.ExecutionId + " node " + node.Id + " (" + node.Type + ") => " +
                    (nodeResult?.Status ?? "unknown") + ", next=" + (nodeResult?.NextNodeId ?? "") +
                    ", durationMs=" + nodeResult.DurationMs +
                    (string.IsNullOrWhiteSpace(nodeResult?.Error) ? "" : ", error=" + nodeResult.Error));

                // Store output
                if (nodeResult.OutputData != null)
                    ctx.NodeResults[currentId] = nodeResult.OutputData;

                // Handle result
                if (nodeResult.Status == "failed")
                {
                    // Try error handler
                    string errorHandler = node.ErrorHandlerNodeId
                        ?? definition.Settings?.GlobalErrorHandlerNodeId;

                    if (!string.IsNullOrEmpty(errorHandler))
                    {
                        currentId = errorHandler;
                        continue;
                    }

                    ctx.Status       = WorkflowExecutionStatus.Failed;
                    ctx.ErrorMessage = nodeResult.Error ?? "Node '" + node.Label + "' failed.";
                    return;
                }

                // Persist progress periodically (every 5 steps)
                if (steps % 5 == 0)
                    try { _repo.UpdateExecution(ctx); } catch { }

                // Fork: parallel execution
                if (node.Type == WorkflowNodeType.Fork)
                {
                    await ExecuteForkAsync(definition, ctx, node, ct);
                    // After fork+join, continue to node after Join
                    string joinId = GetConfigStr(node, "JoinNodeId");
                    currentId = ResolveNextFromEdge(definition, joinId ?? currentId, "default");
                    continue;
                }

                // Resolve next node from edge
                currentId = ResolveNext(definition, node, nodeResult);
            }

            if (steps >= MaxSteps)
            {
                ctx.Status       = WorkflowExecutionStatus.Failed;
                ctx.ErrorMessage = "Workflow exceeded maximum step limit (" + MaxSteps + ").";
            }
        }

        // ─── ExecuteNodeAsync ─────────────────────────────────────────────────

        private async Task<WorkflowNodeResult> ExecuteNodeAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct)
        {
            var executor = FindExecutor(node.Type);
            if (executor == null)
            {
                // Unsupported node type — fail loudly; do NOT silently skip.
                // This should never happen at runtime because ValidateDefinition
                // rejects unsupported types at save time.
                var msg = "No executor registered for node type '" + node.Type +
                          "' (node: " + node.Id + " '" + node.Label + "'). " +
                          "Remove this node or upgrade to a release that supports it.";
                return WorkflowNodeResult.Failed(msg);
            }

            try
            {
                return await executor.ExecuteAsync(node, ctx, ct);
            }
            catch (Exception ex)
            {
                return WorkflowNodeResult.Failed(ex.Message);
            }
        }

        // ─── Fork/Join parallel ───────────────────────────────────────────────

        private async Task ExecuteForkAsync(
            WorkflowDefinition definition,
            WorkflowExecutionContext ctx,
            WorkflowNode forkNode,
            CancellationToken ct)
        {
            // Get branch start nodes from Fork config
            List<string> branchIds = GetConfigList(forkNode, "BranchStartNodeIds");
            if (branchIds == null || branchIds.Count == 0)
                return;

            // Get Join strategy
            string joinId  = GetConfigStr(forkNode, "JoinNodeId");
            var joinNode   = joinId != null ? FindNode(definition, joinId) : null;
            var joinConfig = ParseJoinConfig(joinNode);

            // Create branch tasks
            var tasks = new List<Task>();
            foreach (var branchStartId in branchIds)
            {
                // Each branch gets a shallow-cloned context (shares Variables by ref — intentional)
                var branchCtx = ctx; // shared context — variables are global
                tasks.Add(WalkGraphAsync(definition, branchCtx, branchStartId, ct));
            }

            // Wait according to strategy
            if (joinConfig.Strategy == JoinStrategy.WaitAny || joinConfig.Strategy == JoinStrategy.WaitFirst)
                await Task.WhenAny(tasks);
            else
                await Task.WhenAll(tasks); // WaitAll (default)
        }

        // ─── Navigation (server-side helper) ─────────────────────────────────

        public Task<WorkflowNavigationResult> EvaluateNavigationAsync(
            int formId,
            string currentNodeId,
            Dictionary<string, object> formData,
            CancellationToken ct)
        {
            var runtime = ResolveWorkflowForForm(formId);
            var definition = runtime != null ? runtime.Definition : null;
            if (definition == null)
                return Task.FromResult(new WorkflowNavigationResult());

            var result = _evaluator.EvaluateNavigation(definition, currentNodeId, ApplyFieldMappings(formData, runtime));
            return Task.FromResult(result);
        }

        // ─── Status / Cancel ──────────────────────────────────────────────────

        public Task<WorkflowExecutionContext> GetExecutionStatusAsync(string executionId)
        {
            var ctx = _repo.GetExecution(executionId);
            return Task.FromResult(ctx);
        }

        public Task CancelExecutionAsync(string executionId)
        {
            var ctx = _repo.GetExecution(executionId);
            if (ctx != null && ctx.Status == WorkflowExecutionStatus.Running)
            {
                ctx.Status       = WorkflowExecutionStatus.Cancelled;
                ctx.CompletedAt  = DateTime.UtcNow;
                ctx.ErrorMessage = "Cancelled by user.";
                _repo.UpdateExecution(ctx);
            }
            return Task.CompletedTask;
        }

        // ─── Helpers ──────────────────────────────────────────────────────────

        private WorkflowExecutionContext BuildContext(
            WorkflowDefinition definition,
            int formId, int submissionId,
            Dictionary<string, object> formData,
            WorkflowRuntimeDefinition runtime = null)
        {
            var ctx = new WorkflowExecutionContext
            {
                FormId       = formId,
                SubmissionId = submissionId,
                FormData     = formData ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase),
            };

            // Initialize variables from defaults
            if (definition.Variables != null)
            {
                foreach (var v in definition.Variables)
                {
                    if (v.DefaultValue != null)
                        ctx.Variables[v.Key] = v.DefaultValue;
                    else
                        ctx.Variables[v.Key] = GetDefaultForType(v.Type);
                }
            }

            // Per-form overrides win over the template's defaults. This is what lets one
            // shared library template approve through a different person per form.
            // Only keys already declared as workflow variables are honoured, so a mapping
            // cannot smuggle arbitrary context keys into node configs.
            if (runtime != null && runtime.VariableOverrides != null && runtime.VariableOverrides.Count > 0)
            {
                foreach (var kv in runtime.VariableOverrides)
                {
                    if (string.IsNullOrWhiteSpace(kv.Key)) continue;
                    if (!ctx.Variables.ContainsKey(kv.Key))
                    {
                        _log?.LogWarning("MegaForm.Workflow",
                            "Ignoring variable override '" + kv.Key + "' for form " + formId +
                            " — not declared in the template's Variables.");
                        continue;
                    }
                    ctx.Variables[kv.Key] = kv.Value;
                }
            }

            return ctx;
        }

        public bool HasExecutableWorkflow(int formId)
        {
            if (formId <= 0) return false;
            try
            {
                var runtime = ResolveWorkflowForForm(formId);
                return runtime != null && runtime.Definition != null;
            }
            catch (Exception ex)
            {
                // Fail closed: a resolution error must not turn a submit into a 500.
                _log?.LogError("MegaForm.Workflow",
                    "HasExecutableWorkflow failed for form " + formId + ": " + ex.Message, ex);
                return false;
            }
        }

        private WorkflowRuntimeDefinition ResolveWorkflowForForm(int formId)
        {
            if (_libraryRepo != null)
            {
                try
                {
                    var runtime = _libraryRepo.GetActiveDefinitionForForm(formId);
                    if (runtime != null && runtime.Definition != null)
                        return runtime;
                }
                catch (Exception ex)
                {
                    _log?.LogError("MegaForm.Workflow",
                        "Failed to resolve reusable workflow for form " + formId + ": " + ex.Message, ex);
                }
            }

            var legacy = _repo.GetByFormId(formId);
            if (legacy == null)
                return null;

            return new WorkflowRuntimeDefinition
            {
                Source = "legacy-form",
                Definition = legacy
            };
        }

        private Dictionary<string, object> ApplyFieldMappings(
            Dictionary<string, object> formData,
            WorkflowRuntimeDefinition runtime)
        {
            var mapped = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (formData != null)
            {
                foreach (var kv in formData)
                    mapped[kv.Key] = kv.Value;
            }

            if (runtime == null || runtime.FieldMappings == null || runtime.FieldMappings.Count == 0)
                return mapped;

            foreach (var fieldMap in runtime.FieldMappings)
            {
                if (fieldMap == null)
                    continue;

                var workflowKey = (fieldMap.WorkflowFieldKey ?? string.Empty).Trim();
                var formKey = (fieldMap.FormFieldKey ?? string.Empty).Trim();
                if (workflowKey.Length == 0 || formKey.Length == 0)
                    continue;

                object value;
                if (mapped.TryGetValue(formKey, out value) && !mapped.ContainsKey(workflowKey))
                    mapped[workflowKey] = value;
                else if (mapped.TryGetValue(workflowKey, out value) && !mapped.ContainsKey(formKey))
                    mapped[formKey] = value;
            }

            return mapped;
        }

        private void StampRuntimeMetadata(WorkflowExecutionContext ctx, WorkflowRuntimeDefinition runtime)
        {
            if (ctx == null || runtime == null || ctx.Variables == null)
                return;

            ctx.Variables["__workflowSource"] = runtime.Source ?? "legacy-form";
            if (runtime.Template != null)
            {
                ctx.Variables["__workflowTemplateId"] = runtime.Template.WorkflowTemplateId;
                ctx.Variables["__workflowTemplateKey"] = runtime.Template.TemplateKey ?? string.Empty;
                ctx.Variables["__workflowTemplateName"] = runtime.Template.Name ?? string.Empty;
            }
            if (runtime.Version != null)
            {
                ctx.Variables["__workflowVersionId"] = runtime.Version.WorkflowVersionId;
                ctx.Variables["__workflowVersion"] = runtime.Version.Version ?? string.Empty;
            }
            if (runtime.Mapping != null)
                ctx.Variables["__workflowMappingId"] = runtime.Mapping.MappingId;
        }

        private object GetDefaultForType(WorkflowVariableType type)
        {
            switch (type)
            {
                case WorkflowVariableType.Number:  return 0.0;
                case WorkflowVariableType.Boolean: return false;
                default:                           return "";
            }
        }

        private WorkflowNode FindNode(WorkflowDefinition definition, string nodeId)
        {
            foreach (var n in definition.Nodes)
                if (n.Id == nodeId) return n;
            return null;
        }

        private INodeExecutor FindExecutor(WorkflowNodeType nodeType)
        {
            foreach (var e in _executors)
                if (e.NodeType == nodeType) return e;
            return null;
        }

        private string ResolveNext(
            WorkflowDefinition definition,
            WorkflowNode node,
            WorkflowNodeResult nodeResult)
        {
            string hint = nodeResult.NextNodeId ?? "handle::default";

            // Extract handle from "handle::xxx" pattern
            string handle = "default";
            if (hint != null && hint.StartsWith("handle::"))
                handle = hint.Substring(8);

            return ResolveNextFromEdge(definition, node.Id, handle);
        }

        private string ResolveNextFromEdge(
            WorkflowDefinition definition,
            string sourceNodeId,
            string handle)
        {
            // Try exact handle match first
            foreach (var edge in definition.Edges)
            {
                if (edge.SourceNodeId == sourceNodeId && edge.SourceHandle == handle)
                    return edge.TargetNodeId;
            }

            // Fallback: first edge from this node regardless of handle
            if (handle != "default")
            {
                foreach (var edge in definition.Edges)
                {
                    if (edge.SourceNodeId == sourceNodeId
                        && (edge.SourceHandle == "default" || string.IsNullOrEmpty(edge.SourceHandle)))
                        return edge.TargetNodeId;
                }
            }

            return null; // end of chain
        }

        private void AppendLog(
            WorkflowExecutionContext ctx,
            WorkflowNode node,
            WorkflowNodeResult result)
        {
            ctx.Log.Add(new WorkflowExecutionLogEntry
            {
                Sequence  = ctx.Log.Count + 1,
                NodeId    = node.Id,
                NodeLabel = node.Label ?? node.Id,
                NodeType  = node.Type.ToString(),
                Status    = result.Status,
                OutputJson = result.OutputData != null
                    ? JsonConvert.SerializeObject(result.OutputData) : null,
                Error      = result.Error,
                DurationMs = result.DurationMs,
            });
        }

        private string GetConfigStr(WorkflowNode node, string key)
        {
            if (node.Config == null) return null;
            object val = null;
            return node.Config.TryGetValue(key, out val) && val != null ? val.ToString() : null;
        }

        private List<string> GetConfigList(WorkflowNode node, string key)
        {
            if (node.Config == null) return null;
            object val = null;
            if (!node.Config.TryGetValue(key, out val) || val == null) return null;

            try
            {
                string json = val is string s ? s : JsonConvert.SerializeObject(val);
                return JsonConvert.DeserializeObject<List<string>>(json);
            }
            catch { return null; }
        }

        private JoinNodeConfig ParseJoinConfig(WorkflowNode joinNode)
        {
            if (joinNode == null || joinNode.Config == null || joinNode.Config.Count == 0)
                return new JoinNodeConfig();
            try
            {
                return JsonConvert.DeserializeObject<JoinNodeConfig>(
                    JsonConvert.SerializeObject(joinNode.Config)) ?? new JoinNodeConfig();
            }
            catch { return new JoinNodeConfig(); }
        }
    }
}
