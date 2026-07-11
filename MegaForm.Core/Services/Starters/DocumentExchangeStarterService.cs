// ============================================================
// MegaForm Core — Document Exchange Business Starter
// ----------------------------------------------------------------
// Platform-agnostic seeded "Business App" for cross-team document
// handoff. Same Core/adapter shape as LeaveRequestStarterService.
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
    public class DocumentExchangeStarterResult
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

    public class DocumentExchangeStarterService
    {
        public const string StarterAppScope = AppProfileScopes.Documents;
        public const string StarterAppKey = "document-exchange-starter";
        public const string StarterAppName = "Document Exchange Starter";
        public const string StarterFormTitle = "Document Exchange Starter";
        public const string RegisteredUsersRole = "Registered Users";
        public const string RequesterRole = "Document Submitters";
        public const string ManagerRole = "Document Department Reviewers";
        public const string FinanceRole = "Document Records Officers";
        public const string StarterPassword = "";
        public const string RequesterUserName = "document.submitter";
        public const string ManagerUserName = "document.department";
        public const string FinanceUserName = "document.records";
        private const string AttachedDocumentsFieldKey = "attached_documents";
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

        public DocumentExchangeStarterService(
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

        public DocumentExchangeStarterResult EnsureStarter(
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

            var requester = EnsureUser(portalId, RequesterRole, RequesterUserName, "Document Submitter", "document.submitter@megaform.local", actor);
            var manager = EnsureUser(portalId, ManagerRole, ManagerUserName, "Department Reviewer", "document.department@megaform.local", actor);
            var finance = EnsureUser(portalId, FinanceRole, FinanceUserName, "Records Officer", "document.records@megaform.local", actor);

            SeedSamples(formId, requester, manager, finance);

            return new DocumentExchangeStarterResult
            {
                AppId = app.AppId,
                AppKey = app.AppKey,
                AppScope = app.AppScope,
                FormId = formId,
                FormTitle = StarterFormTitle,
                DefaultViewKey = "document-routing-board",
                SubmitUrl = BuildUrl(homeUrl, "?view=form"),
                InboxUrl = BuildUrl(homeUrl, "?mfpanel=inbox"),
                BoardUrl = BuildUrl(homeUrl, "?vk=document-routing-board"),
                FinanceBoardUrl = BuildUrl(homeUrl, "?vk=document-records-board"),
                RegisterUrl = BuildUrl(homeUrl, "?vk=document-register"),
                CardUrl = BuildUrl(homeUrl, "?vk=document-card"),
                ViewKeys = new List<string>
                {
                    "document-routing-board",
                    "document-records-board",
                    "document-register",
                    "document-card"
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
            var app = _apps.Get(portalId, StarterAppKey, hydrateManifest: false)?.App ?? new AppDefinitionInfo();
            app.PortalId = portalId;
            app.AppKey = StarterAppKey;
            app.AppName = StarterAppName;
            app.Description = "Seeded MegaForm business starter for internal document exchange, routing, records registration, and sample data.";
            app.AppScope = StarterAppScope;
            app.Icon = "fa-solid fa-envelopes-bulk";
            app.AccentColor = "#0f4c81";
            app.IsEnabled = true;
            app.SortOrder = 20;
            app.CreatedByUserId = app.CreatedByUserId > 0 ? app.CreatedByUserId : actor.UserId;
            app.ModifiedByUserId = actor.UserId;
            app.SettingsJson = JsonConvert.SerializeObject(new
            {
                starter = "document-exchange",
                defaultViewKey = "document-routing-board"
            });
            app.ResourcesJson = JsonConvert.SerializeObject(new
            {
                submitLabel = "Register document",
                inboxLabel = "Routing inbox",
                boardLabel = "Routing board"
            });

            var manifest = new AppManifestDefinition
            {
                Profile = new AppProfileDefinition
                {
                    Scope = StarterAppScope,
                    DisplayName = "Documents",
                    EntitySingular = "Document",
                    EntityPlural = "Documents",
                    EnableWorkflowInbox = true,
                    EnableAssignments = true,
                    EnableComments = true,
                    EnableDirectives = true,
                    EnableDocumentRegistry = true,
                    EnableStablePublicUrl = true
                },
                Settings = new Dictionary<string, string>
                {
                    ["starter"] = "document-exchange",
                    ["defaultViewKey"] = "document-routing-board"
                },
                Resources = new Dictionary<string, string>
                {
                    ["submitLabel"] = "Register document",
                    ["inboxLabel"] = "Routing inbox",
                    ["registerLabel"] = "Document register"
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
                starter = "document-exchange",
                appProfile = StarterAppScope
            });

            var form = existing ?? new FormInfo();
            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = StarterFormTitle;
            form.Description = "Seeded document exchange starter with submitter, department review, records registration, and sample submissions.";
            form.SchemaJson = JsonConvert.SerializeObject(schema);
            form.SettingsJson = settingsJson;
            form.Status = "Published";
            form.SubmitButtonText = "Register Document";
            form.SuccessMessage = "Your document was submitted for department review.";
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
                QueryKey = "my-documents",
                QueryName = "My Documents",
                Description = "Starter query for submitters to review documents they created.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { field = "owner_email", source = "currentUser.email" }),
                SortOrder = 10,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-department-review",
                QueryName = "Pending Department Review",
                Description = "Starter queue for department routing and review.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_department" }),
                SortOrder = 20,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "pending-records-review",
                QueryName = "Pending Records Review",
                Description = "Starter queue for records office registration and filing.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "waiting_records" }),
                SortOrder = 30,
                CreatedByUserId = actor.UserId,
                ModifiedByUserId = actor.UserId
            });
            UpsertQuery(portalId, appKey, new AppQueryDefinitionInfo
            {
                FormId = formId,
                QueryKey = "registered-documents",
                QueryName = "Registered Documents",
                Description = "Starter register for documents already accepted into the records office.",
                QueryType = "submissions",
                DefinitionJson = JsonConvert.SerializeObject(new { status = "registered" }),
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
            _workflowRepo.ApplyDraft(formId, "document-starter");
        }

        private StarterSeedUser EnsureUser(int portalId, string roleName, string userName, string displayName, string email, UserContext actor)
        {
            try
            {
                _identityProvisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = roleName,
                    Description = "Seeded by MegaForm document exchange starter.",
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
            var message = "Document exchange starter failed to " + step + ". " + FlattenExceptionMessage(ex);
            _log?.LogError(nameof(DocumentExchangeStarterService), message, ex);
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
                "Board Meeting Minutes / April 2026",
                requester.DisplayName,
                requester.Email,
                "Corporate Affairs",
                "Incoming",
                "Meeting Minutes",
                "ACME Holdings",
                "REG-2026-041",
                "2026-04-15",
                "2026-04-18",
                finance.Email,
                "Minutes package from the board session needs department review before records registration.",
                "Route to Corporate Affairs and register after approval."));
            BackdateActiveTask(pendingManagerId, 26, 5);

            var pendingManagerId2 = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Incoming Letter / Legal Opinion Request",
                requester.DisplayName,
                requester.Email,
                "Corporate Affairs",
                "Incoming",
                "Official Letter",
                "Northwind Legal Affairs",
                "REG-2026-048",
                "2026-04-20",
                "2026-04-24",
                finance.Email,
                "Partner counsel requested an urgent legal opinion and expects routed acknowledgement before records registration.",
                "Prioritize for Corporate Affairs review, then send to records with the legal working file reference."));

            var pendingManagerId3 = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Internal Memo / Branch Relocation Checklist",
                requester.DisplayName,
                requester.Email,
                "Human Resources",
                "Internal",
                "Circular",
                "Regional Operations",
                "REG-2026-052",
                "2026-04-21",
                "2026-04-25",
                finance.Email,
                "Internal relocation memo must be routed to HR before records can register the final staff movement notice.",
                "Review the routing checklist and confirm HR ownership before records registration."));

            var rejectedManagerId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Vendor Contract Annex / Draft Missing Signature Page",
                requester.DisplayName,
                requester.Email,
                "Procurement",
                "Incoming",
                "Contract Annex",
                "Blue Yonder Ltd.",
                "REG-2026-037",
                "2026-04-09",
                "2026-04-12",
                finance.Email,
                "Annex arrived without the signed final page and must go back to the submitter.",
                "Return to sender for completion before routing again."));
            ClaimIfNeeded(rejectedManagerId, manager.ToContext());
            RejectTask(rejectedManagerId, manager.ToContext(), "Please attach the signed page and complete the routing note before resubmitting.");

            var pendingFinanceId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Incoming Letter / Audit Request",
                requester.DisplayName,
                requester.Email,
                "Finance",
                "Incoming",
                "Official Letter",
                "City Audit Office",
                "REG-2026-044",
                "2026-04-17",
                "2026-04-21",
                finance.Email,
                "Department already accepted the incoming audit request. Records office still needs to register and file it.",
                "Send to records with urgency flag and retain in audit folder."));
            ClaimIfNeeded(pendingFinanceId, manager.ToContext());
            ApproveTask(pendingFinanceId, manager.ToContext(), "Department review completed. Routed to records office.");

            var pendingFinanceId2 = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Outgoing Circular / Preferred Vendor List Update",
                requester.DisplayName,
                requester.Email,
                "Procurement",
                "Outgoing",
                "Circular",
                "Approved Vendors",
                "REG-2026-053",
                "2026-04-22",
                "2026-04-25",
                finance.Email,
                "Procurement finalized the preferred vendor update and now needs records registration before circulation.",
                "Records office should verify registry metadata and archive the final circular in procurement records."));
            ClaimIfNeeded(pendingFinanceId2, manager.ToContext());
            ApproveTask(pendingFinanceId2, manager.ToContext(), "Department review completed. Sent to records for registration.");

            var pendingFinanceId3 = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Incoming Letter / Grant Disbursement Notice",
                requester.DisplayName,
                requester.Email,
                "Finance",
                "Incoming",
                "Official Letter",
                "Metropolitan Development Fund",
                "REG-2026-054",
                "2026-04-22",
                "2026-04-26",
                finance.Email,
                "Finance accepted the incoming grant disbursement notice and now requires records registration plus archive tagging.",
                "Register under external funding records and flag for finance closeout review."));
            ClaimIfNeeded(pendingFinanceId3, manager.ToContext());
            ApproveTask(pendingFinanceId3, manager.ToContext(), "Department review completed. Finance asked records office to archive it today.");

            var approvedId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Outgoing Circular / Remote Work Update",
                requester.DisplayName,
                requester.Email,
                "Human Resources",
                "Outgoing",
                "Circular",
                "All Departments",
                "REG-2026-029",
                "2026-04-03",
                "2026-04-05",
                finance.Email,
                "Approved sample for the full document exchange flow with routing and final registry.",
                "Published to all departments and registered in the outgoing log."));
            ClaimIfNeeded(approvedId, manager.ToContext());
            ApproveTask(approvedId, manager.ToContext(), "Department review completed.");
            ClaimIfNeeded(approvedId, finance.ToContext());
            ApproveTask(approvedId, finance.ToContext(), "Records office registered the document and closed the routing cycle.");

            var approvedId2 = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Incoming Letter / Compliance Certificate Archive",
                requester.DisplayName,
                requester.Email,
                "Corporate Affairs",
                "Incoming",
                "Official Letter",
                "Contoso Certification Bureau",
                "REG-2026-055",
                "2026-04-10",
                "2026-04-12",
                finance.Email,
                "Archived compliance certificate received, routed, and fully registered as a completed inbound document example.",
                "Store under compliance archive and close the routing cycle after records confirms the registration."));
            ClaimIfNeeded(approvedId2, manager.ToContext());
            ApproveTask(approvedId2, manager.ToContext(), "Department review completed.");
            ClaimIfNeeded(approvedId2, finance.ToContext());
            ApproveTask(approvedId2, finance.ToContext(), "Records office archived and registered the compliance certificate.");

            var rejectedFinanceId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                "Outgoing Decision / Procurement Appeal Response",
                requester.DisplayName,
                requester.Email,
                "Procurement",
                "Outgoing",
                "Decision Notice",
                "Adventure Works",
                "REG-2026-046",
                "2026-04-19",
                "2026-04-22",
                finance.Email,
                "Records office rejected this outgoing notice because the registry number format is invalid.",
                "Return to department for correction of registry metadata."));
            ClaimIfNeeded(rejectedFinanceId, manager.ToContext());
            ApproveTask(rejectedFinanceId, manager.ToContext(), "Department review completed.");
            ClaimIfNeeded(rejectedFinanceId, finance.ToContext());
            RejectTask(rejectedFinanceId, finance.ToContext(), "Registry number format is invalid. Please correct the records metadata and resubmit.");

            SeedGeneratedSamples(formId, requester, manager, finance);
        }

        private void ResetRuntimeData(int formId)
        {
            _platform.ResetFormRuntimeData(formId);
            StarterSeedAttachmentFactory.DeleteFieldAttachments(formId, AttachedDocumentsFieldKey);
        }

        private int SubmitWorkflowSample(int formId, int userId, Dictionary<string, object> data, params StarterSeedAttachment[] attachments)
        {
            var result = _submissionProcessor.ProcessAsync(
                formId,
                data,
                BuildSeedIpAddress(userId),
                "MegaForm DocumentStarter",
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

        private void SeedGeneratedSamples(int formId, StarterSeedUser requester, StarterSeedUser manager, StarterSeedUser finance)
        {
            var generated = new[]
            {
                new { Title = "Incoming Memo / Safety Audit Follow-up", Department = "Corporate Affairs", Direction = "Incoming", Type = "Official Letter", Source = "Metro Safety Office", Registry = "REG-2026-056", Received = "2026-04-23", Due = "2026-04-28", Status = "pending_department", Summary = "Safety audit follow-up awaiting department triage.", Notes = "Send to Corporate Affairs before records registration." },
                new { Title = "Outgoing Circular / Travel Policy Update", Department = "Human Resources", Direction = "Outgoing", Type = "Circular", Source = "All Departments", Registry = "REG-2026-057", Received = "2026-04-24", Due = "2026-04-29", Status = "pending_department", Summary = "Updated travel policy circular queued for HR department review.", Notes = "Validate distribution list before records registration." },
                new { Title = "Incoming Letter / Tax Clearance Reminder", Department = "Finance", Direction = "Incoming", Type = "Official Letter", Source = "Revenue Authority", Registry = "REG-2026-058", Received = "2026-04-24", Due = "2026-04-30", Status = "pending_department", Summary = "Finance needs to triage a tax clearance reminder.", Notes = "Records registration follows finance review." },
                new { Title = "Internal Memo / Procurement Capex Checklist", Department = "Procurement", Direction = "Internal", Type = "Circular", Source = "Capital Projects", Registry = "REG-2026-059", Received = "2026-04-24", Due = "2026-05-01", Status = "pending_department", Summary = "Capex checklist intentionally kept on department queue for pager QA.", Notes = "Department must validate sourcing trail before records sees it." },
                new { Title = "Incoming Minutes / Compliance Workshop", Department = "Corporate Affairs", Direction = "Incoming", Type = "Meeting Minutes", Source = "Regional Compliance Forum", Registry = "REG-2026-060", Received = "2026-04-25", Due = "2026-05-01", Status = "pending_department", Summary = "Workshop minutes remain in department review for queue volume testing.", Notes = "Corporate Affairs should triage before routing to records." },
                new { Title = "Outgoing Decision / Temporary Access Badge", Department = "Human Resources", Direction = "Outgoing", Type = "Decision Notice", Source = "Facility Management", Registry = "REG-2026-061", Received = "2026-04-25", Due = "2026-05-02", Status = "pending_department", Summary = "Badge decision stays in department triage to keep the routing board paged.", Notes = "Validate recipients before records registration." },
                new { Title = "Incoming Letter / Vendor Bank Update", Department = "Procurement", Direction = "Incoming", Type = "Official Letter", Source = "Fabrikam Procurement Services", Registry = "REG-2026-062", Received = "2026-04-26", Due = "2026-05-02", Status = "pending_department", Summary = "Vendor bank update is intentionally held at department triage so the routing board shows a real pager.", Notes = "Keep this on the department queue to simulate an inbound pile-up before records validation." },
                new { Title = "Outgoing Circular / Benefits Enrollment Reminder", Department = "Human Resources", Direction = "Outgoing", Type = "Circular", Source = "All Staff", Registry = "REG-2026-063", Received = "2026-04-26", Due = "2026-05-03", Status = "pending_department", Summary = "Benefits enrollment reminder remains at department review for pagination QA.", Notes = "HR still needs to confirm the distribution list before records registration." },
                new { Title = "Incoming Annex / Pricing Schedule Amendment", Department = "Finance", Direction = "Incoming", Type = "Contract Annex", Source = "Blue Yonder Ltd.", Registry = "REG-2026-064", Received = "2026-04-27", Due = "2026-05-04", Status = "registered", Summary = "Pricing schedule amendment processed end to end.", Notes = "Registered after finance and records validation." },
                new { Title = "Incoming Letter / Insurance Confirmation", Department = "Corporate Affairs", Direction = "Incoming", Type = "Official Letter", Source = "Northwind Insurance", Registry = "REG-2026-065", Received = "2026-04-27", Due = "2026-05-04", Status = "pending_department", Summary = "Insurance confirmation stays in department review to keep the routing board realistically busy.", Notes = "Department still needs a signed policy rider before records can receive it." },
                new { Title = "Outgoing Notice / Branch Move Approval", Department = "Human Resources", Direction = "Outgoing", Type = "Decision Notice", Source = "Regional Operations", Registry = "REG-2026-066", Received = "2026-04-28", Due = "2026-05-05", Status = "rejected_records", Summary = "Records rejected because registry metadata is inconsistent.", Notes = "Correct the branch code before resubmitting." },
                new { Title = "Incoming Circular / Grant Compliance Checklist", Department = "Finance", Direction = "Incoming", Type = "Circular", Source = "Development Fund", Registry = "REG-2026-067", Received = "2026-04-28", Due = "2026-05-05", Status = "registered", Summary = "Grant compliance checklist fully registered.", Notes = "Archive under external funding compliance." }
            };

            for (var i = 0; i < generated.Length; i++)
            {
                var sample = generated[i];
                var attachmentA = CreateDocumentAttachment(
                    formId,
                    sample.Title.ToLowerInvariant().Replace(" ", "-").Replace("/", "-") + ".pdf",
                    "Document starter attachment",
                    "Document: " + sample.Title,
                    "Registry: " + sample.Registry,
                    sample.Summary);

                var submissionId = SubmitWorkflowSample(formId, requester.UserId, BuildSampleData(
                    sample.Title,
                    requester.DisplayName,
                    requester.Email,
                    sample.Department,
                    sample.Direction,
                    sample.Type,
                    sample.Source,
                    sample.Registry,
                    sample.Received,
                    sample.Due,
                    finance.Email,
                    sample.Summary,
                    sample.Notes,
                    attachmentA));

                if (string.Equals(sample.Status, "pending_department", StringComparison.OrdinalIgnoreCase))
                {
                    BackdateActiveTask(submissionId, 12 + i, 3 + (i % 4));
                    continue;
                }

                ClaimIfNeeded(submissionId, manager.ToContext());

                if (string.Equals(sample.Status, "rejected_department", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, manager.ToContext(), "Department requested a clearer supporting packet before routing.");
                    continue;
                }

                ApproveTask(submissionId, manager.ToContext(), "Department review completed for starter sample " + (i + 1) + ".");

                if (string.Equals(sample.Status, "pending_records", StringComparison.OrdinalIgnoreCase))
                    continue;

                ClaimIfNeeded(submissionId, finance.ToContext());

                if (string.Equals(sample.Status, "rejected_records", StringComparison.OrdinalIgnoreCase))
                {
                    RejectTask(submissionId, finance.ToContext(), "Records rejected this package because the registry metadata must be corrected.");
                    continue;
                }

                ApproveTask(submissionId, finance.ToContext(), "Records registered starter sample " + (i + 1) + ".");
            }
        }

        private StarterSeedAttachment CreateDocumentAttachment(int formId, string fileName, string title, params string[] lines)
        {
            return StarterSeedAttachmentFactory.CreatePdfAttachment(formId, AttachedDocumentsFieldKey, fileName, title, lines);
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
            string documentTitle,
            string ownerName,
            string ownerEmail,
            string department,
            string direction,
            string documentType,
            string sourceOrganization,
            string registryNumber,
            string receivedDate,
            string dueDate,
            string recordsOfficerEmail,
            string summary,
            string routingNotes,
            params StarterSeedAttachment[] attachments)
        {
            var data = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
            {
                ["document_title"] = documentTitle,
                ["owner_name"] = ownerName,
                ["owner_email"] = ownerEmail,
                ["department"] = department,
                ["direction"] = direction,
                ["document_type"] = documentType,
                ["source_organization"] = sourceOrganization,
                ["registry_number"] = registryNumber,
                ["received_date"] = receivedDate,
                ["due_date"] = dueDate,
                ["records_officer_email"] = recordsOfficerEmail,
                ["document_summary"] = summary,
                ["routing_notes"] = routingNotes
            };

            var files = (attachments ?? Array.Empty<StarterSeedAttachment>())
                .Where(x => x != null)
                .Select(x => x.ToSubmissionValue())
                .Cast<object>()
                .ToList();
            if (files.Count > 0)
                data[AttachedDocumentsFieldKey] = files;

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
                    new FormField { Key = "document_title", Type = "Text", Label = "Document Title", Placeholder = "Subject or title of the document", Required = true, Width = "col-6", Order = 10 },
                    new FormField { Key = "registry_number", Type = "Text", Label = "Registry Number", Placeholder = "e.g. REG-2026-101", Required = true, Width = "col-6", Order = 20 },
                    new FormField { Key = "owner_name", Type = "Text", Label = "Submitted By", Placeholder = "Full name", Required = true, Width = "col-6", Order = 30 },
                    new FormField { Key = "owner_email", Type = "Email", Label = "Submitter Email", Placeholder = "name@company.com", Required = true, Width = "col-6", Order = 40 },
                    new FormField
                    {
                        Key = "department",
                        Type = "Select",
                        Label = "Receiving Department",
                        Required = true,
                        Width = "col-6",
                        Order = 50,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Corporate Affairs", Value = "Corporate Affairs" },
                            new MegaForm.Core.Models.FieldOption { Label = "Finance", Value = "Finance" },
                            new MegaForm.Core.Models.FieldOption { Label = "Human Resources", Value = "Human Resources" },
                            new MegaForm.Core.Models.FieldOption { Label = "Procurement", Value = "Procurement" }
                        }
                    },
                    new FormField
                    {
                        Key = "direction",
                        Type = "Select",
                        Label = "Direction",
                        Required = true,
                        Width = "col-6",
                        Order = 60,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Incoming", Value = "Incoming" },
                            new MegaForm.Core.Models.FieldOption { Label = "Outgoing", Value = "Outgoing" },
                            new MegaForm.Core.Models.FieldOption { Label = "Internal", Value = "Internal" }
                        }
                    },
                    new FormField
                    {
                        Key = "document_type",
                        Type = "Select",
                        Label = "Document Type",
                        Required = true,
                        Width = "col-6",
                        Order = 70,
                        Options = new List<MegaForm.Core.Models.FieldOption>
                        {
                            new MegaForm.Core.Models.FieldOption { Label = "Official Letter", Value = "Official Letter" },
                            new MegaForm.Core.Models.FieldOption { Label = "Circular", Value = "Circular" },
                            new MegaForm.Core.Models.FieldOption { Label = "Meeting Minutes", Value = "Meeting Minutes" },
                            new MegaForm.Core.Models.FieldOption { Label = "Decision Notice", Value = "Decision Notice" },
                            new MegaForm.Core.Models.FieldOption { Label = "Contract Annex", Value = "Contract Annex" }
                        }
                    },
                    new FormField { Key = "source_organization", Type = "Text", Label = "Source / Destination", Placeholder = "Agency, vendor, or department", Required = true, Width = "col-6", Order = 80 },
                    new FormField { Key = "received_date", Type = "Date", Label = "Received / Issued Date", Required = true, Width = "col-6", Order = 90 },
                    new FormField { Key = "due_date", Type = "Date", Label = "Routing Due Date", Required = true, Width = "col-6", Order = 100 },
                    new FormField { Key = "records_officer_email", Type = "Email", Label = "Records Officer Email", Placeholder = "records@company.com", Required = true, Width = "col-6", Order = 110 },
                    new FormField { Key = "document_summary", Type = "Textarea", Label = "Document Summary", Placeholder = "Short context for the document", Required = true, Width = "col-12", Order = 120 },
                    new FormField { Key = "routing_notes", Type = "Textarea", Label = "Routing Notes", Placeholder = "Instructions for the next role", Width = "col-12", Order = 130 },
                    new FormField
                    {
                        Key = AttachedDocumentsFieldKey,
                        Type = "File",
                        Label = "Attached Documents",
                        HelpText = "Upload scanned letters, annexes, routing slips, or supporting working files for this document.",
                        Width = "col-12",
                        Order = 140,
                        FileSettings = new FileFieldSettings
                        {
                            MaxSizeMB = 12,
                            MaxFiles = 3,
                            AllowedExtensions = new List<string> { ".pdf", ".png", ".jpg", ".docx", ".xlsx" }
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
                Label = "Department Review",
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
                    PendingSubmissionStatus = "waiting_department",
                    ApprovedSubmissionStatus = "waiting_records",
                    RejectedSubmissionStatus = "returned_department"
                })
            };

            var financeNode = new WorkflowNode
            {
                Id = "finance-review",
                Type = WorkflowNodeType.Approval,
                Label = "Records Registration",
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
                    PendingSubmissionStatus = "waiting_records",
                    ApprovedSubmissionStatus = "registered",
                    RejectedSubmissionStatus = "returned_records"
                })
            };

            var approvedEnd = new WorkflowNode
            {
                Id = "end-approved",
                Type = WorkflowNodeType.End,
                Label = "Registered",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 780, Y = 60 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Document registered."
                })
            };

            var rejectedEnd = new WorkflowNode
            {
                Id = "end-rejected",
                Type = WorkflowNodeType.End,
                Label = "Returned",
                ZoneType = WorkflowZoneType.Action,
                Position = new CanvasPosition { X = 780, Y = 240 },
                Config = ToConfig(new EndNodeConfig
                {
                    EndType = EndType.Success,
                    Message = "Document returned for correction."
                })
            };

            return new WorkflowDefinition
            {
                FormId = formId,
                Name = "Document Exchange Workflow",
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
            var settings = new ListViewSettings
            {
                FormId = formId,
                Title = "Document Routing Board",
                PageSize = StarterListPageSize,
                EnableSearch = true,
                EnableSort = true,
                EmptyMessage = "No documents are waiting for department review.",
                Fields = new List<ListViewFieldInfo>
                {
                    new ListViewFieldInfo { Key = "document_title", Label = "Document Title", Type = "Text" },
                    new ListViewFieldInfo { Key = "registry_number", Label = "Registry No.", Type = "Text" },
                    new ListViewFieldInfo { Key = "department", Label = "Department", Type = "Select" },
                    new ListViewFieldInfo { Key = "direction", Label = "Direction", Type = "Select" },
                    new ListViewFieldInfo { Key = "document_type", Label = "Document Type", Type = "Select" },
                    new ListViewFieldInfo { Key = "due_date", Label = "Due Date", Type = "Date" }
                },
                RowTemplate = string.Join("\n", new[]
                {
                    "<tr class=\"mf-preset-row\">",
                    "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;vertical-align:top\">",
                    "    <div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:12px\">",
                    "      <div>",
                    "        <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:document_title}}</div>",
                    "        <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:source_organization}} / {{field:department}}</div>",
                    "        <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:attached_documents}}</div>",
                    "      </div>",
                    "      <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;white-space:nowrap\">{{field:direction}}</span>",
                    "    </div>",
                    "  </td>",
                    "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#334155;font-weight:600\">{{field:registry_number}}</td>",
                    "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#334155\">{{field:document_type}}</td>",
                    "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7\"><span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                    "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#64748b;font-size:12px;white-space:nowrap\">{{field:due_date|format=yyyy-MM-dd}}</td>",
                    "</tr>"
                }),
                WrapperTemplate = string.Join("\n", new[]
                {
                    "<div style=\"display:grid;gap:18px\">",
                    "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #dbeafe;border-radius:22px;background:linear-gradient(135deg,#eff6ff 0%,#ffffff 62%,#ecfeff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                    "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                    "      <div>",
                    "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1d4ed8;font-weight:800\">Business App Starter</div>",
                    "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Document Routing Board</h2>",
                    "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Department reviewers triage incoming and internal documents before records registration. Open a row to inspect the routing brief, then use Workflow Inbox for claim, approval, rejection, or forwarding.</p>",
                    "      </div>",
                    "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                    "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #dbeafe\">",
                    "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Queue</div>",
                    "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Department Review</div>",
                    "        </div>",
                    "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #dbeafe\">",
                    "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Outcome</div>",
                    "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Route to Records</div>",
                    "        </div>",
                    "      </div>",
                    "    </div>",
                    "  </section>",
                    "  <section style=\"overflow:hidden;border:1px solid #dbe4f0;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                    "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                    "      <thead style=\"background:#f8fafc\">",
                    "        <tr>",
                    "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Document</th>",
                    "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Registry</th>",
                    "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Type</th>",
                    "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Status</th>",
                    "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Due</th>",
                    "        </tr>",
                    "      </thead>",
                    "      <tbody>{{rows}}</tbody>",
                    "    </table>",
                    "  </section>",
                    "</div>"
                })
            };

            var detailTemplate = string.Join("\n", new[]
            {
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #d1fae5;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:document_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">{{field:registry_number}} / {{field:direction}} / {{submission:status}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Submitted By:</strong> {{field:owner_name}}</div>",
                "    <div><strong>Submitter Email:</strong> {{field:owner_email}}</div>",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Source / Destination:</strong> {{field:source_organization}}</div>",
                "    <div><strong>Received / Issued:</strong> {{field:received_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Due Date:</strong> {{field:due_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Records Officer:</strong> {{field:records_officer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:document_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#334155\"><strong>Attached Documents:</strong> {{field:attached_documents}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Routing Notes:</strong> {{field:routing_notes}}</section>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "document-routing-board",
                QueryKey = "pending-department-review",
                ViewType = "listview",
                ViewName = "Document Routing Board",
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
                    wrapperTemplate = settings.WrapperTemplate,
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
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #fde68a;border-radius:22px;background:linear-gradient(135deg,#fff7ed 0%,#ffffff 62%,#fffbeb 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#b45309;font-weight:800\">Records Office</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Records Registration Board</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Records officers validate registry metadata, archive documents, and complete the routing cycle. Open a row for the full brief before approving the final registration step.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #fde68a\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Queue</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Records Registration</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #fde68a\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Outcome</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Archive and Register</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #dbe4f0;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#fffbeb\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Document</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Registry</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Source / Destination</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Due</th>",
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
                "<article style=\"display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a\">",
                "  <header>",
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:document_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">Records registration / {{submission:status}} / {{field:registry_number}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Submitted By:</strong> {{field:owner_name}}</div>",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Direction:</strong> {{field:direction}}</div>",
                "    <div><strong>Document Type:</strong> {{field:document_type}}</div>",
                "    <div><strong>Source / Destination:</strong> {{field:source_organization}}</div>",
                "    <div><strong>Received / Issued:</strong> {{field:received_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Due Date:</strong> {{field:due_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Records Officer:</strong> {{field:records_officer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:document_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#334155\"><strong>Attached Documents:</strong> {{field:attached_documents}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Routing Notes:</strong> {{field:routing_notes}}</section>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "document-records-board",
                QueryKey = "pending-records-review",
                ViewType = "listview",
                ViewName = "Document Records Board",
                IsDefault = false,
                SortOrder = 20,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = "Records Registration Board",
                    pageSize = StarterListPageSize,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No documents are waiting for records registration.",
                    fields = new[]
                    {
                        new { key = "document_title", label = "Document Title", type = "Text" },
                        new { key = "registry_number", label = "Registry No.", type = "Text" },
                        new { key = "source_organization", label = "Source / Destination", type = "Text" },
                        new { key = "due_date", label = "Due Date", type = "Date" }
                    },
                    rowTemplate = string.Join("\n", new[]
                    {
                        "<tr class=\"mf-preset-row\">",
                        "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;vertical-align:top\">",
                        "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:document_title}}</div>",
                        "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:department}} / {{field:direction}}</div>",
                        "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:attached_documents}}</div>",
                        "  </td>",
                        "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#334155;font-weight:600\">{{field:registry_number}}</td>",
                        "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#334155\">{{field:source_organization}}</td>",
                        "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7;color:#64748b;font-size:12px;white-space:nowrap\">{{field:due_date|format=yyyy-MM-dd}}</td>",
                        "  <td style=\"padding:14px 16px;border-bottom:1px solid #eef2f7\"><span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
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
                "  <section style=\"display:grid;gap:14px;padding:20px 22px;border:1px solid #86efac;border-radius:22px;background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 56%,#eff6ff 100%);box-shadow:0 18px 42px rgba(15,23,42,.08)\">",
                "    <div style=\"display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap\">",
                "      <div>",
                "        <div style=\"font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#15803d;font-weight:800\">Records Complete</div>",
                "        <h2 style=\"margin:6px 0 0;font-size:28px;line-height:1.15;color:#0f172a\">Registered Document Log</h2>",
                "        <p style=\"margin:10px 0 0;font-size:14px;line-height:1.7;color:#475569;max-width:780px\">Use this register as the clean archive surface after routing and records validation. It is tuned for records review, handoff, and periodic reporting.</p>",
                "      </div>",
                "      <div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Stage</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Registered</div>",
                "        </div>",
                "        <div style=\"min-width:170px;padding:12px 14px;border-radius:16px;background:#ffffff;border:1px solid #bbf7d0\">",
                "          <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700\">Use</div>",
                "          <div style=\"margin-top:4px;font-size:18px;font-weight:800;color:#0f172a\">Archive / Audit</div>",
                "        </div>",
                "      </div>",
                "    </div>",
                "  </section>",
                "  <section style=\"overflow:hidden;border:1px solid #e5e7eb;border-radius:22px;background:#ffffff;box-shadow:0 16px 40px rgba(15,23,42,.06)\">",
                "    <table style=\"width:100%;border-collapse:separate;border-spacing:0\">",
                "      <thead style=\"background:#f0fdf4\">",
                "        <tr>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Document</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Registry</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Department</th>",
                "          <th style=\"padding:14px 16px;text-align:left;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569\">Direction</th>",
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
                "    <h2 style=\"margin:0;font-size:24px;line-height:1.25\">{{field:document_title}}</h2>",
                "    <div style=\"margin-top:8px;font-size:12px;color:#64748b\">Registered log / {{field:registry_number}} / {{field:document_type}}</div>",
                "  </header>",
                "  <section style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;font-size:13px;color:#334155\">",
                "    <div><strong>Department:</strong> {{field:department}}</div>",
                "    <div><strong>Direction:</strong> {{field:direction}}</div>",
                "    <div><strong>Source / Destination:</strong> {{field:source_organization}}</div>",
                "    <div><strong>Received / Issued:</strong> {{field:received_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Records Officer:</strong> {{field:records_officer_email}}</div>",
                "  </section>",
                "  <section style=\"font-size:14px;line-height:1.7;color:#334155\">{{field:document_summary}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#334155\"><strong>Attached Documents:</strong> {{field:attached_documents}}</section>",
                "  <section style=\"font-size:13px;line-height:1.7;color:#475569\"><strong>Routing Notes:</strong> {{field:routing_notes}}</section>",
                "</article>"
            });

            var rowTemplate = string.Join("\n", new[]
            {
                "<tr class=\"mf-preset-row\">",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #eef2f7;vertical-align:top\">",
                "    <div style=\"font-weight:800;color:#0f172a;line-height:1.35\">{{field:document_title}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:document_type}}</div>",
                "    <div style=\"margin-top:6px;font-size:12px;color:#2563eb\">{{field:attached_documents}}</div>",
                "  </td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #eef2f7;color:#334155;font-weight:700\">{{field:registry_number}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #eef2f7;color:#334155\">{{field:department}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #eef2f7;color:#334155\">{{field:direction}}</td>",
                "  <td style=\"padding:12px 14px;border-bottom:1px solid #eef2f7\"><span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700\">{{submission:status}}</span></td>",
                "</tr>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "document-register",
                QueryKey = "registered-documents",
                ViewType = "listview",
                ViewName = "Document Register",
                IsDefault = false,
                SortOrder = 30,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    title = "Registered Document Log",
                    pageSize = StarterListPageSize,
                    enableSearch = true,
                    enableSort = true,
                    emptyMessage = "No registered documents are available in the log yet.",
                    fields = new[]
                    {
                        new { key = "document_title", label = "Document Title", type = "Text" },
                        new { key = "registry_number", label = "Registry No.", type = "Text" },
                        new { key = "department", label = "Department", type = "Text" },
                        new { key = "direction", label = "Direction", type = "Text" },
                        new { key = "received_date", label = "Received Date", type = "Date" }
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
                "<article style=\"display:grid;gap:12px;padding:20px;border:1px solid #dbeafe;border-radius:22px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);box-shadow:0 18px 40px rgba(15,23,42,.08)\">",
                "  <div style=\"display:flex;justify-content:space-between;gap:12px;align-items:flex-start\">",
                "    <div>",
                "      <div style=\"font-size:22px;font-weight:800;color:#0f172a;line-height:1.2\">{{field:document_title}}</div>",
                "      <div style=\"margin-top:6px;font-size:12px;color:#64748b\">{{field:registry_number}} / {{field:document_type}}</div>",
                "    </div>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700\">{{submission:status}}</span>",
                "  </div>",
                "  <div style=\"display:flex;gap:8px;flex-wrap:wrap\">",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#ecfeff;color:#0f766e;font-size:11px;font-weight:700\">{{field:direction}}</span>",
                "    <span style=\"display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;background:#f8fafc;color:#475569;font-size:11px;font-weight:700\">{{field:department}}</span>",
                "  </div>",
                "  <div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;font-size:13px;color:#334155\">",
                "    <div><strong>Due Date:</strong> {{field:due_date|format=yyyy-MM-dd}}</div>",
                "    <div><strong>Submitted By:</strong> {{field:owner_name}}</div>",
                "    <div><strong>Source / Destination:</strong> {{field:source_organization}}</div>",
                "    <div><strong>Records Officer:</strong> {{field:records_officer_email}}</div>",
                "  </div>",
                "  <div style=\"font-size:13px;color:#2563eb\">{{field:attached_documents}}</div>",
                "  <div style=\"padding-top:2px;font-size:14px;line-height:1.75;color:#475569\">{{field:document_summary}}</div>",
                "</article>"
            });

            return new FormViewInfo
            {
                FormId = formId,
                ViewKey = "document-card",
                QueryKey = "my-documents",
                ViewType = "card",
                ViewName = "Document Card",
                IsDefault = false,
                SortOrder = 40,
                ConfigJson = JsonConvert.SerializeObject(new
                {
                    cardFields = "document_title,registry_number,direction,department,due_date,owner_name,source_organization,records_officer_email,document_summary,attached_documents",
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
