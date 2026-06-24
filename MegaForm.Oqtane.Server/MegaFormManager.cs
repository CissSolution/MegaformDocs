using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;
using Oqtane.Enums;
using Oqtane.Infrastructure;
using Oqtane.Migrations.Framework;
using Oqtane.Modules;
using Oqtane.Models;
using Oqtane.Repository;
using System;
using System.Collections.Generic;

namespace MegaForm.Oqtane.Server
{
    public class MegaFormManager : MigratableModuleBase, IInstallable
    {
        private readonly IDBContextDependencies _dbContextDependencies;

        public MegaFormManager(IDBContextDependencies dbContextDependencies)
        {
            _dbContextDependencies = dbContextDependencies;
        }

        public bool Install(Tenant tenant, string version)
        {
            if (IsSqlite(tenant))
            {
                return InstallSqliteSchema(version);
            }

            return Migrate(new MegaFormDbContext(_dbContextDependencies), tenant, MigrationType.Up);
        }

        public bool Uninstall(Tenant tenant)
        {
            // Preserve user data on uninstall.
            return true;
        }

        private bool InstallSqliteSchema(string version)
        {
            using var db = new MegaFormDbContext(_dbContextDependencies);
            var script = db.Database.GenerateCreateScript();
            foreach (var statement in SplitSqlStatements(script))
            {
                if (statement.IndexOf("\"MF_", StringComparison.OrdinalIgnoreCase) < 0)
                    continue;

                var sql = MakeCreateStatementIdempotent(statement);
                db.Database.ExecuteSqlRaw(sql);
            }

            SeedMigrationHistory(db, version);
            return true;
        }

        private static bool IsSqlite(Tenant tenant)
            => (tenant?.DBType ?? string.Empty).IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0;

        private static IEnumerable<string> SplitSqlStatements(string script)
        {
            foreach (var part in (script ?? string.Empty).Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var statement = part.Trim();
                if (!string.IsNullOrWhiteSpace(statement))
                    yield return statement;
            }
        }

        private static string MakeCreateStatementIdempotent(string statement)
        {
            if (statement.StartsWith("CREATE UNIQUE INDEX ", StringComparison.OrdinalIgnoreCase))
                return ReplaceFirst(statement, "CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ");

            if (statement.StartsWith("CREATE INDEX ", StringComparison.OrdinalIgnoreCase))
                return ReplaceFirst(statement, "CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");

            if (statement.StartsWith("CREATE TABLE ", StringComparison.OrdinalIgnoreCase))
                return ReplaceFirst(statement, "CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ");

            return statement;
        }

        private static string ReplaceFirst(string value, string oldValue, string newValue)
        {
            var index = value.IndexOf(oldValue, StringComparison.OrdinalIgnoreCase);
            return index < 0
                ? value
                : value.Substring(0, index) + newValue + value.Substring(index + oldValue.Length);
        }

        private static void SeedMigrationHistory(MegaFormDbContext db, string version)
        {
            const string productVersion = "9.0.4";
            var appliedVersion = string.IsNullOrWhiteSpace(version) ? "1.6.8" : version;
            foreach (var migrationId in new[]
            {
                "MegaForm.01.05.01.00",
                "MegaForm.01.05.02.00",
                "MegaForm.01.05.02.01",
                "MegaForm.01.05.02.02"
            })
            {
                db.Database.ExecuteSqlRaw(
                    "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\", \"AppliedDate\", \"AppliedVersion\") " +
                    "SELECT {0}, {1}, {2}, {3} WHERE NOT EXISTS (SELECT 1 FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" = {0})",
                    migrationId,
                    productVersion,
                    DateTime.UtcNow,
                    appliedVersion);
            }
        }
    }
}
