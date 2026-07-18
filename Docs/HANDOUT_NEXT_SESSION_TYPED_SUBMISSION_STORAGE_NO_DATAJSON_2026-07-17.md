# HANDOUT PHIEN SAU: Chuyen MegaForm sang typed submission storage kieu Umbraco Forms, `DataJson` chi con legacy

Date: 2026-07-17  
Scope: Technical handout only. Muc tieu phien sau la refactor storage/runtime de MegaForm khong con dung `DataJson` lam payload chinh. `DataJson` chi duoc xem la legacy migration input/cache tam thoi, khong phai contract moi.

## 1. Muc tieu

Chuyen MegaForm tu model hien tai:

```text
MF_Submissions.DataJson = canonical payload
MF_SubmissionValues = flat index/report helper
```

sang model moi gan voi cach Umbraco Forms luu record:

```text
MF_Submissions = record master only
MF_SubmissionFields = one row per submitted field
MF_SubmissionValue* = typed value tables
DataJson = legacy only, not runtime source of truth
```

Definition:

- Runtime moi KHONG parse `submission.DataJson` de workflow/email/webhook/dashboard.
- Submit moi KHONG can ghi `DataJson` de chay dung.
- SDK/API moi expose typed/dictionary field data, khong yeu cau client doc raw JSON.
- Backfill tool co the doc `DataJson` cu de migrate sang typed rows.
- Physical column `DataJson` co the ton tai 1-2 release de migration/compat, nhung phai bi coi la deprecated/legacy.

## 2. Ly do chuyen doi

`DataJson` dang lam MegaForm linh hoat, nhung tao 5 van de lon:

1. Dashboard/filter/report phai parse JSON hoac search non-sargable.
2. Workflow/email/webhook bi phu thuoc raw JSON shape.
3. SDK khach hang phai tu parse data, kho viet card/grid/inbox generic.
4. Umbraco-native storage/Entries-style query can row-based values.
5. Insert into SQL / external ERP/CRM mapping can field-level metadata ro hon.

Huong typed row storage giup:

- Query theo field nhanh hon.
- Dashboard/inbox generic hon.
- Co field metadata snapshot tai thoi diem submit.
- De bridge sang Umbraco Forms typed values neu can.
- De enforce retention/audit/cascade ro rang.

## 3. Current blast radius can nho

Quick scan 2026-07-17:

- `DataJson` xuat hien it nhat 47 source files trong Core/SDK/Umbraco/DNN, chua tinh full docs/logs.
- Oqtane cung bám rat nhieu trong controller/report/repository/shared model/migrations.

Files/areas can audit khi vao phien sau:

Core:

