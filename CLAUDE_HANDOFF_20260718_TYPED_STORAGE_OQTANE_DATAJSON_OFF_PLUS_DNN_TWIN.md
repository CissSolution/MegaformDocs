# HANDOFF — Typed Submission Storage: Oqtane DataJson-OFF (hydration bridge) + DNN twin

Date: 2026-07-18
Branch: `feature/typed-submission-storage-core` (⚠️ **NOT committed**)
Supersedes: `CLAUDE_HANDOFF_20260717_TYPED_STORAGE_PHASE1_OQTANE.md` (that one described the earlier
parallel-write state; the Oqtane submit path now COLLAPSES DataJson — read below).
Incorporates the Codex audit `Docs/AUDIT_TYPED_SUBMISSION_STORAGE_PHASE1_SOURCE_2026-07-17.md` (accurate — its live-critical items are fixed here; the rest is tracked as backlog §5).

## R2 addendum (2026-07-18, after `AUDIT_TYPED_SUBMISSION_STORAGE_ROUND2_2026-07-18.md`)
Fixed the round-2 P0/P1 for Oqtane (all LIVE on :5126, matched Core 8:45 + Server 8:47 DLLs):
- **Reports/completion/reindex** (`MegaFormController.Reports.cs`) now reconstruct from typed rows when
  DataJson is collapsed (`ResolveTypedStore()` + `ResolveSubmissionData()`); Export/GetDetail were already
  covered because they go through `_subRepo` (hydrated).
- **`EfSubmissionRepository.UpdateData`** re-derives typed rows (inject `IFormRepository` + normalizer) when a
  real DataJson is written (workflow/admin edit), so the typed rows + search DisplayValue don't go stale.
  Skips the submit-pipeline collapse call `UpdateData(id,"{}")`.
- **Delete cleanup** logs failures (`Console.WriteLine`) instead of a silent catch.
- Re-verified collapse live: submission 53 → `DataJson="{}"` + typed rows.

⭐⭐ **TRAP found & fixed — DLL binary mismatch.** The collapse gate (`SupportsDataJsonCollapse`) lives on the
Core interface. Deploying only Server.dll while a **stale Core.dll** (predating the interface member) sits on
the site makes the new Server call an interface member the old Core lacks → `MissingMethodException`, which
`SubmissionProcessor`'s fail-soft try/catch swallows → **collapse silently stops** (submission 52 kept full
DataJson). ALWAYS redeploy Core.dll + Server.dll together when a Core interface changed; verify their
timestamps match before QA.

Remaining backlog unchanged (see §5) — status stamp: *"Round 2: Oqtane primary pilot + DNN parallel-write twin,
ready for Phase 3 reader/update/report migration."* Not "done no-DataJson".

## 0. Accurate current state (per platform)
- **Oqtane = typed-PRIMARY with DataJson hydration bridge.** New submissions collapse
  `MF_Submissions.DataJson` to `"{}"` after a successful typed write; every legacy reader that goes
  through `EfSubmissionRepository.Get/List` gets DataJson **reconstructed from typed rows on read**
  (`HydrateDataJson`). Typed tables are the source of truth.
- **DNN = typed PARALLEL-WRITE.** Typed rows are written alongside the **full** DataJson; DataJson stays
  the runtime source of truth (DNN has no read-side reconstruction yet). Gated by
  `ISubmissionDataStore.SupportsDataJsonCollapse` = false on DNN, true on Oqtane.
- **Umbraco / Web = unchanged** (no typed store yet).

## 1. What changed this session
### Core (all TFMs build clean; 91 tests pass)
- `ISubmissionDataStore` — new `bool SupportsDataJsonCollapse { get; }` (gates the collapse per host).
- `SubmissionProcessor` — after `ReplaceFields` succeeds, collapses DataJson to `"{}"` **only if**
  `_typedStore.SupportsDataJsonCollapse` (ordering guarantees no data-loss window: typed write first,
  collapse second; if typed write throws, full DataJson stays as the fail-soft safety net).
- `SubmissionFieldNormalizer` — **lossless fix**: Number/Date parse-fail now falls back to a String row
  (never dropped). Plus the earlier checkbox-group→String fix.
- `SubmissionDataReconstructor` — Number/Date reconstruct falls back to the String rows.

