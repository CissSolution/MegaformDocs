using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;
using Newtonsoft.Json.Linq;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Platform-agnostic permission evaluation.
    /// Each platform creates UserContext from its own user model.
    /// </summary>
    public class PermissionService
    {
        private readonly IPhase2Repository _repo;

        public PermissionService(IPhase2Repository repo)
        {
            _repo = repo;
        }

        public bool CanView(int formId, UserContext user)
        {
            return CheckPermission(formId, user, "view");
        }

        public bool CanEdit(int formId, UserContext user)
        {
            return CheckPermission(formId, user, "edit");
        }

        public bool CanDelete(int formId, UserContext user)
        {
            return CheckPermission(formId, user, "delete");
        }

        public bool CanExport(int formId, UserContext user)
        {
            return CheckPermission(formId, user, "export");
        }

        /// <summary>
        /// [ExportFailClosed v20260728-01] Gate for the bulk CSV/JSON dump endpoints.
        /// Deliberately stricter than <see cref="CanExport"/> on two points:
        ///   1. An empty permission table grants NOTHING. A form nobody has configured
        ///      must not hand its whole submission table to a caller the administrator
        ///      never named — CheckPermission's "no rules = open" fallback is fine for a
        ///      single record behind a row-level gate, but it is not an acceptable default
        ///      for an unbounded PII dump.
        ///   2. The caller must be authenticated. The "all_users" special principal
        ///      matches anonymous visitors, so an export grant on it would otherwise put
        ///      every row of the form on the public internet.
        /// Admin/superuser still pass; everyone else needs an explicit granted export
        /// (or manage) rule that matches them, and an explicit deny still wins.
        /// </summary>
        public bool CanBulkExport(int formId, UserContext user)
        {
            if (user == null) return false;
            // Hosts differ in which flag they populate for a signed-in caller (DNN derives
            // IsAuthenticated from UserID, the ASP.NET hosts from the principal), so accept
            // either — an anonymous caller has neither.
            if (!user.IsAuthenticated && user.UserId <= 0) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;
            return EvaluateMatchingPermission(
                GetPrincipalMatches(_repo.GetFormPermissions(formId), user, "export"),
                "export");
        }

        public bool CanApprove(int formId, UserContext user)
        {
            if (user == null) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;
            return EvaluateMatchingPermission(
                GetPrincipalMatches(_repo.GetFormPermissions(formId), user, "approve"),
                "approve");
        }

        /// <summary>
        /// Manage is deliberately explicit: unlike ordinary permission checks, an empty
        /// permission table does not grant management to every authenticated caller.
        /// Hosts use this for permission-matrix writes and other privileged form actions.
        /// </summary>
        public bool CanManage(int formId, UserContext user)
        {
            if (user == null) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;
            return EvaluateMatchingPermission(
                GetPrincipalMatches(_repo.GetFormPermissions(formId), user, "manage"),
                "manage");
        }

        public bool CanViewSubmission(int formId, SubmissionInfo submission, UserContext user)
        {
            return CanAccessSubmission(formId, submission, user, "view");
        }

        public bool CanEditSubmission(int formId, SubmissionInfo submission, UserContext user)
        {
            return CanAccessSubmission(formId, submission, user, "edit");
        }

        public bool CanDeleteSubmission(int formId, SubmissionInfo submission, UserContext user)
        {
            return CanAccessSubmission(formId, submission, user, "delete");
        }

        public bool CanExportSubmission(int formId, SubmissionInfo submission, UserContext user)
        {
            return CanAccessSubmission(formId, submission, user, "export");
        }

        /// <summary>
        /// Evaluates a permission against one submission, including own/team scope.
        /// A manage grant is an unrestricted grant for every matrix permission.
        /// Explicit denies for the requested permission win.
        /// </summary>
        public bool CanAccessSubmission(int formId, SubmissionInfo submission, UserContext user, string permissionType)
        {
            if (user == null || submission == null) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;

            var normalizedType = PermissionCatalogService.NormalizePermissionType(permissionType);
            var matching = GetPrincipalMatches(_repo.GetFormPermissions(formId), user, normalizedType);
            if (HasExplicitDeny(matching, normalizedType)) return false;

            foreach (var permission in matching.Where(p => p.IsGranted))
            {
                var type = PermissionCatalogService.NormalizePermissionType(permission.PermissionType);
                if (string.Equals(type, "manage", StringComparison.OrdinalIgnoreCase))
                    return true;

                var scope = PermissionCatalogService.NormalizeScope(permission.Scope, normalizedType);
                if (string.Equals(scope, "all", StringComparison.OrdinalIgnoreCase))
                    return true;
                if (string.Equals(scope, "own", StringComparison.OrdinalIgnoreCase)
                    && IsSubmissionOwner(submission, user))
                    return true;
                if ((string.Equals(scope, "team", StringComparison.OrdinalIgnoreCase)
                     || scope.StartsWith("team:", StringComparison.OrdinalIgnoreCase))
                    && ScopeMatchesTeam(submission, user, scope))
                {
                    return true;
                }
            }
            return false;
        }

        /// <summary>
        /// [OwnerGrant v20260722-01] Pure check: the authenticated user OWNS this submission
        /// (both ids positive and equal). Hosts use this to grant the owner read access to
        /// their own submission detail/print even when the form has no explicit view rule.
        /// Anonymous callers and anonymous submissions (UserId null/0) never match.
        /// </summary>
        public static bool IsSubmissionOwner(SubmissionInfo submission, UserContext user)
        {
            return submission != null
                && user != null
                && user.IsAuthenticated
                && user.UserId > 0
                && submission.UserId.HasValue
                && submission.UserId.Value > 0
                && submission.UserId.Value == user.UserId;
        }

        /// <summary>[OwnerRlsSql v20260722-02] True when the actor holds at least one matching
        /// "view" permission and EVERY matching grant is scope "own" — i.e. their visible set is
        /// exactly "submissions they own" and the per-row RLS predicate can be pushed down to SQL
        /// (exact TotalCount/paging) instead of filtering rows in memory after pagination.
        /// Admin/superuser and anonymous callers always return false (other gates cover them).
        /// </summary>
        public bool IsOwnOnlyViewScope(int formId, UserContext user)
        {
            return IsOwnOnlyScope(formId, user, "view");
        }

        public bool IsOwnOnlyScope(int formId, UserContext user, string permissionType)
        {
            if (user == null || !user.IsAuthenticated) return false;
            if (user.IsAdmin || user.IsSuperUser) return false;
            var normalizedType = PermissionCatalogService.NormalizePermissionType(permissionType);
            var matching = GetPrincipalMatches(_repo.GetFormPermissions(formId), user, normalizedType);
            if (HasExplicitDeny(matching, normalizedType)) return false;
            var granted = matching.Where(p => p.IsGranted).ToList();
            return granted.Count > 0
                && granted.All(p =>
                    !string.Equals(PermissionCatalogService.NormalizePermissionType(p.PermissionType), "manage", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(
                        PermissionCatalogService.NormalizeScope(p.Scope, normalizedType),
                        "own",
                        StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// True when the actor's matching grants require a per-row own/team decision.
        /// Hosts use this to avoid returning unfiltered lists or exports.
        /// </summary>
        public bool RequiresSubmissionScopeEvaluation(int formId, UserContext user, string permissionType)
        {
            if (user == null || user.IsAdmin || user.IsSuperUser) return false;
            var normalizedType = PermissionCatalogService.NormalizePermissionType(permissionType);
            var matching = GetPrincipalMatches(_repo.GetFormPermissions(formId), user, normalizedType);
            if (HasExplicitDeny(matching, normalizedType)) return true;
            var granted = matching.Where(p => p.IsGranted).ToList();
            if (granted.Count == 0) return false;
            return granted.All(p =>
            {
                var type = PermissionCatalogService.NormalizePermissionType(p.PermissionType);
                if (string.Equals(type, "manage", StringComparison.OrdinalIgnoreCase)) return false;
                return !string.Equals(
                    PermissionCatalogService.NormalizeScope(p.Scope, normalizedType),
                    "all",
                    StringComparison.OrdinalIgnoreCase);
            });
        }

        private bool CheckPermission(int formId, UserContext user, string permissionType)
        {
            if (user == null) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;

            var perms = _repo.GetFormPermissions(formId);
            if (perms == null || perms.Count == 0) return true; // no restrictions = open

            var normalizedType = PermissionCatalogService.NormalizePermissionType(permissionType);
            return EvaluateMatchingPermission(GetPrincipalMatches(perms, user, normalizedType), normalizedType);
        }

        private static bool EvaluateMatchingPermission(List<FormPermissionInfo> matching, string permissionType)
        {
            if (HasExplicitDeny(matching, permissionType)) return false;
            return matching.Any(p => p.IsGranted);
        }

        private static bool HasExplicitDeny(IEnumerable<FormPermissionInfo> matching, string permissionType)
        {
            return (matching ?? Enumerable.Empty<FormPermissionInfo>()).Any(p =>
                !p.IsGranted
                && string.Equals(
                    PermissionCatalogService.NormalizePermissionType(p.PermissionType),
                    permissionType,
                    StringComparison.OrdinalIgnoreCase));
        }

        private static List<FormPermissionInfo> GetPrincipalMatches(
            IEnumerable<FormPermissionInfo> permissions,
            UserContext user,
            string permissionType)
        {
            var normalizedType = PermissionCatalogService.NormalizePermissionType(permissionType);
            return (permissions ?? Enumerable.Empty<FormPermissionInfo>())
                .Where(permission =>
                {
                    var type = PermissionCatalogService.NormalizePermissionType(permission.PermissionType);
                    return (string.Equals(type, normalizedType, StringComparison.OrdinalIgnoreCase)
                            || string.Equals(type, "manage", StringComparison.OrdinalIgnoreCase))
                        && ServerSidePermissionEnforcementService.MatchesPrincipal(permission, user);
                })
                .ToList();
        }

        private static bool ScopeMatchesTeam(SubmissionInfo submission, UserContext user, string scope)
        {
            if (submission == null || user == null || user.Roles == null || user.Roles.Count == 0
                || string.IsNullOrWhiteSpace(submission.DataJson))
                return false;

            try
            {
                var data = JObject.Parse(submission.DataJson);
                var field = scope.StartsWith("team:", StringComparison.OrdinalIgnoreCase)
                    ? scope.Substring(5).Trim()
                    : string.Empty;
                var candidates = string.IsNullOrWhiteSpace(field)
                    ? new[] { "team", "department", "teamId", "teamName" }
                    : new[] { field };

                foreach (var candidate in candidates)
                {
                    var token = data.GetValue(candidate, StringComparison.OrdinalIgnoreCase);
                    if (token == null) continue;
                    var values = token.Type == JTokenType.Array
                        ? token.Values<string>()
                        : new[] { token.ToString() };
                    if (values.Any(value => !string.IsNullOrWhiteSpace(value)
                        && user.Roles.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase)))
                        return true;
                }
            }
            catch
            {
                // Invalid record JSON never grants access.
            }
            return false;
        }
    }

    /// <summary>
    /// Platform-agnostic user context. Each platform maps its user model to this.
    /// </summary>
    public class UserContext
    {
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public bool IsAuthenticated { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsSuperUser { get; set; }
        public List<string> Roles { get; set; } = new List<string>();
        public string IpAddress { get; set; }
    }
}
