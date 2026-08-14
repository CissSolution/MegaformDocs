# MegaForm Automation v2 — design

**Status:** MVP implemented and running. Everything marked ✅ below has been exercised on a live DNN
site; everything marked 🔜 is designed, has its interface declared in code, and throws a named
"not available on this installation yet" error if a script reaches for it.

**Goal.** Match what Action Form (PlantAnApp) and Dynamic Forms (Data Springs) let a DNN customer do
after a submit — and beat them on the part those products do not solve: making powerful automation
safe to ship inside a template, a gallery download, or an exported form.

---

## 1. The problem with where v1 landed

v1 shipped a host-only C# hook that could read the submission, log, set a variable and fail. It was
safe and it was not worth having. A hook that can only do arithmetic is the Calculate field with
extra ceremony; the two things people actually reach for C# to do are *write this somewhere else*
and *tell another system*.

The tempting fix is to open the framework: let the script `new HttpClient()` and
`new SqlConnection(connectionString)`. Only a host can save a script, and that host already had file
access to the server to switch the feature on — so, the argument goes, blocking them from HttpClient
protects nobody.

The argument is right about the *threat* and wrong about the *product*. What raw .NET costs is not
safety from the host; it is every property that makes automation sellable and operable:

| Raw .NET | Consequence |
|---|---|
| connection string inside the script | travels with an exported form; rotating a password becomes a hunt through every form on every site |
| URL assembled at runtime from submitted data | an anonymous public form becomes a request generator pointed at the server's own network |
| the script decides what SQL runs | "what can this form touch" has no answer anybody can read |
| no interception point | no audit of what a run actually did, so no answer after an incident |
| a script that runs anywhere it lands | an imported template silently writes to *some* database with a similar schema |

So v2 keeps the framework closed and opens **capabilities**: the script supplies parameters, the
site supplies the SQL, the URL and the secret.

---

## 2. Three tiers

| Tier | Who can author | What it reaches | Status |
|---|---|---|---|
| **Safe Script** | host, feature flag on | read submitted data, `Log`, `SetVariable`, `Fail`, `SetValue` (pre-commit stages) | ✅ |
| **Trusted Automation** | host, feature flag on, per-stage approval hash | `ctx.Actions` (named SQL) · `ctx.Api` (named HTTP) · `ctx.Notify` · `ctx.Identity` · `ctx.Documents` · `ctx.Files` · `ctx.Queue` · `ctx.Response` | Actions/Api/Response complete; Notify/Identity wired on DNN; provider adapters remain for Documents/Files/Queue |
| **Infrastructure Admin** | host, plus a separate opt-in per preset | `ctx.Jobs.RunCommandPresetAsync` — a *preset name*, never a command line | 🔜 |

The tiers are about blast radius, not about difficulty. Tier 3 exists so that "run our invoice
generator executable" is possible without `Process.Start(userInput)` ever being possible.

---

## 3. Lifecycle stages

`FormSchema.Settings.Automation` holds one script block per stage. Each block carries **its own**
approval record: a script trusted to send an email after the fact is not automatically trusted to
veto submissions.

| Stage | Runs | Can abort? | Can change values? | Typical work |
|---|---|---|---|---|
| `PreValidate` | before validation completes | ✅ | ✅ | blacklist, fraud score, external eligibility check |
| `PreInsert` | inside the submit transaction, before the row exists | ✅ **and it rolls back** | ✅ | normalise, encrypt, derive, final business rule |
| `PostCommit` | after the row is committed | ❌ | ❌ (refused, not ignored) | notify, sync, provision, generate |
| `AsyncWorker` | off a queue, later | ❌ | ❌ | heavy documents, slow third parties, command presets |

Two properties are load-bearing:

- **`ctx.CanAbort`** tells a script which world it is in, and `Fail()` behaves accordingly:
  a veto before the commit, a recorded failure after it.
- **`ctx.SetValue` throws at PostCommit** rather than being ignored. A script that believes it
  rewrote a stored value and did not is a data bug that surfaces months later in a report.

`settings.afterSubmitScript` (v1) is read as the PostCommit alias, so forms configured before the
stages existed keep working unchanged.

**Implemented:** PreValidate, PreInsert and PostCommit run in the submission pipeline. AsyncWorker
has a submit call-site, durable queue contract and reload/reapproval worker. Each host still has to
register its durable `MF_AutomationOutbox` queue/dequeue implementation; it never falls back to
running heavy work inline.

