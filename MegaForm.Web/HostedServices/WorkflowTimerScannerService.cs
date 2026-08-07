using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Workflow;
using MegaForm.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MegaForm.Web.HostedServices
{
    /// <summary>
    /// [CloudReady A2 v20260806] Durable timer scanner for the standalone Web host.
    ///
    /// Two scans per tick (interval: Workflow:TimerScanIntervalSeconds, default 30):
    ///
    ///  1. Due Delay waits — MF_WorkflowExecutions rows with Status='waiting' and
    ///     WaitUntilUtc &lt;= now. Claimed atomically with a conditional UPDATE that
    ///     sets LeaseOwner/LeaseUntilUtc, so multiple instances can share one
    ///     database. The winner resumes through IWorkflowEngine.ResumeAsync(id,
    ///     "default") in a fresh scope. The lease (300s = the engine's execution
    ///     budget) prevents a second instance from resuming mid-run; the engine's
    ///     own Waiting-status guard (added in A2) is the second line of defence.
    ///     After the resume the scanner clears only its OWN lease; WaitUntilUtc is
    ///     overwritten by the engine's persist (null when the run moves on, a new
    ///     value when it parks at another Delay).
    ///
    ///  2. Overdue human tasks — MF_WorkflowTasks rows with DueAt &lt; now, status
    ///     pending/claimed, EscalatedAtUtc IS NULL. Each gets ONE reminder email
    ///     via IWorkflowEmailSender to the assignee (or the candidate set when
    ///     unassigned) resolved through the shared WorkflowTaskRecipientResolver,
    ///     then EscalatedAtUtc is stamped. No auto-approve/auto-route (out of scope).
    ///
    /// Precision: wake times fire within ± one scan interval. All times UTC.
    /// </summary>
    public class WorkflowTimerScannerService : BackgroundService
    {
        private const int BatchSize = 10;
        private const int OverdueBatchSize = 25;
        // Covers the engine's 300s execution budget so no second instance can
        // claim while a resume is legitimately still running.
        private static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(300);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<WorkflowTimerScannerService> _logger;
        private readonly TimeSpan _scanInterval;
        private readonly string _instanceId;

        public WorkflowTimerScannerService(
            IServiceScopeFactory scopeFactory,
            ILogger<WorkflowTimerScannerService> logger,
            IConfiguration configuration = null)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
            var seconds = 30;
            var configured = configuration?["Workflow:TimerScanIntervalSeconds"];
            if (!string.IsNullOrWhiteSpace(configured) && int.TryParse(configured, out var parsed) && parsed > 0)
                seconds = parsed;
            _scanInterval = TimeSpan.FromSeconds(seconds);
            _instanceId = ("timer-" + Environment.MachineName + "-" + Guid.NewGuid().ToString("N"));
            if (_instanceId.Length > 64) _instanceId = _instanceId.Substring(0, 64);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[MegaForm WorkflowTimer] Scanner starting (instance {InstanceId}, interval {IntervalSeconds}s).",
                _instanceId, _scanInterval.TotalSeconds);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ScanDueExecutionsAsync(stoppingToken).ConfigureAwait(false);
                    await ScanOverdueTasksAsync(stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    // e.g. timer columns not added yet on an install that predates script 0003
                    _logger.LogError(ex, "[MegaForm WorkflowTimer] Scan failed.");
                }

                try
                {
                    await Task.Delay(_scanInterval, stoppingToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }

        // ── 1. Due Delay waits ───────────────────────────────────────────────

        private async Task ScanDueExecutionsAsync(CancellationToken stoppingToken)
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
                var now = DateTime.UtcNow;
                var leaseUntil = now.Add(LeaseDuration);

                var candidates = await db.WorkflowExecutions.AsNoTracking()
                    .Where(x => x.Status == "waiting" && x.WaitUntilUtc != null && x.WaitUntilUtc <= now
                                && (x.LeaseUntilUtc == null || x.LeaseUntilUtc < now))
                    .OrderBy(x => x.WaitUntilUtc)
                    .Take(BatchSize)
                    .Select(x => x.ExecutionId)
                    .ToListAsync(stoppingToken).ConfigureAwait(false);

                foreach (var executionId in candidates)
                {
                    stoppingToken.ThrowIfCancellationRequested();

                    // Atomic claim: rows affected == 1 means this instance won.
                    var claimed = db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowExecutions SET LeaseOwner = {0}, LeaseUntilUtc = {1} " +
                        "WHERE ExecutionId = {2} AND Status = 'waiting' AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc < {3})",
                        _instanceId, leaseUntil, executionId, now);
                    if (claimed != 1) continue;

                    try
                    {
                        using (var resumeScope = _scopeFactory.CreateScope())
                        {
                            var engine = resumeScope.ServiceProvider.GetRequiredService<IWorkflowEngine>();
                            using (var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken))
                            {
                                cts.CancelAfter(TimeSpan.FromSeconds(300));
                                await engine.ResumeAsync(executionId, "default", null, cts.Token).ConfigureAwait(false);
                            }
                        }
                        _logger.LogInformation("[MegaForm WorkflowTimer] Resumed execution {ExecutionId}.", executionId);
                    }
                    catch (Exception ex)
                    {
                        // Includes the engine's "not waiting" guard when a user action
                        // resumed the execution between our candidate read and claim.
                        _logger.LogWarning(ex, "[MegaForm WorkflowTimer] Resume of execution {ExecutionId} failed.", executionId);
                    }
                    finally
                    {
                        // Release only OUR lease — never stomp another instance's claim.
                        db.Database.ExecuteSqlRaw(
                            "UPDATE MF_WorkflowExecutions SET LeaseOwner = NULL, LeaseUntilUtc = NULL " +
                            "WHERE ExecutionId = {0} AND LeaseOwner = {1}",
                            executionId, _instanceId);
                    }
                }
            }
        }

        // ── 2. Overdue human tasks — one reminder email ─────────────────────

        private async Task ScanOverdueTasksAsync(CancellationToken stoppingToken)
        {
            using (var scope = _scopeFactory.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<MegaFormDbContext>();
                var now = DateTime.UtcNow;

                var overdue = await db.WorkflowTasks.AsNoTracking()
                    .Where(t => t.DueAt != null && t.DueAt < now
                                && (t.Status == (int)WorkflowTaskStatus.Pending || t.Status == (int)WorkflowTaskStatus.Claimed)
                                && t.EscalatedAtUtc == null)
                    .OrderBy(t => t.DueAt)
                    .Take(OverdueBatchSize)
                    .ToListAsync(stoppingToken).ConfigureAwait(false);

                if (overdue.Count == 0) return;

                var emailSender = scope.ServiceProvider.GetService<IWorkflowEmailSender>();
                var principalResolver = scope.ServiceProvider.GetService<IWorkflowPrincipalResolver>();

                foreach (var row in overdue)
                {
                    stoppingToken.ThrowIfCancellationRequested();
                    var task = MapOverdueTask(row);

                    try
                    {
                        if (emailSender != null)
                        {
                            // Standalone Web host is single-portal today (portal 0) —
                            // same value the submission pipeline stamps into __portalId.
                            var recipients = WorkflowTaskRecipientResolver
                                .ResolveReminderRecipients(task, principalResolver, 0);
                            foreach (var to in recipients)
                            {
                                await emailSender.SendAsync(
                                    to, null,
                                    EmailNotificationService.GetTaskOverdueReminderDefaultSubject(task),
                                    EmailNotificationService.GetTaskOverdueReminderDefaultBody(task),
                                    null, stoppingToken).ConfigureAwait(false);
                            }
                            _logger.LogInformation(
                                "[MegaForm WorkflowTimer] Overdue reminder for task {TaskId} sent to {Count} recipient(s).",
                                task.TaskId, recipients.Count);
                        }
                    }
                    catch (Exception ex)
                    {
                        // Fail-soft like the approval notifications: the marker below
                        // still gets stamped so a broken SMTP does not retry every tick.
                        _logger.LogWarning(ex, "[MegaForm WorkflowTimer] Overdue reminder email failed for task {TaskId}.", task.TaskId);
                    }

                    db.Database.ExecuteSqlRaw(
                        "UPDATE MF_WorkflowTasks SET EscalatedAtUtc = {0} WHERE TaskId = {1} AND EscalatedAtUtc IS NULL",
                        DateTime.UtcNow, task.TaskId);
                }
            }
        }

        private static WorkflowTaskInstance MapOverdueTask(WorkflowTaskRow row)
        {
            return new WorkflowTaskInstance
            {
                TaskId                  = row.TaskId,
                CaseId                  = row.CaseId,
                ExecutionId             = row.ExecutionId,
                FormId                  = row.FormId,
                SubmissionId            = row.SubmissionId,
                NodeId                  = row.NodeId,
                NodeLabel               = row.NodeLabel,
                Status                  = (WorkflowTaskStatus)row.Status,
                CandidateRoles          = DeserializeList(row.CandidateRolesJson),
                CandidateUsers          = DeserializeList(row.CandidateUsersJson),
                AssignedUserId          = row.AssignedUserId,
                AssignedUserName        = row.AssignedUserName,
                AssignedDisplayName     = row.AssignedDisplayName,
                DueAt                   = row.DueAt,
            };
        }

        private static System.Collections.Generic.List<string> DeserializeList(string json)
        {
            try
            {
                return Newtonsoft.Json.JsonConvert.DeserializeObject<System.Collections.Generic.List<string>>(json)
                       ?? new System.Collections.Generic.List<string>();
            }
            catch { return new System.Collections.Generic.List<string>(); }
        }
    }
}
