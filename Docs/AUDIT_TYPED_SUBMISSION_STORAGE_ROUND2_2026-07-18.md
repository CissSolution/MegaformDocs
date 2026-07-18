# AUDIT vong 2: Typed submission storage sau khi sua theo audit

Date: 2026-07-18  
Scope: Audit only, khong code runtime. Doi chieu source hien tai voi audit truoc `AUDIT_TYPED_SUBMISSION_STORAGE_PHASE1_SOURCE_2026-07-17.md` va handout target `HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`.

## 1. Ket luan ngan

Source da tien bo ro so voi audit vong truoc:

- Oqtane da co `DataJson` collapse co dieu kien qua `ISubmissionDataStore.SupportsDataJsonCollapse`.
- Oqtane repository da hydrate `DataJson` tu typed rows cho legacy readers di qua `Get/List`.
- Oqtane search da co hybrid predicate: legacy `DataJson.Contains` OR typed `MF_SubmissionFields.DisplayValue.Contains`.
- Oqtane delete/bulk delete da goi `_typedStore.DeleteFields`.
- DNN da co typed store ADO.NET `DnnSubmissionDataStore`.
- DNN da co SQL script `01.06.39.SqlDataProvider` tao 7 typed tables voi FK cascade.
- DNN manifest da include script 01.06.39 va DNN service locator da pass `typedStore:` vao `SubmissionProcessor`.
- Core tests target `MegaForm.Sdk.Tests` pass: 91/91.

Nhung source **van chua dat muc tieu full "no-DataJson runtime, cross-platform"**.

Trang thai dung nhat hien tai:

> Oqtane = typed-primary + DataJson hydration bridge.  
> DNN = typed parallel-write + DataJson still primary.  
> Umbraco/Web = unchanged, DataJson primary.

Truoc khi goi la "MegaForm da chuyen sang cach luu nhu Umbraco/no-DataJson", con cac blocker:

- Umbraco/Web chua co typed store/schema/DI.
- Reports/direct SQL van doc `DataJson`; voi Oqtane submission moi `{}` se sai.
- Workflow/API `UpdateData` van JSON-only, co nguy co lam stale typed rows.
- Core services con nhieu direct `submission.DataJson` readers.
- SDK contract van `DataJson`-centric, chua co `SubmissionDto.Data` / `Fields`.
- Backfill service co san nhung chua wire host command/job.

## 2. Verification da thuc hien

Source read:

