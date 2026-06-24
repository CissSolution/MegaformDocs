using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Models;

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

        public bool CanViewSubmission(int formId, SubmissionInfo submission, UserContext user)
        {
            if (user.IsAdmin || user.IsSuperUser) return true;

            var perms = _repo.GetFormPermissions(formId);
            var matching = GetMatchingPermissions(perms, user, "view");

            foreach (var p in matching)
            {
                switch ((p.Scope ?? "all").ToLowerInvariant())
                {
                    case "all": return true;
                    case "own":
                        if (submission.UserId == user.UserId) return true;
                        break;
                }
            }
            return false;
        }

        private bool CheckPermission(int formId, UserContext user, string permissionType)
        {
            if (user == null) return false;
            if (user.IsAdmin || user.IsSuperUser) return true;

            var perms = _repo.GetFormPermissions(formId);
            if (perms == null || perms.Count == 0) return true; // no restrictions = open

            return GetMatchingPermissions(perms, user, permissionType).Any();
        }

        private List<FormPermissionInfo> GetMatchingPermissions(List<FormPermissionInfo> perms, UserContext user, string type)
        {
            return (perms ?? new List<FormPermissionInfo>()).Where(p =>
                string.Equals(p.PermissionType, type, StringComparison.OrdinalIgnoreCase) &&
                (
                    (p.UserId.HasValue && p.UserId.Value == user.UserId) ||
                    (!string.IsNullOrEmpty(p.RoleName) && user.Roles.Contains(p.RoleName, StringComparer.OrdinalIgnoreCase))
                )
            ).ToList();
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
