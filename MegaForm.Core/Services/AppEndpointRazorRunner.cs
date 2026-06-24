/*
 * MegaForm.Core/Services/AppEndpointRazorRunner.cs
 *
 * Sprint Option A · R4 v20260531-razor-stub — Razor JIT mode for MF_AppEndpoints
 * registered with Mode='razor'. Real Roslyn-driven compilation lands in block 6
 * (needs careful sandboxing + cross-framework loader work). This stub returns a
 * structured "not yet shipped" payload so the dispatcher in
 * AiToolsController.AppEndpoint can branch cleanly without throwing.
 *
 * Badge: AppEndpointRazorRunner v20260531-R4-stub
 */

using System;
using System.Collections.Generic;

namespace MegaForm.Core.Services
{
    public sealed class AppEndpointRazorResult
    {
        public bool Success { get; set; }
        public object Value { get; set; }
        public string ErrorMessage { get; set; }
    }

    public sealed class AppEndpointRazorRunner
    {
        public const string Badge = "AppEndpointRazorRunner v20260531-R4-stub";

        public static readonly AppEndpointRazorRunner Default = new AppEndpointRazorRunner();

        public AppEndpointRazorResult Run(string source, IDictionary<string, string> query)
        {
            // Block 5 surfaces the wiring (controller branch + DB column already
            // supports Mode='razor'). Real Roslyn compile + sandbox land in
            // block 6 — until then we return a deliberate 501-shape so admins
            // can see the route is reachable but the runtime is gated.
            return new AppEndpointRazorResult
            {
                Success = false,
                ErrorMessage = "Razor endpoint runtime is wired but not yet enabled (block 6). " +
                               "Use Mode='sql' for now. Source length: " + (source?.Length ?? 0) +
                               ", query params: " + (query?.Count ?? 0) + ".",
            };
        }
    }
}
