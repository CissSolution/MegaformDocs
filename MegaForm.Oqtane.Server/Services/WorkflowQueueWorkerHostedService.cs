using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Oqtane.Infrastructure;
using Oqtane.Repository;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [CloudReady A1 v20260804] Oqtane worker for the DB-backed workflow execution
    /// queue (MF_WorkflowQueue). Mirrors MegaForm.Web's WorkflowQueueWorkerService:
    /// claims items with a conditional UPDATE lease, executes each in a scoped
    /// IWorkflowEngine call with the exact arguments SubmissionProcessor would have
    /// passed, requeues with backoff on failure (5 attempts → 'failed').
    ///
    /// OFF BY DEFAULT — Oqtane keeps sync workflow execution unless the operator sets
    /// MegaForm:Workflow:ExecutionMode=queue. Follows the BlogScheduledHostedService
    /// pattern: the tenant MUST be set before any DbContext is touched (a timer
    /// callback has no request, so an unset tenant makes every query throw).
    /// </summary>
    public class WorkflowQueueWorkerHostedService : IHostedService, IDisposable
    {
        private const int BatchSize = 10;
        private const int MaxAttempts = 5;
        private static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(60);

        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<WorkflowQueueWorkerHostedService> _logger;
        private readonly IConfiguration _configuration;
        private readonly string _instanceId;
        private Timer _timer;

        public WorkflowQueueWorkerHostedService(
            IServiceProvider serviceProvider,
            ILogger<WorkflowQueueWorkerHostedService> logger,
            IConfiguration configuration = null)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _configuration = configuration;
            _instanceId = ("oqtane-" + Environment.MachineName + "-" + Guid.NewGuid().ToString("N"));
            if (_instanceId.Length > 64) _instanceId = _instanceId.Substring(0, 64);
        }

        private bool QueueModeEnabled =>
            string.Equals(_configuration?["MegaForm:Workflow:ExecutionMode"], "queue",
                StringComparison.OrdinalIgnoreCase);

        private TimeSpan PollInterval
        {
            get
            {
                var configured = _configuration?["MegaForm:Workflow:QueuePollSeconds"];
                if (!string.IsNullOrWhiteSpace(configured) && int.TryParse(configured, out var parsed) && parsed > 0)
                    return TimeSpan.FromSeconds(parsed);
                return TimeSpan.FromSeconds(5);
            }
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            if (!QueueModeEnabled)
            {
                // Sync is the default and must stay the default; nothing to poll.
                return Task.CompletedTask;
            }

            _logger.LogInformation("[MegaForm WorkflowQueue] Hosted service starting (instance {InstanceId}).", _instanceId);
            _timer = new Timer(DoWork, null, PollInterval, PollInterval);
            return Task.CompletedTask;
        }

        private void DoWork(object state)
        {
            try
            {
                using (var outerScope = _serviceProvider.CreateScope())
                {
                    // See BlogScheduledHostedService: ITenantRepository reads the MASTER
                    // database, which is not tenant-scoped, so it is the one thing safe to
                    // call before a tenant exists.
                    var tenantRepo = outerScope.ServiceProvider.GetService<ITenantRepository>();
                    var tenantManager = outerScope.ServiceProvider.GetService<ITenantManager>();
                    if (tenantRepo == null || tenantManager == null)
                    {
                        _logger.LogWarning("[MegaForm WorkflowQueue] Tenant services unavailable; skipping poll.");
                        return;
                    }

                    foreach (var tenant in tenantRepo.GetTenants())
                    {
                        if (tenant == null) continue;

                        try
                        {
                            using (var scope = _serviceProvider.CreateScope())
                            {
                                scope.ServiceProvider.GetRequiredService<ITenantManager>().SetTenant(tenant.TenantId);
                                ProcessTenant(scope.ServiceProvider);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "[MegaForm WorkflowQueue] Tenant {TenantId} processing failed.", tenant.TenantId);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm WorkflowQueue] Hosted service work failed.");
            }
        }

        private void ProcessTenant(IServiceProvider services)
        {
            var factory = services.GetService<IDbContextFactory<MegaFormDbContext>>();
            if (factory == null) return;

            using (var db = factory.CreateDbContext())
            {
                var now = DateTime.UtcNow;
                var leaseUntil = now.Add(LeaseDuration);

                // Candidates: fresh items (no pending backoff) + expired leases from dead
                // workers. A requeued-for-retry row keeps its backoff in LeaseUntilUtc, so
                // it only becomes a candidate again once that time has passed.
                var candidates = db.WorkflowQueue.AsNoTracking()
                    .Where(q => (q.Status == "queued" && (q.LeaseUntilUtc == null || q.LeaseUntilUtc < now)) ||
                                (q.Status == "leased" && q.LeaseUntilUtc < now))
                    .OrderBy(q => q.QueueId)
                    .Take(BatchSize)
                    .ToList();

                foreach (var candidate in candidates)
                {
                    // Conditional UPDATE = the claim. RowsAffected == 1 means we won.
                    var claimed = db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowQueue SET Status = 'leased', LeasedBy = {0}, LeaseUntilUtc = {1} " +
                        "WHERE QueueId = {2} AND ((Status = 'queued' AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc < {3})) " +
                        "OR (Status = 'leased' AND LeaseUntilUtc < {3}))",
                        _instanceId, leaseUntil, candidate.QueueId, now);
                    if (claimed != 1) continue;

                    ProcessItem(db, services, candidate);
                }
            }
        }

        private void ProcessItem(MegaFormDbContext db, IServiceProvider services, WorkflowQueueRow item)
        {
            try
            {
                var request = JsonConvert.DeserializeObject<WorkflowExecutionRequest>(item.PayloadJson);
                if (request == null)
                    throw new InvalidOperationException("Queue payload did not deserialize.");

                var engine = services.GetRequiredService<IWorkflowEngine>();
                // Mirror the inline path's 300s execution budget.
                using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(300)))
                {
                    engine.ExecuteAsync(
                        request.FormId,
                        request.SubmissionId,
                        request.FormData ?? new Dictionary<string, object>(),
                        cts.Token).GetAwaiter().GetResult();
                }

                db.Database.ExecuteSqlRaw(
                    "UPDATE MF_WorkflowQueue SET Status = 'done', ProcessedAtUtc = {0}, LeasedBy = NULL, LeaseUntilUtc = NULL " +
                    "WHERE QueueId = {1}",
                    DateTime.UtcNow, item.QueueId);

                _logger.LogInformation(
                    "[MegaForm WorkflowQueue] Item {QueueId} done (form {FormId}, submission {SubmissionId}).",
                    item.QueueId, item.FormId, item.SubmissionId);
            }
            catch (Exception ex)
            {
                var attempts = item.AttemptCount + 1;
                if (attempts >= MaxAttempts)
                {
                    db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowQueue SET Status = 'failed', AttemptCount = {0}, LeasedBy = NULL, LeaseUntilUtc = NULL " +
                        "WHERE QueueId = {1}",
                        attempts, item.QueueId);
                    _logger.LogError(ex,
                        "[MegaForm WorkflowQueue] Item {QueueId} FAILED permanently after {Attempts} attempts.",
                        item.QueueId, attempts);
                }
                else
                {
                    // Requeue with backoff: 30s, 60s, 90s, ... via LeaseUntilUtc.
                    var backoffUntil = DateTime.UtcNow.AddSeconds(30 * attempts);
                    db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowQueue SET Status = 'queued', AttemptCount = {0}, LeasedBy = NULL, LeaseUntilUtc = {1} " +
                        "WHERE QueueId = {2}",
                        attempts, backoffUntil, item.QueueId);
                    _logger.LogWarning(ex,
                        "[MegaForm WorkflowQueue] Item {QueueId} failed (attempt {Attempts}), requeued.",
                        item.QueueId, attempts);
                }
            }
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _timer?.Change(Timeout.Infinite, 0);
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            _timer?.Dispose();
        }
    }
}
