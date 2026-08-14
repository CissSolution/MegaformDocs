using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using MegaForm.Core.Automation;
using Newtonsoft.Json;

namespace MegaForm.DNN.Data
{
    /// <summary>
    /// SQL-backed outbox for AutomationStage.AsyncWorker. Enqueue happens on the submit request;
    /// a DNN scheduler leases rows and executes them outside the visitor request.
    /// </summary>
    public sealed class DnnAutomationExecutionQueue : IAutomationExecutionQueue
    {
        private static readonly string ConnectionString =
            DotNetNuke.Common.Utilities.Config.GetConnectionString();
        private static readonly object SchemaLock = new object();
        private static bool _schemaReady;

        public string Enqueue(AutomationExecutionRequest request)
        {
            if (request == null) throw new ArgumentNullException(nameof(request));

            using (var conn = Open())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
INSERT INTO [dbo].[MF_AutomationOutbox]
    ([FormId],[SubmissionId],[Stage],[PayloadJson],[Status],[Attempts],[QueuedOnUtc],[NextRunUtc])
OUTPUT INSERTED.[OutboxId]
VALUES (@FormId,@SubmissionId,@Stage,@Payload,'pending',0,@QueuedOnUtc,@QueuedOnUtc);";
                cmd.Parameters.Add("@FormId", SqlDbType.Int).Value = request.FormId;
                cmd.Parameters.Add("@SubmissionId", SqlDbType.Int).Value = request.SubmissionId;
                cmd.Parameters.Add("@Stage", SqlDbType.NVarChar, 30).Value = "AsyncWorker";
                cmd.Parameters.Add("@Payload", SqlDbType.NVarChar, -1).Value =
                    JsonConvert.SerializeObject(request);
                cmd.Parameters.Add("@QueuedOnUtc", SqlDbType.DateTime).Value =
                    request.EnqueuedAtUtc == default(DateTime) ? DateTime.UtcNow : request.EnqueuedAtUtc;
                var id = Convert.ToInt64(cmd.ExecuteScalar(), CultureInfo.InvariantCulture);
                return id.ToString(CultureInfo.InvariantCulture);
            }
        }

