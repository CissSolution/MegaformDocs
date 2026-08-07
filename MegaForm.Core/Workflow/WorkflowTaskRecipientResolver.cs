using System;
using System.Collections.Generic;
using System.Linq;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services.Workflow
{
    /// <summary>
    /// [CloudReady A2 v20260806] Shared recipient resolution for workflow task
    /// notifications. Factored out of ApprovalNodeExecutor so the host timer
    /// scanners (overdue reminder) resolve exactly the same people the
    /// create/forward notifications go to — no duplicated role/user logic.
    /// </summary>
    public static class WorkflowTaskRecipientResolver
    {
        /// <summary>
        /// Candidate recipients of a task: CandidateUsers (raw email or resolvable
        /// user) + members of CandidateRoles. Same semantics as the original
        /// ApprovalNodeExecutor.ResolveTaskRecipients.
        /// </summary>
        public static List<string> ResolveTaskRecipients(
            WorkflowTaskInstance task,
            IWorkflowPrincipalResolver principalResolver,
            int portalId)
        {
            var emails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (task == null) return new List<string>();

            foreach (var userRef in task.CandidateUsers ?? new List<string>())
            {
                var value = (userRef ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(value)) continue;

                if (value.IndexOf('@') >= 0)
                {
                    emails.Add(value);
                }
                else if (principalResolver != null)
                {
                    var user = principalResolver.ResolveUser(value, portalId);
                    if (user != null && !string.IsNullOrWhiteSpace(user.Email))
                        emails.Add(user.Email);
                }
            }

            foreach (var roleName in task.CandidateRoles ?? new List<string>())
            {
                if (principalResolver == null) continue;
                foreach (var user in principalResolver.ResolveRoleMembers(roleName, portalId))
                {
                    if (!string.IsNullOrWhiteSpace(user.Email))
                        emails.Add(user.Email);
                }
            }

            return emails.ToList();
        }

        /// <summary>
        /// Recipients for the overdue reminder: when the task is assigned, only the
        /// assignee is reminded (role queues should not all be nagged about a task
        /// one person owns); otherwise the full candidate set.
        /// </summary>
        public static List<string> ResolveReminderRecipients(
            WorkflowTaskInstance task,
            IWorkflowPrincipalResolver principalResolver,
            int portalId)
        {
            if (task == null) return new List<string>();

            var assignee = (task.AssignedUserName ?? string.Empty).Trim();
            if (!string.IsNullOrWhiteSpace(assignee))
            {
                if (assignee.IndexOf('@') >= 0)
                    return new List<string> { assignee };

                if (principalResolver != null)
                {
                    try
                    {
                        var user = principalResolver.ResolveUser(assignee, portalId);
                        if (user != null && !string.IsNullOrWhiteSpace(user.Email))
                            return new List<string> { user.Email };
                    }
                    catch { /* fall through to candidates */ }
                }
            }

            return ResolveTaskRecipients(task, principalResolver, portalId);
        }
    }
}
