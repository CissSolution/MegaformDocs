using System;
using MegaForm.Core.i18n;
using MegaForm.Web.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;
using MegaForm.Sdk;
using MegaForm.Web.Controllers;
using MegaForm.Web.Data;
using MegaForm.Web.Middleware;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

// ── Database (multi-provider: SqlServer | Sqlite | PostgreSQL | MySQL) ────────────
// Cấu hình trong appsettings.json: Database:Provider và ConnectionStrings:MegaForm
builder.Services.AddMegaFormDatabase(cfg, builder.Environment);

// ── Repositories (IFormRepository → EfFormRepository, etc.) ───────────────
builder.Services.AddScoped<IFormRepository,       EfFormRepository>();
builder.Services.AddScoped<ISubmissionRepository, EfSubmissionRepository>();
builder.Services.AddScoped<IDraftRepository,      EfDraftRepository>();
builder.Services.AddScoped<IPhase2Repository,     EfPhase2Repository>();
builder.Services.AddScoped<IFileRepository,       EfFileRepository>();

// ── Platform Services ──────────────────────────────────────────────────────
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IModuleSettingsService, WebModuleSettingsService>();
builder.Services.AddScoped<IPlatformContext,       WebPlatformContext>();
builder.Services.AddScoped<IStorageService>(sp => {
    var env = sp.GetRequiredService<Microsoft.AspNetCore.Hosting.IWebHostEnvironment>();
    var baseUrl = cfg["App:BaseUrl"] ?? "";
    return new WebStorageService(env, baseUrl);
});
builder.Services.AddScoped<SmtpEmailSender>();
builder.Services.AddScoped<IEmailSender>(sp => sp.GetRequiredService<SmtpEmailSender>());
builder.Services.AddSingleton<ILogService, NetLogService>();
builder.Services.AddScoped<IRuntimeLogStore, RuntimeLogStore>();
builder.Services.AddScoped<RuntimeLogStore>();
builder.Services.AddSingleton<IThemeDesignerHostRenderer, ThemeDesignerHostRenderer>();
builder.Services.AddSingleton<BuilderTemplateCatalogService>();

// ── Core Business Services ─────────────────────────────────────────────────
builder.Services.AddScoped<EmailNotificationService>();
builder.Services.AddScoped<WebhookService>();
builder.Services.AddScoped<UniqueIdService>();
builder.Services.AddScoped<PermissionService>();

// ── Workflow Engine v2.0 ─────────────────────────────────────────────────────
builder.Services.AddScoped<IWorkflowRepository,  EfWorkflowRepository>();
builder.Services.AddScoped<IWorkflowEvaluator,   WorkflowEvaluator>();
builder.Services.AddScoped<IWorkflowEmailSender, WebWorkflowEmailSender>();
builder.Services.AddScoped<IWorkflowEngine,      WorkflowEngineV2>();
builder.Services.AddSingleton<IWebhookWorkflowNodeUiService, WebhookWorkflowNodeUiService>();
builder.Services.AddSingleton<IEmailWorkflowNodeUiService, EmailWorkflowNodeUiService>();
builder.Services.AddSingleton<IWorkflowNodeUiSchemaProvider, WorkflowNodeUiSchemaProvider>();
// Node executors — all registered as INodeExecutor, engine resolves via IEnumerable<INodeExecutor>
builder.Services.AddScoped<INodeExecutor, FormFieldNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, ConditionNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, WebhookNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, EmailNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, EndNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, CalculateNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, SetVariableNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, DatabaseNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, GoogleSheetsNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, SwitchNodeExecutor>();
builder.Services.AddScoped<INodeExecutor, LoopNodeExecutor>();
// IConnectionRegistry — reads named connection strings from appsettings (never from frontend)
builder.Services.AddScoped<IConnectionRegistry, WebConnectionRegistry>();
builder.Services.AddScoped<IDatabaseWorkflowMetadataService, DatabaseWorkflowMetadataService>();
builder.Services.AddScoped<SubmissionProcessor>();
builder.Services.AddScoped<PrintFormRenderer>();
builder.Services.AddScoped<ILocalizationProvider, WebLocalizationProvider>();

// ── MegaForm SDK (IMegaFormClient facade) ────────────────────────────────────
// Resolves the repositories + IPlatformContext + IStorageService + SubmissionProcessor
// registered above. IFileRepository is now wired so the SDK Files API is fully usable.
builder.Services.AddMegaFormSdk();

