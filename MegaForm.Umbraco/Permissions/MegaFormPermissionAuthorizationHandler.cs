using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// Handles <see cref="MegaFormPermissionRequirement"/> by evaluating the
    /// current Umbraco backoffice user against MegaForm permissions.
    /// </summary>
    public class MegaFormPermissionAuthorizationHandler
        : AuthorizationHandler<MegaFormPermissionRequirement>
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public MegaFormPermissionAuthorizationHandler(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        protected override Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            MegaFormPermissionRequirement requirement)
        {
            var httpContext = _httpContextAccessor.HttpContext;
            if (httpContext == null)
            {
                context.Fail();
                return Task.CompletedTask;
            }

            var permissionService = httpContext.RequestServices.GetRequiredService<IMegaFormPermissionService>();
            bool authorized;
            if (!string.IsNullOrWhiteSpace(requirement.FormIdParameterName))
            {
                var formId = GetIntParameter(httpContext, requirement.FormIdParameterName);
                if (formId.HasValue)
                {
                    authorized = permissionService.HasPermission(requirement.PermissionLetter, formId.Value);
                }
                else
                {
                    // Parameter missing: fall back to global permission.
                    authorized = permissionService.HasPermission(requirement.PermissionLetter);
                }
            }
            else
            {
                authorized = permissionService.HasPermission(requirement.PermissionLetter);
            }

            if (authorized)
            {
                context.Succeed(requirement);
            }
            else
            {
                context.Fail();
            }

            return Task.CompletedTask;
        }

        private static int? GetIntParameter(HttpContext httpContext, string name)
        {
            // Route value
            if (httpContext.GetRouteValue(name) is string routeValue && int.TryParse(routeValue, out var routeInt))
            {
                return routeInt;
            }

            // Query string
            if (httpContext.Request.Query.TryGetValue(name, out var queryValue) &&
                int.TryParse(queryValue.ToString(), out var queryInt))
            {
                return queryInt;
            }

            // Form body
            if (httpContext.Request.HasFormContentType &&
                httpContext.Request.Form.TryGetValue(name, out var formValue) &&
                int.TryParse(formValue.ToString(), out var formInt))
            {
                return formInt;
            }

            return null;
        }
    }
}
