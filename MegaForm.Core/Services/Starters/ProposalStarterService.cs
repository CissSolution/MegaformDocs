// ============================================================
// MegaForm Core — Proposal Business Starter
// ----------------------------------------------------------------
// Platform-agnostic seeded "Business App" for proposal review
// (Requester → Manager → Finance). Same Core/adapter shape as
// LeaveRequestStarterService; only the seed data differs.
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
    public class ProposalStarterResult
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
        public string FinanceBoardUrl { get; set; }
        public string RegisterUrl { get; set; }
        public string CardUrl { get; set; }
        public Dictionary<string, int> SampleStatusCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }

    public class ProposalStarterService
    {
        public const string StarterAppScope = AppProfileScopes.Proposal;
        public const string StarterAppKey = "proposal-starter";
        public const string StarterAppName = "Proposal Starter";
        public const string StarterFormTitle = "Proposal Starter";
        public const string RegisteredUsersRole = "Registered Users";
        public const string RequesterRole = "Proposal Requesters";
        public const string ManagerRole = "Proposal Managers";
        public const string FinanceRole = "Proposal Finance";
        public const string StarterPassword = "";
        public const string RequesterUserName = "proposal.requester";
        public const string ManagerUserName = "proposal.manager";
        public const string FinanceUserName = "proposal.finance";
        private const int StarterListPageSize = 8;
        private const string ProposalDocumentsFieldKey = "proposal_documents";

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

        public ProposalStarterService(
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

        public ProposalStarterResult EnsureStarter(
            int portalId,
            int moduleId,
            string homeUrl,
            UserContext actor)
        {
            // [DnnPortalIdZero v20260518-08] See LeaveRequestStarterService.
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

            var requester = EnsureUser(portalId, RequesterRole, RequesterUserName, "Proposal Requester", "proposal.requester@megaform.local", actor);
            var manager = EnsureUser(portalId, ManagerRole, ManagerUserName, "Proposal Manager", "proposal.manager@megaform.local", actor);
            var finance = EnsureUser(portalId, FinanceRole, FinanceUserName, "Proposal Finance", "proposal.finance@megaform.local", actor);

            SeedSamples(formId, requester, manager, finance);

            return new ProposalStarterResult
            {
                AppId = app.AppId,
                AppKey = app.AppKey,
                AppScope = app.AppScope,
                FormId = formId,
                FormTitle = StarterFormTitle,
                DefaultViewKey = "proposal-review-board",
                SubmitUrl = BuildUrl(homeUrl, "?view=form"),
                InboxUrl = BuildUrl(homeUrl, "?mfpanel=inbox"),
                BoardUrl = BuildUrl(homeUrl, "?vk=proposal-review-board"),
                FinanceBoardUrl = BuildUrl(homeUrl, "?vk=proposal-finance-board"),
                RegisterUrl = BuildUrl(homeUrl, "?vk=proposal-register"),
                CardUrl = BuildUrl(homeUrl, "?vk=proposal-card"),
                ViewKeys = new List<string>
                {
                    "proposal-review-board",
                    "proposal-finance-board",
                    "proposal-register",
                    "proposal-card"
                },
                Credentials = new List<StarterCredentialInfo>
                {
                    ToCredential(requester, RequesterRole),
                    ToCredential(manager, ManagerRole),
                    ToCredential(finance, FinanceRole)
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
            app.Description = "Seeded MegaForm business starter for proposal intake, approvals, finance review, and sample data.";
            app.AppScope = StarterAppScope;
            app.Icon = "fa-solid fa-file-signature";
            app.AccentColor = "#0f766e";
            app.IsEnabled = true;
            app.SortOrder = 20;
            app.CreatedByUserId = app.CreatedByUserId > 0 ? app.CreatedByUserId : actor.UserId;
            app.ModifiedByUserId = actor.UserId;
            app.SettingsJson = JsonConvert.SerializeObject(new
            {
                starter = "proposal",
                defaultViewKey = "proposal-review-board"
            });
            app.ResourcesJson = JsonConvert.SerializeObject(new
            {
                submitLabel = "Submit proposal",
                inboxLabel = "Proposal inbox",
                boardLabel = "Review board"
            });

            var manifest = new AppManifestDefinition
            {
                Profile = new AppProfileDefinition
                {
                    Scope = StarterAppScope,
                    DisplayName = "Proposals",
                    EntitySingular = "Proposal",
                    EntityPlural = "Proposals",
                    EnableWorkflowInbox = true,
                    EnableAssignments = true,
                    EnableComments = true
                },
                Settings = new Dictionary<string, string>
                {
                    ["starter"] = "proposal",
                    ["defaultViewKey"] = "proposal-review-board"
                },
                Resources = new Dictionary<string, string>
                {
                    ["submitLabel"] = "Submit proposal",
                    ["inboxLabel"] = "Proposal inbox",
                    ["registerLabel"] = "Approved proposals"
                }
            };

            _apps.Save(app, manifest);
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
                starter = "proposal",
                appProfile = StarterAppScope
            });

            var form = existing ?? new FormInfo();
            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = StarterFormTitle;
            form.Description = "Seeded proposal starter with submitter, manager, finance, board, register, and sample submissions.";
            form.SchemaJson = JsonConvert.SerializeObject(schema);
            form.SettingsJson = settingsJson;
            form.Status = "Published";
            form.SubmitButtonText = "Submit Proposal";
            form.SuccessMessage = "Your proposal was submitted for manager review.";
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
                QueryKey = "my-proposals",
                QueryName = "My Proposals",
                Description = "Starter query placeholder for requesters to review their own proposals.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { field = "requester_email", source = "currentUser.email" }),
                SortOrder = 10,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-manager",
                QueryName = "Pending Manager Review",
                Description = "Starter queue for proposal manager approvals.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_manager" }),
                SortOrder = 20,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-finance",
                QueryName = "Pending Finance Review",
                Description = "Starter queue for proposal finance review.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_finance" }),
                SortOrder = 30,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "approved-proposals",
                QueryName = "Approved Proposals",
                Description = "Starter register for proposals already approved by finance.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "approved" }),
                SortOrder = 40,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
        }

        private void EnsureViews(int formId)
        {
            UpsertView(formId, BuildReviewBoardView(formId));
            UpsertView(formId, BuildFinanceBoardView(formId));
            UpsertView(formId, BuildRegisterView(formId));
            UpsertView(formId, BuildCardView(formId));
        }

        private void EnsurePermissions(int formId)
        {
            _phase2.SaveFormPermissions(formId, new List<FormPermissionInfo>
            {
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = RequesterRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = ManagerRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "view", PrincipalType = "role", RoleName = FinanceRole, Scope = "all", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "approve", PrincipalType = "role", RoleName = ManagerRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "approve", PrincipalType = "role", RoleName = FinanceRole, Scope = "team", IsGranted = true },
                new FormPermissionInfo { FormId = formId, PermissionType = "export", PrincipalType = "role", RoleName = FinanceRole, Scope = "all", IsGranted = true }
            });
        }

        private void ApplyWorkflow(int formId)
        {
            var workflow = BuildWorkflow(formId);
            _workflowRepo.SaveDraft(formId, workflow);
            _workflowRepo.ApplyDraft(formId, "proposal-starter");
        }

        private StarterSeedUser EnsureUser(int portalId, string roleName, string userName, string displayName, string email, UserContext actor)
        {
            try
            {
                _identityProvisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Description = "Seeded by MegaForm proposal starter.",
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
            var message = "Proposal starter failed to " + step + ". " + FlattenExceptionMessage(ex);
            _log?.LogError(nameof(ProposalStarterService), message, ex);
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

        private void SeedSamples(int formId, StarterSeedUser requester, StarterSeedUser manager, StarterSeedUser finance)
        {
            var pendingManagerId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Northwind Expansion 2026",
                requester.DisplayName,
                requester.Email,
                "Sales",
                "Regional Growth",
                "Northwind",
                125000,
                "2026-07-10",
                finance.Email,
                "Expand the Northwind opportunity into two additional regions with a dedicated field campaign.",
                "Targeting 18% new revenue growth over two quarters."));
            BackdateActiveTask(pendingManagerId, 26, 5);

            var pendingManagerFollowUpId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "APAC Distribution Reset",
                requester.DisplayName,
                requester.Email,
                "Sales",
                "Regional Growth",
                "Litware",
                148000,
                "2026-07-18",
                finance.Email,
                "Reposition the APAC distributor network with a revised account plan and channel onboarding package.",
                "Requires manager sign-off before the regional field launch can be scheduled."));
            BackdateActiveTask(pendingManagerFollowUpId, 18, 4);

            var rejectedManagerId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Legacy Hosting Renewal",
                requester.DisplayName,
                requester.Email,
                "Operations",
                "Cost Optimization",
                "Internal",
                38000,
                "2026-06-18",
                finance.Email,
                "Renew a legacy hosting contract without updated vendor terms.",
                "Rejected sample because the sourcing pack is incomplete."));
            ClaimIfNeeded(rejectedManagerId, manager.ToContext());
            RejectTask(rejectedManagerId, manager.ToContext(), "Please attach the updated vendor comparison before resubmitting.");

            var pendingFinanceId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Partner Webinar Campaign",
                requester.DisplayName,
                requester.Email,
                "Marketing",
                "Demand Generation",
                "Contoso",
                62000,
                "2026-06-28",
                finance.Email,
                "Manager already approved this partner campaign. Finance still needs to validate the spend envelope.",
                "Expected to generate 450 qualified leads."));
            ClaimIfNeeded(pendingFinanceId, manager.ToContext());
            ApproveTask(pendingFinanceId, manager.ToContext(), "Manager approved and routed to finance.");

            var pendingFinanceSecondId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Executive Briefing Series",
                requester.DisplayName,
                requester.Email,
                "Marketing",
                "Demand Generation",
                "Wingtip",
                84500,
                "2026-07-02",
                finance.Email,
                "Manager already approved this executive briefing series and finance must validate the event and media allocation.",
                "Expected to unlock cross-sell opportunities across three named accounts."));
            ClaimIfNeeded(pendingFinanceSecondId, manager.ToContext());
            ApproveTask(pendingFinanceSecondId, manager.ToContext(), "Manager approved and routed to finance for budget validation.");

            var approvedId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Enterprise Pilot Rollout",
                requester.DisplayName,
                requester.Email,
                "Finance",
                "Strategic Deal",
                "Fabrikam",
                210000,
                "2026-08-01",
                finance.Email,
                "Approved sample for the full proposal workflow path with manager and finance sign-off.",
                "Expected to secure a 3-year enterprise contract."));
            ClaimIfNeeded(approvedId, manager.ToContext());
            ApproveTask(approvedId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(approvedId, finance.ToContext());
            ApproveTask(approvedId, finance.ToContext(), "Finance validated the budget and approved the proposal.");

            var approvedSecondId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Channel Partner Enablement Sprint",
                requester.DisplayName,
                requester.Email,
                "Operations",
                "Cost Optimization",
                "Northwind",
                56000,
                "2026-06-21",
                finance.Email,
                "Approved sample covering a smaller operational proposal that still moves through the full manager and finance path.",
                "Expected to reduce onboarding turnaround by 25 percent across channel partners."));
            ClaimIfNeeded(approvedSecondId, manager.ToContext());
            ApproveTask(approvedSecondId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(approvedSecondId, finance.ToContext());
            ApproveTask(approvedSecondId, finance.ToContext(), "Finance approved the final proposal package.");

            var rejectedFinanceId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Q4 Industry Roadshow",
                requester.DisplayName,
                requester.Email,
                "Marketing",
                "Event Sponsorship",
                "Adventure Works",
                97000,
                "2026-09-12",
                finance.Email,
                "Rejected by finance because the requested sponsorship spend exceeds the approved event cap.",
                "Finance requested a reduced scope and revised budget."));
            ClaimIfNeeded(rejectedFinanceId, manager.ToContext());
            ApproveTask(rejectedFinanceId, manager.ToContext(), "Manager approved.");
            ClaimIfNeeded(rejectedFinanceId, finance.ToContext());
            RejectTask(rejectedFinanceId, finance.ToContext(), "Finance cannot approve this budget until scope and spend are reduced.");

            SeedGeneratedSamples(formId, requester, manager, finance);
        }

        private void ResetRuntimeData(int formId)
        {
            _platform.ResetFormRuntimeData(formId);
            StarterSeedAttachmentFactory.DeleteFieldAttachments(formId, ProposalDocumentsFieldKey);
        }

        private int SubmitWorkflowSample(int formId, int userId, Dictionary<string, object> data, params StarterSeedAttachment[] attachments)
        {
            var result = _submissionProcessor.ProcessAsync(
                formId,
                data,
                BuildSeedIpAddress(userId),
                "MegaForm ProposalStarter",
                userId,
                4.25d).GetAwaiter().GetResult();

            if (!result.Success || result.SubmissionId <= 0)
                throw new InvalidOperationException("Starter sample submission failed: " + (result.ErrorMessage ?? "Unknown error"));
            if (result.IsSpam)
                throw new InvalidOperationException("Starter sample submission " + result.SubmissionId + " was flagged as spam.");

            PersistAttachments(result.SubmissionId, attachments);
            return result.SubmissionId;
        }

        private void PersistAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? Array.Empty<StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;

            _platform.PersistSeededAttachments(submissionId, list);
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

        private void SeedGeneratedSamples(int formId, StarterSeedUser requester, StarterSeedUser manager, StarterSeedUser finance)
        {
            var generated = new[]
            {
                new { Title = "Field Enablement Sprint", Department = "Sales", Category = "Regional Growth", Client = "Northwind", Budget = 47000m, Due = "2026-07-24", Status = "pending_manager", Summary = "Field enablement package awaiting manager review.", Notes = "Needs leadership sign-off before launch." },
                new { Title = "Customer Reference Program", Department = "Marketing", Category = "Demand Generation", Client = "Contoso", Budget = 59000m, Due = "2026-07-27", Status = "pending_manager", Summary = "Reference program queued for manager validation.", Notes = "Cross-functional marketing pack needs approval." },
                new { Title = "Support Capacity Backfill", Department = "Operations", Category = "Cost Optimization", Client = "Internal", Budget = 41000m, Due = "2026-07-29", Status = "pending_manager", Summary = "Backfill request pending manager confirmation.", Notes = "Operational continuity plan attached in the business case." },
                new { Title = "Regional Demand Stack", Department = "Marketing", Category = "Demand Generation", Client = "Wingtip", Budget = 73000m, Due = "2026-08-02", Status = "pending_manager", Summary = "Additional manager-queue sample for campaign stack review.", Notes = "Deliberately left at manager stage for pager QA." },
                new { Title = "Renewal Rescue Playbook", Department = "Sales", Category = "Strategic Deal", Client = "Fabrikam", Budget = 88000m, Due = "2026-08-05", Status = "pending_manager", Summary = "Commercial recovery plan still waiting for manager sign-off.", Notes = "Keep this on the manager board for review-volume testing." },
                new { Title = "Warehouse Automation Pilot", Department = "Operations", Category = "Cost Optimization", Client = "Internal", Budget = 97000m, Due = "2026-08-07", Status = "pending_manager", Summary = "Automation pilot remains in manager review for board pagination.", Notes = "Finance should only see this after a manager decision." },
                new { Title = "Account Expansion Lab", Department = "Sales", Category = "Regional Growth", Client = "Adventure Works", Budget = 132000m, Due = "2026-08-09", Status = "pending_manager", Summary = "Manager review queue intentionally holds this large expansion case for pagination QA.", Notes = "Keep this on the board so the first review surface has visible paging." },
                new { Title = "Leadership Podcast Series", Department = "Marketing", Category = "Demand Generation", Client = "Northwind", Budget = 52000m, Due = "2026-08-11", Status = "pending_finance", Summary = "Content series approved by manager and awaiting finance.", Notes = "Review production and media split." },
                new { Title = "Process Simplification Sprint", Department = "Operations", Category = "Cost Optimization", Client = "Internal", Budget = 46000m, Due = "2026-08-12", Status = "approved", Summary = "Approved internal optimization sprint.", Notes = "Finance cleared the final spend envelope." },
                new { Title = "Legacy CRM Cleanup", Department = "Operations", Category = "Cost Optimization", Client = "Internal", Budget = 36000m, Due = "2026-08-13", Status = "rejected_manager", Summary = "Rejected by manager because the scope is under-defined.", Notes = "Needs rescoping before another review." },
                new { Title = "Industry Summit Activation", Department = "Marketing", Category = "Event Sponsorship", Client = "Contoso", Budget = 124000m, Due = "2026-08-16", Status = "rejected_finance", Summary = "Finance rejected the event activation budget.", Notes = "Budget exceeds approved event threshold." },
                new { Title = "Partner Onboarding Toolkit", Department = "Sales", Category = "Regional Growth", Client = "Litware", Budget = 61000m, Due = "2026-08-18", Status = "approved", Summary = "Approved onboarding toolkit with final budget clearance.", Notes = "Ready for execution planning." }
            };

            foreach (var sample in generated)
            {
                var attachment = CreateProposalAttachment(
                    formId,
                    sample.Title.ToLowerInvariant().Replace(" ", "-").Replace("/", "-") + ".pdf",
                    "Proposal starter attachment",
                    "Proposal: " + sample.Title,
                    "Client: " + sample.Client,
                    "Budget: " + sample.Budget.ToString("0.##"),
                    sample.Summary);

                var submissionId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                    sample.Title,
                    requester.DisplayName,
                    requester.Email,
                    sample.Department,
                    sample.Category,
                    sample.Client,
                    sample.Budget,
                    sample.Due,
                    finance.Email,
                    sample.Summary,
                    sample.Notes,
                    attachment),
                    attachment);

                if (string.Equals(sample.Status, "pending_manager", StringComparison.OrdinalIgnoreCase))
                    continue;

                ClaimIfNeeded(submissionId, manager.ToContext());

                if (string.Equals(sample.Status, "rejected_manager", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, manager.ToContext(), "Manager requested a clearer business case before approval.");
                    continue;
                }

                ApproveTask(submissionId, manager.ToContext(), "Manager approved generated proposal sample.");

                if (string.Equals(sample.Status, "pending_finance", StringComparison.OrdinalIgnoreCase))
                    continue;

                ClaimIfNeeded(submissionId, finance.ToContext());

                if (string.Equals(sample.Status, "rejected_finance", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, finance.ToContext(), "Finance rejected the spend envelope for this starter sample.");
                    continue;
                }

                ApproveTask(submissionId, finance.ToContext(), "Finance approved generated proposal sample.");
            }
        }

        private StarterSeedAttachment CreateProposalAttachment(int formId, string fileName, string title, params string[] lines)
        {
            return StarterSeedAttachmentFactory.CreatePdfAttachment(formId, ProposalDocumentsFieldKey, fileName, title, lines);
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
            string proposalTitle,
            string requesterName,
            string requesterEmail,
            string department,
            string proposalType,
            string clientName,
            decimal budgetAmount,
            string targetCloseDate,
            string financeReviewerEmail,
            string executiveSummary,
            string expectedOutcome,
            params StarterSeedAttachment[] attachments)
        {
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["proposal_title"] = proposalTitle,
                ["requester_name"] = requesterName,
                ["requester_email"] = requesterEmail,
                ["department"] = department,
                ["proposal_type"] = proposalType,
                ["client_name"] = clientName,
                ["budget_amount"] = budgetAmount,
                ["target_close_date"] = targetCloseDate,
                ["finance_reviewer_email"] = financeReviewerEmail,
                ["executive_summary"] = executiveSummary,
                ["expected_outcome"] = expectedOutcome
            };

            var files = (attachments ?? Array.Empty<StarterSeedAttachment>())
                .Where(x => x != null)
                .Select(x => x.ToSubmissionValue())
                .Cast<object>()
                .ToList();
            if (files.Count > 0)
                data[ProposalDocumentsFieldKey] = files;

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
                    RateLimitMaxPerWindow = 100  // [StarterSeedRateLimit v20260518-08]
                },
                Fields = new List<FormField>
                {
                    new FormField { Key = "proposal_title", Type = "Text", Label = "Proposal Title", Placeholder = "Name of the proposal", Required = true, Width = "col-6", Order = 10 },
                    new FormField { Key = "requester_name", Type = "Text", Label = "Requester Name", Placeholder = "Full name", Required = true, Width = "col-6", Order = 20 },
                    new FormField { Key = "requester_email", Type = "Email", Label = "Requester Email", Placeholder = "name@company.com", Required = true, Width = "col-6", Order = 30 },
                    new FormField
                    {
                        Key = "department",
                        Type = "Select",
                        Label = "Department",
                        Required = true,
                        Width = "col-6",
                        Order = 40,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Sales", Value = "Sales" },
                            new MegaForm.Core.Models.FieldOption { Label = "Marketing", Value = "Marketing" },
                            new MegaForm.Core.Models.FieldOption { Label = "Finance", Value = "Finance" },
                            new MegaForm.Core.Models.FieldOption { Label = "Operations", Value = "Operations" }
                        }
                    },
                    new FormField
                    {
                        Key = "proposal_type",
                        Type = "Select",
                        Label = "Proposal Type",
                        Required = true,
                        Width = "col-6",
                        Order = 50,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Strategic Deal", Value = "Strategic Deal" },
                            new MegaForm.Core.Models.FieldOption { Label = "Regional Growth", Value = "Regional Growth" },
                            new MegaForm.Core.Models.FieldOption { Label = "Demand Generation", Value = "Demand Generation" },
                            new MegaForm.Core.Models.FieldOption { Label = "Cost Optimization", Value = "Cost Optimization" },
                            new MegaForm.Core.Models.FieldOption { Label = "Event Sponsorship", Value = "Event Sponsorship" }
                        }
                    },
                    new FormField { Key = "client_name", Type = "Text", Label = "Client / Account", Placeholder = "Customer or account name", Required = true, Width = "col-6", Order = 60 },
                    new FormField { Key = "budget_amount", Type = "Number", Label = "Budget Amount", Placeholder = "0", Required = true, Width = "col-6", Order = 70 },
                    new FormField { Key = "target_close_date", Type = "Date", Label = "Target Close Date", Required = true, Width = "col-6", Order = 80 },
                    new FormField { Key = "finance_reviewer_email", Type = "Email", Label = "Finance Reviewer Email", Placeholder = "finance@company.com", Required = true, Width = "col-6", Order = 90 },
                    new FormField { Key = "executive_summary", Type = "Textarea", Label = "Executive Summary", Placeholder = "Why should this proposal move forward?", Required = true, Width = "col-12", Order = 100 },
                    new FormField { Key = "expected_outcome", Type = "Textarea", Label = "Expected Outcome", Placeholder = "Expected revenue, impact, or decision outcome", Width = "col-12", Order = 110 },
                    new FormField { Key = ProposalDocumentsFieldKey, Type = "FileUpload", Label = "Attached Proposal Pack", Width = "col-12", Order = 120 }
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
                Position = new CanvasPosition { X = 120, Y = 120 },
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
                    ApprovedSubmissionStatus = "waiting_finance",
                    RejectedSubmissionStatus = "rejected_manager"
                })
            };

            var financeNode = new WorkflowNode
            {
                Id = "finance-review",
                Type = WorkflowNodeType.Approval,
                Label = "Finance Review",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 440, Y = 120 },
                Config = ToConfig(new ApprovalNodeConfig
                {
                    CandidateRoles = new List<string> { FinanceRole },
                    CandidateUsers = new List<string>(),
                    AllowClaim = true,
                    AllowForward = true,
                    AllowReassign = true,
                    CommentRequiredOnReject = true,
                    DueInHours = 16,
                    PendingSubmissionStatus = "waiting_finance",
                    ApprovedSubmissionStatus = "approved",
                    RejectedSubmissionStatus = "rejected_finance"
                })
            };

            var approvedEnd = new WorkflowNode
            {
                Id = "end-approved",
                Type = WorkflowNodeType.End,
                Label = "Approved",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 780, Y = 60 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Proposal approved."
                })
            };

            var rejectedEnd = new WorkflowNode
            {
                Id = "end-rejected",
                Type = WorkflowNodeType.End,
                Label = "Rejected",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 780, Y = 240 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Proposal closed as rejected."
                })
            };

            return new WorkflowDefinition
            {
                FormId = formId,
                Name = "Proposal Approval Starter",
                StartNodeId = managerNode.Id,
                Nodes = new List<WorkflowNode> { managerNode, financeNode, approvedEnd, rejectedEnd },
                Edges = new List<WorkflowEdge>
                {
                    new WorkflowEdge { SourceNodeId = managerNode.Id, SourceHandle = "approved", TargetNodeId = financeNode.Id, Label = "Approved" },
                    new WorkflowEdge { SourceNodeId = managerNode.Id, SourceHandle = "rejected", TargetNodeId = rejectedEnd.Id, Label = "Rejected" },
                    new WorkflowEdge { SourceNodeId = financeNode.Id, SourceHandle = "approved", TargetNodeId = approvedEnd.Id, Label = "Approved" },
                    new WorkflowEdge { SourceNodeId = financeNode.Id, SourceHandle = "rejected", TargetNodeId = rejectedEnd.Id, Label = "Rejected" }
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

        private static FormViewInfo BuildReviewBoardView(int formId)
        {
            var wrapperTemplate = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px\">",
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #fdba74;border-radius:22px;background:linear-gradient(135deg,#fff7ed 0%,#ffffff 58%,#fffbeb 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c2410c;font-weight:800\">Business App Starter</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Proposal Review Board</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Managers review active opportunities before finance approval. Open any row for the executive summary, expected outcome, and workflow context, then move into Workflow Inbox for claim and decision.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #fed7aa\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Queue</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Manager Review</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #fed7aa\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Handoff</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Route to Finance</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#fff7ed\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Proposal</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Commercial Fit</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Budget</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Stage</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Target Close</th>",
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
                Title = "Proposal Review Board",
                PageSize = StarterListPageSize,
                EnableSearch = true,
                EnableSort = true,
                EmptyMessage = "No proposals are waiting for manager review.",
                Fields = new List<ListViewFieldInfo>
                {
                    new ListViewFieldInfo { Key = "proposal_title", Label = "Proposal Title", Type = "Text" },
                    new ListViewFieldInfo { Key = "client_name", Label = "Client", Type = "Text" },
                    new ListViewFieldInfo { Key = "department", Label = "Department", Type = "Select" },
                    new ListViewFieldInfo { Key = "proposal_type", Label = "Proposal Type", Type = "Select" },
                    new ListViewFieldInfo { Key = "budget_amount", Label = "Budget", Type = "Number" }
                },
                RowTemplate = string.Join("\n", new[]
                {
                    "<tr class=\"mf-preset-row\">",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top\">",
                    "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:proposal_title}}</div>",
                    "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:client_name}}</div>",
                    "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:proposal_documents}}</div>",
                    "  </td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">",
                    "    <div style=\"font-weight:700\">{{field:department}}</div>",
                    "    <div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:proposal_type}}</div>",
                    "  </td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:800\">{{field:budget_amount}}</td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                    "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:12px;white-space:nowrap\">{{field:target_close_date|format=yyyy-MM-dd}}</td>",
                    "</tr>"
                }),
                WrapperTemplate = wrapperTemplate
            };

            var detailTemplate = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #d1fae5;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:proposal_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">{{field:client_name}} / {{field:proposal_type}} / {{submission:status}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Requester:</strong> {{field:requester_name}}</div>",
                "    <div><strong>Requester Email:</strong> {{field:requester_email}}</div>",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Budget:</strong> {{field:budget_amount}}</div>",
                "    <div><strong>Target Close:</strong> {{field:target_close_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Finance Reviewer:</strong> {{field:finance_reviewer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:executive_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Expected Outcome:</strong> {{field:expected_outcome}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#2563eb\"><strong>Attached Proposal Pack:</strong> {{field:proposal_documents}}</section>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "proposal-review-board",
                QueryKey = "pending-manager",
                ViewType = "listview",
                ViewName = "Proposal Review Board",
                IsDefault = true,
                SortOrder = 10,
                ConfigJson = JsonConvert.SerializeObject(new
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
                }),
                CustomHtml = string.Empty,
                CustomCss = string.Empty,
                PermissionsJson = "[]",
                CreatedOnUtc = DateTime.UtcNow
            };
        }

        private static FormViewInfo BuildFinanceBoardView(int formId)
        {
            var wrapperTemplate = string.Join("\n", new[]
            {
                "<div style=\"display:grid;gap:18px\">",
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #93c5fd;border-radius:22px;background:linear-gradient(135deg,#eff6ff 0%,#ffffff 56%,#ecfeff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8;font-weight:800\">Finance Gate</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Proposal Finance Board</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Finance reviewers confirm budget fit, target close confidence, and internal funding readiness before a proposal moves into the approved register.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bfdbfe\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Queue</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Finance Review</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bfdbfe\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Outcome</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Approve and Register</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#eff6ff\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Proposal</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Client / Dept</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Budget</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Target Close</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Stage</th>",
                "        </tr>",
                "      </thead>",
                "      <tbody>{{rows}}</tbody>",
                "    </table>",
                "  </section>",
                "</div>"
            });

            var detailTemplate = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:proposal_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">Finance review / {{submission:status}} / {{field:client_name}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Requester:</strong> {{field:requester_name}}</div>",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Proposal Type:</strong> {{field:proposal_type}}</div>",
                "    <div><strong>Budget:</strong> {{field:budget_amount}}</div>",
                "    <div><strong>Target Close:</strong> {{field:target_close_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Finance Reviewer:</strong> {{field:finance_reviewer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:executive_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Expected Outcome:</strong> {{field:expected_outcome}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#2563eb\"><strong>Attached Proposal Pack:</strong> {{field:proposal_documents}}</section>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "proposal-finance-board",
                QueryKey = "pending-finance",
                ViewType = "listview",
                ViewName = "Proposal Finance Board",
                IsDefault = false,
                SortOrder = 20,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = "Finance Review Board",
                    pageSize = StarterListPageSize,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No proposals are waiting for finance review.",
                    fields = new[]
                    {
                        new { key = "proposal_title", label = "Proposal Title", type = "Text" },
                        new { key = "client_name", label = "Client", type = "Text" },
                        new { key = "budget_amount", label = "Budget", type = "Number" },
                        new { key = "target_close_date", label = "Target Close", type = "Date" }
                    },
                    rowTemplate = string.Join("\n", new[]
                    {
                        "<tr class=\"mf-preset-row\">",
                        "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top\">",
                        "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:proposal_title}}</div>",
                        "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:client_name}}</div>",
                        "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:proposal_documents}}</div>",
                        "  </td>",
                        "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">",
                        "    <div style=\"font-weight:700\">{{field:department}}</div>",
                        "    <div style=\"margin-top:4px;font-size:12px;color:#64748b\">{{field:proposal_type}}</div>",
                        "  </td>",
                        "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:800\">{{field:budget_amount}}</td>",
                        "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155;white-space:nowrap\">{{field:target_close_date|format=yyyy-MM-dd}}</td>",
                        "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0\"><span style=\"display:inline-block;padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                        "</tr>"
                    }),
                    wrapperTemplate = wrapperTemplate,
                    detailTemplate = detailTemplate
                }),
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
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #86efac;border-radius:22px;background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 56%,#ecfeff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#15803d;font-weight:800\">Approved Pipeline</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Proposal Register</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">This register collects approved proposals ready for downstream delivery, reporting, and executive review. It is the clean handoff surface after manager and finance approval.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Stage</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Approved</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Use</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Reporting / Handoff</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#f0fdf4\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Proposal</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Client</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Department</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Budget</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Target Close</th>",
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
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:proposal_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">Approved register / {{field:client_name}} / {{field:proposal_type}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Requester:</strong> {{field:requester_name}}</div>",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Budget:</strong> {{field:budget_amount}}</div>",
                "    <div><strong>Target Close:</strong> {{field:target_close_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Finance Reviewer:</strong> {{field:finance_reviewer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:executive_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Expected Outcome:</strong> {{field:expected_outcome}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#2563eb\"><strong>Attached Proposal Pack:</strong> {{field:proposal_documents}}</section>",
                "</article>"
            });

            var rowTemplate = string.Join("\n", new[]
            {
                "<tr class=\"mf-preset-row\">",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top\">",
                "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:proposal_title}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:proposal_type}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:proposal_documents}}</div>",
                "  </td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:client_name}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#334155\">{{field:department}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:800\">{{field:budget_amount}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #e2e8f0;color:#64748b;white-space:nowrap\">{{field:target_close_date|format=yyyy-MM-dd}}</td>",
                "</tr>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "proposal-register",
                QueryKey = "approved-proposals",
                ViewType = "listview",
                ViewName = "Proposal Register",
                IsDefault = false,
                SortOrder = 30,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = "Proposal Register",
                    pageSize = StarterListPageSize,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No approved proposals are available in the register yet.",
                    fields = new[]
                    {
                        new { key = "proposal_title", label = "Proposal Title", type = "Text" },
                        new { key = "client_name", label = "Client", type = "Text" },
                        new { key = "department", label = "Department", type = "Select" },
                        new { key = "budget_amount", label = "Budget", type = "Number" },
                        new { key = "target_close_date", label = "Target Close", type = "Date" }
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
                "<article style=\"display:grid;gap:12px;padding:20px;border:1px solid #fed7aa;border-radius:22px;background:linear-gradient(180deg,#ffffff 0%,#fffaf5 100%);box-shadow:0 18px 40px rgba(15,23,42,.08)\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:flex-start\">",
                "    <div>",
                "      <div style=\"font-size:22px;font-weight:800;color:#0f172a;line-height:1.2\">{{field:proposal_title}}</div>",
                "      <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:client_name}} / {{field:proposal_type}}</div>",
                "    </div>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ffedd5;color:#c2410c;font-size:11px;font-weight:700\">{{submission:status}}</span>",
                "  </div>",
                "  <div style=\"display:flex;gap:8px;flex-wrap:wrap\">",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#f8fafc;color:#475569;font-size:11px;font-weight:700\">{{field:department}}</span>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:11px;font-weight:700\">{{field:proposal_type}}</span>",
                "  </div>",
                "  <div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;font-size:13px;color:#334155\">",
                "    <div><strong>Budget:</strong> {{field:budget_amount}}</div>",
                "    <div><strong>Target Close:</strong> {{field:target_close_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Requester:</strong> {{field:requester_name}}</div>",
                "    <div><strong>Finance Reviewer:</strong> {{field:finance_reviewer_email}}</div>",
                "  </div>",
                "  <div style=\"font-size:14px;line-height:1.75;color:#475569\">{{field:executive_summary}}</div>",
                "  <div style=\"font-size:13px;line-height:1.7;color:#64748b\"><strong>Expected Outcome:</strong> {{field:expected_outcome}}</div>",
                "  <div style=\"font-size:13px;line-height:1.7;color:#2563eb\"><strong>Attached Proposal Pack:</strong> {{field:proposal_documents}}</div>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "proposal-card",
                QueryKey = "my-proposals",
                ViewType = "card",
                ViewName = "Proposal Card",
                IsDefault = false,
                SortOrder = 40,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    cardFields = "proposal_title,client_name,proposal_type,budget_amount,target_close_date,requester_name,executive_summary,proposal_documents",
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