// ── Authentication (Cookie for admin UI + optional JWT for API clients) ──
// [SecFix 2026-07-03 P0-5] Prefer the signing key + issuer/audience from the environment so the
// production secret is NOT the one committed to git (rotate the config value out of source control
// and set MEGAFORM_JWT_KEY on the host). Issuer/Audience are validated only when configured, so
// enabling them here cannot break tokens on hosts that don't set them.
var jwtKey = Environment.GetEnvironmentVariable("MEGAFORM_JWT_KEY") ?? cfg["Jwt:Key"];
var jwtIssuer = Environment.GetEnvironmentVariable("MEGAFORM_JWT_ISSUER") ?? cfg["Jwt:Issuer"];
var jwtAudience = Environment.GetEnvironmentVariable("MEGAFORM_JWT_AUDIENCE") ?? cfg["Jwt:Audience"];
builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = "MegaFormAuth";
    options.DefaultAuthenticateScheme = "MegaFormAuth";
    options.DefaultChallengeScheme = "MegaFormAuth";
})
.AddPolicyScheme("MegaFormAuth", "MegaForm Auth", options =>
{
    options.ForwardDefaultSelector = context =>
    {
        var auth = context.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return JwtBearerDefaults.AuthenticationScheme;
        return CookieAuthenticationDefaults.AuthenticationScheme;
    };
})
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, o =>
{
    o.LoginPath = "/admin/login";
    o.LogoutPath = "/admin/logout";
    o.AccessDeniedPath = "/admin/login";
    o.SlidingExpiration = true;
    o.Cookie.Name = "MegaForm.Auth";
    o.Cookie.Path = "/";
    o.Cookie.HttpOnly = true;
    o.Cookie.IsEssential = true;
    o.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? Microsoft.AspNetCore.Http.CookieSecurePolicy.None
        : Microsoft.AspNetCore.Http.CookieSecurePolicy.SameAsRequest;
});

if (!string.IsNullOrEmpty(jwtKey))
{
    builder.Services.AddAuthentication()
        .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, o => {
            o.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = !string.IsNullOrEmpty(jwtIssuer),
                ValidIssuer              = jwtIssuer,
                ValidateAudience         = !string.IsNullOrEmpty(jwtAudience),
                ValidAudience            = jwtAudience,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            };
        });
}

builder.Services.AddAuthorization();

// ── API + CORS ─────────────────────────────────────────────────────────────
builder.Services.AddControllersWithViews(o =>
{
    // .NET 7+ tự thêm [Required] cho non-nullable string properties.
    // Core models (FormInfo, v.v.) không dùng [Required] — tắt tính năng này.
    o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
})
.AddNewtonsoftJson(); // Dùng Newtonsoft.Json giống DNN

// [SecFix 2026-07-03 P2-1] When origins are configured (MEGAFORM_CORS_ORIGINS or Cors:Origins,
// comma/semicolon-separated) lock CORS to them and allow credentials; otherwise keep the
// permissive dev default (AllowAnyOrigin, no credentials — the invalid Origin+credentials combo
// is avoided). Set the env var in production to stop arbitrary origins calling with cookies.
var corsRaw = Environment.GetEnvironmentVariable("MEGAFORM_CORS_ORIGINS") ?? cfg["Cors:Origins"] ?? "";
var corsOrigins = corsRaw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries);
for (int i = 0; i < corsOrigins.Length; i++) corsOrigins[i] = corsOrigins[i].Trim();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    if (corsOrigins.Length > 0)
        p.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader().AllowCredentials();
    else
        p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
}));

// ── Swagger (development) ─────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o => o.SwaggerDoc("v1", new() { Title = "MegaForm API", Version = "v1" }));

var app = builder.Build();

// ── DB Init ────────────────────────────────────────────────────────────────
// Tạo database/tables MegaForm nếu chưa có, kể cả khi DB hiện tại đã chứa bảng của hệ khác.
// Tránh lỗi EnsureCreated() no-op trên SQL Server/PostgreSQL/MySQL khi dùng chung database.
if (MegaForm.Web.Controllers.SetupController.IsSetupComplete(app.Environment))
{
    try
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
        DatabaseSchemaBootstrapper.EnsureMegaFormSchema(db);
        Console.WriteLine("[MegaForm] Database ready.");
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[MegaForm] WARNING: DB init failed: {ex.Message}");
    }
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.UseCors();
app.UseStaticFiles();

// ⚡ SetupMiddleware phải đứng ĐẦU — trước Swagger, trước Auth, trước Controllers
// Nếu setup.lock chưa có → redirect tất cả về /setup (trừ /setup/* và static files)
app.UseMiddleware<SetupMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Trang chủ: nếu chưa setup → SetupMiddleware đã redirect rồi
// Nếu đã setup → vào swagger (dev) hoặc dashboard (prod)
app.MapGet("/", (Microsoft.AspNetCore.Hosting.IWebHostEnvironment env) =>
    MegaForm.Web.Controllers.SetupController.IsSetupComplete(env)
        ? Results.Redirect("/admin")
        : Results.Redirect("/setup")
);

app.Run();

// ── Dev Bypass Auth Handler (development only) ─────────────────────────────
public class DevBypassHandler : Microsoft.AspNetCore.Authentication.AuthenticationHandler<
    Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions>
{
    public DevBypassHandler(
        Microsoft.Extensions.Options.IOptionsMonitor<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions> options,
        Microsoft.Extensions.Logging.ILoggerFactory logger,
        System.Text.Encodings.Web.UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override System.Threading.Tasks.Task<Microsoft.AspNetCore.Authentication.AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[] {
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.NameIdentifier, "1"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Name, "DevUser"),
            new System.Security.Claims.Claim(System.Security.Claims.ClaimTypes.Role, "Administrator"),
        };
        var identity  = new System.Security.Claims.ClaimsIdentity(claims, "DevBypass");
        var principal = new System.Security.Claims.ClaimsPrincipal(identity);
        var ticket    = new Microsoft.AspNetCore.Authentication.AuthenticationTicket(principal, "DevBypass");
        return System.Threading.Tasks.Task.FromResult(
            Microsoft.AspNetCore.Authentication.AuthenticateResult.Success(ticket));
    }
}
