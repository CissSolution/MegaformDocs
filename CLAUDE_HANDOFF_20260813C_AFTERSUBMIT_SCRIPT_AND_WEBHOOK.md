# Handoff 2026-08-13C — after-submit C# script, webhook on DNN, two docs pages

Owner gave three tasks, then added two more mid-session:

1. **After-submit C# script**, host/superuser only (the §11 question from handoff B, now answered and built).
2. **Webhook on DNN working.**
3. **Document the script feature with screenshots** on `dnndefender.com/MegaFormDocsT`.
4. *(added mid-session)* A page about **using AI to build a form from an existing SQL table** — the form
   works immediately, writes into that table, and Submissions with `source: sql table` shows the rows.
5. *(added mid-session)* Copy the content of the DocFX **submissions-grid** article into the DNN
   channel's equivalent page.

Status: **1, 2, 3, 5 done and verified on live sites. 4 in progress** — see §7.

---

## 1. ⭐⭐⭐ The webhook was never broken. §13.3 of handoff B is wrong.

Handoff B concluded: *"`MF_WorkflowExecutions` không có dòng nào cho form 8 ⇒ engine chưa từng khởi
chạy"*. That is not what the database says. Reading `DNN_MegaFresh` directly:

```
exec: form 8  sub=287  failed  2026-08-13T11:40:23
CurrentNode : n-open
Error       : Webhook HTTP 0: Blocked webhook URL: URL host resolves to a blocked
              (private/loopback/metadata) address
```

The execution row exists. The engine ran, the Start node succeeded, the Webhook node executed, and
SsrfGuard refused `http://localhost:5199/crm/leads` — **which is the guard working correctly**. The
demo was pointed at loopback; nothing in the product was broken.

The earlier session almost certainly queried before submission #287 landed, or filtered it out.
⚠️ The lesson worth keeping: *"table has no rows for X"* is only evidence if the query ran after the
event and the filter is right. It is very cheap to conclude "never ran" from an empty result set.

### Proven working, end to end

Repointed both webhook nodes of form 8 at a publicly resolvable HTTPS endpoint through the product's
own **Workflow → Apply** API, then submitted the public form as an anonymous visitor. Both nodes
delivered:

| node | Authorization header | body received |
|---|---|---|
| `n-open` (no auth) | *(none)* | `{"customer":{"name":"Daniel Brooks","email":"…","phone":"+1 415 555 0187"},"note":"Please send the enterprise pricing sheet.","source":"megaform-demo"}` |
| `n-auth` (Bearer) | `Bearer demo-bearer-token-2026`, `X-Tenant: acme` | `{"customer":{"name":…,"email":…,"phone":…}}` |

That same delivery also **confirms the §2.2 "Map selected fields sends an empty payload" fix works on
DNN** — the mapped values are present, and the one static row (`source: megaform-demo`) still resolves
as a static value. The Core fix was already built into the DLL deployed at 14:49; it had never been
observed working because every previous attempt died at the guard first.

⛔ Still not touched, per the owner's standing instruction: `SsrfGuard` and
`MEGAFORM_ALLOW_PRIVATE_WEBHOOKS`. Nothing about this session needed them. The right answer for a
customer with an on-prem CRM remains a hostname the server can resolve to a routable address.

⚠️ Form 8's webhook nodes now point at a **temporary inbox** used for the proof. Before recording
anything from that form, repoint them at whatever the demo should show.

---

## 2. After-submit C# script — what shipped

### The security model, which is the whole design

Owner's question was *who is allowed to save a script*. Answer implemented: **host/superuser only,
and that is not enforced by the endpoint alone.**

Two independent conditions, both required to author:

- **Installation switch** — `MegaForm:AfterSubmitScriptEnabled` in `web.config` `<appSettings>` (DNN)
  or `appsettings.json` (Oqtane). Off on every install. Deliberately a config *file*, not a Host
  Settings row: the right bar for "people may run code here" is *can edit files on the server*, which
  is a smaller group than *knows the superuser password*, and editing the file restarts the app so the
  change lands when the host chose.
- **Host/superuser** — checked server-side in every action.

