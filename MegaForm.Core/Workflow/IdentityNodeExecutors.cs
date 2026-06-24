using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Workflow
{
    public class AddRoleNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowIdentityProvisioningService _provisioning;
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.AddRole; } }

        public AddRoleNodeExecutor(IWorkflowIdentityProvisioningService provisioning, IWorkflowEvaluator evaluator)
        {
            _provisioning = provisioning;
            _evaluator = evaluator;
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            return IdentityExecutorHelpers.ValidateRequired(node, "RoleName", "AddRole");
        }

        public async Task<WorkflowNodeResult> ExecuteAsync(WorkflowNode node, WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            var config = IdentityExecutorHelpers.ParseConfig<AddRoleNodeConfig>(node);
            var request = new WorkflowRoleProvisionRequest
            {
                PortalId = IdentityExecutorHelpers.ResolvePortalId(ctx),
                Actor = IdentityExecutorHelpers.BuildActor(ctx),
                RoleName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.RoleName, ctx),
                Description = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.Description, ctx),
                IsSystemRole = config.IsSystemRole
            };

            if (string.IsNullOrWhiteSpace(request.RoleName))
                return WorkflowNodeResult.Failed("AddRole: RoleName is required.");

            var result = await _provisioning.EnsureRoleAsync(request, ct);
            IdentityExecutorHelpers.SetVariable(ctx, config.ResultRoleNameVariable, result != null ? result.RoleName : request.RoleName);

            return WorkflowNodeResult.Success("handle::default", new
            {
                roleName = result != null ? result.RoleName : request.RoleName,
                created = result != null && result.Created,
                alreadyExisted = result != null && result.AlreadyExisted
            });
        }
    }

    public class AddUserNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowIdentityProvisioningService _provisioning;
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.AddUser; } }

        public AddUserNodeExecutor(IWorkflowIdentityProvisioningService provisioning, IWorkflowEvaluator evaluator)
        {
            _provisioning = provisioning;
            _evaluator = evaluator;
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = IdentityExecutorHelpers.TryParseConfig<AddUserNodeConfig>(node);
            if (config == null || (string.IsNullOrWhiteSpace(config.UserName) && string.IsNullOrWhiteSpace(config.Email)))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "UserName",
                    Message = "AddUser '" + IdentityExecutorHelpers.GetNodeLabel(node) + "': UserName or Email is required.",
                    Severity = "error"
                });
            }
            return result;
        }

        public async Task<WorkflowNodeResult> ExecuteAsync(WorkflowNode node, WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            var config = IdentityExecutorHelpers.ParseConfig<AddUserNodeConfig>(node);
            var request = new WorkflowUserProvisionRequest
            {
                PortalId = IdentityExecutorHelpers.ResolvePortalId(ctx),
                Actor = IdentityExecutorHelpers.BuildActor(ctx),
                UserName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.UserName, ctx),
                Email = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.Email, ctx),
                DisplayName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.DisplayName, ctx),
                FirstName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.FirstName, ctx),
                LastName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.LastName, ctx),
                Password = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.Password, ctx),
                ApproveUser = config.ApproveUser,
                UpdateIfExists = config.UpdateIfExists,
                GeneratePasswordIfEmpty = config.GeneratePasswordIfEmpty
            };

            if (string.IsNullOrWhiteSpace(request.UserName) && string.IsNullOrWhiteSpace(request.Email))
                return WorkflowNodeResult.Failed("AddUser: UserName or Email is required.");

            var result = await _provisioning.EnsureUserAsync(request, ct);
            if (result != null)
            {
                IdentityExecutorHelpers.SetVariable(ctx, config.ResultUserIdVariable, result.UserId.HasValue ? result.UserId.Value.ToString() : string.Empty);
                IdentityExecutorHelpers.SetVariable(ctx, config.ResultUserNameVariable, result.UserName);
                IdentityExecutorHelpers.SetVariable(ctx, config.ResultEmailVariable, result.Email);
                IdentityExecutorHelpers.SetVariable(ctx, config.ResultPasswordVariable, result.Password);
            }

            return WorkflowNodeResult.Success("handle::default", new
            {
                userId = result != null ? result.UserId : null,
                userName = result != null ? result.UserName : request.UserName,
                email = result != null ? result.Email : request.Email,
                created = result != null && result.Created,
                updated = result != null && result.Updated,
                alreadyExisted = result != null && result.AlreadyExisted
            });
        }
    }

    public class AddUserToRoleNodeExecutor : INodeExecutor
    {
        private readonly IWorkflowIdentityProvisioningService _provisioning;
        private readonly IWorkflowEvaluator _evaluator;

        public WorkflowNodeType NodeType { get { return WorkflowNodeType.AddUserToRole; } }

        public AddUserToRoleNodeExecutor(IWorkflowIdentityProvisioningService provisioning, IWorkflowEvaluator evaluator)
        {
            _provisioning = provisioning;
            _evaluator = evaluator;
        }

        public WorkflowValidationResult Validate(WorkflowNode node)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            var config = IdentityExecutorHelpers.TryParseConfig<AddUserToRoleNodeConfig>(node);
            if (config == null || string.IsNullOrWhiteSpace(config.UserIdentifier))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "UserIdentifier",
                    Message = "AddUserToRole '" + IdentityExecutorHelpers.GetNodeLabel(node) + "': UserIdentifier is required.",
                    Severity = "error"
                });
            }
            if (config == null || string.IsNullOrWhiteSpace(config.RoleName))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = "RoleName",
                    Message = "AddUserToRole '" + IdentityExecutorHelpers.GetNodeLabel(node) + "': RoleName is required.",
                    Severity = "error"
                });
            }
            return result;
        }

        public async Task<WorkflowNodeResult> ExecuteAsync(WorkflowNode node, WorkflowExecutionContext ctx, CancellationToken ct)
        {
            if (node != null && node.IsDisabled)
                return WorkflowNodeResult.Skipped("handle::default");

            var config = IdentityExecutorHelpers.ParseConfig<AddUserToRoleNodeConfig>(node);
            var request = new WorkflowUserRoleProvisionRequest
            {
                PortalId = IdentityExecutorHelpers.ResolvePortalId(ctx),
                Actor = IdentityExecutorHelpers.BuildActor(ctx),
                UserIdentifier = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.UserIdentifier, ctx),
                LookupMode = config.LookupMode,
                RoleName = IdentityExecutorHelpers.ResolveTemplate(_evaluator, config.RoleName, ctx),
                AutoCreateRole = config.AutoCreateRole
            };

            if (string.IsNullOrWhiteSpace(request.UserIdentifier))
                return WorkflowNodeResult.Failed("AddUserToRole: UserIdentifier is required.");
            if (string.IsNullOrWhiteSpace(request.RoleName))
                return WorkflowNodeResult.Failed("AddUserToRole: RoleName is required.");

            var result = await _provisioning.AddUserToRoleAsync(request, ct);
            IdentityExecutorHelpers.SetVariable(ctx, config.ResultMembershipVariable,
                result != null ? (result.UserName ?? string.Empty) + "|" + (result.RoleName ?? string.Empty) : string.Empty);

            return WorkflowNodeResult.Success("handle::default", new
            {
                userId = result != null ? result.UserId : null,
                roleId = result != null ? result.RoleId : null,
                userName = result != null ? result.UserName : string.Empty,
                roleName = result != null ? result.RoleName : request.RoleName,
                added = result != null && result.Added,
                alreadyInRole = result != null && result.AlreadyInRole
            });
        }
    }

    internal static class IdentityExecutorHelpers
    {
        public static T ParseConfig<T>(WorkflowNode node) where T : new()
        {
            if (node == null || node.Config == null || node.Config.Count == 0)
                return new T();

            var json = JsonConvert.SerializeObject(node.Config);
            var parsed = JsonConvert.DeserializeObject<T>(json);
            return parsed != null ? parsed : new T();
        }

        public static T TryParseConfig<T>(WorkflowNode node) where T : class, new()
        {
            try { return ParseConfig<T>(node); }
            catch { return null; }
        }

        public static WorkflowValidationResult ValidateRequired(WorkflowNode node, string field, string nodeType)
        {
            var result = new WorkflowValidationResult { IsValid = true };
            if (node == null || node.Config == null)
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node != null ? node.Id : null,
                    Field = field,
                    Message = nodeType + " '" + GetNodeLabel(node) + "': " + field + " is required.",
                    Severity = "error"
                });
                return result;
            }

            object value = null;
            node.Config.TryGetValue(field, out value);
            if (value == null || string.IsNullOrWhiteSpace(value.ToString()))
            {
                result.IsValid = false;
                result.Errors.Add(new WorkflowValidationError
                {
                    NodeId = node.Id,
                    Field = field,
                    Message = nodeType + " '" + GetNodeLabel(node) + "': " + field + " is required.",
                    Severity = "error"
                });
            }
            return result;
        }

        public static string ResolveTemplate(IWorkflowEvaluator evaluator, string value, WorkflowExecutionContext ctx)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;
            return evaluator != null ? evaluator.ResolveTemplate(value, ctx) : value;
        }

        public static void SetVariable(WorkflowExecutionContext ctx, string key, object value)
        {
            if (ctx == null || string.IsNullOrWhiteSpace(key))
                return;

            if (ctx.Variables == null)
                ctx.Variables = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            ctx.Variables[key] = value ?? string.Empty;
        }

        public static int ResolvePortalId(WorkflowExecutionContext ctx)
        {
            if (ctx == null || ctx.FormData == null)
                return 0;

            object raw = null;
            if (ctx.FormData.TryGetValue("__portalId", out raw) && raw != null)
            {
                int parsed;
                if (int.TryParse(raw.ToString(), out parsed))
                    return parsed;
            }

            if (ctx.Variables != null && ctx.Variables.TryGetValue("portalId", out raw) && raw != null)
            {
                int parsed;
                if (int.TryParse(raw.ToString(), out parsed))
                    return parsed;
            }

            return 0;
        }

        public static UserContext BuildActor(WorkflowExecutionContext ctx)
        {
            var actor = new UserContext
            {
                UserName = "workflow",
                DisplayName = "Workflow",
                Email = string.Empty,
                Roles = new List<string>()
            };

            if (ctx == null || ctx.FormData == null)
                return actor;

            object raw = null;
            if (ctx.FormData.TryGetValue("__actorUserId", out raw) && raw != null)
            {
                int parsed;
                if (int.TryParse(raw.ToString(), out parsed))
                {
                    actor.UserId = parsed;
                    actor.IsAuthenticated = parsed > 0;
                }
            }
            if (ctx.FormData.TryGetValue("__actorUserName", out raw) && raw != null)
                actor.UserName = raw.ToString();
            if (ctx.FormData.TryGetValue("__actorDisplayName", out raw) && raw != null)
                actor.DisplayName = raw.ToString();
            if (ctx.FormData.TryGetValue("__actorEmail", out raw) && raw != null)
                actor.Email = raw.ToString();

            return actor;
        }

        public static string GetNodeLabel(WorkflowNode node)
        {
            return node != null ? (node.Label ?? node.Id ?? "node") : "node";
        }
    }
}
