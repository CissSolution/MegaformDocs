# Handoff 2026-08-14 — MegaForm Automation v2, brief for an audit session

Two agents built this in parallel. I (Claude) built the v2 MVP; **Codex extended it substantially
afterwards**. This document is written for whoever audits the result, so it separates *what is
claimed*, *what was actually verified*, and *what nobody has run yet*.

**Read first:** `Docs/DESIGN_MegaForm_Automation_v2.md` (the design), then
`CLAUDE_HANDOFF_20260813C_AFTERSUBMIT_SCRIPT_AND_WEBHOOK.md` (how v1 → v2 happened, and the webhook
correction).

---

## 0. State right now — measured, 2026-08-14

| | |
|---|---|
| Tests | **455/455 green** (`MegaForm.Sdk.Tests`) |
| Build | 6 targets clean: Core · Scripting · DNN · Oqtane.Server · Web · Umbraco |
| Deployed | `dnn_megafresh.ai` — Core / DNN / Scripting DLLs now **byte-match the repo build** |
| Live probe | a script using **native `await`** on `ctx.Actions` ran: `leads = 5`, 52 ms |
| Docs | 14 pages live on `dnndefender.com/MegaFormDocsT` (`int-csharp-script` + branch `automation`, 12 pages) |

---

## 1. What Codex added on top of the MVP

The MVP I handed over had: capability interfaces, catalog, `ctx.Actions`, `ctx.Api`, `ctx.Response`,
`ctx.SetValue`, PreInsert + PostCommit stages, four audit tables, DNN endpoints. Codex then built:

| Area | What landed | Where |
|---|---|---|
| **PreValidate stage** | real call site, before field validation, can veto | `SubmissionProcessor.cs:248` |
| **AsyncWorker stage** | enqueue at submit + host-neutral worker | `SubmissionProcessor.TryEnqueueAsyncAutomation`, `Automation/AutomationAsyncWorker.cs` |
| **Durable queue (DNN)** | `MF_AutomationOutbox` enqueue/dequeue | `MegaForm.DNN/Data/DnnAutomationExecutionQueue.cs` |
| **DNN scheduler class** | `SchedulerClient` to drain the queue | `MegaForm.DNN/Services/AutomationWorkerScheduleItem.cs` |
| **`ctx.Notify`** | email through the site's `IEmailSender` + catalog templates; SMS/push via a named endpoint | `Automation/AutomationHostCapabilities.cs:13` |
| **`ctx.Identity`** | create user / add role, gated by catalog policy | `Automation/AutomationHostCapabilities.cs:160` |
| **Catalog growth** | `notificationTemplates[]`, `identity{ enabled, allowUserCreation, allowedRoles[] }` | `Automation/AutomationCatalog.cs` |
| **Host adapter bundle** | `AutomationCapabilityServices` — DNN passes `IEmailSender` / identity provisioning / principal resolver, never DNN types | `DnnServiceLocator.cs:280` |
| **Native `await` in scripts** | script bodies compile as async and receive the run's `CancellationToken` | `MegaForm.Scripting/ScriptSourceBuilder.cs` |

**Two design decisions of Codex's worth keeping and worth checking:**

1. **The AsyncWorker reloads and re-approves.** `AutomationAsyncWorker.Execute` re-reads the form's
   current settings and re-checks the approval hash rather than trusting the queued copy. Without
   that, a script revoked after enqueue would still run later — the catalog kill switch would have a
   hole exactly the width of the queue. *Audit this one first; it is the security claim.*
2. **AsyncWorker never falls back to inline.** If no durable queue is registered, the submit logs a
   warning and does **not** run the script. Correct — a "background" stage that silently runs on the
   visitor's request is a lie about latency — but see finding 🔴 A.

---

## 2. 🟠 Finding A — the AsyncWorker queue: registration now exists, draining is still unproven

**Updated 2026-08-14, later the same day. The paragraph below originally said nothing registered the
scheduler. That is no longer true of the repo** — someone (Codex, after this brief was written) added
the registration, uncommitted at the time of writing:

- `MegaForm.dnn` declares `02.00.018.SqlDataProvider`, and the package version is `02.00.018`.
- That script does `INSERT INTO Schedule` for
  `MegaForm.DNN.Services.AutomationWorkerScheduleItem, MegaForm.DNN`, guarded by `IF NOT EXISTS`,
  TimeLapse 1 minute.

