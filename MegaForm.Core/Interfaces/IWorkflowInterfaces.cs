using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Workflow;

// ══════════════════════════════════════════════════════════════════════════════
//  MegaForm.Core.Interfaces — Workflow Engine Interfaces
//  C# 7.3 compatible (net472 + net8.0 + net9.0)
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Core.Interfaces
{
    // ─────────────────────────────────────────────────────────────────────────
    //  IWorkflowEngine
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Main orchestrator. Loads WorkflowDefinition → executes nodes → persists log.
    /// Hybrid execution: Condition/Calculate = sync, Webhook/Email = async.
    /// </summary>
    public interface IWorkflowEngine
    {
        /// <summary>Entry point after form submit.</summary>
        Task<WorkflowExecutionContext> ExecuteAsync(
            int formId,
            int submissionId,
            Dictionary<string, object> formData,
            CancellationToken ct);

        /// <summary>Server-side navigation evaluation (client-side is primary).</summary>
        Task<WorkflowNavigationResult> EvaluateNavigationAsync(
            int formId,
            string currentNodeId,
            Dictionary<string, object> formData,
            CancellationToken ct);

        /// <summary>Poll execution status after submit.</summary>
        Task<WorkflowExecutionContext> GetExecutionStatusAsync(string executionId);

        /// <summary>[Recovered June-15] Resume a Waiting execution after a human task outcome.</summary>
        Task<WorkflowExecutionContext> ResumeAsync(
            string executionId,
            string outcomeHandle,
            Dictionary<string, object> resumeData,
            CancellationToken ct);

        /// <summary>Cancel a running execution.</summary>
        Task CancelExecutionAsync(string executionId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INodeExecutor
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Executor for a specific node type.
    /// One implementation per WorkflowNodeType (Open/Closed Principle).
    /// Register all as INodeExecutor; engine resolves via NodeType property.
    /// </summary>
    public interface INodeExecutor
    {
        WorkflowNodeType NodeType { get; }

        Task<WorkflowNodeResult> ExecuteAsync(
            WorkflowNode node,
            WorkflowExecutionContext ctx,
            CancellationToken ct);

        WorkflowValidationResult Validate(WorkflowNode node);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IWebhookExecutor
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// HTTP execution for Webhook nodes.
    /// Separated so DNN can use HttpWebRequest, Web uses HttpClient.
    /// </summary>
    public interface IWebhookExecutor
    {
        Task<WebhookExecutionResult> ExecuteAsync(
            WebhookNodeConfig config,
            WorkflowExecutionContext ctx,
            CancellationToken ct);

        string ResolveTemplate(string template, WorkflowExecutionContext ctx);

        string ResolveNextNode(
            WebhookExecutionResult result,
            List<ResponseRoute> routes,
            string fallbackNodeId);
    }

    /// <summary>Result from IWebhookExecutor.ExecuteAsync.</summary>
    public class WebhookExecutionResult
    {
        public int    StatusCode   { get; set; }
        public string ResponseBody { get; set; }
        public bool   IsSuccess    { get; set; }
        public string Error        { get; set; }
        public int    AttemptCount { get; set; }
        public long   DurationMs   { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IWorkflowRepository
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Data access for WorkflowDefinition and ExecutionContext.
    /// Web: EfWorkflowRepository (EF Core).
    /// DNN: DnnWorkflowRepository (Dapper/ADO.NET) — Phase 5.
    /// </summary>
    public interface IWorkflowRepository
    {
        // ── Envelope (draft + applied) ────────────────────────────────────────

        /// <summary>Load full envelope. Returns empty envelope if not set.</summary>
        WorkflowEnvelope GetEnvelope(int formId);

        /// <summary>Save draft into envelope (does NOT promote to applied).</summary>
        void SaveDraft(int formId, WorkflowDefinition draft);

        /// <summary>Promote current draft to applied.</summary>
        void ApplyDraft(int formId, string appliedBy = "system");

        // ── Legacy compatibility (engine still uses applied def) ──────────────

        /// <summary>Load the APPLIED workflow for runtime execution. Null if never applied.</summary>
        WorkflowDefinition GetByFormId(int formId);

        /// <summary>
        /// Save WorkflowDefinition directly (legacy / migration path).
        /// Wraps into envelope as both draft and applied.
        /// </summary>
        void Save(int formId, WorkflowDefinition definition);

        // ── Executions ────────────────────────────────────────────────────────

        /// <summary>Persist new execution (status=running). Returns executionId.</summary>
        string SaveExecution(WorkflowExecutionContext ctx);

        /// <summary>Update execution status + log after each node or completion.</summary>
        void UpdateExecution(WorkflowExecutionContext ctx);

        /// <summary>Load full execution context for status polling.</summary>
        WorkflowExecutionContext GetExecution(string executionId);

        /// <summary>List recent executions for a form (Admin Dashboard).</summary>
        List<WorkflowExecutionSummary> ListExecutions(
            int formId, int pageIndex = 0, int pageSize = 20);

        // ── Cases & Tasks (recovered from June-15 DLL — see April-revert incident) ──
        WorkflowCaseInstance GetCase(string caseId);

        WorkflowCaseInstance GetCaseByExecution(string executionId);

        void SaveCase(WorkflowCaseInstance workflowCase);

        WorkflowTaskInstance GetTask(string taskId);

        WorkflowTaskInstance GetActiveTask(string executionId, string nodeId);

        List<WorkflowTaskInstance> ListTasks(WorkflowTaskQuery query);

        void SaveTask(WorkflowTaskInstance task);

        void AddTaskAction(WorkflowTaskAction action);

        List<WorkflowTaskAction> ListTaskActions(string taskId);
    }

    /// <summary>Summary row for execution list — does not include full ContextJson.</summary>
    public class WorkflowExecutionSummary
    {
        public string    ExecutionId   { get; set; }
        public int       FormId        { get; set; }
        public int       SubmissionId  { get; set; }
        public string    Status        { get; set; }
        public string    CurrentNodeId { get; set; }
        public string    ErrorMessage  { get; set; }
        public DateTime  StartedAt     { get; set; }
        public DateTime? CompletedAt   { get; set; }
        public long      DurationMs    { get; set; }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IWorkflowEvaluator
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Pure logic evaluator — no side effects, no DB, no HTTP.
    /// Used server-side in WorkflowEngine and as reference for WorkflowNavigator.ts.
    /// All methods are synchronous.
    /// </summary>
    public interface IWorkflowEvaluator
    {
        bool EvaluateCondition(string conditionsJson, Dictionary<string, object> data);

        string ResolveExpression(string template, WorkflowExecutionContext ctx);

        /// <summary>Resolve a {{token}} template string against form data + variables.</summary>
        string ResolveTemplate(string template, WorkflowExecutionContext ctx);

        double Calculate(string operand1, CalcOperator op, string operand2,
            WorkflowExecutionContext ctx);

        WorkflowNavigationResult EvaluateNavigation(
            WorkflowDefinition definition,
            string currentNodeId,
            Dictionary<string, object> formData);

        /// <summary>
        /// Validate with specified mode:
        /// Draft = structural only (allows partial configs);
        /// Apply = full runtime safety (required fields, etc.)
        /// </summary>
        WorkflowValidationResult ValidateDefinition(
            WorkflowDefinition definition,
            ValidationMode mode = ValidationMode.Apply);
    }


    // ─────────────────────────────────────────────────────────────────────────
    //  IWorkflowNodeUiSchemaProvider
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Provides server-driven UI schema for workflow node setting panels.
    /// Phase A: schema/presets/capabilities come from C#, TS only renders.
    /// </summary>
    public interface IWorkflowNodeUiSchemaProvider
    {
        WorkflowNodeUiSchema GetSchema(string nodeType);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IWorkflowEmailSender
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>Abstraction for sending email in Workflow (reuses EmailNotificationService).</summary>


    public interface IWebhookWorkflowNodeUiService
    {
        WorkflowNodeUiSchema GetSchema();
        IEnumerable<WorkflowNodeUiPreset> GetPresets();
        WorkflowNodeUiCapabilities GetCapabilities();
    }

    public interface IEmailWorkflowNodeUiService
    {
        WorkflowNodeUiSchema GetSchema();
        IEnumerable<WorkflowNodeUiPreset> GetPresets();
        WorkflowNodeUiCapabilities GetCapabilities();
    }
    public interface IWorkflowEmailSender
    {
        Task SendAsync(string to, string cc, string subject, string body,
            string replyTo, CancellationToken ct);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  IConnectionRegistry
    //  Resolves named DB connections from server config.
    //  Connection strings NEVER come from frontend input.
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Returns an open or openable DbConnection by name.
    /// Implementations read connection strings from server-side config only.
    /// </summary>
    public interface IConnectionRegistry
    {
        /// <summary>
        /// Returns a DbConnection for the named connection string.
        /// Throws InvalidOperationException if name not found or connection fails.
        /// </summary>
        System.Data.Common.DbConnection GetConnection(string connectionName, string databaseType = null, string connectionString = null);
    }

    public interface IConnectionNameProvider
    {
        IEnumerable<string> GetConnectionNames();
    }

    public interface IDatabaseWorkflowMetadataService
    {
        List<WorkflowNodeUiOption> GetConnections();
        List<WorkflowNodeUiOption> GetTables(string connectionName, string databaseType = null, string connectionString = null);
        List<WorkflowNodeUiOption> GetColumns(string connectionName, string tableName, string databaseType = null, string connectionString = null);
        List<WorkflowNodeUiOption> GetProcedures(string connectionName, string databaseType = null, string connectionString = null);
        List<WorkflowNodeUiOption> GetProcedureParameters(string connectionName, string procedureName, string databaseType = null, string connectionString = null);
        string GetConnectionStringSample(string databaseType);
        DatabaseConnectionTestResult TestConnection(string connectionName, string databaseType = null, string connectionString = null);
    }
}
