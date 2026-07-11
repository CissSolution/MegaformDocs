// ============================================================
// MegaForm Core - Configured App Starter Engine
// ------------------------------------------------------------
// Generic provisioner for app-builder templates. Business apps
// such as Blog live as definitions (schema/query/view/workflow/
// sample data) instead of one service class per app.
// ============================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using MegaForm.Core.ViewModes;
using MegaForm.Core.Workflow;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services.Starters
{
    public sealed class ConfiguredAppStarterResult
    {
        public int AppId { get; set; }
        public string AppKey { get; set; } = string.Empty;
        public string AppScope { get; set; } = string.Empty;
        public int FormId { get; set; }
        public string FormTitle { get; set; } = string.Empty;
        public string DefaultViewKey { get; set; } = string.Empty;
        public string SubmitUrl { get; set; } = string.Empty;
        public string InboxUrl { get; set; } = string.Empty;
        public string BoardUrl { get; set; } = string.Empty;
        public string ArchiveUrl { get; set; } = string.Empty;
        public string ScheduledUrl { get; set; } = string.Empty;
        public string CardUrl { get; set; } = string.Empty;
        public List<string> ViewKeys { get; set; } = new List<string>();
        public List<StarterCredentialInfo> Credentials { get; set; } = new List<StarterCredentialInfo>();
        public Dictionary<string, int> SampleStatusCounts { get; set; } = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class ConfiguredAppStarterService
    {
        private const string RegisteredUsersRole = "Registered Users";

        private readonly IFormRepository _forms;
        private readonly ISubmissionRepository _submissions;
        private readonly IPhase2Repository _phase2;
        private readonly IWorkflowRepository _workflowRepo;
        private readonly WorkflowTaskService _workflowTasks;
        private readonly SubmissionProcessor _submissionProcessor;
        private readonly AppDefinitionService _apps;
        private readonly AppQueryRegistryService _queries;
        private readonly IWorkflowIdentityProvisioningService _identityProvisioning;
        private readonly IStarterPlatformAdapter _platform;
        private readonly ILogService _log;

#pragma warning disable CS8625
        public ConfiguredAppStarterService(
            IFormRepository forms,
            ISubmissionRepository submissions,
            IPhase2Repository phase2,
            IWorkflowRepository workflowRepo,
            WorkflowTaskService workflowTasks,
            SubmissionProcessor submissionProcessor,
            AppDefinitionService apps,
            AppQueryRegistryService queries,
            IWorkflowIdentityProvisioningService identityProvisioning,
            IStarterPlatformAdapter platform,
            ILogService log = null)
        {
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _submissions = submissions ?? throw new ArgumentNullException(nameof(submissions));
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _workflowRepo = workflowRepo ?? throw new ArgumentNullException(nameof(workflowRepo));
            _workflowTasks = workflowTasks ?? throw new ArgumentNullException(nameof(workflowTasks));
            _submissionProcessor = submissionProcessor ?? throw new ArgumentNullException(nameof(submissionProcessor));
            _apps = apps ?? throw new ArgumentNullException(nameof(apps));
            _queries = queries ?? throw new ArgumentNullException(nameof(queries));
            _identityProvisioning = identityProvisioning ?? throw new ArgumentNullException(nameof(identityProvisioning));
            _platform = platform ?? throw new ArgumentNullException(nameof(platform));
            _log = log;
        }
#pragma warning restore CS8625

        public ConfiguredAppStarterResult EnsureStarter(string starterKey, int portalId, int moduleId, string homeUrl, UserContext actor)
        {
            if (portalId < 0)
                throw new InvalidOperationException("portalId/siteId is required.");

            var definition = ConfiguredAppStarterDefinitions.Get(starterKey);
            if (definition == null)
                throw new InvalidOperationException("Unknown configured starter app.");

            actor = actor ?? new UserContext();
            var app = EnsureAppDefinition(definition, portalId, actor);
            var formId = EnsureStarterForm(definition, portalId, moduleId, actor);
            var formIds = EnsureRelatedForms(definition, portalId, moduleId, actor, formId);
            EnsureRelations(definition, formIds);
            EnsureQueries(definition, portalId, app.AppKey, formId, actor);
            EnsureViews(definition, formId, formIds);
            EnsurePermissions(definition, formId);
            EnsureRelatedFormPermissions(definition, formIds);
            ApplyWorkflow(definition, formId);

            ResetRuntimeData(definition, formIds);

            var users = new Dictionary<string, StarterSeedUser>(StringComparer.OrdinalIgnoreCase);
            foreach (var role in definition.Roles)
                users[role.RoleName] = EnsureUser(portalId, role, actor, definition.Key);

            var seeded = new Dictionary<string, List<AppStarterSeededSubmission>>(StringComparer.OrdinalIgnoreCase);
            seeded[definition.PrimaryFormKey] = SeedSamples(definition, definition.PrimaryFormKey, formId, users);
            foreach (var related in definition.RelatedForms)
            {
                var relatedFormId = formIds.ContainsKey(related.FormKey) ? formIds[related.FormKey] : 0;
                if (relatedFormId <= 0)
                    continue;

                seeded[related.FormKey] = SeedSamples(definition, related.FormKey, relatedFormId, users, related.Samples);
                SeedChildSamples(definition, related, relatedFormId, users, seeded, formIds);
            }

            ReconcileSubmissionLinks(definition, formIds);

            return new ConfiguredAppStarterResult
            {
                AppId = app.AppId,
                AppKey = app.AppKey,
                AppScope = app.AppScope,
                FormId = formId,
                FormTitle = definition.FormTitle,
                DefaultViewKey = definition.DefaultViewKey,
                SubmitUrl = BuildUrl(homeUrl, "?view=form"),
                InboxUrl = BuildUrl(homeUrl, "?mfpanel=inbox"),
                BoardUrl = BuildUrl(homeUrl, "?vk=" + definition.BoardViewKey),
                ArchiveUrl = BuildUrl(homeUrl, "?vk=" + definition.ArchiveViewKey),
                ScheduledUrl = BuildUrl(homeUrl, "?vk=" + definition.ScheduledViewKey),
                CardUrl = BuildUrl(homeUrl, "?vk=" + definition.CardViewKey),
                ViewKeys = definition.Views.Select(v => v.ViewKey).ToList(),
                Credentials = users.Values.Select(u => ToCredential(u, u.RoleName)).ToList(),
                SampleStatusCounts = GetSampleStatusCounts(formIds, definition.PrimaryFormKey)
            };
        }

        private AppDefinitionInfo EnsureAppDefinition(AppStarterDefinition definition, int portalId, UserContext actor)
        {
            var bundle = _apps.GetByScope(portalId, definition.AppScope, hydrateManifest: false);
            var app = bundle?.App ?? new AppDefinitionInfo();
            app.PortalId = portalId;
            app.AppKey = definition.AppKey;
            app.AppName = definition.AppName;
            app.Description = definition.AppDescription;
            app.AppScope = definition.AppScope;
            app.Icon = definition.Icon;
            app.AccentColor = definition.AccentColor;
            app.IsEnabled = true;
            app.SortOrder = definition.SortOrder;
            app.CreatedByUserId = app.CreatedByUserId > 0 ? app.CreatedByUserId : actor.UserId;
            app.ModifiedByUserId = actor.UserId;
            app.SettingsJson = JsonConvert.SerializeObject(definition.AppSettings);
            app.ResourcesJson = JsonConvert.SerializeObject(definition.Resources);

            var manifest = new AppManifestDefinition
            {
                Profile = definition.Profile,
                Settings = definition.AppSettings.ToDictionary(x => x.Key, x => Convert.ToString(x.Value) ?? string.Empty, StringComparer.OrdinalIgnoreCase),
                Resources = definition.Resources
            };

            _apps.Save(app, manifest);
            return _apps.Get(portalId, definition.AppKey, hydrateManifest: false)?.App ?? app;
        }

        private int EnsureStarterForm(AppStarterDefinition definition, int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, definition.AppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, definition.FormTitle, StringComparison.OrdinalIgnoreCase));

            var form = existing ?? new FormInfo();
            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = definition.FormTitle;
            form.Description = definition.FormDescription;
            form.SchemaJson = JsonConvert.SerializeObject(definition.SchemaFactory());
            form.SettingsJson = JsonConvert.SerializeObject(definition.FormSettings);
            form.Status = "Published";
            form.SubmitButtonText = definition.SubmitButtonText;
            form.SuccessMessage = definition.SuccessMessage;
            form.RequireAuth = definition.RequireAuth;
            form.EnableCaptcha = false;
            form.EnableSaveResume = definition.EnableSaveResume;
            form.AppScope = definition.AppScope;
            form.CreatedByUserId = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson = form.ThemeJson ?? string.Empty;
            form.NotifyEmails = string.Empty;
            form.WebhookUrl = string.Empty;
            form.WebhookSecret = string.Empty;
            form.WebhookHeaders = string.Empty;
            form.AutoresponderEnabled = false;
            form.AutoresponderEmailField = string.Empty;
            form.AutoresponderSubject = string.Empty;
            form.AutoresponderBody = string.Empty;
            return _forms.SaveForm(form);
        }

        private Dictionary<string, int> EnsureRelatedForms(AppStarterDefinition definition, int portalId, int moduleId, UserContext actor, int primaryFormId)
        {
            var formIds = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                [definition.PrimaryFormKey] = primaryFormId
            };

            foreach (var related in definition.RelatedForms)
            {
                if (related == null || string.IsNullOrWhiteSpace(related.FormKey))
                    continue;

                formIds[related.FormKey] = EnsureRelatedForm(definition, related, portalId, moduleId, actor);
            }

            return formIds;
        }

        private int EnsureRelatedForm(AppStarterDefinition definition, AppStarterRelatedFormDefinition related, int portalId, int moduleId, UserContext actor)
        {
            var existing = (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .FirstOrDefault(f => f != null
                    && string.Equals(f.AppScope ?? string.Empty, definition.AppScope, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(f.Title ?? string.Empty, related.FormTitle, StringComparison.OrdinalIgnoreCase));

            var form = existing ?? new FormInfo();
            form.ModuleId = moduleId;
            form.PortalId = portalId;
            form.Title = related.FormTitle;
            form.Description = related.FormDescription;
            form.SchemaJson = JsonConvert.SerializeObject(related.SchemaFactory());
            form.SettingsJson = JsonConvert.SerializeObject(related.FormSettings);
            form.Status = "Published";
            form.SubmitButtonText = related.SubmitButtonText;
            form.SuccessMessage = related.SuccessMessage;
            form.RequireAuth = related.RequireAuth;
            form.EnableCaptcha = false;
            form.EnableSaveResume = related.EnableSaveResume;
            form.AppScope = definition.AppScope;
            form.CreatedByUserId = form.CreatedByUserId > 0 ? form.CreatedByUserId : actor.UserId;
            form.ThemeJson = form.ThemeJson ?? string.Empty;
            form.NotifyEmails = string.Empty;
            form.WebhookUrl = string.Empty;
            form.WebhookSecret = string.Empty;
            form.WebhookHeaders = string.Empty;
            form.AutoresponderEnabled = false;
            form.AutoresponderEmailField = string.Empty;
            form.AutoresponderSubject = string.Empty;
            form.AutoresponderBody = string.Empty;
            return _forms.SaveForm(form);
        }

        private void EnsureRelations(AppStarterDefinition definition, Dictionary<string, int> formIds)
        {
            foreach (var relationDef in definition.Relations)
            {
                if (relationDef == null)
                    continue;
                if (!formIds.TryGetValue(relationDef.ParentFormKey, out var parentFormId) || parentFormId <= 0)
                    continue;
                if (!formIds.TryGetValue(relationDef.ChildFormKey, out var childFormId) || childFormId <= 0)
                    continue;

                var existing = (_phase2.GetFormRelations(parentFormId) ?? new List<FormRelationInfo>())
                    .FirstOrDefault(r =>
                        r.ParentFormId == parentFormId &&
                        r.ChildFormId == childFormId &&
                        string.Equals(r.ForeignKey ?? string.Empty, relationDef.ForeignKey ?? string.Empty, StringComparison.OrdinalIgnoreCase) &&
                        string.Equals(r.ParentKey ?? string.Empty, relationDef.ParentKey ?? string.Empty, StringComparison.OrdinalIgnoreCase));

                var relation = existing ?? new FormRelationInfo();
                relation.ParentFormId = parentFormId;
                relation.ChildFormId = childFormId;
                relation.RelationType = string.IsNullOrWhiteSpace(relationDef.RelationType) ? "has_many" : relationDef.RelationType;
                relation.ForeignKey = relationDef.ForeignKey;
                relation.ParentKey = string.IsNullOrWhiteSpace(relationDef.ParentKey) ? "SubmissionId" : relationDef.ParentKey;
                relation.Label = relationDef.Label;
                relation.CascadeDelete = relationDef.CascadeDelete;
                _phase2.SaveFormRelation(relation);
            }
        }

        private void EnsureQueries(AppStarterDefinition definition, int portalId, string appKey, int formId, UserContext actor)
        {
            foreach (var item in definition.Queries)
            {
                var query = new AppQueryDefinitionInfo
                {
                    FormId = formId,
                    QueryKey = item.QueryKey,
                    QueryName = item.QueryName,
                    Description = item.Description,
                    QueryType = "submissions",
                    DefinitionJson = JsonConvert.SerializeObject(item.Definition),
                    IsSystem = true,
                    SortOrder = item.SortOrder,
                    CreatedByUserId = actor.UserId,
                    ModifiedByUserId = actor.UserId
                };

                var existing = _queries.Get(portalId, appKey, query.QueryKey);
                if (existing != null)
                {
                    query.QueryId = existing.QueryId;
                    query.AppId = existing.AppId;
                    query.CreatedByUserId = existing.CreatedByUserId;
                    query.CreatedOnUtc = existing.CreatedOnUtc;
                }
                _queries.Save(portalId, appKey, query);
            }
        }

        private void EnsureViews(AppStarterDefinition definition, int formId, Dictionary<string, int> formIds)
        {
            var existing = _phase2.GetFormViews(formId) ?? new List<FormViewInfo>();
            foreach (var viewDef in definition.Views)
            {
                var view = viewDef.Build(formId, formIds);
                var match = existing.FirstOrDefault(v => string.Equals(v.ViewKey ?? string.Empty, view.ViewKey ?? string.Empty, StringComparison.OrdinalIgnoreCase));
                if (match != null)
                {
                    view.ViewId = match.ViewId;
                    view.CreatedOnUtc = match.CreatedOnUtc == default(DateTime) ? DateTime.UtcNow : match.CreatedOnUtc;
                }
                _phase2.SaveFormView(view);
            }
        }

        private void EnsurePermissions(AppStarterDefinition definition, int formId)
        {
            var permissions = definition.Permissions.Select(p => new FormPermissionInfo
            {
                FormId = formId,
                PermissionType = p.PermissionType,
                PrincipalType = p.PrincipalType,
                PrincipalId = p.PrincipalId,
                RoleName = p.RoleName,
                UserId = p.UserId,
                Scope = p.Scope,
                IsGranted = p.IsGranted,
                FieldRestrictions = p.FieldRestrictions
            }).ToList();

            _phase2.SaveFormPermissions(formId, permissions);
        }

        private void EnsureRelatedFormPermissions(AppStarterDefinition definition, Dictionary<string, int> formIds)
        {
            foreach (var related in definition.RelatedForms)
            {
                if (related == null || !formIds.TryGetValue(related.FormKey, out var formId) || formId <= 0)
                    continue;

                var source = related.Permissions.Count > 0 ? related.Permissions : definition.Permissions;
                var permissions = source.Select(p => new FormPermissionInfo
                {
                    FormId = formId,
                    PermissionType = p.PermissionType,
                    PrincipalType = p.PrincipalType,
                    PrincipalId = p.PrincipalId,
                    RoleName = p.RoleName,
                    UserId = p.UserId,
                    Scope = p.Scope,
                    IsGranted = p.IsGranted,
                    FieldRestrictions = p.FieldRestrictions
                }).ToList();

                _phase2.SaveFormPermissions(formId, permissions);
            }
        }

        private void ApplyWorkflow(AppStarterDefinition definition, int formId)
        {
            if (definition.WorkflowFactory == null)
                return;

            var workflow = definition.WorkflowFactory(formId);
            if (workflow == null)
                return;

            _workflowRepo.SaveDraft(formId, workflow);
            _workflowRepo.ApplyDraft(formId, definition.Key + "-starter");
        }

        private void ResetRuntimeData(AppStarterDefinition definition, Dictionary<string, int> formIds)
        {
            foreach (var formId in formIds.Values.Distinct())
                _platform.ResetFormRuntimeData(formId);

            foreach (var fieldKey in definition.AttachmentFieldKeys)
                StarterSeedAttachmentFactory.DeleteFieldAttachments(formIds[definition.PrimaryFormKey], fieldKey);

            foreach (var related in definition.RelatedForms)
            {
                if (related == null || !formIds.TryGetValue(related.FormKey, out var relatedFormId))
                    continue;
                foreach (var fieldKey in related.AttachmentFieldKeys)
                    StarterSeedAttachmentFactory.DeleteFieldAttachments(relatedFormId, fieldKey);
            }
        }

        private StarterSeedUser EnsureUser(int portalId, AppStarterRoleDefinition role, UserContext actor, string starterKey)
        {
            try
            {
                _identityProvisioning.EnsureRoleAsync(new WorkflowRoleProvisionRequest
                {
                    PortalId = portalId,
                    RoleName = role.RoleName,
                    Description = "Seeded by MegaForm " + starterKey + " starter.",
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("ensure role '" + role.RoleName + "'", ex, starterKey);
            }

            WorkflowProvisionedUser provisioned;
            try
            {
                provisioned = _identityProvisioning.EnsureUserAsync(new WorkflowUserProvisionRequest
                {
                    PortalId = portalId,
                    UserName = role.UserName,
                    DisplayName = role.DisplayName,
                    Email = role.Email,
                    Password = role.Password,
                    ApproveUser = true,
                    UpdateIfExists = true,
                    GeneratePasswordIfEmpty = true,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("ensure user '" + role.UserName + "'", ex, starterKey);
            }

            try
            {
                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId,
                    UserIdentifier = role.Email,
                    LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = RegisteredUsersRole,
                    AutoCreateRole = false,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();

                _identityProvisioning.AddUserToRoleAsync(new WorkflowUserRoleProvisionRequest
                {
                    PortalId = portalId,
                    UserIdentifier = role.Email,
                    LookupMode = WorkflowUserLookupMode.Email,
                    RoleName = role.RoleName,
                    AutoCreateRole = true,
                    Actor = actor
                }, CancellationToken.None).GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                throw BuildProvisioningException("add user '" + role.UserName + "' to role '" + role.RoleName + "'", ex, starterKey);
            }

            provisioned = NormalizeProvisionedUser(provisioned, role);
            if (provisioned == null || !provisioned.UserId.HasValue || provisioned.UserId.Value <= 0)
                throw new InvalidOperationException("Unable to load starter user '" + role.UserName + "'.");

            return new StarterSeedUser
            {
                UserId = provisioned.UserId.Value,
                UserName = string.IsNullOrWhiteSpace(provisioned.UserName) ? role.UserName : provisioned.UserName,
                DisplayName = string.IsNullOrWhiteSpace(provisioned.DisplayName) ? role.DisplayName : provisioned.DisplayName,
                Email = string.IsNullOrWhiteSpace(provisioned.Email) ? role.Email : provisioned.Email,
                RoleName = role.RoleName,
                Password = !string.IsNullOrWhiteSpace(provisioned.Password) ? provisioned.Password : role.Password
            };
        }

        private WorkflowProvisionedUser NormalizeProvisionedUser(WorkflowProvisionedUser provisioned, AppStarterRoleDefinition role)
        {
            if (provisioned != null && provisioned.UserId.HasValue && provisioned.UserId.Value > 0)
                return provisioned;

            var resolved = _platform.ResolveUserIdByNameOrEmail(role.UserName, role.Email);
            if (resolved <= 0)
                return provisioned ?? new WorkflowProvisionedUser();

            return new WorkflowProvisionedUser
            {
                UserId = resolved,
                UserName = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.UserName) ? provisioned.UserName : role.UserName,
                DisplayName = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.DisplayName) ? provisioned.DisplayName : role.DisplayName,
                Email = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.Email) ? provisioned.Email : role.Email,
                Password = provisioned != null && !string.IsNullOrWhiteSpace(provisioned.Password) ? provisioned.Password : role.Password
            };
        }

        private List<AppStarterSeededSubmission> SeedSamples(
            AppStarterDefinition definition,
            string formKey,
            int formId,
            Dictionary<string, StarterSeedUser> usersByRole,
            IEnumerable<AppStarterSampleRecord> sourceSamples = null)
        {
            var seeded = new List<AppStarterSeededSubmission>();
            var samples = sourceSamples ?? definition.Samples;
            foreach (var sample in samples)
            {
                var user = ResolveSampleUser(usersByRole, sample.AuthorRoleName);
                if (sample.BuildData == null)
                    throw new InvalidOperationException("Configured starter sample is missing a data builder.");

                var data = sample.BuildData(new StarterSeedUserProjection
                {
                    UserId = user.UserId,
                    UserName = user.UserName,
                    DisplayName = user.DisplayName,
                    Email = user.Email,
                    RoleName = user.RoleName
                });
                var attachments = sample.BuildAttachments(formId).Where(a => a != null).ToList();
                foreach (var attachment in attachments)
                    data[attachment.FieldKey] = attachment.ToSubmissionValue();

                if (sample.InsertDirectly)
                {
                    var insertedId = InsertStaticSample(formId, user.UserId, data, sample.FinalStatus, sample.DaysAgo, attachments);
                    seeded.Add(new AppStarterSeededSubmission
                    {
                        FormKey = formKey,
                        SubmissionId = insertedId,
                        Data = LoadSubmissionData(insertedId, data)
                    });
                    continue;
                }

                var submissionId = SubmitWorkflowSample(definition, formId, user.UserId, data, attachments);
                foreach (var approverRole in sample.WorkflowApproverRoleNames)
                {
                    var approver = ResolveSampleUser(usersByRole, approverRole);
                    ClaimIfNeeded(submissionId, approver.ToContext());
                    ApproveTask(submissionId, approver.ToContext(), approverRole + " approved starter sample.");
                }

                if (!string.IsNullOrWhiteSpace(sample.FinalStatus))
                    SetSubmissionStatusAndField(submissionId, sample.FinalStatus);

                if (sample.BackdateOpenTask)
                    BackdateActiveTask(submissionId, Math.Max(1, sample.DaysAgo * 4), Math.Max(1, sample.DaysAgo));

                seeded.Add(new AppStarterSeededSubmission
                {
                    FormKey = formKey,
                    SubmissionId = submissionId,
                    Data = LoadSubmissionData(submissionId, data)
                });
            }

            return seeded;
        }

        private void SeedChildSamples(
            AppStarterDefinition definition,
            AppStarterRelatedFormDefinition related,
            int childFormId,
            Dictionary<string, StarterSeedUser> usersByRole,
            Dictionary<string, List<AppStarterSeededSubmission>> seeded,
            Dictionary<string, int> formIds)
        {
            foreach (var childSample in related.ChildSamples)
            {
                if (childSample == null || string.IsNullOrWhiteSpace(childSample.ParentFormKey))
                    continue;
                if (!seeded.TryGetValue(childSample.ParentFormKey, out var parents) || parents == null)
                    continue;

                var user = ResolveSampleUser(usersByRole, childSample.AuthorRoleName);
                var relation = ResolveRelation(definition, formIds, childSample.ParentFormKey, related.FormKey, childSample.RelationLabel);
                foreach (var parent in parents)
                {
                    var rows = childSample.BuildRows(parent.Data, new StarterSeedUserProjection
                    {
                        UserId = user.UserId,
                        UserName = user.UserName,
                        DisplayName = user.DisplayName,
                        Email = user.Email,
                        RoleName = user.RoleName
                    }) ?? Enumerable.Empty<Dictionary<string, object>>();

                    foreach (var row in rows.Where(r => r != null))
                    {
                        var status = string.IsNullOrWhiteSpace(childSample.FinalStatus) ? "Published" : childSample.FinalStatus;
                        var childId = InsertStaticSample(childFormId, user.UserId, row, status, childSample.DaysAgo, new StarterSeedAttachment[0]);
                        if (!seeded.TryGetValue(related.FormKey, out var childSeeded))
                        {
                            childSeeded = new List<AppStarterSeededSubmission>();
                            seeded[related.FormKey] = childSeeded;
                        }

                        childSeeded.Add(new AppStarterSeededSubmission
                        {
                            FormKey = related.FormKey,
                            SubmissionId = childId,
                            Data = LoadSubmissionData(childId, row)
                        });

                        if (relation != null && relation.RelationId > 0)
                            _phase2.LinkSubmissions(relation.RelationId, parent.SubmissionId, childId);
                    }
                }
            }
        }

        private FormRelationInfo ResolveRelation(AppStarterDefinition definition, Dictionary<string, int> formIds, string parentFormKey, string childFormKey, string relationLabel)
        {
            if (!formIds.TryGetValue(parentFormKey, out var parentFormId) || parentFormId <= 0)
                return null;
            if (!formIds.TryGetValue(childFormKey, out var childFormId) || childFormId <= 0)
                return null;

            var relDef = definition.Relations.FirstOrDefault(r =>
                string.Equals(r.ParentFormKey, parentFormKey, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(r.ChildFormKey, childFormKey, StringComparison.OrdinalIgnoreCase) &&
                (string.IsNullOrWhiteSpace(relationLabel) || string.Equals(r.Label, relationLabel, StringComparison.OrdinalIgnoreCase)));

            var foreignKey = relDef?.ForeignKey ?? string.Empty;
            var parentKey = relDef?.ParentKey ?? string.Empty;
            return (_phase2.GetFormRelations(parentFormId) ?? new List<FormRelationInfo>())
                .FirstOrDefault(r =>
                    r.ParentFormId == parentFormId &&
                    r.ChildFormId == childFormId &&
                    (string.IsNullOrWhiteSpace(foreignKey) || string.Equals(r.ForeignKey ?? string.Empty, foreignKey, StringComparison.OrdinalIgnoreCase)) &&
                    (string.IsNullOrWhiteSpace(parentKey) || string.Equals(r.ParentKey ?? string.Empty, parentKey, StringComparison.OrdinalIgnoreCase)));
        }

        private void ReconcileSubmissionLinks(AppStarterDefinition definition, Dictionary<string, int> formIds)
        {
            foreach (var relationDef in definition.Relations)
            {
                if (relationDef == null)
                    continue;
                var relation = ResolveRelation(definition, formIds, relationDef.ParentFormKey, relationDef.ChildFormKey, relationDef.Label);
                if (relation == null || relation.RelationId <= 0)
                    continue;

                var parentRows = LoadRowsForForm(relation.ParentFormId);
                var childRows = LoadRowsForForm(relation.ChildFormId);
                if (parentRows.Count == 0 || childRows.Count == 0)
                    continue;

                var parentKey = string.IsNullOrWhiteSpace(relation.ParentKey) ? "SubmissionId" : relation.ParentKey;
                var foreignKey = relation.ForeignKey ?? string.Empty;
                foreach (var parent in parentRows)
                {
                    var parentValue = ResolveSubmissionKey(parent, parentKey);
                    if (string.IsNullOrWhiteSpace(parentValue))
                        continue;

                    foreach (var child in childRows)
                    {
                        var childValue = ResolveDataValue(child.Data, foreignKey);
                        if (string.IsNullOrWhiteSpace(childValue))
                            continue;
                        if (string.Equals(parentValue, childValue, StringComparison.OrdinalIgnoreCase))
                            _phase2.LinkSubmissions(relation.RelationId, parent.SubmissionId, child.SubmissionId);
                    }
                }
            }
        }

        private List<AppStarterSeededSubmission> LoadRowsForForm(int formId)
        {
            var page = _submissions.List(formId, pageIndex: 0, pageSize: 2000);
            return (page.Items ?? new List<SubmissionInfo>())
                .Where(s => s != null)
                .Select(s => new AppStarterSeededSubmission
                {
                    SubmissionId = s.SubmissionId,
                    Data = ParseDataJson(s.DataJson)
                })
                .ToList();
        }

        private Dictionary<string, object> ParseDataJson(string dataJson)
        {
            if (string.IsNullOrWhiteSpace(dataJson))
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            try
            {
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(dataJson)
                       ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }
            catch
            {
                return new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            }
        }

        private static string ResolveSubmissionKey(AppStarterSeededSubmission row, string key)
        {
            if (row == null)
                return string.Empty;
            if (string.IsNullOrWhiteSpace(key) ||
                string.Equals(key, "SubmissionId", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(key, "submission:id", StringComparison.OrdinalIgnoreCase))
                return row.SubmissionId.ToString(CultureInfo.InvariantCulture);
            return ResolveDataValue(row.Data, key);
        }

        private static string ResolveDataValue(Dictionary<string, object> data, string key)
        {
            if (data == null || string.IsNullOrWhiteSpace(key))
                return string.Empty;
            if (data.TryGetValue(key, out var value))
                return Convert.ToString(value)?.Trim() ?? string.Empty;
            foreach (var pair in data)
            {
                if (string.Equals(pair.Key, key, StringComparison.OrdinalIgnoreCase))
                    return Convert.ToString(pair.Value)?.Trim() ?? string.Empty;
            }
            return string.Empty;
        }

        private StarterSeedUser ResolveSampleUser(Dictionary<string, StarterSeedUser> usersByRole, string roleName)
        {
            if (!string.IsNullOrWhiteSpace(roleName) && usersByRole.ContainsKey(roleName))
                return usersByRole[roleName];

            foreach (var seededUser in usersByRole.Values)
                return seededUser;

            throw new InvalidOperationException("Configured starter has sample data but no seeded users.");
        }

        private int SubmitWorkflowSample(AppStarterDefinition definition, int formId, int userId, Dictionary<string, object> data, IEnumerable<StarterSeedAttachment> attachments)
        {
            var result = _submissionProcessor.ProcessAsync(
                formId,
                data,
                BuildSeedIpAddress(userId),
                "MegaForm " + definition.Key + " starter",
                userId,
                4.25d).GetAwaiter().GetResult();

            if (!result.Success || result.SubmissionId <= 0)
            {
                var error = result.ErrorMessage ?? "Unknown error";
                if (result.ValidationErrors != null && result.ValidationErrors.Count > 0)
                    error += ": " + string.Join("; ", result.ValidationErrors.Select(pair => pair.Key + "=" + pair.Value));
                throw new InvalidOperationException(definition.AppName + " sample submission failed: " + error);
            }
            if (result.IsSpam)
                throw new InvalidOperationException(definition.AppName + " sample submission " + result.SubmissionId + " was flagged as spam.");

            PersistAttachments(result.SubmissionId, attachments);
            return result.SubmissionId;
        }

        private int InsertStaticSample(int formId, int userId, Dictionary<string, object> data, string status, int daysAgo, IEnumerable<StarterSeedAttachment> attachments)
        {
            data["status"] = status;
            var submission = new SubmissionInfo
            {
                FormId = formId,
                DataJson = JsonConvert.SerializeObject(data),
                IpAddress = BuildSeedIpAddress(userId + Math.Abs(daysAgo)),
                UserAgent = "MegaForm configured app starter",
                UserId = userId,
                Status = status,
                IsSpam = false,
                SpamScore = 4.25m,
                SubmittedOnUtc = DateTime.UtcNow.AddDays(-Math.Abs(daysAgo))
            };

            var submissionId = _submissions.Insert(submission);
            _submissions.InsertValues(submissionId, data.Select(pair => new SubmissionValueInfo
            {
                SubmissionId = submissionId,
                FieldKey = pair.Key,
                FieldValue = SerializeSubmissionValue(pair.Value)
            }).ToList());
            PersistAttachments(submissionId, attachments);
            return submissionId;
        }

        private void PersistAttachments(int submissionId, IEnumerable<StarterSeedAttachment> attachments)
        {
            var list = (attachments ?? new List<StarterSeedAttachment>()).Where(x => x != null).ToList();
            if (submissionId <= 0 || list.Count == 0)
                return;
            _platform.PersistSeededAttachments(submissionId, list);
        }

        private void ClaimIfNeeded(int submissionId, UserContext actor)
        {
            var task = GetOpenTask(submissionId);
            if (task == null || task.Status != WorkflowTaskStatus.Pending)
                return;

            _workflowTasks.ClaimTaskAsync(task.TaskId, actor, "Configured starter sample claim", CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        private void ApproveTask(int submissionId, UserContext actor, string comment)
        {
            var task = GetOpenTask(submissionId);
            if (task == null)
                throw new InvalidOperationException("No open workflow task found for submission " + submissionId + ".");

            _workflowTasks.ApproveTaskAsync(task.TaskId, actor, comment, new Dictionary<string, object>(), CancellationToken.None)
                .GetAwaiter()
                .GetResult();
        }

        private void BackdateActiveTask(int submissionId, int createdHoursAgo, int dueHoursAgo)
        {
            var task = GetOpenTask(submissionId);
            if (task == null)
                return;

            task.CreatedAt = DateTime.UtcNow.AddHours(-Math.Abs(createdHoursAgo));
            task.DueAt = DateTime.UtcNow.AddHours(-Math.Abs(dueHoursAgo));
            _workflowRepo.SaveTask(task);
        }

#pragma warning disable CS8603
        private WorkflowTaskInstance GetOpenTask(int submissionId)
        {
            for (var attempt = 0; attempt < 5; attempt++)
            {
                var items = _workflowRepo.ListTasks(new WorkflowTaskQuery
                {
                    SubmissionId = submissionId,
                    OpenOnly = true,
                    PageIndex = 0,
                    PageSize = 20
                }) ?? new List<WorkflowTaskInstance>();

                var task = items.OrderByDescending(t => t.CreatedAt).FirstOrDefault();
                if (task != null || attempt == 4)
                    return task;

                Thread.Sleep(150);
            }
            return null;
        }
#pragma warning restore CS8603

        private void SetSubmissionStatusAndField(int submissionId, string status)
        {
            if (submissionId <= 0 || string.IsNullOrWhiteSpace(status))
                return;

            _submissions.UpdateStatus(submissionId, status);
            var submission = _submissions.Get(submissionId);
            if (submission == null || string.IsNullOrWhiteSpace(submission.DataJson))
                return;

            try
            {
                var data = JObject.Parse(submission.DataJson);
                data["status"] = status;
                _submissions.UpdateData(submissionId, data.ToString(Newtonsoft.Json.Formatting.None));
            }
            catch { }
        }

        private Dictionary<string, object> LoadSubmissionData(int submissionId, Dictionary<string, object> fallback)
        {
            try
            {
                var submission = _submissions.Get(submissionId);
                if (submission != null && !string.IsNullOrWhiteSpace(submission.DataJson))
                    return JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson)
                           ?? new Dictionary<string, object>(fallback ?? new Dictionary<string, object>(), StringComparer.OrdinalIgnoreCase);
            }
            catch { }

            return new Dictionary<string, object>(fallback ?? new Dictionary<string, object>(), StringComparer.OrdinalIgnoreCase);
        }

        private Dictionary<string, int> GetSampleStatusCounts(Dictionary<string, int> formIds, string primaryFormKey)
        {
            var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var pair in formIds)
                {
                    var page = _submissions.List(pair.Value, pageIndex: 0, pageSize: 1000);
                    foreach (var group in (page.Items ?? new List<SubmissionInfo>())
                        .GroupBy(s => string.IsNullOrWhiteSpace(s.Status) ? "unknown" : s.Status, StringComparer.OrdinalIgnoreCase))
                    {
                        if (string.Equals(pair.Key, primaryFormKey, StringComparison.OrdinalIgnoreCase))
                            counts[group.Key] = group.Count();
                        var key = pair.Key + ":" + group.Key;
                        counts[key] = group.Count();
                    }
                }
                return counts;
            }
            catch
            {
                return counts;
            }
        }

        private Exception BuildProvisioningException(string step, Exception ex, string starterKey)
        {
            var message = starterKey + " starter failed to " + step + ". " + BuildExceptionMessage(ex);
            _log?.LogError(nameof(ConfiguredAppStarterService), message, ex);
            return new InvalidOperationException(message, ex);
        }

        private static string BuildExceptionMessage(Exception ex)
        {
            var parts = new List<string>();
            var cursor = ex;
            while (cursor != null)
            {
                if (!string.IsNullOrWhiteSpace(cursor.Message))
                    parts.Add(cursor.Message.Trim());
                cursor = cursor.InnerException;
            }
            return string.Join(" | ", parts.Distinct(StringComparer.Ordinal));
        }

        private static StarterCredentialInfo ToCredential(StarterSeedUser user, string roleName)
        {
            return new StarterCredentialInfo
            {
                RoleName = roleName,
                UserName = user.UserName,
                DisplayName = user.DisplayName,
                Email = user.Email,
                Password = user.Password
            };
        }

        private static string BuildUrl(string homeUrl, string suffix)
        {
            var baseUrl = (homeUrl ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(baseUrl))
                return suffix ?? string.Empty;
            if (string.IsNullOrWhiteSpace(suffix))
                return baseUrl;

            var clean = baseUrl.Split('#')[0];
            var hash = baseUrl.Contains("#") ? baseUrl.Substring(baseUrl.IndexOf("#", StringComparison.Ordinal)) : string.Empty;
            var separator = clean.Contains("?") ? "&" : "?";
            var next = clean + (suffix.StartsWith("?", StringComparison.Ordinal) ? separator + suffix.Substring(1) : suffix);
            return next + hash;
        }

        private static string BuildSeedIpAddress(int seed)
        {
            var octet = Math.Abs(seed % 200) + 20;
            return "127.0.4." + octet.ToString(CultureInfo.InvariantCulture);
        }

        private static string SerializeSubmissionValue(object value)
        {
            if (value == null)
                return string.Empty;
            if (value is string text)
                return text;
            if (value is DateTime dt)
                return dt.ToString("o", CultureInfo.InvariantCulture);
            return JsonConvert.SerializeObject(value);
        }

        private sealed class StarterSeedUser
        {
            public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string RoleName { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;

            public UserContext ToContext()
            {
                return new UserContext
                {
                    UserId = UserId,
                    UserName = UserName,
                    DisplayName = DisplayName,
                    Email = Email,
                    IsAuthenticated = true,
                    IsAdmin = false,
                    IsSuperUser = false,
                    Roles = new List<string> { RoleName },
                    IpAddress = string.Empty
                };
            }
        }
    }

    public sealed class AppStarterDefinition
    {
        public string Key { get; set; } = string.Empty;
        public string AppScope { get; set; } = string.Empty;
        public string AppKey { get; set; } = string.Empty;
        public string AppName { get; set; } = string.Empty;
        public string AppDescription { get; set; } = string.Empty;
        public string FormTitle { get; set; } = string.Empty;
        public string FormDescription { get; set; } = string.Empty;
        public string Icon { get; set; } = string.Empty;
        public string AccentColor { get; set; } = string.Empty;
        public int SortOrder { get; set; }
        public string DefaultViewKey { get; set; } = string.Empty;
        public string BoardViewKey { get; set; } = string.Empty;
        public string ArchiveViewKey { get; set; } = string.Empty;
        public string ScheduledViewKey { get; set; } = string.Empty;
        public string CardViewKey { get; set; } = string.Empty;
        public string SubmitButtonText { get; set; } = string.Empty;
        public string SuccessMessage { get; set; } = string.Empty;
        public bool RequireAuth { get; set; }
        public bool EnableSaveResume { get; set; }
        public string PrimaryFormKey { get; set; } = "posts";
        public AppProfileDefinition Profile { get; set; } = new AppProfileDefinition();
        public Dictionary<string, object> AppSettings { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, string> Resources { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, object> FormSettings { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Func<FormSchema> SchemaFactory { get; set; } = () => new FormSchema();
        public Func<int, WorkflowDefinition> WorkflowFactory { get; set; } = _ => new WorkflowDefinition();
        public List<string> AttachmentFieldKeys { get; set; } = new List<string>();
        public List<AppStarterRoleDefinition> Roles { get; set; } = new List<AppStarterRoleDefinition>();
        public List<AppStarterQueryDefinition> Queries { get; set; } = new List<AppStarterQueryDefinition>();
        public List<AppStarterViewDefinition> Views { get; set; } = new List<AppStarterViewDefinition>();
        public List<FormPermissionInfo> Permissions { get; set; } = new List<FormPermissionInfo>();
        public List<AppStarterSampleRecord> Samples { get; set; } = new List<AppStarterSampleRecord>();
        public List<AppStarterRelatedFormDefinition> RelatedForms { get; set; } = new List<AppStarterRelatedFormDefinition>();
        public List<AppStarterRelationDefinition> Relations { get; set; } = new List<AppStarterRelationDefinition>();
    }

    public sealed class AppStarterRelatedFormDefinition
    {
        public string FormKey { get; set; } = string.Empty;
        public string FormTitle { get; set; } = string.Empty;
        public string FormDescription { get; set; } = string.Empty;
        public string SubmitButtonText { get; set; } = "Submit";
        public string SuccessMessage { get; set; } = "Saved.";
        public bool RequireAuth { get; set; }
        public bool EnableSaveResume { get; set; }
        public Dictionary<string, object> FormSettings { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public Func<FormSchema> SchemaFactory { get; set; } = () => new FormSchema();
        public List<string> AttachmentFieldKeys { get; set; } = new List<string>();
        public List<FormPermissionInfo> Permissions { get; set; } = new List<FormPermissionInfo>();
        public List<AppStarterSampleRecord> Samples { get; set; } = new List<AppStarterSampleRecord>();
        public List<AppStarterChildSampleRecord> ChildSamples { get; set; } = new List<AppStarterChildSampleRecord>();
    }

    public sealed class AppStarterRelationDefinition
    {
        public string ParentFormKey { get; set; } = string.Empty;
        public string ChildFormKey { get; set; } = string.Empty;
        public string RelationType { get; set; } = "has_many";
        public string ForeignKey { get; set; } = string.Empty;
        public string ParentKey { get; set; } = "SubmissionId";
        public string Label { get; set; } = string.Empty;
        public bool CascadeDelete { get; set; }
    }

    public sealed class AppStarterChildSampleRecord
    {
        public string ParentFormKey { get; set; } = "posts";
        public string RelationLabel { get; set; } = string.Empty;
        public string AuthorRoleName { get; set; } = string.Empty;
        public string FinalStatus { get; set; } = "Published";
        public int DaysAgo { get; set; }
        public Func<Dictionary<string, object>, StarterSeedUserProjection, IEnumerable<Dictionary<string, object>>> BuildRows { get; set; }
            = (_, __) => Enumerable.Empty<Dictionary<string, object>>();
    }

    public sealed class AppStarterSeededSubmission
    {
        public string FormKey { get; set; } = string.Empty;
        public int SubmissionId { get; set; }
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class AppStarterRoleDefinition
    {
        public string RoleName { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public sealed class AppStarterQueryDefinition
    {
        public string QueryKey { get; set; } = string.Empty;
        public string QueryName { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public int SortOrder { get; set; }
        public object Definition { get; set; } = new object();
    }

    public sealed class AppStarterViewDefinition
    {
        public string ViewKey { get; set; } = string.Empty;
        public Func<int, IReadOnlyDictionary<string, int>, FormViewInfo> Build { get; set; } = (_, __) => new FormViewInfo();
    }

    public sealed class AppStarterSampleRecord
    {
        public string AuthorRoleName { get; set; } = string.Empty;
        public string FinalStatus { get; set; } = string.Empty;
        public bool InsertDirectly { get; set; }
        public bool BackdateOpenTask { get; set; }
        public int DaysAgo { get; set; }
        public List<string> WorkflowApproverRoleNames { get; set; } = new List<string>();
        public Func<StarterSeedUserProjection, Dictionary<string, object>> BuildData { get; set; } = _ => new Dictionary<string, object>();
        public Func<int, IEnumerable<StarterSeedAttachment>> BuildAttachments { get; set; } = _ => new List<StarterSeedAttachment>();
    }

    public sealed class StarterSeedUserProjection
    {
        public int UserId { get; set; }
        public string UserName { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string RoleName { get; set; } = string.Empty;
    }
}