So the queue *can* now be drained on a site that installs 02.00.018. What has **not** changed is the
evidence: nobody has installed it and watched a row move. **Do not accept "it enqueued", and do not
accept "the INSERT is in the script", as evidence the stage works.** The evidence is an
`MF_AutomationOutbox` row going `pending → sent`.

**A real bug found while verifying this** (fixed 2026-08-14): `02.00.018` opened with
`ALTER TABLE dbo.MF_AutomationOutbox ADD LockedOnUtc`, but **no script in `SqlScripts\` ever created
that table** — it is built at runtime by `DnnAutomationExecutionQueue.EnsureSchema`, which does not
run until the first enqueue. Running the script against an empty database reproduces it:

```
Msg 4902, Level 16 — Cannot find the object "dbo.MF_AutomationOutbox" because it does not exist
```

and note how it hides, the same way everything else in this file hides: the `INSERT INTO Schedule`
sits in the batch *after* `GO`, so the scheduler row still lands and the install looks fine apart
from one red line in the log. The script now creates the table and its index first, matching
`EnsureSchema` column for column.

Consequence if it had shipped as-is, and why the original finding still matters: a submission with an
AsyncWorker script returns **HTTP 200**, the visitor sees the thank-you, the outbox gets a `pending`
row, and the event log says *"AsyncWorker automation queued for form N submission M"*. Every signal
reads as success. This is the same silent-success shape as the three blockers in handoff B (§2) and
the webhook "never ran" misdiagnosis in handoff C (§1).

**To close:** install 02.00.018 on a site, submit through an AsyncWorker script, and show the outbox
row changing state.

---

## 3. 🔴 Finding B — Oqtane has the catalog and nothing else

`CLAUDE.md` requires the three platforms to stay twins. They are not:

| | DNN | Oqtane | Web / Umbraco |
|---|---|---|---|
| catalog provider | ✅ | ✅ | ✗ |
| `IAutomationAuditStore` (stage runs + capability calls) | ✅ | ✗ | ✗ |
| `AutomationCapabilityServices` (Notify / Identity) | ✅ | ✗ | ✗ |
| durable queue for AsyncWorker | ✅ enqueue (see A) | ✗ | ✗ |
| host-only authoring endpoint | ✅ | ✅ | ✗ (deliberate) |
| `PreserveOnSave` on form save | ✅ | ✅ | ✅ |

So on Oqtane today: `ctx.Notify` / `ctx.Identity` are the throwing stubs, no stage runs or capability
calls are recorded at all, and an AsyncWorker script logs a warning and is dropped.

Nothing here is *unsafe* — the stubs throw a named error and `PreserveOnSave` is everywhere — but the
Oqtane story is "catalog exists, automation does not", and the docs published on
`dnndefender.com` do not say that. **Either wire Oqtane or state the limitation in the docs.**

---

## 4. ⚠️ Finding C — repo/site DLL skew (found, reconciled, worth a habit)

`MegaForm.Scripting.dll` on the site was **45 minutes behind** the repo build while `MegaForm.Core`
and `MegaForm.DNN` were current. Probed before reconciling: native `await` worked anyway, so nothing
was broken — but the skew was real and invisible.

Reconciled: site now byte-matches the repo, re-probed, still green.

**Habit for the audit:** compare repo `bin\Release\net472\*.dll` timestamps against the site's `bin`
before believing any live-QA result. A stale DLL is the cheapest way to test the wrong build and
conclude the wrong thing.

---

## 5. What is verified live vs what is not

| Claim | Evidence |
|---|---|
| `ctx.Actions` named SQL action runs | ✅ live: count 4 → insert 1 → count 5 → 3 rows read (lead 18) |
| `ctx.Api` named endpoint delivers with catalog auth | ✅ live: 200 in 743 ms, bearer attached server-side |
| SsrfGuard refuses a loopback **catalog** entry | ✅ live: `blocked: URL targets a blocked … address` |
| Catalog secrets masked on read-back | ✅ live: `authValue: "***"` |
| Capability calls audited | ✅ live: `MF_AutomationRuns` row, **6 calls** |
| Native `await` in a script body | ✅ live: 52 ms |
| Approval hash blocks imported/tampered scripts | ✅ tests |
| PreInsert abort leaves **zero** rows | ✅ test asserts the submissions table |
| PostCommit failure keeps the submission | ✅ test |
| `ctx.SetValue` refused post-commit | ✅ test |
| **`ctx.Notify` actually sends an email** | ❌ **test only** (fake sender). Never sent a real message. |
| **`ctx.Identity` actually creates a DNN user / grants a role** | ❌ **test only**. Never provisioned a real account. |
| **AsyncWorker end-to-end (enqueue → drain → run)** | ❌ **never run** — see finding A |
| PreValidate on a live site | ❌ test only |

The last four are the audit's real work. The first group is settled.

---

## 6. Audit checklist

**Security (the part that matters most)**

1. `AutomationAsyncWorker.Execute` — confirm it re-reads settings and re-checks the approval hash,
   and that a script disabled *after* enqueue is skipped. There is a test; read the code too.
2. `AutomationIdentityCapability` — `allowedRoles` allow-list and `allowUserCreation`. Try to grant
   `Administrators` from a script and confirm refusal. Check the comparison is case-insensitive and
   that an empty/missing policy fails **closed**.
3. `AutomationNotifyCapability` — confirm script-supplied model values are HTML-encoded into the
   email body (there is a test named for it) and that the subject cannot inject a header (CR/LF are
   stripped — verify).
4. `ScriptSymbolPolicy` — the allow-list has now silently excluded the thing it exists to permit
   **twice** (the generated namespace; then `MegaForm.Core.Automation`). Re-derive it: for each
   namespace a script legitimately needs, write a compile test. Also re-check the member-level
   denials (`Task.Run`, `Task.Factory`, `ContinueWith`, `Parallel`) still hold now that script bodies
   are async.
5. Catalog secret round-trip: save → read (masked) → save the mask back → confirm the stored secret
   survived. This is the classic "masked field destroys the value" bug; there is code for it, prove it.
6. `FormSchemaSensitivePropertyStripper` — confirm `automation` **and** `afterSubmitScript` are gone
   from a public render payload, source and approval hash both.

**Correctness**

7. Finding A: make an outbox row go `pending → sent`, or accept that the stage is not shipped.
8. Concurrency: `AfterSubmitScriptService` is a singleton with a per-run `RunCallRecorder` on the
   stack — confirm two concurrent submissions do not cross audit trails.
9. `ScriptDatabase` / `AutomationDbCapability` both exist (v1 and v2 surfaces). Confirm the v1 one is
   still wanted, or plan its removal; two ways to reach a database is two things to audit.
10. Timeout honesty: the run timeout bounds the visitor's wait, not the script. Confirm the docs say
    so and that AsyncWorker is the documented answer for long work.

**Product**

11. Docs vs reality: the 12 automation pages label each capability *Available now* or *Planned*.
    Codex has since wired Notify and Identity — **the pages still say Planned**. Re-check every
    label against the code and correct them; a doc that under-claims is still wrong.
12. `Docs/DESIGN_MegaForm_Automation_v2.md` §2 status column has been updated by Codex; confirm it
    matches finding B (Oqtane) rather than implying parity.

---

## 7. Open items carried forward

- 🔴 Not wired anywhere: `ctx.Documents`, `ctx.Files`, `ctx.Queue`, `ctx.Jobs` (throwing stubs).
- 🔴 No builder UI for the catalog — it is a host-only JSON endpoint (`FormScript/Catalog`).
- 🔴 Scripting add-on is **not in any install package**; 4 DLLs were hand-copied to the test site.
  Decide: bundle (+12 MB) or separate add-on package like Cloud Storage.
- ⚠️ Builder bundle deployed **without bumping `?v=`** in `FormView.ascx.cs` — a returning browser
  may not see the Server Script panel.
- ⚠️ Form 8 on `dnn_megafresh.ai` still points its webhook nodes at a **temporary inbox** used to
  prove delivery. Repoint before recording anything.
- ⚠️ Working tree carries ~1,177 changed/untracked paths across several sessions. Nothing here has
  been committed.
- 🔴 Task still unfinished from handoff C: *"AI builds a form from an existing SQL table"* article.
  Ollama now has `qwen2.5:3b` and the site's AI provider is set to `local`; the flow, screenshots and
  page remain.

## 7b. AUDIT RESULT — measured 2026-08-14 (later session)

Someone finally ran the checklist. Measured on the current working tree, not quoted from above.

| Claim in this brief | Verdict now |
|---|---|
| 455/455 tests | ✅ **460/460**, 0 failed, 15 s (5 new tests since) |
| Finding B — Oqtane has catalog only | ✅ **unchanged**. `AutomationCapabilityServices`, `IAutomationAuditStore`, `IAutomationExecutionQueue` each have **exactly one** implementation/registration, all in `MegaForm.DNN`. Web/Umbraco have not even the catalog |
| AsyncWorker reloads + re-approves | ✅ **holds** — `AutomationAsyncWorker.cs:40-52` re-reads the form, rebuilds settings through `RenderModelResolver`, and re-checks `block.Enabled`; the queued copy is never trusted. The hash gate is reached via the freshly-loaded block in `RunStage` |
| `ctx.Notify` / `ctx.Identity` wired | ✅ real classes exist (`AutomationHostCapabilities.cs:13`, `:160`) — **DNN only**; the other three hosts still get the throwing stubs at `AutomationCapabilityImpl.cs:459-468` |
| Docs still say Planned (item 11) | ✅ **still wrong, and wrong in a specific way**: `automation-notifications.md:5` says `ctx.Notify` is *planned* and that a script "gets *ctx.Notify is not available on this installation yet*". That is **true on Oqtane/Web/Umbraco and false on DNN**. Same for `automation-user-provisioning.md:5`. Fixing the label to "available now" would then be wrong for three hosts — the page needs a **per-host** statement, not a flipped word |
| `?v=` not bumped | ✅ **CLOSED** — `FormView.ascx.cs:342` is `BUILDER_V = "?v=20260814-B422"` |
| `ctx.Documents/Files/Queue/Jobs` stubs | ✅ unchanged — all still `throw new NotWiredException(...)` |
| Finding A — outbox `pending → sent` | ❌ **still never observed** |
| Notify sends real mail · Identity creates real user · PreValidate live | ❌ **still never run** |

### 🔴 The finding that outranks everything else in this file: the feature does not ship

`MegaForm.Scripting` appears in **neither** `BuildPackage-DNN.ps1` **nor** `MegaForm.dnn`. Measured on
the `02.00.019` package built and installed today:

- entries matching `Scripting|CodeAnalysis` in the zip: **zero**
- on `megaclean008.ai` after a successful install: `MegaForm.Scripting.dll`,
  `Microsoft.CodeAnalysis{,.CSharp}{,.Scripting}.dll` — **all five missing**

So on every site that installs the package, `AfterSubmitScriptService.Run` takes this branch:

```csharp
if (_compiler == null)
    return Skip(result, "Script compiler is not installed on this server (MegaForm.Scripting.dll).");
