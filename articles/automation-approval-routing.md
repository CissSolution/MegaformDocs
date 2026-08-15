# Start an approval that routes itself

> **Mostly available now.** Approval routing works today with no code, through the workflow
> **Condition** and **Approval** nodes — §1 and §2. Starting or signalling a workflow *from inside a
> script* (`ctx.Workflow`) is **planned**.

An expense claim under £500 goes to the team lead. Over £5,000 it goes to the director. Over £20,000
it needs both, in order. That is the archetypal after-submit automation, and on DNN it is what people
reach for "Execute C# Code" to build.

In MegaForm most of it is a diagram.

---

## 1. What works today: Condition + Approval nodes

**Builder → Workflow.**

```
Form submitted
   └─ Condition  amount > 20000 ──── yes ──→ Approval: Director ──→ Approval: Finance ──→ Done
                                  └── no ──→ Condition  amount > 5000 ── yes ─→ Approval: Manager ──→ Done
                                                                     └── no ─→ Approval: Team lead ──→ Done
```

The **Approval** node creates a task in the assignee's inbox, emails them, and waits. Approve or
reject decides which edge the flow takes next. Nothing about the shape above needs code, and the
diagram is the documentation.

Assignees can be a role, a named user, or `{{field:manager_email}}` from the submission itself — so
"route to the manager the claimant selected" is already configuration rather than code.

See [Approval workflows & inbox](/MegaFormDocsT?doc=dnn-workflow-approvals) and
[Workflow library](/MegaFormDocsT?doc=dnn-workflow-library) for reusing one flow across many forms.

---

## 2. Where a script earns its place

When the *approver* cannot be expressed as a rule on the form's own fields — because it lives in
another system.

```csharp
// PreInsert or PostCommit. Works today: the lookup, and handing the answer to the workflow.
var amount   = ctx.GetDecimal("total_amount");
var costCode = ctx.GetString("cost_centre");

var lookup = ctx.Actions.ExecuteNamedActionAsync("finance-approver-for",
                 new { costCode, amount }).Result;

var approver = lookup.First;
if (approver == null)
{
    ctx.SetVariable("approverEmail", "finance@example.com");
    ctx.SetVariable("routingReason", "no approver mapped for " + costCode);
}
else
{
    ctx.SetVariable("approverEmail", approver.Str("Email"));
    ctx.SetVariable("approverName",  approver.Str("DisplayName"));
    ctx.SetVariable("routingReason", "cost centre " + costCode + ", limit " + approver.Num("Limit"));
}
```

`ctx.SetVariable` values are stored on the run record, and a workflow **Approval** node can address
`{{var.approverEmail}}`. So today the split is: **the script decides who**, the **workflow does the
asking and the waiting**. That division is worth keeping even after `ctx.Workflow` ships — waiting
for a human is exactly what a workflow engine is for and exactly what a script is not.

---

## 3. The planned interface

```csharp
Task<string> StartAsync (string workflowName, object model, CancellationToken ct = default);
Task         SignalAsync(string executionId, string signalName, object payload, CancellationToken ct = default);
```

What it adds over configuration:

- **Choose the flow**, not just the branch: a purchase over a threshold starts the capital-expenditure
  workflow rather than a longer branch of the same one.
- **Start a flow for a different record** — a submission that creates three orders can start an
  approval per order.
- **Signal a waiting flow** when something outside MegaForm happens: a script on a second form, or an
  AsyncWorker stage polling an external system, releases a flow that is waiting.

```csharp
// PLANNED
var flow = amount >= 20000 ? "capex-approval" : "standard-approval";
var executionId = await ctx.Workflow.StartAsync(flow, new {
    ctx.SubmissionId,
    amount,
    approver = ctx.GetString("approverEmail")
});
ctx.SetVariable("approvalExecutionId", executionId);
```

---

## 4. What a script must not do here

Do not implement the waiting. A script runs inside a submit request and finishes in milliseconds; an
approval takes days, survives restarts, needs reminders, reassignment and an audit trail. That is the
workflow engine's job, and every one of those properties is lost by a script that tries to own it.

The same applies to sleeping, polling, or spawning background work — `Task.Run`, `Thread` and
`Task.Factory` are refused at compile time for this reason.

---

## 5. Which stage

| Want | Stage |
|---|---|
| Decide the route, then let the workflow ask | **PostCommit** — the claim exists and can be approved |
| Refuse a claim that breaks a hard limit before it is filed | **PreInsert** — see [fraud checks](automation-fraud-check.md) |

---

## 6. What is recorded

The routing decision is on the run record, and the approval itself has its own history in the
workflow inbox:

```
Stage       PostCommit
Variables   approverEmail = director@example.com
            routingReason = cost centre CC-4410, limit 25000
Calls       db 'finance-approver-for' → rows=0 read=1 (12ms)
```

"Why did this go to the director" is answerable a year later, which for an approval trail is the
entire point.

## Related

- [Approval workflows & inbox](/MegaFormDocsT?doc=dnn-workflow-approvals)
- [Workflow library](/MegaFormDocsT?doc=dnn-workflow-library)
- [Send email, SMS or Telegram based on what was answered](automation-notifications.md)
- [Automation overview](automation-overview.md)
