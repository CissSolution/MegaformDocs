using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MegaForm.Umbraco.Data;
using Umbraco.Cms.Infrastructure.Migrations;

namespace MegaForm.Umbraco.Migrations
{
    /// <summary>
    /// MegaForm schema v2 — adds reusable workflow library tables.
    /// Required by Form/Workflow/Library/* endpoints.
    /// Idempotent: safe to run on installs that already have the tables.
    /// </summary>
    public class AddWorkflowLibraryTablesMigration : MigrationBase
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<AddWorkflowLibraryTablesMigration> _logger;

        public AddWorkflowLibraryTablesMigration(
            IMigrationContext context,
            IServiceScopeFactory scopeFactory,
            ILogger<AddWorkflowLibraryTablesMigration> logger)
            : base(context)
        {
            _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
            _logger = logger;
        }

        protected override void Migrate()
        {
            using var scope = _scopeFactory.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();

            var provider = (dbContext.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            _logger?.LogInformation("[MegaForm.Umbraco] Adding workflow library tables for provider {Provider}.", provider);

            if (TableExists(dbContext, "MF_FormWorkflows"))
            {
                _logger?.LogInformation("[MegaForm.Umbraco] Workflow library tables already exist; skipping.");
                return;
            }

            var sql = BuildSql(provider);
            foreach (var batch in sql.Split(new[] { ";\n", ";\r\n" }, StringSplitOptions.RemoveEmptyEntries))
            {
                var trimmed = batch.Trim();
                if (string.IsNullOrWhiteSpace(trimmed)) continue;
                try
                {
                    dbContext.Database.ExecuteSqlRaw(trimmed);
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "[MegaForm.Umbraco] Failed to execute workflow library SQL batch: {Sql}", trimmed);
                    throw;
                }
            }

            _logger?.LogInformation("[MegaForm.Umbraco] Workflow library tables created.");
        }

        private bool TableExists(MegaFormDbContext dbContext, string tableName)
        {
            var provider = (dbContext.Database.ProviderName ?? string.Empty).ToLowerInvariant();
            var conn = dbContext.Database.GetDbConnection();
            var wasOpen = conn.State == System.Data.ConnectionState.Open;
            if (!wasOpen) conn.Open();
            try
            {
                using var cmd = conn.CreateCommand();
                cmd.CommandText = provider switch
                {
                    var p when p.Contains("sqlserver") =>
                        $"SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = LOWER('{tableName}')",
                    var p when p.Contains("npgsql") =>
                        $"SELECT COUNT(*) FROM information_schema.tables WHERE LOWER(table_name) = LOWER('{tableName}')",
                    var p when p.Contains("mysql") =>
                        $"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND LOWER(table_name) = LOWER('{tableName}')",
                    _ =>
                        $"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER('{tableName}')"
                };
                var result = cmd.ExecuteScalar();
                return Convert.ToInt32(result) > 0;
            }
            finally
            {
                if (!wasOpen) conn.Close();
            }
        }

        private static string BuildSql(string provider)
        {
            if (provider.Contains("sqlite"))
                return BuildSqliteSql();
            if (provider.Contains("sqlserver") || provider.Contains("microsoft.data.sqlclient"))
                return BuildSqlServerSql();
            if (provider.Contains("npgsql"))
                return BuildPostgreSqlSql();
            if (provider.Contains("mysql"))
                return BuildMySqlSql();

            // Default to SQLite syntax for unknown providers.
            return BuildSqliteSql();
        }

