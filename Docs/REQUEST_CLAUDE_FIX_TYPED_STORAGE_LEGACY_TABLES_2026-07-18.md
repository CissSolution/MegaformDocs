# REQUEST FOR CLAUDE: Fix Typed Submission Storage / Legacy Tables Audit Gaps

Date: 2026-07-18
Author: Codex audit pass
Scope: MegaForm.Core, MegaForm.DNN, MegaForm.Oqtane.Server, MegaForm.Web, MegaForm.Umbraco, MegaForm.Sdk
Source audit reviewed: `Docs/AUDIT_TYPED_SUBMISSION_STORAGE_LEGACY_TABLES_2026-07-17.md`

## Executive Verdict

The 2026-07-17 audit is directionally correct, but one critical DNN statement is now stale in current source.

Correct overall status:

`Round 2/3 transition: Oqtane typed-primary pilot + DNN parallel-write twin, Web/Umbraco not yet typed, Core readers still partially DataJson-based. Do not call this "done no-DataJson".`

Important correction:

- The audit says DNN has typed runtime code but no CREATE script. Current source now has `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider`, and `MegaForm.DNN/MegaForm.dnn` references it.
- However, the existing checked package zip in `MegaForm.DNN/Install/MegaForm_01.07.106_Install.zip` does NOT contain `01.06.39.SqlDataProvider`, because it was built before the script existed.
- `MegaForm.DNN/Install/SqlScripts/` is stale and still does not contain `01.06.39.SqlDataProvider`.
- `MegaForm.DNN/BuildPackage-DNN.ps1` has `$VERSION = '01.07.106'`, while `MegaForm.DNN/MegaForm.dnn` says package version `01.07.108`. This version mismatch is a packaging trap.

Claude must treat the DNN schema gap as "source mostly fixed, package/install artifact and object-qualifier risk not yet proven fixed".

## Claim-by-Claim Review

### 1. Oqtane typed storage is advanced

Status: PASS with caveat.

Evidence:

- `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs` has DbSets for:
  - `SubmissionFields`
  - `SubmissionValueString`
  - `SubmissionValueLongText`
  - `SubmissionValueNumber`
  - `SubmissionValueDate`
  - `SubmissionValueBoolean`
  - `SubmissionValueJson`
- `MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs` implements `ISubmissionDataStore`.
- `EfSubmissionDataStore.SupportsDataJsonCollapse => true`.
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs` hydrates collapsed `DataJson` from typed rows on read.
- `SubmissionProcessor` writes typed rows and collapses `DataJson` to `"{}"` only when the host store supports collapse.

Caveat:

- Oqtane EF model still does not define fluent FK relationships for typed tables. Delete cleanup is code-level after master delete, not DB-level cascade.
- `01060039_AddTypedSubmissionStorage` includes FK/cascade, but its own comment says Oqtane does not actually run `Up()` because Oqtane schema is generated from the EF model.

### 2. DNN typed storage exists but still needs deployment hardening

Status: PARTIAL / STALE AUDIT CLAIM.

What changed:

- `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider` exists and creates:
  - `MF_SubmissionFields`
  - `MF_SubmissionValueString`
  - `MF_SubmissionValueLongText`
  - `MF_SubmissionValueNumber`
  - `MF_SubmissionValueDate`
  - `MF_SubmissionValueBoolean`
  - `MF_SubmissionValueJson`
- `MegaForm.DNN/MegaForm.dnn` references `01.06.39.SqlDataProvider`.
- `MegaForm.DNN/BuildPackage-DNN.ps1` copies scripts from `MegaForm.DNN/SqlScripts`.
- `DnnServiceLocator` constructs `DnnSubmissionDataStore` and passes it into `SubmissionProcessor`.

Still not acceptable:

- Existing zip `MegaForm.DNN/Install/MegaForm_01.07.106_Install.zip` does not include the new script.
- `MegaForm.DNN/Install/SqlScripts` is stale and missing the new script.
- `BuildPackage-DNN.ps1` version is `01.07.106` while manifest version is `01.07.108`.
- `01.06.39.SqlDataProvider` uses `{databaseOwner}{objectQualifier}` for table names, but `DnnSubmissionDataStore` hard-codes `dbo.MF_SubmissionFields` and `dbo.MF_SubmissionValue*`. If a DNN install uses a non-empty object qualifier, runtime can write to table names that were never created.
- DNN remains parallel-write only: `SupportsDataJsonCollapse => false`, and readers/controllers still use `DataJson`.
- DNN `UpdateData` paths do not re-normalize typed rows. Oqtane has sync logic in `EfSubmissionRepository.UpdateData`; DNN does not.

### 3. Umbraco and Web lack typed storage

Status: PASS.

Evidence:

- `MegaForm.Web/Data/DataLayer.cs` maps `MF_SubmissionValues`, but no `MF_SubmissionFields` or six `MF_SubmissionValue*` tables.
- `MegaForm.Umbraco/Data/MegaFormDbContext.cs` maps `MF_SubmissionValues`, but no typed tables.
- `MegaForm.Web/Program.cs` does not register `ISubmissionDataStore`.
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs` does not register `ISubmissionDataStore`.

