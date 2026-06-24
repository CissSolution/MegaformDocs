using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Canonical named-query registry shared across hosts.
    /// Queries are resolved by app definition + form scope, then bound to
    /// individual views through FormViewInfo.QueryKey.
    /// </summary>
    public class AppQueryRegistryService
    {
        private static readonly Regex KeyPattern = new Regex(@"[^a-z0-9]+", RegexOptions.Compiled);

        private readonly IPhase2Repository _phase2;
        private readonly IFormRepository _forms;
        private readonly AppDefinitionService _apps;

        public AppQueryRegistryService(
            IPhase2Repository phase2,
            IFormRepository forms,
            AppDefinitionService apps)
        {
            _phase2 = phase2 ?? throw new ArgumentNullException(nameof(phase2));
            _forms = forms ?? throw new ArgumentNullException(nameof(forms));
            _apps = apps ?? throw new ArgumentNullException(nameof(apps));
        }

        public List<AppQueryDefinitionInfo> List(int portalId, string appKey)
        {
            var bundle = _apps.Get(portalId, appKey, hydrateManifest: false);
            return bundle?.App == null
                ? new List<AppQueryDefinitionInfo>()
                : (_phase2.ListAppQueries(bundle.App.AppId) ?? new List<AppQueryDefinitionInfo>());
        }

        public List<AppQueryDefinitionInfo> ListForForm(int portalId, int formId)
        {
            var form = _forms.GetForm(formId);
            if (form == null) return new List<AppQueryDefinitionInfo>();
            var bundle = _apps.GetByScope(portalId > 0 ? portalId : form.PortalId, form.AppScope, hydrateManifest: false);
            return bundle?.App == null
                ? new List<AppQueryDefinitionInfo>()
                : (_phase2.ListAppQueries(bundle.App.AppId) ?? new List<AppQueryDefinitionInfo>());
        }

        public AppQueryDefinitionInfo Get(int portalId, string appKey, string queryKey)
        {
            var bundle = _apps.Get(portalId, appKey, hydrateManifest: false);
            return bundle?.App == null ? null : _phase2.GetAppQuery(bundle.App.AppId, NormalizeKey(queryKey));
        }

        public int Save(int portalId, string appKey, AppQueryDefinitionInfo query)
        {
            if (query == null) throw new ArgumentNullException(nameof(query));

            var bundle = _apps.Get(portalId, appKey, hydrateManifest: false);
            if (bundle?.App == null)
                throw new InvalidOperationException("App definition was not found.");

            NormalizeForSave(query);
            query.AppId = bundle.App.AppId;

            if (query.FormId > 0)
            {
                var form = _forms.GetForm(query.FormId);
                if (form == null)
                    throw new InvalidOperationException("Query form was not found.");
                if (form.PortalId != bundle.App.PortalId)
                    throw new InvalidOperationException("Query form does not belong to the same portal as the app.");
            }

            if (query.CreatedOnUtc == default(DateTime)) query.CreatedOnUtc = DateTime.UtcNow;
            query.ModifiedOnUtc = DateTime.UtcNow;
            return _phase2.SaveAppQuery(query);
        }

        public void Delete(int queryId)
        {
            _phase2.DeleteAppQuery(queryId);
        }

        public AppQueryBindingInfo ResolveForView(int portalId, FormInfo form, FormViewInfo view)
        {
            var validation = ValidateBinding(portalId, form, view != null ? view.QueryKey : null);
            return new AppQueryBindingInfo
            {
                HasBinding = validation.IsValid && validation.Query != null,
                AppScope = form != null ? form.AppScope : string.Empty,
                App = validation.App,
                Query = validation.Query,
                Form = form,
                View = view,
                Error = validation.IsValid ? string.Empty : validation.Error
            };
        }

        public AppQueryValidationResult ValidateBinding(int portalId, FormInfo form, string queryKey)
        {
            var normalizedQueryKey = NormalizeKey(queryKey);
            if (string.IsNullOrWhiteSpace(normalizedQueryKey))
            {
                return new AppQueryValidationResult
                {
                    IsValid = true,
                    NormalizedQueryKey = string.Empty
                };
            }

            if (form == null)
            {
                return new AppQueryValidationResult
                {
                    IsValid = false,
                    Error = "Form not found for query binding.",
                    NormalizedQueryKey = normalizedQueryKey
                };
            }

            if (string.IsNullOrWhiteSpace(form.AppScope))
            {
                return new AppQueryValidationResult
                {
                    IsValid = false,
                    Error = "This form is not assigned to an app scope. Clear the bound query or assign an app scope first.",
                    NormalizedQueryKey = normalizedQueryKey
                };
            }

            var bundle = _apps.GetByScope(portalId > 0 ? portalId : form.PortalId, form.AppScope, hydrateManifest: false);
            if (bundle?.App == null)
            {
                return new AppQueryValidationResult
                {
                    IsValid = false,
                    Error = "No app definition exists for this form's app scope.",
                    NormalizedQueryKey = normalizedQueryKey
                };
            }

            var query = _phase2.GetAppQuery(bundle.App.AppId, normalizedQueryKey);
            if (query == null)
            {
                return new AppQueryValidationResult
                {
                    IsValid = false,
                    Error = "Query key \"" + normalizedQueryKey + "\" was not found in this app.",
                    NormalizedQueryKey = normalizedQueryKey,
                    App = bundle.App
                };
            }

            return new AppQueryValidationResult
            {
                IsValid = true,
                NormalizedQueryKey = query.QueryKey ?? normalizedQueryKey,
                App = bundle.App,
                Query = query
            };
        }

        private static void NormalizeForSave(AppQueryDefinitionInfo query)
        {
            query.QueryKey = NormalizeKey(string.IsNullOrWhiteSpace(query.QueryKey) ? query.QueryName : query.QueryKey);
            query.QueryName = (query.QueryName ?? string.Empty).Trim();
            query.Description = (query.Description ?? string.Empty).Trim();
            query.QueryType = string.IsNullOrWhiteSpace(query.QueryType) ? "submissions" : query.QueryType.Trim();
            query.DefinitionJson = string.IsNullOrWhiteSpace(query.DefinitionJson) ? "{}" : query.DefinitionJson;
            query.SortOrder = Math.Max(0, query.SortOrder);

            if (string.IsNullOrWhiteSpace(query.QueryName))
                query.QueryName = query.QueryKey;
        }

        private static string NormalizeKey(string value)
        {
            var normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
            normalized = KeyPattern.Replace(normalized, "-").Trim('-');
            return normalized.Length > 80 ? normalized.Substring(0, 80).Trim('-') : normalized;
        }
    }
}
