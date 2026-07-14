using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Entities.Users;
using DotNetNuke.Security.Roles;
using DotNetNuke.Web.Api;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Workflow;
using MegaForm.DNN.Services;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    /// <summary>
    /// [DnnMyInbox v20260714-01] Workflow task surface for DNN — the twin of the Oqtane
    /// endpoints in MegaFormController.WorkflowStarter.cs (Workflow/MyInbox, Workflow/Inbox,
    /// Workflow/Directory, Workflow/Tasks/*). DNN shipped the My Inbox *bundle* but none of
    /// these endpoints, so the surface booted and immediately showed "HTTP 404 Not Found".
    ///
    /// Auth: [DnnAuthorize] (any authenticated user) — an inbox is per-actor by construction.
    /// WorkflowTaskService scopes every read/write to the actor (EnsureActor + candidate/assignee
    /// checks), so an employee only ever sees and acts on their own tasks. Directory is Edit-only:
    /// it enumerates portal users, which a plain member has no business reading.
    /// </summary>
    [DnnAuthorize]
    public class WorkflowInboxController : DnnApiController
    {
        private static WorkflowTaskService Tasks => DnnServiceLocator.Instance.WorkflowTasks;
        private static IWorkflowRepository Repo => DnnServiceLocator.Instance.WorkflowRepo;

        // ── Reads ────────────────────────────────────────────────────────────────
        [HttpGet]
        [ActionName("MyInbox")]
        public HttpResponseMessage MyInbox(int recentCompleted = 25)
        {
            try
            {
                var actor = BuildActor();
                var board = Tasks.GetWorkboard(actor, recentCompleted);

                var all = board.Incoming.Concat(board.InProgress).Concat(board.Completed).ToList();

                var forms = new Dictionary<string, object>();
                foreach (var formId in all.Select(t => t.FormId).Where(id => id > 0).Distinct())
                {
                    var form = DnnServiceLocator.Instance.FormRepo.GetForm(formId);
                    forms[formId.ToString()] = new
                    {
                        formId,
                        title = form != null && !string.IsNullOrWhiteSpace(form.Title) ? form.Title : ("Form #" + formId)
                    };
                }

                // The task rows carry the approver, not the submitter. Resolve submission.UserId →
                // the real DNN user here (same fix as the Oqtane twin), otherwise every row in the
                // grid renders its submitter as "Unknown".
                var submitters = new Dictionary<string, object>();
                foreach (var sid in all.Select(t => t.SubmissionId).Where(id => id > 0).Distinct())
                {
                    try
                    {
                        var sub = DnnServiceLocator.Instance.SubmissionRepo.Get(sid);
                        if (sub == null || !sub.UserId.HasValue || sub.UserId.Value <= 0) continue;
                        var user = UserController.GetUserById(PortalSettings.PortalId, sub.UserId.Value);
                        if (user == null) continue;
                        submitters[sid.ToString()] = new
                        {
                            userId = user.UserID,
                            userName = user.Username ?? string.Empty,
                            displayName = !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : (user.Username ?? string.Empty)
                        };
                    }
                    catch { /* one bad submission must not blank the whole board */ }
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
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
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpGet]
        [ActionName("Inbox")]
        public HttpResponseMessage Inbox(int pageIndex = 0, int pageSize = 20)
        {
            try
            {
                var inbox = Tasks.GetInbox(BuildActor(), pageIndex, pageSize);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    pageIndex,
                    pageSize,
                    myTasks = inbox.MyTasks,
                    roleQueue = inbox.RoleQueue,
                    counts = new { myTasks = inbox.MyTasks.Count, roleQueue = inbox.RoleQueue.Count },
                    generatedAt = inbox.GeneratedAt
                });
            }
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpGet]
        [ActionName("Get")]
        public HttpResponseMessage Get(string taskId = null)
        {
            try { return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(Tasks.GetTask(taskId, BuildActor()))); }
            catch (Exception ex) { return Fail(ex); }
        }

        // ── Task actions ─────────────────────────────────────────────────────────
        [HttpPost]
        [ActionName("Claim")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Claim([FromBody] JObject body)
        {
            try
            {
                var result = Tasks.ClaimTaskAsync(TaskId(body), BuildActor(), Text(body, "comment"),
                    System.Threading.CancellationToken.None).GetAwaiter().GetResult();
                return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(result));
            }
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpPost]
        [ActionName("Approve")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Approve([FromBody] JObject body)
        {
            try
            {
                var result = Tasks.ApproveTaskAsync(TaskId(body), BuildActor(), Text(body, "comment"), Data(body),
                    System.Threading.CancellationToken.None).GetAwaiter().GetResult();
                return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(result));
            }
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpPost]
        [ActionName("Reject")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Reject([FromBody] JObject body)
        {
            try
            {
                var result = Tasks.RejectTaskAsync(TaskId(body), BuildActor(), Text(body, "comment"), Data(body),
                    System.Threading.CancellationToken.None).GetAwaiter().GetResult();
                return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(result));
            }
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpPost]
        [ActionName("Forward")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Forward([FromBody] JObject body)
        {
            try
            {
                var target = Text(body, "targetUser");
                if (string.IsNullOrWhiteSpace(target))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "targetUser is required." });
                var result = Tasks.ForwardTaskAsync(TaskId(body), BuildActor(), target, Text(body, "comment"),
                    System.Threading.CancellationToken.None).GetAwaiter().GetResult();
                return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(result));
            }
            catch (Exception ex) { return Fail(ex); }
        }

        [HttpPost]
        [ActionName("Comment")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Comment([FromBody] JObject body)
        {
            try
            {
                var result = Tasks.CommentTaskAsync(TaskId(body), BuildActor(), Text(body, "comment"),
                    System.Threading.CancellationToken.None).GetAwaiter().GetResult();
                return Request.CreateResponse(HttpStatusCode.OK, BuildTaskPayload(result));
            }
            catch (Exception ex) { return Fail(ex); }
        }

        // ── Forward picker directory + ad-hoc assignment ─────────────────────────
        /// <summary>
        /// [ShellPlatform v20260714-01] Portal users grouped by role, for the Forward / Send-to-Inbox
        /// pickers. Built on the CORE catalog (IPermissionPrincipalCatalogProvider) that DNN, Oqtane and
        /// AspNetCore all already implement — so this action is a thin shell: resolve the actor, ask Core,
        /// shape the response. It used to be [DnnModuleAuthorize(Edit)], which resolves the module from
        /// the ModuleId/TabId REQUEST HEADERS — headers the shared Submissions UI does not send (and which
        /// DNN 400s on child-portal aliases). Result: the picker showed "(no directory users)". The gate is
        /// now the actor itself, never the request.
        /// </summary>
        [HttpGet]
        [ActionName("Directory")]
        public HttpResponseMessage Directory()
        {
            try
            {
                var actor = BuildActor();
                if (!(actor.IsAdmin || actor.IsSuperUser))
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrators only." });

                var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
                var principals = new DnnPermissionPrincipalCatalogProvider(portalId).GetPrincipals(portalId, actor)
                    ?? new List<MegaForm.Core.Models.PermissionPrincipalInfo>();

                // Group the user principals by their role; the picker renders one <optgroup> per group.
                var groups = principals
                    .Where(p => string.Equals(p.PrincipalType, "user", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(p.UserName))
                    .GroupBy(p => string.IsNullOrWhiteSpace(p.RoleName) ? "Users" : p.RoleName, StringComparer.OrdinalIgnoreCase)
                    .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                    .Select(g => new
                    {
                        name = g.Key,
                        userCount = g.Count(),
                        users = g.Select(p => new
                        {
                            userId = p.UserId ?? 0,
                            userName = p.UserName ?? string.Empty,
                            displayName = !string.IsNullOrWhiteSpace(p.DisplayName) ? p.DisplayName : (p.UserName ?? string.Empty),
                            email = p.Description ?? string.Empty,
                            roleName = g.Key
                        }).OrderBy(u => u.displayName, StringComparer.OrdinalIgnoreCase).ToList()
                    })
                    .Where(g => g.users.Count > 0)
                    .ToList();

                return Request.CreateResponse(HttpStatusCode.OK, new { portalId, groups });
            }
            catch (Exception ex) { return Fail(ex); }
        }

        /// <summary>
        /// POST Workflow/Tasks/SendSubmission — route a submission straight to a teammate's inbox
        /// (no pre-configured workflow). The twin of Oqtane's endpoint; the work itself is Core's
        /// WorkflowTaskService.CreateAdHocReviewTask, so DNN only adapts the request/response.
        /// This is what "Send to Inbox" in the Submissions shell calls — it simply did not exist on DNN.
        /// </summary>
        [HttpPost]
        [ActionName("SendSubmission")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SendSubmission([FromBody] JObject body)
        {
            try
            {
                var actor = BuildActor();
                if (!(actor.IsAdmin || actor.IsSuperUser))
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrators only." });

                var formId = body != null ? (body.Value<int?>("formId") ?? 0) : 0;
                var submissionId = body != null ? (body.Value<int?>("submissionId") ?? 0) : 0;
                var targetUser = Text(body, "targetUser");
                if (string.IsNullOrWhiteSpace(targetUser))
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "targetUser is required." });
                if (submissionId <= 0)
                    return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "submissionId is required." });

                var task = Tasks.CreateAdHocReviewTask(formId, submissionId, targetUser, Text(body, "title"), Text(body, "comment"), actor);
                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    ok = true,
                    taskId = task != null ? task.TaskId : null,
                    assignedTo = task != null ? task.AssignedUserName : null,
                    formId,
                    submissionId
                });
            }
            catch (Exception ex) { return Fail(ex); }
        }

        /// <summary>
        /// POST Workflow/SeedOrgDirectory — create a small demo organisation (departments as roles +
        /// real users) so the Forward / Send-to-Inbox pickers have somebody to pick. The DNN twin of
        /// Oqtane's endpoint; the work is Core's IWorkflowIdentityProvisioningService, so this action
        /// only adapts the request. Idempotent. Admin/host only.
        /// </summary>
        [HttpPost]
        [ActionName("SeedOrgDirectory")]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage SeedOrgDirectory()
        {
            try
            {
                var actor = BuildActor();
                if (!(actor.IsAdmin || actor.IsSuperUser))
                    return Request.CreateResponse(HttpStatusCode.Forbidden, new { error = "Administrators only." });

                var portalId = PortalSettings != null ? PortalSettings.PortalId : 0;
                var prov = DnnServiceLocator.Instance.WorkflowIdentityProvisioning;
                var ct = System.Threading.CancellationToken.None;

                var org = new[]
                {
                    new { Dept = "Finance",    User = "fin.lan",  Email = "fin.lan@megaform.local",  Display = "Le Thi Lan" },
                    new { Dept = "Finance",    User = "fin.minh", Email = "fin.minh@megaform.local", Display = "Tran Minh" },
                    new { Dept = "Operations", User = "ops.nam",  Email = "ops.nam@megaform.local",  Display = "Nguyen Van Nam" },
                    new { Dept = "Operations", User = "ops.hoa",  Email = "ops.hoa@megaform.local",  Display = "Pham Thi Hoa" },
                    new { Dept = "Procurement",User = "buy.kien", Email = "buy.kien@megaform.local", Display = "Do Trung Kien" },
                };

                var depts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                int usersCreated = 0, membershipsCreated = 0;

                foreach (var row in org)
                {
                    if (depts.Add(row.Dept))
                    {
                        prov.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                        {
                            PortalId = portalId, Actor = actor, RoleName = row.Dept,
                            Description = "MegaForm demo department"
                        }, ct).GetAwaiter().GetResult();
                    }

                    var user = prov.EnsureUserAsync(new WorkflowUserProvisionRequest
                    {
                        PortalId = portalId, Actor = actor,
                        UserName = row.User, Email = row.Email, DisplayName = row.Display,
                        ApproveUser = true, UpdateIfExists = true, GeneratePasswordIfEmpty = true
                    }, ct).GetAwaiter().GetResult();
                    if (user != null) usersCreated++;

                    prov.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                    {
                        PortalId = portalId, Actor = actor,
                        UserIdentifier = row.User, RoleName = row.Dept, AutoCreateRole = true
                    }, ct).GetAwaiter().GetResult();
                    membershipsCreated++;
                }

                return Request.CreateResponse(HttpStatusCode.OK, new
                {
                    ok = true, portalId,
                    departments = depts.Count, users = usersCreated, memberships = membershipsCreated
                });
            }
            catch (Exception ex) { return Fail(ex); }
        }

        // ── Helpers ──────────────────────────────────────────────────────────────
        private object BuildTaskPayload(WorkflowTaskOperationResult result)
        {
            if (result == null || result.Task == null)
                return new { task = (object)null, @case = (object)null, execution = (object)null, actions = new List<WorkflowTaskAction>() };

            var task = result.Task;
            var workflowCase = result.Case ?? ResolveCase(task);
            var execution = result.Execution ?? ResolveExecution(task, workflowCase);
            var actions = Repo.ListTaskActions(task.TaskId) ?? new List<WorkflowTaskAction>();
            return new { task, @case = workflowCase, execution, actions };
        }

        private WorkflowCaseInstance ResolveCase(WorkflowTaskInstance task)
        {
            if (task == null) return null;
            if (!string.IsNullOrWhiteSpace(task.CaseId))
            {
                var found = Repo.GetCase(task.CaseId);
                if (found != null) return found;
            }
            return !string.IsNullOrWhiteSpace(task.ExecutionId) ? Repo.GetCaseByExecution(task.ExecutionId) : null;
        }

        private WorkflowExecutionContext ResolveExecution(WorkflowTaskInstance task, WorkflowCaseInstance workflowCase)
        {
            if (task == null) return null;
            var executionId = !string.IsNullOrWhiteSpace(task.ExecutionId)
                ? task.ExecutionId
                : (workflowCase != null ? workflowCase.ExecutionId : string.Empty);
            return string.IsNullOrWhiteSpace(executionId) ? null : Repo.GetExecution(executionId);
        }

        /// <summary>Actor from DNN's UserInfo — never from the request body.</summary>
        private UserContext BuildActor()
        {
            var user = UserInfo;
            return new UserContext
            {
                UserId = user != null ? user.UserID : 0,
                UserName = user != null ? (user.Username ?? string.Empty) : string.Empty,
                DisplayName = user != null ? (user.DisplayName ?? string.Empty) : string.Empty,
                Email = user != null ? (user.Email ?? string.Empty) : string.Empty,
                IsAuthenticated = user != null && user.UserID > 0,
                IsAdmin = user != null && user.IsInRole("Administrators"),
                IsSuperUser = user != null && user.IsSuperUser,
                Roles = user != null && user.Roles != null ? user.Roles.ToList() : new List<string>()
            };
        }

        private static string TaskId(JObject body) { return Text(body, "taskId"); }

        private static string Text(JObject body, string key)
        {
            var token = body != null ? body[key] : null;
            return token != null && token.Type != JTokenType.Null ? token.ToString() : string.Empty;
        }

        private static Dictionary<string, object> Data(JObject body)
        {
            var token = body != null ? body["data"] as JObject : null;
            return token != null ? token.ToObject<Dictionary<string, object>>() : null;
        }

        /// <summary>Log the detail server-side; hand the client a generic message. Never ex.Message /
        /// ex.StackTrace (SECURITY_CODING_RULES §10) — task errors can quote workflow/user internals.</summary>
        private HttpResponseMessage Fail(Exception ex)
        {
            try { DnnServiceLocator.Instance.LogService.LogError("MegaForm.WorkflowInbox", ex.ToString()); } catch { }
            // Also hand it to DNN's own logger so it lands in the Admin Logs UI / EventLog — the
            // MegaForm log sink alone proved invisible when diagnosing a live 400.
            try { DotNetNuke.Services.Exceptions.Exceptions.LogException(ex); } catch { }
            return Request.CreateResponse(HttpStatusCode.BadRequest,
                new { error = "The inbox request could not be completed." });
        }
    }
}
