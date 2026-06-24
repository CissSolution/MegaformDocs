using System;
using MegaForm.Core.Services;

namespace MegaForm.Core.Workflow
{
    public enum WorkflowUserLookupMode
    {
        Auto = 0,
        UserName = 1,
        Email = 2,
        UserId = 3
    }

    public class AddRoleNodeConfig
    {
        public string RoleName { get; set; }
        public string Description { get; set; }
        public string ResultRoleNameVariable { get; set; }
        public bool IsSystemRole { get; set; }

        public AddRoleNodeConfig()
        {
            Description = string.Empty;
            ResultRoleNameVariable = "provisioned.roleName";
        }
    }

    public class AddUserNodeConfig
    {
        public string UserName { get; set; }
        public string Email { get; set; }
        public string DisplayName { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Password { get; set; }
        public bool ApproveUser { get; set; }
        public bool UpdateIfExists { get; set; }
        public bool GeneratePasswordIfEmpty { get; set; }
        public string ResultUserIdVariable { get; set; }
        public string ResultUserNameVariable { get; set; }
        public string ResultEmailVariable { get; set; }
        public string ResultPasswordVariable { get; set; }

        public AddUserNodeConfig()
        {
            ApproveUser = true;
            UpdateIfExists = true;
            GeneratePasswordIfEmpty = true;
            ResultUserIdVariable = "provisioned.userId";
            ResultUserNameVariable = "provisioned.userName";
            ResultEmailVariable = "provisioned.email";
            ResultPasswordVariable = "provisioned.password";
        }
    }

    public class AddUserToRoleNodeConfig
    {
        public string UserIdentifier { get; set; }
        public string RoleName { get; set; }
        public WorkflowUserLookupMode LookupMode { get; set; }
        public bool AutoCreateRole { get; set; }
        public string ResultMembershipVariable { get; set; }

        public AddUserToRoleNodeConfig()
        {
            LookupMode = WorkflowUserLookupMode.Auto;
            AutoCreateRole = true;
            ResultMembershipVariable = "provisioned.membership";
        }
    }

    public class WorkflowRoleProvisionRequest
    {
        public int PortalId { get; set; }
        public UserContext Actor { get; set; }
        public string RoleName { get; set; }
        public string Description { get; set; }
        public bool IsSystemRole { get; set; }
    }

    public class WorkflowProvisionedRole
    {
        public int? RoleId { get; set; }
        public string RoleName { get; set; }
        public string Description { get; set; }
        public bool Created { get; set; }
        public bool AlreadyExisted { get; set; }
    }

    public class WorkflowUserProvisionRequest
    {
        public int PortalId { get; set; }
        public UserContext Actor { get; set; }
        public string UserName { get; set; }
        public string Email { get; set; }
        public string DisplayName { get; set; }
        public string FirstName { get; set; }
        public string LastName { get; set; }
        public string Password { get; set; }
        public bool ApproveUser { get; set; }
        public bool UpdateIfExists { get; set; }
        public bool GeneratePasswordIfEmpty { get; set; }
    }

    public class WorkflowProvisionedUser
    {
        public int? UserId { get; set; }
        public string UserName { get; set; }
        public string Email { get; set; }
        public string DisplayName { get; set; }
        public string Password { get; set; }
        public bool Created { get; set; }
        public bool Updated { get; set; }
        public bool AlreadyExisted { get; set; }
    }

    public class WorkflowUserRoleProvisionRequest
    {
        public int PortalId { get; set; }
        public UserContext Actor { get; set; }
        public string UserIdentifier { get; set; }
        public WorkflowUserLookupMode LookupMode { get; set; }
        public string RoleName { get; set; }
        public bool AutoCreateRole { get; set; }
    }

    public class WorkflowProvisionedMembership
    {
        public int? UserId { get; set; }
        public int? RoleId { get; set; }
        public string UserName { get; set; }
        public string RoleName { get; set; }
        public bool Added { get; set; }
        public bool AlreadyInRole { get; set; }
    }
}
