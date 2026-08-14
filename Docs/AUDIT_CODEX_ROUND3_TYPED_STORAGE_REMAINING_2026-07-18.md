# Audit Codex Round 3 - Typed Submission Storage Remaining

Date: 2026-07-18
Scope: source audit only, no runtime code changes.
Repository: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
Request baseline: `Docs/REQUEST_CODEX_AUDIT_ROUND3_TYPED_STORAGE_REMAINING_2026-07-18.md`

## Status stamp

Do not stamp this as "done no-DataJson".

Correct status:

> Round 2: Oqtane primary pilot + DNN parallel-write twin, ready for Phase 3.

Recommendation: do not push/release yet. The working tree can be kept local for this audit. Before any customer-facing package, fix the P0 items below, especially the DLL/package mismatch trap.

## Executive verdict

| Item | Verdict | Severity | Short reason |
| --- | --- | --- | --- |
| R3-A Umbraco/Web typed store | FAIL | P0 | Umbraco/Web still have no `ISubmissionDataStore` registration, no typed DbSets, no typed tables in schema bootstrap. |
| R3-B Core readers DataJson-centric | PARTIAL | P0 | Oqtane repo hydrates collapsed rows, but many Core services still consume `DataJson`; direct insert paths bypass typed writes. |
| R3-C typed update API + workflow sync | PARTIAL/FAIL | P0 | Oqtane `UpdateData` syncs typed rows, but no field-level typed update API; DNN/Web/Umbraco update paths do not sync typed rows. |
| R3-D SDK Data/Fields surface | FAIL | P0 | SDK DTOs and facade expose `DataJson`, not first-class `Data`/`Fields` typed values. |
| R3-E backfill wiring | FAIL | P0 | Backfill service exists in Core but is not wired to host jobs/endpoints and has no migrated marker/verification surface. |
| R3-F Oqtane delete DB-FK | FAIL/PARTIAL | P1 | App cleanup exists, but Oqtane EF model has no FK cascade; delete is not transactionally guaranteed. |
| R3-G field filter typed tables | FAIL | P1 | Advanced field filters are client-side over current page; server free-text uses `DataJson`/`DisplayValue`, not typed value tables. |
| R3-H schema-version tables | FAIL/PARTIAL | P1 | Field snapshots exist, but no form schema version table/key, no submission/form stable keys, no audit/member/content/culture columns. |
| R3-I normalizer edge tests | PARTIAL/FAIL | P1 | Good baseline tests, but missing edge widgets and edge values required before deleting `DataJson`. |
| R3-J DLL deploy mismatch trap | FAIL | P0 | Package script can pack stale DLLs; package/version numbers are inconsistent; no post-pack guard. |

## Priority order for Phase 3

1. Fix R3-J first before any package install or push: full rebuild before pack, version alignment, nupkg inspection/guard.
2. Fix R3-A/C/D/E as the typed-storage platform contract.
3. Fix R3-B direct writer bypasses so all mutation paths use one typed-aware pipeline.
4. Fix R3-F/G/H/I before declaring no-DataJson or production readiness.

## R3-A - Umbraco/Web have no typed store

Verdict: FAIL for platform parity. Core is safely null-gated, but Umbraco/Web are not typed-storage hosts yet.

Evidence:

