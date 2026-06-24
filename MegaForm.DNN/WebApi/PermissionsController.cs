using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using DotNetNuke.Web.Api;
using MegaForm.Core.Models;
using MegaForm.Core.Services;
using MegaForm.DNN.Data;
using MegaForm.DNN.Services;
using Newtonsoft.Json.Linq;

namespace MegaForm.WebApi
{
    // [v20260527-04] Replaced action-level [DnnModuleAuthorize(Edit)] with
    // class-level [DnnAuthorize(StaticRoles="Administrators")]. DnnModuleAuthorize
    // resolves the active module via TabId/ModuleId headers; those are now
    // dropped by the JS layer to avoid DNN's cross-portal validation 400
    // ("Specified page is not in this site"). For multi-portal correctness,
    // server reads portalId from ?portalId=N query via ResolveTargetPortalId.
    [DnnAuthorize(StaticRoles = "Administrators")]
    public class PermissionsController : DnnApiController
    {
        private int ResolveTargetPortalId()
        {
            var fallback = PortalSettings != null ? PortalSettings.PortalId : 0;
            try
            {
                var query = Request != null && Request.RequestUri != null
                    ? Request.RequestUri.ParseQueryString()
                    : null;
                if (query == null) return fallback;
                var raw = query["portalId"] ?? query["portalid"] ?? query["PortalId"];
                int pid;
                if (string.IsNullOrEmpty(raw) || !int.TryParse(raw, out pid) || pid < 0) return fallback;
                if (pid == fallback) return fallback;
                var caller = UserInfo;
                var allowed = caller != null && (caller.IsSuperUser || caller.IsInRole("Administrators"));
                return allowed ? pid : fallback;
            }
            catch { return fallback; }
        }

        private UserContext CurrentUser
        {
            get
            {
                string ip = string.Empty;
                if (Request.Properties.ContainsKey("MS_HttpContext"))
                {
                    var ctx = Request.Properties["MS_HttpContext"] as System.Web.HttpContextWrapper;
                    ip = ctx != null && ctx.Request != null ? (ctx.Request.UserHostAddress ?? string.Empty) : string.Empty;
                }

                return new UserContext
                {
                    UserId = UserInfo != null ? UserInfo.UserID : 0,
                    UserName = UserInfo != null ? (UserInfo.Username ?? string.Empty) : string.Empty,
                    DisplayName = UserInfo != null ? (UserInfo.DisplayName ?? string.Empty) : string.Empty,
                    Email = UserInfo != null ? (UserInfo.Email ?? string.Empty) : string.Empty,
                    IsAuthenticated = UserInfo != null && UserInfo.UserID > 0,
                    IsAdmin = UserInfo != null && UserInfo.IsInRole("Administrators"),
                    IsSuperUser = UserInfo != null && UserInfo.IsSuperUser,
                    Roles = UserInfo != null && UserInfo.Roles != null ? UserInfo.Roles.ToList() : new List<string>(),
                    IpAddress = ip
                };
            }
        }

        [HttpGet]
        public HttpResponseMessage Get(int formId = 0)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required." });

            var permissions = PermissionCatalogService.NormalizeRules(formId, FormRepository.GetFormPermissions(formId));
            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                permissions = permissions
            });
        }

        [HttpGet]
        public HttpResponseMessage Catalog(int formId = 0)
        {
            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required." });

            var portalId = ResolveTargetPortalId();
            var permissions = PermissionCatalogService.NormalizeRules(formId, FormRepository.GetFormPermissions(formId));
            var provider = new DnnPermissionPrincipalCatalogProvider(portalId);
            var service = new PermissionCatalogService(provider);
            var catalog = service.GetCatalog(formId, portalId, CurrentUser);

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                permissions = permissions,
                catalog = catalog
            });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public HttpResponseMessage Save([FromBody] JObject body)
        {
            var formId = body?["formId"]?.ToObject<int>() ?? 0;
            var permissions = body?["permissions"]?.ToObject<List<FormPermissionInfo>>() ?? new List<FormPermissionInfo>();

            if (formId <= 0)
                return Request.CreateResponse(HttpStatusCode.BadRequest, new { error = "formId is required." });

            var normalized = PermissionCatalogService.NormalizeRules(formId, permissions);
            FormRepository.SaveFormPermissions(formId, normalized);

            FormRepository.InsertAuditLog(new AuditLogInfo
            {
                Timestamp = System.DateTime.UtcNow,
                UserId = CurrentUser.UserId,
                UserName = CurrentUser.UserName,
                IpAddress = CurrentUser.IpAddress,
                Action = "update_permissions",
                EntityType = "form",
                EntityId = formId,
                FormId = formId,
                Details = normalized.Count + " permission rules"
            });

            return Request.CreateResponse(HttpStatusCode.OK, new
            {
                success = true,
                permissions = normalized
            });
        }
    }
}
