using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Samples.CorporateWeb.FullDemo;

/// <summary>
/// Completes MegaForm setup automatically so the sample works without running
/// the setup wizard. Creates the lock file, writes production configuration,
/// and seeds admin credentials.
/// </summary>
public class SetupCompletionService : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IHostEnvironment _environment;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SetupCompletionService> _logger;

    public SetupCompletionService(
        IServiceProvider services,
        IHostEnvironment environment,
        IConfiguration configuration,
        ILogger<SetupCompletionService> logger)
    {
        _services = services;
        _environment = environment;
        _configuration = configuration;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        var lockPath = Path.Combine(_environment.ContentRootPath, "setup.lock");
        var productionConfigPath = Path.Combine(_environment.ContentRootPath, "appsettings.Production.json");
        var provider = _configuration["Database:Provider"] ?? "Sqlite";
        var connectionString = _configuration.GetConnectionString("MegaForm")
            ?? "Data Source=App_Data/MegaForm/full-demo.db";

        // 1. Ensure production configuration exists so the runtime health check passes.
        if (!File.Exists(productionConfigPath))
        {
            var jwtKey = _configuration["Jwt:Key"];
            if (string.IsNullOrWhiteSpace(jwtKey))
            {
                var bytes = new byte[48];
                RandomNumberGenerator.Fill(bytes);
                jwtKey = Convert.ToBase64String(bytes);
            }

            var config = new
            {
                Database = new { Provider = provider },
                ConnectionStrings = new
                {
                    MegaForm = connectionString,
                    DashboardDatabase = connectionString
                },
                App = new
                {
                    SiteName = "MegaForm Corporate Full Demo",
                    BaseUrl = "http://localhost:5151",
                    AdminEmail = "admin@example.com"
                },
                Jwt = new { Key = jwtKey },
                Email = new
                {
                    From = "noreply@example.com",
                    Host = "localhost",
                    Port = 25,
                    Username = "",
                    Password = "",
                    EnableSsl = false
                }
            };

            File.WriteAllText(productionConfigPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
            _logger.LogInformation("[CorporateWeb.FullDemo] Created appsettings.Production.json.");
        }

        // 2. Ensure the setup lock file exists so SetupMiddleware and /admin stop redirecting.
        if (!File.Exists(lockPath))
        {
            File.WriteAllText(lockPath, $"Auto-completed at {DateTime.UtcNow:O} by CorporateWeb.FullDemo sample.");
            _logger.LogInformation("[CorporateWeb.FullDemo] Created setup.lock.");
        }

        // 3. Seed admin credentials if they are not present.
        try
        {
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            // Ensure the schema exists (no-op if already created by EnsureMegaFormDatabaseReady).
            db.Database.EnsureCreated();

            var hasAdmin = db.ModuleSettings.Any(s =>
                s.ModuleId == 0 &&
                s.SettingKey == "Admin_Hash" &&
                !string.IsNullOrEmpty(s.SettingValue));

            if (!hasAdmin)
            {
                const string adminUsername = "admin";
                const string adminEmail = "admin@example.com";
                const string adminPassword = "admin123"; // demo only

                var salt = GenerateSalt();
                var hash = HashPassword(adminPassword, salt);

                UpsertSetting(db, 0, "Admin_Email", adminEmail);
                UpsertSetting(db, 0, "Admin_Username", adminUsername);
                UpsertSetting(db, 0, "Admin_Salt", salt);
                UpsertSetting(db, 0, "Admin_Hash", hash);
                db.SaveChanges();

                _logger.LogInformation("[CorporateWeb.FullDemo] Seeded admin credentials (admin / admin123).");
            }
            else
            {
                _logger.LogInformation("[CorporateWeb.FullDemo] Admin credentials already present.");
            }

            // Ensure the dashboard database connection is configured so AI/SQL tools work.
            var dashboardConn = db.ModuleSettings
                .FirstOrDefault(s => s.ModuleId == 0 && s.SettingKey == "Database_ConnectionString")
                ?.SettingValue;
            if (string.IsNullOrWhiteSpace(dashboardConn))
            {
                UpsertSetting(db, 0, "Database_Provider", provider);
                UpsertSetting(db, 0, "Database_ConnectionString", connectionString);
                UpsertSetting(db, 0, "Database_ConnectionAlias", "DashboardDatabase");
                db.SaveChanges();
                _logger.LogInformation("[CorporateWeb.FullDemo] Seeded DashboardDatabase connection.");
            }
            else
            {
                _logger.LogInformation("[CorporateWeb.FullDemo] DashboardDatabase connection already present.");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CorporateWeb.FullDemo] Failed to seed admin credentials.");
            throw;
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private static string GenerateSalt()
    {
        var bytes = new byte[16];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes);
    }

    private static string HashPassword(string password, string salt)
    {
        using var pbkdf2 = new Rfc2898DeriveBytes(
            password, Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256);
        return Convert.ToBase64String(pbkdf2.GetBytes(32));
    }

    private static void UpsertSetting(MegaFormDbContext db, int moduleId, string key, string value)
    {
        var existing = db.ModuleSettings.FirstOrDefault(s => s.ModuleId == moduleId && s.SettingKey == key);
        if (existing == null)
            db.ModuleSettings.Add(new ModuleSettingRow { ModuleId = moduleId, SettingKey = key, SettingValue = value });
        else
            existing.SettingValue = value;
    }
}
