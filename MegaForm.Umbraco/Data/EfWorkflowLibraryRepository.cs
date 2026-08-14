using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Newtonsoft.Json;

namespace MegaForm.Umbraco.Data
{
    /// <summary>
    /// Umbraco EF implementation of the reusable workflow library repository.
    /// Ported from MegaForm.Oqtane.Server.Data.EfWorkflowLibraryRepository.
    /// </summary>
    public class EfWorkflowLibraryRepository : IWorkflowLibraryRepository
    {
        private readonly MegaFormDbContext _db;

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore
        };

        // MF_FormWorkflows.VariableOverridesJson was added after the table shipped.
        // Self-heal once per process for sites that upgraded before the column existed.
        private static int _schemaEnsured;

        public EfWorkflowLibraryRepository(MegaFormDbContext db)
        {
            _db = db ?? throw new ArgumentNullException(nameof(db));
            EnsureSchema();
        }

        private void EnsureSchema()
        {
            if (Interlocked.CompareExchange(ref _schemaEnsured, 1, 0) != 0)
                return;

            try
            {
                var provider = _db.Database.ProviderName ?? string.Empty;

                if (ColumnExists("MF_FormWorkflows", "VariableOverridesJson", provider))
                    return;

                string colType, addKeyword;
                if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "TEXT"; addKeyword = "ADD COLUMN"; }
                else if (provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "text"; addKeyword = "ADD COLUMN"; }
                else if (provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "LONGTEXT"; addKeyword = "ADD COLUMN"; }
                else
                { colType = "NVARCHAR(MAX)"; addKeyword = "ADD"; }

                _db.Database.ExecuteSqlRaw(
                    "ALTER TABLE MF_FormWorkflows " + addKeyword + " VariableOverridesJson " + colType + " NULL");
            }
            catch
            {
                // Best-effort schema alignment; ignore on failure.
            }
        }

        private bool ColumnExists(string tableName, string columnName, string provider)
        {
            try
            {
                using var command = _db.Database.GetDbConnection().CreateCommand();

                string sql;
                if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    // pragma_table_info requires a string literal for the table name.
                    sql = $"SELECT COUNT(*) FROM pragma_table_info('{tableName}') WHERE name = @columnName";
                }
                else if (provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    sql = "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = @tableName AND column_name = @columnName";
                }
                else if (provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName";
                }
                else
                {
                    // SQL Server / default
                    sql = "SELECT COUNT(*) FROM sys.columns WHERE Name = @columnName AND Object_ID = OBJECT_ID(@tableName)";
                }

                command.CommandText = sql;

                if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) < 0)
                {
                    var tableParam = command.CreateParameter();
                    tableParam.ParameterName = "@tableName";
                    tableParam.Value = tableName;
                    command.Parameters.Add(tableParam);
                }

                var columnParam = command.CreateParameter();
                columnParam.ParameterName = "@columnName";
                columnParam.Value = columnName;
                command.Parameters.Add(columnParam);

                if (command.Connection.State != System.Data.ConnectionState.Open)
                    command.Connection.Open();

                var result = command.ExecuteScalar();
                return Convert.ToInt64(result) > 0;
            }
            catch
            {
                return false;
            }
        }

        public WorkflowRuntimeDefinition GetActiveDefinitionForForm(int formId)
        {
            var mapping = _db.FormWorkflowMappings.AsNoTracking()
                .Where(x => x.FormId == formId && x.IsActive)
                .OrderByDescending(x => x.AppliedOnUtc)
                .FirstOrDefault();
            if (mapping == null)
                return null;

            var template = _db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowTemplateId == mapping.WorkflowTemplateId && x.IsEnabled);
            if (template == null)
                return null;

            WorkflowTemplateVersionInfo version = null;
            if (mapping.WorkflowVersionId.HasValue)
            {
                version = _db.WorkflowTemplateVersions.AsNoTracking()
                    .FirstOrDefault(x => x.WorkflowVersionId == mapping.WorkflowVersionId.Value);
            }
            if (version == null && template.CurrentVersionId.HasValue)
            {
                version = _db.WorkflowTemplateVersions.AsNoTracking()
                    .FirstOrDefault(x => x.WorkflowVersionId == template.CurrentVersionId.Value);
            }
            if (version == null)
            {
                version = _db.WorkflowTemplateVersions.AsNoTracking()
                    .Where(x => x.WorkflowTemplateId == template.WorkflowTemplateId && x.IsApplied)
                    .OrderByDescending(x => x.CreatedOnUtc)
                    .FirstOrDefault();
            }
            if (version == null || string.IsNullOrWhiteSpace(version.DefinitionJson))
                return null;

            WorkflowDefinition definition;
            try
            {
                definition = JsonConvert.DeserializeObject<WorkflowDefinition>(version.DefinitionJson, JsonSettings);
            }
            catch
            {
                return null;
            }
            if (definition == null)
                return null;

            definition.FormId = formId;
            if (string.IsNullOrWhiteSpace(definition.Version))
                definition.Version = version.Version ?? "1.0.0";

            return new WorkflowRuntimeDefinition
            {
                Source = "library",
                Definition = definition,
                Template = template,
                Version = version,
                Mapping = mapping,
                FieldMappings = ParseFieldMappings(mapping.FieldMappingsJson),
                VariableOverrides = ParseVariableOverrides(mapping.VariableOverridesJson)
            };
        }

        public WorkflowTemplateInfo GetTemplate(int workflowTemplateId)
        {
            return _db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
        }

        public WorkflowTemplateInfo GetTemplateByKey(int portalId, string templateKey)
        {
            if (string.IsNullOrWhiteSpace(templateKey))
                return null;

            return _db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.PortalId == portalId && x.TemplateKey == templateKey);
        }

        public List<WorkflowTemplateInfo> ListTemplates(int portalId, bool enabledOnly = true)
        {
            var query = _db.WorkflowTemplates.AsNoTracking().Where(x => x.PortalId == portalId);
            if (enabledOnly)
                query = query.Where(x => x.IsEnabled);
            return query.OrderBy(x => x.Name).ToList();
        }

        public int SaveTemplate(WorkflowTemplateInfo template)
        {
            if (template == null)
                throw new ArgumentNullException(nameof(template));

            Normalize(template);
            if (template.WorkflowTemplateId == 0)
            {
                template.CreatedOnUtc = template.CreatedOnUtc == default(DateTime) ? DateTime.UtcNow : template.CreatedOnUtc;
                _db.WorkflowTemplates.Add(template);
            }
            else
            {
                template.UpdatedOnUtc = DateTime.UtcNow;
                _db.WorkflowTemplates.Update(template);
            }
            _db.SaveChanges();
            return template.WorkflowTemplateId;
        }

        public WorkflowTemplateVersionInfo GetVersion(int workflowVersionId)
        {
            return _db.WorkflowTemplateVersions.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowVersionId == workflowVersionId);
        }

        public List<WorkflowTemplateVersionInfo> ListVersions(int workflowTemplateId)
        {
            return _db.WorkflowTemplateVersions.AsNoTracking()
                .Where(x => x.WorkflowTemplateId == workflowTemplateId)
                .OrderByDescending(x => x.CreatedOnUtc)
                .ToList();
        }

        public int SaveVersion(WorkflowTemplateVersionInfo version)
        {
            if (version == null)
                throw new ArgumentNullException(nameof(version));
            if (version.WorkflowTemplateId <= 0)
                throw new InvalidOperationException("WorkflowTemplateId is required.");

            Normalize(version);
            if (version.WorkflowVersionId == 0)
            {
                version.CreatedOnUtc = version.CreatedOnUtc == default(DateTime) ? DateTime.UtcNow : version.CreatedOnUtc;
                _db.WorkflowTemplateVersions.Add(version);
            }
            else
            {
                _db.WorkflowTemplateVersions.Update(version);
            }
            _db.SaveChanges();
            return version.WorkflowVersionId;
        }

        public void ApplyVersion(int workflowTemplateId, int workflowVersionId, string appliedBy = "system")
        {
            var template = _db.WorkflowTemplates.FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
            var version = _db.WorkflowTemplateVersions
                .FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId && x.WorkflowVersionId == workflowVersionId);
            if (template == null || version == null)
                throw new InvalidOperationException("Workflow template/version not found.");

            var siblings = _db.WorkflowTemplateVersions.Where(x => x.WorkflowTemplateId == workflowTemplateId);
            foreach (var sibling in siblings)
                sibling.IsApplied = sibling.WorkflowVersionId == workflowVersionId;

            template.CurrentVersionId = workflowVersionId;
            template.UpdatedOnUtc = DateTime.UtcNow;
            _db.SaveChanges();
        }

        public FormWorkflowMappingInfo GetActiveMapping(int formId)
        {
            return _db.FormWorkflowMappings.AsNoTracking()
                .Where(x => x.FormId == formId && x.IsActive)
                .OrderByDescending(x => x.AppliedOnUtc)
                .FirstOrDefault();
        }

        public List<FormWorkflowMappingInfo> ListMappingsForTemplate(int workflowTemplateId, bool activeOnly = true)
        {
            var query = _db.FormWorkflowMappings.AsNoTracking()
                .Where(x => x.WorkflowTemplateId == workflowTemplateId);
            if (activeOnly)
                query = query.Where(x => x.IsActive);
            return query.OrderByDescending(x => x.AppliedOnUtc).ToList();
        }

        public int ApplyToForm(FormWorkflowMappingInfo mapping)
        {
            if (mapping == null)
                throw new ArgumentNullException(nameof(mapping));
            if (mapping.FormId <= 0 || mapping.WorkflowTemplateId <= 0)
                throw new InvalidOperationException("FormId and WorkflowTemplateId are required.");

            var active = _db.FormWorkflowMappings
                .Where(x => x.FormId == mapping.FormId && x.IsActive)
                .ToList();
            foreach (var row in active)
                row.IsActive = false;

            Normalize(mapping);
            mapping.MappingId = 0;
            mapping.IsActive = true;
            mapping.AppliedOnUtc = DateTime.UtcNow;
            _db.FormWorkflowMappings.Add(mapping);
            _db.SaveChanges();
            return mapping.MappingId;
        }

        public void ClearMapping(int formId)
        {
            if (formId <= 0) return;
            var active = _db.FormWorkflowMappings.Where(x => x.FormId == formId && x.IsActive).ToList();
            if (active.Count == 0) return;
            foreach (var row in active)
                row.IsActive = false;
            _db.SaveChanges();
        }

        public int CountFormsUsingTemplate(int workflowTemplateId)
        {
            return _db.FormWorkflowMappings.AsNoTracking()
                .Count(x => x.WorkflowTemplateId == workflowTemplateId && x.IsActive);
        }

        public void DeleteTemplate(int workflowTemplateId)
        {
            var template = _db.WorkflowTemplates.FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
            if (template == null) return;

            var mappings = _db.FormWorkflowMappings.Where(x => x.WorkflowTemplateId == workflowTemplateId).ToList();
            _db.FormWorkflowMappings.RemoveRange(mappings);

            var versions = _db.WorkflowTemplateVersions.Where(x => x.WorkflowTemplateId == workflowTemplateId).ToList();
            _db.WorkflowTemplateVersions.RemoveRange(versions);

            template.CurrentVersionId = null;
            _db.WorkflowTemplates.Remove(template);
            _db.SaveChanges();
        }

        private static Dictionary<string, object> ParseVariableOverrides(string json)
        {
            var empty = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(json))
                return empty;

            try
            {
                var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(json, JsonSettings);
                if (parsed == null) return empty;
                return new Dictionary<string, object>(parsed, StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return empty;
            }
        }

        private static List<WorkflowFieldMappingInfo> ParseFieldMappings(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new List<WorkflowFieldMappingInfo>();

            try
            {
                return JsonConvert.DeserializeObject<List<WorkflowFieldMappingInfo>>(json, JsonSettings)
                    ?? new List<WorkflowFieldMappingInfo>();
            }
            catch
            {
                return new List<WorkflowFieldMappingInfo>();
            }
        }

        private static void Normalize(WorkflowTemplateInfo template)
        {
            template.TemplateKey = (template.TemplateKey ?? string.Empty).Trim();
            template.Name = (template.Name ?? string.Empty).Trim();
            template.Description = template.Description ?? string.Empty;
            template.Category = template.Category ?? string.Empty;
        }

        private static void Normalize(WorkflowTemplateVersionInfo version)
        {
            version.Version = string.IsNullOrWhiteSpace(version.Version) ? "1.0.0" : version.Version.Trim();
            version.DefinitionJson = version.DefinitionJson ?? string.Empty;
            version.Notes = version.Notes ?? string.Empty;
        }

        private static void Normalize(FormWorkflowMappingInfo mapping)
        {
            mapping.FieldMappingsJson = string.IsNullOrWhiteSpace(mapping.FieldMappingsJson)
                ? "[]"
                : mapping.FieldMappingsJson;
            mapping.VariableOverridesJson = string.IsNullOrWhiteSpace(mapping.VariableOverridesJson)
                ? "{}"
                : mapping.VariableOverridesJson;
            mapping.TriggerType = string.IsNullOrWhiteSpace(mapping.TriggerType)
                ? "on_submit"
                : mapping.TriggerType.Trim();
            mapping.AppliedBy = mapping.AppliedBy ?? string.Empty;
        }
    }
}
