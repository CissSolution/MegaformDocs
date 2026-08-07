using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MegaForm.Core.Interfaces;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;
using MegaForm.Core.Workflow;
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
    /// [CloudReady A2 v20260806] Oqtane durable timer scanner. Mirrors the Web host's
    /// WorkflowTimerScannerService: per tick it (1) claims due Delay waits
    /// (Status='waiting', WaitUntilUtc &lt;= now) with a conditional lease UPDATE and
    /// resumes them through IWorkflowEngine.ResumeAsync(id, "default"), and (2) sends
    /// the ONE overdue reminder email per human task (EscalatedAtUtc guard).
    ///
    /// Always on — Delay simply does not work without it. Interval:
    /// MegaForm:Workflow:TimerScanIntervalSeconds (default 30).
    ///
    /// Follows the BlogScheduledHostedService tenant pattern: the tenant MUST be set
    /// before any DbContext is touched (a timer callback has no request, so an unset
    /// tenant makes every query throw).
    /// </summary>
    public class WorkflowTimerScannerHostedService : IHostedService, IDisposable
    {
        private const int BatchSize = 10;
        private const int OverdueBatchSize = 25;
        // Covers the engine's 300s execution budget so no second instance can
        // claim while a resume is legitimately still running.
        private static readonly TimeSpan LeaseDuration = TimeSpan.FromSeconds(300);

        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<WorkflowTimerScannerHostedService> _logger;
        private readonly IConfiguration _configuration;
        private readonly string _instanceId;
        private Timer _timer;

        public WorkflowTimerScannerHostedService(
            IServiceProvider serviceProvider,
            ILogger<WorkflowTimerScannerHostedService> logger,
            IConfiguration configuration = null)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
            _configuration = configuration;
            _instanceId = ("timer-" + Environment.MachineName + "-" + Guid.NewGuid().ToString("N"));
            if (_instanceId.Length > 64) _instanceId = _instanceId.Substring(0, 64);
        }

        private TimeSpan ScanInterval
        {
            get
            {
                var configured = _configuration?["MegaForm:Workflow:TimerScanIntervalSeconds"];
                if (!string.IsNullOrWhiteSpace(configured) && int.TryParse(configured, out var parsed) && parsed > 0)
                    return TimeSpan.FromSeconds(parsed);
                return TimeSpan.FromSeconds(30);
            }
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("[MegaForm WorkflowTimer] Scanner starting (instance {InstanceId}).", _instanceId);
            _timer = new Timer(DoWork, null, ScanInterval, ScanInterval);
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
                        _logger.LogWarning("[MegaForm WorkflowTimer] Tenant services unavailable; skipping scan.");
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
                                ScanTenant(scope.ServiceProvider, tenant.TenantId);
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "[MegaForm WorkflowTimer] Tenant {TenantId} scan failed.", tenant.TenantId);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[MegaForm WorkflowTimer] Hosted service work failed.");
            }
        }

        private void ScanTenant(IServiceProvider services, int tenantId)
        {
            var factory = services.GetService<IDbContextFactory<MegaFormDbContext>>();
            if (factory == null) return;

            using (var db = factory.CreateDbContext())
            {
                // The scanner queries WaitUntilUtc/LeaseUntilUtc/EscalatedAtUtc directly, and it
                // can be the first thing to touch this tenant after an upgrade — heal the schema
                // before the first query rather than logging "Invalid column name" every tick.
                WorkflowTimerSchemaBootstrapper.Ensure(db);
                ScanDueExecutions(db, services);
                ScanOverdueTasks(db, services);
            }
        }

        // ── 1. Due Delay waits ───────────────────────────────────────────────

        private void ScanDueExecutions(MegaFormDbContext db, IServiceProvider services)
        {
            var now = DateTime.UtcNow;
            var leaseUntil = now.Add(LeaseDuration);

            var candidates = db.WorkflowExecutions.AsNoTracking()
                .Where(x => x.Status == "waiting" && x.WaitUntilUtc != null && x.WaitUntilUtc <= now
                            && (x.LeaseUntilUtc == null || x.LeaseUntilUtc < now))
                .OrderBy(x => x.WaitUntilUtc)
                .Take(BatchSize)
                .Select(x => x.ExecutionId)
                .ToList();

            foreach (var executionId in candidates)
            {
                // Atomic claim: rows affected == 1 means this instance won.
                var claimed = db.Database.ExecuteSqlRaw(
                    "UPDATE MF_WorkflowExecutions SET LeaseOwner = {0}, LeaseUntilUtc = {1} " +
                    "WHERE ExecutionId = {2} AND Status = 'waiting' AND (LeaseUntilUtc IS NULL OR LeaseUntilUtc < {3})",
                    _instanceId, leaseUntil, executionId, now);
                if (claimed != 1) continue;

                try
                {
                    var engine = services.GetRequiredService<IWorkflowEngine>();
                    using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(300)))
                    {
                        engine.ResumeAsync(executionId, "default", null, cts.Token).GetAwaiter().GetResult();
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

        // ── 2. Overdue human tasks — one reminder email ─────────────────────

        private void ScanOverdueTasks(MegaFormDbContext db, IServiceProvider services)
        {
            var now = DateTime.UtcNow;

            var overdue = db.WorkflowTasks.AsNoTracking()
                .Where(t => t.DueAt != null && t.DueAt < now
                            && (t.Status == "pending" || t.Status == "claimed")
                            && t.EscalatedAtUtc == null)
                .OrderBy(t => t.DueAt)
                .Take(OverdueBatchSize)
                .ToList();

            if (overdue.Count == 0) return;

            var emailSender = services.GetService<IWorkflowEmailSender>();
            var principalResolver = services.GetService<IWorkflowPrincipalResolver>();

            foreach (var row in overdue)
            {
                var task = MapOverdueTask(row);

                try
                {
                    if (emailSender != null)
                    {
                        // Oqtane principal resolution is ambient-tenant aware; the
                        // portalId argument is not meaningful here — pass 0.
                        var recipients = WorkflowTaskRecipientResolver
                            .ResolveReminderRecipients(task, principalResolver, 0);
                        foreach (var to in recipients)
                        {
                            emailSender.SendAsync(
                                to, null,
                                EmailNotificationService.GetTaskOverdueReminderDefaultSubject(task),
                                EmailNotificationService.GetTaskOverdueReminderDefaultBody(task),
                                null, CancellationToken.None).GetAwaiter().GetResult();
                        }
                        _logger.LogInformation(
                            "[MegaForm WorkflowTimer] Overdue reminder for task {TaskId} sent to {Count} recipient(s).",
                            task.TaskId, recipients.Count);
                    }
                }
                catch (Exception ex)
                {
                    // Fail-soft: the marker below still gets stamped so a broken SMTP
                    // does not retry every tick.
                    _logger.LogWarning(ex, "[MegaForm WorkflowTimer] Overdue reminder email failed for task {TaskId}.", task.TaskId);
                }

                db.Database.ExecuteSqlRaw(
                    "UPDATE MF_WorkflowTasks SET EscalatedAtUtc = {0} WHERE TaskId = {1} AND EscalatedAtUtc IS NULL",
                    DateTime.UtcNow, task.TaskId);
            }
        }

        private static WorkflowTaskInstance MapOverdueTask(WorkflowTaskRow row)
        {
            WorkflowTaskStatus status;
            if (!Enum.TryParse(row.Status ?? string.Empty, true, out status))
                status = WorkflowTaskStatus.Pending;

            return new WorkflowTaskInstance
            {
                TaskId              = row.TaskId,
                CaseId              = row.CaseId,
                ExecutionId         = row.ExecutionId,
                FormId              = row.FormId,
                SubmissionId        = row.SubmissionId,
                NodeId              = row.NodeId,
                NodeLabel           = row.NodeLabel,
                Status              = status,
                CandidateRoles      = DeserializeList(row.CandidateRolesJson),
                CandidateUsers      = DeserializeList(row.CandidateUsersJson),
                AssignedUserId      = row.AssignedUserId,
                AssignedUserName    = row.AssignedUserName,
                AssignedDisplayName = row.AssignedDisplayName,
                DueAt               = row.DueAt,
            };
        }

        private static List<string> DeserializeList(string json)
        {
            try { return JsonConvert.DeserializeObject<List<string>>(json) ?? new List<string>(); }
            catch { return new List<string>(); }
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