        public IList<DnnAutomationOutboxItem> Lease(int maxItems, string workerId, DateTime utcNow)
        {
            var items = new List<DnnAutomationOutboxItem>();
            var take = Math.Max(1, Math.Min(maxItems, 25));
            using (var conn = Open())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
;WITH picked AS (
    SELECT TOP (@Take) *
    FROM [dbo].[MF_AutomationOutbox] WITH (UPDLOCK, READPAST, ROWLOCK)
    WHERE ([Status] = 'pending'
           OR ([Status] = 'processing' AND [LockedOnUtc] < @LeaseExpired))
      AND ([NextRunUtc] IS NULL OR [NextRunUtc] <= @Now)
    ORDER BY [OutboxId]
)
UPDATE picked
SET [Status] = 'processing',
    [Attempts] = [Attempts] + 1,
    [LockedOnUtc] = @Now,
    [LockedBy] = @Worker
OUTPUT INSERTED.[OutboxId], INSERTED.[PayloadJson], INSERTED.[Attempts];";
                cmd.Parameters.Add("@Take", SqlDbType.Int).Value = take;
                cmd.Parameters.Add("@Now", SqlDbType.DateTime).Value = utcNow;
                cmd.Parameters.Add("@LeaseExpired", SqlDbType.DateTime).Value = utcNow.AddMinutes(-10);
                cmd.Parameters.Add("@Worker", SqlDbType.NVarChar, 100).Value =
                    Truncate(workerId, 100) ?? "dnn-scheduler";
                using (var reader = cmd.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        items.Add(new DnnAutomationOutboxItem
                        {
                            OutboxId = reader.GetInt64(0),
                            Request = JsonConvert.DeserializeObject<AutomationExecutionRequest>(
                                reader.IsDBNull(1) ? "{}" : reader.GetString(1)),
                            Attempts = reader.GetInt32(2)
                        });
                    }
                }
            }
            return items;
        }

        public void Complete(long outboxId, DateTime utcNow, string note = null)
        {
            UpdateOutcome(outboxId, "completed", utcNow, null, note);
        }

        public void Fail(DnnAutomationOutboxItem item, DateTime utcNow, string error)
        {
            if (item == null) return;
            var terminal = item.Attempts >= 5;
            var delayMinutes = Math.Min(60, (int)Math.Pow(2, Math.Max(0, item.Attempts - 1)));
            UpdateOutcome(item.OutboxId, terminal ? "failed" : "pending", utcNow,
                terminal ? (DateTime?)null : utcNow.AddMinutes(delayMinutes), error);
        }

        private static void UpdateOutcome(long outboxId, string status, DateTime utcNow,
            DateTime? nextRunUtc, string detail)
        {
            using (var conn = Open())
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"
UPDATE [dbo].[MF_AutomationOutbox]
SET [Status] = @Status,
    [LastError] = @Detail,
    [NextRunUtc] = @NextRunUtc,
    [CompletedUtc] = CASE WHEN @Status IN ('completed','failed') THEN @Now ELSE NULL END,
    [LockedOnUtc] = NULL,
    [LockedBy] = NULL
WHERE [OutboxId] = @OutboxId;";
                cmd.Parameters.Add("@Status", SqlDbType.NVarChar, 20).Value = status;
                cmd.Parameters.Add("@Detail", SqlDbType.NVarChar, 2000).Value =
                    (object)Truncate(detail, 2000) ?? DBNull.Value;
                cmd.Parameters.Add("@NextRunUtc", SqlDbType.DateTime).Value =
                    (object)nextRunUtc ?? DBNull.Value;
                cmd.Parameters.Add("@Now", SqlDbType.DateTime).Value = utcNow;
                cmd.Parameters.Add("@OutboxId", SqlDbType.BigInt).Value = outboxId;
                cmd.ExecuteNonQuery();
            }
        }

        private static SqlConnection Open()
        {
            var conn = new SqlConnection(ConnectionString);
            conn.Open();
            EnsureSchema(conn);
            return conn;
        }

        private static void EnsureSchema(SqlConnection conn)
        {
            if (_schemaReady) return;
            lock (SchemaLock)
            {
                if (_schemaReady) return;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = @"
IF OBJECT_ID('dbo.MF_AutomationOutbox','U') IS NULL
CREATE TABLE [dbo].[MF_AutomationOutbox] (
    [OutboxId] bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [FormId] int NOT NULL,
    [SubmissionId] int NULL,
    [Stage] nvarchar(30) NOT NULL,
    [PayloadJson] nvarchar(max) NULL,
    [Status] nvarchar(20) NOT NULL DEFAULT('pending'),
    [Attempts] int NOT NULL DEFAULT(0),
    [LastError] nvarchar(2000) NULL,
    [QueuedOnUtc] datetime NOT NULL,
    [NextRunUtc] datetime NULL,
    [CompletedUtc] datetime NULL
);
IF COL_LENGTH('dbo.MF_AutomationOutbox','LockedOnUtc') IS NULL
    ALTER TABLE [dbo].[MF_AutomationOutbox] ADD [LockedOnUtc] datetime NULL;
IF COL_LENGTH('dbo.MF_AutomationOutbox','LockedBy') IS NULL
    ALTER TABLE [dbo].[MF_AutomationOutbox] ADD [LockedBy] nvarchar(100) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MF_AutomationOutbox_Pending')
    CREATE INDEX [IX_MF_AutomationOutbox_Pending]
        ON [dbo].[MF_AutomationOutbox] ([Status], [NextRunUtc]);";
                    cmd.ExecuteNonQuery();
                }
                _schemaReady = true;
            }
        }

        private static string Truncate(string value, int max)
        {
            if (string.IsNullOrEmpty(value)) return value;
            return value.Length <= max ? value : value.Substring(0, max);
        }
    }

    public sealed class DnnAutomationOutboxItem
    {
        public long OutboxId { get; set; }
        public AutomationExecutionRequest Request { get; set; }
        public int Attempts { get; set; }
    }
}
