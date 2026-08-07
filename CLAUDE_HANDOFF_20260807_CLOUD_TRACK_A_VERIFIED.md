# Handoff — Cloud-Ready Track A verified, three deploy bugs closed (2026-08-07)

Branch `feature/typed-submission-storage-core`, commits `ebfd8cf` (Kimi's Phase 0/1/2) and
`9bac30f` (the fixes below). Plan: `CLAUDE_PLAN_20260804_CLOUD_TRACK_A_BPMN_IMPORTER.md`.

Builds clean: Core (4 TFMs), Web, AspNetCore.Component, Oqtane.Server, DNN (net472).
Tests **304/304**.

## What shipped

| Phase | What |
|---|---|
| 0 | `SchemaMigrationRunner` — versioned idempotent SQL per provider, `MF_SchemaHistory` + SHA256, DB-native lock (`sp_getapplock` / `pg_advisory_lock` / `GET_LOCK`; SQLite no-op). Version 0001 is a baseline that never executes. |
| 1 | `MF_WorkflowQueue` + worker. Post-submit workflow can run out of the request. Claim = conditional UPDATE lease → several instances are safe on one database. Retry 30s × attempt, give up at 5. |
| 2 | Delay node parks the execution in `Waiting` with `WaitUntilUtc` instead of holding a thread; a scanner per host resumes due ones and sends the one overdue reminder per task (`EscalatedAtUtc` guard). |

The sync path is byte-for-byte unchanged: `SubmissionProcessor` enqueues only when **both**
optional deps are registered **and** the mode provider returns `Queued`. DNN and Umbraco never
register them, so they stay inline.

## Three bugs a green build cannot show — fixed in `9bac30f`

1. **Oqtane never adds a column to a table it already has.** `MegaFormManager.InstallSchemaFromModel`
   issues `CREATE TABLE` from the EF model and swallows "already exists"; a migration `Up()` body
   never runs there. New *table* arrives on upgrade, new *columns* never do. Every upgraded site
   would have failed with `Invalid column name 'WaitUntilUtc'`.
   → `MegaForm.Oqtane.Server/Data/WorkflowTimerSchemaBootstrapper.cs`, called from `SaveExecution`,
   `UpdateExecution`, `SaveTask` and the scanner. **Keyed per tenant connection string** — Oqtane is
   one database per tenant, so a per-process static heals the first tenant and leaves the rest broken.
   (⚠️ `EfWorkflowLibraryRepository`'s older self-heal has exactly that per-process bug.)
   Each `ALTER` has its own try/catch; one shared catch stops at the first already-present column.
2. **A DNN `.SqlDataProvider` number is a gate, not a label.** The scheduler registration was
   `01.06.43` while the package is `02.00.011`, and DNN runs only scripts newer than the installed
   version — skipped forever, no error. → renamed `02.00.012`, manifest bumped to `02.00.012`, the
   `<script>` entry moved after `02.00.09`. **Number new DNN scripts in the 02.00.xxx series.**
3. **`Content` .sql files never reach a NuGet consumer.** NuGet packs them into `contentFiles`
   *without* `copyToOutput` (it does not derive that from `CopyToOutputDirectory`), so
   `MegaForm.Web.Host` received no scripts and the runner logged "no scripts folder, skipped" —
   no `MF_WorkflowQueue` on any package-consuming host. → `<EmbeddedResource>`; the runner now reads
   embedded **and** disk, disk winning per version so a hotfix can still be dropped in.
   Check with `strings MegaForm.Web/bin/Debug/net9.0/MegaForm.Web.dll | grep Schema.Scripts` → 8 names.

## Next

1. 🔴 **E2E, never run.** Submit a form with a workflow → row in `MF_WorkflowQueue` → worker picks it
   up → execution completes. Then a Delay node → row parked with `WaitUntilUtc` → scanner resumes it.
   Do it on the clean Oqtane at `http://localhost:5130` and on Web.Host. The SQL scripts have only
   ever run against SQLite.
2. 🔴 **Repack before testing the NuGet path** — `MegaForm.Web.Host` still pins
   `MegaForm.AspNetCore.Component 0.2.2-preview` while the latest build is 0.2.4, and
   `dist/pack/MegaForm.Web.1.7.3.nupkg` is from 2026-07-10, i.e. before any of this existed.
3. 🔴 **A large surface has never been `git add`ed** — all of `MegaForm.Umbraco` and
   `MegaForm.Umbraco.Host`, plus assorted `MegaForm.Core/UI/Web` files. Left out of these commits on
   purpose: the same pile carries `appsettings.Development.json`, `MegaForm_Dev.sqlite` and
   `umbraco/Data/Umbraco.sqlite.db.before-forms`. Read them for secrets, add a `.gitignore` rule for
   the databases, then commit the source.
4. Track B (BPMN importer) not started.

Deploy gates still apply: Oqtane swaps the DLL only when `ModuleInfo.Version` goes up; the DNN
package version is derived from `MegaForm.dnn`, and `BuildPackage-DNN.ps1` refuses to build if the
manifest declares a script that is missing from `SqlScripts\`.
