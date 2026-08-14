# Writing your own C# after a submission

MegaForm compiles and runs C# you write, on the server, when a form is submitted.

## Why this exists

Most of what a form needs to do after a submission is already configuration. The webhook node posts
to an endpoint. The database node mirrors a submission into a table. Workflow sends the email, asks
for the approval, creates the user, branches on a value. **Start there.** Configuration survives an
export, needs no one to enable scripting, and cannot be broken by a change to an API you do not own.

| If the requirement is | Use |
|---|---|
| every submission goes to one endpoint | [Webhook / API service task](integration-webhook.md) |
| every submission is mirrored into one table | [Form Settings → Database](integration-sql-insert.md) |
| email, approval, add-user, add-role, branch on a value | workflow nodes |

What those cannot express is a **decision with shape**. A node does one thing to every submission.
The cases below are the ones that keep arriving, and none of them is a node with more checkboxes:

- **The write is more than one row, and the second depends on the first.** An order header whose
  generated key its line items need. No node can hold a value between two writes.
- **The destination depends on the answer.** Enterprise enquiries to Salesforce, everyone else to
  the internal queue, and a different payload shape for each.
- **The number has to be right, not close.** Tax by country and product class, a rate your finance
  team rounds their own way, a discount table that lives in another system.
- **The rule is a lookup, not a value on the form.** Whether this class code is still open, whether
  this account is past due, whether this postcode is in the service area.
- **Two systems have to agree.** Write locally, call the remote API, and record what the remote one
  answered so a human can reconcile it later.

The honest test: if you can describe the requirement as *"for every submission, do X"*, a node
already does it and you should use the node. If it is *"it depends"*, that is what this section is
for.

The trade you are making is real. A script is code your team owns, on a server you own, with no
sandbox — [Safety and responsibility](scripting-safety.md) is the page that spells out what a host
is agreeing to before switching it on.

---

## The one idea worth understanding first

`ctx` is the submission. Everything else is ordinary C#.

There is no mediated object between your script and the platform — no catalog of named actions, no
resource broker. You open a `SqlConnection`, you `new HttpClient()`, you call `UserController`. If
you can write it in a DNN module, you can write it here.

```csharp
using System.Net.Http;                         // everything else: plain C#
using System.Text;

var email = ctx.GetString("email");            // ctx: the submitted values
var total = ctx.GetDecimal("order_total", 0m); // and facts about this submission
ctx.Log($"order for {email}");                 // and a line in the run record

using (var http = new HttpClient())
{
    var body  = new StringContent($"{{\"email\":\"{email}\",\"total\":{total}}}",
                                  Encoding.UTF8, "application/json");
    var reply = await http.PostAsync("https://crm.example.com/leads", body, ct);
    ctx.Log($"crm status={(int)reply.StatusCode}");
}
```

A script body may begin with `using` directives; they are lifted above the generated wrapper for
you. The body is async — `await` works directly, and you are handed a `CancellationToken` named
`ct`.

> [!NOTE]
> If you arrived from an older page describing `ctx.Actions`, `ctx.Api`, `ctx.Notify`,
> `ctx.Identity` or an automation catalog: that layer was removed. Scripts call platform APIs
> directly now.

### What `ctx` holds — the whole surface

| Member | What it is |
|---|---|
| `ctx.Data` | the submitted values, a case-insensitive dictionary |
| `ctx.GetString` / `GetDecimal` / `GetInt` / `GetBool` / `GetDate` | typed reads with a fallback |
| `ctx.FormId`, `ctx.SubmissionId`, `ctx.PortalId`, `ctx.FormTitle` | which form, which row |
| `ctx.UserId`, `ctx.UserName`, `ctx.UserEmail`, `ctx.IpAddress`, `ctx.UtcNow` | who and when |
| `ctx.Log(string)` | a line in the run record |
| `ctx.Fail(string)` | records the run as failed |
| `ctx.SetValue(key, value)` | changes a stored value — **refused after the commit**, see below |
| `ctx.SetVariable`, `ctx.Variables` | values carried to the run record |
| `ctx.Response` | override the success message or redirect for this submission |
| `ctx.Stage` | which stage is running |

Everything else comes from the platform, with a `using`. These are the ones you are likely to reach
for — a reference list, closed with one line of code so the fence still runs as it stands:

```csharp
using DotNetNuke.Entities.Users;   // UserController.GetUserByEmail, UserController.CreateUser
using DotNetNuke.Security.Roles;   // RoleController.Instance.GetRoleByName / AddUserRole
using DotNetNuke.Services.Mail;    // Mail.SendEmail(from, to, subject, body) — returns void
using System.Data.SqlClient;       // new SqlConnection(Config.GetConnectionString())
using System.Net.Http;             // new HttpClient()

// A string literal cannot sit inside an interpolation hole in this language version,
// so build the line with concatenation when the value comes from a call that takes one.
var found = UserController.GetUserByEmail(ctx.PortalId, "jane.carter@contoso.com");
ctx.Log("lookup: " + (found == null ? "no account" : found.UserID.ToString()));
```

---

## A complete example

This is close to the script that was measured live. It reads two answers, computes a total, writes a
row to a table the site owns, and mails the customer.

