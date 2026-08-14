# Publish an event to RabbitMQ, Kafka or SQS

> **Planned.** `ctx.Queue` is declared and a script calling it today gets *"ctx.Queue is not
> available on this installation yet"*. §4 shows what works now.

Once more than two systems care about a submission, calling each one from the form stops scaling.
The CRM, the warehouse, the analytics pipeline and the fraud team all want to know that an order
arrived, they each have their own downtime, and none of them should be able to make a customer's
submit button spin.

The answer is to publish one event and let the consumers be somebody else's problem.

---

## 1. The planned interface

```csharp
Task PublishAsync(string topicName, object payload, CancellationToken ct = default);
IList<string> TopicNames();
```

```csharp
// PLANNED
await ctx.Queue.PublishAsync("crm.leads", new {
    eventType    = "lead.created",
    submissionId = ctx.SubmissionId,
    formId       = ctx.FormId,
    occurredAt   = ctx.UtcNow,
    email        = ctx.GetString("email"),
    company      = ctx.GetString("company"),
    score        = ctx.GetInt("lead_score")
});
```

`topicName` is a catalog entry — broker, exchange/topic, routing key, credentials — so the script
names a topic and never a connection string. Switching from RabbitMQ to SQS is an administrator's
edit, not a change to anybody's code.

---

## 2. The outbox, which is the part that matters

Publishing directly from a submit request has a failure mode that is easy to miss: the row is
committed, the broker is briefly unreachable, the event is lost, and the CRM never learns about a
lead that MegaForm is quite sure it received. Nothing looks broken anywhere.

So `PublishAsync` will write to **`MF_AutomationOutbox`** in the same breath as recording the run,
and a background worker drains it with retries and a dead-letter state.

| Column | Purpose |
|---|---|
| `PayloadJson` | the event |
| `Status` | `pending` / `sent` / `failed` |
| `Attempts`, `NextRunUtc` | back-off |
| `LastError` | why the last attempt failed |

That gives at-least-once delivery, survives a broker outage and an application recycle, and turns
"did this event go out" into a query. Consumers should be idempotent — include `submissionId` as the
deduplication key, as above.

The table exists already; the worker and the broker adapters are the planned part.

---

## 3. Which stage

**AsyncWorker** when it ships. **PostCommit** is acceptable because a queue publish is milliseconds
— but only with the outbox in place, so that a slow broker cannot become a slow thank-you page.

Never PreInsert: publishing "order created" before the order is written is an event that can be a lie.

---

## 4. What works today

**A named HTTP endpoint** covers every broker with an HTTP front door — SQS, EventBridge, Azure
Service Bus, Kafka via a REST proxy, RabbitMQ's management API — with the guard, the retry policy
and the audit trail already attached:

```csharp
// Works today.
var evt = ctx.Api.PostJsonAsync("event-bus-publish", new {
    topic = "crm.leads",
    eventType = "lead.created",
    submissionId = ctx.SubmissionId,
    email = ctx.GetString("email")
}).Result;

if (!evt.Ok)
{
    // Do the outbox by hand until ctx.Queue ships: record it and let a scheduled job drain it.
    ctx.Actions.ExecuteNamedActionAsync("outbox-add", new {
        topic = "crm.leads",
        payload = Newtonsoft.Json.JsonConvert.SerializeObject(new {
            submissionId = ctx.SubmissionId, email = ctx.GetString("email")
        })
    }).Wait();
    ctx.Log("Event bus returned " + evt.Status + " — queued for retry.");
}
```

That is the same design in miniature, and the code you write for it survives the migration: the
`if (!evt.Ok)` branch disappears and the endpoint call becomes `ctx.Queue.PublishAsync`.

---

## 5. Design notes worth keeping

- **Publish facts, not commands.** `lead.created` with the data, not `send-welcome-email`. Consumers
  decide what to do; you do not have to redeploy the form when a new one appears.
- **Include enough to act on.** A consumer that has to call back for the details is a consumer that
  breaks when MegaForm is down.
- **But not everything.** A national ID in a message on four brokers is four copies to protect —
  see [field encryption](automation-field-encryption.md).
- **Version the event.** `eventType = "lead.created.v2"` costs nothing now and saves a coordinated
  release later.

## Related

- [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md)
- [Write to your own database, across several tables](automation-custom-db.md)
- [Automation overview](automation-overview.md)
