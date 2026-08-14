using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace MegaForm.Umbraco.Middleware
{
    /// <summary>
    /// Rewrites shared TS UI default routes to the Umbraco-mounted MegaForm API paths.
    /// The shared dashboard/builder/AI code defaults to /api/MegaForm/ on Oqtane/Web;
    /// this middleware makes those same calls land on /umbraco/MegaForm/MegaFormApi/
    /// without requiring every host page to inject a platform-specific apiBase.
    /// </summary>
    public class MegaFormApiRouteRewriteMiddleware
    {
        private readonly RequestDelegate _next;

        public MegaFormApiRouteRewriteMiddleware(RequestDelegate next)
        {
            _next = next ?? throw new ArgumentNullException(nameof(next));
        }

        public Task InvokeAsync(HttpContext context)
        {
            var path = context.Request.Path.Value ?? string.Empty;

            // Main MegaForm API surface used by builder/dashboard/workflow/reports.
            if (path.StartsWith("/api/MegaForm/", StringComparison.OrdinalIgnoreCase))
            {
                var remainder = path.Substring("/api/MegaForm/".Length);
                // PaymentController owns /api/megaform/payments/* directly (widget default URLs);
                // rewriting it to MegaFormApi would 404, so let it through untouched.
                if (!remainder.StartsWith("payments/", StringComparison.OrdinalIgnoreCase))
                {
                    context.Request.Path = "/umbraco/MegaForm/MegaFormApi/" + remainder;
                }
            }
            // Popup controllers (Subform, RazorWidget, ExternalTable, etc.) used by builder/AI tools.
            else if (path.StartsWith("/api/MegaFormPopup/", StringComparison.OrdinalIgnoreCase))
            {
                var remainder = path.Substring("/api/MegaFormPopup/".Length);
                context.Request.Path = "/umbraco/MegaForm/MegaFormApi/" + remainder;
            }

            return _next(context);
        }
    }
}
