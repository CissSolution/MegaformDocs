using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Services.Blog;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Web.HostedServices
{
    /// <summary>
    /// [WebBlogScheduler v20260710] Processes blog post publishing schedules and
    /// rolls up reader-event analytics every 5 minutes for the standalone Web host.
    /// Mirrors Oqtane's BlogScheduledHostedService.
    /// </summary>
    public class BlogScheduledHostedService : IHostedService, IDisposable
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<BlogScheduledHostedService> _logger;
        private Timer _timer;

        public BlogScheduledHostedService(IServiceProvider serviceProvider, ILogger<BlogScheduledHostedService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("[MegaForm Blog] Hosted service starting.");
            _timer = new Timer(DoWork, null, TimeSpan.Zero, TimeSpan.FromMinutes(5));
            return Task.CompletedTask;
        }

        private void DoWork(object state)
        {
            try
            {
                using (var scope = _serviceProvider.CreateScope())
                {
                    var publishService = scope.ServiceProvider.GetRequiredService<IScheduledPublishService>();
                    var analyticsService = scope.ServiceProvider.GetRequiredService<IAnalyticsRollupService>();

                    var portalId = 0; // Standalone Web host uses a single default site.
                    try
                    {
                        int published = publishService.ProcessScheduledPostsAsync(portalId).GetAwaiter().GetResult();
                        int updated = analyticsService.RollupBlogAnalyticsAsync(portalId).GetAwaiter().GetResult();
                        _logger.LogInformation("[MegaForm Blog] Site {SiteId}: published={Published}, analyticsUpdated={Updated}", portalId, published, updated);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[MegaForm Blog] Site {SiteId} processing failed.", portalId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm Blog] Hosted service work failed.");
            }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("[MegaForm Blog] Hosted service stopping.");
            _timer?.Change(Timeout.Infinite, 0);
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            _timer?.Dispose();
        }
    }
}
