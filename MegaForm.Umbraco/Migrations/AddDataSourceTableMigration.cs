using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// MegaForm schema v7 — creates the MF_DataSources table on EXISTING databases
    /// that were installed before the DataSource catalog was added.
    /// Fresh installs already get this table from the EF model via CreateTables().
    /// Idempotent and safe to run repeatedly.
    /// </summary>
    public class AddDataSourceTableMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddDataSourceTableMigration> _logger;

        public AddDataSourceTableMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddDataSourceTableMigration> logger)
            : base(context)
        {
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
            _logger = logger;
        }

        protected override void Migrate()
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            _logger?.LogInformation(
                "[MegaForm.Umbraco] Ensuring DataSource table for provider {Provider}.",
                dbContext.Database.ProviderName ?? "unknown");

            DataSourceSchemaBootstrapper.EnsureDataSourceTable(dbContext);

            _logger?.LogInformation("[MegaForm.Umbraco] DataSource table ensured.");
        }
    }
}
