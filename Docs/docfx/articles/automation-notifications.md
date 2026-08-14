# Send email, SMS or Telegram based on what was answered

> **Two things on this page.** Sending a message when a form is submitted works today, with no code,
> through the workflow **Email** node — §1. Choosing the channel, the template and the recipient from
> inside a script (`ctx.Notify`) is **planned**: the interface is defined and a script calling it
> today gets *"ctx.Notify is not available on this installation yet"*.

---

## 1. What works today: the Email node

For "when this form is submitted, email these people", use the workflow **Email** node. It holds the
SMTP settings, supports `{{field:key}}` tokens in the subject and body, and needs no code:

**Builder → Workflow → add an Email node after the start node.**

Conditional routing works today as well, without a script: put a **Condition** node in front of two
Email nodes.

```
Form submitted → Condition (amount > 5000) ─ yes → Email "Director approval"
                                            └ no  → Email "Team lead approval"
```

That covers a large share of what people write code for. Reach for a script when the *recipient* has
to be looked up, or when the channel depends on the answers.

---

## 2. What a script adds

The value of the script version is not sending — it is deciding.

```csharp
// PostCommit. PLANNED — ctx.Notify is not wired yet.
var amount   = ctx.GetDecimal("total_amount");
var costCode = ctx.GetString("cost_centre");

// Who owns this cost centre? The form does not know; the finance database does.
var owner = ctx.Actions.ExecuteNamedActionAsync("finance-approver-for",
                new { costCode, amount }).Result;

var approverEmail = owner.First?.Str("Email");
var approverPhone = owner.First?.Str("Mobile");

if (string.IsNullOrEmpty(approverEmail))
{
    await ctx.Notify.EmailAsync("unrouted-claim", "finance@example.com",
        new { ctx.SubmissionId, costCode, amount });
    ctx.Log("No approver for cost centre " + costCode + " — sent to the finance inbox.");
    return;
}

await ctx.Notify.EmailAsync("expense-approval-request", approverEmail, new {
    claimant = ctx.GetString("full_name"),
    amount,
    costCode,
    approveUrl = "/approvals?ref=" + ctx.SubmissionId
});

// Urgent and large: also reach them where they actually are.
if (amount >= 20000 && !string.IsNullOrEmpty(approverPhone))
    await ctx.Notify.SmsAsync("expense-urgent", approverPhone, new { amount, ctx.SubmissionId });

if (ctx.GetBool("notify_team"))
    await ctx.Notify.PushAsync("telegram", "claim-filed", "@finance-alerts",
        new { claimant = ctx.GetString("full_name"), amount });
```

The lookup — *who owns this cost centre* — is the part no node configuration expresses, and it is the
only part that needed code.

---

## 3. The planned interface

```csharp
Task EmailAsync(string templateName, string to, object model, CancellationToken ct = default);
Task SmsAsync  (string templateName, string toPhone, object model, CancellationToken ct = default);
Task PushAsync (string channel, string templateName, string to, object model, CancellationToken ct = default);
```

`channel` is any provider the site has registered — `"telegram"`, `"zalo"`, `"slack"`.

Three things follow from the shape:

- **A template name, not a body.** The wording is owned by whoever owns the wording, translated with
  the rest of the site, and changeable without touching a script.
- **No credentials.** The script never sees an SMTP password or a bot token; the provider does.
- **Every send is recorded** as a capability call — channel, template, recipient, outcome — so
  "was the approver told" has an answer.

---

## 4. Why not just let a script send mail itself

`System.Net.Mail` is not available to scripts, and the reason is the same as everywhere else on the
rail: a script that holds credentials cannot be exported, cannot be reviewed safely, and leaves no
record of what it sent. Sending is not the risk — *holding the secret and being unauditable* is.

---

## 5. Until it ships

- Use the workflow **Email** node, with **Condition** nodes for branching.
- If the recipient needs a lookup, a script can do the lookup today and hand the answer to the
  workflow: `ctx.SetVariable("approverEmail", …)` is stored on the run record, and an Email node
  reads workflow variables.
- For SMS and Telegram, use a [named HTTP endpoint](automation-rest-crm.md) against the provider's
  API. You lose the template indirection; you keep the guard, the retry policy and the audit trail —
  and the credential still lives in the catalog rather than in the script.

```csharp
// Works today: SMS through the provider's REST API, credential in the catalog.
var sms = ctx.Api.PostJsonAsync("sms-provider", new {
    to = approverPhone,
    body = "Expense claim " + ctx.SubmissionId + " needs your approval."
}).Result;
if (!sms.Ok) ctx.Log("SMS provider returned " + sms.Status);
```

## Related

- [Start an approval that routes itself](automation-approval-routing.md)
- [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md)
- [Automation overview](automation-overview.md)
