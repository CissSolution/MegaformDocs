using System;
using System.Collections.Generic;
using System.Data.Common;
using System.IO;
using System.Linq;
using MegaForm.Core.Interfaces;
using Microsoft.Data.SqlClient;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco host connection registry.
    /// Resolves named connection strings from appsettings.json.
    /// Supports SQL Server and SQLite (the latter is used for local Umbraco demos).
    /// </summary>
    public class UmbracoConnectionRegistry : IConnectionRegistry, IConnectionNameProvider
    {
        private readonly IConfiguration _config;
        private readonly IModuleSettingsService _moduleSettings;
        public const string DashboardConnectionName = "DashboardDatabase";
        public const string UmbracoConnectionName = "umbracoDbDSN";

        public UmbracoConnectionRegistry(IConfiguration config, IModuleSettingsService moduleSettings)
        {
            _config = config;
            _moduleSettings = moduleSettings;
        }

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
                return CreateConnection(connectionString, databaseType);

            if (string.IsNullOrWhiteSpace(connectionName))
                throw new InvalidOperationException("IConnectionRegistry: connectionName cannot be empty.");

            var dashboardAlias = _moduleSettings == null ? DashboardConnectionName : _moduleSettings.GetSetting(0, "Database_ConnectionAlias", DashboardConnectionName);
            if (string.Equals(connectionName, dashboardAlias, StringComparison.OrdinalIgnoreCase))
            {
                var dashboardConn = _moduleSettings == null ? string.Empty : _moduleSettings.GetSetting(0, "Database_ConnectionString", "");

                // Fall back to the Umbraco SQLite connection for local demos when no
                // dedicated dashboard connection is configured.
                if (string.IsNullOrWhiteSpace(dashboardConn))
                {
                    var umbracoConn = _config.GetConnectionString(UmbracoConnectionName);
                    if (!string.IsNullOrWhiteSpace(umbracoConn))
                        return CreateConnection(umbracoConn, "sqlite");
                }

                if (string.IsNullOrWhiteSpace(dashboardConn))
                    throw new InvalidOperationException("Dashboard database connection is not configured.");

                return CreateConnection(dashboardConn, databaseType);
            }

            // [NamedConnections v20260717-01] Admin-saved catalog connections (Database Settings popup →
            // Saved connections, stored under NamedConnectionCatalog.SettingKey). Precedence mirrors the
            // Oqtane/DNN twins: explicit → DashboardDatabase → named catalog → appsettings. Saving a
            // catalog entry is admin-gated, so it carries appsettings-level trust.
            var namedJson = _moduleSettings == null ? string.Empty
                : _moduleSettings.GetSetting(0, MegaForm.Core.Services.NamedConnectionCatalog.SettingKey, "");
            var named = MegaForm.Core.Services.NamedConnectionCatalog.Find(namedJson, connectionName);
            if (named != null && !string.IsNullOrWhiteSpace(named.ConnectionString))
                return CreateConnection(named.ConnectionString, string.IsNullOrWhiteSpace(databaseType) ? named.Provider : databaseType);

            var connStr = _config.GetConnectionString(connectionName);
            if (string.IsNullOrWhiteSpace(connStr))
                throw new InvalidOperationException($"IConnectionRegistry: no connection string found for '{connectionName}'.");

            return CreateConnection(connStr, databaseType);
        }

        private static DbConnection CreateConnection(string connStr, string databaseType)
        {
            if (string.IsNullOrWhiteSpace(connStr))
                throw new InvalidOperationException("Connection string cannot be empty.");

            connStr = ResolveDataDirectoryToken(connStr);

            var isSqlite = string.Equals(databaseType, "sqlite", StringComparison.OrdinalIgnoreCase)
                || connStr.IndexOf("SQLite", StringComparison.OrdinalIgnoreCase) >= 0
                || connStr.IndexOf(".db", StringComparison.OrdinalIgnoreCase) >= 0;

            if (isSqlite)
            {
                var builder = new SqliteConnectionStringBuilder(connStr);
                return new SqliteConnection(builder.ConnectionString);
            }

            var sqlBuilder = new SqlConnectionStringBuilder(connStr);
            if (!sqlBuilder.ContainsKey("Encrypt")) sqlBuilder.Encrypt = true;
            if (!sqlBuilder.ContainsKey("TrustServerCertificate")) sqlBuilder.TrustServerCertificate = true;
            if (!sqlBuilder.ContainsKey("MultipleActiveResultSets")) sqlBuilder.MultipleActiveResultSets = true;
            return new SqlConnection(sqlBuilder.ConnectionString);
        }

        private static string ResolveDataDirectoryToken(string connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString) ||
                connectionString.IndexOf("|DataDirectory|", StringComparison.OrdinalIgnoreCase) < 0)
            {
                return connectionString;
            }

            var dataDirectory = AppDomain.CurrentDomain.GetData("DataDirectory") as string;
            if (string.IsNullOrWhiteSpace(dataDirectory))
            {
                dataDirectory = Path.Combine(AppContext.BaseDirectory, "umbraco", "Data");
            }

            return connectionString.Replace(
                "|DataDirectory|",
                dataDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase);
        }
    }
}
