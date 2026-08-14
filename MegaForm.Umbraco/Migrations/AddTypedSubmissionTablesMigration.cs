using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// MegaForm schema v3 — creates the 7 typed-submission tables (MF_SubmissionFields
    /// + the six MF_SubmissionValue* tables) on EXISTING databases that were installed
    /// before typed storage.
    ///
    /// Why a dedicated migration step (not just the bootstrapper):
    /// <see cref="UmbracoDatabaseSchemaBootstrapper.EnsureMegaFormSchema"/> only runs from
    /// <see cref="InitialMegaFormSchemaMigration"/>, which executes ONCE. On an upgraded site the
    /// plan is already at a later state, so that migration never re-runs and the typed-table
    /// ensure inside the bootstrapper would never fire. Adding this as a NEW plan step
    /// ("megaform-schema-typed-submission") advances the plan's final state, so Umbraco detects
    /// that existing sites are behind and runs it — the only reliable upgrade path.
    ///
    /// Fresh installs already get these tables from the EF model via CreateTables(); this step is a
    /// no-op there (the bootstrapper's sentinel check skips when MF_SubmissionFields already exists).
    /// Idempotent and safe to run repeatedly.
    /// </summary>
    public class AddTypedSubmissionTablesMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddTypedSubmissionTablesMigration> _logger;

        public AddTypedSubmissionTablesMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddTypedSubmissionTablesMigration> logger)
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
                "[MegaForm.Umbraco] Ensuring typed-submission tables for provider {Provider}.",
                dbContext.Database.ProviderName ?? "unknown");

            // Reuse the shared, idempotent, provider-specific DDL bootstrapper. It sentinel-checks
            // MF_SubmissionFields and creates the 7 tables + indexes only when they are missing.
            TypedSubmissionSchemaBootstrapper.EnsureTypedTables(dbContext);

            _logger?.LogInformation("[MegaForm.Umbraco] Typed-submission tables ensured.");
        }
    }
}