- `MegaForm.Umbraco\Data\MegaFormDbContext.cs:21-24` exposes only Forms, Submissions, legacy `SubmissionValues`, and Files DbSets.
- `MegaForm.Umbraco\Data\MegaFormDbContext.cs:95-118` maps `MF_Submissions.DataJson` and legacy flat `MF_SubmissionValues`, but no `MF_SubmissionFields` or typed value tables.
- `MegaForm.Web\Data\DataLayer.cs:25-28` exposes only Forms, Submissions, legacy `SubmissionValues`, and Files DbSets.
- `MegaForm.Web\Data\DataLayer.cs:77-99` maps `MF_Submissions.DataJson` and legacy `MF_SubmissionValues`, but no typed storage tables.
- `MegaForm.Umbraco\Composers\MegaFormComposer.cs:52-81` registers DbContext/repositories, and `:162-165` registers Core services, but not `ISubmissionDataStore`.
- `MegaForm.Web\Program.cs:33-37` registers repositories and `:110` registers `SubmissionProcessor`, but not `ISubmissionDataStore`.
- `MegaForm.Umbraco\Data\UmbracoDatabaseSchemaBootstrapper.cs:14-49` and `MegaForm.Web\Data\DatabaseSchemaBootstrapper.cs:12-41` only ensure the current EF model, which does not include typed tables.
- Core safety: `MegaForm.Core\Services\SubmissionProcessor.cs:386-415` writes/collapses typed data only when `_typedStore != null`; `MegaForm.Core\Interfaces\ISubmissionDataStore.cs:13-20` explicitly gates collapse through `SupportsDataJsonCollapse`.

Required fix:

- Add typed entity DbSets and mapping to Umbraco/Web contexts.
- Add host-specific `ISubmissionDataStore` implementation/registration for Umbraco/Web.
- Add schema bootstrap/migration for `MF_SubmissionFields` and typed value tables.
- Keep `SupportsDataJsonCollapse = false` until each host has read hydration and backfill verified.

PASS criteria:

- New form submission on Umbraco/Web writes master row plus typed field rows.
- Hydrated detail/list/API reads work when `MF_Submissions.DataJson` is `{}` or null.
- Host can be run with `DataJson` collapsed only after passing backfill/read tests.

## R3-B - Core readers still DataJson-centric

Verdict: PARTIAL. Oqtane protects common repo reads by hydrating `DataJson`, but the Core layer is still architecturally `DataJson`-centric.

Evidence:

- `MegaForm.Core\Services\SubmissionQueryService.cs:111-144` gets detail from repository, then uses `submission.DataJson` for snapshots and flattened values.
- `MegaForm.Core\Services\SubmissionQueryService.cs:152-190` has `GetDetailTyped`, but most existing consumers still call `GetDetail`.
- `MegaForm.Core\Services\SubmissionQueryService.cs:204-240` builds list summaries from `submission.DataJson`.
- `MegaForm.Core\Services\AdminRecordShellService.cs:47-54` and `:154-160` parse `DataJson` from submission/detail.
- `MegaForm.Core\Services\WorkflowEngine.cs:275-300` updates workflow fields by parsing and rewriting `DataJson`.
- `MegaForm.Core\Services\WorkflowEngine.cs:386-402` creates records by direct `_subRepo.Insert`, bypassing `SubmissionProcessor` typed-write/collapse logic.
- `MegaForm.Core\Services\ConfiguredAppStarterService.cs:773-787` also inserts direct `SubmissionInfo.DataJson` through repository.
- `MegaForm.Core\Services\DataRepeaterService.cs:313-331`, `FieldOptionsService.cs:341-358`, `EmailSummaryService.cs:32-47`, `Blog\ScheduledPublishService.cs:33-48`, and `Blog\BlogAnalyticsRollupService.cs:37-127` depend on repository-returned `DataJson`.
- Oqtane mitigation: `MegaForm.Oqtane.Server\Data\EfRepositories.cs:129-143` hydrates `DataJson` from typed store when empty/collapsed; `:158-164` applies it in `Get`; `:208-214` applies it in `List`.

Risk:

- On Oqtane, many readers work because repo hydration reconstructs `DataJson`.
- On future no-DataJson hosts or any direct DbContext/raw SQL reads, the same services will break or miss field values.
- Direct `Insert` paths can create rows without typed field rows, so typed-primary reads and filters will be incomplete.

Required fix:

- Introduce a Core submission data reader facade, for example `ISubmissionDataReader`, returning canonical `SubmissionDataDocument` or typed field values.
- Route all Core consumers through the facade instead of parsing `SubmissionInfo.DataJson` directly.
- Replace direct `_subRepo.Insert` writer paths with a typed-aware submission command service or `SubmissionProcessor` path.

PASS criteria:

