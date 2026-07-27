using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.Permissions
{
    /// <summary>
    /// MVC action filter that enforces a MegaForm permission letter.
    /// </summary>
    /// <remarks>
    /// Use on controller actions where the shared API contract cannot easily be changed
    /// to inject <see cref="IAuthorizationService"/> directly.
    /// </remarks>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true, Inherited = true)]
    public class MegaFormAuthorizeAttribute : Attribute, IAsyncAuthorizationFilter, IAuthorizeData
    {
        /// <summary>
        /// The permission letter to require (see <see cref="MegaFormPermissionConstants"/>).
        /// </summary>
        public string Permission { get; }

        /// <summary>
        /// Optional route/query/form parameter name that holds the form id.
        /// When provided, a granular permission check is performed for that form.
        /// </summary>
        public string? FormIdParameter { get; set; }

        /// <summary>
        /// Authorization policy used by ASP.NET Core to authenticate the request.
        /// Ensures both the Umbraco backoffice cookie and the OpenIddict bearer token
        /// schemes are evaluated before the custom permission filter runs.
        /// </summary>
        public string Policy { get; set; } = "MegaFormApi";
        public string? AuthenticationSchemes { get; set; }
        public string? Roles { get; set; }

        public MegaFormAuthorizeAttribute(string permission)
        {
            Permission = permission;
        }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var logger = context.HttpContext.RequestServices.GetService<ILogger<MegaFormAuthorizeAttribute>>();

            // If the ASP.NET Core authorization filter already set a result (e.g. 401 challenge),
            // do not override it with our permission result.
            if (context.Result != null)
            {
                logger?.LogDebug("[MegaFormAuthorize] Skipping permission check because result is already set.");
                return;
            }

            try
            {
                var authService = context.HttpContext.RequestServices.GetRequiredService<IAuthorizationService>();
                var requirement = new MegaFormPermissionRequirement(Permission, FormIdParameter);
                var result = await authService.AuthorizeAsync(context.HttpContext.User, null, new[] { requirement });

                logger?.LogInformation(
                    "[MegaFormAuthorize] Action={Action}, Permission={Permission}, Authenticated={Authenticated}, Succeeded={Succeeded}",
                    context.ActionDescriptor.DisplayName,
                    Permission,
                    context.HttpContext.User?.Identity?.IsAuthenticated,
                    result.Succeeded);

                if (!result.Succeeded)
                {
                    context.Result = new Microsoft.AspNetCore.Mvc.StatusCodeResult(StatusCodes.Status403Forbidden);
                }
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "[MegaFormAuthorize] Exception for action {Action}", context.ActionDescriptor.DisplayName);
                context.Result = new Microsoft.AspNetCore.Mvc.StatusCodeResult(StatusCodes.Status403Forbidden);
            }
        }
    }
}