And a third that does not depend on either: **the approval record**. When a host saves, the server
stores `SHA256(source)` plus who approved it and when. `AfterSubmitScriptGuard.IsRunnable` re-hashes
the stored source before every run and refuses on mismatch or missing approval.

That makes every other write path inert *by construction* rather than by vigilance — form import,
template install, gallery download, restored backup, or a crafted save from someone holding only
`EditModule`. They can all put a `source` into the settings blob; none can produce a matching
approval, because the approval is written server-side at the moment a host pressed Save.

`AfterSubmitScriptStore.PreserveOnSave` closes the write side: the ordinary form-save endpoint on
**all four platforms** discards whatever the caller sent for `settings.afterSubmitScript` and puts the
server's stored copy back. A content editor cannot introduce, edit, or *switch off* a script.
(Switching off sounds harmless and is not: whoever can disable can re-enable.)

### Files

| Where | What |
|---|---|
| `MegaForm.Core/Scripting/SubmissionScriptContext.cs` | the whole surface a script can reach — no ambient services, no HttpContext, no connection |
| `MegaForm.Core/Models/AfterSubmitScriptSettings.cs` | config + approval record + run result |
| `MegaForm.Core/Interfaces/IMegaFormScriptCompiler.cs` | contract; Core does **not** reference Roslyn |
| `MegaForm.Core/Services/AfterSubmitScriptGuard.cs` | CanAuthor / IsRunnable / Approve / hash |
| `MegaForm.Core/Services/AfterSubmitScriptService.cs` | compile-on-save, hash cache, timeout, audit |
| `MegaForm.Core/Services/AfterSubmitScriptStore.cs` | reads/writes the block on both settings copies |
| `MegaForm.Scripting/*` | **new project** — Roslyn compiler, symbol policy, collectible ALC |
| `MegaForm.DNN/WebApi/FormScriptController.cs` · `Data/DnnScriptAuditStore.cs` | DNN endpoints + audit tables |
| `MegaForm.Oqtane.Server/Controllers/FormScriptController.cs` | Oqtane twin |
| `MegaForm.UI/src/builder/after-submit-script.ts` + shell in `dom.ts` | the panel |
| `MegaForm.Sdk.Tests/AfterSubmitScriptTests.cs` | 33 tests |

### ⭐⭐ Why the deny-list is a *semantic* pass, not a reference list

The obvious design — "only reference safe assemblies" — cannot work, and this is worth not
re-deriving: on .NET Framework `System.IO.File`, `System.Diagnostics.Process`, `System.Reflection`
and `System.Environment` all live in **mscorlib**, the one assembly a compilation cannot omit; on
.NET Core the equivalents sit behind the unavoidable `System.Runtime` facade. So references shape
convenience, never permission.

`ScriptSymbolPolicy` therefore walks the **bound** tree after Roslyn resolves symbols and checks
every type actually touched. Being symbol-based, it is not fooled by `using F = System.IO.File;`,
by fully-qualified names, by `global::`, by generic arguments, or by `var`. It runs **before Emit**,
so a refused script never becomes an assembly.

MegaForm's own namespaces are **allow-listed** (`MegaForm.Core.Scripting`, `MegaForm.Core.Models`,
plus the generated script namespace) rather than deny-listed, because a deny-list would have to be
updated whenever a namespace is added and the failure mode of forgetting is silent reach — e.g.
`MegaForm.Core.Services.WebhookService`, which has a public constructor and whose entire job is an
outbound HTTP call.

### ⭐ Three bugs the tests and the screenshots caught

1. **The allow-list blocked every script ever written.** The generated wrapper class lives in
   `MegaForm.Scripts.Generated`, which starts with `MegaForm.` — so the first test run refused the
   one-line starter snippet with *"'MegaForm.Scripts.Generated.AfterSubmitScript_bed6…' is not
   available to scripts"*, naming a type the author never typed. Caught on the suite's first run.
2. **Diagnostics rendered blank.** DNN's WebAPI serialises the *typed* `ScriptDiagnostic` with its
   declared PascalCase names (`Line`/`Code`/`Message`) while the anonymous response objects around it
   keep lowercase. The panel read only camelCase, so every diagnostic rendered as `line 1 · —`:
   right box, right colour, no content, HTTP 200. Only visible by **opening the screenshot**.
