using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Workflow;

namespace MegaForm.Core.Services
{
    /// <summary>
    /// Safe default for hosts that have not yet opted into user/role provisioning.
    /// </summary>
    public class UnsupportedWorkflowIdentityProvisioningService : IWorkflowIdentityProvisioningService
    {
        private static InvalidOperationException BuildException()
        {
            return new InvalidOperationException("Workflow identity provisioning is not enabled for this host.");
        }

        public Task<WorkflowProvisionedRole> EnsureRoleAsync(
            WorkflowRoleProvisionRequest request,
            CancellationToken ct)
        {
            throw BuildException();
        }

        public Task<WorkflowProvisionedUser> EnsureUserAsync(
            WorkflowUserProvisionRequest request,
            CancellationToken ct)
        {
            throw BuildException();
        }

        public Task<WorkflowProvisionedMembership> AddUserToRoleAsync(
            WorkflowUserRoleProvisionRequest request,
            CancellationToken ct)
        {
            throw BuildException();
        }
    }
}
