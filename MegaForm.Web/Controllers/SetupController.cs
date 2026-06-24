using System;
using System.IO;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MegaForm.Web.Data;
using MegaForm.Web.Services;
using Microsoft.AspNetCore.Hosting;
using System.Collections.Generic;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// Setup Wizard — chạy khi lần đầu khởi động, chưa có DB/admin.
    /// Redirect về /setup nếu chưa setup xong.
    /// Sau khi setup: tạo lock file → không cho vào /setup nữa.
    /// </summary>
    [Route("setup")]
    public class SetupController : Controller
    {
        private readonly IConfiguration _cfg;
        private readonly IWebHostEnvironment _env;
        private readonly Microsoft.Extensions.Hosting.IHostApplicationLifetime _lifetime;
        private readonly MegaFormDbContext _runtimeDb;

        public SetupController(IConfiguration cfg, IWebHostEnvironment env,
            Microsoft.Extensions.Hosting.IHostApplicationLifetime lifetime,
            MegaFormDbContext runtimeDb)
        {
            _cfg = cfg;
            _env = env;
            _lifetime = lifetime;
            _runtimeDb = runtimeDb;
        }

        // ── Lock file: wwwroot/setup.lock hoặc App_Data/setup.lock ──────────
        private string LockFilePath =>
            Path.Combine(_env.ContentRootPath, "setup.lock");

        public static bool IsSetupComplete(IWebHostEnvironment env) =>
            System.IO.File.Exists(Path.Combine(env.ContentRootPath, "setup.lock"));

        // GET /setup
        [HttpGet("")]
        [HttpGet("index")]
        public IActionResult Index()
        {
            if (IsSetupComplete(_env))
                return Redirect("/admin");
            return View("~/Views/Setup/Index.cshtml");
        }


        [HttpGet("runtime-status")]
        public IActionResult RuntimeStatus()
        {
            var status = GetRuntimeStatus();
            return status.Ready
                ? Ok(new { ready = true, status.Message })
                : StatusCode(503, new { ready = false, status.Message });
        }

        // POST /setup/test-connection — kiểm tra kết nối DB
        [HttpPost("test-connection")]
        public IActionResult TestConnection([FromBody] TestConnectionRequest req)
        {
            try
            {
                var connStr = BuildConnectionString(req);
                var opts = new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<MegaFormDbContext>();
                ConfigureProvider(opts, req.Provider, connStr);
                using var db = new MegaFormDbContext(opts.Options);
                db.Database.CanConnect();
                return Ok(new { success = true, message = "Connection successful!" });
            }
            catch (Exception ex)
            {
                return Ok(new { success = false, message = BuildFriendlyDatabaseError(ex, req?.Provider) });
            }
        }

        // POST /setup/complete — lưu config + tạo DB + tạo admin
        [HttpPost("complete")]
        public IActionResult Complete([FromBody] SetupRequest req)
        {
            if (IsSetupComplete(_env))
                return BadRequest(new { error = "Already setup." });

            try
            {
                // 1. Build connection string
                var connStr = BuildConnectionString(req.Database);

                // 2. Tạo DB schema — dùng context này suốt để tránh "table not found"
                var opts = new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<MegaFormDbContext>();
                ConfigureProvider(opts, req.Database.Provider, connStr);
                using var setupDb = new MegaFormDbContext(opts.Options);
                DatabaseSchemaBootstrapper.EnsureMegaFormSchema(setupDb);

                // 3. Ghi appsettings.Production.json
                var settings = new
                {
                    Database = new { Provider = req.Database.Provider },
                    ConnectionStrings = new { MegaForm = connStr },
                    App = new
                    {
                        SiteName   = req.Site.SiteName,
                        BaseUrl    = req.Site.BaseUrl,
                        AdminEmail = req.Admin.Email,
                    },
                    Jwt = new { Key = GenerateJwtKey() },
                    Email = new
                    {
                        From = req.Email?.From ?? $"noreply@{ExtractDomain(req.Site.BaseUrl)}",
                        Host = req.Email?.Host ?? "localhost",
                        Port = req.Email?.Port ?? "25",
                        Username = req.Email?.Username ?? "",
                        Password = req.Email?.Password ?? "",
                        EnableSsl = req.Email?.EnableSsl ?? false,
                        ReplyTo = req.Email?.ReplyTo ?? "",
                        TimeoutMs = req.Email?.TimeoutMs ?? "20000",
                    },
                };
                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                var settingsPath = Path.Combine(_env.ContentRootPath, "appsettings.Production.json");
                System.IO.File.WriteAllText(settingsPath, json);

                // 4. Tạo admin user — dùng cùng context vừa EnsureCreated (SQLite file đã tạo)
                SaveAdminCredentials(setupDb, req.Admin);

                // 5. Ghi lock file
                System.IO.File.WriteAllText(LockFilePath,
                    $"Setup completed at {DateTime.UtcNow:O} by {req.Admin.Email}");

                // Restart app để load appsettings.Production.json với DB config thật
                // Client sẽ redirect sau 2 giây (đủ thời gian app restart)
                _ = System.Threading.Tasks.Task.Run(async () => {
                    await System.Threading.Tasks.Task.Delay(500);
                    _lifetime.StopApplication();
                });

                return Ok(new { success = true, redirectUrl = "/", restartPending = true });
            }
            catch (Exception ex)
            {
                // Collect full exception chain cho debugging
                var msgs = new System.Collections.Generic.List<string>();
                var current = (System.Exception)ex;
                while (current != null) { msgs.Add(current.Message); current = current.InnerException; }
                return StatusCode(500, new { error = string.Join(" → ", msgs) });
            }
        }

        // GET /setup/reset — xóa setup.lock để chạy lại wizard (dùng khi cấu hình sai)
        [Authorize]
        [HttpGet("reset")]
        public IActionResult Reset()
        {
            if (System.IO.File.Exists(LockFilePath))
                System.IO.File.Delete(LockFilePath);
            // Xóa appsettings.Production.json để bắt đầu lại hoàn toàn
            var prod = System.IO.Path.Combine(_env.ContentRootPath, "appsettings.Production.json");
            if (System.IO.File.Exists(prod))
                System.IO.File.Delete(prod);
            return Redirect("/setup");
        }

        // ── Helpers ──────────────────────────────────────────────────────────

        private (bool Ready, string Message) GetRuntimeStatus()
        {
            if (!IsSetupComplete(_env))
            {
                return (false, "Setup is not complete yet.");
            }

            var prodFile = Path.Combine(_env.ContentRootPath, "appsettings.Production.json");
            if (!System.IO.File.Exists(prodFile))
            {
                return (false, "Production settings file not found yet.");
            }

            try
            {
                using var prodCfg = JsonDocument.Parse(System.IO.File.ReadAllText(prodFile));
                var expectedProvider = prodCfg.RootElement.TryGetProperty("Database", out var dbNode)
                    && dbNode.TryGetProperty("Provider", out var providerNode)
                        ? providerNode.GetString() ?? "SqlServer"
                        : "SqlServer";

                var expectedConn = prodCfg.RootElement.TryGetProperty("ConnectionStrings", out var connNode)
                    && connNode.TryGetProperty("MegaForm", out var megaFormNode)
                        ? megaFormNode.GetString() ?? string.Empty
                        : string.Empty;

                var runtimeProvider = (_runtimeDb.Database.ProviderName ?? string.Empty).ToLowerInvariant();
                var expectedProviderName = (expectedProvider ?? string.Empty).Trim().ToLowerInvariant();

                var providerMatches = expectedProviderName switch
                {
                    "sqlite" => runtimeProvider.Contains("sqlite"),
                    "postgres" => runtimeProvider.Contains("npgsql") || runtimeProvider.Contains("postgres"),
                    "postgresql" => runtimeProvider.Contains("npgsql") || runtimeProvider.Contains("postgres"),
                    "mysql" => runtimeProvider.Contains("mysql"),
                    "mariadb" => runtimeProvider.Contains("mysql"),
                    _ => runtimeProvider.Contains("sqlserver")
                };

                if (!providerMatches)
                {
                    return (false, "Application is still running with the previous database provider.");
                }

                var runtimeConn = _runtimeDb.Database.GetDbConnection().ConnectionString ?? string.Empty;
                if (runtimeConn.IndexOf(":memory:", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return (false, "Application is still running with the temporary in-memory database.");
                }

                if (!string.IsNullOrWhiteSpace(expectedConn))
                {
                    var normalizedExpected = DatabaseConfig.NormalizeConnectionString(expectedProvider, expectedConn);
                    var normalizedRuntime = DatabaseConfig.NormalizeConnectionString(expectedProvider, runtimeConn);
                    if (!string.Equals(normalizedExpected, normalizedRuntime, StringComparison.OrdinalIgnoreCase))
                    {
                        return (false, "Application has not reloaded the configured production database yet.");
                    }
                }

                if (!_runtimeDb.Database.CanConnect())
                {
                    return (false, "Application cannot connect to the configured database yet.");
                }

                var hasAdminHash = _runtimeDb.ModuleSettings.Any(s => s.SettingKey == "Admin_Hash" && s.SettingValue != null && s.SettingValue != "");
                var hasAdminSalt = _runtimeDb.ModuleSettings.Any(s => s.SettingKey == "Admin_Salt" && s.SettingValue != null && s.SettingValue != "");
                if (!hasAdminHash || !hasAdminSalt)
                {
                    return (false, "Application has not loaded the admin credentials from the configured database yet.");
                }

                return (true, "Application restarted successfully and is using the configured database.");
            }
            catch (Exception ex)
            {
                return (false, BuildFriendlyDatabaseError(ex, null));
            }
        }

        private string BuildConnectionString(DatabaseSetup db)
        {
            var provider = db?.Provider?.ToLowerInvariant() ?? "sqlserver";

            return provider switch
            {
                "sqlite" => BuildSqliteConnectionString(db),
                "postgresql" => BuildPostgreSqlConnectionString(db),
                "postgres" => BuildPostgreSqlConnectionString(db),
                "mysql" => BuildMySqlConnectionString(db),
                "mariadb" => BuildMySqlConnectionString(db),
                _ => BuildSqlServerConnectionString(db)
            };
        }

        private static string BuildSqliteConnectionString(DatabaseSetup db)
        {
            if (!string.IsNullOrWhiteSpace(db?.ConnectionString))
            {
                return db.ConnectionString.Trim();
            }

            var sqliteFile = string.IsNullOrWhiteSpace(db?.SqliteFile)
                ? "App_Data/MegaForm/megaform.db"
                : db.SqliteFile.Trim();

            return $"Data Source={sqliteFile}";
        }

        private static string BuildPostgreSqlConnectionString(DatabaseSetup db)
        {
            if (!string.IsNullOrWhiteSpace(db?.ConnectionString))
            {
                return db.ConnectionString.Trim();
            }

            return $"Host={db?.Host};Port={db?.Port ?? "5432"};Database={db?.Database};Username={db?.Username};Password={db?.Password};Pooling=true;Timeout=15;Command Timeout=30";
        }

        private static string BuildMySqlConnectionString(DatabaseSetup db)
        {
            if (!string.IsNullOrWhiteSpace(db?.ConnectionString))
            {
                return MegaForm.Web.Data.DatabaseConfig.NormalizeMySqlConnectionString(db.ConnectionString);
            }

            var host = string.IsNullOrWhiteSpace(db?.Host) ? "localhost" : db.Host.Trim();
            var port = string.IsNullOrWhiteSpace(db?.Port) ? "3306" : db.Port.Trim();
            var database = string.IsNullOrWhiteSpace(db?.Database) ? "megaform" : db.Database.Trim();
            var username = string.IsNullOrWhiteSpace(db?.Username) ? "root" : db.Username.Trim();
            var password = db?.Password ?? string.Empty;
            return MegaForm.Web.Data.DatabaseConfig.NormalizeMySqlConnectionString(
                $"Server={host};Port={port};Database={database};User Id={username};Password={password};SslMode=Preferred;AllowUserVariables=True;");
        }

        private static string BuildSqlServerConnectionString(DatabaseSetup db)
        {
            var trustServerCertificate = db?.TrustServerCertificate ?? true;
            var encrypt = db?.Encrypt ?? true;

            if (!string.IsNullOrWhiteSpace(db?.ConnectionString))
            {
                return MegaForm.Web.Data.DatabaseConfig.NormalizeSqlServerConnectionString(
                    db.ConnectionString,
                    defaultEncrypt: encrypt,
                    defaultTrustServerCertificate: trustServerCertificate);
            }

            var host = string.IsNullOrWhiteSpace(db?.Host) ? "." : db.Host.Trim();
            var port = string.IsNullOrWhiteSpace(db?.Port) ? null : db.Port.Trim();
            var server = string.IsNullOrWhiteSpace(port) ? host : $"{host},{port}";

            var parts = new List<string>
            {
                $"Server={server}",
                $"Database={(string.IsNullOrWhiteSpace(db?.Database) ? "MegaForm" : db.Database.Trim())}",
                $"Encrypt={(encrypt ? "True" : "False")}",
                $"TrustServerCertificate={(trustServerCertificate ? "True" : "False")}",
                "MultipleActiveResultSets=True"
            };

            var integratedSecurity = db?.IntegratedSecurity ?? string.IsNullOrWhiteSpace(db?.Username);
            if (integratedSecurity)
            {
                parts.Add("Integrated Security=True");
            }
            else
            {
                parts.Add($"User Id={db?.Username}");
                parts.Add($"Password={db?.Password}");
            }

            return string.Join(";", parts) + ";";
        }

        private static string BuildFriendlyDatabaseError(Exception ex, string provider)
        {
            var messages = new List<string>();
            for (var current = ex; current != null; current = current.InnerException)
            {
                if (!string.IsNullOrWhiteSpace(current.Message))
                {
                    messages.Add(current.Message.Trim());
                }
            }

            var combined = string.Join(" → ", messages);
            var normalizedProvider = (provider ?? string.Empty).Trim().ToLowerInvariant();
            if ((normalizedProvider == "sqlserver" || normalizedProvider == "mssql") &&
                combined.IndexOf("certificate chain", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return combined + " Tip: for local/dev SQL Server, keep Encrypt enabled and turn on Trust Server Certificate in the setup form, or use a trusted SQL Server certificate in production.";
            }

            return combined;
        }

        private static void ConfigureProvider(
            Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<MegaFormDbContext> opts,
            string provider, string connStr)
        {
            // Delegate sang DatabaseConfig để dùng chung logic
            MegaForm.Web.Data.DatabaseConfig.ConfigureProvider(opts, provider ?? "SqlServer", connStr);
        }

        private static void SaveAdminCredentials(MegaFormDbContext db, AdminSetup admin)
        {
            var salt = GenerateSalt();
            var hash = HashPassword(admin.Password, salt);

            UpsertSetting(db, 0, "Admin_Email",    admin.Email);
            UpsertSetting(db, 0, "Admin_Username", admin.Username);
            UpsertSetting(db, 0, "Admin_Salt",     salt);
            UpsertSetting(db, 0, "Admin_Hash",     hash);
            db.SaveChanges();
        }

        private static string GenerateJwtKey()
        {
            var bytes = new byte[48];
            System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes);
        }

        private static string GenerateSalt()
        {
            var bytes = new byte[16];
            System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes);
        }

        private static string HashPassword(string password, string salt)
        {
            using var pbkdf2 = new System.Security.Cryptography.Rfc2898DeriveBytes(
                password, Convert.FromBase64String(salt), 100_000,
                System.Security.Cryptography.HashAlgorithmName.SHA256);
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

        private static string ExtractDomain(string url)
        {
            try { return new Uri(url).Host; } catch { return "megaform.local"; }
        }
    }

    // ── Request DTOs ─────────────────────────────────────────────────────────

    public class SetupRequest
    {
        public DatabaseSetup Database { get; set; }
        public SiteSetup     Site     { get; set; }
        public AdminSetup    Admin    { get; set; }
        public EmailSetup    Email    { get; set; }
    }

    public class DatabaseSetup
    {
        public string Provider               { get; set; } // SqlServer | Sqlite | PostgreSQL | MySQL
        public string ConnectionString       { get; set; } // manual override
        public string Host                   { get; set; }
        public string Port                   { get; set; }
        public string Database               { get; set; }
        public string Username               { get; set; }
        public string Password               { get; set; }
        public string SqliteFile             { get; set; }
        public bool? Encrypt                 { get; set; }
        public bool? TrustServerCertificate  { get; set; }
        public bool? IntegratedSecurity      { get; set; }
    }

    public class TestConnectionRequest : DatabaseSetup { }

    public class SiteSetup
    {
        public string SiteName { get; set; }
        public string BaseUrl  { get; set; }
    }

    public class AdminSetup
    {
        public string Username { get; set; }
        public string Email    { get; set; }
        public string Password { get; set; }
    }

    public class EmailSetup
    {
        public string From { get; set; }
        public string Host { get; set; }
        public string Port { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
        public bool? EnableSsl { get; set; }
        public string ReplyTo { get; set; }
        public string TimeoutMs { get; set; }
    }
}