3. **One mistake reported three times.** `System.IO.File.ReadAllText(...)` binds symbols at the
   column of `System`, of `System.IO` and of `System.IO.File`; the dedupe key included the column.
   Now keyed by line + message.

### Cost model (§11's second point, implemented)

Compilation happens at **Save**, not per submission — which also puts syntax errors in front of the
person who can fix them. Cached by source hash. A submit on a warm process is a delegate call: the
sample scoring script measured **0–1 ms** on real submissions. First submit after a restart pays one
compile.

**Collectible ALC** on .NET Core, per §11's first point. On net472 there is no collectible option, so
`Assembly.Load(byte[])` is permanent until the app recycles — documented in the code and in the
published article rather than hidden.

**Timeout is honest**: it bounds what the *visitor* waits for, not what the server does. .NET cannot
safely abort a foreign thread. A test asserts the submit stops waiting at ~1s while the script runs 6s.

### Packaging

`MegaForm.Scripting.dll` is an **add-on**, resolved by reflection exactly like the S3 storage
provider, because Roslyn is **12.3 MB** (`Microsoft.CodeAnalysis.CSharp` 7.6 + `Microsoft.CodeAnalysis`
4.7) and the DNN package has a size ceiling. Absent add-on ⇒ null compiler ⇒ the service refuses and
says so. It never degrades into running the code another way.

Only **4 DLLs** had to be added to the DNN site bin — `MegaForm.Scripting`,
`Microsoft.CodeAnalysis`, `Microsoft.CodeAnalysis.CSharp`, `System.Reflection.Metadata`. Everything
else Roslyn needs, the DNN 10.3 bin already carries at an equal-or-newer version, and
`System.Collections.Immutable` already has a binding redirect to 9.0.0.2 in `web.config`.
⚠️ Nothing existing was overwritten — see the Azure-DLL crash in memory for why that matters.

🔴 **Not yet in any install package.** The add-on DLLs were hand-copied to `DNN_MegaFresh`. Shipping
needs a decision: bundle into the MegaForm package (+12 MB) or publish a separate "MegaForm Scripting"
add-on package, like Cloud Storage / S3.

### Verified on the live DNN site