- `rg "DataJson"` in Core service code leaves only legacy adapters, migration/backfill, or explicitly obsolete compatibility surfaces.
- Direct record creation and generated app starter paths write typed rows.
- Collapsed `DataJson` rows still render dashboards, inbox, notifications, repeater lookups, and workflow screens.

## R3-C - typed update API and workflow sync

Verdict: PARTIAL/FAIL. Oqtane has a full-json typed sync inside `UpdateData`, but the public contract and other hosts are not ready.

Evidence:

- `MegaForm.Core\Interfaces\ISubmissionDataStore.cs:32-36` only exposes `InsertFields`, `ReplaceFields`, `DeleteFields`, and `HasFields`; no `SetField`, `UpdateFields`, `PatchFields`, or typed mutation command.
- `MegaForm.Oqtane.Server\Data\EfRepositories.cs:229-265` re-normalizes full `dataJson` and calls `_typedStore.ReplaceFields(...)` during `UpdateData`, but only in Oqtane.
- `MegaForm.DNN\Data\DnnRepositories.cs:96-98` updates only legacy/master data through `FormRepository.UpdateSubmissionData`.
- `MegaForm.Web\Data\DataLayer.cs:573` updates only `s.DataJson`.
- `MegaForm.Umbraco\Data\EfRepositories.cs:125-130` updates only `sub.DataJson`.
- `MegaForm.Core\Services\WorkflowEngine.cs:275-300` calls `_subRepo.UpdateData`; therefore Oqtane syncs typed values, but DNN/Web/Umbraco do not.
- `MegaForm.Core\Services\WorkflowEngine.cs:386-402` creates new records through `_subRepo.Insert`, bypassing typed writes.
- `MegaForm.Sdk\MegaFormClient.cs:259-263` exposes update as dictionary-to-JSON followed by `_submissions.UpdateData`.

Required fix:

- Add typed update/patch command API at Core level:
  - update one field
  - update many fields
  - attach/remove files
  - approve/reject/forward workflow actions with field mutation and file metadata
- Make host repositories either implement typed sync consistently or route updates to a shared command service.
- Preserve `UpdateData` only as legacy compatibility, internally translating to typed `ReplaceFields`.

PASS criteria:

- Workflow approve/forward/update-field in Oqtane and DNN updates typed tables.
- File attach/remove via inbox/workflow writes file metadata and typed file field rows.
- SDK/API clients can update fields without sending an entire `DataJson` document.

## R3-D - SDK lacks Data/Fields facade

Verdict: FAIL. The SDK still exposes `DataJson` as the primary developer surface.

Evidence:

- `MegaForm.Sdk\Dtos.cs:108-119` `SubmissionDto` exposes `DataJson`, not first-class `Data`/`Fields`.
- `MegaForm.Sdk\Dtos.cs:310-324` `SubmissionListItemDto` exposes `DataJson`.
- `MegaForm.Sdk\Dtos.cs:327-335` `SubmissionDetailDto` contains submission/form/schema/files/values/snapshots, but not a typed field-value facade suitable for dashboards.
- `MegaForm.Sdk\MegaFormClient.cs:246-255` submits by serializing dictionary data into `SubmissionInfo.DataJson`.
- `MegaForm.Sdk\MegaFormClient.cs:259-263` updates by serializing a dictionary and calling `_submissions.UpdateData`.
- `MegaForm.Sdk\MegaFormClient.cs:753-767` and `:867-875` map DTOs with `DataJson`.
- `MegaForm.Sdk\PublicAPI.Unshipped.txt` still lists `SubmissionDto.DataJson` and `SubmissionListItemDto.DataJson` as public API members.

Required fix:

- Add stable SDK DTOs:
  - `SubmissionData` or `Data: IDictionary<string, object?>`
  - `Fields: IReadOnlyList<SubmissionFieldDto>`
  - typed scalar/multi/file/json field values
  - display value and field metadata snapshots
- Add SDK methods for dashboard/inbox:
  - list submissions with selected fields
  - get submission detail typed
  - query/filter/sort by field
  - patch field values
  - workflow action APIs
  - upload/attach file APIs
- Mark `DataJson` obsolete but keep for legacy compatibility until Phase 4.

