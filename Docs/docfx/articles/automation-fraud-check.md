# Block a submission with a blacklist or fraud check

> **Available now.** The PreInsert stage aborts the submission and nothing is written — covered by
> an automated test that asserts the submissions table is still empty afterwards.

Required fields and validation rules stop malformed input. They cannot stop input that is perfectly
well-formed and unwelcome: an address on your blocklist, a fourth application from the same person
this hour, a card country that does not match the delivery country.

That decision needs data the form does not have, so it needs a lookup — and it has to happen
**before** the row is written, or it is not a decision, it is a cleanup job.

---

## 1. Use PreInsert, and know why

| Stage | What `ctx.Fail(…)` does |
|---|---|
| **PreValidate** | refuses the submission; the visitor sees it as a validation failure |
| **PreInsert** | refuses the submission **inside the transaction** — nothing is stored |
| PostCommit | records a failure; the row already exists and stays |

`ctx.CanAbort` is true only for the first two, and a script can assert on it.

---

## 2. A blocklist held in your own database

```jsonc
{
  "dbActions": [
    {
      "name": "is-blocked",
      "connectionName": "CustomerCrm",
      "kind": "scalar",
      "sql": "SELECT COUNT(*) FROM dbo.Blocklist WHERE Email = @email OR Domain = @domain",
      "parameters": ["email", "domain"]
    },
    {
      "name": "recent-attempts",
      "connectionName": "DashboardDatabase",
      "kind": "scalar",
      "sql": "SELECT COUNT(*) FROM dbo.MF_Submissions WHERE FormId = @formId AND IpAddress = @ip AND SubmittedOnUtc > DATEADD(hour,-1,GETUTCDATE())",
      "parameters": ["formId", "ip"]
    }
  ]
}
```

```csharp
// Stage: PreInsert
var email  = ctx.GetString("email").Trim().ToLowerInvariant();
var domain = email.Contains("@") ? email.Substring(email.IndexOf('@') + 1) : "";

var blocked = ctx.Actions.ExecuteNamedActionAsync("is-blocked", new { email, domain }).Result;
if (Convert.ToInt32(blocked.ScalarValue) > 0)
{
    ctx.Log("Blocked: " + email);       // the reason goes in the run record …
    ctx.Fail("We are unable to accept this application online. Please contact support.");
    return;                             // … not in what the visitor is told
}

var attempts = ctx.Actions.ExecuteNamedActionAsync("recent-attempts",
                   new { formId = ctx.FormId, ip = ctx.IpAddress }).Result;
if (Convert.ToInt32(attempts.ScalarValue) >= 5)
    ctx.Fail("You have submitted this form several times recently. Please try again later.");
```

> **The message is the product.** Whatever you pass to `Fail` is shown to an anonymous visitor. Say
> what they should do next; say nothing about why they were caught. `ctx.Log` is where the reason
> belongs — the run record is host-only.

---

## 3. A third-party fraud or reputation service

```csharp
// Stage: PreInsert
var check = ctx.Api.PostJsonAsync("fraud-score", new {
    email = ctx.GetString("email"),
    ip    = ctx.IpAddress,
    amount = ctx.GetDecimal("amount")
}).Result;

if (!check.Ok)
{
    // Decide deliberately: does an unreachable scorer mean "let it through" or "hold it"?
    ctx.Log("Fraud service unavailable (" + check.Status + ") — accepting and flagging for review.");
    ctx.SetValue("review_required", true);
}
else
{
    var score = (int)Newtonsoft.Json.Linq.JObject.Parse(check.Body)["score"];
    ctx.SetVariable("fraudScore", score);

    if (score >= 90)      ctx.Fail("We could not process this request. Please contact us.");
    else if (score >= 60) ctx.SetValue("review_required", true);
}
```

That fail-open / fail-closed choice is the whole design of this kind of check, and it is worth
writing the reasoning into the script as a comment. A payment form probably holds the submission; a
newsletter signup probably does not.

---

## 4. Rules that need no lookup at all

Not every check needs a database:

```csharp
// Stage: PreInsert
var start = ctx.GetDate("start_date");
var end   = ctx.GetDate("end_date");

if (start.HasValue && end.HasValue && end < start)
    ctx.Fail("The end date cannot be before the start date.");

if (start.HasValue && start.Value < ctx.UtcNow.Date.AddDays(2))
    ctx.Fail("Bookings need at least two working days' notice.");
```

Use a script here only when the rule is genuinely cross-field or conditional; a single-field rule
belongs in the field's own validation, where the visitor sees it before pressing Submit.

---

## 5. What the visitor and the host each see

The visitor gets the message from `Fail`, in place of the thank-you, with the form still filled in.

The host gets a run record:

```
Stage        PreInsert
Success      false
Aborted      true          ← the submission was refused, not merely logged
Duration     41 ms
Log          Blocked: chargeback.regular@example.com
Calls        db 'is-blocked' → rows=0 read=0 (18ms)
```

`Aborted` is the field that distinguishes *"we refused this"* from *"something broke after we
accepted it"*. They look identical in a log line and mean opposite things to a customer.

---

## 6. Practical notes

- **Keep it fast.** This runs before the visitor gets any response at all. A blocklist lookup on an
  indexed column is microseconds; a slow third-party scorer is a visible pause on every submission.
- **Anti-spam already runs.** MegaForm's honeypot, timing and rate-limit checks happen before this
  stage; you are adding business rules, not bot defence.
- **Watch for a script that refuses everything.** A bad `WHERE` clause turns a form off silently
  from the outside. The run records make it obvious — a run of `Aborted: true` rows with no
  submissions between them.

## Related

- [Encrypt or normalise a field before it is stored](automation-field-encryption.md) — the other
  PreInsert job
- [Automation overview](automation-overview.md)
