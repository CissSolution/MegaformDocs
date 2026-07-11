using System;
using System.Net;
using System.Net.Mail;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Oqtane.Infrastructure;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Blog;
using MegaForm.Core.Services.Starters;
using MegaForm.Core.Services.Workflow;
using MegaForm.Oqtane.Server.Data;
using MegaForm.Sdk;
using Oqtane.Repository;

namespace MegaForm.Oqtane.Server.Services
{
    public class MegaFormServerStartup : IServerStartup
    {
        public void ConfigureServices(IServiceCollection services)
        {
            // [v1.7.22] Register Microsoft.Data.SqlClient as a DbProviderFactory
            // unconditionally. Oqtane host normally registers it through
            // Oqtane.Database.SqlServer.dll, but on SQLite/PostgreSQL/MySQL-only
            // installs (e.g. Oqtane.Fresh.Test 10.1.0) that DLL is absent → any
            // MegaForm widget asking for the "DashboardDatabase" connection
            // throws "Database provider 'Microsoft.Data.SqlClient' is not
            // registered." → 500 on Subform/Tables, RazorWidget SQL, etc.
            // Idempotent — RegisterFactory replaces existing entry silently.
            try
            {
                System.Data.Common.DbProviderFactories.RegisterFactory(
                    "Microsoft.Data.SqlClient",
                    Microsoft.Data.SqlClient.SqlClientFactory.Instance);
            }
            catch { /* already registered or types missing — ignore */ }

            // [FastPaint v20260620] Response compression (Brotli + Gzip) for the WHOLE host.
            // The Oqtane host does not enable compression, so MegaForm's static text assets ship
            // raw on the public form path — megaform.css ~107 KB, megaform-renderer.js ~208 KB,
            // Schema/{id} JSON ~165 KB (audit Docs/AUDIT_Form743_Performance_Oqtane_2026-06-19.md).
            // Gzip/Brotli cut these ~60-75%. The MegaForm IServerStartup runs in the host pipeline,
            // so this enables compression site-wide. Additive + standard: the middleware skips
            // already-compressed types (png/jpg/woff2) and WebSocket upgrades (Blazor circuit), so
            // it is safe for the rest of the site. `Fastest` keeps per-request CPU low (assets are
            // browser-cached by ?v= so each is compressed ~once per visitor). EnableForHttps stays
            // false (default) — the live site is http://localhost:5070, which still gets compressed.
            services.AddResponseCompression(o =>
            {
                o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
                o.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
                o.MimeTypes = new[]
                {
                    "text/css", "text/javascript", "application/javascript", "application/json",
                    "text/html", "image/svg+xml", "text/plain", "application/manifest+json", "text/json"
                };
            });
            services.Configure<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProviderOptions>(
                o => o.Level = System.IO.Compression.CompressionLevel.Fastest);
            services.Configure<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProviderOptions>(
                o => o.Level = System.IO.Compression.CompressionLevel.Fastest);

            // Oqtane standard multi-database module pattern.
            // DBContextBase + AddDbContextFactory lets the framework choose the active
            // tenant provider (SQL Server / SQLite / MySQL / PostgreSQL) at runtime.
            services.AddDbContextFactory<MegaFormDbContext>(opt => { }, ServiceLifetime.Transient);

            // Data repositories
            services.AddScoped<IFormRepository,       EfFormRepository>();
            services.AddScoped<IDraftRepository,      EfDraftRepository>();

            // [ATBE P1] A form bound to a table in a CUSTOMER database reads its records live from
            // that table instead of from MF_Submissions. That routing is per form: the concrete
            // EfSubmissionRepository still serves every ordinary form, and it is also what the anchor
            // store writes through, so anchor creation cannot recurse back into the decorator.
            services.AddScoped<EfSubmissionRepository>();
            services.AddScoped<MegaForm.Core.Models.ExternalTable.IExternalBindingStore, OqtaneExternalBindingStore>();
            services.AddScoped<MegaForm.Core.Models.ExternalTable.IExternalRowMapStore, OqtaneExternalRowMapStore>();
            services.AddScoped<MegaForm.Core.Services.ExternalTable.ExternalTableQueryService>();
            services.AddScoped<ISubmissionRepository>(sp => new MegaForm.Core.Services.ExternalTable.ExternalSubmissionRepository(
                sp.GetRequiredService<EfSubmissionRepository>(),
                sp.GetRequiredService<MegaForm.Core.Models.ExternalTable.IExternalBindingStore>(),
                sp.GetRequiredService<MegaForm.Core.Models.ExternalTable.IExternalRowMapStore>(),
                sp.GetRequiredService<MegaForm.Core.Services.ExternalTable.ExternalTableQueryService>()));
            // [SDK Files A v20260616] MF_Files repository — powers IMegaFormClient.Files
            // (GetBySubmission / OpenAsync). Rows are created post-submit by the controller
            // (PersistSubmissionFilesFailSoft). Without this, SDK file listings stay empty.
            // Fully-qualified: Oqtane.Repository also defines an IFileRepository (its own
            // file manager) — the unqualified name is ambiguous in this file.
            services.AddScoped<MegaForm.Core.Interfaces.IFileRepository, EfFileRepository>();

            // [OQ-difix20260418-04] CRITICAL: Without IPhase2Repository registered,
            // SubmissionProcessor / PermissionService / UniqueIdService / WebhookService /
            // WorkflowEngineV2 all fail DI construction. The DI failure propagates into
            // every controller action, where ExceptionMiddleware catches it and returns
            // 200 + Content-Length: 0 with no body — making Save/Publish silently fail
            // and List endpoints return blank.
            services.AddScoped<IPhase2Repository, EfPhase2Repository>();
            services.AddScoped<IWorkflowRepository, EfWorkflowRepository>();
            services.AddScoped<IWorkflowLibraryRepository, EfWorkflowLibraryRepository>();

            // Platform adapters
            services.AddScoped<IEmailSender, OqtaneEmailSender>();
            services.AddScoped<ILogService,  OqtaneLogService>();
            services.AddScoped<IPermissionPrincipalCatalogProvider, OqtanePermissionPrincipalCatalogProvider>();
            services.AddScoped<IWorkflowIdentityProvisioningService, OqtaneWorkflowIdentityProvisioningService>();
            // [SDK Files A v20260616] Disk storage rooted at App_Data/MegaForm/PrivateUploads
            // (same place UploadFile writes) → SDK Files.OpenAsync can stream uploaded files.
            services.AddScoped<IStorageService, OqtaneStorageService>();
            // [SDK Platform B v20260616] Ambient tenant/user for scope-less SDK calls.
            // Explicit MegaFormScope still wins (ResolvePortalId checks scope first), so this
            // is additive — existing scope-passing callers (SdkDemoView) are unaffected.
            services.AddScoped<IPlatformContext, OqtanePlatformContext>();

            // [AuthUrl v20260706] Platform-agnostic host auth URL seam (login/register/external
            // login) for MegaForm auth templates. Oqtane owns login + external login; MegaForm only
            // links to it. See IAuthUrlProvider / OqtaneAuthUrlProvider.
            services.AddScoped<IAuthUrlProvider, OqtaneAuthUrlProvider>();

            // Core services
            services.AddScoped<EmailNotificationService>();
            services.AddScoped<WebhookService>();
            services.AddScoped<UniqueIdService>();
            services.AddScoped<IWorkflowEvaluator, WorkflowEvaluator>();
            // [Workflow notify 2026-07-11] Both of these classes existed and neither was registered,
            // so ApprovalNodeExecutor fell back to its 3-argument constructor, _emailSender stayed
            // null, and every approval task was created in silence: the task appeared in the inbox but
            // nobody was ever told it was there. The principal resolver is what turns a candidate name
            // into a real user — without it a step can name a person but never hand them anything.
            services.AddScoped<IWorkflowEmailSender, OqtaneWorkflowEmailSender>();
            services.AddScoped<IWorkflowPrincipalResolver, OqtaneWorkflowPrincipalResolver>();

            services.AddScoped<WorkflowTaskService>();

            // [StarterPlatformAdapter v20260518-01] Bridges the Core starter
            // services (now in MegaForm.Core.Services.Starters) to Oqtane's
            // IDbContextFactory<MegaFormDbContext>. Must be registered BEFORE
            // any starter service for DI to resolve its constructor.
            services.AddScoped<IStarterPlatformAdapter, OqtaneStarterPlatformAdapter>();

            services.AddScoped<LeaveRequestStarterService>();
            services.AddScoped<ProposalStarterService>();
            services.AddScoped<DocumentExchangeStarterService>();
            services.AddScoped<PurchaseOrderStarterService>();
            services.AddScoped<RecruitmentStarterService>();
            services.AddScoped<ConfiguredAppStarterService>();

            // Workflow runtime (Oqtane-first safe subset). We register the
            // human-task path and light logical nodes needed by the starter app.
            // External-integration nodes remain opt-in until their host adapters
            // are explicitly reviewed.
            services.AddScoped<INodeExecutor, FormFieldNodeExecutor>();
            services.AddScoped<INodeExecutor, ConditionNodeExecutor>();
            services.AddScoped<INodeExecutor, SetVariableNodeExecutor>();
            services.AddScoped<INodeExecutor, CalculateNodeExecutor>();
            services.AddScoped<INodeExecutor, LoopNodeExecutor>();
            services.AddScoped<INodeExecutor, SwitchNodeExecutor>();
            services.AddScoped<INodeExecutor, ApprovalNodeExecutor>();
            services.AddScoped<INodeExecutor, EndNodeExecutor>();
            services.AddScoped<IWorkflowEngine, WorkflowEngineV2>();
            services.AddScoped<WorkflowEngine>();

            services.AddScoped<PermissionService>();
            services.AddScoped<PermissionCatalogService>();
            services.AddScoped<AppProfileService>();
            services.AddScoped<AppDefinitionService>();
            services.AddScoped<AppQueryRegistryService>();

            // [B55 v20260603] Reporting flat-index writer (MF_SubmissionValues).
            // Reads the connection string from a freshly created MegaFormDbContext
            // and clones it into a brand-new ADO connection of the same provider
            // type. This avoids handing the EF-owned connection back to the
            // indexer (which would dispose it out from under the DbContext) and
            // keeps the index hitting whichever provider Oqtane is configured for
            // (SQL Server / SQLite / MySQL / PostgreSQL).
            services.AddScoped<SubmissionIndexerService>(sp =>
            {
                var factory = sp.GetService<IDbContextFactory<MegaForm.Oqtane.Server.Data.MegaFormDbContext>>();
                return new SubmissionIndexerService(() =>
                {
                    using (var probe = factory.CreateDbContext())
                    {
                        var template = probe.Database.GetDbConnection();
                        var conn = (System.Data.Common.DbConnection)Activator.CreateInstance(template.GetType());
                        conn.ConnectionString = template.ConnectionString;
                        conn.Open();
                        return conn;
                    }
                });
            });
            services.AddScoped<SubmissionProcessor>();

            // Blog publishing & analytics services
            services.AddScoped<IScheduledPublishService, ScheduledPublishService>();
            services.AddScoped<IAnalyticsRollupService, BlogAnalyticsRollupService>();
            services.AddHostedService<BlogScheduledHostedService>();

            // [OQ-Phase2 v20260430-06] Register IConnectionRegistry so MegaFormController
            // (which now takes it for Field/Options + DatabaseInsert) can be instantiated.
            // Without this, DI throws → ExceptionMiddleware swallows → every action returns
            // 200 + empty body → form load / save / list all silently fail.
            services.AddScoped<IConnectionRegistry, OqtaneConnectionRegistry>();

            // [v20260530-20] AI Knowledge Base (Oqtane parity for DNN's 5 tables +
            // controllers + tools + feedback loop). Service is transient so each
            // controller call gets a fresh DbContext from the factory. KbSeeder is
            // a hosted service that runs once on startup and imports the bundled
            // seed JSON when the entries table is empty.
            services.AddTransient<MegaForm.Core.Services.AiKnowledge.IAiKnowledgeService, OqtaneAiKnowledgeService>();
            services.AddHostedService<OqtaneKbSeederHostedService>();

            // [FastPaint / cold-start v20260619] Pre-JIT the anonymous public-form critical
            // path (Blazor prerender + API + tenant EF + schema resolve) right after the host
            // starts listening, so the FIRST real visitor after a restart doesn't pay the cold
            // JIT/EF warm-up cost. Fail-soft; opt out with MEGAFORM_DISABLE_WARMUP=1.
            services.AddHostedService<MegaFormWarmupHostedService>();

            // [v20260530-Razor-P0] Razor widget POC registrations.
            // Registry scans loaded assemblies for [RazorTemplate] components.
            // HtmlRenderer is the Blazor out-of-circuit renderer used by the
            // RazorWidgetController.Render endpoint to produce HTML strings.
            services.AddSingleton<MegaForm.Oqtane.Server.Services.RazorWidgetRegistry>();
            services.AddScoped<Microsoft.AspNetCore.Components.Web.HtmlRenderer>();
            services.AddScoped<MegaForm.Core.Interfaces.IMfFormContext, MegaForm.Oqtane.Server.Services.StubFormContext>();
            services.AddScoped<MegaForm.Core.Interfaces.IMfUserContext, MegaForm.Oqtane.Server.Services.StubUserContext>();
            services.AddScoped<MegaForm.Core.Interfaces.IMfSiteContext, MegaForm.Oqtane.Server.Services.StubSiteContext>();
            services.AddScoped<MegaForm.Core.Interfaces.IMfSqlExecutor, MegaForm.Oqtane.Server.Services.StubSqlExecutor>();
            services.AddScoped<MegaForm.Core.Interfaces.IMfRazorEmitter, MegaForm.Oqtane.Server.Services.StubEmitter>();
            services.AddScoped<MegaForm.Oqtane.Server.Services.IRazorActionService, MegaForm.Oqtane.Server.Services.RazorActionService>();
            services.AddSingleton<MegaForm.Oqtane.Server.Services.RazorCompilationService>();

            // [SDK wiring 20260616] Register IMegaFormClient (the programmatic SDK facade).
            // Was MISSING (the audit's "biggest blocker") — without it the SDK write/read API
            // is unusable in-host. Factory resolves IFormRepository/ISubmissionRepository
            // (registered above) + the optional SubmissionProcessor (line 130 → full submit
            // pipeline) + optional IPlatformContext (not registered here → SDK callers pass an
            // explicit MegaFormScope). TryAddScoped, so it's safe + idempotent.
            services.AddMegaFormSdk();
        }

        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // [FastPaint v20260620] Turn on the response-compression middleware registered in
            // ConfigureServices. Added here from the module's IServerStartup.Configure; if the host
            // serves static files before this runs, dynamic responses (HTML, Schema API) still
            // compress — verified live by checking the Content-Encoding header after deploy.
            try { app.UseResponseCompression(); } catch { /* non-fatal if host already compresses */ }