- `compilerAvailable: true` on `dnn_megafresh.ai`.
- Script saved + approved through the host-only endpoint; hash `72738c74…`, `approvedBy: host`.
- **Two real anonymous public submissions** (#288, #289) ran it: *"Scored Daniel Brooks
  (daniel.brooks@acme-demo.com) -> 70 points, tier hot"*, 0–1 ms, `MF_FormScriptRuns` rows 1 and 2.
- Panel in the real builder: loads from the server, **Test run** works, deny-list refuses
  `System.IO` at the author's own line 2.
- 6 targets build clean; **411/411 tests** (378 before + 33 new).

---

## 3. Docs published

| Page | URL | State |
|---|---|---|
| **Run your own C# after a submission** | `?doc=int-csharp-script` | ✅ new, `integrations/0040/0080`, 10 sections, 3 tables, 3 screenshots, `leftovers: none` |
| **Submissions grid — filters at scale (DNN)** | `?doc=dnn-submissions-grid` | ✅ updated, body 1824 → 4138 chars, 2 → 3 headings, 1 → 2 images |

Images uploaded to the portal root (`/Portals/0/`) — `40-script-panel.png`, `41-script-testrun.png`,
`42-script-denied.png`, `11-advanced-filter.gif`. All verified loading at real dimensions on the live
page.

Both pages checked with a leftovers sweep for repo-only wording (`node tools/`, `localhost:`,
`MEGAFORM_ALLOW_PRIVATE_WEBHOOKS`, `webhook.site`, …) — clean.

### New reusable tools

- `tools/browser-qa/build-docs-plan-single.mjs` — one article → publish plan, from its DocFX source,
  with an explicit image map. Prints what it **dropped** rather than shipping a page with holes.
- `tools/browser-qa/docs-record-find.mjs` — find a docs record by `doc_key` and dump its **full**
  DataJson. `Submissions/List?search=` matches summary text, **not** `doc_key` — that is how a
  previous session read the wrong row. `UpdateData` overwrites the whole DataJson, so an update must
  start from the complete current record; this tool is what makes that safe.

---

## 4. Deployed to `dnn_megafresh.ai`

`MegaForm.Core.dll`, `MegaForm.DNN.dll`, `MegaForm.Scripting.dll` + 3 Roslyn DLLs,
`bundles/megaform-builder.js`, and the `web.config` appSetting. Backups next to each replaced file.

⚠️ The builder bundle was deployed **without bumping `FormView.ascx.cs`'s `?v=` stamp**, so a
returning browser may serve the cached bundle and show no Server Script panel. Bump `V` before the
next package.

---

## 5. Files still uncommitted from other sessions

`WebhookService.cs`, `WebhookNodeExecutor.cs`, `Startup.cs` (the Oqtane webhook-executor
registration) were already modified in the working tree when this session started and still are.
Blogs 1.17.13 remains unbuilt for the same reason.

---

## 6. Owner decisions still open

1. **Ship the scripting add-on how?** Bundled (+12 MB) or separate add-on package.
2. **Web / Umbraco authoring.** Both got `PreserveOnSave` (so a script cannot arrive with an import),
   but neither has an authoring endpoint, so a script can never be approved there. Intentional for
   now — say if they should have one.
3. Everything still open from handoff B §5 (Database node on Oqtane, spam-still-INSERTs, the DNN
   package not yet rebuilt).

---

## 7. 🔴 Task 4 — in progress

**"Use AI to build a form from an existing SQL table"**: the flow exists in the product
(`ai-form-creator.ts` prompt rules cover *"create a form FROM / FOR the attached table(s)"*, mapping
SQL types to field types and wiring `settings.databaseInsert`), and `CRM_Leads` already exists on
`DNN_MegaFresh`.

Blocker found: **Ollama is running on this machine with no model installed** (`/api/tags` returns an
empty list), so the local AI provider cannot answer. Pulling `qwen2.5:3b` (1.9 GB).

Next steps once a model is present:
1. Point the site's AI settings at the local provider — ⚠️ per memory, changing the provider does
   **not** change `baseUrl`; check both.
2. Dashboard → AI form creator → attach `dbo.CRM_Leads` → *"create a data entry form for the selected
   table"* → preview → create.
3. Submit the generated form, confirm the row in `CRM_Leads`, then open **Submissions → source: sql
   table** and confirm the same row is listed.
4. Screenshots at each step; article in English; publish under `dnn-guides` (it is a DNN product
   walkthrough, not an integration).

⚠️ `qwen2.5:3b` is small. If it cannot produce a valid multi-field schema for the table, the article
needs a cloud provider key from the owner — do not ship a walkthrough whose screenshots came from a
run that had to be nursed.

⚠️ `/DesktopModules/MegaForm/API/AiAssistant/DefaultConfig` fails from `dnn-api-call.mjs` with
*"Failed to fetch"* thrown inside `megaform-renderer.js`'s fetch wrapper on the home page. The
session is fine (FormScript/* works from the same tool). Drive the AI settings from the dashboard UI
instead, which is also where the screenshots have to come from.

---

## 8. ⭐⭐⭐ Owner's direction for C# script v2 — the capability rail

Mid-session the owner pushed back on v01: *"tại sao lại hạn chế… nếu tính toán đơn giản như thế thì
C# để làm gì"*. Correct, and the fix landed the same session — but the owner then set the target
architecture explicitly, and **that is the spec for the next session**.

**Not** raw .NET (`new SqlConnection`, `new HttpClient`, `File`, service locator). **Capability
injection on a rail**, in three tiers:

| Tier | Who | What |
|---|---|---|
| **Safe Script** | any site | read submitted data, log, set variable, fail — what v01 shipped |
| **Trusted Automation** | host-only, config switch, approved hash | `ctx.Db` named action · `ctx.Http` named endpoint · `ctx.Notify` (email/SMS/Zalo/Telegram) · `ctx.Identity` · `ctx.Workflow` · `ctx.Response` · document generation · queue |
| **Infrastructure Admin** | host enables AND approves separately | file move, command preset, scheduled job |

### Shipped this session (tier 2, partially)

- `ctx.Db.Execute / Query / Scalar(connectionName, parameterisedSql, params)` — matches the owner's
  first spec (*"named connection, parameterized command, audit"*). **Verified on the live site**:
  read three real rows out of the customer's `CRM_Leads` through `DashboardDatabase`, 44 ms.
- `ctx.Http.Get / PostJson / Send(url, …)` — SsrfGuard + timeout + response cap + per-call log.
  **Verified**: a loopback URL came back `Blocked URL: …` and said so in the run record.
- Raw `System.Net` / `System.Data` stay closed, so the guarded door is the only door. Asserted by
  tests, not by hope.

### Still to build (the owner's refinements)

1. **Named endpoints and named actions, not raw URL/SQL.**
   `ctx.Http.PostJsonAsync("erp-lead-created", payload)` and
   `ctx.Db.ExecuteNamedActionAsync("insert_customer", new {…})`. The URL and the SQL then live in
   admin-managed config; the script supplies parameters only. This is stricter than what shipped
   today and is the intended end state.
2. **`ctx.Identity.CreateUserAsync / AddRoleAsync`** — not `DotNetNuke.Entities.Users.UserController`.
   The workflow AddUser / AddRole / AddUserToRole executors already exist; this is a facade over them.
3. **`ctx.Notify.Send(...)`** through providers configured on the site, so a script never holds a secret.
4. **`ctx.Workflow.Start / Signal`**.
5. **`ctx.Response.SuccessMessage / RedirectUrl / CustomData`** — let a script steer what the visitor sees.
6. **Document capability** — PDF/Word/Excel from a template into secure storage, returning a download
   token. Not `new FileStream(anyPath)`.
7. **`ctx.Jobs.RunCommandPresetAsync("generate-invoice", …)`** — never `Process.Start(userInput)`.
8. **Async**: `Task RunAsync(SubmissionAutomationContext ctx, CancellationToken ct)`.
9. **A PreInsert stage.** Normalising or encrypting a value has to happen *before* the row is
   written; after-submit is structurally the wrong place and no amount of capability fixes that.

### Competitor mapping the owner supplied (DNN market)

Their point about these products is worth keeping: they are **action stacks**, not raw-C# engines.
Action Form / Dynamic Forms expose SQL events, HTTP form posts, role actions and workflow actions —
"Execute C# Code" is one action among many, not the architecture.

| Real-world scenario | How the DNN incumbent does it | MegaForm's answer |
|---|---|---|
| Expense-claim approval routing by amount | Action Form: calculate → output token → Send Email / Approval action | Workflow **Condition + Approval + Email** nodes; C# only when routing logic is genuinely complex |
| Sync signup to HubSpot / Salesforce | Dynamic Forms **HTTP Form Posts**; Action Form HTTP/webhook action | **Webhook node**, or `ctx.Http` against a named endpoint — never a script-owned HttpClient |
| Create a DNN user + grant a role | Action Form **User Management** actions | `ctx.Identity.*` (to build) — not UserController |
| PDF certificate + download link | script + iTextSharp DLL in `/bin` | Document capability → secure storage → download token (to build) |
| Custom DB write / multi-table transaction | Dynamic Forms **Dynamic SQL Events** | Workflow Database node · Lifecycle PreInsert/PostInsert · `ctx.Db` |
| OS command / PowerShell | ad-hoc, dangerous | Host-only **command preset**, tier 3 (to build) |

The line the owner drew, worth quoting into any future design doc: *powerful automation, organised
so that a template / import / gallery download can never become RCE.*

---

## 8b. ⭐⭐⭐ Automation v2 — BUILT this session, after the owner's spec

Owner supplied a full spec mid-session (three tiers, capability rail, named actions/endpoints, the
DNN competitor mapping). MVP is implemented, tested and running.

**Design doc: `Docs/DESIGN_MegaForm_Automation_v2.md`** — tiers, stages, catalog, all eight
interfaces, security rules, audit tables, roadmap, and where each piece of code lives.

### Shipped

| Piece | State |
|---|---|
| 8 capability interfaces (`Db`/`Http`/`Notify`/`Identity`/`Documents`/`Files`/`Queue`/`Jobs`) | declared |
| `ctx.Actions.ExecuteNamedActionAsync` | ✅ running |
| `ctx.Api.PostJsonAsync` / `SendAsync` (named endpoint) | ✅ running |
| `ctx.Response.SuccessMessage` / `RedirectUrl` / `CustomData` | ✅ running |
| `ctx.SetValue` (pre-commit only, **throws** post-commit) | ✅ running |
| Stages PreInsert (real abort) + PostCommit | ✅ running |
| Automation catalog + host-only endpoint, secrets masked | ✅ running |
| 4 audit tables + per-capability-call trail | ✅ running |
| unwired capabilities | throwing stubs, named, not nulls |

### Verified on the live DNN site (one TestRun, form 8)

```
db 'crm-count-leads'  → 4      db 'crm-insert-lead' → rows=1      db 'crm-count-leads' → 5
db 'crm-recent-leads' → 3 rows (lead 18: Priya Raman)
endpoint 'crm-lead-created' → 200 in 743ms   (bearer attached server-side from the catalog)
endpoint 'internal-only'    → blocked: URL targets a blocked (private/loopback/metadata) address
```

`MF_AutomationRuns` row: PostCommit, success, 809 ms, **6 capability calls**. Catalog read back
through the API: `authValue: "***"`. **449/449 tests**, 6 targets build clean.

### ⭐⭐ Three bugs the tests found, all of the same family

1. **The allow-list excluded `MegaForm.Core.Automation`** — the entire v2 rail was built, wired,
   audited and *unreachable*: every script failed with *"'AutomationDbResult' is not available to
   scripts"*. This is the SECOND time this allow-list has blocked the thing it exists to permit
   (the first was the generated script namespace).
2. **`System.Threading` denied ⇒ the async rail was uncallable.** The capabilities return `Task<T>`,
   so a script could not name what it got back. Fixed with a narrow exception for
   `System.Threading.Tasks` plus member-level denial of `Task.Run` / `Task.Factory` /
   `Task.ContinueWith` / `Parallel`, which are the parts that start work outliving the request.
3. **`AggregateException: One or more errors occurred.`** was what a host saw when their SQL failed;
   the real message ("Cannot insert explicit value for identity column…") was only in the log lines.
   `.Result` inside a script wraps once, the service's catch wrapped again. Now flattened.

### 🔴 Not built (roadmap in §11 of the design doc)

`ctx.Notify`, `ctx.Identity`, `ctx.Documents`, `ctx.Files`, `ctx.Queue`, `ctx.Jobs`; the PreValidate
and AsyncWorker call sites; `async RunAsync(ctx, ct)` script shape; the builder UI for the catalog
(today it is a host-only JSON endpoint); the rename to `SubmissionAutomationContext`.

## 8c. Docs — 12 more pages published

New channel branch **`automation`, sort `0045`** (between integrations 0040 and SDK 0050), verified
in the live nav in the right order. One root page + 11 recipes, one per use case the owner listed.

Each page is labelled **Available now** or **Planned**, and a "Planned" page always documents what
works *today* instead. That split is the point: five recipes (custom DB, REST/CRM, fraud check, field
encryption, real-time pricing) are running code; six describe an interface that exists with a
capability that is not wired, and say so in the first line.

Tool: `tools/browser-qa/build-automation-docs-plan.mjs`. ⚠️ It reported six cross-links as "dropped"
because `linkMap` only passed `http:`/`mailto:`/`#` through — a leading `/` is already a channel URL.
Dropped links render as plain text, which looks exactly like a page that does not exist.

## 9. Known rough edge

`ctx.Db.ConnectionNames()` returns an empty list on DNN — `DnnConnectionRegistry` does not implement
`IConnectionNameProvider`, so the "available connections" hint in the not-found error is blank.
Cosmetic today; fix when the named-action work lands, since that surface needs the list anyway.

## 10. Temporary QA scripts to delete

`tools/browser-qa/_tmp-submit-demo2.mjs`, `_tmp-probe-demo2.mjs`, `_tmp-probe-ids.mjs`,
`_tmp-workflow-repoint.mjs`, `_tmp-script-panel-shot.mjs`, `_tmp-script-error-shot.mjs`,
`_tmp-verify-doc.mjs`, `_tmp-build-grid-update.mjs`.
