using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace MegaForm.Web.HostedServices
{
    /// <summary>
    /// [CloudReady A1 v20260804] Background worker for the DB-backed workflow
    /// execution queue (MF_WorkflowQueue). Polls every Workflow:QueuePollSeconds
    /// (default 5), claims items with a conditional UPDATE lease so multiple
    /// instances can run against the same database safely, then executes each in
    /// a fresh DI scope via IWorkflowEngine.ExecuteAsync with exactly the
    /// arguments SubmissionProcessor would have passed inline.
    ///
    /// Retry: on failure AttemptCount++ and the row is requeued with a backoff
    /// stored in LeaseUntilUtc; after 5 attempts the row is marked 'failed'.
    /// A crashed instance's items are picked up by any other instance once the
    /// lease expires (60s).
    ///
    /// Always registered, even in sync mode: the table then simply stays empty
    /// (and any leftovers from a previous queued-mode run still get drained).
    /// </summary>
    public class WorkflowQueueWorkerService : BackgroundService
    {
        private const int BatchSize = 10;
        private const int MaxAttempts = 5;
        private static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(60);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<WorkflowQueueWorkerService> _logger;
        private readonly TimeSpan _pollInterval;
        private readonly string _instanceId;

        public WorkflowQueueWorkerService(
            IServiceScopeFactory scopeFactory,
            ILogger<WorkflowQueueWorkerService> logger,
            IConfiguration configuration = null)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
            var seconds = 5;
            var configured = configuration?["Workflow:QueuePollSeconds"];
            if (!string.IsNullOrWhiteSpace(configured) && int.TryParse(configured, out var parsed) && parsed > 0)
                seconds = parsed;
            _pollInterval = TimeSpan.FromSeconds(seconds);
            _instanceId = ("web-" + Environment.MachineName + "-" + Guid.NewGuid().ToString("N"));
            if (_instanceId.Length > 64) _instanceId = _instanceId.Substring(0, 64);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[MegaForm WorkflowQueue] Worker starting (instance {InstanceId}, poll {PollSeconds}s).",
                _instanceId, _pollInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessBatchAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // e.g. table not created yet on an install that predates script 0002
                    _logger.LogError(ex, "[MegaForm WorkflowQueue] Poll failed.");
                }

                try
                {
                    await Task.Delay(_pollInterval, stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }

        private async Task ProcessBatchAsync(CancellationToken stoppingToken)
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
                var now = DateTime.UtcNow;
                var leaseUntil = now.Add(LeaseDuration);

                // Candidates: fresh items (no pending backoff) + expired leases from dead workers.
                // A requeued-for-retry row keeps its backoff in LeaseUntilUtc, so it only
                // becomes a candidate again once that time has passed.
                var candidates = await db.WorkflowQueue.AsNoTracking()
                    .Where(q => (q.Status == "queued" && (q.LeaseUntilUtc == null || q.LeaseUntilUtc < now)) ||
                                (q.Status == "leased" && q.LeaseUntilUtc < now))
                    .OrderBy(q => q.QueueId)
                    .Take(BatchSize)
                    .ToListAsync(stoppingToken).ConfigureAwait(false);

                foreach (var candidate in candidates)
                {
                    stoppingToken.ThrowIfCancellationRequested();

                    // Conditional UPDATE = the claim. RowsAffected == 1 means we won;
                    // 0 means another instance (or a previous pass) took it first.
                    var claimed = db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowQueue SET Status = 'leased', LeasedBy = {0}, LeaseUntilUtc = {1} " +
                        "WHERE QueueId = {2} AND ((Status = 'queued' AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc < {3})) " +
                        "OR (Status = 'leased' AND LeaseUntilUtc < {3}))",
                        _instanceId, leaseUntil, candidate.QueueId, now);
                    if (claimed != 1) continue;

                    await ProcessItemAsync(db, candidate, stoppingToken).ConfigureAwait(false);
                }
            }
        }

        private async Task ProcessItemAsync(MegaFormDbContext db, WorkflowQueueRow item, CancellationToken stoppingToken)
        {
            try
            {
                var request = JsonConvert.DeserializeObject<WorkflowExecutionRequest>(item.PayloadJson);
                if (request == null)
                    throw new InvalidOperationException("Queue payload did not deserialize.");

                // Engine + executors are scoped → run each item in its own scope.
                using (var scope = _scopeFactory.CreateScope())
                {
                    var engine = scope.ServiceProvider.GetRequiredService<IWorkflowEngine>();
                    // Mirror the inline path's 300s execution budget.
                    using (var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken))
                    {
                        cts.CancelAfter(TimeSpan.FromSeconds(300));
                        await engine.ExecuteAsync(
                            request.FormId,
                            request.SubmissionId,
                            request.FormData ?? new Dictionary<string, object>(),
                            cts.Token).ConfigureAwait(false);
                    }
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
                    // Requeue with backoff: 30s, 60s, 90s, ... via LeaseUntilUtc so a
                    // not-yet-due row is skipped by the candidate query above.
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
    }
}