---

## 4. The automation catalog

One per site, server-side, host-edited. It is the complete answer to *what can any script on this
site do*, and it is the artefact a security reviewer reads instead of reading every script.

```jsonc
{
  "dbActions": [{
    "name": "crm-insert-lead",
    "connectionName": "CustomerCrm",          // a connection registered in Database Settings
    "kind": "execute",                        // execute | scalar | query
    "sql": "INSERT INTO CRM_Leads (FullName, Email) VALUES (@fullName, @email)",
    "parameters": ["fullName", "email"],      // anything else the script passes is REFUSED
    "maxRows": 500, "timeoutSeconds": 20, "enabled": true
  }],
  "endpoints": [{
    "name": "crm-lead-created",
    "url": "https://crm.example.com/api/leads",
    "method": "POST",
    "headers": { "X-Tenant": "acme" },
    "authType": "bearer",                     // none | bearer | basic | header
    "authValue": "…",                         // masked to "***" whenever the catalog is read back
    "timeoutSeconds": 20, "maxAttempts": 2, "retryDelaySeconds": 2, "enabled": true
  }],
  "commandPresets": [ /* tier 3 */ ],
  "notificationTemplates": [{
    "name": "approval-request", "channel": "email",
    "subject": "Review {{reference}}", "body": "<p>Hello {{name}}</p>"
  }],
  "identity": {
    "enabled": true, "allowUserCreation": true,
    "allowedRoles": ["Customers", "Reviewers"]
  },
  "folders":        [ /* ctx.Files */ ]
}
```

Design notes that matter:

- **Declared parameters are enforced.** A script passing `scoer` instead of `score` is refused
  before a command is built. The silent version writes NULL and reports success.
- **The secret never leaves the server.** It is attached to the request on the way out. `Redacted()`
  masks it for the admin UI; the save path restores a value the editor sent back as the mask, which
  is the bug where a masked field destroys what it was protecting.
- **SsrfGuard applies to catalog entries too.** An administrator can type a loopback URL; the guard
  still refuses it, because the failure it prevents does not care who configured the target.
- **An imported script names actions the importing site may not define** — so it fails loudly with
  the list of what *is* defined, instead of running against a similar-looking schema.

Stored as a per-site settings blob: `MegaForm_AutomationCatalog` (DNN portal setting / Oqtane site
setting), the same seam the SQL and cloud-storage connection catalogs already use.

---

## 5. Interfaces

Declared in `MegaForm.Core/Automation/IAutomationCapabilities.cs`. All Task-returning: automation
talks to networks and databases, and a synchronous facade over that is a thread-pool starvation bug
waiting for a busy day.

```csharp
IAutomationDbCapability        Task<AutomationDbResult> ExecuteNamedActionAsync(name, parameters, ct)
                               IList<string> ActionNames()
IAutomationHttpCapability      Task<AutomationHttpResult> PostJsonAsync(endpointName, payload, ct)
                               Task<AutomationHttpResult> SendAsync(endpointName, body, contentType, extraHeaders, ct)
                               IList<string> EndpointNames()
IAutomationNotifyCapability    EmailAsync(template, to, model) · SmsAsync(…) · PushAsync(channel, …)
IAutomationIdentityCapability  CreateUserAsync(email, userName, roles) · AddRoleAsync(userId, role)
                               FindUserIdByEmailAsync(email)
IAutomationDocumentCapability  CreatePdfAsync(template, model) · CreateFromTemplateAsync(template, format, model)
IAutomationFileCapability      MoveUploadAsync(fieldKey, targetFolderName) · FolderNames()
IAutomationQueueCapability     PublishAsync(topicName, payload) · TopicNames()
IAutomationJobCapability       RunCommandPresetAsync(presetName, arguments) · PresetNames()
```

Reached from a script as `ctx.Actions`, `ctx.Api`, `ctx.Notify`, `ctx.Identity`, `ctx.Documents`,
`ctx.Files`, `ctx.Queue`, `ctx.Jobs`, plus `ctx.Response`.

> **Naming.** The context type is still `SubmissionScriptContext`; `SubmissionAutomationContext` is
> the intended final name and is a mechanical rename once v1 scripts are migrated. Renaming it today
> would break the generated wrapper every existing script compiles against, for no behavioural gain.

