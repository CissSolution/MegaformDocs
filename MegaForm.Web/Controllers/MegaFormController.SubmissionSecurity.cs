using System;
using System.Linq;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.Web.Data;

namespace MegaForm.Web.Controllers
{
    /// <summary>
    /// [WebRLS v20260712] Row-level security for the Web host's submission
    /// endpoints — the port of Oqtane's CanViewSubmissionRow / DNN's mirror.
    /// Before this file every Submissions action was plain [Authorize]: ANY
    /// authenticated user could list, read, edit and DELETE any submission.
    /// Gate order matches Oqtane: admin → workflow-task holder (an approver must
    /// read what they approve: HoldsTaskForSubmission, resolved server-side from
    /// MF_WorkflowTasks) → explicit view/manage permission rules on the form.
    /// </summary>
    public partial class MegaFormController
    {
        private UserContext GetSubmissionActorWithRoles()
        {
            var principal = User;
            int userId = -1;
            if (principal != null)
            {
                int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? principal.FindFirstValue("sub"), out userId);
            }

            var actor = new UserContext
            {
                UserId = userId > 0 ? userId : 0,
                UserName = principal?.Identity?.Name ?? string.Empty,
                IsAuthenticated = principal?.Identity?.IsAuthenticated == true,
                Roles = principal != null
                    ? principal.Claims.Where(c => c.Type == ClaimTypes.Role).Select(c => c.Value)
                        .Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                    : new System.Collections.Generic.List<string>()
            };

            // Same enrichment WorkflowController does: claims often carry no roles
            // on this host — the DB is authoritative. Fail-soft to claims-only.
            try
            {
                var db = HttpContext?.RequestServices?.GetService<MegaFormDbContext>();
                if (db != null && actor.UserId > 0)
                {
                    var dbUser = db.WebUsers.FirstOrDefault(u => u.UserId == actor.UserId && !u.IsDeleted);
                    if (dbUser != null)
                    {
                        if (string.IsNullOrWhiteSpace(actor.UserName)) actor.UserName = dbUser.UserName ?? string.Empty;
                        actor.DisplayName = dbUser.DisplayName ?? dbUser.UserName ?? string.Empty;
                        actor.Email = dbUser.Email ?? string.Empty;
                    }

                    var roleIds = db.WebUserRoles.Where(ur => ur.UserId == actor.UserId).Select(ur => ur.RoleId).ToList();
                    var dbRoles = db.WebRoles.Where(r => roleIds.Contains(r.RoleId)).Select(r => r.RoleName)
                        .Where(n => !string.IsNullOrWhiteSpace(n)).ToList();
                    actor.Roles = actor.Roles.Concat(dbRoles)
                        .Where(v => !string.IsNullOrWhiteSpace(v))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList();
                }
            }
            catch { /* claims-only fallback */ }

            actor.IsAdmin = actor.Roles.Any(role =>
                string.Equals(role, "Administrator", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Administrators", StringComparison.OrdinalIgnoreCase)
                || string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase));
            actor.IsSuperUser = actor.Roles.Any(role => string.Equals(role, "Host", StringComparison.OrdinalIgnoreCase));
            return actor;
        }

        // IsSubmissionAdmin already exists on this partial class
        // (MegaFormController.UploadAndSdk.cs) with the same semantics — reused.

        private bool HasExplicitSubmissionViewRule(int formId)
        {
            var rules = PermissionCatalogService.NormalizeRules(formId, _phase2Repo.GetFormPermissions(formId));
            return rules.Any(rule =>
            {
                var permissionType = PermissionCatalogService.NormalizePermissionType(rule.PermissionType);
                return string.Equals(permissionType, "view", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(permissionType, "manage", StringComparison.OrdinalIgnoreCase);
            });
        }

        private bool CanUseSubmissionManagement(int formId, UserContext actor, PermissionService permissions)
        {
            if (IsSubmissionAdmin(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return permissions.CanView(formId, actor);
        }

        private bool CanViewSubmissionRow(int formId, SubmissionInfo submission, UserContext actor, PermissionService permissions)
        {
            if (IsSubmissionAdmin(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            // An approver who holds a workflow task on THIS submission (assignee at
            // any point, or candidate while it is open) must be able to READ the
            // record they are approving — same [ApproverCanSee v20260711] rule as
            // Oqtane/DNN. Membership comes from MF_WorkflowTasks, never the request.
            try
            {
                var workflowTasks = HttpContext?.RequestServices?.GetService<WorkflowTaskService>();
                if (submission != null && workflowTasks != null &&
                    workflowTasks.HoldsTaskForSubmission(submission.SubmissionId, actor))
                    return true;
            }
            catch { /* task lookup failure must not GRANT access */ }
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return permissions.CanView(formId, actor) && permissions.CanViewSubmission(formId, submission, actor);
        }

        /// <summary>Mutations (status/data/delete). Admin, or an explicit edit/delete
        /// grant on a form that carries explicit rules.</summary>
        private bool CanMutateSubmissions(int formId, UserContext actor, PermissionService permissions, bool delete = false)
        {
            if (IsSubmissionAdmin(actor)) return true;
            if (actor == null || !actor.IsAuthenticated) return false;
            if (!HasExplicitSubmissionViewRule(formId)) return false;
            return delete ? permissions.CanDelete(formId, actor) : permissions.CanEdit(formId, actor);
        }
    }
}
