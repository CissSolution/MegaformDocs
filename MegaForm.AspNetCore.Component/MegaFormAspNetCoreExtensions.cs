using System;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Services.AiKnowledge;
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
using MegaForm.Web.Controllers;
using MegaForm.Web.Data;
using MegaForm.Web.Middleware;
using MegaForm.Web.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace MegaForm.AspNetCore.Component
{
    public static class MegaFormAspNetCoreExtensions
    {
        /// <summary>
        /// Registers MegaForm services. The host must pre-configure connection string / provider
        /// via the options callback.
        /// </summary>
        public static IServiceCollection AddMegaForm(
            this IServiceCollection services,
            Action<MegaFormOptions> configureOptions = null)
        {
            var options = new MegaFormOptions();
            configureOptions?.Invoke(options);
            services.AddSingleton(options);
            services.AddSingleton<IMegaFormRouteOptions>(options);

            RegisterDatabase(services, options);
            RegisterMegaFormServices(services, options);
            RegisterMvc(services, options);

            return services;
        }

        /// <summary>
        /// Registers MegaForm services, defaulting ContentRootPath and BaseUrl from the host.
        /// </summary>
        public static IServiceCollection AddMegaForm(
            this IServiceCollection services,
            IConfiguration configuration,
            IWebHostEnvironment environment,
            Action<MegaFormOptions> configureOptions = null)
        {
            return services.AddMegaForm(options =>
            {
                options.ContentRootPath = environment?.ContentRootPath;
                options.BaseUrl = configuration?["App:BaseUrl"] ?? options.BaseUrl;

                if (string.IsNullOrWhiteSpace(options.ConnectionString))
                {
                    options.ConnectionString = configuration?.GetConnectionString("MegaForm");
                }
                if (string.IsNullOrWhiteSpace(options.DatabaseProvider) || options.DatabaseProvider == "SqlServer")
                {
                    var configuredProvider = configuration?["Database:Provider"];
                    if (!string.IsNullOrWhiteSpace(configuredProvider))
                        options.DatabaseProvider = configuredProvider;
                }

                configureOptions?.Invoke(options);
            });
        }

        /// <summary>
        /// Registers MegaForm on the host builder, enables static web assets in any environment,
        /// and wires up the default configuration and environment.
        /// </summary>
        public static WebApplicationBuilder AddMegaForm(
            this WebApplicationBuilder builder,
            Action<MegaFormOptions> configureOptions = null)
        {
            builder.WebHost.UseStaticWebAssets();
            builder.Services.AddMegaForm(builder.Configuration, builder.Environment, configureOptions);
            return builder;
        }

        public static WebApplication UseMegaForm(
            this WebApplication app,
            Action<MegaFormOptions> configureOptions = null)
        {
            var options = app.Services.GetRequiredService<MegaFormOptions>();
            configureOptions?.Invoke(options);

            if (options.UseCors)
                app.UseCors();

            app.UseStaticFiles();

            if (options.UseSetupWizard)
                app.UseMiddleware<SetupMiddleware>();

            if (options.UseSwagger && app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            if (options.UseMegaFormAuthentication)
            {
                app.UseAuthentication();
                app.UseAuthorization();
            }

            app.MapControllers();

            // Wire the ambient SDK accessor for non-DI consumers (DNN-style hosts, Razor scripts).
            try { MegaFormSdk.Initialize(app.Services); } catch { /* non-fatal */ }

            return app;
        }

        public static WebApplication EnsureMegaFormDatabaseReady(this WebApplication app)
        {
            var options = app.Services.GetRequiredService<MegaFormOptions>();
            if (!options.AutoEnsureDatabase)
                return app;

            if (options.UseSetupWizard && !SetupController.IsSetupComplete(app.Environment))
                return app;

            try
            {
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
                DatabaseSchemaBootstrapper.EnsureMegaFormSchema(db);
                Console.WriteLine("[MegaForm] Database ready.");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[MegaForm.AspNetCore.Component] WARNING: DB init failed: {ex.Message}");
            }
            return app;
        }

        // ── registration helpers ─────────────────────────────────────────────

        private static void RegisterDatabase(IServiceCollection services, MegaFormOptions options)
        {
            if (options.ConfigureDbContext != null)
            {
                services.AddDbContext<MegaFormDbContext>(options.ConfigureDbContext);
                return;
            }

            services.AddDbContext<MegaFormDbContext>(dbOptions =>
                DatabaseConfig.ConfigureProvider(
                    dbOptions,
                    options.DatabaseProvider,
                    options.ConnectionString));
        }

        private static void RegisterMegaFormServices(IServiceCollection services, MegaFormOptions options)
        {
            // Repositories
            services.AddScoped<IFormRepository, EfFormRepository>();
            services.AddScoped<ISubmissionRepository, EfSubmissionRepository>();
            services.AddScoped<IDraftRepository, EfDraftRepository>();
            services.AddScoped<IPhase2Repository, EfPhase2Repository>();
            services.AddScoped<IFileRepository, EfFileRepository>();
            services.AddScoped<IDocumentRepository, EfDocumentRepository>();

            // Platform services
            services.AddHttpContextAccessor();
            services.AddScoped<IModuleSettingsService, WebModuleSettingsService>();
            services.AddScoped<IPlatformContext, WebPlatformContext>();
            services.AddScoped<IPermissionPrincipalCatalogProvider, WebPermissionPrincipalCatalogProvider>();
            services.AddScoped<IWorkflowPrincipalResolver, WebWorkflowPrincipalResolver>();
            services.AddScoped<IStorageService>(sp =>
            {
                var env = sp.GetRequiredService<IWebHostEnvironment>();
                return new WebStorageService(env, options.BaseUrl ?? string.Empty);
            });
            services.AddScoped<SmtpEmailSender>();
            services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<SmtpEmailSender>());
            services.AddSingleton<ILogService, NetLogService>();
            services.AddScoped<IRuntimeLogStore, RuntimeLogStore>();
            services.AddScoped<RuntimeLogStore>();
            services.AddSingleton<IThemeDesignerHostRenderer, ThemeDesignerHostRenderer>();
            services.AddSingleton<BuilderTemplateCatalogService>();

            // Core business services
            services.AddScoped<EmailNotificationService>();
            services.AddScoped<WebhookService>();
            services.AddScoped<UniqueIdService>();
            services.AddScoped<PermissionService>();
            services.AddScoped<PermissionCatalogService>();
            services.AddScoped<AppProfileService>();
            services.AddScoped<AppDefinitionService>();
            services.AddScoped<AppQueryRegistryService>();
            services.AddScoped<DocumentRevisionService>();
            services.AddScoped<WebWorkflowActorAccessor>();
            services.AddScoped<IWorkflowRepository, EfWorkflowRepository>();
            services.AddScoped<IWorkflowEvaluator, WorkflowEvaluator>();
            services.AddScoped<IWorkflowEmailSender, WebWorkflowEmailSender>();
            services.AddScoped<IWorkflowIdentityProvisioningService, WebWorkflowIdentityProvisioningService>();
            // Free tier: no-op workflow engine. The premium add-on replaces this
            // with the real WorkflowEngineV2 implementation.
            services.AddScoped<IWorkflowEngine, NoOpWorkflowEngine>();
            services.AddScoped<WorkflowTaskService>();
            services.AddScoped<WorkflowTransparencyService>();
            services.AddScoped<SubmissionWorkflowDetailService>();
            services.AddScoped<SubmissionQueryService>();
            services.AddScoped<AdminRecordShellService>();
            services.AddSingleton<IWebhookWorkflowNodeUiService, WebhookWorkflowNodeUiService>();
            services.AddSingleton<IEmailWorkflowNodeUiService, EmailWorkflowNodeUiService>();
            services.AddSingleton<IWorkflowNodeUiSchemaProvider, WorkflowNodeUiSchemaProvider>();

            // Workflow node executors
            services.AddScoped<INodeExecutor, FormFieldNodeExecutor>();
            services.AddScoped<INodeExecutor, ConditionNodeExecutor>();
            services.AddScoped<INodeExecutor, WebhookNodeExecutor>();
            services.AddScoped<INodeExecutor, EmailNodeExecutor>();
            services.AddScoped<INodeExecutor, EndNodeExecutor>();
            services.AddScoped<INodeExecutor, CalculateNodeExecutor>();
            services.AddScoped<INodeExecutor, SetVariableNodeExecutor>();
            services.AddScoped<INodeExecutor, ApprovalNodeExecutor>();
            services.AddScoped<INodeExecutor, DatabaseNodeExecutor>();
            services.AddScoped<INodeExecutor, GoogleSheetsNodeExecutor>();
            services.AddScoped<INodeExecutor, SwitchNodeExecutor>();
            services.AddScoped<INodeExecutor, LoopNodeExecutor>();
            services.AddScoped<INodeExecutor, AddRoleNodeExecutor>();
            services.AddScoped<INodeExecutor, AddUserNodeExecutor>();
            services.AddScoped<INodeExecutor, AddUserToRoleNodeExecutor>();

            services.AddScoped<IConnectionRegistry, WebConnectionRegistry>();
            services.AddScoped<IDatabaseWorkflowMetadataService, DatabaseWorkflowMetadataService>();

            // Feature flags (free tier)
            services.AddSingleton<IMegaFormFeatureToggles, DefaultMegaFormFeatureToggles>();
            services.AddScoped<SubmissionProcessor>();
            services.AddScoped<PrintFormRenderer>();

            // MegaForm SDK facade (IMegaFormClient)
            services.AddMegaFormSdk();

            // Razor widget runtime
            services.AddRazorComponents();
            services.AddSingleton<RazorWidgetRegistry>();
            services.AddSingleton<RazorCompilationService>();
            services.AddScoped<IRazorActionService, RazorActionService>();
            services.AddScoped<IMfSqlExecutor, RegistrySqlExecutor>();
            services.AddScoped<IMfFormContext, StubFormContext>();
            services.AddScoped<IMfUserContext, StubUserContext>();
            services.AddScoped<IMfSiteContext, StubSiteContext>();
            services.AddScoped<IMfRazorEmitter, StubEmitter>();

            // Google Sheets runtime auth
            services.AddScoped<IGoogleAuthSettings, WebGoogleAuthSettings>();
            services.AddScoped<GoogleSheetsAuthService>();
            services.AddScoped<ILocalizationProvider, WebLocalizationProvider>();

            // Integration providers (Marketing, SaaS, Payments, Storage, Spam, Conversion, Summaries, Templates, Quiz, LandingPage)
            RegisterIntegrationProviders(services);

            // AI Knowledge Base
            services.AddScoped<IAiKnowledgeService, WebAiKnowledgeService>();

            // Reporting indexer (B55)
            services.AddScoped<SubmissionIndexerService>(sp =>
            {
                var db = sp.GetRequiredService<MegaFormDbContext>();
                return new SubmissionIndexerService(() => db.Database.GetDbConnection());
            });

            // Authentication (opt-in)
            if (options.UseMegaFormAuthentication)
            {
                RegisterAuthentication(services, options);
            }

            // CORS (opt-in)
            if (options.UseCors)
            {
                // [SecFix P2-1] Lock CORS to configured origins (MEGAFORM_CORS_ORIGINS) when present;
                // otherwise keep the permissive default for local/dev.
                var corsRaw = Environment.GetEnvironmentVariable("MEGAFORM_CORS_ORIGINS") ?? string.Empty;
                var corsOrigins = corsRaw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < corsOrigins.Length; i++) corsOrigins[i] = corsOrigins[i].Trim();
                services.AddCors(o => o.AddDefaultPolicy(p =>
                {
                    if (corsOrigins.Length > 0)
                        p.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials();
                    else
                        p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
                }));
            }

            // Swagger (opt-in)
            if (options.UseSwagger)
            {
                services.AddEndpointsApiExplorer();
                services.AddSwaggerGen(o => o.SwaggerDoc("v1", new() { Title = "MegaForm API", Version = "v1" }));
            }
        }

        private static void RegisterAuthentication(IServiceCollection services, MegaFormOptions options)
        {
            // [SecFix 2026-07-03 P0-9] Mirror MegaForm.Web/Program.cs: prefer the JWT signing key +
            // issuer/audience from the environment so no real secret is baked into config, and
            // validate issuer/audience whenever they are configured. Previously this extension
            // hardcoded the key from options and disabled issuer/audience validation entirely —
            // any host that used it (CorporateWeb / AspNetCore samples) was open to token forgery.
            var jwtKey = Environment.GetEnvironmentVariable("MEGAFORM_JWT_KEY") ?? options.JwtKey;
            var jwtIssuer = Environment.GetEnvironmentVariable("MEGAFORM_JWT_ISSUER");
            var jwtAudience = Environment.GetEnvironmentVariable("MEGAFORM_JWT_AUDIENCE");
            var isDev = string.Equals(
                Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development",
                StringComparison.OrdinalIgnoreCase);
            services.AddAuthentication(authOptions =>
            {
                authOptions.DefaultScheme = options.AuthenticationSchemeName;
                authOptions.DefaultAuthenticateScheme = options.AuthenticationSchemeName;
                authOptions.DefaultChallengeScheme = options.AuthenticationSchemeName;
            })
            .AddPolicyScheme(options.AuthenticationSchemeName, "MegaForm Auth", policyOptions =>
            {
                policyOptions.ForwardDefaultSelector = context =>
                {
                    var auth = context.Request.Headers["Authorization"].ToString();
                    if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                        return JwtBearerDefaults.AuthenticationScheme;
                    return CookieAuthenticationDefaults.AuthenticationScheme;
                };
            })
            .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, o =>
            {
                o.LoginPath = options.LoginPath;
                o.LogoutPath = options.LogoutPath;
                o.AccessDeniedPath = options.AccessDeniedPath;
                o.SlidingExpiration = true;
                o.Cookie.Name = options.CookieName;
                o.Cookie.Path = "/";
                o.Cookie.HttpOnly = true;
                o.Cookie.IsEssential = true;
                o.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
                // [SecFix P2-2] Require Secure cookies outside Development so the auth cookie is
                // never sent over plain HTTP on a real deployment.
                o.Cookie.SecurePolicy = isDev
                    ? Microsoft.AspNetCore.Http.CookieSecurePolicy.SameAsRequest
                    : Microsoft.AspNetCore.Http.CookieSecurePolicy.Always;
            });

            if (!string.IsNullOrEmpty(jwtKey))
            {
                services.AddAuthentication().AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, o =>
                {
                    o.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = !string.IsNullOrEmpty(jwtIssuer),
                        ValidIssuer = jwtIssuer,
                        ValidateAudience = !string.IsNullOrEmpty(jwtAudience),
                        ValidAudience = jwtAudience,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
                    };
                });
            }

            services.AddAuthorization();
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

        private static void RegisterMvc(IServiceCollection services, MegaFormOptions options)
        {
            services.AddControllersWithViews(o =>
            {
                o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
                o.Conventions.Add(new MegaFormRoutePrefixConvention(options));
            })
            .AddApplicationPart(typeof(MegaFormController).Assembly)
            .AddNewtonsoftJson();
        }
    }
}
