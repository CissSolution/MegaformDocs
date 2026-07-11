using System;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Services.AiKnowledge;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.Services.Blog;
using MegaForm.Core.i18n;
using MegaForm.Core.Conversion;
using MegaForm.Core.EmailSummaries;
using MegaForm.Core.Integrations.Marketing;
using MegaForm.Core.Integrations.Marketing.Providers;
using MegaForm.Core.Integrations.SaasAutomation;
using MegaForm.Core.Integrations.SaasAutomation.Providers;
using MegaForm.Core.Integrations.Storage;
using MegaForm.Core.Integrations.Storage.Providers;
using MegaForm.Core.Payments;
using MegaForm.Core.Payments.Providers;
using MegaForm.Core.SpamProtection;
using MegaForm.Core.SpamProtection.Providers;
using MegaForm.Core.Templates;
using MegaForm.Core.Addons.Quiz;
using MegaForm.Sdk;
using MegaForm.Umbraco.Data;
using MegaForm.Umbraco.HostedServices;
using MegaForm.Umbraco.Services;
using MegaForm.Umbraco.StartupFilters;

namespace MegaForm.Umbraco.Composers
{
    /// <summary>
    /// Registers MegaForm services into Umbraco's DI container.
    /// Runs automatically at application startup.
    /// </summary>
    public class MegaFormComposer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            // ── EF DbContext wired to the same database connection Umbraco uses.
            builder.Services.AddDbContext<MegaFormDbContext>((serviceProvider, options) =>
            {
                var configuration = serviceProvider.GetRequiredService<IConfiguration>();
                var connectionString = configuration.GetConnectionString("umbracoDbDSN")
                    ?? configuration["ConnectionStrings:umbracoDbDSN"]
                    ?? configuration["umbracoDbDSN"];

                if (string.IsNullOrWhiteSpace(connectionString))
                {
                    throw new InvalidOperationException("Connection string 'umbracoDbDSN' was not found for MegaForm.Umbraco.");
                }

                connectionString = ResolveDataDirectoryToken(connectionString);

                var providerName = configuration["ConnectionStrings:umbracoDbDSN_ProviderName"]
                    ?? configuration["umbracoDbDSN_ProviderName"]
                    ?? "Microsoft.Data.SqlClient";

                ConfigureDatabaseProvider(options, connectionString, providerName);
            });

            // ── Repositories
            builder.Services.AddScoped<IFormRepository, UmbracoFormRepository>();
            builder.Services.AddScoped<ISubmissionRepository, UmbracoSubmissionRepository>();
            builder.Services.AddScoped<IDraftRepository, UmbracoDraftRepository>();
            builder.Services.AddScoped<IFileRepository, UmbracoFileRepository>();
            builder.Services.AddScoped<IPhase2Repository, UmbracoPhase2Repository>();
            builder.Services.AddScoped<IWorkflowRepository, UmbracoWorkflowRepository>();
            builder.Services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();
            builder.Services.AddScoped<IDocumentRepository, UmbracoDocumentRepository>();

            // ── Shared UI route rewrite (/api/MegaForm/ → /umbraco/MegaForm/MegaFormApi/)
            builder.Services.AddTransient<IStartupFilter, MegaFormRouteRewriteStartupFilter>();

            // ── CORS for public MegaForm embed/script endpoints
            builder.Services.AddTransient<IStartupFilter, MegaFormCorsStartupFilter>();

            // ── Platform services
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<IModuleSettingsService, UmbracoModuleSettingsService>();
            builder.Services.AddScoped<IPlatformContext, UmbracoPlatformContext>();
            builder.Services.AddScoped<IPermissionPrincipalCatalogProvider, UmbracoPermissionPrincipalCatalogProvider>();
            builder.Services.AddScoped<IWorkflowPrincipalResolver, UmbracoWorkflowPrincipalResolver>();
            builder.Services.AddScoped<IWorkflowIdentityProvisioningService, UmbracoWorkflowIdentityProvisioningService>();
            builder.Services.AddScoped<IStorageService>(sp =>
            {
                var env = sp.GetRequiredService<IHostEnvironment>();
                return new UmbracoStorageService(env, string.Empty);
            });
            builder.Services.AddScoped<SmtpEmailSender>();
            builder.Services.AddScoped<IEmailSender, SmtpEmailSender>();
            builder.Services.AddSingleton<ILogService, UmbracoLogService>();
            builder.Services.AddScoped<IConnectionRegistry, UmbracoConnectionRegistry>();
            builder.Services.AddScoped<IDatabaseWorkflowMetadataService, DatabaseWorkflowMetadataService>();
            builder.Services.AddScoped<IUmbracoModuleConfigService, UmbracoModuleConfigService>();

