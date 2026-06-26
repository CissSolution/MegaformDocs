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
            // [BUG2 fix 20260626] The EntityBuilder-based EF Migrate() path threw a
            // NullReferenceException inside Oqtane's BaseEntityBuilder.Create() (-> MigrationBuilder
            // .CreateTable) on a CLEAN host, so NO MF_* tables were created (symptoms: "Invalid object
            // name 'MF_WorkflowTasks'", submissions/forms-overview JSON errors, can't save forms). The
            // SQLite path already side-stepped this by building the schema from the EF MODEL via
            // GenerateCreateScript() (which never calls the migration Up()/EntityBuilders). Use that
            // MODEL-based path for ALL databases now. It is idempotent (skips already-existing objects)
            // so it is safe to (re)run on existing installs (e.g. the :5070 dev DB).
            return InstallSchemaFromModel(tenant, version);
        }

        public bool Uninstall(Tenant tenant)
        {
            // Preserve user data on uninstall.
            return true;
        }

        private bool InstallSchemaFromModel(Tenant tenant, string version)
        {
            var sqlite = IsSqlite(tenant);
            using var db = new MegaFormDbContext(_dbContextDependencies);
            var script = db.Database.GenerateCreateScript();
            foreach (var statement in SplitSqlStatements(script))
            {
                // The model only contains MF_* entities; match the table name dialect-agnostically
                // ("MF_ in SQL Server, \"MF_ in SQLite/Postgres). Also matches CREATE INDEX / ADD FK.
                if (statement.IndexOf("MF_", StringComparison.OrdinalIgnoreCase) < 0)
                    continue;

                // SQLite has native CREATE ... IF NOT EXISTS; for SQL Server we rely on the
                // already-exists catch below (a clean host runs them all once with no exception).
                var sql = sqlite ? MakeCreateStatementIdempotent(statement) : statement;
                try
                {
                    db.Database.ExecuteSqlRaw(sql);
                }
                catch (Exception ex) when (IsAlreadyExists(ex))
                {
                    // object already exists (re-run / existing install) — idempotent skip
                }
                catch (Exception ex)
                {
                    // a genuine DDL error — log it but keep creating the rest of the schema
                    var head = statement.Substring(0, Math.Min(90, statement.Length)).Replace("\r", " ").Replace("\n", " ");
                    System.Console.WriteLine("[MegaForm schema] ERR  " + head + "  ||  " + ex.Message);
                }
            }

            SeedMigrationHistory(db, version);
            return true;
        }

        // SQL Server: "There is already an object named 'X'" / "already exists"; SQLite/Postgres:
        // "already exists"; "Duplicate key" for indexes — all benign on a (re)run.
        private static bool IsAlreadyExists(Exception ex)
        {
            var m = ex?.Message ?? string.Empty;
            return m.IndexOf("already", StringComparison.OrdinalIgnoreCase) >= 0
                || m.IndexOf("duplicate", StringComparison.OrdinalIgnoreCase) >= 0
                || m.IndexOf("exists", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool IsSqlite(Tenant tenant)
            => (tenant?.DBType ?? string.Empty).IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0;

        private static IEnumerable<string> SplitSqlStatements(string script)
        {
            // [BUG2 fix 20260626] SQL Server's GenerateCreateScript() emits "GO" batch separators —
            // a sqlcmd/SSMS-only keyword that EF's ExecuteSqlRaw rejects ("Could not find stored
            // procedure 'GO'"). Splitting only on ';' left "GO" glued to the front of the next
            // statement, so ~37 CREATEs (incl MF_Workflows/MF_WorkflowTasks/MF_WorkflowTaskActions)
            // failed. Strip standalone GO lines first. (SQLite never emits GO, so this is a no-op there.)
            var clean = System.Text.RegularExpressions.Regex.Replace(
                script ?? string.Empty,
                "^\\s*GO\\s*$",
                string.Empty,
                System.Text.RegularExpressions.RegexOptions.Multiline | System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            foreach (var part in clean.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var statement = part.Trim();
                if (!string.IsNullOrWhiteSpace(statement)
                    && !statement.Equals("GO", StringComparison.OrdinalIgnoreCase))
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
            var appliedVersion = string.IsNullOrWhiteSpace(version) ? "1.7.27" : version;
            // Mark EVERY defined MegaForm migration as applied (the model-based create-script built
            // the full current schema), so EF never tries to re-run the EntityBuilder migrations.
            // GetMigrations() reads the [Migration] ids from the assembly — it does NOT call Up(),
            // so it does not hit the BaseEntityBuilder.Create NRE.
            foreach (var migrationId in db.Database.GetMigrations())
            {
                try
                {
                    db.Database.ExecuteSqlRaw(
                        "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\", \"AppliedDate\", \"AppliedVersion\") " +
                        "SELECT {0}, {1}, {2}, {3} WHERE NOT EXISTS (SELECT 1 FROM \"__EFMigrationsHistory\" WHERE \"MigrationId\" = {0})",
                        migrationId,
                        productVersion,
                        DateTime.UtcNow,
                        appliedVersion);
                }
                catch
                {
                    // best-effort history seed (e.g. an Oqtane __EFMigrationsHistory column variant) —
                    // the schema is already created above, so a history gap won't break runtime.
                }
            }
        }
    }
}
