using System;
using MegaForm.Umbraco.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// [CloudReady A2 v20260806] MegaForm schema v4 — durable workflow timer columns
    /// on EXISTING databases:
    ///   MF_WorkflowExecutions += WaitUntilUtc, LeaseOwner, LeaseUntilUtc + index
    ///   MF_WorkflowTasks      += EscalatedAtUtc (one-shot overdue reminder marker)
    ///
    /// Fresh installs already get these columns from the EF model via the initial
    /// migration's CreateTables(); this step advances the plan so upgraded sites get
    /// the ALTERs. Idempotent per provider (SQLite: guarded by pragma checks in C#
    /// because SQLite has no "ADD COLUMN IF NOT EXISTS").
    /// </summary>
    public class AddWorkflowTimerColumnsMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddWorkflowTimerColumnsMigration> _logger;

        public AddWorkflowTimerColumnsMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddWorkflowTimerColumnsMigration> logger)
            : base(context)
        {
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
            _logger = logger;
        }

        protected override void Migrate()
        {
            // Migrations resolve from the root provider; create our own scope for the scoped DbContext.
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
            var provider = (db.Database.ProviderName ?? string.Empty).ToLowerInvariant();

            _logger?.LogInformation("[MegaForm.Umbraco] Ensuring workflow timer columns for provider {Provider}.", provider);

            if (provider.Contains("sqlite"))
            {
                EnsureSqliteColumn(db, "MF_WorkflowExecutions", "WaitUntilUtc", "TEXT");
                EnsureSqliteColumn(db, "MF_WorkflowExecutions", "LeaseOwner", "TEXT");
                EnsureSqliteColumn(db, "MF_WorkflowExecutions", "LeaseUntilUtc", "TEXT");
                db.Database.ExecuteSqlRaw(
                    "CREATE INDEX IF NOT EXISTS \"IX_MF_WorkflowExecutions_Status_WaitUntilUtc\" ON \"MF_WorkflowExecutions\" (\"Status\", \"WaitUntilUtc\")");
                EnsureSqliteColumn(db, "MF_WorkflowTasks", "EscalatedAtUtc", "TEXT");
            }
            else
            {
                // SQL Server (the only other provider this host configures).
                db.Database.ExecuteSqlRaw(@"
IF COL_LENGTH(N'dbo.MF_WorkflowExecutions', N'WaitUntilUtc') IS NULL ALTER TABLE [dbo].[MF_WorkflowExecutions] ADD [WaitUntilUtc] DATETIME2 NULL;
IF COL_LENGTH(N'dbo.MF_WorkflowExecutions', N'LeaseOwner') IS NULL ALTER TABLE [dbo].[MF_WorkflowExecutions] ADD [LeaseOwner] NVARCHAR(64) NULL;
IF COL_LENGTH(N'dbo.MF_WorkflowExecutions', N'LeaseUntilUtc') IS NULL ALTER TABLE [dbo].[MF_WorkflowExecutions] ADD [LeaseUntilUtc] DATETIME2 NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_MF_WorkflowExecutions_Status_WaitUntilUtc' AND object_id = OBJECT_ID(N'dbo.MF_WorkflowExecutions')) CREATE INDEX [IX_MF_WorkflowExecutions_Status_WaitUntilUtc] ON [dbo].[MF_WorkflowExecutions] ([Status], [WaitUntilUtc]);
IF COL_LENGTH(N'dbo.MF_WorkflowTasks', N'EscalatedAtUtc') IS NULL ALTER TABLE [dbo].[MF_WorkflowTasks] ADD [EscalatedAtUtc] DATETIME2 NULL;");
            }

            _logger?.LogInformation("[MegaForm.Umbraco] Workflow timer columns ensured.");
        }

        private static void EnsureSqliteColumn(MegaFormDbContext db, string table, string column, string columnType)
        {
            var conn = db.Database.GetDbConnection();
            var shouldClose = conn.State != System.Data.ConnectionState.Open;
            if (shouldClose) conn.Open();
            try
            {
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT COUNT(*) FROM pragma_table_info('" + table + "') WHERE name = '" + column + "'";
                    var exists = Convert.ToInt32(cmd.ExecuteScalar() ?? 0) > 0;
                    if (exists) return;
                }
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "ALTER TABLE \"" + table + "\" ADD COLUMN \"" + column + "\" " + columnType + " NULL";
                    cmd.ExecuteNonQuery();
                }
            }
            finally
            {
                if (shouldClose) conn.Close();
            }
        }
    }
}
