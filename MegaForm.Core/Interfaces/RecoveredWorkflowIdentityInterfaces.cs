using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Workflow;

// [Recovered 2026-06-15] These two interfaces + UserPrincipal were added to Core in
// June but their defining file was lost when an April-21 backup was copied over the
// working folder (see memory: project-april-revert-incident-recovery). The supporting
// DTOs survived in Models/WorkflowIdentityModels.cs; only the interfaces + UserPrincipal
// were missing. Re-extracted verbatim from the deployed MegaForm.Core.dll (June-15)
// via ilspycmd. Namespace = MegaForm.Core.Interfaces (consumers `using` it; the
// implementation UnsupportedWorkflowIdentityProvisioningService confirms it).
namespace MegaForm.Core.Interfaces
{
    public interface IWorkflowIdentityProvisioningService
    {
        Task<WorkflowProvisionedRole> EnsureRoleAsync(WorkflowRoleProvisionRequest request, CancellationToken ct);

        Task<WorkflowProvisionedUser> EnsureUserAsync(WorkflowUserProvisionRequest request, CancellationToken ct);

        Task<WorkflowProvisionedMembership> AddUserToRoleAsync(WorkflowUserRoleProvisionRequest request, CancellationToken ct);
    }

    public class UserPrincipal
    {
        public int? UserId { get; set; }

        public string UserName { get; set; } = string.Empty;

        public string DisplayName { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;
    }

    public interface IWorkflowPrincipalResolver
    {
        UserPrincipal ResolveUser(string identifier, int portalId);

        List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId);
    }
}
