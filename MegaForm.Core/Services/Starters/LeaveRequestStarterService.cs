// ============================================================
// MegaForm Core — Leave Request Business Starter
// ----------------------------------------------------------------
// Platform-agnostic seeded "Business App" that publishes a Leave
// Request form + workflow + register/board views + sample data into
// either DNN or Oqtane. Both platforms construct this same class
// from MegaForm.Core, supplying an IStarterPlatformAdapter that
// hides the 3 EF/DB calls the seeder needs:
//   1. ResolveUserIdByNameOrEmail (for sample CreatedByUserId)
//   2. ResetFormRuntimeData       (clean reseed)
//   3. PersistSeededAttachments   (FileInfo rows for sample PDFs)
// ============================================================

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.ViewModes;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;

namespace MegaForm.Core.Services.Starters
{
    public class LeaveRequestStarterResult
    {
        public int AppId { get; set; }
        public string AppKey { get; set; }
        public string AppScope { get; set; }
        public int FormId { get; set; }
        public string FormTitle { get; set; }
        public List<string> ViewKeys { get; set; } = new List<string>();
        public List<StarterCredentialInfo> Credentials { get; set; } = new List<StarterCredentialInfo>();
        public string DefaultViewKey { get; set; }
        public string SubmitUrl { get; set; }
        public string InboxUrl { get; set; }
        public string BoardUrl { get; set; }
        public Dictionary<string, int> SampleStatusCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }

    public class StarterCredentialInfo
    {
        public string RoleName { get; set; }
        public string UserName { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public string Password { get; set; }
    }

    public class LeaveRequestStarterService
    {
        public const string StarterAppScope = AppProfileScopes.LeaveRequest;
        public const string StarterAppKey = "leave-request-starter";
        public const string StarterAppName = "Leave Request Starter";
        public const string StarterFormTitle = "Leave Request Starter";
        public const string RegisteredUsersRole = "Registered Users";
        public const string EmployeeRole = "Leave Employees";
        public const string ManagerRole = "Leave Managers";
        public const string HrRole = "HR Review";
        public const string StarterPassword = "";
        public const string EmployeeUserName = "leave.employee";
        public const string ManagerUserName = "leave.manager";
        public const string HrUserName = "leave.hr";
        private const string SupportingDocumentsFieldKey = "supporting_documents";
        private const int StarterListPageSize = 8;

        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IPhase2Repository _phase2;
        private readonly IWorkflowRepository _workflowRepo;
        private readonly WorkflowTaskService _workflowTasks;
        private readonly SubmissionProcessor _submissionProcessor;
        private readonly AppDefinitionService _apps;
        private readonly AppQueryRegistryService _queries;
        private readonly IWorkflowIdentityProvisioningService _identityProvisioning;
        private readonly IStarterPlatformAdapter _platform;
        private readonly ILogService _log;

        public LeaveRequestStarterService(
            IFormRepository forms,
            ISubmissionRepository submissions,
            IPhase2Repository phase2,
            IWorkflowRepository workflowRepo,
            WorkflowTaskService workflowTasks,
            SubmissionProcessor submissionProcessor,
            AppDefinitionService apps,
            AppQueryRegistryService queries,
            IWorkflowIdentityProvisioningService identityProvisioning,
            IStarterPlatformAdapter platform,
            ILogService log = null)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _workflowRepo = workflowRepo ?? throw new ArgumentNullException(nameof(workflowRepo));
            _workflowTasks = workflowTasks ?? throw new ArgumentNullException(nameof(workflowTasks));
            _submissionProcessor = submissionProcessor ?? throw new ArgumentNullException(nameof(submissionProcessor));
            _apps = apps ?? throw new ArgumentNullException(nameof(apps));
            _queries = queries ?? throw new ArgumentNullException(nameof(queries));
            _identityProvisioning = identityProvisioning ?? throw new ArgumentNullException(nameof(identityProvisioning));
            _platform = platform ?? throw new ArgumentNullException(nameof(platform));
            _log = log;
        }

        public LeaveRequestStarterResult EnsureStarter(
            int portalId,
            int moduleId,
            string homeUrl,
            UserContext actor)
        {
            // [DnnPortalIdZero v20260518-08] DNN's default portal is PortalId=0
            // (host portal) and that is a valid context — Forms.PortalId column
            // accepts 0. Oqtane SiteId starts at 1 so 0 only appears on DNN.
            // Only negative ids indicate "no context".
            if (portalId < 0)
                throw new InvalidOperationException("portalId/siteId is required.");

            actor = actor ?? new UserContext();
            var app = EnsureAppDefinition(portalId, actor);
            var formId = EnsureStarterForm(portalId, moduleId, actor);
            EnsureQueries(portalId, app.AppKey, formId, actor);
            EnsureViews(formId);
            EnsurePermissions(formId);
            ApplyWorkflow(formId);

            ResetRuntimeData(formId);

            var employee = EnsureUser(portalId, EmployeeRole, EmployeeUserName, "Leave Employee", "leave.employee@megaform.local", actor);
            var manager = EnsureUser(portalId, ManagerRole, ManagerUserName, "Leave Manager", "leave.manager@megaform.local", actor);
            var hr = EnsureUser(portalId, HrRole, HrUserName, "HR Reviewer", "leave.hr@megaform.local", actor);

            SeedSamples(formId, employee, manager, hr);

            var boardUrl = BuildUrl(homeUrl, "?vk=leave-request-board");
            return new LeaveRequestStarterResult
            {
                AppId = app.AppId,
                AppKey = app.AppKey,
                AppScope = app.AppScope,
                FormId = formId,
                FormTitle = StarterFormTitle,
                DefaultViewKey = "leave-request-board",
                SubmitUrl = BuildUrl(homeUrl, "?view=form"),
                InboxUrl = BuildUrl(homeUrl, "?mfpanel=inbox"),
                BoardUrl = boardUrl,
                ViewKeys = new List<string>
                {
                    "leave-request-board",
                    "leave-request-register",
                    "leave-request-card"
                },
                Credentials = new List<StarterCredentialInfo>
                {
                    ToCredential(employee, EmployeeRole),
                    ToCredential(manager, ManagerRole),
                    ToCredential(hr, HrRole)
                },
                SampleStatusCounts = GetSampleStatusCounts(formId)
            };
        }