            // ── Core business services
            builder.Services.AddScoped<EmailNotificationService>();
            builder.Services.AddScoped<WebhookService>();
            builder.Services.AddScoped<UniqueIdService>();
            builder.Services.AddScoped<PermissionService>();
            builder.Services.AddScoped<PermissionCatalogService>();
            builder.Services.AddScoped<AppProfileService>();
            builder.Services.AddScoped<AppDefinitionService>();
            builder.Services.AddScoped<AppQueryRegistryService>();
            builder.Services.AddScoped<DocumentRevisionService>();
            builder.Services.AddScoped<UmbracoWorkflowActorAccessor>();
            builder.Services.AddScoped<IWorkflowEvaluator, WorkflowEvaluator>();
            builder.Services.AddScoped<IWorkflowEmailSender, UmbracoWorkflowEmailSender>();
            builder.Services.AddScoped<IWorkflowEngine, WorkflowEngineV2>();
            builder.Services.AddScoped<WorkflowTaskService>();
            builder.Services.AddScoped<WorkflowTransparencyService>();
            builder.Services.AddScoped<SubmissionWorkflowDetailService>();
            builder.Services.AddScoped<SubmissionQueryService>();
            builder.Services.AddScoped<AdminRecordShellService>();
            builder.Services.AddScoped<SubmissionProcessor>();
            builder.Services.AddScoped<PrintFormRenderer>();
            builder.Services.AddScoped<SubmissionIndexerService>(sp =>
            {
                var db = sp.GetRequiredService<MegaFormDbContext>();
                return new SubmissionIndexerService(() => db.Database.GetDbConnection());
            });

            // ── Workflow node executors
            builder.Services.AddScoped<INodeExecutor, FormFieldNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, ConditionNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, WebhookNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, EmailNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, EndNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, CalculateNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, SetVariableNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, ApprovalNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, DatabaseNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, GoogleSheetsNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, SwitchNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, LoopNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, AddRoleNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, AddUserNodeExecutor>();
            builder.Services.AddScoped<INodeExecutor, AddUserToRoleNodeExecutor>();

            // ── UI / helpers
            builder.Services.AddSingleton<IThemeDesignerHostRenderer, ThemeDesignerHostRenderer>();
            builder.Services.AddSingleton<UmbracoBuilderTemplateCatalogService>();
            builder.Services.AddSingleton<IWebhookWorkflowNodeUiService, WebhookWorkflowNodeUiService>();
            builder.Services.AddSingleton<IEmailWorkflowNodeUiService, EmailWorkflowNodeUiService>();
            builder.Services.AddSingleton<IWorkflowNodeUiSchemaProvider, WorkflowNodeUiSchemaProvider>();

            // ── Localization
            builder.Services.AddScoped<ILocalizationProvider, UmbracoLocalizationProvider>();

            // ── Google Sheets runtime auth
            builder.Services.AddScoped<IGoogleAuthSettings, UmbracoGoogleAuthSettings>();
            builder.Services.AddScoped<GoogleSheetsAuthService>();

            // ── Blog scheduled publishing / analytics (registered for MegaFormBlogScheduledHostedService)
            builder.Services.AddScoped<IScheduledPublishService, ScheduledPublishService>();
            builder.Services.AddScoped<IAnalyticsRollupService, BlogAnalyticsRollupService>();

            // ── AI Knowledge Base
            builder.Services.AddScoped<IAiKnowledgeService, UmbracoAiKnowledgeService>();

            // ── Business Starter platform adapter + starter services
            builder.Services.AddScoped<IStarterPlatformAdapter, UmbracoStarterPlatformAdapter>();
            builder.Services.AddScoped<StarterStatusService>();
            builder.Services.AddScoped<LeaveRequestStarterService>();
            builder.Services.AddScoped<ProposalStarterService>();
            builder.Services.AddScoped<DocumentExchangeStarterService>();
            builder.Services.AddScoped<PurchaseOrderStarterService>();
            builder.Services.AddScoped<RecruitmentStarterService>();
            builder.Services.AddScoped<ConfiguredAppStarterService>();

            // ── Integration providers (Marketing, SaaS, Payments, Storage, Spam, Conversion, Summaries, Templates, Quiz, LandingPage)
            RegisterIntegrationProviders(builder.Services);

            // ── MegaForm SDK facade (IMegaFormClient)
            builder.Services.AddMegaFormSdk();

            // ── Hosted services
            builder.Services.AddHostedService<MegaFormWarmupHostedService>();
            builder.Services.AddHostedService<MegaFormBlogScheduledHostedService>();

