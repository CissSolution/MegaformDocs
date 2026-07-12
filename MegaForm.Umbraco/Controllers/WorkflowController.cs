using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using MegaForm.Umbraco.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Umbraco.Cms.Web.Common.Authorization;

namespace MegaForm.Umbraco.Controllers
{
    /// <summary>
    /// Umbraco parity port of the MegaForm workflow task runtime endpoints.
    /// Routes: /umbraco/MegaForm/MegaFormApi/Workflow/...
    /// </summary>
    [ApiController]
    [Route("/umbraco/MegaForm/MegaFormApi/[controller]")]
    [Authorize(Policy = "MegaFormBackOffice")]
    public class WorkflowController : ControllerBase
    {
        private readonly WorkflowTaskService _workflowTasks;
        private readonly IWorkflowRepository _workflowRepo;
        private readonly IFormRepository _formRepo;
        private readonly ISubmissionRepository _subRepo;
        private readonly IWorkflowIdentityProvisioningService _provisioning;
        private readonly MegaFormDbContext _db;
        private readonly IPlatformContext _ctx;

        public WorkflowController(
            WorkflowTaskService workflowTasks,
            IWorkflowRepository workflowRepo,
            IFormRepository formRepo,
            ISubmissionRepository subRepo,
            IWorkflowIdentityProvisioningService provisioning,
            MegaFormDbContext db,
            IPlatformContext ctx)
        {
            _workflowTasks = workflowTasks;
            _workflowRepo = workflowRepo;
            _formRepo = formRepo;
            _subRepo = subRepo;
            _provisioning = provisioning;
            _db = db;
            _ctx = ctx;
        }

