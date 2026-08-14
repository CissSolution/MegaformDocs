# Automation: business logic after a submission

A form that only stores answers is a filing cabinet. The forms that earn their place do something
when an answer arrives: score the lead and write it into the CRM database, refuse a booking that
clashes with a rule, call the tax service before the total is stored, hand the case to whoever owns
that postcode.

MegaForm covers most of that with no code — [webhooks](integration-webhook.md),
[a database insert](integration-sql-insert.md), workflow nodes for email and approvals. This section
is about the cases where the shape of the logic, not the destination, is the hard part: when *which*
of those things happens depends on what was submitted.

For those, MegaForm runs **C# you write**, on the server, at a point in the submission lifecycle you
choose.

---

## The one idea worth understanding first

A MegaForm script never holds a resource. It holds a **name**.

```csharp
// not a connection string and a SQL statement
await ctx.Actions.ExecuteNamedActionAsync("crm-insert-lead", new { email = ctx.GetString("email") });

// not a URL and a bearer token
await ctx.Api.PostJsonAsync("crm-lead-created", new { submissionId = ctx.SubmissionId });
```

The SQL, the URL, the credentials and the retry policy live in the site's **automation catalog**,
which an administrator maintains. The script supplies parameters.

That one indirection is what makes the feature safe to put in a product that ships templates:

- **No secret is ever in a script**, so a script is safe to export, review, diff and store in git.
- **Rotating a password is one edit in one place**, not a hunt through every form on every site.
- **The catalog is the complete answer to "what can any form here touch"** — a reviewable list,
  rather than free text a script assembles at runtime.
- **An imported script names actions the new site may not define**, so it fails loudly instead of
  running against a database that merely looks similar.
- **Every call is recorded** — target, outcome, duration — so after an incident there is an answer.

Raw `new SqlConnection(…)` and `new HttpClient()` are refused at compile time. They would give the
same power while losing every line above.

---

## Where a script can run

Four stages exist in the engine. They differ in one respect that decides everything else: where they
sit relative to the database commit.

| Stage | Runs | Can refuse the submission? | Can change stored values? | Can you configure it today? |
|---|---|---|---|---|
| **PreValidate** | before validation finishes | yes | yes | **no** |
| **PreInsert** | inside the submit transaction | **yes — and it rolls back** | yes | **no** |
| **PostCommit** | after the row is committed | no | no | **yes** |
| **AsyncWorker** | later, off a queue | no | no | **no** |

> [!IMPORTANT]
> **Only PostCommit can be saved in this release.** The script you write and approve is stored as the
> form's after-submit hook, and the engine reads that hook as the PostCommit stage. The other three
> stages are read by the runtime but nothing in the product writes them — there is no editor, no API
> and no import path that sets them. Recipes on the pages below that need PreValidate or PreInsert
> therefore describe the engine correctly and **cannot be configured on a site yet**. Each such page
> says so at the top.

`ctx.Fail("…")` records a failure at PostCommit; refusing a submission outright needs PreInsert.
`ctx.SetValue(…)` is **refused** at PostCommit rather than ignored, because a script that believes it
rewrote a stored value and did not is a data bug that surfaces months later in a report. A PostCommit
script can still compute a value — it just sends the result onward (to your table, an API, an email)
instead of back into the stored submission.

---

## The recipes

Each page below is one real job, with the script, the catalog entry it needs, and what the run
record shows afterwards.

Every status below was measured on a DNN 10.3.0 site running MegaForm 2.0.20, by submitting through a
real form and reading the run record afterwards — not by reading the code.

| Recipe | Uses | Status |
|---|---|---|
| [Write to your own database, across several tables](automation-custom-db.md) | `ctx.Actions` | ✅ **runs** — `rows=1` in 11–53 ms |
| [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md) | `ctx.Api` | ✅ **runs** — `status=200`, 1 attempt, 642 ms |
| [Send email, SMS or Telegram based on what was answered](automation-notifications.md) | `ctx.Notify` | ✅ **email runs** — delivered over SMTP. SMS/push need a named endpoint and are untested |
| [Create a user and grant a role](automation-user-provisioning.md) | `ctx.Identity` | ✅ **runs** — real account created, role granted from the allow-list |
| [Look up tax, exchange rate or shipping in real time](automation-realtime-pricing.md) | `ctx.Api` | 🟡 **partly** — the lookup runs; writing the result back into the submission needs PreInsert |
| [Block a submission with a blacklist or fraud check](automation-fraud-check.md) | PreInsert + `ctx.Actions` | ❌ **not configurable** — needs PreInsert |
| [Encrypt or normalise a field before it is stored](automation-field-encryption.md) | PreInsert + `ctx.SetValue` | ❌ **not configurable** — needs PreInsert |
| [Start an approval that routes itself](automation-approval-routing.md) | `ctx.Workflow` | ❌ **not wired** |
| [Generate a PDF, Word or Excel document](automation-documents.md) | `ctx.Documents` | ❌ **not wired** — `NotWiredException` at run time |
| [Move an uploaded file into a secure folder](automation-file-routing.md) | `ctx.Files` | ❌ **not wired** — `NotWiredException` at run time |
| [Publish an event to RabbitMQ, Kafka or SQS](automation-queue.md) | `ctx.Queue` | ❌ **not wired** — `NotWiredException` at run time |

A **not wired** capability still compiles: the interface is part of the product, so a script naming it
builds cleanly and then fails at run time with *"ctx.Documents is not available on this installation
yet"*. That is deliberate — the alternative is a script that appears to work and quietly does nothing.

**Not configurable** is a different thing and worth reading carefully: the engine implements the stage,
but no part of the product can save a script into it yet. The recipe is accurate about what the engine
does; you simply cannot switch it on from a site today.

### Platform coverage

The capability rail is wired on **DNN only**. On Oqtane the automation catalog exists but nothing else
does — `ctx.Notify` and `ctx.Identity` are the throwing stubs there, no run or capability call is
recorded, and an AsyncWorker script is dropped with a warning. Web and Umbraco have neither.

---

## Before any of this works

1. A host enables scripting in the server's config file — `MegaForm:AfterSubmitScriptEnabled`. It is
   off on every install, and it is a file rather than a settings screen on purpose: the right bar for
   "people may run code on this server" is *can edit files on the server*.
2. A **host account** — not a site administrator, not module-edit permission — writes and saves the
   script. Saving stamps an approval hash; the runtime refuses anything whose source does not match
   it, which is why a script that arrives inside an imported form or a gallery template is inert
   until a host on *that* site opens it and saves it.
3. An administrator adds the named actions and endpoints the script will use.

Full detail: [Run your own C# after a submission](/MegaFormDocsT?doc=int-csharp-script).
