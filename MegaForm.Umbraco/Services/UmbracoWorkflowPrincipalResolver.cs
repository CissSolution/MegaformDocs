using System.Collections.Generic;
using MegaForm.Core.Interfaces;

namespace MegaForm.Umbraco.Services
{
    /// <summary>
    /// Umbraco workflow principal resolver.
    /// Phase 1: minimal implementation (no central user directory lookup).
    /// Phase 2/3: integrate with Umbraco back-office users / members.
    /// </summary>
    public class UmbracoWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            // Phase 1: no central user directory lookup.
            return null;
        }

        public List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId)
        {
            // Phase 1: no central role membership store.
            return new List<UserPrincipal>();
        }
    }
}