### 4. Core readers are still not typed-first

Status: PASS with nuance.

Nuance:

- `SubmissionQueryService` now accepts `ISubmissionDataStore` and has `GetDetailTyped`.
- But default `GetDetail` and `ToListItem` still read `submission.DataJson`.
- Callers must explicitly use `GetDetailTyped`; this is not yet the default facade behavior.

Still DataJson-based or partially DataJson-based:

- `MegaForm.Core/Services/EmailNotificationService.cs`
- `MegaForm.Core/Services/WebhookService.cs`
- `MegaForm.Core/Services/WorkflowEngine.cs`
- `MegaForm.Core/Services/AdminRecordShellService.cs`
- `MegaForm.Core/Services/DataRepeaterService.cs`
- `MegaForm.Core/Services/FieldOptionsService.cs`
- `MegaForm.Core/Services/ExternalTable/*`
- `MegaForm.Core/Services/Starters/*`
- `MegaForm.Core/Services/Blog/*`
- `MegaForm.Core/Payments/PaymentSubmissionVerifier.cs` durable duplicate check uses repository search over DataJson-like search.

### 5. Backfill exists but is not production-wired

Status: PASS.

Evidence:

- `MegaForm.Core/Services/TypedSubmission/LegacySubmissionBackfillService.cs` exists.
- It writes typed rows from legacy `MF_Submissions.DataJson`.
- But no host currently exposes a clear admin endpoint/job/CLI that runs this typed backfill with migration markers and verification.
- Existing `Reports/Backfill` endpoints are reporting flat-index backfill for `MF_SubmissionValues`, not typed storage migration.

### 6. SDK is still DataJson-centric

Status: PASS.

Evidence:

- `MegaForm.Sdk/Dtos.cs` has `SubmissionDto.DataJson` and `SubmissionListItemDto.DataJson`.
- `MegaForm.Sdk/MegaFormClient.cs` maps submission DTOs from `DataJson`.
- `SubmitAsync` and `UpdateAsync` still serialize a `Dictionary<string, object>` into `DataJson`.
- There is no public SDK contract for `Submission.Data`, `Submission.Fields`, typed field metadata, or typed values.

### 7. Schema-version tables are missing

Status: PASS.

No `MF_FormSchemaVersions`, `MF_FormFields`, submission schema version id, or stable form-field id model exists yet for submissions. Current typed field rows store label/type/page/order snapshots, which is useful, but not enough for full historical schema rendering/versioning.

### 8. Legacy table recommendations are mostly correct

Status: PASS with cleanup caution.

Can be treated as legacy after typed migration:

- `MF_Submissions.DataJson`
- `MF_SubmissionValues`
- `MF_WidgetData`
- `MF_SearchIndex`

Should NOT be treated as legacy in this refactor:

- `MF_SavedDrafts.DataJson`
- `MF_FormAnalytics.AggregatesJson`
- Workflow JSON columns such as workflow context/input/output JSON

Cleanup caution:

- `MF_WidgetData` and `MF_SearchIndex` have no current C# runtime references, but they are still created by old DNN install scripts.
- Do not drop them blindly in customer databases without a data check and release-note/migration path.

## Claude Fix Plan

### P0: DNN schema/package correctness

Goal: a fresh DNN install from the generated zip must always create typed tables before any typed write can run.

Tasks:

1. Fix DNN package version mismatch.
   - Align `MegaForm.DNN/BuildPackage-DNN.ps1` `$VERSION` with `MegaForm.DNN/MegaForm.dnn` package version, or make the script derive it from the manifest.
   - Current mismatch: build script `01.07.106`, manifest `01.07.108`.

2. Rebuild DNN package and verify zip contents.
   - Generated install zip must include `SqlScripts/01.06.39.SqlDataProvider`.
   - Generated `MegaForm.dnn` inside the zip must reference the same script.

3. Decide and fix DNN object qualifier strategy.
   - Current risk: script uses `{databaseOwner}{objectQualifier}MF_SubmissionFields`; runtime uses `dbo.MF_SubmissionFields`.
   - Either:
     - make `DnnSubmissionDataStore` resolve database owner/object qualifier consistently, or
     - make typed script follow the existing hard-coded `dbo.MF_*` convention used by the current DNN data layer.
   - Preferred production-quality path: centralize DNN qualified table naming in one helper and use it in `DnnSubmissionDataStore`, `DnnSubmissionRepositoryAdapter`/FormRepository paths where practical.

