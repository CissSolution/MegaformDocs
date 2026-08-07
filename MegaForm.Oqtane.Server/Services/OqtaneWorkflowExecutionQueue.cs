using System;
using MegaForm.Core.Interfaces;
using MegaForm.Oqtane.Server.Data;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;

namespace MegaForm.Oqtane.Server.Services
{
    /// <summary>
    /// [CloudReady A1 v20260804] Oqtane IWorkflowExecutionQueue against MF_WorkflowQueue,
    /// via IDbContextFactory (same seam as the other Oqtane repositories). Enqueue only
    /// persists a row — WorkflowQueueWorkerHostedService does the execution.
    /// Only used when MegaForm:Workflow:ExecutionMode=queue; default stays sync.
    /// </summary>
    public class OqtaneWorkflowExecutionQueue : IWorkflowExecutionQueue
    {
        private readonly IDbContextFactory<MegaFormDbContext> _dbContextFactory;

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore
        };

        public OqtaneWorkflowExecutionQueue(IDbContextFactory<MegaFormDbContext> dbContextFactory)
        {
            _dbContextFactory = dbContextFactory ?? throw new ArgumentNullException(nameof(dbContextFactory));
        }

        public string Enqueue(WorkflowExecutionRequest request)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var row = new WorkflowQueueRow
            {
                FormId = request.FormId,
                SubmissionId = request.SubmissionId,
                PayloadJson = JsonConvert.SerializeObject(request, JsonSettings),
                Status = "queued",
                AttemptCount = 0,
                LeasedBy = null,
                LeaseUntilUtc = null,
                CreatedAtUtc = request.EnqueuedAtUtc != default(DateTime) ? request.EnqueuedAtUtc : DateTime.UtcNow
            };

            using (var db = _dbContextFactory.CreateDbContext())
            {
                db.WorkflowQueue.Add(row);
                db.SaveChanges();
            }
            return row.QueueId.ToString();
        }
    }
}