        private AppDefinitionInfo EnsureAppDefinition(int portalId, UserContext actor)
        {
            var bundle = _apps.GetByScope(portalId, StarterAppScope, hydrateManifest: false);
            var app = bundle?.App ?? new AppDefinitionInfo();
            app.PortalId = portalId;
            app.AppKey = StarterAppKey;
            app.AppName = StarterAppName;
            app.Description = "Seeded MegaForm business starter for leave-request approvals, inbox, and sample data.";
            app.AppScope = StarterAppScope;
            app.Icon = "fa-solid fa-plane-departure";
            app.AccentColor = "#2563eb";
            app.IsEnabled = true;
            app.SortOrder = 10;
            app.CreatedByUserId = app.CreatedByUserId > 0 ? app.CreatedByUserId : actor.UserId;
            app.ModifiedByUserId = actor.UserId;
            app.SettingsJson = JsonConvert.SerializeObject(new
            {
                starter = "leave-request",
                defaultViewKey = "leave-request-board"
            });
            app.ResourcesJson = JsonConvert.SerializeObject(new
            {
                submitLabel = "Submit leave request",
                inboxLabel = "Approval inbox",
                boardLabel = "Team board"
            });

            var manifest = new AppManifestDefinition
            {
                Profile = new AppProfileDefinition
                {
                    Scope = StarterAppScope,
                    DisplayName = "Leave Requests",
                    EntitySingular = "Request",
                    EntityPlural = "Requests",
                    EnableWorkflowInbox = true,
                    EnableAssignments = true,
                    EnableComments = true
                },
                Settings = new Dictionary<string, string>
                {
                    ["starter"] = "leave-request",
                    ["defaultViewKey"] = "leave-request-board"
                },
                Resources = new Dictionary<string, string>
                {
                    ["submitLabel"] = "Submit leave request",
                    ["inboxLabel"] = "Approval inbox"
                }
            };

            var appId = _apps.Save(app, manifest);
            return _apps.Get(portalId, StarterAppKey, hydrateManifest: false)?.App ?? app;
        }

        private int EnsureStarterForm(int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, StarterAppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, StarterFormTitle, StringComparison.OrdinalIgnoreCase));

            var schema = BuildSchema();
            var settingsJson = JsonConvert.SerializeObject(new
            {
                starter = "leave-request",
                appProfile = StarterAppScope
            });

