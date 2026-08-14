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

`Form Settings → Server Script` offers four stages. They differ in one respect that decides
everything else: where they sit relative to the database commit.

| Stage | Runs | Can refuse the submission? | Can change stored values? |
|---|---|---|---|
| **PreValidate** | before validation finishes | yes | yes |
| **PreInsert** | inside the submit transaction | **yes — and it rolls back** | yes |
| **PostCommit** | after the row is committed | no | no |
| **AsyncWorker** | later, off a queue | no | no |

`ctx.Fail("…")` means *refuse this submission* before the commit and *record a failure* after it —
`ctx.CanAbort` tells a script which. `ctx.SetValue(…)` is **refused** at PostCommit rather than
ignored, because a script that believes it rewrote a stored value and did not is a data bug that
surfaces months later in a report.

---

## The recipes

Each page below is one real job, with the script, the catalog entry it needs, and what the run
record shows afterwards.

| Recipe | Uses |
|---|---|
| [Write to your own database, across several tables](automation-custom-db.md) | `ctx.Actions` |
| [Push a submission to a CRM, ERP or any REST/SOAP API](automation-rest-crm.md) | `ctx.Api` |
| [Block a submission with a blacklist or fraud check](automation-fraud-check.md) | PreInsert + `ctx.Actions` |
| [Encrypt or normalise a field before it is stored](automation-field-encryption.md) | PreInsert + `ctx.SetValue` |
| [Look up tax, exchange rate or shipping in real time](automation-realtime-pricing.md) | PreInsert + `ctx.Api` |
| [Send email, SMS or Telegram based on what was answered](automation-notifications.md) | `ctx.Notify` |
| [Start an approval that routes itself](automation-approval-routing.md) | `ctx.Workflow` |
| [Create a user and grant a role](automation-user-provisioning.md) | `ctx.Identity` |
| [Generate a PDF, Word or Excel document](automation-documents.md) | `ctx.Documents` |
| [Move an uploaded file into a secure folder](automation-file-routing.md) | `ctx.Files` |
| [Publish an event to RabbitMQ, Kafka or SQS](automation-queue.md) | `ctx.Queue` |

Pages are marked **Available now** or **Planned**. A planned page describes an interface that exists
in the product and a capability that is not wired yet; reaching for it from a script returns a clear
"not available on this installation yet" rather than failing obscurely.

---

## Before any of this works

1. A host enables scripting in the server's config file — `MegaForm:AutomationScriptEnabled`. It is
   off on every install, and it is a file rather than a settings screen on purpose: the right bar for
   "people may run code on this server" is *can edit files on the server*.
2. A **host account** — not a site administrator, not module-edit permission — writes and saves the
   script. Saving stamps an approval hash; the runtime refuses anything whose source does not match
   it, which is why a script that arrives inside an imported form or a gallery template is inert
   until a host on *that* site opens it and saves it.
3. An administrator adds the named actions and endpoints the script will use.

Full detail: [Run your own C# after a submission](/MegaFormDocsT?doc=int-csharp-script).
