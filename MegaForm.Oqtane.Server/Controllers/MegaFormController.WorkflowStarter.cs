using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Core.ViewModes;
using MegaForm.Core.Workflow;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json.Linq;
using Oqtane.Models;
using Oqtane.Shared;

namespace MegaForm.Oqtane.Server.Controllers
{
    public partial class MegaFormController
    {
        [HttpGet("Workflow/Inbox")]
        [Authorize]
        public IActionResult WorkflowInbox(int pageIndex = 0, int pageSize = 20)
        {
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var inbox = _workflowTasks.GetInbox(actor, pageIndex, pageSize);
                return JsonOk(new
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

        [HttpGet("Workflow/MyInbox")]
        [Authorize]
        public IActionResult WorkflowMyInbox(int recentCompleted = 25)
        {
            // [MyInbox v20260610-B120] Personal project-manager-style workboard for the
            // current user: Incoming (claimable) / In-Progress (assigned to me) /
            // Completed (acted on by me) tasks + KPI counts + a formId→title lookup so the
            // grid can label each row without an N+1 form fetch on the client.
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

                return JsonOk(new
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
                    generatedAt = board.GeneratedAt
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("Workflow/Tasks/Get")]
        [Authorize]
        public IActionResult WorkflowGetTask(string taskId = null)
        {
            taskId = taskId ?? Request.Query["id"].FirstOrDefault();
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                var result = _workflowTasks.GetTask(taskId, actor);
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Workflow/Tasks/Claim")]
        [Authorize]
        public IActionResult WorkflowClaimTask([FromBody] JsonElement bodyElement)
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
                        System.Threading.CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Workflow/Tasks/Approve")]
        [Authorize]
        public IActionResult WorkflowApproveTask([FromBody] JsonElement bodyElement)
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
                        System.Threading.CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Workflow/Tasks/Reject")]
        [Authorize]
        public IActionResult WorkflowRejectTask([FromBody] JsonElement bodyElement)
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
                        System.Threading.CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Workflow/Tasks/Forward")]
        [Authorize]
        public IActionResult WorkflowForwardTask([FromBody] JsonElement bodyElement)
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
                        System.Threading.CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // [SendToInbox v20260625] Route a submission to a chosen user's inbox on demand
        // (no pre-configured workflow needed). Body: { formId, submissionId, targetUser, title?, comment? }.
        [HttpPost("Workflow/Tasks/SendSubmission")]
        [Authorize]
        public IActionResult WorkflowSendSubmission([FromBody] JsonElement bodyElement)
        {
            var body = ParseBody(bodyElement);
            if (body == null) return BadRequest(new { error = "Invalid JSON body" });
            try
            {
                var actor = GetCurrentUserContextWithRoles();
                int formId = body.Value<int?>("formId") ?? 0;
                int submissionId = body.Value<int?>("submissionId") ?? 0;
                string targetUser = (string)body["targetUser"];
                string title = (string)body["title"];
                string comment = (string)body["comment"];
                if (string.IsNullOrWhiteSpace(targetUser)) return BadRequest(new { error = "targetUser is required" });
                var task = _workflowTasks.CreateAdHocReviewTask(formId, submissionId, targetUser, title, comment, actor);
                return JsonOk(new { ok = true, taskId = task.TaskId, assignedTo = task.AssignedUserName, formId, submissionId });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Workflow/Tasks/Comment")]
        [Authorize]
        public IActionResult WorkflowCommentTask([FromBody] JsonElement bodyElement)
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
                        System.Threading.CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                return JsonOk(BuildWorkflowTaskPayload(result));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // [MyInbox Forward org-tree 2026-06-11] Org directory grouped by role/department
        // for the Forward picker — real Oqtane users (DisplayName/Email) under each role.
        [HttpGet("Workflow/Directory")]
        [Authorize]
        public IActionResult WorkflowDirectory()
        {
            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                if (siteId <= 0 && int.TryParse(Request.Query["siteId"], out var qsid) && qsid > 0) siteId = qsid;
                if (siteId <= 0) siteId = 1;

                var roleRepo = HttpContext.RequestServices.GetService(typeof(global::Oqtane.Repository.IRoleRepository)) as global::Oqtane.Repository.IRoleRepository;
                var userRoleRepo = HttpContext.RequestServices.GetService(typeof(global::Oqtane.Repository.IUserRoleRepository)) as global::Oqtane.Repository.IUserRoleRepository;
                var userRepo = HttpContext.RequestServices.GetService(typeof(global::Oqtane.Repository.IUserRepository)) as global::Oqtane.Repository.IUserRepository;
                if (roleRepo == null || userRoleRepo == null || userRepo == null)
                    return JsonOk(new { siteId, groups = new object[0] });

                var system = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "Registered Users", "All Users", "Unauthenticated Users", "Host Users", "Super Users"
                };
                var roles = roleRepo.GetRoles(siteId, true).Where(r => !system.Contains(r.Name)).ToList();
                var memberships = userRoleRepo.GetUserRoles(siteId).ToList();
                var userCache = new Dictionary<int, global::Oqtane.Models.User>();

                global::Oqtane.Models.User ResolveUser(int uid)
                {
                    if (userCache.TryGetValue(uid, out var cached)) return cached;
                    var u = userRepo.GetUser(uid);
                    userCache[uid] = u;
                    return u;
                }

                var groups = new List<object>();
                foreach (var role in roles.OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase))
                {
                    var users = memberships
                        .Where(m => m.RoleId == role.RoleId)
                        .Select(m => m.UserId).Distinct()
                        .Select(ResolveUser)
                        .Where(u => u != null && !u.IsDeleted)
                        .OrderBy(u => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName, StringComparer.OrdinalIgnoreCase)
                        .Select(u => new
                        {
                            userId = u.UserId,
                            userName = u.Username,
                            displayName = string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName,
                            email = u.Email ?? string.Empty,
                            roleName = role.Name
                        })
                        .ToList();
                    if (users.Count > 0)
                        groups.Add(new { roleId = role.RoleId, name = role.Name, userCount = users.Count, users });
                }
                return JsonOk(new { siteId, groups });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        // Seed a demo organisation (departments as roles + real users) so the Forward
        // picker has a usable directory. Idempotent — reuses the proven provisioning
        // service (creates AspNetUsers + User + role membership). Admin/host only.
        [HttpPost("Workflow/SeedOrgDirectory")]
        [Authorize(Policy = "EditModule")]
        public IActionResult WorkflowSeedOrgDirectory()
        {
            try
            {
                var siteId = AuthEntityId(EntityNames.Site);
                if (siteId <= 0) siteId = 1;
                var prov = HttpContext.RequestServices.GetService(typeof(MegaForm.Core.Interfaces.IWorkflowIdentityProvisioningService))
                    as MegaForm.Core.Interfaces.IWorkflowIdentityProvisioningService;
                if (prov == null) return BadRequest(new { error = "Provisioning service unavailable" });
                var actor = GetCurrentUserContextWithRoles();
                var ct = System.Threading.CancellationToken.None;

                var org = new (string dept, string user, string email, string display)[]
                {
                    ("Product Engineering", "nguyen.an",   "an.nguyen@megaform.local",    "Nguyen Van An"),
                    ("Product Engineering", "tran.bich",   "bich.tran@megaform.local",    "Tran Thi Bich"),
                    ("Product Engineering", "john.doe",     "john.doe@megaform.local",     "John Doe"),
                    ("Finance",             "le.huong",     "huong.le@megaform.local",     "Le Thi Huong"),
                    ("Finance",             "david.chen",   "david.chen@megaform.local",   "David Chen"),
                    ("Human Resources",     "sarah.kim",    "sarah.kim@megaform.local",    "Sarah Kim"),
                    ("Human Resources",     "maria.garcia", "maria.garcia@megaform.local", "Maria Garcia"),
                    ("Operations",          "tom.wilson",   "tom.wilson@megaform.local",   "Tom Wilson"),
                    ("IT Support",          "alex.park",    "alex.park@megaform.local",    "Alex Park"),
                };

                var depts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var usersCreated = 0;
                foreach (var (dept, user, email, display) in org)
                {
                    if (depts.Add(dept))
                    {
                        prov.EnsureRoleAsync(new MegaForm.Core.Workflow.WorkflowRoleProvisionRequest
                        { PortalId = siteId, Actor = actor, RoleName = dept, Description = dept + " department" }, ct)
                            .GetAwaiter().GetResult();
                    }
                    var parts = (display ?? string.Empty).Split(' ');
                    var first = parts.Length > 0 ? parts[0] : display;
                    var last = parts.Length > 1 ? string.Join(" ", parts.Skip(1)) : string.Empty;
                    var pu = prov.EnsureUserAsync(new MegaForm.Core.Workflow.WorkflowUserProvisionRequest
                    {
                        PortalId = siteId, Actor = actor, UserName = user, Email = email,
                        DisplayName = display, FirstName = first, LastName = last,
                        GeneratePasswordIfEmpty = true, UpdateIfExists = true, ApproveUser = true
                    }, ct).GetAwaiter().GetResult();
                    if (pu != null && pu.Created) usersCreated++;
                    prov.AddUserToRoleAsync(new MegaForm.Core.Workflow.WorkflowUserRoleProvisionRequest
                    { PortalId = siteId, Actor = actor, UserIdentifier = user, RoleName = dept, AutoCreateRole = true }, ct)
                        .GetAwaiter().GetResult();
                }
                return JsonOk(new { success = true, usersCreated, departments = depts.Count });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("Starter/Status")]
        [Authorize]
        public IActionResult StarterStatus()
        {
            // [StarterStatus v20260519-01] Returns install-state per starter for
            // the current site so the Dashboard Business Starters modal can
            // render "Open Board" / "Reseed" instead of "Launch" when a
            // starter is already provisioned.
            try
            {
                var portalId = AuthEntityId(EntityNames.Site);
                if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                    portalId = qSiteId;
                if (portalId <= 0)
                    portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

                var svc = new MegaForm.Core.Services.Starters.StarterStatusService(_formRepo, _subRepo);
                var items = svc.GetAll(portalId);
                return JsonOk(new { items });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/LeaveRequest/Setup")]
        [Authorize]
        public IActionResult SetupLeaveRequestStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _leaveRequestStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/Proposal/Setup")]
        [Authorize]
        public IActionResult SetupProposalStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _proposalStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/Recruitment/Setup")]
        [Authorize]
        public IActionResult SetupRecruitmentStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _recruitmentStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/DocumentExchange/Setup")]
        [Authorize]
        public IActionResult SetupDocumentExchangeStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _documentExchangeStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/Blog/Setup")]
        [Authorize]
        public IActionResult SetupBlog([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = GetCurrentPageBaseUrl();

            try
            {
                var result = _configuredAppStarter.EnsureStarter("blog", portalId, moduleId, homeUrl, actor);
                return JsonOk(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("Starter/Launch")]
        [Authorize]
        public IActionResult LaunchStarter([FromBody] JsonElement bodyElement)
        {
            var actor = GetCurrentUserContextWithRoles();
            if (!actor.IsAuthenticated || (!actor.IsAdmin && !actor.IsSuperUser))
                return Forbid();

            var body = ParseBody(bodyElement) ?? new JObject();
            var starterKey = ((string)body["starterKey"] ?? string.Empty).Trim();
            var portalId = AuthEntityId(EntityNames.Site);
            if (portalId <= 0 && int.TryParse(Request.Query["siteId"], out var qSiteId) && qSiteId > 0)
                portalId = qSiteId;
            if (portalId <= 0)
                portalId = ParsePositiveInt(Request?.Headers["X-OQTANE-SITEID"].FirstOrDefault());

            var moduleId = (int?)body["moduleId"] ?? AuthEntityId(EntityNames.Module);
            var homeUrl = ((string)body["homeUrl"] ?? string.Empty).Trim();
            var currentPageUrl = ((string)body["currentPageUrl"] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(homeUrl))
                homeUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : GetCurrentPageBaseUrl();
            if (string.IsNullOrWhiteSpace(currentPageUrl))
                currentPageUrl = homeUrl;

            if (portalId <= 0)
                return BadRequest(new { error = "Missing site context for starter launch." });
            if (moduleId <= 0)
                return BadRequest(new { error = "Missing module context for starter launch." });
            if (string.IsNullOrWhiteSpace(starterKey))
                return BadRequest(new { error = "starterKey is required." });

            try
            {
                var starter = EnsureStarterForLaunch(starterKey, portalId, moduleId, homeUrl, actor);
                var formId = ReadStarterInt(starter, "FormId");
                var defaultViewKey = ReadStarterString(starter, "DefaultViewKey");
                if (formId <= 0)
                    return BadRequest(new { error = "Starter app setup did not return a valid form." });

                BindStarterToModule(moduleId, formId, defaultViewKey);
                var redirectUrl = BuildStarterRedirectUrl(currentPageUrl, defaultViewKey);

                return JsonOk(new
                {
                    success = true,
                    starter,
                    formId,
                    defaultViewKey,
                    redirectUrl
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        private JObject ParseBody(JsonElement bodyElement)
        {
            if (bodyElement.ValueKind == JsonValueKind.Undefined || bodyElement.ValueKind == JsonValueKind.Null)
                return null;

            try
            {
                return JObject.Parse(bodyElement.GetRawText());
            }
            catch
            {
                return null;
            }
        }

        private object BuildWorkflowTaskPayload(WorkflowTaskOperationResult result)
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

        private UserContext GetCurrentUserContextWithRoles()
        {
            var actor = GetCurrentUserContext();
            if (actor.UserId <= 0)
                return actor;

            var user = (_users.GetUsers() ?? Enumerable.Empty<User>())
                .FirstOrDefault(u => u != null && u.UserId == actor.UserId);
            if (user == null)
                return actor;

            var roles = new List<string>(actor.Roles ?? new List<string>());
            if (user.Roles != null)
                roles.AddRange(user.Roles);

            actor.UserName = string.IsNullOrWhiteSpace(actor.UserName) ? (user.Username ?? string.Empty) : actor.UserName;
            actor.DisplayName = string.IsNullOrWhiteSpace(actor.DisplayName) ? (user.DisplayName ?? user.Username ?? string.Empty) : actor.DisplayName;
            actor.Email = string.IsNullOrWhiteSpace(actor.Email) ? (user.Email ?? string.Empty) : actor.Email;
            actor.Roles = roles
                .Where(v => !string.IsNullOrWhiteSpace(v))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            actor.IsAdmin = actor.IsAdmin || actor.Roles.Any(role =>
                string.Equals(role, "Host", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Administrators", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase));
            return actor;
        }

        private string GetCurrentPageBaseUrl()
        {
            try
            {
                var request = HttpContext?.Request;
                if (request == null) return string.Empty;
                return request.Scheme + "://" + request.Host + request.PathBase + request.Path;
            }
            catch
            {
                return string.Empty;
            }
        }

        private object EnsureStarterForLaunch(string starterKey, int portalId, int moduleId, string homeUrl, UserContext actor)
        {
            var normalized = (starterKey ?? string.Empty).Trim().ToLowerInvariant();
            switch (normalized)
            {
                case "leave":
                case "leave-request":
                    return _leaveRequestStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "proposal":
                    return _proposalStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "documents":
                case "document":
                case "document-exchange":
                    return _documentExchangeStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "recruitment":
                case "recruitment-pipeline":
                    return _recruitmentStarter.EnsureStarter(portalId, moduleId, homeUrl, actor);
                case "blog":
                case "blogs":
                case "blog-publishing":
                    return _configuredAppStarter.EnsureStarter("blog", portalId, moduleId, homeUrl, actor);
                default:
                    throw new InvalidOperationException("Unknown starter app.");
            }
        }

        private void BindStarterToModule(int moduleId, int formId, string selectedViewKey)
        {
            var moduleSettings = ReadSettings(EntityNames.Module, moduleId);
            var cssClass = ReadSetting(moduleSettings, "MegaForm:CssClass", ReadSetting(moduleSettings, "CssClass", string.Empty));
            var existingViewConfig = ReadSetting(moduleSettings, "MegaForm:ViewConfig", ReadSetting(moduleSettings, "ViewConfig", string.Empty));
            var popupConfig = ParsePopupDisplayConfig(existingViewConfig);
            var formViews = formId > 0 ? (_phase2Repo.GetFormViews(formId) ?? new List<FormViewInfo>()) : new List<FormViewInfo>();

            popupConfig.SelectedViewKey = FormViewSelector.SanitizeSelectedViewKey(selectedViewKey, formViews);
            var nextViewConfig = BuildViewConfigForSave(existingViewConfig, popupConfig);
            if (formId > 0)
            {
                nextViewConfig = FormViewSelector.AttachSelectionMetadata(nextViewConfig, popupConfig.SelectedViewKey, formViews);
            }

            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:FormId", formId > 0 ? formId.ToString() : string.Empty, false);
            UpsertSetting(EntityNames.Module, moduleId, "FormId", formId > 0 ? formId.ToString() : string.Empty, false);
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:ViewType", "submit", false);
            UpsertSetting(EntityNames.Module, moduleId, "ViewType", "submit", false);
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:CssClass", cssClass, false);
            UpsertSetting(EntityNames.Module, moduleId, "CssClass", cssClass, false);
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:ViewConfig", nextViewConfig, false);
            UpsertSetting(EntityNames.Module, moduleId, "ViewConfig", nextViewConfig, false);
            UpsertSetting(EntityNames.Module, moduleId, "MegaForm:ModuleConfigured", "true", false);
            UpsertSetting(EntityNames.Module, moduleId, "ModuleConfigured", "true", false);
        }

        private string BuildStarterRedirectUrl(string currentPageUrl, string defaultViewKey)
        {
            var baseUrl = !string.IsNullOrWhiteSpace(currentPageUrl) ? currentPageUrl : GetCurrentPageBaseUrl();
            if (string.IsNullOrWhiteSpace(baseUrl))
                baseUrl = "/";

            if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var absolute))
            {
                var request = HttpContext?.Request;
                if (request == null)
                    return baseUrl;
                var root = $"{request.Scheme}://{request.Host}";
                Uri.TryCreate(new Uri(root), baseUrl, out absolute);
            }

            if (absolute == null)
                return baseUrl;

            var target = new UriBuilder(absolute);
            var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(target.Query ?? string.Empty)
                .ToDictionary(pair => pair.Key, pair => pair.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            query.Remove("view");
            query.Remove("formid");
            query.Remove("mfpanel");
            query.Remove("edit");
            if (!string.IsNullOrWhiteSpace(defaultViewKey))
                query["vk"] = defaultViewKey;
            else
                query.Remove("vk");
            target.Query = string.Join("&", query
                .Where(pair => !string.IsNullOrWhiteSpace(pair.Key))
                .Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value ?? string.Empty)));
            return target.Uri.PathAndQuery + target.Fragment;
        }

        private static int ReadStarterInt(object starter, string propertyName)
        {
            if (starter == null || string.IsNullOrWhiteSpace(propertyName))
                return 0;
            var prop = starter.GetType().GetProperty(propertyName);
            if (prop == null) return 0;
            var value = prop.GetValue(starter);
            if (value is int intValue) return intValue;
            if (value is long longValue && longValue > 0 && longValue <= int.MaxValue) return (int)longValue;
            return int.TryParse(Convert.ToString(value), out var parsed) ? parsed : 0;
        }

        private static string ReadStarterString(object starter, string propertyName)
        {
            if (starter == null || string.IsNullOrWhiteSpace(propertyName))
                return string.Empty;
            var prop = starter.GetType().GetProperty(propertyName);
            return prop == null ? string.Empty : (Convert.ToString(prop.GetValue(starter)) ?? string.Empty).Trim();
        }
    }
}
