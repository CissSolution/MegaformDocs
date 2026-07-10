using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace MegaForm.Oqtane.Server.Data
{
    public class EfWorkflowLibraryRepository : IWorkflowLibraryRepository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore
        };

        // MF_FormWorkflows.VariableOverridesJson was added after the table shipped.
        // Oqtane never replays migration Up() bodies — MegaFormManager.InstallSchemaFromModel
        // only issues idempotent CREATE TABLE from the EF model — so an already-installed
        // site would never receive the new column. Self-heal once per process instead.
        private static int _schemaEnsured;

        public EfWorkflowLibraryRepository(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
            EnsureSchema();
        }

        private void EnsureSchema()
        {
            if (Interlocked.CompareExchange(ref _schemaEnsured, 1, 0) != 0)
                return;

            try
            {
                using var db = _dbContextFactory.CreateDbContext();
                var provider = db.Database.ProviderName ?? string.Empty;

                string colType, addKeyword;
                if (provider.IndexOf("Sqlite", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "TEXT"; addKeyword = "ADD COLUMN"; }
                else if (provider.IndexOf("Npgsql", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "text"; addKeyword = "ADD COLUMN"; }
                else if (provider.IndexOf("MySql", StringComparison.OrdinalIgnoreCase) >= 0)
                { colType = "LONGTEXT"; addKeyword = "ADD COLUMN"; }
                else
                { colType = "NVARCHAR(MAX)"; addKeyword = "ADD"; }

                db.Database.ExecuteSqlRaw(
                    "ALTER TABLE MF_FormWorkflows " + addKeyword + " VariableOverridesJson " + colType + " NULL");
            }
            catch
            {
                // Expected on fresh installs (the EF model already created the column) and on
                // every process start after the first upgrade. If the column genuinely cannot
                // be added, GetActiveDefinitionForForm throws, HasExecutableWorkflow catches it
                // and the form falls back to legacy post-submit actions rather than 500ing.
            }
        }

        public WorkflowRuntimeDefinition GetActiveDefinitionForForm(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var mapping = db.FormWorkflowMappings.AsNoTracking()
                .Where(x => x.FormId == formId && x.IsActive)
                .OrderByDescending(x => x.AppliedOnUtc)
                .FirstOrDefault();
            if (mapping == null)
                return null;

            var template = db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowTemplateId == mapping.WorkflowTemplateId && x.IsEnabled);
            if (template == null)
                return null;

            WorkflowTemplateVersionInfo version = null;
            if (mapping.WorkflowVersionId.HasValue)
            {
                version = db.WorkflowTemplateVersions.AsNoTracking()
                    .FirstOrDefault(x => x.WorkflowVersionId == mapping.WorkflowVersionId.Value);
            }
            if (version == null && template.CurrentVersionId.HasValue)
            {
                version = db.WorkflowTemplateVersions.AsNoTracking()
                    .FirstOrDefault(x => x.WorkflowVersionId == template.CurrentVersionId.Value);
            }
            if (version == null)
            {
                version = db.WorkflowTemplateVersions.AsNoTracking()
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
            using var db = _dbContextFactory.CreateDbContext();
            return db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
        }

        public WorkflowTemplateInfo GetTemplateByKey(int portalId, string templateKey)
        {
            if (string.IsNullOrWhiteSpace(templateKey))
                return null;

            using var db = _dbContextFactory.CreateDbContext();
            return db.WorkflowTemplates.AsNoTracking()
                .FirstOrDefault(x => x.PortalId == portalId && x.TemplateKey == templateKey);
        }

        public List<WorkflowTemplateInfo> ListTemplates(int portalId, bool enabledOnly = true)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var query = db.WorkflowTemplates.AsNoTracking().Where(x => x.PortalId == portalId);
            if (enabledOnly)
                query = query.Where(x => x.IsEnabled);
            return query.OrderBy(x => x.Name).ToList();
        }

        public int SaveTemplate(WorkflowTemplateInfo template)
        {
            if (template == null)
                throw new ArgumentNullException(nameof(template));

            using var db = _dbContextFactory.CreateDbContext();
            Normalize(template);
            if (template.WorkflowTemplateId == 0)
            {
                template.CreatedOnUtc = template.CreatedOnUtc == default(DateTime) ? DateTime.UtcNow : template.CreatedOnUtc;
                db.WorkflowTemplates.Add(template);
            }
            else
            {
                template.UpdatedOnUtc = DateTime.UtcNow;
                db.WorkflowTemplates.Update(template);
            }
            db.SaveChanges();
            return template.WorkflowTemplateId;
        }

        public WorkflowTemplateVersionInfo GetVersion(int workflowVersionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.WorkflowTemplateVersions.AsNoTracking()
                .FirstOrDefault(x => x.WorkflowVersionId == workflowVersionId);
        }

        public List<WorkflowTemplateVersionInfo> ListVersions(int workflowTemplateId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.WorkflowTemplateVersions.AsNoTracking()
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

            using var db = _dbContextFactory.CreateDbContext();
            Normalize(version);
            if (version.WorkflowVersionId == 0)
            {
                version.CreatedOnUtc = version.CreatedOnUtc == default(DateTime) ? DateTime.UtcNow : version.CreatedOnUtc;
                db.WorkflowTemplateVersions.Add(version);
            }
            else
            {
                db.WorkflowTemplateVersions.Update(version);
            }
            db.SaveChanges();
            return version.WorkflowVersionId;
        }

        public void ApplyVersion(int workflowTemplateId, int workflowVersionId, string appliedBy = "system")
        {
            using var db = _dbContextFactory.CreateDbContext();
            var template = db.WorkflowTemplates.FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
            var version = db.WorkflowTemplateVersions
                .FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId && x.WorkflowVersionId == workflowVersionId);
            if (template == null || version == null)
                throw new InvalidOperationException("Workflow template/version not found.");

            var siblings = db.WorkflowTemplateVersions.Where(x => x.WorkflowTemplateId == workflowTemplateId);
            foreach (var sibling in siblings)
                sibling.IsApplied = sibling.WorkflowVersionId == workflowVersionId;

            template.CurrentVersionId = workflowVersionId;
            template.UpdatedOnUtc = DateTime.UtcNow;
            db.SaveChanges();
        }

        public FormWorkflowMappingInfo GetActiveMapping(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.FormWorkflowMappings.AsNoTracking()
                .Where(x => x.FormId == formId && x.IsActive)
                .OrderByDescending(x => x.AppliedOnUtc)
                .FirstOrDefault();
        }

        public List<FormWorkflowMappingInfo> ListMappingsForTemplate(int workflowTemplateId, bool activeOnly = true)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var query = db.FormWorkflowMappings.AsNoTracking()
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

            using var db = _dbContextFactory.CreateDbContext();
            var active = db.FormWorkflowMappings
                .Where(x => x.FormId == mapping.FormId && x.IsActive)
                .ToList();
            foreach (var row in active)
                row.IsActive = false;

            Normalize(mapping);
            mapping.MappingId = 0;
            mapping.IsActive = true;
            mapping.AppliedOnUtc = DateTime.UtcNow;
            db.FormWorkflowMappings.Add(mapping);
            db.SaveChanges();
            return mapping.MappingId;
        }

        public void ClearMapping(int formId)
        {
            if (formId <= 0) return;
            using var db = _dbContextFactory.CreateDbContext();
            var active = db.FormWorkflowMappings.Where(x => x.FormId == formId && x.IsActive).ToList();
            if (active.Count == 0) return;
            foreach (var row in active)
                row.IsActive = false;
            db.SaveChanges();
        }

        public int CountFormsUsingTemplate(int workflowTemplateId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.FormWorkflowMappings.AsNoTracking()
                .Count(x => x.WorkflowTemplateId == workflowTemplateId && x.IsActive);
        }

        public void DeleteTemplate(int workflowTemplateId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var template = db.WorkflowTemplates.FirstOrDefault(x => x.WorkflowTemplateId == workflowTemplateId);
            if (template == null) return;

            // Unbind forms first so no submit resolves a template that no longer exists.
            // Those forms revert to their legacy per-form WorkflowJson.
            var mappings = db.FormWorkflowMappings.Where(x => x.WorkflowTemplateId == workflowTemplateId).ToList();
            db.FormWorkflowMappings.RemoveRange(mappings);

            var versions = db.WorkflowTemplateVersions.Where(x => x.WorkflowTemplateId == workflowTemplateId).ToList();
            db.WorkflowTemplateVersions.RemoveRange(versions);

            // CurrentVersionId points at a row we are about to delete — null it in the same
            // unit of work so SaveChanges never leaves a dangling reference.
            template.CurrentVersionId = null;
            db.WorkflowTemplates.Remove(template);
            db.SaveChanges();
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
                // Hand-edited or corrupted JSON must not take the submit down.
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
