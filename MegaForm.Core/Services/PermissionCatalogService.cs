using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

namespace MegaForm.Core.Services
{
    public class PermissionCatalogService
    {
        public const string CatalogBadge = "PermissionCatalog v20260424-01";

        private readonly IPermissionPrincipalCatalogProvider _provider;

        public PermissionCatalogService(IPermissionPrincipalCatalogProvider provider = null)
        {
            _provider = provider;
        }

        public PermissionCatalogInfo GetCatalog(int formId, int portalId, UserContext actor)
        {
            var principals = new List<PermissionPrincipalInfo>();
            principals.AddRange(BuildSpecialPrincipals());

            if (_provider != null)
            {
                var provided = _provider.GetPrincipals(portalId, actor) ?? new List<PermissionPrincipalInfo>();
                principals.AddRange(provided);
            }

            EnsureCurrentActorPrincipal(principals, actor);

            return new PermissionCatalogInfo
            {
                FormId = formId,
                Badge = CatalogBadge,
                CurrentUser = BuildActorInfo(actor),
                PermissionTypes = BuildPermissionDefinitions(),
                Scopes = BuildScopeDefinitions(),
                Principals = NormalizePrincipals(principals)
            };
        }

        public static List<FormPermissionInfo> NormalizeRules(int formId, IEnumerable<FormPermissionInfo> rules)
        {
            var normalized = new List<FormPermissionInfo>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var rule in rules ?? Enumerable.Empty<FormPermissionInfo>())
            {
                var next = NormalizeRule(formId, rule);
                if (next == null) continue;

                var key = string.Join("|", new[]
                {
                    next.PermissionType ?? string.Empty,
                    next.PrincipalType ?? string.Empty,
                    next.PrincipalId ?? string.Empty,
                    next.Scope ?? string.Empty,
                    next.IsGranted ? "1" : "0",
                    next.FieldRestrictions ?? string.Empty
                });

                if (seen.Add(key))
                    normalized.Add(next);
            }

            return normalized;
        }

        public static FormPermissionInfo NormalizeRule(int formId, FormPermissionInfo rule)
        {
            if (rule == null) return null;

            var permissionType = NormalizePermissionType(rule.PermissionType);
            if (string.IsNullOrWhiteSpace(permissionType)) return null;

            var principalType = NormalizePrincipalType(rule);
            if (string.IsNullOrWhiteSpace(principalType)) return null;

            var normalized = new FormPermissionInfo
            {
                PermissionId = rule.PermissionId,
                FormId = formId > 0 ? formId : rule.FormId,
                PermissionType = permissionType,
                PrincipalType = principalType,
                Scope = NormalizeScope(rule.Scope, permissionType),
                IsGranted = rule.IsGranted,
                FieldRestrictions = (rule.FieldRestrictions ?? string.Empty).Trim()
            };

            switch (principalType)
            {
                case "user":
                    var userId = rule.UserId ?? ParseInt(rule.PrincipalId);
                    if (!userId.HasValue || userId.Value <= 0) return null;
                    normalized.UserId = userId;
                    normalized.PrincipalId = userId.Value.ToString();
                    normalized.RoleName = string.Empty;
                    break;

                case "role":
                    var roleName = FirstNonEmpty(rule.RoleName, rule.PrincipalId);
                    if (string.IsNullOrWhiteSpace(roleName)) return null;
                    normalized.RoleName = roleName.Trim();
                    normalized.PrincipalId = normalized.RoleName;
                    normalized.UserId = null;
                    break;

                case "special":
                    var specialId = NormalizeSpecialPrincipalId(FirstNonEmpty(rule.PrincipalId, rule.RoleName));
                    if (string.IsNullOrWhiteSpace(specialId)) return null;
                    normalized.PrincipalId = specialId;
                    normalized.RoleName = string.Empty;
                    normalized.UserId = null;
                    break;
            }

            return normalized;
        }

        public static string NormalizePermissionType(string permissionType)
        {
            var value = (permissionType ?? string.Empty).Trim().ToLowerInvariant();
            switch (value)
            {
                case "":
                    return string.Empty;
                case "view_submissions":
                case "submission_view":
                    return "view";
                case "submission_edit":
                    return "edit";
                case "submission_delete":
                    return "delete";
                case "submission_export":
                    return "export";
                case "workflow_approve":
                    return "approve";
                case "manage_submissions":
                case "manage_form":
                    return "manage";
                default:
                    return value;
            }
        }

