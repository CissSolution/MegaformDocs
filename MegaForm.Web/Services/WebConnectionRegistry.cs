using System.Collections.Generic;
using System.Linq;
using System;
using System.Data.Common;
using MegaForm.Core.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Npgsql;
using MySql.Data.MySqlClient;

namespace MegaForm.Web.Services
{
    // ══════════════════════════════════════════════════════════════════════════
    //  WebConnectionRegistry
    //  Resolves named DB connections from appsettings ConnectionStrings section.
    //  Supports SQL Server, SQLite, PostgreSQL.
    //  Connection strings NEVER come from frontend — only server config.
    // ══════════════════════════════════════════════════════════════════════════

    public class WebConnectionRegistry : IConnectionRegistry, IConnectionNameProvider
    {
        private readonly IConfiguration _config;
        private readonly IModuleSettingsService _moduleSettings;
        public const string DashboardConnectionName = "DashboardDatabase";

        public WebConnectionRegistry(IConfiguration config, IModuleSettingsService moduleSettings)
        {
            _config = config;
            _moduleSettings = moduleSettings;
        }

        /// <summary>
        /// Returns a new (closed) DbConnection for the named entry in
        /// appsettings.json ConnectionStrings section.
        /// Example appsettings:
        ///   "ConnectionStrings": {
        ///     "DefaultConnection": "Server=...;Database=...;",
        ///     "ReportsDb": "Data Source=reports.db"
        ///   }
        /// </summary>
        public IEnumerable<string> GetConnectionNames()
        {
            var names = _config.GetSection("ConnectionStrings").GetChildren().Select(x => x.Key).ToList();
            var dashConn = _moduleSettings == null ? string.Empty : _moduleSettings.GetSetting(0, "Database_ConnectionString", "");
            var dashAlias = _moduleSettings == null ? DashboardConnectionName : _moduleSettings.GetSetting(0, "Database_ConnectionAlias", DashboardConnectionName);
            if (!string.IsNullOrWhiteSpace(dashConn) && !names.Any(x => string.Equals(x, dashAlias, StringComparison.OrdinalIgnoreCase)))
                names.Add(dashAlias);
            return names;
        }

        public DbConnection GetConnection(string connectionName, string databaseType = null, string connectionString = null)
        {
            if (!string.IsNullOrWhiteSpace(connectionString))
                return CreateExternalConnection(databaseType, connectionString);

            if (string.IsNullOrWhiteSpace(connectionName))
                throw new InvalidOperationException(
                    "IConnectionRegistry: connectionName cannot be empty.");

            var dashboardAlias = _moduleSettings == null ? DashboardConnectionName : _moduleSettings.GetSetting(0, "Database_ConnectionAlias", DashboardConnectionName);
            if (string.Equals(connectionName, dashboardAlias, StringComparison.OrdinalIgnoreCase))
            {
                var dashboardProvider = _moduleSettings == null ? string.Empty : _moduleSettings.GetSetting(0, "Database_Provider", "Sqlite");
                var dashboardConn = _moduleSettings == null ? string.Empty : _moduleSettings.GetSetting(0, "Database_ConnectionString", "");
                if (string.IsNullOrWhiteSpace(dashboardConn))
                    dashboardConn = _config.GetConnectionString(DashboardConnectionName);
                if (string.IsNullOrWhiteSpace(dashboardConn))
                    throw new InvalidOperationException("Dashboard database connection is not configured.");
                return CreateExternalConnection(string.IsNullOrWhiteSpace(databaseType) ? dashboardProvider : databaseType, dashboardConn);
            }

            var connStr = _config.GetConnectionString(connectionName);
            if (string.IsNullOrWhiteSpace(connStr))
                throw new InvalidOperationException(
                    "IConnectionRegistry: no connection string found for '" +
                    connectionName + "'. Check appsettings ConnectionStrings.");

            return CreateExternalConnection(databaseType, connStr);
        }

        private static DbConnection CreateExternalConnection(string databaseType, string connStr)
        {
            if (string.IsNullOrWhiteSpace(connStr))
                throw new InvalidOperationException("Connection string cannot be empty.");

            var type = NormalizeDatabaseType(databaseType, connStr);
            if (type == "sqlite")
                return new SqliteConnection(connStr);
            if (type == "postgres")
                return new NpgsqlConnection(connStr);
            if (type == "mysql")
                return new MySqlConnection(connStr);
            return new SqlConnection(connStr);
        }

        private static string NormalizeDatabaseType(string databaseType, string connStr)
        {
            var forced = string.IsNullOrWhiteSpace(databaseType) ? string.Empty : databaseType.Trim().ToLowerInvariant();
            if (forced == "sqlite") return "sqlite";
            if (forced == "postgresql" || forced == "postgres") return "postgres";
            if (forced == "mysql") return "mysql";
            if (forced == "sqlserver" || forced == "mssql") return "sqlserver";

            var lower = (connStr ?? string.Empty).Trim().ToLowerInvariant();
            var looksSqlite = (lower.Contains("data source=") || lower.Contains("datasource=") || lower.Contains("filename=") || lower.Contains("mode=memory") || lower.Contains("cache=shared") || lower.Contains(".db") || lower.Contains(".sqlite"))
                && !lower.Contains("initial catalog=") && !lower.Contains("trusted_connection=") && !lower.Contains("integrated security=") && !lower.Contains("network library=");
            if (looksSqlite) return "sqlite";
            if (lower.Contains("host=") && (lower.Contains("username=") || lower.Contains("search path=") || lower.Contains("port=5432"))) return "postgres";
            if ((lower.Contains("server=") || lower.Contains("host=")) && (lower.Contains("uid=") || lower.Contains("user id=") || lower.Contains("port=3306"))) return "mysql";
            return "sqlserver";
        }
    }
}