            // ── Native Umbraco schema migration (replaces the Task.Run hosted-service bootstrap)
            builder.AddNotificationHandler<UmbracoApplicationStartingNotification, Migrations.MegaFormSchemaMigrationRunner>();

            // ── Auto-grant the MegaForm backoffice section to the admin user group
            builder.AddNotificationHandler<UmbracoApplicationStartedNotification, MegaFormSectionAutoGrantHandler>();

            // ── Package migration: create sample Data Type and Document Type for the MegaForm picker
            builder.AddNotificationHandler<UmbracoApplicationStartedNotification, Migrations.MegaFormSampleContentMigrationHandler>();
        }

        private static void ConfigureDatabaseProvider(DbContextOptionsBuilder options, string connectionString, string providerName)
        {
            if (string.IsNullOrWhiteSpace(providerName))
                providerName = "Microsoft.Data.SqlClient";

            var pn = providerName.ToLowerInvariant();
            if (pn.Contains("sqlite") || pn.Contains("microsoft.data.sqlite"))
            {
                options.UseSqlite(connectionString, sql => sql.CommandTimeout(30));
            }
            else
            {
                options.UseSqlServer(connectionString, sql =>
                {
                    sql.EnableRetryOnFailure(3);
                    sql.CommandTimeout(30);
                });
            }
        }

        private static void RegisterIntegrationProviders(IServiceCollection services)
        {
            // Marketing
            services.AddHttpClient<IMarketingProvider, MailchimpProvider>("Mailchimp");
            services.AddHttpClient<IMarketingProvider, ConvertKitProvider>("ConvertKit");
            services.AddHttpClient<IMarketingProvider, BrevoProvider>("Brevo");
            services.AddHttpClient<IMarketingProvider, KlaviyoProvider>("Klaviyo");
            services.AddSingleton<IMarketingIntegrationService, MarketingIntegrationService>();

            // SaaS Automation
            services.AddHttpClient<ISaasAutomationProvider, SlackProvider>("Slack");
            services.AddHttpClient<ISaasAutomationProvider, TwilioProvider>("Twilio");
            services.AddHttpClient<ISaasAutomationProvider, ZapierProvider>("Zapier");
            services.AddSingleton<ISaasAutomationService, SaasAutomationService>();

            // Payments
            services.AddHttpClient<IPaymentProvider, StripePaymentProvider>("Stripe");
            services.AddSingleton<IRecurringPaymentService, RecurringPaymentService>();
            services.AddSingleton<ICouponStore, InMemoryCouponStore>();

            // Storage
            services.AddHttpClient<IStorageProvider, GoogleDriveProvider>("GoogleDrive");
            services.AddHttpClient<ICalendarProvider, GoogleCalendarProvider>("GoogleCalendar");
            services.AddSingleton<IStorageIntegrationService, StorageIntegrationService>();

            // Spam Protection
            services.AddHttpClient<ICaptchaProvider, RecaptchaV2Provider>("RecaptchaV2");
            services.AddHttpClient<ICaptchaProvider, RecaptchaV3Provider>("RecaptchaV3");
            services.AddHttpClient<ICaptchaProvider, HCaptchaProvider>("HCaptcha");
            services.AddHttpClient<ICaptchaProvider, TurnstileProvider>("Turnstile");
            services.AddSingleton<ICaptchaService, CaptchaService>();

            // Conversion
            services.AddScoped<IConversationalFormService, ConversationalFormService>();
            services.AddSingleton<IFormAbandonmentService, FormAbandonmentService>();
            services.AddSingleton<ILeadFormService, LeadFormService>();
            services.AddSingleton<IUserJourneyService, UserJourneyService>();
            services.AddSingleton<ILandingPageService, LandingPageService>();

            // Email Summaries
            services.AddScoped<IEmailSummaryService, EmailSummaryService>();

            // Templates
            services.AddSingleton<IFormTemplateCatalogService, FormTemplateCatalogService>();

            // Quiz
            services.AddSingleton<IQuizStore, InMemoryQuizStore>();
            services.AddSingleton<IQuizService, QuizService>();
        }

        private static string ResolveDataDirectoryToken(string connectionString)
        {
            const string token = "|DataDirectory|";
            if (string.IsNullOrWhiteSpace(connectionString) || !connectionString.Contains(token, StringComparison.OrdinalIgnoreCase))
                return connectionString;

            var dataDirectory = AppDomain.CurrentDomain.GetData("DataDirectory") as string
                ?? AppContext.BaseDirectory;

            return connectionString.Replace(token, dataDirectory, StringComparison.OrdinalIgnoreCase)
                                   .Replace("/", Path.DirectorySeparatorChar.ToString());
        }
    }
}
