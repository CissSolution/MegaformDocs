using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Logging;

namespace MegaForm.Premium.AspNetCore.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/MegaForm/Workflow")]
    public class WorkflowController : ControllerBase
    {
        private readonly IWorkflowRepository  _repo;
        private readonly IWorkflowEvaluator   _evaluator;
        private readonly IWorkflowEngine      _engine;
        private readonly ILogger<WorkflowController> _log;
        private readonly IWorkflowNodeUiSchemaProvider _nodeUiSchemaProvider;
        private readonly IDatabaseWorkflowMetadataService _dbMetadata;

        public WorkflowController(
            IWorkflowRepository repo, IWorkflowEvaluator evaluator,
            IWorkflowEngine engine, IWorkflowNodeUiSchemaProvider nodeUiSchemaProvider, IDatabaseWorkflowMetadataService dbMetadata, ILogger<WorkflowController> log)
        {
            _repo = repo; _evaluator = evaluator; _engine = engine; _nodeUiSchemaProvider = nodeUiSchemaProvider; _dbMetadata = dbMetadata; _log = log;
        }

        // ─── GET /Get?formId=N ────────────────────────────────────────────────

        [HttpGet("Get")]
        public IActionResult Get([FromQuery] int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId is required." });

            var env = _repo.GetEnvelope(formId);
            return Ok(new
            {
                formId,
                hasWorkflow     = env.DraftWorkflow != null || env.AppliedWorkflow != null,
                workflow        = env.DraftWorkflow ?? env.AppliedWorkflow,   // editor loads draft
                appliedWorkflow = env.AppliedWorkflow,
                draftUpdatedAt  = env.DraftUpdatedAt,
                appliedAt       = env.AppliedAt,
                appliedBy       = env.AppliedBy,
                draftVersion    = env.DraftVersion,
                appliedVersion  = env.AppliedVersion,
            });
        }


        [HttpGet("NodeSchema")]
        public IActionResult NodeSchema([FromQuery] string nodeType)
        {
            if (string.IsNullOrWhiteSpace(nodeType)) return BadRequest(new { error = "nodeType is required." });
            var schema = _nodeUiSchemaProvider.GetSchema(nodeType);
            if (schema == null) return NotFound(new { error = "Schema not found for nodeType='" + nodeType + "'." });
            return Ok(schema);
        }



        [HttpGet("Webhook/Presets")]
        public IActionResult WebhookPresets()
        {
            var schema = _nodeUiSchemaProvider.GetSchema("Webhook");
            return Ok((schema != null && schema.Presets != null) ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpGet("Webhook/Capabilities")]
        public IActionResult WebhookCapabilities()
        {
            var schema = _nodeUiSchemaProvider.GetSchema("Webhook");
            return Ok((schema != null && schema.Capabilities != null) ? schema.Capabilities : new WorkflowNodeUiCapabilities());
        }

        [HttpGet("Email/Presets")]
        public IActionResult EmailPresets()
        {
            var schema = _nodeUiSchemaProvider.GetSchema("SendEmail");
            return Ok((schema != null && schema.Presets != null) ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpGet("Email/Capabilities")]
        public IActionResult EmailCapabilities()
        {
            var schema = _nodeUiSchemaProvider.GetSchema("SendEmail");
            return Ok((schema != null && schema.Capabilities != null) ? schema.Capabilities : new WorkflowNodeUiCapabilities());
        }

        [HttpGet("Database/Connections")]
        public IActionResult DatabaseConnections() { return Ok(_dbMetadata.GetConnections()); }

        [HttpGet("Database/ConnectionStringSample")]
        public IActionResult DatabaseConnectionStringSample([FromQuery] string databaseType) { return Ok(new { databaseType = databaseType, sample = _dbMetadata.GetConnectionStringSample(databaseType) }); }

        [HttpPost("Database/TestConnection")]
        public IActionResult DatabaseTestConnection([FromBody] DatabaseConnectionTestRequest req)
        {
            req = req ?? new DatabaseConnectionTestRequest();
            var external = string.Equals(req.ConnectionMode, "External", StringComparison.OrdinalIgnoreCase);
            var result = _dbMetadata.TestConnection(external ? null : req.ConnectionName, external ? req.DatabaseType : null, external ? req.ConnectionString : null);
            return Ok(result);
        }

        [HttpGet("Database/Tables")]
        public IActionResult DatabaseTables([FromQuery] string connectionName, [FromQuery] string databaseType, [FromQuery] string connectionString) { return Ok(_dbMetadata.GetTables(connectionName, databaseType, connectionString)); }

        [HttpGet("Database/Columns")]
        public IActionResult DatabaseColumns([FromQuery] string connectionName, [FromQuery] string tableName, [FromQuery] string databaseType, [FromQuery] string connectionString) { return Ok(_dbMetadata.GetColumns(connectionName, tableName, databaseType, connectionString)); }

        [HttpGet("Database/Procedures")]
        public IActionResult DatabaseProcedures([FromQuery] string connectionName, [FromQuery] string databaseType, [FromQuery] string connectionString) { return Ok(_dbMetadata.GetProcedures(connectionName, databaseType, connectionString)); }

        [HttpGet("Database/ProcedureParameters")]
        public IActionResult DatabaseProcedureParameters([FromQuery] string connectionName, [FromQuery] string procedureName, [FromQuery] string databaseType, [FromQuery] string connectionString) { return Ok(_dbMetadata.GetProcedureParameters(connectionName, procedureName, databaseType, connectionString)); }

        // ─── POST /SaveDraft ──────────────────────────────────────────────────

        [HttpPost("SaveDraft")]
        public IActionResult SaveDraft([FromBody] WorkflowSaveRequest req)
        {
            if (!ModelState.IsValid) return UnprocessableEntity(ModelStateIssues("save-draft"));
            if (req == null || req.FormId <= 0)
                return BadRequest(new { error = "formId is required." });
            if (req.Workflow == null)
                return BadRequest(new { error = "workflow is required." });

            // Draft mode: structural checks only (allow incomplete node configs)
            var validation = _evaluator.ValidateDefinition(req.Workflow, ValidationMode.Draft);
            var issues = validation.Errors
                .Select(e => WorkflowIssue.FromValidationError(e, "save-draft"))
                .ToList();

            // Block save only on structural errors (unsupported types, bad edges)
            var blockingErrors = issues.Where(i => i.Severity == "error").ToList();
            if (blockingErrors.Any())
                return UnprocessableEntity(BuildResult(false, "draft-blocked", req.Workflow, null, issues));

            try
            {
                req.Workflow.FormId    = req.FormId;
                req.Workflow.UpdatedAt = DateTime.UtcNow;
                _repo.SaveDraft(req.FormId, req.Workflow);

                var env = _repo.GetEnvelope(req.FormId);
                return Ok(BuildResult(true, "draft-saved", req.Workflow, env, issues));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "SaveDraft failed for formId={FormId}", req.FormId);
                return StatusCode(500, new { error = "SaveDraft failed: " + ex.Message });
            }
        }

        // ─── POST /Validate ───────────────────────────────────────────────────

        [HttpPost("Validate")]
        public IActionResult Validate([FromBody] WorkflowSaveRequest req)
        {
            if (!ModelState.IsValid) return UnprocessableEntity(ModelStateIssues("validate"));
            if (req == null || req.Workflow == null)
                return BadRequest(new { error = "workflow is required." });

            var validation = _evaluator.ValidateDefinition(req.Workflow, ValidationMode.Apply);
            var issues = validation.Errors
                .Select(e => WorkflowIssue.FromValidationError(e, "validate"))
                .ToList();

            var env = req.FormId > 0 ? _repo.GetEnvelope(req.FormId) : null;
            bool hasErrors = issues.Any(i => i.Severity == "error");
            return Ok(BuildResult(!hasErrors, "validated", req.Workflow, env, issues));
        }

        // ─── POST /Apply ──────────────────────────────────────────────────────

        [HttpPost("Apply")]
        public IActionResult Apply([FromBody] WorkflowSaveRequest req)
        {
            if (!ModelState.IsValid) return UnprocessableEntity(ModelStateIssues("apply"));
            if (req == null || req.FormId <= 0)
                return BadRequest(new { error = "formId is required." });
            if (req.Workflow == null)
                return BadRequest(new { error = "workflow is required." });

            // Apply mode: full runtime safety checks
            var validation = _evaluator.ValidateDefinition(req.Workflow, ValidationMode.Apply);
            var issues = validation.Errors
                .Select(e => WorkflowIssue.FromValidationError(e, "apply"))
                .ToList();

            bool hasErrors = issues.Any(i => i.Severity == "error");
            if (hasErrors)
                return UnprocessableEntity(BuildResult(false, "apply-blocked", req.Workflow, null, issues));

            try
            {
                req.Workflow.FormId    = req.FormId;
                req.Workflow.UpdatedAt = DateTime.UtcNow;
                // Save draft first, then apply
                _repo.SaveDraft(req.FormId, req.Workflow);
                _repo.ApplyDraft(req.FormId, "user");

                var env = _repo.GetEnvelope(req.FormId);
                return Ok(BuildResult(true, "applied", req.Workflow, env, issues));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Apply failed for formId={FormId}", req.FormId);
                return StatusCode(500, new { error = "Apply failed: " + ex.Message });
            }
        }

        // ─── POST /Save (legacy) ──────────────────────────────────────────────

        [HttpPost("Save")]
        public IActionResult Save([FromBody] WorkflowSaveRequest req)
        {
            // Legacy: same as Apply for backward compat with old frontend
            return Apply(req);
        }

        // ─── POST /TestRun ────────────────────────────────────────────────────

        [HttpPost("TestRun")]
        public async Task<IActionResult> TestRun(
            [FromBody] WorkflowTestRunRequest req, CancellationToken ct)
        {
            if (req == null || req.FormId <= 0)
                return BadRequest(new { error = "formId is required." });

            req.FormData = req.FormData ?? new Dictionary<string, object>();
            try
            {
                var ctx = await _engine.ExecuteAsync(req.FormId, 0, req.FormData, ct);
                return Ok(new
                {
                    executionId  = ctx.ExecutionId,
                    status       = ctx.Status.ToString().ToLower(),
                    log          = ctx.Log,
                    variables    = ctx.Variables,
                    nodeResults  = ctx.NodeResults,
                    errorMessage = ctx.ErrorMessage,
                    durationMs   = ctx.CompletedAt.HasValue
                        ? (long)(ctx.CompletedAt.Value - ctx.StartedAt).TotalMilliseconds : 0,
                });
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "TestRun failed formId={FormId}", req.FormId);
                return StatusCode(500, new { error = "Test run failed: " + ex.Message });
            }
        }

        // ─── GET /Execution/{id} ──────────────────────────────────────────────

        [HttpGet("Execution/{id}")]
        public async Task<IActionResult> GetExecution(string id)
        {
            if (string.IsNullOrEmpty(id)) return BadRequest(new { error = "id required." });
            var ctx = await _engine.GetExecutionStatusAsync(id);
            if (ctx == null) return NotFound(new { error = "Execution not found." });
            return Ok(new { executionId = ctx.ExecutionId, status = ctx.Status.ToString().ToLower(),
                currentNodeId = ctx.CurrentNodeId, log = ctx.Log, variables = ctx.Variables,
                errorMessage = ctx.ErrorMessage, startedAt = ctx.StartedAt, completedAt = ctx.CompletedAt });
        }

        [HttpGet("Executions")]
        public IActionResult ListExecutions([FromQuery] int formId,
            [FromQuery] int pageIndex = 0, [FromQuery] int pageSize = 20)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required." });
            return Ok(new { formId, pageIndex, pageSize, items = _repo.ListExecutions(formId, pageIndex, pageSize) });
        }

        [HttpPost("Execution/{id}/Cancel")]
        public async Task<IActionResult> CancelExecution(string id)
        {
            if (string.IsNullOrEmpty(id)) return BadRequest(new { error = "id required." });
            await _engine.CancelExecutionAsync(id);
            return Ok(new { executionId = id, cancelled = true });
        }

        [HttpPost("Navigate")]
        public async Task<IActionResult> Navigate(
            [FromBody] WorkflowNavigateRequest req, CancellationToken ct)
        {
            if (req == null || req.FormId <= 0) return BadRequest(new { error = "formId required." });
            var result = await _engine.EvaluateNavigationAsync(req.FormId, req.CurrentNodeId,
                req.FormData ?? new Dictionary<string, object>(), ct);
            return Ok(result);
        }

        // ─── Private helpers ─────────────────────────────────────────────────

        private WorkflowSaveResult BuildResult(
            bool success, string status,
            WorkflowDefinition workflow, WorkflowEnvelope env,
            List<WorkflowIssue> issues)
        {
            return new WorkflowSaveResult
            {
                Success          = success,
                Status           = status,
                WorkflowVersion  = workflow?.Version,
                ActiveVersion    = env?.AppliedVersion,
                DraftUpdatedAt   = env?.DraftUpdatedAt,
                AppliedAt        = env?.AppliedAt,
                AppliedBy        = env?.AppliedBy,
                Issues           = issues ?? new List<WorkflowIssue>(),
            };
        }

        private object ModelStateIssues(string source)
        {
            var issues = ModelState
                .Where(kv => kv.Value.ValidationState == ModelValidationState.Invalid)
                .SelectMany(kv => kv.Value.Errors.Select(e =>
                {
                    var msg = e.ErrorMessage.Length > 0 ? e.ErrorMessage : (e.Exception?.Message ?? "Invalid value");
                    if (msg.Contains("Error converting value") && msg.Contains("WorkflowNodeType"))
                    {
                        var m = System.Text.RegularExpressions.Regex.Match(msg, @"Error converting value ""([^""]+)""");
                        if (m.Success) msg = "Node type '" + m.Groups[1].Value + "' is not supported.";
                    }
                    return new WorkflowIssue
                    {
                        Id = System.Guid.NewGuid().ToString("N").Substring(0, 8),
                        Severity = "error", Source = source,
                        Field = kv.Key, Message = msg,
                    };
                })).ToList();

            return new { success = false, status = "binding-error", issues };
        }
    }

    public class WorkflowSaveRequest
    {
        public int                FormId   { get; set; }
        public WorkflowDefinition Workflow { get; set; }
    }

    public class WorkflowTestRunRequest
    {
        public int                        FormId   { get; set; }
        public Dictionary<string, object> FormData { get; set; }
        public bool DryRun { get; set; } = true;
    }

    public class WorkflowNavigateRequest
    {
        public int                        FormId        { get; set; }
        public string                     CurrentNodeId { get; set; }
        public Dictionary<string, object> FormData      { get; set; }
    }
}
