using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Services.Blog;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Oqtane.Infrastructure;
using Oqtane.Repository;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// Oqtane hosted service that processes blog post publishing schedules
    /// and rolls up reader-event analytics every 5 minutes.
    /// </summary>
    public class BlogScheduledHostedService : IHostedService, IDisposable
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<BlogScheduledHostedService> _logger;
        private readonly IConfiguration _configuration;
        private Timer _timer;

        public BlogScheduledHostedService(
            IServiceProvider serviceProvider,
            ILogger<BlogScheduledHostedService> logger,
            IConfiguration configuration = null)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _configuration = configuration;
        }

        /// <summary>
        /// 🔴 OFF BY DEFAULT, AND IT MUST STAY OFF UNTIL THE DATE BUG BELOW IS FIXED.
        ///
        /// Two independent defects were found here on 2026-07-31, and the second one is why this
        /// switch exists:
        ///
        ///  1. The tenant was never set, so every run threw "No database provider has been
        ///     configured for this DbContext" and was swallowed as "Hosted service work failed."
        ///     once every five minutes. Neither the analytics rollup nor scheduled publishing has
        ///     ever run on Oqtane. That is fixed in DoWork below.
        ///
        ///  2. With the rollup finally running, it CORRUPTS EVERY DATE ON THE POSTS IT TOUCHES.
        ///     BlogAnalyticsRollupService rebuilds a post's DataJson from resolved typed values and
        ///     writes dates back as culture-formatted text. Measured on a vi-VN server:
        ///         before  "publish_date":"2024-12-12T00:00:00"     (ISO, sortable)
        ///         after   "publish_date":"15/12/2024 12:00:00 SA"  (vi-VN, not sortable)
        ///     The blog listing then died with
        ///         InvalidOperationException: Failed to compare two elements in the array
        ///     because the sort on publish_date was comparing ISO strings with vi-VN strings. The
        ///     public page and the whole editorial console went blank for every visitor.
        ///
        /// The fix for (2) belongs in MegaForm.Core (SubmissionDataResolver must hand back real
        /// DateTime values, or the rollup must serialise them round-trip safe), and Core is frozen
        /// pending review — so the scheduler is gated instead of shipped broken. Read tracking
        /// still writes clean reader-events rows the whole time; they simply are not totalled into
        /// view_count until this is switched on.
        ///
        /// Set MegaForm:Blog:EnableScheduler to true in appsettings once Core is fixed.
        /// </summary>
        private bool SchedulerEnabled =>
            string.Equals(_configuration?["MegaForm:Blog:EnableScheduler"], "true",
                StringComparison.OrdinalIgnoreCase);

        public Task StartAsync(CancellationToken cancellationToken)
        {
            if (!SchedulerEnabled)
            {
                _logger.LogWarning("[MegaForm Blog] Scheduler disabled (MegaForm:Blog:EnableScheduler is not true). "
                    + "Scheduled publishing and the analytics rollup will not run. See BlogScheduledHostedService for why.");
                return Task.CompletedTask;
            }

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
                    // 🔴 THE TENANT MUST BE SET BEFORE ANY DbContext IS TOUCHED.
                    //
                    // Every Oqtane DbContext — including MegaForm's own — resolves its connection
                    // string from the CURRENT REQUEST's tenant. A timer callback has no request, so
                    // the very first query throws
                    //     "No database provider has been configured for this DbContext"
                    // and the outer catch logged it as "[MegaForm Blog] Hosted service work failed."
                    // once every five minutes, forever. Nothing else reported a problem, so the
                    // effect went unnoticed: scheduled publishing and the blog analytics rollup have
                    // NEVER run on Oqtane. Found 2026-07-31 while wiring read tracking — reader
                    // events were being written correctly and no view_count ever moved.
                    //
                    // ITenantRepository reads the MASTER database, which is not tenant-scoped, so it
                    // is the one thing safe to call before a tenant exists.
                    var tenantRepo = scope.ServiceProvider.GetService<ITenantRepository>();
                    var tenantManager = scope.ServiceProvider.GetService<ITenantManager>();
                    if (tenantRepo == null || tenantManager == null)
                    {
                        _logger.LogWarning("[MegaForm Blog] Tenant services unavailable; skipping processing.");
                        return;
                    }

                    var publishService = scope.ServiceProvider.GetRequiredService<IScheduledPublishService>();
                    var analyticsService = scope.ServiceProvider.GetRequiredService<IAnalyticsRollupService>();

                    foreach (var tenant in tenantRepo.GetTenants())
                    {
                        if (tenant == null) continue;
                        tenantManager.SetTenant(tenant.TenantId);

                        var portalIds = ResolvePortalIds(scope);
                        if (portalIds.Count == 0) continue;

                        foreach (var portalId in portalIds)
                        {
                            try
                            {
                                int published = publishService.ProcessScheduledPostsAsync(portalId).GetAwaiter().GetResult();
                                int updated = analyticsService.RollupBlogAnalyticsAsync(portalId).GetAwaiter().GetResult();
                                _logger.LogInformation("[MegaForm Blog] Tenant {TenantId} site {SiteId}: published={Published}, analyticsUpdated={Updated}", tenant.TenantId, portalId, published, updated);
                            }
                            catch (Exception ex)
                            {
                                _logger.LogError(ex, "[MegaForm Blog] Site {SiteId} processing failed.", portalId);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm Blog] Hosted service work failed.");
            }
        }

        /// <summary>
        /// The portals that could have a blog, resolved from MegaForm's OWN data.
        ///
        /// 🔴 DO NOT go back to Oqtane's ISiteRepository.GetSites() here. It resolves its DbContext
        /// from the CURRENT REQUEST's tenant, and a timer callback has no request — so the call
        /// throws
        ///     "No database provider has been configured for this DbContext"
        /// which the outer catch swallowed as "[MegaForm Blog] Hosted service work failed." every
        /// five minutes, forever. The effect: scheduled publishing and the analytics rollup have
        /// never once run on Oqtane, silently. Found 2026-07-31 while wiring blog read tracking —
        /// reader-events were being written correctly and no view_count ever moved.
        ///
        /// MegaForm's own repositories take IDbContextFactory, which is exactly the seam that
        /// works without a request, so the portal list comes from there instead. A portal with no
        /// MegaForm app cannot have a blog, so this list is not narrower than the old one in any
        /// way that matters.
        /// </summary>
        private List<int> ResolvePortalIds(IServiceScope scope)
        {
            try
            {
                var factory = scope.ServiceProvider
                    .GetService<IDbContextFactory<MegaForm.Oqtane.Server.Data.MegaFormDbContext>>();
                if (factory == null)
                {
                    _logger.LogWarning("[MegaForm Blog] No MegaFormDbContext factory registered.");
                    return new List<int>();
                }

                using (var db = factory.CreateDbContext())
                {
                    return db.AppDefinitions
                        .Select(a => a.PortalId)
                        .Distinct()
                        .ToList();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm Blog] Could not resolve the portal list.");
                return new List<int>();
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
