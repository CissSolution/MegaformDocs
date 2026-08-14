using System.Collections.Generic;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;

namespace MegaForm.NopCommerce.Plugin.Services
{
    /// <summary>
    /// Stub workflow identity resolver for nopCommerce. Wire to Customer/CustomerRole services later.
    /// </summary>
    public class NopCommerceWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            return new UserPrincipal
            {
                UserName = identifier,
                DisplayName = identifier,
                Email = identifier
            };
        }

        public List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId)
        {
            return new List<UserPrincipal>();
        }
    }
}
