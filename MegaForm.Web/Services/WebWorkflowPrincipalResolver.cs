using System.Collections.Generic;
using MegaForm.Core.Interfaces;

namespace MegaForm.Web.Services
{
    /// <summary>
    /// Web platform resolver for workflow principals.
    /// The Web host does not ship with a role/membership store by default,
    /// so role resolution returns empty. Override this if the host provides
    /// ASP.NET Core Identity or a custom user directory.
    /// </summary>
    public class WebWorkflowPrincipalResolver : IWorkflowPrincipalResolver
    {
        public UserPrincipal ResolveUser(string identifier, int portalId)
        {
            // Web host has no central user directory by default.
            // If ASP.NET Core Identity is wired, replace this implementation.
            return null;
        }

        public List<UserPrincipal> ResolveRoleMembers(string roleName, int portalId)
        {
            // Web host has no central role membership store by default.
            return new List<UserPrincipal>();
        }
    }
}