            // Enable the ambient MegaForm.Sdk accessor (MegaFormSdk.RunAsync) for non-DI callers
            // (e.g. a DNN Razor host / DDR template). DI consumers should inject IMegaFormClient.
            try { MegaFormSdk.Initialize(app.ApplicationServices); } catch { /* non-fatal */ }
        }
        public void ConfigureMvc(IMvcBuilder mvcBuilder) { }
    }

    // ── Platform adapters ──────────────────────────────────────────────

    public class OqtaneEmailSender : IEmailSender
    {
        private readonly ILogger<OqtaneEmailSender> _logger;
        private readonly IConfiguration _configuration;

        public OqtaneEmailSender(ILogger<OqtaneEmailSender> logger, IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;
        }

        public void Send(string to, string subject, string htmlBody, string from = null, string replyTo = null)
        {
            if (string.IsNullOrWhiteSpace(to)) return;

            string host = GetSetting("MegaForm:Smtp:Host", "MEGAFORM_SMTP_HOST");
            int port = ParseInt(GetSetting("MegaForm:Smtp:Port", "MEGAFORM_SMTP_PORT"), 587);
            bool enableSsl = ParseBool(GetSetting("MegaForm:Smtp:EnableSsl", "MEGAFORM_SMTP_ENABLESSL"), true);
            string user = GetSetting("MegaForm:Smtp:Username", "MEGAFORM_SMTP_USERNAME");
            string pass = GetSetting("MegaForm:Smtp:Password", "MEGAFORM_SMTP_PASSWORD");
            string defaultFrom = GetSetting("MegaForm:Smtp:From", "MEGAFORM_SMTP_FROM") ?? user ?? from ?? "noreply@localhost";
            string replyToValue = string.IsNullOrWhiteSpace(replyTo) ? GetSetting("MegaForm:Smtp:ReplyTo", "MEGAFORM_SMTP_REPLYTO") : replyTo;

            if (string.IsNullOrWhiteSpace(host))
            {
                _logger.LogWarning("[MegaForm Email] SMTP host is not configured. Email to {To} was not sent. Subject={Subject}", to, subject);
                return;
            }

            using var message = new MailMessage();
            message.From = new MailAddress(string.IsNullOrWhiteSpace(from) ? defaultFrom : from);
            foreach (var part in (to ?? string.Empty).Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var addr = part.Trim();
                if (!string.IsNullOrWhiteSpace(addr)) message.To.Add(addr);
            }
            if (!string.IsNullOrWhiteSpace(replyToValue))
                message.ReplyToList.Add(new MailAddress(replyToValue));
            message.Subject = subject ?? string.Empty;
            message.Body = htmlBody ?? string.Empty;
            message.IsBodyHtml = true;

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                UseDefaultCredentials = false,
                Credentials = !string.IsNullOrWhiteSpace(user) ? new NetworkCredential(user, pass ?? string.Empty) : CredentialCache.DefaultNetworkCredentials
            };

            client.Send(message);
            _logger.LogInformation("[MegaForm Email] Sent via SMTP. To={To} Subject={Subject}", to, subject);
        }

        public string GetHostEmail()
            => GetSetting("MegaForm:Smtp:From", "MEGAFORM_SMTP_FROM")
               ?? GetSetting("MegaForm:Smtp:Username", "MEGAFORM_SMTP_USERNAME")
               ?? "noreply@localhost";

        private string GetSetting(string configKey, string envKey)
            => _configuration[configKey] ?? Environment.GetEnvironmentVariable(envKey);

        private static int ParseInt(string value, int fallback)
            => int.TryParse(value, out var parsed) ? parsed : fallback;

        private static bool ParseBool(string value, bool fallback)
            => bool.TryParse(value, out var parsed) ? parsed : fallback;
    }

    public class OqtaneLogService : ILogService
    {
        private readonly ILogger<OqtaneLogService> _logger;
        public OqtaneLogService(ILogger<OqtaneLogService> logger) { _logger = logger; }

        public void LogInfo(string source, string message)
            => _logger.LogInformation("[{Source}] {Message}", source, message);
        public void LogWarning(string source, string message)
            => _logger.LogWarning("[{Source}] {Message}", source, message);
        public void LogError(string source, string message, Exception ex = null)
            => _logger.LogError(ex, "[{Source}] {Message}", source, message);
    }

    /// <summary>
    /// Oqtane IConnectionRegistry implementation — registered so MegaFormController can be
    /// constructed via DI (without it, every action returns 200 + empty body — see [OQ-Phase2]
    /// comment in ConfigureServices and the IPhase2Repository note above).
    ///
    /// Resolves connection strings from appsettings.json ConnectionStrings:{name}. Uses
    /// DbProviderFactories so we don't take a hard package reference on SqlClient/Sqlite —
    /// the host already loads whichever provider Oqtane is configured for.
    /// Badge: OqtaneConnectionRegistry v20260430-06
    /// </summary>
    public sealed class OqtaneConnectionRegistry : IConnectionRegistry
    {
        public const string Badge = "OqtaneConnectionRegistry v20260430-06";

        private readonly IConfiguration _config;
        public OqtaneConnectionRegistry(IConfiguration config) { _config = config; }

        public System.Data.Common.DbConnection GetConnection(string connectionName, string databaseType = null, string connectionString = null)
        {
            var connStr = !string.IsNullOrWhiteSpace(connectionString)
                ? connectionString
                : (_config?.GetConnectionString(connectionName) ?? string.Empty);
            // [DashboardDbFallback v20260625] Stock Oqtane installs ship ONLY "DefaultConnection".
            // MegaForm's dashboard / DB-bound-form / AI-SQL tools resolve the app DB by the
            // conventional alias "DashboardDatabase" (DNN already alias-resolves it). When that
            // alias is absent, fall back to Oqtane's DefaultConnection so a DB-connected form works
            // out of the box without any appsettings edit (matches the DNN behaviour). An explicit
            // connectionString or a real "DashboardDatabase" entry still take precedence.
            if (string.IsNullOrWhiteSpace(connStr)
                && (string.IsNullOrWhiteSpace(connectionName)
                    || string.Equals(connectionName, "DashboardDatabase", StringComparison.OrdinalIgnoreCase)))
            {
                connStr = _config?.GetConnectionString("DefaultConnection") ?? string.Empty;
            }
            if (string.IsNullOrWhiteSpace(connStr))
                throw new InvalidOperationException("Connection string '" + connectionName + "' not found. Add it to appsettings.json under ConnectionStrings:" + connectionName + ".");

            var providerName = ResolveProviderInvariantName(databaseType);
            try
            {
                var factory = System.Data.Common.DbProviderFactories.GetFactory(providerName);
                var conn = factory.CreateConnection();
                if (conn == null) throw new InvalidOperationException("Provider '" + providerName + "' returned null connection.");
                conn.ConnectionString = connStr;
                return conn;
            }
            catch (System.ArgumentException)
            {
                throw new InvalidOperationException("Database provider '" + providerName + "' is not registered. Either install the provider package on the host (e.g. Microsoft.Data.SqlClient) or pass a databaseType this host already loads.");
            }
        }

        private static string ResolveProviderInvariantName(string databaseType)
        {
            var s = (databaseType ?? string.Empty).ToLowerInvariant();
            if (s == "sqlite")     return "Microsoft.Data.Sqlite";
            if (s == "mysql")      return "MySql.Data.MySqlClient";
            if (s == "postgresql" || s == "postgres" || s == "npgsql") return "Npgsql";
            // Default: SQL Server (most common Oqtane setup)
            return "Microsoft.Data.SqlClient";
        }

        // [Recovered June-15] Create a provider DbConnection (no connection string set)
        // using the same factory resolution as GetConnection. Static so the DB Settings
        // Test endpoint can build a probe connection without the registry instance.
        public static System.Data.Common.DbConnection CreateProviderConnection(string databaseType)
        {
            var providerName = ResolveProviderInvariantName(databaseType);
            try
            {
                var factory = System.Data.Common.DbProviderFactories.GetFactory(providerName);
                var conn = factory.CreateConnection();
                if (conn == null) throw new InvalidOperationException("Provider '" + providerName + "' returned null connection.");
                return conn;
            }
            catch (System.ArgumentException)
            {
                throw new InvalidOperationException("Database provider '" + providerName + "' is not registered. Either install the provider package on the host (e.g. Microsoft.Data.SqlClient) or pass a databaseType this host already loads.");
            }
        }
    }
}
