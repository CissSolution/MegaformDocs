using System;
using System.Linq;
using DotNetNuke.Entities.Portals;
using DotNetNuke.Services.Log.EventLog;
using DotNetNuke.Services.Scheduling;
using MegaForm.Core.Services.Blog;

namespace MegaForm.DNN.Services
{
    /// <summary>
    /// DNN scheduled task that processes blog post publishing schedules
    /// and rolls up reader-event analytics every 5 minutes.
    /// </summary>
    public class BlogScheduledPublishTask : SchedulerClient
    {
        // [SchedulerCtorFix v20260528-18] DNN's SchedulerClient base requires
        // a constructor that accepts a ScheduleHistoryItem and forwards it to
        // the base. The previous parameterless ctor threw
        //   InvalidOperationException: A suitable constructor for type ...
        // every time the scheduler tried to instantiate the task (~every 2
        // minutes), filling DNN logs and eventually triggering w3wp stack
        // overflow (0xc00000fd) when callers tried to navigate to a Builder
        // page that fired further DI lookups.
        public BlogScheduledPublishTask(ScheduleHistoryItem objScheduleHistoryItem) : base()
        {
            this.ScheduleHistoryItem = objScheduleHistoryItem;
        }

        public override void DoWork()
        {
            try
            {
                int publishedTotal = 0;
                int updatedTotal = 0;

                var locator = DnnServiceLocator.Instance;
                var publishService = locator.ScheduledPublish;
                var analyticsService = locator.AnalyticsRollup;

                var portals = PortalController.Instance.GetPortals()
                    .Cast<PortalInfo>()
                    .Where(p => p != null && p.PortalID >= 0)
                    .ToList();

                foreach (var portal in portals)
                {
                    try
                    {
                        int published = publishService.ProcessScheduledPostsAsync(portal.PortalID).GetAwaiter().GetResult();
                        int updated = analyticsService.RollupBlogAnalyticsAsync(portal.PortalID).GetAwaiter().GetResult();
                        publishedTotal += published;
                        updatedTotal += updated;
                    }
                    catch (Exception portalEx)
                    {
                        ScheduleHistoryItem.AddLogNote($"Portal {portal.PortalID} error: {portalEx.Message}. ");
                    }
                }

                string logMessage = $"MegaForm Blog Publish & Analytics completed. Published={publishedTotal}, AnalyticsUpdated={updatedTotal}.";
                ScheduleHistoryItem.AddLogNote(logMessage);
                ScheduleHistoryItem.Succeeded = true;

                EventLogController.Instance.AddLog(
                    "MegaForm Blog Publish & Analytics",
                    logMessage,
                    EventLogController.EventLogType.ADMIN_ALERT);
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
