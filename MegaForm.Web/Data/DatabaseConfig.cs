using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Data.SqlClient;
using System;
using System.Collections.Generic;
using System.IO;
using Pomelo.EntityFrameworkCore.MySql.Infrastructure;

namespace MegaForm.Web.Data
{
    public static class DatabaseConfig
    {
        public static IServiceCollection AddMegaFormDatabase(
            this IServiceCollection services,
            IConfiguration config,
            IWebHostEnvironment env)
        {
            // Nếu chưa setup → dùng SQLite in-memory tạm.
            // SetupMiddleware redirect /setup trước khi bất kỳ query nào chạy.
            if (!Controllers.SetupController.IsSetupComplete(env))
            {
                services.AddDbContext<MegaFormDbContext>(o =>
                    o.UseSqlite("Data Source=:memory:"));
                return services;
            }

            // Setup đã xong → đọc config từ appsettings.Production.json trực tiếp
            // (không dùng IConfiguration vì có thể chưa load file Production)
            var (provider, connStr) = ReadProductionConfig(env.ContentRootPath, config);

            services.AddDbContext<MegaFormDbContext>(options =>
                ConfigureProvider(options, provider, connStr));

            return services;
        }

        /// <summary>
        /// Đọc provider + connection string từ appsettings.Production.json trước,
        /// fallback về IConfiguration nếu file không tồn tại.
        /// </summary>
        private static (string provider, string connStr) ReadProductionConfig(
            string contentRoot, IConfiguration fallback)
        {
            var prodFile = Path.Combine(contentRoot, "appsettings.Production.json");
            if (File.Exists(prodFile))
            {
                // Build IConfiguration riêng từ file Production để đảm bảo đọc đúng
                var prodCfg = new ConfigurationBuilder()
                    .AddJsonFile(prodFile, optional: false, reloadOnChange: false)
                    .Build();

                var provider = prodCfg["Database:Provider"] ?? "SqlServer";
                var connStr  = prodCfg.GetConnectionString("MegaForm")
                               ?? GetDefaultConnStr(provider);
                return (provider, connStr);
            }

            // Fallback: dùng IConfiguration gốc (dev/test scenario)
            var p = fallback["Database:Provider"] ?? "SqlServer";
            var c = fallback.GetConnectionString("MegaForm") ?? GetDefaultConnStr(p);
            return (p, c);
        }

        public static void ConfigureProvider(DbContextOptionsBuilder options, string provider, string connStr)
        {
            var normalizedProvider = (provider ?? "SqlServer").Trim();
            var normalizedConnStr = NormalizeConnectionString(normalizedProvider, connStr);

            switch (normalizedProvider.ToLowerInvariant())
            {
                case "sqlite":
                    options.UseSqlite(normalizedConnStr);
                    break;
                case "postgresql":
                case "postgres":
                    options.UseNpgsql(normalizedConnStr, npgsql => npgsql.EnableRetryOnFailure(3));
                    break;
                case "mysql":
                case "mariadb":
                    options.UseMySql(normalizedConnStr, ServerVersion.AutoDetect(normalizedConnStr), mySql => mySql.EnableRetryOnFailure(3));
                    break;
                case "sqlserver":
                case "mssql":
                default:
                    options.UseSqlServer(normalizedConnStr, sql =>
                    {
                        sql.EnableRetryOnFailure(3);
                        sql.CommandTimeout(30);
                    });
                    break;
            }
        }

        public static string NormalizeConnectionString(string provider, string connStr)
        {
            var normalizedProvider = (provider ?? "SqlServer").Trim().ToLowerInvariant();
            var value = string.IsNullOrWhiteSpace(connStr) ? GetDefaultConnStr(provider) : connStr.Trim();

            return normalizedProvider switch
            {
                "sqlserver" => NormalizeSqlServerConnectionString(value),
                "mssql" => NormalizeSqlServerConnectionString(value),
                "mysql" => NormalizeMySqlConnectionString(value),
                "mariadb" => NormalizeMySqlConnectionString(value),
                "sqlite" => NormalizeSqliteConnectionString(value),
                _ => value
            };
        }

