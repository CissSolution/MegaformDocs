# AUDIT: Typed submission storage sau khi sua source theo kieu Umbraco

Date: 2026-07-17  
Scope: Audit only, khong code runtime. Doi chieu source hien tai voi muc tieu trong `HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`.

## 1. Ket luan ngan

Source hien tai **da co nen typed submission storage dung huong**, nhung **chua dat muc tieu "khong su dung DataJson nua"**.

Trang thai thuc te:

- Core da co abstraction `ISubmissionDataStore`.
- Core da co typed entities: `SubmissionFieldRecord`, `SubmissionValueStringRecord`, `SubmissionValueLongTextRecord`, `SubmissionValueNumberRecord`, `SubmissionValueDateRecord`, `SubmissionValueBooleanRecord`, `SubmissionValueJsonRecord`.
- Core da co `SubmissionFieldNormalizer`, `SubmissionDataReconstructor`, `LegacySubmissionBackfillService`.
- Oqtane da co EF store `EfSubmissionDataStore`, DbSet/mapping, migration `01060039_AddTypedSubmissionStorage`, DI registration.
- Oqtane submit hien co the ghi typed rows, sau do collapse `MF_Submissions.DataJson` ve `{}` neu typed write thanh cong.

Nhung day van la **Phase 1 / Oqtane pilot**, khong phai full conversion:

- DNN va Umbraco chua co typed store/migration/DI.
- Nhieu Core services van parse/update `submission.DataJson`.
- SDK van expose `DataJson` la DTO chinh, chua co `Data`/`Fields` canonical.
- Reports/search/direct SQL van doc `DataJson`, se sai voi submission moi bi collapse ve `{}`.
- Workflow/API `UpdateData` update `DataJson` nhung khong update typed rows, tao nguy co divergence.
- Oqtane EF model co indexes cho typed tables, nhung chua thay fluent FK/cascade relation; trong khi comment noi Oqtane schema tao tu EF model, khong chay migration `Up()`.

Ket luan san pham:

> Co nen typed storage. Chua nen noi source da chuyen xong sang cach luu Umbraco/no-DataJson. Nen goi la "typed storage Phase 1 for Oqtane, with DataJson hydration compatibility bridge".

## 2. Files/areas da review

Core:

- `MegaForm.Core/Interfaces/ISubmissionDataStore.cs`
- `MegaForm.Core/Models/TypedSubmissionEntities.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionDataReconstructor.cs`
- `MegaForm.Core/Services/TypedSubmission/SubmissionDataDocument.cs`
- `MegaForm.Core/Services/TypedSubmission/LegacySubmissionBackfillService.cs`
- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/SubmissionQueryService.cs`
- `MegaForm.Core/Interfaces/ICoreInterfaces.cs`
- Multiple DataJson readers in Core services.

Oqtane:

- `MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs`
- `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs`
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs`
- `MegaForm.Oqtane.Server/Migrations/01060039_AddTypedSubmissionStorage.cs`
- `MegaForm.Oqtane.Server/Services/Startup.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs`

SDK:

- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs`

DNN/Umbraco:

- `MegaForm.DNN/Services/DnnServiceLocator.cs`
- `MegaForm.Dnn/Data/*`
- `MegaForm.Dnn/WebApi/*`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Umbraco/Data/*`
- `MegaForm.Umbraco/Controllers/*`

Reference handout:

- `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`

## 3. What is good / da dung huong

### 3.1 Core abstraction da co

`ISubmissionDataStore` co API chinh:

- `GetData(int submissionId)`
- `GetFields(int submissionId)`
- typed value getters
- `InsertFields`
- `ReplaceFields`
- `DeleteFields`
- `HasFields`

Day la dung huong vi tach storage moi khoi `ISubmissionRepository` cu. Host co the implement bang EF/ADO.NET/stored procedures.

### 3.2 Table model moi giong Umbraco Forms typed-value design

Core typed entities dung mo hinh:

- `SubmissionFieldRecord` = one row per logical submitted field.
- `SubmissionValueStringRecord`
- `SubmissionValueLongTextRecord`
- `SubmissionValueNumberRecord`
- `SubmissionValueDateRecord`
- `SubmissionValueBooleanRecord`
- `SubmissionValueJsonRecord`

Day la dung voi muc tieu "record master + record fields + typed value tables".

### 3.3 Normalizer/reconstructor da co nen tot

`SubmissionFieldNormalizer`:

- Map field type -> canonical data type.
- Snapshot label/type/order/page.
- Skip non-data fields: Html/Section/Captcha/Row.
- Tach value thanh string/longtext/number/date/boolean/json rows.
- Da fix checkbox group: checkbox co options -> string multi-value, checkbox toggle -> boolean.
- Number/date co fallback sang string neu parse fail, tranh mat du lieu khi DataJson off.

`SubmissionDataReconstructor`:

- Rebuild `Dictionary<string, object>` tu typed rows.
- Multi-value collapse thanh list.
- Json row parse ve `JToken/JArray` khi co the.

### 3.4 Oqtane store da implement kha day du

`EfSubmissionDataStore`:

- `ReplaceFields` delete-then-insert trong transaction.
- `InsertFieldsCore` insert fields truoc de lay identity `SubmissionFieldId`, sau do insert typed value rows.
- `GetData` bulk-read 6 typed value tables theo `SubmissionId`, tranh N+1.
- `DeleteFields` xoa value rows + field rows.

### 3.5 Oqtane submit da ghi typed rows

`SubmissionProcessor` co optional `ISubmissionDataStore typedStore`. Khi Oqtane register store, submit flow:

1. Insert `MF_Submissions` voi DataJson full ban dau.
2. Insert legacy snapshots / flat report index.
3. Normalize form data.
4. `_typedStore.ReplaceFields(...)`.
5. Neu typed write thanh cong, `_subRepo.UpdateData(submissionId, "{}")`.

Ordering nay co safety: neu typed write fail thi DataJson full van con, khong mat submission.

## 4. Findings / gaps

### P0 - Chua phai full no-DataJson runtime

Muc tieu handout la:

> Runtime moi KHONG parse `submission.DataJson` de workflow/email/webhook/dashboard.

Source hien tai chua dat. Cac areas van doc/parse `DataJson`:

- `SubmissionQueryService.GetDetail` / `ToListItem`
- `WorkflowEngine`
- `EmailNotificationService`
- `WebhookService`
- `AdminRecordShellService`
- `DataRepeaterService`
- `FieldOptionsService`
- `EmailSummaryService`
- `ConfiguredAppStarterService`
- Blog services
- DNN/Oqtane/Umbraco controllers/reports.

Vi vay source hien tai van phu thuoc bridge "hydrate DataJson tu typed rows" thay vi chuyen reader sang typed store.

Impact:

- Bat ky code nao khong di qua Oqtane repository hydration se thay `{}`.
- Future switch sang typed rows se de lo nhieu stale/missing path.
- Khach external SDK van phai parse JSON.

### P0 - DNN va Umbraco chua co typed storage

Oqtane register:

- `services.AddScoped<ISubmissionDataStore, EfSubmissionDataStore>()`

Nhung DNN va Umbraco khong co implementation/registration typed store:

- DNN `DnnServiceLocator` construct `SubmissionProcessor` khong truyen typed store.
- Umbraco `MegaFormComposer` register `SubmissionProcessor`, `SubmissionQueryService`, nhung khong register `ISubmissionDataStore`.
- `rg` khong thay `MF_SubmissionFields` / `SubmissionFieldRecord` trong DNN/Umbraco schema.

Impact:

- DNN/Umbraco van ghi `DataJson` nhu cu.
- Feature parity cross-host chua dat.
- Neu Core services bat dau gia dinh typed rows ton tai se break DNN/Umbraco.

### P0 - UpdateData/workflow lam typed rows stale

Core interface cu van la:

- `ISubmissionRepository.UpdateData(int submissionId, string dataJson)`

Nhieu luong van update `DataJson`:

- `WorkflowEngine` parse `submission.DataJson`, sua field, roi `_subRepo.UpdateData(...)`.
- Oqtane `Submissions/UpdateData` endpoint goi `_subRepo.UpdateData(...)`.
- Blog/configured starter/external services co cac path tuong tu.

Typed rows khong duoc update trong cac path nay.

Impact:

- Sau submit Oqtane, typed rows la source ban dau.
- Neu workflow/API update DataJson, DataJson va typed rows divergence.
- Repository hydration chi reconstruct khi DataJson empty/`{}`; neu workflow ghi DataJson full, typed rows cu se bi bo qua.
- Khi reports/API sau nay chuyen sang typed rows, no co the doc du lieu cu, khong thay workflow mutation.

Bat buoc can API moi:

- `SetField`
- `ReplaceFields`
- `UpdateFields`
- `ApplyFieldPatch`

Va `UpdateData` phai duoc deprecate/route qua typed store.

### P0 - Search va reports van dung DataJson, se sai voi new Oqtane submissions

Oqtane repository list:

- predicate search van `s.DataJson.Contains(search)`.
- hydration chi chay sau khi query xong page rows.

Oqtane reports direct DB:

- `MegaFormController.Reports.cs` select `DataJson` truc tiep cho completion/report paths.

DNN/Umbraco reports cung con direct `DataJson`.

Impact:

- New Oqtane submissions co `DataJson = "{}"` se khong match search theo field value.
- Completion % / report preview/export dung direct DataJson se thieu/sai.
- Bat ky feature direct SQL vao `MF_Submissions.DataJson` se mat data moi.

Can chuyen:

- Search -> typed value joins.
- Completion -> `MF_SubmissionFields.HasValue` + schema/field snapshot.
- Reports CSV/export -> typed rows.

### P1 - Oqtane EF model co the khong tao FK/cascade tren fresh install

Migration `01060039_AddTypedSubmissionStorage` co FK/cascade:

- `MF_SubmissionFields -> MF_Submissions`
- `MF_SubmissionValue* -> MF_SubmissionFields`

Nhung comment noi Oqtane "builds schema from EF model via GenerateCreateScript, not migration Up". Trong `MegaFormDbContext` mapping hien co:

- DbSet + table + indexes.
- Khong thay fluent relation `HasOne/WithMany/HasForeignKey/OnDelete`.
- `rg HasOne|OnDelete` trong DbContext khong thay cho typed tables.

Neu EF model khong discover relationship vi khong co navigation properties, fresh Oqtane schema co the co tables/indexes nhung thieu FK/cascade.

Impact:

- `EfSubmissionRepository.Delete/BulkDelete` chi xoa `MF_Submissions`.
- Neu DB khong co cascade, `MF_SubmissionFields`/typed value rows bi orphan.
- Store co `DeleteFields`, nhung repository delete khong goi no.

Can verify bang live DB:

- `sys.foreign_keys` / SQLite pragma FK list.

Can fix:

- Add explicit fluent FK/cascade in EF model.
- Or repository `Delete/BulkDelete` goi `_typedStore.DeleteFields` truoc khi xoa submissions.

### P1 - SDK contract chua chuyen sang typed data

`MegaForm.Sdk/Dtos.cs`:

- `SubmissionDto` van co `DataJson`.
- `SubmissionListItemDto` van co `DataJson`.
- `SubmissionDetailDto` co `Values` va `FieldSnapshots`, nhung chua co canonical `Data` dictionary hoac `Fields` typed values.

Impact:

- Customer viet dashboard/card/grid/inbox van phai parse raw JSON hoac dung display snapshot.
- Chua dat muc tieu "SDK/API expose typed/dictionary field data".

Can add:

- `SubmissionDto.Data`
- `SubmissionDto.Fields`
- `SubmissionFieldDto`
- `SubmissionTypedValueDto`
- Mark `DataJson` obsolete/legacy.

### P1 - Backfill service co, nhung chua duoc wire thanh host command/job

`LegacySubmissionBackfillService` da co va idempotent ve y tuong. Nhung chua thay:

- Oqtane endpoint/hosted job/CLI de chay backfill.
- Umbraco/DNN implementation `ILegacySubmissionSource`.
- Migration marker column nhu `MigratedToTypedOnUtc`.
- Verification report counts/hash.

Impact:

- Existing submissions chua duoc convert.
- Neu collapse/readers chuyen typed-only ma chua backfill, du lieu cu mat khoi UI/report.

### P1 - Core `SubmissionQueryService` co typed preview nhung Oqtane khong su dung

`SubmissionQueryService` co `GetDetailTyped`, nhung:

- Oqtane controller construct service bang `new SubmissionQueryService(_subRepo, _formRepo, fileRepo)` khong truyen typed store.
- Controller endpoints dang goi `GetDetail`, khong goi `GetDetailTyped`.
- Umbraco DI co `AddScoped<SubmissionQueryService>()`, nhung khong co typed store.

Impact:

- Typed read path chua that su duoc dung lam canonical detail API.
- Hydration bridge che lap van de trong test/QA.

### P1 - Target schema con thieu cac bang/cot quan trong

Handout target co:

- `MF_FormSchemaVersions`
- `MF_FormFields`
- `SubmissionKey`
- `FormKey`
- `SchemaVersion`
- `ContentId/ContentKey/MemberKey/Culture`
- `MF_SubmissionAudit`
- file linkage `SubmissionFieldId`

Source hien tai chua thay cac phan tren trong typed-storage changes.

Impact:

- Old submissions co the render theo current schema, khong co schema version snapshot.
- Multi-site/member/content filtering chua native.
- Workflow/inbox audit field mutation chua du.
- File field values chua duoc link typed field-level.

### P2 - Normalizer/reconstructor can test them voi payload that

Da co unit tests tot cho checkbox/number/date/multiselect/json co ban. Can bo sung:

- `System.Text.Json.JsonElement` payload tu ASP.NET endpoints.
- JArray/JObject multi object array.
- File upload metadata.
- Signature/Terms/Address/FullName/PhoneIntl/Appointment.
- Empty values vs missing fields.
- Duplicate field keys.
- Sensitive fields.
- Culture-specific date/decimal.

Reason:

- Khi DataJson off, normalizer/reconstructor la duong du lieu duy nhat. Bat ky edge case nao o day se thanh data loss.

### P2 - Comments/handoff khong dong nhat voi source

`CLAUDE_HANDOFF_20260717_TYPED_STORAGE_PHASE1_OQTANE.md` noi:

- DataJson van written song song.
- Readers still use DataJson.
- Phase 1 write-only.

Nhung `SubmissionProcessor` hien tai collapse `DataJson` ve `{}` sau typed write thanh cong.

Impact:

- Nguoi tiep tuc code co the hieu sai state.
- QA plan dua vao handoff co the khong bat loi direct DataJson readers.

Can cap nhat handoff/doc hoac ghi release note ro:

- "Oqtane new submissions may have DataJson collapsed to `{}`; repository hydration is required for legacy readers."

## 5. Acceptance matrix

| Requirement from handout | Current source status | Audit result |
|---|---|---|
| Typed field/value tables | Oqtane yes; Core entities yes | Partial pass |
| DNN/Oqtane/Umbraco all hosts | Only Oqtane registered | Fail |
| Runtime no longer parses DataJson | Many services still parse DataJson | Fail |
| New submit does not need meaningful DataJson | Oqtane partial via collapse; DNN/Umbraco no | Partial/fail |
| SDK exposes Data/Fields typed | Still DataJson-centric | Fail |
| Search/filter uses typed values | Search still DataJson.Contains | Fail |
| Reports/CSV use typed rows | Many report paths still DataJson/MF_SubmissionValues | Fail |
| Backfill old DataJson | Service exists, not wired | Partial |
| Delete cascades typed rows | Migration has FK, EF model likely lacks explicit FK; repo not explicit | Risk |
| Workflow/inbox updates typed rows | UpdateData still JSON-only | Fail |

## 6. Recommended next steps

### Step 1 - Stabilize Oqtane typed source of truth

- Decide: keep `DataJson` full until readers are switched, or require hydration everywhere.
- If keeping collapse `{}`, immediately switch all Oqtane direct readers/search/report paths away from `DataJson`.
- Add explicit FK/cascade to Oqtane EF model or explicit delete cleanup.
- Add integration test or SQL check for FKs.

### Step 2 - Add typed Update API

- Add `ISubmissionDataStore.SetField/SetFields/PatchFields`.
- Change `ISubmissionRepository.UpdateData` callers to use typed update path.
- Keep `UpdateData` as legacy wrapper that updates typed rows and optional compatibility JSON.

### Step 3 - Switch Core readers

Order:

1. `SubmissionQueryService`
2. `AdminRecordShellService`
3. `EmailNotificationService`
4. `WebhookService`
5. `WorkflowEngine`
6. `DataRepeaterService`
7. `FieldOptionsService`
8. Reports/controllers
9. Starters/blog/payment paths

### Step 4 - Implement DNN and Umbraco stores

DNN:

- SQL upgrade script for `MF_SubmissionFields` + typed value tables.
- ADO.NET `DnnSubmissionDataStore`.
- Register in `DnnServiceLocator`.
- Ensure `InsertValues` no longer no-op for new typed path.

Umbraco:

- Add typed DbSets to `MegaFormDbContext`.
- Add schema migration via Umbraco migration system.
- Implement/register `UmbracoSubmissionDataStore`.
- Update `UmbracoDatabaseSchemaBootstrapper` provider-specific schema checks.

### Step 5 - SDK/API

- Add `SubmissionDto.Data`.
- Add `SubmissionDto.Fields`.
- Add typed field/value DTOs.
- Mark `DataJson` obsolete.
- Add `Submissions/UpdateFields`.

### Step 6 - Backfill and verify

- Wire `LegacySubmissionBackfillService` per host.
- Add `ILegacySubmissionSource` implementations.
- Add batch progress/audit.
- Verify counts:
  - submissions migrated
  - field rows per submission
  - typed value row counts
  - report/search parity before/after.

## 7. Final verdict

Source hien tai la mot buoc tot va co nen mong dung:

- Core abstraction: good.
- Oqtane typed table/store: good.
- Normalizer/reconstructor/backfill foundation: good.

Nhung no chua phai conversion xong. Day la:

> Oqtane typed storage pilot with compatibility hydration.

Truoc khi goi la "MegaForm da chuyen sang kieu Umbraco/no-DataJson", can hoan thanh:

1. DNN + Umbraco typed stores.
2. Reader switch khoi `DataJson`.
3. Typed update path cho workflow/inbox/API.
4. SDK typed data contract.
5. Backfill host commands.
6. Search/report typed joins.
7. FK/cascade verification.