```csharp
using System.Data.SqlClient;
using DotNetNuke.Common.Utilities;
using DotNetNuke.Services.Mail;

var email   = ctx.GetString("email");
var country = ctx.GetString("country", "GB");
var rate    = country == "DE" ? 0.19m : 0.20m;
var total   = ctx.GetDecimal("order_total", 0m) * (1m + rate);

ctx.Log($"country={country} rate={rate} total={total:0.00}");

using (var cn = new SqlConnection(Config.GetConnectionString()))
{
    await cn.OpenAsync(ct);
    using (var cmd = new SqlCommand(
        "INSERT INTO Acme_Orders (SubmissionId, Email, Country, Total) " +
        "VALUES (@sid, @email, @country, @total)", cn))
    {
        cmd.Parameters.AddWithValue("@sid", ctx.SubmissionId);
        cmd.Parameters.AddWithValue("@email", email);
        cmd.Parameters.AddWithValue("@country", country);
        cmd.Parameters.AddWithValue("@total", total);
        ctx.Log($"insert rowsAffected={await cmd.ExecuteNonQueryAsync(ct)}");
    }
}

Mail.SendEmail("orders@example.com", email, "Your order",
    $"Thank you. Your total including VAT is {total:0.00}.");
ctx.Log($"mail handed to DNN's sender for {email}");
```

Parameterise every value that came from `ctx.Data`. The script runs with the application pool's
database access, so string concatenation here is a SQL injection hole in your own tables.

That script — plus an `HttpClient.PostAsync` to an external endpoint and a
`UserController.CreateUser` followed by `RoleController.Instance.AddUserRole` — was run on a DNN
10.3 site by submitting the form anonymously. One submission, 927 ms, all four effects real: `rows
affected 1`, HTTP 200 from the external endpoint, the message handed to DNN's sender, an account
created and a role granted.

---

## Stages

Four stages exist in the engine. They differ in one respect that decides everything else: where they
sit relative to the database commit.

| Stage | Runs | Can refuse the submission? | Can change stored values? | Configurable today? |
|---|---|---|---|---|
| **PreValidate** | before validation finishes | yes | yes | **no** |
| **PreInsert** | inside the submit transaction | **yes — and it rolls back** | yes | **no** |
| **PostCommit** | after the row is committed | no | no | **yes** |
| **AsyncWorker** | later, off a queue | no | no | **no** |

> [!IMPORTANT]
> **Only PostCommit can be authored.** The script you write and approve is stored as the form's
> after-submit hook, and the engine reads that hook as PostCommit. Nothing in the product writes a
> script into the other three stages — no editor, no API, no import path.

Two consequences worth being clear about:

- **A script cannot refuse a submission today.** Refusing needs PreInsert. `ctx.Fail("…")` at
  PostCommit records the run as failed; the row is already stored. To turn away unwelcome-but-valid
  input, use the anti-spam settings and workflow rules.
- **A script cannot rewrite a stored value today.** `ctx.SetValue` is *refused* at PostCommit rather
  than quietly ignored, on purpose: a script that believes it rewrote a stored value and did not is
  a data bug that surfaces months later in a report.

A PostCommit script can still compute a value and send it onward — into your own table, to an API,
into an email. It just does not go back into the submission.

---

## The three gates

A script does not run until all three are satisfied, in this order.

1. **A config file switch.** In `web.config` appSettings:

   ```xml
   <add key="MegaForm:AfterSubmitScriptEnabled" value="true" />
   ```

   Off on every install. A file rather than a settings screen on purpose: the right bar for "people
   may run code on this server" is *can edit files on this server*.

2. **A host account saves the script.** Superuser — not a site administrator, not module-edit
   rights.

3. **An approval hash over the source.** The stored hash must match the source for the script to
   run. So a script that arrives inside imported data, a backup or a gallery template is inert until
   a host on *that* site opens it and saves it.

Ordinary form saves cannot introduce, alter or enable a script.

---

## Who is responsible

The host owns what their scripts do, exactly as they own a module they install. A script has the
application pool's identity: its database access, its file access, its network. Nothing here
sandboxes that, and nothing pretends to.

There is an opt-in strict mode that restores an older namespace deny-list. It is off by default.

Everything on these pages is DNN: the gate is a DNN `web.config` key and the examples call DNN's own
APIs.

---

## The recipes

Each page is one job, with the script and what the run record shows afterwards.

| Recipe | Status |
|---|---|
| [Write to your own database, across several tables](automation-custom-db.md) | runs — `SqlConnection`, `rows affected 1` |
| [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md) | runs — `HttpClient`, HTTP 200 |
| [Send email, SMS or Telegram based on what was answered](automation-notifications.md) | email runs via `Mail.SendEmail`; SMS/Telegram are a call to the provider's API and are untested |
| [Create a user and grant a role](automation-user-provisioning.md) | runs — real account created, role granted |
| [Look up tax, exchange rate or shipping in real time](automation-realtime-pricing.md) | the lookup runs; writing the answer back into the submission needs PreInsert |
| [Block a submission with a blacklist or fraud check](automation-fraud-check.md) | not configurable — needs PreInsert |
| [Encrypt or normalise a field before it is stored](automation-field-encryption.md) | not configurable — needs PreInsert |
| [Start an approval that routes itself](automation-approval-routing.md) | the workflow nodes do this with no code |
| [Generate a PDF, Word or Excel document](automation-documents.md) | not implemented |
| [Move an uploaded file into a secure folder](automation-file-routing.md) | not implemented |
| [Publish an event to RabbitMQ, Kafka or SQS](automation-queue.md) | not implemented |

**Not implemented** means MegaForm ships nothing for it and nothing about it has been measured. A
script is ordinary C#, so referencing your own library is not blocked — but you are on your own,
and the recipe page says what exists instead.

Reference for the script surface itself: [Run your own C# after a
submission](after-submit-script.md).
