using System;
using System.Collections.Generic;
using DotNetNuke.Entities.Portals;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.Services.Blog;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Workflow;
using MegaForm.DNN.Data;
using MegaForm.Sdk;
using MegaForm.WebApi;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// Service locator for DNN — bridges DNN's static/singleton pattern with Core's DI services.
    /// Lazy-initializes all Core services with DNN-specific implementations.
    /// Usage: DnnServiceLocator.Instance.SubmissionProcessor.ProcessAsync(...)
    /// </summary>
    public class DnnServiceLocator
    {
        private static readonly Lazy<DnnServiceLocator> _instance =
            new Lazy<DnnServiceLocator>(() => new DnnServiceLocator());

        public static DnnServiceLocator Instance => _instance.Value;

        // Platform services
        public IEmailSender EmailSender { get; }
        public ILogService LogService { get; }

        // Repositories (wrapping existing static methods)
        public IFormRepository FormRepo { get; }
        public ISubmissionRepository SubmissionRepo { get; }
        public IDraftRepository DraftRepo { get; }
        public IPhase2Repository Phase2Repo { get; }

        // Core services
        public EmailNotificationService EmailNotification { get; }
        public WebhookService Webhook { get; }
        public UniqueIdService UniqueId { get; }
        public WorkflowEngine Workflow { get; }
        public IWorkflowRepository WorkflowRepo { get; }
        public IWorkflowEvaluator WorkflowEvaluator { get; }
        public IWorkflowEmailSender WorkflowEmail { get; }
        /// <summary>Turns a candidate user name into a real DNN user, so an approval step can notify a
        /// person and hand them the task instead of leaving it in a queue.</summary>
        public IWorkflowPrincipalResolver WorkflowPrincipals { get; }
        public IWorkflowIdentityProvisioningService WorkflowIdentityProvisioning { get; }
        public IWorkflowEngine WorkflowRuntime { get; }
        public WorkflowTaskService WorkflowTasks { get; }
        public PermissionService Permission { get; }
        // [B55 v20260603] Flat-index writer for MF_SubmissionValues used by
        // the SubmissionProcessor and exposed so the reporting controller
        // can drive a backfill / re-index on demand.
        public SubmissionIndexerService ReportingIndexer { get; }
        // [PAY-2 v20260712] Payment stack. The verifier is handed to
        // SubmissionProcessor below — without it any form containing a payment
        // field is rejected (fail closed) instead of trusting the client's
        // "status":"paid". The gateway client owns the bounded
        // outbound-concurrency gate and the PayPal token cache (process-wide).
        public MegaForm.Core.Payments.PaymentGatewayClient PaymentGateway { get; }
        public MegaForm.Core.Payments.IPaymentGatewayStore PaymentStore { get; }
        public MegaForm.Core.Payments.PaymentSubmissionVerifier PaymentVerifier { get; }
        public SubmissionProcessor SubmissionProcessor { get; }

        // [DnnStarterApps v20260518-01] App Builder primitives. DNN now exposes
        // the same Business Starter services that Oqtane has (Leave Request,
        // Proposal, Document Exchange, Purchase Order). The starter services
        // themselves live in MegaForm.Core.Services.Starters so the DNN
        // (net472) and Oqtane (net9.0) builds share one canonical
        // implementation. Only the IStarterPlatformAdapter differs per platform.
        public AppProfileService AppProfiles { get; }
        public AppDefinitionService AppDefinitions { get; }
        public AppQueryRegistryService AppQueries { get; }
        public IStarterPlatformAdapter StarterPlatform { get; }
        public LeaveRequestStarterService LeaveRequestStarter { get; }
        public ProposalStarterService ProposalStarter { get; }
        public DocumentExchangeStarterService DocumentExchangeStarter { get; }
        public PurchaseOrderStarterService PurchaseOrderStarter { get; }
        public RecruitmentStarterService RecruitmentStarter { get; }
        public ConfiguredAppStarterService ConfiguredAppStarter { get; }

        // Blog publishing & analytics services
        public IScheduledPublishService ScheduledPublish { get; }
        public IAnalyticsRollupService AnalyticsRollup { get; }

        private DnnServiceLocator()
        {
            // 1. Platform implementations
            EmailSender = new DnnEmailSender();
            LogService = new DnnLogService();

            // 2. Repository adapters (wrap existing DNN static repositories)
            FormRepo = new DnnFormRepositoryAdapter();
            SubmissionRepo = new DnnSubmissionRepositoryAdapter();
            DraftRepo = new DnnDraftRepositoryAdapter();
            Phase2Repo = new DnnPhase2RepositoryAdapter();

            // 3. Wire AntiSpam rate limiter to DNN data layer
            MegaForm.Core.Services.AntiSpamService.RateLimitChecker = (formId, ip, windowMin, maxPer) =>
                FormRepository.CheckRateLimit(formId, ip, windowMin, maxPer);

            // 4. Core services (wired with DNN implementations)
            EmailNotification = new EmailNotificationService(EmailSender, LogService);
            Webhook = new WebhookService(Phase2Repo, LogService);
            UniqueId = new UniqueIdService(Phase2Repo);
            Workflow = new WorkflowEngine(Phase2Repo, FormRepo, SubmissionRepo, EmailNotification, Webhook, LogService);
            WorkflowRepo = new DnnWorkflowRepository();
            WorkflowEvaluator = new WorkflowEvaluator();
            WorkflowEmail = new DnnWorkflowEmailSender(EmailSender);
            WorkflowPrincipals = new DnnWorkflowPrincipalResolver();
            WorkflowIdentityProvisioning = new DnnWorkflowIdentityProvisioningService(ResolveCurrentPortalId());

            var connectionRegistry = new DnnConnectionRegistry(ReadPortalSetting);
            var executors = new List<INodeExecutor>
            {
                new FormFieldNodeExecutor(),
                new ConditionNodeExecutor(WorkflowEvaluator),
                new WebhookNodeExecutor(WorkflowEvaluator),
                new EmailNodeExecutor(WorkflowEvaluator, WorkflowEmail),
                new EndNodeExecutor(WorkflowEvaluator),
                new CalculateNodeExecutor(WorkflowEvaluator),
                new SetVariableNodeExecutor(WorkflowEvaluator),
                // [Workflow notify 2026-07-11] This used the 3-argument constructor, which leaves the
                // email sender and the principal resolver null — so approval tasks were created and
                // nobody was ever notified, and a step naming one person could not hand them the task.
                new ApprovalNodeExecutor(WorkflowRepo, SubmissionRepo, WorkflowEvaluator, WorkflowEmail, WorkflowPrincipals, LogService),
                new DatabaseNodeExecutor(WorkflowEvaluator, connectionRegistry),
                new GoogleSheetsNodeExecutor(WorkflowEvaluator),
                new SwitchNodeExecutor(),
                new LoopNodeExecutor(),
                new AddRoleNodeExecutor(WorkflowIdentityProvisioning, WorkflowEvaluator),
                new AddUserNodeExecutor(WorkflowIdentityProvisioning, WorkflowEvaluator),
                new AddUserToRoleNodeExecutor(WorkflowIdentityProvisioning, WorkflowEvaluator)
            };

            WorkflowRuntime = new WorkflowEngineV2(WorkflowRepo, WorkflowEvaluator, executors, LogService);
            // Forwarding a task also emails the new assignee — but only through the 8-argument
            // constructor. The 4-argument one left the sender null and forwarded in silence.
            WorkflowTasks = new WorkflowTaskService(WorkflowRepo, WorkflowRuntime, SubmissionRepo,
                WorkflowEvaluator, WorkflowEmail, WorkflowPrincipals, LogService);
            Permission = new PermissionService(Phase2Repo);

            // [B55 v20260603] DNN connection factory targets the same
            // ConnectionString that FormRepository uses for sproc calls so
            // the flat index lives in the same DNN host DB as MF_Submissions.
            ReportingIndexer = new SubmissionIndexerService(() =>
            {
                var cn = new System.Data.SqlClient.SqlConnection(
                    DotNetNuke.Data.DataProvider.Instance().ConnectionString);
                cn.Open();
                return cn;
            });

            PaymentGateway = new MegaForm.Core.Payments.PaymentGatewayClient();
            PaymentStore = new DnnPaymentGatewayStore();
            PaymentVerifier = new MegaForm.Core.Payments.PaymentSubmissionVerifier(
                PaymentStore, SubmissionRepo, PaymentGateway, LogService);

            SubmissionProcessor = new SubmissionProcessor(
                FormRepo, SubmissionRepo, DraftRepo, Phase2Repo,
                EmailNotification, Webhook, UniqueId, LogService, WorkflowRuntime,
                loc: null, documentRevisionService: null,
                reportingIndexer: ReportingIndexer,
                paymentVerifier: PaymentVerifier);

            // [DnnStarterApps v20260518-01] Construct the App Builder graph
            // and the Leave Request starter wired to the DNN platform
            // adapter. Same wiring shape Oqtane's DI container uses on the
            // Core LeaveRequestStarterService — only the adapter differs.
            AppProfiles = new AppProfileService();
            AppDefinitions = new AppDefinitionService(Phase2Repo, FormRepo, AppProfiles);
            AppQueries = new AppQueryRegistryService(Phase2Repo, FormRepo, AppDefinitions);
            StarterPlatform = new DnnStarterPlatformAdapter();
            LeaveRequestStarter = new LeaveRequestStarterService(
                FormRepo, SubmissionRepo, Phase2Repo, WorkflowRepo,
                WorkflowTasks, SubmissionProcessor,
                AppDefinitions, AppQueries,
                WorkflowIdentityProvisioning, StarterPlatform, LogService);
            ProposalStarter = new ProposalStarterService(
                FormRepo, SubmissionRepo, Phase2Repo, WorkflowRepo,
                WorkflowTasks, SubmissionProcessor,
                AppDefinitions, AppQueries,
                WorkflowIdentityProvisioning, StarterPlatform, LogService);
            DocumentExchangeStarter = new DocumentExchangeStarterService(
                FormRepo, SubmissionRepo, Phase2Repo, WorkflowRepo,
                WorkflowTasks, SubmissionProcessor,
                AppDefinitions, AppQueries,
                WorkflowIdentityProvisioning, StarterPlatform, LogService);
            // PO starter is leaner — no app/query/identity provisioning, no adapter.
            PurchaseOrderStarter = new PurchaseOrderStarterService(
                FormRepo, SubmissionRepo, WorkflowRepo);
            // [DnnRecruitmentStarter v20260519-01] Multi-form starter: 3 linked
            // forms (Job Posting / Application / Interview Feedback) under one
            // AppScope='recruitment'. Same wiring shape as the 3 big starters.
            RecruitmentStarter = new RecruitmentStarterService(
                FormRepo, SubmissionRepo, Phase2Repo, WorkflowRepo,
                WorkflowTasks, SubmissionProcessor,
                AppDefinitions, AppQueries,
                WorkflowIdentityProvisioning, StarterPlatform, LogService);
            ConfiguredAppStarter = new ConfiguredAppStarterService(
                FormRepo, SubmissionRepo, Phase2Repo, WorkflowRepo,
                WorkflowTasks, SubmissionProcessor,
                AppDefinitions, AppQueries,
                WorkflowIdentityProvisioning, StarterPlatform, LogService);

            ScheduledPublish = new ScheduledPublishService(SubmissionRepo, Phase2Repo);
            AnalyticsRollup = new BlogAnalyticsRollupService(SubmissionRepo, Phase2Repo);

            // Wire the public MegaForm.Sdk facade so external Razor/Blazor apps
            // can call IMegaFormClient through MegaFormSdk.RunAsync.
            var sdkClient = new MegaFormClient(FormRepo, SubmissionRepo, null, null, null, SubmissionProcessor);
            MegaFormSdk.Initialize(new SingleClientServiceProvider(sdkClient));
        }

        private static int ResolveCurrentPortalId()
        {
            try
            {
                var current = PortalSettings.Current;
                if (current != null && current.PortalId > 0)
                    return current.PortalId;
            }
            catch
            {
            }

            return 0;
        }

        private static string ReadPortalSetting(string key, string defaultValue)
        {
            var portalId = ResolveCurrentPortalId();
            var fullKey = "MegaForm_" + (key ?? string.Empty);

            try
            {
                return PortalController.GetPortalSetting(fullKey, portalId, defaultValue) ?? defaultValue;
            }
            catch
            {
                return defaultValue;
            }
        }
    }
}
