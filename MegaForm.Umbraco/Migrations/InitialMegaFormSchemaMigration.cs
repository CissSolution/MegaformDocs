using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// Initial MegaForm package migration.
    /// Creates all MF_* tables by reusing the existing EF Core model.
    /// The migration is idempotent: it only creates tables that do not already exist.
    /// </summary>
    public class InitialMegaFormSchemaMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<InitialMegaFormSchemaMigration> _logger;

        public InitialMegaFormSchemaMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<InitialMegaFormSchemaMigration> logger)
            : base(context)
        {
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
            _logger = logger;
        }

        protected override void Migrate()
        {
            // Migrations are resolved from the root service provider, so we must create
            // our own scope to resolve the scoped MegaFormDbContext safely.
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            _logger?.LogInformation("[MegaForm.Umbraco] Running initial schema migration for provider {Provider}.", dbContext.Database.ProviderName ?? "unknown");

            // Reuse the robust bootstrapper that handles SQLite, SQL Server, PostgreSQL and MySQL.
            // It is safe to call inside a migration because it only creates missing tables.
            UmbracoDatabaseSchemaBootstrapper.EnsureMegaFormSchema(dbContext, _logger);

            _logger?.LogInformation("[MegaForm.Umbraco] Initial schema migration completed.");
        }
    }
}
