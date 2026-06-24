using System;
using System.Data.Common;
using System.IO;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;

namespace MegaForm.Web.Data
{
    public static class DatabaseSchemaBootstrapper
    {
        public static void EnsureMegaFormSchema(MegaFormDbContext db)
        {
            if (db == null) throw new ArgumentNullException(nameof(db));

            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var creator = db.Database.GetService<IRelationalDatabaseCreator>();

            // SQLite behaves better with EnsureCreated() for brand-new files.
            // For existing databases that contain non-MegaForm tables, fall back to CreateTables()
            // if MegaForm tables are still missing.
            if (provider.Contains("sqlite"))
            {
                EnsureSqliteDirectory(db);
                db.Database.EnsureCreated();
                if (!MegaFormTablesExist(db))
                {
                    creator.CreateTables();
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
        }

        private static void EnsureSqliteDirectory(MegaFormDbContext db)
        {
            var conn = db.Database.GetDbConnection();
            var dataSource = conn?.DataSource;
            if (string.IsNullOrWhiteSpace(dataSource)) return;
            if (dataSource.Contains(":memory:", StringComparison.OrdinalIgnoreCase)) return;
            if (Path.IsPathRooted(dataSource))
            {
                var dir = Path.GetDirectoryName(dataSource);
                if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
                return;
            }

            var contentRoot = AppContext.BaseDirectory;
            var fullPath = Path.GetFullPath(Path.Combine(contentRoot, dataSource));
            var fullDir = Path.GetDirectoryName(fullPath);
            if (!string.IsNullOrWhiteSpace(fullDir)) Directory.CreateDirectory(fullDir);
        }

        public static bool MegaFormTablesExist(MegaFormDbContext db)
        {
            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = db.Database.GetDbConnection();
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
                var count = Convert.ToInt32(scalar ?? 0);
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