        [HttpGet("Inbox")]
        public IActionResult Inbox(int pageIndex = 0, int pageSize = 20)
        {
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var inbox = _workflowTasks.GetInbox(actor, pageIndex, pageSize);
                return Ok(new
                {
                    pageIndex,
                    pageSize,
                    myTasks = inbox.MyTasks,
                    roleQueue = inbox.RoleQueue,
                    counts = new { myTasks = inbox.MyTasks.Count, roleQueue = inbox.RoleQueue.Count },
                    generatedAt = inbox.GeneratedAt
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("MyInbox")]
        public IActionResult MyInbox(int recentCompleted = 25)
        {
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var board = _workflowTasks.GetWorkboard(actor, recentCompleted);

                var formIds = board.Incoming
                    .Concat(board.InProgress)
                    .Concat(board.Completed)
                    .Select(t => t.FormId)
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList();

                var forms = new Dictionary<string, object>();
                foreach (var formId in formIds)
                {
                    var form = _formRepo.GetForm(formId);
                    forms[formId.ToString()] = new
                    {
                        formId,
                        title = form != null && !string.IsNullOrWhiteSpace(form.Title) ? form.Title : ("Form #" + formId)
                    };
                }

                // [Submitter fix 2026-07-12] Twin of the Oqtane/Web enrichment: the
                // submitter comes from the workflow case (GetOrCreateCase now records
                // the real actor name; legacy numeric-id cases are skipped — they keep
                // the old "Unknown", no regression).
                var submitters = new Dictionary<string, object>();
                var caseGroups = board.Incoming
                    .Concat(board.InProgress)
                    .Concat(board.Completed)
                    .Where(t => t.SubmissionId > 0 && !string.IsNullOrWhiteSpace(t.CaseId))
                    .GroupBy(t => t.SubmissionId);
                foreach (var group in caseGroups)
                {
                    try
                    {
                        var wfCase = _workflowRepo.GetCase(group.First().CaseId);
                        var name = wfCase != null ? (wfCase.StartedByUserName ?? string.Empty).Trim() : string.Empty;
                        int numeric;
                        if (name.Length == 0 || int.TryParse(name, out numeric)) continue;
                        submitters[group.Key.ToString()] = new { userName = name, displayName = name };
                    }
                    catch { /* one bad case must not blank the board */ }
                }

                return Ok(new
                {
                    user = new
                    {
                        userId = actor.UserId,
                        userName = actor.UserName ?? string.Empty,
                        displayName = !string.IsNullOrWhiteSpace(actor.DisplayName) ? actor.DisplayName : (actor.UserName ?? string.Empty),
                        isAdmin = actor.IsAdmin || actor.IsSuperUser
                    },
                    kpis = new
                    {
                        incoming = board.Incoming.Count,
                        inProgress = board.InProgress.Count,
                        completed = board.Completed.Count,
                        overdue = board.OverdueCount
                    },
                    incoming = board.Incoming,
                    inProgress = board.InProgress,
                    completed = board.Completed,
                    forms,
                    submitters,
                    generatedAt = board.GeneratedAt
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("Tasks/Get")]
        public IActionResult GetTask(string taskId = null)
        {
            taskId = taskId ?? Request.Query["id"].FirstOrDefault();
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.GetTask(taskId, actor);
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/Claim")]
        public IActionResult ClaimTask([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.ClaimTaskAsync(
                        (string)body["taskId"],
                        actor,
                        (string)body["comment"],
                        CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/Approve")]
        public IActionResult ApproveTask([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.ApproveTaskAsync(
                        (string)body["taskId"],
                        actor,
                        (string)body["comment"],
                        body["data"]?.ToObject<Dictionary<string, object>>(),
                        CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/Reject")]
        public IActionResult RejectTask([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.RejectTaskAsync(
                        (string)body["taskId"],
                        actor,
                        (string)body["comment"],
                        body["data"]?.ToObject<Dictionary<string, object>>(),
                        CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/Forward")]
        public IActionResult ForwardTask([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.ForwardTaskAsync(
                        (string)body["taskId"],
                        actor,
                        (string)body["targetUser"],
                        (string)body["comment"],
                        CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/SendSubmission")]
        public IActionResult SendSubmission([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                int formId = body["formId"]?.Value<int>() ?? 0;
                int submissionId = body["submissionId"]?.Value<int>() ?? 0;
                string targetUser = body["targetUser"]?.Value<string>();
                string title = body["title"]?.Value<string>();
                string comment = body["comment"]?.Value<string>();
                if (string.IsNullOrWhiteSpace(targetUser)) return BadRequest(new { error = "targetUser is required" });
                var task = _workflowTasks.CreateAdHocReviewTask(formId, submissionId, targetUser, title, comment, actor);
                return Ok(new { ok = true, taskId = task.TaskId, assignedTo = task.AssignedUserName, formId, submissionId });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Tasks/Comment")]
        public IActionResult CommentTask([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.CommentTaskAsync(
                        (string)body["taskId"],
                        actor,
                        (string)body["comment"],
                        CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return Ok(BuildTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("CanvasView")]
        public IActionResult CanvasView(int formId)
        {
            if (formId <= 0) return BadRequest(new { error = "formId required" });
            var form = _formRepo.GetForm(formId);
            if (form == null) return NotFound(new { error = "form not found" });

            var def = _workflowRepo.GetByFormId(formId);
            var nodes = new List<object>();
            var pendingByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var claimedByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var completedByNode = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            var tasks = _db.WorkflowTasks.Where(t => t.FormId == formId).ToList();
            foreach (var t in tasks)
            {
                var key = t.NodeId ?? string.Empty;
                var status = ((WorkflowTaskStatus)t.Status).ToString().ToLowerInvariant();
                if (status == "pending") pendingByNode[key] = (pendingByNode.ContainsKey(key) ? pendingByNode[key] : 0) + 1;
                else if (status == "claimed") claimedByNode[key] = (claimedByNode.ContainsKey(key) ? claimedByNode[key] : 0) + 1;
                else if (status == "completed") completedByNode[key] = (completedByNode.ContainsKey(key) ? completedByNode[key] : 0) + 1;
            }

            if (def != null)
            {
                foreach (var n in def.Nodes ?? new List<WorkflowNode>())
                {
                    var p = pendingByNode.TryGetValue(n.Id, out var pc) ? pc : 0;
                    var c = claimedByNode.TryGetValue(n.Id, out var cc) ? cc : 0;
                    var d = completedByNode.TryGetValue(n.Id, out var dc) ? dc : 0;
                    nodes.Add(new
                    {
                        id = n.Id,
                        type = n.Type.ToString(),
                        label = n.Label,
                        position = n.Position,
                        zoneType = n.ZoneType.ToString(),
                        config = n.Config,
                        isDisabled = n.IsDisabled,
                        runtimeStats = new { pendingCount = p, claimedCount = c, completedCount = d }
                    });
                }
            }

            var pendingSubmissions = tasks
                .Where(t => t.Status == (int)WorkflowTaskStatus.Pending
                         || t.Status == (int)WorkflowTaskStatus.Claimed)
                .OrderByDescending(t => t.CreatedAt)
                .Take(50)
                .Select(t => new
                {
                    taskId = t.TaskId,
                    submissionId = t.SubmissionId,
                    nodeId = t.NodeId,
                    nodeLabel = t.NodeLabel,
                    status = t.Status,
                    candidateRoles = SafeJsonArray(t.CandidateRolesJson),
                    candidateUsers = SafeJsonArray(t.CandidateUsersJson),
                    assignedUserName = t.AssignedUserName,
                    assignedDisplayName = t.AssignedDisplayName,
                    createdAt = t.CreatedAt,
                    dueAt = t.DueAt
                })
                .ToList();

            return Ok(new
            {
                formId = formId,
                formTitle = form.Title,
                workflow = def == null ? null : new
                {
                    id = def.Id,
                    name = def.Name,
                    startNodeId = def.StartNodeId,
                    nodes = nodes,
                    edges = (def.Edges ?? new List<WorkflowEdge>()).Select(e => new
                    {
                        id = e.Id,
                        sourceNodeId = e.SourceNodeId,
                        sourceHandle = e.SourceHandle,
                        targetNodeId = e.TargetNodeId,
                        targetHandle = e.TargetHandle,
                        label = e.Label
                    })
                },
                pendingSubmissions = pendingSubmissions
            });
        }

        [HttpGet("Directory")]
        public IActionResult Directory()
        {
            try
            {
                var portalId = _ctx.PortalId;
                if (portalId < 0) portalId = 0;

                var roles = _db.WebRoles
                    .Where(r => r.PortalId == portalId && !r.IsSystem)
                    .OrderBy(r => r.RoleName, StringComparer.OrdinalIgnoreCase)
                    .ToList();

                var roleIds = roles.Select(r => r.RoleId).ToList();
                var memberships = _db.WebUserRoles
                    .Where(ur => roleIds.Contains(ur.RoleId))
                    .ToList();

                var userIds = memberships.Select(m => m.UserId).Distinct().ToList();
                var users = _db.WebUsers
                    .Where(u => userIds.Contains(u.UserId) && !u.IsDeleted)
                    .ToList();

                var groups = new List<object>();
                foreach (var role in roles)
                {
                    var roleUsers = memberships
                        .Where(m => m.RoleId == role.RoleId)
                        .Select(m => users.FirstOrDefault(u => u.UserId == m.UserId))
                        .Where(u => u != null)
                        .OrderBy(u => string.IsNullOrWhiteSpace(u.DisplayName) ? u.UserName : u.DisplayName, StringComparer.OrdinalIgnoreCase)
                        .Select(u => new
                        {
                            userId = u.UserId,
                            userName = u.UserName,
                            displayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.UserName : u.DisplayName,
                            email = u.Email ?? string.Empty,
                            roleName = role.RoleName
                        })
                        .ToList();

                    if (roleUsers.Count > 0)
                        groups.Add(new { roleId = role.RoleId, name = role.RoleName, userCount = roleUsers.Count, users = roleUsers });
                }

                return Ok(new { siteId = portalId, groups });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("SeedOrgDirectory")]
        [Authorize(Roles = "Administrator")]
        public IActionResult SeedOrgDirectory()
        {
            try
            {
                var portalId = _ctx.PortalId;
                if (portalId < 0) portalId = 0;
                if (_provisioning == null) return BadRequest(new { error = "Provisioning service unavailable" });

                var actor = GetCurrentUserContextWithRoles();
                var ct = CancellationToken.None;

                var org = new (string dept, string user, string email, string display)[]
                {
                    ("Product Engineering", "nguyen.an", "an.nguyen@megaform.local", "Nguyen Van An"),
                    ("Product Engineering", "tran.bich", "bich.tran@megaform.local", "Tran Thi Bich"),
                    ("Product Engineering", "john.doe", "john.doe@megaform.local", "John Doe"),
                    ("Finance", "le.huong", "huong.le@megaform.local", "Le Thi Huong"),
                    ("Finance", "david.chen", "david.chen@megaform.local", "David Chen"),
                    ("Human Resources", "sarah.kim", "sarah.kim@megaform.local", "Sarah Kim"),
                    ("Human Resources", "maria.garcia", "maria.garcia@megaform.local", "Maria Garcia"),
                    ("Operations", "tom.wilson", "tom.wilson@megaform.local", "Tom Wilson"),
                    ("IT Support", "alex.park", "alex.park@megaform.local", "Alex Park"),
                };

                var depts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var usersCreated = 0;
                foreach (var (dept, user, email, display) in org)
                {
                    if (depts.Add(dept))
                    {
                        _provisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                        {
                            PortalId = portalId,
                            Actor = actor,
                            RoleName = dept,
                            Description = dept + " department"
                        }, ct).GetAwaiter().GetResult();
                    }
                    var parts = (display ?? string.Empty).Split(' ');
                    var first = parts.Length > 0 ? parts[0] : display;
                    var last = parts.Length > 1 ? string.Join(" ", parts.Skip(1)) : string.Empty;
                    var pu = _provisioning.EnsureUserAsync(new WorkflowUserProvisionRequest
                    {
                        PortalId = portalId,
                        Actor = actor,
                        UserName = user,
                        Email = email,
                        DisplayName = display,
                        FirstName = first,
                        LastName = last,
                        GeneratePasswordIfEmpty = true,
                        UpdateIfExists = true,
                        ApproveUser = true
                    }, ct).GetAwaiter().GetResult();
                    if (pu != null && pu.Created) usersCreated++;
                    _provisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                    {
                        PortalId = portalId,
                        Actor = actor,
                        UserIdentifier = user,
                        RoleName = dept,
                        AutoCreateRole = true
                    }, ct).GetAwaiter().GetResult();
                }
                return Ok(new { success = true, usersCreated, departments = depts.Count });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // ── helpers ─────────────────────────────────────────────────────────

        private UserContext GetCurrentUserContext()
        {
            var user = User;
            return new UserContext
            {
                UserId = ParseUserId(user),
                UserName = user != null ? (user.FindFirstValue(ClaimTypes.Name) ?? "anonymous") : "anonymous",
                DisplayName = user != null
                    ? (user.FindFirstValue("display_name")
                        ?? user.FindFirstValue("name")
                        ?? user.FindFirstValue(ClaimTypes.Name)
                        ?? "anonymous")
                    : "anonymous",
                Email = user != null ? (user.FindFirstValue(ClaimTypes.Email) ?? string.Empty) : string.Empty,
                IsAuthenticated = user != null && user.Identity != null && user.Identity.IsAuthenticated,
                IsAdmin = user != null && user.IsInRole("Administrator"),
                IsSuperUser = false,
                Roles = user != null
                    ? user.Claims
                        .Where(c => c.Type == ClaimTypes.Role || c.Type == "role" || c.Type == "roles")
                        .Select(c => c.Value)
                        .Where(v => !string.IsNullOrWhiteSpace(v))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList()
                    : new List<string>(),
                IpAddress = HttpContext != null && HttpContext.Connection != null && HttpContext.Connection.RemoteIpAddress != null
                    ? HttpContext.Connection.RemoteIpAddress.ToString()
                    : string.Empty
            };
        }

        private UserContext GetCurrentUserContextWithRoles()
        {
            var actor = GetCurrentUserContext();
            if (actor.UserId <= 0)
                return actor;

            try
            {
                var portalId = _ctx.PortalId;
                if (portalId < 0) portalId = 0;

                var dbUser = _db.WebUsers
                    .FirstOrDefault(u => u.UserId == actor.UserId && !u.IsDeleted);

                if (dbUser != null)
                {
                    actor.UserName = string.IsNullOrWhiteSpace(actor.UserName) ? (dbUser.UserName ?? string.Empty) : actor.UserName;
                    actor.DisplayName = string.IsNullOrWhiteSpace(actor.DisplayName) ? (dbUser.DisplayName ?? dbUser.UserName ?? string.Empty) : actor.DisplayName;
                    actor.Email = string.IsNullOrWhiteSpace(actor.Email) ? (dbUser.Email ?? string.Empty) : actor.Email;
                }

                var roleIds = _db.WebUserRoles
                    .Where(ur => ur.UserId == actor.UserId)
                    .Select(ur => ur.RoleId)
                    .ToList();

                var dbRoles = _db.WebRoles
                    .Where(r => roleIds.Contains(r.RoleId))
                    .Select(r => r.RoleName)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .ToList();

                var roles = new List<string>(actor.Roles ?? new List<string>());
                roles.AddRange(dbRoles);
                actor.Roles = roles
                    .Where(v => !string.IsNullOrWhiteSpace(v))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

                actor.IsAdmin = actor.IsAdmin
                    || actor.Roles.Any(role =>
                        string.Equals(role, "Administrator", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase));
            }
            catch
            {
                // Fail-soft: use claims-only roles if DB query fails.
            }

            return actor;
        }

        private static int ParseUserId(ClaimsPrincipal user)
        {
            if (user == null) return -1;
            return int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub"), out var userId)
                ? userId
                : -1;
        }

        private object BuildTaskPayload(WorkflowTaskOperationResult result)
        {
            if (result == null || result.Task == null)
                return new { task = (object)null, @case = (object)null, actions = new List<WorkflowTaskAction>() };

            var task = result.Task;
            var workflowCase = result.Case ?? ResolveWorkflowCase(task);
            var execution = result.Execution ?? ResolveWorkflowExecution(task, workflowCase);
            var actions = _workflowRepo.ListTaskActions(task.TaskId) ?? new List<WorkflowTaskAction>();
            return new
            {
                task,
                @case = workflowCase,
                execution,
                actions
            };
        }

        private WorkflowCaseInstance ResolveWorkflowCase(WorkflowTaskInstance task)
        {
            if (task == null) return null;
            if (!string.IsNullOrWhiteSpace(task.CaseId))
            {
                var workflowCase = _workflowRepo.GetCase(task.CaseId);
                if (workflowCase != null) return workflowCase;
            }
            return !string.IsNullOrWhiteSpace(task.ExecutionId) ? _workflowRepo.GetCaseByExecution(task.ExecutionId) : null;
        }

        private WorkflowExecutionContext ResolveWorkflowExecution(WorkflowTaskInstance task, WorkflowCaseInstance workflowCase)
        {
            if (task == null) return null;
            var executionId = !string.IsNullOrWhiteSpace(task.ExecutionId)
                ? task.ExecutionId
                : (workflowCase != null ? workflowCase.ExecutionId : string.Empty);
            return string.IsNullOrWhiteSpace(executionId) ? null : _workflowRepo.GetExecution(executionId);
        }

        private static JObject ParseBody(JsonElement bodyElement)
        {
            if (bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null)
                return null;
            try { return JObject.Parse(bodyElement.GetRawText()); }
            catch { return null; }
        }

        private static List<string> SafeJsonArray(string json)
        {
            if (string.IsNullOrWhiteSpace(json)) return new List<string>();
            try { return JsonConvert.DeserializeObject<List<string>>(json) ?? new List<string>(); }
            catch { return new List<string>(); }
        }
    }
}
