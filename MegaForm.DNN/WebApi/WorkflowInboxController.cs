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

        // ── Forward picker directory ─────────────────────────────────────────────
        /// <summary>Portal users grouped by role, for the Forward picker. Enumerating users is an
        /// admin-only read — a plain member must not be able to harvest the portal directory.</summary>
        [HttpGet]
        [ActionName("Directory")]
        [DnnModuleAuthorize(AccessLevel = DotNetNuke.Security.SecurityAccessLevel.Edit)]
        public HttpResponseMessage Directory()
        {
            try
            {
                var portalId = PortalSettings.PortalId;
                var system = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                {
                    "Registered Users", "All Users", "Unauthenticated Users", "Subscribers", "Translator (en-US)"
                };

                var groups = new List<object>();
                var roles = RoleController.Instance.GetRoles(portalId)
                    .Where(r => r != null && !system.Contains(r.RoleName))
                    .OrderBy(r => r.RoleName, StringComparer.OrdinalIgnoreCase);

                foreach (var role in roles)
                {
                    var users = RoleController.Instance.GetUsersByRole(portalId, role.RoleName)
                        .Where(u => u != null && !u.IsDeleted)
                        .OrderBy(u => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName, StringComparer.OrdinalIgnoreCase)
                        .Select(u => new
                        {
                            userId = u.UserID,
                            userName = u.Username ?? string.Empty,
                            displayName = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : (u.Username ?? string.Empty),
                            email = u.Email ?? string.Empty,
                            roleName = role.RoleName
                        })
                        .ToList();
                    if (users.Count > 0)
                        groups.Add(new { roleId = role.RoleID, name = role.RoleName, userCount = users.Count, users });
                }

                return Request.CreateResponse(HttpStatusCode.OK, new { portalId, groups });
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
            return Request.CreateResponse(HttpStatusCode.BadRequest,
                new { error = "The inbox request could not be completed." });
        }
    }
}