- `MegaForm.Core/Models/EntityModels.cs`
- `MegaForm.Core/Models/SubmissionQueryModels.cs`
- `MegaForm.Core/Models/ReportDefinition.cs`
- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/SubmissionQueryService.cs`
- `MegaForm.Core/Services/SubmissionIndexerService.cs`
- `MegaForm.Core/Services/WorkflowEngine.cs`
- `MegaForm.Core/Services/EmailNotificationService.cs`
- `MegaForm.Core/Services/WebhookService.cs`
- `MegaForm.Core/Services/DataRepeaterService.cs`
- `MegaForm.Core/Services/FieldOptionsService.cs`
- `MegaForm.Core/Services/AdminRecordShellService.cs`
- `MegaForm.Core/Services/PaymentSubmissionVerifier.cs`
- `MegaForm.Core/Services/Starters/*`
- `MegaForm.Core/Services/ExternalTable/*`
- `MegaForm.Core/Services/Blog/*`

SDK:

- `MegaForm.Sdk/Dtos.cs`
- `MegaForm.Sdk/MegaFormClient.cs`
- `MegaForm.Sdk/PublicAPI.Unshipped.txt`
- `MegaForm.Sdk.Tests/*`

Umbraco:

- `MegaForm.Umbraco/Data/MegaFormDbContext.cs`
- `MegaForm.Umbraco/Data/EfRepositories.cs`
- `MegaForm.Umbraco/Controllers/MegaFormApiController.cs`
- `MegaForm.Umbraco/Controllers/MegaFormApiController.SubmissionExtras.cs`
- `MegaForm.Umbraco/Controllers/ReportsController.cs`
- `MegaForm.Umbraco/Migrations/*`

Oqtane:

- `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs`
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs`
- `MegaForm.Oqtane.Server/Migrations/EntityBuilders/SubmissionEntityBuilder.cs`
- `MegaForm.Oqtane.Server/Migrations/EntityBuilders/SubmissionValueEntityBuilder.cs`
- `MegaForm.Oqtane.Server/Migrations/01060030_AddReporting.cs`
- `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`
- `MegaForm.Oqtane.Client/SdkDemoView.razor`

DNN:

- `MegaForm.Dnn/Data/FormRepository.cs`
- `MegaForm.Dnn/Data/DnnRepositories.cs`
- `MegaForm.Dnn/Data/DnnRepositoryAdapters.cs`
- `MegaForm.Dnn/Data/Phase2Repository.cs`
- `MegaForm.Dnn/Views/FormView.ascx.cs`
- `MegaForm.Dnn/Views/FormViewOld.ascx.cs`

## 4. Target storage design

### 4.1 Record master

Keep `MF_Submissions` as master record table.

Target columns:

- `SubmissionId` int identity / host-compatible id
- `SubmissionKey` uniqueidentifier/guid, stable cross-env id
- `FormId`
- `FormKey` nullable/guid if added to `MF_Forms`
- `ModuleId`
- `UserId`
- `MemberKey` nullable string/guid
- `ContentId` nullable int
- `ContentKey` nullable guid/string
- `RootContentId` nullable int
- `Culture`
- `Status`
- `SubmittedOnUtc`
- `UpdatedOnUtc`
- `IpAddress`
- `UserAgent`
- `SourceHost` / platform optional
- `SchemaVersion` / `FormVersion`
- `LegacyDataJson` or existing `DataJson` nullable, deprecated, migration only

Important rule:

- New runtime must not need `DataJson`.
- If column stays named `DataJson`, add comments/docs/tests that no new code reads it except migration/backfill.

### 4.2 Record field rows

Create new `MF_SubmissionFields` or evolve `MF_SubmissionValues` into explicit record-field table.

Recommended new table:

```text
MF_SubmissionFields
  SubmissionFieldId bigint/int identity PK
  SubmissionId int FK -> MF_Submissions cascade
  FormId int not null
  FieldKey nvarchar(256) not null
  FieldId uniqueidentifier/string nullable
  FieldAlias nvarchar(256) nullable
  FieldType nvarchar(128) nullable
  DataType nvarchar(64) not null
  LabelSnapshot nvarchar(512) nullable
  PageIndex int nullable
  FieldOrder int nullable
  DisplayValue nvarchar(max) nullable
  RawValueHash nvarchar(128) nullable
  CreatedOnUtc datetime
```

Indexes:

- `(SubmissionId, FieldKey)`
- `(FormId, FieldKey)`
- `(FormId, DataType)`
- `(FormId, FieldKey, SubmissionId)`

Purpose:

- One row per logical submitted field.
- Stores field metadata snapshot so old submissions still display correctly after form schema changes.
- Does not store all typed values directly unless using simplified design.

### 4.3 Typed value tables

Umbraco Forms-style typed value storage:

```text
MF_SubmissionValueString
  Id
  SubmissionFieldId FK
  Ordinal int
  Value nvarchar(1024)

MF_SubmissionValueLongText
  Id
  SubmissionFieldId FK
  Ordinal int
  Value nvarchar(max)

MF_SubmissionValueNumber
  Id
  SubmissionFieldId FK
  Ordinal int
  Value decimal(18, 6)

MF_SubmissionValueDate
  Id
  SubmissionFieldId FK
  Ordinal int
  Value datetimeoffset/datetime

MF_SubmissionValueBoolean
  Id
  SubmissionFieldId FK
  Ordinal int
  Value bit/bool

MF_SubmissionValueJson
  Id
  SubmissionFieldId FK
  Ordinal int
  Value nvarchar(max)
```

Why keep `Json` typed table?

- Composite controls, repeater rows, file metadata, signature payload, address object, consent audit, calculator arrays can still need structured value.
- This is not `DataJson`; it is field-scoped typed value.
- Queryable fields should still write normalized string/number/date/bool rows when possible.

Indexes:

- Value string exact/search indexes where provider supports.
- `(Value)` indexes for number/date/bool.
- `(SubmissionFieldId, Ordinal)` unique or non-unique depending multi-value rules.

### 4.4 Transitional compatibility view

Optional but useful:

- Keep old `MF_SubmissionValues` as compatibility/index view during migration, or map it to new field/value tables.
- Do not keep it as source of truth if the target is true Umbraco-style typed storage.

## 5. New Core abstractions

Add these before touching all services:

```csharp
public interface ISubmissionDataStore
{
    SubmissionDataDocument GetData(int submissionId);
    IReadOnlyList<SubmissionFieldRecord> GetFields(int submissionId);
    void InsertFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields);
    void ReplaceFields(int submissionId, int formId, IEnumerable<SubmissionFieldWrite> fields);
    void DeleteFields(int submissionId);
}
```

```csharp
public sealed class SubmissionDataDocument
{
    public int SubmissionId { get; set; }
    public int FormId { get; set; }
    public Dictionary<string, object> Data { get; set; }
    public IReadOnlyList<SubmissionFieldRecord> Fields { get; set; }
}
```

```csharp
public sealed class SubmissionFieldWrite
{
    public string FieldKey { get; set; }
    public string FieldId { get; set; }
    public string FieldAlias { get; set; }
    public string FieldType { get; set; }
    public string DataType { get; set; }
    public string LabelSnapshot { get; set; }
    public object Value { get; set; }
    public string DisplayValue { get; set; }
    public int? PageIndex { get; set; }
    public int? FieldOrder { get; set; }
}
```

Rules:

- All Core services must use `ISubmissionDataStore`, not `submission.DataJson`.
- `SubmissionProcessor` writes record master first, then field rows inside same transaction where host supports.
- `WorkflowEngine` field updates call `ReplaceFields` or `SetField`, not `UpdateData`.
- `SubmissionQueryService` reconstructs `Data` from typed rows.

## 6. Refactor phases

### Phase 0 - Freeze and tests before surgery

Before changing storage:

- Add/identify tests for submit, dashboard list, detail, workflow approve/reject, email, webhook, data repeater, report CSV, file upload, draft resume, SQL insert/external table.
- Capture sample forms:
  - text/email/number/date/bool
  - multi-select/checkbox list
  - file upload
  - signature
  - composite/address/terms
  - workflow/inbox form
  - SQL insert form

Do not start deleting `DataJson` until these paths are covered.

### Phase 1 - Schema and repositories

Implement new typed tables in all hosts:

- Oqtane EF migrations/entity builders.
- Umbraco EF/Umbraco migration.
- DNN SQL install/upgrade scripts/repositories.

Add repositories:

- `ISubmissionDataStore`
- EF implementation for Oqtane/Umbraco.
- ADO.NET implementation for DNN or adapter over existing repo.

Deliverable:

- New tables created.
- Can insert/get typed field rows manually in tests.
- Existing app still runs.

### Phase 2 - Backfill/reindex legacy `DataJson`

Build a migration/reindex service:

```text
For each MF_Submissions row with legacy DataJson:
  load form schema snapshot/current schema
  parse DataJson
  flatten fields using MegaFormUtils/SubmissionIndexer logic
  write MF_SubmissionFields + typed value rows
  mark migrated timestamp/version
```

Important:

- Must be idempotent.
- Must support batching.
- Must log malformed JSON.
- Must not delete original `DataJson` in same migration.
- Must verify counts: submissions count, fields count, non-empty values count.

Deliverable:

- Existing submissions can display from typed rows.
- Re-running reindex does not duplicate rows.

### Phase 3 - Switch submit writer

Modify `SubmissionProcessor`:

- Validate incoming `Dictionary<string, object>` as today.
- Create `SubmissionInfo` master without requiring `DataJson`.
- Normalize field values using schema.
- Write typed field rows.
- Stop writing `DataJson` for new submissions, or write `{}` only behind legacy flag.

Remove dependency on:

- `_subRepo.InsertValues` as optional flat helper if replaced.
- `SubmissionInfo.DataJson` in the successful path.

Deliverable:

- New form submit works with `DataJson = null` or `{}`.
- Dashboard/detail/email/workflow still work after readers are switched.

### Phase 4 - Replace readers service-by-service

Replace direct `DataJson` reads in this order:

1. `SubmissionQueryService`
2. `AdminRecordShellService`
3. Dashboard/list/detail controllers in Oqtane/Umbraco/DNN
4. `WorkflowEngine`
5. `EmailNotificationService`
6. `WebhookService`
7. `DataRepeaterService`
8. `FieldOptionsService`
9. Reports/controllers
10. Starter/blog/payment/external table flows

Pattern:

```text
Before:
  JsonConvert.DeserializeObject<Dictionary<string, object>>(submission.DataJson)

After:
  dataStore.GetData(submission.SubmissionId).Data
```

Deliverable:

- `rg "DataJson"` should show only migration/legacy/docs/model compatibility references, not runtime service reads.

### Phase 5 - SDK/API contract

Add new DTOs:

```csharp
public sealed class SubmissionDto
{
    public int SubmissionId { get; set; }
    public Guid? SubmissionKey { get; set; }
    public int FormId { get; set; }
    public string Status { get; set; }
    public DateTime SubmittedOnUtc { get; set; }
    public Dictionary<string, object> Data { get; set; }
    public IReadOnlyList<SubmissionFieldDto> Fields { get; set; }

    [Obsolete("Legacy snapshot only. Use Data/Fields.")]
    public string DataJson { get; set; }
}
```

Better:

- Keep `DataJson` for binary/source compatibility only.
- Set it null/empty by default.
- Add `SubmissionFieldDto` with `FieldKey`, `DataType`, `DisplayValue`, typed values.
- Update OpenAPI/docs.

API endpoints:

- `Submissions/Get` returns typed data.
- `Submissions/Find` returns list item with summary + selected fields, not raw JSON.
- `Submissions/UpdateData` should be deprecated/replaced by `Submissions/UpdateFields`.

Deliverable:

- Customer can build card/grid/inbox without parsing raw JSON.

### Phase 6 - Remove legacy runtime writes

After all readers switched:

- `SubmissionProcessor` does not set `DataJson`.
- Repositories do not require `DataJson` non-null.
- Oqtane `NullStringNormalizer` no longer treats DataJson as runtime required.
- DNN `InsertValues` cannot be no-op anymore.
- Search no longer uses `DataJson.Contains`.

Deliverable:

- New submission rows can have `DataJson` null/empty.
- No runtime behavior changes.

### Phase 7 - Final cleanup

Only after migration and release window:

- Rename column to `LegacyDataJson` or leave deprecated.
- Remove public docs encouraging `DataJson`.
- Optionally drop column in major version only.
- Keep import tool for legacy packages.

## 7. Special areas to not forget

### Drafts/prefill

`MF_SavedDrafts.DataJson` and DNN/Oqtane form views use draft JSON/prefill.

Decision needed:

- Either keep draft JSON separate because draft is not final record.
- Or add `MF_DraftFields` typed storage too.

Recommendation:

- Phase 1 focus submissions.
- Phase 2.5 add draft typed storage if "no DataJson anywhere" is strict.
- If draft JSON remains, name it separately as draft payload, not submission storage.

### File uploads

File values should store:

- `MF_Files` as file metadata/blob reference.
- Submission field value should store file id/key(s), not full file JSON only.
- DisplayValue can hold file name list.

### Composite widgets

Composite values should write both:

- Field-scoped JSON object in `MF_SubmissionValueJson`.
- Queryable sub-values where useful, using synthetic keys:
  - `address.city`
  - `address.country`
  - `name.first`
  - `name.last`

### Workflow field mutations

Today workflow can parse JSON, modify a field, and `UpdateData`.

New model needs:

- `SetField(submissionId, fieldKey, value)`
- `AppendAuditField` or workflow metadata table
- Transaction with workflow task state changes

### Reports completion percentage

Oqtane reports currently sample `DataJson` for completion percent because flat index could not reproduce all fields byte-identically.

New model must store enough field metadata:

- field present/missing
- empty/non-empty
- field order/page
- field type

Then completion percent can be computed from typed rows + schema snapshot.

### SQL insert / external table

External SQL insert must read typed data document, not raw JSON.

Need support:

- field mapper
- typed conversions
- null handling
- multi-value strategy
- error audit/retry

## 8. Acceptance criteria

Storage:

- New submissions write `MF_SubmissionFields` + typed value rows.
- New submissions do not require meaningful `MF_Submissions.DataJson`.
- Existing submissions are backfilled idempotently.
- Delete/bulk delete cascades typed values/files/workflow references.

Runtime:

- Submit works on DNN, Oqtane, Umbraco.
- Dashboard card/grid/detail view works without parsing `DataJson`.
- Inbox approve/reject/forward/attach workflow works.
- Email/webhook payloads reconstruct field dictionary from typed rows.
- Reports and CSV export use typed rows.
- Search/filter by field uses indexes, not JSON LIKE.

SDK/API:

- Client can build dashboard/inbox with `SubmissionDto.Data` and `SubmissionDto.Fields`.
- `DataJson` is deprecated/empty/legacy only.
- `Submissions/UpdateFields` exists or equivalent.

Verification:

- `rg "DataJson" MegaForm.Core MegaForm.Sdk MegaForm.Umbraco MegaForm.Oqtane.Server MegaForm.Dnn` should show only:
  - migration/backfill
  - legacy DTO compatibility
  - obsolete comments/docs
  - optional draft legacy if explicitly deferred

## 9. Risk and mitigation

Risk: Big bang rewrite breaks all hosts.

Mitigation:

- Add abstraction first.
- Backfill before switching readers.
- Switch one service at a time.
- Keep legacy column until all tests pass.

Risk: Form schema changes make old submissions impossible to render.

Mitigation:

- Store field label/type/order snapshot in `MF_SubmissionFields`.
- Keep form version/schema version on submission.

Risk: Multi-value/composite controls lose information.

Mitigation:

- Use typed rows for queryable parts.
- Use field-scoped `MF_SubmissionValueJson` for complex payload.

Risk: SDK breaking change.

Mitigation:

- Add `Data`/`Fields` first.
- Obsolete `DataJson`, do not remove until major version.

Risk: DNN lags because existing adapters treat `InsertValues` as no-op.

Mitigation:

- Make DNN typed value store P0, not optional.
- Add DNN tests before switching Core services.

## 10. Concrete first tasks for next session

1. Create branch/commit checkpoint before storage refactor.
2. Add `ISubmissionDataStore` models/interfaces in Core.
3. Add typed table entities/migrations for Oqtane and Umbraco.
4. Add DNN SQL schema upgrade for typed tables.
5. Implement typed data store for Oqtane first, then Umbraco, then DNN.
6. Build backfill/reindex command/service from legacy `DataJson`.
7. Change `SubmissionQueryService` to read from typed store.
8. Change `SubmissionProcessor` to write typed store.
9. Update SDK DTOs with `Data`/`Fields`, obsolete `DataJson`.
10. Run `rg DataJson` and burn down remaining runtime references.

## 11. Non-goals for first implementation

- Do not implement full Umbraco Forms bridge in the same pass.
- Do not drop `DataJson` physical column immediately.
- Do not rewrite form schema builder.
- Do not change workflow product semantics.
- Do not create one SQL table per form.

## 12. Product decision

The new storage should be described as:

> MegaForm typed submission storage, inspired by Umbraco Forms record/value design, cross-platform for DNN/Oqtane/Umbraco.

Not:

> MegaForm now uses Umbraco Forms tables directly.

Unless a separate bridge is later implemented, MegaForm still owns its storage. The change is architectural: no raw `DataJson` as runtime source of truth.

## 13. Target SQL table architecture

### 13.1 High-level map

Old model:

```text
MF_Forms
  SchemaJson / SettingsJson / ThemeJson / WorkflowJson

MF_Submissions
  SubmissionId / FormId / Status / SubmittedOnUtc / DataJson

MF_SubmissionValues
  SubmissionId / FieldKey / ValueText / ValueNumber / ValueDate
```

New model:

```text
MF_Forms
  form definition master

MF_FormSchemaVersions          optional but recommended
  immutable schema snapshot per published version

MF_FormFields                  optional normalized current field catalog
  one row per current form field

MF_Submissions
  record master, no business field payload

MF_SubmissionFields
  one row per submitted logical field, with field metadata snapshot

MF_SubmissionValueString
MF_SubmissionValueLongText
MF_SubmissionValueNumber
MF_SubmissionValueDate
MF_SubmissionValueBoolean
MF_SubmissionValueJson
  typed value rows

MF_Files
  file metadata, linked to submission/field

MF_SubmissionAudit             recommended
  field/status/workflow data changes

MF_Submissions.DataJson
  legacy only, nullable/deprecated, not source of truth
```

Important: khong tao SQL table rieng cho tung form. Moi form/schema dung chung bo bang typed storage.

### 13.2 `MF_Forms` - form master

Keep existing table, add stable keys/versioning.

Recommended columns:

```text
FormId int PK
FormKey uniqueidentifier not null unique
PortalId int null
ModuleId int null
Title nvarchar(255)
Slug nvarchar(255)
Status nvarchar(50)
Locale nvarchar(20)
CurrentSchemaVersion int not null default 1
SchemaJson nvarchar(max)            -- still OK: this is form definition, not submission data
SettingsJson nvarchar(max)
ThemeJson nvarchar(max)
RulesJson nvarchar(max)
WorkflowJson nvarchar(max)
CreatedOnUtc datetime
UpdatedOnUtc datetime
```

Decision: do not remove `SchemaJson`. The refactor targets submission payload, not builder schema storage.

### 13.3 `MF_FormSchemaVersions` - immutable schema snapshot

Recommended because submissions must render correctly after a form is edited.

```text
SchemaVersionId bigint/int PK
FormId int not null FK -> MF_Forms
FormKey uniqueidentifier null
Version int not null
SchemaJson nvarchar(max) not null
SettingsJson nvarchar(max) null
RulesJson nvarchar(max) null
WorkflowJson nvarchar(max) null
SchemaHash nvarchar(128) null
PublishedOnUtc datetime null
CreatedOnUtc datetime not null
```

Indexes:

```text
UX_MF_FormSchemaVersions_FormId_Version unique(FormId, Version)
IX_MF_FormSchemaVersions_FormId_PublishedOnUtc(FormId, PublishedOnUtc)
```

Use:

- `MF_Submissions.SchemaVersion` points to the schema version used at submit time.
- Backfill can use current schema if historical version does not exist.

### 13.4 `MF_FormFields` - normalized field catalog

Optional but useful for dashboard builders, field picker, SQL mapping, SDK schema.

```text
FormFieldId bigint/int PK
FormId int not null FK -> MF_Forms
SchemaVersion int null
FieldKey nvarchar(256) not null
FieldId uniqueidentifier/string null
Alias nvarchar(256) null
Label nvarchar(512) null
FieldType nvarchar(128) not null
DataType nvarchar(64) not null
PageIndex int null
FieldOrder int null
IsQueryable bit not null default 1
IsSensitive bit not null default 0
IsFile bit not null default 0
IsMultiValue bit not null default 0
SettingsJson nvarchar(max) null
CreatedOnUtc datetime
UpdatedOnUtc datetime
```

Indexes:

```text
UX_MF_FormFields_FormId_FieldKey unique(FormId, FieldKey)
IX_MF_FormFields_FormId_FieldOrder(FormId, PageIndex, FieldOrder)
IX_MF_FormFields_FormId_DataType(FormId, DataType)
```

Use:

- Field picker for reports/dashboard/inbox.
- Mapping field keys to SQL columns/ERP/CRM.
- Avoid reparsing `SchemaJson` for common operations.

### 13.5 `MF_Submissions` - record master only

This table should no longer store business field data.

```text
SubmissionId int PK
SubmissionKey uniqueidentifier not null unique
FormId int not null FK -> MF_Forms
FormKey uniqueidentifier null
SchemaVersion int null
ModuleId int null
UserId int null
MemberKey nvarchar(128) null
ContentId int null
ContentKey uniqueidentifier/string null
RootContentId int null
Culture nvarchar(20) null
Status nvarchar(50) not null
SubmittedOnUtc datetime not null
UpdatedOnUtc datetime null
IpAddress nvarchar(64) null
UserAgent nvarchar(512) null
IsSpam bit not null default 0
SpamScore decimal(9,4) null
LegacyDataJson nvarchar(max) null    -- or keep old DataJson column but deprecated
MigratedToTypedOnUtc datetime null
```

Indexes:

```text
IX_MF_Submissions_FormId_SubmittedOnUtc(FormId, SubmittedOnUtc)
IX_MF_Submissions_FormId_Status_SubmittedOnUtc(FormId, Status, SubmittedOnUtc)
IX_MF_Submissions_SubmissionKey(SubmissionKey)
IX_MF_Submissions_ContentId_FormId(ContentId, FormId)
IX_MF_Submissions_MemberKey_FormId(MemberKey, FormId)
```

Rule:

- New code must not read `LegacyDataJson` / `DataJson` except migration/compat endpoint.

### 13.6 `MF_SubmissionFields` - one row per submitted field

This is the central table replacing raw JSON payload.

```text
SubmissionFieldId bigint/int PK
SubmissionId int not null FK -> MF_Submissions cascade
FormId int not null
FormFieldId bigint/int null
FieldKey nvarchar(256) not null
FieldId uniqueidentifier/string null
FieldAlias nvarchar(256) null
FieldType nvarchar(128) null
DataType nvarchar(64) not null
LabelSnapshot nvarchar(512) null
PageIndex int null
FieldOrder int null
DisplayValue nvarchar(max) null
HasValue bit not null default 0
IsSensitive bit not null default 0
CreatedOnUtc datetime not null
UpdatedOnUtc datetime null
```

Indexes:

```text
UX_MF_SubmissionFields_Submission_FieldKey unique(SubmissionId, FieldKey)
IX_MF_SubmissionFields_Form_FieldKey(FormId, FieldKey)
IX_MF_SubmissionFields_SubmissionId(SubmissionId)
IX_MF_SubmissionFields_Form_DataType(FormId, DataType)
```

Use:

- Detail view: list fields by `SubmissionId`, ordered by `PageIndex`, `FieldOrder`.
- Dashboard: find field metadata and display values.
- Reports: join selected fields.
- Workflow/email/webhook: reconstruct dictionary from typed child rows.

### 13.7 Typed value tables

Each submitted field can have one or more typed values. Multi-select/file/composite can write multiple rows with `Ordinal`.

String:

```text
MF_SubmissionValueString
  Id bigint/int PK
  SubmissionFieldId bigint/int FK -> MF_SubmissionFields cascade
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value nvarchar(1024) null
```

Long text:

```text
MF_SubmissionValueLongText
  Id bigint/int PK
  SubmissionFieldId bigint/int FK
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value nvarchar(max) null
```

Number:

```text
MF_SubmissionValueNumber
  Id bigint/int PK
  SubmissionFieldId bigint/int FK
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value decimal(18,6) null
```

Date:

```text
MF_SubmissionValueDate
  Id bigint/int PK
  SubmissionFieldId bigint/int FK
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value datetimeoffset/datetime null
```

Boolean:

```text
MF_SubmissionValueBoolean
  Id bigint/int PK
  SubmissionFieldId bigint/int FK
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value bit not null
```

JSON field-scoped complex value:

```text
MF_SubmissionValueJson
  Id bigint/int PK
  SubmissionFieldId bigint/int FK
  SubmissionId int not null
  FormId int not null
  FieldKey nvarchar(256) not null
  Ordinal int not null default 0
  Value nvarchar(max) null
```

Recommended indexes:

```text
IX_*_SubmissionFieldId(SubmissionFieldId)
IX_*_SubmissionId(SubmissionId)
IX_*_Form_Field(FormId, FieldKey)
IX_ValueNumber_Form_Field_Value(FormId, FieldKey, Value)
IX_ValueDate_Form_Field_Value(FormId, FieldKey, Value)
IX_ValueBoolean_Form_Field_Value(FormId, FieldKey, Value)
IX_ValueString_Form_Field_Value(FormId, FieldKey, Value) -- provider/length dependent
```

Why duplicate `SubmissionId`, `FormId`, `FieldKey` in value tables when `SubmissionFieldId` can join?

- Faster filters/reports.
- Easier DNN raw SQL.
- Easier cross-host diagnostics.
- Similar denormalization already used by current `MF_SubmissionValues`.

### 13.8 `MF_Files` update

Keep existing file table, but add field linkage if missing.

```text
FileId int PK
FileKey uniqueidentifier null
SubmissionId int FK -> MF_Submissions cascade
SubmissionFieldId bigint/int null FK -> MF_SubmissionFields cascade
FormId int not null
FieldKey nvarchar(256) null
FileName nvarchar(512)
ContentType nvarchar(255)
SizeBytes bigint
StoragePath nvarchar(max)
CreatedOnUtc datetime
```

File field value should store file ids/keys in typed value rows, not only JSON blobs.

### 13.9 `MF_SubmissionAudit` recommended

Needed when workflows can approve/forward/update fields.

```text
AuditId bigint/int PK
SubmissionId int FK
SubmissionFieldId bigint/int null
ActorUserId int null
ActorName nvarchar(255) null
Action nvarchar(100) not null
FieldKey nvarchar(256) null
OldDisplayValue nvarchar(max) null
NewDisplayValue nvarchar(max) null
CreatedOnUtc datetime not null
MetadataJson nvarchar(max) null
```

Use:

- Inbox audit trail.
- Approved/rejected/forward/comment/attach file.
- Field mutation history.

### 13.10 Compatibility/deprecation table strategy

Existing `MF_SubmissionValues` has two possible paths:

Option A - keep as legacy compatibility table:

```text
MF_SubmissionValues = legacy flat index, no longer source of truth
```

Option B - replace with view/table populated from new typed rows:

```text
MF_SubmissionValues compatibility view:
  SubmissionId
  FormId
  FieldKey
  FieldValue/ValueText/ValueNumber/ValueDate
```

Recommendation:

- Phase 1 keep table to avoid breaking reports immediately.
- Phase 2 write both new typed tables and old flat table.
- Phase 3 switch reports to typed tables.
- Phase 4 stop writing old flat table or keep a compatibility view.

### 13.11 Submit flow after change

```text
Incoming data dictionary
  -> validate against MF_Forms.SchemaJson / MF_FormFields
  -> create MF_Submissions master
  -> for each logical field:
       insert MF_SubmissionFields
       insert one or more typed value rows
       insert MF_Files rows if field is file
  -> workflow reads typed data document
  -> email/webhook/dashboard/API read typed data document
```

No step requires writing meaningful `DataJson`.

### 13.12 Query examples

Find submissions where `country = 'VN'`:

```sql
SELECT s.*
FROM MF_Submissions s
JOIN MF_SubmissionValueString v
  ON v.SubmissionId = s.SubmissionId
WHERE s.FormId = @FormId
  AND v.FieldKey = 'country'
  AND v.Value = 'VN';
```

Find submissions where `amount >= 1000`:

```sql
SELECT s.*
FROM MF_Submissions s
JOIN MF_SubmissionValueNumber v
  ON v.SubmissionId = s.SubmissionId
WHERE s.FormId = @FormId
  AND v.FieldKey = 'amount'
  AND v.Value >= 1000;
```

Render detail:

```sql
SELECT f.SubmissionFieldId, f.FieldKey, f.LabelSnapshot, f.DataType, f.DisplayValue
FROM MF_SubmissionFields f
WHERE f.SubmissionId = @SubmissionId
ORDER BY f.PageIndex, f.FieldOrder, f.SubmissionFieldId;
```

### 13.13 Migration path from current tables

Current:

```text
MF_Submissions.DataJson
MF_SubmissionValues.ValueText/ValueNumber/ValueDate
```

Migration:

1. Create new tables.
2. For rows with current `MF_SubmissionValues`, convert them first because they are already flattened.
3. For rows without value rows, parse legacy `DataJson`.
4. Create `MF_SubmissionFields`.
5. Insert typed values based on field type/data type.
6. Mark `MF_Submissions.MigratedToTypedOnUtc`.
7. Verify every migrated submission has field rows.