Capabilities without a host provider are **throwing stubs**, not nulls. DNN currently attaches
catalog-backed `ctx.Notify` (email plus named-endpoint SMS/Zalo/Telegram) and policy-backed
`ctx.Identity`. Documents/Files/Queue/Jobs keep the explicit *"not available on this installation
yet"* error until their reviewed host adapter is registered.

---

## 6. Security rules (all enforced today)

1. **Feature flag in a config file** — `MegaForm:AutomationScriptEnabled` (`web.config` appSettings /
   `appsettings.json`). Off on every install. A file rather than a settings screen: the right bar for
   "people may run code here" is *can edit files on the server*.
2. **Host/superuser-only authoring**, checked server-side in every action.
3. **Approval hash.** The server stores `SHA256(source)` plus who approved it and when; the runtime
   re-hashes before every run. This is what makes an imported script inert *by construction* rather
   than by vigilance.
4. **Ordinary form saves cannot touch the block** — `AfterSubmitScriptStore.PreserveOnSave` replaces
   whatever the caller posted with the server's stored copy, on all four platforms, including the
   quieter attack of switching a script *off*.
5. **Named connections and named endpoints only.** No secret in a script.
6. **SsrfGuard** on every outbound URL, catalog entries included.
7. **Path sandbox** for file operations — named folders, never a path (🔜 with `ctx.Files`).
8. **Command presets**: fixed executable, fixed working directory, fixed timeout, argument template
   with named substitutions, disabled by default (🔜).
9. **Full audit** — approvals, runs (stage, outcome, duration, abort, actor) and every capability
   call (target, status, duration).
10. **Timeout** bounds what the visitor waits for. It cannot kill a thread; that is stated plainly in
    the admin docs rather than implied away. Long work belongs on `AsyncWorker`.
11. **Server-only settings.** `settings.automation` is stripped from every client-bound schema
    payload by `FormSchemaSensitivePropertyStripper` — source and approval hash both.

---

## 7. Audit tables

Created on first use (DNN install scripts run once per version; a feature added between releases
cannot assume one has run).

| Table | Holds |
|---|---|
| `MF_AutomationScriptApprovals` | FormId, Stage, ScriptHash, Action, UserId, UserName, SourceLength, ChangedOnUtc — plus `Stage='Catalog'` rows when a host edits the catalog |
| `MF_AutomationRuns` | RunId, FormId, SubmissionId, Stage, ScriptHash, Success, **Aborted**, DurationMs, ActorUserId, ErrorMessage, LogText, RanOnUtc |
| `MF_AutomationCapabilityCalls` | RunId, Capability, Target, Success, DurationMs, Detail, AtUtc |
| `MF_AutomationOutbox` | queued AsyncWorker work: PayloadJson, Status, Attempts, LastError, NextRunUtc |

The capability table is separate on purpose. *"Did this submission reach the CRM"* and *"did the
script succeed"* are different questions: a script can end successfully after an outbound call
returned 500, and can fail after writing three rows it did not roll back.

---

## 8. What a script looks like

```csharp
// PreInsert — can still refuse, and can still change what gets stored.
if (ctx.Db == null) { }                                  // (v1 surface, still present)

var blocked = ctx.Actions.ExecuteNamedActionAsync("is-blacklisted",
                  new { email = ctx.GetString("email") }).Result;
if (Convert.ToInt32(blocked.ScalarValue) > 0)
    ctx.Fail("We cannot accept a submission from this address.");

ctx.SetValue("phone", ctx.GetString("phone").Replace(" ", ""));
```

```csharp
// PostCommit — the row exists; now tell everyone about it.
var lead = ctx.Actions.ExecuteNamedActionAsync("crm-insert-lead", new {
    fullName = ctx.GetString("full_name"),
    email    = ctx.GetString("email")
}).Result;

var reply = ctx.Api.PostJsonAsync("crm-lead-created", new {
    submissionId = ctx.SubmissionId,
    email = ctx.GetString("email")
}).Result;

if (!reply.Ok) ctx.Log("CRM returned " + reply.Status + " — the nightly sync will retry.");

ctx.Response.SuccessMessage = "Thanks — your reference is LEAD-" + ctx.SubmissionId + ".";
ctx.Response.RedirectUrl    = "/thank-you?ref=" + ctx.SubmissionId;
```

---

## 9. What the deny-list still refuses

