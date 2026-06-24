using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.ViewModes
{
    public sealed class FormViewCatalogItem
    {
        public string ViewKey { get; set; } = string.Empty;
        public string QueryKey { get; set; } = string.Empty;
        public string ViewType { get; set; } = string.Empty;
        public string ViewName { get; set; } = string.Empty;
        public bool IsDefault { get; set; }
        public string ConfigJson { get; set; } = "{}";
        public string CustomHtml { get; set; } = string.Empty;
    }

    public sealed class FormViewSelectionResult
    {
        public string ActiveViewType { get; set; }
        public string ActiveViewConfigJson { get; set; } = "{}";
        public string ActiveQueryKey { get; set; } = string.Empty;
        public FormViewInfo MatchedView { get; set; }
        public string MatchedViewKey { get; set; } = string.Empty;
        public bool UsedNamedView { get; set; }
    }

    public sealed class FormViewSaveValidationResult
    {
        public bool IsValid { get; set; }
        public string Error { get; set; } = string.Empty;
        public FormViewInfo View { get; set; }
    }

    public static class FormViewSelector
    {
        private static readonly Regex ViewKeySlugPattern = new Regex(@"[^a-z0-9]+", RegexOptions.Compiled);
        private static readonly string[] UrlAliasViewTypes = new[]
        {
            "form", "list", "card", "listview"
        };
        private static readonly HashSet<string> ReservedViewKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "form", "list", "card", "listview"
        };

        public static string NormalizeViewType(string value)
        {
            var v = (value ?? string.Empty).Trim().ToLowerInvariant();
            if (v == "form" || v == "submit" || v == "edit") return "submit";
            return v;
        }

        public static string MapViewTypeToViewMode(string value)
        {
            var normalized = NormalizeViewType(value);
            if (string.IsNullOrWhiteSpace(normalized) || string.Equals(normalized, "submit", StringComparison.OrdinalIgnoreCase))
                return "form";
            return normalized;
        }

        public static string SlugifyViewKey(string value)
        {
            var slug = (value ?? string.Empty).Trim().ToLowerInvariant();
            slug = ViewKeySlugPattern.Replace(slug, "-").Trim('-');
            return slug.Length > 80 ? slug.Substring(0, 80).Trim('-') : slug;
        }

        public static bool IsReservedViewKey(string value)
        {
            var normalized = SlugifyViewKey(value);
            return normalized.Length > 0 && ReservedViewKeys.Contains(normalized);
        }

        public static bool LooksLikeGenericViewType(string value)
        {
            var raw = (value ?? string.Empty).Trim().ToLowerInvariant();
            return UrlAliasViewTypes.Any(x => string.Equals(x, raw, StringComparison.OrdinalIgnoreCase));
        }

        public static string SanitizeSelectedViewKey(string selectedViewKey, IEnumerable<FormViewInfo> views)
        {
            var requested = SlugifyViewKey(selectedViewKey);
            if (string.IsNullOrWhiteSpace(requested)) return string.Empty;
            return (views ?? Enumerable.Empty<FormViewInfo>())
                .FirstOrDefault(v => string.Equals(SlugifyViewKey(v.ViewKey), requested, StringComparison.OrdinalIgnoreCase))
                ?.ViewKey?.Trim()
                ?? string.Empty;
        }

        public static FormViewSaveValidationResult ValidateAndNormalizeForSave(FormViewInfo view, IEnumerable<FormViewInfo> existingViews)
        {
            if (view == null)
            {
                return new FormViewSaveValidationResult { IsValid = false, Error = "Invalid view payload." };
            }

            var normalized = view;
            normalized.FormId = normalized.FormId > 0 ? normalized.FormId : 0;
            normalized.ViewName = (normalized.ViewName ?? string.Empty).Trim();
            normalized.ViewKey = SlugifyViewKey(string.IsNullOrWhiteSpace(normalized.ViewKey) ? normalized.ViewName : normalized.ViewKey);
            normalized.QueryKey = SlugifyViewKey(normalized.QueryKey);
            normalized.ViewType = NormalizeViewType(normalized.ViewType);
            normalized.SortOrder = Math.Max(0, normalized.SortOrder);
            normalized.ConfigJson = string.IsNullOrWhiteSpace(normalized.ConfigJson) ? "{}" : normalized.ConfigJson;
            normalized.CustomHtml = normalized.CustomHtml ?? string.Empty;
            normalized.CustomCss = normalized.CustomCss ?? string.Empty;
            normalized.PermissionsJson = normalized.PermissionsJson ?? string.Empty;

            if (normalized.FormId <= 0)
            {
                return new FormViewSaveValidationResult { IsValid = false, Error = "formId is required.", View = normalized };
            }

            if (string.IsNullOrWhiteSpace(normalized.ViewName))
            {
                return new FormViewSaveValidationResult { IsValid = false, Error = "View name is required.", View = normalized };
            }

            if (string.IsNullOrWhiteSpace(normalized.ViewKey))
            {
                return new FormViewSaveValidationResult { IsValid = false, Error = "View key is required.", View = normalized };
            }

            if (IsReservedViewKey(normalized.ViewKey))
            {
                return new FormViewSaveValidationResult
                {
                    IsValid = false,
                    Error = "View key is reserved. Use a unique slug that is not form, list, card, or listview.",
                    View = normalized
                };
            }

            if (string.IsNullOrWhiteSpace(normalized.ViewType))
            {
                return new FormViewSaveValidationResult { IsValid = false, Error = "View type is required.", View = normalized };
            }

            var duplicates = (existingViews ?? Enumerable.Empty<FormViewInfo>())
                .Where(v => v != null && v.FormId == normalized.FormId && v.ViewId != normalized.ViewId)
                .Any(v => string.Equals(SlugifyViewKey(v.ViewKey), normalized.ViewKey, StringComparison.OrdinalIgnoreCase));
            if (duplicates)
            {
                return new FormViewSaveValidationResult
                {
                    IsValid = false,
                    Error = $"View key \"{normalized.ViewKey}\" already exists for this form.",
                    View = normalized
                };
            }

            return new FormViewSaveValidationResult
            {
                IsValid = true,
                View = normalized
            };
        }

        public static string ReadSelectedViewKey(string rawJson, string legacyValue = null)
        {
            var obj = ParseObject(rawJson);
            var key = ((string)obj["selectedViewKey"] ?? (string)obj["SelectedViewKey"] ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(key)) return key;
            return (legacyValue ?? string.Empty).Trim();
        }

        public static List<FormViewCatalogItem> ReadViewCatalog(string rawJson)
        {
            var obj = ParseObject(rawJson);
            var token = obj["viewCatalog"] ?? obj["ViewCatalog"];
            if (!(token is JArray arr)) return new List<FormViewCatalogItem>();
            return arr
                .OfType<JObject>()
                .Select(MapCatalogItem)
                .Where(x => !string.IsNullOrWhiteSpace(x.ViewKey))
                .ToList();
        }

        public static string AttachSelectionMetadata(string rawJson, string selectedViewKey, IEnumerable<FormViewInfo> views)
        {
            var obj = ParseObject(rawJson);
            obj["selectedViewKey"] = selectedViewKey ?? string.Empty;
            obj["viewCatalog"] = JArray.FromObject((views ?? Enumerable.Empty<FormViewInfo>()).Select(v => new
            {
                viewKey = v.ViewKey ?? string.Empty,
                queryKey = v.QueryKey ?? string.Empty,
                viewType = v.ViewType ?? string.Empty,
                viewName = v.ViewName ?? string.Empty,
                isDefault = v.IsDefault,
                configJson = v.ConfigJson ?? "{}",
                customHtml = v.CustomHtml ?? string.Empty
            }).ToList());
            return obj.ToString(Newtonsoft.Json.Formatting.None);
        }

        public static FormViewSelectionResult Resolve(
            IEnumerable<FormViewInfo> views,
            string requestedViewParam,
            string requestedViewKey,
            string moduleSelectedViewKey,
            string moduleViewType)
        {
            var list = (views ?? Enumerable.Empty<FormViewInfo>())
                .Where(v => v != null && !string.IsNullOrWhiteSpace(v.ViewKey))
                .OrderByDescending(v => v.IsDefault)
                .ThenBy(v => v.SortOrder)
                .ThenBy(v => v.ViewId)
                .ToList();

            var namedFromVk = FindNamedView(list, requestedViewKey);
            if (namedFromVk != null)
            {
                return BuildNamedSelection(namedFromVk);
            }

            var requested = (requestedViewParam ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(requested) && LooksLikeGenericViewType(requested))
            {
                return BuildGenericSelection(NormalizeViewType(requested));
            }

            var namedFromViewParam = FindNamedView(list, requested);
            if (namedFromViewParam != null)
            {
                return BuildNamedSelection(namedFromViewParam);
            }

            var selectedNamed = FindNamedView(list, moduleSelectedViewKey);
            if (selectedNamed != null)
            {
                return BuildNamedSelection(selectedNamed);
            }

            var defaultNamed = list.FirstOrDefault(v => v.IsDefault);
            if (defaultNamed != null)
            {
                return BuildNamedSelection(defaultNamed);
            }

            var legacyType = NormalizeViewType(moduleViewType);
            if (!string.IsNullOrWhiteSpace(legacyType) && !string.Equals(legacyType, "submit", StringComparison.OrdinalIgnoreCase))
            {
                return BuildGenericSelection(legacyType);
            }

            return BuildGenericSelection("submit");
        }

        private static FormViewSelectionResult BuildNamedSelection(FormViewInfo view)
        {
            return new FormViewSelectionResult
            {
                ActiveViewType = NormalizeActiveViewType(view.ViewType),
                ActiveViewConfigJson = string.IsNullOrWhiteSpace(view.ConfigJson) ? "{}" : view.ConfigJson,
                ActiveQueryKey = view.QueryKey ?? string.Empty,
                MatchedView = view,
                MatchedViewKey = view.ViewKey ?? string.Empty,
                UsedNamedView = true
            };
        }

        private static FormViewSelectionResult BuildGenericSelection(string effectiveType)
        {
            return new FormViewSelectionResult
            {
                ActiveViewType = NormalizeActiveViewType(effectiveType),
                ActiveViewConfigJson = "{}",
                ActiveQueryKey = string.Empty,
                MatchedView = null,
                MatchedViewKey = string.Empty,
                UsedNamedView = false
            };
        }

        private static FormViewInfo FindNamedView(IEnumerable<FormViewInfo> views, string key)
        {
            var normalized = SlugifyViewKey(key);
            if (string.IsNullOrWhiteSpace(normalized)) return null;
            return (views ?? Enumerable.Empty<FormViewInfo>())
                .FirstOrDefault(v => string.Equals(SlugifyViewKey(v.ViewKey), normalized, StringComparison.OrdinalIgnoreCase));
        }

        private static string NormalizeActiveViewType(string value)
        {
            var normalized = NormalizeViewType(value);
            return string.Equals(normalized, "submit", StringComparison.OrdinalIgnoreCase) ? null : normalized;
        }

        private static JObject ParseObject(string rawJson)
        {
            if (string.IsNullOrWhiteSpace(rawJson)) return new JObject();
            try { return JObject.Parse(rawJson); } catch { return new JObject(); }
        }

        private static FormViewCatalogItem MapCatalogItem(JObject obj)
        {
            return new FormViewCatalogItem
            {
                ViewKey = ((string)obj["viewKey"] ?? (string)obj["ViewKey"] ?? string.Empty).Trim(),
                QueryKey = ((string)obj["queryKey"] ?? (string)obj["QueryKey"] ?? string.Empty).Trim(),
                ViewType = ((string)obj["viewType"] ?? (string)obj["ViewType"] ?? string.Empty).Trim(),
                ViewName = ((string)obj["viewName"] ?? (string)obj["ViewName"] ?? string.Empty).Trim(),
                IsDefault = ParseBool(obj["isDefault"] ?? obj["IsDefault"]),
                ConfigJson = (string)obj["configJson"] ?? (string)obj["ConfigJson"] ?? "{}",
                CustomHtml = (string)obj["customHtml"] ?? (string)obj["CustomHtml"] ?? string.Empty
            };
        }

        private static bool ParseBool(JToken token)
        {
            if (token == null) return false;
            if (token.Type == JTokenType.Boolean) return token.Value<bool>();
            return bool.TryParse(token.ToString(), out var parsed) && parsed;
        }
    }
}
