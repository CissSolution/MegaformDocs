using System;

namespace MegaForm.Web.Data
{
    /// <summary>
    /// Lightweight user/role storage for the standalone Web host workflow identity
    /// provisioning service. Kept independent of ASP.NET Core Identity so the
    /// MegaForm.AspNetCore.Component package stays dependency-light.
    /// </summary>
    public class WebUserRow
    {
        public int UserId { get; set; }
        public int PortalId { get; set; }
        public string UserName { get; set; }
        public string Email { get; set; }
        public string DisplayName { get; set; }
        public string PasswordHash { get; set; }
        public string SecurityStamp { get; set; }
        public bool IsApproved { get; set; }
        public bool IsDeleted { get; set; }
        public string LastIpAddress { get; set; }
        public string CreatedBy { get; set; }
        public string UpdatedBy { get; set; }
        public DateTime CreatedOnUtc { get; set; }
        public DateTime? UpdatedOnUtc { get; set; }
    }

    public class WebRoleRow
    {
        public int RoleId { get; set; }
        public int PortalId { get; set; }
        public string RoleName { get; set; }
        public string Description { get; set; }
        public bool IsSystem { get; set; }
        public bool IsAutoAssigned { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }

    public class WebUserRoleRow
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int RoleId { get; set; }
        public DateTime? EffectiveDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public DateTime CreatedOnUtc { get; set; }
    }
}
