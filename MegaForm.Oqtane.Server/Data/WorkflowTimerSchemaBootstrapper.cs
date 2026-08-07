using System;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;

namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>
    /// [CloudReady A2 v20260807] Adds the durable-timer columns to databases that already
    /// have the workflow tables.
    ///
    /// Why this exists: on Oqtane a migration's Up() body NEVER runs. MegaFormManager
    /// .InstallSchemaFromModel builds the schema by issuing CREATE TABLE statements from the
    /// EF model and swallowing "already exists", then SeedMigrationHistory marks every
    /// migration applied without executing it. A brand-new install therefore gets these
    /// columns (they are part of the generated CREATE TABLE) but an EXISTING install never
    /// does — its CREATE TABLE is skipped whole, columns and all. Without this, the Delay
    /// node and the timer scanner fail on every upgraded site with "Invalid column name
    /// 'WaitUntilUtc'". Same shape as EfWorkflowLibraryRepository's VariableOverridesJson
    /// self-heal, generalised to several columns.
    ///
    /// Keyed per tenant connection string, not per process: Oqtane runs one database per
    /// tenant, so a static bool would heal the first tenant and leave the rest broken.
    ///
    /// Each statement runs in its own try/catch — one shared catch would stop at the first
    /// already-present column and never attempt the remaining ones.
    /// </summary>
    public static class WorkflowTimerSchemaBootstrapper
    {
        private static readonly ConcurrentDictionary<string, bool> Ensured =
            new ConcurrentDictionary<string, bool>(StringComparer.Ordinal);

        public static void Ensure(MegaFormDbContext db)
        {
            if (db == null) return;

            string key;
            try { key = db.Database.GetDbConnection()?.ConnectionString ?? string.Empty; }
            catch { return; }

            if (!Ensured.TryAdd(key, true)) return;

            var provider = db.Database.ProviderName ?? string.Empty;
            var sqlite = provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0;
            var postgres = provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0;
            var mysql = provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0;

            // SQLite stores DateTime as TEXT; SQL Server is the default branch.
            string dateType, textType, addKeyword;
            if (sqlite)        { dateType = "TEXT";      textType = "TEXT";        addKeyword = "ADD COLUMN"; }
            else if (postgres) { dateType = "timestamp"; textType = "varchar(64)"; addKeyword = "ADD COLUMN"; }
            else if (mysql)    { dateType = "DATETIME";  textType = "VARCHAR(64)"; addKeyword = "ADD COLUMN"; }
            else               { dateType = "datetime2"; textType = "nvarchar(64)"; addKeyword = "ADD"; }

            TryExecute(db, "ALTER TABLE MF_WorkflowExecutions " + addKeyword + " WaitUntilUtc "  + dateType + " NULL");
            TryExecute(db, "ALTER TABLE MF_WorkflowExecutions " + addKeyword + " LeaseOwner "    + textType + " NULL");
            TryExecute(db, "ALTER TABLE MF_WorkflowExecutions " + addKeyword + " LeaseUntilUtc " + dateType + " NULL");
            TryExecute(db, "ALTER TABLE MF_WorkflowTasks "      + addKeyword + " EscalatedAtUtc " + dateType + " NULL");

            // Last: the index needs the columns to exist. No provider here supports
            // CREATE INDEX IF NOT EXISTS across the board (SQL Server and MySQL do not),
            // so this relies on the same tolerated-failure path as the columns.
            TryExecute(db,
                "CREATE INDEX IX_MF_WorkflowExecutions_Status_WaitUntilUtc " +
                "ON MF_WorkflowExecutions (Status, WaitUntilUtc)");
        }

        private static void TryExecute(MegaFormDbContext db, string sql)
        {
            try
            {
                db.Database.ExecuteSqlRaw(sql);
            }
            catch
            {
                // Expected whenever the object is already there — a fresh install got it from
                // the EF model, and every process start after the first upgrade re-runs this.
                // A genuine failure surfaces later as the same "Invalid column name" the
                // scanner already logs and recovers from, rather than breaking startup.
            }
        }
    }
}