        private static string BuildSqliteSql()
        {
            return @"
CREATE TABLE IF NOT EXISTS MF_WorkflowTemplates (
    WorkflowTemplateId INTEGER PRIMARY KEY AUTOINCREMENT,
    PortalId INTEGER NOT NULL,
    TemplateKey TEXT NOT NULL,
    Name TEXT NOT NULL,
    Description TEXT NULL,
    Category TEXT NULL,
    IsEnabled INTEGER NOT NULL DEFAULT 1,
    CurrentVersionId INTEGER NULL,
    CreatedByUserId INTEGER NULL,
    CreatedOnUtc TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedOnUtc TEXT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_TemplateKey ON MF_WorkflowTemplates(PortalId, TemplateKey);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_IsEnabled ON MF_WorkflowTemplates(PortalId, IsEnabled);

CREATE TABLE IF NOT EXISTS MF_WorkflowTemplateVersions (
    WorkflowVersionId INTEGER PRIMARY KEY AUTOINCREMENT,
    WorkflowTemplateId INTEGER NOT NULL,
    Version TEXT NOT NULL,
    DefinitionJson TEXT NOT NULL,
    Notes TEXT NULL,
    IsApplied INTEGER NOT NULL DEFAULT 0,
    CreatedByUserId INTEGER NULL,
    CreatedOnUtc TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Version ON MF_WorkflowTemplateVersions(WorkflowTemplateId, Version);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Applied ON MF_WorkflowTemplateVersions(WorkflowTemplateId, IsApplied);

CREATE TABLE IF NOT EXISTS MF_FormWorkflows (
    MappingId INTEGER PRIMARY KEY AUTOINCREMENT,
    FormId INTEGER NOT NULL,
    WorkflowTemplateId INTEGER NOT NULL,
    WorkflowVersionId INTEGER NULL,
    FieldMappingsJson TEXT NOT NULL DEFAULT '[]',
    VariableOverridesJson TEXT NOT NULL DEFAULT '{{}}',
    TriggerType TEXT NOT NULL DEFAULT 'on_submit',
    IsActive INTEGER NOT NULL DEFAULT 1,
    AppliedByUserId INTEGER NULL,
    AppliedBy TEXT NULL,
    AppliedOnUtc TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE,
    FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE,
    FOREIGN KEY (WorkflowVersionId) REFERENCES MF_WorkflowTemplateVersions(WorkflowVersionId) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_FormId_IsActive ON MF_FormWorkflows(FormId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_Template_IsActive ON MF_FormWorkflows(WorkflowTemplateId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_WorkflowVersionId ON MF_FormWorkflows(WorkflowVersionId);
";
        }

        private static string BuildSqlServerSql()
        {
            return @"
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = 'mf_workflowtemplates')
BEGIN
CREATE TABLE MF_WorkflowTemplates (
    WorkflowTemplateId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    PortalId INT NOT NULL,
    TemplateKey NVARCHAR(120) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Category NVARCHAR(100) NULL,
    IsEnabled BIT NOT NULL DEFAULT 1,
    CurrentVersionId INT NULL,
    CreatedByUserId INT NULL,
    CreatedOnUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedOnUtc DATETIME2 NULL
);
CREATE UNIQUE INDEX IX_MF_WorkflowTemplates_PortalId_TemplateKey ON MF_WorkflowTemplates(PortalId, TemplateKey);
CREATE INDEX IX_MF_WorkflowTemplates_PortalId_IsEnabled ON MF_WorkflowTemplates(PortalId, IsEnabled);
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = 'mf_workflowtemplateversions')
BEGIN
CREATE TABLE MF_WorkflowTemplateVersions (
    WorkflowVersionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    WorkflowTemplateId INT NOT NULL,
    Version NVARCHAR(40) NOT NULL,
    DefinitionJson NVARCHAR(MAX) NOT NULL,
    Notes NVARCHAR(MAX) NULL,
    IsApplied BIT NOT NULL DEFAULT 0,
    CreatedByUserId INT NULL,
    CreatedOnUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MF_WorkflowTemplateVersions_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IX_MF_WorkflowTemplateVersions_Template_Version ON MF_WorkflowTemplateVersions(WorkflowTemplateId, Version);
CREATE INDEX IX_MF_WorkflowTemplateVersions_Template_Applied ON MF_WorkflowTemplateVersions(WorkflowTemplateId, IsApplied);
END;

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE LOWER(TABLE_NAME) = 'mf_formworkflows')
BEGIN
CREATE TABLE MF_FormWorkflows (
    MappingId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    FormId INT NOT NULL,
    WorkflowTemplateId INT NOT NULL,
    WorkflowVersionId INT NULL,
    FieldMappingsJson NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    VariableOverridesJson NVARCHAR(MAX) NOT NULL DEFAULT '{{}}',
    TriggerType NVARCHAR(40) NOT NULL DEFAULT 'on_submit',
    IsActive BIT NOT NULL DEFAULT 1,
    AppliedByUserId INT NULL,
    AppliedBy NVARCHAR(200) NULL,
    AppliedOnUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_MF_FormWorkflows_MF_Forms FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplateVersions FOREIGN KEY (WorkflowVersionId) REFERENCES MF_WorkflowTemplateVersions(WorkflowVersionId) ON DELETE RESTRICT
);
CREATE INDEX IX_MF_FormWorkflows_FormId_IsActive ON MF_FormWorkflows(FormId, IsActive);
CREATE INDEX IX_MF_FormWorkflows_Template_IsActive ON MF_FormWorkflows(WorkflowTemplateId, IsActive);
CREATE INDEX IX_MF_FormWorkflows_WorkflowVersionId ON MF_FormWorkflows(WorkflowVersionId);
END;
";
        }

        private static string BuildPostgreSqlSql()
        {
            return @"
CREATE TABLE IF NOT EXISTS MF_WorkflowTemplates (
    WorkflowTemplateId SERIAL PRIMARY KEY,
    PortalId INT NOT NULL,
    TemplateKey VARCHAR(120) NOT NULL,
    Name VARCHAR(200) NOT NULL,
    Description TEXT NULL,
    Category VARCHAR(100) NULL,
    IsEnabled BOOLEAN NOT NULL DEFAULT TRUE,
    CurrentVersionId INT NULL,
    CreatedByUserId INT NULL,
    CreatedOnUtc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedOnUtc TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_TemplateKey ON MF_WorkflowTemplates(PortalId, TemplateKey);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_IsEnabled ON MF_WorkflowTemplates(PortalId, IsEnabled);

CREATE TABLE IF NOT EXISTS MF_WorkflowTemplateVersions (
    WorkflowVersionId SERIAL PRIMARY KEY,
    WorkflowTemplateId INT NOT NULL,
    Version VARCHAR(40) NOT NULL,
    DefinitionJson TEXT NOT NULL,
    Notes TEXT NULL,
    IsApplied BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedByUserId INT NULL,
    CreatedOnUtc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_MF_WorkflowTemplateVersions_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Version ON MF_WorkflowTemplateVersions(WorkflowTemplateId, Version);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Applied ON MF_WorkflowTemplateVersions(WorkflowTemplateId, IsApplied);

CREATE TABLE IF NOT EXISTS MF_FormWorkflows (
    MappingId SERIAL PRIMARY KEY,
    FormId INT NOT NULL,
    WorkflowTemplateId INT NOT NULL,
    WorkflowVersionId INT NULL,
    FieldMappingsJson TEXT NOT NULL DEFAULT '[]',
    VariableOverridesJson TEXT NOT NULL DEFAULT '{{}}',
    TriggerType VARCHAR(40) NOT NULL DEFAULT 'on_submit',
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    AppliedByUserId INT NULL,
    AppliedBy VARCHAR(200) NULL,
    AppliedOnUtc TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_MF_FormWorkflows_MF_Forms FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplateVersions FOREIGN KEY (WorkflowVersionId) REFERENCES MF_WorkflowTemplateVersions(WorkflowVersionId) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_FormId_IsActive ON MF_FormWorkflows(FormId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_Template_IsActive ON MF_FormWorkflows(WorkflowTemplateId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_WorkflowVersionId ON MF_FormWorkflows(WorkflowVersionId);
";
        }

        private static string BuildMySqlSql()
        {
            return @"
CREATE TABLE IF NOT EXISTS MF_WorkflowTemplates (
    WorkflowTemplateId INT AUTO_INCREMENT PRIMARY KEY,
    PortalId INT NOT NULL,
    TemplateKey VARCHAR(120) NOT NULL,
    Name VARCHAR(200) NOT NULL,
    Description LONGTEXT NULL,
    Category VARCHAR(100) NULL,
    IsEnabled BOOLEAN NOT NULL DEFAULT TRUE,
    CurrentVersionId INT NULL,
    CreatedByUserId INT NULL,
    CreatedOnUtc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UpdatedOnUtc DATETIME(6) NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_TemplateKey ON MF_WorkflowTemplates(PortalId, TemplateKey);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplates_PortalId_IsEnabled ON MF_WorkflowTemplates(PortalId, IsEnabled);

CREATE TABLE IF NOT EXISTS MF_WorkflowTemplateVersions (
    WorkflowVersionId INT AUTO_INCREMENT PRIMARY KEY,
    WorkflowTemplateId INT NOT NULL,
    Version VARCHAR(40) NOT NULL,
    DefinitionJson LONGTEXT NOT NULL,
    Notes LONGTEXT NULL,
    IsApplied BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedByUserId INT NULL,
    CreatedOnUtc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT FK_MF_WorkflowTemplateVersions_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Version ON MF_WorkflowTemplateVersions(WorkflowTemplateId, Version);
CREATE INDEX IF NOT EXISTS IX_MF_WorkflowTemplateVersions_Template_Applied ON MF_WorkflowTemplateVersions(WorkflowTemplateId, IsApplied);

CREATE TABLE IF NOT EXISTS MF_FormWorkflows (
    MappingId INT AUTO_INCREMENT PRIMARY KEY,
    FormId INT NOT NULL,
    WorkflowTemplateId INT NOT NULL,
    WorkflowVersionId INT NULL,
    FieldMappingsJson LONGTEXT NOT NULL DEFAULT '[]',
    VariableOverridesJson LONGTEXT NOT NULL DEFAULT '{{}}',
    TriggerType VARCHAR(40) NOT NULL DEFAULT 'on_submit',
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    AppliedByUserId INT NULL,
    AppliedBy VARCHAR(200) NULL,
    AppliedOnUtc DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT FK_MF_FormWorkflows_MF_Forms FOREIGN KEY (FormId) REFERENCES MF_Forms(FormId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplates FOREIGN KEY (WorkflowTemplateId) REFERENCES MF_WorkflowTemplates(WorkflowTemplateId) ON DELETE CASCADE,
    CONSTRAINT FK_MF_FormWorkflows_MF_WorkflowTemplateVersions FOREIGN KEY (WorkflowVersionId) REFERENCES MF_WorkflowTemplateVersions(WorkflowVersionId) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_FormId_IsActive ON MF_FormWorkflows(FormId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_Template_IsActive ON MF_FormWorkflows(WorkflowTemplateId, IsActive);
CREATE INDEX IF NOT EXISTS IX_MF_FormWorkflows_WorkflowVersionId ON MF_FormWorkflows(WorkflowVersionId);
";
        }
    }
}
