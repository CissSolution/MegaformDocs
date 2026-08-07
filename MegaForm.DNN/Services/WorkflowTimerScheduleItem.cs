using System;
using System.Threading;
using DotNetNuke.Services.Log.EventLog;
using DotNetNuke.Services.Scheduling;
using MegaForm.Core.Services;
using MegaForm.Core.Services.Workflow;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// [CloudReady A2 v20260806] DNN scheduled task for the durable workflow timer.
    /// Mirrors the Web/Oqtane/Umbraco scanner:
    ///  1. Resumes due Delay waits (MF_WorkflowExecutions Status='waiting',
    ///     WaitUntilUtc &lt;= now) through IWorkflowEngine.ResumeAsync(id, "default").
    ///  2. Sends the ONE overdue reminder email per human task (EscalatedAtUtc guard).
    ///
    /// DNN's scheduler guarantees a single running instance per schedule, so no
    /// lease columns are used here — the engine's Waiting-status guard (A2) covers
    /// the user-approve-vs-timer race. Precision: DNN schedules run per minute, so
    /// wake times fire within ±1 minute (coarser than the Web scanner's ±30s).
    /// </summary>
    public class WorkflowTimerScheduleItem : SchedulerClient
    {
        // Same ctor contract as BlogScheduledPublishTask ([SchedulerCtorFix v20260528-18]):
        // DNN instantiates schedule items with a ScheduleHistoryItem.
        public WorkflowTimerScheduleItem(ScheduleHistoryItem objScheduleHistoryItem) : base()
        {
            this.ScheduleHistoryItem = objScheduleHistoryItem;
        }

        public override void DoWork()
        {
            int resumed = 0;
            int reminded = 0;
            try
            {
                var locator = DnnServiceLocator.Instance;
                var repo = locator.WorkflowRepo as MegaForm.DNN.Data.DnnWorkflowRepository;
                if (repo == null)
                {
                    ScheduleHistoryItem.AddLogNote("Workflow repo is not DnnWorkflowRepository; skipped. ");
                    ScheduleHistoryItem.Succeeded = true;
                    return;
                }

                var nowUtc = DateTime.UtcNow;

                // ── 1. Due Delay waits ───────────────────────────────────────
                foreach (var executionId in repo.ListDueWaitingExecutionIds(nowUtc, 10))
                {
                    try
                    {
                        using (var cts = new CancellationTokenSource(TimeSpan.FromSeconds(300)))
                        {
                            locator.WorkflowRuntime.ResumeAsync(executionId, "default", null, cts.Token)
                                .GetAwaiter().GetResult();
                        }
                        resumed++;
                    }
                    catch (Exception resumeEx)
                    {
                        // Includes the engine's "not waiting" guard when a user action
                        // resumed the execution between our read and the resume call.
                        ScheduleHistoryItem.AddLogNote($"Resume {executionId} failed: {resumeEx.Message}. ");
                    }
                }

                // ── 2. Overdue human tasks — one reminder email ──────────────
                foreach (var task in repo.ListOverdueTasks(nowUtc, 25))
                {
                    try
                    {
                        // The task row carries no portal; the execution's form data has
                        // __portalId stamped by the submit pipeline. One extra read per
                        // overdue task keeps role/user resolution portal-correct.
                        var portalId = ResolvePortalId(repo, task.ExecutionId);
                        var recipients = WorkflowTaskRecipientResolver.ResolveReminderRecipients(
                            task, locator.WorkflowPrincipals, portalId);
                        foreach (var to in recipients)
                        {
                            locator.WorkflowEmail.SendAsync(
                                to, null,
                                EmailNotificationService.GetTaskOverdueReminderDefaultSubject(task),
                                EmailNotificationService.GetTaskOverdueReminderDefaultBody(task),
                                null, CancellationToken.None).GetAwaiter().GetResult();
                        }
                        if (recipients.Count > 0) reminded++;
                    }
                    catch (Exception mailEx)
                    {
                        // Fail-soft: the marker below is still stamped so a broken SMTP
                        // does not retry every schedule tick.
                        ScheduleHistoryItem.AddLogNote($"Overdue reminder {task.TaskId} failed: {mailEx.Message}. ");
                    }

                    repo.MarkTaskEscalated(task.TaskId, DateTime.UtcNow);
                }

                string logMessage = $"MegaForm Workflow Timer completed. Resumed={resumed}, OverdueReminders={reminded}.";
                ScheduleHistoryItem.AddLogNote(logMessage);
                ScheduleHistoryItem.Succeeded = true;

                if (resumed > 0 || reminded > 0)
                {
                    EventLogController.Instance.AddLog(
                        "MegaForm Workflow Timer",
                        logMessage,
                        EventLogController.EventLogType.ADMIN_ALERT);
                }
            }
            catch (Exception ex)
            {
                ScheduleHistoryItem.Succeeded = false;
                ScheduleHistoryItem.AddLogNote("Exception: " + ex.Message);
                Errored(ref ex);
            }
        }

        private static int ResolvePortalId(MegaForm.DNN.Data.DnnWorkflowRepository repo, string executionId)
        {
            try
            {
                var ctx = repo.GetExecution(executionId);
                if (ctx?.FormData == null) return 0;
                object raw;
                if (ctx.FormData.TryGetValue("__portalId", out raw))
                {
                    int portalId;
                    if (int.TryParse(raw?.ToString(), out portalId)) return portalId;
                }
            }
            catch { }
            return 0;
        }
    }
}