        public static string NormalizeScope(string scope, string permissionType)
        {
            if (!SupportsScope(permissionType))
                return "all";

            var value = (scope ?? string.Empty).Trim().ToLowerInvariant();
            // [B86] Team scope may carry the team field inline: "team:department".
            if (value == "team" || value.StartsWith("team:", StringComparison.Ordinal))
                return value;
            switch (value)
            {
                case "":
                    return GetDefaultScope(permissionType);
                case "mine":
                    return "own";
                case "all":
                case "own":
                    return value;
                default:
                    return GetDefaultScope(permissionType);
            }
        }

        public static bool SupportsScope(string permissionType)
        {
            switch (NormalizePermissionType(permissionType))
            {
                case "view":
                case "edit":
                case "delete":
                case "export":
                    return true;
                default:
                    return false;
            }
        }

        public static string GetDefaultScope(string permissionType)
        {
            return SupportsScope(permissionType) ? "all" : "all";
        }

        public static string NormalizeSpecialPrincipalId(string principalId)
        {
            var value = (principalId ?? string.Empty).Trim().ToLowerInvariant();
            switch (value)
            {
                case "all users":
                case "all_users":
                case "everyone":
                    return "all_users";
                case "registered users":
                case "authenticated users":
                case "authenticated":
                case "authenticated_users":
                    return "authenticated";
                case "anonymous":
                case "guests":
                case "unauthenticated":
                    return "anonymous";
                default:
                    return value;
            }
        }

        private static string NormalizePrincipalType(FormPermissionInfo rule)
        {
            var type = (rule.PrincipalType ?? string.Empty).Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(type))
            {
                if (rule.UserId.HasValue) return "user";
                if (!string.IsNullOrWhiteSpace(rule.RoleName)) return "role";

                var principalId = (rule.PrincipalId ?? string.Empty).Trim();
                int numericId;
                if (int.TryParse(principalId, out numericId) && numericId > 0)
                    return "user";

                if (!string.IsNullOrWhiteSpace(principalId))
                    return IsSpecialPrincipalId(principalId) ? "special" : "role";
            }

