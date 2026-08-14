using System;
using System.Data.Common;
using System.IO;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.Data
{
    public static class UmbracoDatabaseSchemaBootstrapper
    {
        public static void EnsureMegaFormSchema(MegaFormDbContext db, ILogger? logger = null)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var dataSource = db.Database.GetDbConnection()?.DataSource ?? "(unknown)";
            var dataDir = AppDomain.CurrentDomain.GetData("DataDirectory")?.ToString() ?? "(null)";
            logger?.LogInformation("[MegaForm.Umbraco] EnsureMegaFormSchema provider={Provider} dataSource={DataSource} appDomainDataDirectory={DataDir}", provider, dataSource, dataDir);

            var creator = db.Database.GetService<IRelationalDatabaseCreator>();

            if (provider.Contains("sqlite"))
            {
                EnsureSqliteDirectory(db);
                logger?.LogInformation("[MegaForm.Umbraco] SQLite EnsureCreated starting...");
                var created = db.Database.EnsureCreated();
                logger?.LogInformation("[MegaForm.Umbraco] SQLite EnsureCreated returned {Created}. TablesExist={TablesExist}", created, MegaFormTablesExist(db));
                if (!MegaFormTablesExist(db, logger))
                {
                    logger?.LogInformation("[MegaForm.Umbraco] Creating MegaForm tables via CreateTables...");
                    creator.CreateTables();
                    logger?.LogInformation("[MegaForm.Umbraco] CreateTables completed. TablesExist={TablesExist}", MegaFormTablesExist(db, logger));
                }
                return;
            }

            if (!creator.Exists())
            {
                creator.Create();
            }

            if (!MegaFormTablesExist(db))
            {
                creator.CreateTables();
            }

            // [TypedStorage 2026-07-18] Ensure the 7 typed-submission tables exist on
            // existing databases that were created before this feature. This is an
            // idempotent, provider-specific DDL upgrade that runs after the legacy
            // MegaForm schema is in place.
            TypedSubmissionSchemaBootstrapper.EnsureTypedTables(db);

            // [ATBE P1] Same upgrade path for the 2 external-table tables
            // (MF_ExternalBinding + MF_ExternalRowMap). Idempotent.
            ExternalTableSchemaBootstrapper.EnsureExternalTables(db);
        }

        private static void EnsureSqliteDirectory(MegaFormDbContext db)
        {
            var conn = db.Database.GetDbConnection();
            if (conn == null) return;

            var connectionString = conn.ConnectionString;
            if (string.IsNullOrWhiteSpace(connectionString)) return;

            var builder = new SqliteConnectionStringBuilder(connectionString);
            var dataSource = builder.DataSource;
            if (string.IsNullOrWhiteSpace(dataSource)) return;
            if (dataSource.Contains(":memory:", StringComparison.OrdinalIgnoreCase)) return;

            dataSource = ResolveDataDirectory(dataSource);
            if (string.IsNullOrWhiteSpace(dataSource)) return;

            if (!Path.IsPathRooted(dataSource))
            {
                dataSource = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, dataSource));
            }

            var dir = Path.GetDirectoryName(dataSource);
            if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
        }

        private static string ResolveDataDirectory(string path)
        {
            const string token = "|DataDirectory|";
            if (string.IsNullOrWhiteSpace(path) || !path.Contains(token, StringComparison.OrdinalIgnoreCase))
                return path;

            var dataDirectory = AppDomain.CurrentDomain.GetData("DataDirectory") as string
                ?? AppContext.BaseDirectory;

            return path.Replace(token, dataDirectory, StringComparison.OrdinalIgnoreCase)
                       .Replace("/", Path.DirectorySeparatorChar.ToString());
        }

        public static bool MegaFormTablesExist(MegaFormDbContext db, ILogger? logger = null)
        {
            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = db.Database.GetDbConnection();
            var resolvedDataSource = ResolveDataDirectory(conn.DataSource ?? string.Empty);
            var shouldClose = conn.State != System.Data.ConnectionState.Open;

            if (shouldClose)
            {
                conn.Open();
            }

            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = provider switch
                {
                    var p when p.Contains("sqlserver") =>
                        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = 'mf_modulesettings'",
                    var p when p.Contains("npgsql") =>
                        "SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name) = 'mf_modulesettings'",
                    var p when p.Contains("mysql") =>
                        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND LOWER(table_name) = 'mf_modulesettings'",
                    _ =>
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND LOWER(name) = 'mf_modulesettings'"
                };

                var scalar = cmd.ExecuteScalar();
                var count = scalar == null || scalar == DBNull.Value ? 0 : Convert.ToInt32(scalar);

                using var listCmd = conn.CreateCommand();
                listCmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";
                var allNames = new System.Text.StringBuilder();
                using var reader = listCmd.ExecuteReader();
                while (reader.Read())
                {
                    allNames.Append(reader.GetString(0)).Append(',');
                }

                logger?.LogInformation("[MegaForm.Umbraco] MegaFormTablesExist query returned count={Count} on resolvedDataSource={ResolvedDataSource}. All tables: {Tables}", count, resolvedDataSource, allNames.ToString());
                return count > 0;
            }
            finally
            {
                if (shouldClose)
                {
                    conn.Close();
                }
            }
        }
    }
}
