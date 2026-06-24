using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Canonical app-definition facade shared across hosts.
    /// Groups forms, views, queries, settings, and resources under one
    /// reusable app package without pulling in 2sxc's full entity stack.
    /// </summary>
    public class AppDefinitionService
    {
        private static readonly Regex KeyPattern = new Regex(@"[^a-z0-9]+", RegexOptions.Compiled);

        private readonly IPhase2Repository _phase2;
        private readonly IFormRepository _forms;
        private readonly AppProfileService _profiles;

        public AppDefinitionService(
            IPhase2Repository phase2,
            IFormRepository forms,
            AppProfileService profiles = null)
        {
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _profiles = profiles ?? new AppProfileService();
        }

        public List<AppDefinitionInfo> List(int portalId, string appScope = null)
        {
            return _phase2.ListAppDefinitions(portalId, NormalizeScope(appScope)) ?? new List<AppDefinitionInfo>();
        }

        public AppDefinitionBundle Get(int portalId, string appKey, bool hydrateManifest = true)
        {
            var app = _phase2.GetAppDefinition(portalId, NormalizeKey(appKey));
            return BuildBundle(app, hydrateManifest);
        }

        public AppDefinitionBundle GetByScope(int portalId, string appScope, bool hydrateManifest = true)
        {
            var normalizedScope = NormalizeScope(appScope);
            if (string.IsNullOrWhiteSpace(normalizedScope))
                return null;

            var app = (_phase2.ListAppDefinitions(portalId, normalizedScope) ?? new List<AppDefinitionInfo>())
                .OrderByDescending(a => a.IsEnabled)
                .ThenBy(a => a.SortOrder)
                .ThenBy(a => a.AppId)
                .FirstOrDefault(a => string.Equals(NormalizeScope(a.AppScope), normalizedScope, StringComparison.OrdinalIgnoreCase));

            return BuildBundle(app, hydrateManifest);
        }

        public int Save(AppDefinitionInfo app, AppManifestDefinition manifest = null)
        {
            if (app == null) throw new ArgumentNullException(nameof(app));

            NormalizeForSave(app);
            var effectiveManifest = manifest ?? ParseManifest(app.ManifestJson);
            ApplyManifestDefaults(app, effectiveManifest);
            app.ManifestJson = SerializeManifest(effectiveManifest);

            if (string.IsNullOrWhiteSpace(app.SettingsJson)) app.SettingsJson = "{}";
            if (string.IsNullOrWhiteSpace(app.ResourcesJson)) app.ResourcesJson = "{}";
            if (app.CreatedOnUtc == default(DateTime)) app.CreatedOnUtc = DateTime.UtcNow;
            app.ModifiedOnUtc = DateTime.UtcNow;

            return _phase2.SaveAppDefinition(app);
        }

        public void Delete(int appId)
        {
            _phase2.DeleteAppDefinition(appId);
        }

        public AppManifestDefinition ParseManifest(string rawJson)
        {
            if (string.IsNullOrWhiteSpace(rawJson))
                return new AppManifestDefinition();

            try
            {
                return JsonConvert.DeserializeObject<AppManifestDefinition>(rawJson) ?? new AppManifestDefinition();
            }
            catch
            {
                return new AppManifestDefinition();
            }
        }

        public string SerializeManifest(AppManifestDefinition manifest)
        {
            return JsonConvert.SerializeObject(manifest ?? new AppManifestDefinition());
        }

        private AppDefinitionBundle BuildBundle(AppDefinitionInfo app, bool hydrateManifest)
        {
            if (app == null)
                return null;

            var forms = GetFormsForScope(app.PortalId, app.AppScope);
            var views = new List<FormViewInfo>();
            foreach (var form in forms)
            {
                views.AddRange(_phase2.GetFormViews(form.FormId) ?? new List<FormViewInfo>());
            }

            var queries = _phase2.ListAppQueries(app.AppId) ?? new List<AppQueryDefinitionInfo>();
            var manifest = hydrateManifest
                ? BuildManifest(app, forms, views, queries)
                : ParseManifest(app.ManifestJson);

            return new AppDefinitionBundle
            {
                App = app,
                Manifest = manifest,
                Forms = forms,
                Views = views,
                Queries = queries
            };
        }

        private AppManifestDefinition BuildManifest(
            AppDefinitionInfo app,
            List<FormInfo> forms,
            List<FormViewInfo> views,
            List<AppQueryDefinitionInfo> queries)
        {
            var manifest = ParseManifest(app.ManifestJson);
            ApplyManifestDefaults(app, manifest);

            var existingForms = (manifest.Forms ?? new List<AppManifestFormRef>())
                .Where(x => x != null)
                .ToDictionary(x => x.FormId, x => x);
            var existingViews = (manifest.Views ?? new List<AppManifestViewRef>())
                .Where(x => x != null && x.FormId > 0 && !string.IsNullOrWhiteSpace(x.ViewKey))
                .ToDictionary(x => x.FormId + "|" + NormalizeKey(x.ViewKey), x => x, StringComparer.OrdinalIgnoreCase);
            var existingQueries = (manifest.Queries ?? new List<AppManifestQueryRef>())
                .Where(x => x != null && !string.IsNullOrWhiteSpace(x.QueryKey))
                .ToDictionary(x => NormalizeKey(x.QueryKey), x => x, StringComparer.OrdinalIgnoreCase);

            var orderedForms = forms
                .OrderByDescending(f => existingForms.TryGetValue(f.FormId, out var existing) && existing.IsPrimary)
                .ThenBy(f => f.Title)
                .ThenBy(f => f.FormId)
                .ToList();

            manifest.Forms = orderedForms
                .Select((form, index) =>
                {
                    existingForms.TryGetValue(form.FormId, out var existing);
                    return new AppManifestFormRef
                    {
                        FormId = form.FormId,
                        Alias = !string.IsNullOrWhiteSpace(existing?.Alias) ? existing.Alias : BuildAlias(form.Title, "form-" + form.FormId),
                        Role = !string.IsNullOrWhiteSpace(existing?.Role) ? existing.Role : (index == 0 ? "primary" : "supporting"),
                        Title = !string.IsNullOrWhiteSpace(existing?.Title) ? existing.Title : (form.Title ?? string.Empty),
                        IsPrimary = existing != null ? existing.IsPrimary : index == 0
                    };
                })
                .ToList();

            manifest.Views = (views ?? new List<FormViewInfo>())
                .OrderBy(v => v.FormId)
                .ThenBy(v => v.SortOrder)
                .ThenBy(v => v.ViewId)
                .Select(view =>
                {
                    existingViews.TryGetValue(view.FormId + "|" + NormalizeKey(view.ViewKey), out var existing);
                    return new AppManifestViewRef
                    {
                        FormId = view.FormId,
                        ViewId = view.ViewId,
                        ViewKey = view.ViewKey ?? string.Empty,
                        ViewType = view.ViewType ?? string.Empty,
                        Alias = !string.IsNullOrWhiteSpace(existing?.Alias) ? existing.Alias : BuildAlias(view.ViewName, view.ViewKey),
                        QueryKey = !string.IsNullOrWhiteSpace(view.QueryKey) ? view.QueryKey : (existing?.QueryKey ?? string.Empty),
                        IsDefault = view.IsDefault
                    };
                })
                .ToList();

            manifest.Queries = (queries ?? new List<AppQueryDefinitionInfo>())
                .OrderBy(q => q.SortOrder)
                .ThenBy(q => q.QueryName)
                .ThenBy(q => q.QueryId)
                .Select(query =>
                {
                    existingQueries.TryGetValue(NormalizeKey(query.QueryKey), out var existing);
                    return new AppManifestQueryRef
                    {
                        QueryId = query.QueryId,
                        FormId = query.FormId,
                        QueryKey = query.QueryKey ?? string.Empty,
                        QueryType = query.QueryType ?? string.Empty,
                        Alias = !string.IsNullOrWhiteSpace(existing?.Alias) ? existing.Alias : BuildAlias(query.QueryName, query.QueryKey)
                    };
                })
                .ToList();

            return manifest;
        }

        private void ApplyManifestDefaults(AppDefinitionInfo app, AppManifestDefinition manifest)
        {
            manifest.Profile = manifest.Profile ?? new AppProfileDefinition();
            manifest.Forms = manifest.Forms ?? new List<AppManifestFormRef>();
            manifest.Views = manifest.Views ?? new List<AppManifestViewRef>();
            manifest.Queries = manifest.Queries ?? new List<AppManifestQueryRef>();
            manifest.Settings = manifest.Settings ?? new Dictionary<string, string>();
            manifest.Resources = manifest.Resources ?? new Dictionary<string, string>();

            manifest.Profile.Scope = string.IsNullOrWhiteSpace(manifest.Profile.Scope)
                ? NormalizeScope(app.AppScope)
                : NormalizeScope(manifest.Profile.Scope);
            manifest.Profile.DisplayName = FirstNonEmpty(manifest.Profile.DisplayName, app.AppName, BuildDisplayName(app.AppScope));
            manifest.Profile.EntitySingular = FirstNonEmpty(manifest.Profile.EntitySingular, "Record");
            manifest.Profile.EntityPlural = FirstNonEmpty(manifest.Profile.EntityPlural, manifest.Profile.EntitySingular + "s");

            var primaryForm = GetFormsForScope(app.PortalId, app.AppScope)
                .OrderBy(f => f.FormId)
                .FirstOrDefault();
            if (primaryForm != null)
            {
                var projection = _profiles.Resolve(primaryForm, null);
                manifest.Profile.Scope = FirstNonEmpty(manifest.Profile.Scope, projection.Profile.Scope);
                manifest.Profile.DisplayName = FirstNonEmpty(manifest.Profile.DisplayName, projection.Profile.DisplayName);
                manifest.Profile.EntitySingular = FirstNonEmpty(manifest.Profile.EntitySingular, projection.Profile.EntitySingular);
                manifest.Profile.EntityPlural = FirstNonEmpty(manifest.Profile.EntityPlural, projection.Profile.EntityPlural);
            }
        }

        private void NormalizeForSave(AppDefinitionInfo app)
        {
            app.AppKey = NormalizeKey(string.IsNullOrWhiteSpace(app.AppKey) ? app.AppName : app.AppKey);
            app.AppScope = NormalizeScope(string.IsNullOrWhiteSpace(app.AppScope) ? app.AppKey : app.AppScope);
            app.AppName = (app.AppName ?? string.Empty).Trim();
            app.Description = (app.Description ?? string.Empty).Trim();
            app.Icon = (app.Icon ?? string.Empty).Trim();
            app.AccentColor = (app.AccentColor ?? string.Empty).Trim();
            app.SortOrder = Math.Max(0, app.SortOrder);

            if (string.IsNullOrWhiteSpace(app.AppName))
                app.AppName = BuildDisplayName(app.AppScope);
            if (string.IsNullOrWhiteSpace(app.AppKey))
                app.AppKey = NormalizeKey(app.AppName);
            if (string.IsNullOrWhiteSpace(app.AppScope))
                app.AppScope = app.AppKey;
        }

        private List<FormInfo> GetFormsForScope(int portalId, string appScope)
        {
            // [DnnPortalIdZero v20260519-04] DNN's default portal is PortalId=0
            // (host portal) and that is a valid context. Only reject negative ids.
            var scope = NormalizeScope(appScope);
            if (portalId < 0 || string.IsNullOrWhiteSpace(scope))
                return new List<FormInfo>();

            return (_forms.ListForms(portalId, pageSize: 0) ?? new List<FormInfo>())
                .Where(f => string.Equals(NormalizeScope(f.AppScope), scope, StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => f.Title)
                .ThenBy(f => f.FormId)
                .ToList();
        }

        private static string BuildDisplayName(string scope)
        {
            var normalized = NormalizeScope(scope);
            if (string.IsNullOrWhiteSpace(normalized))
                return "Business App";

            return string.Join(" ", normalized
                .Split(new[] { '-' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(part => char.ToUpperInvariant(part[0]) + part.Substring(1)));
        }

        private static string BuildAlias(string preferred, string fallback)
        {
            var alias = NormalizeKey(preferred);
            if (!string.IsNullOrWhiteSpace(alias)) return alias;
            return NormalizeKey(fallback);
        }

        private static string NormalizeKey(string value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            normalized = KeyPattern.Replace(normalized, "-").Trim('-');
            return normalized.Length > 80 ? normalized.Substring(0, 80).Trim('-') : normalized;
        }

        private static string NormalizeScope(string value)
        {
            return NormalizeKey(value);
        }

        private static string FirstNonEmpty(params string[] values)
        {
            return values?.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;
        }
    }
}