4. Clarify or remove stale `MegaForm.DNN/Install/SqlScripts` artifacts.
   - If `Install/SqlScripts` is generated output, document that and avoid using it as source of truth.
   - If it is meant to be source, sync `01.06.39.SqlDataProvider` into it.

Acceptance:

- Fresh DNN install using newly built zip succeeds.
- SQL confirms all seven typed tables exist.
- A newly submitted form writes full `MF_Submissions.DataJson` plus typed rows.
- No typed write failure appears in DNN logs.
- If feasible, test one DNN database with non-empty object qualifier, or add a clear test/guard documenting why object qualifier is unsupported.

### P1: Make typed reads the default Core facade

Goal: shared app/dashboard/inbox code can read submissions without caring whether storage is DataJson or typed rows.

Tasks:

1. Add a small Core helper/facade, for example `SubmissionDataResolver`.
   - Input: `SubmissionInfo`, optional `FormSchema`, optional `ISubmissionDataStore`.
   - Behavior: if typed store exists and `HasFields(submissionId)`, use `GetData`; otherwise parse `DataJson`.
   - Output: `Dictionary<string, object>` plus field snapshots if available.

2. Switch `SubmissionQueryService.GetDetail` to typed-first.
   - Keep `GetDetailTyped` as alias during migration or remove after all callers move.
   - `ToListItem` summary should be built from resolved data, not raw `DataJson` when typed rows exist.

3. Refactor runtime readers to use the resolver:
   - Email notifications
   - Webhook payloads
   - Admin record shell
   - Data repeater
   - Field options
   - Legacy workflow engine field updates/reads
   - Starter services that read/update submission payloads
   - Blog analytics/publish code that mutates post payloads

Acceptance:

- On Oqtane, submit creates `MF_Submissions.DataJson = "{}"` but email/webhook/dashboard/inbox/detail still show real submitted values.
- On DNN, behavior remains unchanged with full `DataJson`, while typed rows are available.
- Unit tests cover typed-first fallback:
  - typed rows present + DataJson collapsed
  - no typed rows + full DataJson
  - malformed DataJson + typed rows present
  - no typed store registered

### P2: Typed update/write sync

Goal: any mutation to a submission updates typed rows consistently.

Tasks:

1. Extend `ISubmissionDataStore` or add a Core service for typed updates.
   - Minimum: `ReplaceFields` wrapper that loads form schema and normalizes from dictionary.
   - Better: `SetField` / `PatchFields` for workflow/admin partial updates.

2. Bring DNN to Oqtane parity.
   - DNN `UpdateData` controller/repository path currently only updates `DataJson`.
   - Add typed re-normalization after `UpdateData`, fail-soft only while DNN remains parallel-write.

3. Audit all direct `_subRepo.UpdateData` callers.
   - Ensure they go through one canonical update service so typed rows do not go stale.

Acceptance:

- Admin edit on Oqtane updates typed rows and search/display values.
- Admin edit on DNN updates both `DataJson` and typed rows.
- Workflow field update updates typed rows.
- Unit tests assert old typed rows are replaced, not duplicated.

### P3: Web and Umbraco typed storage parity

Goal: Web and Umbraco hosts participate in typed storage.

Tasks:

1. Add EF DbSets and model mappings for typed tables.
2. Add host migrations/bootstrap scripts for typed tables.
3. Implement Web and Umbraco `ISubmissionDataStore`.
4. Register the store in `Program.cs` and `MegaFormComposer`.
5. Decide whether each host is:
   - parallel-write only (`SupportsDataJsonCollapse = false`), or
   - typed-primary with hydration bridge (`SupportsDataJsonCollapse = true`).

Recommendation:

- Start Web/Umbraco as parallel-write first.
- Enable collapse only after their repository read paths hydrate like Oqtane.

Acceptance:

- Fresh Web/Umbraco database creates all typed tables.
- Submit writes typed rows.
- No host collapses `DataJson` until its read bridge is proven.

### P4: Backfill typed storage for existing submissions

Goal: existing legacy submissions can be migrated safely.

Tasks:

1. Wire `LegacySubmissionBackfillService` into host admin endpoints/jobs/CLI.
2. Add a migration marker strategy.
   - Example: add `MigratedToTypedOnUtc` / `TypedBackfillVersion` to `MF_Submissions`, or add a separate migration audit table.
3. Add verification:
   - count eligible submissions
   - count typed field rows
   - sample reconstruct and compare with original `DataJson`
4. Add dry-run and batch-size controls.

Acceptance:

- Backfill can run for one form and all forms.
- Backfill is idempotent.
- Backfill can report processed/skipped/failed counts.
- Reconstruct typed data equals original `DataJson` for tested samples.

### P5: Reports, search, filters, dashboards

