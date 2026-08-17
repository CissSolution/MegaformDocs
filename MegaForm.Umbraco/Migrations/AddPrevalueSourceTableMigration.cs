using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// MegaForm schema v6 — creates the MF_PrevalueSources table on EXISTING databases
    /// that were installed before the PrevalueSource catalog was added.
    /// Fresh installs already get this table from the EF model via CreateTables().
    /// Idempotent and safe to run repeatedly.
    /// </summary>
    public class AddPrevalueSourceTableMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddPrevalueSourceTableMigration> _logger;

        public AddPrevalueSourceTableMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddPrevalueSourceTableMigration> logger)
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
                "[MegaForm.Umbraco] Ensuring PrevalueSource table for provider {Provider}.",
                dbContext.Database.ProviderName ?? "unknown");

            PrevalueSourceSchemaBootstrapper.EnsurePrevalueSourceTable(dbContext);

            _logger?.LogInformation("[MegaForm.Umbraco] PrevalueSource table ensured.");
        }
    }
}