`System.Net`, `System.Data`, `System.IO`, `System.Reflection`, `System.Diagnostics`,
`System.Threading` (except `System.Threading.Tasks`, and except `Task.Run` / `Task.Factory` /
`Task.ContinueWith` / `Parallel`, which start work outliving the request), `System.Security`,
`System.Xml`, `Microsoft.Win32`, `DotNetNuke.*`, `Oqtane.*`, `Umbraco.*`, `dynamic`, pointers.

Checked on **bound symbols**, so aliases, `global::`, fully-qualified names, generic arguments and
`var` do not evade it, and **before Emit**, so a refused script never becomes an assembly.

> Two mistakes this list has already made, both caught by tests rather than by review: it excluded
> the script's own generated namespace (so every script was refused), and it excluded
> `System.Threading.Tasks` (so the entire async capability rail was unreachable). An allow-list that
> blocks the thing it exists to permit fails silently and convincingly.

---

## 10. Verified on a live DNN site

One `TestRun` on `dnn_megafresh.ai`, host account, form 8:

```
db action 'crm-count-leads'   → 4
db action 'crm-insert-lead'   → rows=1
db action 'crm-count-leads'   → 5
db action 'crm-recent-leads'  → 3 rows (lead 18: Priya Raman)
endpoint 'crm-lead-created'   → 200 in 743ms      (bearer token attached from the catalog)
endpoint 'internal-only'      → blocked: URL targets a blocked (private/loopback/metadata) address
```

`MF_AutomationRuns` row: PostCommit, success, 809 ms, **6 capability calls** recorded.
Catalog read back through the API: `authValue: "***"`.

---

## 11. Roadmap

| # | Item | Notes |
|---|---|---|
| 1 | `ctx.Notify` | **Done on DNN:** email via host sender; SMS/Zalo/Telegram via a named guarded endpoint |
| 2 | `ctx.Identity` | **Done on DNN:** existing provisioning/principal adapters plus catalog role allow-list |
| 3 | `ctx.Documents` | PDF/Word/Excel from a registered template → secure storage → download token |
| 4 | `ctx.Files` | named folders only, so a script cannot express `..` |
| 5 | `ctx.Queue` | RabbitMQ / Kafka / SQS; `MF_AutomationOutbox` is the local durable hop |
| 6 | `ctx.Jobs` | command presets, tier 3, per-preset opt-in |
| 7 | `PreValidate` + `AsyncWorker` call sites | **Core done**; durable host outbox/dequeue implementation remains |
| 8 | `async Task RunAsync(ctx, ct)` script shape | **Done**, with legacy `ISubmissionScript.Run` compatibility |
| 9 | Rename to `SubmissionAutomationContext` | after v1 scripts are migrated |
| 10 | Builder UI for the catalog | today it is a host-only JSON endpoint |

---

## 12. Where the code is

| Concern | File |
|---|---|
| capability interfaces + stages + response | `MegaForm.Core/Automation/IAutomationCapabilities.cs` |
| catalog model + provider | `MegaForm.Core/Automation/AutomationCatalog.cs` |
| Db + Http implementations, fallback stubs | `MegaForm.Core/Automation/AutomationCapabilityImpl.cs` |
| Notify + Identity host adapters | `MegaForm.Core/Automation/AutomationHostCapabilities.cs` |
| AsyncWorker reload/reapproval executor | `MegaForm.Core/Automation/AutomationAsyncWorker.cs` |
| stage settings | `MegaForm.Core/Models/AfterSubmitScriptSettings.cs` (`FormAutomationSettings`) |
| authority rules | `MegaForm.Core/Services/AfterSubmitScriptGuard.cs` |
| runner, stage dispatch, audit | `MegaForm.Core/Services/AfterSubmitScriptService.cs` |
| pipeline wiring | `MegaForm.Core/Services/SubmissionProcessor.cs` (`RunAutomationStage`) |
| compile + deny-list | `MegaForm.Scripting/` |
| DNN endpoints + audit tables | `MegaForm.DNN/WebApi/FormScriptController.cs`, `MegaForm.DNN/Data/DnnAutomationAuditStore.cs` |
| Oqtane endpoint | `MegaForm.Oqtane.Server/Controllers/FormScriptController.cs` |
| tests | `MegaForm.Sdk.Tests/AutomationV2Tests.cs`, `AfterSubmitScriptTests.cs` |
