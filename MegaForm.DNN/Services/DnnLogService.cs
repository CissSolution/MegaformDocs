using System;
using DotNetNuke.Services.Log.EventLog;
using MegaForm.Core.Interfaces;

namespace MegaForm.DNN.Services
{
    public class DnnLogService : ILogService
    {
        public void LogInfo(string source, string message)
        {
            EventLogController.Instance.AddLog(source, message, EventLogController.EventLogType.ADMIN_ALERT);
        }

        public void LogWarning(string source, string message)
        {
            EventLogController.Instance.AddLog(source, message, EventLogController.EventLogType.ADMIN_ALERT);
        }

        public void LogError(string source, string message, Exception ex = null)
        {
            string msg = ex != null ? $"{message} | {ex}" : message;
            EventLogController.Instance.AddLog(source, msg, EventLogController.EventLogType.HOST_ALERT);
        }
    }
}
