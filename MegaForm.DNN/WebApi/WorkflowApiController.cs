using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Workflow;
using MegaForm.Core.Services;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    [DnnAuthorize]
    public class WorkflowController : DnnApiController
    {
        private static string ConnStr =>
            DotNetNuke.Common.Utilities.Config.GetConnectionString();

        [HttpGet]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage Get(int formId = 0)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId is required." });

            try
            {
                var env = ReadEnvelope(formId);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    formId,
                    hasWorkflow = env.DraftWorkflow != null || env.AppliedWorkflow != null,
                    workflow = env.DraftWorkflow ?? env.AppliedWorkflow,
                    appliedWorkflow = env.AppliedWorkflow,
                    draftUpdatedAt = env.DraftUpdatedAt,
                    appliedAt = env.AppliedAt,
                    appliedBy = env.AppliedBy,
                    draftVersion = env.DraftVersion,
                    appliedVersion = env.AppliedVersion
                });
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = ex.Message, detail = ex.ToString() });
            }
        }


        [HttpGet]
        [ActionName("NodeSchema")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage NodeSchema(string nodeType = null)
        {
            if (string.IsNullOrWhiteSpace(nodeType))
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "nodeType is required." });

            var schema = new WorkflowNodeUiSchemaProvider().GetSchema(nodeType);
            if (schema == null)
                return Request.CreateResponse(HttpStatusCode.NotFound, new { error = "Schema not found for nodeType='" + nodeType + "'." });

            return Request.CreateResponse(HttpStatusCode.OK, schema);
        }

        [HttpGet]
        [ActionName("WebhookPresets")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage WebhookPresets()
        {
            var schema = new WorkflowNodeUiSchemaProvider().GetSchema("Webhook");
            return Request.CreateResponse(HttpStatusCode.OK, schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpGet]
        [ActionName("EmailPresets")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage EmailPresets()
        {
            var schema = new WorkflowNodeUiSchemaProvider().GetSchema("SendEmail");
            return Request.CreateResponse(HttpStatusCode.OK, schema != null && schema.Presets != null ? schema.Presets : new List<WorkflowNodeUiPreset>());
        }

        [HttpPost]
        [ActionName("SaveDraft")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage SaveDraft([FromBody] JObject body)
        {
            return SaveDraftInternal(body, "save-draft");
        }

        [HttpPost]
        [ActionName("Validate")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage ValidateWorkflow([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            var workflowToken = body?["workflow"];
            if (workflowToken == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(workflowToken.ToString(Formatting.None)); }
            catch (Exception ex)
            {
                return Request.CreateResponse((HttpStatusCode)422,
                    BuildResult(false, "validated", null, null, new List<WorkflowIssue> {
                        new WorkflowIssue { Id = "parse", Severity = "error", Source = "validate", Message = "Invalid workflow JSON: " + ex.Message }
                    }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "validate")).ToList();
            WorkflowEnvelope env = formId > 0 ? ReadEnvelope(formId) : null;
            bool hasErrors = issues.Any(i => i.Severity == "error");
            return Request.CreateResponse(HttpStatusCode.OK,
                BuildResult(!hasErrors, "validated", def, env, issues));
        }

        [HttpPost]
        [ActionName("Apply")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage Apply([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            var workflowToken = body?["workflow"];

            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId is required." });
            if (workflowToken == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(workflowToken.ToString(Formatting.None)); }
            catch (Exception ex)
            {
                return Request.CreateResponse((HttpStatusCode)422,
                    BuildResult(false, "apply-blocked", null, null, new List<WorkflowIssue> {
                        new WorkflowIssue { Id = "parse", Severity = "error", Source = "apply", Message = "Invalid workflow JSON: " + ex.Message }
                    }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Apply);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, "apply")).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return Request.CreateResponse((HttpStatusCode)422,
                    BuildResult(false, "apply-blocked", def, null, issues));

            try
            {
                SaveDraftEnvelope(formId, def);
                ApplyDraftEnvelope(formId, "user");
                var env = ReadEnvelope(formId);
                return Request.CreateResponse(HttpStatusCode.OK,
                    BuildResult(true, "applied", def, env, issues));
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = "Apply failed: " + ex.Message, detail = ex.ToString() });
            }
        }

        [HttpPost]
        [ActionName("Save")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            return Apply(body);
        }

        [HttpPost]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage TestRun([FromBody] JObject body)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId is required." });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                executionId  = Guid.NewGuid().ToString("N"),
                status       = "completed",
                log          = new object[0],
                variables    = new object[0],
                errorMessage = (string)null,
                durationMs   = 0
            });
        }

        private HttpResponseMessage SaveDraftInternal(JObject body, string source)
        {
            int formId = body?["formId"]?.ToObject<int>() ?? 0;
            var workflowToken = body?["workflow"];

            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "formId is required." });
            if (workflowToken == null)
                return Request.CreateResponse(HttpStatusCode.BadRequest,
                    new { error = "workflow is required." });

            WorkflowDefinition def;
            try { def = JsonConvert.DeserializeObject<WorkflowDefinition>(workflowToken.ToString(Formatting.None)); }
            catch (Exception ex)
            {
                return Request.CreateResponse((HttpStatusCode)422,
                    BuildResult(false, "draft-blocked", null, null, new List<WorkflowIssue> {
                        new WorkflowIssue { Id = "parse", Severity = "error", Source = source, Message = "Invalid workflow JSON: " + ex.Message }
                    }));
            }

            var validation = new WorkflowEvaluator().ValidateDefinition(def, ValidationMode.Draft);
            var issues = validation.Errors.Select(e => WorkflowIssue.FromValidationError(e, source)).ToList();
            if (issues.Any(i => i.Severity == "error"))
                return Request.CreateResponse((HttpStatusCode)422,
                    BuildResult(false, "draft-blocked", def, null, issues));

            try
            {
                SaveDraftEnvelope(formId, def);
                var env = ReadEnvelope(formId);
                return Request.CreateResponse(HttpStatusCode.OK,
                    BuildResult(true, "draft-saved", def, env, issues));
            }
            catch (Exception ex)
            {
                return Request.CreateResponse(HttpStatusCode.InternalServerError,
                    new { error = "SaveDraft failed: " + ex.Message, detail = ex.ToString() });
            }
        }

        private static WorkflowSaveResult BuildResult(bool success, string status,
            WorkflowDefinition def, WorkflowEnvelope env, List<WorkflowIssue> issues)
        {
            return new WorkflowSaveResult
            {
                Success = success,
                Status = status,
                WorkflowVersion = env != null ? env.DraftVersion : (def != null ? def.Version : null),
                ActiveVersion = env != null ? env.AppliedVersion : null,
                DraftUpdatedAt = env != null ? env.DraftUpdatedAt : (DateTime?)null,
                AppliedAt = env != null ? env.AppliedAt : (DateTime?)null,
                AppliedBy = env != null ? env.AppliedBy : null,
                Issues = issues ?? new List<WorkflowIssue>()
            };
        }

        private static WorkflowEnvelope ReadEnvelope(int formId)
        {
            string json = ReadWorkflowJson(formId);
            return WorkflowEnvelope.ParseOrMigrate(json);
        }

        private static void SaveDraftEnvelope(int formId, WorkflowDefinition draft)
        {
            var env = ReadEnvelope(formId);
            env.DraftWorkflow = draft;
            env.DraftUpdatedAt = DateTime.UtcNow;
            env.DraftVersion = NextDraftVersion(env.AppliedVersion, env.DraftVersion);
            if (env.AppliedWorkflow == null)
            {
                env.AppliedWorkflow = draft;
                env.AppliedAt = draft.UpdatedAt != default(DateTime) ? draft.UpdatedAt : DateTime.UtcNow;
                env.AppliedBy = string.IsNullOrWhiteSpace(env.AppliedBy) ? "migrated" : env.AppliedBy;
                env.AppliedVersion = string.IsNullOrWhiteSpace(env.AppliedVersion)
                    ? StripDraftSuffix(env.DraftVersion)
                    : env.AppliedVersion;
            }
            WriteWorkflowJson(formId, JsonConvert.SerializeObject(env));
        }

        private static void ApplyDraftEnvelope(int formId, string appliedBy)
        {
            var env = ReadEnvelope(formId);
            if (env.DraftWorkflow == null) return;
            env.AppliedWorkflow = env.DraftWorkflow;
            env.AppliedAt = DateTime.UtcNow;
            env.AppliedBy = string.IsNullOrWhiteSpace(appliedBy) ? "system" : appliedBy;
            env.AppliedVersion = StripDraftSuffix(env.DraftVersion) ?? "1.0.0";
            WriteWorkflowJson(formId, JsonConvert.SerializeObject(env));
        }

        private static string NextDraftVersion(string appliedVersion, string currentDraftVersion)
        {
            var baseVersion = StripDraftSuffix(currentDraftVersion) ?? StripDraftSuffix(appliedVersion) ?? "1.0.0";
            return baseVersion + "-draft";
        }

        private static string StripDraftSuffix(string version)
        {
            if (string.IsNullOrWhiteSpace(version)) return null;
            return version.EndsWith("-draft", StringComparison.OrdinalIgnoreCase)
                ? version.Substring(0, version.Length - 6)
                : version;
        }

        private static string ReadWorkflowJson(int formId)
        {
            using (var conn = new System.Data.SqlClient.SqlConnection(ConnStr))
            {
                conn.Open();
                EnsureColumn(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT WorkflowJson FROM [dbo].[MF_Forms] WHERE FormId=@Id";
                    cmd.Parameters.AddWithValue("@Id", formId);
                    var val = cmd.ExecuteScalar();
                    return (val == null || val == DBNull.Value) ? null : val.ToString();
                }
            }
        }

        private static void WriteWorkflowJson(int formId, string json)
        {
            using (var conn = new System.Data.SqlClient.SqlConnection(ConnStr))
            {
                conn.Open();
                EnsureColumn(conn);
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "UPDATE [dbo].[MF_Forms] SET WorkflowJson=@Json WHERE FormId=@Id";
                    cmd.Parameters.AddWithValue("@Json", (object)json ?? DBNull.Value);
                    cmd.Parameters.AddWithValue("@Id", formId);
                    int rows = cmd.ExecuteNonQuery();
                    if (rows == 0)
                        throw new Exception("Form not found: " + formId);
                }
            }
        }

        private static bool _columnChecked = false;
        private static readonly object _columnLock = new object();

        private static void EnsureColumn(System.Data.SqlClient.SqlConnection conn)
        {
            if (_columnChecked) return;
            lock (_columnLock)
            {
                if (_columnChecked) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "SELECT COUNT(1) FROM sys.columns " +
                        "WHERE object_id = OBJECT_ID(N'dbo.MF_Forms') AND name = N'WorkflowJson'";
                    int exists = (int)cmd.ExecuteScalar();
                    if (exists == 0)
                    {
                        cmd.CommandText =
                            "ALTER TABLE [dbo].[MF_Forms] ADD WorkflowJson NVARCHAR(MAX) NULL";
                        cmd.ExecuteNonQuery();
                    }
                }
                _columnChecked = true;
            }
        }
    }
}
