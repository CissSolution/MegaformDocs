using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Models;
using MegaForm.Core.Utilities;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    public class ServerSidePermissionEnforcementResult
    {
        public bool Allowed { get; set; } = true;
        public string ErrorMessage { get; set; }
        public Dictionary<string, object> Data { get; set; } = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        public List<string> RemovedFields { get; set; } = new List<string>();
        public RuleEvaluationContext RuleContext { get; set; }
    }

    /// <summary>
    /// Server-side companion to the browser rule engine. It enforces submit
    /// permissions, contextual ShowIf rules, schema whitelisting, and optional
    /// per-permission field restrictions before validation and persistence.
    /// </summary>
    public static class ServerSidePermissionEnforcementService
    {
        private static readonly string[] SubmitPermissionTypes = { "submit", "create" };
        private static readonly string[] ManagePermissionTypes = { "manage" };
        private static readonly string[] EffectiveManagePermissions = { "submit", "view", "edit", "delete", "export", "approve", "manage" };
        private static readonly string[] AllowListKeys = { "allow", "allowed", "include", "included", "visible", "canView", "canSubmit", "canEdit", "editable", "writable", "fields" };
        private static readonly string[] DenyListKeys = { "deny", "denied", "exclude", "excluded", "hidden", "readOnly", "readonly", "blocked", "forbidden" };

        public static ServerSidePermissionEnforcementResult EnforceSubmit(
            FormInfo form,
            FormSchema schema,
            Dictionary<string, object> data,
            UserContext actor,
            IEnumerable<FormPermissionInfo> permissions,
            IDictionary<string, string> query = null)
        {
            var result = new ServerSidePermissionEnforcementResult
            {
                Data = CloneData(data),
                RemovedFields = new List<string>()
            };

            actor = NormalizeActor(actor);
            var normalizedPermissions = PermissionCatalogService.NormalizeRules(form != null ? form.FormId : 0, permissions ?? Enumerable.Empty<FormPermissionInfo>());
            var explicitSubmitRules = normalizedPermissions
                .Where(p => IsSubmitPermission(p.PermissionType))
                .ToList();
            var submitGrantRules = normalizedPermissions
                .Where(p => IsSubmitPermission(p.PermissionType) || IsManagePermission(p.PermissionType))
                .ToList();

            if (explicitSubmitRules.Any() && HasMatchingDeniedPermission(explicitSubmitRules, actor, SubmitPermissionTypes))
            {
                result.Allowed = false;
                result.ErrorMessage = "You do not have permission to submit this form.";
                result.RuleContext = BuildRuleContext(result.Data, actor, normalizedPermissions, query, explicitSubmitRules.Count == 0);
                return result;
            }

            if (explicitSubmitRules.Any() && !HasMatchingGrantedPermission(submitGrantRules, actor, SubmitPermissionTypes.Concat(ManagePermissionTypes)))
            {
                result.Allowed = false;
                result.ErrorMessage = "You do not have permission to submit this form.";
                result.RuleContext = BuildRuleContext(result.Data, actor, normalizedPermissions, query, false);
                return result;
            }

            var context = BuildRuleContext(result.Data, actor, normalizedPermissions, query, explicitSubmitRules.Count == 0);
            result.RuleContext = context;

            var schemaKeys = BuildSchemaKeySet(schema);
            StripUnknownKeys(result.Data, context, schemaKeys, result.RemovedFields);
            StripContextuallyHiddenFields(schema, result.Data, context, result.RemovedFields);

            var fieldPolicy = BuildFieldPolicy(normalizedPermissions, actor);
            ApplyFieldPolicy(schemaKeys, fieldPolicy, result.Data, context, result.RemovedFields);

            result.RuleContext = BuildRuleContext(result.Data, actor, normalizedPermissions, query, explicitSubmitRules.Count == 0);
            return result;
        }

        private static Dictionary<string, object> CloneData(Dictionary<string, object> data)
        {
            return data == null
                ? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, object>(data, StringComparer.OrdinalIgnoreCase);
        }

        private static UserContext NormalizeActor(UserContext actor)
        {
            var next = actor ?? new UserContext();
            if (next.Roles == null)
                next.Roles = new List<string>();
            return next;
        }

        private static RuleEvaluationContext BuildRuleContext(
            Dictionary<string, object> data,
            UserContext actor,
            List<FormPermissionInfo> permissions,
            IDictionary<string, string> query,
            bool implicitSubmitAllowed)
        {
            var context = RuleEvaluationContext.FromFields(data);
            context.User = NormalizeActor(actor);
            context.Query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (query != null)
            {
                foreach (var pair in query)
                    context.Query[pair.Key] = pair.Value ?? string.Empty;
            }

            context.Permissions = BuildGrantedPermissionSet(permissions, context.User, implicitSubmitAllowed);
            return context;
        }

        private static ISet<string> BuildGrantedPermissionSet(List<FormPermissionInfo> permissions, UserContext actor, bool implicitSubmitAllowed)
        {
            var granted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            if (actor != null && (actor.IsAdmin || actor.IsSuperUser))
            {
                granted.Add("*");
                foreach (var permission in EffectiveManagePermissions)
                    granted.Add(permission);
                return granted;
            }

            foreach (var permission in permissions ?? new List<FormPermissionInfo>())
            {
                if (!permission.IsGranted || !MatchesPrincipal(permission, actor))
                    continue;

                var type = NormalizePermissionType(permission.PermissionType);
                if (string.IsNullOrWhiteSpace(type))
                    continue;

                granted.Add(type);
                if (IsManagePermission(type))
                {
                    foreach (var managed in EffectiveManagePermissions)
                        granted.Add(managed);
                }
            }

            if (implicitSubmitAllowed)
                granted.Add("submit");

            return granted;
        }

        private static bool HasMatchingGrantedPermission(IEnumerable<FormPermissionInfo> permissions, UserContext actor, IEnumerable<string> types)
        {
            return permissions != null && permissions.Any(p =>
                p.IsGranted &&
                MatchesPermissionType(p.PermissionType, types) &&
                MatchesPrincipal(p, actor));
        }

        private static bool HasMatchingDeniedPermission(IEnumerable<FormPermissionInfo> permissions, UserContext actor, IEnumerable<string> types)
        {
            return permissions != null && permissions.Any(p =>
                !p.IsGranted &&
                MatchesPermissionType(p.PermissionType, types) &&
                MatchesPrincipal(p, actor));
        }

        private static bool MatchesPermissionType(string permissionType, IEnumerable<string> types)
        {
            var normalized = NormalizePermissionType(permissionType);
            return types != null && types.Any(type => string.Equals(normalized, NormalizePermissionType(type), StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsSubmitPermission(string permissionType)
        {
            var normalized = NormalizePermissionType(permissionType);
            return string.Equals(normalized, "submit", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "create", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsManagePermission(string permissionType)
        {
            return string.Equals(NormalizePermissionType(permissionType), "manage", StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizePermissionType(string permissionType)
        {
            var normalized = PermissionCatalogService.NormalizePermissionType(permissionType);
            return string.Equals(normalized, "create", StringComparison.OrdinalIgnoreCase) ? "submit" : normalized;
        }

        private static bool MatchesPrincipal(FormPermissionInfo permission, UserContext actor)
        {
            actor = NormalizeActor(actor);
            var principalType = (permission.PrincipalType ?? string.Empty).Trim().ToLowerInvariant();

            if (principalType == "user")
                return permission.UserId.HasValue && actor.UserId > 0 && permission.UserId.Value == actor.UserId;

            if (principalType == "role")
                return !string.IsNullOrWhiteSpace(permission.RoleName)
                    && actor.Roles != null
                    && actor.Roles.Contains(permission.RoleName, StringComparer.OrdinalIgnoreCase);

            if (principalType == "special")
            {
                var principalId = PermissionCatalogService.NormalizeSpecialPrincipalId(permission.PrincipalId);
                if (principalId == "all_users")
                    return true;
                if (principalId == "authenticated")
                    return actor.IsAuthenticated;
                if (principalId == "anonymous")
                    return !actor.IsAuthenticated;
            }

            return false;
        }

        private static HashSet<string> BuildSchemaKeySet(FormSchema schema)
        {
            var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (schema?.Fields == null)
                return keys;

            foreach (var field in MegaFormUtils.FlattenFields(schema.Fields))
            {
                if (!string.IsNullOrWhiteSpace(field?.Key))
                    keys.Add(field.Key);
            }

            return keys;
        }

        private static void StripUnknownKeys(
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            HashSet<string> schemaKeys,
            List<string> removedFields)
        {
            foreach (var key in data.Keys.ToList())
            {
                if (IsSystemSubmissionKey(key))
                    continue;

                if (!schemaKeys.Contains(key))
                    RemoveField(data, context, key, removedFields);
            }
        }

        private static bool IsSystemSubmissionKey(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return false;

            return key.StartsWith("__mf_", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "g-recaptcha-response", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "h-captcha-response", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "cf-turnstile-response", StringComparison.OrdinalIgnoreCase)
                || string.Equals(key, "__RequestVerificationToken", StringComparison.OrdinalIgnoreCase);
        }

        private static void StripContextuallyHiddenFields(
            FormSchema schema,
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            List<string> removedFields)
        {
            if (schema?.Fields == null)
                return;

            foreach (var field in schema.Fields)
                StripHiddenFieldRecursive(field, data, context, removedFields, true);
        }

        private static void StripHiddenFieldRecursive(
            FormField field,
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            List<string> removedFields,
            bool parentVisible)
        {
            if (field == null)
                return;

            var visible = parentVisible && SharedRuleEngine.Evaluate(field.ShowIf, context);
            if (!visible)
                RemoveFieldAndChildren(field, data, context, removedFields);

            if (field.Columns == null)
                return;

            foreach (var column in field.Columns)
            {
                if (column?.Fields == null)
                    continue;

                foreach (var child in column.Fields)
                    StripHiddenFieldRecursive(child, data, context, removedFields, visible);
            }
        }

        private static void RemoveFieldAndChildren(
            FormField field,
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            List<string> removedFields)
        {
            if (!string.IsNullOrWhiteSpace(field.Key))
                RemoveField(data, context, field.Key, removedFields);

            if (field.Columns == null)
                return;

            foreach (var column in field.Columns)
            {
                if (column?.Fields == null)
                    continue;

                foreach (var child in column.Fields)
                    RemoveFieldAndChildren(child, data, context, removedFields);
            }
        }

        private static FieldAccessPolicy BuildFieldPolicy(List<FormPermissionInfo> permissions, UserContext actor)
        {
            var policy = new FieldAccessPolicy();
            foreach (var permission in permissions ?? new List<FormPermissionInfo>())
            {
                if (!permission.IsGranted || !MatchesPrincipal(permission, actor))
                    continue;

                if (!IsSubmitPermission(permission.PermissionType) && !IsManagePermission(permission.PermissionType))
                    continue;

                ParseFieldRestrictions(permission.FieldRestrictions, policy);
            }

            return policy;
        }

        private static void ApplyFieldPolicy(
            HashSet<string> schemaKeys,
            FieldAccessPolicy policy,
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            List<string> removedFields)
        {
            if (policy == null)
                return;

            foreach (var key in schemaKeys.ToList())
            {
                var denied = policy.DeniedFields.Contains(key);
                var outsideAllowList = policy.HasAllowList && !policy.AllowedFields.Contains(key);
                if (denied || outsideAllowList)
                    RemoveField(data, context, key, removedFields);
            }
        }

        private static void RemoveField(
            Dictionary<string, object> data,
            RuleEvaluationContext context,
            string key,
            List<string> removedFields)
        {
            if (string.IsNullOrWhiteSpace(key))
                return;

            if (data.Remove(key) && !removedFields.Contains(key, StringComparer.OrdinalIgnoreCase))
                removedFields.Add(key);

            if (context?.Fields != null)
                context.Fields.Remove(key);
        }

        private static void ParseFieldRestrictions(string raw, FieldAccessPolicy policy)
        {
            if (string.IsNullOrWhiteSpace(raw) || raw.Trim() == "{}" || raw.Trim() == "[]")
                return;

            JToken token = null;
            try
            {
                token = JToken.Parse(raw);
            }
            catch
            {
                AddDeniedFields(policy, SplitFieldList(raw));
                return;
            }

            if (token == null || token.Type == JTokenType.Null)
                return;

            if (token.Type == JTokenType.Array)
            {
                AddAllowedFields(policy, ReadFieldList(token));
                return;
            }

            var obj = token as JObject;
            if (obj == null)
            {
                AddDeniedFields(policy, ReadFieldList(token));
                return;
            }

            var mode = (obj.Value<string>("mode") ?? obj.Value<string>("type") ?? string.Empty).Trim().ToLowerInvariant();
            foreach (var prop in obj.Properties())
            {
                if (IsMetaRestrictionProperty(prop.Name))
                    continue;

                if (IsDenyListProperty(prop.Name))
                {
                    AddDeniedFields(policy, ReadFieldList(prop.Value));
                    continue;
                }

                if (IsAllowListProperty(prop.Name))
                {
                    if (string.Equals(prop.Name, "fields", StringComparison.OrdinalIgnoreCase)
                        && (mode == "deny" || mode == "denied" || mode == "exclude" || mode == "hidden" || mode == "readonly" || mode == "readOnly"))
                        AddDeniedFields(policy, ReadFieldList(prop.Value));
                    else
                        AddAllowedFields(policy, ReadFieldList(prop.Value));
                    continue;
                }

                ApplyFieldMapEntry(policy, prop);
            }
        }

        private static void ApplyFieldMapEntry(FieldAccessPolicy policy, JProperty prop)
        {
            if (prop == null || string.IsNullOrWhiteSpace(prop.Name))
                return;

            if (prop.Value.Type == JTokenType.Boolean)
            {
                if (prop.Value.Value<bool>())
                    AddAllowedFields(policy, new[] { prop.Name });
                else
                    AddDeniedFields(policy, new[] { prop.Name });
                return;
            }

            if (prop.Value.Type == JTokenType.String)
            {
                var value = (prop.Value.Value<string>() ?? string.Empty).Trim().ToLowerInvariant();
                if (value == "deny" || value == "denied" || value == "hidden" || value == "readonly" || value == "read-only" || value == "forbidden")
                    AddDeniedFields(policy, new[] { prop.Name });
                else if (value == "allow" || value == "allowed" || value == "visible" || value == "editable" || value == "writable")
                    AddAllowedFields(policy, new[] { prop.Name });
            }
        }

        private static bool IsAllowListProperty(string name)
        {
            return AllowListKeys.Contains(name ?? string.Empty, StringComparer.OrdinalIgnoreCase);
        }

        private static bool IsDenyListProperty(string name)
        {
            return DenyListKeys.Contains(name ?? string.Empty, StringComparer.OrdinalIgnoreCase);
        }

        private static bool IsMetaRestrictionProperty(string name)
        {
            return string.Equals(name, "mode", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "type", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "description", StringComparison.OrdinalIgnoreCase)
                || string.Equals(name, "label", StringComparison.OrdinalIgnoreCase);
        }

        private static IEnumerable<string> ReadFieldList(JToken token)
        {
            if (token == null || token.Type == JTokenType.Null)
                return Enumerable.Empty<string>();

            if (token.Type == JTokenType.Array)
                return token.Children().SelectMany(ReadFieldList);

            if (token.Type == JTokenType.Object)
            {
                var obj = (JObject)token;
                var key = obj.Value<string>("key") ?? obj.Value<string>("field") ?? obj.Value<string>("fieldKey") ?? obj.Value<string>("name");
                return SplitFieldList(key);
            }

            return SplitFieldList(token.Type == JTokenType.String ? token.Value<string>() : token.ToString());
        }

        private static IEnumerable<string> SplitFieldList(string value)
        {
            return (value ?? string.Empty)
                .Split(new[] { ',', ';', '\n', '\r', '\t' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(v => v.Trim())
                .Where(v => v.Length > 0);
        }

        private static void AddAllowedFields(FieldAccessPolicy policy, IEnumerable<string> fields)
        {
            var any = false;
            foreach (var field in fields ?? Enumerable.Empty<string>())
            {
                if (string.IsNullOrWhiteSpace(field))
                    continue;
                policy.AllowedFields.Add(field.Trim());
                any = true;
            }

            if (any)
                policy.HasAllowList = true;
        }

        private static void AddDeniedFields(FieldAccessPolicy policy, IEnumerable<string> fields)
        {
            foreach (var field in fields ?? Enumerable.Empty<string>())
            {
                if (!string.IsNullOrWhiteSpace(field))
                    policy.DeniedFields.Add(field.Trim());
            }
        }

        private sealed class FieldAccessPolicy
        {
            public bool HasAllowList { get; set; }
            public HashSet<string> AllowedFields { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            public HashSet<string> DeniedFields { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