            var form = existing ?? new FormInfo();
            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = StarterFormTitle;
            form.Description = "Seeded leave-request starter with sample workflow, approval inbox, and sample submissions.";
            form.SchemaJson = JsonConvert.SerializeObject(schema);
            form.SettingsJson = settingsJson;
            form.Status = "Published";
            form.SubmitButtonText = "Submit Leave Request";
            form.SuccessMessage = "Your leave request was submitted for manager review.";
            form.RequireAuth = true;
            form.EnableCaptcha = false;
            form.EnableSaveResume = false;
            form.AppScope = StarterAppScope;
            form.CreatedByUserId = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson = form.ThemeJson ?? string.Empty;
            form.NotifyEmails = string.Empty;
            form.WebhookUrl = string.Empty;
            form.WebhookSecret = string.Empty;
            form.WebhookHeaders = string.Empty;
            form.AutoresponderEnabled = false;
            form.AutoresponderEmailField = string.Empty;
            form.AutoresponderSubject = string.Empty;
            form.AutoresponderBody = string.Empty;
            return _forms.SaveForm(form);
        }

        private void EnsureQueries(int portalId, string appKey, int formId, UserContext actor)
        {
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "my-requests",
                QueryName = "My Requests",
                Description = "Starter query placeholder for self-service request lists.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { field = "employee_email", source = "currentUser.email" }),
                SortOrder = 10,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-manager",
                QueryName = "Pending Manager Review",
                Description = "Starter queue for manager approvals.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_manager" }),
                SortOrder = 20,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-hr",
                QueryName = "Pending HR Review",
                Description = "Starter queue for HR confirmation.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_hr" }),
                SortOrder = 30,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "approved-requests",
                QueryName = "Approved Requests",
                Description = "Starter view for already-approved leave requests.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "approved" }),
                SortOrder = 40,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
        }

        private void EnsureViews(int formId)
        {
            var listView = BuildBoardView(formId);
            var registerView = BuildRegisterView(formId);
            var cardView = BuildCardView(formId);
            UpsertView(formId, listView);
            UpsertView(formId, registerView);
            UpsertView(formId, cardView);
        }

        private void EnsurePermissions(int formId)
        {
            _phase2.SaveFormPermissions(formId, new List<FormPermissionInfo>
            {
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = EmployeeRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = ManagerRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = HrRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "approve", PrincipalType = "role", RoleName = ManagerRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "approve", PrincipalType = "role", RoleName = HrRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "export", PrincipalType = "role", RoleName = HrRole, Scope = "all", IsGranted = true }
            });
        }

        private void ApplyWorkflow(int formId)
        {
            var workflow = BuildWorkflow(formId);
            _workflowRepo.SaveDraft(formId, workflow);
            _workflowRepo.ApplyDraft(formId, "leave-request-starter");
        }

        private StarterSeedUser EnsureUser(int portalId, string roleName, string userName, string displayName, string email, UserContext actor)
        {
            try
            {
                _identityProvisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Description = "Seeded by MegaForm leave-request starter.",
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("ensure role '" + roleName + "'", ex);
            }

            WorkflowProvisionedUser provisioned;
            try
            {
                provisioned = _identityProvisioning.EnsureUserAsync(new WorkflowUserProvisionRequest
                {
                    PortalId = portalId,
                    UserName = userName,
                    DisplayName = displayName,
                    Email = email,
                    Password = StarterPassword,
                    ApproveUser = true,
                    UpdateIfExists = true,
                    GeneratePasswordIfEmpty = true,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("ensure user '" + userName + "'", ex);
            }

            try
            {
                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId,
                    UserIdentifier = email,
                    LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = RegisteredUsersRole,
                    AutoCreateRole = false,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();

                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId,
                    UserIdentifier = email,
                    LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = roleName,
                    AutoCreateRole = true,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("add user '" + userName + "' to role '" + roleName + "'", ex);
            }

            provisioned = NormalizeProvisionedUser(provisioned, userName, displayName, email);
            if (provisioned == null || !provisioned.UserId.HasValue || provisioned.UserId.Value <= 0)
                throw new InvalidOperationException("Unable to load starter user '" + userName + "'.");

            return new StarterSeedUser
            {
                UserId = provisioned.UserId.Value,
                UserName = string.IsNullOrWhiteSpace(provisioned.UserName) ? userName : provisioned.UserName,
                DisplayName = string.IsNullOrWhiteSpace(provisioned.DisplayName) ? displayName : provisioned.DisplayName,
                Email = string.IsNullOrWhiteSpace(provisioned.Email) ? email : provisioned.Email,
                RoleName = roleName,
                Password = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.Password) ? provisioned.Password : StarterPassword
            };
        }

        private WorkflowProvisionedUser NormalizeProvisionedUser(WorkflowProvisionedUser provisioned, string userName, string displayName, string email)
        {
            var userId = provisioned != null && provisioned.UserId.HasValue && provisioned.UserId.Value > 0
                ? provisioned.UserId.Value
                : ResolveStarterUserId(userName, email);

            if (userId <= 0)
                return provisioned;

            return new WorkflowProvisionedUser
            {
                UserId = userId,
                UserName = string.IsNullOrWhiteSpace(provisioned != null ? provisioned.UserName : null) ? userName : provisioned.UserName,
                DisplayName = string.IsNullOrWhiteSpace(provisioned != null ? provisioned.DisplayName : null) ? displayName : provisioned.DisplayName,
                Email = string.IsNullOrWhiteSpace(provisioned != null ? provisioned.Email : null) ? email : provisioned.Email,
                Password = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.Password) ? provisioned.Password : StarterPassword,
                Created = provisioned != null && provisioned.Created,
                AlreadyExisted = provisioned != null && provisioned.AlreadyExisted,
                Updated = provisioned != null && provisioned.Updated
            };
        }

        private int ResolveStarterUserId(string userName, string email)
        {
            return _platform.ResolveUserIdByNameOrEmail(userName, email);
        }

        private Exception BuildProvisioningException(string step, Exception ex)
        {
            var message = "LeaveRequest starter failed to " + step + ". " + FlattenExceptionMessage(ex);
            _log?.LogError(nameof(LeaveRequestStarterService), message, ex);
            return new InvalidOperationException(message, ex);
        }

        private static string FlattenExceptionMessage(Exception ex)
        {
            if (ex == null) return "Unknown error.";
            var parts = new List<string>();
            var cursor = ex;
            while (cursor != null)
            {
                if (!string.IsNullOrWhiteSpace(cursor.Message))
                    parts.Add(cursor.Message.Trim());
                cursor = cursor.InnerException;
            }
            return string.Join(" | ", parts.Distinct(StringComparer.Ordinal));
        }

        private void SeedSamples(int formId, StarterSeedUser employee, StarterSeedUser manager, StarterSeedUser hr)
        {
            var pendingManagerId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Ava Employee", employee.Email, "Operations", "Annual Leave", "2026-05-18", "2026-05-20", manager.Email,
                "Travel to visit family during a three-day leave window.",
                CreateLeaveAttachment(formId, "ava-travel-approval.pdf", "Travel approval pack", "Traveler: Ava Employee", "Coverage confirmed for 2026-05-18 through 2026-05-20.")));
            BackdateActiveTask(pendingManagerId, 30, 6);

            var pendingManagerSecondId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Iris Employee", employee.Email, "Sales", "Annual Leave", "2026-06-16", "2026-06-20", manager.Email,
                "Family travel request that still needs manager review before it can move to HR.",
                CreateLeaveAttachment(formId, "iris-family-itinerary.pdf", "Family itinerary", "Traveler: Iris Employee", "Leave window: 2026-06-16 to 2026-06-20.")));
            BackdateActiveTask(pendingManagerSecondId, 20, 5);

            var rejectedManagerId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Ben Employee", employee.Email, "Operations", "Sick Leave", "2026-05-12", "2026-05-12", manager.Email,
                "Single day request submitted with an incomplete note so the manager can reject the package for correction.",
                CreateLeaveAttachment(formId, "ben-self-note.pdf", "Self-declared sick note", "Employee: Ben Employee", "Manager requested an official clinic certificate instead.")));
            ClaimIfNeeded(rejectedManagerId, manager.ToContext());
            RejectTask(rejectedManagerId, manager.ToContext(), "Please attach the official medical certificate before resubmitting.");

            var pendingHrId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Chloe Employee", employee.Email, "Finance", "Work From Home", "2026-05-22", "2026-05-22", manager.Email,
                "Manager already reviewed this sample. HR still needs to confirm policy coverage.",
                CreateLeaveAttachment(formId, "chloe-remote-request.pdf", "Remote work request", "Employee: Chloe Employee", "Manager approved a one-day remote work arrangement.")));
            ClaimIfNeeded(pendingHrId, manager.ToContext());
            ApproveTask(pendingHrId, manager.ToContext(), "Manager approved and forwarded to HR.");

            var pendingHrSecondId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Noah Employee", employee.Email, "Operations", "Work From Home", "2026-05-29", "2026-05-30", manager.Email,
                "Manager approved this remote-work request and HR still needs to verify policy coverage and roster balance.",
                CreateLeaveAttachment(formId, "noah-coverage-plan.pdf", "Coverage plan", "Employee: Noah Employee", "Roster balance reviewed with the support desk.")));
            ClaimIfNeeded(pendingHrSecondId, manager.ToContext());
            ApproveTask(pendingHrSecondId, manager.ToContext(), "Manager approved and routed to HR.");

            var approvedId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "David Employee", employee.Email, "Marketing", "Annual Leave", "2026-06-02", "2026-06-05", manager.Email,
                "Approved sample for the finished workflow path.",
                CreateLeaveAttachment(formId, "david-approved-pack.pdf", "Approved leave pack", "Employee: David Employee", "Final HR confirmation included for payroll planning.")));
            ClaimIfNeeded(approvedId, manager.ToContext());
            ApproveTask(approvedId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(approvedId, hr.ToContext());
            ApproveTask(approvedId, hr.ToContext(), "HR confirmed and finalized the leave request.");

            var approvedSecondId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Mia Employee", employee.Email, "Marketing", "Annual Leave", "2026-06-24", "2026-06-28", manager.Email,
                "Approved leave register sample with full manager and HR completion for staffing calendar planning.",
                CreateLeaveAttachment(formId, "mia-leave-calendar-note.pdf", "Leave calendar note", "Employee: Mia Employee", "Approved and handed off to staffing calendar planning.")));
            ClaimIfNeeded(approvedSecondId, manager.ToContext());
            ApproveTask(approvedSecondId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(approvedSecondId, hr.ToContext());
            ApproveTask(approvedSecondId, hr.ToContext(), "HR approved and added to the leave calendar.");

            var rejectedHrId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                "Ella Employee", employee.Email, "Sales", "Annual Leave", "2026-06-10", "2026-06-14", manager.Email,
                "Rejected by HR because blackout dates overlap with quarter-end coverage.",
                CreateLeaveAttachment(formId, "ella-blackout-request.pdf", "Blackout period request", "Employee: Ella Employee", "Submitted during a quarter-end coverage blackout.")));
            ClaimIfNeeded(rejectedHrId, manager.ToContext());
            ApproveTask(rejectedHrId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(rejectedHrId, hr.ToContext());
            RejectTask(rejectedHrId, hr.ToContext(), "HR cannot approve this period because it overlaps quarter-end coverage.");

            SeedGeneratedSamples(formId, employee, manager, hr);
        }

        private void ResetRuntimeData(int formId)
        {
            _platform.ResetFormRuntimeData(formId);
            StarterSeedAttachmentFactory.DeleteFieldAttachments(formId, SupportingDocumentsFieldKey);
        }

        private int SubmitWorkflowSample(int formId, int userId, Dictionary<string, object> data, params StarterSeedAttachment[] attachments)
        {
            var result = _submissionProcessor.ProcessAsync(
                formId,
                data,
                BuildSeedIpAddress(userId),
                "MegaForm LeaveRequestStarter",
                userId,
                4.25d).GetAwaiter().GetResult();

            if (!result.Success || result.SubmissionId <= 0)
                throw new InvalidOperationException("Starter sample submission failed: " + (result.ErrorMessage ?? "Unknown error"));
            if (result.IsSpam)
                throw new InvalidOperationException("Starter sample submission " + result.SubmissionId + " was flagged as spam.");

            PersistAttachments(result.SubmissionId, attachments);
            return result.SubmissionId;
        }

        private void ClaimIfNeeded(int submissionId, UserContext actor)
        {
            var task = GetOpenTask(submissionId);
            if (task == null || task.Status != WorkflowTaskStatus.Pending)
                return;

            _workflowTasks.ClaimTaskAsync(task.TaskId, actor, "Starter sample claim", CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        private void ApproveTask(int submissionId, UserContext actor, string comment)
        {
            var task = GetOpenTask(submissionId);
            if (task == null)
                throw new InvalidOperationException("No open workflow task found for submission " + submissionId + ".");

            _workflowTasks.ApproveTaskAsync(task.TaskId, actor, comment, null, CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        private void RejectTask(int submissionId, UserContext actor, string comment)
        {
            var task = GetOpenTask(submissionId);
            if (task == null)
                throw new InvalidOperationException("No open workflow task found for submission " + submissionId + ".");

            _workflowTasks.RejectTaskAsync(task.TaskId, actor, comment, null, CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        private void BackdateActiveTask(int submissionId, int createdHoursAgo, int dueHoursAgo)
        {
            var task = GetOpenTask(submissionId);
            if (task == null)
                return;

            task.CreatedAt = DateTime.UtcNow.AddHours(-Math.Abs(createdHoursAgo));
            task.DueAt = DateTime.UtcNow.AddHours(-Math.Abs(dueHoursAgo));
            _workflowRepo.SaveTask(task);
        }

        private WorkflowTaskInstance GetOpenTask(int submissionId)
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                var items = _workflowRepo.ListTasks(new WorkflowTaskQuery
                {
                    SubmissionId = submissionId,
                    OpenOnly = true,
                    PageIndex = 0,
                    PageSize = 20
                }) ?? new List<WorkflowTaskInstance>();

                var task = items.OrderByDescending(t => t.CreatedAt).FirstOrDefault();
                if (task != null || attempt == 4)
                    return task;

                Thread.Sleep(150);
            }

            return null;
        }

        private void SeedGeneratedSamples(int formId, StarterSeedUser employee, StarterSeedUser manager, StarterSeedUser hr)
        {
            var generated = new[]
            {
                new { Name = "Nina Employee", Department = "Finance", LeaveType = "Annual Leave", FromDate = "2026-07-03", ToDate = "2026-07-05", Status = "pending_manager", Note = "Summer travel with supporting itinerary." },
                new { Name = "Owen Employee", Department = "Operations", LeaveType = "Personal Leave", FromDate = "2026-07-07", ToDate = "2026-07-07", Status = "pending_manager", Note = "Personal appointment requiring same-day manager review." },
                new { Name = "Piper Employee", Department = "Marketing", LeaveType = "Work From Home", FromDate = "2026-07-08", ToDate = "2026-07-08", Status = "pending_manager", Note = "One-day remote work request for household repair coverage." },
                new { Name = "Quinn Employee", Department = "Sales", LeaveType = "Annual Leave", FromDate = "2026-07-11", ToDate = "2026-07-13", Status = "pending_manager", Note = "Manager queue sample for multi-day annual leave review." },
                new { Name = "Riley Employee", Department = "Finance", LeaveType = "Sick Leave", FromDate = "2026-07-14", ToDate = "2026-07-15", Status = "pending_manager", Note = "Clinic certificate is attached and still waiting for manager triage." },
                new { Name = "Sage Employee", Department = "Operations", LeaveType = "Work From Home", FromDate = "2026-07-16", ToDate = "2026-07-17", Status = "pending_manager", Note = "Remote work extension still queued for manager approval." },
                new { Name = "Theo Employee", Department = "Marketing", LeaveType = "Annual Leave", FromDate = "2026-07-20", ToDate = "2026-07-22", Status = "pending_manager", Note = "Vacation request staged to keep the manager board large enough for pager QA." },
                new { Name = "Uma Employee", Department = "Sales", LeaveType = "Personal Leave", FromDate = "2026-07-23", ToDate = "2026-07-24", Status = "pending_hr", Note = "Manager approved; HR now validates coverage handoff." },
                new { Name = "Vera Employee", Department = "Finance", LeaveType = "Annual Leave", FromDate = "2026-07-28", ToDate = "2026-07-30", Status = "pending_hr", Note = "HR review sample kept for second-stage queue testing." },
                new { Name = "Wyatt Employee", Department = "Operations", LeaveType = "Annual Leave", FromDate = "2026-07-31", ToDate = "2026-08-02", Status = "rejected_hr", Note = "Rejected because this window overlaps the warehouse inventory count." },
                new { Name = "Xena Employee", Department = "Marketing", LeaveType = "Sick Leave", FromDate = "2026-08-04", ToDate = "2026-08-04", Status = "rejected_manager", Note = "Manager rejected because the supporting note lacks clinic details." },
                new { Name = "Yuri Employee", Department = "Sales", LeaveType = "Work From Home", FromDate = "2026-08-05", ToDate = "2026-08-06", Status = "approved", Note = "Approved remote work sample for customer-renewal coverage." }
            };

            for (var i = 0; i < generated.Length; i++)
            {
                var sample = generated[i];
                var attachment = CreateLeaveAttachment(
                    formId,
                    sample.Name.ToLowerInvariant().Replace(" ", "-") + "-supporting-note.pdf",
                    "Leave starter attachment",
                    "Employee: " + sample.Name,
                    "Department: " + sample.Department,
                    "Request: " + sample.Note);

                var submissionId = SubmitWorkflowSample(formId, employee.UserId, BuildSampleData(
                    sample.Name,
                    employee.Email,
                    sample.Department,
                    sample.LeaveType,
                    sample.FromDate,
                    sample.ToDate,
                    manager.Email,
                    sample.Note,
                    attachment));

                if (string.Equals(sample.Status, "pending_manager", StringComparison.OrdinalIgnoreCase))
                {
                    BackdateActiveTask(submissionId, 12 + i, 2 + (i % 4));
                    continue;
                }

                ClaimIfNeeded(submissionId, manager.ToContext());

                if (string.Equals(sample.Status, "rejected_manager", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, manager.ToContext(), "Manager requested a clearer supporting document before approval.");
                    continue;
                }

                ApproveTask(submissionId, manager.ToContext(), "Manager approved starter sample " + (i + 1) + ".");

                if (string.Equals(sample.Status, "pending_hr", StringComparison.OrdinalIgnoreCase))
                    continue;

                ClaimIfNeeded(submissionId, hr.ToContext());

                if (string.Equals(sample.Status, "rejected_hr", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, hr.ToContext(), "HR rejected this window because the staffing plan is already locked.");
                    continue;
                }

                ApproveTask(submissionId, hr.ToContext(), "HR finalized starter sample " + (i + 1) + ".");
            }
        }

        private StarterSeedAttachment CreateLeaveAttachment(int formId, string fileName, string title, params string[] lines)
        {
            return StarterSeedAttachmentFactory.CreatePdfAttachment(formId, SupportingDocumentsFieldKey, fileName, title, lines);
        }

        private void PersistAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? Array.Empty<StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;

            _platform.PersistSeededAttachments(submissionId, list);
        }

        private Dictionary<string, int> GetSampleStatusCounts(int formId)
        {
            var items = _submissions.List(formId, pageIndex: 0, pageSize: 200).Items ?? new List<SubmissionInfo>();
            return items
                .GroupBy(item => string.IsNullOrWhiteSpace(item.Status) ? "new" : item.Status)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
        }

        private void UpsertQuery(int portalId, string appKey, AppQueryDefinitionInfo query)
        {
            var existing = _queries.Get(portalId, appKey, query.QueryKey);
            if (existing != null)
            {
                query.QueryId = existing.QueryId;
                query.CreatedOnUtc = existing.CreatedOnUtc;
                query.CreatedByUserId = existing.CreatedByUserId;
            }
            _queries.Save(portalId, appKey, query);
        }

        private void UpsertView(int formId, FormViewInfo candidate)
        {
            var existing = (_phase2.GetFormViews(formId) ?? new List<FormViewInfo>())
                .FirstOrDefault(view => string.Equals(view.ViewKey, candidate.ViewKey, StringComparison.OrdinalIgnoreCase));
            if (existing != null)
            {
                candidate.ViewId = existing.ViewId;
                candidate.CreatedOnUtc = existing.CreatedOnUtc;
            }

            _phase2.SaveFormView(candidate);
        }

        private static StarterCredentialInfo ToCredential(StarterSeedUser user, string roleName)
        {
            return new StarterCredentialInfo
            {
                RoleName = roleName,
                UserName = user.UserName,
                DisplayName = user.DisplayName,
                Email = user.Email,
                Password = user.Password
            };
        }

        private static string BuildUrl(string homeUrl, string suffix)
        {
            var baseUrl = (homeUrl ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(baseUrl))
                return suffix ?? string.Empty;

            if (baseUrl.Contains("?"))
                return baseUrl + "&" + (suffix ?? string.Empty).TrimStart('?', '&');

            return baseUrl.TrimEnd('/') + (suffix ?? string.Empty);
        }

        private static string BuildSeedIpAddress(int seed)
        {
            return "203.0.113." + Math.Max(10, seed % 240);
        }

        private static Dictionary<string, object> BuildSampleData(
            string employeeName,
            string employeeEmail,
            string department,
            string leaveType,
            string fromDate,
            string toDate,
            string managerEmail,
            string reason,
            params StarterSeedAttachment[] attachments)
        {
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["employee_name"] = employeeName,
                ["employee_email"] = employeeEmail,
                ["department"] = department,
                ["leave_type"] = leaveType,
                ["from_date"] = fromDate,
                ["to_date"] = toDate,
                ["manager_email"] = managerEmail,
                ["delegate_contact"] = "Coverage buddy: support desk",
                ["reason"] = reason
            };

            var files = (attachments ?? Array.Empty<StarterSeedAttachment>())
                .Where(x => x != null)
                .Select(x => x.ToSubmissionValue())
                .Cast<object>()
                .ToList();
            if (files.Count > 0)
                data[SupportingDocumentsFieldKey] = files;

            return data;
        }

        private static FormSchema BuildSchema()
        {
            return new FormSchema
            {
                Version = "1.0",
                Settings = new FormSettings
                {
                    LabelPosition = "top",
                    RateLimitWindowMinutes = 2,
                    // [StarterSeedRateLimit v20260518-08] Starter seeds ~20 sample
                    // submissions from the same IP back-to-back. Raise the cap so
                    // the seeded run fits inside one window. Admin can lower later
                    // via Form Settings if they keep the starter form in production.
                    RateLimitMaxPerWindow = 100
                },
                Fields = new List<FormField>
                {
                    new FormField { Key = "employee_name", Type = "Text", Label = "Employee Name", Placeholder = "Full name", Required = true, Width = "col-6", Order = 10 },
                    new FormField { Key = "employee_email", Type = "Email", Label = "Employee Email", Placeholder = "name@company.com", Required = true, Width = "col-6", Order = 20 },
                    new FormField
                    {
                        Key = "department",
                        Type = "Select",
                        Label = "Department",
                        Required = true,
                        Width = "col-6",
                        Order = 30,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Operations", Value = "Operations" },
                            new MegaForm.Core.Models.FieldOption { Label = "Finance", Value = "Finance" },
                            new MegaForm.Core.Models.FieldOption { Label = "Marketing", Value = "Marketing" },
                            new MegaForm.Core.Models.FieldOption { Label = "Sales", Value = "Sales" }
                        }
                    },
                    new FormField
                    {
                        Key = "leave_type",
                        Type = "Select",
                        Label = "Leave Type",
                        Required = true,
                        Width = "col-6",
                        Order = 40,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Annual Leave", Value = "Annual Leave" },
                            new MegaForm.Core.Models.FieldOption { Label = "Sick Leave", Value = "Sick Leave" },
                            new MegaForm.Core.Models.FieldOption { Label = "Work From Home", Value = "Work From Home" },
                            new MegaForm.Core.Models.FieldOption { Label = "Personal Leave", Value = "Personal Leave" }
                        }
                    },
                    new FormField { Key = "from_date", Type = "Date", Label = "From Date", Required = true, Width = "col-6", Order = 50 },
                    new FormField { Key = "to_date", Type = "Date", Label = "To Date", Required = true, Width = "col-6", Order = 60 },
                    new FormField { Key = "manager_email", Type = "Email", Label = "Manager Email", Placeholder = "manager@company.com", Required = true, Width = "col-6", Order = 70 },
                    new FormField { Key = "delegate_contact", Type = "Text", Label = "Coverage / Delegate", Placeholder = "Who covers urgent work?", Width = "col-6", Order = 80 },
                    new FormField { Key = "reason", Type = "Textarea", Label = "Reason", Placeholder = "Reason for leave request", Required = true, Width = "col-12", Order = 90 },
                    new FormField
                    {
                        Key = SupportingDocumentsFieldKey,
                        Type = "File",
                        Label = "Supporting Documents",
                        HelpText = "Attach travel approval, medical certificate, or any supporting note for this leave request.",
                        Width = "col-12",
                        Order = 100,
                        FileSettings = new FileFieldSettings
                        {
                            MaxSizeMB = 10,
                            MaxFiles = 2,
                            AllowedExtensions = new List<string> { ".pdf", ".png", ".jpg", ".docx" }
                        }
                    }
                }
            };
        }

        private static WorkflowDefinition BuildWorkflow(int formId)
        {
            var managerNode = new WorkflowNode
            {
                Id = "manager-approval",
                Type = WorkflowNodeType.Approval,
                Label = "Manager Approval",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 100, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { ManagerRole },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true,
                    AllowForward = true,
                    AllowReassign = true,
                    CommentRequiredOnReject = true,
                    DueInHours = 24,
                    PendingSubmissionStatus = "waiting_manager",
                    ApprovedSubmissionStatus = "waiting_hr",
                    RejectedSubmissionStatus = "rejected_manager"
                })
            };

            var hrNode = new WorkflowNode
            {
                Id = "hr-review",
                Type = WorkflowNodeType.Approval,
                Label = "HR Review",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 430, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { HrRole },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true,
                    AllowForward = true,
                    AllowReassign = true,
                    CommentRequiredOnReject = true,
                    DueInHours = 12,
                    PendingSubmissionStatus = "waiting_hr",
                    ApprovedSubmissionStatus = "approved",
                    RejectedSubmissionStatus = "rejected_hr"
                })
            };

            var approvedEnd = new WorkflowNode
            {
                Id = "end-approved",
                Type = WorkflowNodeType.End,
                Label = "Approved",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 760, Y = 60 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Leave request approved."
                })
            };

            var rejectedEnd = new WorkflowNode
            {
                Id = "end-rejected",
                Type = WorkflowNodeType.End,
                Label = "Rejected",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 760, Y = 240 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Leave request closed as rejected."
                })
            };

            return new WorkflowDefinition
            {
                FormId = formId,
                Name = "Leave Request Approval Starter",
                StartNodeId = managerNode.Id,
                Nodes = new List<WorkflowNode> { managerNode, hrNode, approvedEnd, rejectedEnd },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge { SourceNodeId = managerNode.Id, SourceHandle = "approved", TargetNodeId = hrNode.Id, Label = "Approved" },
                    new WorkflowEdge { SourceNodeId = managerNode.Id, SourceHandle = "rejected", TargetNodeId = rejectedEnd.Id, Label = "Rejected" },
                    new WorkflowEdge { SourceNodeId = hrNode.Id, SourceHandle = "approved", TargetNodeId = approvedEnd.Id, Label = "Approved" },
                    new WorkflowEdge { SourceNodeId = hrNode.Id, SourceHandle = "rejected", TargetNodeId = rejectedEnd.Id, Label = "Rejected" }
                },
                Settings = new WorkflowSettings
                {
                    EnableExecutionLog = true,
                    ExecutionTimeoutSeconds = 180
                }
            };
        }

        private static Dictionary<string, object> ToConfig<T>(T config)
        {
            return JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(config))
                   ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }

        private static FormViewInfo BuildBoardView(int formId)
        {
            var wrapperTemplate = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px\">",
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #93c5fd;border-radius:22px;background:linear-gradient(135deg,#eff6ff 0%,#ffffff 58%,#f0fdf4 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8;font-weight:800\">Business App Starter</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Leave Request Queue</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Managers review leave coverage and route approved requests to HR. Open any row for the request narrative, delegate contact, and date range before taking action in Workflow Inbox.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bfdbfe\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Queue</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Manager Review</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bfdbfe\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Outcome</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Route to HR</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#eff6ff\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Employee</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Leave Window</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Stage</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Submitted</th>",
                "        </tr>",
                "      </thead>",
                "      <tbody>{{rows}}</tbody>",
                "    </table>",
                "  </section>",
                "</div>"
            });

            var settings = new ListViewSettings
            {
                FormId = formId,
                Title = "Leave Request Queue",
                PageSize = StarterListPageSize,
                EnableSearch = true,
                EnableSort = true,
                EmptyMessage = "No leave requests are waiting right now.",
                Fields = new List<ListViewFieldInfo>
                {
                    new ListViewFieldInfo { Key = "employee_name", Label = "Employee Name", Type = "Text" },
                    new ListViewFieldInfo { Key = "department", Label = "Department", Type = "Select" },
                    new ListViewFieldInfo { Key = "leave_type", Label = "Leave Type", Type = "Select" },
                    new ListViewFieldInfo { Key = "from_date", Label = "From Date", Type = "Date" },
                    new ListViewFieldInfo { Key = "to_date", Label = "To Date", Type = "Date" }
                },
                RowTemplate = string.Join("\n", new[]
                {
                    "<tr class=\"mf-preset-row\">",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top\">",
                    "    <div style=\"font-weight:700;color:#0f172a;line-height:1.35\">{{field:employee_name}}</div>",
                    "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:department}} / {{field:leave_type}}</div>",
                    "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:supporting_documents}}</div>",
                    "  </td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155;white-space:nowrap\">{{field:from_date|format=yyyy-MM-dd}} -> {{field:to_date|format=yyyy-MM-dd}}</td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:3px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px\">{{submission:date|format=yyyy-MM-dd}}</td>",
                    "</tr>"
                }),
                WrapperTemplate = wrapperTemplate
            };
            var detailTemplate = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:employee_name}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">{{field:department}} / {{field:leave_type}} / {{submission:status}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>From:</strong> {{field:from_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>To:</strong> {{field:to_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Manager:</strong> {{field:manager_email}}</div>",
                "    <div><strong>Delegate:</strong> {{field:delegate_contact}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:reason}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#334155\"><strong>Supporting Documents:</strong> {{field:supporting_documents}}</section>",
                "</article>"
            });

            var configJson = JsonConvert.SerializeObject(new
            {
                title = settings.Title,
                pageSize = settings.PageSize,
                enableSearch = settings.EnableSearch,
                enableSort = settings.EnableSort,
                emptyMessage = settings.EmptyMessage,
                fields = settings.Fields,
                rowTemplate = settings.RowTemplate,
                wrapperTemplate = wrapperTemplate,
                detailTemplate = detailTemplate
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "leave-request-board",
                QueryKey = "pending-manager",
                ViewType = "listview",
                ViewName = "Leave Request Board",
                IsDefault = true,
                SortOrder = 10,
                ConfigJson = configJson,
                CustomHtml = string.Empty,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private static FormViewInfo BuildRegisterView(int formId)
        {
            var wrapperTemplate = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px\">",
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #86efac;border-radius:22px;background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 58%,#eff6ff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#15803d;font-weight:800\">Approved Leave</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Leave Register</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">HR uses this register to review approved requests, staffing coverage, and completed leave decisions that are ready for payroll and planning handoff.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Stage</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Approved</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Use</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Calendar / Payroll</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#f0fdf4\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Employee</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Department</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Leave Type</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Date Range</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Status</th>",
                "        </tr>",
                "      </thead>",
                "      <tbody>{{rows}}</tbody>",
                "    </table>",
                "  </section>",
                "</div>"
            });

            var detailTemplate = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #dcfce7;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:employee_name}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">{{field:department}} / {{field:leave_type}} / {{submission:status}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>From:</strong> {{field:from_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>To:</strong> {{field:to_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Manager:</strong> {{field:manager_email}}</div>",
                "    <div><strong>Delegate:</strong> {{field:delegate_contact}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:reason}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#334155\"><strong>Supporting Documents:</strong> {{field:supporting_documents}}</section>",
                "</article>"
            });

            var rowTemplate = string.Join("\n", new[]
            {
                "<tr class=\"mf-preset-row\">",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top\">",
                "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:employee_name}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:manager_email}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:supporting_documents}}</div>",
                "  </td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:department}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:leave_type}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155;white-space:nowrap\">{{field:from_date|format=yyyy-MM-dd}} -> {{field:to_date|format=yyyy-MM-dd}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                "</tr>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "leave-request-register",
                QueryKey = "approved-requests",
                ViewType = "listview",
                ViewName = "Leave Request Register",
                IsDefault = false,
                SortOrder = 20,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = "Leave Register",
                    pageSize = StarterListPageSize,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No approved leave requests are available in the register yet.",
                    fields = new[]
                    {
                        new { key = "employee_name", label = "Employee Name", type = "Text" },
                        new { key = "department", label = "Department", type = "Select" },
                        new { key = "leave_type", label = "Leave Type", type = "Select" },
                        new { key = "from_date", label = "From Date", type = "Date" },
                        new { key = "to_date", label = "To Date", type = "Date" }
                    },
                    rowTemplate = rowTemplate,
                    wrapperTemplate = wrapperTemplate,
                    detailTemplate = detailTemplate
                }),
                CustomHtml = string.Empty,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private static FormViewInfo BuildCardView(int formId)
        {
            var template = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:12px;padding:20px;border:1px solid #bfdbfe;border-radius:22px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);box-shadow:0 18px 40px rgba(15,23,42,.08)\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:flex-start\">",
                "    <div>",
                "      <div style=\"font-size:22px;font-weight:800;color:#0f172a;line-height:1.2\">{{field:employee_name}}</div>",
                "      <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:department}} / {{field:leave_type}}</div>",
                "    </div>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700\">{{submission:status}}</span>",
                "  </div>",
                "  <div style=\"display:flex;gap:8px;flex-wrap:wrap\">",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:11px;font-weight:700\">{{field:leave_type}}</span>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#f8fafc;color:#475569;font-size:11px;font-weight:700\">{{field:department}}</span>",
                "  </div>",
                "  <div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;font-size:13px;color:#334155\">",
                "    <div><strong>Range:</strong> {{field:from_date|format=yyyy-MM-dd}} -> {{field:to_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Manager:</strong> {{field:manager_email}}</div>",
                "    <div><strong>Delegate:</strong> {{field:delegate_contact}}</div>",
                "  </div>",
                "  <div style=\"font-size:13px;color:#2563eb\">{{field:supporting_documents}}</div>",
                "  <div style=\"font-size:14px;line-height:1.75;color:#475569\">{{field:reason}}</div>",
                "</article>"
            });
            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "leave-request-card",
                QueryKey = "my-requests",
                ViewType = "card",
                ViewName = "Leave Request Card",
                IsDefault = false,
                SortOrder = 30,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    cardFields = "employee_name,department,leave_type,from_date,to_date,manager_email,reason,supporting_documents",
                    cardTemplate = template
                }),
                CustomHtml = template,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private sealed class StarterSeedUser
        {
            public int UserId { get; set; }
            public string UserName { get; set; }
            public string DisplayName { get; set; }
            public string Email { get; set; }
            public string RoleName { get; set; }
            public string Password { get; set; }

            public UserContext ToContext()
            {
                return new UserContext
                {
                    UserId = UserId,
                    UserName = UserName,
                    DisplayName = DisplayName,
                    Email = Email,
                    IsAuthenticated = true,
                    IsAdmin = false,
                    IsSuperUser = false,
                    Roles = new List<string> { RoleName },
                    IpAddress = string.Empty
                };
            }
        }
    }
}