        public static string NormalizeSqlServerConnectionString(
            string connStr,
            bool defaultEncrypt = true,
            bool defaultTrustServerCertificate = true)
        {
            if (string.IsNullOrWhiteSpace(connStr))
            {
                connStr = GetDefaultConnStr("SqlServer");
            }

            try
            {
                var builder = new SqlConnectionStringBuilder(connStr);
                var keys = GetConnectionStringKeys(connStr);

                if (!keys.Contains("Encrypt"))
                {
                    builder.Encrypt = defaultEncrypt;
                }

                if (!keys.Contains("TrustServerCertificate"))
                {
                    builder.TrustServerCertificate = defaultTrustServerCertificate;
                }

                if (!keys.Contains("MultipleActiveResultSets"))
                {
                    builder.MultipleActiveResultSets = true;
                }

                return builder.ConnectionString;
            }
            catch
            {
                var extras = new List<string>();
                var keys = GetConnectionStringKeys(connStr);
                if (!keys.Contains("Encrypt")) extras.Add($"Encrypt={(defaultEncrypt ? "True" : "False")}");
                if (!keys.Contains("TrustServerCertificate")) extras.Add($"TrustServerCertificate={(defaultTrustServerCertificate ? "True" : "False")}");
                if (!keys.Contains("MultipleActiveResultSets")) extras.Add("MultipleActiveResultSets=True");
                if (extras.Count == 0) return connStr;
                var suffix = string.Join(";", extras);
                return connStr.TrimEnd(';') + ";" + suffix + ";";
            }
        }

        public static string NormalizeSqliteConnectionString(string connStr)
        {
            var value = string.IsNullOrWhiteSpace(connStr) ? GetDefaultConnStr("Sqlite") : connStr.Trim();
            var keys = GetConnectionStringKeys(value);
            var extras = new List<string>();
            if (!keys.Contains("Mode")) extras.Add("Mode=ReadWriteCreate");
            if (!keys.Contains("Cache")) extras.Add("Cache=Shared");
            if (extras.Count == 0) return value;
            return value.TrimEnd(';') + ";" + string.Join(";", extras) + ";";
        }

        public static string NormalizeMySqlConnectionString(string connStr)
        {
            var value = string.IsNullOrWhiteSpace(connStr) ? GetDefaultConnStr("MySql") : connStr.Trim();
            var keys = GetConnectionStringKeys(value);
            var extras = new List<string>();
            if (!keys.Contains("SslMode")) extras.Add("SslMode=Preferred");
            if (!keys.Contains("AllowUserVariables")) extras.Add("AllowUserVariables=True");
            if (!keys.Contains("DefaultCommandTimeout")) extras.Add("DefaultCommandTimeout=30");
            if (extras.Count == 0) return value;
            return value.TrimEnd(';') + ";" + string.Join(";", extras) + ";";
        }

        private static HashSet<string> GetConnectionStringKeys(string connStr)
        {
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(connStr)) return keys;

            var pairs = connStr.Split(';', StringSplitOptions.RemoveEmptyEntries);
            foreach (var pair in pairs)
            {
                var idx = pair.IndexOf('=');
                if (idx <= 0) continue;
                keys.Add(pair.Substring(0, idx).Trim());
            }

            return keys;
        }

        private static string GetDefaultConnStr(string provider) =>
            provider.ToLowerInvariant() switch
            {
                "sqlite"     => "Data Source=App_Data/MegaForm/megaform.db;Mode=ReadWriteCreate;Cache=Shared;",
                "postgresql" => "Host=localhost;Database=megaform;Username=postgres;Password=postgres;Pooling=true;Timeout=15;Command Timeout=30",
                "mysql"      => "Server=localhost;Port=3306;Database=megaform;User Id=root;Password=;SslMode=Preferred;AllowUserVariables=True;DefaultCommandTimeout=30;",
                "mariadb"    => "Server=localhost;Port=3306;Database=megaform;User Id=root;Password=;SslMode=Preferred;AllowUserVariables=True;DefaultCommandTimeout=30;",
                _            => "Server=.;Database=MegaForm;Trusted_Connection=true;Encrypt=True;TrustServerCertificate=true;MultipleActiveResultSets=true;"
            };
    }
}
