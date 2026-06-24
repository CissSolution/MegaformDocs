using System;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [FastPaint / cold-start v20260619] Pre-JIT the anonymous public-form critical
    /// path so the FIRST real visitor after a host restart does not pay the .NET JIT +
    /// EF + Blazor-prerender warm-up cost (the dominant component of the "cold load is
    /// ~3.4s but a warm reload is &lt;1s" symptom).
    ///
    /// WHY a self-HTTP warmer (not a DbContext probe): on Oqtane, <c>MegaFormDbContext</c>
    /// derives from <c>DBContextBase</c>, whose provider/connection is resolved PER-REQUEST
    /// from the active tenant. At host startup there is NO request scope, so a DbContext
    /// created here has no provider and any query throws (see <see cref="OqtaneKbSeederHostedService"/>).
    /// Issuing real, anonymous, loopback HTTP GETs AFTER the server is listening runs the
    /// full pipeline INSIDE a genuine request scope — routing, MVC, the tenant DbContext,
    /// the form schema resolve/serialize, and the Blazor Server prerender of the home page —
    /// JIT-compiling exactly the code an anonymous form visitor hits. The requests are
    /// read-only and unauthenticated, so warming the anon path is side-effect free.
    ///
    /// Entirely fail-soft: any error is swallowed and logged; it never affects the host.
    /// Opt out with the environment variable MEGAFORM_DISABLE_WARMUP=1.
    /// </summary>
    public class MegaFormWarmupHostedService : IHostedService
    {
        private readonly IServer _server;
        private readonly IHostApplicationLifetime _lifetime;
        private readonly ILogger<MegaFormWarmupHostedService> _logger;

        // Anonymous, read-only endpoints that exercise the public-form critical path.
        // A 404/403 still JIT-compiles the routing + MVC + EF-in-request-scope pipeline,
        // so the exact status code is irrelevant — we only care that the path runs once.
        private static readonly string[] WarmPaths =
        {
            "/",                                 // Blazor Server prerender pipeline (home)
            "/api/MegaForm/Schema/1",            // API + tenant DbContext + schema resolve + JSON serialize
            "/api/MegaForm/Form/List?siteId=1",  // form-list controller path (403 anon is fine — still JITs)
        };

        public MegaFormWarmupHostedService(
            IServer server,
            IHostApplicationLifetime lifetime,
            ILogger<MegaFormWarmupHostedService> logger)
        {
            _server = server;
            _lifetime = lifetime;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            if (string.Equals(Environment.GetEnvironmentVariable("MEGAFORM_DISABLE_WARMUP"), "1", StringComparison.Ordinal))
            {
                _logger.LogInformation("[MegaForm Warmup] disabled via MEGAFORM_DISABLE_WARMUP=1");
                return Task.CompletedTask;
            }

            // ApplicationStarted fires only after every IHostedService has started AND the
            // server is listening, so the address feature below is populated by then.
            _lifetime.ApplicationStarted.Register(() =>
                _ = Task.Run(async () =>
                {
                    try { await WarmAsync(); }
                    catch (Exception ex) { _logger.LogInformation("[MegaForm Warmup] skipped ({Reason})", ex.GetType().Name); }
                }));

            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        private async Task WarmAsync()
        {
            // Let the host settle (migrations, KB lazy seed, etc.) before generating load.
            await Task.Delay(TimeSpan.FromSeconds(3));

            var baseUrl = ResolveBaseUrl();
            if (string.IsNullOrEmpty(baseUrl))
            {
                _logger.LogInformation("[MegaForm Warmup] no resolvable loopback address; skipping");
                return;
            }

            // Ignore TLS validation for the loopback warm-up (self-signed dev certs).
            using var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = (_, _, _, _) => true
            };
            using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("MegaForm-Warmup/1.0");

            var sw = System.Diagnostics.Stopwatch.StartNew();
            foreach (var path in WarmPaths)
            {
                var url = baseUrl.TrimEnd('/') + path;
                try
                {
                    using var resp = await http.GetAsync(url, HttpCompletionOption.ResponseContentRead);
                    _logger.LogInformation("[MegaForm Warmup] {Url} -> {Status}", path, (int)resp.StatusCode);
                }
                catch (Exception ex)
                {
                    _logger.LogInformation("[MegaForm Warmup] {Url} failed ({Reason})", path, ex.GetType().Name);
                }
            }
            sw.Stop();
            _logger.LogInformation("[MegaForm Warmup] anon form path pre-JITed in {Ms}ms via {Base}", sw.ElapsedMilliseconds, baseUrl);
        }

        /// <summary>
        /// Pick a loopback-reachable base URL from the server's bound addresses.
        /// Prefers http over https (no cert round-trip) and rewrites wildcard hosts
        /// (0.0.0.0, [::], *, +) to 127.0.0.1 so the request actually connects.
        /// </summary>
        private string ResolveBaseUrl()
        {
            var addresses = _server.Features.Get<IServerAddressesFeature>()?.Addresses;
            if (addresses == null || addresses.Count == 0) return null;

            string Normalize(string a) => a
                .Replace("://0.0.0.0", "://127.0.0.1")
                .Replace("://[::]", "://127.0.0.1")
                .Replace("://+", "://127.0.0.1")
                .Replace("://*", "://127.0.0.1");

            var list = addresses.Select(Normalize).ToList();
            return list.FirstOrDefault(a => a.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                   ?? list.FirstOrDefault();
        }
    }
}
