using System;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Web.HostedServices
{
    /// <summary>
    /// [WebWarmup v20260710] Pre-JIT the anonymous public-form critical path so the
    /// first real visitor after a host restart does not pay the cold-start cost.
    /// Adapted from the Oqtane warmup service for the standalone Web host.
    /// </summary>
    public class MegaFormWarmupHostedService : IHostedService
    {
        private readonly IServer _server;
        private readonly IHostApplicationLifetime _lifetime;
        private readonly ILogger<MegaFormWarmupHostedService> _logger;

        private static readonly string[] WarmPaths =
        {
            "/",
            "/api/MegaForm/Schema/1",
            "/api/MegaForm/Form/ListAll"
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
            await Task.Delay(TimeSpan.FromSeconds(3));

            var baseUrl = ResolveBaseUrl();
            if (string.IsNullOrEmpty(baseUrl))
            {
                _logger.LogInformation("[MegaForm Warmup] no resolvable loopback address; skipping");
                return;
            }

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

            await WarmSitePagesAsync(http, baseUrl);

            sw.Stop();
            _logger.LogInformation("[MegaForm Warmup] anon form path pre-JITed in {Ms}ms via {Base}", sw.ElapsedMilliseconds, baseUrl);
        }

        private const int MaxPrewarmPages = 40;

        private async Task WarmSitePagesAsync(HttpClient http, string baseUrl)
        {
            try
            {
                var root = baseUrl.TrimEnd('/');
                string xml;
                using (var resp = await http.GetAsync(root + "/sitemap.xml", HttpCompletionOption.ResponseContentRead))
                {
                    if (!resp.IsSuccessStatusCode)
                    {
                        _logger.LogInformation("[MegaForm Warmup] sitemap.xml -> {Status}; page prewarm skipped", (int)resp.StatusCode);
                        return;
                    }
                    xml = await resp.Content.ReadAsStringAsync();
                }

                var paths = System.Text.RegularExpressions.Regex.Matches(xml, "<loc>\\s*(.*?)\\s*</loc>")
                    .Select(m => m.Groups[1].Value)
                    .Select(loc => Uri.TryCreate(loc, UriKind.Absolute, out var u) ? u.PathAndQuery : loc)
                    .Where(p => p.StartsWith("/", StringComparison.Ordinal) && p != "/")
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(MaxPrewarmPages)
                    .ToList();

                var ok = 0;
                foreach (var path in paths)
                {
                    try
                    {
                        using var resp = await http.GetAsync(root + path, HttpCompletionOption.ResponseContentRead);
                        if (resp.IsSuccessStatusCode) ok++;
                    }
                    catch { }
                }
                _logger.LogInformation("[MegaForm Warmup] prewarmed {Ok}/{Total} site pages", ok, paths.Count);
            }
            catch (Exception ex)
            {
                _logger.LogInformation("[MegaForm Warmup] page prewarm skipped ({Reason})", ex.GetType().Name);
            }
        }

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