            switch (type)
            {
                case "user":
                case "role":
                case "special":
                    return type;
                case "users":
                    return "user";
                case "roles":
                    return "role";
                default:
                    return string.Empty;
            }
        }

        private static bool IsSpecialPrincipalId(string principalId)
        {
            var value = NormalizeSpecialPrincipalId(principalId);
            return value == "all_users" || value == "authenticated" || value == "anonymous";
        }

        private static int? ParseInt(string value)
        {
            int parsed;
            return int.TryParse(value, out parsed) ? parsed : (int?)null;
        }

        private static string FirstNonEmpty(params string[] values)
        {
            foreach (var value in values)
            {
                if (!string.IsNullOrWhiteSpace(value))
                    return value;
            }

            return string.Empty;
        }

        private static PermissionActorInfo BuildActorInfo(UserContext actor)
        {
            return new PermissionActorInfo
            {
                UserId = actor != null ? actor.UserId : -1,
                UserName = actor != null ? actor.UserName : string.Empty,
                DisplayName = actor != null ? actor.DisplayName : string.Empty,
                Email = actor != null ? actor.Email : string.Empty,
                IsAuthenticated = actor != null && actor.IsAuthenticated,
                IsAdmin = actor != null && actor.IsAdmin,
                IsSuperUser = actor != null && actor.IsSuperUser,
                Roles = actor != null && actor.Roles != null ? actor.Roles.Distinct(StringComparer.OrdinalIgnoreCase).ToList() : new List<string>()
            };
        }

        private static List<PermissionDefinitionInfo> BuildPermissionDefinitions()
        {
            return new List<PermissionDefinitionInfo>
            {
                new PermissionDefinitionInfo { Key = "submit", Label = "Submit", Description = "Allow creating new records or workflow cases.", SupportsScope = false, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "view", Label = "View Submissions", Description = "Allow viewing record data and submission details.", SupportsScope = true, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "edit", Label = "Edit Submissions", Description = "Allow updating submission data and status.", SupportsScope = true, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "delete", Label = "Delete Submissions", Description = "Allow deleting records and submissions.", SupportsScope = true, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "export", Label = "Export", Description = "Allow exporting submissions and record data.", SupportsScope = true, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "approve", Label = "Approve", Description = "Allow completing approval tasks and workflow actions.", SupportsScope = false, DefaultScope = "all" },
                new PermissionDefinitionInfo { Key = "manage", Label = "Manage", Description = "Full management access for this form, its records, and workflow tasks.", SupportsScope = false, DefaultScope = "all" }
            };
        }

        private static List<PermissionScopeInfo> BuildScopeDefinitions()
        {
            return new List<PermissionScopeInfo>
            {
                new PermissionScopeInfo { Key = "all", Label = "All Records", Description = "Applies to every record and submission for this form." },
                new PermissionScopeInfo { Key = "own", Label = "Own Records", Description = "Applies only to records created by the current user." }
            };
        }

        private static List<PermissionPrincipalInfo> BuildSpecialPrincipals()
        {
            return new List<PermissionPrincipalInfo>
            {
                new PermissionPrincipalInfo
                {
                    PrincipalType = "special",
                    PrincipalId = "all_users",
                    DisplayName = "All Users",
                    Description = "Everyone, including anonymous visitors.",
                    IsSpecial = true
                },
                new PermissionPrincipalInfo
                {
                    PrincipalType = "special",
                    PrincipalId = "authenticated",
                    DisplayName = "Authenticated Users",
                    Description = "Signed-in users only.",
                    IsSpecial = true
                },
                new PermissionPrincipalInfo
                {
                    PrincipalType = "special",
                    PrincipalId = "anonymous",
                    DisplayName = "Anonymous Users",
                    Description = "Visitors who are not signed in.",
                    IsSpecial = true
                }
            };
        }

        private static void EnsureCurrentActorPrincipal(List<PermissionPrincipalInfo> principals, UserContext actor)
        {
            if (actor == null || actor.UserId <= 0) return;

            var existing = principals.FirstOrDefault(p =>
                string.Equals(p.PrincipalType, "user", StringComparison.OrdinalIgnoreCase) &&
                p.UserId.HasValue &&
                p.UserId.Value == actor.UserId);

            if (existing != null)
            {
                existing.IsCurrentUser = true;
                if (string.IsNullOrWhiteSpace(existing.DisplayName))
                    existing.DisplayName = !string.IsNullOrWhiteSpace(actor.DisplayName) ? actor.DisplayName : actor.UserName;
                return;
            }

            principals.Add(new PermissionPrincipalInfo
            {
                PrincipalType = "user",
                PrincipalId = actor.UserId.ToString(),
                UserId = actor.UserId,
                DisplayName = !string.IsNullOrWhiteSpace(actor.DisplayName) ? actor.DisplayName : actor.UserName,
                Description = string.IsNullOrWhiteSpace(actor.Email) ? string.Empty : actor.Email,
                IsUser = true,
                IsCurrentUser = true
            });
        }

        private static List<PermissionPrincipalInfo> NormalizePrincipals(IEnumerable<PermissionPrincipalInfo> principals)
        {
            var map = new Dictionary<string, PermissionPrincipalInfo>(StringComparer.OrdinalIgnoreCase);

            foreach (var principal in principals ?? Enumerable.Empty<PermissionPrincipalInfo>())
            {
                if (principal == null) continue;

                var next = new PermissionPrincipalInfo
                {
                    PrincipalType = (principal.PrincipalType ?? string.Empty).Trim().ToLowerInvariant(),
                    PrincipalId = (principal.PrincipalId ?? string.Empty).Trim(),
                    DisplayName = (principal.DisplayName ?? string.Empty).Trim(),
                    Description = (principal.Description ?? string.Empty).Trim(),
                    RoleName = (principal.RoleName ?? string.Empty).Trim(),
                    UserId = principal.UserId,
                    IsCurrentUser = principal.IsCurrentUser
                };

                if (string.IsNullOrWhiteSpace(next.PrincipalType) || string.IsNullOrWhiteSpace(next.PrincipalId))
                    continue;

                next.IsSpecial = next.PrincipalType == "special" || principal.IsSpecial;
                next.IsRole = next.PrincipalType == "role" || principal.IsRole;
                next.IsUser = next.PrincipalType == "user" || principal.IsUser;
                if (next.IsSpecial)
                    next.PrincipalId = NormalizeSpecialPrincipalId(next.PrincipalId);

                if (string.IsNullOrWhiteSpace(next.DisplayName))
                    next.DisplayName = next.RoleName ?? next.PrincipalId;

                var key = next.PrincipalType + "|" + next.PrincipalId;
                if (!map.ContainsKey(key))
                {
                    map[key] = next;
                    continue;
                }

                var current = map[key];
                current.IsCurrentUser = current.IsCurrentUser || next.IsCurrentUser;
                if (string.IsNullOrWhiteSpace(current.DisplayName)) current.DisplayName = next.DisplayName;
                if (string.IsNullOrWhiteSpace(current.Description)) current.Description = next.Description;
                if (string.IsNullOrWhiteSpace(current.RoleName)) current.RoleName = next.RoleName;
                if (!current.UserId.HasValue) current.UserId = next.UserId;
            }

            return map.Values
                .OrderBy(p => p.IsSpecial ? 0 : p.IsRole ? 1 : 2)
                .ThenBy(p => p.DisplayName ?? p.PrincipalId, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }
}