### Oqtane
- `EfSubmissionRepository` — injects `ISubmissionDataStore`; `Get`/`List` call `HydrateDataJson`
  (reconstruct DataJson when collapsed). `Delete`/`BulkDelete` call `_typedStore.DeleteFields`
  (**AUDIT-FIX P1**: no DB FK on Oqtane typed tables → explicit cleanup, else orphan rows). Search
  predicate is now **hybrid** `DataJson.Contains(term) OR EXISTS(typed field DisplayValue LIKE term)`
  (**AUDIT-FIX P0**: collapsed DataJson can't match a field search).
- `EfSubmissionDataStore.SupportsDataJsonCollapse => true`.

### DNN (new twin — net472, ADO.NET)
- `MegaForm.DNN/Data/DnnSubmissionDataStore.cs` — full `ISubmissionDataStore` over raw
  SqlConnection/SqlCommand (`dbo.MF_*`), delete-then-insert in a transaction, `OUTPUT INSERTED.SubmissionFieldId`
  for identity. `SupportsDataJsonCollapse => false`.
- `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider` — creates the 7 typed tables with **real FK cascade**
  (`{databaseOwner}{objectQualifier}`, `IF OBJECT_ID … IS NULL`, `GO`). Registered in `MegaForm.dnn`
  manifest (package version 01.07.106 → **01.07.108**); DROPs added to `Uninstall.SqlDataProvider`.
- `MegaForm.DNN/Services/DnnServiceLocator.cs` — builds `TypedStore` with the same connection factory as
  the reporting indexer and passes `typedStore:` into `SubmissionProcessor`.

## 2. Live QA evidence
### Oqtane :5126 (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805`, SQL Server, 1.7.108)
- 5 library-style forms created (FormId 2–6: Contact/Event/Job/Feedback/Newsletter) on an orphan module 37.
- **50 random submissions** (10/form): all have `DataJson="{}"`; typed rows complete
  (String 328, LongText 31, Number 30, Date 21, Boolean 20, Json 1).
- **Read-path reconstruction proven** (SQL): sample submissions reconstruct 100% from typed rows only —
  multi-value (`interests`), number (`rating`), date, boolean, longtext all recovered.
- **Search fix proven live**: hybrid predicate found the 4 VIP event submissions via typed DisplayValue
  even though DataJson is `{}`.
- Form renders correctly (screenshot).

### DNN `dnn10322_megaclean.ai` (IIS, SQL Server `DNN10322_MegaClean`)
- Applied `01.06.39` → 7 typed tables + **8 FKs** (DB-level cascade) created.
- Deployed `MegaForm.DNN.dll` + `MegaForm.Core.dll` (net472) + app-pool recycle.
- Submitted form 37 (Tabbed Account Setup) → `submissionId=315`, success. Verified: **DataJson KEPT full**
  (413 chars, not collapsed); **13 typed field rows** via the ADO store; `interests` → 3 String rows
  (checkbox-group fix cross-platform); DataType routing + DisplayValue label mapping correct.

## 3. Deploy notes
- Oqtane: hot-swap net10 DLLs at site root (`MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`,
  `MegaForm.Oqtane.Client.Oqtane.dll`) + `Oqtane.Server.exe --urls http://localhost:5126`. Backup at
  `<site>\_bak_preTyped_1.7.108`. Tables created via `GenerateCreateScript` on version-bump upgrade.
- DNN: copy `MegaForm.DNN.dll`+`MegaForm.Core.dll` (net472) to `Website\bin`, apply `01.06.39` SQL
  (`{databaseOwner}`→`dbo.`, `{objectQualifier}`→``), recycle app pool. Backup at `bin\_bak_preTyped_20260718`.

## 4. ⚠️ NOT committed / traps
- All changes uncommitted on `feature/typed-submission-storage-core`.
- **Oqtane trap**: DataJson is `{}` for new submissions — any reader that hits `MF_Submissions.DataJson`
  by RAW SQL (not via `EfSubmissionRepository`) sees empty. Covered by hydration: detail/list/workflow/
  email/webhook (all use the repo). NOT covered yet: reports (`MegaFormController.Reports.cs` reads
  DataJson directly), CSV export, `Submissions/UpdateData` (workflow mutations write DataJson full → typed
  rows go stale until next full resubmit). See backlog.
- Oqtane typed tables have **no DB FK** (EF model has no fluent relationships) → cascade is repo-level only.
- Fresh Oqtane install builds schema from the EF model (`MegaFormDbContext`), NOT migration `Up()`.

## 5. Remaining backlog (from Codex audit — Phase 2–6, NOT done)
1. **Umbraco twin** (typed DbSets + migration + `UmbracoSubmissionDataStore` + DI). Web too.
2. **Switch remaining Core readers off DataJson** (typed store): reports/completion%, CSV export,
   `AdminRecordShellService`, `WorkflowEngine`, `EmailNotificationService`, `WebhookService`,
   `DataRepeaterService`, `FieldOptionsService`, starters/blog/payment.
3. **Typed update API** — `SetField/UpdateFields`; route `UpdateData`/workflow mutations through the typed
   store so DataJson and typed rows never diverge.
4. **SDK contract** — `SubmissionDto.Data` + `Fields` + typed DTOs; obsolete `DataJson`; `Submissions/UpdateFields`.
5. **Backfill wiring** — host command/job for `LegacySubmissionBackfillService` + `ILegacySubmissionSource`
   per host + `MigratedToTypedOnUtc` marker + verify counts.
6. **Schema-version / extra columns** — `MF_FormSchemaVersions`, `MF_FormFields`, `SubmissionKey`/`FormKey`/
   `SchemaVersion`, `MF_SubmissionAudit`, file-field `SubmissionFieldId` linkage.
7. **More normalizer edge tests** — JsonElement, File/Signature/Address/FullName, culture dates, dup keys.
