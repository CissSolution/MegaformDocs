using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// MegaForm schema v5 — creates the 2 external-table tables (MF_ExternalBinding
    /// + MF_ExternalRowMap) on EXISTING databases that were installed before the
    /// external-table stack was ported to this host.
    ///
    /// Same reasoning as <see cref="AddTypedSubmissionTablesMigration"/>: a NEW plan step
    /// ("megaform-schema-external-tables") is the only reliable upgrade path for sites
    /// whose plan state is already past the initial migration.
    ///
    /// Fresh installs already get these tables from the EF model via CreateTables(); this step is a
    /// no-op there (the bootstrapper's sentinel check skips when MF_ExternalBinding already exists).
    /// Idempotent and safe to run repeatedly.
    /// </summary>
    public class AddExternalTableTablesMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddExternalTableTablesMigration> _logger;

        public AddExternalTableTablesMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddExternalTableTablesMigration> logger)
            : base(context)
        {
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
            _logger = logger;
        }

        protected override void Migrate()
        {
            // Migrations resolve from the root provider; create our own scope for the scoped DbContext.
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            _logger?.LogInformation(
                "[MegaForm.Umbraco] Ensuring external-table tables for provider {Provider}.",
                dbContext.Database.ProviderName ?? "unknown");

            // Reuse the shared, idempotent, provider-specific DDL bootstrapper. It sentinel-checks
            // MF_ExternalBinding and creates the 2 tables + unique index only when they are missing.
            ExternalTableSchemaBootstrapper.EnsureExternalTables(dbContext);

            _logger?.LogInformation("[MegaForm.Umbraco] External-table tables ensured.");
        }
    }
}
