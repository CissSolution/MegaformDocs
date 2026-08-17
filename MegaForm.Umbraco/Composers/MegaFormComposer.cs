using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.MagicStrings;
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
using MegaForm.Core.Security;
using MegaForm.Core.SpamProtection;
using MegaForm.Core.SpamProtection.Providers;
using MegaForm.Core.Templates;
using MegaForm.Core.Addons.Quiz;
using MegaForm.Sdk;
using MegaForm.Umbraco.Data;
using MegaForm.Umbraco.HostedServices;
using MegaForm.Umbraco.Permissions;
using MegaForm.Umbraco.Services;
using MegaForm.Umbraco.StartupFilters;
using Microsoft.AspNetCore.Authorization;

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
            builder.Services.AddScoped<IDraftRepository, UmbracoDraftRepository>();
            builder.Services.AddScoped<IFileRepository, UmbracoFileRepository>();
            builder.Services.AddScoped<IPhase2Repository, UmbracoPhase2Repository>();
            builder.Services.AddScoped<IWorkflowRepository, UmbracoWorkflowRepository>();
            builder.Services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();
            builder.Services.AddScoped<IDocumentRepository, UmbracoDocumentRepository>();

            // [ATBE P1] A form bound to a table in a CUSTOMER database reads its records live from
            // that table instead of from MF_Submissions. That routing is per form: the concrete
            // UmbracoSubmissionRepository still serves every ordinary form, and it is also what the
            // anchor store writes through, so anchor creation cannot recurse back into the decorator.
            builder.Services.AddScoped<UmbracoSubmissionRepository>();
            builder.Services.AddScoped<MegaForm.Core.Models.ExternalTable.IExternalBindingStore, UmbracoExternalBindingStore>();
            builder.Services.AddScoped<MegaForm.Core.Models.ExternalTable.IExternalRowMapStore, UmbracoExternalRowMapStore>();
            builder.Services.AddScoped<MegaForm.Core.Services.ExternalTable.ExternalTableQueryService>();
            // [SourcePicker v20260715] Lets the submissions dashboard read a databaseInsert form's
            // mirror table through the SAME external query path (source=sql). The connection
            // allow-list mirrors the ExternalTableController: DashboardDatabase plus the operator's
            // MegaForm:ExternalTables:AllowedConnections — a key not listed can never be opened,
            // whatever the form settings say (SECURITY rule 1).
            builder.Services.AddScoped<MegaForm.Core.Services.ExternalTable.DatabaseInsertBindingResolver>(sp =>
            {
                var cfg = sp.GetRequiredService<IConfiguration>();
                var configured = cfg.GetSection("MegaForm:ExternalTables:AllowedConnections").Get<string[]>() ?? new string[0];
                var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "DashboardDatabase" };
                foreach (var k in configured)
                    if (!string.IsNullOrWhiteSpace(k)) allowed.Add(k.Trim());
                // [NamedConnections v20260717-01] Admin-saved connections (Database Settings popup)
                // are allow-listed too: saving one is itself an admin-gated act, so it carries the
                // same trust as an appsettings entry. Checked lazily per call so a connection added
                // mid-process is usable without a restart.
                var moduleSettings = sp.GetService<IModuleSettingsService>();
                Func<string, bool> savedContains = key =>
                {
                    try
                    {
                        if (moduleSettings == null) return false;
                        var json = moduleSettings.GetSetting(0, NamedConnectionCatalog.SettingKey, "");
                        return NamedConnectionCatalog.Contains(json, key);
                    }
                    catch { return false; }
                };
                return new MegaForm.Core.Services.ExternalTable.DatabaseInsertBindingResolver(
                    sp.GetRequiredService<IConnectionRegistry>(),
                    sp.GetRequiredService<IFormRepository>(),
                    key => allowed.Contains((key ?? string.Empty).Trim()) || savedContains((key ?? string.Empty).Trim()));
            });
            builder.Services.AddScoped<ISubmissionRepository>(sp => new MegaForm.Core.Services.ExternalTable.ExternalSubmissionRepository(
                sp.GetRequiredService<UmbracoSubmissionRepository>(),
                sp.GetRequiredService<MegaForm.Core.Models.ExternalTable.IExternalBindingStore>(),
                sp.GetRequiredService<MegaForm.Core.Models.ExternalTable.IExternalRowMapStore>(),
                sp.GetRequiredService<MegaForm.Core.Services.ExternalTable.ExternalTableQueryService>(),
                sp.GetRequiredService<MegaForm.Core.Services.ExternalTable.DatabaseInsertBindingResolver>()));

            // ── Shared UI route rewrite (/api/MegaForm/ → /umbraco/MegaForm/MegaFormApi/)
            builder.Services.AddTransient<IStartupFilter, MegaFormRouteRewriteStartupFilter>();

            // ── Magic Strings parser wiring for static SSR renderer
            builder.Services.AddTransient<IStartupFilter, MegaFormMagicStringsStartupFilter>();

            // ── Domain-based licensing probe (localhost = production; public domain needs license)
            builder.Services.AddTransient<IStartupFilter, MegaFormLicenseStartupFilter>();

            // ── Asset cache-bust token, derived from the shipped js/css files
            builder.Services.AddTransient<IStartupFilter, StartupFilters.MegaFormAssetVersionStartupFilter>();

            // ── CORS for public MegaForm embed/script endpoints
            builder.Services.AddTransient<IStartupFilter, MegaFormCorsStartupFilter>();

            // ── Authorization policy that accepts both the Umbraco backoffice cookie
            // (used by shared TS UI hosted in iframes) and the OpenIddict Bearer token
            // (used by the Umbraco 17 backoffice SPA / management API).
            // Umbraco 17 owns the authorization service lifetimes used by singleton
            // server-event authorizers. MegaForm only contributes policies here;
            // calling AddAuthorization again would replace that lifetime contract.
            builder.Services.Configure<AuthorizationOptions>(options =>
            {
                // Umbraco 17 backoffice SPA authenticates with the OpenIddict bearer token
                // stored in localStorage by Bellissima. The shared Vite/TS admin UI (dashboard,
                // builder, submissions, languages) runs inside an iframe and injects that token
                // via the umbraco-host fetch interceptor. We also accept the Umbraco backoffice
                // cookie so the same endpoints work when the browser forwards the cookie (same
                // origin / relaxed SameSite) and to keep direct browser links functional.
                options.AddPolicy("MegaFormApi", policy =>
                {
                    policy.AddAuthenticationSchemes(
                        Constants.Security.BackOfficeAuthenticationType,
                        "OpenIddict.Validation.AspNetCore");
                    policy.RequireAuthenticatedUser();
                });

                // Dual-scheme policy for Umbraco backoffice pages that may be reached
                // directly by a browser with the Umbraco backoffice cookie (e.g. preview pages).
                options.AddPolicy("MegaFormBackOffice", policy =>
                {
                    policy.AddAuthenticationSchemes(
                        Constants.Security.BackOfficeAuthenticationType,
                        "OpenIddict.Validation.AspNetCore");
                    policy.RequireAuthenticatedUser();
                });

                options.DefaultPolicy = options.GetPolicy("MegaFormApi")
                    ?? new AuthorizationPolicyBuilder(
                        Constants.Security.BackOfficeAuthenticationType,
                        "OpenIddict.Validation.AspNetCore")
                        .RequireAuthenticatedUser()
                        .Build();
            });

            // ── MegaForm granular permission service and authorization handler
            // Umbraco's singleton server-event authorizers resolve all authorization
            // handlers. Keep this handler singleton and resolve request-scoped MegaForm
            // permission services from HttpContext only while handling a request.
            builder.Services.AddSingleton<IAuthorizationHandler, MegaFormPermissionAuthorizationHandler>();
            builder.Services.AddScoped<IMegaFormPermissionService, MegaFormPermissionService>();

            // ── Member integration (public-facing members, not backoffice users)
            builder.Services.AddScoped<IUmbracoMemberContext, UmbracoMemberContext>();

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
            builder.Services.AddScoped<MegaForm.Core.Services.TypedSubmission.SubmissionDataResolver>();
            builder.Services.AddScoped<MegaForm.Core.Services.TypedSubmission.TypedSubmissionResyncService>();
            builder.Services.AddScoped<MegaForm.Core.Interfaces.ISubmissionDataStore, MegaForm.Umbraco.Data.EfSubmissionDataStore>();
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
            builder.Services.AddScoped<SubmissionQueryService>(sp =>
                new SubmissionQueryService(
                    sp.GetRequiredService<ISubmissionRepository>(),
                    sp.GetRequiredService<IFormRepository>(),
                    sp.GetService<IFileRepository>(),
                    sp.GetService<MegaForm.Core.Interfaces.ISubmissionDataStore>()));
            builder.Services.AddScoped<AdminRecordShellService>();
            builder.Services.AddScoped<SubmissionProcessor>();
            builder.Services.AddScoped<PrintFormRenderer>();

            // ── Prevalue Sources (shared catalog of reusable option sources)
            builder.Services.AddScoped<MegaForm.Core.Models.Prevalues.IPrevalueSourceStore, Data.UmbracoPrevalueSourceStore>();
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.IPrevalueProvider>(sp =>
            {
                var env = sp.GetRequiredService<IHostEnvironment>();
                var safeRoot = System.IO.Path.Combine(env.ContentRootPath, "App_Data", "MegaForm", "Prevalues");
                System.IO.Directory.CreateDirectory(safeRoot);
                return new MegaForm.Core.Services.Prevalues.TextfilePrevalueProvider(safeRoot);
            });
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.IPrevalueProvider, MegaForm.Core.Services.Prevalues.SqlDatabasePrevalueProvider>();
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.IPrevalueProvider, Services.Prevalues.UmbracoDocumentsPrevalueProvider>();
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.IPrevalueProvider, Services.Prevalues.UmbracoDataTypePrevalueProvider>();
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.PrevalueProviderRegistry>();
            builder.Services.AddScoped<MegaForm.Core.Services.Prevalues.PrevalueOptionsResolver>();
            // [AfterSubmitScript v20260815-01] Umbraco twin of Oqtane/DNN FormScriptController.
            // The compiler is null when MegaForm.Scripting.dll is not deployed; the service
            // then reports compiler unavailable instead of crashing.
            builder.Services.AddSingleton<AfterSubmitScriptService>(sp =>
            {
                var log = sp.GetService<ILogService>();
                return new AfterSubmitScriptService(null, log, null, null);
            });
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
            // [CloudReady A2 v20260806] Durable timer node (Delay) — resumed by
            // MegaFormWorkflowTimerScannerHostedService below.
            builder.Services.AddScoped<INodeExecutor, DelayNodeExecutor>();

            // ── UI / helpers
            builder.Services.AddSingleton<IThemeDesignerHostRenderer, ThemeDesignerHostRenderer>();
            builder.Services.AddSingleton<UmbracoBuilderTemplateCatalogService>();
            builder.Services.AddSingleton<IWebhookWorkflowNodeUiService, WebhookWorkflowNodeUiService>();
            builder.Services.AddSingleton<IEmailWorkflowNodeUiService, EmailWorkflowNodeUiService>();
            builder.Services.AddSingleton<IWorkflowNodeUiSchemaProvider, WorkflowNodeUiSchemaProvider>();

            // ── Localization
            builder.Services.AddScoped<ILocalizationProvider, UmbracoLocalizationProvider>();

            // ── Magic Strings placeholder parser (shared Core engine)
            builder.Services.RegisterMegaFormMagicStrings();
            builder.Services.AddScoped<IPageFieldResolver, UmbracoPageFieldResolver>();
            builder.Services.AddScoped<IDictionaryValueResolver, UmbracoDictionaryValueResolver>();

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

            // ── Headless/AJAX Forms Delivery API
            builder.Services.AddScoped<FormDeliveryService>();
            builder.Services.AddSingleton(sp => FormsApiSecurityOptions.FromConfiguration(sp.GetRequiredService<IConfiguration>()));

            // ── Hosted services
            builder.Services.AddHostedService<MegaFormWarmupHostedService>();
            builder.Services.AddHostedService<MegaFormBlogScheduledHostedService>();
            // [CloudReady A2 v20260806] Durable timer scanner (Delay resume + one-shot
            // overdue reminder). Always on — a database with no waiting executions
            // or overdue tasks simply scans empty.
            builder.Services.AddHostedService<MegaFormWorkflowTimerScannerHostedService>();

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
            // [CloudStorage v20260723-01] S3 + Azure Blob providers (stateless → singleton-safe),
            // the named cloud-storage connection catalog (scoped: IModuleSettingsService is scoped,
            // so a singleton capturing the root provider would fail scope validation / serve stale
            // settings), the per-host blob reader, and the fail-soft uploader SubmissionProcessor
            // picks up via its optional ctor parameter.
            services.AddSingleton<IStorageProvider, MegaForm.Integrations.CloudStorage.AmazonS3StorageProvider>();
            // [AzureBlobRemoved v20260726] Azure Blob provider dropped (Azure.Core net472 crash risk).
            services.AddSingleton<IStorageIntegrationService, StorageIntegrationService>();
            services.AddScoped<ICloudStorageConnectionProvider>(sp =>
                new DelegateCloudStorageConnectionProvider(() =>
                    sp.GetRequiredService<IModuleSettingsService>().GetSetting(0, CloudStorageConnectionCatalog.SettingKey, "")));
            services.AddSingleton<ISubmissionFileBlobReader, UmbracoSubmissionFileBlobReader>();
            services.AddScoped<SubmissionCloudStorageUploader>();

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
