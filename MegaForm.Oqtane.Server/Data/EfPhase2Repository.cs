using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Oqtane.Server.Data
{
    /// <summary>
    /// [OQ-difix20260418-04] IPhase2Repository implementation for Oqtane.
    ///
    /// Why this file matters:
    ///   The original Oqtane Startup registered SubmissionProcessor + PermissionService +
    ///   UniqueIdService + WebhookService + WorkflowEngine, but never registered an
    ///   IPhase2Repository. Each of those services takes IPhase2Repository in its
    ///   constructor, so DI failed to construct MegaFormController →
    ///   ExceptionMiddleware caught the InvalidOperationException and returned
    ///   200 + Content-Length: 0 with no body for EVERY /api/MegaForm/* call.
    ///   Symptom: Save/Publish silently fail, list dropdown empty, list endpoint blank.
    ///
    /// Tables that already exist in MegaFormDbContext (real EF):
    ///   FormViews, Templates, Permissions, Workflows, WebhookLogs.
    ///
    /// Tables that the original Oqtane migration did NOT create (in-memory stubs):
    ///   AuditLog, UniqueIdCounter, RateLimit.
    ///   These stubs are thread-safe and process-local. Audit and rate-limit are
    ///   non-critical for Save/Publish; UniqueId counters reset on app restart but
    ///   work correctly within a session. A future migration can replace stubs with
    ///   real tables — the IPhase2Repository surface stays the same.
    /// </summary>
    public class EfPhase2Repository : IPhase2Repository
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        // ── In-memory stubs for tables not yet migrated ──────────────────
        private static long _auditLogIdCounter = 0;
        private static long _workflowRunIdCounter = 0;
        // key = formId|fieldKey  →  current counter
        private static readonly ConcurrentDictionary<string, long> _uniqueIdCounters = new();
        // key = ip|formId|bucket → list of timestamps (we keep raw timestamps for windowed counting)
        private static readonly ConcurrentDictionary<string, ConcurrentBag<DateTime>> _rateLimitBuckets = new();
        private static readonly object _auditLock = new();
        private static readonly List<AuditLogInfo> _auditLogStub = new();
        private static readonly ConcurrentDictionary<long, (string Status, string Error, DateTime? Completed)> _workflowRunStub = new();

        public EfPhase2Repository(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
        }

        public List<string> GetAppScopes(int portalId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.AppDefinitions
                .Where(a => a.PortalId == portalId && a.IsEnabled)
                .Select(a => a.AppScope)
                .Concat(db.Forms.Where(f => f.PortalId == portalId).Select(f => f.AppScope))
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct()
                .OrderBy(s => s)
                .ToList();
        }

        public List<AppDefinitionInfo> ListAppDefinitions(int portalId, string appScope = null)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var query = db.AppDefinitions.Where(a => a.PortalId == portalId);
            if (!string.IsNullOrWhiteSpace(appScope))
            {
                var scope = (appScope ?? string.Empty).Trim();
                query = query.Where(a => a.AppScope == scope);
            }

            return query
                .OrderBy(a => a.SortOrder)
                .ThenBy(a => a.AppName)
                .ToList();
        }

        public AppDefinitionInfo GetAppDefinition(int portalId, string appKey)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var key = NormalizeKey(appKey);
            if (string.IsNullOrWhiteSpace(key))
                return null;

            return db.AppDefinitions
                .FirstOrDefault(a => a.PortalId == portalId && a.AppKey == key);
        }

        public int SaveAppDefinition(AppDefinitionInfo app)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));

            using var db = _dbContextFactory.CreateDbContext();
            NormalizeAppDefinition(app);
            var duplicate = db.AppDefinitions.FirstOrDefault(a =>
                a.PortalId == app.PortalId &&
                a.AppId != app.AppId &&
                a.AppKey == app.AppKey);
            if (duplicate != null)
                throw new InvalidOperationException("AppKey must be unique within the portal.");

            if (app.AppId == 0)
            {
                if (app.CreatedOnUtc == default(DateTime)) app.CreatedOnUtc = DateTime.UtcNow;
                app.ModifiedOnUtc = app.CreatedOnUtc;
                db.AppDefinitions.Add(app);
            }
            else
            {
                var existing = db.AppDefinitions.FirstOrDefault(a => a.AppId == app.AppId);
                if (existing == null)
                {
                    if (app.CreatedOnUtc == default(DateTime)) app.CreatedOnUtc = DateTime.UtcNow;
                    app.ModifiedOnUtc = DateTime.UtcNow;
                    db.AppDefinitions.Add(app);
                }
                else
                {
                    existing.PortalId = app.PortalId;
                    existing.AppKey = app.AppKey;
                    existing.AppName = app.AppName;
                    existing.Description = app.Description;
                    existing.AppScope = app.AppScope;
                    existing.Icon = app.Icon;
                    existing.AccentColor = app.AccentColor;
                    existing.ManifestJson = app.ManifestJson;
                    existing.SettingsJson = app.SettingsJson;
                    existing.ResourcesJson = app.ResourcesJson;
                    existing.IsEnabled = app.IsEnabled;
                    existing.SortOrder = app.SortOrder;
                    existing.ModifiedByUserId = app.ModifiedByUserId;
                    existing.ModifiedOnUtc = DateTime.UtcNow;
                }
            }

            db.SaveChanges();
            return app.AppId;
        }

        public void DeleteAppDefinition(int appId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var app = db.AppDefinitions.Find(appId);
            if (app == null) return;

            var queries = db.AppQueries.Where(q => q.AppId == appId).ToList();
            if (queries.Count > 0)
                db.AppQueries.RemoveRange(queries);
            db.AppDefinitions.Remove(app);
            db.SaveChanges();
        }

        public List<AppQueryDefinitionInfo> ListAppQueries(int appId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.AppQueries
                .Where(q => q.AppId == appId)
                .OrderBy(q => q.SortOrder)
                .ThenBy(q => q.QueryName)
                .ToList();
        }

        public AppQueryDefinitionInfo GetAppQuery(int appId, string queryKey)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var key = NormalizeKey(queryKey);
            if (string.IsNullOrWhiteSpace(key))
                return null;

            return db.AppQueries.FirstOrDefault(q => q.AppId == appId && q.QueryKey == key);
        }

        public int SaveAppQuery(AppQueryDefinitionInfo query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));

            using var db = _dbContextFactory.CreateDbContext();
            NormalizeAppQuery(query);
            var duplicate = db.AppQueries.FirstOrDefault(q =>
                q.AppId == query.AppId &&
                q.QueryId != query.QueryId &&
                q.QueryKey == query.QueryKey);
            if (duplicate != null)
                throw new InvalidOperationException("QueryKey must be unique within the app.");

            if (query.QueryId == 0)
            {
                if (query.CreatedOnUtc == default(DateTime)) query.CreatedOnUtc = DateTime.UtcNow;
                query.ModifiedOnUtc = query.CreatedOnUtc;
                db.AppQueries.Add(query);
            }
            else
            {
                var existing = db.AppQueries.FirstOrDefault(q => q.QueryId == query.QueryId);
                if (existing == null)
                {
                    if (query.CreatedOnUtc == default(DateTime)) query.CreatedOnUtc = DateTime.UtcNow;
                    query.ModifiedOnUtc = DateTime.UtcNow;
                    db.AppQueries.Add(query);
                }
                else
                {
                    existing.AppId = query.AppId;
                    existing.FormId = query.FormId;
                    existing.QueryKey = query.QueryKey;
                    existing.QueryName = query.QueryName;
                    existing.Description = query.Description;
                    existing.QueryType = query.QueryType;
                    existing.DefinitionJson = query.DefinitionJson;
                    existing.IsSystem = query.IsSystem;
                    existing.SortOrder = query.SortOrder;
                    existing.ModifiedByUserId = query.ModifiedByUserId;
                    existing.ModifiedOnUtc = DateTime.UtcNow;
                }
            }

            db.SaveChanges();
            return query.QueryId;
        }

        public void DeleteAppQuery(int queryId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var query = db.AppQueries.Find(queryId);
            if (query != null)
            {
                db.AppQueries.Remove(query);
                db.SaveChanges();
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  VIEWS  (real EF — table MF_Views exists)
        // ══════════════════════════════════════════════════════════════════
        public List<FormViewInfo> GetFormViews(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.FormViews.Where(v => v.FormId == formId).ToList();
        }

        public int SaveFormView(FormViewInfo view)
        {
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] MF_Views has NOT NULL on ViewKey, ViewType,
            // ViewName, ConfigJson, CustomHtml, CustomCss, PermissionsJson.
            NullStringNormalizer.Normalize(view);
            if (view.IsDefault)
            {
                var siblings = db.FormViews.Where(v => v.FormId == view.FormId && v.ViewId != view.ViewId).ToList();
                foreach (var sibling in siblings) sibling.IsDefault = false;
            }

            if (view.ViewId == 0)
            {
                if (view.CreatedOnUtc == default(DateTime)) view.CreatedOnUtc = DateTime.UtcNow;
                db.FormViews.Add(view);
            }
            else
            {
                var existing = db.FormViews.FirstOrDefault(v => v.ViewId == view.ViewId);
                if (existing == null)
                {
                    if (view.CreatedOnUtc == default(DateTime)) view.CreatedOnUtc = DateTime.UtcNow;
                    db.FormViews.Add(view);
                }
                else
                {
                    existing.FormId = view.FormId;
                    existing.ViewKey = view.ViewKey;
                    existing.QueryKey = view.QueryKey;
                    existing.ViewType = view.ViewType;
                    existing.ViewName = view.ViewName;
                    existing.IsDefault = view.IsDefault;
                    existing.SortOrder = view.SortOrder;
                    existing.ConfigJson = view.ConfigJson;
                    existing.CustomHtml = view.CustomHtml;
                    existing.CustomCss = view.CustomCss;
                    existing.PermissionsJson = view.PermissionsJson;
                }
            }
            db.SaveChanges();
            return view.ViewId;
        }

        public void DeleteFormView(int viewId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var v = db.FormViews.Find(viewId);
            if (v != null) { db.FormViews.Remove(v); db.SaveChanges(); }
        }

        public List<FormRelationInfo> GetFormRelations(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.FormRelations
                .Where(r => r.ParentFormId == formId || r.ChildFormId == formId)
                .OrderBy(r => r.ParentFormId)
                .ThenBy(r => r.ChildFormId)
                .ThenBy(r => r.RelationId)
                .ToList();
        }

        public int SaveFormRelation(FormRelationInfo relation)
        {
            if (relation == null) throw new ArgumentNullException(nameof(relation));

            using var db = _dbContextFactory.CreateDbContext();
            NormalizeFormRelation(relation);
            if (relation.RelationId == 0)
            {
                db.FormRelations.Add(relation);
            }
            else
            {
                var existing = db.FormRelations.FirstOrDefault(r => r.RelationId == relation.RelationId);
                if (existing == null)
                {
                    db.FormRelations.Add(relation);
                }
                else
                {
                    existing.ParentFormId = relation.ParentFormId;
                    existing.ChildFormId = relation.ChildFormId;
                    existing.RelationType = relation.RelationType;
                    existing.ForeignKey = relation.ForeignKey;
                    existing.ParentKey = relation.ParentKey;
                    existing.Label = relation.Label;
                    existing.CascadeDelete = relation.CascadeDelete;
                }
            }

            db.SaveChanges();
            return relation.RelationId;
        }

        public void DeleteFormRelation(int relationId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var relation = db.FormRelations.Find(relationId);
            if (relation == null) return;
            db.FormRelations.Remove(relation);
            db.SaveChanges();
        }

        public void LinkSubmissions(int relationId, int parentSubmissionId, int childSubmissionId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var exists = db.SubmissionLinks.Any(sl =>
                sl.RelationId == relationId &&
                sl.ParentSubmissionId == parentSubmissionId &&
                sl.ChildSubmissionId == childSubmissionId);
            if (exists) return;

            db.SubmissionLinks.Add(new SubmissionLinkInfo
            {
                RelationId = relationId,
                ParentSubmissionId = parentSubmissionId,
                ChildSubmissionId = childSubmissionId,
                CreatedOnUtc = DateTime.UtcNow
            });
            db.SaveChanges();
        }

        public (List<SubmissionInfo> Items, int TotalCount) GetChildSubmissions(
            int parentSubmissionId, int? relationId = null, int page = 1, int pageSize = 50)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var links = db.SubmissionLinks.Where(sl => sl.ParentSubmissionId == parentSubmissionId);
            if (relationId.HasValue)
                links = links.Where(sl => sl.RelationId == relationId.Value);

            var joined = from sl in links
                         join s in db.Submissions on sl.ChildSubmissionId equals s.SubmissionId
                         where s.Status != "Deleted"
                         orderby s.SubmittedOnUtc ascending
                         select s;

            var total = joined.Count();
            var safePage = page <= 0 ? 1 : page;
            var safePageSize = pageSize <= 0 ? 50 : pageSize;
            var items = joined
                .Skip((safePage - 1) * safePageSize)
                .Take(safePageSize)
                .ToList();
            return (items, total);
        }

        // ══════════════════════════════════════════════════════════════════
        //  TEMPLATES  (real EF — table MF_Templates exists)
        // ══════════════════════════════════════════════════════════════════
        public List<TemplateInfo> ListTemplates(int portalId, string category = null)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var q = db.Templates.Where(t => t.PortalId == portalId || t.PortalId == -1);
            if (!string.IsNullOrEmpty(category)) q = q.Where(t => t.Category == category);
            return q.ToList();
        }

        public int SaveTemplate(TemplateInfo template)
        {
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] MF_Templates has many NOT NULL string columns.
            NullStringNormalizer.Normalize(template);
            if (template.TemplateId == 0) db.Templates.Add(template);
            else db.Templates.Update(template);
            db.SaveChanges();
            return template.TemplateId;
        }

        public void DeleteTemplate(int portalId, string slug)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var t = db.Templates.FirstOrDefault(x => x.PortalId == portalId && x.Slug == slug);
            if (t != null) { db.Templates.Remove(t); db.SaveChanges(); }
        }

        // ══════════════════════════════════════════════════════════════════
        //  PERMISSIONS  (real EF — table MF_Permissions exists)
        // ══════════════════════════════════════════════════════════════════
        public List<FormPermissionInfo> GetFormPermissions(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Permissions.Where(p => p.FormId == formId).ToList();
        }

        public void SaveFormPermissions(int formId, List<FormPermissionInfo> perms)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var existing = db.Permissions.Where(p => p.FormId == formId).ToList();
            db.Permissions.RemoveRange(existing);
            foreach (var p in perms ?? new List<FormPermissionInfo>())
            {
                p.FormId = formId;
                // [OQ-difix20260418-08] MF_Permissions NOT NULL: PermissionType,
                // PrincipalType, PrincipalId, RoleName, Scope, FieldRestrictions.
                NullStringNormalizer.Normalize(p);
                db.Permissions.Add(p);
            }
            db.SaveChanges();
        }

        // ══════════════════════════════════════════════════════════════════
        //  WORKFLOWS — definition CRUD: real EF
        //              run tracking: in-memory stub (no MF_WorkflowRuns table)
        // ══════════════════════════════════════════════════════════════════
        public List<WorkflowInfo> GetWorkflows(int formId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            return db.Workflows.Where(w => w.FormId == formId).ToList();
        }

        public int SaveWorkflow(WorkflowInfo wf)
        {
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] MF_Workflows NOT NULL: WorkflowName, Description,
            // TriggerType, TriggerConfig, StepsJson.
            NullStringNormalizer.Normalize(wf);
            if (wf.WorkflowId == 0) db.Workflows.Add(wf);
            else db.Workflows.Update(wf);
            db.SaveChanges();
            return wf.WorkflowId;
        }

        public void DeleteWorkflow(int workflowId)
        {
            using var db = _dbContextFactory.CreateDbContext();
            var w = db.Workflows.Find(workflowId);
            if (w != null) { db.Workflows.Remove(w); db.SaveChanges(); }
        }

        public long CreateWorkflowRun(int workflowId, int submissionId)
        {
            // In-memory stub — survives per process, lost on restart. Acceptable for
            // run tracking (it's diagnostic, not a source of truth).
            var runId = System.Threading.Interlocked.Increment(ref _workflowRunIdCounter);
            _workflowRunStub[runId] = (Status: "running", Error: null, Completed: null);
            return runId;
        }

        public void CompleteWorkflowRun(long runId, string status, string error)
        {
            _workflowRunStub[runId] = (Status: status ?? "completed", Error: error, Completed: DateTime.UtcNow);
        }

        public void LogWorkflowStep(long runId, string stepId, string stepType, string status, string output, string error)
        {
            // No-op stub. Step execution still happens; we just don't persist the trace.
            // If/when MF_WorkflowSteps table is added, plug in real EF here.
        }

        // ══════════════════════════════════════════════════════════════════
        //  AUDIT LOG  (in-memory stub — no MF_AuditLogs table)
        // ══════════════════════════════════════════════════════════════════
        public void InsertAuditLog(AuditLogInfo log)
        {
            if (log == null) return;
            log.Timestamp = log.Timestamp == default ? DateTime.UtcNow : log.Timestamp;
            lock (_auditLock)
            {
                log.LogId = System.Threading.Interlocked.Increment(ref _auditLogIdCounter);
                _auditLogStub.Add(log);
                // bound memory — keep only the most recent 1000 entries
                if (_auditLogStub.Count > 1000) _auditLogStub.RemoveRange(0, _auditLogStub.Count - 1000);
            }
        }

        // ══════════════════════════════════════════════════════════════════
        //  UNIQUE ID  (in-memory stub — no MF_UniqueIdCounters table)
        //  Counters reset on app restart. For production use, add a real table.
        // ══════════════════════════════════════════════════════════════════
        public long IncrementUniqueId(int formId, string fieldKey, long startValue)
        {
            var key = formId + "|" + (fieldKey ?? "");
            return _uniqueIdCounters.AddOrUpdate(key, startValue, (_, current) => current + 1);
        }

        public long GetUniqueIdCounter(int formId, string fieldKey)
        {
            var key = formId + "|" + (fieldKey ?? "");
            return _uniqueIdCounters.TryGetValue(key, out var v) ? v : 0;
        }

        // ══════════════════════════════════════════════════════════════════
        //  WEBHOOK LOG  (real EF — table MF_WebhookLog exists)
        // ══════════════════════════════════════════════════════════════════
        public void InsertWebhookLog(WebhookLogInfo log)
        {
            if (log == null) return;
            using var db = _dbContextFactory.CreateDbContext();
            // [OQ-difix20260418-08] MF_WebhookLog NOT NULL: WebhookUrl, RequestBody,
            // ResponseBody.
            NullStringNormalizer.Normalize(log);
            db.WebhookLogs.Add(log);
            db.SaveChanges();
        }

        // ══════════════════════════════════════════════════════════════════
        //  RATE LIMIT  (in-memory stub — no MF_RateLimits table)
        //  Sliding-window counter, expires entries beyond the window on read.
        // ══════════════════════════════════════════════════════════════════
        public int GetRecentSubmissionCount(string ipAddress, int windowMinutes)
        {
            if (string.IsNullOrWhiteSpace(ipAddress) || windowMinutes <= 0) return 0;
            var cutoff = DateTime.UtcNow.AddMinutes(-windowMinutes);
            int total = 0;
            foreach (var kv in _rateLimitBuckets)
            {
                // key format ip|formId — only count for this ip
                if (!kv.Key.StartsWith(ipAddress + "|", StringComparison.Ordinal)) continue;
                foreach (var ts in kv.Value)
                {
                    if (ts >= cutoff) total++;
                }
            }
            return total;
        }

        public void InsertRateLimitEntry(string ipAddress, int formId)
        {
            if (string.IsNullOrWhiteSpace(ipAddress)) return;
            var key = ipAddress + "|" + formId;
            var bag = _rateLimitBuckets.GetOrAdd(key, _ => new ConcurrentBag<DateTime>());
            bag.Add(DateTime.UtcNow);
        }

        private static void NormalizeAppDefinition(AppDefinitionInfo app)
        {
            NullStringNormalizer.Normalize(app);
            app.AppKey = NormalizeKey(app.AppKey, app.AppName, app.AppScope);
            app.AppScope = NormalizeScope(app.AppScope, app.AppKey);
            if (string.IsNullOrWhiteSpace(app.AppName))
                app.AppName = app.AppKey;
        }

        private static void NormalizeAppQuery(AppQueryDefinitionInfo query)
        {
            NullStringNormalizer.Normalize(query);
            query.QueryKey = NormalizeKey(query.QueryKey, query.QueryName);
            if (string.IsNullOrWhiteSpace(query.QueryType))
                query.QueryType = "submissions";
            if (string.IsNullOrWhiteSpace(query.QueryName))
                query.QueryName = query.QueryKey;
        }

        private static void NormalizeFormRelation(FormRelationInfo relation)
        {
            NullStringNormalizer.Normalize(relation);
            relation.RelationType = string.IsNullOrWhiteSpace(relation.RelationType) ? "has_many" : relation.RelationType.Trim();
            relation.ParentKey = string.IsNullOrWhiteSpace(relation.ParentKey) ? "SubmissionId" : relation.ParentKey.Trim();
        }

        private static string NormalizeScope(params string[] candidates)
        {
            foreach (var candidate in candidates ?? Array.Empty<string>())
            {
                var normalized = NormalizeKey(candidate);
                if (!string.IsNullOrWhiteSpace(normalized))
                    return normalized;
            }

            return "generic";
        }

        private static string NormalizeKey(params string[] candidates)
        {
            foreach (var candidate in candidates ?? Array.Empty<string>())
            {
                var value = (candidate ?? string.Empty).Trim().ToLowerInvariant();
                if (value.Length == 0) continue;
                value = Regex.Replace(value, @"[^a-z0-9]+", "-");
                value = value.Trim('-');
                if (value.Length > 0) return value;
            }

            return string.Empty;
        }
    }
}