PASS criteria:

- A customer can build card view, grid view, submission dashboard, custom inbox, ERP/CRM integration using SDK without parsing `DataJson`.
- Public API file documents the typed members and obsolete status for legacy JSON.

## R3-E - backfill service exists but is not wired

Verdict: FAIL.

Evidence:

- `MegaForm.Core\Services\LegacySubmissionBackfillService.cs:15-118` implements a useful batch backfill service.
- `MegaForm.Core\Services\BackfillOptions.cs:8-11` has only form id, batch size, max submissions, and force flags.
- `MegaForm.Core\Services\BackfillResult.cs:6-31` reports processed/skipped/failed/fields/errors, but no migration marker or verification counters.
- `MegaForm.Core\Interfaces\ILegacySubmissionSource.cs:11-19` exists, but no host implementation was found.
- No host registration/endpoint/job was found for `LegacySubmissionBackfillService`, `BackfillOptions`, or `ILegacySubmissionSource`.
- Existing `Reports/Backfill` endpoints in DNN/Oqtane/Web/Umbraco are report-index backfills for legacy `MF_SubmissionValues`, not new typed storage backfill.

Required fix:

- Register a backfill command service in each host.
- Add host-specific legacy source implementations.
- Add admin-only endpoint/job/CLI command to run:
  - dry run
  - per form
  - all forms
  - resume after failure
  - force rebuild
- Add a migrated marker such as `MigratedToTypedOnUtc` or separate migration ledger.
- Add verification counts comparing submission count, field count, file metadata count, and selected sample reconstructed data.

PASS criteria:

- On an existing site, admin can backfill all old `DataJson` submissions into typed tables.
- Backfill is idempotent.
- Backfill report can prove which rows are migrated, skipped, failed, and why.

## R3-F - Oqtane delete lacks DB-FK guarantee

Verdict: FAIL/PARTIAL. Application cleanup exists, but database integrity is not guaranteed.

Evidence:

- `MegaForm.Oqtane.Server\Data\MegaFormDbContext.cs:157-232` maps typed field/value tables and indexes, but no EF relationships or `OnDelete(DeleteBehavior.Cascade)`.
- `MegaForm.Oqtane.Server\Migrations\01060039_AddTypedSubmissionStorage.cs:39-96` defines cascade FKs in the migration, but `:22-24` says Oqtane `Up()` does not run because the module uses EF model schema creation.
- Therefore fresh Oqtane installs built from the model can miss database FKs.
- `MegaForm.Oqtane.Server\Data\EfRepositories.cs:268-282` deletes master submission then calls `_typedStore?.DeleteFields(...)` after `SaveChanges`, fail-soft.
- `MegaForm.Oqtane.Server\Data\EfRepositories.cs:285-297` bulk delete removes masters and then loops typed cleanup, also fail-soft and not atomic.

Required fix:

- Add EF model relationships from `SubmissionFieldRecord` to `SubmissionInfo` and value tables to `SubmissionFieldRecord`.
- Ensure schema bootstrap creates real DB FKs for fresh Oqtane installs.
- Move app-level typed cleanup into the same transaction as master delete, or rely on verified DB cascade.

PASS criteria:

- Deleting one submission or bulk deleting submissions leaves zero orphan rows in all typed value tables.
- SQL schema inspection confirms FKs exist on a fresh Oqtane install.

## R3-G - field filters do not query typed value tables

Verdict: FAIL.

Evidence:

- `MegaForm.Oqtane.Server\Data\EfRepositories.cs:180-192` free-text search uses `DataJson.Contains(term)` and/or `SubmissionFields.DisplayValue.Contains(term)`.
- This does not use typed value tables such as string/number/date/bool/file/json tables for exact typed comparisons.
- `MegaForm.UI\src\submissions\submission-advanced-filter.ts:1-8` explicitly says advanced field filters are client-side over the loaded page.
- `MegaForm.UI\src\submissions\submission-advanced-filter.ts:652-679` performs generic string/number/date comparisons in browser.
- `MegaForm.UI\src\submissions\submission-advanced-filter.ts:689-738` keeps status server-side but applies field filters client-side.
- `MegaForm.UI\src\submissions\SubmissionsShell.ts:732-735` and `:883-902` describe current-page filtering/count behavior.
- `MegaForm.Oqtane.Server\Controllers\MegaFormController.Reports.cs:340-353` report aggregation still queries legacy `MF_SubmissionValues`.