- `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_OQTANE_DATAJSON_OFF_PLUS_DNN_TWIN.md`
- `MegaForm.Core/Interfaces/ISubmissionDataStore.cs`
- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/SubmissionQueryService.cs`
- `MegaForm.Core/Services/TypedSubmission/*`
- `MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs`
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs`
- `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.DNN/Data/DnnSubmissionDataStore.cs`
- `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider`
- `MegaForm.DNN/SqlScripts/Uninstall.SqlDataProvider`
- `MegaForm.DNN/MegaForm.dnn`
- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- Umbraco/Web controllers/data layers via targeted `rg`.

Command verification:

```text
dotnet test MegaForm.Sdk.Tests\MegaForm.Sdk.Tests.csproj --no-restore --nologo
Result: Passed 91/91 on net10.0
```

Note: This verifies Core/SDK unit coverage currently present. It does not verify DNN package install, Oqtane live DB, Umbraco package, report exports, or browser flows in this audit turn.

## 3. Improvements from audit vong truoc

### 3.1 Core collapse gate da dung huong

`ISubmissionDataStore` now has:

```csharp
bool SupportsDataJsonCollapse { get; }
```

`SubmissionProcessor` now collapses `DataJson` to `{}` only when:

```csharp
if (_typedStore.SupportsDataJsonCollapse)
    _subRepo.UpdateData(submissionId, "{}");
```

This fixes the earlier cross-host risk: DNN can write typed rows without losing legacy `DataJson` readers.

### 3.2 Oqtane typed-primary behavior is clearer

Oqtane:

- `EfSubmissionDataStore.SupportsDataJsonCollapse => true`.
- `EfSubmissionRepository.HydrateDataJson` reconstructs data from typed rows when stored `DataJson` is empty/`{}`.
- `Get` and `List` call hydration.
- Search now checks typed `DisplayValue` as well as legacy JSON.

This means normal Oqtane list/detail flows that go through `EfSubmissionRepository` should survive collapsed `DataJson`.

### 3.3 DNN typed parallel-write was added

DNN:

- New `DnnSubmissionDataStore`.
- Uses same DNN SQL connection source as existing repositories/indexer.
- `SupportsDataJsonCollapse => false`.
- `ReplaceFields` is transactional delete-then-insert.
- SQL script creates:
  - `MF_SubmissionFields`
  - `MF_SubmissionValueString`
  - `MF_SubmissionValueLongText`
  - `MF_SubmissionValueNumber`
  - `MF_SubmissionValueDate`
  - `MF_SubmissionValueBoolean`
  - `MF_SubmissionValueJson`
- Script includes FK cascade:
  - `MF_Submissions -> MF_SubmissionFields`
  - `MF_SubmissionFields -> MF_SubmissionValue*`
- `DnnServiceLocator` passes `typedStore:` to `SubmissionProcessor`.

This closes one major finding from vong 1: DNN now writes typed rows for new submissions while keeping full `DataJson`.

### 3.4 Normalizer/reconstructor safety improved

`SubmissionFieldNormalizer`:

- Checkbox group with options -> string rows.
- Single checkbox without options -> boolean.
- Number/date parse-fail now falls back to string rows.

`SubmissionDataReconstructor`:

- Number/date reconstruct prefers typed rows, then string fallback.

This reduces data-loss risk when `DataJson` is off.

## 4. Remaining findings

### P0 - Reports/direct SQL still read DataJson and will be wrong on Oqtane typed-primary rows

Still found:

- `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs`
  - selects `s.DataJson`
  - samples `DataJson` for completion
- `MegaForm.DNN/WebApi/ReportApiController.cs`
  - selects `DataJson`
- `MegaForm.Umbraco/Controllers/ReportsController.cs`
  - selects `DataJson`
- `MegaForm.Web/Controllers/ReportsController.cs`
  - selects `DataJson`

Impact:

- Oqtane new submissions can have `MF_Submissions.DataJson = "{}"`.
- Any report/export/completion path that reads raw SQL `DataJson` bypasses repository hydration.
- Result can be empty/incorrect even though typed rows have the data.

Required:

- Reports must query typed rows or call a typed read service.
- Completion % should use `MF_SubmissionFields.HasValue` + schema/field snapshot, not `DataJson`.
- CSV/export should join typed value tables or call `ISubmissionDataStore.GetData`.

### P0 - UpdateData/workflow mutations still do not update typed rows

Still found:

- `ISubmissionRepository.UpdateData(int submissionId, string dataJson)` remains core contract.
- Oqtane `Submissions/UpdateData` calls `_subRepo.UpdateData(...)`.
- DNN `MegaFormApiController.UpdateData` is still JSON-oriented.
- Umbraco `MegaFormApiController.SubmissionExtras.UpdateData` is still JSON-oriented.
- `WorkflowEngine` parses `submission.DataJson`, mutates it, then `_subRepo.UpdateData(...)`.
- Several starter/blog paths still update `DataJson`.

Impact:

- Oqtane submit starts typed-primary.
- A later workflow/API update can write a full `DataJson`, but typed rows stay stale.
- If future report/API reads typed rows, it will miss workflow mutations.
- If repository sees full `DataJson`, `HydrateDataJson` will not overwrite it, so divergence can persist silently.

Required:

- Add typed update contract: `SetField`, `UpdateFields`, or `PatchFields`.
- Route `UpdateData` through typed store where available.
- On DNN, while `DataJson` remains primary, update both DataJson and typed rows.
- On Oqtane, update typed rows first and optionally rebuild compatibility JSON.

### P0 - Umbraco/Web still unchanged

Target was cross-platform DNN/Oqtane/Umbraco. Current source:

- No `ISubmissionDataStore` implementation in `MegaForm.Umbraco`.
- No typed DbSets/migration in `MegaForm.Umbraco`.
- No typed store in `MegaForm.Web`.
- Umbraco/Web data layers still map `DataJson` and `MF_SubmissionValues`.

Impact:

- Umbraco/Web still submit/read via legacy `DataJson`.
- Any Core-level assumption that typed rows exist would break these hosts.

Required:

- `UmbracoSubmissionDataStore` + migration/bootstrap update.
- Web host typed store if Web is still a supported host.
- Do not turn on typed-only Core readers globally until these hosts have store or a fallback policy.

### P1 - Core readers are still DataJson-centric

Still found many direct readers:

- `SubmissionQueryService.GetDetail` / `ToListItem`.
- `AdminRecordShellService`.
- `EmailNotificationService`.
- `WebhookService`.
- `WorkflowEngine`.
- `DataRepeaterService`.
- `FieldOptionsService`.
- `EmailSummaryService`.
- `ConfiguredAppStarterService`.
- Blog services.

Oqtane repository hydration masks this for paths that load via repository `Get/List`, but it is still not a true typed-read architecture.

Required:

- Promote typed data read to a first-class Core service.
- Inject/pass `ISubmissionDataStore` into `SubmissionQueryService` everywhere or make repository expose canonical data safely.
- Switch services one by one off direct `submission.DataJson`.

### P1 - `SubmissionQueryService.GetDetailTyped` exists but is not wired into controllers

`SubmissionQueryService` has `GetDetailTyped`, but current controller construction usually uses:

```csharp
new SubmissionQueryService(_subRepo, _formRepo, fileRepo)
```

without typed store.

Examples:

- Oqtane controller creates service manually without typed store.
- DNN controllers create service manually without typed store.
- Web controller creates service manually without typed store.
- Umbraco DI registers `SubmissionQueryService`, but has no typed store.

Impact:

- The typed detail path is mostly unused.
- Existing UI/API still depends on repository hydration or DataJson.

Required:

- Stop manual `new SubmissionQueryService(...)` where DI can provide typed store.
- Add overload usage with `typedStore`.
- Or make `GetDetail` typed-aware and deprecate `GetDetailTyped`.

### P1 - SDK/API contract still exposes DataJson as primary

`MegaForm.Sdk/Dtos.cs` still has:

- `SubmissionDto.DataJson`
- `SubmissionListItemDto.DataJson`
- `SubmissionDetailDto.Values` and `FieldSnapshots`, but no canonical `Data` dictionary and no typed field values DTO.

Impact:

- Customers building card/grid/dashboard/inbox still parse raw JSON or display snapshots.
- No public contract yet for typed row storage.
- This misses the developer-facing goal of the storage refactor.

Required:

- Add `SubmissionDto.Data`.
- Add `SubmissionDto.Fields`.
- Add `SubmissionFieldDto` / `SubmissionTypedValueDto`.
- Mark `DataJson` obsolete/legacy.
- Add `Submissions/UpdateFields`.

### P1 - Backfill service still not wired as host command/job

Core has `LegacySubmissionBackfillService`, but audit did not find host command/job/API:

- No platform `ILegacySubmissionSource` wiring confirmed.
- No `MigratedToTypedOnUtc` marker.
- No admin command to run backfill and verify counts.

Impact:

- Existing Oqtane rows before typed write may lack typed rows.
- Existing DNN rows before 01.06.39 may lack typed rows.
- Switching reports/readers to typed rows before backfill will hide old data.

Required:

- Host-level backfill command/job per platform.
- Batch/progress/audit logging.
- Idempotent verification: submission count, field row count, typed value row count.

### P1 - Oqtane delete cleanup is better but still not DB-guaranteed

Oqtane now calls `_typedStore.DeleteFields` in `Delete` and `BulkDelete`.

Residual risk:

- Cleanup happens after deleting master row.
- Cleanup is fail-soft and exceptions are swallowed.
- Oqtane typed tables still have no DB FK/cascade because EF model has no explicit relationships.

Impact:

- A cleanup failure can still leave orphan typed rows.

Required:

- Prefer DB FK/cascade by adding explicit EF relationships if Oqtane schema generation supports it.
- Or delete typed rows before/in the same transaction as master delete.
- At minimum log cleanup failures, not silent catch.

### P2 - DNN store uses hardcoded `dbo.MF_*`

`DnnSubmissionDataStore` SQL uses `dbo.MF_SubmissionFields` and `dbo.MF_SubmissionValue*`.

The install script uses `{databaseOwner}{objectQualifier}` placeholders. Existing MegaForm DNN code also appears to use `dbo.MF_*` heavily, so this may match current product assumptions. But if a DNN install uses a non-empty object qualifier, typed store and script can drift.

Required:

- Decide if MegaForm officially supports DNN `objectQualifier`.
- If yes, DNN store must resolve owner/object qualifier consistently.
- If no, document "empty objectQualifier required".

### P2 - Typed search is hybrid, not final indexed field search

Oqtane search checks:

- `s.DataJson.Contains(term)`
- OR `MF_SubmissionFields.DisplayValue.Contains(term)`

This is better than DataJson-only, but still not final:

- It does not use typed value tables for exact/range filters.
- `DisplayValue.Contains` is still broad text search.
- Number/date/boolean filtering should use typed value indexes.

Required:

- Dashboard advanced filters should use `MF_SubmissionValueNumber/Date/Boolean/String`.
- Free-text search may remain DisplayValue/FTS, but field filters should not.

### P2 - Schema/version/audit extras still missing

Still not implemented from target architecture:

- `MF_FormSchemaVersions`
- `MF_FormFields`
- `SubmissionKey`
- `FormKey`
- `SchemaVersion`
- `MF_SubmissionAudit`
- `MF_Files.SubmissionFieldId` linkage
- content/member/culture context columns.

These are not required for the first typed write, but are needed for robust native dashboard/inbox/report behavior over time.

### P2 - Normalizer edge coverage still incomplete

Tests pass 91/91, but remaining edge cases from handoff/audit are still not fully covered:

- `System.Text.Json.JsonElement` payloads.
- File upload metadata.
- Signature/Address/FullName/PhoneIntl.
- Culture-specific date/decimal.
- Duplicate field keys.
- Sensitive field masking.

## 5. Acceptance matrix vong 2

| Requirement | Current status | Result |
|---|---|---|
| Core typed abstraction | `ISubmissionDataStore` exists + collapse gate | Pass |
| Oqtane typed-primary | Typed store + collapse + hydration | Partial pass |
| Oqtane search with collapsed DataJson | Hybrid search added | Partial pass |
| Oqtane delete typed cleanup | Repo cleanup added | Partial pass, no DB guarantee |
| DNN typed store | ADO store + SQL script + DI | Pass for parallel-write |
| DNN no-DataJson runtime | DNN keeps DataJson primary | Not yet |
| Umbraco typed store | Not found | Fail |
| Web typed store | Not found | Fail |
| Reports read typed rows | Still DataJson direct SQL | Fail |
| Workflow/update sync typed rows | Still UpdateData JSON-only | Fail |
| SDK typed contract | Still DataJson-centric | Fail |
| Backfill host command | Not found | Fail/partial foundation |
| Unit tests | SDK tests pass 91/91 | Pass for covered scope |

## 6. Recommended next work order

1. Fix report/direct SQL paths before relying on Oqtane collapsed `DataJson` in production.
2. Add typed update API and route `UpdateData`/workflow mutations through it.
3. Wire `SubmissionQueryService` typed store and make `GetDetail` typed-aware.
4. Implement Umbraco typed store + migration + DI.
5. Decide Web host support and implement or explicitly defer.
6. Add SDK `Data`/`Fields` contract and mark `DataJson` obsolete.
7. Add host backfill command/job before switching old data reads to typed-only.
8. Add Oqtane DB FK/cascade or transactional typed cleanup with logged failures.
9. Add field-filter query APIs over typed value tables.

## 7. Final verdict

Vong 2 da fix cac diem quan trong nhat cua vong 1 cho Oqtane va them DNN typed-write. Day la tien bo that, khong phai cosmetic.

Nhung kien truc hien tai van la:

```text
Oqtane: typed-primary + DataJson hydration compatibility
DNN: typed parallel-write + DataJson primary
Umbraco/Web: DataJson legacy
SDK/API: DataJson-centric
Reports/workflow/update: DataJson-centric
```

Do do chua nen dong dau "done" cho muc tieu no-DataJson. Nen dong dau:

> Typed submission storage Round 2: Oqtane primary pilot + DNN parallel-write twin, ready for Phase 3 reader/update/report migration.