Goal: dashboard/report APIs must not depend on `MF_SubmissionValues` or raw `DataJson` once typed storage exists.

Tasks:

1. Convert report APIs to typed tables.
   - DNN `ReportApiController.SubmissionData` currently projects from `MF_SubmissionValues`.
   - Web/Umbraco reports also use `MF_SubmissionValues`.
   - Oqtane report backfill has typed fallback, but report storage/query is still mixed.

2. Convert search/filter to typed value tables.
   - Text search: `MF_SubmissionFields.DisplayValue` or typed string/longtext.
   - Numeric/date/bool filters: `MF_SubmissionValueNumber/Date/Boolean`.
   - JSON widgets: `MF_SubmissionValueJson`, with explicit limitations documented.

3. Keep `MF_SubmissionValues` as a compatibility table or view during transition.

Acceptance:

- Grid/card dashboard can list any form with `DataJson` collapsed.
- Advanced filters work for text, number, date/datetime, checkbox/bool, file presence, JSON widget fields.
- Report export does not require full `DataJson`.

### P6: SDK contract update

Goal: external/customer developers can build dashboards/inboxes without parsing legacy JSON strings.

Tasks:

1. Add public DTOs:
   - `SubmissionDto.Data` as `Dictionary<string, object>`
   - `SubmissionDto.Fields` with field key, label, type, data type, display value, has value, order/page
   - value DTOs if needed for typed tables
2. Keep `DataJson` as `[Obsolete]` or compatibility-only, not primary.
3. Add SDK methods for:
   - list submissions with typed fields
   - get submission detail with typed fields/files/workflow state
   - patch/update field values with typed sync
4. Update `PublicAPI.Unshipped.txt` and SDK tests.

Acceptance:

- A customer can build card view/grid view/submission detail from SDK without parsing `DataJson`.
- SDK samples show both simple dictionary access and field metadata access.
- Existing callers using `DataJson` still compile during compatibility period.

### P7: Schema versioning

Goal: old submissions render correctly after form schema changes.

Tasks:

1. Add schema version model:
   - `MF_FormSchemaVersions`
   - optional `MF_FormFields`
   - `MF_Submissions.FormSchemaVersionId` or equivalent
2. On publish/save, create new schema version when field structure changes.
3. On submit, stamp submission with schema version.
4. Typed field rows should store snapshots but not be the only versioning mechanism.

Acceptance:

- Rename/reorder/delete a field after submissions exist.
- Old submission detail still shows the historical label/order.
- New submissions use new schema.

### P8: Legacy cleanup, last phase only

Goal: reduce old tables/columns after typed runtime is proven.

Tasks:

1. Do not drop `MF_Submissions.DataJson` yet.
2. Do not drop `MF_SubmissionValues` yet; first convert reports/search to typed tables or create a compatibility view.
3. For `MF_WidgetData` and `MF_SearchIndex`:
   - confirm no runtime references
   - check whether customer data exists
   - add migration with opt-in/guard or release-note warning
4. Keep draft, analytics, and workflow JSON columns.

Acceptance:

- Cleanup migration is reversible or guarded.
- No dashboard/report/inbox/API code depends on the dropped objects.

## Browser/SQL Acceptance Scenario For Claude

Run on Oqtane first, then DNN.

1. Create a form with:
   - text
   - long text
   - number/currency
   - date
   - datetime picker
   - checkbox / terms privacy
   - file upload
   - data repeater / data grid / grid repeater
   - QR code display-only
2. Submit by browser, not only unit tests.
3. Verify SQL:
   - `MF_Submissions.DataJson` is `"{}"` on Oqtane if typed-primary.
   - `MF_Submissions.DataJson` is full JSON on DNN until DNN read bridge is enabled.
   - `MF_SubmissionFields` has one row per logical input field.
   - Display-only widgets do not create garbage typed value rows.
   - Typed value rows land in the correct value table.
   - File upload creates `MF_Files` and useful typed file metadata.
4. Verify UI/API:
   - public form still works
   - dashboard list shows summary
   - submission detail shows all values
   - inbox detail shows all values
   - report/export shows all requested fields
   - workflow approve/reject/forward/comment still works
5. Verify package:
   - generated DNN zip includes typed script
   - fresh DNN install creates typed tables
   - Oqtane package version/core/server DLLs are in phase

## Do Not Claim Done Until

- Web and Umbraco have typed storage or are explicitly declared out of scope.
- Core default read facade is typed-first.
- DNN package/fresh install is verified from the actual generated zip.
- Updates/workflows/admin edits keep typed rows synced.
- Reports/search/filters no longer require `MF_SubmissionValues`.
- SDK exposes `Data`/`Fields` typed-friendly surface.
- Backfill is wired and verified.
- Package DLL/version drift guard passes.

