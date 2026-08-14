using System;
using DotNetNuke.Services.Log.EventLog;
using DotNetNuke.Services.Scheduling;

namespace MegaForm.DNN.Services
{
    /// <summary>Drains the durable Automation AsyncWorker outbox outside submit requests.</summary>
    public sealed class AutomationWorkerScheduleItem : SchedulerClient
    {
        public AutomationWorkerScheduleItem(ScheduleHistoryItem scheduleHistoryItem) : base()
        {
            ScheduleHistoryItem = scheduleHistoryItem;
        }

        public override void DoWork()
        {
            var completed = 0;
            var retried = 0;
            try
            {
                var locator = DnnServiceLocator.Instance;
                var queue = locator.AutomationQueue;
                var workerId = Environment.MachineName + ":" + AppDomain.CurrentDomain.Id;
                foreach (var item in queue.Lease(10, workerId, DateTime.UtcNow))
                {
                    try
                    {
                        var result = locator.AutomationWorker.Execute(item.Request);
                        if (result.Success || result.Skipped)
                        {
                            queue.Complete(item.OutboxId, DateTime.UtcNow,
                                result.Skipped ? result.SkipReason : null);
                            completed++;
                        }
                        else
                        {
                            queue.Fail(item, DateTime.UtcNow, result.ErrorMessage);
                            retried++;
                        }
                    }
                    catch (Exception itemError)
                    {
                        queue.Fail(item, DateTime.UtcNow,
                            itemError.GetType().Name + ": " + itemError.Message);
                        retried++;
                    }
                }

                var message = "MegaForm Automation Worker completed. Completed=" + completed +
                              ", RetriedOrFailed=" + retried + ".";
                ScheduleHistoryItem.AddLogNote(message);
                ScheduleHistoryItem.Succeeded = true;
                if (completed > 0 || retried > 0)
                {
                    EventLogController.Instance.AddLog("MegaForm Automation Worker", message,
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
    }
}