```

Fail-closed and named — the design is right. But it means **no customer can use the C# script
capability at all**; it has only ever run on sites where the four DLLs were hand-copied. Everything
else in this brief describes a feature that is, from the outside, not installed anywhere. Decide the
packaging (bundle vs Cloud-Storage-style add-on) before doing any more capability work.

### ⚠️ Second: none of this is in git

`MegaForm.Core/Automation/`, `MegaForm.Core/Scripting/`, `MegaForm.Scripting/`,
`AfterSubmitScript{Guard,Service,Store}.cs`, `DnnAutomation{AuditStore,ExecutionQueue}.cs`,
`FormScriptController.cs` — every one is `??` untracked. `git log` for those paths is empty. Repo-wide:
**851 untracked + 258 modified**. This repo's `.gitignore` has already swallowed `*.sql` and
`Assets/js/**` (both cost real files), so untracked here is one `git clean -fdx` away from losing
months of work. Commit before the next feature.

---

## 8. Throwaway QA scripts to delete

`tools/browser-qa/_tmp-submit-demo2.mjs`, `_tmp-workflow-repoint.mjs`, `_tmp-script-panel-shot.mjs`,
`_tmp-script-error-shot.mjs`, `_tmp-verify-doc.mjs`, `_tmp-build-grid-update.mjs`.

Keep (reusable): `dnn-api-request.mjs`, `docs-record-find.mjs`, `build-docs-plan-single.mjs`,
`build-automation-docs-plan.mjs`.

---

## 9. SqlScripts consolidated — 49 files → 3 (2026-08-14)

`MegaForm.DNN\SqlScripts\` had accumulated 49 `.SqlDataProvider` files and the manifest declared 40
of them. They are now two install scripts plus the uninstall script:

| | before | after |
|---|---|---|
| files on disk | 49 | 3 |
| declared in `MegaForm.dnn` | 40 nodes | 3 nodes |
| shipped in the package | 48 entries, 398,774 bytes (90.8 KB zipped) | 3 entries, 307,664 bytes (50.9 KB zipped) |

- `01.06.42.SqlDataProvider` — the 35 v1 scripts, `01.04.00` … `01.06.42`
- `02.00.018.SqlDataProvider` — the 4 v2 scripts, `02.00.09` … `02.00.018`
- `Uninstall.SqlDataProvider` — untouched

**The merge is a pure concatenation**, in the exact order the manifest declared, with `-- BEGIN/END
<original name>` markers around each section; every one of the 39 sections was verified
byte-identical to its source file before the originals were deleted. Nothing was rewritten.

**Why this needed proving rather than asserting.** DNN runs every declared script whose version is
newer than the installed one, so a site upgrading from, say, 01.06.30 now re-runs the whole merged
v1 file from 01.04.00 down. That is only safe if every section is idempotent. It was verified by
running both merged files **twice against an empty database**: 0 errors on both passes, 40 `MF_*`
tables, 27 stored procedures, and exactly one `Schedule` row after two runs (the `IF NOT EXISTS`
guards hold). The one error the first run did surface was the real `Msg 4902` bug in §2.

Two greps that looked like non-idempotent DDL were false alarms, worth knowing before someone
re-runs the same check: `01.06.41` contains the words "CREATE TABLE" only inside KB prose, and
`01.06.32`'s unguarded `INSERT` targets the table variable `@recipes`.

**Also deleted — 9 scripts the manifest never declared, so they had never run anywhere:**
`01.06.11/12/13` (65 bytes each, `print 'package refresh'`) and `01.06.28l/m/n/o/p/q` (~104 KB of AI
knowledge-base seed: style library, rule builder, premium layouts). The build script copies *every*
`.SqlDataProvider` into the package, so all 104 KB shipped to every customer and was executed by
nothing. Before deleting them, all 50 of their KB slugs were confirmed present in the canonical
`MegaForm.Core\Seed\ai-knowledge-seed.json`, which is what actually reaches sites (via
`DnnKbSeeder`). This is very likely the origin of the "138 orphan entries" noted in the 08-12
handoff — worth checking against that count.

**Rule going forward:** add new work as a NEW versioned script in the `02.00.xxx` series. Do not
append to the merged files.

**The 14 plain `.sql` files are gone too** (same day, on the owner's call — "delete what is no longer
used so it stops being confusing later"). `SqlScripts\` now contains exactly three files, all of
which DNN executes. Each deletion was checked first, because `.gitignore:124` ignores `*.sql`, so
none of them was ever in git and deleting them is irreversible (backup zip, 172 KB, was taken):

- `01_CreateTables.sql` / `02_StoredProcedures.sql` — **21/21 tables and 26/26 procedures** already
  present in the merged `01.06.42`. Pure duplicates of the real schema.
- `Uninstall.sql` — an **older copy** of `Uninstall.SqlDataProvider`, missing the 8 DROPs for typed
  submission storage. This is exactly the confusion worth deleting: the stale file looked like the
  real one.
- `01.06.28-seed`, `28b-layout-seed`, `28e-form-templates` (2.0 MB), `28i-layout-grammar-seed` —
  regenerable; their generators live in `MegaForm.UI\scripts\`.
- `28c/28f/28g/28h/28j/28k` — KB seeds whose slugs are all present in
  `MegaForm.Core\Seed\ai-knowledge-seed.json`. `28d-widget-retire` is a historical DELETE script
  (it retires `widget-subform`, which is why that slug is correctly absent from the seed).

The four generators now carry a LEGACY header saying their output is packaged and executed by
nothing — otherwise the next person to run one quietly rebuilds the mess. `BUILD-GUIDE.md`'s package
diagram (still showing `01_CreateTables.sql`) and the build script's summary line were corrected.

Docs that reference the deleted paths are historical audits and were left as-is, except one live
cross-platform pointer pair: the Oqtane migrations `01060030_AddReporting.cs` and
`01060032_SeedAuthoringRecipes.cs` named their DNN twin by old filename and now point at the section
markers inside the merged file.
