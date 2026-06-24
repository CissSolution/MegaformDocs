using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using MegaForm.Web.Controllers;
using System.Threading.Tasks;

namespace MegaForm.Web.Middleware
{
    public class SetupMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IWebHostEnvironment _env;

        public SetupMiddleware(RequestDelegate next, IWebHostEnvironment env)
        {
            _next = next; _env = env;
        }

        public async Task InvokeAsync(HttpContext ctx)
        {
            var path = ctx.Request.Path.Value ?? "";
            bool skip = path.StartsWith("/setup", System.StringComparison.OrdinalIgnoreCase)
                     || path.StartsWith("/api",   System.StringComparison.OrdinalIgnoreCase)
                     || path.Contains(".");  // static files

            if (!SetupController.IsSetupComplete(_env) && !skip)
            {
                ctx.Response.Redirect("/setup");
                return;
            }
            await _next(ctx);
        }
    }
}
