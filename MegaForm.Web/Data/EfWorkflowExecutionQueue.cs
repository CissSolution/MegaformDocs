using System;
using MegaForm.Core.Interfaces;
using Newtonsoft.Json;

// ══════════════════════════════════════════════════════════════════════════════
//  EfWorkflowExecutionQueue  [CloudReady A1 v20260804]
//  DB-backed IWorkflowExecutionQueue against MF_WorkflowQueue (schema: script
//  0002_workflow_queue.sql via SchemaMigrationRunner / EF model on fresh installs).
//  Enqueue only persists a row — WorkflowQueueWorkerService does the execution.
// ══════════════════════════════════════════════════════════════════════════════

namespace MegaForm.Web.Data
{
    public class EfWorkflowExecutionQueue : IWorkflowExecutionQueue
    {
        private readonly MegaFormDbContext _db;

        private static readonly JsonSerializerSettings _json = new JsonSerializerSettings
        {
            NullValueHandling    = NullValueHandling.Ignore,
            DefaultValueHandling = DefaultValueHandling.Ignore,
        };

        public EfWorkflowExecutionQueue(MegaFormDbContext db) { _db = db; }

        public string Enqueue(WorkflowExecutionRequest request)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            var row = new WorkflowQueueRow
            {
                FormId        = request.FormId,
                SubmissionId  = request.SubmissionId,
                PayloadJson   = JsonConvert.SerializeObject(request, _json),
                Status        = "queued",
                AttemptCount  = 0,
                LeasedBy      = null,
                LeaseUntilUtc = null,
                CreatedAtUtc  = request.EnqueuedAtUtc != default(DateTime) ? request.EnqueuedAtUtc : DateTime.UtcNow,
            };

            _db.WorkflowQueue.Add(row);
            _db.SaveChanges();
            return row.QueueId.ToString();
        }
    }

    /// <summary>Row for MF_WorkflowQueue — see Scripts/*/0002_workflow_queue.sql.</summary>
    public class WorkflowQueueRow
    {
        public int       QueueId        { get; set; }
        public int       FormId         { get; set; }
        public int       SubmissionId   { get; set; }
        public string    PayloadJson    { get; set; }
        public string    Status         { get; set; }
        public int       AttemptCount   { get; set; }
        public string    LeasedBy       { get; set; }
        public DateTime? LeaseUntilUtc  { get; set; }
        public DateTime  CreatedAtUtc   { get; set; }
        public DateTime? ProcessedAtUtc { get; set; }
    }
}