Required fix:

- Add typed query API with server-side field filters:
  - string contains/equals
  - number range/comparison
  - date/time range
  - bool equals
  - option/multi-option contains
  - file exists/count/content type
  - json/repeater existence and maybe path predicates later
- Route submission dashboard/grid/card queries through this server API.
- Keep client-side filters only as a UX refinement on already fetched rows, not as canonical filtering.

PASS criteria:

- Filtering field `amount > 100`, `date between X and Y`, `status = approved`, or `country = US` returns correct total count across all pages.
- SQL/log inspection shows typed value tables are used, not `MF_Submissions.DataJson`.

## R3-H - missing schema-version and platform identity tables/columns

Verdict: FAIL/PARTIAL. Field snapshot columns are useful, but they are not a schema versioning model.

Evidence:

- `MegaForm.Core\Models\TypedSubmissionEntities.cs:19-42` has field snapshot fields: form id, field key/id/alias/type/data type/label/page/order/display/sensitive.
- No `MF_FormSchemaVersions`, `MF_FormFields`, `FormSchemaVersion`, `SubmissionKey`, `FormKey`, `SubmissionAudit`, `ContentId`, `MemberId`, or `Culture` model/table was found.
- `MegaForm.Core\Models\EntityModels.cs:63-78` `SubmissionInfo` has id, form id, `DataJson`, IP, user agent, user id, status, spam, submitted/read/modified, but no stable schema/version/platform identity columns.
- `MegaForm.Core\Models\EntityModels.cs:109-118` `FileInfo` references submission id and field key, but not typed `SubmissionFieldId`.

Required fix:

- Add form schema version concept:
  - immutable schema version rows
  - schema hash
  - created timestamp/user
  - current version pointer on form
- Add submission-level stable keys and platform identity columns where relevant:
  - submission key/guid
  - form key/guid
  - schema version id/hash
  - content/page/context id for CMS hosts
  - member/user identity fields
  - culture/language if multilingual forms are supported
  - audit table for mutation history
- Link file metadata to typed field rows where possible.

PASS criteria:

- A submission made under an old form schema can be rendered correctly after the form schema changes.
- A customer integration can identify submissions/forms with stable keys across migration/export/import.

## R3-I - normalizer tests are not enough for no-DataJson

Verdict: PARTIAL/FAIL.

Evidence:

- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:16-46` verifies broad data-type mapping for common field types.
- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:53-104` covers checkbox group normalization.
- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:127-165` covers basic number/date parsing.
- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:214-238` covers address JSON.
- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:263-325` covers backfill basics.
- `MegaForm.Sdk.Tests\TypedSubmissionStorageTests.cs:327-355` covers multi-value JSON reconstruction.
- `MegaForm.Sdk.Tests\SubmissionFileMetaExtractorTests.cs:27-92` covers common file metadata shapes.
- Missing explicit tests for important widgets and edge cases:
  - `PhoneIntl`
  - `FileUpload`
  - `DateTimePicker`
  - `TermsPrivacy`
  - `DataGrid`
  - `GridRepeater`
  - `DataRepeater`
  - `QRCode`
  - `System.Text.Json.JsonElement` raw values
  - culture-specific decimal/date input
  - duplicate field keys
  - empty arrays/objects/nulls
  - nested repeater file values
  - sensitive-field masking expectations

Required fix:

- Add unit tests for all current widgets that were previously stored safely in `DataJson`.
- Add browser acceptance tests that create forms containing the widgets above and submit real data.
- Verify reconstructed typed data equals expected canonical data after `DataJson` collapse.

PASS criteria:

- Test forms containing Calendar/date/time/datetime picker, file upload, repeater/grid, checkbox/multi-select, address/full name, phone intl, terms/privacy, QR/code-like fields can submit and render via typed storage.
- Tests fail if any widget silently degrades to an unusable display string only.

## R3-J - DLL/package mismatch deployment trap

Verdict: FAIL. This is the highest release-risk item.

Evidence:

- `MegaForm.Oqtane.Package\release.cmd:1-18` deletes old packages and runs `nuget.exe pack`, but does not build Client/Server/Core before packing.
- `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec:47-52` packages DLLs from existing `bin\Release\net9.0`.
- `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec:61` packages `MegaForm.Core.dll` from Server output.
- `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec:76-82` repeats DLL includes for `net10.0`.
- Version metadata is inconsistent:
  - `MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec:5` has package version `1.7.107`.
  - `MegaForm.Oqtane.Client\ModuleInfo.cs:12-14` has `Version = "1.7.108"` and release version `1.7.108`.
  - `MegaForm.Oqtane.Server\MegaForm.Oqtane.Server.csproj:6` has version `1.7.15`.
  - `MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj:5` has version `1.7.15`.
  - `MegaForm.Oqtane.Package\MegaForm.Oqtane.Package.csproj:12` has version `1.7.22`.
  - `MegaForm.Core\MegaForm.Core.csproj:11` has version `1.5.0`.
- New Core contract member `ISubmissionDataStore.SupportsDataJsonCollapse` is used by `SubmissionProcessor`; stale Core/Server DLL combinations can silently skip typed/collapse behavior or throw runtime binding/type-load errors depending on load order.
- `SubmissionProcessor.cs:391-414` catches typed storage exceptions fail-soft, so a mismatched package can appear installed while typed write/collapse is not really active.

Required fix:

- Make packaging script perform clean Release builds for all packed projects before `nuget pack`.
- Align package/module/project versions or generate them from one source.
- Add post-pack validation:
  - inspect nupkg DLL timestamps/hashes
  - inspect `MegaForm.Core.dll` contains `SupportsDataJsonCollapse`
  - inspect Server DLL references the matching Core assembly
  - compare nupkg version with `ModuleInfo.Version`
- Add runtime health endpoint/admin diagnostic:
  - loaded assembly versions
  - loaded assembly file path
  - `ISubmissionDataStore` implementation present
  - collapse support enabled/disabled
  - typed write/collapse smoke result

PASS criteria:

- Fresh Oqtane site install from built nupkg proves Client, Server, Core versions match.
- A submitted form produces typed rows and expected collapsed/non-collapsed `DataJson` behavior.
- The package build fails if stale DLLs would be packed.

## Acceptance script for Claude next session

1. Start from this status: "Round 2: Oqtane primary pilot + DNN parallel-write twin, ready for Phase 3."
2. Do not delete `DataJson` yet.
3. Fix R3-J packaging guard first.
4. Implement/verify typed store parity in Umbraco/Web or explicitly mark hosts as legacy-only with collapse disabled.
5. Replace direct Core insert/update paths with typed-aware command services.
6. Expand SDK DTOs/methods so dashboard, card view, grid view, inbox, workflow action, and ERP/CRM integrations do not parse `DataJson`.
7. Wire backfill with admin endpoint/job and migration marker.
8. Add typed server-side query/filter API.
9. Add schema versioning and stable keys.
10. Add widget coverage tests and browser submissions for:
    - Calendar/date/time/datetime picker
    - file upload
    - data repeater/grid repeater
    - checkbox/multi-select
    - address/full name
    - phone intl
    - terms/privacy
    - QR/code-like widgets
11. Only after all PASS criteria are met, consider a new status stamp: "Phase 3 typed storage complete, DataJson legacy compatibility only."

## Final audit note

The current code is a strong pilot, not yet a finished no-DataJson architecture. Oqtane is the most advanced host because its repository can hydrate collapsed rows and sync full-json updates back to typed fields. DNN is still a parallel-write twin, and Web/Umbraco are effectively legacy storage hosts. The next engineering pass should focus on making typed storage the shared contract rather than a host-specific side path.
