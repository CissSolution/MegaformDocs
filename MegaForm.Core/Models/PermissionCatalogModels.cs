using System.Collections.Generic;

namespace MegaForm.Core.Models
{
    public class PermissionCatalogInfo
    {
        public int FormId { get; set; }
        public string Badge { get; set; }
        public PermissionActorInfo CurrentUser { get; set; } = new PermissionActorInfo();
        public List<PermissionDefinitionInfo> PermissionTypes { get; set; } = new List<PermissionDefinitionInfo>();
        public List<PermissionScopeInfo> Scopes { get; set; } = new List<PermissionScopeInfo>();
        public List<PermissionPrincipalInfo> Principals { get; set; } = new List<PermissionPrincipalInfo>();
    }

    public class PermissionActorInfo
    {
        public int UserId { get; set; }
        public string UserName { get; set; }
        public string DisplayName { get; set; }
        public string Email { get; set; }
        public bool IsAuthenticated { get; set; }
        public bool IsAdmin { get; set; }
        public bool IsSuperUser { get; set; }
        public List<string> Roles { get; set; } = new List<string>();
    }

    public class PermissionDefinitionInfo
    {
        public string Key { get; set; }
        public string Label { get; set; }
        public string Description { get; set; }
        public bool SupportsScope { get; set; }
        public string DefaultScope { get; set; }
    }

    public class PermissionScopeInfo
    {
        public string Key { get; set; }
        public string Label { get; set; }
        public string Description { get; set; }
    }

    public class PermissionPrincipalInfo
    {
        public string PrincipalType { get; set; }
        public string PrincipalId { get; set; }
        public string DisplayName { get; set; }
        public string Description { get; set; }
        public string RoleName { get; set; }
        public int? UserId { get; set; }
        public bool IsSpecial { get; set; }
        public bool IsRole { get; set; }
        public bool IsUser { get; set; }
        public bool IsCurrentUser { get; set; }
    }
}
