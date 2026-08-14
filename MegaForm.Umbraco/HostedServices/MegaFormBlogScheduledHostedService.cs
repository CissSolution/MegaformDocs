using System;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Services.Blog;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Umbraco.HostedServices
{
    /// <summary>
    /// Processes blog post publishing schedules and rolls up reader-event analytics
    /// every 5 minutes for the Umbraco host. Mirrors the Web/Oqtane scheduler.
    /// </summary>
    public class MegaFormBlogScheduledHostedService : IHostedService, IDisposable
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<MegaFormBlogScheduledHostedService> _logger;
        private Timer _timer;

        public MegaFormBlogScheduledHostedService(IServiceProvider serviceProvider, ILogger<MegaFormBlogScheduledHostedService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("[MegaForm Blog Umbraco] Hosted service starting.");
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

                    var portalId = 0; // Umbraco host runs as a single default site in this integration.
                    try
                    {
                        int published = publishService.ProcessScheduledPostsAsync(portalId).GetAwaiter().GetResult();
                        int updated = analyticsService.RollupBlogAnalyticsAsync(portalId).GetAwaiter().GetResult();
                        _logger.LogInformation("[MegaForm Blog Umbraco] Site {SiteId}: published={Published}, analyticsUpdated={Updated}", portalId, published, updated);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "[MegaForm Blog Umbraco] Site {SiteId} processing failed.", portalId);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm Blog Umbraco] Hosted service work failed.");
            }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("[MegaForm Blog Umbraco] Hosted service stopping.");
            _timer?.Change(Timeout.Infinite, 0);
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            _timer?.Dispose();
        }
    }
}
